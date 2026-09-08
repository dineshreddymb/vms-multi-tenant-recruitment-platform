import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from decimal import Decimal
from uuid import uuid4

from db.models import (
    InternalUser,
    RecruiterSignupRequest,
    Vendor,
    Submission,
    Candidate,
    JobRole,
    RecruiterCompanyAccess,
    StatusHistory,
    Department
)
from backend.auth import hash_password
from db.crypto import encrypt_pan


def get_or_create_vendor(db: Session, name: str, is_tenant: bool = True) -> Vendor:
    v = db.query(Vendor).filter(Vendor.name == name).first()
    if not v:
        v = Vendor(name=name, normalized_name=name.lower(), is_tenant=is_tenant)
        db.add(v)
        db.flush()
    else:
        if v.is_tenant != is_tenant and name.lower() in ["iosys", "volantis"]:
            v.is_tenant = is_tenant
            db.flush()
    return v


def setup_recruiter_company_data(db: Session):
    # Ensure vendors exist
    iosys = get_or_create_vendor(db, "IOSYS")
    volantis = get_or_create_vendor(db, "Volantis")

    # Clear previous test data to avoid pollution by disabling triggers
    db.execute(text("ALTER TABLE status_history DISABLE TRIGGER ALL;"))
    db.execute(text("ALTER TABLE submissions DISABLE TRIGGER ALL;"))
    db.query(RecruiterCompanyAccess).delete()
    db.query(StatusHistory).delete()
    db.query(Submission).delete()
    db.query(Candidate).delete()
    db.query(InternalUser).filter(InternalUser.email.in_(["admin_access@corp.com", "rec_c@corp.com"])).delete()
    db.query(RecruiterSignupRequest).filter(RecruiterSignupRequest.email.in_([
        "pending_rec@corp.com", "rec_c@corp.com", "pending_rec_none@corp.com",
        "pending_rec_empty@corp.com", "pending_rec_invalid@corp.com", "pending_rec_ok@corp.com"
    ])).delete()
    db.execute(text("ALTER TABLE status_history ENABLE TRIGGER ALL;"))
    db.execute(text("ALTER TABLE submissions ENABLE TRIGGER ALL;"))
    db.flush()

    # Create Admin
    admin_user = InternalUser(
        email="admin_access@corp.com",
        password_hash=hash_password("Password123!"),
        name="Admin User",
        mobile="+919876543201",
        role="RECRUITER",
        access_level="ADMIN",
        status="ACTIVE"
    )
    db.add(admin_user)

    # Create Recruiter C
    rec_c = InternalUser(
        email="rec_c@corp.com",
        password_hash=hash_password("Password123!"),
        name="Recruiter C",
        mobile="+919876543202",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db.add(rec_c)
    db.flush()

    # Add IOSYS access to Recruiter C
    c_access = RecruiterCompanyAccess(
        recruiter_id=rec_c.id,
        company_id=iosys.id
    )
    db.add(c_access)

    # Create a job role
    role = db.query(JobRole).first()
    if not role:
        dept = db.query(Department).first()
        if not dept:
            dept = Department(name="Engineering", status="ACTIVE")
            db.add(dept)
            db.flush()
        role = JobRole(title="Software Engineer", department_id=dept.id, job_id="JR001", vendor_id=iosys.id)
        db.add(role)
        db.flush()

    # Create IOSYS Candidate & Submission
    cand_iosys = Candidate(
        name="IOSYS Candidate",
        email="iosys@cand.com",
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
        pan_fingerprint="fingerprint_iosys",
        linkedin_url="https://linkedin.com/in/iosys",
        education="B.Tech",
        about="IOSYS Candidate Profile"
    )
    db.add(cand_iosys)
    db.flush()

    sub_iosys = Submission(
        candidate_id=cand_iosys.id,
        vendor_id=iosys.id,
        vendor_user_id=None,
        role_id=role.id,
        job_id="JR001",
        status="SUBMITTED",
        submission_reference="SUB001",
        employment_mode="Perm"
    )
    db.add(sub_iosys)

    # Create Volantis Candidate & Submission
    cand_volantis = Candidate(
        name="Volantis Candidate",
        email="volantis@cand.com",
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
        pan_fingerprint="fingerprint_volantis",
        linkedin_url="https://linkedin.com/in/volantis",
        education="M.Tech",
        about="Volantis Candidate Profile"
    )
    db.add(cand_volantis)
    db.flush()

    sub_volantis = Submission(
        candidate_id=cand_volantis.id,
        vendor_id=volantis.id,
        vendor_user_id=None,
        role_id=role.id,
        job_id="JR001",
        status="SUBMITTED",
        submission_reference="SUB002",
        employment_mode="Perm"
    )
    db.add(sub_volantis)

    db.commit()
    db.refresh(admin_user)
    db.refresh(rec_c)
    db.refresh(sub_iosys)
    db.refresh(sub_volantis)

    return admin_user, rec_c, iosys, volantis, sub_iosys, sub_volantis


def test_recruiter_signup_validation(client: TestClient, db_session: Session):
    # Setup vendors
    iosys = get_or_create_vendor(db_session, "IOSYS")
    volantis = get_or_create_vendor(db_session, "Volantis")
    unapproved = get_or_create_vendor(db_session, "Unapproved Corp")

    # A. Verify public companies list query parameter behavior
    resp = client.get("/api/v1/auth/companies?signup=true")
    assert resp.status_code == 200
    signup_companies = resp.json()
    # Should only contain IOSYS and Volantis
    names = [c["name"] for c in signup_companies]
    assert "IOSYS" in names
    assert "Volantis" in names
    assert "Unapproved Corp" not in names
    assert len(signup_companies) == 2

    # Verify global companies list remains unfiltered
    resp = client.get("/api/v1/auth/companies")
    assert resp.status_code == 200
    all_companies = resp.json()
    all_names = [c["name"] for c in all_companies]
    assert "Unapproved Corp" in all_names

    # 1. Signup without companies list should succeed due to legacy fallback
    payload_no_companies = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_none@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_no_companies)
    assert resp.status_code == 201

    # 2. Signup with empty companies list [] should return 400 Bad Request
    payload_empty_companies = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_empty@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": []
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_empty_companies)
    assert resp.status_code == 400
    assert "At least one company must be selected" in resp.json()["detail"]

    # 3. Signup with invalid company ID should return 400
    payload_invalid_company = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_invalid@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": [str(uuid4())]
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_invalid_company)
    assert resp.status_code == 400
    assert "does not exist" in resp.json()["detail"]

    # 3b. Signup with unapproved company ID should return 400
    payload_unapproved_company = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_unapproved@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": [str(unapproved.id)]
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_unapproved_company)
    assert resp.status_code == 400
    assert "is not allowed for recruiter signup" in resp.json()["detail"]

    # 4. Correct signup with IOSYS should succeed
    payload_ok_iosys = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_ok_iosys@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": [str(iosys.id)]
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_ok_iosys)
    assert resp.status_code == 201

    # 4b. Correct signup with Volantis should succeed
    payload_ok_volantis = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_ok_volantis@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": [str(volantis.id)]
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_ok_volantis)
    assert resp.status_code == 201

    # 4c. Correct signup with IOSYS + Volantis should succeed
    payload_ok_both = {
        "full_name": "Test Recruiter",
        "email": "pending_rec_ok_both@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": [str(iosys.id), str(volantis.id)]
    }
    resp = client.post("/api/v1/auth/recruiter/signup", json=payload_ok_both)
    assert resp.status_code == 201

    db_session.rollback()


