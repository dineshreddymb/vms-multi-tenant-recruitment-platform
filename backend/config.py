import os
import base64
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables relative to this file's location
BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR / ".env"
load_dotenv(ENV_FILE)

# Base directory of the project
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Environment Type
ENV = os.getenv("ENV", "development")
IS_PROD = ENV.lower() in ("production", "prod")

from db.connection import normalize_database_url

# Database Settings
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if IS_PROD:
        raise ValueError("DATABASE_URL environment variable must be set in production.")
    DATABASE_URL = "postgresql://vms_user:vms_password@localhost:5432/vms_db"

DATABASE_URL = normalize_database_url(DATABASE_URL)

# CORS Origins Configuration
def parse_cors_origins(raw: str | None, is_prod: bool) -> list[str]:
    """
    Safely parse comma-separated CORS origins.
    Trims whitespace, ignores empty values, preserves exact origin strings.
    In development/testing, falls back to ['http://localhost:3000'] if unconfigured.
    In production, does NOT fall back to localhost (returns empty list if unset).
    """
    if raw is not None and raw.strip():
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    if is_prod:
        return []
    return ["http://localhost:3000"]

CORS_ORIGINS = parse_cors_origins(os.getenv("CORS_ORIGINS"), IS_PROD)

# ClamAV Malware Scanner Settings
CLAMAV_HOST = os.getenv("CLAMAV_HOST", "localhost")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))

# JWT Security Settings
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    if IS_PROD:
        raise ValueError("JWT_SECRET environment variable must be set in production.")
    JWT_SECRET = "vms_monolith_secure_jwt_secret_key_1234567890!"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Object Storage Configuration (Cloudflare R2 / S3-compatible or local fallback)
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND")
if not STORAGE_BACKEND:
    if IS_PROD:
        STORAGE_BACKEND = "s3"
    else:
        STORAGE_BACKEND = "s3" if (os.getenv("S3_ENDPOINT_URL") and os.getenv("S3_BUCKET_NAME")) else "local"
STORAGE_BACKEND = STORAGE_BACKEND.lower()

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY")
S3_REGION = os.getenv("S3_REGION", "auto")

if IS_PROD and STORAGE_BACKEND == "s3":
    if not (S3_ENDPOINT_URL and S3_BUCKET_NAME and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY):
        raise ValueError("S3 object storage environment variables (S3_ENDPOINT_URL, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) must be set in production when STORAGE_BACKEND is 's3'.")

# Private Object Storage Directory (for local backend fallback / temporary storage)
STORAGE_DIR = os.getenv("STORAGE_DIR", os.path.join(BASE_DIR, "scratch", "storage"))
try:
    os.makedirs(STORAGE_DIR, exist_ok=True)
except Exception:
    pass

# SMTP / Email Settings
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
SMTP_USERNAME = os.getenv("SMTP_USER") or os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true" if SMTP_PORT == 587 else "false").lower() == "true"
EMAIL_FROM = os.getenv("SMTP_FROM") or os.getenv("EMAIL_FROM", "noreply@vms.com")
RESET_URL_TEMPLATE = os.getenv("RESET_URL_TEMPLATE", "http://localhost:3000/auth/reset-password?token={token}")
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "15"))

# Groq Settings
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
