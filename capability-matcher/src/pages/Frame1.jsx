// Frame1.jsx — Project overview screen (Step 1 of 4).

import { useEffect, useState } from "react";
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getSavedCapabilities,
  getProjectAssignments,
  generateTeamReport,
} from "../api/api";

const ROLE_COLORS = [
  { bg: "#1e2a14", color: "#86BC25", initials: "SA" },
  { bg: "#0d1f33", color: "#5b9bd5", initials: "DE" },
  { bg: "#1c0d33", color: "#9b6dd4", initials: "CL" },
  { bg: "#2a1800", color: "#d4922a", initials: "CA" },
  { bg: "#2a0d0d", color: "#e05252", initials: "PM" },
  { bg: "#082020", color: "#1D9E75", initials: "NR" },
];

function roleColor(roleId) {
  // Derived from the role's own id, not its position in the list, so the
  // color travels with the role when it's reordered instead of being
  // reassigned based on whatever slot it lands in (which made moving a
  // role look like nothing changed if it swapped colors with its neighbor).
  const n = String(roleId)
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ROLE_COLORS[n % ROLE_COLORS.length];
}

function getInitials(title) {
  return title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Frame1({
  project: initialProject,
  onSelectRole,
  onBack,
  onViewTeamReport,
}) {
  const [project] = useState(initialProject);
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [formError, setFormError] = useState("");

  // Edit
  const [editingRole, setEditingRole] = useState(null);
  const [editFields, setEditFields] = useState({ title: "", description: "" });

  // Required time (%) — set inline, per role, before matching runs.
  // Mirrors the topKValues pattern: local edit state keyed by roleId, saved
  // to Supabase on blur.
  const [percentageValues, setPercentageValues] = useState({}); // roleId -> number
  const [percentageSaving, setPercentageSaving] = useState({}); // roleId -> bool

  // Drag and drop reordering was replaced with simple move up/down buttons
  // — native HTML5 drag-and-drop kept losing its session mid-drag in this
  // app (re-renders during the drag disrupting the browser's drag state),
  // and wasn't worth continuing to fight. Move buttons are far more
  // reliable for the same "reorder roles" need.

  const [assignments, setAssignments] = useState({}); // roleId -> assignment
  const [savedCaps, setSavedCaps] = useState({}); // roleId -> caps array

  const [topKValues, setTopKValues] = useState({}); // roleId -> number
  const [teamReportStatus, setTeamReportStatus] = useState("idle");

  // Load assignments for this project
  useEffect(() => {
    if (!initialProject?.id) return;
    getProjectAssignments(initialProject.id)
      .then((data) => {
        const map = {};
        data.forEach((a) => {
          map[a.role_id] = a;
        });
        setAssignments(map);
      })
      .catch(console.error);
  }, [initialProject?.id]);

  // Load roles from Supabase
  useEffect(() => {
    if (!initialProject?.id) return;
    console.log("Loading roles for project:", initialProject.id);
    getRoles(initialProject.id)
      .then((data) => {
        console.log("Roles loaded:", data);
        setRoles(data);
      })
      .catch((e) => {
        console.error("Roles error:", e);
        setError("Could not load roles.");
      })
      .finally(() => {
        console.log("Roles loading done");
        setRolesLoading(false);
      });
  }, [initialProject?.id]);

  const allRolesAssigned =
    roles.length > 0 && roles.every((role) => Boolean(assignments[role.id]));

  //Add role
  async function handleAddRole() {
    if (!newTitle.trim()) {
      setFormError("Role title is required.");
      return;
    }
    if (!newDesc.trim()) {
      setFormError("Role description is required.");
      return;
    }
    try {
      const newRole = await createRole(initialProject.id, {
        title: newTitle.trim(),
        description: newDesc.trim(),
        sort_order: roles.length,
        required_percentage: 100, // default — adjusted inline before matching
      });
      setRoles((prev) => [...prev, newRole]);
      setNewTitle("");
      setNewDesc("");
      setFormError("");
      setShowAddForm(false);
    } catch (e) {
      setFormError("Failed to save role. Try again.");
    }
  }

  // Edit role
  async function handleSaveEdit() {
    if (!editFields.title.trim()) {
      setFormError("Role title is required.");
      return;
    }
    if (!editFields.description.trim()) {
      setFormError("Role description is required.");
      return;
    }
    try {
      const updated = await updateRole(editingRole, {
        title: editFields.title.trim(),
        description: editFields.description.trim(),
      });
      setRoles((prev) =>
        prev.map((r) => (r.id === editingRole ? { ...r, ...updated } : r)),
      );
      setEditingRole(null);
      setEditFields({ title: "", description: "" });
      setFormError("");
    } catch (e) {
      setFormError("Failed to update role. Try again.");
    }
  }

  // Remove role
  async function handleRemoveRole(roleId) {
    if (!window.confirm("Remove this role? This cannot be undone.")) return;
    try {
      await deleteRole(roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
    } catch (e) {
      alert("Failed to delete role. Try again.");
    }
  }

  // Duplicate role
  async function handleDuplicateRole(role) {
    try {
      const duplicate = await createRole(initialProject.id, {
        title: `${role.title} (copy)`,
        description: role.description,
        sort_order: roles.length,
        required_percentage: role.required_percentage ?? 100,
      });
      setRoles((prev) => [...prev, duplicate]);
    } catch (e) {
      alert("Failed to duplicate role. Try again.");
    }
  }

  //Expand role details
  async function handleExpand(roleId) {
    setExpanded((prev) => (prev === roleId ? null : roleId));
    if (!savedCaps[roleId]) {
      try {
        const caps = await getSavedCapabilities(roleId);
        setSavedCaps((prev) => ({ ...prev, [roleId]: caps }));
      } catch (e) {
        console.error("Failed to load caps for role", roleId);
      }
    }
  }

  // Save the required percentage for a role once the field loses focus.
  // Mirrors topKValues being local-only until used, except this value needs
  // to persist immediately since Frame3 reads role.required_percentage
  // directly from Supabase.
  async function handlePercentageBlur(role) {
    const val = percentageValues[role.id] ?? role.required_percentage ?? 100;
    if (val === (role.required_percentage ?? 100)) return; // no change, skip save
    setPercentageSaving((prev) => ({ ...prev, [role.id]: true }));
    try {
      await updateRole(role.id, { required_percentage: val });
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id ? { ...r, required_percentage: val } : r,
        ),
      );
    } catch (e) {
      alert("Failed to save required time. Try again.");
    } finally {
      setPercentageSaving((prev) => ({ ...prev, [role.id]: false }));
    }
  }

  async function handleGenerateTeamReport() {
    if (!allRolesAssigned || teamReportStatus === "loading") return;

    if (onViewTeamReport) {
      onViewTeamReport(project.id);
      return;
    }

    setTeamReportStatus("loading");

    try {
      // Load the SAVED capabilities from Supabase for every role.
      // This preserves manual edits and capability weights rather than
      // re-running capability inference.
      const rolesForReport = await Promise.all(
        roles.map(async (role) => {
          const capabilities = await getSavedCapabilities(role.id);
          const assignment = assignments[role.id];

          return {
            id: role.id,
            title: role.title,
            description: role.description || "",
            assignment: {
              employee_id: assignment.employee_id,
              employee_name: assignment.employee_name,
              match_score: assignment.match_score,
            },
            capabilities: capabilities.map((capability) => ({
              cap_id: capability.cap_id,
              name: capability.name,
              esco_description: capability.esco_description || "",
              weight: capability.weight,
              is_inferred: Boolean(capability.is_inferred),
            })),
          };
        }),
      );

      const payload = {
        project_id: project.id,
        project_name: project.name,
        project_description: project.description || "",
        client: project.client || null,
        roles: rolesForReport,
      };

      const blob = await generateTeamReport(project.id, payload);

      const projectName = project.name
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "");

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `${projectName || "Project"}-Team-Report.docx`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);

      setTeamReportStatus("done");

      setTimeout(() => {
        setTeamReportStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Failed to generate team report:", error);

      window.alert(
        error?.message ||
          "Could not generate the team report. Please try again.",
      );

      setTeamReportStatus("error");
    }
  }

  // Move a role up or down one position in the list, persisting the new
  // sort_order to Supabase for every role (same persistence approach the
  // old drag-and-drop reordering used).
  async function handleMoveRole(roleId, direction) {
    const from = roles.findIndex((r) => r.id === roleId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= roles.length) return;

    const reordered = [...roles];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    setRoles(reordered);

    try {
      await Promise.all(
        reordered.map((role, index) =>
          updateRole(role.id, { sort_order: index }),
        ),
      );
    } catch (e) {
      alert("Failed to save new order. Try again.");
    }
  }

  if (error) return <div className="error">{error}</div>;

  return (
    <div className="page">
      <button
        className="btn-secondary"
        onClick={onBack}
        style={{ marginBottom: 16, fontSize: 11, padding: "5px 14px" }}
      >
        Back to projects
      </button>

      <div className="page-title">{project.name}</div>
      <div className="page-sub">Select a role to begin capability matching</div>

      {/* Project description */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Project overview</span>
        </div>
        <p style={{ fontSize: 13, color: "#cccccc", lineHeight: 1.7 }}>
          {project.description}
        </p>
      </div>

      {/* Roles list */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Roles required</span>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span className="badge badge-green">{roles.length} roles</span>

            <span
              title={
                !allRolesAssigned
                  ? "Assign a team member to every project role before generating the team report."
                  : ""
              }
              style={{
                display: "inline-flex",
                cursor: !allRolesAssigned ? "not-allowed" : "default",
              }}
            >
              <button
                type="button"
                onClick={handleGenerateTeamReport}
                disabled={!allRolesAssigned || teamReportStatus === "loading"}
                style={{
                  border: allRolesAssigned
                    ? "1px solid #86BC25"
                    : "1px solid #2a2a2a",

                  background: allRolesAssigned ? "#86BC25" : "#181818",

                  color: allRolesAssigned ? "#0a0a0a" : "#555555",

                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "inherit",

                  cursor:
                    allRolesAssigned && teamReportStatus !== "loading"
                      ? "pointer"
                      : "not-allowed",

                  opacity: teamReportStatus === "loading" ? 0.6 : 1,
                }}
              >
                {teamReportStatus === "loading"
                  ? "Generating report..."
                  : teamReportStatus === "done"
                    ? "Report generated ✓"
                    : allRolesAssigned
                      ? "View Team Report"
                      : "Generate Team Report"}
              </button>
            </span>
          </div>
        </div>

        {rolesLoading ? (
          <div style={{ fontSize: 12, color: "#555", padding: "12px 0" }}>
            Loading roles...
          </div>
        ) : roles.length === 0 ? (
          <div style={{ fontSize: 12, color: "#555", padding: "12px 0" }}>
            No roles yet. Add one below.
          </div>
        ) : (
          roles.map((role, i) => {
            const c = roleColor(role.id);
            const isExpanded = expanded === role.id;

            return (
              <div
                key={role.id}
                style={{
                  borderBottom:
                    i < roles.length - 1 ? "1px solid #1f1f1f" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 0",
                  }}
                >
                  {/* Move up/down — replaced native drag-and-drop reordering,
                      which kept losing its session mid-drag in this app
                      (re-renders during the drag disrupting the browser's
                      native drag state). Buttons are far more reliable. */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveRole(role.id, "up");
                      }}
                      disabled={i === 0}
                      title="Move up"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: i === 0 ? "default" : "pointer",
                        color: i === 0 ? "#333" : "#888",
                        fontSize: 10,
                        lineHeight: 1,
                        padding: "2px 4px",
                        fontFamily: "inherit",
                      }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveRole(role.id, "down");
                      }}
                      disabled={i === roles.length - 1}
                      title="Move down"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: i === roles.length - 1 ? "default" : "pointer",
                        color: i === roles.length - 1 ? "#333" : "#888",
                        fontSize: 10,
                        lineHeight: 1,
                        padding: "2px 4px",
                        fontFamily: "inherit",
                      }}
                    >
                      ▼
                    </button>
                  </div>

                  {/* Click-to-expand zone — avatar + title */}
                  <div
                    onClick={() => handleExpand(role.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flex: 1,
                      cursor: "pointer",
                      minWidth: 0,
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: c.bg,
                        color: c.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(role.title)}
                    </div>

                    {/* Title */}
                    <div
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#eeeeee",
                      }}
                    >
                      {role.title}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingRole(role.id);
                      setEditFields({
                        title: role.title,
                        description: role.description,
                      });
                      setExpanded(role.id);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid #2a2a2a",
                      cursor: "pointer",
                      color: "#888888",
                      fontSize: 11,
                      padding: "3px 10px",
                      fontFamily: "inherit",
                      borderRadius: 5,
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateRole(role);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid #2a2a2a",
                      cursor: "pointer",
                      color: "#888888",
                      fontSize: 11,
                      padding: "3px 10px",
                      fontFamily: "inherit",
                      borderRadius: 5,
                    }}
                  >
                    Duplicate
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRole(role.id);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid #2a2a2a",
                      cursor: "pointer",
                      color: "#888888",
                      fontSize: 11,
                      padding: "3px 10px",
                      fontFamily: "inherit",
                      borderRadius: 5,
                    }}
                  >
                    Remove
                  </button>

                  {/* Chevron */}
                  <span
                    style={{
                      color: "#444",
                      fontSize: 12,
                      display: "inline-block",
                      transition: "transform 0.2s",
                      marginLeft: 4,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >
                    ›
                  </span>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ paddingBottom: 16, paddingLeft: 50 }}>
                    {editingRole === role.id ? (
                      // Edit form
                      <div
                        style={{
                          padding: 16,
                          background: "#141414",
                          border: "1px solid #2a2a2a",
                          borderRadius: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#e0e0e0",
                            marginBottom: 12,
                          }}
                        >
                          Edit role
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#888888",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              display: "block",
                              marginBottom: 5,
                            }}
                          >
                            Role title{" "}
                            <span style={{ color: "#e05252" }}>*</span>
                          </label>
                          <input
                            type="text"
                            value={editFields.title}
                            onChange={(e) => {
                              setEditFields((f) => ({
                                ...f,
                                title: e.target.value,
                              }));
                              setFormError("");
                            }}
                            style={{
                              width: "100%",
                              background: "#111",
                              border: "1px solid #2a2a2a",
                              borderRadius: 6,
                              padding: "8px 11px",
                              fontSize: 12,
                              color: "#e0e0e0",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#888888",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              display: "block",
                              marginBottom: 5,
                            }}
                          >
                            Description{" "}
                            <span style={{ color: "#e05252" }}>*</span>
                          </label>
                          <textarea
                            value={editFields.description}
                            onChange={(e) => {
                              setEditFields((f) => ({
                                ...f,
                                description: e.target.value,
                              }));
                              setFormError("");
                            }}
                            rows={3}
                            style={{
                              width: "100%",
                              background: "#111",
                              border: "1px solid #2a2a2a",
                              borderRadius: 6,
                              padding: "8px 11px",
                              fontSize: 12,
                              color: "#e0e0e0",
                              fontFamily: "inherit",
                              resize: "vertical",
                            }}
                          />
                          {formError && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#e05252",
                                marginTop: 4,
                              }}
                            >
                              {formError}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn-primary"
                            onClick={handleSaveEdit}
                          >
                            Save changes
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setEditingRole(null);
                              setEditFields({ title: "", description: "" });
                              setFormError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Normal view
                      <>
                        {/* Capabilities preview */}
                        {savedCaps[role.id] && savedCaps[role.id].length > 0 ? (
                          <div style={{ marginBottom: 12 }}>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#888888",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                marginBottom: 6,
                              }}
                            >
                              Required capabilities ({savedCaps[role.id].length}
                              )
                            </div>
                            {savedCaps[role.id].map((cap) => (
                              <div
                                key={cap.cap_id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  fontSize: 12,
                                  color: "#aaaaaa",
                                  padding: "3px 0",
                                }}
                              >
                                <span
                                  style={{ color: "#86BC25", fontSize: 10 }}
                                >
                                  ›
                                </span>
                                {cap.name}
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: "#1e2a14",
                                    color: "#86BC25",
                                    borderRadius: 3,
                                    padding: "1px 6px",
                                    marginLeft: "auto",
                                  }}
                                >
                                  {cap.weight}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p
                            style={{
                              fontSize: 12,
                              color: "#999999",
                              lineHeight: 1.8,
                              borderLeft: "2px solid #2a2a2a",
                              paddingLeft: 12,
                              marginBottom: 14,
                              textAlign: "left",
                            }}
                          >
                            {role.description}
                          </p>
                        )}

                        {/* Assigned employee */}
                        {assignments[role.id] && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              background: "#1e2a14",
                              border: "1px solid #2a3a18",
                              borderRadius: 7,
                              padding: "8px 12px",
                              marginBottom: 12,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                color: "#86BC25",
                                fontWeight: 600,
                              }}
                            >
                              {assignments[role.id].employee_name}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: "#5a8a00",
                                marginLeft: "auto",
                              }}
                            >
                              {Math.round(
                                assignments[role.id].match_score * 100,
                              )}
                              % match
                            </span>
                          </div>
                        )}

                        {/* Required time (%) — editable inline, before matching */}
                        {!assignments[role.id] && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              marginBottom: 14,
                              padding: "10px 12px",
                              background: "#141414",
                              border: "1px solid #2a2a2a",
                              borderRadius: 7,
                            }}
                          >
                            <span style={{ fontSize: 12, color: "#aaaaaa" }}>
                              Required availability
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={5}
                              value={
                                percentageValues[role.id] ??
                                role.required_percentage ??
                                100
                              }
                              onChange={(e) =>
                                setPercentageValues((prev) => ({
                                  ...prev,
                                  [role.id]: Math.max(
                                    0,
                                    Math.min(100, Number(e.target.value)),
                                  ),
                                }))
                              }
                              onBlur={() => handlePercentageBlur(role)}
                              style={{
                                width: 72,
                                background: "#111",
                                border: "1px solid #2a2a2a",
                                borderRadius: 5,
                                padding: "4px 8px",
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#86BC25",
                                textAlign: "center",
                                fontFamily: "inherit",
                              }}
                            />
                            <span style={{ fontSize: 11, color: "#555" }}>
                              {percentageSaving[role.id] ? "saving…" : "% of their availability"}
                            </span>
                          </div>
                        )}

                        {/* TopK picker — only shown before capabilities are inferred */}
                        {(!savedCaps[role.id] ||
                          savedCaps[role.id].length === 0) &&
                          !assignments[role.id] && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 14,
                                padding: "10px 12px",
                                background: "#141414",
                                border: "1px solid #2a2a2a",
                                borderRadius: 7,
                              }}
                            >
                              <span style={{ fontSize: 12, color: "#aaaaaa" }}>
                                AI suggested capabilities
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={topKValues[role.id] ?? 5}
                                onChange={(e) =>
                                  setTopKValues((prev) => ({
                                    ...prev,
                                    [role.id]: Math.max(
                                      1,
                                      Math.min(10, Number(e.target.value)),
                                    ),
                                  }))
                                }
                                style={{
                                  width: 52,
                                  background: "#111",
                                  border: "1px solid #2a2a2a",
                                  borderRadius: 5,
                                  padding: "4px 8px",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#86BC25",
                                  textAlign: "center",
                                  fontFamily: "inherit",
                                }}
                              />
                              <span style={{ fontSize: 11, color: "#555" }}>
                                of 10 max
                              </span>
                            </div>
                          )}

                        {/* Action button — changes based on progress */}
                        {assignments[role.id] ? (
                          // Employee already assigned — show view analysis + option to redo
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="btn-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRole(
                                  role,
                                  true,
                                  assignments[role.id].employee_id,
                                );
                              }}
                              style={{ fontSize: 11, padding: "7px 16px" }}
                            >
                              View analysis →
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRole(
                                  role,
                                  false,
                                  null,
                                  topKValues[role.id] ?? 5,
                                );
                              }}
                              style={{ fontSize: 11, padding: "7px 16px" }}
                            >
                              Redo matching
                            </button>
                          </div>
                        ) : savedCaps[role.id] &&
                          savedCaps[role.id].length > 0 ? (
                          <button
                            className="btn-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRole(
                                role,
                                false,
                                null,
                                topKValues[role.id] ?? 5,
                              );
                            }}
                            style={{ fontSize: 11, padding: "7px 16px" }}
                          >
                            Continue matching →
                          </button>
                        ) : (
                          <button
                            className="btn-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRole(
                                role,
                                false,
                                null,
                                topKValues[role.id] ?? 5,
                              );
                            }}
                            style={{ fontSize: 11, padding: "7px 16px" }}
                          >
                            Match this role →
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Add role form */}
        {showAddForm && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              background: "#141414",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#e0e0e0",
                marginBottom: 12,
              }}
            >
              New role
            </div>
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#888888",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "block",
                  marginBottom: 5,
                }}
              >
                Role title <span style={{ color: "#e05252" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Business Analyst"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  setFormError("");
                }}
                style={{
                  width: "100%",
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: 6,
                  padding: "8px 11px",
                  fontSize: 12,
                  color: "#e0e0e0",
                  fontFamily: "inherit",
                }}
              />
              {formError && (
                <div style={{ fontSize: 11, color: "#e05252", marginTop: 4 }}>
                  {formError}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#888888",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "block",
                  marginBottom: 5,
                }}
              >
                Description <span style={{ color: "#e05252" }}>*</span>
              </label>
              <textarea
                placeholder="Describe the responsibilities and requirements of this role"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: 6,
                  padding: "8px 11px",
                  fontSize: 12,
                  color: "#e0e0e0",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={handleAddRole}>
                Add role
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setNewTitle("");
                  setNewDesc("");
                  setNewPercentage(100);
                  setFormError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add role button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "1px dashed #2a2a2a",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              color: "#777777",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Add role
          </button>
        )}
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  );
}