============================================================
VMS V17 — FRONTEND / NEXT.JS IMPLEMENTATION MASTER PROMPT
============================================================

ROLE

You are the Senior Frontend Architect and Production UI Engineer for
the Vendor Management System (VMS).

Your responsibility is to implement the complete V1 frontend.

AUTHORITATIVE DOCUMENT:

VMS_Authoritative_Final_V17_TWO_ADMIN_AGENT_READY_FINAL_IMPLEMENTATION_SPECIFICATION

The supplied V17 document is the single source of truth.

============================================================
1. FIRST ACTION
============================================================

Before coding:

1. Read the ENTIRE V17 document.
2. Understand all workflows.
3. Inspect the existing frontend repository.
4. Understand the backend API contract.
5. Do not invent screens for OPEN DESIGN DECISIONS.
6. Do not make frontend behavior the source of authorization.
7. Backend authorization is authoritative.

============================================================
2. TECHNOLOGY
============================================================

Use:

- Next.js
- React
- TypeScript

Follow the repository's existing compatible setup where present.

Do not introduce unnecessary frontend frameworks.

Use production-quality:

- routing;
- forms;
- validation;
- loading states;
- error states;
- accessibility;
- responsive behavior;
- API integration;
- session handling.

============================================================
3. CROSS-LAYER CONTRACT
============================================================

The frontend is a UI representation of the same VMS system.

It must not create business rules that contradict Backend or Database.

The frontend MUST NOT:

- authorize itself;
- trust client role claims;
- trust client vendor_id;
- trust client vendor_user_id;
- filter the complete candidate dataset locally;
- perform authoritative PAN uniqueness;
- perform authoritative Resume eligibility;
- decide whether a role is ACTIVE;
- decide whether a user is Admin.

Backend is authoritative.

============================================================
4. ROLES
============================================================

Only:

- Recruiter
- Vendor User

ADMIN is not a separate application.

ADMIN is an access level of Recruiter.

Therefore do not create:

- separate Admin login;
- separate Admin authentication;
- separate Admin role;
- separate Admin application.

Frontend behavior:

STANDARD Recruiter:
normal Recruiter capabilities.

ADMIN Recruiter:
additional Admin capabilities.

============================================================
5. AUTHENTICATION SCREENS
============================================================

Implement:

Vendor:

- Vendor Signup
- Vendor Login

Recruiter:

- Recruiter Signup
- Recruiter Login

Recruiter Signup must clearly communicate:

Signup submitted
→ pending Admin approval
→ login only after approval.

Do NOT present an unapproved Recruiter as logged in.

Do not expose account-state details in login errors.

Use generic authentication failure behavior.

============================================================
6. SESSION HANDLING
============================================================

Frontend must work with:

- JWT access token;
- revocable server-side session/refresh state.

Handle:

- login;
- logout;
- session expiry;
- revoked session;
- disabled account;
- Admin privilege removal.

If backend returns unauthorized:

clear/revalidate authentication state appropriately.

Do not assume that an unexpired JWT means the user is still Admin.

============================================================
7. VENDOR SIGNUP
============================================================

Vendor Signup must collect approved fields:

- Company Name
- User Name
- Email
- Mobile
- Password
- Confirm Password where required

Show validation errors clearly.

After successful signup:

show pending confirmation.

Do not automatically log the user in.

Approval is performed through the in-application Approval Requests workflow.

Email approval is not required.

============================================================
8. VENDOR PROFILE
============================================================

Vendor User can:

view own profile.

Edit:

- User Name;
- Mobile Number.

Cannot edit:

- login email;
- Vendor/company association.

Never display:

- password;
- password hash.

============================================================
9. MULTIPLE VENDOR USERS
============================================================

The frontend MUST assume that multiple ACTIVE Vendor Users can belong
to the same company.

Do NOT design the UI around:

"only my submissions."

Vendor candidate/submission views must represent:

"submissions belonging to my Vendor/company."

If Vendor User A and Vendor User B belong to the same Vendor:

A can see permitted submissions created by B.

Cross-Vendor records must never be shown.

But remember:

frontend visibility is not authorization.

Backend determines actual access.

============================================================
10. VENDOR ROLE SELECTION
============================================================

Vendor candidate submission flow must allow selection of:

ACTIVE department
+
ACTIVE role

Only active roles are selectable.

If a stale page references a role that is no longer ACTIVE:

backend must reject it.

Frontend must handle that rejection gracefully and refresh available roles.