def test_recruiter_signup_approval(client: TestClient, db_session: Session):
    admin_user, _, iosys, _, _, _ = setup_recruiter_company_data(db_session)

    # Login as Admin
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_access@corp.com",
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Submit a signup request
    signup_payload = {
        "full_name": "Pending Recruiter",
        "email": "pending_rec@corp.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "companies": [str(iosys.id)]
    }
    signup_resp = client.post("/api/v1/auth/recruiter/signup", json=signup_payload)
    assert signup_resp.status_code == 201
    request_id = signup_resp.json()["request_id"]

    # Approve request
    approve_resp = client.post(
        f"/api/v1/recruiter/recruiter-signup-requests/{request_id}/approve",
        json={"action": "APPROVE"},
        headers=admin_headers
    )
    assert approve_resp.status_code == 200

    # Verify company access mapping in db
    pending_user = db_session.query(InternalUser).filter(InternalUser.email == "pending_rec@corp.com").first()
    assert pending_user is not None
    accesses = db_session.query(RecruiterCompanyAccess).filter(RecruiterCompanyAccess.recruiter_id == pending_user.id).all()
    assert len(accesses) == 1
    assert accesses[0].company_id == iosys.id


def test_recruiter_company_authorization(client: TestClient, db_session: Session):
    admin_user, rec_c, iosys, volantis, sub_iosys, sub_volantis = setup_recruiter_company_data(db_session)

    # 1. Login as standard Recruiter C
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_c@corp.com",
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    c_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # 2. Get profile me should return only IOSYS company membership
    me_resp = client.get("/api/v1/recruiter/me", headers=c_headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert len(me_data["companies"]) == 1
    assert me_data["companies"][0]["company_name"] == "IOSYS"

    # 3. Candidates pipeline list should return only IOSYS submission
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=c_headers)
    assert candidates_resp.status_code == 200
    candidates = candidates_resp.json()["items"]
    # Verify we only see IOSYS and not Volantis
    assert any(c["id"] == str(sub_iosys.id) for c in candidates)
    assert not any(c["id"] == str(sub_volantis.id) for c in candidates)

    # 4. Direct API lookup of unauthorized Volantis submission must return 403 Forbidden
    detail_resp = client.get(f"/api/v1/recruiter/submissions/{sub_volantis.id}", headers=c_headers)
    assert detail_resp.status_code == 403

    # Reveal PAN of unauthorized Volantis candidate must return 403
    reveal_resp = client.post(f"/api/v1/recruiter/submissions/{sub_volantis.id}/reveal-pan", headers=c_headers)
    assert reveal_resp.status_code == 403

    # History of unauthorized Volantis candidate must return 403
    hist_resp = client.get(f"/api/v1/recruiter/submissions/{sub_volantis.id}/history", headers=c_headers)
    assert hist_resp.status_code == 403

    # Status transition of unauthorized Volantis candidate must return 403
    trans_resp = client.patch(
        f"/api/v1/recruiter/submissions/{sub_volantis.id}/status",
        json={"status": "SCREENING"},
        headers=c_headers
    )
    assert trans_resp.status_code == 403


