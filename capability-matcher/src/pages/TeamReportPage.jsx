import { useEffect, useState } from "react";
import {
  generateTeamReport,
  getAllProjects,
  getEmployeeById,
  getProjectAssignments,
  getRoles,
  getSavedCapabilities,
  inferCapabilities,
  loadCapabilities,
} from "../api/api";
import { supabase } from "../supabase";
import TeamMemberDetail from "./TeamMemberDetail";
import RadarChart from "../components/RadarChart";

const ROLE_LEVEL_GROUPS = {
  junior: {
    label: "Senior Consultant & below",
    levels: ["Analyst", "Consultant", "Senior Consultant"],
  },
  senior: {
    label: "Manager–Director",
    levels: ["Manager", "Senior Manager", "Director"],
  },
  partner: {
    label: "Partner",
    levels: ["Partner"],
  },
};

// Overall employee-role match uses the same 1–10 scale as Frames 3 and 4.
function scoreOutOfTen(score) {
  return Math.ceil(Math.max(0, Math.min(1, Number(score) || 0)) * 10);
}

function scoreBadgeClass(score) {
  if (score >= 8) return "badge badge-green";
  if (score >= 6) return "badge badge-amber";
  return "badge badge-red";
}

function scoreColor(score) {
  if (score >= 8) return "#86BC25";
  if (score >= 6) return "#d4922a";
  return "#e05252";
}

function seniorityGroup(roleLevel) {
  return (
    Object.entries(ROLE_LEVEL_GROUPS).find(([, group]) =>
      group.levels.includes(roleLevel),
    )?.[0] ?? null
  );
}

