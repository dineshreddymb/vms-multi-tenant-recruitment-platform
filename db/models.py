import uuid
import sqlalchemy as sa
from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Numeric,
    Date,
    Integer,
    Text,
    CheckConstraint,
    UniqueConstraint,
    Boolean,
    func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from db.connection import Base

class InternalUser(Base):
    __tablename__ = "internal_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recruiter_reference = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    mobile = Column(String(50), nullable=False)
    role = Column(String(50), nullable=False, default="RECRUITER")
    access_level = Column(String(50), nullable=False, default="STANDARD")
    status = Column(String(50), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("role = 'RECRUITER'", name="chk_internal_user_role"),
        CheckConstraint("access_level IN ('STANDARD', 'ADMIN')", name="chk_internal_user_access_level"),
        CheckConstraint("status IN ('ACTIVE', 'DISABLED')", name="chk_internal_user_status"),
    )

    # Relationships
    sessions = relationship("Session", back_populates="internal_user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="internal_user", cascade="all, delete-orphan")
    reviewed_recruiter_signups = relationship("RecruiterSignupRequest", foreign_keys="[RecruiterSignupRequest.reviewed_by]")
    created_recruiter_users = relationship("RecruiterSignupRequest", foreign_keys="[RecruiterSignupRequest.created_user_id]")
    reviewed_vendor_signups = relationship("VendorSignupRequest", back_populates="reviewer")
    status_changes = relationship("StatusHistory", back_populates="changer")
    company_access = relationship("RecruiterCompanyAccess", back_populates="recruiter", cascade="all, delete-orphan")


class RecruiterSignupRequest(Base):
    __tablename__ = "recruiter_signup_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    mobile = Column(String(50), nullable=False)
    password_hash = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="PENDING")
    rejection_reason = Column(String(255), nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="SET NULL"), nullable=True)
    created_user_id = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="SET NULL"), nullable=True)
    requested_companies = Column(JSONB, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="chk_recruiter_signup_status"),
    )


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    normalized_name = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    memberships = relationship("VendorUserMembership", back_populates="vendor", cascade="all, delete-orphan")
    users = relationship("VendorUser", back_populates="vendor")
    submissions = relationship("Submission", back_populates="vendor")
    resumes = relationship("Resume", back_populates="vendor")
    roles = relationship("JobRole", back_populates="vendor")


class VendorUser(Base):
    __tablename__ = "vendor_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_user_reference = Column(String(100), unique=True, nullable=False)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=True)  # Legacy/Deprecated: Use memberships
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    mobile = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'DISABLED')", name="chk_vendor_user_status"),
    )

    # Relationships
    memberships = relationship("VendorUserMembership", back_populates="vendor_user", cascade="all, delete-orphan")
    vendor = relationship("Vendor", back_populates="users")  # Legacy
    sessions = relationship("Session", back_populates="vendor_user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="vendor_user", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="vendor_user")
    resumes = relationship("Resume", back_populates="vendor_user")
    idempotency_records = relationship("IdempotencyRecord", back_populates="vendor_user", cascade="all, delete-orphan")


class VendorUserMembership(Base):
    __tablename__ = "vendor_user_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'DISABLED')", name="chk_vendor_user_membership_status"),
        UniqueConstraint("vendor_user_id", "vendor_id", name="uq_vendor_user_membership"),
    )

    # Relationships
    vendor_user = relationship("VendorUser", back_populates="memberships")
    vendor = relationship("Vendor", back_populates="memberships")


class RecruiterCompanyAccess(Base):
    __tablename__ = "recruiter_company_access"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recruiter_id = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("recruiter_id", "company_id", name="uq_recruiter_company_access"),
    )

    # Relationships
    recruiter = relationship("InternalUser", back_populates="company_access")
    company = relationship("Vendor")


class VendorSignupRequest(Base):
    __tablename__ = "vendor_signup_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name = Column(String(255), nullable=False)
    normalized_company_name = Column(String(255), nullable=False, index=True)
    requested_companies = Column(JSONB, nullable=True)
    user_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    mobile = Column(String(50), nullable=False)
    password_hash = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="PENDING")
    rejection_reason = Column(String(255), nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="SET NULL"), nullable=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="chk_vendor_signup_status"),
    )

    # Relationships
    reviewer = relationship("InternalUser", back_populates="reviewed_vendor_signups")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    internal_user_id = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="CASCADE"), nullable=True)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="CASCADE"), nullable=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    device_info = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="ACTIVE")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'REVOKED', 'EXPIRED')", name="chk_session_status"),
        CheckConstraint("(internal_user_id IS NOT NULL) OR (vendor_user_id IS NOT NULL)", name="chk_session_user_presence"),
    )

    # Relationships
    internal_user = relationship("InternalUser", back_populates="sessions")
    vendor_user = relationship("VendorUser", back_populates="sessions")


