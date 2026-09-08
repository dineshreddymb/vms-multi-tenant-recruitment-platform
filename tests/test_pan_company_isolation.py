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

def get_vendor_auth_header(client: TestClient, email: str, company_id: uuid.UUID = None, password: str = "Password123!"):
    body = {"email": email, "password": password}
    if company_id:
        body["company_id"] = str(company_id)
    resp = client.post("/api/v1/auth/vendor/login", json=body)
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

    for t in db.query(Vendor).filter(Vendor.is_tenant == True).all():
        add_membership(db, user.id, t.id)

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

# ----------------- 1 & 2. CROSS-COMPANY ISOLATION TESTS -----------------

def test_01_iosys_submission_does_not_block_volantis(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    volantis = get_or_create_client_company(db_session, "Volantis")
    
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_iosys = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    headers_vol = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    
    role_iosys = create_job_role(db_session, iosys, "IOSYS Aim", "JOB-ISO-IOSYS-1")
    role_vol = create_job_role(db_session, volantis, "Volantis Aim", "JOB-ISO-VOL-1")
    
    pan = "ISOLA1234A"
    
    # Submit to IOSYS -> ALLOW (201)
    res_iosys = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_iosys = make_payload(role_iosys, res_iosys.id, pan, "iso1@test.com", "Iso One")
    headers_iosys["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload_iosys, headers=headers_iosys)
    assert r1.status_code == 201
    
    # Submit to Volantis -> ALLOW (201)
    res_vol = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_vol = make_payload(role_vol, res_vol.id, pan, "iso1@test.com", "Iso One")
    headers_vol["Idempotency-Key"] = str(uuid.uuid4())
    r2 = client.post("/api/v1/submissions", json=payload_vol, headers=headers_vol)
    assert r2.status_code == 201

def test_02_volantis_submission_does_not_block_iosys(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    volantis = get_or_create_client_company(db_session, "Volantis")
    
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_vol = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    headers_iosys = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    
    role_iosys = create_job_role(db_session, iosys, "IOSYS Aim 2", "JOB-ISO-IOSYS-2")
    role_vol = create_job_role(db_session, volantis, "Volantis Aim 2", "JOB-ISO-VOL-2")
    
    pan = "ISOLA1234B"
    
    # Submit to Volantis -> ALLOW (201)
    res_vol = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_vol = make_payload(role_vol, res_vol.id, pan, "iso2@test.com", "Iso Two")
    headers_vol["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload_vol, headers=headers_vol)
    assert r1.status_code == 201
    
    # Submit to IOSYS -> ALLOW (201)
    res_iosys = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_iosys = make_payload(role_iosys, res_iosys.id, pan, "iso2@test.com", "Iso Two")
    headers_iosys["Idempotency-Key"] = str(uuid.uuid4())
    r2 = client.post("/api/v1/submissions", json=payload_iosys, headers=headers_iosys)
    assert r2.status_code == 201

# ----------------- 3 & 4. SAME VENDOR SAME ROLE 90-DAY CALENDAR BOUNDARIES -----------------

def test_03_iosys_same_vendor_same_role_boundaries(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_a = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    role = create_job_role(db_session, iosys, "IOSYS Role 3", "JOB-ISO-IOSYS-3")
    
    pan = "BOUND1234A"
    
    # Day 0: Initial submission -> ALLOW
    res_1 = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload = make_payload(role, res_1.id, pan, "bound1@test.com", "Bound One")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 201
    
    fp = get_pan_fingerprint(normalize_pan(pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    
    # Helper to simulate days elapsed
    def set_days_elapsed(days):
        db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
            {"created_at": datetime.now(timezone.utc) - timedelta(days=days)}
        )
        db_session.commit()

    # Day 89 -> BLOCK
    set_days_elapsed(89)
    res_2 = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload["resume_id"] = str(res_2.id)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 409

    # Day 90 -> BLOCK
    set_days_elapsed(90)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 409

    # Day 91 -> ALLOW
    set_days_elapsed(91)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 201

def test_04_volantis_same_vendor_same_role_boundaries(client: TestClient, db_session: Session):
    volantis = get_or_create_client_company(db_session, "Volantis")
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_a = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    role = create_job_role(db_session, volantis, "Volantis Role 4", "JOB-ISO-VOL-4")
    
    pan = "BOUND1234B"
    
    # Day 0: Initial submission -> ALLOW
    res_1 = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload = make_payload(role, res_1.id, pan, "bound2@test.com", "Bound Two")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 201
    
    fp = get_pan_fingerprint(normalize_pan(pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    
    # Helper to simulate days elapsed
    def set_days_elapsed(days):
        db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
            {"created_at": datetime.now(timezone.utc) - timedelta(days=days)}
        )
        db_session.commit()

    # Day 89 -> BLOCK
    set_days_elapsed(89)
    res_2 = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload["resume_id"] = str(res_2.id)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 409

    # Day 90 -> BLOCK
    set_days_elapsed(90)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 409

    # Day 91 -> ALLOW
    set_days_elapsed(91)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload, headers=headers_a).status_code == 201

# ----------------- 5 & 6. SAME VENDOR DIFFERENT ROLE (ALLOW IMMEDIATELY) -----------------

def test_05_iosys_same_vendor_different_role(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_a = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    role_1 = create_job_role(db_session, iosys, "IOSYS Role 5a", "JOB-ISO-IOSYS-5A")
    role_2 = create_job_role(db_session, iosys, "IOSYS Role 5b", "JOB-ISO-IOSYS-5B")
    
    pan = "DIFFR1234A"
    
    # Submit Role 1 -> ALLOW
    res_1 = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_1 = make_payload(role_1, res_1.id, pan, "diff1@test.com", "Diff One")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_1, headers=headers_a).status_code == 201
    
    # Submit Role 2 immediately -> ALLOW
    res_2 = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_2 = make_payload(role_2, res_2.id, pan, "diff1@test.com", "Diff One")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_2, headers=headers_a).status_code == 201

def test_06_volantis_same_vendor_different_role(client: TestClient, db_session: Session):
    volantis = get_or_create_client_company(db_session, "Volantis")
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_a = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    role_1 = create_job_role(db_session, volantis, "Volantis Role 6a", "JOB-ISO-VOL-6A")
    role_2 = create_job_role(db_session, volantis, "Volantis Role 6b", "JOB-ISO-VOL-6B")
    
    pan = "DIFFR1234B"
    
    # Submit Role 1 -> ALLOW
    res_1 = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_1 = make_payload(role_1, res_1.id, pan, "diff2@test.com", "Diff Two")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_1, headers=headers_a).status_code == 201
    
    # Submit Role 2 immediately -> ALLOW
    res_2 = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_2 = make_payload(role_2, res_2.id, pan, "diff2@test.com", "Diff Two")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_2, headers=headers_a).status_code == 201

# ----------------- 7 & 8. DIFFERENT VENDOR ANY ROLE (BLOCK within 90 days, ALLOW 91+) -----------------

def test_07_iosys_different_vendor_any_role(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    agency_b, user_b = get_or_create_agency_and_user(db_session, "Isolation Agency B", "iso_b@agency.com")
    
    headers_a = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    headers_b = get_vendor_auth_header(client, "iso_b@agency.com", iosys.id)
    
    role_a = create_job_role(db_session, iosys, "IOSYS Role 7a", "JOB-ISO-IOSYS-7A")
    role_b = create_job_role(db_session, iosys, "IOSYS Role 7b", "JOB-ISO-IOSYS-7B")
    
    pan = "DIFFV1234A"
    
    # Day 0: Vendor A submits -> ALLOW
    res_a = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_a = make_payload(role_a, res_a.id, pan, "diffvd1@test.com", "Diffvd One")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_a, headers=headers_a).status_code == 201
    
    fp = get_pan_fingerprint(normalize_pan(pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    
    def set_days_elapsed(days):
        db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
            {"created_at": datetime.now(timezone.utc) - timedelta(days=days)}
        )
        db_session.commit()

    # Day 89: Vendor B submits to role B -> BLOCK
    set_days_elapsed(89)
    res_b = create_eligible_resume(db_session, iosys.id, user_b.id)
    payload_b = make_payload(role_b, res_b.id, pan, "diffvd1@test.com", "Diffvd One")
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_b, headers=headers_b).status_code == 409

    # Day 90: Vendor B submits to role B -> BLOCK
    set_days_elapsed(90)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_b, headers=headers_b).status_code == 409

    # Day 91: Vendor B submits to role B -> ALLOW
    set_days_elapsed(91)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_b, headers=headers_b).status_code == 201

def test_08_volantis_different_vendor_any_role(client: TestClient, db_session: Session):
    volantis = get_or_create_client_company(db_session, "Volantis")
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    agency_b, user_b = get_or_create_agency_and_user(db_session, "Isolation Agency B", "iso_b@agency.com")
    
    headers_a = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    headers_b = get_vendor_auth_header(client, "iso_b@agency.com", volantis.id)
    
    role_a = create_job_role(db_session, volantis, "Volantis Role 8a", "JOB-ISO-VOL-8A")
    role_b = create_job_role(db_session, volantis, "Volantis Role 8b", "JOB-ISO-VOL-8B")
    
    pan = "DIFFV1234B"
    
    # Day 0: Vendor A submits -> ALLOW
    res_a = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_a = make_payload(role_a, res_a.id, pan, "diffvd2@test.com", "Diffvd Two")
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_a, headers=headers_a).status_code == 201
    
    fp = get_pan_fingerprint(normalize_pan(pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    
    def set_days_elapsed(days):
        db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
            {"created_at": datetime.now(timezone.utc) - timedelta(days=days)}
        )
        db_session.commit()

    # Day 89: Vendor B submits to role B -> BLOCK
    set_days_elapsed(89)
    res_b = create_eligible_resume(db_session, volantis.id, user_b.id)
    payload_b = make_payload(role_b, res_b.id, pan, "diffvd2@test.com", "Diffvd Two")
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_b, headers=headers_b).status_code == 409

    # Day 90: Vendor B submits to role B -> BLOCK
    set_days_elapsed(90)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_b, headers=headers_b).status_code == 409

    # Day 91: Vendor B submits to role B -> ALLOW
    set_days_elapsed(91)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_b, headers=headers_b).status_code == 201

