import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db.models import (
    InternalUser,
    Vendor,
    VendorUser,
    VendorUserMembership,
    Department,
    JobRole,
    Candidate,
    Submission,
    RecruiterCompanyAccess
)
from backend.auth import hash_password
from db.crypto import get_pan_fingerprint, encrypt_pan


def test_e2e_001_dynamic_client_organization_recognition(client: TestClient, db_session: Session):
    """
    VMS-E2E-001 Verification:
    Verify that tenant recognition is fully dynamic based on `Vendor.is_tenant` flag in the DB,
    without any hardcoded company names.
    """
    # 1. Create a dynamic new Client Organization
    tenant_name = f"DynamicClient_{uuid.uuid4().hex[:6]}"
    dynamic_tenant = Vendor(
        name=tenant_name,
        normalized_name=tenant_name.lower(),
        is_tenant=True
    )
    # 2. Create a standard Vendor Agency
    agency_name = f"StandardAgency_{uuid.uuid4().hex[:6]}"
    standard_agency = Vendor(
        name=agency_name,
        normalized_name=agency_name.lower(),
        is_tenant=False
    )
    db_session.add_all([dynamic_tenant, standard_agency])
    db_session.commit()

    # 3. Create a recruiter mapped to the dynamic client organization
    rec_email = f"rec_dynamic_{uuid.uuid4().hex[:6]}@vms.com"
    recruiter = InternalUser(
        email=rec_email,
        password_hash=hash_password("Password123!"),
        name="Dynamic Client Recruiter",
        mobile="+919876543210",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add(recruiter)
    db_session.flush()

    access = RecruiterCompanyAccess(
        recruiter_id=recruiter.id,
        company_id=dynamic_tenant.id,
        status="APPROVED"
    )
    db_session.add(access)
    db_session.commit()

    # Login as recruiter for dynamic tenant
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": rec_email,
        "password": "Password123!",
        "company_id": str(dynamic_tenant.id)
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # /api/v1/recruiter/me must return dynamic tenant in its companies list
    me_resp = client.get("/api/v1/recruiter/me", headers=headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    comp_names = [c["company_name"] for c in me_data["companies"]]
    assert tenant_name in comp_names
    assert agency_name not in comp_names


def test_e2e_002_strict_cross_tenant_authorization_enforcement(client: TestClient, db_session: Session):
    """
    VMS-E2E-002 Verification:
    Verify that recruiter cross-tenant access is strictly blocked with 403 Forbidden
    in all environments without any testing bypasses.
    """
    # Create two isolated tenants
    t1_name = f"TenantAlpha_{uuid.uuid4().hex[:4]}"
    tenant_1 = Vendor(name=t1_name, normalized_name=t1_name.lower(), is_tenant=True)
    t2_name = f"TenantBeta_{uuid.uuid4().hex[:4]}"
    tenant_2 = Vendor(name=t2_name, normalized_name=t2_name.lower(), is_tenant=True)
    db_session.add_all([tenant_1, tenant_2])
    db_session.commit()

    # Create Recruiter 1 (Tenant 1 only)
    r1_email = f"r1_iso_{uuid.uuid4().hex[:6]}@vms.com"
    r1 = InternalUser(
        email=r1_email,
        password_hash=hash_password("Password123!"),
        name="Recruiter Alpha",
        mobile="+919876543211",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add(r1)
    db_session.flush()
    db_session.add(RecruiterCompanyAccess(recruiter_id=r1.id, company_id=tenant_1.id, status="APPROVED"))
    db_session.commit()

    # Create a job role under Tenant 2
    dept = db_session.query(Department).filter(Department.status == "ACTIVE").first()
    if not dept:
        dept = Department(name="General", status="ACTIVE")
        db_session.add(dept)
        db_session.commit()

    role_beta = JobRole(
        department_id=dept.id,
        vendor_id=tenant_2.id,
        title=f"Beta Role {uuid.uuid4().hex[:4]}",
        job_id=f"JOB-BETA-{uuid.uuid4().hex[:4]}",
        status="ACTIVE"
    )
    db_session.add(role_beta)
    db_session.commit()

    # Login as Recruiter 1
    r1_login = client.post("/api/v1/auth/recruiter/login", json={
        "email": r1_email,
        "password": "Password123!",
        "company_id": str(tenant_1.id)
    })
    assert r1_login.status_code == 200
    r1_headers = {"Authorization": f"Bearer {r1_login.json()['access_token']}"}

    # Recruiter 1 attempts to deactivate Tenant 2's role -> MUST be 403 Forbidden
    deact_resp = client.post(f"/api/v1/recruiter/job-roles/{role_beta.id}/deactivate", headers=r1_headers)
    assert deact_resp.status_code == 403
    assert "Unauthorized company access" in deact_resp.json()["detail"]


def test_e2e_003_strict_platform_wide_admin_limit(client: TestClient, db_session: Session):
    """
    VMS-E2E-003 Verification:
    Verify that the system strictly enforces a platform-wide maximum of 2 ACTIVE ADMIN Recruiters
    across all client organizations combined.
    """
    iosys = db_session.query(Vendor).filter(Vendor.normalized_name == "iosys", Vendor.is_tenant == True).first()
    volantis = db_session.query(Vendor).filter(Vendor.normalized_name == "volantis", Vendor.is_tenant == True).first()

    # Ensure clean slate of active admins in DB
    existing_admins = db_session.query(InternalUser).filter(
        InternalUser.role == "RECRUITER",
        InternalUser.access_level == "ADMIN",
        InternalUser.status == "ACTIVE"
    ).all()

    # Create Admin 1 (IOSYS)
    a1_email = f"e2e_admin1_{uuid.uuid4().hex[:6]}@vms.com"
    a1 = InternalUser(
        email=a1_email,
        password_hash=hash_password("AdminPass123!"),
        name="Admin One",
        mobile="+919876543201",
        role="RECRUITER",
        access_level="ADMIN",
        status="ACTIVE"
    )
    # Create Admin 2 (Volantis)
    a2_email = f"e2e_admin2_{uuid.uuid4().hex[:6]}@vms.com"
    a2 = InternalUser(
        email=a2_email,
        password_hash=hash_password("AdminPass123!"),
        name="Admin Two",
        mobile="+919876543202",
        role="RECRUITER",
        access_level="ADMIN",
        status="ACTIVE"
    )
    # Create Standard Recruiter Candidate for promotion
    std_email = f"e2e_std_{uuid.uuid4().hex[:6]}@vms.com"
    std_rec = InternalUser(
        email=std_email,
        password_hash=hash_password("StdPass123!"),
        name="Standard Recruiter",
        mobile="+919876543203",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )

    # Deactivate or demote other existing admins temporarily so we have exactly 2 active
    for ea in existing_admins:
        ea.access_level = "STANDARD"
    db_session.add_all([a1, a2, std_rec])
    db_session.flush()

    if iosys:
        db_session.add(RecruiterCompanyAccess(recruiter_id=a1.id, company_id=iosys.id, status="APPROVED"))
        db_session.add(RecruiterCompanyAccess(recruiter_id=std_rec.id, company_id=iosys.id, status="APPROVED"))
    if volantis:
        db_session.add(RecruiterCompanyAccess(recruiter_id=a2.id, company_id=volantis.id, status="APPROVED"))
    db_session.commit()

    # Login as Admin 1
    login_resp = client.post("/api/v1/auth/recruiter/login", json={
        "email": a1_email,
        "password": "AdminPass123!",
        "company_id": str(iosys.id) if iosys else None
    })
    assert login_resp.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Attempt to promote Standard Recruiter to 3rd Admin globally -> MUST return 409 Conflict
    promote_resp = client.post(
        f"/api/v1/recruiter/admins/{std_rec.recruiter_reference}/grant",
        headers=admin_headers
    )
    assert promote_resp.status_code == 409
    assert "Maximum limit of 2 ACTIVE ADMIN Recruiters has been reached" in promote_resp.json()["detail"]
