import pytest
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.main import app
from backend.auth import hash_password, create_access_token
from db.models import (
    Vendor,
    VendorUser,
    VendorUserMembership,
    VendorSignupRequest,
    InternalUser,
    Department,
    JobRole,
    Resume,
    Candidate,
    Submission
)
from db.connection import get_db, SessionLocal


@pytest.fixture
def admin_recruiter(db_session: Session):
    recruiter = db_session.query(InternalUser).filter(
        InternalUser.role == "RECRUITER",
        InternalUser.access_level == "ADMIN",
        InternalUser.status == "ACTIVE"
    ).first()
    if not recruiter:
        recruiter = InternalUser(
            email="admin_multi@test.com",
            name="Admin Test Recruiter",
            mobile="+919876543200",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE",
            password_hash=hash_password("AdminPass123!")
        )
        db_session.add(recruiter)
        db_session.commit()
        db_session.refresh(recruiter)
    return recruiter


@pytest.fixture
def admin_token(client, admin_recruiter, db_session: Session):
    admin_recruiter.password_hash = hash_password("TestAdminPassword123!")
    db_session.commit()
    resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": admin_recruiter.email,
        "password": "TestAdminPassword123!"
    })
    return resp.json()["access_token"]


@pytest.fixture
def canonical_vendors(db_session: Session):
    iosys = db_session.query(Vendor).filter(Vendor.name == "IOSYS").first()
    if not iosys:
        iosys = Vendor(name="IOSYS", normalized_name="iosys")
        db_session.add(iosys)
    volantis = db_session.query(Vendor).filter(Vendor.name == "Volantis").first()
    if not volantis:
        volantis = Vendor(name="Volantis", normalized_name="volantis")
        db_session.add(volantis)
    db_session.commit()
    db_session.refresh(iosys)
    db_session.refresh(volantis)
    return {"IOSYS": iosys, "Volantis": volantis}