def test_admin_bypass_limitations(client: TestClient, db_session: Session):
    admin_user, rec_c, iosys, volantis, sub_iosys, sub_volantis = setup_recruiter_company_data(db_session)

    # Login as Admin
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_access@corp.com",
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # 1. Admin with no memberships must see 0 companies in profile and 0 candidates
    me_resp = client.get("/api/v1/recruiter/me", headers=admin_headers)
    assert me_resp.status_code == 200
    assert len(me_resp.json()["companies"]) == 0

    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=admin_headers)
    assert candidates_resp.status_code == 200
    assert len(candidates_resp.json()["items"]) == 0

    # 2. Map IOSYS access to Admin
    a_access = RecruiterCompanyAccess(recruiter_id=admin_user.id, company_id=iosys.id)
    db_session.add(a_access)
    db_session.commit()

    # Now profile returns IOSYS
    me_resp = client.get("/api/v1/recruiter/me", headers=admin_headers)
    assert len(me_resp.json()["companies"]) == 1
    assert me_resp.json()["companies"][0]["company_name"] == "IOSYS"

    # Candidates returns only IOSYS candidate
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=admin_headers)
    assert candidates_resp.status_code == 200
    assert len(candidates_resp.json()["items"]) == 1
    assert candidates_resp.json()["items"][0]["id"] == str(sub_iosys.id)

    # Volantis candidate lookup returns 403
    detail_resp = client.get(f"/api/v1/recruiter/submissions/{sub_volantis.id}", headers=admin_headers)
    assert detail_resp.status_code == 403

    # 3. Map Volantis access to Admin too (IOSYS + Volantis)
    v_access = RecruiterCompanyAccess(recruiter_id=admin_user.id, company_id=volantis.id)
    db_session.add(v_access)
    db_session.commit()

    # Query without vendor_id should return 400 (Please select a specific company context)
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=admin_headers)
    assert candidates_resp.status_code == 400
    assert "Please select a specific company context" in candidates_resp.json()["detail"]

    # Query with IOSYS context returns IOSYS candidate
    candidates_resp = client.get(f"/api/v1/recruiter/candidates?vendor_id={iosys.id}", headers=admin_headers)
    assert candidates_resp.status_code == 200
    assert len(candidates_resp.json()["items"]) == 1
    assert candidates_resp.json()["items"][0]["id"] == str(sub_iosys.id)

    # Query with Volantis context returns Volantis candidate
    candidates_resp = client.get(f"/api/v1/recruiter/candidates?vendor_id={volantis.id}", headers=admin_headers)
    assert candidates_resp.status_code == 200
    assert len(candidates_resp.json()["items"]) == 1
    assert candidates_resp.json()["items"][0]["id"] == str(sub_volantis.id)

    # Clean up mapping for next tests
    db_session.delete(a_access)
    db_session.delete(v_access)
    db_session.commit()


