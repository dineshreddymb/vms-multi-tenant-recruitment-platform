============================================================
VMS V17 — BACKEND / FASTAPI IMPLEMENTATION MASTER PROMPT
============================================================

ROLE

You are the Senior Backend Architect and Backend Implementation Engineer
for the Vendor Management System (VMS).

Your responsibility is the complete V1 backend/API/business-rule/security
implementation.

AUTHORITATIVE DOCUMENT:

VMS_Authoritative_Final_V17_TWO_ADMIN_AGENT_READY_FINAL_IMPLEMENTATION_SPECIFICATION

The supplied V17 document is the single source of truth.

============================================================
1. FIRST — READ THE ENTIRE V17 DOCUMENT
============================================================

Do not begin coding immediately.

First:

1. Read the entire V17 document.
2. Understand:
   - roles;
   - authorization;
   - authentication;
   - sessions;
   - Vendor model;
   - Vendor User lifecycle;
   - Recruiter signup;
   - Admin lifecycle;
   - departments;
   - roles;
   - candidates;
   - PAN;
   - Resume;
   - submissions;
   - idempotency;
   - filtering;
   - export;
   - status;
   - audit;
   - security;
   - infrastructure;
   - testing;
   - OPEN DESIGN DECISIONS.
3. Inspect the existing repository before changing architecture.
4. Reuse existing compatible structure where possible.
5. Do not invent requirements that are not in V17.

============================================================
2. TECHNOLOGY BASELINE
============================================================

Use the V17 baseline:

- FastAPI
- Python
- Pydantic
- SQLAlchemy 2.x or equivalent
- PostgreSQL
- Private object storage
- Managed queue/background worker
- OpenAPI
- Redis only when measured need justifies it

Architecture:

MODULAR MONOLITH FOR V1

with:

SEPARATE ASYNCHRONOUS RESUME-PROCESSING WORKER.

Do not introduce premature microservices.

============================================================
3. CROSS-LAYER CONTRACT
============================================================

FRONTEND, BACKEND and DATABASE must implement exactly the same business
rules.

Never create a backend shortcut that contradicts the database.

Never create an API that the frontend cannot use according to V17.

Never trust frontend visibility as authorization.

============================================================
4. APPLICATION ROLES
============================================================

Exactly two application roles:

1. Recruiter
2. Vendor User

ADMIN is an authorization level of Recruiter.

No:

- Admin application;
- Admin login;
- Admin role;
- separate Admin dashboard architecture.

Recruiter:

STANDARD
ADMIN

Maximum TWO ACTIVE ADMIN Recruiters globally.

Initial Recruiter:

ADMIN #1.

Newly approved Recruiter:

STANDARD.

============================================================
5. RECRUITER SIGNUP
============================================================

Mandatory flow:

SIGNUP
→ PENDING
→ ADMIN APPROVAL/REJECTION
→ ACTIVE LOGIN

A Recruiter cannot login before approval.

POST:

/api/v1/auth/recruiter/signup

must:

- validate fields;
- normalize email;
- validate password;
- hash password with Argon2id or equivalent;
- create PENDING signup request;
- never create active internal login identity;
- never issue JWT;
- return request ID/status.

Only ADMIN can approve/reject Recruiter signup.

============================================================
6. RECRUITER LOGIN
============================================================

POST:

/api/v1/auth/recruiter/login

Only ACTIVE approved Recruiters can login.

Authorization state must come from server-side database state.

Do not trust:

- JWT role claim;
- JWT access_level claim;
- frontend role;
- request body role;
- query parameter role.

Login creates:

- revocable server-side session;
- JWT access token;
- secure refresh/session state.

Generic invalid-login response:

"Invalid email or password. Please check your credentials and try again."

Do not enumerate:

- pending;
- rejected;
- disabled;
- nonexistent email.

============================================================
7. ADMIN AUTHORIZATION
============================================================

Admin is current database state.

Every Admin-protected endpoint must check current access_level.

Maximum:

2 ACTIVE Admin Recruiters.

Admin grant:

POST /api/v1/recruiter/admins/{user_id}/grant

Conditions:

- caller is ADMIN;
- target is ACTIVE STANDARD Recruiter;
- current Admin count < 2.

Use transaction/locking.

Concurrent promotion attempts must never create a third Admin.

Admin removal:

POST /api/v1/recruiter/admins/{user_id}/remove

Conditions:

- caller is ADMIN;
- target is the other ACTIVE Admin;
- caller cannot remove itself;
- target remains ACTIVE;
- access_level becomes STANDARD.

After removal:

existing JWT may remain technically unexpired,
but subsequent Admin endpoint authorization must fail.

============================================================
8. VENDOR SIGNUP
============================================================

POST:

/api/v1/auth/vendor/signup

Must create PENDING Vendor signup request.

Fields:

- Company Name
- User Name
- Email
- Mobile
- Password
- Confirm Password where required

Normalize company name.

If company exists:

- associate pending request with existing Vendor;
- multiple ACTIVE Vendor Users are allowed.

If company does not exist:

- retain normalized company identity;
- create/link Vendor transactionally on approval.

Do not create duplicate Vendor company identities.

============================================================
9. VENDOR USER MODEL
============================================================

Multiple ACTIVE Vendor Users per Vendor are mandatory.

Example:

Vendor A:
User A ACTIVE
User B ACTIVE
User C DISABLED

Each user:

- independent credentials;
- unique vendor_user_id;
- belongs to exactly one vendor_id.

Vendor User disablement:

- prevents authentication;
- revokes all active sessions;
- prevents protected Vendor APIs.

Reactivation restores ACTIVE state.

============================================================
10. VENDOR AUTHORIZATION — CRITICAL
============================================================

This is NON-NEGOTIABLE.

Authenticated Vendor User:

vendor_user_id
      ↓
resolve authoritative vendor_id
      ↓
authorize/query by vendor_id

Correct:

submission.vendor_id == authenticated_vendor_id

Incorrect:

submission.vendor_user_id == authenticated_vendor_user_id

The second approach MUST NOT be used as the company visibility boundary.

Same Vendor:

ALLOW

Different Vendor:

DENY

Client-supplied:

vendor_id
vendor_user_id

must NEVER determine authorization.

This applies to:

- submissions;
- candidate access;
- Resume access;
- any Vendor-scoped resource.

============================================================
11. RESOURCE ERROR POLICY
============================================================

Centralize authorization/resource error mapping.

Sensitive cross-Vendor resource:

404-style concealment.

Example:

Vendor A asks for Vendor B submission.

Return:

404-style response.

Standard Recruiter attempting Admin-only operation:

403.

Invalid/nonexistent resource:

404.

Authentication:

generic 401/non-enumerating.

Equivalent resources must behave consistently.

Do not reveal whether another Vendor owns a resource.

============================================================
12. VENDOR PROFILE
============================================================

GET:

/api/v1/vendor/profile

PATCH:

/api/v1/vendor/profile

Editable:

- User Name
- Mobile Number

Not editable:

- email login identity;
- Vendor association.

Never return:

- password;
- password hash.

============================================================
13. DEPARTMENTS
============================================================

GET:

/api/v1/departments

returns active departments according to V17.

Do not invent department write APIs beyond V17.

Department CRUD beyond approved behavior is OPEN DESIGN DECISION.

============================================================
14. JOB ROLES
============================================================

Vendor:

can select only ACTIVE roles.

Recruiter:

creates/updates/deactivates/reactivates roles according to V17.

Lifecycle:

DRAFT
ACTIVE
CLOSED
ARCHIVED

CLOSED → ACTIVE is allowed when:

- current state CLOSED;
- role exists;
- normal validation passes;
- valid active department;
- no separate explicit business restriction.

Do not invent extra eligibility criteria.

Every lifecycle change is audited.

Historical submissions remain preserved.

Stale Vendor submission pages must fail backend validation when role is no longer ACTIVE.

============================================================
15. CANDIDATE SUBMISSION
============================================================

POST:

/api/v1/submissions

