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
    JobRole
)
from backend.auth import hash_password

def get_auth_header(client: TestClient, email: str, password: str = "Password123!", is_vendor: bool = False):
    endpoint = "/api/v1/auth/vendor/login" if is_vendor else "/api/v1/auth/recruiter/login"
    resp = client.post(endpoint, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.json()}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def create_test_setup(db: Session):
    # 1. Department
    dept = db.query(Department).filter(Department.name == "Engineering Dept").first()
    if not dept:
        dept = Department(name="Engineering Dept", status="ACTIVE")
        db.add(dept)
        db.flush()

    # 2. Recruiter
    recruiter = db.query(InternalUser).filter(InternalUser.email == "recruiter_jd@corp.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="recruiter_jd@corp.com",
            password_hash=hash_password("Password123!"),
            name="Recruiter JD",
            mobile="+919876543210",
            role="RECRUITER",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()

    # 3. Vendor
    v_clean = "jd test vendor corp"
    vendor = db.query(Vendor).filter(Vendor.normalized_name == v_clean).first()
    if not vendor:
        vendor = Vendor(name="JD Test Vendor Corp", normalized_name=v_clean)
        db.add(vendor)
        db.flush()

    user = db.query(VendorUser).filter(VendorUser.email == "vendor_jd@corp.com").first()
    if not user:
        user = VendorUser(
            vendor_id=vendor.id,
            email="vendor_jd@corp.com",
            password_hash=hash_password("Password123!"),
            name="Vendor JD User",
            mobile="+919876543210",
            status="ACTIVE"
        )
        db.add(user)
        db.flush()

    db.commit()
    return dept, recruiter, vendor, user


def test_recruiter_create_role_with_and_without_jd(client: TestClient, db_session: Session):
    dept, recruiter, vendor, user = create_test_setup(db_session)
    rec_headers = get_auth_header(client, "recruiter_jd@corp.com")
    vendor_headers = get_auth_header(client, "vendor_jd@corp.com", is_vendor=True)

    # 1. Recruiter creates role WITHOUT JD using JSON
    resp_no_jd = client.post(
        "/api/v1/recruiter/job-roles",
        json={"department_id": str(dept.id), "title": "Backend Go Developer", "job_id": "JOB-GO-001", "vendor_id": str(vendor.id)},
        headers=rec_headers
    )
    assert resp_no_jd.status_code == 201
    data_no_jd = resp_no_jd.json()
    assert data_no_jd["title"] == "Backend Go Developer"
    assert data_no_jd["job_id"] == "JOB-GO-001"
    assert data_no_jd["has_jd"] is False
    assert data_no_jd["jd_filename"] is None

    # 2. Recruiter creates role WITH valid PDF JD using multipart/form-data
    valid_pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    files = {
        "file": ("Backend_Go_JD.pdf", io.BytesIO(valid_pdf_content), "application/pdf")
    }
    data = {
        "department_id": str(dept.id),
        "title": "Cloud Architect",
        "job_id": "JOB-CLOUD-001",
        "vendor_id": str(vendor.id)
    }
    resp_with_jd = client.post(
        "/api/v1/recruiter/job-roles",
        data=data,
        files=files,
        headers=rec_headers
    )
    assert resp_with_jd.status_code == 201
    data_with_jd = resp_with_jd.json()
    assert data_with_jd["title"] == "Cloud Architect"
    assert data_with_jd["job_id"] == "JOB-CLOUD-001"
    assert data_with_jd["has_jd"] is True
    assert data_with_jd["jd_filename"] == "Backend_Go_JD.pdf"
    assert data_with_jd["jd_uploaded_at"] is not None
    cloud_role_id = data_with_jd["id"]

    # 3. Vendor cannot upload JD or create role (403 Forbidden)
    resp_unauth = client.post(
        "/api/v1/recruiter/job-roles",
        data=data,
        files=files,
        headers=vendor_headers
    )
    assert resp_unauth.status_code == 403


def test_vendor_active_job_roles_lifecycle_and_download(client: TestClient, db_session: Session):
    dept, recruiter, vendor, user = create_test_setup(db_session)
    rec_headers = get_auth_header(client, "recruiter_jd@corp.com")
    vendor_headers = get_auth_header(client, "vendor_jd@corp.com", is_vendor=True)

    # 1. Create Active Role with JD
    pdf_bytes = b"%PDF-1.4 sample JD document content %%EOF"
    files = {"file": ("AI_ML_Engineer_JD.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    create_resp = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "AI/ML Lead Specialist", "job_id": "JOB-AIML-SPEC", "vendor_id": str(vendor.id)},
        files=files,
        headers=rec_headers
    )
    assert create_resp.status_code == 201
    role_id = create_resp.json()["id"]

    # 2. Vendor lists active job roles -> should see role with has_jd=True
    v_roles_resp = client.get("/api/v1/vendor/job-roles", headers=vendor_headers)
    assert v_roles_resp.status_code == 200
    v_roles = v_roles_resp.json()
    matched = next((r for r in v_roles if r["id"] == role_id), None)
    assert matched is not None
    assert matched["title"] == "AI/ML Lead Specialist"
    assert matched["department"] == "Engineering Dept"
    assert matched["has_jd"] is True
    assert matched["jd_filename"] == "AI_ML_Engineer_JD.pdf"
    # Ensure internal file path is NOT leaked
    assert "jd_file_path" not in matched

    # 3. Vendor views JD (inline)
    view_resp = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd", headers=vendor_headers)
    assert view_resp.status_code == 200
    assert view_resp.headers["content-type"] == "application/pdf"
    assert "inline" in view_resp.headers.get("content-disposition", "")
    assert view_resp.content == pdf_bytes

    # 4. Vendor downloads JD (attachment)
    dl_resp = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd?download=true", headers=vendor_headers)
    assert dl_resp.status_code == 200
    assert "attachment" in dl_resp.headers.get("content-disposition", "")
    assert dl_resp.content == pdf_bytes

    # 5. Recruiter deactivates role -> CLOSED
    deact_resp = client.post(f"/api/v1/recruiter/job-roles/{role_id}/deactivate", headers=rec_headers)
    assert deact_resp.status_code == 200

    # 6. Vendor list active roles -> role must be ABSENT
    v_roles_after = client.get("/api/v1/vendor/job-roles", headers=vendor_headers).json()
    assert not any(r["id"] == role_id for r in v_roles_after)

    # 7. Vendor direct access to JD -> 404 Access Denied
    denied_resp = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd", headers=vendor_headers)
    assert denied_resp.status_code == 404

    # 8. Recruiter reactivates role -> ACTIVE
    react_resp = client.post(f"/api/v1/recruiter/job-roles/{role_id}/reactivate", headers=rec_headers)
    assert react_resp.status_code == 200

    # 9. Vendor list active roles -> role is back and JD is accessible again
    v_roles_react = client.get("/api/v1/vendor/job-roles", headers=vendor_headers).json()
    assert any(r["id"] == role_id for r in v_roles_react)

    restore_resp = client.get(f"/api/v1/vendor/job-roles/{role_id}/jd", headers=vendor_headers)
    assert restore_resp.status_code == 200
    assert restore_resp.content == pdf_bytes


def test_recruiter_replace_and_delete_jd(client: TestClient, db_session: Session):
    dept, recruiter, vendor, _ = create_test_setup(db_session)
    rec_headers = get_auth_header(client, "recruiter_jd@corp.com")

    # 1. Create role with initial JD
    pdf_v1 = b"%PDF-1.4 initial version %%EOF"
    files_v1 = {"file": ("JD_v1.pdf", io.BytesIO(pdf_v1), "application/pdf")}
    res_1 = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "DevOps Architect", "job_id": "JOB-DEVOPS-ARCH", "vendor_id": str(vendor.id)},
        files=files_v1,
        headers=rec_headers
    )
    assert res_1.status_code == 201
    role_id = res_1.json()["id"]
    assert res_1.json()["jd_filename"] == "JD_v1.pdf"

    # 2. Replace JD with v2
    pdf_v2 = b"%PDF-1.4 updated version %%EOF"
    files_v2 = {"file": ("JD_v2.pdf", io.BytesIO(pdf_v2), "application/pdf")}
    res_2 = client.post(
        f"/api/v1/recruiter/job-roles/{role_id}/jd",
        files=files_v2,
        headers=rec_headers
    )
    assert res_2.status_code == 200
    assert res_2.json()["jd_filename"] == "JD_v2.pdf"

    # Verify download returns v2
    dl_v2 = client.get(f"/api/v1/recruiter/job-roles/{role_id}/jd", headers=rec_headers)
    assert dl_v2.status_code == 200
    assert dl_v2.content == pdf_v2

    # 3. Delete JD
    del_res = client.delete(f"/api/v1/recruiter/job-roles/{role_id}/jd", headers=rec_headers)
    assert del_res.status_code == 200
    assert del_res.json()["has_jd"] is False
    assert del_res.json()["jd_filename"] is None

    # Verify download now returns 404
    dl_after_del = client.get(f"/api/v1/recruiter/job-roles/{role_id}/jd", headers=rec_headers)
    assert dl_after_del.status_code == 404


