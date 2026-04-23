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
from core.matching import assign  # noqa: E402
from core.role_mapper import map_role_to_skills  # noqa: E402
from ui.input_page import render_input  # noqa: E402
from ui.results_page import render_results  # noqa: E402

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


def _run_matching(
    projects_data: list[dict],
) -> tuple[list[dict], list[list[dict]]]:
    """Run the full matching pipeline and return assignments + gap analyses."""
    employees = _load_employees()

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

    assignments = assign(employees, flat_roles)
    gap_analyses = [analyse_gaps(a) for a in assignments]
    return assignments, gap_analyses


def main() -> None:
    if "page" not in st.session_state:
        st.session_state.page = "input"

    if st.session_state.page == "input":
        render_input()

    elif st.session_state.page == "results":
        # Run matching on first visit to the results page
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
