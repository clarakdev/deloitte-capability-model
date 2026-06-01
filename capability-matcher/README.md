# Deloitte Capability Matcher

AI-powered role-capability matching tool that ranks Deloitte employees against
project roles using semantic similarity on the ESCO skills taxonomy.

---

## What you need to install

Do this once on a new machine.

### Python 3.10 or higher
Download from https://python.org

> **Important:** during install, tick **"Add Python to PATH"** before clicking Install.

Verify:
```bash
python --version
```

### Node.js (LTS)
Download from https://nodejs.org — click the left **LTS** button.

Verify:
```bash
node --version
npm --version
```

---

## First-time setup

Do this once after cloning the repo.

**Backend** — from the root folder (where `app.py` lives):
```bash
pip install -r requirements.txt
```

**Frontend** — from the React app folder (where `package.json` lives):
```bash
cd capability-matcher
npm install
```

---

## Running the app

You need **two terminals open at the same time.**

### Terminal 1 — Backend
From the root folder:
```bash
python -m uvicorn app:app --reload
```
When ready you'll see:
INFO:     Uvicorn running on http://127.0.0.1:8000

### Terminal 2 — Frontend
From the React app folder:
```bash
cd capability-matcher
npm run dev
```
When ready you'll see:
Local:   http://localhost:5173/

Then open **http://localhost:5173** in your browser.

> Leave both terminals running. Closing either one stops that part of the app.

---

## Verify everything works

| # | Check | Expected |
|---|-------|----------|
| 1 | Open http://localhost:8000/docs | FastAPI Swagger page loads |
| 2 | Open http://localhost:5173 | Home screen loads with 5 roles |
| 3 | Click a role | Expands with full description |
| 4 | Click "Start matching this role" | Frame 2 loads with AI-inferred skills |
| 5 | Move a weight slider | Weight saves to backend |
| 6 | Search ESCO and click a result | Skill added to the list |
| 7 | Click "Browse candidates" | Frame 3 loads with 30 ranked employees |
| 8 | Toggle "Available only" | List reduces to 25 |
| 9 | Select a candidate → "View gap analysis" | Frame 4 loads with gap breakdown |

> Frame 2 is slow on the first load — the AI model is warming up. Faster after that.

---

## Stopping the app

Press `Ctrl + C` in both terminals.

> Any capability edits (weights, added skills) are lost on restart — stored in memory only. Persistence is Sprint 2.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `uvicorn is not recognized` | Use `python -m uvicorn app:app --reload` instead |
| `pip install` fails | Try `python -m pip install -r requirements.txt` |
| Blank white screen on frontend | Press F12 → Console tab, check for red errors |
| Frame 2 shows "Could not load capabilities" | Backend is not running — check Terminal 1 |
| Sliders not saving | Check Terminal 1 is still running |
| `npm install` fails | Make sure you're in the folder with `package.json` |
| Port 8000 already in use | Add `--port 8001` to the uvicorn command, then update `BASE_URL` in `src/api/api.js` |
| Port 5173 already in use | Vite picks the next free port automatically — check Terminal 2 for the actual URL |

---
/
├── app.py                        — FastAPI server, all API endpoints
├── requirements.txt              — Python dependencies
├── core/
│   ├── capability_inference.py   — AI skill inference from role description
│   ├── matching.py               — Employee ranking engine
│   ├── gap_analysis.py           — Per-capability gap breakdown
│   ├── embedding_engine.py       — Sentence transformer + ESCO cache
│   └── employee_profile.py       — Employee composite vector builder
├── data/
│   ├── project.json              — Demo project and 5 roles
│   ├── employees.json            — 30 synthetic employees
│   ├── esco_skills.csv           — Filtered ESCO skill set
│   └── esco_embeddings.npy       — Pre-computed skill embeddings
├── scripts/                      — One-off data generation scripts
├── tests/                        — Backend unit tests
└── capability-matcher/           — React frontend (Vite)
    └── src/
    ├── api/api.js            — All fetch calls to the backend
    ├── pages/
    │   ├── Frame1.jsx        — Project overview
    │   ├── Frame2.jsx        — Skill requirements
    │   ├── Frame3.jsx        — Candidate selection
    │   └── Frame4.jsx        — Gap analysis
    ├── App.jsx               — Navigation and shared state
    └── App.css               — Dark theme design tokens

---

## Quick reference

| What | Command | URL |
|------|---------|-----|
| Start backend | `python -m uvicorn app:app --reload` | http://localhost:8000/docs |
| Start frontend | `npm run dev` | http://localhost:5173 |
| Stop either | `Ctrl + C` in the terminal | — |
| Install backend deps | `pip install -r requirements.txt` | — |
| Install frontend deps | `npm install` | — |

---

*This service uses the ESCO classification of the European Commission.*