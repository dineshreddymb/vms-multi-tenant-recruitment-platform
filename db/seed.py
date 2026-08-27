import os
from argon2 import PasswordHasher
from sqlalchemy import func
from sqlalchemy.orm import Session
from db.models import InternalUser, Department
from db.connection import SessionLocal

ph = PasswordHasher()

def seed_database(db: Session = None):
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        # 1. Seed Initial Admin Recruiter
        is_production = os.getenv("ENV", "").lower() == "production" or os.getenv("PRODUCTION", "").lower() == "true"
        admin_email_env = os.getenv("INITIAL_ADMIN_EMAIL")
        
        if is_production and not admin_email_env:
            raise ValueError("INITIAL_ADMIN_EMAIL environment variable must be explicitly configured in production environment.")
            
        admin_email = (admin_email_env or "mbdineshreddy@gmail.com").strip()
        admin_password = os.getenv("INITIAL_ADMIN_PASSWORD")

        existing_admin = db.query(InternalUser).filter(
            func_lower_email_eq(InternalUser.email, admin_email)
        ).first()

        if not existing_admin:
            if not admin_password:
                raise ValueError("INITIAL_ADMIN_PASSWORD environment variable must be set to seed the database.")
            
            hashed_password = ph.hash(admin_password)
            initial_admin = InternalUser(
                email=admin_email,
                password_hash=hashed_password,
                name="Dinesh MB",
                mobile="+919876543210",
                role="RECRUITER",
                access_level="ADMIN",
                status="ACTIVE"
            )
            db.add(initial_admin)
            print(f"Seeded initial Admin Recruiter: {admin_email}")
        else:
            existing_admin.name = "Dinesh MB"
            existing_admin.role = "RECRUITER"
            existing_admin.access_level = "ADMIN"
            existing_admin.status = "ACTIVE"
            print(f"Initial Admin Recruiter {admin_email} already exists. Ensuring details are correct without modifying password.")

        # 2. Seed Default Departments
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
                print(f"Seeded department: {dept_data['name']}")

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        if should_close:
            db.close()

def func_lower_email_eq(column, email):
    # helper for email comparison
    return func.lower(column) == email.strip().lower()

if __name__ == "__main__":
    seed_database()
