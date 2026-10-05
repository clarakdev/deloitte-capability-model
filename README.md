# Deloitte Capability Matcher

AI-powered role–capability matching web app for Deloitte. Project managers describe the roles on a project, the app infers the required skill capabilities from the ESCO taxonomy, and ranks employees against each role with a gap analysis.

- **Backend**: FastAPI (Python): `app.py` and `core/`
- **Frontend**: React (Vite): `capability-matcher/`
- **Data**: projects, roles, capabilities and assignments live in Supabase; the employee pool and ESCO skill data are local files
- **Auth**: Supabase authentication with role-based access on both the frontend and the backend

---

## How it works

### Sign in and dashboard

Sign in on the login screen. The dashboard is role-gated:

| Role | Tabs |
| :--- | :--- |
| Employee | Profile, My Projects, My Skills |
| Manager | Employee tabs + Capability Matcher |
| Resource Manager | Employee tabs + Capability Matcher, All Projects |

My Projects lists the projects the user created or is assigned to; All Projects (Resource Manager) lists everything.

### Matching flow (Capability Matcher)

Five steps, with **Back to Dashboard** available in the header at any point:

1. **Projects**: select a project, or create, edit or delete one. Cards show who created each project.
2. **Project setup**: add, edit, duplicate, delete and reorder roles, and set the required percentage for each.
3. **Skill requirements**: AI infers the top ESCO skills from the role title and description (the count is configurable). Search the ESCO catalogue to add skills manually, adjust importance weights (1–5), and remove skills. Skills are saved to Supabase when you continue.
4. **Select team**: candidates ranked by fit. Filter by availability, prior experience, location and role level; candidates without enough remaining capacity are flagged. Select one candidate for a gap analysis, or two to compare side by side.
5. **Gap analysis**: per-capability strengths and gaps, an optional AI fit report, and a PDF export. Saving assigns the candidate to the role.

### Team report

Once every role in a project has an assignment, **View Team Report** becomes available in project setup. The report page shows the proposed team, per-member detail and notes, a downloadable DOCX report, and an optional AI *Team Business Chemistry* analysis.

---

## Authentication

The app uses Supabase Auth. The frontend signs in with email and password and attaches the session token to every backend call. The backend validates the token with Supabase and enforces role checks per endpoint, so requests without a valid session return `401`, including Swagger UI at `http://localhost:8000/docs`.

---

## Demo accounts

For evaluation and handover, sign in with:

| Role | Email | Password |
| :--- | :--- | :--- |
| Resource Manager | `umabrown@deloittecapability.com` | `password123` |
| Manager | `priyaevans@deloittecapability.com` | `password123` |
| Employee | `victorthomas@deloittecapability.com` | `password123` |

---

## Environment configuration

Two local `.env` files are required (both are git-ignored). Example files are provided, copy each `.env.example` to `.env` and fill in the values.

**Backend**: repository root, `/.env.example`:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemini-3.5-flash-lite

# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Frontend**: `capability-matcher/.env.example`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Notes:

- The Supabase keys are required. Without them, sign-in and all data endpoints fail.
- The OpenRouter key is only needed for the AI fit reports and the chemistry analysis. Deterministic matching works without it.
- `OPENROUTER_MODEL` can be any OpenRouter model id. If unset, the backend defaults to `deepseek/deepseek-v4-flash`.

---

## First-time setup

### Python 3.10 or higher

Download from https://python.org. On Windows, tick **Add Python to PATH** during install.

Verify:

```bash
python --version
```

### Backend dependencies

From the repository root:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # Windows (PowerShell)
source .venv/bin/activate        # Mac/Linux
pip install -r requirements.txt
```

If corporate Windows policy blocks the normal install path, use `pip install --user -r requirements.txt`.

### Frontend dependencies

From the `capability-matcher` folder:

```bash
npm install
```

---

## Running the app

You need two terminals open at the same time.

**Terminal 1: backend**, from the repository root:

```bash
python -m uvicorn app:app --reload
```

Ready when you see `Uvicorn running on http://127.0.0.1:8000`. The first start downloads and loads the embedding model, so allow a little extra time.

**Terminal 2: frontend**, from the `capability-matcher` folder:

```bash
npm run dev
```

Ready when you see `Local: http://localhost:5173/`.

Open **http://localhost:5173** in your browser. API docs are at http://localhost:8000/docs (see Authentication above for the `401` note).

Closing either terminal stops that part of the app. To stop both, press `Ctrl + C` in each terminal.

---

## Troubleshooting

| Problem | Fix |
| :--- | :--- |
| `pip install` permission errors | Activate `.venv` first, or use `pip install --user -r requirements.txt` |
| `uvicorn` is not recognized | Run `python -m uvicorn app:app --reload` from the repository root |
| Port `8000` already in use (`Errno 10048`) | Stop the other Python process, or add `--port 8001` |
| Port `5173` already in use | Vite picks the next free port automatically |
| Sign-in or data fails | Check both `.env` files exist with the correct Supabase keys |
| `401 Unauthorized` in Swagger | Expected, authenticate first (see Authentication) |
| Blank white screen | Press F12 and check the browser console, usually a missing frontend `.env` or `npm install` |
| `npm install` fails | Make sure you're in the `capability-matcher` folder (the one with `package.json`) |

---

## Demo data and limitations

- The employee pool is 100 synthetic employees in `data/employees.json`, generated by the scripts in `scripts/`. It contains no real personal data.
- **My Skills** shows role-based sample skills, not live skill data.
- Projects, roles, capabilities and assignments are stored in Supabase and persist across restarts. The backend also keeps capability lists in memory for the current session; saved capabilities are reloaded from Supabase.
- AI fit reports and the chemistry analysis need a working OpenRouter key. If the key is missing or the model is unreachable, everything else still works.

---

## Project structure

```text
app.py                  FastAPI backend (all API endpoints)
core/                   Matching engine: capability inference, ranking, gap analysis,
                        embeddings, AI reports, security
data/                   Demo project, synthetic employees, ESCO skills + pre-computed embeddings
scripts/                Data generation scripts
tests/                  Backend unit tests
capability-matcher/     React frontend (Vite)
```

The root-level `package.json` and `src/` folder are an early prototype kept for reference; the app to run is `capability-matcher/`.

In the frontend, backend calls are centralised in `capability-matcher/src/api/api.js`, the base URL is set there. One known exception: the chemistry-report call in `TeamReportPage.jsx` hardcodes `http://localhost:8000`.

---

*This service uses the ESCO classification of the European Commission.*