def test_admin_modifies_recruiter_access(client: TestClient, db_session: Session):
    admin_user, rec_c, iosys, volantis, sub_iosys, sub_volantis = setup_recruiter_company_data(db_session)

    # Map IOSYS to admin so admin can run actions
    a_access = RecruiterCompanyAccess(recruiter_id=admin_user.id, company_id=iosys.id)
    db_session.add(a_access)
    db_session.commit()

    # Login as Admin
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_access@corp.com",
        "password": "Password123!"
    })
    admin_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # 1. Update Recruiter C to have BOTH IOSYS and Volantis access
    update_resp = client.post(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        json=[str(iosys.id), str(volantis.id)],
        headers=admin_headers
    )
    assert update_resp.status_code == 200

    # Login as standard Recruiter C
    c_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_c@corp.com",
        "password": "Password123!"
    })
    c_headers = {"Authorization": f"Bearer {c_login.json()['access_token']}"}

    # Recruiter C (both companies) should get 400 if querying candidates without context
    candidates_resp = client.get("/api/v1/recruiter/candidates", headers=c_headers)
    assert candidates_resp.status_code == 400

    # Query with IOSYS context
    candidates_resp = client.get(f"/api/v1/recruiter/candidates?vendor_id={iosys.id}", headers=c_headers)
    assert candidates_resp.status_code == 200
    assert len(candidates_resp.json()["items"]) == 1
    assert candidates_resp.json()["items"][0]["id"] == str(sub_iosys.id)

    # Query with Volantis context
    candidates_resp = client.get(f"/api/v1/recruiter/candidates?vendor_id={volantis.id}", headers=c_headers)
    assert candidates_resp.status_code == 200
    assert len(candidates_resp.json()["items"]) == 1
    assert candidates_resp.json()["items"][0]["id"] == str(sub_volantis.id)

    # 2. Update Recruiter C to have ONLY Volantis access (IOSYS removed)
    update_resp = client.post(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        json=[str(volantis.id)],
        headers=admin_headers
    )
    assert update_resp.status_code == 200

    # Recruiter C (only 1 company) sees Volantis candidate directly without error
    candidates_resp2 = client.get("/api/v1/recruiter/candidates", headers=c_headers)
    assert candidates_resp2.status_code == 200
    candidates2 = candidates_resp2.json()["items"]
    assert not any(c["id"] == str(sub_iosys.id) for c in candidates2)
    assert any(c["id"] == str(sub_volantis.id) for c in candidates2)

    # Recruiter C direct API lookup to IOSYS candidate must now return 403 Forbidden
    detail_resp = client.get(f"/api/v1/recruiter/submissions/{sub_iosys.id}", headers=c_headers)
    assert detail_resp.status_code == 403

    db_session.delete(a_access)
    db_session.commit()


