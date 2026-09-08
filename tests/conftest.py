import os
os.environ["ENV"] = "testing"
# Set test database URL (default to 5433 matching docker container or env)
test_db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
if not test_db_url or "vms_test_db" not in test_db_url:
    test_db_url = "postgresql://vms_user:vms_password@localhost:5433/vms_test_db"
os.environ["DATABASE_URL"] = test_db_url

# Safety check: if DB url does not point to vms_test_db or points to vms_db, fail immediately
db_url = os.environ["DATABASE_URL"]
if "vms_test_db" not in db_url or db_url.split("/")[-1].split("?")[0] == "vms_db":
    raise RuntimeError(f"SAFETY ERROR: Test suite is trying to run on development or non-test database: {db_url}")

# Log target database safely
print(f"TEST DATABASE TARGET: {db_url.split('/')[-1]}")

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"

# Safely handle PostgreSQL UUID strings on SQLite during testing
original_bind_processor = PG_UUID.bind_processor
def safe_bind_processor(self, dialect):
    if dialect.name == "sqlite":
        def process(value):
            if value is None:
                return None
            return str(value)
        return process
    return original_bind_processor(self, dialect)

PG_UUID.bind_processor = safe_bind_processor

original_result_processor = PG_UUID.result_processor
def safe_result_processor(self, dialect, coltype):
    if dialect.name == "sqlite":
        def process(value):
            import uuid
            if value is None:
                return None
            if isinstance(value, uuid.UUID):
                return value
            return uuid.UUID(value)
        return process
    return original_result_processor(self, dialect, coltype)

PG_UUID.result_processor = safe_result_processor

import pytest
from sqlalchemy import event, text
from sqlalchemy.orm import Session
from db.connection import SessionLocal, engine, Base
from db.seed import seed_database

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Inject environment variables for testing admin credentials dynamically
    os.environ["INITIAL_ADMIN_EMAIL"] = "mbdineshreddy@gmail.com"
    os.environ["INITIAL_ADMIN_PASSWORD"] = "TestAdminPassword123!"

    print("Dropping all tables on vms_test_db...")
    Base.metadata.drop_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE;"))
        conn.commit()
    print("Running Alembic migrations on vms_test_db...")
    from alembic.config import Config
    from alembic import command
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", "postgresql://vms_user:vms_password@localhost:5432/vms_test_db")
    command.upgrade(alembic_cfg, "head")
    db = SessionLocal()
    try:
        # Clean up database tables in order
        for table in ["audit_events", "status_history", "submissions", "resume_extractions",
                      "resumes", "job_roles", "recruiter_company_access",
                      "vendor_user_memberships", "vendor_users", "vendors", "internal_users", "candidates"]:
            db.execute(text(f"TRUNCATE TABLE {table} CASCADE;"))
        db.commit()

        # Seed IOSYS and Volantis tenant vendors
        from db.models import Vendor
        iosys = Vendor(name="IOSYS", normalized_name="iosys", is_tenant=True)
        volantis = Vendor(name="Volantis", normalized_name="volantis", is_tenant=True)
        db.add(iosys)
        db.add(volantis)
        db.commit()

        seed_database(db)
    finally:
        db.close()
    yield

@pytest.fixture(scope="function")
def db_session() -> Session:
    """
    Creates a new database session for a test.
    The session is wrapped in an outer transaction that is rolled back at the end of the test.
    Nested SAVEPOINTs are used to allow tests to call session.commit() or rollback() without
    affecting the outer transaction.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)

    # Start the nested transaction
    session.begin_nested()

    # Re-establish a savepoint after a nested transaction ends
    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        if not sess.is_active:
            return
        if not trans.nested:
            return
        sess.begin_nested()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(autouse=True)
def override_database_dependency(db_session: Session):
    from backend.main import app
    from db.connection import get_db
    app.dependency_overrides[get_db] = lambda: db_session
    yield
    app.dependency_overrides.clear()

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)
