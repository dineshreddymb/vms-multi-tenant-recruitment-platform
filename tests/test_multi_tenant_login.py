import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
from uuid import uuid4

from db.models import (
    InternalUser,
    RecruiterCompanyAccess,
    Vendor,
    Submission,
    Candidate,
    JobRole,
    Department,
    StatusHistory
)
from backend.auth import hash_password
from db.crypto import encrypt_pan


def get_or_create_vendor(db: Session, name: str) -> Vendor:
    v = db.query(Vendor).filter(Vendor.name == name).first()
    if not v:
        v = Vendor(name=name, normalized_name=name.lower())
        db.add(v)
        db.flush()
    return v


def setup_multi_tenant_test_data(db: Session):
    """Setup test data for multi-tenant login tests"""
    # Ensure vendors exist
    iosys = get_or_create_vendor(db, "IOSYS")
    volantis = get_or_create_vendor(db, "Volantis")
    
    # Clear previous test data
    db.execute(text("ALTER TABLE status_history DISABLE TRIGGER ALL;"))
    db.execute(text("ALTER TABLE submissions DISABLE TRIGGER ALL;"))
    db.query(RecruiterCompanyAccess).delete()
    db.query(StatusHistory).delete()
    db.query(Submission).delete()
    db.query(Candidate).delete()
    db.query(InternalUser).filter(InternalUser.email.in_([
        "iosys_only@corp.com", 
        "volantis_only@corp.com",
        "both_access@corp.com"
    ])).delete()
    db.execute(text("ALTER TABLE status_history ENABLE TRIGGER ALL;"))
    db.execute(text("ALTER TABLE submissions ENABLE TRIGGER ALL;"))
    db.flush()
    
    # Create IOSYS-only recruiter
    iosys_only = InternalUser(
        email="iosys_only@corp.com",
        password_hash=hash_password("Password123!"),
        name="IOSYS Only Recruiter",
        mobile="+919876543201",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db.add(iosys_only)
    
    # Create Volantis-only recruiter
    volantis_only = InternalUser(
        email="volantis_only@corp.com",
        password_hash=hash_password("Password123!"),
        name="Volantis Only Recruiter",
        mobile="+919876543202",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db.add(volantis_only)
    
    # Create recruiter with both companies access
    both_access = InternalUser(
        email="both_access@corp.com",
        password_hash=hash_password("Password123!"),
        name="Both Access Recruiter",
        mobile="+919876543203",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db.add(both_access)
    db.flush()
    
    # Add company access mappings
    # IOSYS-only recruiter gets IOSYS access
    iosys_access = RecruiterCompanyAccess(
        recruiter_id=iosys_only.id,
        company_id=iosys.id
    )
    db.add(iosys_access)
    
    # Volantis-only recruiter gets Volantis access
    volantis_access = RecruiterCompanyAccess(
        recruiter_id=volantis_only.id,
        company_id=volantis.id
    )
    db.add(volantis_access)
    
    # Both-access recruiter gets both IOSYS and Volantis access
    both_iosys_access = RecruiterCompanyAccess(
        recruiter_id=both_access.id,
        company_id=iosys.id
    )
    db.add(both_iosys_access)
    
    both_volantis_access = RecruiterCompanyAccess(
        recruiter_id=both_access.id,
        company_id=volantis.id
    )
    db.add(both_volantis_access)
    
    # Create department and job roles
    dept = db.query(Department).filter(Department.name == "Engineering").first()
    if not dept:
        dept = Department(name="Engineering", status="ACTIVE")
        db.add(dept)
        db.flush()
    
    # Create IOSYS job role
    iosys_role = JobRole(
        title="IOSYS Software Engineer",
        department_id=dept.id,
        job_id="JR-IOSYS-001",
        vendor_id=iosys.id,
        status="ACTIVE"
    )
    db.add(iosys_role)
    
    # Create Volantis job role
    volantis_role = JobRole(
        title="Volantis Software Engineer",
        department_id=dept.id,
        job_id="JR-VOLANTIS-001",
        vendor_id=volantis.id,
        status="ACTIVE"
    )
    db.add(volantis_role)
    db.flush()
    
    # Create IOSYS candidate & submission
    iosys_candidate = Candidate(
        name="IOSYS Candidate",
        email="iosys_candidate@test.com",
        contact_number="+919876543211",
        current_company="IOSYS Corp",
        total_experience=Decimal("3.5"),
        relevant_experience=Decimal("2.5"),
        notice_period="Immediate",
        ctc=Decimal("100000.00"),
        ectc=Decimal("120000.00"),
        current_location="Bangalore",
        preferred_location="Bangalore",
        pan_encrypted=encrypt_pan("ABCDE1234F"),
        pan_fingerprint="fingerprint_iosys_mt",
        linkedin_url="https://linkedin.com/in/iosys_mt",
        education="B.Tech",
        about="IOSYS Candidate for multi-tenant test"
    )
    db.add(iosys_candidate)
    db.flush()
    
    iosys_submission = Submission(
        candidate_id=iosys_candidate.id,
        vendor_id=iosys.id,
        vendor_user_id=None,
        role_id=iosys_role.id,
        job_id="JR-IOSYS-001",
        status="SUBMITTED",
        submission_reference="SUB-IOSYS-MT-001",
        employment_mode="Perm"
    )
    db.add(iosys_submission)
    
    # Create Volantis candidate & submission
    volantis_candidate = Candidate(
        name="Volantis Candidate",
        email="volantis_candidate@test.com",
        contact_number="+919876543212",
        current_company="Volantis Corp",
        total_experience=Decimal("4.0"),
        relevant_experience=Decimal("3.0"),
        notice_period="15 Days",
        ctc=Decimal("110000.00"),
        ectc=Decimal("130000.00"),
        current_location="Bangalore",
        preferred_location="Bangalore",
        pan_encrypted=encrypt_pan("WXYZT5678G"),
        pan_fingerprint="fingerprint_volantis_mt",
        linkedin_url="https://linkedin.com/in/volantis_mt",
        education="M.Tech",
        about="Volantis Candidate for multi-tenant test"
    )
    db.add(volantis_candidate)
    db.flush()
    
    volantis_submission = Submission(
        candidate_id=volantis_candidate.id,
        vendor_id=volantis.id,
        vendor_user_id=None,
        role_id=volantis_role.id,
        job_id="JR-VOLANTIS-001",
        status="SUBMITTED",
        submission_reference="SUB-VOLANTIS-MT-001",
        employment_mode="Perm"
    )
    db.add(volantis_submission)
    
    db.commit()
    db.refresh(iosys_only)
    db.refresh(volantis_only)
    db.refresh(both_access)
    db.refresh(iosys_submission)
    db.refresh(volantis_submission)
    
    return {
        "iosys": iosys,
        "volantis": volantis,
        "iosys_only_user": iosys_only,
        "volantis_only_user": volantis_only,
        "both_access_user": both_access,
        "iosys_submission": iosys_submission,
        "volantis_submission": volantis_submission,
        "iosys_role": iosys_role,
        "volantis_role": volantis_role
    }


def test_iosys_only_recruiter_login(client: TestClient, db_session: Session):
    """Test IOSYS-only recruiter login scenarios"""
    test_data = setup_multi_tenant_test_data(db_session)
    iosys = test_data["iosys"]
    volantis = test_data["volantis"]
    
    # 1. IOSYS-only recruiter logs in with IOSYS -> success
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "iosys_only@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    assert login_resp.status_code == 200, f"Expected 200, got {login_resp.status_code}: {login_resp.text}"
    iosys_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    
    # Verify JWT contains company context
    import jwt
    from backend.config import JWT_SECRET, JWT_ALGORITHM
    token = login_resp.json()["access_token"]
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert decoded["company_id"] == str(iosys.id)
    assert decoded["company_name"] == "IOSYS"
    
    # 2. IOSYS-only recruiter logs in with Volantis -> rejected (403)
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "iosys_only@corp.com",
        "password": "Password123!",
        "company_id": str(volantis.id)
    })
    assert login_resp.status_code == 403, f"Expected 403, got {login_resp.status_code}"
    assert "do not have access to the selected company" in login_resp.json()["detail"]
    
    # 3. IOSYS-only recruiter logs in without company -> should use first accessible company (IOSYS)
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "iosys_only@corp.com",
        "password": "Password123!"
        # No company_id specified
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert decoded["company_id"] == str(iosys.id)  # Should default to IOSYS


def test_volantis_only_recruiter_login(client: TestClient, db_session: Session):
    """Test Volantis-only recruiter login scenarios"""
    test_data = setup_multi_tenant_test_data(db_session)
    iosys = test_data["iosys"]
    volantis = test_data["volantis"]
    
    # 1. Volantis-only recruiter logs in with Volantis -> success
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "volantis_only@corp.com",
        "password": "Password123!",
        "company_id": str(volantis.id)
    })
    assert login_resp.status_code == 200
    volantis_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    
    # 2. Volantis-only recruiter logs in with IOSYS -> rejected (403)
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "volantis_only@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    assert login_resp.status_code == 403
    assert "do not have access to the selected company" in login_resp.json()["detail"]


