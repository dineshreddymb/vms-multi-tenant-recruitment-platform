import uuid
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import (
    InternalUser,
    Vendor,
    VendorUser,
    Department,
    JobRole,
    Candidate,
    Submission,
    Resume
)
from db.crypto import get_pan_fingerprint, normalize_pan
from backend.auth import hash_password

def get_vendor_auth_header(client: TestClient, email: str, password: str = "Password123!"):
    resp = client.post("/api/v1/auth/vendor/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def create_vendor_and_user(db: Session, company_name: str, email: str):
    clean = " ".join(company_name.strip().split()).lower()
    vendor = db.query(Vendor).filter(Vendor.normalized_name == clean).first()
    if not vendor:
        vendor = Vendor(name=company_name, normalized_name=clean)
        db.add(vendor)
        db.flush()
    
    pwd_hash = hash_password("Password123!")
    user = db.query(VendorUser).filter(VendorUser.email == email).first()
    if not user:
        user = VendorUser(
            vendor_id=vendor.id,
            email=email,
            password_hash=pwd_hash,
            name=f"User {email}",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(user)
        db.flush()
    db.commit()
    return vendor, user

def create_eligible_resume(db: Session, vendor_id: uuid.UUID, vendor_user_id: uuid.UUID):
    resume = Resume(
        vendor_id=vendor_id,
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

def create_roles(db: Session):
    dept = db.query(Department).filter(Department.status == "ACTIVE").first()
    if not dept:
        dept = Department(name="Engineering", status="ACTIVE")
        db.add(dept)
        db.flush()
    
    vendor = db.query(Vendor).first()
    if not vendor:
        vendor = Vendor(name="Test Vendor", normalized_name="test vendor")
        db.add(vendor)
        db.flush()

    role1 = db.query(JobRole).filter(JobRole.title == "AI/ML Engineer", JobRole.department_id == dept.id).first()
    if not role1:
        role1 = JobRole(department_id=dept.id, vendor_id=vendor.id, title="AI/ML Engineer", job_id="JOB-AIML-01", status="ACTIVE")
        db.add(role1)
        db.flush()

    role2 = db.query(JobRole).filter(JobRole.title == "Data Scientist", JobRole.department_id == dept.id).first()
    if not role2:
        role2 = JobRole(department_id=dept.id, vendor_id=vendor.id, title="Data Scientist", job_id="JOB-DATA-01", status="ACTIVE")
        db.add(role2)
        db.flush()

    role3 = db.query(JobRole).filter(JobRole.title == "Python Developer", JobRole.department_id == dept.id).first()
    if not role3:
        role3 = JobRole(department_id=dept.id, vendor_id=vendor.id, title="Python Developer", job_id="JOB-PY-01", status="ACTIVE")
        db.add(role3)
        db.flush()
    
    db.commit()
    return role1, role2, role3


# -------------------------------------------------------------
# 1. SAME VENDOR SAME ROLE: DAY 0, 89, 90 (BLOCKED) & DAY 91 (ALLOWED)
# -------------------------------------------------------------

def test_same_vendor_same_role_calendar_boundaries(client: TestClient, db_session: Session):
    """
    Tests:
    - Same vendor + same role immediately -> 409 BLOCK
    - Same vendor + same role Day 89 -> 409 BLOCK
    - Same vendor + same role Day 90 -> 409 BLOCK (Day 90 is still blocked)
    - Same vendor + same role Day 91 -> 201 ALLOW (91st calendar day is first eligible day)
    - New submission on Day 91 establishes a new 90-day baseline
    """
    role_aiml, _, _ = create_roles(db_session)
    vendor_a, user_a = create_vendor_and_user(db_session, "SR Boundary Vendor A", "srb_a@corp.com")
    role_aiml.vendor_id = vendor_a.id
    db_session.commit()
    headers_a = get_vendor_auth_header(client, "srb_a@corp.com")

    test_pan = "SRBND1234A"

    # Step 1: Initial submission by Vendor A for Role AI/ML (Day 0) -> 201 ALLOW
    res_1 = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    payload = {
        "cv_sent_date": "2026-08-17",
        "employment_mode": "Perm",
        "role_id": str(role_aiml.id),
        "job_id": role_aiml.job_id,
        "name": "Same Role Cand",
        "email": "srb@cand.com",
        "contact_number": "+919876543210",
        "current_company": "Comp A",
        "total_experience": "5.0",
        "relevant_experience": "4.0",
        "notice_period": "30",
        "ctc": "12.00",
        "ectc": "16.00",
        "current_location": "BLR",
        "preferred_location": "HYD",
        "pan": test_pan,
        "linkedin_url": "https://linkedin.com/in/srb",
        "education": "BTech",
        "about": "Bio",
        "resume_id": str(res_1.id)
    }
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload, headers=headers_a)
    assert r1.status_code == 201

    # Step 2: Immediate retry on Day 0 -> 409 BLOCK
    res_2 = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    p_retry = payload.copy()
    p_retry["resume_id"] = str(res_2.id)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r2 = client.post("/api/v1/submissions", json=p_retry, headers=headers_a)
    assert r2.status_code == 409
    assert "Candidate with this PAN has already been submitted for this job role" in r2.json()["detail"]
    assert "Resubmission will be allowed from" in r2.json()["detail"]

    fp = get_pan_fingerprint(normalize_pan(test_pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()

    # Step 3: Simulate Day 89 -> 409 BLOCK
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=89)}
    )
    db_session.commit()
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r3 = client.post("/api/v1/submissions", json=p_retry, headers=headers_a)
    assert r3.status_code == 409

    # Step 4: Simulate Day 90 -> 409 BLOCK (Day 90 must still be blocked)
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=90)}
    )
    db_session.commit()
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r4 = client.post("/api/v1/submissions", json=p_retry, headers=headers_a)
    assert r4.status_code == 409, f"Day 90 must be BLOCKED but got {r4.status_code}"

    # Step 5: Simulate Day 91 -> 201 ALLOW (91st calendar day is eligible)
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=91)}
    )
    db_session.commit()
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r5 = client.post("/api/v1/submissions", json=p_retry, headers=headers_a)
    assert r5.status_code == 201, f"Day 91 must be ALLOWED but got {r5.status_code}: {r5.json()}"

    # Step 6: Immediate submission after Step 5 must be BLOCKED again
    res_3 = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    p_retry2 = payload.copy()
    p_retry2["resume_id"] = str(res_3.id)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r6 = client.post("/api/v1/submissions", json=p_retry2, headers=headers_a)
    assert r6.status_code == 409


