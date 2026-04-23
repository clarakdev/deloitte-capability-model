"""
Main Streamlit application entry point.

Run with:
    streamlit run app.py
"""

from __future__ import annotations

import json
from pathlib import Path

import streamlit as st

st.set_page_config(
    page_title="Role–Capability Matching",
    page_icon="🎯",
    layout="wide",
)

from core.gap_analysis import analyse_gaps  # noqa: E402
from core.matching import assign, rank_employees  # noqa: E402
from core.role_mapper import map_role_to_skills  # noqa: E402
from ui.input_page import render_input  # noqa: E402
from ui.results_page import render_results  # noqa: E402
from ui.selection_page import render_selection  # noqa: E402

_EMPLOYEES_PATH = Path(__file__).parent / "data" / "employees.json"


def _load_employees() -> list[dict]:
    if not _EMPLOYEES_PATH.exists():
        st.error(
            f"Employee data file not found: `{_EMPLOYEES_PATH}`.  \n"
            "Run `python scripts/generate_test_data.py` to create it."
        )
        st.stop()
    with open(_EMPLOYEES_PATH, encoding="utf-8") as f:
        return json.load(f)


def _build_flat_roles(projects_data: list[dict]) -> list[dict]:
    """Map each role to SFIA skills and return a flat list ready for matching."""
    flat_roles: list[dict] = []
    for project in projects_data:
        proj_name = project["name"] or "Unnamed Project"
        for role in project["roles"]:
            mapped = map_role_to_skills(role["title"], role["description"])
            flat_roles.append(
                {
                    **mapped,
                    "title": role["title"],
                    "description": role["description"],
                    "project": proj_name,
                }
            )
    return flat_roles


def _run_matching(
    projects_data: list[dict],
) -> tuple[list[dict], list[list[dict]]]:
    """Run the full auto-matching pipeline and return assignments + gap analyses."""
    employees = _load_employees()
    flat_roles = _build_flat_roles(projects_data)
    assignments = assign(employees, flat_roles)
    gap_analyses = [analyse_gaps(a) for a in assignments]
    return assignments, gap_analyses


def _prepare_manual(
    projects_data: list[dict],
) -> tuple[list[dict], list[list[dict]]]:
    """Build flat_roles and compute per-role employee rankings for manual mode."""
    employees = _load_employees()
    flat_roles = _build_flat_roles(projects_data)
    rankings = rank_employees(employees, flat_roles)
    return flat_roles, rankings


def main() -> None:
    if "page" not in st.session_state:
        st.session_state.page = "input"

    if st.session_state.page == "input":
        render_input()

    elif st.session_state.page == "selection":
        # Prepare rankings on first visit
        if "manual_rankings" not in st.session_state:
            projects_data = st.session_state.get("pending_projects", [])
            if not projects_data:
                st.session_state.page = "input"
                st.rerun()

            with st.spinner("Computing capability rankings…"):
                flat_roles, rankings = _prepare_manual(projects_data)

            st.session_state.manual_flat_roles = flat_roles
            st.session_state.manual_rankings = rankings

        render_selection(st.session_state.manual_flat_roles)

    elif st.session_state.page == "results":
        # Run matching on first visit to the results page (auto mode)
        if "assignments" not in st.session_state:
            projects_data = st.session_state.get("pending_projects", [])
            if not projects_data:
                # Shouldn't normally happen; recover gracefully
                st.session_state.page = "input"
                st.rerun()

            with st.spinner("Running capability matching…"):
                assignments, gap_analyses = _run_matching(projects_data)

            st.session_state.assignments = assignments
            st.session_state.gap_analyses = gap_analyses

        render_results(
            st.session_state.assignments,
            st.session_state.gap_analyses,
        )


if __name__ == "__main__":
    main()
