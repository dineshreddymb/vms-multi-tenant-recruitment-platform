import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import InternalUser, Vendor, VendorUser, VendorSignupRequest
from backend.auth import hash_password, verify_password

def setup_test_actors(db: Session):
    # 1. Admin Recruiter
    admin = db.query(InternalUser).filter(InternalUser.email == "admin_approver@vms.com").first()
    if not admin:
        admin = InternalUser(
            email="admin_approver@vms.com",
            password_hash=hash_password("AdminPass123!"),
            name="Admin Approver",
            mobile="+919876543201",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE"
        )
        db.add(admin)
        db.flush()

    # 2. Standard Recruiter
    std_recruiter = db.query(InternalUser).filter(InternalUser.email == "std_recruiter@vms.com").first()
    if not std_recruiter:
        std_recruiter = InternalUser(
            email="std_recruiter@vms.com",
            password_hash=hash_password("StdPass123!"),
            name="Standard Recruiter",
            mobile="+919876543202",
            role="RECRUITER",
            access_level="STANDARD",
            status="ACTIVE"
        )
        db.add(std_recruiter)
        db.flush()

    # 3. Pre-existing Vendor & Vendor User
    vendor = db.query(Vendor).filter(Vendor.normalized_name == "existing vendor llc").first()
    if not vendor:
        vendor = Vendor(
            name="Existing Vendor LLC",
            normalized_name="existing vendor llc"
        )
        db.add(vendor)
        db.flush()

    existing_vuser = db.query(VendorUser).filter(VendorUser.email == "existing_vendor_user@vms.com").first()
    if not existing_vuser:
        existing_vuser = VendorUser(
            vendor_id=vendor.id,
            email="existing_vendor_user@vms.com",
            password_hash=hash_password("ExistingVendorPass123!"),
            name="Existing Vendor User",
            mobile="+919876543203",
            status="ACTIVE"
        )
        db.add(existing_vuser)
        db.flush()
    else:
        existing_vuser.status = "ACTIVE"
        existing_vuser.password_hash = hash_password("ExistingVendorPass123!")

    from db.models import VendorUserMembership, RecruiterCompanyAccess
    mem = db.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == existing_vuser.id,
        VendorUserMembership.vendor_id == vendor.id
    ).first()
    if not mem:
        mem = VendorUserMembership(vendor_user_id=existing_vuser.id, vendor_id=vendor.id, status="ACTIVE")
        db.add(mem)
    else:
        mem.status = "ACTIVE"

    iosys = db.query(Vendor).filter(Vendor.normalized_name == "iosys", Vendor.is_tenant == True).first()
    if iosys:
        for u in [admin, std_recruiter]:
            acc = db.query(RecruiterCompanyAccess).filter(
                RecruiterCompanyAccess.recruiter_id == u.id,
                RecruiterCompanyAccess.company_id == iosys.id
            ).first()
            if not acc:
                db.add(RecruiterCompanyAccess(recruiter_id=u.id, company_id=iosys.id, status="APPROVED"))

    db.commit()
    return admin, std_recruiter, vendor, existing_vuser


