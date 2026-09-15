import { useEffect, useState } from "react";
import {
  generateTeamReport,
  getCandidates,
  getAllProjects,
  getProjectAssignments,
  getRoles,
  getSavedCapabilities,
  inferCapabilities,
} from "../api/api";
import { supabase } from "../supabase";
import TeamMemberDetail from "./TeamMemberDetail";

const ROLE_LEVEL_GROUPS = {
  junior: ["Analyst", "Consultant", "Senior Consultant"],
  management: ["Manager", "Senior Manager", "Director"],
  partner: ["Partner"],
};

const RADAR_AXES = [
  "Business Analysis",
  "Stakeholder Management",
  "Technical Delivery",
  "Leadership",
  "Communication",
];

function scoreOutOfFive(score) {
  return Math.round(Math.max(0, Math.min(1, Number(score) || 0)) * 5);
}

function scoreBadgeClass(score) {
  if (score >= 4) return "badge badge-green";
  if (score === 3) return "badge badge-amber";
  return "badge badge-red";
}

function seniorityGroup(roleLevel) {
  if (ROLE_LEVEL_GROUPS.junior.includes(roleLevel)) return "junior";
  if (ROLE_LEVEL_GROUPS.management.includes(roleLevel)) return "management";
  if (ROLE_LEVEL_GROUPS.partner.includes(roleLevel)) return "partner";
  return null;
}

