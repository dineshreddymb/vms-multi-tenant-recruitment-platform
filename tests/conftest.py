import os
os.environ["ENV"] = "testing"

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
    
    Base.metadata.create_all(bind=engine)
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




