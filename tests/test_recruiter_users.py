import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from db.models import InternalUser, RecruiterSignupRequest, Session as VMSSession
from backend.auth import hash_password, create_access_token

def setup_recruiter_fixtures(db: Session):
    # Retrieve the primary seed Admin Recruiter
    admin_rec = db.query(InternalUser).filter(InternalUser.email == "mbdineshreddy@gmail.com").first()
    if not admin_rec:
        admin_rec = InternalUser(
            email="mbdineshreddy@gmail.com",
            password_hash=hash_password("TestAdminPassword123!"),
            name="Admin Recruiter",
            mobile="+919876543220",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE"
        )
        db.add(admin_rec)
        db.flush()

    # Standard Recruiter (Active)
    std_rec = db.query(InternalUser).filter(InternalUser.email == "std_rec_auth@corp.com").first()
    if not std_rec:
        std_rec = InternalUser(
            email="std_rec_auth@corp.com",
            password_hash=hash_password("Password123!"),
            name="Standard Recruiter Test",
            mobile="+919876543221",
            role="RECRUITER",
            access_level="STANDARD",
            status="ACTIVE"
        )
        db.add(std_rec)
        db.flush()
    else:
        std_rec.status = "ACTIVE"
        std_rec.access_level = "STANDARD"
        db.flush()

    # Pending Signup Request (not yet approved)
    pending_req = db.query(RecruiterSignupRequest).filter(RecruiterSignupRequest.email == "pending_rec@corp.com").first()
    if not pending_req:
        pending_req = RecruiterSignupRequest(
            full_name="Pending Recruiter",
            email="pending_rec@corp.com",
            mobile="+919876543222",
            password_hash=hash_password("Password123!"),
            status="PENDING"
        )
        db.add(pending_req)
        db.flush()

    db.commit()
    return admin_rec, std_rec, pending_req


def test_admin_recruiter_users_list_and_separation(client: TestClient, db_session: Session):
    admin_rec, std_rec, pending_req = setup_recruiter_fixtures(db_session)

    # Login as admin recruiter
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com",
        "password": "TestAdminPassword123!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch recruiter users list
    resp = client.get("/api/v1/recruiter/users", headers=headers)
    assert resp.status_code == 200
    users = resp.json()
    user_emails = [u["email"] for u in users]

    # 1. Approved recruiters are present
    assert "mbdineshreddy@gmail.com" in user_emails
    assert "std_rec_auth@corp.com" in user_emails

    # 2. Pending signup request does not appear in recruiter users list
    assert "pending_rec@corp.com" not in user_emails


def test_standard_recruiter_blocked_from_recruiter_management(client: TestClient, db_session: Session):
    admin_rec, std_rec, pending_req = setup_recruiter_fixtures(db_session)

    # 1. Login as standard recruiter
    std_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "std_rec_auth@corp.com",
        "password": "Password123!"
    })
    assert std_login.status_code == 200
    std_headers = {"Authorization": f"Bearer {std_login.json()['access_token']}"}

    # 2. Standard recruiter attempts to list recruiter users -> 403 Forbidden
    list_resp = client.get("/api/v1/recruiter/users", headers=std_headers)
    assert list_resp.status_code == 403

    # 3. Standard recruiter attempts to disable another recruiter -> 403 Forbidden
    disable_resp = client.post(f"/api/v1/recruiter/users/{admin_rec.id}/disable", headers=std_headers)
    assert disable_resp.status_code == 403

    # 4. Standard recruiter attempts to reactivate a recruiter -> 403 Forbidden
    reactivate_resp = client.post(f"/api/v1/recruiter/users/{admin_rec.id}/reactivate", headers=std_headers)
    assert reactivate_resp.status_code == 403


def test_admin_deactivate_and_reactivate_standard_recruiter(client: TestClient, db_session: Session):
    admin_rec, std_rec, pending_req = setup_recruiter_fixtures(db_session)

    # 1. Login as standard recruiter to establish active session
    std_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "std_rec_auth@corp.com",
        "password": "Password123!"
    })
    assert std_login.status_code == 200
    std_token = std_login.json()["access_token"]
    std_headers = {"Authorization": f"Bearer {std_token}"}

    # Verify standard recruiter can access recruiter candidates
    assert client.get("/api/v1/recruiter/candidates", headers=std_headers).status_code == 200

    # 2. Admin logs in and deactivates the standard recruiter
    admin_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com",
        "password": "TestAdminPassword123!"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    disable_resp = client.post(f"/api/v1/recruiter/users/{std_rec.id}/disable", headers=admin_headers)
    assert disable_resp.status_code == 200
    assert "disabled" in disable_resp.json()["detail"].lower()

    # 3. Disabled recruiter's token now returns 403 Forbidden
    cand_resp = client.get("/api/v1/recruiter/candidates", headers=std_headers)
    assert cand_resp.status_code == 403
    assert "deactivated" in cand_resp.json()["detail"].lower()

    # 4. Disabled recruiter login attempt returns 403 Forbidden
    disabled_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "std_rec_auth@corp.com",
        "password": "Password123!"
    })
    assert disabled_login.status_code == 403
    assert "deactivated" in disabled_login.json()["detail"].lower()

    # 5. Admin reactivates the standard recruiter
    reactivate_resp = client.post(f"/api/v1/recruiter/users/{std_rec.id}/reactivate", headers=admin_headers)
    assert reactivate_resp.status_code == 200
    assert "reactivated" in reactivate_resp.json()["detail"].lower()

    # 6. Recruiter logs in again -> 200 OK and accesses candidates
    restored_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "std_rec_auth@corp.com",
        "password": "Password123!"
    })
    assert restored_login.status_code == 200
    new_std_token = restored_login.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_std_token}"}
    assert client.get("/api/v1/recruiter/candidates", headers=new_headers).status_code == 200


def test_admin_self_deactivation_and_admin_protection(client: TestClient, db_session: Session):
    admin_rec, std_rec, pending_req = setup_recruiter_fixtures(db_session)

    admin_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com",
        "password": "TestAdminPassword123!"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # 1. Admin attempts to deactivate own account -> 400 Bad Request
    self_resp = client.post(f"/api/v1/recruiter/users/{admin_rec.id}/disable", headers=admin_headers)
    assert self_resp.status_code == 400
    assert "self-deactivation is blocked" in self_resp.json()["detail"].lower()
