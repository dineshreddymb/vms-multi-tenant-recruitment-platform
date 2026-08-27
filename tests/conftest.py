import os
os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import event
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




