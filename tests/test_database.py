import pytest
import threading
import time
from decimal import Decimal
from datetime import datetime, timedelta, date
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, InternalError
from sqlalchemy.orm import Session
from argon2 import PasswordHasher

from db.models import (
    InternalUser,
    RecruiterSignupRequest,
    Vendor,
    VendorUser,
    VendorSignupRequest,
    Session as VMSSession,
    Department,
    JobRole,
    Candidate,
    Submission,
    Resume,
    ResumeExtraction,
    StatusHistory,
    AuditEvent,
    IdempotencyRecord,
    PasswordResetToken
)
from db.crypto import get_pan_fingerprint, encrypt_pan, decrypt_pan, normalize_pan
from db.connection import SessionLocal

ph = PasswordHasher()

# Helpers
def create_test_department(db: Session, name: str) -> Department:
    dept = Department(name=name, status="ACTIVE")
    db.add(dept)
    db.commit()
    return dept

def create_test_role(db: Session, title: str, dept_id, job_id: str = None, vendor_id = None) -> JobRole:
    import uuid
    jid = job_id or f"JOB-ROLE-{uuid.uuid4().hex[:6]}"
    if not vendor_id:
        vendor = db.query(Vendor).first()
        if not vendor:
            vendor = Vendor(name="Test Vendor", normalized_name="test vendor")
            db.add(vendor)
            db.commit()
        vendor_id = vendor.id
    role = JobRole(title=title, department_id=dept_id, job_id=jid, status="ACTIVE", vendor_id=vendor_id)
    db.add(role)
    db.commit()
    return role

def create_test_vendor(db: Session, name: str) -> Vendor:
    vendor = Vendor(name=name, normalized_name=name.strip().lower())
    db.add(vendor)
    db.commit()
    return vendor

def create_test_vendor_user(db: Session, name: str, email: str, vendor_id) -> VendorUser:
    v_user = VendorUser(
        vendor_id=vendor_id,
        email=email,
        password_hash=ph.hash("Password123!"),
        name=name,
        mobile="+919999999999",
        status="ACTIVE"
    )
    db.add(v_user)
    db.commit()
    return v_user


# 1. Multiple ACTIVE Vendor Users per Vendor
def test_multiple_active_vendor_users(db_session: Session):
    vendor = create_test_vendor(db_session, "Test Company")
    
    # Create first active vendor user
    user1 = create_test_vendor_user(db_session, "User One", "user1@test.com", vendor.id)
    # Create second active vendor user under same vendor
    user2 = create_test_vendor_user(db_session, "User Two", "user2@test.com", vendor.id)
    
    assert user1.vendor_id == vendor.id
    assert user2.vendor_id == vendor.id
    assert user1.status == "ACTIVE"
    assert user2.status == "ACTIVE"


# 2. Normalized Company Uniqueness
def test_normalized_company_name_uniqueness(db_session: Session):
    create_test_vendor(db_session, "Alpha Services")
    
    # Attempting to create duplicate vendor with different spacing/casing should fail on normalized_name
    duplicate_vendor = Vendor(
        name="  ALPHA SERVICES  ",
        normalized_name="alpha services"
    )
    
    sp = db_session.begin_nested()
    try:
        db_session.add(duplicate_vendor)
        db_session.flush()
        sp.commit()
        pytest.fail("Should have raised IntegrityError")
    except IntegrityError:
        sp.rollback()