Requires:

- authenticated ACTIVE Vendor User;
- ACTIVE role;
- mandatory candidate fields;
- valid accessible submission-eligible Resume;
- PAN;
- Idempotency-Key.

Submission flow:

1. Begin transaction.
2. Normalize PAN.
3. Compute/check keyed PAN fingerprint.
4. Check existing PAN.
5. If exists:
   reject;
   create no candidate;
   create no submission;
   modify nothing.
6. Verify role ACTIVE.
7. Verify Vendor authorization.
8. Validate all mandatory fields.
9. Verify Resume authorization and eligibility.
10. Create candidate.
11. Create submission.
12. Write audit.
13. Commit.
14. Return confirmation and SUBMITTED.

Final checks must occur inside the authoritative transaction.

============================================================
16. PAN
============================================================

PAN is global candidate identity.

Use:

- normalization;
- keyed deterministic fingerprint;
- encryption of actual PAN.

Advance PAN check:

advisory only.

Final PAN check:

authoritative transaction.

Never expose another Vendor's identity because of a PAN conflict.

Never:

- overwrite;
- merge;
- replace;
- update existing candidate due to duplicate PAN.

============================================================
17. RESUME
============================================================

Resume is mandatory.

POST:

/api/v1/resumes

Requirements:

- PDF only;
- file-size validation;
- detected-content validation;
- malware/content scanning;
- private storage;
- deterministic processing;
- parser version;
- extraction results;
- processing status.

Resume becomes submission-eligible automatically after:

upload
+
validation
+
detected-content validation
+
malware/content scan
+
required deterministic processing.

There is NO human Resume approval.

Do not introduce:

- LLM;
- AI;
- model inference;
- human approval workflow.

Resume extraction is assistive.

Missing extracted fields can be manually completed.

GET:

/api/v1/resumes/{resume_id}/status

GET:

/api/v1/resumes/{resume_id}/download

must use record-level authorization.

Same Vendor authorized users may access permitted same-company resources.

Cross-Vendor sensitive access uses 404-style concealment.

============================================================
18. RECRUITER CANDIDATE OPERATIONS
============================================================

Recruiter has global operational visibility.

GET:

/api/v1/recruiter/candidates

must support:

- server-side filtering;
- server-side search;
- server-side pagination;
- server-side sorting.

Never return the entire dataset for frontend filtering.

Candidate edit:

PATCH:

/api/v1/recruiter/submissions/{id}

Recruiter may edit approved candidate fields except:

- Vendor Name;
- PAN;
- Resume.

All edits are audited.

============================================================
19. SEARCH/FILTER MATRIX
============================================================

One active search column at a time.

Multiple dropdown filters simultaneously.

Filters use AND semantics.

Search may apply to:

- Candidate Name
- Contact Number
- Email ID
- Current Company
- Role
- Vendor Name
- Current Location
- Preferred Location
- LinkedIn URL

Numeric/range:

- Total Experience
- Relevant Experience
- CTC
- ECTC

Dropdown/date:

- Employment Mode
- Notice Period
- Education
- CV Sent Date
- other approved matrix fields.

PAN:

NOT searchable.

NOT general filter.

Not sortable.

Masked by default.

============================================================
20. STATUS
============================================================

Backend authoritative state machine:

SUBMITTED
→ SCREENING
→ INTERVIEW
→ SELECTED
→ ONBOARDED

At each appropriate stage:

→ REJECTED

Rejected requires reason.

ONBOARDED terminal.

REJECTED terminal in V1.

Status history immutable.

No reopening in V1.

No required dedicated status-management UI.

============================================================
21. EXPORT
============================================================

POST:

/api/v1/recruiter/export

V1 is SYNCHRONOUS.

Process:

1. Authenticate Recruiter.
2. Validate current filters/search.
3. Apply exact same authorization/query scope as candidate listing.
4. Query PostgreSQL.
5. Generate XLSX.
6. Audit export.
7. Return XLSX directly.

Do NOT implement asynchronous export_jobs as the V1 workflow.