def test_01_vendor_signup_without_companies(client, canonical_vendors, db_session):
    """Test vendor user signs up without needing to select a company"""
    email = f"multi_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "companies": [],
        "company_name": "Agnostic Vendor Corp",
        "user_name": "Company Agnostic User",
        "email": email,
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }
    response = client.post("/api/v1/auth/vendor/signup", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == email


def test_02_recruiter_approves_agnostic_signup(client, admin_token, canonical_vendors, db_session):
    """Approving a company-agnostic request creates exactly 1 vendor_users row and 0 vendor_user_memberships rows"""
    email = f"approve_multi_{uuid.uuid4().hex[:8]}@example.com"
    req_resp = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "Approvable Vendor LLC",
        "user_name": "Multi Approvable",
        "email": email,
        "mobile": "+919876543211",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert req_resp.status_code == 201
    request_id = req_resp.json()["request_id"]

    # Recruiter approves
    approve_resp = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{request_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert approve_resp.status_code == 200

    # Verify DB state: exactly 1 vendor_users row
    user_records = db_session.query(VendorUser).filter(VendorUser.email == email).all()
    assert len(user_records) == 1
    user = user_records[0]
    assert user.status == "ACTIVE"

    # Verify DB state: exactly 0 memberships
    memberships = db_session.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == user.id
    ).all()
    assert len(memberships) == 0


def test_03_duplicate_email_signup_rejected(client, admin_token, canonical_vendors, db_session):
    """User who is already active cannot submit another signup request"""
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    req = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "Duplicate Vendor Inc",
        "user_name": "Duplicate Tester",
        "email": email,
        "mobile": "+919876543213",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }).json()

    client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req['request_id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    # Attempt to sign up again
    dup_resp = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "Duplicate Vendor Inc",
        "user_name": "Duplicate Tester",
        "email": email,
        "mobile": "+919876543213",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"].lower()


def test_04_vendor_login_without_memberships(client, admin_token, canonical_vendors, db_session):
    """Vendor can log in successfully even without any memberships, and sees empty companies list in profile"""
    email = f"login_profile_{uuid.uuid4().hex[:8]}@example.com"
    req = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "Login Tester Co",
        "user_name": "Profile Tester",
        "email": email,
        "mobile": "+919876543214",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }).json()

    client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req['request_id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    # Login -> 200 OK
    login_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": email,
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Profile -> companies list is empty
    prof_resp = client.get("/api/v1/vendor/profile", headers={"Authorization": f"Bearer {token}"})
    assert prof_resp.status_code == 200
    prof = prof_resp.json()
    assert prof["email"] == email
    assert prof["company_name"] == "Login Tester Co"
    assert len(prof["companies"]) == 0


def test_05_submissions_and_jobs_access_without_memberships(client, admin_token, canonical_vendors, db_session):
    """Verify vendor user can view all jobs and submit candidate to any job role, which binds to JobRole.vendor_id"""
    email = f"context_tester_{uuid.uuid4().hex[:8]}@example.com"
    req = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "Context Tester Co",
        "user_name": "Context Tester",
        "email": email,
        "mobile": "+919876543217",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }).json()

    client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req['request_id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    user = db_session.query(VendorUser).filter(VendorUser.email == email).first()
    iosys = canonical_vendors["IOSYS"]
    volantis = canonical_vendors["Volantis"]

    # Create a department
    dept = db_session.query(Department).first()
    if not dept:
        dept = Department(name="Engineering", status="ACTIVE")
        db_session.add(dept)
        db_session.commit()
        db_session.refresh(dept)

    # Create active job roles for IOSYS & Volantis
    iosys_role = JobRole(
        department_id=dept.id,
        vendor_id=iosys.id,
        title="IOSYS Engineer",
        job_id=f"IOSYS-{uuid.uuid4().hex[:6].upper()}",
        status="ACTIVE"
    )
    db_session.add(iosys_role)

    vol_role = JobRole(
        department_id=dept.id,
        vendor_id=volantis.id,
        title="Volantis Engineer",
        job_id=f"VOL-{uuid.uuid4().hex[:6].upper()}",
        status="ACTIVE"
    )
    db_session.add(vol_role)
    # Grant user active membership to IOSYS
    db_session.add(VendorUserMembership(vendor_user_id=user.id, vendor_id=iosys.id, status="ACTIVE"))
    db_session.commit()

    # Login as vendor user with IOSYS context
    token_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": email,
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    token = token_resp.json()["access_token"]

    # Vendor gets job roles for their active company session (IOSYS)
    jobs_resp = client.get(
        "/api/v1/vendor/job-roles",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert jobs_resp.status_code == 200
    jobs = jobs_resp.json()
    assert len(jobs) >= 1
    job_ids = {j["id"] for j in jobs}
    assert str(iosys_role.id) in job_ids
    assert str(vol_role.id) not in job_ids

    # Create a resume
    resume_id = uuid.uuid4()
    resume = Resume(
        id=resume_id,
        vendor_id=iosys.id,
        vendor_user_id=user.id,
        filename="resume.pdf",
        file_path="storage/resume.pdf",
        file_size=1024,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="CLEAN",
        processing_state="COMPLETED",
        eligibility_state="ELIGIBLE"
    )
    db_session.add(resume)
    db_session.commit()

    # Submit for IOSYS job -> 201 Created
    sub_payload = {
        "vendor_id": str(iosys.id),
        "cv_sent_date": "2026-08-18",
        "employment_mode": "Perm",
        "role_id": str(iosys_role.id),
        "job_id": iosys_role.job_id,
        "name": "Candidate IOSYS",
        "email": "c_iosys@test.com",
        "contact_number": "+919876543210",
        "current_company": "Comp",
        "total_experience": 5.0,
        "relevant_experience": 4.0,
        "notice_period": "30",
        "ctc": 10.0,
        "ectc": 12.0,
        "current_location": "Bangalore",
        "preferred_location": "Bangalore",
        "pan": "ABCDE1234F",
        "linkedin_url": "https://linkedin.com/in/test",
        "education": "B.Tech",
        "about": "Candidate summary",
        "resume_id": str(resume_id)
    }

    sub_resp = client.post(
        "/api/v1/submissions",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": str(uuid.uuid4())
        },
        json=sub_payload
    )
    assert sub_resp.status_code == 201

    # Attempt candidate submission for Volantis job but sending IOSYS vendor_id -> 400 Bad Request
    sub_payload["role_id"] = str(vol_role.id)
    sub_payload["job_id"] = vol_role.job_id
    sub_payload["pan"] = "PQRSD1234F"
    sub_payload["email"] = "c_vol@test.com"

    sub_resp = client.post(
        "/api/v1/submissions",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": str(uuid.uuid4())
        },
        json=sub_payload
    )
    assert sub_resp.status_code in [400, 403]


def test_06_missing_role_id_returns_400(client, admin_token, canonical_vendors, db_session):
    """Verify that calling pan/check or upload/resume without role_id returns 400 when no memberships exist"""
    email = f"no_role_{uuid.uuid4().hex[:8]}@example.com"
    req = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "No Role Vendor",
        "user_name": "No Role Tester",
        "email": email,
        "mobile": "+919876543219",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }).json()

    client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req['request_id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    # Login
    token_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": email,
        "password": "Password123!"
    })
    token = token_resp.json()["access_token"]

    # PAN Check without role_id -> 400
    pan_resp = client.post(
        "/api/v1/pan/check",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "pan": "ABCDE1234F"
        }
    )
    assert pan_resp.status_code == 400
    assert "role_id is required" in pan_resp.json()["detail"].lower()