class Department(Base):
    __tablename__ = "departments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="chk_department_status"),
    )

    # Relationships
    roles = relationship("JobRole", back_populates="department", cascade="all, delete-orphan")


class JobRole(Base):
    __tablename__ = "job_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    title = Column(String(255), nullable=False)
    job_id = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="ACTIVE")
    jd_filename = Column(String(255), nullable=True)
    jd_file_path = Column(String(555), nullable=True)
    jd_file_size = Column(Integer, nullable=True)
    jd_content_type = Column(String(100), nullable=True)
    jd_uploaded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED')", name="chk_job_role_status"),
    )

    # Relationships
    department = relationship("Department", back_populates="roles")
    vendor = relationship("Vendor", back_populates="roles")
    submissions = relationship("Submission", back_populates="job_role")

    @property
    def has_jd(self) -> bool:
        return bool(self.jd_file_path)

    @property
    def company_name(self) -> str:
        return self.vendor.name if self.vendor else ""


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    contact_number = Column(String(50), nullable=False)
    current_company = Column(String(255), nullable=False)
    total_experience = Column(Numeric(4, 2), nullable=False)
    relevant_experience = Column(Numeric(4, 2), nullable=False)
    notice_period = Column(String(50), nullable=False)
    ctc = Column(Numeric(10, 2), nullable=False)
    ectc = Column(Numeric(10, 2), nullable=False)
    current_location = Column(String(255), nullable=False)
    preferred_location = Column(String(255), nullable=False)
    pan_fingerprint = Column(String(64), unique=True, nullable=False, index=True)
    pan_encrypted = Column(Text, nullable=False)
    linkedin_url = Column(String(255), nullable=False)
    education = Column(String(255), nullable=False)
    about = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    submissions = relationship("Submission", back_populates="candidate", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_reference = Column(String(100), unique=True, nullable=False)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.id", ondelete="RESTRICT"), nullable=False)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="SET NULL"), nullable=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("job_roles.id", ondelete="RESTRICT"), nullable=False)
    job_id = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="SUBMITTED")
    cv_sent_date = Column(Date, nullable=False, server_default=func.current_date())
    employment_mode = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('SUBMITTED', 'SCREENING', 'INTERVIEW', 'SELECTED', 'ONBOARDED', 'REJECTED')",
            name="chk_submission_status"
        ),
        CheckConstraint("employment_mode IN ('Perm', 'C2H')", name="chk_submission_employment_mode"),
    )

    # Relationships
    candidate = relationship("Candidate", back_populates="submissions")
    vendor = relationship("Vendor", back_populates="submissions")
    vendor_user = relationship("VendorUser", back_populates="submissions")
    job_role = relationship("JobRole", back_populates="submissions")
    status_history = relationship("StatusHistory", back_populates="submission", cascade="all, delete-orphan")

    @property
    def company_name(self):
        return self.vendor.name if self.vendor else ""


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=True)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(555), nullable=False)
    file_size = Column(Integer, nullable=False)
    content_type = Column(String(100), nullable=False)
    upload_state = Column(String(50), nullable=False, default="PENDING")
    validation_state = Column(String(50), nullable=False, default="PENDING")
    malware_scan_state = Column(String(50), nullable=False, default="PENDING")
    processing_state = Column(String(50), nullable=False, default="PENDING")
    eligibility_state = Column(String(50), nullable=False, default="PENDING")
    parser_version = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("upload_state IN ('PENDING', 'COMPLETED', 'FAILED')", name="chk_resume_upload_state"),
        CheckConstraint("validation_state IN ('PENDING', 'VALID', 'INVALID')", name="chk_resume_validation_state"),
        CheckConstraint("malware_scan_state IN ('PENDING', 'CLEAN', 'INFECTED')", name="chk_resume_malware_scan_state"),
        CheckConstraint("processing_state IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')", name="chk_resume_processing_state"),
        CheckConstraint("eligibility_state IN ('PENDING', 'ELIGIBLE', 'INELIGIBLE')", name="chk_resume_eligibility_state"),
    )

    # Relationships
    vendor = relationship("Vendor", back_populates="resumes")
    vendor_user = relationship("VendorUser", back_populates="resumes")
    extraction = relationship("ResumeExtraction", uselist=False, back_populates="resume", cascade="all, delete-orphan")