def test_recruiter_company_access_unique_constraint(db_session: Session):
    # Setup vendors
    iosys = get_or_create_vendor(db_session, "IOSYS")

    rec = InternalUser(
        email="uq_constraint_test@corp.com",
        password_hash=hash_password("Password123!"),
        name="Unique Test Recruiter",
        mobile="+919876543205",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add(rec)
    db_session.flush()

    # Add mapping 1
    access1 = RecruiterCompanyAccess(recruiter_id=rec.id, company_id=iosys.id)
    db_session.add(access1)
    db_session.flush()

    # Add duplicate mapping
    access2 = RecruiterCompanyAccess(recruiter_id=rec.id, company_id=iosys.id)
    db_session.add(access2)

    with pytest.raises(IntegrityError):
        db_session.flush()

    db_session.rollback()


def test_unauthorized_job_role_operations(client: TestClient, db_session: Session):
    admin_user, rec_c, iosys, volantis, sub_iosys, sub_volantis = setup_recruiter_company_data(db_session)

    # 1. Login as standard Recruiter C (authorized only for IOSYS)
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_c@corp.com",
        "password": "Password123!"
    })
    c_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Create a job role for Volantis (unauthorized company) -> 403
    payload = {
        "department_id": "Engineering",
        "title": "Unauth Volantis Role",
        "job_id": "JRVOL-UNAUTH",
        "vendor_id": str(volantis.id)
    }
    create_resp = client.post("/api/v1/recruiter/job-roles", json=payload, headers=c_headers)
    assert create_resp.status_code == 403

    # Create a job role for IOSYS (authorized company) -> 201
    payload_ok = {
        "department_id": "Engineering",
        "title": "Auth IOSYS Role",
        "job_id": "JRIOSYS-AUTH",
        "vendor_id": str(iosys.id)
    }
    create_resp_ok = client.post("/api/v1/recruiter/job-roles", json=payload_ok, headers=c_headers)
    assert create_resp_ok.status_code == 201
    created_role_id = create_resp_ok.json()["id"]

    # Create a job role for Volantis using global admin
    # Login as Admin
    admin_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_access@corp.com",
        "password": "Password123!"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
    # Map Volantis to admin
    a_vol = RecruiterCompanyAccess(recruiter_id=admin_user.id, company_id=volantis.id)
    db_session.add(a_vol)
    db_session.commit()

    payload_vol = {
        "department_id": "Engineering",
        "title": "Volantis Role For Test",
        "job_id": "JRVOL-TEST",
        "vendor_id": str(volantis.id)
    }
    create_vol_resp = client.post("/api/v1/recruiter/job-roles", json=payload_vol, headers=admin_headers)
    assert create_vol_resp.status_code == 201
    vol_role_id = create_vol_resp.json()["id"]

    # Recruiter C attempts to update/deactivate the Volantis job role -> 403
    deactivate_resp = client.post(f"/api/v1/recruiter/job-roles/{vol_role_id}/deactivate", headers=c_headers)
    assert deactivate_resp.status_code == 403

    # Recruiter C accesses list of job roles -> should only see IOSYS roles, not Volantis roles
    roles_resp = client.get("/api/v1/recruiter/job-roles", headers=c_headers)
    assert roles_resp.status_code == 200
    roles = roles_resp.json()
    assert any(r["id"] == created_role_id for r in roles)
    assert not any(r["id"] == vol_role_id for r in roles)

    # Clean up
    db_session.delete(a_vol)
    db_session.commit()


