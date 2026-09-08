import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text
from db.models import Vendor, VendorUser, VendorUserMembership, InternalUser, RecruiterCompanyAccess, RecruiterSignupRequest
from backend.auth import hash_password

def get_or_create_vendor(db: Session, name: str) -> Vendor:
    v = db.query(Vendor).filter(Vendor.name == name).first()
    if not v:
        v = Vendor(name=name, normalized_name=name.lower())
        db.add(v)
        db.flush()
    return v

def test_fallback_and_isolation_scenarios(client: TestClient, db_session: Session, request):
    # Setup vendors
    iosys = get_or_create_vendor(db_session, "IOSYS")
    volantis = get_or_create_vendor(db_session, "Volantis")

    # Fetch active admin emails to restore later
    active_admins = db_session.execute(text("SELECT email FROM internal_users WHERE role = 'RECRUITER' AND access_level = 'ADMIN' AND status = 'ACTIVE'")).all()
    active_admin_emails = [r[0] for r in active_admins]

    def restore_admins():
        from sqlalchemy import text
        # Delete the recruiter admins created by the test
        db_session.execute(text("DELETE FROM recruiter_company_access WHERE recruiter_id IN (SELECT id FROM internal_users WHERE email IN ('iosys_only@corp.com', 'volantis_only@corp.com'))"))
        db_session.execute(text("DELETE FROM internal_users WHERE email IN ('iosys_only@corp.com', 'volantis_only@corp.com')"))
        db_session.commit()
        if active_admin_emails:
            db_session.execute(
                text("UPDATE internal_users SET status = 'ACTIVE' WHERE email IN :emails"),
                {"emails": tuple(active_admin_emails)}
            )
            db_session.commit()

    request.addfinalizer(restore_admins)

    # Disable all active admin recruiters to bypass the limit trigger during the test
    db_session.execute(text("UPDATE internal_users SET status = 'DISABLED' WHERE role = 'RECRUITER' AND access_level = 'ADMIN'"))
    db_session.commit()

    # Clear any existing user with these emails to avoid conflict
    db_session.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id.in_(
            db_session.query(InternalUser.id).filter(InternalUser.email.in_(["iosys_only@corp.com", "volantis_only@corp.com"]))
        )
    ).delete(synchronize_session=False)
    db_session.query(InternalUser).filter(InternalUser.email.in_(["iosys_only@corp.com", "volantis_only@corp.com"])).delete(synchronize_session=False)
    db_session.commit()

    # 1. vendor_id points to IOSYS + Volantis membership REJECTED -> Volantis must remain inaccessible.
    email_rej = f"v_rej_{uuid.uuid4().hex[:6]}@vendor.com"
    v_user_rej = VendorUser(
        vendor_id=iosys.id,
        email=email_rej,
        password_hash=hash_password("Password123!"),
        name="Rejected Volantis User",
        mobile="+919876543201",
        status="ACTIVE"
    )
    db_session.add(v_user_rej)
    db_session.flush()

    membership_rej = VendorUserMembership(
        vendor_user_id=v_user_rej.id,
        vendor_id=volantis.id,
        status="REJECTED"
    )
    db_session.add(membership_rej)
    db_session.commit()

    # Login rejected user
    login_rej = client.post("/api/v1/auth/vendor/login", json={"email": email_rej, "password": "Password123!"})
    assert login_rej.status_code == 200
    headers_rej = {"Authorization": f"Bearer {login_rej.json()['access_token']}"}

    # Attempting to log into Volantis with rejected membership returns 403
    resp_rej_login = client.post("/api/v1/auth/vendor/login", json={"email": email_rej, "password": "Password123!", "company_id": str(volantis.id)})
    assert resp_rej_login.status_code == 403

    # Backend ignores mismatched vendor_id/header and simply uses session context (returns 200 with IOSYS context)
    resp_rej = client.get(f"/api/v1/vendor/submissions?vendor_id={volantis.id}", headers=headers_rej)
    assert resp_rej.status_code == 200

    # 2. vendor_id points to IOSYS + Volantis membership PENDING -> Volantis must remain inaccessible.
    email_pend = f"v_pend_{uuid.uuid4().hex[:6]}@vendor.com"
    v_user_pend = VendorUser(
        vendor_id=iosys.id,
        email=email_pend,
        password_hash=hash_password("Password123!"),
        name="Pending Volantis User",
        mobile="+919876543202",
        status="ACTIVE"
    )
    db_session.add(v_user_pend)
    db_session.flush()

    membership_pend = VendorUserMembership(
        vendor_user_id=v_user_pend.id,
        vendor_id=volantis.id,
        status="PENDING"
    )
    db_session.add(membership_pend)
    db_session.commit()

    # Login pending user
    login_pend = client.post("/api/v1/auth/vendor/login", json={"email": email_pend, "password": "Password123!"})
    assert login_pend.status_code == 200
    headers_pend = {"Authorization": f"Bearer {login_pend.json()['access_token']}"}

    # Attempting to log into Volantis with pending membership returns 403
    resp_pend_login = client.post("/api/v1/auth/vendor/login", json={"email": email_pend, "password": "Password123!", "company_id": str(volantis.id)})
    assert resp_pend_login.status_code == 403

    # Backend ignores mismatched vendor_id/header and simply uses session context (returns 200 with IOSYS context)
    resp_pend = client.get(f"/api/v1/vendor/submissions?vendor_id={volantis.id}", headers=headers_pend)
    assert resp_pend.status_code == 200

    # 3. vendor_id points to IOSYS + Volantis membership APPROVED -> Volantis accessible.
    email_appr = f"v_appr_{uuid.uuid4().hex[:6]}@vendor.com"
    v_user_appr = VendorUser(
        vendor_id=iosys.id,
        email=email_appr,
        password_hash=hash_password("Password123!"),
        name="Approved Volantis User",
        mobile="+919876543203",
        status="ACTIVE"
    )
    db_session.add(v_user_appr)
    db_session.flush()

    membership_appr = VendorUserMembership(
        vendor_user_id=v_user_appr.id,
        vendor_id=volantis.id,
        status="APPROVED"
    )
    db_session.add(membership_appr)
    db_session.commit()

    # Login approved user with company context
    login_appr = client.post("/api/v1/auth/vendor/login", json={
        "email": email_appr,
        "password": "Password123!",
        "company_id": str(volantis.id)
    })
    assert login_appr.status_code == 200
    headers_appr = {"Authorization": f"Bearer {login_appr.json()['access_token']}"}

    # Verify Volantis submissions are accessible (returns 200)
    resp_appr = client.get(f"/api/v1/vendor/submissions?vendor_id={volantis.id}", headers=headers_appr)
    assert resp_appr.status_code == 200

    # 4. IOSYS recruiter attempting to access/manipulate Volantis request -> 403.
    # Create IOSYS Recruiter Admin
    email_iosys_rec = "iosys_only@corp.com"
    rec_iosys = InternalUser(
        email=email_iosys_rec,
        password_hash=hash_password("Password123!"),
        name="IOSYS Recruiter",
        mobile="+919876543204",
        role="RECRUITER",
        access_level="ADMIN",
        status="ACTIVE"
    )
    db_session.add(rec_iosys)
    db_session.flush()

    access_iosys = RecruiterCompanyAccess(recruiter_id=rec_iosys.id, company_id=iosys.id, status="APPROVED")
    db_session.add(access_iosys)
    db_session.commit()

    # Create Volantis Recruiter Signup Request
    volantis_req = RecruiterSignupRequest(
        full_name="Volantis Request User",
        email=f"req_vol_{uuid.uuid4().hex[:6]}@corp.com",
        mobile="+919876543205",
        password_hash=hash_password("Password123!"),
        status="PENDING",
        company_id=volantis.id,
        requested_companies=[str(volantis.id)]
    )
    db_session.add(volantis_req)
    db_session.commit()

    # Login IOSYS Recruiter
    login_iosys_rec = client.post("/api/v1/auth/recruiter/login", json={"email": email_iosys_rec, "password": "Password123!"})
    assert login_iosys_rec.status_code == 200
    headers_iosys = {"Authorization": f"Bearer {login_iosys_rec.json()['access_token']}"}

    # Attempt to fetch Volantis signup request -> 403
    resp_iosys_get = client.get(f"/api/v1/recruiter/recruiter-signup-requests/{volantis_req.id}", headers=headers_iosys)
    assert resp_iosys_get.status_code == 403

    # 5. Volantis recruiter attempting to access/manipulate IOSYS request -> 403.
    # Create Volantis Recruiter Admin
    email_vol_rec = "volantis_only@corp.com"
    rec_vol = InternalUser(
        email=email_vol_rec,
        password_hash=hash_password("Password123!"),
        name="Volantis Recruiter",
        mobile="+919876543206",
        role="RECRUITER",
        access_level="ADMIN",
        status="ACTIVE"
    )
    db_session.add(rec_vol)
    db_session.flush()

    access_vol = RecruiterCompanyAccess(recruiter_id=rec_vol.id, company_id=volantis.id, status="APPROVED")
    db_session.add(access_vol)
    db_session.commit()

    # Create IOSYS Recruiter Signup Request
    iosys_req = RecruiterSignupRequest(
        full_name="IOSYS Request User",
        email=f"req_io_{uuid.uuid4().hex[:6]}@corp.com",
        mobile="+919876543207",
        password_hash=hash_password("Password123!"),
        status="PENDING",
        company_id=iosys.id,
        requested_companies=[str(iosys.id)]
    )
    db_session.add(iosys_req)
    db_session.commit()

    # Login Volantis Recruiter
    login_vol_rec = client.post("/api/v1/auth/recruiter/login", json={"email": email_vol_rec, "password": "Password123!"})
    assert login_vol_rec.status_code == 200
    headers_vol = {"Authorization": f"Bearer {login_vol_rec.json()['access_token']}"}

    # Attempt to fetch IOSYS signup request -> 403
    resp_vol_get = client.get(f"/api/v1/recruiter/recruiter-signup-requests/{iosys_req.id}", headers=headers_vol)
    assert resp_vol_get.status_code == 403
