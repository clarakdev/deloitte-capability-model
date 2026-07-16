# Sprint 2 Retrospective: LLM Gap Analysis (OpenRouter)

**Dates:** Sprint ran late June 2026
**Goal:** Add an AI-integrated gap analysis report system on top of the existing embedding-based role-capability matcher, for use by Deloitte project managers.

---

## 1. Background and starting point

At the end of Sprint 1 the product could:

- Infer required capabilities for a project role from its title/description (ESCO-backed).
- Rank all employees against those capabilities using `all-MiniLM-L6-v2` cosine similarity.
- Produce a per-capability deterministic gap table for one selected employee (`analyse_fit`).

What it could *not* do: give the user a qualitative, plain-English read on *how well* a candidate fits a role, or *why* one candidate should be preferred over another. The gap table was accurate but hard to interpret at a glance, and auto-mode silently picked `candidates[0]` with no justification.

The Sprint 2 brief was to bring in an LLM to interpret the deterministic backbone and, in auto mode, to make a defensible selection. Two paths were on the table:

1. Replace the embedding matcher with an LLM-based matcher.
2. Keep embeddings for ranking; add an on-demand LLM layer that interprets the existing deterministic output.

After analysis (see §2), we chose the hybrid approach (option 2).

---

## 2. Planning phase — analysis and decisions

### 2.1 Codebase analysis findings

Before planning, I read the codebase in depth. Key findings that shaped the plan:

- The matching pipeline is deterministic, free, and instant. Replacing it wholesale with LLM calls for every employee × every capability (≈150 calls per role refresh on the demo dataset) would be costly, slow, and non-deterministic — hard to defend to a client.
- The gap analysis already produces a per-capability `{best_match_skill, similarity, is_gap, weight}` table. This is a perfect structured input for an LLM to *interpret* — the LLM does not need to re-derive fit from raw text.
- Employee skills are free-text names with **no ESCO URI and no proficiency level**. The LLM therefore cannot authoritatively claim "Jane holds ESCO skill X" or "Jane is a 4/5 in Python" — only that "Jane's closest recorded skill to capability Y has similarity Z." The prompt and tone had to reflect this.
- The `google-generativeai` dependency in the prototype's `requirements.txt` was dead (never imported). Removing it was a free win.
- Frame3 (candidate list) was already skipped in Auto mode; `App.jsx` jumped Frame2 → Frame4, and Frame4 silently used `candidates[0]`.

### 2.2 Key decisions

**D1 — Hybrid architecture, not LLM-everywhere.** Embeddings keep ranking (free, instant, deterministic, reproducible for demos). The LLM only (a) interprets the gap table for a selected candidate, and (b) in auto mode, picks between the top-5 ranked candidates. LLM-as-full-ranker was explicitly deferred to a later research spike.

**D2 — OpenRouter via the OpenAI SDK, not a direct Gemini client.** The original prototype plan named Gemini specifically, but OpenRouter is OpenAI-compatible and lets us hot-swap the model by editing one env var — useful for a team that wants to compare models during development. This also removed the dead `google-generativeai` dependency.

**D3 — On-demand, not pre-computed.** The LLM is called only when the user clicks "Generate AI report" (hands-on) or when auto mode navigates to Frame4. This keeps cost per session in the single digits of calls, not hundreds.

**D4 — Structured JSON output, not markdown prose.** Both endpoints return JSON (`{overall_fit_score, report}` and `{selected_employee_id, rationale}`). This is testable with assertions, renderable with no markdown library on the frontend, cheaper (shorter output), and more defensible than freeform text.

**D5 — Auto-mode LLM pick is binding, with transparency.** The LLM may override embedding rank #1, its choice is what Frame4 shows, but the rationale and the other top-5 candidates are surfaced in a collapsible list so the user (and the client) can audit the override.

**D6 — Proficiency via heuristic proxy, no schema change.** The prompt includes `years_experience`, `certifications`, `prior_roles`, and skill-count-by-category as context. A real `level` field on employee skills was deferred (pending client input flagged in Sprint 1).

**D7 — Objective tone, enforced in the system prompt.** No marketing language, no enthusiasm, no claims of certified competency. The report interprets similarity scores; it does not assert mastery.

**D8 — In-memory cache with capability-mutation invalidation.** Re-clicking the report button on the same candidate (same role, same capabilities) returns instantly and bills nothing. Any capability add/update/delete drops the cache for that role.

### 2.3 User stories

Seven user stories were drawn up, sized 2/3/5 story points (total 22 pts):

