import os
import uuid
from argon2 import PasswordHasher
from sqlalchemy import func
from sqlalchemy.orm import Session
from db.models import InternalUser, Department, Vendor, RecruiterCompanyAccess
from db.connection import SessionLocal

ph = PasswordHasher()

def func_lower_email_eq(column, email):
    return func.lower(column) == email.strip().lower()

def seed_database(db: Session = None):
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        # 1. Ensure Canonical Tenant Companies Exist
        iosys_vendor = db.query(Vendor).filter(Vendor.normalized_name == "iosys").first()
        if not iosys_vendor:
            iosys_vendor = Vendor(
                name="IOSYS",
                normalized_name="iosys",
                is_tenant=True
            )
            db.add(iosys_vendor)
            db.flush()

        volantis_vendor = db.query(Vendor).filter(Vendor.normalized_name == "volantis").first()
        if not volantis_vendor:
            volantis_vendor = Vendor(
                name="Volantis",
                normalized_name="volantis",
                is_tenant=True
            )
            db.add(volantis_vendor)
            db.flush()

        # 2. Seed / Update IOSYS Admin
        iosys_email = (os.getenv("IOSYS_ADMIN_EMAIL") or os.getenv("INITIAL_ADMIN_EMAIL") or "deepti.v@iosyssoftware.com").strip().lower()
        iosys_password = os.getenv("IOSYS_ADMIN_PASSWORD") or os.getenv("INITIAL_ADMIN_PASSWORD") or "deepti.v@2026"

        volantis_email_raw = os.getenv("VOLANTIS_ADMIN_EMAIL") or "deepti.v@volantis.com"
        volantis_email = volantis_email_raw.strip().lower() if volantis_email_raw and volantis_email_raw.strip() else None
        volantis_password = os.getenv("VOLANTIS_ADMIN_PASSWORD") or "deepti.v@2026"

        # Demote any legacy admin users not matching the configured tenant admins
        allowed_admin_emails = [e for e in [iosys_email, volantis_email] if e]
        legacy_admins = db.query(InternalUser).filter(
            InternalUser.access_level == "ADMIN",
            ~func.lower(InternalUser.email).in_(allowed_admin_emails)
        ).all()
        for la in legacy_admins:
            la.access_level = "STANDARD"
        db.flush()

        iosys_admin = db.query(InternalUser).filter(
            func_lower_email_eq(InternalUser.email, iosys_email)
        ).first()

        if not iosys_admin:
            iosys_admin = InternalUser(
                email=iosys_email,
                password_hash=ph.hash(iosys_password),
                name="Deepti V",
                mobile="+919876543210",
                role="RECRUITER",
                access_level="ADMIN",
                status="ACTIVE",
                recruiter_reference=f"REC-{uuid.uuid4().hex[:6].upper()}"
            )
            db.add(iosys_admin)
            db.flush()
            print(f"Seeded IOSYS Admin: {iosys_email}")
        else:
            iosys_admin.role = "RECRUITER"
            iosys_admin.access_level = "ADMIN"
            iosys_admin.status = "ACTIVE"
            if iosys_password:
                iosys_admin.password_hash = ph.hash(iosys_password)
            db.flush()
            print(f"Updated IOSYS Admin: {iosys_email}")

        # Map IOSYS Admin strictly to IOSYS (remove non-IOSYS access)
        db.query(RecruiterCompanyAccess).filter(
            RecruiterCompanyAccess.recruiter_id == iosys_admin.id,
            RecruiterCompanyAccess.company_id != iosys_vendor.id
        ).delete(synchronize_session=False)

        iosys_access = db.query(RecruiterCompanyAccess).filter(
            RecruiterCompanyAccess.recruiter_id == iosys_admin.id,
            RecruiterCompanyAccess.company_id == iosys_vendor.id
        ).first()
        if not iosys_access:
            db.add(RecruiterCompanyAccess(
                recruiter_id=iosys_admin.id,
                company_id=iosys_vendor.id,
                status="APPROVED"
            ))

        # 3. Seed / Update Volantis Admin (if configured via env)
        if volantis_email:

            volantis_admin = db.query(InternalUser).filter(
                func_lower_email_eq(InternalUser.email, volantis_email)
            ).first()

            if not volantis_admin:
                volantis_admin = InternalUser(
                    email=volantis_email,
                    password_hash=ph.hash(volantis_password),
                    name="Deepti V",
                    mobile="+919876543210",
                    role="RECRUITER",
                    access_level="ADMIN",
                    status="ACTIVE",
                    recruiter_reference=f"REC-{uuid.uuid4().hex[:6].upper()}"
                )
                db.add(volantis_admin)
                db.flush()
                print(f"Seeded Volantis Admin: {volantis_email}")
            else:
                volantis_admin.role = "RECRUITER"
                volantis_admin.access_level = "ADMIN"
                volantis_admin.status = "ACTIVE"
                if volantis_password:
                    volantis_admin.password_hash = ph.hash(volantis_password)
                db.flush()
                print(f"Updated Volantis Admin: {volantis_email}")

            # Map Volantis Admin strictly to Volantis (remove non-Volantis access)
            db.query(RecruiterCompanyAccess).filter(
                RecruiterCompanyAccess.recruiter_id == volantis_admin.id,
                RecruiterCompanyAccess.company_id != volantis_vendor.id
            ).delete(synchronize_session=False)

            volantis_access = db.query(RecruiterCompanyAccess).filter(
                RecruiterCompanyAccess.recruiter_id == volantis_admin.id,
                RecruiterCompanyAccess.company_id == volantis_vendor.id
            ).first()
            if not volantis_access:
                db.add(RecruiterCompanyAccess(
                    recruiter_id=volantis_admin.id,
                    company_id=volantis_vendor.id,
                    status="APPROVED"
                ))

        # 4. Seed Default Departments
        departments = [
            {"name": "Engineering", "status": "ACTIVE"},
            {"name": "Product Management", "status": "ACTIVE"},
            {"name": "Design", "status": "ACTIVE"},
            {"name": "Sales & Marketing", "status": "ACTIVE"}
        ]

        for dept_data in departments:
            existing_dept = db.query(Department).filter(
                Department.name == dept_data["name"]
            ).first()
            if not existing_dept:
                dept = Department(
                    name=dept_data["name"],
                    status=dept_data["status"]
                )
                db.add(dept)

        db.commit()
        print("Database seed completed successfully with isolated tenant admin privileges.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        if should_close:
            db.close()

if __name__ == "__main__":
    seed_database()
