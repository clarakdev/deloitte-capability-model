"""
Phase 4 end-to-end integration test.

Covers:
  1. Normal case   — fewer roles than employees (typical use)
  2. Exact match   — roles == employees
  3. Overflow case — more roles than employees (some roles unassigned)
  4. Single role / single employee
  5. Unassigned role gap analysis returns all-gap rows
  6. Results page data-building helpers (gap dataframe)
"""

import sys
import json
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.embedding_engine import get_skills, get_skill_embeddings
from core.role_mapper import map_role_to_skills
from core.matching import assign
from core.gap_analysis import analyse_gaps

EMPLOYEES = json.loads(
    (Path(__file__).parent.parent / "data" / "employees.json").read_text(encoding="utf-8")
)
SKILLS = get_skills()

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        print(f"  PASS  {name}")
        PASS += 1
    else:
        print(f"  FAIL  {name}" + (f": {detail}" if detail else ""))
        FAIL += 1


def make_role(title: str, description: str, project: str = "Test Project") -> dict:
    return {
        **map_role_to_skills(title, description),
        "title": title,
        "description": description,
        "project": project,
    }


# ---------------------------------------------------------------------------
print("\n[1] Normal case — 3 roles, 30 employees")
roles = [
    make_role("Software Developer", "Build backend APIs in Python"),
    make_role("Data Analyst", "Analyse business data and produce reports"),
    make_role("Cybersecurity Analyst", "Monitor and protect infrastructure"),
]
assignments = assign(EMPLOYEES, roles)
check("Returns 3 assignments", len(assignments) == 3)
check("All assigned (enough employees)", all(a["employee_id"] is not None for a in assignments))
check("All distinct employees", len({a["employee_id"] for a in assignments}) == 3)
check("Similarity in [0,1]", all(0.0 <= a["similarity"] <= 1.0 for a in assignments))


# ---------------------------------------------------------------------------
print("\n[2] Exact match — roles == employees (30)")
roles_exact = [make_role(f"Role {i}", f"Generic technical role number {i}") for i in range(30)]
assignments_exact = assign(EMPLOYEES, roles_exact)
check("Returns 30 assignments", len(assignments_exact) == 30)
check("All 30 assigned", all(a["employee_id"] is not None for a in assignments_exact))
check("No employee assigned twice",
      len({a["employee_id"] for a in assignments_exact}) == 30)


# ---------------------------------------------------------------------------
print("\n[3] Overflow case — 32 roles, 30 employees → 2 unassigned")
roles_overflow = [make_role(f"Role {i}", f"Technical role {i}") for i in range(32)]
assignments_overflow = assign(EMPLOYEES, roles_overflow)
check("Returns 32 assignments", len(assignments_overflow) == 32)
unassigned = [a for a in assignments_overflow if a["employee_id"] is None]
assigned_w_emp = [a for a in assignments_overflow if a["employee_id"] is not None]
check("Exactly 2 unassigned", len(unassigned) == 2,
      f"got {len(unassigned)}")
check("Exactly 30 assigned", len(assigned_w_emp) == 30,
      f"got {len(assigned_w_emp)}")
check("Unassigned similarity is 0.0",
      all(a["similarity"] == 0.0 for a in unassigned))


# ---------------------------------------------------------------------------
print("\n[4] Single role / single employee")
one_employee = [EMPLOYEES[0]]
one_role = [make_role("Project Manager", "Manage project deliverables and stakeholders")]
assignments_single = assign(one_employee, one_role)
check("Returns 1 assignment", len(assignments_single) == 1)
check("Employee assigned", assignments_single[0]["employee_id"] == EMPLOYEES[0]["id"])
check("Similarity > 0", assignments_single[0]["similarity"] > 0.0)


# ---------------------------------------------------------------------------
print("\n[5] Gap analysis — assigned employee")
gaps_normal = analyse_gaps(assignments[0])
check("Returns 5 gap rows (TOP_K=5)", len(gaps_normal) == 5)
check("All rows have required fields",
      all(
          {"required_code", "required_name", "similarity", "is_gap"}.issubset(g.keys())
          for g in gaps_normal
      ))
check("Similarity values in [0,1]",
      all(0.0 <= g["similarity"] <= 1.0 for g in gaps_normal))
check("is_gap consistent with threshold",
      all((g["similarity"] < 0.6) == g["is_gap"] for g in gaps_normal))


# ---------------------------------------------------------------------------
print("\n[6] Gap analysis — unassigned role")
gaps_unassigned = analyse_gaps(unassigned[0])
check("Returns 5 rows for unassigned", len(gaps_unassigned) == 5)
check("All rows are gaps", all(g["is_gap"] for g in gaps_unassigned))
check("All similarity 0.0", all(g["similarity"] == 0.0 for g in gaps_unassigned))
check("No best-match data", all(g["best_match_name"] is None for g in gaps_unassigned))


# ---------------------------------------------------------------------------
print("\n[7] Role mapper quality checks")
dev_result = map_role_to_skills("Software Developer", "Build scalable web applications")
analyst_result = map_role_to_skills("Marketing Manager", "Run digital marketing campaigns and brand strategy")
dev_codes = {s["code"] for s in dev_result["matched_skills"]}
analyst_codes = {s["code"] for s in analyst_result["matched_skills"]}
check("Developer role includes PROG (Programming/software development)",
      "PROG" in dev_codes, f"got {dev_codes}")
check("Marketing role includes MKTG or DIGM or MKCM",
      bool({"MKTG", "DIGM", "MKCM"} & analyst_codes),
      f"got {analyst_codes}")
check("Developer and marketing roles differ",
      dev_codes != analyst_codes)


# ---------------------------------------------------------------------------
print(f"\n{'='*50}")
print(f"Results: {PASS} passed, {FAIL} failed")
if FAIL:
    sys.exit(1)
else:
    print("All integration checks passed.")
