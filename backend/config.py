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

# Database Settings
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if IS_PROD:
        raise ValueError("DATABASE_URL environment variable must be set in production.")
    DATABASE_URL = "postgresql://vms_user:vms_password@localhost:5432/vms_db"

# JWT Security Settings
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    if IS_PROD:
        raise ValueError("JWT_SECRET environment variable must be set in production.")
    JWT_SECRET = "vms_monolith_secure_jwt_secret_key_1234567890!"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Private Object Storage Directory
STORAGE_DIR = os.getenv("STORAGE_DIR", os.path.join(BASE_DIR, "scratch", "storage"))

# Ensure storage directory exists
os.makedirs(STORAGE_DIR, exist_ok=True)

# SMTP / Email Settings
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@vms.com")
RESET_URL_TEMPLATE = os.getenv("RESET_URL_TEMPLATE", "http://localhost:3000/auth/reset-password?token={token}")
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "15"))

# Groq Settings
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
