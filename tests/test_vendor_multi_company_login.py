import pytest
import uuid
from sqlalchemy.orm import Session
from backend.auth import hash_password, decode_access_token
from db.models import Vendor, VendorUser, VendorUserMembership, InternalUser, RecruiterCompanyAccess

@pytest.fixture
def test_vendors(db_session: Session):
    # Ensure test vendors exist
    iosys = db_session.query(Vendor).filter(Vendor.name == "IOSYS").first()
    if not iosys:
        iosys = Vendor(name="IOSYS", normalized_name="iosys")
        db_session.add(iosys)
    volantis = db_session.query(Vendor).filter(Vendor.name == "Volantis").first()
    if not volantis:
        volantis = Vendor(name="Volantis", normalized_name="volantis")
        db_session.add(volantis)
    acme = db_session.query(Vendor).filter(Vendor.name == "ACME").first()
    if not acme:
        acme = Vendor(name="ACME", normalized_name="acme")
        db_session.add(acme)
    db_session.commit()
    return {"IOSYS": iosys, "Volantis": volantis, "ACME": acme}

@pytest.fixture
def single_company_vendor_user(db_session: Session, test_vendors):
    email = "vendor_single@test.com"
    user = db_session.query(VendorUser).filter(VendorUser.email == email).first()
    if user:
        db_session.delete(user)
        db_session.commit()

    user = VendorUser(
        email=email,
        name="Single Company Vendor",
        mobile="+919876543231",
        vendor_user_reference="VUR-SINGLE-123",
        password_hash=hash_password("Password123!"),
        status="ACTIVE",
        vendor_id=test_vendors["IOSYS"].id
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def multi_company_vendor_user(db_session: Session, test_vendors):
    email = "vendor_multi@test.com"
    # Clean up old user/memberships
    user = db_session.query(VendorUser).filter(VendorUser.email == email).first()
    if user:
        db_session.query(VendorUserMembership).filter(VendorUserMembership.vendor_user_id == user.id).delete()
        db_session.delete(user)
        db_session.commit()

    user = VendorUser(
        email=email,
        name="Multi Company Vendor",
        mobile="+919876543232",
        vendor_user_reference="VUR-MULTI-123",
        password_hash=hash_password("Password123!"),
        status="ACTIVE"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Membership A
    mem_a = VendorUserMembership(
        vendor_user_id=user.id,
        vendor_id=test_vendors["IOSYS"].id,
        status="ACTIVE"
    )
    # Membership B
    mem_b = VendorUserMembership(
        vendor_user_id=user.id,
        vendor_id=test_vendors["Volantis"].id,
        status="ACTIVE"
    )
    db_session.add(mem_a)
    db_session.add(mem_b)
    db_session.commit()
    return user

def test_vendor_login_single_company(client, single_company_vendor_user, test_vendors):
    # Vendor with exactly one authorized company automatically logs in
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": single_company_vendor_user.email,
        "password": "Password123!"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data

    # Verify JWT claims
    claims = decode_access_token(data["access_token"])
    assert claims is not None
    assert claims["company_id"] == str(test_vendors["IOSYS"].id)
    assert claims["company_name"] == "IOSYS"

def test_vendor_login_multi_company_prompt(client, multi_company_vendor_user, test_vendors):
    # Vendor with multiple companies logins without company_id -> returns 409
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": multi_company_vendor_user.email,
        "password": "Password123!"
    })
    assert resp.status_code == 409
    data = resp.json()
    assert data["requires_company_selection"] is True

    companies = data["companies"]
    assert len(companies) == 2
    comp_ids = {c["id"] for c in companies}
    assert str(test_vendors["IOSYS"].id) in comp_ids
    assert str(test_vendors["Volantis"].id) in comp_ids

def test_vendor_login_multi_company_selection(client, multi_company_vendor_user, test_vendors):
    # Select Company A
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": multi_company_vendor_user.email,
        "password": "Password123!",
        "company_id": str(test_vendors["IOSYS"].id)
    })
    assert resp.status_code == 200
    data = resp.json()
    claims = decode_access_token(data["access_token"])
    assert claims["company_id"] == str(test_vendors["IOSYS"].id)
    assert claims["company_name"] == "IOSYS"

    # Select Company B
    resp2 = client.post("/api/v1/auth/vendor/login", json={
        "email": multi_company_vendor_user.email,
        "password": "Password123!",
        "company_id": str(test_vendors["Volantis"].id)
    })
    assert resp2.status_code == 200
    data2 = resp2.json()
    claims2 = decode_access_token(data2["access_token"])
    assert claims2["company_id"] == str(test_vendors["Volantis"].id)
    assert claims2["company_name"] == "Volantis"

def test_vendor_login_unauthorized_company(client, multi_company_vendor_user, test_vendors):
    # Supply unauthorized company_id (ACME)
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": multi_company_vendor_user.email,
        "password": "Password123!",
        "company_id": str(test_vendors["ACME"].id)
    })
    assert resp.status_code == 403
    assert "access" in resp.json()["detail"].lower()

def test_vendor_login_invalid_uuid(client, multi_company_vendor_user):
    random_uuid = str(uuid.uuid4())
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": multi_company_vendor_user.email,
        "password": "Password123!",
        "company_id": random_uuid
    })
    assert resp.status_code == 403

def test_recruiter_login_unaffected(client, db_session, test_vendors):
    email = "recruiter_test_multi@corp.com"
    rec = db_session.query(InternalUser).filter(InternalUser.email == email).first()
    if rec:
        db_session.query(RecruiterCompanyAccess).filter(RecruiterCompanyAccess.recruiter_id == rec.id).delete()
        db_session.delete(rec)
        db_session.commit()

    rec = InternalUser(
        email=email,
        password_hash=hash_password("Password123!"),
        name="Multi Recruiter",
        mobile="+919876543299",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add(rec)
    db_session.commit()
    db_session.refresh(rec)

    acc = RecruiterCompanyAccess(recruiter_id=rec.id, company_id=test_vendors["IOSYS"].id)
    db_session.add(acc)
    db_session.commit()

    # Recruiter logins normally
    resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": email,
        "password": "Password123!"
    })
    assert resp.status_code == 200
    data = resp.json()
    claims = decode_access_token(data["access_token"])
    assert claims["company_id"] == str(test_vendors["IOSYS"].id)