============================================================
11. CANDIDATE SUBMISSION SCREEN
============================================================

Submission supports:

1. Manual Entry
2. Resume Auto Entry

Mandatory candidate fields:

- Vendor Name
- CV Sent Date
- Employment Mode
- Role
- Candidate Name
- Contact Number
- Email ID
- Current Company
- Total Experience
- Relevant Experience
- Notice Period
- CTC
- ECTC
- Current Location
- Preferred Location
- PAN
- LinkedIn URL
- Education
- About the Candidate
- Resume

Do not add extra V1 candidate fields.

Submission Date is system generated and is not a form field.

============================================================
12. VENDOR NAME
============================================================

Vendor Name must be derived from authenticated Vendor/company.

Do not make it a free editable candidate field.

The frontend may display it, but it must not send a client-selected Vendor
identity as an authorization mechanism.

============================================================
13. PAN UI
============================================================

Vendor enters PAN.

Advance PAN check is advisory only.

If backend indicates possible existing PAN:

show the appropriate generic/security-safe result.

Do not reveal another Vendor's identity.

Final submission performs authoritative PAN validation.

PAN is not editable after candidate creation.

============================================================
14. RESUME UPLOAD
============================================================

Resume must be:

PDF only.

Frontend should provide:

- file selection;
- file validation feedback;
- upload progress;
- processing state;
- extraction state;
- missing fields;
- invalid fields;
- extracted fields;
- manual correction.

Resume processing is deterministic.

There is NO:

- AI;
- LLM;
- human Resume approval screen.

Resume becomes submission-eligible automatically after backend processing
gates succeed.

The frontend must poll/use the approved status API as appropriate.

Do not invent:

"Approve Resume"

button.

============================================================
15. RESUME STATUS
============================================================

Use:

GET /api/v1/resumes/{resume_id}/status

to obtain authoritative processing/eligibility state.

The frontend must not decide eligibility from:

- file extension alone;
- upload completion alone;
- parser result alone.

Backend state is authoritative.

============================================================
16. MANUAL CORRECTION
============================================================

Resume extraction is assistive.

Show:

- extracted values;
- missing values;
- invalid values.

Allow Vendor User to manually correct candidate fields where permitted.

Final submission is still validated by Backend.

============================================================
17. FINAL SUBMISSION
============================================================

Submit through:

POST /api/v1/submissions

Include Idempotency-Key.

Handle:

- success;
- duplicate PAN;
- stale role;
- unauthorized Resume;
- invalid mandatory field;
- Resume not eligible;
- idempotency conflict;
- session expiration;
- generic server error.

Do not create duplicate submission UI states during retries.

The backend result is authoritative.

============================================================
18. VENDOR SUBMISSION LIST
============================================================

Use:

GET /api/v1/vendor/submissions

This list must represent:

all permitted submissions belonging to the authenticated Vendor/company.

Do not filter only by current vendor_user_id.

Do not allow frontend query parameters to redefine ownership.

The backend determines company scope.

Support appropriate:

- pagination;
- loading;
- empty state;
- error state;
- refresh.

============================================================
19. RECRUITER DASHBOARD
============================================================

Recruiter has global operational visibility.

Recruiter can access:

- candidate operations;
- search/filter;
- approval requests;
- Vendor User lifecycle;
- role management;
- candidate detail;
- export;
- authorized PAN reveal;
- Resume download.

Admin-only controls appear only to ADMIN Recruiters.

However:

hiding controls is NOT security.

Backend authorization remains authoritative.

============================================================
20. APPROVAL REQUESTS SCREEN
============================================================

There is ONE in-application Approval Requests screen.

It must distinguish:

1. Vendor Signup Requests
2. Recruiter Signup Requests

Request types must be visually distinguishable.

STANDARD Recruiter:

- can act on Vendor signup requests;
- cannot approve/reject Recruiter signup requests.

ADMIN:

- can act on Vendor signup requests;
- can act on Recruiter signup requests.

Buttons must be disabled/hidden according to current UI state,
but Backend authorization remains authoritative.

Never show:

- password;
- password hash;
- JWT;
- session tokens;
- credential material.

Pending/Approved/Rejected state/history should be represented as defined.

============================================================
21. ADMIN PROFILE
============================================================

Only ADMIN Recruiters see:

- Admin roster;
- Grant Admin;
- Remove Admin.

Maximum two Admins.

Admin can:

- promote ACTIVE STANDARD Recruiter when Admin count < 2;
- remove the other Admin's Admin privilege.

