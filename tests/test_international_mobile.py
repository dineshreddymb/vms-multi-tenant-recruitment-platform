import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from uuid import uuid4

from backend.schemas import (
    RecruiterSignupRequestSchema,
    VendorSignupRequestSchema,
    VendorUserProvisionSchema,
    VendorProfileUpdateSchema,
    SubmissionCreateSchema,
    PAN_REGEX,
    validate_international_mobile,
    validate_mobile_with_legacy_fallback
)
from db.models import InternalUser, Vendor, VendorUser, VendorUserMembership
from backend.auth import hash_password, create_access_token


VALID_INTERNATIONAL_NUMBERS = [
    "+91 9988776655",   # India
    "+1 2025550123",    # USA
    "+44 7700900123",   # UK
    "+61 412345678",    # Australia
    "+971 501234567",   # UAE
    "+919876543210",    # Without formatting spaces
    "+1-202-555-0123",  # With hyphens
]

INVALID_NUMBERS = [
    "1234567890",        # Missing '+'
    "abcdefghijk",       # Non-digits
    "++919988777655",    # Multiple '+'
    "+",                 # Only '+'
    "+ ",                # '+' followed by space
    "+abc123",           # Letters in phone
    "+0123456789",       # Invalid country code (starts with 0)
    "+12345",            # Too short (< 7 digits)
    "+12345678901234567" # Too long (> 15 digits)
]


def test_schema_international_mobile_validation():
    for num in VALID_INTERNATIONAL_NUMBERS:
        assert validate_international_mobile(num) == num.strip()

    for num in INVALID_NUMBERS:
        with pytest.raises(ValueError):
            validate_international_mobile(num)


def test_schema_recruiter_signup():
    for num in VALID_INTERNATIONAL_NUMBERS:
        schema = RecruiterSignupRequestSchema(
            full_name="Recruiter User",
            email=f"rec_intl_{uuid4().hex[:4]}@corp.com",
            mobile=num,
            password="Password123!",
            confirm_password="Password123!"
        )
        assert schema.mobile == num.strip()

    for num in INVALID_NUMBERS:
        with pytest.raises(ValueError):
            RecruiterSignupRequestSchema(
                full_name="Recruiter User",
                email=f"rec_intl_{uuid4().hex[:4]}@corp.com",
                mobile=num,
                password="Password123!",
                confirm_password="Password123!"
            )


def test_schema_vendor_signup():
    for num in VALID_INTERNATIONAL_NUMBERS:
        schema = VendorSignupRequestSchema(
            company_name="Acme Staffing",
            user_name="Vendor Representative",
            email=f"vendor_intl_{uuid4().hex[:4]}@corp.com",
            mobile=num,
            password="Password123!",
            confirm_password="Password123!"
        )
        assert schema.mobile == num.strip()

    for num in INVALID_NUMBERS:
        with pytest.raises(ValueError):
            VendorSignupRequestSchema(
                company_name="Acme Staffing",
                user_name="Vendor Representative",
                email=f"vendor_intl_{uuid4().hex[:4]}@corp.com",
                mobile=num,
                password="Password123!",
                confirm_password="Password123!"
            )


def test_schema_vendor_user_provision():
    for num in VALID_INTERNATIONAL_NUMBERS:
        schema = VendorUserProvisionSchema(
            name="Provisioned Rep",
            email=f"prov_intl_{uuid4().hex[:4]}@corp.com",
            mobile=num,
            password="Password123!"
        )
        assert schema.mobile == num.strip()

    for num in INVALID_NUMBERS:
        with pytest.raises(ValueError):
            VendorUserProvisionSchema(
                name="Provisioned Rep",
                email=f"prov_intl_{uuid4().hex[:4]}@corp.com",
                mobile=num,
                password="Password123!"
            )


def test_schema_vendor_profile_update_backward_compatibility():
    for num in VALID_INTERNATIONAL_NUMBERS:
        schema = VendorProfileUpdateSchema(name="Updated Name", mobile=num)
        assert schema.mobile == num.strip()

    legacy_numbers = ["9988776655", "9876543210", "09876543210"]
    for num in legacy_numbers:
        schema = VendorProfileUpdateSchema(name="Updated Name", mobile=num)
        assert schema.mobile == num.strip()

    for num in INVALID_NUMBERS:
        with pytest.raises(ValueError):
            VendorProfileUpdateSchema(name="Updated Name", mobile=num)


