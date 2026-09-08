import io
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import (
    InternalUser,
    Vendor,
    VendorUser,
    Department,
    JobRole,
    RecruiterCompanyAccess
)
from backend.auth import hash_password

def get_auth_header(client: TestClient, email: str, password: str = "Password123!", is_vendor: bool = False):
    endpoint = "/api/v1/auth/vendor/login" if is_vendor else "/api/v1/auth/recruiter/login"
    resp = client.post(endpoint, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.json()}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def setup_dynamic_fixtures(db: Session):
    recruiter = db.query(InternalUser).filter(InternalUser.email == "recruiter_dynamic@corp.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="recruiter_dynamic@corp.com",
            password_hash=hash_password("Password123!"),
            name="Recruiter Dynamic",
            mobile="+919876543210",
            role="RECRUITER",
            access_level="STANDARD",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()

    v_clean = "dynamic vendor corp"
    vendor = db.query(Vendor).filter(Vendor.normalized_name == v_clean).first()
    if not vendor:
        vendor = Vendor(name="Dynamic Vendor Corp", normalized_name=v_clean)
        db.add(vendor)
        db.flush()

    vendor_user = db.query(VendorUser).filter(VendorUser.email == "vendor_dynamic@corp.com").first()
    if not vendor_user:
        vendor_user = VendorUser(
            vendor_id=vendor.id,
            email="vendor_dynamic@corp.com",
            password_hash=hash_password("Password123!"),
            name="Vendor Dynamic User",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(vendor_user)
        db.flush()

    acc = db.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == recruiter.id,
        RecruiterCompanyAccess.company_id == vendor.id
    ).first()
    if not acc:
        db.add(RecruiterCompanyAccess(recruiter_id=recruiter.id, company_id=vendor.id, status="APPROVED"))

    db.commit()
    return recruiter, vendor, vendor_user


def test_recruiter_create_department_and_duplicate_prevention(client: TestClient, db_session: Session):
    recruiter, vendor, vendor_user = setup_dynamic_fixtures(db_session)
    rec_headers = get_auth_header(client, "recruiter_dynamic@corp.com")
    vendor_headers = get_auth_header(client, "vendor_dynamic@corp.com", is_vendor=True)

    dept_name = f"Artificial Intelligence {uuid.uuid4().hex[:6]}"

    # 1. Recruiter creates department
    resp = client.post(
        "/api/v1/recruiter/departments",
        json={"name": dept_name},
        headers=rec_headers
    )
    assert resp.status_code == 201
    created_dept = resp.json()
    assert created_dept["name"] == dept_name
    assert created_dept["status"] == "ACTIVE"
    dept_id = created_dept["id"]

    # 2. Duplicate department creation rejected case-insensitively
    dup_resp_1 = client.post(
        "/api/v1/recruiter/departments",
        json={"name": dept_name.lower()},
        headers=rec_headers
    )
    assert dup_resp_1.status_code == 409
    assert "A department with this name already exists" in dup_resp_1.json()["detail"]

    dup_resp_2 = client.post(
        "/api/v1/recruiter/departments",
        json={"name": f"  {dept_name.upper()}  "},
        headers=rec_headers
    )
    assert dup_resp_2.status_code == 409

    # 3. Vendor cannot create department (403 Forbidden)
    v_resp = client.post(
        "/api/v1/recruiter/departments",
        json={"name": f"Vendor Dept {uuid.uuid4().hex[:6]}"},
        headers=vendor_headers
    )
    assert v_resp.status_code == 403

    # 4. Unauthenticated user cannot create department (401 Unauthorized)
    unauth_resp = client.post(
        "/api/v1/recruiter/departments",
        json={"name": f"Anon Dept {uuid.uuid4().hex[:6]}"}
    )
    assert unauth_resp.status_code == 401

    # 5. Department is returned in both list endpoints
    list_rec = client.get("/api/v1/recruiter/departments", headers=rec_headers).json()
    assert any(d["id"] == dept_id for d in list_rec)

    list_ven = client.get("/api/v1/departments", headers=vendor_headers).json()
    assert not any(d["id"] == dept_id for d in list_ven)


def test_recruiter_job_role_options_and_creation(client: TestClient, db_session: Session):
    recruiter, vendor, vendor_user = setup_dynamic_fixtures(db_session)
    rec_headers = get_auth_header(client, "recruiter_dynamic@corp.com")
    vendor_headers = get_auth_header(client, "vendor_dynamic@corp.com", is_vendor=True)

    # 1. Create a fresh department
    dept_name = f"Robotics Research {uuid.uuid4().hex[:6]}"
    dept_resp = client.post(
        "/api/v1/recruiter/departments",
        json={"name": dept_name},
        headers=rec_headers
    )
    assert dept_resp.status_code == 201
    dept_id = dept_resp.json()["id"]

    # 2. Recruiter creates job role with JD
    role_title = f"Autonomous Systems Architect {uuid.uuid4().hex[:6]}"
    job_id_dyn = f"JOB-ROB-{uuid.uuid4().hex[:6].upper()}"
    pdf_bytes = b"%PDF-1.4 sample JD document content %%EOF"
    files = {"file": ("Robotics_JD.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    role_resp = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": dept_id, "title": role_title, "job_id": job_id_dyn, "vendor_id": str(vendor.id)},
        files=files,
        headers=rec_headers
    )
    assert role_resp.status_code == 201
    role_data = role_resp.json()
    assert role_data["title"] == role_title
    assert role_data["job_id"] == job_id_dyn
    assert role_data["has_jd"] is True
    role_id = role_data["id"]

    # 3. Duplicate role in same department rejected case-insensitively
    dup_role_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": dept_id, "title": f"  {role_title.lower()}  ", "job_id": f"JOB-DUP-{uuid.uuid4().hex[:6]}", "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert dup_role_resp.status_code == 409
    assert "A job role with this title already exists in this department" in dup_role_resp.json()["detail"]

    # 4. Job role title options list includes newly created title
    options_resp = client.get("/api/v1/recruiter/job-role-options", headers=rec_headers)
    assert options_resp.status_code == 200
    options = options_resp.json()
    assert role_title in options

    # 5. Vendor sees newly created department and active role in Active Job Roles API
    v_roles_resp = client.get("/api/v1/vendor/job-roles", headers=vendor_headers)
    assert v_roles_resp.status_code == 200
    v_roles = v_roles_resp.json()
    matched = next((r for r in v_roles if r["id"] == role_id), None)
    assert matched is not None
    assert matched["title"] == role_title
    assert matched["department"] == dept_name
    assert matched["has_jd"] is True
    assert matched["jd_filename"] == "Robotics_JD.pdf"

    # 6. Vendor can view & download JD
    v_view = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd", headers=vendor_headers)
    assert v_view.status_code == 200
    assert v_view.content == pdf_bytes

    v_dl = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd?download=true", headers=vendor_headers)
    assert v_dl.status_code == 200
    assert v_dl.content == pdf_bytes


def test_recruiter_create_job_role_with_manual_department_name(client: TestClient, db_session: Session):
    recruiter, vendor, vendor_user = setup_dynamic_fixtures(db_session)
    rec_headers = get_auth_header(client, "recruiter_dynamic@corp.com")

    # 1. Create a job role by sending a manual department name string
    manual_dept_name = f"Manual Robotics {uuid.uuid4().hex[:6]}"
    role_title = f"Manual robotics scientist {uuid.uuid4().hex[:6]}"
    job_id = f"JOB-MAN-{uuid.uuid4().hex[:6].upper()}"

    role_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": manual_dept_name, "title": role_title, "job_id": job_id, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert role_resp.status_code == 201
    role_data = role_resp.json()
    assert role_data["title"] == role_title
    assert role_data["job_id"] == job_id

    # 2. Verify that the department was created in the database and has ACTIVE status
    created_dept = db_session.query(Department).filter(Department.name == manual_dept_name).first()
    assert created_dept is not None
    assert created_dept.status == "ACTIVE"
    assert str(created_dept.id) == role_data["department_id"]

    # 3. Create another job role in the same department (reusing it case-insensitively)
    role_title_2 = f"Manual robotics developer {uuid.uuid4().hex[:6]}"
    job_id_2 = f"JOB-MAN-{uuid.uuid4().hex[:6].upper()}"

    role_resp_2 = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": manual_dept_name.lower(), "title": role_title_2, "job_id": job_id_2, "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert role_resp_2.status_code == 201
    role_data_2 = role_resp_2.json()
    assert role_data_2["department_id"] == str(created_dept.id)


def test_vendor_submit_department_filtering(client: TestClient, db_session: Session):
    recruiter, vendor, vendor_user = setup_dynamic_fixtures(db_session)
    rec_headers = get_auth_header(client, "recruiter_dynamic@corp.com")
    vendor_headers = get_auth_header(client, "vendor_dynamic@corp.com", is_vendor=True)

    # 1. Create two fresh departments
    dept_with_jobs = f"Dept With Jobs {uuid.uuid4().hex[:6]}"
    dept_without_jobs = f"Dept Without Jobs {uuid.uuid4().hex[:6]}"

    d1_resp = client.post("/api/v1/recruiter/departments", json={"name": dept_with_jobs}, headers=rec_headers)
    assert d1_resp.status_code == 201
    d1_id = d1_resp.json()["id"]

    d2_resp = client.post("/api/v1/recruiter/departments", json={"name": dept_without_jobs}, headers=rec_headers)
    assert d2_resp.status_code == 201
    d2_id = d2_resp.json()["id"]

    # 2. Verify both appear in recruiter departments endpoint
    rec_depts = client.get("/api/v1/recruiter/departments", headers=rec_headers).json()
    assert any(d["id"] == d1_id for d in rec_depts)
    assert any(d["id"] == d2_id for d in rec_depts)

    # 3. Verify neither appears in vendor departments endpoint (since no active job roles yet)
    ven_depts = client.get("/api/v1/departments", headers=vendor_headers).json()
    assert not any(d["id"] == d1_id for d in ven_depts)
    assert not any(d["id"] == d2_id for d in ven_depts)

    # 4. Create an active job role in dept_with_jobs
    job_resp = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": d1_id, "title": f"Engineer {uuid.uuid4().hex[:6]}", "job_id": f"JOB-FILT-{uuid.uuid4().hex[:6].upper()}", "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    # 5. Verify only dept_with_jobs appears in vendor departments endpoint now
    ven_depts_after = client.get("/api/v1/departments", headers=vendor_headers).json()
    assert any(d["id"] == d1_id for d in ven_depts_after)
    assert not any(d["id"] == d2_id for d in ven_depts_after)

    # 6. Deactivate the job role
    deact_resp = client.post(f"/api/v1/recruiter/job-roles/{job_id}/deactivate", headers=rec_headers)
    assert deact_resp.status_code == 200

    # 7. Verify it is hidden again
    ven_depts_after_deact = client.get("/api/v1/departments", headers=vendor_headers).json()
    assert not any(d["id"] == d1_id for d in ven_depts_after_deact)


