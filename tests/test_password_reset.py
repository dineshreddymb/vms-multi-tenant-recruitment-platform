import uuid
import hashlib
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import InternalUser, Vendor, VendorUser, PasswordResetToken, Session as VMSSession
from backend.auth import hash_password, verify_password
from backend.email_service import dev_inbox

def setup_reset_test_users(db: Session):
    dev_inbox.clear()
    
    # 1. Active Recruiter
    recruiter = db.query(InternalUser).filter(InternalUser.email == "rec_reset_test@vms.com").first()
    if not recruiter:
        recruiter = InternalUser(
            email="rec_reset_test@vms.com",
            password_hash=hash_password("OldRecruiterPass123!"),
            name="Recruiter Reset User",
            mobile="+919876543290",
            role="RECRUITER",
            access_level="STANDARD",
            status="ACTIVE"
        )
        db.add(recruiter)
        db.flush()
    else:
        recruiter.password_hash = hash_password("OldRecruiterPass123!")
        recruiter.status = "ACTIVE"
        db.flush()

    # 2. Disabled Recruiter
    dis_recruiter = db.query(InternalUser).filter(InternalUser.email == "dis_rec_reset@vms.com").first()
    if not dis_recruiter:
        dis_recruiter = InternalUser(
            email="dis_rec_reset@vms.com",
            password_hash=hash_password("OldDisabledPass123!"),
            name="Disabled Recruiter",
            mobile="+919876543291",
            role="RECRUITER",
            access_level="STANDARD",
            status="DISABLED"
        )
        db.add(dis_recruiter)
        db.flush()
    else:
        dis_recruiter.status = "DISABLED"
        db.flush()

    # 3. Vendor and Active Vendor User
    vendor = db.query(Vendor).filter(Vendor.normalized_name == "reset test vendor co").first()
    if not vendor:
        vendor = Vendor(
            name="Reset Test Vendor Co",
            normalized_name="reset test vendor co"
        )
        db.add(vendor)
        db.flush()

    vendor_user = db.query(VendorUser).filter(VendorUser.email == "vendor_reset_test@vms.com").first()
    if not vendor_user:
        vendor_user = VendorUser(
            vendor_id=vendor.id,
            email="vendor_reset_test@vms.com",
            password_hash=hash_password("OldVendorPass123!"),
            name="Vendor Reset User",
            mobile="+919876543292",
            status="ACTIVE"
        )
        db.add(vendor_user)
        db.flush()
    else:
        vendor_user.password_hash = hash_password("OldVendorPass123!")
        vendor_user.status = "ACTIVE"
        db.flush()

    # 4. Disabled Vendor User
    dis_vendor_user = db.query(VendorUser).filter(VendorUser.email == "dis_vendor_reset@vms.com").first()
    if not dis_vendor_user:
        dis_vendor_user = VendorUser(
            vendor_id=vendor.id,
            email="dis_vendor_reset@vms.com",
            password_hash=hash_password("OldDisabledVendorPass123!"),
            name="Disabled Vendor User",
            mobile="+919876543293",
            status="DISABLED"
        )
        db.add(dis_vendor_user)
        db.flush()
    else:
        dis_vendor_user.status = "DISABLED"
        db.flush()

    db.commit()
    return recruiter, dis_recruiter, vendor_user, dis_vendor_user


# ==============================================================================
# RECRUITER PASSWORD RESET TESTS
# ==============================================================================

