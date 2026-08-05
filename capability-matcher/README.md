# Deloitte Capability Matcher

AI-powered role-capability matching workspace that ranks Deloitte employees against project roles using a unified dashboard, Supabase-backed project visibility, and the ESCO taxonomy for skill inference and gap analysis.

---

## Iteration Summary

This release introduces a unified dashboard architecture that keeps the post-login experience consistent across every role:

- Employee: Profile, My Projects, My Skills
- Manager: Profile, My Projects, My Skills, Capability Matcher
- Resource Manager: Profile, My Projects, My Skills, Capability Matcher, All Projects, All Employees

The user journey now flows cleanly from Sign In → Dashboard → Matching Flow, with a direct launch into Frame 0 and dedicated navigation back to the dashboard when the evaluator exits the matcher.

---

## Quick Evaluator Login Accounts

Use any of the following demo credentials in the sign-in screen for rapid evaluation:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Resource Manager** (Admin) | `umabrown@deloittecapability.com` | `password123` |
| **Manager** | `priyaevans@deloittecapability.com` | `password123` |
| **Employee** | `victorthomas@deloittecapability.com` | `password123` |

> These demo identities are surfaced in the login experience as stable evaluator shortcuts so the team can validate the dashboard and role-gated flows quickly.

---

## Environment Configuration (`.env`)

Create a local `.env` file in the project root for developer-only secrets and Supabase credentials. Do not commit this file to Git.

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemini-3.5-flash-lite

# Supabase Credentials
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

> Keep `.env` local to the developer machine and never store it in the repository history.

---

## First-Time Setup and Virtual Environment Fixes

### Python 3.10 or higher
Download from https://python.org.

> During install, make sure you tick **Add Python to PATH** before proceeding.

Verify:
```bash
python --version
```

### Create and activate `.venv` to avoid Windows permission issues

Windows (PowerShell):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Mac/Linux:
```bash
python -m venv .venv
source .venv/bin/activate
```

### Backend dependencies
From the repository root:
```bash
pip install -r requirements.txt
```

If corporate Windows policy blocks the normal install path, use the fallback:
```bash
pip install --user -r requirements.txt
```

### Frontend dependencies
From the React app folder:
```bash
cd capability-matcher
npm install
```

---

## Running the App

You need **two terminals open at the same time**.

### Terminal 1 — Backend
From the repository root:
```bash
python -m uvicorn app:app --reload
```

When it is ready, you should see:
```text
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2 — Frontend
From the React app folder:
```bash
cd capability-matcher
npm run dev
```

When it is ready, you should see:
```text
Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser.

> Leave both terminals running; closing either one stops the corresponding part of the app.

---

## New Dashboard Features

### Unified Dashboard Architecture

The dashboard shell is now the single landing surface after successful authentication. It is role-aware and conditionally renders the correct tab set for each user.

### Role-Gated Tab Behavior

- Employee sees: Profile, My Projects, My Skills
- Manager sees: Profile, My Projects, My Skills, Capability Matcher
- Resource Manager sees: Profile, My Projects, My Skills, Capability Matcher, All Projects, All Employees

### Project Creator Metadata

Project cards in both the personal and resource-manager project views now display a friendly creator summary:

- `Created by: [Manager Name]`
- If the creator is unavailable, the UI gracefully falls back to `Resource Management Team`

### Dynamic Demo Skills

The skills tab now uses role-appropriate mock skill bundles for the evaluator demo instead of a single static list, making the preview more realistic for the team review.

### Admin Employee Directory Review

The All Employees directory now supports a cleaner summary expansion surface per employee row, surfacing the employee's role and a realistic skill snapshot without overwhelming the directory layout.

### Matching Flow Navigation

Inside the multi-step matching flow, the top navigation now includes a clear `Back to Dashboard` action. This resets the matcher state and returns the evaluator cleanly to the unified dashboard.

### Secure Logout

The dashboard header now includes a secure Logout action that clears the current session profile state and transitions the app back to the Sign In screen.

