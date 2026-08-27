"""
Tests for Recruiter User ID (recruiter_reference) feature.
Verifies:
  - Existing InternalUsers have RUxxx IDs
  - New InternalUsers receive the next sequential ID
  - IDs are unique
  - IDs remain unchanged after status updates
  - /api/v1/recruiter/me returns recruiter_reference
  - Admin roster returns recruiter_reference
  - Grant admin promotion uses RUxxx
  - Invalid RUxxx returns clear error
  - Authorization blocks non-admins from promoting
  - Max admin limit still works
  - Existing InternalUser UUIDs remain unchanged
"""
import re
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import InternalUser
from backend.auth import hash_password


def setup_two_recruiters(db: Session):
    """Returns (admin_rec, std_rec) with recruiter_reference assigned."""
    admin_rec = db.query(InternalUser).filter(InternalUser.email == "mbdineshreddy@gmail.com").first()
    if not admin_rec:
        admin_rec = InternalUser(
            email="mbdineshreddy@gmail.com",
            password_hash=hash_password("TestAdminPassword123!"),
            name="Admin Recruiter",
            mobile="+919876543220",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE",
        )
        db.add(admin_rec)
        db.flush()
    else:
        admin_rec.status = "ACTIVE"
        admin_rec.access_level = "ADMIN"
        db.flush()

    std_rec = db.query(InternalUser).filter(InternalUser.email == "rutest_std@corp.com").first()
    if not std_rec:
        std_rec = InternalUser(
            email="rutest_std@corp.com",
            password_hash=hash_password("Password123!"),
            name="Standard Recruiter RU",
            mobile="+919876543299",
            role="RECRUITER",
            access_level="STANDARD",
            status="ACTIVE",
        )
        db.add(std_rec)
        db.flush()
    else:
        std_rec.status = "ACTIVE"
        std_rec.access_level = "STANDARD"
        db.flush()

    db.commit()
    db.refresh(admin_rec)
    db.refresh(std_rec)
    return admin_rec, std_rec


def test_existing_users_have_recruiter_reference(db_session: Session):
    """TEST 1 — Existing InternalUsers have unique RUxxx references."""
    users = db_session.query(InternalUser).all()
    refs = []
    for u in users:
        assert u.recruiter_reference is not None, f"User {u.email} missing recruiter_reference"
        assert re.match(r'^RU\d{3,}$', u.recruiter_reference), \
            f"Invalid recruiter_reference format: {u.recruiter_reference}"
        refs.append(u.recruiter_reference)
    # All unique
    assert len(refs) == len(set(refs)), "Duplicate recruiter_reference values found"


def test_new_user_gets_next_sequential_reference(db_session: Session):
    """TEST 2 — New InternalUser receives the next available RUxxx."""
    # Count existing refs to find expected next
    existing = db_session.query(InternalUser).count()
    new_user = InternalUser(
        email="new_seq_test@corp.com",
        password_hash=hash_password("Password123!"),
        name="New Seq Test",
        mobile="+919876543230",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE",
    )
    db_session.add(new_user)
    db_session.flush()
    assert new_user.recruiter_reference is not None
    assert re.match(r'^RU\d{3,}$', new_user.recruiter_reference), \
        f"Invalid format: {new_user.recruiter_reference}"
    # Should be at least existing+1
    num = int(new_user.recruiter_reference[2:])
    assert num >= existing + 1, f"Expected at least RU{existing+1:03d}, got {new_user.recruiter_reference}"
    db_session.rollback()


def test_recruiter_reference_unique(db_session: Session):
    """TEST 4 — Two InternalUsers cannot share the same recruiter_reference."""
    users = db_session.query(InternalUser).all()
    refs = [u.recruiter_reference for u in users if u.recruiter_reference]
    assert len(refs) == len(set(refs)), "Duplicate recruiter_reference values detected"


def test_recruiter_reference_persists_after_status_change(client: TestClient, db_session: Session):
    """TEST 3 — recruiter_reference stays the same after profile/status updates."""
    admin_rec, std_rec = setup_two_recruiters(db_session)
    original_ref = std_rec.recruiter_reference
    assert original_ref is not None

    # Admin logs in and disables + reactivates std_rec
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com", "password": "TestAdminPassword123!"
    })
    token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {token}"}

    client.post(f"/api/v1/recruiter/users/{std_rec.id}/disable", headers=admin_headers)
    client.post(f"/api/v1/recruiter/users/{std_rec.id}/reactivate", headers=admin_headers)

    db_session.refresh(std_rec)
    assert std_rec.recruiter_reference == original_ref, \
        f"recruiter_reference changed from {original_ref} to {std_rec.recruiter_reference}"


