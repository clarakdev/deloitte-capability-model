// Frame4.jsx — Gap analysis screen (Step 4 of 4).
//
// Handles two entry points:
//   1. viewSavedAssignment=true — came from "View analysis" in Frame 1
//      loads the saved employee from Supabase assignments table
//   2. New matching flow — empId set from Frame 3 candidate selection
//      saves the assignment to Supabase

import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "../supabase";
import {
  getCandidateFit,
  getCandidates,
  getEmployeeById,
  getAssignment,
  saveAssignment,
  requestLLMReport,
  inferCapabilities,
} from "../api/api";

function simColor(sim, isGap) {
  if (isGap) return "#e05252";
  if (sim >= 0.85) return "#86BC25";
  return "#5b9bd5";
}

function scoreOutOfFive(score) {
  return Math.ceil(Math.max(0, Math.min(1, score)) * 5);
}

function WeightDots({ weight }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 2,
            background: i <= weight ? "#86BC25" : "#222",
          }}
        />
      ))}
    </div>
  );
}

function ComparisonPanel({ employee, fitData, roleId, projectId }) {
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState("idle");
  const [showReport, setShowReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");

  const gapCount = fitData.filter((f) => f.is_gap).length;
  const coveredCount = fitData.filter((f) => !f.is_gap).length;

  const avgSimilarity = fitData.length
    ? fitData.reduce((sum, f) => sum + f.similarity, 0) / fitData.length
    : 0;

  async function handleGenerateReport() {
    if (reportStatus === "loading") return;

    if (reportStatus === "done" || reportStatus === "error") {
      setShowReport((current) => !current);
      return;
    }

    setReportStatus("loading");
    setShowReport(true);

    try {
      const data = await requestLLMReport(roleId, employee.employee_id);
      setReport(data);
      setReportStatus("done");
    } catch (err) {
      const msg = err?.message?.includes("503")
        ? "AI report unavailable — check OPENROUTER_API_KEY."
        : "Could not generate AI report.";

      setReport({ error: msg });
      setReportStatus("error");
    }
  }

  async function handleSave() {
    if (!employee || !projectId || saving) return;

    const confirmed = window.confirm(
      `Save ${employee.name} as the selected candidate for this role?`,
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      await saveAssignment(roleId, projectId, employee);
      setSaveStatus("saved");
    } catch (error) {
      console.error("Failed to save assignment:", error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minWidth: 0 }}>
      {/* Employee summary */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              flexShrink: 0,
              background: "#1e2a14",
              color: "#86BC25",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {employee.name
              .split(" ")
              .map((name) => name[0])
              .join("")
              .slice(0, 2)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#d0d0d0",
              }}
            >
              {employee.name}
            </div>

            <div
              style={{
                fontSize: 11,
                color: "#999",
                marginTop: 2,
              }}
            >
              {[employee.title, employee.business_unit, employee.location]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#86BC25",
              }}
            >
              {scoreOutOfFive(employee.match_score)}/5
            </div>

            <div style={{ fontSize: 10, color: "#999" }}>overall match</div>
          </div>
        </div>
      </div>

      {/* AI report */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={handleGenerateReport}
          disabled={reportStatus === "loading"}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "6px 14px",
            borderRadius: 7,
            cursor: "pointer",
            fontFamily: "inherit",
            border: `1px solid ${
              reportStatus === "done" ? "#86BC25" : "#2a2a2a"
            }`,
            background: reportStatus === "done" ? "#1e2a14" : "transparent",
            color: reportStatus === "done" ? "#86BC25" : "#888",
          }}
        >
          {reportStatus === "loading"
            ? "Generating AI report…"
            : reportStatus === "done"
              ? showReport
                ? "Hide AI report ▲"
                : "Show AI report ▼"
              : "Generate AI fit report"}
        </button>

        {showReport && reportStatus !== "idle" && (
          <div
            style={{
              marginTop: 8,
              padding: "14px 16px",
              background: "#0f0f0f",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              textAlign: "left",
            }}
          >
            {reportStatus === "loading" && (
              <div style={{ fontSize: 11, color: "#888" }}>
                Generating AI report…
              </div>
            )}

            {reportStatus === "error" && (
              <div style={{ fontSize: 11, color: "#e05252" }}>
                {report?.error}
              </div>
            )}

            {reportStatus === "done" && (
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: "#c0c0c0",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {report.report}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {[
          { num: `${scoreOutOfFive(avgSimilarity)}/5`, label: "Avg fit" },
          { num: coveredCount, label: "Skills covered" },
          { num: gapCount, label: "Gaps to address" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "#111",
              borderRadius: 8,
              padding: 14,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color:
                  s.label === "Gaps to address" && gapCount > 0
                    ? "#e05252"
                    : "#e8e8e8",
              }}
            >
              {s.num}
            </div>

            <div
              style={{
                fontSize: 10,
                color: "#aaaaaa",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginTop: 3,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Capability breakdown */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Capability breakdown</span>

          <span className="badge badge-green">
            {fitData.length} capabilities
          </span>
        </div>

        {/* Same 4-column structure as solo Gap Analysis */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 54px minmax(90px, 120px) 70px",
            gap: 8,
            fontSize: 10,
            fontWeight: 600,
            color: "#aaaaaa",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            paddingBottom: 8,
            borderBottom: "1px solid #1e1e1e",
          }}
        >
          <span>Capability</span>
          <span style={{ textAlign: "center" }}>Weight</span>
          <span>Closest skill</span>
          <span style={{ textAlign: "right" }}>Fit (1–5)</span>
        </div>

        {fitData.map((f, i) => {
          const barColor = simColor(f.similarity, f.is_gap);

          return (
            <div
              key={f.cap_id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1fr) 54px minmax(90px, 120px) 70px",
                gap: 8,
                alignItems: "center",
                padding: "10px 0",
                borderBottom:
                  i < fitData.length - 1 ? "1px solid #1a1a1a" : "none",
                borderLeft: f.is_gap
                  ? "3px solid #e05252"
                  : "3px solid transparent",
                paddingLeft: 8,
              }}
            >
              {/* Capability */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#d0d0d0",
                  }}
                >
                  {f.cap_name}
                </div>

                {f.is_gap && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#e05252",
                      marginTop: 2,
                    }}
                  >
                    Gap — upskilling needed
                  </div>
                )}
              </div>

              {/* Weight */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <WeightDots weight={f.weight} />
              </div>

              {/* Closest skill */}
              <div
                title={f.best_match_skill || "No match found"}
                style={{
                  fontSize: 11,
                  color: f.best_match_skill ? "#888" : "#444",
                  fontStyle: f.best_match_skill ? "normal" : "italic",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {f.best_match_skill || "No match found"}
              </div>

              {/* Fit */}
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: barColor,
                    marginBottom: 4,
                  }}
                >
                  {scoreOutOfFive(f.similarity)}/5
                </div>

                <div
                  style={{
                    height: 3,
                    background: "#1f1f1f",
                    borderRadius: 2,
                  }}
                >
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      width: `${Math.round(f.similarity * 100)}%`,
                      background: barColor,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 14,
          width: "100%",
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving
          ? "Saving..."
          : saveStatus === "saved"
            ? "Saved ✓"
            : saveStatus === "error"
              ? "Try save again"
              : `Save ${employee.name}`}
      </button>
    </div>
  );
}

export default function Frame4({
  roleId,
  projectId,
  empId,
  selectedEmployee,
  selectedEmployees = [],
  viewSavedAssignment,
  selectedRole,
  onBack,
  onBackToRoles,
}) {
  const [fitData, setFitData] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [comparisonData, setComparisonData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState("idle");
  const [showReport, setShowReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [existingAssignment, setExistingAssignment] = useState(null);
  const exportRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const isComparisonMode =
    !viewSavedAssignment && selectedEmployees.length === 2;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Step 1 — load role from Supabase to get title and description
        // needed to re-infer capabilities if backend was restarted
        let roleTitle = selectedRole?.title || "";
        let roleDescription = selectedRole?.description || "";

        if (!roleTitle && roleId) {
          const { data } = await supabase
            .from("roles")
            .select("title, description")
            .eq("id", roleId)
            .single();
          if (data) {
            roleTitle = data.title;
            roleDescription = data.description;
          }
        }

        // Step 2 — re-infer capabilities into FastAPI memory
        if (roleTitle) {
          try {
            await inferCapabilities(roleId, roleTitle, roleDescription);
          } catch (e) {
            console.warn("Could not re-infer capabilities:", e);
          }
        }

        // Step 3 — load candidates and resolve employee
        let resolvedEmpId = empId;
        let resolvedEmployee = null;

        const candidates = await getCandidates(roleId, false, false);

        if (isComparisonMode) {
          const results = await Promise.all(
            selectedEmployees.map(async (selected) => {
              const resolvedEmployee =
                candidates.find(
                  (candidate) => candidate.employee_id === selected.employee_id,
                ) || selected;

              const fit = await getCandidateFit(
                roleId,
                resolvedEmployee.employee_id,
              );

              return {
                employee: resolvedEmployee,
                fitData: fit,
              };
            }),
          );

          setComparisonData(results);
          return;
        }

        if (candidates.length === 0) {
          setError("No candidates found for this role.");
          return;
        }

        if (viewSavedAssignment) {
          const savedAssignment = await getAssignment(roleId);
          if (!savedAssignment) {
            setError("No saved assignment found for this role.");
            return;
          }
          resolvedEmpId = savedAssignment.employee_id;
          resolvedEmployee = candidates.find(
            (c) => c.employee_id === resolvedEmpId,
          ) || {
            employee_id: savedAssignment.employee_id,
            name: savedAssignment.employee_name,
            match_score: savedAssignment.match_score,
            title: "",
            business_unit: "",
            location: "",
          };
        } else if (resolvedEmpId) {
          // Preserve the candidate selected in Frame 3,
          // including its role-specific match_score.
          resolvedEmployee =
            selectedEmployee ||
            candidates.find((c) => c.employee_id === resolvedEmpId) ||
            null;

          if (!resolvedEmployee) {
            resolvedEmployee = await getEmployeeById(resolvedEmpId);
          }
        } else {
          setError("No employee was selected.");
          return;
        }
        if (!viewSavedAssignment) {
          try {
            const saved = await getAssignment(roleId);
            setExistingAssignment(saved);
          } catch (e) {
            console.warn("Could not check existing assignment:", e);
            setExistingAssignment(null);
          }
        }

        setEmployee(resolvedEmployee);
        const fit = await getCandidateFit(roleId, resolvedEmpId);
        setFitData(fit);
      } catch (e) {
        console.error("Gap analysis error:", e);
        setError("Could not load gap analysis. Is the backend running?");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [
    roleId,
    empId,
    projectId,
    viewSavedAssignment,
    selectedEmployee,
    selectedEmployees,
    isComparisonMode,
  ]);

  async function handleGenerateReport() {
    if (reportStatus === "loading") return;
    if (reportStatus === "done" || reportStatus === "error") {
      setShowReport((p) => !p);
      return;
    }
    setReportStatus("loading");
    setShowReport(true);
    try {
      const data = await requestLLMReport(roleId, employee?.employee_id);
      setReport(data);
      setReportStatus("done");
    } catch (err) {
      const msg = err?.message?.includes("503")
        ? "AI report unavailable — check OPENROUTER_API_KEY. Deterministic matching still works."
        : "Could not generate AI report. Is the backend running?";
      setReport({ error: msg });
      setReportStatus("error");
    }
  }

  async function handleSaveAssignment() {
    if (!employee || !projectId || saving) return;

    const isReplacing =
      existingAssignment &&
      existingAssignment.employee_id !== employee.employee_id;

    if (isReplacing) {
      const confirmed = window.confirm(
        `${existingAssignment.employee_name || "Another employee"} is already saved for this role.\n\n` +
          `Do you want to replace the saved assignment with ${employee.name}?`,
      );

      if (!confirmed) return;
    }

    setSaving(true);
    setSaveStatus("idle");

    try {
      await saveAssignment(roleId, projectId, employee);
      setExistingAssignment({
        employee_id: employee.employee_id,
        employee_name: employee.name,
        match_score: employee.match_score,
      });
      setSaveStatus("saved");
    } catch (e) {
      console.error("Failed to save assignment:", e);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportReport() {
    if (!exportRef.current || exporting) return;

    setExporting(true);

    try {
      // Wait for the IBM Plex Sans web font to finish loading.
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: "#0a0a0a",
        useCORS: true,
        logging: false,

        // Hide all controls marked with pdf-hide in the copied document.
        onclone: (clonedDocument) => {
          clonedDocument.querySelectorAll(".pdf-hide").forEach((element) => {
            element.style.display = "none";
          });

          const clonedPage = clonedDocument.querySelector(".pdf-snapshot");

          if (clonedPage) {
            clonedPage.style.background = "#0a0a0a";
            clonedPage.style.paddingBottom = "24px";
          }
        },
      });

      const imageData = canvas.toDataURL("image/png", 1.0);

      // Keep the report on one PDF page with the same proportions
      // as the captured screen content.
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: pdfHeight > pdfWidth ? "portrait" : "landscape",
        unit: "mm",
        format: [pdfWidth, pdfHeight],
        compress: true,
      });

      pdf.addImage(imageData, "PNG", 0, 0, pdfWidth, pdfHeight);

      const employeeName = employee?.name
        ? employee.name
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-zA-Z0-9-]/g, "")
        : "Employee";

      pdf.save(`Gap-Analysis-${employeeName}.pdf`);
    } catch (error) {
      console.error("Failed to export gap analysis:", error);
      window.alert("Could not export the gap analysis. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <div className="loading">Running gap analysis…</div>;
  if (error) return <div className="error">{error}</div>;

  if (isComparisonMode) {
    return (
      <div className="page" style={{ maxWidth: 1100 }}>
        <div className="page-title">Gap analysis</div>

        <div className="page-sub">
          Candidate comparison · per-capability fit breakdown
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 18,
            alignItems: "start",
            marginTop: 24,
          }}
        >
          {comparisonData.map(({ employee, fitData }) => (
            <ComparisonPanel
              key={employee.employee_id}
              employee={employee}
              fitData={fitData}
              roleId={roleId}
              projectId={projectId}
            />
          ))}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginTop: 18,
            marginBottom: 20,
            fontSize: 11,
            color: "#555",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "#86BC25",
              }}
            />
            Strong match (≥85%)
          </span>

          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "#5b9bd5",
              }}
            />
            Adequate (60–84%)
          </span>

          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "#e05252",
              }}
            />
            Gap (&lt;60%)
          </span>
        </div>

        {/* Navigation */}
        <div className="actions">
          <button className="btn-secondary" onClick={onBack}>
            ← Back
          </button>

          {onBackToRoles && (
            <button className="btn-primary" onClick={onBackToRoles}>
              Next role →
            </button>
          )}
        </div>
      </div>
    );
  }

  const gapCount = fitData.filter((f) => f.is_gap).length;
  const coveredCount = fitData.filter((f) => !f.is_gap).length;
  const avgSimilarity = fitData.length
    ? fitData.reduce((s, f) => s + f.similarity, 0) / fitData.length
    : 0;

  return (
    <div ref={exportRef} className="page pdf-snapshot">
      <div className="page-title">Gap analysis</div>
      <div className="page-sub">
        {viewSavedAssignment ? "Saved assignment" : "Selected candidate"} ·
        per-capability fit breakdown
      </div>

      {/* Employee summary card */}
      {employee && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                flexShrink: 0,
                background: "#1e2a14",
                color: "#86BC25",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {employee.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#d0d0d0" }}>
                {employee.name}
              </div>
              <div style={{ fontSize: 11, color: "#999999", marginTop: 2 }}>
                {[employee.title, employee.business_unit, employee.location]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#86BC25" }}>
                {scoreOutOfFive(employee.match_score)}/5
              </div>
              <div style={{ fontSize: 10, color: "#999999" }}>
                overall match
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Generate AI fit report button */}
      {!loading && employee && (
        <div className="pdf-hide" style={{ marginBottom: 14 }}>
          <button
            onClick={handleGenerateReport}
            disabled={reportStatus === "loading"}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: 7,
              cursor: "pointer",
              fontFamily: "inherit",
              border: `1px solid ${reportStatus === "done" ? "#86BC25" : "#2a2a2a"}`,
              background: reportStatus === "done" ? "#1e2a14" : "transparent",
              color: reportStatus === "done" ? "#86BC25" : "#888888",
              opacity: reportStatus === "loading" ? 0.5 : 1,
            }}
          >
            {reportStatus === "loading"
              ? "Generating AI report…"
              : reportStatus === "done"
                ? showReport
                  ? "Hide AI report ▲"
                  : "Show AI report ▼"
                : reportStatus === "error"
                  ? "AI report — retry"
                  : "Generate AI fit report"}
          </button>

          {/* Inline report panel */}
          {showReport && reportStatus !== "idle" && (
            <div
              style={{
                marginTop: 8,
                padding: "14px 16px",
                background: "#0f0f0f",
                border: "1px solid #2a2a2a",
                borderRadius: 8,
              }}
            >
              {reportStatus === "loading" && (
                <div style={{ fontSize: 12, color: "#888" }}>
                  Generating AI report…
                </div>
              )}
              {reportStatus === "error" && (
                <div style={{ fontSize: 12, color: "#e05252" }}>
                  {report?.error}
                </div>
              )}
              {reportStatus === "done" && (
                <>
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "#c0c0c0",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {report.report}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {[
          { num: `${scoreOutOfFive(avgSimilarity)}/5`, label: "Avg fit" },
          { num: coveredCount, label: "Skills covered" },
          { num: gapCount, label: "Gaps to address" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "#111",
              borderRadius: 8,
              padding: 14,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color:
                  s.label === "Gaps to address" && gapCount > 0
                    ? "#e05252"
                    : "#e8e8e8",
              }}
            >
              {s.num}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#aaaaaa",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginTop: 3,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Per-capability breakdown */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Capability breakdown</span>
          <span className="badge badge-green">
            {fitData.length} capabilities
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60px 120px 80px",
            gap: 8,
            fontSize: 10,
            fontWeight: 600,
            color: "#aaaaaa",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            paddingBottom: 8,
            borderBottom: "1px solid #1e1e1e",
          }}
        >
          <span>Capability</span>
          <span style={{ textAlign: "center" }}>Weight</span>
          <span>Closest skill</span>
          <span style={{ textAlign: "right" }}>Fit (1–5)</span>
        </div>

        {fitData.map((f, i) => {
          const barColor = simColor(f.similarity, f.is_gap);
          return (
            <div
              key={f.cap_id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 120px 80px",
                gap: 8,
                alignItems: "center",
                padding: "10px 0",
                borderBottom:
                  i < fitData.length - 1 ? "1px solid #1a1a1a" : "none",
                borderLeft: f.is_gap
                  ? "3px solid #e05252"
                  : "3px solid transparent",
                paddingLeft: 8,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 12, fontWeight: 600, color: "#d0d0d0" }}
                >
                  {f.cap_name}
                </div>
                {f.is_gap && (
                  <div style={{ fontSize: 10, color: "#e05252", marginTop: 2 }}>
                    Gap — upskilling needed
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <WeightDots weight={f.weight} />
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: f.best_match_skill ? "#888" : "#444",
                  fontStyle: f.best_match_skill ? "normal" : "italic",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.best_match_skill || "No match found"}
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: barColor,
                    marginBottom: 4,
                  }}
                >
                  {scoreOutOfFive(f.similarity)}/5
                </div>
                <div
                  style={{ height: 3, background: "#1f1f1f", borderRadius: 2 }}
                >
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      width: `${Math.round(f.similarity * 100)}%`,
                      background: barColor,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 20,
          fontSize: 11,
          color: "#555",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#86BC25",
            }}
          />
          Strong match (≥85%)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#5b9bd5",
            }}
          />
          Adequate (60–84%)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#e05252",
            }}
          />
          Gap (&lt;60%)
        </span>
      </div>

      {/* Navigation */}
      <div className="actions pdf-hide">
        {/* Only show during a new matching / redo matching */}
        {!viewSavedAssignment && (
          <button className="btn-secondary" onClick={onBack}>
            ← Back
          </button>
        )}

        {/* Only show during a new matching / redo matching */}
        {!viewSavedAssignment && (
          <button
            className="btn-primary"
            onClick={handleSaveAssignment}
            disabled={saving || !employee}
            style={{
              opacity: saving || !employee ? 0.5 : 1,
              cursor: saving || !employee ? "default" : "pointer",
            }}
          >
            {saving ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : "Save"}
          </button>
        )}

        {onBackToRoles && (
          <button className="btn-primary" onClick={onBackToRoles}>
            Next role →
          </button>
        )}

        {/*
        <button
          className="btn-primary"
          onClick={handleExportReport}
          disabled={exporting}
          style={{
            opacity: exporting ? 0.5 : 1,
            cursor: exporting ? "default" : "pointer",
          }}
        >
          {exporting ? "Exporting..." : "Export report"}
        </button>
        */}
      </div>
    </div>
  );
}