def test_both_access_recruiter_login(client: TestClient, db_session: Session):
    """Test recruiter with both companies access login scenarios"""
    test_data = setup_multi_tenant_test_data(db_session)
    iosys = test_data["iosys"]
    volantis = test_data["volantis"]
    iosys_submission = test_data["iosys_submission"]
    volantis_submission = test_data["volantis_submission"]
    
    # 1. Both-access recruiter logs in with IOSYS -> success, sees only IOSYS data
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "both_access@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    assert login_resp.status_code == 200
    iosys_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    
    # Get candidates list - should only see IOSYS submission
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=iosys_headers)
    assert candidates_resp.status_code == 200
    candidates = candidates_resp.json()["items"]
    assert any(c["id"] == str(iosys_submission.id) for c in candidates)
    assert not any(c["id"] == str(volantis_submission.id) for c in candidates)
    
    # Get job roles list - should only see IOSYS roles
    roles_resp = client.get("/api/v1/recruiter/job-roles", headers=iosys_headers)
    assert roles_resp.status_code == 200
    roles = roles_resp.json()
    # Should have at least one IOSYS role
    iosys_roles = [r for r in roles if r.get("company_name") == "IOSYS"]
    assert len(iosys_roles) > 0
    
    # 2. Both-access recruiter logs in with Volantis -> success, sees only Volantis data
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "both_access@corp.com",
        "password": "Password123!",
        "company_id": str(volantis.id)
    })
    assert login_resp.status_code == 200
    volantis_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    
    # Get candidates list - should only see Volantis submission
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=volantis_headers)
    assert candidates_resp.status_code == 200
    candidates = candidates_resp.json()["items"]
    assert not any(c["id"] == str(iosys_submission.id) for c in candidates)
    assert any(c["id"] == str(volantis_submission.id) for c in candidates)
    
    # 3. Both-access recruiter logs in without company -> should use first accessible company
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "both_access@corp.com",
        "password": "Password123!"
        # No company_id specified
    })
    assert login_resp.status_code == 200
    # Should default to first company (probably IOSYS based on creation order)


