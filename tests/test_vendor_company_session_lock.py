import pytest
import uuid
from sqlalchemy.orm import Session
from backend.auth import hash_password, create_access_token, decode_access_token
from db.models import Vendor, VendorUser, VendorUserMembership, Department, JobRole, Session as VMSSession
from datetime import datetime, timedelta, timezone


def _make_multi_vendor(db, iosys, volantis, sfx=""):
    email = "mclock_" + (sfx or uuid.uuid4().hex[:8]) + "@test.com"
    old = db.query(VendorUser).filter(VendorUser.email == email).first()
    if old:
        db.query(VendorUserMembership).filter(VendorUserMembership.vendor_user_id == old.id).delete()
        db.delete(old); db.commit()
    u = VendorUser(email=email, name="MC Lock", mobile="+919000000001",
                   vendor_user_reference="VUR-MC-" + uuid.uuid4().hex[:6].upper(),
                   password_hash=hash_password("LockTest123!"), status="ACTIVE")
    db.add(u); db.commit(); db.refresh(u)
    for v in [iosys, volantis]:
        db.add(VendorUserMembership(vendor_user_id=u.id, vendor_id=v.id, status="ACTIVE"))
    db.commit()
    return u, email


def _make_single_vendor(db, vendor, sfx=""):
    email = "sclock_" + (sfx or uuid.uuid4().hex[:8]) + "@test.com"
    old = db.query(VendorUser).filter(VendorUser.email == email).first()
    if old:
        db.query(VendorUserMembership).filter(VendorUserMembership.vendor_user_id == old.id).delete()
        db.delete(old); db.commit()
    u = VendorUser(email=email, name="SC Lock", mobile="+919000000002",
                   vendor_user_reference="VUR-SC-" + uuid.uuid4().hex[:6].upper(),
                   password_hash=hash_password("LockTest123!"), status="ACTIVE", vendor_id=vendor.id)
    db.add(u); db.commit(); db.refresh(u)
    db.add(VendorUserMembership(vendor_user_id=u.id, vendor_id=vendor.id, status="ACTIVE"))
    db.commit()
    return u, email


def _login(client, email, pw, cid):
    r = client.post("/api/v1/auth/vendor/login", json={"email": email, "password": pw, "company_id": str(cid)})
    assert r.status_code == 200, f"Login failed: {r.json()}"
    return r.json()["access_token"]


def _h(token, xvid=None):
    h = {"Authorization": "Bearer " + token}
    if xvid:
        h["X-Vendor-ID"] = str(xvid)
    return h


@pytest.fixture
def iosys(db_session):
    v = db_session.query(Vendor).filter(Vendor.normalized_name == "iosys").first()
    if not v:
        v = Vendor(name="IOSYS", normalized_name="iosys", is_tenant=True)
        db_session.add(v); db_session.commit()
    return v


@pytest.fixture
def volantis(db_session):
    v = db_session.query(Vendor).filter(Vendor.normalized_name == "volantis").first()
    if not v:
        v = Vendor(name="Volantis", normalized_name="volantis", is_tenant=True)
        db_session.add(v); db_session.commit()
    return v


@pytest.fixture
def iosys_role(db_session, iosys):
    d = Department(id=uuid.uuid4(), name="IOS-Dept-" + uuid.uuid4().hex[:6], status="ACTIVE")
    db_session.add(d); db_session.commit()
    r = JobRole(id=uuid.uuid4(), title="IOS-Role-" + uuid.uuid4().hex[:6],
                job_id="JI-" + uuid.uuid4().hex[:6].upper(),
                department_id=d.id, vendor_id=iosys.id, status="ACTIVE")
    db_session.add(r); db_session.commit()
    return r


@pytest.fixture
def volantis_role(db_session, volantis):
    d = Department(id=uuid.uuid4(), name="VOL-Dept-" + uuid.uuid4().hex[:6], status="ACTIVE")
    db_session.add(d); db_session.commit()
    r = JobRole(id=uuid.uuid4(), title="VOL-Role-" + uuid.uuid4().hex[:6],
                job_id="JV-" + uuid.uuid4().hex[:6].upper(),
                department_id=d.id, vendor_id=volantis.id, status="ACTIVE")
    db_session.add(r); db_session.commit()
    return r