export default function TeamReportPage({ projectId, onBackToRoles }) {
  const [project, setProject] = useState(null);
  const [projectName, setProjectName] = useState("Project");
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [workedTogether, setWorkedTogether] = useState("");
  const [rmNotes, setRmNotes] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberNotes, setMemberNotes] = useState({});
  const [chemistryReport, setChemistryReport] = useState(null);
  const [generatingChemistry, setGeneratingChemistry] = useState(false);

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      setError(null);

      try {
        const [assignments, projects, roles] = await Promise.all([
          getProjectAssignments(projectId),
          getAllProjects(),
          getRoles(projectId),
        ]);

        const projectRecord = (projects || []).find(
          (item) => item.id === projectId,
        );
        setProject(projectRecord || null);
        setProjectName(projectRecord?.name || "Project Report");

        const assignmentsByRole = new Map(
          (assignments || []).map((assignment) => [
            assignment.role_id,
            assignment,
          ]),
        );

        const resolvedTeam = (
          await Promise.all(
            (roles || []).map(async (role) => {
              const assignment = assignmentsByRole.get(role.id);

              // A role without a saved employee assignment is not part of
              // the proposed team yet.
              if (!assignment) return null;

              const roleTitle = role.title || "";
              const roleDescription = role.description || "";

              if (roleTitle) {
                try {
                  // Keep backend memory in sync with each role's saved
                  // capabilities so the team report reflects the PM's chosen
                  // skill set rather than a fresh auto-inferred one.
                  const savedCaps = await getSavedCapabilities(
                    assignment.role_id,
                  );
                  if (savedCaps && savedCaps.length > 0) {
                    await loadCapabilities(assignment.role_id, savedCaps);
                  } else {
                    await inferCapabilities(
                      assignment.role_id,
                      roleTitle,
                      roleDescription,
                    );
                  }
                } catch (inferenceError) {
                  console.warn(
                    "Could not load role capabilities:",
                    inferenceError,
                  );
                }
              }

              const employee = await getEmployeeById(assignment.employee_id);

              if (!employee) return null;

              return {
                ...employee,
                role_id: assignment.role_id,
                role_title: roleTitle,
                match_score: assignment.match_score ?? employee.match_score,
              };
            }),
          )
        ).filter(Boolean);

        setTeam(resolvedTeam);
      } catch (loadError) {
        console.error("Team report error:", loadError);
        setError("Could not load the team report.");
      } finally {
        setLoading(false);
      }
    }

    if (projectId) loadReport();
  }, [projectId]);

  async function handleGenerateReport() {
    if (!projectId || team.length === 0 || reportLoading) return;

    setReportLoading(true);
    setReportError(null);

    try {
      const [roles, assignments] = await Promise.all([
        getRoles(projectId),
        getProjectAssignments(projectId),
      ]);
      const assignmentsByRole = new Map(
        (assignments || []).map((assignment) => [
          assignment.role_id,
          assignment,
        ]),
      );
      const rolesById = new Map((roles || []).map((role) => [role.id, role]));

      const rolesForReport = await Promise.all(
        team.map(async (member) => {
          const role = rolesById.get(member.role_id);
          const assignment = assignmentsByRole.get(member.role_id);

          if (!role) {
            throw new Error(`Role ${member.role_id} could not be found.`);
          }

          if (
            !assignment?.employee_id ||
            assignment.match_score === undefined ||
            assignment.match_score === null
          ) {
            throw new Error(
              `Missing saved assignment data for role ${member.role_id}.`,
            );
          }

          const capabilities = await getSavedCapabilities(member.role_id);

          return {
            id: role.id,
            title: role.title,
            description: role.description || "",
            assignment: {
              employee_id: assignment.employee_id,
              employee_name: assignment.employee_name || "",
              match_score: assignment.match_score,
              business_chemistry: assignment.business_chemistry || null,
            },
            member_note: memberNotes[assignment.employee_id] || null,
            capabilities: (capabilities || []).map((capability) => ({
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
        project_id: projectId,
        project_name: project?.name || projectName,
        project_description: project?.description || "",
        client: project?.client || null,
        location: project?.location || null,
        start_date: project?.start_date || null,
        end_date: project?.end_date || null,
        roles: rolesForReport,
        worked_together_score:
          workedTogether === "" ? null : Number(workedTogether),
        rm_notes: rmNotes,
      };
      const blob = await generateTeamReport(projectId, payload);
      const filename = `${
        (project?.name || projectName || "Project")
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9-]/g, "") || "Project"
      }-Team-Report.docx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (reportGenerationError) {
      console.error("Failed to generate team report:", reportGenerationError);
      setReportError("Could not generate the team report. Please try again.");
    } finally {
      setReportLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading team report...</div>;
  if (error) return <div className="error">{error}</div>;

  if (team.length === 0) {
    return (
      <div className="page">
        <div className="page-title">Team Capability Report</div>
        <div className="page-sub">{projectName}</div>
        <div className="card">No saved assignments for this project yet.</div>
      </div>
    );
  }

  if (selectedMember) {
    return (
      <TeamMemberDetail
        employee={selectedMember.employee}
        roleId={selectedMember.roleId}
        initialNote={memberNotes[selectedMember.employee.employee_id] || ""}
        onSaveNote={(note) => {
          setMemberNotes((currentNotes) => ({
            ...currentNotes,
            [selectedMember.employee.employee_id]: note,
          }));
        }}
        onBack={() => setSelectedMember(null)}
      />
    );
  }

  const averageMatch =
    team.reduce(
      (total, member) => total + scoreOutOfTen(member.match_score),
      0,
    ) / team.length;
  const seniorityCounts = team.reduce(
    (counts, member) => {
      const group = seniorityGroup(member.role_level);
      if (group) counts[group] += 1;
      return counts;
    },
    { junior: 0, senior: 0, partner: 0 },
  );
  const seniorShare =
    (seniorityCounts.senior + seniorityCounts.partner) / team.length;
  const radarItems = team.map((member, index) => {
    const score = scoreOutOfTen(member.match_score);
    return {
      key: `${member.role_id}-${member.employee_id}`,
      label: member.role_title || `Role ${index + 1}`,
      sublabel: member.name || member.employee_name,
      value: Number(member.match_score) || 0,
      displayValue: `${score}/10`,
      color: scoreColor(score),
      member,
    };
  });

  async function handleGenerateChemistry() {
    setGeneratingChemistry(true);
    try {
      const counts = { Pioneer: 0, Guardian: 0, Driver: 0, Integrator: 0 };
      team.forEach((a) => {
        if (
          a.business_chemistry &&
          counts[a.business_chemistry] !== undefined
        ) {
          counts[a.business_chemistry]++;
        }
      });

      const res = await fetch(
        `http://localhost:8000/projects/${projectId}/chemistry-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            chemistry_counts: counts,
            project_name: projectName,
          }),
        },
      );
      const data = await res.json();
      setChemistryReport(data.team_dynamics);
    } catch (e) {
      console.error("Chemistry report error:", e);
    } finally {
      setGeneratingChemistry(false);
    }
  }

  return (
    <div className="page">
      <div className="card-head">
        <div>
          <div className="page-title">Team Capability Report</div>
          <div className="page-sub">{projectName}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBackToRoles && (
            <button
              className="btn-secondary"
              type="button"
              onClick={onBackToRoles}
            >
              Back to Roles
            </button>
          )}
          <button
            className="btn-primary"
            type="button"
            onClick={handleGenerateReport}
            disabled={reportLoading || team.length === 0}
            style={{
              opacity: reportLoading || team.length === 0 ? 0.5 : 1,
              cursor:
                reportLoading || team.length === 0 ? "default" : "pointer",
            }}
          >
            {reportLoading ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>
      {reportError && (
        <div className="error" style={{ padding: "0 0 14px" }}>
          {reportError}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div className="card-title">Team Capability Match</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 20, color: "var(--green)" }}>
              {averageMatch.toFixed(1)}/10
            </strong>
            <span style={{ color: "var(--muted2)", fontSize: 11 }}>
              average role fit
            </span>
            <span className="badge badge-blue">AI match</span>
          </div>
        </div>
        <RadarChart
          items={radarItems}
          ariaLabel="Employee-role fit radar chart"
          hint="Hover to highlight · click to open a team member"
          onItemClick={(item) =>
            setSelectedMember({
              employee: item.member,
              roleId: item.member.role_id,
            })
          }
        />
      </section>

      <div>
        <section
          className="card"
          style={{ borderLeft: "3px solid var(--green)" }}
        >
          <div className="card-head">
            <div className="card-title">Team Composition — RM Assessment</div>
            <span className="badge badge-green">RM</span>
          </div>
          <div style={{ display: "grid", gap: 10, fontSize: 12 }}>
            <div
              role="img"
              aria-label={`Role level distribution: ${Object.entries(
                ROLE_LEVEL_GROUPS,
              )
                .map(
                  ([groupId, group]) =>
                    `${group.label} ${seniorityCounts[groupId]}`,
                )
                .join(", ")}`}
              style={{
                display: "flex",
                width: "100%",
                height: 34,
                overflow: "hidden",
                borderRadius: 8,
              }}
            >
              {Object.entries(ROLE_LEVEL_GROUPS).map(([groupId], index) => {
                const count = seniorityCounts[groupId];
                const percentage = (count / team.length) * 100;
                const colors = ["#86BC25", "#5b9bd5", "#9b6dd4"];

                return (
                  <div
                    key={groupId}
                    style={{
                      display: "flex",
                      flex: `0 0 ${percentage}%`,
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 0,
                      background: colors[index],
                      color: "#111",
                      fontWeight: 600,
                    }}
                  >
                    {percentage >= 10 ? `${Math.round(percentage)}%` : null}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
              {Object.entries(ROLE_LEVEL_GROUPS).map(
                ([groupId, group], index) => {
                  const count = seniorityCounts[groupId];
                  const percentage = Math.round((count / team.length) * 100);
                  const colors = ["#86BC25", "#5b9bd5", "#9b6dd4"];

                  return (
                    <div
                      key={groupId}
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 8,
                          height: 8,
                          flex: "0 0 8px",
                          borderRadius: "50%",
                          background: colors[index],
                        }}
                      />
                      <span>{group.label}</span>
                      <strong>
                        {count} ({percentage}%)
                      </strong>
                    </div>
                  );
                },
              )}
            </div>
            {seniorShare >= 0.5 && (
              <div
                className="badge badge-amber"
                style={{ whiteSpace: "normal", lineHeight: 1.5 }}
              >
                This team's seniority mix is weighted toward senior levels,
                which may increase budget requirements. Use Back to review and
                adjust role selections if needed.
              </div>
            )}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
              }}
            >
              <span>Worked together before</span>
              <input
                type="number"
                min="1"
                max="5"
                step="1"
                value={workedTogether}
                onChange={(event) => setWorkedTogether(event.target.value)}
                placeholder="1-5"
                style={{ width: 58 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, marginTop: 4 }}>
              Additional notes (personality fit, working style, risks)
              <textarea
                rows="3"
                value={rmNotes}
                onChange={(event) => setRmNotes(event.target.value)}
              />
            </label>
          </div>
        </section>
      </div>

      {/* Team Business Chemistry */}
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: 10,
          padding: 18,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>
            Team Business Chemistry
          </span>
          <span style={{ fontSize: 10, color: "#86BC25", fontWeight: 600 }}>
            DELOITTE
          </span>
        </div>

        {(() => {
          const types = {
            Pioneer: {
              color: "#EF9F27",
              desc: "Values possibilities and spark of new ideas",
            },
            Guardian: {
              color: "#5b9bd5",
              desc: "Values stability, thoroughness and best practice",
            },
            Driver: {
              color: "#e05252",
              desc: "Values challenge, momentum and results",
            },
            Integrator: {
              color: "#86BC25",
              desc: "Values relationships, harmony and connection",
            },
          };

          const counts = { Pioneer: 0, Guardian: 0, Driver: 0, Integrator: 0 };
          team.forEach((a) => {
            if (
              a.business_chemistry &&
              counts[a.business_chemistry] !== undefined
            ) {
              counts[a.business_chemistry]++;
            }
          });

          return (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {Object.entries(types).map(([type, { color, desc }]) => (
                  <div
                    key={type}
                    style={{
                      background: "#111",
                      borderRadius: 8,
                      padding: "10px 12px",
                      border: `1px solid ${counts[type] > 0 ? color + "44" : "#222"}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color,
                          background: color + "22",
                          borderRadius: 4,
                          padding: "2px 7px",
                        }}
                      >
                        {type[0]}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#d0d0d0",
                        }}
                      >
                        {type}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 14,
                          fontWeight: 700,
                          color,
                        }}
                      >
                        {counts[type]}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: 10, color: "#666", lineHeight: 1.4 }}
                    >
                      {desc}
                    </div>
                  </div>
                ))}
              </div>

              {/* Composition bar */}
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "#666",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Team composition
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 6,
                    borderRadius: 3,
                    overflow: "hidden",
                    gap: 1,
                  }}
                >
                  {Object.entries(types).map(
                    ([type, { color }]) =>
                      counts[type] > 0 && (
                        <div
                          key={type}
                          style={{
                            flex: counts[type],
                            background: color,
                            borderRadius: 2,
                          }}
                        />
                      ),
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {Object.entries(types).map(([type, { color }]) => (
                    <span
                      key={type}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        color: "#666",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: color,
                        }}
                      />
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              {team.some((a) => !a.business_chemistry) && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#555",
                    marginTop: 8,
                    fontStyle: "italic",
                  }}
                >
                  {team.filter((a) => !a.business_chemistry).length} team
                  member(s) have no chemistry type assigned.
                </div>
              )}
              {/* Generate chemistry analysis button */}
              <button
                onClick={
                  chemistryReport
                    ? () => setChemistryReport(null)
                    : handleGenerateChemistry
                }
                disabled={generatingChemistry}
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: generatingChemistry ? "#1a1a1a" : "#1e2a14",
                  border: "1px solid #86BC25",
                  borderRadius: 6,
                  padding: "7px 0",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#86BC25",
                  cursor: generatingChemistry ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: generatingChemistry ? 0.6 : 1,
                }}
              >
                {generatingChemistry
                  ? "Analysing team dynamics…"
                  : chemistryReport
                    ? "Hide team dynamics ▲"
                    : "Generate team dynamics ▼"}
              </button>

              {/* Chemistry AI result */}
              {chemistryReport && chemistryReport.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    borderTop: "1px solid #222",
                    paddingTop: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: "#666",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    Team Dynamics Analysis
                  </div>
                  {chemistryReport.map((point, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 11,
                        color: "#aaaaaa",
                        lineHeight: 1.6,
                        marginBottom: 6,
                        paddingLeft: 8,
                        borderLeft: "2px solid #86BC25",
                      }}
                    >
                      {point}
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {team.map((member) => {
          const score = scoreOutOfTen(member.match_score);
          return (
            <section
              className="card"
              key={member.employee_id}
              onClick={() =>
                setSelectedMember({ employee: member, roleId: member.role_id })
              }
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedMember({
                    employee: member,
                    roleId: member.role_id,
                  });
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <div className="card-head">
                <div className="card-title">
                  {member.name || member.employee_name}
                </div>
                <span className={scoreBadgeClass(score)}>{score}/10</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 5,
                  color: "var(--muted2)",
                  fontSize: 12,
                }}
              >
                <div>{member.title}</div>
                <div>{member.role_level}</div>
                <div>{member.location}</div>
                <div>
                  <span
                    className={`badge ${member.available ? "badge-green" : "badge-red"}`}
                  >
                    {member.available ? "Available" : "Unavailable"}
                  </span>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
