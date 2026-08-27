# VMS Database Layer (PostgreSQL & Persistence)

This repository contains the authoritative database and persistence layer for the **Vendor Management System (VMS)**, built strictly in compliance with the VMS V17 Specification.

## Tech Stack
- **Datastore**: PostgreSQL 15 (Dockerized)
- **ORM**: SQLAlchemy 2.x (with Declarative Base)
- **Migration Engine**: Alembic
- **Password Hashing**: Argon2id via `argon2-cffi`
- **Crypto Library**: AES-256 via `cryptography` (Fernet)
- **Testing Framework**: pytest 7.x/8.x

---

## Architectural & Security Highlights

### 1. Vendor Visibility & Multiple Active Users
- In accordance with V17 rules, a Vendor may have **multiple active users** concurrently. There is **no** unique constraint on `vendor_users.vendor_id` or unique constraint combined with active status.
- The company visibility boundary is strictly enforced at backend query level: `submission.vendor_id == authenticated_vendor_id`.
- `vendor_user_id` is tracked on all submissions and audits for individual attribution, but does not isolate visibility.

### 2. Globally Unique & Encrypted PAN
- Candidates are globally unique by their PAN card.
- **Security Invariant**: We store a deterministic `pan_fingerprint` (generated via HMAC-SHA256 with a salt) which is indexed with a `UNIQUE` constraint. This prevents duplicate submissions transactionally and concurrently.
- The raw PAN card is encrypted using `Fernet` (AES-128 in CBC mode with HMAC-SHA256) and stored in `pan_encrypted`. Plaintext PANs are never logged.

### 3. Concurrency Protection for Active Admin Count
- V17 limits the application to a **maximum of 2 active ADMIN Recruiters** globally.
- **Race Condition Prevention**: A PostgreSQL trigger `trg_check_active_admins_limit` is bound to `internal_users`. Before any insert/update that sets a user as an active admin, the trigger acquires a transaction-level advisory lock: `PERFORM pg_advisory_xact_lock(987654321)`. This serializes checking the active admin count across concurrent transactions, guaranteeing that a third admin can never be promoted.

### 4. Immutable Records
- Trigger locks are implemented on `status_history` and `audit_events`. Any SQL `UPDATE` or `DELETE` statement targeting these tables raises a database exception, ensuring audit integrity.

### 5. Case-Insensitive Email Uniqueness
- Email uniqueness is enforced case-insensitively using custom `LOWER(email)` unique indexes on `internal_users` and `vendor_users`.

---

## Getting Started

### 1. Prerequisites
- Docker Desktop running (WSL2 backend enabled on Windows).
- Python 3.10+ installed.

### 2. Setup Database Container
Spin up the PostgreSQL 15 container:
```bash
docker run --name vms-postgres -e POSTGRES_USER=vms_user -e POSTGRES_PASSWORD=vms_password -e POSTGRES_DB=vms_db -p 5432:5432 -d postgres:15
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run Migrations
Apply Alembic migrations to construct the database schema, indexes, constraints, and triggers:
```bash
alembic upgrade head
```

### 5. Seed Initial Data
Seed active departments and the default active Admin recruiter by configuring the environment variables:
```bash
$env:INITIAL_ADMIN_EMAIL="mbdineshreddy@gmail.com"
$env:INITIAL_ADMIN_PASSWORD="YourSecurePasswordHere"
python -m db.seed
```

---

## Running the Database Test Suite

We use `pytest` for testing. The test suite spins up nested transactions (SAVEPOINTs) for each test, ensuring tests execute against the live PostgreSQL database container without polluting state.

Execute the tests:
```bash
python -m pytest tests/test_database.py -v
```

All 13 integration tests cover:
- Multiple active vendor users per company
- Case-insensitive email uniqueness
- Unique pending signup requests limit
- Max 2 active admins limit trigger
- Concurrency-safe admin promotions (testing triggers via parallel threads)
- Global PAN fingerprint uniqueness
- Immutable audit events & status history triggers
- Idempotency key uniqueness per vendor user
- Revocable sessions
- Historical submission preservation (ON DELETE SET NULL behavior)