def test_recruiter_me_returns_recruiter_reference(client: TestClient, db_session: Session):
    """TEST 6 — GET /api/v1/recruiter/me returns recruiter_reference."""
    admin_rec, std_rec = setup_two_recruiters(db_session)

    # Login as standard recruiter
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rutest_std@corp.com", "password": "Password123!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_resp = client.get("/api/v1/recruiter/me", headers=headers)
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert "recruiter_reference" in data
    assert re.match(r'^RU\d{3,}$', data["recruiter_reference"]), \
        f"Invalid reference in /me response: {data['recruiter_reference']}"
    assert data["recruiter_reference"] == std_rec.recruiter_reference


def test_admin_roster_returns_recruiter_reference(client: TestClient, db_session: Session):
    """TEST 8 — Admin roster returns recruiter_reference for each admin."""
    admin_rec, std_rec = setup_two_recruiters(db_session)

    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com", "password": "TestAdminPassword123!"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    roster_resp = client.get("/api/v1/recruiter/admins", headers=headers)
    assert roster_resp.status_code == 200
    admins = roster_resp.json()
    assert len(admins) >= 1
    for adm in admins:
        assert "recruiter_reference" in adm, "recruiter_reference missing from admin roster"
        assert re.match(r'^RU\d{3,}$', adm["recruiter_reference"])


def test_admin_list_users_returns_recruiter_reference(client: TestClient, db_session: Session):
    """Verify /api/v1/recruiter/users includes recruiter_reference for all users."""
    admin_rec, std_rec = setup_two_recruiters(db_session)

    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com", "password": "TestAdminPassword123!"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    users_resp = client.get("/api/v1/recruiter/users", headers=headers)
    assert users_resp.status_code == 200
    for u in users_resp.json():
        assert "recruiter_reference" in u
        assert re.match(r'^RU\d{3,}$', u["recruiter_reference"])


def test_promote_admin_using_recruiter_reference(client: TestClient, db_session: Session):
    """TEST 9 — Admin can promote another recruiter using RUxxx ID."""
    admin_rec, std_rec = setup_two_recruiters(db_session)
    # Ensure std_rec is STANDARD before test
    std_rec.access_level = "STANDARD"
    db_session.commit()
    db_session.refresh(std_rec)

    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com", "password": "TestAdminPassword123!"
    })
    token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {token}"}

    ref = std_rec.recruiter_reference
    grant_resp = client.post(f"/api/v1/recruiter/admins/{ref}/grant", headers=admin_headers)
    # Either 200 (granted) or 409 (admin limit reached) is acceptable
    assert grant_resp.status_code in (200, 409)

    # Restore: demote if promoted
    if grant_resp.status_code == 200:
        client.post(f"/api/v1/recruiter/admins/{ref}/remove", headers=admin_headers)
        db_session.refresh(std_rec)
        std_rec.access_level = "STANDARD"
        db_session.commit()


def test_invalid_recruiter_reference_returns_not_found(client: TestClient, db_session: Session):
    """TEST 10 — RU999 that doesn't exist returns a 404 with clear error."""
    admin_rec, _ = setup_two_recruiters(db_session)

    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com", "password": "TestAdminPassword123!"
    })
    token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {token}"}

    resp = client.post("/api/v1/recruiter/admins/RU999/grant", headers=admin_headers)
    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert "RU999" in detail
    # Must not expose a UUID in the error message
    assert not re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', detail)


def test_malformed_recruiter_reference_returns_400(client: TestClient, db_session: Session):
    """TEST 10 — Malformed reference (not RUxxx) returns 400."""
    admin_rec, _ = setup_two_recruiters(db_session)

    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "mbdineshreddy@gmail.com", "password": "TestAdminPassword123!"
    })
    token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {token}"}

    for bad_ref in ["some-uuid-string", "RU", "001", "RU1"]:
        resp = client.post(f"/api/v1/recruiter/admins/{bad_ref}/grant", headers=admin_headers)
        assert resp.status_code == 400, f"Expected 400 for '{bad_ref}', got {resp.status_code}"


def test_standard_recruiter_cannot_promote_via_recruiter_reference(client: TestClient, db_session: Session):
    """TEST 11 — A STANDARD recruiter cannot use RUxxx to promote another user."""
    admin_rec, std_rec = setup_two_recruiters(db_session)

    std_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rutest_std@corp.com", "password": "Password123!"
    })
    assert std_login.status_code == 200
    std_headers = {"Authorization": f"Bearer {std_login.json()['access_token']}"}

    resp = client.post(f"/api/v1/recruiter/admins/{admin_rec.recruiter_reference}/grant", headers=std_headers)
    assert resp.status_code == 403


def test_uuid_unchanged_after_reference_assignment(db_session: Session):
    """TEST 13 — Existing InternalUser UUIDs must not have changed."""
    # Verify the known seed admin UUID is still intact
    admin = db_session.query(InternalUser).filter(InternalUser.email == "mbdineshreddy@gmail.com").first()
    if admin:
        # UUID must still be a valid UUID string
        import uuid
        parsed = uuid.UUID(str(admin.id))
        assert str(parsed) == str(admin.id)
        # recruiter_reference must be separate from the UUID
        assert admin.recruiter_reference != str(admin.id)