def test_recruiter_forgot_and_reset_password_end_to_end(client: TestClient, db_session: Session):
    recruiter, _, _, _ = setup_reset_test_users(db_session)
    old_hash = recruiter.password_hash

    # 1. Establish an active session for recruiter
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_reset_test@vms.com",
        "password": "OldRecruiterPass123!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    
    # Active sessions exist
    active_sessions = db_session.query(VMSSession).filter(
        VMSSession.internal_user_id == recruiter.id,
        VMSSession.status == "ACTIVE"
    ).all()
    assert len(active_sessions) >= 1

    # 2. Request password reset
    forgot_resp = client.post("/api/v1/auth/forgot-password", json={
        "email": "rec_reset_test@vms.com"
    })
    assert forgot_resp.status_code == 200
    assert "reset link has been sent" in forgot_resp.json()["detail"].lower()

    # 3. Check dev inbox for generated raw token
    assert len(dev_inbox) >= 1
    email_entry = dev_inbox[-1]
    assert email_entry["to"] == "rec_reset_test@vms.com"
    raw_token = email_entry["token"]

    # 4. Verify token persistence in DB (stored as SHA-256 hash, raw token not stored)
    expected_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db_token = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == expected_token_hash
    ).first()
    assert db_token is not None
    assert db_token.internal_user_id == recruiter.id
    assert db_token.vendor_user_id is None
    assert db_token.used is False

    # 5. Submit password reset with new password
    reset_resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewRecruiterPass123!",
        "confirm_password": "NewRecruiterPass123!"
    })
    assert reset_resp.status_code == 200
    assert "reset successfully" in reset_resp.json()["detail"].lower()

    # 6. Verify database updates in PostgreSQL
    db_session.refresh(recruiter)
    db_session.refresh(db_token)
    assert db_token.used is True
    assert recruiter.password_hash != old_hash
    assert verify_password("NewRecruiterPass123!", recruiter.password_hash) is True
    assert verify_password("OldRecruiterPass123!", recruiter.password_hash) is False

    # 7. Verify previous active sessions were revoked
    revoked_sessions = db_session.query(VMSSession).filter(
        VMSSession.internal_user_id == recruiter.id,
        VMSSession.status == "ACTIVE"
    ).all()
    assert len(revoked_sessions) == 0

    # 8. Verify Old password fails login
    old_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_reset_test@vms.com",
        "password": "OldRecruiterPass123!"
    })
    assert old_login.status_code == 401

    # 9. Verify New password succeeds login
    new_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": "rec_reset_test@vms.com",
        "password": "NewRecruiterPass123!"
    })
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()


def test_recruiter_forgot_password_unknown_email_anti_enumeration(client: TestClient, db_session: Session):
    setup_reset_test_users(db_session)
    dev_inbox.clear()

    resp = client.post("/api/v1/auth/forgot-password", json={
        "email": "nonexistent_recruiter_xyz@vms.com"
    })
    assert resp.status_code == 200
    assert "reset link has been sent" in resp.json()["detail"].lower()
    # No email captured for nonexistent user
    assert len(dev_inbox) == 0


def test_recruiter_reset_password_invalid_token(client: TestClient, db_session: Session):
    setup_reset_test_users(db_session)

    resp = client.post("/api/v1/auth/reset-password", json={
        "token": "completely_invalid_random_token_12345",
        "password": "NewRecruiterPass123!",
        "confirm_password": "NewRecruiterPass123!"
    })
    assert resp.status_code == 400
    assert "invalid or expired" in resp.json()["detail"].lower()


def test_recruiter_reset_password_expired_token(client: TestClient, db_session: Session):
    recruiter, _, _, _ = setup_reset_test_users(db_session)

    raw_token = "expired_raw_token_xyz"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    
    expired_token = PasswordResetToken(
        internal_user_id=recruiter.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        used=False
    )
    db_session.add(expired_token)
    db_session.commit()

    resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewRecruiterPass123!",
        "confirm_password": "NewRecruiterPass123!"
    })
    assert resp.status_code == 400
    assert "invalid or expired" in resp.json()["detail"].lower()


def test_recruiter_reset_password_token_reuse_blocked(client: TestClient, db_session: Session):
    recruiter, _, _, _ = setup_reset_test_users(db_session)

    # 1. Forgot password request
    client.post("/api/v1/auth/forgot-password", json={"email": "rec_reset_test@vms.com"})
    raw_token = dev_inbox[-1]["token"]

    # 2. First reset succeeds
    resp1 = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewPassFirstTime123!",
        "confirm_password": "NewPassFirstTime123!"
    })
    assert resp1.status_code == 200

    # 3. Second reset with same token is blocked
    resp2 = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewPassSecondTime123!",
        "confirm_password": "NewPassSecondTime123!"
    })
    assert resp2.status_code == 400
    assert "invalid or expired" in resp2.json()["detail"].lower()


def test_disabled_recruiter_forgot_and_reset_blocked(client: TestClient, db_session: Session):
    _, dis_recruiter, _, _ = setup_reset_test_users(db_session)
    dev_inbox.clear()

    # 1. Forgot password on disabled recruiter returns generic message but generates NO token
    resp = client.post("/api/v1/auth/forgot-password", json={"email": "dis_rec_reset@vms.com"})
    assert resp.status_code == 200
    assert len(dev_inbox) == 0

    # 2. If a pre-existing token existed prior to deactivation, reset is blocked
    raw_token = "preexisting_dis_token"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db_token = PasswordResetToken(
        internal_user_id=dis_recruiter.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        used=False
    )
    db_session.add(db_token)
    db_session.commit()

    reset_resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewDisabledRecPass123!",
        "confirm_password": "NewDisabledRecPass123!"
    })
    assert reset_resp.status_code == 400


