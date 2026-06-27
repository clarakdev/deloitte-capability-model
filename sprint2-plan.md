# Sprint 2 Plan: LLM Gap Analysis (OpenRouter)

## TL;DR
Add an on-demand LLM gap-analysis report to the existing embedding-based matching system, without replacing the deterministic ranking. Use OpenRouter (OpenAI-compatible) so the model is hot-swappable via `.env`. Two modes:
- **Hands-on (Frame3):** each top candidate card gets a "Generate AI report" button → LLM produces objective prose (1–2 paragraphs on strengths + upskilling areas) plus an overall fit score (0–100). User uses this to pick → Frame4 (existing deterministic gap table) unchanged.
- **Auto (Frame4):** feed the top 5 candidates to the LLM → it picks one bindingly → Frame4 shows the LLM's rationale and the chosen employee, with the other top candidates in a collapsible list for transparency.

Default model: `deepseek/deepseek-v4-flash`. Hybrid architecture: embeddings still rank (free/instant/deterministic); LLM only interprets and (in auto) selects. LLM matching as a full replacement is explicitly deferred to a later spike.

## Architecture decisions
- **OpenRouter via `openai` SDK** pointed at `https://openrouter.ai/api/v1`. Env vars: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL=deepseek/deepseek-v4-flash`. Hot-swap = edit `.env`, no code change. Removes the dead `google-generativeai` dependency.
- **Async endpoints** (`async def`) with the OpenAI SDK's async client so the 2–10s LLM call doesn't block a worker. No SSE/streaming in v1 — a loading spinner is enough.
- **LLM input = deterministic backbone, not raw text.** Both prompts feed the role's capabilities (with weights/descriptions/inferred flag) AND the existing `analyse_fit()` output (per-capability `best_match_skill`, `similarity`, `is_gap`, `weight`). This grounds the LLM in bounded structured data rather than asking it to free-judge from two blobs of text — more reliable, more defensible to the client.
- **Structured JSON output, not markdown.** Hands-on schema: `{overall_fit_score: int (0–100), report: string (1–2 paragraphs, objective tone, no markdown, no hallucinated evidence)}`. Auto schema: `{selected_employee_id: string, rationale: string (1 paragraph)}`. JSON is testable, renderable without a markdown lib, and cheaper.
- **In-memory report/selection cache** keyed by `(role_id, emp_id, capability_hash)` (hands-on) and `(role_id, capability_hash)` (auto). Invalidated on any capability mutation (`POST/PUT/DELETE /roles/{id}/capabilities` already exist — hook invalidation there). Re-clicks and nav-back are free.
- **Proficiency via heuristic proxy** (no schema change this sprint). The prompt includes `years_experience`, relevant `certifications`, `prior_roles`, and skill-count-by-category as context for the LLM to infer depth. A real `level` field is deferred (pending client input, flagged in sprint1-plan.md).
- **Tone guard in the system prompt:** objective, factual, no marketing fluff, no enthusiasm, no claims of certified competency (employee skills are free-text names without ESCO URI). The report interprets similarity scores; it does not assert certified mastery.
- **No-skills edge case** handled in the prompt: "This employee has no recorded skills; gaps are based on role requirements alone."

## Phases

### Phase 1 — LLM client & config (no API touch yet)
1. Add `openai>=1.40` and `python-dotenv>=1.0` to `requirements.txt`. Remove the dead `google-generativeai>=0.7.0` line (only in the prototype's requirements — confirm the root `requirements.txt` does NOT have it; if it does, remove there too).
2. Create `.env.example` with `OPENROUTER_API_KEY=`, `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, `OPENROUTER_MODEL=deepseek/deepseek-v4-flash`. Add `.env` to `.gitignore` (do NOT commit a real key).
3. Create `core/llm_report.py`:
   - `AsyncOpenAI` client initialised from env vars at module load (with a clear error if `OPENROUTER_API_KEY` missing).
   - `async def generate_fit_report(role_capabilities, employee_profile, fit_report) -> dict` — builds the hands-on prompt, calls the model with `response_format={"type": "json_object"}`, validates the returned JSON against the hands-on schema, returns `{overall_fit_score, report}`.
   - `async def select_best_candidate(role_capabilities, top_candidates_with_fit) -> dict` — builds the auto prompt (5 candidates, each with `match_score` + its `fit_report` summary), calls the model with JSON mode, validates `{selected_employee_id, rationale}`, returns it.
   - Both functions expose the prompt builders as pure sync helpers (`_build_hands_on_prompt`, `_build_auto_prompt`) so they are unit-testable without an API key (golden-string tests).
   - A single `_call_model(messages)` private async helper wraps the OpenAI client call + OpenRouter base URL, so the model is swappable in one place.