| ID | Title | Pts |
|---|---|---|
| US-S2-01 | Generate AI fit report for a candidate (hands-on) | 5 |
| US-S2-02 | AI report includes an overall fit score | 2 |
| US-S2-03 | Auto mode picks the best candidate via the LLM with a rationale | 5 |
| US-S2-04 | Auto mode shows the other top candidates considered (collapsible) | 3 |
| US-S2-05 | Loading indicator while the AI is thinking | 2 |
| US-S2-06 | Graceful fallback when the AI service is unavailable | 3 |
| US-S2-07 | Re-opening a candidate's AI report is instant (cache) | 2 |

### 2.4 Implementation order

The plan was split into five phases, executed roughly in order:

1. LLM client & config
2. Prompts & schemas (done in parallel with Phase 1 — they live in the same module)
3. Backend endpoints & caching
4. Frontend integration
5. Tests & verification

Phases 1+2 were combined because the prompt builders and the client live in the same file and are mutually reviewable.

---

## 3. Phase 1 — LLM client & config

**Files touched:** `requirements.txt`, `.env.example` (new), `.gitignore` (new), `core/llm_report.py` (new).

- Added `openai>=1.40.0` and `python-dotenv>=1.0.0` to `requirements.txt`. Confirmed the root file did not contain the dead `google-generativeai` (only the prototype's separate `requirements.txt` did).
- Created `.env.example` with `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, `OPENROUTER_MODEL=deepseek/deepseek-v4-flash`. Created a root `.gitignore` that ignores `.env` so no real key can be committed.
- Created `core/llm_report.py` with:
  - An `AsyncOpenAI` client created **lazily** — importing the module never fails without a key; `ConfigError` surfaces only when an actual call is made. This is important because `app.py` imports the module at startup.
  - Two async entry points: `generate_fit_report` → `{overall_fit_score, report}` and `select_best_candidate` → `{selected_employee_id, rationale}`. Both use `response_format={"type": "json_object"}` and `temperature=0.2` for factual, repeatable output.
  - Pure sync prompt builders (`_build_hands_on_prompt`, `_build_auto_prompt`) so they are unit-testable without an API key.
  - Schema validators that raise `LLMReportError` on any deviation.

**Verification:** module imports with no env set; prompt builders render expected fields; schema validators accept valid input and reject malformed input; lazy client raises `ConfigError` only on actual use; Pylance clean.

---

## 4. Phase 2 — Prompts & schemas

Lived in `core/llm_report.py` alongside the client. The prompts were the highest-leverage, most-reviewable work of the sprint.

- **Hands-on system prompt:** "you are a skill-gap analyst for a Deloitte project manager." Strict rules: use only provided data, no invented skills/certs, objective tone, no markdown, no enthusiasm, severity fuses similarity × weight, no-skills edge case handled.
- **Hands-on user prompt:** role context (title/description) + capabilities (id/label/description/weight/inferred flag) + employee profile (skills grouped by category, years, certs, prior roles, tools, summary) + the pre-computed `analyse_fit()` table. The LLM interprets the deterministic backbone; it never re-judges from raw text.
- **Auto system prompt:** "you are selecting the best-fit employee from the top 5." May override rank #1 only when a lower candidate has materially better fit on a high-weight capability or fewer severe gaps. One-paragraph objective rationale.
- **Auto user prompt:** role context + for each of 5 candidates (rank, id, name, embedding score, condensed gap summary: gap count, worst gap by similarity×weight, strongest match).

The `_condense_fit` helper reduces each candidate's full fit table to the 4 signals the auto prompt needs, keeping token cost down.

---

## 5. Phase 3 — Backend endpoints & caching

**File touched:** `app.py`.

- Added `dotenv.load_dotenv()` at import so the LLM client picks up `.env` automatically.
- Added two response models (`LLMReportOut`, `AutoSelectOut`) and two async endpoints:
  - `POST /roles/{role_id}/candidates/{emp_id}/llm-report` — runs `analyse_fit`, calls `generate_fit_report`, caches by `(role_id, emp_id, capability_hash)`, returns the prose + 0–100 score. 503 on missing key or LLM failure with a message pointing to the still-working deterministic `/fit` endpoint.
  - `POST /roles/{role_id}/auto-select` — ranks candidates, takes top 5, runs `analyse_fit` on each, calls `select_best_candidate`, caches by `(role_id, capability_hash)`, returns the binding pick + rationale + the full top-5 list. 503 with a "fall back to rank #1" message on LLM failure.
- Added `_capability_hash()` (stable SHA-256 of capability ids+weights, order-independent) and `_invalidate_llm_cache(role_id)`. Hooked invalidation into all three capability mutation handlers (POST/PUT/DELETE).

**Verification (TestClient, no API key):** deterministic `GET /fit` and `GET /candidates` still 200; both LLM endpoints 503 with correct detail strings; 404s for unknown role/employee; cache hit (second call does not re-invoke the stubbed LLM); cache invalidation on capability add; auto-select returns a valid pick from the top 5 with a non-empty rationale; Pylance clean.

---

## 6. Phase 4 — Frontend integration

**Files touched:** `capability-matcher/src/api/api.js`, `src/pages/Frame3.jsx`, `src/App.jsx`, `src/pages/Frame4.jsx`.

- **api.js:** added `requestLLMReport(roleId, empId)` and `requestAutoSelect(roleId)`. No component calls `fetch` directly.
- **Frame3.jsx:** each candidate card now has a "Generate AI report" button. On click: per-card loading state → an inline panel appears below the card showing the 0–100 score as a headline number plus the objective prose. Re-clicking a loaded report toggles it closed. A 503 surfaces a friendly "AI report unavailable — check OPENROUTER_API_KEY. Deterministic matching still works." message. No new dependencies — prose is plain text in a `<p>`.
- **App.jsx:** in Auto mode, Frame2's `onNext` calls `requestAutoSelect(id)` before navigating to Frame4, storing the result in `autoSelect` state and passing it down. This replaces Frame4's old silent `candidates[0]` default with the LLM's binding pick. The call is fire-and-forget with a `.catch` that sets `{ error: 'unavailable' }` for graceful degradation.
- **Frame4.jsx:** Auto mode now consumes the `autoSelect` prop. While it's null (LLM running), the existing loader shows. On success: a blue-accented "AI selection rationale" card shows the one-paragraph justification, with a collapsible "Show N other candidates considered" list. On error: an amber notice explains it fell back to embedding rank #1. Hands-on mode unchanged.

**Verification:** `npm run build` clean (22 modules transformed, no errors). `npm run lint` surfaced a single pre-existing error in Frame3 (`react-hooks/set-state-in-effect`) from Sprint 1 — confirmed present when my changes were stashed, not introduced by Sprint 2.

---

## 7. Live API testing — model choice and output quality

After Phase 4 the user added a real OpenRouter key to `.env`. I ran end-to-end tests against two models.

### 7.1 Model string validation

Before any call, I hit OpenRouter's `/models` endpoint to confirm the configured model string exists. This de-risked the "what if the default model string is wrong?" concern flagged in the plan.

### 7.2 DeepSeek V4 Flash (`deepseek/deepseek-v4-flash`) — the original default

- **Hands-on report (EMP001 vs Solution Architect):** returned `{overall_fit_score: 34, report: ...}`. Score in range and correct given the fit table (all 5 capabilities were gaps with similarities 0.24–0.42). Tone was exactly as specified — objective, factual, no enthusiasm, zero forbidden words ("excellent/perfect/outstanding/etc."). The model correctly identified the worst gap (0.24 similarity) and ordered gaps by severity. No hallucinated skills or certs. Latency: **~21s**.
- **Auto-select:** returned `{selected_employee_id: EMP001, rationale: ...}` — embedding rank #1, not overridden. The rationale correctly explained *why* — all 5 candidates had identical gap profiles, so embedding score was the right differentiator. The model followed the "only override rank 1 if materially better" instruction rather than overriding for the sake of it. Latency: **~6s**.

DeepSeek's prose was table-driven ("The closest recorded skill for each capability yields cosine similarities between 0.24 and 0.42…") — auditable but dry.

### 7.3 Mercury 2 (`inception/mercury-2`) — the user's requested switch

The user switched the model to Mercury 2, a recently released diffusion LLM claiming extreme speed. I re-ran both endpoints twice each.

- **Latency — dramatically faster.** Hands-on: 3.4s then 1.3s (vs DeepSeek's 20.8s — a ~6× speedup). Auto-select: 0.7s then 0.8s (vs 5.8s — ~8× faster). The auto-select call is now in "feels instant" territory.
- **Output quality — comparable, slightly more narrative.** Scores: 35 then 34 (DeepSeek gave 34) — stable across models and runs. Picks: EMP001 on both runs, same as DeepSeek. Tone: still objective, zero forbidden enthusiasm words. Mercury's prose was more employee-centric ("Uma Brown brings 12 years of enterprise architecture experience…") vs DeepSeek's table-driven style — arguably more readable for a human PM.
- **Non-ASCII characters — a real issue found.** Mercury emitted smart quotes (`’` U+2019) and non-breaking hyphens (`‑` U+2011) in every response — 7 in run 1, 3 in run 2, 1 in auto-select. DeepSeek emitted none. This crashed my Windows test harness (cp1252 console) and, more importantly, would cause subtle downstream issues (CSV export, copy-paste into government templates, string-equality tests). This finding directly motivated the non-ASCII sanitisation work in Phase 5.
- **Non-determinism across runs.** Both runs returned valid, on-tone answers but with different text (lengths 807 vs 824 chars). Expected at `temperature=0.2`. The *facts* (score, pick, gap ordering) were stable; only the *phrasing* varied.

### 7.4 Outcome

Mercury 2 was kept as the running model. The latency improvement makes auto-mode feel instant, and output quality is on par with DeepSeek. The non-ASCII caveat was addressed model-agnostically in Phase 5 so the system is robust regardless of which model is hot-swapped in.

---

## 8. Phase 5 — Tests, verification, and the non-ASCII fix

### 8.1 Non-ASCII sanitisation — `core/llm_report.py`

Added `_sanitise_text()` that normalises the typographic characters LLMs emit (smart quotes, non-breaking hyphens, en/em dashes, ellipses, non-breaking spaces) to plain ASCII, and strips anything still non-ASCII as a catch-all (e.g. emoji). Wired into both `_validate_hands_on_response` and `_validate_auto_response`, so every report and rationale is sanitised regardless of which model is used. Exported in `__all__` for direct testing.

**Reasoning:** the sanitisation is model-agnostic and defensive. Any model could emit typographic punctuation; the Mercury test just happened to surface it. Sanitising at the validation layer (not the prompt layer) means we don't have to re-engineer prompts if a future model ignores a "plain ASCII" instruction.

### 8.2 `tests/test_llm_report.py` (new, 33 tests)

Three layers:
- **Prompt-builder golden tests (8):** assert the hands-on and auto prompts contain the role title, capability names+weights+inferred flag, employee name/years/certs, the pre-computed fit table values, the JSON-output instruction, and the no-skills / empty-candidates placeholders. No API key needed.
- **Schema-validation tests (11):** happy path plus rejection of string scores, bool scores (the `isinstance(True, int)` Python footgun), out-of-range scores, empty reports/rationales, unknown `selected_employee_id`, and non-dict responses.
- **Sanitisation tests (6):** the exact Mercury characters, unrecognised non-ASCII (emoji), plain-ASCII passthrough, empty string, and confirmation the validators apply sanitisation.
- **Real-API integration tests (2):** gated on `OPENROUTER_API_KEY` — call `generate_fit_report` and `select_best_candidate` against the live OpenRouter API and assert valid JSON conforming to the schema plus the ASCII-only invariant.

### 8.3 `tests/test_app.py` (new, 14 tests)

- Deterministic pipeline survives LLM outage (US-S2-06): `GET /fit` and `GET /candidates` still 200 with no key.
- 503 fallback: both LLM endpoints return 503 with correct detail strings when no key is set.
- 404 paths: unknown role and unknown employee for both endpoints.
- Hands-on happy path (US-S2-01/02): stubbed LLM returns prose + score.
- Cache hit (US-S2-07): second identical call does not re-invoke the stubbed LLM.
- Cache invalidation (US-S2-07): add, delete, and update capability each force a fresh LLM call.
- Auto-select happy path (US-S2-03/04): returns a pick from the top 5, a non-empty rationale, and the `all_top_candidates` list with the correct shape.

### 8.4 Issues found and fixed during testing

Two test-infrastructure bugs surfaced during the Phase 5 runs. Both were ordering-related and neither was in the production code — but they would have caused flaky tests.

**Bug 1 — Environment mutation ordering.** The original `client` fixture in `test_app.py` used `os.environ.pop()` to clear the key for 503-path tests. `pop()` permanently removes the variable for the rest of the process. When the full suite ran, the key-gated integration tests in `test_llm_report.py` ran *after* `test_app.py` and saw the key as missing — so they failed with `ConfigError` instead of passing. **Fix:** switched the fixture to `monkeypatch.delenv()`, which automatically restores the original environment after each test. This is the correct pytest pattern for env-mutating fixtures.

**Bug 2 — Self-contained integration tests.** `test_llm_report.py` imports `core.llm_report` directly (not `app`), so `load_dotenv()` was never called as a side effect of import. When run in isolation, the integration tests skipped because the key from `.env` was never loaded into `os.environ`. They only passed in the full suite because *some other module* imported `app` first, triggering `load_dotenv()`. **Fix:** added an explicit `load_dotenv()` call at the bottom of `test_llm_report.py` (in a `try/except ImportError` so the non-integration tests still run if `python-dotenv` isn't installed). The tests are now deterministic regardless of ordering.

### 8.5 Final test results

```
90 passed in 75s
```

88 deterministic tests + 2 live-API integration tests (which ran and passed against the real OpenRouter API with the user's key). The full Sprint 1 suite (43 tests) still passes alongside the 47 new Sprint 2 tests, with no regressions.

---

## 9. User stories — delivery status

All seven stories delivered and verified:

| ID | Title | Status |
|---|---|---|
| US-S2-01 | Generate AI fit report for a candidate (hands-on) | ✅ Delivered |
| US-S2-02 | AI report includes an overall fit score | ✅ Delivered |
| US-S2-03 | Auto mode picks the best candidate via the LLM with a rationale | ✅ Delivered |
| US-S2-04 | Auto mode shows the other top candidates considered (collapsible) | ✅ Delivered |
| US-S2-05 | Loading indicator while the AI is thinking | ✅ Delivered |
| US-S2-06 | Graceful fallback when the AI service is unavailable | ✅ Delivered |
| US-S2-07 | Re-opening a candidate's AI report is instant (cache) | ✅ Delivered |

---

## 10. Known limitations and deferred work

1. **Proficiency is still a proxy.** The LLM infers depth from years/certs/prior_roles/skill-count because employee skills have no `level` field. A real proficiency scale is deferred pending client input (flagged in Sprint 1).
2. **Reverse ESCO lookup is deferred.** Embedding an employee's free-text skill name and returning the closest ESCO URI would let the LLM report attribute skills to ESCO concepts authoritatively. ~15 lines in `gap_analysis.py`. Candidate for Sprint 3.
3. **Auto-mode latency on slow models.** Mercury 2 makes auto-mode feel instant (<1s). If a future model is slower (DeepSeek took ~6s), a streaming/SSE version of the auto-select call would be worth adding. The loading state covers it for v1.
4. **LLM-as-full-ranker is deferred.** Replacing embedding matching with LLM matching was explicitly out of scope this sprint — too costly/latent/non-deterministic for ranking. The hybrid already captures the value. Candidate for a research spike.
5. **Pre-existing lint error.** `react-hooks/set-state-in-effect` in `Frame3.jsx` (Sprint 1 code) — confirmed present before Sprint 2. Worth a cleanup task but out of scope here.
6. **Inferred capabilities for some roles are weak.** ROLE001 (Solution Architect) inferred architectural-process verbs that don't semantically match anyone's skills well, so every employee shows as all-gaps. This is a Sprint 1 capability-inference issue, not a Sprint 2 issue, but worth curating capabilities manually before a client demo.

---

## 11. Hot-swap verification

A key promise of the OpenRouter abstraction was that switching models requires no code change. This was verified twice during the sprint:
- DeepSeek V4 Flash → Mercury 2: edited `OPENROUTER_MODEL` in `.env`, restarted, both endpoints worked with no code change.
- The non-ASCII sanitisation added in Phase 5 is model-agnostic, so the system is now robust to any model's typographic quirks.

---

## 12. Summary

Sprint 2 added the first LLM integration to the Deloitte capability matcher as a hybrid layer on top of the deterministic embedding pipeline. The architecture keeps ranking free, instant, and reproducible, while the LLM adds qualitative interpretation (hands-on) and defensible tie-breaking (auto). The system degrades gracefully when the LLM is unavailable, caches to keep costs down, and is verified by 90 tests including two live-API integration tests. The model is hot-swappable via one env var, and output is sanitised to plain ASCII regardless of which model is chosen.

**Files created:** `core/llm_report.py`, `.env.example`, `.gitignore`, `tests/test_llm_report.py`, `tests/test_app.py`, `sprint2-plan.md`, this report.

**Files modified:** `requirements.txt`, `app.py`, `capability-matcher/src/api/api.js`, `capability-matcher/src/pages/Frame3.jsx`, `capability-matcher/src/App.jsx`, `capability-matcher/src/pages/Frame4.jsx`.