# JWT content tests
def test_iosys_login_jwt_company_id(client, db_session, iosys, volantis):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "jwtios")
    token = _login(client, email, "LockTest123!", iosys.id)
    claims = decode_access_token(token)
    assert claims["company_id"] == str(iosys.id)


def test_volantis_login_jwt_company_id(client, db_session, iosys, volantis):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "jwtvol")
    token = _login(client, email, "LockTest123!", volantis.id)
    claims = decode_access_token(token)
    assert claims["company_id"] == str(volantis.id)


# X-Vendor-ID injection tests: job roles
def test_iosys_session_returns_iosys_roles_despite_volantis_header(
    client, db_session, iosys, volantis, iosys_role, volantis_role
):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "jr_ios")
    token = _login(client, email, "LockTest123!", iosys.id)
    resp = client.get("/api/v1/vendor/job-roles", headers=_h(token, volantis.id))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert str(iosys_role.id) in ids, "IOSYS role missing for IOSYS session"
    assert str(volantis_role.id) not in ids, "SECURITY: Volantis role leaked to IOSYS session!"


def test_volantis_session_returns_volantis_roles_despite_iosys_header(
    client, db_session, iosys, volantis, iosys_role, volantis_role
):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "jr_vol")
    token = _login(client, email, "LockTest123!", volantis.id)
    resp = client.get("/api/v1/vendor/job-roles", headers=_h(token, iosys.id))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert str(volantis_role.id) in ids, "Volantis role missing for Volantis session"
    assert str(iosys_role.id) not in ids, "SECURITY: IOSYS role leaked to Volantis session!"


def test_single_iosys_vendor_unaffected_by_volantis_header(
    client, db_session, iosys, volantis, iosys_role, volantis_role
):
    _, email = _make_single_vendor(db_session, iosys, "sc_ios")
    token = _login(client, email, "LockTest123!", iosys.id)
    resp = client.get("/api/v1/vendor/job-roles", headers=_h(token, volantis.id))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert str(iosys_role.id) in ids
    assert str(volantis_role.id) not in ids


def test_single_volantis_vendor_unaffected_by_iosys_header(
    client, db_session, iosys, volantis, iosys_role, volantis_role
):
    _, email = _make_single_vendor(db_session, volantis, "sc_vol")
    token = _login(client, email, "LockTest123!", volantis.id)
    resp = client.get("/api/v1/vendor/job-roles", headers=_h(token, iosys.id))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert str(volantis_role.id) in ids
    assert str(iosys_role.id) not in ids


# Submissions listing endpoint
def test_iosys_session_submissions_ok_with_volantis_header(client, db_session, iosys, volantis):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "sub_ios")
    token = _login(client, email, "LockTest123!", iosys.id)
    resp = client.get("/api/v1/vendor/submissions", headers=_h(token, volantis.id))
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_volantis_session_submissions_ok_with_iosys_header(client, db_session, iosys, volantis):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "sub_vol")
    token = _login(client, email, "LockTest123!", volantis.id)
    resp = client.get("/api/v1/vendor/submissions", headers=_h(token, iosys.id))
    assert resp.status_code == 200
    assert "items" in resp.json()


# Cross-company submission must be blocked
def test_iosys_session_blocked_from_volantis_role_submission(
    client, db_session, iosys, volantis, volantis_role
):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "cs_ios")
    token = _login(client, email, "LockTest123!", iosys.id)
    body = {
        "role_id": str(volantis_role.id), "job_id": volantis_role.job_id,
        "cv_sent_date": "2026-09-01", "employment_mode": "Perm",
        "name": "TC1", "email": "tc1@t.com", "contact_number": "9876543210",
        "current_company": "Acme", "total_experience": 2.0, "relevant_experience": 1.0,
        "notice_period": "30", "ctc": 8.0, "ectc": 12.0,
        "current_location": "Pune", "preferred_location": "Bangalore",
        "pan": "ABCPK1234F", "linkedin_url": "https://linkedin.com/in/tc1",
        "education": "B.Tech", "about": "candidate", "resume_id": str(uuid.uuid4())
    }
    h = _h(token, volantis.id)
    h["Idempotency-Key"] = str(uuid.uuid4())
    resp = client.post("/api/v1/submissions", json=body, headers=h)
    assert resp.status_code == 403, f"SECURITY FAIL: IOSYS session submitted to Volantis role! {resp.json()}"