def get_token_for(client: TestClient, email: str, password: str, role: str = "recruiter") -> str:
    endpoint = f"/api/v1/auth/{role}/login"
    resp = client.post(endpoint, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


# ==============================================================================
# VENDOR SIGNUP TESTS
# ==============================================================================

def test_vendor_signup_creates_pending_request_and_not_active_user(client: TestClient, db_session: Session):
    setup_test_actors(db_session)

    unique_email = f"new_vendor_{uuid.uuid4().hex[:6]}@vms.com"
    payload = {
        "company_name": "Apex Staffing Solutions",
        "user_name": "John Apex",
        "email": unique_email,
        "mobile": "+919876543210",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!"
    }

    resp = client.post("/api/v1/auth/vendor/signup", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "PENDING"
    assert data["email"] == unique_email
    assert data["company_name"] == "Apex Staffing Solutions"

    # Verify Database state
    req = db_session.query(VendorSignupRequest).filter(VendorSignupRequest.email == unique_email).first()
    assert req is not None
    assert req.status == "PENDING"
    assert req.normalized_company_name == "apex staffing solutions"
    assert req.password_hash != "SecurePassword123!"
    assert verify_password("SecurePassword123!", req.password_hash) is True
    assert req.vendor_user_id is None

    # CRITICAL: vendor_users record MUST NOT exist yet
    user = db_session.query(VendorUser).filter(VendorUser.email == unique_email).first()
    assert user is None


def test_multiple_users_signup_for_same_company_succeeds(client: TestClient, db_session: Session):
    """
    BUSINESS REQUIREMENT:
    Multiple different users with different email domains (gmail, yahoo, outlook)
    must be able to submit separate signup requests for the SAME Company/Vendor (e.g. Intellect).
    """
    admin, _, _, _ = setup_test_actors(db_session)
    admin_token = get_token_for(client, admin.email, "AdminPass123!", "recruiter")

    company_name = f"Intellect_{uuid.uuid4().hex[:4]}"

    user1_email = f"ravi_{uuid.uuid4().hex[:4]}@gmail.com"
    user2_email = f"priya_{uuid.uuid4().hex[:4]}@yahoo.com"
    user3_email = f"anil_{uuid.uuid4().hex[:4]}@outlook.com"

    # 1. First user signs up for Company
    resp1 = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": company_name,
        "user_name": "Ravi Kumar",
        "email": user1_email,
        "mobile": "+919876543211",
        "password": "RaviPassword123!",
        "confirm_password": "RaviPassword123!"
    })
    assert resp1.status_code == 201
    assert resp1.json()["status"] == "PENDING"

    # 2. Second user signs up for SAME Company (with different email/domain) -> MUST SUCCEED (not Failed to fetch / 500)
    resp2 = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": company_name,
        "user_name": "Priya Sharma",
        "email": user2_email,
        "mobile": "+919876543212",
        "password": "PriyaPassword123!",
        "confirm_password": "PriyaPassword123!"
    })
    assert resp2.status_code == 201
    assert resp2.json()["status"] == "PENDING"

    # 3. Third user signs up for SAME Company -> MUST SUCCEED
    resp3 = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": company_name,
        "user_name": "Anil Reddy",
        "email": user3_email,
        "mobile": "+919876543213",
        "password": "AnilPassword123!",
        "confirm_password": "AnilPassword123!"
    })
    assert resp3.status_code == 201
    assert resp3.json()["status"] == "PENDING"

    req1_id = resp1.json()["request_id"]
    req2_id = resp2.json()["request_id"]
    req3_id = resp3.json()["request_id"]

    # 4. Admin Approves User 1 (Ravi)
    app1 = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req1_id}/approve",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    print("APP1 STATUS:", app1.status_code, "RESPONSE:", app1.text)
    assert app1.status_code == 200

    # 5. Admin Approves User 2 (Priya)
    app2 = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req2_id}/approve",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert app2.status_code == 200

    # 6. Admin Approves User 3 (Anil)
    app3 = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req3_id}/approve",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert app3.status_code == 200

    # 7. Database Verification: EXACTLY ONE Vendor record for this company
    norm_name = " ".join(company_name.strip().split()).lower()
    vendor_records = db_session.query(Vendor).filter(Vendor.normalized_name == norm_name).all()
    assert len(vendor_records) == 1
    shared_vendor = vendor_records[0]

    # 8. All THREE VendorUsers belong to the SAME shared vendor_id
    u1 = db_session.query(VendorUser).filter(VendorUser.email == user1_email).first()
    u2 = db_session.query(VendorUser).filter(VendorUser.email == user2_email).first()
    u3 = db_session.query(VendorUser).filter(VendorUser.email == user3_email).first()

    assert u1 is not None and u2 is not None and u3 is not None
    assert u1.vendor_id == shared_vendor.id
    assert u2.vendor_id == shared_vendor.id
    assert u3.vendor_id == shared_vendor.id
    assert u1.status == "ACTIVE" and u2.status == "ACTIVE" and u3.status == "ACTIVE"

    # 9. All three users can independently log in with their own credentials
    for email, pwd in [
        (user1_email, "RaviPassword123!"),
        (user2_email, "PriyaPassword123!"),
        (user3_email, "AnilPassword123!"),
    ]:
        login_resp = client.post("/api/v1/auth/vendor/login", json={"email": email, "password": pwd})
        assert login_resp.status_code == 200
        assert "access_token" in login_resp.json()


