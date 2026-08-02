## Sprint 2: Authentication & Role-Based Access Control Architecture

### 1. Architectural Implementation Phases:
- **Phase 1: Discovery & Cryptographic Blueprinting:** Evaluated security gaps and established the migration plan away from open endpoints to structured RBAC verification using `passlib[bcrypt]` and `python-jose`.
- **Phase 2: Database Schema & Core Hashing Utilities:** Created `data/users.json` seed databases mapping to physical employee profile identifiers and deployed standalone cryptographic utilities in `core/security.py`.
- **Phase 3: Route Guard Injection Framework:** Extended `app.py` with dependency-injection validation engines (`get_current_user` and `require_roles`) to screen API traffic at the perimeter.
- **Phase 4: Frontend Guard Rails & Session Hooks:** Built `src/components/Login.jsx` tracking state mechanisms and updated `src/App.jsx` with conditional wrapper layout blocks preserving state sessions across local reloads.
- **Phase 5: Secure Ledger Logging Engine:** Implemented `core/logger.py` targeting append-only tracking indices mapping file changes onto `data/security_audit.log`.

### 2. Functional Acceptance Criteria Outcomes:
- **US019 Status:** Completed. Secure token issuance blocks unauthenticated requests; user identities persist correctly across tab reloads via local engine storage keys.
- **US020 Status:** Completed. Evaluates user profiles against 4 distinct roles (Admin, HR User, Project Manager, Employee). Unauthorised attempts are blocked with generic HTTP 403 blocks and immediately logged to an immutable security audit ledger.