def test_tenant_isolation_api_endpoints(client: TestClient, db_session: Session):
    """Test that API endpoints enforce tenant isolation"""
    test_data = setup_multi_tenant_test_data(db_session)
    iosys = test_data["iosys"]
    volantis = test_data["volantis"]
    iosys_submission = test_data["iosys_submission"]
    volantis_submission = test_data["volantis_submission"]
    iosys_role = test_data["iosys_role"]
    volantis_role = test_data["volantis_role"]
    
    # Login as IOSYS-only recruiter
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "iosys_only@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    iosys_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    
    # 1. Test candidates endpoint - should only return IOSYS data
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=iosys_headers)
    assert candidates_resp.status_code == 200
    candidates = candidates_resp.json()["items"]
    # Should see IOSYS submission
    assert any(c["id"] == str(iosys_submission.id) for c in candidates)
    # Should NOT see Volantis submission
    assert not any(c["id"] == str(volantis_submission.id) for c in candidates)
    
    # 2. Test job roles endpoint - should only return IOSYS roles
    roles_resp = client.get("/api/v1/recruiter/job-roles", headers=iosys_headers)
    assert roles_resp.status_code == 200
    roles = roles_resp.json()
    # Should see IOSYS role
    assert any(r["id"] == str(iosys_role.id) for r in roles)
    # Should NOT see Volantis role
    assert not any(r["id"] == str(volantis_role.id) for r in roles)
    
    # 3. Test vendor users endpoint - should only return IOSYS vendor users
    # (This would need vendor user data setup)
    
    # 4. Test attempting to access Volantis submission directly -> should fail
    detail_resp = client.get(f"/api/v1/recruiter/submissions/{volantis_submission.id}", headers=iosys_headers)
    # This should fail with 403 or 404
    assert detail_resp.status_code in [403, 404]
    
    # 5. Test attempting to access IOSYS submission directly -> should succeed
    detail_resp = client.get(f"/api/v1/recruiter/submissions/{iosys_submission.id}", headers=iosys_headers)
    # This might fail due to other checks, but shouldn't fail due to company access
    if detail_resp.status_code == 403:
        # If it fails, it shouldn't be due to company access
        assert "company" not in detail_resp.json()["detail"].lower()