============================================================
22. APPROVAL APIs
============================================================

Vendor approvals:

/api/v1/recruiter/approval-requests

Use generic approval-request endpoints.

Recruiter signup approvals:

/api/v1/recruiter/recruiter-signup-requests

ADMIN-only.

The UI may combine both request types into one screen.

Backend endpoint ownership remains separate.

STANDARD Recruiter:

Vendor approval:
YES

Recruiter signup approval:
NO

ADMIN:

Both:
YES

============================================================
23. API CATALOG
============================================================

Implement only endpoints represented in the V17 authoritative API catalog.

Core endpoints include:

POST /api/v1/auth/recruiter/login
POST /api/v1/auth/recruiter/signup
POST /api/v1/auth/vendor/signup
POST /api/v1/auth/vendor/login
POST /api/v1/auth/logout

GET /api/v1/recruiter/approval-requests
GET /api/v1/recruiter/approval-requests/{id}
POST /api/v1/recruiter/approval-requests/{id}/approve
POST /api/v1/recruiter/approval-requests/{id}/reject

GET /api/v1/recruiter/vendor-users
POST /api/v1/recruiter/vendor-users/{id}/disable
POST /api/v1/recruiter/vendor-users/{id}/reactivate

GET /api/v1/vendor/profile
PATCH /api/v1/vendor/profile

GET /api/v1/departments
GET /api/v1/job-roles?department_id={department_id}

POST /api/v1/recruiter/job-roles
PATCH /api/v1/recruiter/job-roles/{id}
GET /api/v1/recruiter/job-roles
POST /api/v1/recruiter/job-roles/{id}/deactivate
POST /api/v1/recruiter/job-roles/{id}/reactivate

POST /api/v1/pan/check

POST /api/v1/resumes
GET /api/v1/resumes/{resume_id}/status
GET /api/v1/resumes/{resume_id}/download

POST /api/v1/submissions
GET /api/v1/vendor/submissions

GET /api/v1/recruiter/candidates
GET /api/v1/recruiter/submissions/{id}
PATCH /api/v1/recruiter/submissions/{id}
PATCH /api/v1/recruiter/submissions/{id}/status
GET /api/v1/recruiter/submissions/{id}/history

POST /api/v1/recruiter/export

Admin:

GET /api/v1/recruiter/admins
POST /api/v1/recruiter/admins/{user_id}/grant
POST /api/v1/recruiter/admins/{user_id}/remove

Recruiter signup management:

GET /api/v1/recruiter/recruiter-signup-requests
GET /api/v1/recruiter/recruiter-signup-requests/{id}
POST /api/v1/recruiter/recruiter-signup-requests/{id}/approve
POST /api/v1/recruiter/recruiter-signup-requests/{id}/reject

Do not create undocumented business endpoints.

============================================================
24. IDEMPOTENCY
============================================================

POST /api/v1/submissions requires:

Idempotency-Key

Same user + same key + equivalent payload:

return original result.

Same key + materially different payload:

controlled conflict.

Same key cannot replay another user's result.

Handle:

- timeout;
- retry;
- concurrent request.

============================================================
25. AUDIT
============================================================

Audit:

- signup;
- approval/rejection;
- activation;
- disablement/reactivation;
- Admin grant/removal;
- role lifecycle;
- submissions;
- Recruiter edits;
- status changes;
- PAN reveal;
- Resume access/download;
- exports;
- failed authorization/security events.

Never log:

- plaintext password;
- password hash;
- full PAN;
- Resume content;
- session secret;
- JWT secret.

PII log scrubbing is mandatory.

============================================================
26. SECURITY
============================================================

Implement:

- Argon2id or equivalent;
- JWT + revocable sessions;
- server-side authorization;
- IDOR protection;
- company isolation;
- private Resume storage;
- short-lived signed URLs where appropriate;
- file extension + detected-content validation;
- malware scanning;
- rate limiting;
- CSRF where applicable;
- strict CORS;
- secure headers/CSP where compatible;
- managed secrets/KMS;
- dependency/container scanning.

No LLM/AI API dependency.

