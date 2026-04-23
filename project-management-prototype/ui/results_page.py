"""
Results page: displays the suggested employee assignments with similarity
scores, and an expandable gap analysis for each assigned role.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sim_label(sim: float) -> str:
    """Return a coloured Streamlit markdown label for a similarity score."""
    pct = f"{sim:.0%}"
    if sim >= 0.75:
        return f":green[{pct}]"
    if sim >= 0.50:
        return f":orange[{pct}]"
    return f":red[{pct}]"


def _gap_dataframe(gaps: list[dict]) -> pd.DataFrame:
    rows = []
    for g in gaps:
        rows.append(
            {
                "Required skill": g["required_name"],
                "Category": g["required_category"],
                "Employee's closest match": g["best_match_name"] or "—",
                "Proficiency": g["best_match_level"] if g["best_match_level"] else "—",
                "Similarity": f"{g['similarity']:.0%}",
                "Status": "⚠️ Gap" if g["is_gap"] else "✅ Covered",
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Main render function
# ---------------------------------------------------------------------------

def render_results(
    assignments: list[dict],
    gap_analyses: list[list[dict]],
) -> None:
    if st.button("← Back to input"):
        st.session_state.page = "input"
        st.session_state.pop("assignments", None)
        st.session_state.pop("gap_analyses", None)
        st.rerun()

    st.title("Assignment Results")

    # --- Summary metrics ---
    n_total = len(assignments)
    n_assigned = sum(1 for a in assignments if a["employee_id"] is not None)
    n_unassigned = n_total - n_assigned
    assigned_sims = [a["similarity"] for a in assignments if a["employee_id"]]
    avg_sim = sum(assigned_sims) / len(assigned_sims) if assigned_sims else 0.0
    total_gaps = sum(
        sum(1 for g in gaps if g["is_gap"])
        for gaps in gap_analyses
    )

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Total roles", n_total)
    m2.metric("Assigned", n_assigned)
    m3.metric("Avg. match", f"{avg_sim:.0%}")
    m4.metric("Total gaps", total_gaps)

    if n_unassigned:
        st.warning(
            f"{n_unassigned} role(s) could not be assigned — "
            "there are more roles than available employees."
        )

    st.divider()

    # --- Group assignments by project ---
    projects: dict[str, list[tuple[dict, list[dict]]]] = {}
    for assignment, gaps in zip(assignments, gap_analyses):
        projects.setdefault(assignment["project"], []).append((assignment, gaps))

    for proj_name, items in projects.items():
        st.subheader(proj_name)

        # Column headers
        h1, h2, h3, h4 = st.columns([3, 3, 1, 1])
        h1.markdown("**Role**")
        h2.markdown("**Assigned employee**")
        h3.markdown("**Match**")
        h4.markdown("**Gaps**")

        for assignment, gaps in items:
            role_title = assignment["role_title"]
            emp_name = assignment["employee_name"]
            sim = assignment["similarity"]
            n_gaps = sum(1 for g in gaps if g["is_gap"])
            n_req = len(gaps)
            is_assigned = assignment["employee_id"] is not None

            c1, c2, c3, c4 = st.columns([3, 3, 1, 1])
            c1.write(role_title)
            c2.write(emp_name if is_assigned else "*No employee available*")
            if is_assigned:
                c3.markdown(_sim_label(sim))
                c4.write(f"{n_gaps}/{n_req}")
            else:
                c3.write("—")
                c4.write("—")

            with st.expander(
                f"Gap analysis — {role_title}",
                expanded=False,
            ):
                # Show which SFIA skills the role requires
                st.markdown(
                    "**Required capabilities** (top-5 SFIA skills inferred from role description)"
                )
                req_cols = ["name", "category", "similarity"]
                req_rows = [
                    {
                        "Skill": s["name"],
                        "Category": s.get("category", ""),
                        "Relevance to role": f"{s['similarity']:.0%}",
                    }
                    for s in assignment["matched_skills"]
                ]
                st.dataframe(
                    pd.DataFrame(req_rows),
                    use_container_width=True,
                    hide_index=True,
                )

                if not is_assigned:
                    st.info("No employee was assigned — gap analysis unavailable.")
                else:
                    st.markdown(
                        f"**Capability gaps for {emp_name}**  \n"
                        "Rows marked ⚠️ Gap are skills the employee should develop to best fill this role."
                    )
                    st.dataframe(
                        _gap_dataframe(gaps),
                        use_container_width=True,
                        hide_index=True,
                    )

        st.divider()
