import pytest
import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, aliased
from db.models import Resume, Candidate, Submission, Vendor, RecruiterCompanyAccess, JobRole, InternalUser, Department, VendorUser, VendorUserMembership
from backend.auth import hash_password

def get_auth_header(client: TestClient, email: str, password: str = "Password123!", is_vendor: bool = False):
    endpoint = "/api/v1/auth/vendor/login" if is_vendor else "/api/v1/auth/recruiter/login"
    resp = client.post(endpoint, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.json()}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def setup_environment(db: Session):
    dept_ai = db.query(Department).filter(Department.name == "AI Dept For Test").first()
    if not dept_ai:
        dept_ai = Department(name="AI Dept For Test", status="ACTIVE")
        db.add(dept_ai)
        db.flush()

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

    mem = db.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == v_user.id,
        VendorUserMembership.vendor_id == vendor.id
    ).first()
    if not mem:
        mem = VendorUserMembership(vendor_user_id=v_user.id, vendor_id=vendor.id, status="ACTIVE")
        db.add(mem)
        db.flush()

    db.commit()
    return dept_ai, recruiter, vendor, v_user

def test_debug_query(client: TestClient, db_session: Session):
    dept_ai, recruiter, vendor, v_user = setup_environment(db_session)
    rec_headers = get_auth_header(client, "recruiter_jobid_test@corp.com")
    vendor_headers = get_auth_header(client, "vendor_jobid_test@corp.com", is_vendor=True)

    # 1. Create Role 1
    shared_job_id = f"JOB-SHARED-{uuid.uuid4().hex[:4].upper()}"
    role_1_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept_ai.id), "title": f"Shared Role {uuid.uuid4().hex[:4]}", "job_id": shared_job_id, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    role_1_id = role_1_resp.json()["id"]

    res1 = Resume(
        vendor_id=vendor.id, vendor_user_id=v_user.id, filename="cv1.pdf",
        file_path="/tmp/cv1.pdf", file_size=1024, content_type="application/pdf",
        upload_state="COMPLETED", validation_state="VALID", malware_scan_state="CLEAN",
        processing_state="COMPLETED", eligibility_state="ELIGIBLE"
    )
    db_session.add(res1)
    db_session.commit()

    # Submit
    p = {
        "department_id": str(dept_ai.id),
        "role_id": str(role_1_id),
        "job_id": shared_job_id,
        "cv_sent_date": "2026-08-18",
        "employment_mode": "Perm",
        "name": "Candidate One",
        "email": f"cand_1@corp.com",
        "contact_number": "9876543210",
        "current_company": "Comp Corp",
        "total_experience": 4.0,
        "relevant_experience": 3.0,
        "notice_period": "30",
        "ctc": 10.0,
        "ectc": 14.0,
        "current_location": "Bangalore",
        "preferred_location": "Hyderabad",
        "pan": "ABCDE1234K",
        "linkedin_url": "https://linkedin.com/in/c",
        "education": "B.Tech",
        "about": "Bio",
        "resume_id": str(res1.id)
    }
    r = client.post("/api/v1/submissions", json=p, headers={**vendor_headers, "Idempotency-Key": str(uuid.uuid4())})
    sub_id = r.json()["id"]

    print("\n--- DB STATE ---")
    print("VENDORS:")
    for v in db_session.query(Vendor).all():
        print(f"  id={v.id}, name={v.name}")
    print("JOB ROLES:")
    for jr in db_session.query(JobRole).all():
        print(f"  id={jr.id}, title={jr.title}, job_id={jr.job_id}, vendor_id={jr.vendor_id}")
    print("SUBMISSIONS:")
    for s in db_session.query(Submission).all():
        print(f"  id={s.id}, candidate_id={s.candidate_id}, vendor_id={s.vendor_id}, role_id={s.role_id}, job_id={s.job_id}")
    
    # Query with SQLAlchemy directly
    SubmittingVendor = aliased(Vendor, name="submitting_vendor")
    q = (
        db_session.query(Submission)
        .join(Candidate)
        .join(JobRole)
        .join(Vendor)
        .outerjoin(VendorUser, Submission.vendor_user_id == VendorUser.id)
        .outerjoin(SubmittingVendor, VendorUser.vendor_id == SubmittingVendor.id)
    )
    print("DIRECT SQL QUERY ALL:", q.all())
    
    # Run API
    resp_list = client.get("/api/v1/recruiter/candidates", headers=rec_headers)
    print("API RESPONSE:", resp_list.json())