def test_volantis_session_blocked_from_iosys_role_submission(
    client, db_session, iosys, volantis, iosys_role
):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "cs_vol")
    token = _login(client, email, "LockTest123!", volantis.id)
    body = {
        "role_id": str(iosys_role.id), "job_id": iosys_role.job_id,
        "cv_sent_date": "2026-09-01", "employment_mode": "Perm",
        "name": "TC2", "email": "tc2@t.com", "contact_number": "9876543211",
        "current_company": "Acme2", "total_experience": 3.0, "relevant_experience": 2.0,
        "notice_period": "30", "ctc": 10.0, "ectc": 14.0,
        "current_location": "Delhi", "preferred_location": "Hyderabad",
        "pan": "XYZPQ9876G", "linkedin_url": "https://linkedin.com/in/tc2",
        "education": "MBA", "about": "candidate 2", "resume_id": str(uuid.uuid4())
    }
    h = _h(token, iosys.id)
    h["Idempotency-Key"] = str(uuid.uuid4())
    resp = client.post("/api/v1/submissions", json=body, headers=h)
    assert resp.status_code == 403, f"SECURITY FAIL: Volantis session submitted to IOSYS role! {resp.json()}"


# Vendor without company_id in JWT is rejected
def test_no_company_jwt_rejected_on_departments(client, db_session, iosys, volantis):
    u, _ = _make_multi_vendor(db_session, iosys, volantis, "nc_dept")
    s = VMSSession(vendor_user_id=u.id, token=str(uuid.uuid4()), status="ACTIVE",
                   expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db_session.add(s); db_session.commit(); db_session.refresh(s)
    token = create_access_token({"sub": str(u.id), "role": "VENDOR_USER",
                                 "session_id": str(s.id), "company_id": "None", "company_name": "None"})
    resp = client.get("/api/v1/departments", headers={"Authorization": "Bearer " + token})
    assert resp.status_code == 403


def test_no_company_jwt_rejected_on_vendor_job_roles(client, db_session, iosys, volantis):
    u, _ = _make_multi_vendor(db_session, iosys, volantis, "nc_roles")
    s = VMSSession(vendor_user_id=u.id, token=str(uuid.uuid4()), status="ACTIVE",
                   expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db_session.add(s); db_session.commit(); db_session.refresh(s)
    token = create_access_token({"sub": str(u.id), "role": "VENDOR_USER",
                                 "session_id": str(s.id), "company_id": "None", "company_name": "None"})
    resp = client.get("/api/v1/vendor/job-roles", headers={"Authorization": "Bearer " + token})
    assert resp.status_code == 403


def test_no_company_jwt_rejected_on_submissions(client, db_session, iosys, volantis):
    u, _ = _make_multi_vendor(db_session, iosys, volantis, "nc_subs")
    s = VMSSession(vendor_user_id=u.id, token=str(uuid.uuid4()), status="ACTIVE",
                   expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db_session.add(s); db_session.commit(); db_session.refresh(s)
    token = create_access_token({"sub": str(u.id), "role": "VENDOR_USER",
                                 "session_id": str(s.id), "company_id": "None", "company_name": "None"})
    resp = client.get("/api/v1/vendor/submissions", headers={"Authorization": "Bearer " + token})
    assert resp.status_code == 403


# Cross-company JD download blocking tests
def test_iosys_session_blocked_from_volantis_jd(client, db_session, iosys, volantis, volantis_role):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "jd_ios")
    token = _login(client, email, "LockTest123!", iosys.id)
    resp = client.get(f"/api/v1/vendor/job-roles/{volantis_role.id}/jd", headers=_h(token, volantis.id))
    assert resp.status_code == 403


def test_volantis_session_blocked_from_iosys_jd(client, db_session, iosys, volantis, iosys_role):
    _, email = _make_multi_vendor(db_session, iosys, volantis, "jd_vol")
    token = _login(client, email, "LockTest123!", volantis.id)
    resp = client.get(f"/api/v1/vendor/job-roles/{iosys_role.id}/jd", headers=_h(token, iosys.id))
    assert resp.status_code == 403