def test_recruiter_organization_access_tenant_filtering_and_security(client: TestClient, db_session: Session):
    """
    Test suite verifying:
    1. /api/v1/auth/companies?is_tenant=true returns only Client Organizations (is_tenant=True).
    2. Vendor Companies (is_tenant=False) are excluded from tenant-only list.
    3. Global unfiltered /api/v1/auth/companies still returns all companies.
    4. Saving Recruiter company access for tenant organizations (IOSYS/Volantis) succeeds.
    5. Attempting to assign a Vendor Company (is_tenant=False) to a Recruiter is rejected (400 Bad Request).
    6. Mixed requests (valid tenant + vendor company) are rejected atomically and do not partially save.
    7. Non-existent UUIDs are rejected (400 Bad Request).
    """
    admin_user, rec_c, iosys, volantis, sub_iosys, sub_volantis = setup_recruiter_company_data(db_session)

    # Setup Vendor Companies (is_tenant=False)
    vendor_agency1 = get_or_create_vendor(db_session, "ABC Staffing Agency", is_tenant=False)
    vendor_agency2 = get_or_create_vendor(db_session, "DEF Talent Partners", is_tenant=False)
    db_session.commit()

    # 1. Verify ?is_tenant=true returns ONLY Client Organizations (IOSYS, Volantis) and NOT Vendor Companies
    resp_tenant = client.get("/api/v1/auth/companies?is_tenant=true")
    assert resp_tenant.status_code == 200
    tenant_companies = resp_tenant.json()
    tenant_names = [c["name"] for c in tenant_companies]
    assert "IOSYS" in tenant_names
    assert "Volantis" in tenant_names
    assert "ABC Staffing Agency" not in tenant_names
    assert "DEF Talent Partners" not in tenant_names

    # 2. Verify ?is_tenant=false returns ONLY Vendor Companies
    resp_non_tenant = client.get("/api/v1/auth/companies?is_tenant=false")
    assert resp_non_tenant.status_code == 200
    non_tenant_companies = resp_non_tenant.json()
    non_tenant_names = [c["name"] for c in non_tenant_companies]
    assert "ABC Staffing Agency" in non_tenant_names
    assert "DEF Talent Partners" in non_tenant_names
    assert "IOSYS" not in non_tenant_names
    assert "Volantis" not in non_tenant_names

    # 3. Verify unfiltered endpoint returns all companies
    resp_all = client.get("/api/v1/auth/companies")
    assert resp_all.status_code == 200
    all_names = [c["name"] for c in resp_all.json()]
    assert "IOSYS" in all_names
    assert "Volantis" in all_names
    assert "ABC Staffing Agency" in all_names
    assert "DEF Talent Partners" in all_names

    # Map IOSYS and Volantis to admin
    a_iosys = RecruiterCompanyAccess(recruiter_id=admin_user.id, company_id=iosys.id, status="APPROVED")
    a_vol = RecruiterCompanyAccess(recruiter_id=admin_user.id, company_id=volantis.id, status="APPROVED")
    db_session.add(a_iosys)
    db_session.add(a_vol)
    db_session.commit()

    # Login as Admin
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_access@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    admin_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Record initial accesses for Recruiter C
    initial_accesses = db_session.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == rec_c.id
    ).all()
    initial_comp_ids = {a.company_id for a in initial_accesses}
    assert iosys.id in initial_comp_ids

    # 4. Attempt to assign ONLY a Vendor Company (is_tenant=False) -> MUST return 400 Bad Request
    invalid_resp = client.post(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        json=[str(vendor_agency1.id)],
        headers=admin_headers
    )
    assert invalid_resp.status_code == 400
    assert "Vendor Agency" in invalid_resp.json()["detail"] or "Client Organization" in invalid_resp.json()["detail"]

    # Verify no state change
    current_accesses = db_session.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == rec_c.id
    ).all()
    current_comp_ids = {a.company_id for a in current_accesses}
    assert current_comp_ids == initial_comp_ids

    # 5. Mixed request (one valid tenant: Volantis, one Vendor Company: ABC Staffing Agency)
    # MUST be rejected atomically and MUST NOT partially save Volantis
    mixed_resp = client.post(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        json=[str(volantis.id), str(vendor_agency1.id)],
        headers=admin_headers
    )
    assert mixed_resp.status_code == 400
    assert "Vendor Agency" in mixed_resp.json()["detail"] or "Client Organization" in mixed_resp.json()["detail"]

    # Verify no partial save: rec_c should STILL only have original IOSYS access, NOT Volantis or ABC Staffing
    after_mixed = db_session.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == rec_c.id
    ).all()
    after_mixed_ids = {a.company_id for a in after_mixed}
    assert after_mixed_ids == initial_comp_ids
    assert volantis.id not in after_mixed_ids
    assert vendor_agency1.id not in after_mixed_ids

    # 6. Non-existent UUID -> MUST return 400 Bad Request and not save
    non_existent_uuid = str(uuid4())
    bad_uuid_resp = client.post(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        json=[str(iosys.id), non_existent_uuid],
        headers=admin_headers
    )
    assert bad_uuid_resp.status_code == 400
    assert "does not exist" in bad_uuid_resp.json()["detail"]

    # 7. Valid assignment to Client Organizations (IOSYS + Volantis) -> MUST succeed (200 OK)
    valid_resp = client.post(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        json=[str(iosys.id), str(volantis.id)],
        headers=admin_headers
    )
    assert valid_resp.status_code == 200

    # Verify DB state has both tenant accesses
    updated_accesses = db_session.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == rec_c.id
    ).all()
    updated_ids = {a.company_id for a in updated_accesses}
    assert iosys.id in updated_ids
    assert volantis.id in updated_ids

    # 8. Check GET /api/v1/recruiter/users/{id}/companies returns only tenant IDs
    get_comp_resp = client.get(
        f"/api/v1/recruiter/users/{rec_c.id}/companies",
        headers=admin_headers
    )
    assert get_comp_resp.status_code == 200
    get_comp_ids = get_comp_resp.json()
    assert str(iosys.id) in get_comp_ids
    assert str(volantis.id) in get_comp_ids

    # Clean up
    db_session.delete(a_iosys)
    db_session.delete(a_vol)
    db_session.commit()