# -------------------------------------------------------------
# 2. ROLLING 90-DAY RESTRICTION & CROSS-VENDOR LOGIC
# -------------------------------------------------------------

def test_rolling_90_day_policy(client: TestClient, db_session: Session):
    """
    Tests:
    1. 17-Aug: Vendor A submits PAN X for Role A -> 201 ALLOW
    2. 18-Aug: Vendor A submits PAN X for Role B -> 201 ALLOW (Same vendor different role)
    3. 18-Aug: Vendor B submits PAN X for Role B/C -> 409 BLOCK
    4. 15-Nov (Day 90): Vendor B submits PAN X for Role B -> 409 BLOCK (Day 90 still blocked)
    5. 16-Nov (Day 91): Vendor B submits PAN X for Role B -> 201 ALLOW (Starts NEW 90-day window!)
    6. 17-Nov (Day 1 of new window):
       - Vendor A submits PAN X for Role C -> 409 BLOCK (Original vendor blocked by new rolling window)
       - Vendor C submits PAN X for Role C -> 409 BLOCK (Third vendor blocked by new rolling window)
       - Vendor B submits PAN X for Role C -> 201 ALLOW (Latest vendor can submit different roles!)
    """
    role_a, role_b, role_c = create_roles(db_session)
    vendor_a, user_a = create_vendor_and_user(db_session, "Roll Vendor A", "roll_a@corp.com")
    vendor_b, user_b = create_vendor_and_user(db_session, "Roll Vendor B", "roll_b@corp.com")
    vendor_c, user_c = create_vendor_and_user(db_session, "Roll Vendor C", "roll_c@corp.com")

    # Set roles vendor IDs to correct vendors
    role_a.vendor_id = vendor_a.id
    role_b.vendor_id = vendor_a.id
    db_session.commit()

    # Vendor B needs a role to submit candidate to (Step 3/4/5)
    role_b_vendor_b = JobRole(department_id=role_b.department_id, vendor_id=vendor_b.id, title="Data Scientist B", job_id="JOB-DATA-B", status="ACTIVE")
    db_session.add(role_b_vendor_b)
    db_session.flush()

    # Vendor A needs role C to submit candidate to (Step 6a)
    role_c_vendor_a = JobRole(department_id=role_c.department_id, vendor_id=vendor_a.id, title="Python Dev A", job_id="JOB-PY-A", status="ACTIVE")
    db_session.add(role_c_vendor_a)
    db_session.flush()

    # Vendor B needs role C to submit candidate to (Step 6c)
    role_c_vendor_b = JobRole(department_id=role_c.department_id, vendor_id=vendor_b.id, title="Python Dev B", job_id="JOB-PY-B", status="ACTIVE")
    db_session.add(role_c_vendor_b)
    db_session.flush()

    # Vendor C needs role C to submit candidate to (Step 6b)
    role_c_vendor_c = JobRole(department_id=role_c.department_id, vendor_id=vendor_c.id, title="Python Dev C", job_id="JOB-PY-C", status="ACTIVE")
    db_session.add(role_c_vendor_c)
    db_session.flush()

    db_session.commit()

    headers_a = get_vendor_auth_header(client, "roll_a@corp.com")
    headers_b = get_vendor_auth_header(client, "roll_b@corp.com")
    headers_c = get_vendor_auth_header(client, "roll_c@corp.com")

    test_pan = "ROLLG1234A"

    # Step 1: 17-Aug -> Vendor A submits PAN X for Role A -> 201 ALLOW
    res_a1 = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    payload_a1 = {
        "cv_sent_date": "2026-08-17",
        "employment_mode": "Perm",
        "role_id": str(role_a.id),
        "job_id": role_a.job_id,
        "name": "Rolling Cand",
        "email": "roll@cand.com",
        "contact_number": "+919876543210",
        "current_company": "Comp",
        "total_experience": "4.0",
        "relevant_experience": "3.0",
        "notice_period": "30",
        "ctc": "10.00",
        "ectc": "14.00",
        "current_location": "BLR",
        "preferred_location": "HYD",
        "pan": test_pan,
        "linkedin_url": "https://linkedin.com/in/roll",
        "education": "BTech",
        "about": "Bio",
        "resume_id": str(res_a1.id)
    }
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload_a1, headers=headers_a)
    assert r1.status_code == 201

    # Step 2: 18-Aug -> Vendor A submits PAN X for Role B -> 201 ALLOW immediately
    res_a2 = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    payload_a2 = payload_a1.copy()
    payload_a2["role_id"] = str(role_b.id)
    payload_a2["job_id"] = role_b.job_id
    payload_a2["resume_id"] = str(res_a2.id)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r2 = client.post("/api/v1/submissions", json=payload_a2, headers=headers_a)
    assert r2.status_code == 201

    # Step 3: 18-Aug -> Vendor B submits PAN X for Role B -> 409 BLOCK
    res_b1 = create_eligible_resume(db_session, vendor_b.id, user_b.id)
    payload_b = payload_a1.copy()
    payload_b["role_id"] = str(role_b_vendor_b.id)
    payload_b["job_id"] = role_b_vendor_b.job_id
    payload_b["resume_id"] = str(res_b1.id)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    r3 = client.post("/api/v1/submissions", json=payload_b, headers=headers_b)
    assert r3.status_code == 409
    assert "submitted by another vendor" in r3.json()["detail"]

    # Step 4: Simulate Day 90 (15-Nov) -> Vendor B submits -> 409 BLOCK
    fp = get_pan_fingerprint(normalize_pan(test_pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=90)}
    )
    db_session.commit()

    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    r4 = client.post("/api/v1/submissions", json=payload_b, headers=headers_b)
    assert r4.status_code == 409, f"Day 90 must be BLOCKED for other vendors but got {r4.status_code}"

    # Step 5: Simulate Day 91 (16-Nov) -> Vendor B submits -> 201 ALLOW (starts NEW rolling window!)
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=91)}
    )
    db_session.commit()

    res_b2 = create_eligible_resume(db_session, vendor_b.id, user_b.id)
    payload_b["resume_id"] = str(res_b2.id)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    r5 = client.post("/api/v1/submissions", json=payload_b, headers=headers_b)
    assert r5.status_code == 201

    # Step 6: 17-Nov (Day 1 of Vendor B's new window):
    # 6a: Vendor A attempts Role C -> 409 BLOCK (Original vendor blocked by Vendor B's rolling window)
    res_a3 = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    payload_a3 = payload_a1.copy()
    payload_a3["role_id"] = str(role_c_vendor_a.id)
    payload_a3["job_id"] = role_c_vendor_a.job_id
    payload_a3["resume_id"] = str(res_a3.id)
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r6 = client.post("/api/v1/submissions", json=payload_a3, headers=headers_a)
    assert r6.status_code == 409, f"Original Vendor A must be blocked during Vendor B's rolling window but got {r6.status_code}: {r6.json()}"
    assert "submitted by another vendor" in r6.json()["detail"]

    # 6b: Vendor C attempts Role C -> 409 BLOCK (Third vendor blocked)
    res_c1 = create_eligible_resume(db_session, vendor_c.id, user_c.id)
    payload_c = payload_a1.copy()
    payload_c["role_id"] = str(role_c_vendor_c.id)
    payload_c["job_id"] = role_c_vendor_c.job_id
    payload_c["resume_id"] = str(res_c1.id)
    headers_c["Idempotency-Key"] = str(uuid.uuid4())
    r7 = client.post("/api/v1/submissions", json=payload_c, headers=headers_c)
    assert r7.status_code == 409

    # 6c: Vendor B (latest vendor) submits for Role C -> 201 ALLOW immediately
    res_b3 = create_eligible_resume(db_session, vendor_b.id, user_b.id)
    payload_b_role_c = payload_a1.copy()
    payload_b_role_c["role_id"] = str(role_c_vendor_b.id)
    payload_b_role_c["job_id"] = role_c_vendor_b.job_id
    payload_b_role_c["resume_id"] = str(res_b3.id)
    headers_b["Idempotency-Key"] = str(uuid.uuid4())
    r8 = client.post("/api/v1/submissions", json=payload_b_role_c, headers=headers_b)
    assert r8.status_code == 201