# ----------------- 9. INDEPENDENT TIMELINES -----------------

def test_09_independent_timelines_and_windows(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    volantis = get_or_create_client_company(db_session, "Volantis")
    
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_iosys = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    headers_vol = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    
    role_iosys = create_job_role(db_session, iosys, "IOSYS Role 9", "JOB-ISO-IOSYS-9")
    role_vol = create_job_role(db_session, volantis, "Volantis Role 9", "JOB-ISO-VOL-9")
    
    pan = "INDTI1234A"
    
    # 1. Day 0 (IOSYS): Vendor A submits PAN T to IOSYS -> ALLOW
    res_iosys = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_iosys = make_payload(role_iosys, res_iosys.id, pan, "ind@test.com", "Ind Cand")
    headers_iosys["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_iosys, headers=headers_iosys).status_code == 201
    
    # Fetch candidate
    fp = get_pan_fingerprint(normalize_pan(pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    
    # Adjust IOSYS submission created_at to be exactly 10 days ago (Day 10)
    db_session.query(Submission).filter(
        Submission.candidate_id == cand.id,
        Submission.vendor_id == iosys.id
    ).update({"created_at": datetime.now(timezone.utc) - timedelta(days=10)})
    db_session.commit()
    
    # 2. Submit to Volantis now (starts Volantis's own Day 0 timeline) -> ALLOW
    res_vol = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_vol = make_payload(role_vol, res_vol.id, pan, "ind@test.com", "Ind Cand")
    headers_vol["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_vol, headers=headers_vol).status_code == 201
    
    # At this point:
    # - IOSYS submission is 10 days old.
    # - Volantis submission is 0 days old.
    
    # Let's verify that when IOSYS is on Day 91, Volantis is on Day 81:
    # We simulate shifting time forward by 81 days:
    # IOSYS will be 91 days old.
    # Volantis will be 81 days old.
    db_session.query(Submission).filter(
        Submission.candidate_id == cand.id,
        Submission.vendor_id == iosys.id
    ).update({"created_at": datetime.now(timezone.utc) - timedelta(days=91)})
    db_session.query(Submission).filter(
        Submission.candidate_id == cand.id,
        Submission.vendor_id == volantis.id
    ).update({"created_at": datetime.now(timezone.utc) - timedelta(days=81)})
    db_session.commit()
    
    # Resubmitting to IOSYS same-role should be ALLOWED (since Day 91+)
    res_iosys_new = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_iosys["resume_id"] = str(res_iosys_new.id)
    headers_iosys["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_iosys, headers=headers_iosys).status_code == 201
    
    # Resubmitting to Volantis same-role should be BLOCKED (since Day 81 < 91)
    res_vol_new = create_eligible_resume(db_session, volantis.id, user_a.id)
    payload_vol["resume_id"] = str(res_vol_new.id)
    headers_vol["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_vol, headers=headers_vol).status_code == 409

# ----------------- 10. SAME PAN ADVISORY ENDPOINT ISOLATION -----------------

def test_10_same_pan_checks_are_independent(client: TestClient, db_session: Session):
    iosys = get_or_create_client_company(db_session, "IOSYS")
    volantis = get_or_create_client_company(db_session, "Volantis")
    
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    headers_iosys = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    headers_vol = get_vendor_auth_header(client, "iso_a@agency.com", volantis.id)
    
    role_iosys = create_job_role(db_session, iosys, "IOSYS Role 10", "JOB-ISO-IOSYS-10")
    role_vol = create_job_role(db_session, volantis, "Volantis Role 10", "JOB-ISO-VOL-10")
    
    pan = "ADVIS1234A"
    
    # Submit to IOSYS -> ALLOW (201)
    res_iosys = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_iosys = make_payload(role_iosys, res_iosys.id, pan, "adv@test.com", "Adv Cand")
    headers_iosys["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_iosys, headers=headers_iosys).status_code == 201
    
    # Verify advisory endpoint check for IOSYS same role -> BLOCKED (can_submit=False)
    resp_iosys = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_iosys.id)}, headers=headers_iosys)
    assert resp_iosys.status_code == 200
    assert resp_iosys.json()["can_submit"] is False
    assert resp_iosys.json()["status"] == "BLOCKED_SAME_VENDOR_SAME_ROLE_90_DAYS"
    
    # Verify advisory endpoint check for Volantis role -> ALLOWED (can_submit=True)
    resp_vol = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_vol.id)}, headers=headers_vol)
    assert resp_vol.status_code == 200
    assert resp_vol.json()["can_submit"] is True
    assert resp_vol.json()["status"] == "ALLOWED"

# ----------------- 11. DYNAMIC TENANT ISOLATION -----------------

def test_11_dynamic_tenant_isolation(client: TestClient, db_session: Session):
    dynamic_tenant = get_or_create_client_company(db_session, "DynamicTenant")
    iosys = get_or_create_client_company(db_session, "IOSYS")
    
    agency_a, user_a = get_or_create_agency_and_user(db_session, "Isolation Agency A", "iso_a@agency.com")
    add_membership(db_session, user_a.id, dynamic_tenant.id)
    headers_iosys = get_vendor_auth_header(client, "iso_a@agency.com", iosys.id)
    headers_dyn = get_vendor_auth_header(client, "iso_a@agency.com", dynamic_tenant.id)
    
    role_dyn = create_job_role(db_session, dynamic_tenant, "Dyn Role 11", "JOB-ISO-DYN-11")
    role_iosys = create_job_role(db_session, iosys, "IOSYS Role 11", "JOB-ISO-IOSYS-11")
    
    pan = "ABCDE1234F"
    
    # 1. Submit to IOSYS -> ALLOW
    res_iosys = create_eligible_resume(db_session, iosys.id, user_a.id)
    payload_iosys = make_payload(role_iosys, res_iosys.id, pan, "dyn@test.com", "Dyn Cand")
    headers_iosys["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_iosys, headers=headers_iosys).status_code == 201
    
    # 2. Submit to dynamic tenant -> ALLOW (independent timeline)
    res_dyn = create_eligible_resume(db_session, dynamic_tenant.id, user_a.id)
    payload_dyn = make_payload(role_dyn, res_dyn.id, pan, "dyn@test.com", "Dyn Cand")
    headers_dyn["Idempotency-Key"] = str(uuid.uuid4())
    assert client.post("/api/v1/submissions", json=payload_dyn, headers=headers_dyn).status_code == 201

