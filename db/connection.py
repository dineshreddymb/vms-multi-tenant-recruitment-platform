import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load env variables from backend/.env
DB_DIR = Path(__file__).resolve().parent
ENV_FILE = DB_DIR.parent / "backend" / ".env"
load_dotenv(ENV_FILE)

# Default to the local docker postgres instance
ENV = os.getenv("ENV", "development")
IS_PROD = ENV.lower() in ("production", "prod")

def normalize_database_url(url: str | None) -> str | None:
    """
    Normalizes PostgreSQL URL scheme from postgres:// to postgresql:// for SQLAlchemy 2.x compatibility.
    Preserves credentials, host, port, database name, and query parameters.
    """
    if url and url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if IS_PROD:
        raise ValueError("DATABASE_URL environment variable must be set in production.")
    DATABASE_URL = "postgresql://vms_user:vms_password@localhost:5432/vms_db"

DATABASE_URL = normalize_database_url(DATABASE_URL)



if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