# ==============================================================================
# VENDOR PASSWORD RESET TESTS
# ==============================================================================

def test_vendor_forgot_and_reset_password_end_to_end(client: TestClient, db_session: Session):
    _, _, vendor_user, _ = setup_reset_test_users(db_session)
    old_hash = vendor_user.password_hash

    # 1. Establish an active session for vendor user
    login_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": "vendor_reset_test@vms.com",
        "password": "OldVendorPass123!"
    })
    assert login_resp.status_code == 200
    
    # Active sessions exist
    active_sessions = db_session.query(VMSSession).filter(
        VMSSession.vendor_user_id == vendor_user.id,
        VMSSession.status == "ACTIVE"
    ).all()
    assert len(active_sessions) >= 1

    # 2. Request password reset
    forgot_resp = client.post("/api/v1/auth/forgot-password", json={
        "email": "vendor_reset_test@vms.com"
    })
    assert forgot_resp.status_code == 200
    assert "reset link has been sent" in forgot_resp.json()["detail"].lower()

    # 3. Check dev inbox for generated raw token
    assert len(dev_inbox) >= 1
    email_entry = dev_inbox[-1]
    assert email_entry["to"] == "vendor_reset_test@vms.com"
    raw_token = email_entry["token"]

    # 4. Verify token persistence in DB
    expected_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db_token = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == expected_token_hash
    ).first()
    assert db_token is not None
    assert db_token.vendor_user_id == vendor_user.id
    assert db_token.internal_user_id is None
    assert db_token.used is False

    # 5. Submit password reset with new password
    reset_resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewVendorPass123!",
        "confirm_password": "NewVendorPass123!"
    })
    assert reset_resp.status_code == 200
    assert "reset successfully" in reset_resp.json()["detail"].lower()

    # 6. Verify database updates in PostgreSQL
    db_session.refresh(vendor_user)
    db_session.refresh(db_token)
    assert db_token.used is True
    assert vendor_user.password_hash != old_hash
    assert verify_password("NewVendorPass123!", vendor_user.password_hash) is True
    assert verify_password("OldVendorPass123!", vendor_user.password_hash) is False

    # 7. Verify previous active sessions were revoked
    revoked_sessions = db_session.query(VMSSession).filter(
        VMSSession.vendor_user_id == vendor_user.id,
        VMSSession.status == "ACTIVE"
    ).all()
    assert len(revoked_sessions) == 0

    # 8. Verify Old password fails login
    old_login = client.post("/api/v1/auth/vendor/login", json={
        "email": "vendor_reset_test@vms.com",
        "password": "OldVendorPass123!"
    })
    assert old_login.status_code == 401

    # 9. Verify New password succeeds login
    new_login = client.post("/api/v1/auth/vendor/login", json={
        "email": "vendor_reset_test@vms.com",
        "password": "NewVendorPass123!"
    })
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()


def test_vendor_forgot_password_unknown_email_anti_enumeration(client: TestClient, db_session: Session):
    setup_reset_test_users(db_session)
    dev_inbox.clear()

    resp = client.post("/api/v1/auth/forgot-password", json={
        "email": "nonexistent_vendor_xyz@vms.com"
    })
    assert resp.status_code == 200
    assert "reset link has been sent" in resp.json()["detail"].lower()
    assert len(dev_inbox) == 0


def test_disabled_vendor_forgot_and_reset_blocked(client: TestClient, db_session: Session):
    _, _, _, dis_vendor_user = setup_reset_test_users(db_session)
    dev_inbox.clear()

    # 1. Forgot password on disabled vendor returns generic message but generates NO token
    resp = client.post("/api/v1/auth/forgot-password", json={"email": "dis_vendor_reset@vms.com"})
    assert resp.status_code == 200
    assert len(dev_inbox) == 0

    # 2. If a pre-existing token existed prior to deactivation, reset is blocked
    raw_token = "preexisting_dis_vendor_token"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db_token = PasswordResetToken(
        vendor_user_id=dis_vendor_user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        used=False
    )
    db_session.add(db_token)
    db_session.commit()

    reset_resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "password": "NewDisabledVendorPass123!",
        "confirm_password": "NewDisabledVendorPass123!"
    })
    assert reset_resp.status_code == 400