def test_vendor_signup_duplicate_email_rejected(client: TestClient, db_session: Session):
    setup_test_actors(db_session)

    # 1. Attempt signup with existing vendor user email for already active company
    resp = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Existing Vendor LLC",
        "user_name": "Duplicate User",
        "email": "existing_vendor_user@vms.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"].lower()


def test_vendor_signup_duplicate_pending_request_rejected(client: TestClient, db_session: Session):
    setup_test_actors(db_session)

    unique_email = f"pending_dup_{uuid.uuid4().hex[:6]}@vms.com"
    payload = {
        "company_name": "Pending Dup Co",
        "user_name": "Pending User",
        "email": unique_email,
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "Password123!"
    }

    resp1 = client.post("/api/v1/auth/vendor/signup", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/api/v1/auth/vendor/signup", json=payload)
    assert resp2.status_code == 400
    assert "pending signup request already exists" in resp2.json()["detail"].lower()


def test_vendor_signup_validation_failures(client: TestClient, db_session: Session):
    setup_test_actors(db_session)

    # Passwords do not match
    resp1 = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Co",
        "user_name": "User",
        "email": "test_mismatch@vms.com",
        "mobile": "+919876543210",
        "password": "Password123!",
        "confirm_password": "WrongPassword123!"
    })
    assert resp1.status_code == 422

    # Password too short (<8 chars)
    resp2 = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Co",
        "user_name": "User",
        "email": "test_short@vms.com",
        "mobile": "+919876543210",
        "password": "short",
        "confirm_password": "short"
    })
    assert resp2.status_code == 422


# ==============================================================================
# ADMIN APPROVAL & REJECTION TESTS
# ==============================================================================

def test_admin_approvals_authorization(client: TestClient, db_session: Session):
    admin, std, _, _ = setup_test_actors(db_session)
    admin_token = get_token_for(client, admin.email, "AdminPass123!", "recruiter")
    std_token = get_token_for(client, std.email, "StdPass123!", "recruiter")

    # 1. Admin can list vendor signup requests
    resp = client.get("/api/v1/recruiter/vendor-signup-requests", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200

    # 2. Standard recruiter receives 403
    resp_std = client.get("/api/v1/recruiter/vendor-signup-requests", headers={"Authorization": f"Bearer {std_token}"})
    assert resp_std.status_code == 403


def test_admin_approve_vendor_request_end_to_end(client: TestClient, db_session: Session):
    admin, std, _, _ = setup_test_actors(db_session)
    admin_token = get_token_for(client, admin.email, "AdminPass123!", "recruiter")
    std_token = get_token_for(client, std.email, "StdPass123!", "recruiter")

    # 1. Create a pending request
    unique_email = f"approve_test_{uuid.uuid4().hex[:6]}@vms.com"
    client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Nova Tech Partners",
        "user_name": "Nova User",
        "email": unique_email,
        "mobile": "+919876543210",
        "password": "NovaPassword123!",
        "confirm_password": "NovaPassword123!"
    })

    req = db_session.query(VendorSignupRequest).filter(VendorSignupRequest.email == unique_email).first()
    assert req is not None

    # 2. Standard recruiter cannot approve (403)
    resp_std = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req.id}/approve",
        json={},
        headers={"Authorization": f"Bearer {std_token}"}
    )
    assert resp_std.status_code == 403

    # 3. Admin approves request
    resp_admin = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req.id}/approve",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_admin.status_code == 200

    # 4. Verify DB persistence
    db_session.refresh(req)
    assert req.status == "APPROVED"
    assert req.reviewed_by == admin.id
    assert req.vendor_user_id is not None
    assert req.vendor_id is not None

    created_user = db_session.query(VendorUser).filter(VendorUser.id == req.vendor_user_id).first()
    assert created_user is not None
    assert created_user.email == unique_email
    assert created_user.name == "Nova User"
    assert created_user.status == "ACTIVE"
    assert verify_password("NovaPassword123!", created_user.password_hash) is True

    # 5. Double approval prevented
    resp_dup = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req.id}/approve",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_dup.status_code == 400

    # 6. Newly approved vendor user can log in successfully
    vendor_login = client.post("/api/v1/auth/vendor/login", json={
        "email": unique_email,
        "password": "NovaPassword123!"
    })
    assert vendor_login.status_code == 200
    assert "access_token" in vendor_login.json()


