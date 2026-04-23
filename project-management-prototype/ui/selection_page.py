"""
Manual selection page.

Shows top-5 employee candidates for each role (ranked by semantic similarity).
The PM picks one employee per role via a selectbox. Once an employee is chosen
for any role they are removed from all other roles' candidate lists.  When every
role has a selection the PM can confirm and the standard results page is shown.
"""

from __future__ import annotations

import streamlit as st


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _init_selections(n_roles: int) -> None:
    """Initialise manual_selections list if not already present."""
    if "manual_selections" not in st.session_state:
        st.session_state.manual_selections = [None] * n_roles


def _candidates_for(role_idx: int, top_k: int = 5) -> list[dict]:
    """
    Return up to *top_k* ranked employees for *role_idx*, excluding employees
    that are already selected for a *different* role.
    """
    rankings: list[list[dict]] = st.session_state.manual_rankings
    selections: list[str | None] = st.session_state.manual_selections

    already_taken = {
        sel for i, sel in enumerate(selections)
        if sel is not None and i != role_idx
    }

    candidates = [
        e for e in rankings[role_idx]
        if e["employee_id"] not in already_taken
    ][:top_k]

    return candidates


# ---------------------------------------------------------------------------
# Main render function
# ---------------------------------------------------------------------------

def render_selection(flat_roles: list[dict]) -> None:
    """
    Render the manual selection page.

    flat_roles must be the same list passed to rank_employees() — each entry
    must contain: title, description, project, matched_skills, role_vector.
    """
    n_roles = len(flat_roles)
    _init_selections(n_roles)

    st.title("Manual Role Assignment")
    st.write(
        "Review the top‑5 candidates for each role ranked by capability match. "
        "Select one person per role — chosen employees are automatically removed "
        "from other roles' shortlists."
    )

    if st.button("← Back to input"):
        st.session_state.page = "input"
        st.rerun()

    st.divider()

    # Group roles by project for a cleaner layout
    project_order: list[str] = []
    role_indices_by_project: dict[str, list[int]] = {}
    for idx, role in enumerate(flat_roles):
        proj = role["project"]
        if proj not in role_indices_by_project:
            project_order.append(proj)
            role_indices_by_project[proj] = []
        role_indices_by_project[proj].append(idx)

    selections: list[str | None] = st.session_state.manual_selections

    for proj in project_order:
        st.markdown(f"## {proj}")
        for role_idx in role_indices_by_project[proj]:
            role = flat_roles[role_idx]
            candidates = _candidates_for(role_idx)

            with st.container(border=True):
                st.markdown(f"**{role['title']}**")
                if role.get("description"):
                    st.caption(role["description"])

                if not candidates:
                    st.warning(
                        "No available candidates — all ranked employees have "
                        "already been assigned to other roles."
                    )
                    continue

                # Build the selectbox options
                option_ids = [None] + [c["employee_id"] for c in candidates]
                option_labels = ["— not yet selected —"] + [
                    f"{c['employee_name']}  ({c['similarity']:.0%} match)"
                    for c in candidates
                ]

                # Find current selection index in the option list
                current_id = selections[role_idx]
                # If the currently selected employee was pushed out of candidates
                # (which can't happen by construction, but guard anyway), keep them
                if current_id is not None and current_id not in option_ids:
                    # Re-insert the selected employee at position 1
                    selected_emp = next(
                        (e for e in st.session_state.manual_rankings[role_idx]
                         if e["employee_id"] == current_id),
                        None,
                    )
                    if selected_emp:
                        option_ids.insert(1, selected_emp["employee_id"])
                        option_labels.insert(
                            1,
                            f"{selected_emp['employee_name']}  "
                            f"({selected_emp['similarity']:.0%} match) ✓",
                        )

                try:
                    selected_index = option_ids.index(current_id)
                except ValueError:
                    selected_index = 0

                choice_index = st.selectbox(
                    "Assign employee",
                    options=list(range(len(option_ids))),
                    index=selected_index,
                    format_func=lambda i: option_labels[i],
                    key=f"sel_role_{role_idx}",
                    label_visibility="collapsed",
                )

                new_id = option_ids[choice_index]
                if new_id != current_id:
                    selections[role_idx] = new_id
                    st.session_state.manual_selections = selections
                    st.rerun()

    # -----------------------------------------------------------------------
    # Confirm button — only active once all roles have a selection
    # -----------------------------------------------------------------------
    st.divider()

    all_selected = all(s is not None for s in selections)
    n_selected = sum(1 for s in selections if s is not None)
    st.caption(f"{n_selected} / {n_roles} roles assigned")

    if st.button(
        "Confirm Assignments",
        type="primary",
        disabled=not all_selected,
        help="Select an employee for every role to confirm" if not all_selected else "",
    ):
        _confirm_assignments(flat_roles, selections)


def _confirm_assignments(
    flat_roles: list[dict],
    selections: list[str | None],
) -> None:
    """
    Build standard assignment dicts from the manual selections and navigate
    to the results page.  Runs gap analysis so the results page works as-is.
    """
    from core.gap_analysis import analyse_gaps

    rankings: list[list[dict]] = st.session_state.manual_rankings

    # Build a lookup: employee_id → employee entry from rankings[0] (they all
    # contain the same employee data, just in different order)
    all_emp_data: dict[str, dict] = {}
    for role_rankings in rankings:
        for entry in role_rankings:
            all_emp_data.setdefault(entry["employee_id"], entry)

    assignments = []
    for role_idx, role in enumerate(flat_roles):
        emp_id = selections[role_idx]
        emp_entry = all_emp_data.get(emp_id) if emp_id else None

        assignments.append(
            {
                "role_title": role["title"],
                "role_description": role["description"],
                "project": role["project"],
                "matched_skills": role["matched_skills"],
                "role_vector": role["role_vector"],
                "employee_id": emp_entry["employee_id"] if emp_entry else None,
                "employee_name": emp_entry["employee_name"] if emp_entry else None,
                "employee_skills": emp_entry["employee_skills"] if emp_entry else None,
                "employee_vector": emp_entry["employee_vector"] if emp_entry else None,
                "similarity": emp_entry["similarity"] if emp_entry else 0.0,
            }
        )

    with st.spinner("Computing gap analysis…"):
        gap_analyses = [analyse_gaps(a) for a in assignments]

    st.session_state.assignments = assignments
    st.session_state.gap_analyses = gap_analyses
    st.session_state.page = "results"
    st.rerun()
