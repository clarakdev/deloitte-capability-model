"""
Input page: lets the project manager define any number of projects, each with
a variable-length list of roles, before submitting for capability matching.

Unique IDs are used as widget key components so that adding/removing items
mid-list never causes widget state to bleed across positions.
"""

from __future__ import annotations

import uuid

import streamlit as st


# ---------------------------------------------------------------------------
# Helpers for session-state structure
# ---------------------------------------------------------------------------

def _new_role() -> dict:
    return {"id": uuid.uuid4().hex[:8]}


def _new_project() -> dict:
    return {"id": uuid.uuid4().hex[:8], "roles": [_new_role()]}


def _init_state() -> None:
    if "projects" not in st.session_state:
        st.session_state.projects = [_new_project()]


def _collect_form_data() -> list[dict]:
    """
    Read current widget values from session_state into a plain list of dicts.
    Called at the bottom of render_input(), after all widgets have rendered.
    """
    result: list[dict] = []
    for project in st.session_state.projects:
        pid = project["id"]
        p_data: dict = {
            "name": st.session_state.get(f"proj_name_{pid}", "").strip(),
            "description": st.session_state.get(f"proj_desc_{pid}", "").strip(),
            "roles": [],
        }
        for role in project["roles"]:
            rid = role["id"]
            p_data["roles"].append(
                {
                    "title": st.session_state.get(f"role_title_{rid}", "").strip(),
                    "description": st.session_state.get(
                        f"role_desc_{rid}", ""
                    ).strip(),
                }
            )
        result.append(p_data)
    return result


def _validate(projects_data: list[dict]) -> list[str]:
    errors: list[str] = []
    has_any_role = any(bool(p["roles"]) for p in projects_data)
    if not has_any_role:
        errors.append("Add at least one role to proceed.")
        return errors
    for i, p in enumerate(projects_data):
        label = p["name"] or f"Project {i + 1}"
        for j, r in enumerate(p["roles"]):
            if not r["title"]:
                errors.append(f"{label} — Role {j + 1} is missing a title.")
    return errors


# ---------------------------------------------------------------------------
# Main render function
# ---------------------------------------------------------------------------

def render_input() -> None:
    _init_state()

    st.title("Role–Capability Matching")
    st.write(
        "Define your projects and the roles required to deliver them. "
        "Each role description helps the system infer the capabilities needed."
    )

    for project in list(st.session_state.projects):
        pid = project["id"]

        # Compute display index from current state (handles removals)
        proj_index = next(
            (i for i, p in enumerate(st.session_state.projects) if p["id"] == pid),
            0,
        )

        with st.container(border=True):
            h_col, rm_col = st.columns([8, 1])
            h_col.markdown(f"### Project {proj_index + 1}")
            with rm_col:
                if st.button(
                    "Remove",
                    key=f"rm_proj_{pid}",
                    disabled=len(st.session_state.projects) == 1,
                    help="Cannot remove the only project" if len(st.session_state.projects) == 1 else "Remove this project",
                ):
                    st.session_state.projects = [
                        p for p in st.session_state.projects if p["id"] != pid
                    ]
                    st.rerun()

            st.text_input(
                "Project name",
                key=f"proj_name_{pid}",
                placeholder="e.g. Customer Portal Rebuild",
            )
            st.text_area(
                "Project description *(optional)*",
                key=f"proj_desc_{pid}",
                placeholder="Brief overview of goals and context…",
                height=80,
            )

            st.markdown("**Roles**")

            for role in list(project["roles"]):
                rid = role["id"]
                with st.container(border=True):
                    st.text_input(
                        "Role title",
                        key=f"role_title_{rid}",
                        placeholder="e.g. Software Developer",
                    )
                    st.text_area(
                        "Role description",
                        key=f"role_desc_{rid}",
                        placeholder="Describe the responsibilities and required capabilities…",
                        height=80,
                    )
                    if st.button(
                        "Remove role",
                        key=f"rm_role_{rid}",
                        disabled=len(project["roles"]) == 1,
                        help="Cannot remove the only role in a project" if len(project["roles"]) == 1 else "Remove this role",
                    ):
                        project["roles"] = [
                            r for r in project["roles"] if r["id"] != rid
                        ]
                        st.rerun()

            if st.button("+ Add role", key=f"add_role_{pid}"):
                project["roles"].append(_new_role())
                st.rerun()

    if st.button("+ Add project"):
        st.session_state.projects.append(_new_project())
        st.rerun()

    st.divider()

    projects_data = _collect_form_data()
    errors = _validate(projects_data)

    if errors:
        for err in errors:
            st.warning(err)

    if st.button("Run Matching", type="primary", disabled=bool(errors)):
        st.session_state.pending_projects = projects_data
        # Clear any previous results so app.py re-runs matching
        st.session_state.pop("assignments", None)
        st.session_state.pop("gap_analyses", None)
        st.session_state.page = "results"
        st.rerun()
