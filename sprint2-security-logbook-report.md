# Sprint 2 Security and Frontend Scaffolding Report

## 1. Official Logbook Work Entry (First-Person Narrative)

I investigated the authentication and role-isolation issues that surfaced during the latest sprint verification cycle. My first step was to reproduce the failure in the backend login flow and confirm whether the seeded demo accounts were able to authenticate successfully against the expected credentials. The failure pointed to a mismatch between the account records in the local seed file and the intended test password, so I corrected the stored bcrypt hashes in the user registry and verified that the login endpoint now issued valid JWTs for the demo accounts.

After authentication was restored, I moved to the authorization layer in the FastAPI application and implemented the role-based access control guards required for US019 and US020. I added a shared token verification dependency that decodes JWTs against the project’s configured secret and algorithm, verifies that the token subject still maps to a known user record, and confirms the embedded role claim matches the stored role. I then implemented a reusable permission dependency factory so protected endpoints could require a specific role set without duplicating guard logic. This was applied to the candidate-list and fit-breakdown endpoints so that only permitted roles could access the master candidate ranking view while employees were restricted to their own self-service fit analysis.

I also documented the security events in the project audit log to capture successful and failed authentication and authorization events. Once the backend behavior was valid, I pivoted to the frontend environment and built the missing Vite-based React entry files needed to serve the UI locally. I created the project manifest, the Vite configuration, the root HTML shell, and the React bootstrap module, then installed the node dependencies and confirmed that the local development server responded successfully on port 3000. Finally, I executed the automated verification script that exercises the protected routes through FastAPI’s test client and confirmed that the user stories passed end to end.

## 2. Deep Technical Breakdown of the Fixes

### Backend security logic added for US019 and US020

The backend security enforcement was implemented in [app.py](app.py) and supported by [core/security.py](core/security.py) and [core/logger.py](core/logger.py).

#### Authentication flow

- The login endpoint accepts a username/password payload and looks up the account in the local user registry loaded from [data/users.json](data/users.json).
- Password verification is handled by the bcrypt-backed helper in [core/security.py](core/security.py), which compares the supplied password with the stored hash without storing passwords in plaintext.
- On successful login, the server issues a signed JWT containing the user’s identity and role claim. On failure, it records a structured audit event and returns a 401 response.

#### Token validation and role resolution

- The `get_current_user` dependency decodes the bearer token using the configured `SECRET_KEY` and `ALGORITHM`.
- It validates the presence of the `sub` and `role` claims, confirms the account exists in the local user map, and rejects the request if the role in the token no longer matches the stored role.
- This provides a consistent identity context for downstream authorization checks.

#### Role-based access control for candidate endpoints

- The master candidate list endpoint, `GET /roles/{role_id}/candidates`, is protected by a dependency that only allows `Admin`, `HR User`, and `Project Manager` roles.
- This satisfies the privilege-escalation boundary for US020 by denying employee access to the full candidate ranking view.
- The fit-breakdown endpoint, `GET /roles/{role_id}/candidates/{emp_id}/fit`, is available to `Admin`, `HR User`, `Project Manager`, and `Employee` roles, but it contains an additional employee-specific guard.
- When the current user has the `Employee` role, the route compares the requested `emp_id` with the `employee_id` recorded for the authenticated account. If they do not match, the endpoint returns HTTP 403 with the message that employees may only view their own fit analysis.
- This explicit check satisfies US019 by allowing self-service access when the employee requests their own profile while preventing lateral access to another employee’s fit breakdown.

#### Audit logging

- The authentication and authorization actions are logged through [core/logger.py](core/logger.py), which appends entries to [data/security_audit.log](data/security_audit.log).
- Each record contains a UTC timestamp, status, acting user, action performed, and optional details, making the implementation suitable for later review by mentors, compliance stakeholders, and team reviewers.

### Frontend configuration files created for local React hosting

I created the following files to scaffold a working Vite-based React workspace locally:

- [package.json](package.json): defines the package metadata, scripts (`dev`, `build`, `preview`), React runtime dependencies, and Vite plugin dependencies required to build and run the UI.
- [vite.config.js](vite.config.js): declares the React plugin and configures the development server to run at `127.0.0.1:3000`, which aligns with the local launch instructions and avoids a random port.
- [index.html](index.html): provides the root HTML document that Vite serves to the browser and mounts the application into the `#root` container.
- [src/main.jsx](src/main.jsx): acts as the actual React entry point. It imports `React`, `ReactDOM`, and the main `App` component, then renders the application inside the root element using `React.StrictMode`.

These files are sufficient to boot the React interface with Vite while preserving compatibility with the existing React component structure already present in [src/App.jsx](src/App.jsx) and [src/components/Login.jsx](src/components/Login.jsx).

### Automated validation script overview

I created [verify_user_stories.py](verify_user_stories.py) as a lightweight integration harness that exercises the security logic end to end through FastAPI’s test client.

The script performs three checks:

1. It logs in as `xavier_green` with the expected demo password and verifies that the employee can obtain a JWT successfully.
2. It requests the own fit breakdown route for `EMP004` and expects HTTP 200 to confirm that self-service access works.
3. It requests another employee’s fit breakdown and the master candidate list and expects HTTP 403 in each case to confirm that lateral isolation and privilege escalation are blocked.

The validation script was executed successfully in the repository environment, producing the following evidence:

- `US019 Passed`
- `US020 Lateral Isolation Passed`
- `US020 Privilege Escalation Passed`

## 3. Team User & Integration Guide

### Repository setup instructions

1. Clone the updated repository state into your local working directory.
2. Open the repository root in PowerShell or your preferred terminal.
3. Create and activate a Python virtual environment:

   ```powershell
   py -3 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

4. Install the Python dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

5. Start the FastAPI backend from the repository root:

   ```powershell
   uvicorn app:app --reload
   ```

   The API will be available at `http://127.0.0.1:8000/docs` for interactive Swagger documentation.

### Frontend setup instructions

1. From the repository root, install the Node dependencies:

   ```powershell
   npm install
   ```

2. Launch the Vite development server on port 3000:

   ```powershell
   npm run dev -- --host 127.0.0.1 --port 3000
   ```

3. Open the app in the browser at:

   ```text
   http://127.0.0.1:3000/
   ```

### Recommended demo credentials

The seeded accounts in [data/users.json](data/users.json) are configured for local testing and authentication demos:

- `admin_user` / `password123`
- `hr_user` / `password123`
- `pm_user` / `password123`
- `xavier_green` / `password123`

### Integration with the existing capability mapping architecture

This security layer sits on top of the existing capability-matching architecture rather than replacing it. The current backend already exposes role capability endpoints and the matching pipeline that ranks employees against a role based on capability fit. The new RBAC guards simply ensure that only the correct audience can invoke these routes and that employees are restricted to their own self-service view.

### Suggested validation step for the team

Before merging or demoing the sprint work, run the end-to-end verification script from the repository root:

```powershell
py -3 verify_user_stories.py
```

Expected result:

- `US019 Passed`
- `US020 Lateral Isolation Passed`
- `US020 Privilege Escalation Passed`