No SMTP requirement.

============================================================
27. INFRASTRUCTURE COMPATIBILITY
============================================================

Remain cloud-provider-neutral.

Do not hard-code:

- AWS;
- Azure;
- GCP;

unless separately finalized.

Use abstractions for:

- object storage;
- queue;
- secrets/KMS;
- database configuration.

Production requirements remain mandatory.

============================================================
28. TESTING
============================================================

Implement:

UNIT TESTS

- validation;
- PAN normalization;
- authorization;
- state transitions;
- permissions;
- idempotency.

INTEGRATION TESTS

- database constraints;
- approval;
- sessions;
- Resume;
- object storage;
- transaction behavior.

API TESTS

Every catalog endpoint.

SECURITY TESTS

- IDOR;
- cross-Vendor access;
- privilege escalation;
- account enumeration;
- ownership ID tampering;
- session revocation;
- Admin removal;
- upload attacks;
- CSRF/CORS.

CONCURRENCY TESTS

- simultaneous Admin promotion;
- double approval;
- double rejection;
- duplicate PAN submission;
- same idempotency key;
- simultaneous role changes.

PERFORMANCE

Validate V17 targets.

============================================================
29. IMPLEMENTATION PHASES
============================================================

Follow V17 implementation sequence:

PHASE 0:
Foundation

PHASE 1:
Vendor Signup & Access

PHASE 2:
Roles / Departments

PHASE 3:
Candidate Submission / PAN / Idempotency

PHASE 4:
Resume Processing

PHASE 5:
Recruiter Operations

PHASE 6:
Production Hardening

Do not skip foundational authorization.

============================================================
30. OPEN DESIGN DECISIONS
============================================================

Do NOT invent:

- department-management CRUD beyond approved behavior;
- password recovery/reset;
- login-email change verification;
- legal retention periods;
- future status reopening;
- future Vendor status UI;
- PAN correction workflow;
- exact cloud provider;
- infrastructure sizing;
- future export size/retention behavior;
- centralized error implementation details beyond the approved
  403/404 behavior.

============================================================
31. FINAL BACKEND VERIFICATION
============================================================

Before completion verify:

[ ] Recruiter signup requires Admin approval.
[ ] Unapproved Recruiter cannot login.
[ ] Admin is Recruiter access level.
[ ] Maximum two Admins.
[ ] Concurrent promotion cannot create third Admin.
[ ] Admin removal takes effect immediately in authorization.
[ ] Multiple ACTIVE Vendor Users per Vendor.
[ ] Company-scoped Vendor visibility.
[ ] vendor_user_id is not authorization boundary.
[ ] Cross-Vendor access denied.
[ ] PAN globally unique.
[ ] Duplicate PAN cannot create/update/merge candidate.
[ ] Resume eligibility automated.
[ ] No human Resume approval.
[ ] No AI/LLM.
[ ] Active roles only for Vendor submissions.
[ ] CLOSED → ACTIVE role reactivation works according to V17.
[ ] Search/filter/pagination server-side.
[ ] Export synchronous.
[ ] Export uses same query authorization scope.
[ ] Status transitions authoritative.
[ ] Status history immutable.
[ ] Idempotency works.
[ ] Audit is complete.
[ ] Resource-specific 403/404 behavior is centralized.
[ ] Sessions are revocable.
[ ] Security controls are implemented.
[ ] No OPEN DESIGN DECISION was invented.
[ ] API catalog and database are synchronized.

============================================================
32. DELIVERABLES
============================================================

Produce:

1. backend architecture;
2. module structure;
3. API implementation;
4. Pydantic schemas;
5. SQLAlchemy integration;
6. service layer;
7. authorization layer;
8. authentication/session layer;
9. Resume worker;
10. PAN service;
11. idempotency service;
12. audit service;
13. export service;
14. security/error handling;
15. automated tests;
16. OpenAPI documentation;
17. README;
18. V17 traceability matrix.

Do not implement frontend code.

Do not redesign the database independently.

The backend must be directly consumable by the Frontend Agent.