Removing Admin:

ADMIN → STANDARD

Account remains ACTIVE.

Frontend must handle concurrent conflict safely.

Never allow frontend to assume promotion succeeded until Backend confirms it.

============================================================
22. STANDARD RECRUITER
============================================================

Standard Recruiter must NOT see actionable:

- Recruiter signup approval;
- Admin roster;
- Grant Admin;
- Remove Admin.

But backend must also reject direct API access.

============================================================
23. VENDOR USER MANAGEMENT
============================================================

Recruiter can access Vendor User management.

Actions:

- list;
- disable;
- reactivate.

When disabled:

frontend should reflect disabled state.

Backend will revoke sessions.

Frontend must respond to subsequent authentication/session failure.

============================================================
24. ROLE MANAGEMENT UI
============================================================

Recruiter role management must represent:

DRAFT
ACTIVE
CLOSED
ARCHIVED

Actions according to approved V17.

CLOSED role may be reactivated when backend determines:

- current state CLOSED;
- normal validation;
- valid active department;
- no explicit business restriction.

Do not invent extra frontend eligibility rules.

Vendor only sees ACTIVE selectable roles.

============================================================
25. RECRUITER CANDIDATE LIST
============================================================

Use:

GET /api/v1/recruiter/candidates

The UI must support:

multiple dropdown filters simultaneously.

Exactly one active search column at a time.

Search columns:

- Candidate Name
- Contact Number
- Email ID
- Current Company
- Role
- Vendor Name
- Current Location
- Preferred Location
- LinkedIn URL

Filters:

- Current Company
- Role
- Vendor Name
- Employment Mode
- Total Experience
- Relevant Experience
- Notice Period
- CTC
- ECTC
- Education
- CV Sent Date
- Submission Date
- other approved matrix fields.

Numeric/range:

- Total Experience
- Relevant Experience
- CTC
- ECTC

Date/range:

- CV Sent Date
- Submission Date

Multiple filters use AND semantics.

Search + filters may be combined.

============================================================
26. PAN SEARCH RULE
============================================================

PAN:

- cannot be searched;
- cannot be a general filter;
- is not sortable;
- is masked by default.

Do not create a PAN search box.

============================================================
27. SERVER-SIDE DATA
============================================================

CRITICAL:

Never download all candidates and filter locally.

Never implement:

fetchAllCandidates()
→ frontend.filter(...)

Use server-side:

search
+
filters
+
pagination
+
sorting.

============================================================
28. CANDIDATE DETAIL
============================================================

Recruiter can view candidate detail.

PAN:

masked by default.

Reveal:

authorized eye/reveal control.

Reveal must trigger Backend authorization and audit.

Resume:

authorized view/download.

Candidate editing:

allowed approved fields only.

Cannot edit:

- Vendor Name;
- PAN;
- Resume.

Do not create Resume replacement/deletion/version-management UI.

============================================================
29. STATUS UI
============================================================

V17 says dedicated status-management UI is NOT required in V1.

Therefore:

Do not create a full status-management module unless the existing approved
screen requires status display as part of candidate operations.

Backend/API/database status remains authoritative.

Do not invent:

- status reopening;
- Vendor status timeline;
- new status values.

============================================================
30. XLSX EXPORT
============================================================

Export is synchronous V1.

The export button should:

1. use current filters;
2. use current search;
3. call backend;
4. show loading;
5. receive XLSX;
6. download it;
7. show error if unsuccessful.

Do not build:

- export job dashboard;
- export queue UI;
- export_jobs status screen;
- asynchronous export workflow.

The backend applies the same authorization/query scope as the candidate list.

============================================================
31. ERROR HANDLING
============================================================

Handle:

401:

authentication/session issue.

403:

authenticated but unauthorized operation where resource existence is
not sensitive.

404:

- invalid/nonexistent resource;
- sensitive cross-Vendor resource concealment.

Do not convert security-sensitive 404 responses into a visible
"you don't own this resource" message.

Do not expose another Vendor's existence.

Validation errors should be user-friendly.

Do not expose stack traces.

============================================================
32. ACCESSIBILITY
============================================================

All production screens should provide:

- keyboard accessibility;
- labels;
- focus management;
- validation messages;
- accessible buttons;
- accessible dialogs;
- loading announcements where appropriate;
- meaningful empty/error states.

Do not sacrifice accessibility for visual polish.

============================================================
33. RESPONSIVE UI
============================================================

The VMS is a production application.