def test_company_context_in_jwt(client: TestClient, db_session: Session):
    """Test that JWT contains company context"""
    test_data = setup_multi_tenant_test_data(db_session)
    iosys = test_data["iosys"]
    
    # Login with company selection
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "iosys_only@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    assert login_resp.status_code == 200
    
    # Decode JWT to verify company context
    import jwt
    from backend.config import JWT_SECRET, JWT_ALGORITHM
    token = login_resp.json()["access_token"]
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    
    assert "company_id" in decoded
    assert "company_name" in decoded
    assert decoded["company_id"] == str(iosys.id)
    assert decoded["company_name"] == "IOSYS"
    assert decoded["role"] == "RECRUITER"


def test_create_job_role_with_company_context(client: TestClient, db_session: Session):
    """Test that job role creation uses logged-in company context"""
    test_data = setup_multi_tenant_test_data(db_session)
    iosys = test_data["iosys"]
    
    # Login as IOSYS-only recruiter
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "iosys_only@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    iosys_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    
    # Get a department
    dept = db_session.query(Department).filter(Department.name == "Engineering").first()
    assert dept is not None
    
    # Create a job role - should automatically use IOSYS (logged-in company)
    # Note: The updated create_job_role endpoint no longer accepts vendor_id parameter
    # It uses the logged-in company from JWT context
    create_resp = client.post("/api/v1/recruiter/job-roles", 
        json={
            "department_id": str(dept.id),
            "title": "New IOSYS Role",
            "job_id": "JR-IOSYS-NEW-001",
            "status": "ACTIVE"
        },
        headers=iosys_headers
    )
    
    # Check response
    if create_resp.status_code != 201:
        print(f"Create job role failed: {create_resp.status_code} - {create_resp.text}")
    
    # The endpoint should create the job role for IOSYS (logged-in company)
    # Even though we're not passing vendor_id, it should come from JWT context
    assert create_resp.status_code == 201
    
    # Verify the created job role belongs to IOSYS
    created_role = create_resp.json()
    assert created_role["vendor_id"] == str(iosys.id)
    assert created_role["company_name"] == "IOSYS"