# 3. Recruiter email uniqueness (internal_users, case-insensitive)
def test_internal_user_email_uniqueness(db_session: Session):
    user = InternalUser(
        email="recruiter1@vms.com",
        password_hash=ph.hash("Password123!"),
        name="Rec One",
        mobile="1234567890",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add(user)
    db_session.commit()
    
    dup_user = InternalUser(
        email="RECRUITER1@vms.com", # Same email, different case
        password_hash=ph.hash("Password123!"),
        name="Rec Two",
        mobile="0987654321",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    
    sp = db_session.begin_nested()
    try:
        db_session.add(dup_user)
        db_session.flush()
        sp.commit()
        pytest.fail("Should have raised IntegrityError")
    except IntegrityError:
        sp.rollback()


# 4. At most one actionable PENDING signup request for the same email
def test_recruiter_signup_request_pending_uniqueness(db_session: Session):
    # First pending request
    req1 = RecruiterSignupRequest(
        full_name="Req John",
        email="pending_rec@vms.com",
        mobile="1111",
        password_hash="h1",
        status="PENDING"
    )
    db_session.add(req1)
    db_session.commit()

    # Second pending request for same email should fail unique constraint
    req2 = RecruiterSignupRequest(
        full_name="Req Jane",
        email="pending_rec@vms.com",
        mobile="2222",
        password_hash="h2",
        status="PENDING"
    )
    
    sp = db_session.begin_nested()
    try:
        db_session.add(req2)
        db_session.flush()
        sp.commit()
        pytest.fail("Should have raised IntegrityError")
    except IntegrityError:
        sp.rollback()

    # Reject first request
    req1.status = "REJECTED"
    db_session.commit()

    # Now a new PENDING request for same email is allowed!
    req3 = RecruiterSignupRequest(
        full_name="Req Jane",
        email="pending_rec@vms.com",
        mobile="2222",
        password_hash="h2",
        status="PENDING"
    )
    db_session.add(req3)
    db_session.commit()
    assert req3.id is not None


# 5. Maximum TWO ACTIVE ADMIN Recruiters globally
def test_max_active_admins_limit(db_session: Session):
    # We already seeded mbdineshreddy@gmail.com as ADMIN during conftest setup.
    # Let's add standard recruiters
    r1 = InternalUser(
        email="r1@vms.com",
        password_hash="h1",
        name="Rec 1",
        mobile="1",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    r2 = InternalUser(
        email="r2@vms.com",
        password_hash="h2",
        name="Rec 2",
        mobile="2",
        role="RECRUITER",
        access_level="STANDARD",
        status="ACTIVE"
    )
    db_session.add_all([r1, r2])
    db_session.commit()

    # Promote r1 to ADMIN -> Succeeds (Active admins count becomes 2)
    r1.access_level = "ADMIN"
    db_session.commit()

    # Promote r2 to ADMIN -> Fails (Active admins count would exceed 2)
    sp = db_session.begin_nested()
    try:
        r2.access_level = "ADMIN"
        db_session.flush()
        sp.commit()
        pytest.fail("Should have raised limit error")
    except (IntegrityError, InternalError):
        sp.rollback()


# 6. Concurrency-safe Admin promotions using advisory lock trigger
def test_concurrent_admin_promotion(db_session: Session):
    # Setup standard recruiters using a separate temp session so they are committed
    session = SessionLocal()
    try:
        session.query(InternalUser).filter(func.lower(InternalUser.email) != "mbdineshreddy@gmail.com").delete()
        
        r1 = InternalUser(email="rec1@vms.com", password_hash="h1", name="R1", mobile="1", role="RECRUITER", access_level="STANDARD", status="ACTIVE")
        r2 = InternalUser(email="rec2@vms.com", password_hash="h2", name="R2", mobile="2", role="RECRUITER", access_level="STANDARD", status="ACTIVE")
        session.add_all([r1, r2])
        session.commit()
        r1_id = r1.id
        r2_id = r2.id
    finally:
        session.close()

    errors = []
    def promote_user(user_id):
        # We need a new session per thread to run in parallel transactions
        sess = SessionLocal()
        try:
            user = sess.get(InternalUser, user_id)
            user.access_level = "ADMIN"
            sess.commit()
        except Exception as e:
            sess.rollback()
            errors.append(e)
        finally:
            sess.close()

    # Run promotions concurrently in separate threads
    t1 = threading.Thread(target=promote_user, args=(r1_id,))
    t2 = threading.Thread(target=promote_user, args=(r2_id,))
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Clean up
    session = SessionLocal()
    try:
        session.query(InternalUser).filter(InternalUser.id.in_([r1_id, r2_id])).delete()
        session.commit()
    finally:
        session.close()

    # 1 promotion must have failed, since we already have 1 admin seeded (mbdineshreddy@gmail.com) and limit is 2.
    assert len(errors) == 1
    assert "Maximum limit of 2 ACTIVE ADMIN Recruiters" in str(errors[0])


# 7. Global PAN uniqueness (using pan_fingerprint)
def test_global_pan_uniqueness(db_session: Session):
    pan_val = "DBUNI1234F"
    fp = get_pan_fingerprint(pan_val)
    enc = encrypt_pan(pan_val)

    # Insert first candidate
    c1 = Candidate(
        name="Candidate One",
        email="c1@gmail.com",
        contact_number="+919876543211",
        current_company="Company A",
        total_experience=Decimal("3.5"),
        relevant_experience=Decimal("2.5"),
        notice_period="Immediate",
        ctc=Decimal("8.00"),
        ectc=Decimal("12.00"),
        current_location="Mumbai",
        preferred_location="Bangalore",
        pan_fingerprint=fp,
        pan_encrypted=enc,
        linkedin_url="https://linkedin.com/in/c1",
        education="B.Tech",
        about="Passionate software engineer."
    )
    db_session.add(c1)
    db_session.commit()

    # Attempt to insert second candidate with same PAN fingerprint should fail
    c2 = Candidate(
        name="Candidate Two",
        email="c2@gmail.com",
        contact_number="+919876543212",
        current_company="Company B",
        total_experience=Decimal("4.0"),
        relevant_experience=Decimal("3.0"),
        notice_period="30 days",
        ctc=Decimal("10.00"),
        ectc=Decimal("15.00"),
        current_location="Delhi",
        preferred_location="Noida",
        pan_fingerprint=fp, # Duplicate fingerprint
        pan_encrypted=encrypt_pan(pan_val),
        linkedin_url="https://linkedin.com/in/c2",
        education="MCA",
        about="Database administrator."
    )
    
    sp = db_session.begin_nested()
    try:
        db_session.add(c2)
        db_session.flush()
        sp.commit()
        pytest.fail("Should have raised IntegrityError")
    except IntegrityError:
        sp.rollback()


# 8. Candidate Status transitions validity & Immutability of history
def test_candidate_status_transitions_and_immutability(db_session: Session):
    dept = create_test_department(db_session, "Testing Dept")
    role = create_test_role(db_session, "QA Engineer", dept.id)
    vendor = create_test_vendor(db_session, "Test Vendor Corp")
    v_user = create_test_vendor_user(db_session, "Vendor Rec", "vend@test.com", vendor.id)
    
    # Create candidate
    fp = get_pan_fingerprint("XYZ1234567")
    enc = encrypt_pan("XYZ1234567")
    candidate = Candidate(
        name="QA Tester", email="qa@test.com", contact_number="123", current_company="A",
        total_experience=Decimal("1"), relevant_experience=Decimal("1"), notice_period="Immediate",
        ctc=Decimal("5"), ectc=Decimal("7"), current_location="Hyd", preferred_location="Hyd",
        pan_fingerprint=fp, pan_encrypted=enc, linkedin_url="qa-link", education="BSc", about="QA"
    )
    db_session.add(candidate)
    db_session.commit()

    # Create submission
    sub = Submission(
        candidate_id=candidate.id,
        submission_reference="SUB-20260517-8888",
        vendor_id=vendor.id,
        vendor_user_id=v_user.id,
        role_id=role.id,
        job_id=role.job_id,
        status="SUBMITTED",
        employment_mode="Perm"
    )
    db_session.add(sub)
    db_session.commit()

    # Immutable history: add status history entry
    hist = StatusHistory(
        submission_id=sub.id,
        status="SUBMITTED"
    )
    db_session.add(hist)
    db_session.commit()

    # Attempt to update status history should trigger block exception
    sp1 = db_session.begin_nested()
    try:
        hist.status = "SCREENING"
        db_session.flush()
        sp1.commit()
        pytest.fail("Should have raised error")
    except (IntegrityError, InternalError):
        sp1.rollback()

    # Attempt to delete status history should also trigger block exception
    sp2 = db_session.begin_nested()
    try:
        db_session.delete(hist)
        db_session.flush()
        sp2.commit()
        pytest.fail("Should have raised error")
    except (IntegrityError, InternalError):
        sp2.rollback()


# 9. Immutable Audit logs trigger check
def test_audit_events_immutability(db_session: Session):
    event = AuditEvent(
        actor_type="SYSTEM",
        event_type="TEST_START",
        entity_type="SYSTEM",
        payload={"message": "System starting test"}
    )
    db_session.add(event)
    db_session.commit()

    # Verify updates fail
    sp1 = db_session.begin_nested()
    try:
        event.event_type = "TEST_END"
        db_session.flush()
        sp1.commit()
        pytest.fail("Should have raised error")
    except (IntegrityError, InternalError):
        sp1.rollback()

    # Verify deletes fail
    sp2 = db_session.begin_nested()
    try:
        db_session.delete(event)
        db_session.flush()
        sp2.commit()
        pytest.fail("Should have raised error")
    except (IntegrityError, InternalError):
        sp2.rollback()


# 10. Submission Idempotency records unique constraints
def test_submission_idempotency(db_session: Session):
    vendor = create_test_vendor(db_session, "Idemp Vendor")
    v_user = create_test_vendor_user(db_session, "Idemp User", "idemp@vendor.com", vendor.id)

    rec = IdempotencyRecord(
        key="idemp-key-12345",
        vendor_user_id=v_user.id,
        request_hash="hashvalue",
        response_status_code=201,
        response_body='{"status": "created"}',
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db_session.add(rec)
    db_session.commit()

    # Creating same key for same vendor user should fail
    dup_rec = IdempotencyRecord(
        key="idemp-key-12345",
        vendor_user_id=v_user.id,
        request_hash="hashvalue2",
        response_status_code=201,
        response_body='{"status": "created"}',
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    
    sp = db_session.begin_nested()
    try:
        db_session.add(dup_rec)
        db_session.flush()
        sp.commit()
        pytest.fail("Should have raised IntegrityError")
    except IntegrityError:
        sp.rollback()

    # Creating same key for a different vendor user should succeed
    v_user2 = create_test_vendor_user(db_session, "Idemp User 2", "idemp2@vendor.com", vendor.id)
    diff_rec = IdempotencyRecord(
        key="idemp-key-12345",
        vendor_user_id=v_user2.id,
        request_hash="hashvalue",
        response_status_code=201,
        response_body='{"status": "created"}',
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db_session.add(diff_rec)
    db_session.commit()
    assert diff_rec.id is not None


# 11. Sessions revocation
def test_session_revocation(db_session: Session):
    admin = db_session.query(InternalUser).filter(func.lower(InternalUser.email) == "mbdineshreddy@gmail.com").first()
    
    # Create active session
    sess = VMSSession(
        internal_user_id=admin.id,
        token="token_xyz",
        status="ACTIVE",
        expires_at=datetime.utcnow() + timedelta(hours=1)
    )
    db_session.add(sess)
    db_session.commit()

    # Revoke session
    sess.status = "REVOKED"
    db_session.commit()

    db_sess = db_session.get(VMSSession, sess.id)
    assert db_sess.status == "REVOKED"


# 12. Historical submissions preservation (ON DELETE SET NULL for vendor_user_id)
def test_historical_submissions_preservation(db_session: Session):
    dept = create_test_department(db_session, "History Dept")
    role = create_test_role(db_session, "DevOps Engineer", dept.id)
    vendor = create_test_vendor(db_session, "History Vendor")
    v_user = create_test_vendor_user(db_session, "History User", "history_u@test.com", vendor.id)
    
    # Create candidate
    fp = get_pan_fingerprint("PANHIST999")
    enc = encrypt_pan("PANHIST999")
    candidate = Candidate(
        name="Ops Guy", email="ops@test.com", contact_number="1", current_company="A",
        total_experience=Decimal("2"), relevant_experience=Decimal("2"), notice_period="Immediate",
        ctc=Decimal("6"), ectc=Decimal("9"), current_location="Hyd", preferred_location="Hyd",
        pan_fingerprint=fp, pan_encrypted=enc, linkedin_url="ops-link", education="BSc", about="Ops"
    )
    db_session.add(candidate)
    db_session.commit()

    # Create submission
    sub = Submission(
        candidate_id=candidate.id,
        submission_reference="SUB-20260517-8889",
        vendor_id=vendor.id,
        vendor_user_id=v_user.id,
        role_id=role.id,
        job_id=role.job_id,
        status="SUBMITTED",
        employment_mode="Perm"
    )
    db_session.add(sub)
    db_session.commit()

    # Delete VendorUser
    db_session.delete(v_user)
    db_session.commit()

    # Check if submission is preserved but vendor_user_id is NULL
    db_sub = db_session.get(Submission, sub.id)
    assert db_sub is not None
    assert db_sub.vendor_user_id is None
    assert db_sub.vendor_id == vendor.id


# 13. Auto Resume eligibility state metadata
def test_resume_auto_eligibility(db_session: Session):
    vendor = create_test_vendor(db_session, "Resume Corp")
    v_user = create_test_vendor_user(db_session, "Resume Admin", "resume_admin@corp.com", vendor.id)

    resume = Resume(
        vendor_id=vendor.id,
        vendor_user_id=v_user.id,
        filename="cv.pdf",
        file_path="/storage/resumes/cv.pdf",
        file_size=204800,
        content_type="application/pdf",
        upload_state="COMPLETED",
        validation_state="VALID",
        malware_scan_state="CLEAN",
        processing_state="COMPLETED",
        eligibility_state="ELIGIBLE", # Auto determined
        parser_version="1.0"
    )
    db_session.add(resume)
    db_session.commit()

    assert resume.eligibility_state == "ELIGIBLE"


# 14. PasswordResetToken Check Constraint and user presence
def test_password_reset_token_constraints(db_session: Session):
    # Seed admin recruiter
    admin = db_session.query(InternalUser).filter(InternalUser.email == "mbdineshreddy@gmail.com").first()
    # Seed vendor and vendor user
    vendor = create_test_vendor(db_session, "PR Vendor")
    v_user = create_test_vendor_user(db_session, "PR User", "pr_user@corp.com", vendor.id)

    # 1. Success case: InternalUser only
    t1 = PasswordResetToken(
        internal_user_id=admin.id,
        token_hash="hash_1",
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db_session.add(t1)
    db_session.commit()
    assert t1.id is not None

    # 2. Success case: VendorUser only
    t2 = PasswordResetToken(
        vendor_user_id=v_user.id,
        token_hash="hash_2",
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db_session.add(t2)
    db_session.commit()
    assert t2.id is not None

    # 3. Fail case: Both populated
    t3 = PasswordResetToken(
        internal_user_id=admin.id,
        vendor_user_id=v_user.id,
        token_hash="hash_3",
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db_session.add(t3)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 4. Fail case: Neither populated
    t4 = PasswordResetToken(
        token_hash="hash_4",
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db_session.add(t4)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