# -------------------------------------------------------------
# 3. PAN ADVISORY ENDPOINT EXACT MATCHING
# -------------------------------------------------------------

def test_pan_advisory_endpoint_matching(client: TestClient, db_session: Session):
    role_1, role_2, _ = create_roles(db_session)
    vendor_a, user_a = create_vendor_and_user(db_session, "Adv Test Vendor A", "advt_a@corp.com")
    vendor_b, user_b = create_vendor_and_user(db_session, "Adv Test Vendor B", "advt_b@corp.com")

    role_1.vendor_id = vendor_a.id
    role_2.vendor_id = vendor_a.id
    db_session.commit()

    role_1_vendor_b = JobRole(department_id=role_1.department_id, vendor_id=vendor_b.id, title="AI/ML Engineer B", job_id="JOB-AIML-B", status="ACTIVE")
    db_session.add(role_1_vendor_b)
    db_session.commit()

    headers_a = get_vendor_auth_header(client, "advt_a@corp.com")
    headers_b = get_vendor_auth_header(client, "advt_b@corp.com")

    pan = "ADVCH1234A"

    # 1. Non-existent PAN
    resp = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1.id)}, headers=headers_a)
    assert resp.status_code == 200
    assert resp.json()["exists"] is False
    assert resp.json()["can_submit"] is True

    # 2. Submit under Vendor A for role_1
    res_a = create_eligible_resume(db_session, vendor_a.id, user_a.id)
    payload = {
        "cv_sent_date": "2026-08-17",
        "employment_mode": "Perm",
        "role_id": str(role_1.id),
        "job_id": role_1.job_id,
        "name": "Adv Cand",
        "email": "advt@cand.com",
        "contact_number": "+919876543210",
        "current_company": "Comp",
        "total_experience": "4.0",
        "relevant_experience": "3.0",
        "notice_period": "30",
        "ctc": "10.00",
        "ectc": "14.00",
        "current_location": "Hyd",
        "preferred_location": "Hyd",
        "pan": pan,
        "linkedin_url": "https://linkedin.com/in/advt",
        "education": "BTech",
        "about": "Bio",
        "resume_id": str(res_a.id)
    }
    headers_a["Idempotency-Key"] = str(uuid.uuid4())
    r1 = client.post("/api/v1/submissions", json=payload, headers=headers_a)
    assert r1.status_code == 201

    # 3. Vendor A checks same role_1 on Day 0 -> can_submit=False
    resp = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1.id)}, headers=headers_a)
    assert resp.status_code == 200
    assert resp.json()["can_submit"] is False
    assert resp.json()["status"] == "BLOCKED_SAME_VENDOR_SAME_ROLE_90_DAYS"
    assert "Resubmission will be allowed from" in resp.json()["message"]

    # 4. Vendor A checks different role_2 -> can_submit=True
    resp = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_2.id)}, headers=headers_a)
    assert resp.status_code == 200
    assert resp.json()["can_submit"] is True
    assert resp.json()["status"] == "ALLOWED_SAME_VENDOR_DIFFERENT_ROLE"

    # 5. Vendor B checks within 90 days -> can_submit=False
    resp = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1_vendor_b.id)}, headers=headers_b)
    assert resp.status_code == 200
    assert resp.json()["can_submit"] is False
    assert resp.json()["status"] == "BLOCKED_OTHER_VENDOR_90_DAYS"
    assert "Resubmission will be allowed from" in resp.json()["message"]

    # 6. Simulate Day 90 -> Both still blocked
    fp = get_pan_fingerprint(normalize_pan(pan))
    cand = db_session.query(Candidate).filter(Candidate.pan_fingerprint == fp).first()
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=90)}
    )
    db_session.commit()

    resp_a90 = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1.id)}, headers=headers_a)
    assert resp_a90.json()["can_submit"] is False

    resp_b90 = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1_vendor_b.id)}, headers=headers_b)
    assert resp_b90.json()["can_submit"] is False

    # 7. Simulate Day 91 -> Both allowed
    db_session.query(Submission).filter(Submission.candidate_id == cand.id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=91)}
    )
    db_session.commit()

    resp_a91 = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1.id)}, headers=headers_a)
    assert resp_a91.json()["can_submit"] is True

    resp_b91 = client.post("/api/v1/pan/check", json={"pan": pan, "role_id": str(role_1_vendor_b.id)}, headers=headers_b)
    assert resp_b91.json()["can_submit"] is True