### Phase 2 — Prompts & schemas (the highest-leverage, most-reviewable work)
4. Draft the hands-on **system prompt** (parallel with step 3): objective factual tone, "you are a skill-gap analyst for a Deloitte project manager", explicit rules — no markdown, no enthusiasm, no claims of certified competency, must use only the provided similarity/weight data, must label upskilling areas by severity fusing similarity + weight. Keep it short and rule-based to minimise token cost.
5. Draft the hands-on **user prompt** template: role context (project name, capabilities with id/label/description/weight/is_inferred), employee profile (name, skills grouped by category, years_experience, certifications, prior_roles, summary, tools), and the `fit_report.matches` table (cap_name, weight, best_match_skill, similarity, is_gap). Instruction: output JSON `{overall_fit_score: 0–100, report: 1–2 paragraphs}`.
6. Draft the auto **system prompt**: "you are selecting the best-fit employee for a Deloitte project role from the top 5 ranked candidates. You may override the embedding #1 pick only if a lower-ranked candidate has materially better fit on a high-weight capability or fewer severe gaps. You must justify your pick in one paragraph, objective tone."
7. Draft the auto **user prompt** template: role context + for each of 5 candidates (rank, employee_id, name, embedding `match_score`, and a condensed gap summary: count of gaps, worst gap by similarity×weight, strongest match). Instruction: output JSON `{selected_employee_id, rationale}`.

### Phase 3 — Backend endpoints & caching (depends on Phases 1 & 2)
8. In `app.py`, load env at startup (`dotenv.load_dotenv()`). Add `from core.llm_report import generate_fit_report, select_best_candidate`.
9. Add `POST /roles/{role_id}/candidates/{emp_id}/llm-report` (`async def`): fetch role + employee, run `analyse_fit` (reuse existing logic), call `generate_fit_report`, cache by `(role_id, emp_id, capability_hash)`, return `{overall_fit_score, report, fit_report}` (fit_report included so the frontend can still render the deterministic table on Frame4 if desired). Validate role/employee exist (404s already pattern exists in `app.py`).
10. Add `POST /roles/{role_id}/auto-select` (`async def`): fetch role + top 5 candidates (reuse `rank_candidates` + slice 5), for each run `analyse_fit` and condense, call `select_best_candidate`, cache by `(role_id, capability_hash)`, return `{selected_employee_id, rationale, all_top_candidates: [{id, name, match_score}, ...]}`.
11. Add a module-level `_llm_cache: dict` in `app.py` and invalidation calls in the existing `POST/PUT/DELETE /roles/{id}/capabilities` handlers (delete entries whose key starts with `(role_id,` — simple prefix clear).
12. Error handling: if `OPENROUTER_API_KEY` is missing or the API call fails, return HTTP 503 with a clear message ("LLM report unavailable; embedding-based analysis still available"). The deterministic pipeline is never broken by an LLM outage.

### Phase 4 — Frontend integration (depends on Phase 3 endpoints)
13. `capability-matcher/src/api/api.js`: add `requestLLMReport(roleId, empId)` → POST to `/llm-report`, and `requestAutoSelect(roleId)` → POST to `/auto-select`. Return parsed JSON.
14. `Frame3.jsx`: add a "Generate AI report" button to each candidate card (or to each of the top few — confirm with team how many cards show by default before expansion). On click: set loading state on that card, call `requestLLMReport`, render the result in an inline panel below the card: the `overall_fit_score` as a headline number + the `report` prose in a `<p>`. Loading spinner via existing CSS patterns. No new dependency.
15. `App.jsx` auto-mode routing: when mode is Auto, after candidate ranking, call `requestAutoSelect(roleId)` before navigating to Frame4. Pass the `{selected_employee_id, rationale, all_top_candidates}` down to Frame4. Replace the current `candidates[0]` silent default with the LLM's `selected_employee_id`.
16. `Frame4.jsx` auto path: show the LLM's `rationale` in a highlighted panel at the top, then the selected employee's existing deterministic gap table below. Add a collapsible "Other top candidates" section listing `all_top_candidates` with their `match_score` so the user can sanity-check the LLM's override. Hands-on path through Frame4 is unchanged.
17. No new frontend dependency (no markdown renderer). Prose is plain text in `<p>`. Score is a `<span>` or styled `<div>`.

### Phase 5 — Tests & verification (depends on Phase 3)
18. `tests/test_llm_report.py`:
   - Unit-test the pure prompt builders (`_build_hands_on_prompt`, `_build_auto_prompt`) with golden fixtures — assert the rendered prompt contains expected capability names, weights, similarity values, and the schema instruction. No API key needed.
   - Unit-test the JSON-schema validation: feed malformed mock LLM responses (missing `overall_fit_score`, extra fields, `selected_employee_id` not in candidate set) and assert the validator raises/returns a clean error. No API key needed.
   - One integration test guarded by `OPENROUTER_API_KEY` being set (skip otherwise): call `generate_fit_report` against the real API with a tiny fixture, assert the returned JSON conforms to the schema and `overall_fit_score` is 0–100.
19. `tests/test_app.py` (extend existing):
   - `POST /llm-report` returns 404 for unknown role/employee, 503 when the LLM client is monkeypatched to raise, and the cached shape on second call (monkeypatch the LLM call to a stub, assert the second call does not re-invoke the stub).
   - `POST /auto-select` returns a `selected_employee_id` that is one of the top 5, and `rationale` non-empty (stub the LLM).
   - Capability mutation invalidates the cache: stub the LLM, call `/llm-report`, then `DELETE` a capability, then `/llm-report` again — assert the stub was re-invoked.
