import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from db.models import InternalUser, Vendor, Department, JobRole
from backend.auth import hash_password

def get_auth_header(client: TestClient, email: str, password: str = "Password123!"):
    resp = client.post("/api/v1/auth/recruiter/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.json()}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def setup_test_recruiter_and_vendor(db: Session):
    # Ensure recruiter exists
    recruiter = db.query(InternalUser).filter(InternalUser.email == "rec_val_test@corp.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="rec_val_test@corp.com",
            password_hash=hash_password("Password123!"),
            name="Recruiter Validation Test",
            mobile="+919876543299",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()
    else:
        recruiter.status = "ACTIVE"
        recruiter.password_hash = hash_password("Password123!")

    # Ensure IOSYS and Volantis exist
    iosys = db.query(Vendor).filter(Vendor.name == "IOSYS").first()
    if not iosys:
        iosys = Vendor(name="IOSYS", normalized_name="iosys")
        db.add(iosys)
        db.flush()

    volantis = db.query(Vendor).filter(Vendor.name == "Volantis").first()
    if not volantis:
        volantis = Vendor(name="Volantis", normalized_name="volantis")
        db.add(volantis)
        db.flush()

    # Ensure a test department exists
    dept = db.query(Department).filter(Department.name == "Validation Dept").first()
    if not dept:
        dept = Department(name="Validation Dept", status="ACTIVE")
        db.add(dept)
        db.flush()

    db.commit()
    return iosys, volantis, dept

def test_valid_iosys_job_role_creation(client: TestClient, db_session: Session):
    iosys, _, dept = setup_test_recruiter_and_vendor(db_session)
    headers = get_auth_header(client, "rec_val_test@corp.com")

    payload = {
        "department_id": str(dept.id),
        "title": f"IOSYS Job {uuid.uuid4().hex[:4]}",
        "job_id": f"JOB-IOSYS-{uuid.uuid4().hex[:6]}",
        "vendor_id": str(iosys.id),
        "status": "ACTIVE"
    }

    resp = client.post("/api/v1/recruiter/job-roles", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["vendor_id"] == str(iosys.id)
    assert data["company_name"] == "IOSYS"

def test_valid_volantis_job_role_creation(client: TestClient, db_session: Session):
    _, volantis, dept = setup_test_recruiter_and_vendor(db_session)
    headers = get_auth_header(client, "rec_val_test@corp.com")

    payload = {
        "department_id": str(dept.id),
        "title": f"Volantis Job {uuid.uuid4().hex[:4]}",
        "job_id": f"JOB-VOL-{uuid.uuid4().hex[:6]}",
        "vendor_id": str(volantis.id),
        "status": "ACTIVE"
    }

    resp = client.post("/api/v1/recruiter/job-roles", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["vendor_id"] == str(volantis.id)
    assert data["company_name"] == "Volantis"

def test_missing_vendor_id_rejected(client: TestClient, db_session: Session):
    _, _, dept = setup_test_recruiter_and_vendor(db_session)
    headers = get_auth_header(client, "rec_val_test@corp.com")

    payload = {
        "department_id": str(dept.id),
        "title": f"No Vendor Job {uuid.uuid4().hex[:4]}",
        "job_id": f"JOB-NOVENDOR-{uuid.uuid4().hex[:6]}",
        "status": "ACTIVE"
    }

    resp = client.post("/api/v1/recruiter/job-roles", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "Vendor/Company: This field is required." in resp.json()["detail"]

def test_invalid_vendor_id_rejected(client: TestClient, db_session: Session):
    _, _, dept = setup_test_recruiter_and_vendor(db_session)
    headers = get_auth_header(client, "rec_val_test@corp.com")

    payload = {
        "department_id": str(dept.id),
        "title": f"Invalid Vendor Job {uuid.uuid4().hex[:4]}",
        "job_id": f"JOB-BADVENDOR-{uuid.uuid4().hex[:6]}",
        "vendor_id": str(uuid.uuid4()),  # Valid UUID format but non-existent
        "status": "ACTIVE"
    }

    resp = client.post("/api/v1/recruiter/job-roles", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "Vendor/Company: Selected company does not exist." in resp.json()["detail"]

    # Test malformed UUID format
    payload["vendor_id"] = "not-a-uuid"
    resp = client.post("/api/v1/recruiter/job-roles", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "Vendor/Company: Selected company does not exist." in resp.json()["detail"]
