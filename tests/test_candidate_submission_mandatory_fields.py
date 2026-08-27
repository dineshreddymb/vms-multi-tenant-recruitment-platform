import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import Vendor, VendorUser, Department, JobRole, Resume, Submission, Candidate, VendorUserMembership
from backend.auth import hash_password

def setup_submission_environment(db: Session):
    vendor = db.query(Vendor).filter(Vendor.normalized_name == "mandatory test vendor").first()
    if not vendor:
        vendor = Vendor(name="Mandatory Test Vendor", normalized_name="mandatory test vendor")
        db.add(vendor)
        db.flush()

    pwd_hash = hash_password("Password123!")
    user = db.query(VendorUser).filter(VendorUser.email == "mand_user@vendor.com").first()
    if not user:
        user = VendorUser(
            vendor_id=vendor.id,
            email="mand_user@vendor.com",
            password_hash=pwd_hash,
            name="Mandatory Test User",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(user)
        db.flush()
    else:
        user.status = "ACTIVE"
        user.password_hash = pwd_hash

    mem = db.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == user.id,
        VendorUserMembership.vendor_id == vendor.id
    ).first()
    if not mem:
        mem = VendorUserMembership(vendor_user_id=user.id, vendor_id=vendor.id, status="ACTIVE")
        db.add(mem)
    else:
        mem.status = "ACTIVE"

    dept = db.query(Department).filter(Department.name == "Engineering").first()
    if not dept:
        dept = Department(name="Engineering", status="ACTIVE")
        db.add(dept)
        db.flush()

    role = db.query(JobRole).filter(JobRole.title == "Full Stack Engineer", JobRole.department_id == dept.id).first()
    if not role:
        role = JobRole(department_id=dept.id, vendor_id=vendor.id, title="Full Stack Engineer", job_id="JOB-FS-101", status="ACTIVE")
        db.add(role)
        db.flush()

    # Eligible Resume
    resume = Resume(
        vendor_id=vendor.id,
        vendor_user_id=user.id,
        filename="resume.pdf",
        file_path="/tmp/mock_resume.pdf",
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

    return vendor, user, dept, role, resume


def get_vendor_header(client: TestClient, email: str = "mand_user@vendor.com", password: str = "Password123!"):
    resp = client.post("/api/v1/auth/vendor/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def get_base_payload(role: JobRole, resume_id: uuid.UUID, pan: str = "MANFD1234A"):
    return {
        "cv_sent_date": "2026-08-18",
        "employment_mode": "Perm",
        "role_id": str(role.id),
        "job_id": role.job_id,
        "name": "Mandatory Candidate",
        "email": f"cand_{uuid.uuid4().hex[:6]}@example.com",
        "contact_number": "+919876543210",
        "current_company": "Acme Software",
        "total_experience": "6.0",
        "relevant_experience": "4.5",
        "notice_period": "30",
        "ctc": "15.00",
        "ectc": "20.00",
        "current_location": "Bangalore",
        "preferred_location": "Hyderabad",
        "pan": pan,
        "linkedin_url": "https://linkedin.com/in/mandcandidate",
        "education": "B.Tech in Computer Science",
        "about": "Experienced full stack engineer proficient in Python and React.",
        "resume_id": str(resume_id)
    }


def test_valid_submission_with_all_fields_and_job_id(client: TestClient, db_session: Session):
    """TEST 1 & 12: Valid submission with all fields + Job ID succeeds and persists Job ID."""
    vendor, user, dept, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)
    headers["Idempotency-Key"] = str(uuid.uuid4())

    import random, string
    rand_letters = "".join(random.choices(string.ascii_uppercase, k=5))
    rand_digits = "".join(random.choices(string.digits, k=4))
    unique_pan = f"{rand_letters}{rand_digits}Z"
    payload = get_base_payload(role, resume.id, pan=unique_pan)

    resp = client.post("/api/v1/submissions", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["job_id"] == role.job_id
    sub_id = data["id"]

    # Verify Database Persistence
    sub = db_session.query(Submission).filter(Submission.id == sub_id).first()
    assert sub is not None
    assert sub.job_id == role.job_id
    assert sub.status == "SUBMITTED"


def test_submission_rejected_when_job_id_missing(client: TestClient, db_session: Session):
    """TEST 2: Job ID missing -> rejected."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)
    headers["Idempotency-Key"] = str(uuid.uuid4())

    payload = get_base_payload(role, resume.id)
    del payload["job_id"]

    resp = client.post("/api/v1/submissions", json=payload, headers=headers)
    assert resp.status_code == 422


def test_submission_rejected_when_job_id_whitespace_only(client: TestClient, db_session: Session):
    """TEST 3: Job ID contains only whitespace -> rejected."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)
    headers["Idempotency-Key"] = str(uuid.uuid4())

    payload = get_base_payload(role, resume.id)
    payload["job_id"] = "     "

    resp = client.post("/api/v1/submissions", json=payload, headers=headers)
    assert resp.status_code == 422


def test_submission_rejected_when_role_missing_or_invalid(client: TestClient, db_session: Session):
    """TEST 4 & 5: Role missing or invalid -> rejected."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)
    headers["Idempotency-Key"] = str(uuid.uuid4())

    # Role missing
    payload1 = get_base_payload(role, resume.id)
    del payload1["role_id"]
    resp1 = client.post("/api/v1/submissions", json=payload1, headers=headers)
    assert resp1.status_code == 422

    # Non-existent role
    payload2 = get_base_payload(role, resume.id)
    payload2["role_id"] = str(uuid.uuid4())
    headers["Idempotency-Key"] = str(uuid.uuid4())
    resp2 = client.post("/api/v1/submissions", json=payload2, headers=headers)
    assert resp2.status_code == 400


def test_submission_rejected_when_candidate_name_missing_or_whitespace(client: TestClient, db_session: Session):
    """TEST 6: Candidate name missing / whitespace -> rejected."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)

    # Empty string
    payload1 = get_base_payload(role, resume.id)
    payload1["name"] = ""
    headers["Idempotency-Key"] = str(uuid.uuid4())
    resp1 = client.post("/api/v1/submissions", json=payload1, headers=headers)
    assert resp1.status_code == 422

    # Whitespace only
    payload2 = get_base_payload(role, resume.id)
    payload2["name"] = "    "
    headers["Idempotency-Key"] = str(uuid.uuid4())
    resp2 = client.post("/api/v1/submissions", json=payload2, headers=headers)
    assert resp2.status_code == 422


def test_submission_rejected_when_email_missing_or_invalid(client: TestClient, db_session: Session):
    """TEST 7: Email missing / invalid -> rejected."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)

    # Missing email
    payload1 = get_base_payload(role, resume.id)
    del payload1["email"]
    headers["Idempotency-Key"] = str(uuid.uuid4())
    resp1 = client.post("/api/v1/submissions", json=payload1, headers=headers)
    assert resp1.status_code == 422

    # Invalid email
    payload2 = get_base_payload(role, resume.id)
    payload2["email"] = "not-an-email"
    headers["Idempotency-Key"] = str(uuid.uuid4())
    resp2 = client.post("/api/v1/submissions", json=payload2, headers=headers)
    assert resp2.status_code == 422


def test_submission_rejected_when_other_required_fields_missing(client: TestClient, db_session: Session):
    """TEST 8: Every other existing required field is mandatory."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)

    required_text_fields = [
        "current_company",
        "current_location",
        "preferred_location",
        "education",
        "about",
    ]

    for field in required_text_fields:
        payload = get_base_payload(role, resume.id)
        payload[field] = "   "
        headers["Idempotency-Key"] = str(uuid.uuid4())
        resp = client.post("/api/v1/submissions", json=payload, headers=headers)
        assert resp.status_code == 422, f"Expected 422 when {field} is whitespace, got {resp.status_code}"


def test_submission_rejected_when_resume_missing_or_ineligible(client: TestClient, db_session: Session):
    """TEST 9: Resume missing or ineligible -> rejected."""
    vendor, user, _, role, _ = setup_submission_environment(db_session)
    headers = get_vendor_header(client)

    # Ineligible Resume
    ineligible_resume = Resume(
        vendor_id=vendor.id,
        vendor_user_id=user.id,
        filename="infected.pdf",
        file_path="/tmp/mock_infected.pdf",
        file_size=1024,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="INFECTED",
        processing_state="COMPLETED",
        eligibility_state="INELIGIBLE"
    )
    db_session.add(ineligible_resume)
    db_session.commit()

    payload = get_base_payload(role, ineligible_resume.id)
    headers["Idempotency-Key"] = str(uuid.uuid4())
    resp = client.post("/api/v1/submissions", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "not eligible" in resp.json()["detail"].lower()


def test_direct_api_request_bypassing_frontend_still_rejected(client: TestClient, db_session: Session):
    """TEST 11: Direct API request bypassing frontend validation -> still rejected."""
    _, _, _, role, resume = setup_submission_environment(db_session)
    headers = get_vendor_header(client)
    headers["Idempotency-Key"] = str(uuid.uuid4())

    # Empty payload
    resp = client.post("/api/v1/submissions", json={}, headers=headers)
    assert resp.status_code == 422
