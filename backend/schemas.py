import re
from uuid import UUID
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Literal, Dict, Any
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# Indian PAN Validation Regex (5 letters, 4 digits, 1 letter)
PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", re.IGNORECASE)

# Indian Mobile Validation Regex (optional +91/0, followed by 10 digits starting with 6-9)
MOBILE_REGEX = re.compile(r"^(?:\+91|0)?[6-9]\d{9}$")

# International Mobile Validation Regex (starts with '+', followed by country calling code 1-9 and digits, allowing optional single spaces or hyphens)
INTERNATIONAL_MOBILE_REGEX = re.compile(r"^\+[1-9]\d{0,3}(?:[ -]?\d+)+$")

def validate_international_mobile(v: str) -> str:
    if not v or not v.strip():
        raise ValueError("Mobile number is required.")
    cleaned = v.strip()
    if not INTERNATIONAL_MOBILE_REGEX.match(cleaned):
        raise ValueError("Invalid international mobile number. Must start with '+' followed by country code (e.g. +91 9988776655).")
    digits = re.sub(r"\D", "", cleaned)
    if not (7 <= len(digits) <= 15):
        raise ValueError("Invalid international mobile number length. Total digits must be between 7 and 15.")
    return cleaned

def validate_mobile_with_legacy_fallback(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    cleaned = v.strip()
    if not cleaned:
        raise ValueError("Mobile number cannot be empty.")
    if cleaned.startswith("+"):
        if not INTERNATIONAL_MOBILE_REGEX.match(cleaned):
            raise ValueError("Invalid international mobile number. Must start with '+' followed by country code (e.g. +91 9988776655).")
        digits = re.sub(r"\D", "", cleaned)
        if not (7 <= len(digits) <= 15):
            raise ValueError("Invalid international mobile number length. Total digits must be between 7 and 15.")
        return cleaned
    # Legacy fallback: accept existing Indian mobile numbers without '+'
    if MOBILE_REGEX.match(cleaned):
        return cleaned
    raise ValueError("Invalid international mobile number. Must start with '+' followed by country code (e.g. +91 9988776655).")

# ----------------- AUTH & SIGNUP SCHEMAS -----------------

class RecruiterSignupRequestSchema(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    mobile: str
    password: str = Field(..., min_length=8, max_length=50)
    confirm_password: str
    companies: Optional[List[UUID]] = None

    @field_validator("mobile")
    def validate_mobile(cls, v):
        return validate_international_mobile(v)

    @model_validator(mode="after")
    def validate_signup(self) -> "RecruiterSignupRequestSchema":
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")
        return self

class RecruiterSignupResponseSchema(BaseModel):
    request_id: UUID
    email: str
    status: str
    requested_at: datetime

    class Config:
        from_attributes = True

# Canonical Supported Vendor Companies
SUPPORTED_VENDOR_COMPANIES = ["IOSYS", "Volantis"]

class VendorMembershipResponseSchema(BaseModel):
    id: UUID
    vendor_id: UUID
    company_name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class VendorSignupRequestSchema(BaseModel):
    companies: Optional[List[str]] = None
    company_name: Optional[str] = None
    user_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    mobile: str
    password: str = Field(..., min_length=8, max_length=50)
    confirm_password: str

    @field_validator("mobile")
    def validate_mobile(cls, v):
        return validate_international_mobile(v)

    @model_validator(mode="after")
    def normalize_companies(self) -> "VendorSignupRequestSchema":
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")

        if not self.company_name or not self.company_name.strip():
            raise ValueError("Vendor Company Name is required.")

        comp_clean = self.company_name.strip()
        if comp_clean.lower() in ["iosys", "volantis"]:
            raise ValueError("Vendor Company Name cannot be IOSYS or Volantis.")

        self.company_name = comp_clean

        if self.companies is not None:
            self.companies = [str(c).strip() for c in self.companies if str(c).strip()]
        else:
            self.companies = [self.company_name]

        return self

class VendorSignupResponseSchema(BaseModel):
    request_id: UUID
    companies: List[str]
    company_name: str
    email: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class VendorUserProvisionSchema(BaseModel):
    company_name: Optional[str] = None
    companies: Optional[List[str]] = None
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    mobile: str
    password: str = Field(..., min_length=8, max_length=50)

    @field_validator("mobile")
    def validate_mobile(cls, v):
        return validate_international_mobile(v)

class LoginRequestSchema(BaseModel):
    email: EmailStr
    password: str
    company_id: Optional[UUID] = None

class TokenResponseSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str

# ----------------- APPROVAL REQUESTS SCHEMAS -----------------

class VendorApprovalDetailResponseSchema(BaseModel):
    id: UUID
    company_name: str
    normalized_company_name: str
    requested_companies: List[str]
    existing_companies: List[str] = []
    user_name: str
    email: str
    mobile: str
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class RecruiterApprovalDetailResponseSchema(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    mobile: str
    status: str
    rejection_reason: Optional[str] = None
    requested_companies: Optional[List[UUID]] = None
    requested_at: datetime

    class Config:
        from_attributes = True

class RecruiterAdminRosterResponseSchema(BaseModel):
    """Used for the admin roster listing — InternalUser rows (have recruiter_reference)."""
    id: UUID
    recruiter_reference: str
    full_name: str
    email: EmailStr
    mobile: str
    status: str
    requested_at: datetime

    class Config:
        from_attributes = True

class RecruiterUserResponseSchema(BaseModel):
    id: UUID
    recruiter_reference: str
    name: str
    email: EmailStr
    mobile: str
    role: str
    access_level: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class VendorUserResponseSchema(BaseModel):
    id: UUID
    email: EmailStr
    name: str
    mobile: str
    status: str
    vendor_id: Optional[UUID] = None  # Legacy
    companies: List[VendorMembershipResponseSchema] = []
    created_at: datetime

    class Config:
        from_attributes = True

class ApprovalActionSchema(BaseModel):
    reason: Optional[str] = None

# ----------------- PROFILE SCHEMAS -----------------

class VendorProfileUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    mobile: Optional[str] = None

    @field_validator("mobile")
    def validate_mobile(cls, v):
        return validate_mobile_with_legacy_fallback(v)

class VendorProfileResponseSchema(BaseModel):
    id: UUID
    vendor_user_reference: str
    vendor_id: Optional[UUID] = None  # Legacy primary vendor
    active_vendor_id: Optional[UUID] = None
    company_name: Optional[str] = None  # Vendor User's employer company (Vendor.name)
    email: str
    name: str
    mobile: str
    status: str
    companies: List[VendorMembershipResponseSchema] = []
    created_at: datetime

    class Config:
        from_attributes = True

class RecruiterSelfProfileResponseSchema(BaseModel):
    id: UUID
    recruiter_reference: str
    email: str
    name: str
    mobile: str
    access_level: str
    status: str
    created_at: datetime
    companies: List[VendorMembershipResponseSchema] = []

    class Config:
        from_attributes = True

# ----------------- JOB ROLE & DEPARTMENT SCHEMAS -----------------

class DepartmentCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)

class DepartmentResponseSchema(BaseModel):
    id: UUID
    name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class JobRoleCreateSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=100)
    department_id: UUID
    job_id: str = Field(..., min_length=1, max_length=100)
    status: Optional[Literal["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]] = "ACTIVE"

    @field_validator("job_id")
    def validate_job_id(cls, v):
        if not v or not v.strip():
            raise ValueError("Job ID is required and cannot be empty or whitespace.")
        return v.strip()

class JobRoleUpdateSchema(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=100)
    status: Optional[Literal["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]] = None

class JobRoleResponseSchema(BaseModel):
    id: UUID
    department_id: UUID
    vendor_id: UUID
    company_name: Optional[str] = None
    title: str
    job_id: str
    status: str
    has_jd: bool = False
    jd_filename: Optional[str] = None
    jd_uploaded_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class VendorActiveJobRoleResponseSchema(BaseModel):
    id: UUID
    title: str
    department: str
    department_id: UUID
    job_id: str
    status: str
    has_jd: bool = False
    jd_filename: Optional[str] = None
    jd_uploaded_at: Optional[datetime] = None
    created_at: datetime
    company: str
    vendor_id: UUID

    class Config:
        from_attributes = True

# ----------------- RESUME SCHEMAS -----------------

class ResumeUploadResponseSchema(BaseModel):
    resume_id: UUID = Field(..., validation_alias="id")
    filename: str
    upload_state: str
    validation_state: str
    malware_scan_state: str
    processing_state: str
    eligibility_state: str

    class Config:
        from_attributes = True

class ResumeStatusResponseSchema(BaseModel):
    resume_id: UUID = Field(..., validation_alias="id")
    filename: str
    upload_state: str
    validation_state: str
    malware_scan_state: str
    processing_state: str
    eligibility_state: str
    parser_version: Optional[str] = None
    created_at: datetime
    extracted_data: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True
        populate_by_name = True

# ----------------- CANDIDATE SUBMISSION SCHEMAS -----------------

class SubmissionCreateSchema(BaseModel):
    vendor_id: Optional[UUID] = None
    cv_sent_date: date
    employment_mode: Literal["Perm", "C2H"]
    role_id: UUID
    job_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    contact_number: str
    current_company: str
    total_experience: Decimal = Field(..., ge=0, max_digits=4, decimal_places=2)
    relevant_experience: Decimal = Field(..., ge=0, max_digits=4, decimal_places=2)
    notice_period: Literal["Immediate", "15", "30", "45", "60", "90"]
    ctc: Decimal = Field(..., ge=0, max_digits=10, decimal_places=2)
    ectc: Decimal = Field(..., ge=0, max_digits=10, decimal_places=2)
    current_location: str
    preferred_location: str
    pan: str = Field(..., min_length=10, max_length=10)
    linkedin_url: str
    education: str
    about: str
    resume_id: UUID

    @field_validator("job_id")
    def validate_job_id(cls, v):
        if not v or not v.strip():
            raise ValueError("Job ID is required and cannot be empty or whitespace.")
        return v.strip()

    @field_validator("name", "current_company", "current_location", "preferred_location", "education", "about", mode="before")
    def validate_non_empty_strings(cls, v, info):
        if v is None or not str(v).strip():
            field_name = info.field_name.replace("_", " ").title()
            raise ValueError(f"{field_name} is required and cannot be empty or whitespace.")
        return str(v).strip()

    @field_validator("contact_number")
    def validate_contact(cls, v):
        if not v or not v.strip() or not MOBILE_REGEX.match(v.strip()):
            raise ValueError("Invalid Indian mobile number.")
        return v.strip()

    @field_validator("pan")
    def validate_pan(cls, v):
        if not v or not v.strip() or not PAN_REGEX.match(v.strip()):
            raise ValueError("Invalid Indian PAN card number format. Must be 5 uppercase letters, 4 digits, 1 uppercase letter.")
        return v.strip().upper()

    @field_validator("linkedin_url")
    def validate_linkedin(cls, v):
        if not v or not v.strip() or "linkedin.com" not in v.lower():
            raise ValueError("Invalid LinkedIn URL.")
        return v.strip()

    @model_validator(mode="after")
    def check_experience(self):
        if self.relevant_experience > self.total_experience:
            raise ValueError("Relevant experience cannot exceed total experience.")
        return self

class SubmissionResponseSchema(BaseModel):
    id: UUID
    submission_reference: str
    candidate_id: UUID
    vendor_id: UUID
    vendor_user_id: Optional[UUID]
    role_id: UUID
    job_id: Optional[str] = None
    status: str
    cv_sent_date: date
    employment_mode: str
    created_at: datetime
    company_name: Optional[str] = None

    class Config:
        from_attributes = True

class VendorSubmissionsPaginatedResponseSchema(BaseModel):
    items: List[SubmissionResponseSchema]
    total_items: int
    page: int
    page_size: int
    total_pages: int

# ----------------- RECRUITER CANDIDATE SCHEMAS -----------------

class CandidateDetailResponseSchema(BaseModel):
    id: UUID  # Candidate ID
    name: str
    email: str
    contact_number: str
    current_company: str
    total_experience: Decimal
    relevant_experience: Decimal
    notice_period: str
    ctc: Decimal
    ectc: Decimal
    current_location: str
    preferred_location: str
    pan_masked: str  # Masked PAN representation
    linkedin_url: str
    education: str
    about: str
    created_at: datetime

    class Config:
        from_attributes = True

class SubmissionDetailResponseSchema(BaseModel):
    id: UUID  # Submission ID
    status: str
    cv_sent_date: date
    employment_mode: str
    job_id: Optional[str] = None
    created_at: datetime
    role: JobRoleResponseSchema
    candidate: CandidateDetailResponseSchema
    vendor_name: str
    resume_id: UUID

    class Config:
        from_attributes = True

class CandidateEditSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    contact_number: Optional[str] = None
    current_company: Optional[str] = None
    total_experience: Optional[Decimal] = Field(None, ge=0, max_digits=4, decimal_places=2)
    relevant_experience: Optional[Decimal] = Field(None, ge=0, max_digits=4, decimal_places=2)
    notice_period: Optional[Literal["Immediate", "15", "30", "45", "60", "90"]] = None
    ctc: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    ectc: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    current_location: Optional[str] = None
    preferred_location: Optional[str] = None
    linkedin_url: Optional[str] = None
    education: Optional[str] = None
    about: Optional[str] = None
    cv_sent_date: Optional[date] = None
    employment_mode: Optional[Literal["Perm", "C2H"]] = None

    @field_validator("contact_number")
    def validate_contact(cls, v):
        if v is not None and not MOBILE_REGEX.match(v.strip()):
            raise ValueError("Invalid Indian mobile number.")
        return v.strip() if v else None

    @field_validator("linkedin_url")
    def validate_linkedin(cls, v):
        if v is not None and "linkedin.com" not in v.lower():
            raise ValueError("Invalid LinkedIn URL.")
        return v.strip() if v else None

class StatusTransitionSchema(BaseModel):
    status: Literal["SUBMITTED", "SCREENING", "INTERVIEW", "SELECTED", "ONBOARDED", "REJECTED"]
    reason: Optional[str] = None

class StatusHistoryResponseSchema(BaseModel):
    id: UUID
    status: str
    reason: Optional[str]
    changed_by_name: Optional[str]
    changed_at: datetime

    class Config:
        from_attributes = True

class PANCheckRequestSchema(BaseModel):
    pan: str = Field(..., min_length=10, max_length=10)
    role_id: Optional[UUID] = None

    @field_validator("pan")
    def validate_pan(cls, v):
        if not PAN_REGEX.match(v.strip()):
            raise ValueError("Invalid Indian PAN card number format.")
        return v.strip().upper()

class PANCheckResponseSchema(BaseModel):
    pan_fingerprint: str
    exists: bool
    can_submit: bool = True
    status: str = "ALLOWED"
    message: str = "PAN is unique. Eligible for creation."
    eligible_date: Optional[str] = None



class ForgotPasswordRequestSchema(BaseModel):
    email: EmailStr

class ResetPasswordRequestSchema(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=50)
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")
        return self

class JDGenerationRequestSchema(BaseModel):
    requirements: str = Field(..., min_length=1, max_length=5000)

class JDGenerationResponseSchema(BaseModel):
    jd: str