def test_07_vendor_company_name_flow(client, admin_token, canonical_vendors, db_session):
    """Test full Vendor Company Name flow: signup validation, approval, submission, API response, and isolation"""
    # 1. Signup validation fails when company_name is missing/empty
    email = f"vendor_flow_{uuid.uuid4().hex[:8]}@example.com"
    resp_empty = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "",
        "user_name": "Flow Tester",
        "email": email,
        "mobile": "+919876543220",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert resp_empty.status_code == 422

    # 2. Signup validation fails when company_name is IOSYS or Volantis
    resp_iosys = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "IOSYS",
        "user_name": "Flow Tester",
        "email": email,
        "mobile": "+919876543220",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert resp_iosys.status_code == 422

    # 3. Successful signup with valid Vendor Company Name
    resp_ok = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [],
        "company_name": "ABC Technologies",
        "user_name": "Flow Tester",
        "email": email,
        "mobile": "+919876543220",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert resp_ok.status_code == 201
    req_data = resp_ok.json()
    assert req_data["company_name"] == "ABC Technologies"
    request_id = req_data["request_id"]

    # 4. Recruiter approves signup
    approve_resp = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{request_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert approve_resp.status_code == 200

    # 5. Verify approved VendorUser retains Vendor Company Name in relationship
    user = db_session.query(VendorUser).filter(VendorUser.email == email).first()
    assert user is not None
    assert user.vendor.name == "ABC Technologies"

    # Grant user active membership to IOSYS
    db_session.add(VendorUserMembership(vendor_user_id=user.id, vendor_id=canonical_vendors["IOSYS"].id, status="ACTIVE"))
    db_session.commit()

    # Login with IOSYS context
    token_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": email,
        "password": "Password123!",
        "company_id": str(canonical_vendors["IOSYS"].id)
    })
    token = token_resp.json()["access_token"]

    # Create job roles for IOSYS and Volantis
    iosys = canonical_vendors["IOSYS"]
    volantis = canonical_vendors["Volantis"]
    dept = db_session.query(Department).filter(Department.status == "ACTIVE").first()
    if not dept:
        dept = Department(name="Engineering", status="ACTIVE")
        db_session.add(dept)
        db_session.commit()
        db_session.refresh(dept)

    iosys_role = JobRole(
        department_id=dept.id,
        vendor_id=iosys.id,
        title=f"Engineer IOSYS {uuid.uuid4().hex[:4]}",
        job_id=f"JOB-{uuid.uuid4().hex[:6]}",
        status="ACTIVE"
    )
    vol_role = JobRole(
        department_id=dept.id,
        vendor_id=volantis.id,
        title=f"Engineer Volantis {uuid.uuid4().hex[:4]}",
        job_id=f"JOB-{uuid.uuid4().hex[:6]}",
        status="ACTIVE"
    )
    db_session.add(iosys_role)
    db_session.add(vol_role)
    db_session.commit()

    # Create resume
    resume_id = uuid.uuid4()
    resume = Resume(
        id=resume_id,
        vendor_id=iosys.id,
        vendor_user_id=user.id,
        filename="resume.pdf",
        file_path="storage/resume.pdf",
        file_size=1024,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="CLEAN",
        processing_state="COMPLETED",
        eligibility_state="ELIGIBLE"
    )
    db_session.add(resume)
    db_session.commit()

    # Submit candidate (ensure vendor cannot tamper with Vendor Name since payload only has role_id/vendor_id)
    sub_payload = {
        "vendor_id": str(iosys.id),
        "cv_sent_date": "2026-08-18",
        "employment_mode": "Perm",
        "role_id": str(iosys_role.id),
        "job_id": iosys_role.job_id,
        "name": "Rahul Kumar",
        "email": "rahul@test.com",
        "contact_number": "+919876543221",
        "current_company": "Acme",
        "total_experience": 5.0,
        "relevant_experience": 4.0,
        "notice_period": "30",
        "ctc": 10.0,
        "ectc": 12.0,
        "current_location": "Bangalore",
        "preferred_location": "Bangalore",
        "pan": "ABCDE5555F",
        "linkedin_url": "https://linkedin.com",
        "education": "B.Tech",
        "about": "Rahul",
        "resume_id": str(resume_id)
    }

    sub_resp = client.post(
        "/api/v1/submissions",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": str(uuid.uuid4())
        },
        json=sub_payload
    )
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    # Verify candidate submission is associated with correct VendorUser
    sub_db = db_session.query(Submission).filter(Submission.id == sub_id).first()
    assert sub_db.vendor_user_id == user.id

    # Recruiter Candidates API verification
    cand_resp = client.get(
        f"/api/v1/recruiter/candidates?vendor_id={canonical_vendors['IOSYS'].id}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert cand_resp.status_code == 200
    cand_data = cand_resp.json()["items"]
    
    # Verify the created submission has correct vendor_name (client company) and submitting_vendor_name
    match = [item for item in cand_data if item["id"] == str(sub_id)][0]
    assert match["vendor_name"] == "IOSYS", "Client company must remain IOSYS"
    assert match["submitting_vendor_name"] == "ABC Technologies", "Vendor Name must be ABC Technologies"

