import uuid
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import (
    Vendor,
    VendorUser,
    VendorUserMembership,
    Department,
    JobRole,
    Candidate,
    Submission,
    Resume
)
from db.crypto import get_pan_fingerprint, normalize_pan
from backend.auth import hash_password

def get_vendor_auth_header(client: TestClient, email: str, company_id: str = None, password: str = "Password123!"):
    payload = {"email": email, "password": password}
    if company_id:
        payload["company_id"] = company_id
    resp = client.post("/api/v1/auth/vendor/login", json=payload)
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def get_or_create_client_company(db: Session, name: str):
    clean = name.strip().lower()
    comp = db.query(Vendor).filter(Vendor.normalized_name == clean).first()
    if not comp:
        comp = Vendor(name=name, normalized_name=clean, is_tenant=True)
        db.add(comp)
        db.flush()
    db.commit()
    return comp

def get_or_create_agency_and_user(db: Session, name: str, email: str):
    clean = name.strip().lower()
    agency = db.query(Vendor).filter(Vendor.normalized_name == clean).first()
    if not agency:
        agency = Vendor(name=name, normalized_name=clean)
        db.add(agency)
        db.flush()

    pwd_hash = hash_password("Password123!")
    user = db.query(VendorUser).filter(VendorUser.email == email).first()
    if not user:
        user = VendorUser(
            vendor_id=agency.id,
            email=email,
            password_hash=pwd_hash,
            name=f"User {name}",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(user)
        db.flush()
    db.commit()
    return agency, user

def create_eligible_resume(db: Session, company_id: uuid.UUID, vendor_user_id: uuid.UUID):
    resume = Resume(
        vendor_id=company_id,
        vendor_user_id=vendor_user_id,
        filename="test_resume.pdf",
        file_path="/storage/test_resume.pdf",
        file_size=1024,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="CLEAN",
        processing_state="COMPLETED",
        eligibility_state="ELIGIBLE"
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume

def create_job_role(db: Session, company: Vendor, title: str, job_id: str):
    dept = db.query(Department).filter(Department.status == "ACTIVE").first()
    if not dept:
        dept = Department(name="Engineering", status="ACTIVE")
        db.add(dept)
        db.flush()
    role = db.query(JobRole).filter(JobRole.job_id == job_id).first()
    if not role:
        role = JobRole(
            department_id=dept.id,
            vendor_id=company.id,
            title=title,
            job_id=job_id,
            status="ACTIVE"
        )
        db.add(role)
        db.flush()
    db.commit()
    return role

def make_payload(role: JobRole, resume_id: uuid.UUID, pan: str, email: str, name: str) -> dict:
    return {
        "cv_sent_date": "2026-08-27",
        "employment_mode": "Perm",
        "role_id": str(role.id),
        "job_id": role.job_id,
        "name": name,
        "email": email,
        "contact_number": "+919876543210",
        "current_company": "Comp",
        "total_experience": 5.0,
        "relevant_experience": 4.0,
        "notice_period": "30",
        "ctc": 12.0,
        "ectc": 16.0,
        "current_location": "BLR",
        "preferred_location": "HYD",
        "pan": pan,
        "linkedin_url": "https://linkedin.com",
        "education": "BTech",
        "about": "Bio",
        "resume_id": str(resume_id)
    }

def add_membership(db: Session, vendor_user_id: uuid.UUID, client_id: uuid.UUID):
    mem = db.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == vendor_user_id,
        VendorUserMembership.vendor_id == client_id
    ).first()
    if not mem:
        mem = VendorUserMembership(
            vendor_user_id=vendor_user_id,
            vendor_id=client_id,
            status="APPROVED"
        )
        db.add(mem)
        db.commit()

# ----------------- TEST MATRIX -----------------

def test_complete_business_matrix(client: TestClient, db_session: Session):
    # Setup clients
    iosys = get_or_create_client_company(db_session, "IOSYS")
    volantis = get_or_create_client_company(db_session, "Volantis")

    # Setup vendors ABC and DEF
    abc, user_abc = get_or_create_agency_and_user(db_session, "ABC Agency", "user_abc@agency.com")
    def_agency, user_def = get_or_create_agency_and_user(db_session, "DEF Agency", "user_def@agency.com")

    # Setup authorized memberships
    add_membership(db_session, user_abc.id, iosys.id)
    add_membership(db_session, user_def.id, iosys.id)
    add_membership(db_session, user_def.id, volantis.id)

    # Get auth headers (selecting correct active client company context company_id)
    headers_abc = get_vendor_auth_header(client, "user_abc@agency.com", company_id=str(iosys.id))
    headers_abc["X-Vendor-ID"] = str(iosys.id)

    headers_def_iosys = get_vendor_auth_header(client, "user_def@agency.com", company_id=str(iosys.id))
    headers_def_iosys["X-Vendor-ID"] = str(iosys.id)

    headers_def_vol = get_vendor_auth_header(client, "user_def@agency.com", company_id=str(volantis.id))
    headers_def_vol["X-Vendor-ID"] = str(volantis.id)

    # Create roles
    role_iosys_a = create_job_role(db_session, iosys, "IOSYS Role A", "JOB-M-IOSYS-A")
    role_iosys_b = create_job_role(db_session, iosys, "IOSYS Role B", "JOB-M-IOSYS-B")
    role_vol_a = create_job_role(db_session, volantis, "Volantis Role A", "JOB-M-VOL-A")

    pan_x = "ABCDE1234F"

    # 1. ABC submits PAN X to IOSYS for Role A -> ALLOW
    res_abc = create_eligible_resume(db_session, iosys.id, user_abc.id)
    payload_1 = make_payload(role_iosys_a, res_abc.id, pan_x, "cand@test.com", "Candidate X")
    headers_abc["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload_1, headers=headers_abc)
    assert r1.status_code == 201

    # Verify saved submission metadata
    sub_1 = db_session.query(Submission).filter(Submission.id == uuid.UUID(r1.json()["id"])).one()
    assert sub_1.vendor_id == iosys.id  # target client company
    assert sub_1.submitting_agency_id == abc.id  # correct submitting vendor agency
    assert sub_1.vendor_user_id == user_abc.id

    # A. DEF attempts same PAN X to IOSYS for Role B within 90 days -> BLOCK (409)
    res_def = create_eligible_resume(db_session, iosys.id, user_def.id)
    payload_2 = make_payload(role_iosys_b, res_def.id, pan_x, "cand@test.com", "Candidate X")
    headers_def_iosys["Idempotency-Key"] = str(uuid.uuid4())
    r2 = client.post("/api/v1/submissions", json=payload_2, headers=headers_def_iosys)
    assert r2.status_code == 409
    assert "submitted by another vendor" in r2.json()["detail"].lower()

    # B. ABC attempts same PAN X to IOSYS for Role B within 90 days -> ALLOW (201)
    res_abc_2 = create_eligible_resume(db_session, iosys.id, user_abc.id)
    payload_3 = make_payload(role_iosys_b, res_abc_2.id, pan_x, "cand@test.com", "Candidate X")
    headers_abc["Idempotency-Key"] = str(uuid.uuid4())
    r3 = client.post("/api/v1/submissions", json=payload_3, headers=headers_abc)
    assert r3.status_code == 201

    # C. DEF attempts same PAN X to Volantis for Role A within 90 days -> ALLOW (201)
    res_def_vol = create_eligible_resume(db_session, volantis.id, user_def.id)
    payload_4 = make_payload(role_vol_a, res_def_vol.id, pan_x, "cand@test.com", "Candidate X")
    headers_def_vol["Idempotency-Key"] = str(uuid.uuid4())
    r4 = client.post("/api/v1/submissions", json=payload_4, headers=headers_def_vol)
    assert r4.status_code == 201

    # D. DEF attempts same PAN X to IOSYS for Role B outside 90-day window -> ALLOW
    # First, let's roll back the date of all previous submissions for this candidate by 91 days
    fp = get_pan_fingerprint(normalize_pan(pan_x))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).one()
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=91)}
    )
    db_session.commit()

    # DEF attempts again -> ALLOW
    res_def_2 = create_eligible_resume(db_session, iosys.id, user_def.id)
    payload_5 = make_payload(role_iosys_b, res_def_2.id, pan_x, "cand@test.com", "Candidate X")
    headers_def_iosys["Idempotency-Key"] = str(uuid.uuid4())
    r5 = client.post("/api/v1/submissions", json=payload_5, headers=headers_def_iosys)
    assert r5.status_code == 201

