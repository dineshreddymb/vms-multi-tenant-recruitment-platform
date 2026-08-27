import io
import uuid
from decimal import Decimal
import pytest
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
    Resume,
    VendorUserMembership
)
from backend.auth import hash_password

def get_auth_header(client: TestClient, email: str, password: str = "Password123!", is_vendor: bool = False):
    endpoint = "/api/v1/auth/vendor/login" if is_vendor else "/api/v1/auth/recruiter/login"
    resp = client.post(endpoint, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.json()}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def setup_environment(db: Session):
    # 1. Departments
    dept_ai = db.query(Department).filter(Department.name == "AI Dept For Test").first()
    if not dept_ai:
        dept_ai = Department(name="AI Dept For Test", status="ACTIVE")
        db.add(dept_ai)
        db.flush()

    dept_inactive = db.query(Department).filter(Department.name == "Inactive Dept For Test").first()
    if not dept_inactive:
        dept_inactive = Department(name="Inactive Dept For Test", status="INACTIVE")
        db.add(dept_inactive)
        db.flush()

    # 2. Recruiter
    recruiter = db.query(InternalUser).filter(InternalUser.email == "recruiter_jobid_test@corp.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="recruiter_jobid_test@corp.com",
            password_hash=hash_password("Password123!"),
            name="Recruiter JobID Test",
            mobile="+919876543210",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()
    else:
        recruiter.status = "ACTIVE"
        recruiter.password_hash = hash_password("Password123!")

    # 3. Vendor & Vendor User
    v_clean = "job id test vendor corp"
    vendor = db.query(Vendor).filter(Vendor.normalized_name == v_clean).first()
    if not vendor:
        vendor = Vendor(name="Job ID Test Vendor Corp", normalized_name=v_clean)
        db.add(vendor)
        db.flush()

    v_user = db.query(VendorUser).filter(VendorUser.email == "vendor_jobid_test@corp.com").first()
    if not v_user:
        v_user = VendorUser(
            vendor_id=vendor.id,
            email="vendor_jobid_test@corp.com",
            password_hash=hash_password("Password123!"),
            name="Vendor User JobID",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(v_user)
        db.flush()
    else:
        v_user.status = "ACTIVE"
        v_user.password_hash = hash_password("Password123!")

    mem = db.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == v_user.id,
        VendorUserMembership.vendor_id == vendor.id
    ).first()
    if not mem:
        mem = VendorUserMembership(vendor_user_id=v_user.id, vendor_id=vendor.id, status="ACTIVE")
        db.add(mem)
    else:
        mem.status = "ACTIVE"

    db.commit()
    return dept_ai, dept_inactive, recruiter, vendor, v_user


def test_recruiter_create_role_job_id_validations(client: TestClient, db_session: Session):
    dept_ai, _, recruiter, vendor, _ = setup_environment(db_session)
    rec_headers = get_auth_header(client, "recruiter_jobid_test@corp.com")

    # 1. Create job without Job ID -> FAIL (400)
    resp_no_job_id = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": "AI Engineer Test 1", "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_no_job_id.status_code == 400
    assert "Job ID: This field is required." in resp_no_job_id.json()["detail"]

    # 2. Create job with whitespace Job ID -> FAIL (400)
    resp_ws_job_id = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": "AI Engineer Test 2", "job_id": "   ", "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_ws_job_id.status_code == 400
    assert "Job ID: This field is required." in resp_ws_job_id.json()["detail"]

    # 3. Create job with valid Job ID -> PASS (201)
    unique_job_id = f"JOB-TEST-{uuid.uuid4().hex[:6].upper()}"
    resp_valid = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": "AI Research Scientist", "job_id": f"  {unique_job_id}  ", "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_valid.status_code == 201
    valid_data = resp_valid.json()
    assert valid_data["job_id"] == unique_job_id
    assert valid_data["title"] == "AI Research Scientist"

    # 4. Duplicate Job ID -> FAIL (409 Conflict)
    resp_dup = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": "Different Title", "job_id": unique_job_id, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_dup.status_code == 409
    assert "Job ID: A job role with this Job ID already exists." in resp_dup.json()["detail"]

    # 5. Case-insensitive duplicate Job ID -> FAIL (409 Conflict)
    resp_dup_ci = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": "Another Title", "job_id": unique_job_id.lower(), "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_dup_ci.status_code == 409


def test_vendor_active_roles_returns_job_id(client: TestClient, db_session: Session):
    dept_ai, _, recruiter, vendor, v_user = setup_environment(db_session)
    rec_headers = get_auth_header(client, "recruiter_jobid_test@corp.com")
    vendor_headers = get_auth_header(client, "vendor_jobid_test@corp.com", is_vendor=True)

    job_id = f"JOB-VEND-{uuid.uuid4().hex[:6].upper()}"
    resp_create = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"NLP Specialist {uuid.uuid4().hex[:4]}", "job_id": job_id, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_create.status_code == 201
    role_id = resp_create.json()["id"]

    # Test /api/v1/job-roles (scoped by department)
    resp_roles = client.get(f"/api/v1/job-roles?department_id={dept_ai.id}", headers=vendor_headers)
    assert resp_roles.status_code == 200
    roles_list = resp_roles.json()
    matched = next((r for r in roles_list if r["id"] == role_id), None)
    assert matched is not None
    assert matched["job_id"] == job_id

    # Test /api/v1/vendor/job-roles
    resp_vendor_roles = client.get("/api/v1/vendor/job-roles", headers=vendor_headers)
    assert resp_vendor_roles.status_code == 200
    matched_v = next((r for r in resp_vendor_roles.json() if r["id"] == role_id), None)
    assert matched_v is not None
    assert matched_v["job_id"] == job_id


def test_vendor_candidate_submission_job_id_binding(client: TestClient, db_session: Session):
    dept_ai, dept_inactive, recruiter, vendor, v_user = setup_environment(db_session)
    rec_headers = get_auth_header(client, "recruiter_jobid_test@corp.com")
    vendor_headers = get_auth_header(client, "vendor_jobid_test@corp.com", is_vendor=True)

    # Create Role A
    job_id_a = f"JOB-ROLE-A-{uuid.uuid4().hex[:4].upper()}"
    role_a_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"Role A {uuid.uuid4().hex[:4]}", "job_id": job_id_a, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    role_a_id = role_a_resp.json()["id"]

    # Create Role B
    job_id_b = f"JOB-ROLE-B-{uuid.uuid4().hex[:4].upper()}"
    role_b_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"Role B {uuid.uuid4().hex[:4]}", "job_id": job_id_b, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    role_b_id = role_b_resp.json()["id"]

    # Create an Inactive Role
    job_id_inact = f"JOB-ROLE-INACT-{uuid.uuid4().hex[:4].upper()}"
    role_inact_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"Inactive Role {uuid.uuid4().hex[:4]}", "job_id": job_id_inact, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    role_inact_id = role_inact_resp.json()["id"]
    # Deactivate it
    client.post(f"/api/v1/recruiter/job-roles/{role_inact_id}/deactivate", headers=rec_headers)

    # Create eligible resume for vendor
    resume = Resume(
        vendor_id=vendor.id,
        vendor_user_id=v_user.id,
        filename="candidate_cv.pdf",
        file_path="/tmp/mock_cv.pdf",
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
    resume_id = resume.id

    # Helper base payload generator
    def build_payload(role_id, submitted_job_id, pan_num):
        return {
            "department_id": str(dept_ai.id),
            "role_id": str(role_id),
            "job_id": submitted_job_id,
            "cv_sent_date": "2026-08-18",
            "employment_mode": "Perm",
            "name": "Candidate Valid",
            "email": f"cand_{uuid.uuid4().hex[:6]}@example.com",
            "contact_number": "9876543210",
            "current_company": "Tech Corp",
            "total_experience": 5.0,
            "relevant_experience": 4.0,
            "notice_period": "30",
            "ctc": 12.0,
            "ectc": 16.0,
            "current_location": "Bangalore",
            "preferred_location": "Hyderabad",
            "pan": pan_num,
            "linkedin_url": "https://linkedin.com/in/candidate",
            "education": "B.Tech Computer Science",
            "about": "Experienced AI software engineer.",
            "resume_id": str(resume_id)
        }

    # 1. Vendor submits wrong / invented Job ID -> FAIL (400)
    resp_wrong_job_id = client.post(
        "/api/v1/submissions",
        json=build_payload(role_a_id, "JOB-99999", "ABCDE1234F"),
        headers={**vendor_headers, "Idempotency-Key": str(uuid.uuid4())}
    )
    assert resp_wrong_job_id.status_code == 400
    assert "Job ID does not belong to the selected job role." in resp_wrong_job_id.json()["detail"]

    # 2. Vendor submits Role A with Role B's Job ID -> FAIL (400)
    resp_mismatch_job_id = client.post(
        "/api/v1/submissions",
        json=build_payload(role_a_id, job_id_b, "ABCDE1234G"),
        headers={**vendor_headers, "Idempotency-Key": str(uuid.uuid4())}
    )
    assert resp_mismatch_job_id.status_code == 400
    assert "Job ID does not belong to the selected job role." in resp_mismatch_job_id.json()["detail"]

    # 3. Vendor submits candidate to Inactive Role -> FAIL (400)
    resp_inactive_role = client.post(
        "/api/v1/submissions",
        json=build_payload(role_inact_id, job_id_inact, "ABCDE1234H"),
        headers={**vendor_headers, "Idempotency-Key": str(uuid.uuid4())}
    )
    assert resp_inactive_role.status_code == 400
    assert "This job is no longer active." in resp_inactive_role.json()["detail"]

    # 4. Vendor submits matching Role A + Role A's Job ID -> PASS (201)
    import random, string
    rand_digits = "".join(random.choices(string.digits, k=4))
    pan_success = f"ABCDE{rand_digits}K"
    idemp_key = str(uuid.uuid4())
    resp_success = client.post(
        "/api/v1/submissions",
        json=build_payload(role_a_id, job_id_a, pan_success),
        headers={**vendor_headers, "Idempotency-Key": idemp_key}
    )
    assert resp_success.status_code == 201
    sub_data = resp_success.json()
    assert sub_data["job_id"] == job_id_a
    assert sub_data["status"] == "SUBMITTED"

    # 5. Verify database persistence and consistency
    sub_record = db_session.query(Submission).filter(Submission.id == sub_data["id"]).first()
    assert sub_record is not None
    assert sub_record.job_id == job_id_a
    assert str(sub_record.role_id) == str(role_a_id)


def test_recruiter_candidates_list_and_search_by_job_id(client: TestClient, db_session: Session):
    """
    Tests:
    1. Multiple candidates submitted against same Job ID.
    2. Recruiter candidates list endpoint returns exact job_id for each candidate.
    3. Historical records with NULL job_id handled safely.
    4. Server-side search by Job ID filters matching candidates.
    5. Detail endpoint returns job_id.
    """
    dept_ai, _, recruiter, vendor, v_user = setup_environment(db_session)
    rec_headers = get_auth_header(client, "recruiter_jobid_test@corp.com")
    vendor_headers = get_auth_header(client, "vendor_jobid_test@corp.com", is_vendor=True)

    # 1. Create Role 1 and Role 2
    shared_job_id = f"JOB-SHARED-{uuid.uuid4().hex[:4].upper()}"
    other_job_id = f"JOB-OTHER-{uuid.uuid4().hex[:4].upper()}"

    role_1_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"Shared Role {uuid.uuid4().hex[:4]}", "job_id": shared_job_id, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    role_1_id = role_1_resp.json()["id"]

    role_2_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"Other Role {uuid.uuid4().hex[:4]}", "job_id": other_job_id, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    role_2_id = role_2_resp.json()["id"]

    # 2. Create eligible resumes
    res1 = Resume(
        vendor_id=vendor.id, vendor_user_id=v_user.id, filename="cv1.pdf",
        file_path="/tmp/cv1.pdf", file_size=1024, content_type="application/pdf",
        upload_state="COMPLETED", validation_state="VALID", malware_scan_state="CLEAN",
        processing_state="COMPLETED", eligibility_state="ELIGIBLE"
    )
    res2 = Resume(
        vendor_id=vendor.id, vendor_user_id=v_user.id, filename="cv2.pdf",
        file_path="/tmp/cv2.pdf", file_size=1024, content_type="application/pdf",
        upload_state="COMPLETED", validation_state="VALID", malware_scan_state="CLEAN",
        processing_state="COMPLETED", eligibility_state="ELIGIBLE"
    )
    res3 = Resume(
        vendor_id=vendor.id, vendor_user_id=v_user.id, filename="cv3.pdf",
        file_path="/tmp/cv3.pdf", file_size=1024, content_type="application/pdf",
        upload_state="COMPLETED", validation_state="VALID", malware_scan_state="CLEAN",
        processing_state="COMPLETED", eligibility_state="ELIGIBLE"
    )
    db_session.add_all([res1, res2, res3])
    db_session.commit()

    import random, string

    def make_pan():
        digits = "".join(random.choices(string.digits, k=4))
        return f"ABCDE{digits}X"

    def submit_cand(role_id, jid, res_id, name):
        p = {
            "department_id": str(dept_ai.id),
            "role_id": str(role_id),
            "job_id": jid,
            "cv_sent_date": "2026-08-18",
            "employment_mode": "Perm",
            "name": name,
            "email": f"cand_{uuid.uuid4().hex[:6]}@corp.com",
            "contact_number": "9876543210",
            "current_company": "Comp Corp",
            "total_experience": 4.0,
            "relevant_experience": 3.0,
            "notice_period": "30",
            "ctc": 10.0,
            "ectc": 14.0,
            "current_location": "Bangalore",
            "preferred_location": "Hyderabad",
            "pan": make_pan(),
            "linkedin_url": "https://linkedin.com/in/c",
            "education": "B.Tech",
            "about": "Bio",
            "resume_id": str(res_id)
        }
        r = client.post("/api/v1/submissions", json=p, headers={**vendor_headers, "Idempotency-Key": str(uuid.uuid4())})
        assert r.status_code == 201, f"Failed to submit: {r.json()}"
        return r.json()["id"]

    # Submit Candidate 1 and Candidate 2 against the SAME shared_job_id
    sub1_id = submit_cand(role_1_id, shared_job_id, res1.id, "Candidate One")
    sub2_id = submit_cand(role_1_id, shared_job_id, res2.id, "Candidate Two")

    # Submit Candidate 3 against other_job_id
    sub3_id = submit_cand(role_2_id, other_job_id, res3.id, "Candidate Three")

    # 3. Seed historical submission with NULL job_id
    from db.crypto import get_pan_fingerprint, encrypt_pan
    hist_pan = make_pan()
    hist_cand = Candidate(
        name="Historical Candidate", email="hist@corp.com", contact_number="9876543210",
        current_company="Old Corp", total_experience=Decimal("5"), relevant_experience=Decimal("4"),
        notice_period="30", ctc=Decimal("10"), ectc=Decimal("15"), current_location="Pune",
        preferred_location="Pune", pan_fingerprint=get_pan_fingerprint(hist_pan),
        pan_encrypted=encrypt_pan(hist_pan), linkedin_url="https://linkedin.com/in/hist",
        education="BE", about="Historical"
    )
    db_session.add(hist_cand)
    db_session.flush()
    hist_sub = Submission(
        candidate_id=hist_cand.id, submission_reference="SUB-20260517-8899", vendor_id=vendor.id, vendor_user_id=v_user.id,
        role_id=role_1_id, job_id=None, status="SUBMITTED", employment_mode="Perm"
    )
    db_session.add(hist_sub)
    db_session.commit()

    # 4. Call Recruiter Candidates List API
    resp_list = client.get("/api/v1/recruiter/candidates", headers=rec_headers)
    assert resp_list.status_code == 200
    items = resp_list.json()["items"]

    # Find items in response
    item1 = next((i for i in items if i["id"] == str(sub1_id)), None)
    item2 = next((i for i in items if i["id"] == str(sub2_id)), None)
    item3 = next((i for i in items if i["id"] == str(sub3_id)), None)
    item_hist = next((i for i in items if i["id"] == str(hist_sub.id)), None)

    assert item1 is not None
    assert item1["job_id"] == shared_job_id
    assert item1["candidate"]["name"] == "Candidate One"

    assert item2 is not None
    assert item2["job_id"] == shared_job_id
    assert item2["candidate"]["name"] == "Candidate Two"

    assert item3 is not None
    assert item3["job_id"] == other_job_id

    assert item_hist is not None
    assert item_hist["job_id"] is None

    # 5. Search candidates by Job ID
    resp_search = client.get(
        f"/api/v1/recruiter/candidates?search_column=job_id&search_query={shared_job_id}",
        headers=rec_headers
    )
    assert resp_search.status_code == 200
    search_items = resp_search.json()["items"]
    search_ids = [i["id"] for i in search_items]

    assert str(sub1_id) in search_ids
    assert str(sub2_id) in search_ids
    assert str(sub3_id) not in search_ids
    assert str(hist_sub.id) not in search_ids

    # 6. Verify detail endpoint returns job_id
    detail_resp = client.get(f"/api/v1/recruiter/submissions/{sub1_id}", headers=rec_headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["job_id"] == shared_job_id
