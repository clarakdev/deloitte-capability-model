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
  junior: ["Analyst", "Consultant", "Senior Consultant"],
  management: ["Manager", "Senior Manager", "Director"],
  partner: ["Partner"],
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
                  // Keep backend memory in sync with each role's saved
                  // capabilities so the team report reflects the PM's chosen
                  // skill set rather than a fresh auto-inferred one.
                  const savedCaps = await getSavedCapabilities(assignment.role_id);
                  if (savedCaps && savedCaps.length > 0) {
                    await loadCapabilities(assignment.role_id, savedCaps);
                  } else {
                    await inferCapabilities(assignment.role_id, roleTitle, roleDescription);
                  }
                } catch (inferenceError) {
                  console.warn("Could not load role capabilities:", inferenceError);
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
    team.reduce((total, member) => total + scoreOutOfTen(member.match_score), 0) /
    team.length;
  const seniorityCounts = team.reduce(
    (counts, member) => {
      const group = seniorityGroup(member.role_level);
      if (group) counts[group] += 1;
      return counts;
    },
    { junior: 0, management: 0, partner: 0 },
  );
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

      <section className="card">
        <div className="card-head">
          <div className="card-title">Team Capability Match</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 20, color: "var(--green)" }}>{averageMatch.toFixed(1)}/10</strong>
            <span style={{ color: "var(--muted2)", fontSize: 11 }}>average role fit</span>
            <span className="badge badge-blue">AI match</span>
          </div>
        </div>
        <RadarChart
          items={radarItems}
          ariaLabel="Employee-role fit radar chart"
          hint="Hover to highlight · click to open a team member"
          onItemClick={(item) => setSelectedMember({ employee: item.member, roleId: item.member.role_id })}
        />
      </section>

      <div>
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
          const score = scoreOutOfTen(member.match_score);
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
                <span className={scoreBadgeClass(score)}>{score}/10</span>
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