def test_admin_reject_vendor_request_end_to_end(client: TestClient, db_session: Session):
    admin, std, _, _ = setup_test_actors(db_session)
    admin_token = get_token_for(client, admin.email, "AdminPass123!", "recruiter")
    std_token = get_token_for(client, std.email, "StdPass123!", "recruiter")

    # 1. Create a pending request
    unique_email = f"reject_test_{uuid.uuid4().hex[:6]}@vms.com"
    client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Reject Co",
        "user_name": "Reject User",
        "email": unique_email,
        "mobile": "+919876543210",
        "password": "RejectPassword123!",
        "confirm_password": "RejectPassword123!"
    })

    req = db_session.query(VendorSignupRequest).filter(VendorSignupRequest.email == unique_email).first()
    assert req is not None

    # 2. Standard recruiter cannot reject (403)
    resp_std = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req.id}/reject",
        json={"reason": "Invalid information"},
        headers={"Authorization": f"Bearer {std_token}"}
    )
    assert resp_std.status_code == 403

    # 3. Admin rejects request
    resp_admin = client.post(
        f"/api/v1/recruiter/vendor-signup-requests/{req.id}/reject",
        json={"reason": "Vendor not verified"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_admin.status_code == 200

    # 4. Verify DB persistence
    db_session.refresh(req)
    assert req.status == "REJECTED"
    assert req.reviewed_by == admin.id
    assert req.rejection_reason == "Vendor not verified"
    assert req.vendor_user_id is None

    # 5. vendor_users record NOT created
    user = db_session.query(VendorUser).filter(VendorUser.email == unique_email).first()
    assert user is None

    # 6. Rejected vendor cannot log in
    login_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": unique_email,
        "password": "RejectPassword123!"
    })
    assert login_resp.status_code == 401


def test_pending_vendor_login_behavior(client: TestClient, db_session: Session):
    setup_test_actors(db_session)

    unique_email = f"pending_login_{uuid.uuid4().hex[:6]}@vms.com"
    client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Pending Login Co",
        "user_name": "Pending User",
        "email": unique_email,
        "mobile": "+919876543210",
        "password": "PendingPass123!",
        "confirm_password": "PendingPass123!"
    })

    # Correct credentials -> 403 with pending message
    login_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": unique_email,
        "password": "PendingPass123!"
    })
    assert login_resp.status_code == 403
    assert "pending approval" in login_resp.json()["detail"].lower()

    # Wrong credentials -> 401
    login_wrong = client.post("/api/v1/auth/vendor/login", json={
        "email": unique_email,
        "password": "WrongPassword123!"
    })
    assert login_wrong.status_code == 401


