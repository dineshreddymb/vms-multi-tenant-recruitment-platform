import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from db.models import InternalUser, Vendor, VendorUser, Session as VMSSession
from backend.auth import hash_password, create_access_token

def setup_deactivation_fixtures(db: Session):
    recruiter = db.query(InternalUser).filter(InternalUser.email == "rec_deact_test@corp.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="rec_deact_test@corp.com",
            password_hash=hash_password("Password123!"),
            name="Recruiter Deact",
            mobile="+919876543210",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()

    v_clean = "deact test vendor"
    vendor = db.query(Vendor).filter(Vendor.normalized_name == v_clean).first()
    if not vendor:
        vendor = Vendor(name="Deact Test Vendor", normalized_name=v_clean)
        db.add(vendor)
        db.flush()

    # 1. Active vendor user
    v_user_active = db.query(VendorUser).filter(VendorUser.email == "active_v@corp.com").first()
    if not v_user_active:
        v_user_active = VendorUser(
            vendor_id=vendor.id,
            email="active_v@corp.com",
            password_hash=hash_password("Password123!"),
            name="Active Vendor User",
            mobile="+919876543211",
            status="ACTIVE"
        )
        db.add(v_user_active)
        db.flush()

    # 2. Deactivated vendor user
    v_user_disabled = db.query(VendorUser).filter(VendorUser.email == "disabled_v@corp.com").first()
    if not v_user_disabled:
        v_user_disabled = VendorUser(
            vendor_id=vendor.id,
            email="disabled_v@corp.com",
            password_hash=hash_password("Password123!"),
            name="Disabled Vendor User",
            mobile="+919876543212",
            status="DISABLED"
        )
        db.add(v_user_disabled)
        db.flush()

    db.commit()
    return recruiter, vendor, v_user_active, v_user_disabled


def test_active_vendor_login_and_protected_access(client: TestClient, db_session: Session):
    recruiter, vendor, v_active, v_disabled = setup_deactivation_fixtures(db_session)

    # 1. Active vendor login -> 200 OK
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": "active_v@corp.com",
        "password": "Password123!"
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    # 2. Access protected endpoint -> 200 OK
    headers = {"Authorization": f"Bearer {token}"}
    prof_resp = client.get("/api/v1/vendor/profile", headers=headers)
    assert prof_resp.status_code == 200
    assert prof_resp.json()["email"] == "active_v@corp.com"


def test_deactivated_vendor_login_and_anti_enumeration(client: TestClient, db_session: Session):
    recruiter, vendor, v_active, v_disabled = setup_deactivation_fixtures(db_session)

    # 1. Deactivated vendor with correct credentials -> 403 Forbidden with deactivation message
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": "disabled_v@corp.com",
        "password": "Password123!"
    })
    assert resp.status_code == 403
    assert "Your vendor account has been deactivated" in resp.json()["detail"]

    # 2. Deactivated vendor with WRONG credentials -> 401 Unauthorized (generic error, no enumeration)
    wrong_pwd_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": "disabled_v@corp.com",
        "password": "WrongPassword123!"
    })
    assert wrong_pwd_resp.status_code == 401
    assert "Invalid email or password" in wrong_pwd_resp.json()["detail"]

    # 3. Non-existent user -> 401 Unauthorized
    non_existent = client.post("/api/v1/auth/vendor/login", json={
        "email": "nonexistent_vendor@corp.com",
        "password": "Password123!"
    })
    assert non_existent.status_code == 401


def test_deactivated_vendor_token_access_denied(client: TestClient, db_session: Session):
    recruiter, vendor, v_active, v_disabled = setup_deactivation_fixtures(db_session)

    # Create a mock session & token for disabled user
    session_token = str(uuid.uuid4())
    db_session_obj = VMSSession(
        vendor_user_id=v_disabled.id,
        token=session_token,
        status="ACTIVE",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)
    )
    db_session.add(db_session_obj)
    db_session.commit()
    db_session.refresh(db_session_obj)

    jwt_token = create_access_token({
        "sub": str(v_disabled.id),
        "role": "VENDOR_USER",
        "session_id": str(db_session_obj.id)
    })
    headers = {"Authorization": f"Bearer {jwt_token}"}

    # Attempt to access protected vendor endpoints -> all must return 403 Forbidden
    routes = [
        ("GET", "/api/v1/vendor/profile"),
        ("GET", "/api/v1/vendor/submissions"),
        ("GET", "/api/v1/vendor/job-roles"),
        ("GET", "/api/v1/departments"),
    ]

    for method, route in routes:
        if method == "GET":
            r = client.get(route, headers=headers)
        else:
            r = client.post(route, headers=headers)
        assert r.status_code == 403
        assert "deactivated" in r.json()["detail"].lower()


def test_recruiter_disable_and_reactivate_vendor_lifecycle(client: TestClient, db_session: Session):
    recruiter, vendor, v_active, v_disabled = setup_deactivation_fixtures(db_session)

    # 1. Login as Recruiter Admin
    rec_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_deact_test@corp.com",
        "password": "Password123!"
    })
    assert rec_login.status_code == 200
    rec_headers = {"Authorization": f"Bearer {rec_login.json()['access_token']}"}

    # 2. Login as Active Vendor
    v_login = client.post("/api/v1/auth/vendor/login", json={
        "email": "active_v@corp.com",
        "password": "Password123!"
    })
    assert v_login.status_code == 200
    v_token = v_login.json()["access_token"]
    v_headers = {"Authorization": f"Bearer {v_token}"}

    # 3. Active vendor accesses profile -> 200 OK
    assert client.get("/api/v1/vendor/profile", headers=v_headers).status_code == 200

    # 4. Recruiter disables the vendor user
    disable_resp = client.post(f"/api/v1/recruiter/vendor-users/{v_active.id}/disable", headers=rec_headers)
    assert disable_resp.status_code == 200

    # 5. Same vendor token now returns 403 Forbidden (Account deactivated)
    assert client.get("/api/v1/vendor/profile", headers=v_headers).status_code == 403

    # 6. Subsequent login attempt returns 403 Forbidden
    re_login = client.post("/api/v1/auth/vendor/login", json={
        "email": "active_v@corp.com",
        "password": "Password123!"
    })
    assert re_login.status_code == 403

    # 7. Recruiter reactivates vendor user
    reactivate_resp = client.post(f"/api/v1/recruiter/vendor-users/{v_active.id}/reactivate", headers=rec_headers)
    assert reactivate_resp.status_code == 200

    # 8. Vendor can log in again -> 200 OK
    restored_login = client.post("/api/v1/auth/vendor/login", json={
        "email": "active_v@corp.com",
        "password": "Password123!"
    })
    assert restored_login.status_code == 200