Implement layouts suitable for:

- desktop;
- laptop;
- tablet where appropriate.

Prioritize the operational desktop workflows for Recruiter screens.

Vendor submission forms must remain usable without excessive horizontal
scrolling.

============================================================
34. FRONTEND SECURITY
============================================================

Do not store sensitive information unnecessarily in browser storage.

Never store:

- password;
- PAN unnecessarily;
- password hash;
- session secret.

Never trust:

- role from URL;
- vendor_id from URL;
- vendor_user_id from URL;
- access_level from local state.

Backend response is authoritative.

Do not expose private Resume object-storage URLs directly unless they are
short-lived authorized URLs supplied by Backend.

============================================================
35. FRONTEND TESTING
============================================================

Test:

AUTHENTICATION

- signup;
- pending state;
- login;
- logout;
- session expiry;
- disabled user.

AUTHORIZATION UI

- Standard vs Admin;
- Admin controls;
- approval controls.

VENDOR

- same-company submissions;
- cross-company denial;
- multiple Vendor Users.

SUBMISSION

- manual entry;
- Resume Auto Entry;
- PAN advisory;
- validation;
- idempotency;
- success/error.

RESUME

- PDF validation;
- processing;
- extraction;
- missing fields;
- manual correction;
- submission eligibility.

RECRUITER

- candidate list;
- search;
- filters;
- pagination;
- sorting;
- candidate detail;
- edit;
- PAN reveal;
- Resume download;
- export.

SECURITY

- unauthorized routes;
- stale sessions;
- ID tampering;
- cross-Vendor responses.

============================================================
36. FRONTEND PERFORMANCE
============================================================

Do not load the entire candidate dataset.

Use:

- server-side pagination;
- controlled query state;
- debounced search where appropriate;
- efficient rendering;
- appropriate loading states.

Do not introduce unnecessary state-management complexity.

============================================================
37. OPEN DESIGN DECISIONS
============================================================

Do not invent UI for:

- password recovery/reset;
- future login-email change verification;
- future status reopening;
- future Vendor status UI;
- PAN correction workflow;
- department CRUD beyond approved behavior;
- cloud-provider-specific UI;
- asynchronous export workflow.

============================================================
38. FINAL FRONTEND VERIFICATION
============================================================

Before completion verify:

[ ] Only Recruiter and Vendor User login roles.
[ ] No separate Admin login.
[ ] Admin controls are Recruiter access-level controls.
[ ] Recruiter signup requires approval.
[ ] Multiple Vendor Users per Vendor supported.
[ ] Same-company Vendor submissions visible.
[ ] Cross-company resources denied by backend.
[ ] Vendor ownership never determined by frontend input.
[ ] Candidate form contains exactly approved fields.
[ ] PAN not searchable.
[ ] PAN reveal is authorized/audited.
[ ] Resume is PDF.
[ ] Resume processing is deterministic.
[ ] No Resume approval screen.
[ ] No AI/LLM.
[ ] Resume eligibility comes from backend.
[ ] Only ACTIVE roles selectable.
[ ] CLOSED role reactivation follows backend.
[ ] Candidate filtering is server-side.
[ ] Search/filter matrix is followed.
[ ] Multiple filters use AND.
[ ] One search column at a time.
[ ] Export is synchronous.
[ ] Export uses current filters/search.
[ ] No export_jobs UI.
[ ] Status-management UI is not invented.
[ ] Error behavior respects 401/403/404 policy.
[ ] Admin controls only shown to Admin.
[ ] Frontend does not rely on hidden buttons for security.
[ ] No sensitive data is unnecessarily stored client-side.
[ ] Frontend tests exist.
[ ] UI/API contracts match Backend.
[ ] No OPEN DESIGN DECISION was invented.

============================================================
39. DELIVERABLES
============================================================

Produce:

1. frontend architecture;
2. route structure;
3. page/screen implementation;
4. reusable components;
5. form components;
6. validation;
7. API client layer;
8. authentication/session integration;
9. authorization-aware UI;
10. Vendor workflows;
11. Recruiter workflows;
12. Admin workflows;
13. Resume upload/review UI;
14. candidate operations;
15. search/filter/export;
16. error handling;
17. accessibility;
18. responsive behavior;
19. frontend tests;
20. README;
21. V17 traceability matrix.

Do not implement Backend business logic.

Do not modify database schema.

If an API required by the UI is missing, compare against the V17 API catalog
before requesting/adding anything.

Do not invent undocumented endpoints.