def test_non_existent_vendor_login_behavior(client: TestClient, db_session: Session):
    # Try logging in with a completely random email address that has no VendorUser record
    random_email = "absolutely_non_existent_vendor_user_email_12345@vms.com"
    resp = client.post("/api/v1/auth/vendor/login", json={
        "email": random_email,
        "password": "AnyPassword123!"
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "No vendor account found. Please create an account first."


def test_multi_company_approval_rejection_isolation(client: TestClient, db_session: Session):
    # 1. Resolve IOSYS and Volantis
    iosys = db_session.query(Vendor).filter(Vendor.normalized_name == "iosys").one()
    volantis = db_session.query(Vendor).filter(Vendor.normalized_name == "volantis").one()

    # Create admin company accesses for seeded admin
    admin = db_session.query(InternalUser).filter(InternalUser.email == "admin_approver@vms.com").first()
    if not admin:
        admin = InternalUser(
            email="admin_approver@vms.com",
            password_hash=hash_password("AdminPass123!"),
            name="Admin Approver",
            mobile="+919876543201",
            role="RECRUITER",
            access_level="ADMIN",
            status="ACTIVE"
        )
        db_session.add(admin)
        db_session.flush()

    from db.models import RecruiterCompanyAccess
    for comp in [iosys, volantis]:
        exists = db_session.query(RecruiterCompanyAccess).filter(
            RecruiterCompanyAccess.recruiter_id == admin.id,
            RecruiterCompanyAccess.company_id == comp.id
        ).first()
        if not exists:
            db_session.add(RecruiterCompanyAccess(recruiter_id=admin.id, company_id=comp.id))
    db_session.commit()

    # 2. Signup vendor
    email = "siddu_test_mc@gmail.com"
    signup_resp = client.post("/api/v1/auth/vendor/signup", json={
        "companies": [str(iosys.id), str(volantis.id)],
        "company_name": "Test ABC Agency",
        "user_name": "siddu_mc",
        "email": email,
        "mobile": "+919876543213",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert signup_resp.status_code == 201
    req_id = signup_resp.json()["request_id"]

    # Assert exactly 1 signup request created
    req_count = db_session.query(VendorSignupRequest).filter(VendorSignupRequest.email == email).count()
    assert req_count == 1

    # 3. Login as IOSYS admin
    login_iosys = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_approver@vms.com",
        "password": "AdminPass123!",
        "company_id": str(iosys.id)
    })
    assert login_iosys.status_code == 200
    headers_iosys = {"Authorization": f"Bearer {login_iosys.json()['access_token']}"}

    # Verify visible in IOSYS pending list
    list_iosys = client.get("/api/v1/recruiter/vendor-signup-requests?status=PENDING", headers=headers_iosys)
    assert list_iosys.status_code == 200
    assert any(x["id"] == req_id for x in list_iosys.json())

    # Approve from IOSYS
    app_resp = client.post(f"/api/v1/recruiter/vendor-signup-requests/{req_id}/approve", headers=headers_iosys)
    assert app_resp.status_code == 200

    # Verify disappears from IOSYS pending list
    list_iosys_after = client.get("/api/v1/recruiter/vendor-signup-requests?status=PENDING", headers=headers_iosys)
    assert not any(x["id"] == req_id for x in list_iosys_after.json())

    # Verify visible in IOSYS approved list
    list_iosys_app = client.get("/api/v1/recruiter/vendor-signup-requests?status=APPROVED", headers=headers_iosys)
    assert any(x["id"] == req_id for x in list_iosys_app.json())

    # 4. Login as Volantis admin
    login_vol = client.post("/api/v1/auth/recruiter/login", json={
        "email": "admin_approver@vms.com",
        "password": "AdminPass123!",
        "company_id": str(volantis.id)
    })
    assert login_vol.status_code == 200
    headers_vol = {"Authorization": f"Bearer {login_vol.json()['access_token']}"}

    # Verify STILL visible in Volantis pending list
    list_vol = client.get("/api/v1/recruiter/vendor-signup-requests?status=PENDING", headers=headers_vol)
    assert any(x["id"] == req_id for x in list_vol.json())

    # Reject from Volantis
    rej_resp = client.post(f"/api/v1/recruiter/vendor-signup-requests/{req_id}/reject", json={"reason": "Not matching"}, headers=headers_vol)
    assert rej_resp.status_code == 200

    # Verify disappears from Volantis pending list
    list_vol_after = client.get("/api/v1/recruiter/vendor-signup-requests?status=PENDING", headers=headers_vol)
    assert not any(x["id"] == req_id for x in list_vol_after.json())

    # Verify visible in Volantis rejected list
    list_vol_rej = client.get("/api/v1/recruiter/vendor-signup-requests?status=REJECTED", headers=headers_vol)
    assert any(x["id"] == req_id for x in list_vol_rej.json())

    # Verify IOSYS remains approved
    list_iosys_final = client.get("/api/v1/recruiter/vendor-signup-requests?status=APPROVED", headers=headers_iosys)
    assert any(x["id"] == req_id for x in list_iosys_final.json())

    # 5. Database check
    db_session.expire_all()
    user_abc = db_session.query(VendorUser).filter(VendorUser.email == email).one()
    # vendor_id remains the agency (is_tenant=False)
    agency_v = db_session.query(Vendor).filter(Vendor.id == user_abc.vendor_id).one()
    assert agency_v.is_tenant is False
    assert agency_v.name == "Test ABC Agency"

    # Only approved memberships created (IOSYS approved, Volantis none)
    from db.models import VendorUserMembership
    mems = db_session.query(VendorUserMembership).filter(VendorUserMembership.vendor_user_id == user_abc.id).all()
    assert len(mems) == 1
    assert mems[0].vendor_id == iosys.id
    assert mems[0].status == "APPROVED"