class ResumeExtraction(Base):
    __tablename__ = "resume_extractions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), unique=True, nullable=False)
    extracted_data = Column(JSONB, nullable=False)
    parser_version = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    resume = relationship("Resume", back_populates="extraction")


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id = Column(UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="RESTRICT"), nullable=False)
    status = Column(String(50), nullable=False)
    reason = Column(String(255), nullable=True)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="RESTRICT"), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('SUBMITTED', 'SCREENING', 'INTERVIEW', 'SELECTED', 'ONBOARDED', 'REJECTED')",
            name="chk_status_history_status"
        ),
    )

    # Relationships
    submission = relationship("Submission", back_populates="status_history")
    changer = relationship("InternalUser", back_populates="status_changes")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_type = Column(String(50), nullable=False)
    actor_id = Column(UUID(as_uuid=True), nullable=True)
    event_type = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    payload = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("actor_type IN ('RECRUITER', 'VENDOR_USER', 'SYSTEM')", name="chk_audit_event_actor_type"),
    )


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(255), nullable=False)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="CASCADE"), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_status_code = Column(Integer, nullable=False)
    response_body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("key", "vendor_user_id", name="uq_idempotency_key_vendor_user"),
    )

    # Relationships
    vendor_user = relationship("VendorUser", back_populates="idempotency_records")


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(String(50), nullable=False, default="PENDING")
    file_path = Column(String(555), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    internal_user_id = Column(UUID(as_uuid=True), ForeignKey("internal_users.id", ondelete="CASCADE"), nullable=True)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("vendor_users.id", ondelete="CASCADE"), nullable=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "(internal_user_id IS NOT NULL AND vendor_user_id IS NULL) OR (internal_user_id IS NULL AND vendor_user_id IS NOT NULL)",
            name="chk_password_reset_token_user_presence"
        ),
    )

    # Relationships
    internal_user = relationship("InternalUser", back_populates="password_reset_tokens")
    vendor_user = relationship("VendorUser", back_populates="password_reset_tokens")


from sqlalchemy import event
from sqlalchemy.orm import object_session

@event.listens_for(VendorUser, "before_insert")
def receive_before_insert(mapper, connection, target):
    """
    Auto-populates vendor_user_reference on insert if not already set.
    Uses sequential numbers zero-padded (e.g. VU001, VU002).
    Tracks concurrently inserted objects in the same session.
    """
    if not target.vendor_user_reference:
        # 1. Count persisted records
        result = connection.execute(sa.text("SELECT COUNT(*) FROM vendor_users"))
        persisted_count = result.scalar()
        
        # 2. Count uncommitted VendorUser instances in the active session
        session = object_session(target)
        session_new_count = 0
        if session:
            session_new_count = sum(
                1 for obj in session.new 
                if isinstance(obj, VendorUser) and obj is not target and getattr(obj, 'vendor_user_reference', None) is None
            )
            
        suffix = persisted_count + session_new_count + 1
        ref_str = f"VU{suffix:03d}"
        
        # Double check uniqueness constraint
        while True:
            chk = connection.execute(
                sa.text("SELECT 1 FROM vendor_users WHERE vendor_user_reference = :ref"),
                {"ref": ref_str}
            ).first()
            
            # Also check session state for objects already assigned this reference
            in_session = False
            if session:
                in_session = any(
                    getattr(obj, 'vendor_user_reference', None) == ref_str 
                    for obj in session.new if isinstance(obj, VendorUser)
                )
                
            if not chk and not in_session:
                break
            suffix += 1
            ref_str = f"VU{suffix:03d}"
            
        target.vendor_user_reference = ref_str


@event.listens_for(InternalUser, "before_insert")
def receive_internal_user_before_insert(mapper, connection, target):
    """
    Auto-populates recruiter_reference on insert if not already set.
    Uses sequential numbers zero-padded (e.g. RU001, RU002).
    Tracks concurrently inserted objects in the same session.
    """
    if not target.recruiter_reference:
        # 1. Count persisted records
        result = connection.execute(sa.text("SELECT COUNT(*) FROM internal_users"))
        persisted_count = result.scalar()
        
        # 2. Count uncommitted InternalUser instances in the active session
        session = object_session(target)
        session_new_count = 0
        if session:
            session_new_count = sum(
                1 for obj in session.new 
                if isinstance(obj, InternalUser) and obj is not target and getattr(obj, 'recruiter_reference', None) is None
            )
            
        suffix = persisted_count + session_new_count + 1
        ref_str = f"RU{suffix:03d}"
        
        # Double check uniqueness constraint
        while True:
            chk = connection.execute(
                sa.text("SELECT 1 FROM internal_users WHERE recruiter_reference = :ref"),
                {"ref": ref_str}
            ).first()
            
            # Also check session state for objects already assigned this reference
            in_session = False
            if session:
                in_session = any(
                    getattr(obj, 'recruiter_reference', None) == ref_str 
                    for obj in session.new if isinstance(obj, InternalUser)
                )
                
            if not chk and not in_session:
                break
            suffix += 1
            ref_str = f"RU{suffix:03d}"
            
        target.recruiter_reference = ref_str