20. Manual verification: run `uvicorn app:app --reload`, set a real `OPENROUTER_API_KEY` in `.env`, hit `POST /llm-report` via the FastAPI `/docs` UI for an existing role+employee, eyeball the prose for tone (objective, no fluff, no hallucinated certs). Hot-swap `OPENROUTER_MODEL` to a different model, hit the endpoint again, confirm it works without code change.

## Relevant files
- `core/llm_report.py` (NEW) — LLM client, prompt builders, schema validation, async entry points.
- `app.py` — add 2 async endpoints, env load, cache + invalidation hooks in existing capability-mutation handlers.
- `core/gap_analysis.py` — reuse `analyse_fit` as-is; no change. Reference `FitReport`/`GapMatch` shapes for prompt construction.
- `core/matching.py` — reuse `rank_candidates` as-is for the top-5 in auto mode; no change.
- `requirements.txt` (root) — add `openai>=1.40`, `python-dotenv>=1.0`. Check for and remove `google-generativeai` if present.
- `.env.example` (NEW), `.gitignore` — add `.env`.
- `capability-matcher/src/api/api.js` — add `requestLLMReport`, `requestAutoSelect`.
- `capability-matcher/src/pages/Frame3.jsx` — report button + inline prose/score panel per candidate card.
- `capability-matcher/src/pages/Frame4.jsx` — auto path: LLM rationale panel + collapsible other-candidates list. Hands-on path unchanged.
- `capability-matcher/src/App.jsx` — auto routing calls `requestAutoSelect` before Frame4; pass result down.
- `tests/test_llm_report.py` (NEW) — prompt-builder golden tests + schema-validation tests + one key-gated integration test.
- `tests/test_app.py` (extend) — endpoint + cache tests.

## Verification
1. `pytest tests/test_llm_report.py` passes with NO API key (pure prompt + schema tests).
2. `pytest tests/test_app.py` passes with the LLM stubbed (endpoint shape + 404 + 503 + cache invalidation).
3. With a real `OPENROUTER_API_KEY` set: `pytest -k integration` passes one end-to-end call; manual `POST /llm-report` via `/docs` returns prose in the agreed objective tone and a 0–100 score.
4. Hot-swap test: change `OPENROUTER_MODEL` in `.env`, restart, hit the endpoint — works without code change (proves the OpenRouter abstraction).
5. Auto-mode manual test: `POST /auto-select` returns a `selected_employee_id` that is in the top 5; `rationale` is one paragraph and objective; the chosen id may differ from embedding #1 and the rationale explains why.
6. Cost sanity check: confirm a single hands-on report call is well under $0.01 on `deepseek/deepseek-v4-flash`; confirm auto-mode adds one call per auto-run (not per candidate).
7. Outage test: unset `OPENROUTER_API_KEY`, hit `POST /llm-report` → 503 with the deterministic fallback message; confirm existing `GET .../fit` (US007) still returns 200 (deterministic pipeline unaffected).

## Decisions
- Hybrid embedding-rank + on-demand LLM report. LLM matching as a full ranking replacement is DEFERRED (spike, not sprint 2) — too costly/latent/non-deterministic for ranking, and the hybrid already captures the value.
- OpenRouter (OpenAI SDK) over direct Gemini — for hot-swap. Removes dead `google-generativeai` dep.
- Auto-mode LLM pick is BINDING, with rationale shown + other top candidates collapsible (transparency for client defensibility).
- Auto-mode compares top 5 (balancing breadth vs cost/latency).
- Hands-on report layout: LLM prose + a single overall fit score. The existing deterministic gap table stays on Frame4 post-selection (unchanged) — the LLM report is a pre-selection aid on Frame3.
- Proficiency via heuristic proxy (years/certs/prior_roles/skill-count) in the prompt — NO schema change this sprint. A real `level` field deferred (pending client input, flagged in sprint1-plan.md).
- Structured JSON output (not markdown) — testable, renderable with no new frontend dep, cheaper.
- In-memory cache with capability-mutation invalidation — re-clicks free, nav-back free.

## Further Considerations
1. **OpenRouter model string validity.** `deepseek/deepseek-v4-flash` is the user's specified string. If OpenRouter 404s on it, hot-swap via `.env` is the fallback — but worth a 30-second manual check against OpenRouter's model list during Phase 1 so the default actually works out of the box.
2. **Reverse ESCO lookup (nice-to-have, defer).** Embedding an employee's free-text skill name and returning the closest ESCO URI would let the LLM report attribute skills to ESCO concepts authoritatively. ~15 lines in `gap_analysis.py`. Not in this plan — keeps sprint 2 focused. Candidate for sprint 3.
3. **Auto-mode latency.** Adding one LLM call (2–10s) to the auto path is user-visible. A loading state on the auto transition is enough for v1; if it feels slow, a streaming/SSE version is a later iteration.