---

## Verification Checklist

| # | Check | Expected |
|---|-------|----------|
| 1 | Open `http://localhost:8000/docs` | FastAPI Swagger page loads |
| 2 | Open `http://localhost:5173` | Unified dashboard sign-in screen loads |
| 3 | Sign in using one of the test emails above | Dashboard loads with the correct role-specific tabs |
| 4 | Click `Capability Matcher` from the dashboard | Matching flow launches at Frame 0 |
| 5 | Click `Back to Dashboard` in the flow | View returns to the unified dashboard |
| 6 | Click `Logout` from the dashboard header | App returns to the sign-in screen |
| 7 | Review `My Projects` or `All Projects` | Project cards include `Created by` metadata |
| 8 | Open `My Skills` | Dynamic role-appropriate demo skills are displayed |
| 9 | Open `All Employees` | Employee row expansion shows a summary card with role and skills |

---

## Stopping the App

Press `Ctrl + C` in both terminals.

---

## Expanded Troubleshooting

| Error | Fix |
|-------|-----|
| `pip install` permission errors | Activate `.venv` first or use `pip install --user -r requirements.txt` |
| `uvicorn` is not recognized | Use `python -m uvicorn app:app --reload` instead |
| Port `8000` is already in use (`Errno 10048`) | Stop the existing Python process or run the backend on `--port 8001` |
| Supabase auth/data looks blank | Verify your local `.env` credentials exist and are correct |
| Blank white screen on frontend | Press F12 and check the console for missing dependencies or build errors |
| `npm install` fails | Make sure you're in the folder with `package.json` |
| Port `5173` already in use | Vite will pick the next free port automatically |

---

## Project Structure

```text
.
├── app.py                                — FastAPI server and all API endpoints
├── requirements.txt                      — Python dependencies
├── core/
│   ├── capability_inference.py           — AI skill inference from role description
│   ├── matching.py                       — Employee ranking engine
│   ├── gap_analysis.py                    — Per-capability gap breakdown
│   ├── embedding_engine.py                — Sentence transformer + ESCO cache
│   └── employee_profile.py                — Employee composite vector builder
├── data/
│   ├── project.json                       — Demo project and 5 roles
│   ├── employees.json                     — 30 synthetic employees
│   ├── esco_skills.csv                    — Filtered ESCO skill set
│   └── esco_embeddings.npy                — Pre-computed skill embeddings
├── scripts/                              — One-off data generation scripts
├── tests/                                — Backend unit tests
└── capability-matcher/
    ├── README.md                         — Frontend build and evaluation notes
    ├── package.json                      — Vite frontend metadata
    └── src/
        ├── api/api.js                    — All fetch calls to the backend and Supabase
        ├── App.jsx                       — Navigation and shared app state
        ├── App.css                       — Shared dark theme and layout tokens
        └── pages/
            ├── Dashboard.jsx             — Unified dashboard shell and role-gated tabs
            ├── ProfileTab.jsx            — Profile summary surface
            ├── ProjectsTab.jsx           — Personal project directory view
            ├── SkillsTab.jsx             — Dynamic demo skills and request form
            ├── AdminProjectsTab.jsx      — Resource Manager project directory
            ├── AdminEmployeesTab.jsx     — Employee directory with summary expansion
            ├── Frame0.jsx                — Project selection entry point
            ├── Frame1.jsx                — Project role setup
            ├── Frame2.jsx                — Skill requirements
            ├── Frame3.jsx                — Candidate selector
            └── Frame4.jsx                — Gap analysis
```

---

## Quick Reference

| What | Command | URL |
|------|---------|-----|
| Start backend | `python -m uvicorn app:app --reload` | http://localhost:8000/docs |
| Start frontend | `npm run dev` | http://localhost:5173 |
| Stop either | `Ctrl + C` in the terminal | — |
| Install backend deps | `pip install -r requirements.txt` | — |
| Install frontend deps | `npm install` | — |

---

*This service uses the ESCO classification of the European Commission.*