def test_api_recruiter_signup_international_mobile(client: TestClient, db_session: Session):
    for i, num in enumerate(VALID_INTERNATIONAL_NUMBERS[:3]):
        resp = client.post("/api/v1/auth/recruiter/signup", json={
            "full_name": f"International Recruiter {i}",
            "email": f"intl_rec_{i}_{uuid4().hex[:6]}@example.com",
            "mobile": num,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        assert resp.status_code == 201
        assert resp.json()["status"] == "PENDING"

    resp_invalid = client.post("/api/v1/auth/recruiter/signup", json={
        "full_name": "Invalid Recruiter",
        "email": f"invalid_rec_{uuid4().hex[:6]}@example.com",
        "mobile": "1234567890",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert resp_invalid.status_code == 422


def test_api_vendor_signup_international_mobile(client: TestClient, db_session: Session):
    for i, num in enumerate(VALID_INTERNATIONAL_NUMBERS[:3]):
        resp = client.post("/api/v1/auth/vendor/signup", json={
            "company_name": f"Agency Intl {i}_{uuid4().hex[:4]}",
            "user_name": f"Agency User {i}",
            "email": f"intl_vendor_{i}_{uuid4().hex[:6]}@example.com",
            "mobile": num,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        assert resp.status_code == 201
        assert resp.json()["status"] == "PENDING"

    resp_invalid = client.post("/api/v1/auth/vendor/signup", json={
        "company_name": "Invalid Agency",
        "user_name": "Invalid User",
        "email": f"invalid_vendor_{uuid4().hex[:6]}@example.com",
        "mobile": "++919988777655",
        "password": "Password123!",
        "confirm_password": "Password123!"
    })
    assert resp_invalid.status_code == 422


def test_api_vendor_profile_update_and_legacy_fallback(client: TestClient, db_session: Session):
    v = Vendor(name=f"Vendor Intl {uuid4().hex[:4]}", normalized_name=f"vendor intl {uuid4().hex[:4]}")
    db_session.add(v)
    db_session.flush()

    legacy_mobile = "9988776655"
    user = VendorUser(
        vendor_id=v.id,
        email=f"legacy_vuser_{uuid4().hex[:6]}@example.com",
        password_hash=hash_password("Password123!"),
        name="Legacy Vendor User",
        mobile=legacy_mobile,
        status="ACTIVE"
    )
    db_session.add(user)
    db_session.flush()

    m = VendorUserMembership(
        vendor_user_id=user.id,
        vendor_id=v.id,
        status="ACTIVE"
    )
    db_session.add(m)
    db_session.commit()

    login_resp = client.post("/api/v1/auth/vendor/login", json={
        "email": user.email,
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp_legacy = client.patch("/api/v1/vendor/profile", json={
        "name": "Legacy Name Updated",
        "mobile": legacy_mobile
    }, headers=headers)
    assert resp_legacy.status_code == 200
    assert resp_legacy.json()["mobile"] == legacy_mobile

    resp_intl = client.patch("/api/v1/vendor/profile", json={
        "name": "International Name Updated",
        "mobile": "+1 2025550123"
    }, headers=headers)
    assert resp_intl.status_code == 200
    assert resp_intl.json()["mobile"] == "+1 2025550123"

    resp_bad = client.patch("/api/v1/vendor/profile", json={
        "name": "Bad Name",
        "mobile": "abcdefghijk"
    }, headers=headers)
    assert resp_bad.status_code == 422


def test_candidate_submission_mobile_validation_preserved():
    # Verify that Candidate Submission contact_number continues to require Indian mobile numbers
    # An international number like +1 2025550123 must be rejected for candidate submissions
    with pytest.raises(ValueError, match="Invalid Indian mobile number"):
        SubmissionCreateSchema(
            cv_sent_date="2025-01-01",
            employment_mode="Perm",
            role_id=uuid4(),
            job_id="JOB-001",
            name="Candidate John",
            email="cand@example.com",
            contact_number="+1 2025550123",
            current_company="Tech",
            total_experience=5.0,
            relevant_experience=3.0,
            notice_period="30",
            ctc=1000000,
            ectc=1500000,
            current_location="Bangalore",
            preferred_location="Bangalore",
            education="B.Tech",
            about="About candidate",
            pan="ABCDE1234F",
            linkedin_url="https://linkedin.com/in/cand",
            resume_id=uuid4()
        )

    # Valid Indian mobile number should be accepted
    valid_sub = SubmissionCreateSchema(
        cv_sent_date="2025-01-01",
        employment_mode="Perm",
        role_id=uuid4(),
        job_id="JOB-001",
        name="Candidate John",
        email="cand@example.com",
        contact_number="+919876543210",
        current_company="Tech",
        total_experience=5.0,
        relevant_experience=3.0,
        notice_period="30",
        ctc=1000000,
        ectc=1500000,
        current_location="Bangalore",
        preferred_location="Bangalore",
        education="B.Tech",
        about="About candidate",
        pan="ABCDE1234F",
        linkedin_url="https://linkedin.com/in/cand",
        resume_id=uuid4()
    )
    assert valid_sub.contact_number == "+919876543210"


def test_pan_rules_preserved():
    assert bool(PAN_REGEX.match("ABCDE1234F")) is True
    assert bool(PAN_REGEX.match("12345ABCDE")) is False