def test_jd_file_validation_rules(client: TestClient, db_session: Session):
    dept, _, vendor, _ = create_test_setup(db_session)
    rec_headers = get_auth_header(client, "recruiter_jd@corp.com")

    # 1. Invalid file extension (.exe) -> 400 Bad Request
    files_exe = {"file": ("malware.exe", io.BytesIO(b"MZ executable"), "application/x-dosexec")}
    resp_exe = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Security Analyst", "job_id": "JOB-SEC-01", "vendor_id": str(vendor.id)},
        files=files_exe,
        headers=rec_headers
    )
    assert resp_exe.status_code == 400
    assert "Please upload a supported file type" in resp_exe.json()["detail"]

    # 2. Corrupt PDF structure (.pdf extension but not starting with %PDF) -> 400 Bad Request
    files_fake_pdf = {"file": ("fake.pdf", io.BytesIO(b"not a real pdf"), "application/pdf")}
    resp_fake_pdf = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Security Analyst", "job_id": "JOB-SEC-02", "vendor_id": str(vendor.id)},
        files=files_fake_pdf,
        headers=rec_headers
    )
    assert resp_fake_pdf.status_code == 400
    assert "Invalid PDF file structure" in resp_fake_pdf.json()["detail"]

    # 3. Oversized file (> 10MB) -> 400 Bad Request
    big_content = b"%PDF" + b"0" * (10 * 1024 * 1024 + 1)
    files_big = {"file": ("huge.pdf", io.BytesIO(big_content), "application/pdf")}
    resp_big = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Security Analyst", "job_id": "JOB-SEC-03", "vendor_id": str(vendor.id)},
        files=files_big,
        headers=rec_headers
    )
    assert resp_big.status_code == 400
    assert "File size must not exceed" in resp_big.json()["detail"]

    # 4. Executable renamed to .doc -> 400 Bad Request (Executable prohibited & Invalid DOC structure)
    files_fake_doc = {"file": ("malware.doc", io.BytesIO(b"MZ\x90\x00executable content"), "application/msword")}
    resp_fake_doc = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Security Analyst", "job_id": "JOB-SEC-04", "vendor_id": str(vendor.id)},
        files=files_fake_doc,
        headers=rec_headers
    )
    assert resp_fake_doc.status_code == 400
    assert "Executable binary files are strictly prohibited" in resp_fake_doc.json()["detail"] or "Invalid DOC" in resp_fake_doc.json()["detail"]

    # 5. Executable renamed to .txt -> 400 Bad Request (Executable prohibited)
    files_fake_txt = {"file": ("malware.txt", io.BytesIO(b"MZ\x90\x00executable content"), "text/plain")}
    resp_fake_txt = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Security Analyst", "job_id": "JOB-SEC-05", "vendor_id": str(vendor.id)},
        files=files_fake_txt,
        headers=rec_headers
    )
    assert resp_fake_txt.status_code == 400
    assert "Executable binary files are strictly prohibited" in resp_fake_txt.json()["detail"]

    # 6. Binary file with null bytes renamed to .txt -> 400 Bad Request
    files_null_txt = {"file": ("binary.txt", io.BytesIO(b"random binary \x00\x01\x02 data"), "text/plain")}
    resp_null_txt = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Security Analyst", "job_id": "JOB-SEC-06", "vendor_id": str(vendor.id)},
        files=files_null_txt,
        headers=rec_headers
    )
    assert resp_null_txt.status_code == 400
    assert "Invalid text file" in resp_null_txt.json()["detail"]

    # 7. Valid .txt file -> 201 Created
    files_valid_txt = {"file": ("role_spec.txt", io.BytesIO(b"Job Description:\n- 5+ years experience\n- Python & FastAPI"), "text/plain")}
    resp_valid_txt = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Valid TXT Role", "job_id": "JOB-TXT-01", "vendor_id": str(vendor.id)},
        files=files_valid_txt,
        headers=rec_headers
    )
    assert resp_valid_txt.status_code == 201
    assert resp_valid_txt.json()["has_jd"] is True
    assert resp_valid_txt.json()["jd_filename"] == "role_spec.txt"

    # 8. Valid .docx file -> 201 Created
    files_valid_docx = {"file": ("role_spec.docx", io.BytesIO(b"PK\x03\x04\x14\x00\x06\x00mock docx content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    resp_valid_docx = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Valid DOCX Role", "job_id": "JOB-DOCX-01", "vendor_id": str(vendor.id)},
        files=files_valid_docx,
        headers=rec_headers
    )
    assert resp_valid_docx.status_code == 201
    assert resp_valid_docx.json()["has_jd"] is True
    assert resp_valid_docx.json()["jd_filename"] == "role_spec.docx"

    # 9. Valid .doc file (OLE compound binary) -> 201 Created
    files_valid_doc = {"file": ("role_spec.doc", io.BytesIO(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1mock doc binary"), "application/msword")}
    resp_valid_doc = client.post(
        "/api/v1/recruiter/job-roles",
        data={"department_id": str(dept.id), "title": "Valid DOC Role", "job_id": "JOB-DOC-01", "vendor_id": str(vendor.id)},
        files=files_valid_doc,
        headers=rec_headers
    )
    assert resp_valid_doc.status_code == 201
    assert resp_valid_doc.json()["has_jd"] is True
    assert resp_valid_doc.json()["jd_filename"] == "role_spec.doc"

