import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from db.models import Vendor, VendorUser, JobRole, Candidate, Submission, RecruiterCompanyAccess, InternalUser, Resume
from backend.auth import hash_password

def test_tenant_isolation_recruiter_pipeline_and_checks(client: TestClient, db_session: Session):
    # 1. Retrieve seeded client companies (tenants)
    iosys = db_session.query(Vendor).filter(Vendor.normalized_name == "iosys").first()
    volantis = db_session.query(Vendor).filter(Vendor.normalized_name == "volantis").first()

    # 2. Create a vendor agency
    agency = Vendor(name="Staffing Agency", normalized_name="staffing agency")
    db_session.add(agency)
    db_session.flush()

    # 3. Create a vendor user associated with the vendor agency
    pwd_hash = hash_password("Password123!")
    vendor_user = VendorUser(
        email="vendor@agency.com",
        password_hash=pwd_hash,
        name="Vendor Agent",
        mobile="+919876543210",
        vendor_id=agency.id,
        status="ACTIVE"
    )
    db_session.add(vendor_user)
    db_session.flush()

    # 4. Query the seeded Engineering department
    from db.models import Department
    dept = db_session.query(Department).filter(Department.name == "Engineering").first()

    iosys_role = JobRole(
        department_id=dept.id,
        vendor_id=iosys.id,
        title="IOSYS Java Engineer",
        job_id="JOB-IOSYS-100",
        status="ACTIVE"
    )
    volantis_role = JobRole(
        department_id=dept.id,
        vendor_id=volantis.id,
        title="Volantis Java Engineer",
        job_id="JOB-VOL-100",
        status="ACTIVE"
    )
    db_session.add_all([iosys_role, volantis_role])
    db_session.flush()

    # 5. Create a recruiter and grant access to both companies
    recruiter = InternalUser(
        email="recruiter@corp.com",
        password_hash=pwd_hash,
        name="Recruiter One",
        mobile="+919876543211",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add(recruiter)
    db_session.flush()

    db_session.add_all([
        RecruiterCompanyAccess(recruiter_id=recruiter.id, company_id=iosys.id),
        RecruiterCompanyAccess(recruiter_id=recruiter.id, company_id=volantis.id)
    ])
    db_session.commit()

    # 6. Vendor user logs in and submits Candidate A to IOSYS
    v_login = client.post("/api/v1/auth/vendor/login", json={"email": "vendor@agency.com", "password": "Password123!"})
    assert v_login.status_code == 200
    v_headers = {"Authorization": f"Bearer {v_login.json()['access_token']}"}

    # Create eligible resume for IOSYS
    resume_a = Resume(
        vendor_id=iosys.id,
        vendor_user_id=vendor_user.id,
        filename="resume_a.pdf",
        file_path="/storage/resume_a.pdf",
        file_size=1024,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="CLEAN",
        processing_state="COMPLETED",
        eligibility_state="ELIGIBLE"
    )
    db_session.add(resume_a)
    db_session.commit()

    # Submit Candidate A to IOSYS
    payload_a = {
        "vendor_id": str(iosys.id),
        "cv_sent_date": "2026-08-30",
        "employment_mode": "Perm",
        "role_id": str(iosys_role.id),
        "job_id": iosys_role.job_id,
        "name": "Candidate A",
        "email": "cand_a@test.com",
        "contact_number": "+919876543212",
        "current_company": "Old Co",
        "total_experience": 5.0,
        "relevant_experience": 4.0,
        "notice_period": "30",
        "ctc": 12.0,
        "ectc": 15.0,
        "current_location": "Delhi",
        "preferred_location": "Noida",
        "pan": "ABCDE1234Z",
        "linkedin_url": "https://linkedin.com/in/canda",
        "education": "B.Tech",
        "about": "Resume bio",
        "resume_id": str(resume_a.id)
    }
    
    sub_resp_a = client.post(
        "/api/v1/submissions",
        headers={"Authorization": f"Bearer {v_login.json()['access_token']}", "Idempotency-Key": str(uuid.uuid4())},
        json=payload_a
    )
    assert sub_resp_a.status_code == 201
    sub_id_a = sub_resp_a.json()["id"]

    # 7. Recruiter logs in to IOSYS context
    r_login_iosys = client.post("/api/v1/auth/recruiter/login", json={
        "email": "recruiter@corp.com",
        "password": "Password123!",
        "company_id": str(iosys.id)
    })
    assert r_login_iosys.status_code == 200
    r_headers_iosys = {"Authorization": f"Bearer {r_login_iosys.json()['access_token']}"}

    # Recruiter checks IOSYS candidates list -> Candidate A is visible
    cand_iosys = client.get("/api/v1/recruiter/candidates", headers=r_headers_iosys)
    assert cand_iosys.status_code == 200
    items_iosys = cand_iosys.json()["items"]
    assert len(items_iosys) == 1
    assert items_iosys[0]["id"] == sub_id_a
    assert items_iosys[0]["vendor_name"] == "IOSYS"

    # 8. Recruiter logs in to VOLANTIS context
    r_login_vol = client.post("/api/v1/auth/recruiter/login", json={
        "email": "recruiter@corp.com",
        "password": "Password123!",
        "company_id": str(volantis.id)
    })
    assert r_login_vol.status_code == 200
    r_headers_vol = {"Authorization": f"Bearer {r_login_vol.json()['access_token']}"}

    # Recruiter checks VOLANTIS candidates list -> Candidate A must NOT be visible!
    cand_vol = client.get("/api/v1/recruiter/candidates", headers=r_headers_vol)
    assert cand_vol.status_code == 200
    items_vol = cand_vol.json()["items"]
    assert len(items_vol) == 0

    # 9. Tenant-Forgery protection check:
    # Attempting to fetch VOLANTIS candidates list while authenticated as IOSYS recruiter
    # passing vendor_id=VOLANTIS_ID should result in 403 Forbidden!
    forgery_resp = client.get(f"/api/v1/recruiter/candidates?vendor_id={volantis.id}", headers=r_headers_iosys)
    assert forgery_resp.status_code == 403

    # Reverse: VOLANTIS recruiter trying to access IOSYS data
    forgery_resp_rev = client.get(f"/api/v1/recruiter/candidates?vendor_id={iosys.id}", headers=r_headers_vol)
    assert forgery_resp_rev.status_code == 403

    # 10. Same-Candidate Cross-Tenant & PAN Isolation validation:
    # Submit the SAME Candidate A (same PAN ABCDE1234Z) under VOLANTIS within the 90 days.
    # On the Volantis side, PAN policy check should pass (no active Volantis submission).
    pan_check_vol = client.post(
        "/api/v1/pan/check",
        headers={"Authorization": f"Bearer {v_login.json()['access_token']}"},
        json={"pan": "ABCDE1234Z", "role_id": str(volantis_role.id)}
    )
    assert pan_check_vol.status_code == 200
    assert pan_check_vol.json()["can_submit"] is True  # Should NOT be blocked!

    # Submit Candidate A to Volantis
    resume_b = Resume(
        vendor_id=volantis.id,
        vendor_user_id=vendor_user.id,
        filename="resume_b.pdf",
        file_path="/storage/resume_b.pdf",
        file_size=1024,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="CLEAN",
        processing_state="COMPLETED",
        eligibility_state="ELIGIBLE"
    )
    db_session.add(resume_b)
    db_session.commit()

    payload_b = payload_a.copy()
    payload_b["vendor_id"] = str(volantis.id)
    payload_b["role_id"] = str(volantis_role.id)
    payload_b["job_id"] = volantis_role.job_id
    payload_b["resume_id"] = str(resume_b.id)
    payload_b["name"] = "Candidate A (Volantis Edition)"

    sub_resp_b = client.post(
        "/api/v1/submissions",
        headers={"Authorization": f"Bearer {v_login.json()['access_token']}", "Idempotency-Key": str(uuid.uuid4())},
        json=payload_b
    )
    assert sub_resp_b.status_code == 201
    sub_id_b = sub_resp_b.json()["id"]

    # Verify that the two submissions remain isolated in the Candidates Pipeline API response
    cand_iosys_after = client.get("/api/v1/recruiter/candidates", headers=r_headers_iosys)
    items_iosys_after = cand_iosys_after.json()["items"]
    assert len(items_iosys_after) == 1
    assert items_iosys_after[0]["id"] == sub_id_a
    assert items_iosys_after[0]["vendor_name"] == "IOSYS"

    cand_vol_after = client.get("/api/v1/recruiter/candidates", headers=r_headers_vol)
    items_vol_after = cand_vol_after.json()["items"]
    assert len(items_vol_after) == 1
    assert items_vol_after[0]["id"] == sub_id_b
    assert items_vol_after[0]["vendor_name"] == "Volantis"
