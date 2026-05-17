# Swagger UI Usage Guide

Start the server, then open **http://127.0.0.1:8000/docs** in your browser.

```
uvicorn app:app --reload
```

State is in-memory and resets on server restart. The model loads on startup (~5s).

---

## Walking through the user stories

### US001 + US002 — View and auto-infer capabilities

1. **GET /project** — Expand, click *Try it out* → *Execute*.  
   Returns the demo project and the five role IDs (`ROLE001`–`ROLE005`).

2. **GET /roles/{role_id}/capabilities** — Enter a role ID (e.g. `ROLE005`) → *Execute*.  
   On the first call, the top 5 ESCO capabilities are inferred automatically from the role description and returned with `is_inferred: true` and a default weight of `3`.  
   Subsequent calls return the current (possibly edited) list.

---

### US003 — Add, remove, and modify capabilities

**Find a skill to add**

3. **GET /esco/search** — Enter a search term (e.g. `risk management`) → *Execute*.  
   Returns up to 20 matching ESCO skills. Copy the `concept_uri` of the skill you want.

**Add the skill**

4. **POST /roles/{role_id}/capabilities** — Enter the role ID, then in the request body:
   ```json
   { "esco_uri": "<paste concept_uri here>", "weight": 4 }
   ```
   Returns the updated capability list with your new skill appended.

**Change a weight**

5. **PUT /roles/{role_id}/capabilities/{cap_id}** — Enter the role ID and paste the `cap_id` (ESCO URI) of the capability to update. In the request body:
   ```json
   { "weight": 5 }
   ```
   > **Note:** The `cap_id` field in the URL is the full ESCO URI. Swagger UI URL-encodes it automatically when you paste it into the path field.

**Swap to a different skill**

6. Same PUT endpoint — provide `esco_uri` (from search) in the body to replace the skill while keeping its position and weight:
   ```json
   { "esco_uri": "<new concept_uri>" }
   ```
   Or change both at once: `{ "esco_uri": "...", "weight": 2 }`.

**Remove a capability**

7. **DELETE /roles/{role_id}/capabilities/{cap_id}** — Enter the role ID and paste the `cap_id`. Returns the remaining capability list.

---

### US004 — Verify that weights affect ranking

8. Call **GET /roles/{role_id}/candidates** (step 9 below) and note the top candidate's score.
9. Use **PUT** to raise the weight of a capability that the current top candidate is *weak on* (visible in the fit breakdown — step 11).
10. Re-call **GET /roles/{role_id}/candidates** — confirm the ordering has shifted.

---

### US005 + US006 — Filter candidates

11. **GET /roles/{role_id}/candidates** — Enter a role ID. Optional query parameters:

    | Parameter | Effect |
    |---|---|
    | `require_prior_experience=true` | Only employees whose `prior_roles` list contains the exact role title (case-insensitive). In the demo data, 3 employees per role have this. |
    | `available_only=true` | Only employees marked `available: true`. 5 employees across the 30 are unavailable. |
    | Both `true` | Intersection of both filters. |

    The `has_prior_experience` and `available` flags are always shown in every result regardless of filter state, so you can compare filtered vs unfiltered results visually.

---

### US007 — Inspect a candidate's fit

12. **GET /roles/{role_id}/candidates/{emp_id}/fit** — Enter a role ID and an employee ID from the candidates list (e.g. `EMP001`).  
    Returns one row per required capability:

    | Field | Meaning |
    |---|---|
    | `cap_name` | The ESCO capability |
    | `weight` | Its current importance (1–5) |
    | `best_match_skill` | The employee's DPN skill that most closely matches it |
    | `similarity` | Cosine similarity 0–1 |
    | `is_gap` | `true` if similarity < 0.6 (the employee lacks adequate coverage) |

---

## Role IDs quick reference

| ID | Role |
|---|---|
| ROLE001 | Solution Architect |
| ROLE002 | Data Engineer |
| ROLE003 | Change & Adoption Lead |
| ROLE004 | Cybersecurity Analyst |
| ROLE005 | Project Manager |

## Tips

- **State is shared** across all browser tabs for the duration of the server session. Changes made via POST/PUT/DELETE persist until the server restarts.
- **Capabilities are inferred lazily** — a role's list is only created when you first call `GET /roles/{id}/capabilities`. You can call candidates directly and it will trigger inference automatically.
- **ESCO attribution** (required in any frontend): *"This service uses the ESCO classification of the European Commission."*
