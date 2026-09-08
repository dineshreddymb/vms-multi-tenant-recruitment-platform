import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from backend.config import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from backend.database import get_db
from db.models import InternalUser, VendorUser, VendorUserMembership, Session as VMSSession, RecruiterCompanyAccess, Vendor

ph = PasswordHasher()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/recruiter/login")

# Password Hashing
def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, password)
    except VerifyMismatchError:
        return False

# JWT Tokens
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

# User Session Validation Dependencies
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session is invalid or has expired. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
        
    session_id = payload.get("session_id")
    role = payload.get("role")
    user_id = payload.get("sub") # user_id UUID string
    
    if not session_id or not role or not user_id:
        raise credentials_exception

    # Extract company information from JWT for recruiters
    company_id = payload.get("company_id")
    company_name = payload.get("company_name")
    
    # Retrieve current user details from DB based on role
    if role == "RECRUITER":
        user = db.query(InternalUser).filter(InternalUser.id == user_id).first()
        # Verify recruiter still has access to the company from JWT
        # DO NOT bypass for admins — company-specific admin access is authoritative.
        if company_id and company_id != "None" and user:
            company_access = db.query(RecruiterCompanyAccess).filter(
                RecruiterCompanyAccess.recruiter_id == user_id,
                RecruiterCompanyAccess.company_id == company_id,
                RecruiterCompanyAccess.status.in_(["APPROVED", "ACTIVE"])
            ).first()
            if not company_access:
                raise credentials_exception
    elif role == "VENDOR_USER":
        user = db.query(VendorUser).filter(VendorUser.id == user_id).first()
        if company_id and company_id != "None" and user:
            is_authorized = False
            if user.vendor_id and str(user.vendor_id) == str(company_id):
                is_authorized = True
            else:
                company_access = db.query(VendorUserMembership).filter(
                    VendorUserMembership.vendor_user_id == user_id,
                    VendorUserMembership.vendor_id == company_id,
                    VendorUserMembership.status.in_(["APPROVED", "ACTIVE"])
                ).first()
                if company_access:
                    is_authorized = True
            if not is_authorized:
                raise credentials_exception
    else:
        raise credentials_exception

    if user and user.status != "ACTIVE":
        detail_msg = (
            "Your recruiter account has been deactivated. Please contact your administrator for assistance."
            if role == "RECRUITER"
            else "Your vendor account has been deactivated. Please contact your administrator or recruiter for assistance."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail_msg
        )


    # Check session in database for active state
    db_session = db.query(VMSSession).filter(
        VMSSession.id == session_id,
        VMSSession.status == "ACTIVE"
    ).first()
    
    if not db_session:
        raise credentials_exception
        
    # Check expiry
    now = datetime.now(timezone.utc)
    expires_at = db_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        db_session.status = "EXPIRED"
        db.commit()
        raise credentials_exception

    if not user or user.status != "ACTIVE":
        raise credentials_exception

    # Return user context with company information
    result = {"user": user, "role": role, "session": db_session}
    if role in ["RECRUITER", "VENDOR_USER"] and company_id:
        result["company_id"] = company_id
        result["company_name"] = company_name
    return result

# Dependency factory for Role check
class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current: dict = Depends(get_current_user)):
        if current["role"] not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource."
            )
        return current["user"]

# Direct Role checking dependencies
require_recruiter = RoleChecker(["RECRUITER"])
require_vendor_user = RoleChecker(["VENDOR_USER"])
require_any_user = RoleChecker(["RECRUITER", "VENDOR_USER"])

# Admin Only check (For Recruiter ADMIN access level)
def require_admin(current: dict = Depends(get_current_user)):
    user = current["user"]
    role = current["role"]
    
    # Authoritative access level must be fetched from DB dynamically
    if role != "RECRUITER" or user.access_level != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges are required to perform this action."
        )
    return user

# Recruiter with company context check
def require_recruiter_with_company(current: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user = current["user"]
    role = current["role"]
    company_id = current.get("company_id")
    company_name = current.get("company_name")
    
    if role != "RECRUITER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter privileges are required to perform this action."
        )
    
    if not company_id or company_id == "None":
        first_access = db.query(RecruiterCompanyAccess).filter(
            RecruiterCompanyAccess.recruiter_id == user.id,
            RecruiterCompanyAccess.status.in_(["APPROVED", "ACTIVE"])
        ).first()
        if first_access:
            company_id = first_access.company_id
            c_v = db.query(Vendor).filter(Vendor.id == company_id).first()
            company_name = c_v.name if c_v else str(company_id)
        if not company_id or company_id == "None":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Company context is required. Please log in with company selection."
            )

    # Authoritative database verification
    company_access = db.query(RecruiterCompanyAccess).filter(
        RecruiterCompanyAccess.recruiter_id == user.id,
        RecruiterCompanyAccess.company_id == company_id,
        RecruiterCompanyAccess.status.in_(["APPROVED", "ACTIVE"])
    ).first()

    if not company_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have approved access to the selected company."
        )
    
    return {
        "user": user,
        "company_id": company_id,
        "company_name": company_name
    }

# Vendor with company context check (JWT-locked — X-Vendor-ID is intentionally ignored)
def require_vendor_with_company(current: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Dependency that verifies the caller is an authenticated VENDOR_USER and resolves their
    locked company context from the JWT (set at login time).

    The company_id is ALWAYS read from the JWT. Any X-Vendor-ID header sent by the client is
    intentionally ignored — the session company cannot be changed after login without
    re-authenticating.

    Two paths:
    1. Tenant vendors (IOSYS/Volantis): Must have a valid company_id UUID in JWT that matches
       an active VendorUserMembership or the VendorUser.vendor_id field.
    2. Legacy non-tenant vendors: company_id in JWT is "None" (set by login when vendor's company
       is not marked is_tenant=True). These users are authenticated via require_vendor_user
       and served via their VendorUser.vendor_id. Their company_id is returned as their vendor_id
       for backward compatibility.

    Returns {"user": vendor_user, "company_id": UUID, "company_name": str}.
    Raises 403 if not VENDOR_USER or if membership validation fails for tenant vendors.
    """
    user = current["user"]
    role = current["role"]
    company_id = current.get("company_id")
    company_name = current.get("company_name", "")

    if role != "VENDOR_USER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vendor privileges are required to perform this action."
        )

    from uuid import UUID as _UUID

    # Handle legacy non-tenant vendors: company_id in JWT is "None" or missing
    if not company_id or company_id == "None":
        # Legacy path: non-tenant vendors are identified by VendorUser.vendor_id
        if user.vendor_id:
            return {
                "user": user,
                "company_id": user.vendor_id,
                "company_name": company_name
            }
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company context is required. Please log in again and select a company."
        )

    # Tenant path: Parse and validate the JWT company_id UUID
    company_uuid = None
    try:
        company_uuid = _UUID(str(company_id))
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid company context in session. Please log in again."
        )

    # Authoritative database verification — ensure membership is still valid
    # Check membership (APPROVED or ACTIVE)
    membership = db.query(VendorUserMembership).filter(
        VendorUserMembership.vendor_user_id == user.id,
        VendorUserMembership.vendor_id == company_uuid,
        VendorUserMembership.status.in_(["APPROVED", "ACTIVE"])
    ).first()

    if not membership:
        # Fallback: accept if vendor_id on the VendorUser row matches (legacy single-company users
        # who have been migrated to the tenant system without explicit membership records)
        if not (user.vendor_id and str(user.vendor_id) == str(company_uuid)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your session company is no longer active. Please log in again."
            )

    return {
        "user": user,
        "company_id": company_uuid,
        "company_name": company_name
    }