export default function TeamReportPage({ projectId, onBackToDashboard }) {
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

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      setError(null);

      try {
        const [assignments, projects] = await Promise.all([
          getProjectAssignments(projectId),
          getAllProjects(),
        ]);

        const projectRecord = (projects || []).find((item) => item.id === projectId);
        setProject(projectRecord || null);
        setProjectName(projectRecord?.name || "Project Report");

        const resolvedTeam = (
          await Promise.all(
            (assignments || []).map(async (assignment) => {
              let roleTitle = "";
              let roleDescription = "";

              const { data: role } = await supabase
                .from("roles")
                .select("title, description")
                .eq("id", assignment.role_id)
                .single();

              if (role) {
                roleTitle = role.title || "";
                roleDescription = role.description || "";
              }

              if (roleTitle) {
                try {
                  await inferCapabilities(assignment.role_id, roleTitle, roleDescription);
                } catch (inferenceError) {
                  console.warn("Could not re-infer capabilities:", inferenceError);
                }
              }

              const candidates = await getCandidates(assignment.role_id, false, false);
              const employee = (candidates || []).find(
                (candidate) => candidate.employee_id === assignment.employee_id,
              );

              if (!employee) return null;

              return {
                ...employee,
                role_id: assignment.role_id,
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
        (assignments || []).map((assignment) => [assignment.role_id, assignment]),
      );
      const rolesForReport = await Promise.all(
        (roles || []).map(async (role) => {
          const capabilities = await getSavedCapabilities(role.id);
          const assignment = assignmentsByRole.get(role.id);

          if (!assignment?.employee_id || assignment.match_score === undefined || assignment.match_score === null) {
            throw new Error(`Missing saved assignment data for role ${role.id}.`);
          }

          return {
            id: role.id,
            title: role.title,
            description: role.description || "",
            assignment: {
              employee_id: assignment.employee_id,
              employee_name: assignment.employee_name || "",
              match_score: assignment.match_score,
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
        roles: rolesForReport,
        worked_together_score: workedTogether === "" ? null : Number(workedTogether),
        rm_notes: rmNotes,
      };
      const blob = await generateTeamReport(projectId, payload);
      const filename = `${(project?.name || projectName || "Project")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "") || "Project"}-Team-Report.docx`;
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
    team.reduce((total, member) => total + scoreOutOfFive(member.match_score), 0) /
    team.length;
  const seniorityCounts = team.reduce(
    (counts, member) => {
      const group = seniorityGroup(member.role_level);
      if (group) counts[group] += 1;
      return counts;
    },
    { junior: 0, management: 0, partner: 0 },
  );
  const radarValue = Math.max(0.1, Math.min(1, averageMatch / 5));
  const radarCenter = 110;
  const radarRadius = 72;
  const radarPoint = (index, value) => {
    const angle = (Math.PI * 2 * index) / RADAR_AXES.length - Math.PI / 2;
    return {
      x: radarCenter + Math.cos(angle) * radarRadius * value,
      y: radarCenter + Math.sin(angle) * radarRadius * value,
    };
  };
  const radarPolygon = RADAR_AXES.map((_, index) => {
    const point = radarPoint(index, radarValue);
    return `${point.x},${point.y}`;
  }).join(" ");

  return (
    <div className="page">
      <div className="card-head">
        <div>
          <div className="page-title">Team Capability Report</div>
          <div className="page-sub">{projectName}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBackToDashboard && (
            <button className="btn-secondary" type="button" onClick={onBackToDashboard}>Back to Dashboard</button>
          )}
          <button
            className="btn-primary"
            type="button"
            onClick={handleGenerateReport}
            disabled={reportLoading || team.length === 0}
            style={{
              opacity: reportLoading || team.length === 0 ? 0.5 : 1,
              cursor: reportLoading || team.length === 0 ? "default" : "pointer",
            }}
          >
            {reportLoading ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>
      {reportError && <div className="error" style={{ padding: "0 0 14px" }}>{reportError}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        <section className="card">
          <div className="card-head">
            <div className="card-title">Team Capability Match</div>
            <span className="badge badge-blue">AI match</span>
          </div>
          {/* This basic chart can be replaced with a teammate's more polished chart component later. */}
          <div aria-label="Team capability radar chart" style={{ minHeight: 230, display: "grid", placeItems: "center", border: "1px dashed var(--border)", marginBottom: 16 }}>
            <svg viewBox="0 0 220 220" role="img" aria-label="Average team capability radar chart" style={{ width: "100%", maxWidth: 250, height: 220 }}>
              {[0.33, 0.66, 1].map((scale) => (
                <polygon
                  key={scale}
                  points={RADAR_AXES.map((_, index) => {
                    const point = radarPoint(index, scale);
                    return `${point.x},${point.y}`;
                  }).join(" ")}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              ))}
              {RADAR_AXES.map((axis, index) => {
                const end = radarPoint(index, 1);
                const label = radarPoint(index, 1.18);
                return (
                  <g key={axis}>
                    <line x1={radarCenter} y1={radarCenter} x2={end.x} y2={end.y} stroke="var(--border)" strokeWidth="1" />
                    <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="var(--muted2)" fontSize="7">{axis}</text>
                  </g>
                );
              })}
              <polygon points={radarPolygon} fill="var(--green-dim)" stroke="var(--green)" strokeWidth="2" />
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 28, color: "var(--green)" }}>{averageMatch.toFixed(1)}/5</strong>
            <span style={{ color: "var(--muted2)", fontSize: 12 }}>average match</span>
          </div>
        </section>

        <section className="card" style={{ borderLeft: "3px solid var(--green)" }}>
          <div className="card-head">
            <div className="card-title">Team Composition — RM Assessment</div>
            <span className="badge badge-green">RM</span>
          </div>
          <div style={{ display: "grid", gap: 10, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Senior Consultant &amp; below</span><strong>{seniorityCounts.junior}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Manager–Director</span><strong>{seniorityCounts.management}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Partner</span><strong>{seniorityCounts.partner}</strong></div>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span>Worked together before</span>
              <input type="number" min="1" max="5" step="1" value={workedTogether} onChange={(event) => setWorkedTogether(event.target.value)} placeholder="1-5" style={{ width: 58 }} />
            </label>
            <label style={{ display: "grid", gap: 6, marginTop: 4 }}>
              Additional notes (personality fit, working style, risks)
              <textarea rows="3" value={rmNotes} onChange={(event) => setRmNotes(event.target.value)} />
            </label>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><div className="card-title">Executive Summary</div></div>
        {[
          ["Overall Team Suitability", "Placeholder: replace with the overall suitability assessment."],
          ["Key Strengths", "Placeholder: summarize the team's strongest capabilities."],
          ["Key Risks", "Placeholder: note material delivery, coverage, or collaboration risks."],
          ["Priority Capability Gaps", "Placeholder: identify the capability gaps requiring attention."],
          ["Management Judgement", "Placeholder: add the RM's considered judgement."],
          ["Recommended Actions", "Placeholder: list recommended management actions."],
        ].map(([heading, text]) => (
          <div key={heading} style={{ marginBottom: 12 }}>
            <div style={{ color: "var(--text)", fontSize: 12, fontWeight: 600 }}>{heading}</div>
            <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>{text}</div>
          </div>
        ))}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {team.map((member) => {
          const score = scoreOutOfFive(member.match_score);
          return (
            <section
              className="card"
              key={member.employee_id}
              onClick={() => setSelectedMember({ employee: member, roleId: member.role_id })}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedMember({ employee: member, roleId: member.role_id });
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <div className="card-head">
                <div className="card-title">{member.name || member.employee_name}</div>
                <span className={scoreBadgeClass(score)}>{score}/5</span>
              </div>
              <div style={{ display: "grid", gap: 5, color: "var(--muted2)", fontSize: 12 }}>
                <div>{member.title}</div>
                <div>{member.role_level}</div>
                <div>{member.location}</div>
                <div><span className={`badge ${member.available ? "badge-green" : "badge-red"}`}>{member.available ? "Available" : "Unavailable"}</span></div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}