def test_multiple_vendor_users_resolve_same_agency(db_session: Session):
    # Setup vendor agency GHI
    ghi, user_ghi_1 = get_or_create_agency_and_user(db_session, "GHI Agency", "ghi1@agency.com")

    # Create second user in GHI
    pwd_hash = hash_password("Password123!")
    user_ghi_2 = db_session.query(VendorUser).filter(VendorUser.email == "ghi2@agency.com").first()
    if not user_ghi_2:
        user_ghi_2 = VendorUser(
            vendor_id=ghi.id,
            email="ghi2@agency.com",
            password_hash=pwd_hash,
            name="User GHI 2",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db_session.add(user_ghi_2)
        db_session.commit()

    # E. Both resolve to same submitting_agency_id
    assert user_ghi_1.vendor_id == ghi.id
    assert user_ghi_2.vendor_id == ghi.id

    # F. Users from different agencies (GHI vs dummy JKL) resolve to different IDs
    jkl, user_jkl = get_or_create_agency_and_user(db_session, "JKL Agency", "jkl@agency.com")
    assert user_ghi_1.vendor_id != jkl.id

def test_same_vendor_multiple_users_pan_check(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")

    # ABC agency and two different users
    abc, user_abc_1 = get_or_create_agency_and_user(db_session, "ABC Agency", "abc1@agency.com")
    pwd_hash = hash_password("Password123!")
    user_abc_2 = db_session.query(VendorUser).filter(VendorUser.email == "abc2@agency.com").first()
    if not user_abc_2:
        user_abc_2 = VendorUser(
            vendor_id=abc.id,
            email="abc2@agency.com",
            password_hash=pwd_hash,
            name="User ABC 2",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db_session.add(user_abc_2)
        db_session.commit()

    add_membership(db_session, user_abc_1.id, iosys.id)
    add_membership(db_session, user_abc_2.id, iosys.id)

    headers_abc1 = get_vendor_auth_header(client, "abc1@agency.com", company_id=str(iosys.id))
    headers_abc1["X-Vendor-ID"] = str(iosys.id)

    headers_abc2 = get_vendor_auth_header(client, "abc2@agency.com", company_id=str(iosys.id))
    headers_abc2["X-Vendor-ID"] = str(iosys.id)

    role_iosys_a = create_job_role(db_session, iosys, "IOSYS Role A Same Vendor", "JOB-SV-A")
    role_iosys_b = create_job_role(db_session, iosys, "IOSYS Role B Same Vendor", "JOB-SV-B")

    pan_y = "XYZAB1234C"

    # User 1 of ABC submits PAN Y to IOSYS for Role A -> ALLOW
    res_abc1 = create_eligible_resume(db_session, iosys.id, user_abc_1.id)
    payload_1 = make_payload(role_iosys_a, res_abc1.id, pan_y, "cand_y@test.com", "Candidate Y")
    headers_abc1["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload_1, headers=headers_abc1)
    assert r1.status_code == 201

    # User 2 of ABC (same agency) attempts same PAN Y to IOSYS for same Role A -> BLOCKED (same vendor, same role)
    res_abc2 = create_eligible_resume(db_session, iosys.id, user_abc_2.id)
    payload_2 = make_payload(role_iosys_a, res_abc2.id, pan_y, "cand_y@test.com", "Candidate Y")
    headers_abc2["Idempotency-Key"] = str(uuid.uuid4())
    r2 = client.post("/api/v1/submissions", json=payload_2, headers=headers_abc2)
    assert r2.status_code == 409
    assert "already been submitted for this job role by your vendor account" in r2.json()["detail"].lower()

    # User 2 of ABC (same agency) attempts same PAN Y to IOSYS for DIFFERENT Role B -> ALLOW (same vendor, diff role)
    payload_3 = make_payload(role_iosys_b, res_abc2.id, pan_y, "cand_y@test.com", "Candidate Y")
    headers_abc2["Idempotency-Key"] = str(uuid.uuid4())
    r3 = client.post("/api/v1/submissions", json=payload_3, headers=headers_abc2)
    assert r3.status_code == 201
