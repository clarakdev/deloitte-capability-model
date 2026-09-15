import { useEffect, useState } from "react";
import { getCandidateFit } from "../api/api";

function scoreOutOfFive(score) {
  return Math.ceil(Math.max(0, Math.min(1, Number(score) || 0)) * 5);
}

function simColor(similarity, isGap) {
  if (isGap) return "#e05252";
  if (similarity >= 0.85) return "#86BC25";
  return "#5b9bd5";
}

function RatingDots({ score }) {
  const filledDots = scoreOutOfFive(score);

  return (
    <div style={{ display: "flex", gap: 3 }} aria-label={`${filledDots} out of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          style={{
            width: 7,
            height: 7,
            borderRadius: 2,
            background: dot <= filledDots ? "var(--green)" : "#222",
          }}
        />
      ))}
    </div>
  );
}

export default function TeamMemberDetail({ employee, roleId, onBack, initialNote, onSaveNote }) {
  const [fitData, setFitData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noteText, setNoteText] = useState(initialNote || "");
  const [noteStatus, setNoteStatus] = useState("idle");

  useEffect(() => {
    async function loadFit() {
      setLoading(true);
      setError(null);

      try {
        const fit = await getCandidateFit(roleId, employee.employee_id);
        setFitData(fit || []);
      } catch (loadError) {
        console.error("Capability fit error:", loadError);
        setError("Could not load capability fit. Is the backend running?");
      } finally {
        setLoading(false);
      }
    }

    if (roleId && employee?.employee_id) loadFit();
  }, [roleId, employee?.employee_id]);

  function handleSaveNote() {
    onSaveNote(noteText);
    setNoteStatus("saved");
    setTimeout(() => setNoteStatus("idle"), 2000);
  }

  if (loading) return <div className="loading">Loading capability fit...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="page">
      <button className="btn-secondary" type="button" onClick={onBack} style={{ marginBottom: 18 }}>
        ← Back to team report
      </button>

      <div className="page-title">{employee.name || employee.employee_name}</div>
      <div className="page-sub">
        {[employee.title, employee.business_unit, employee.location].filter(Boolean).join(" · ")}
      </div>

      <section className="card">
        <div className="card-head">
          <div className="card-title">Capability Breakdown</div>
          <span className="badge badge-green">{fitData.length} capabilities</span>
        </div>

        {fitData.length === 0 ? (
          <div style={{ color: "var(--muted2)", fontSize: 12 }}>No capability fit data available.</div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {fitData.map((fit, index) => {
              const similarity = Number(fit.similarity) || 0;
              const color = simColor(similarity, fit.is_gap);
              return (
                <div
                  key={fit.cap_id || `${fit.cap_name}-${index}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 14,
                    alignItems: "center",
                    padding: "11px 0",
                    borderBottom: index < fitData.length - 1 ? "1px solid #1a1a1a" : "none",
                    borderLeft: fit.is_gap ? "3px solid #e05252" : "3px solid transparent",
                    paddingLeft: 8,
                  }}
                >
                  <div>
                    <div style={{ color: "#d0d0d0", fontSize: 12, fontWeight: 600 }}>
                      {fit.cap_name || fit.name}
                    </div>
                    {fit.is_gap && <div style={{ color: "#e05252", fontSize: 10, marginTop: 3 }}>Gap — upskilling needed</div>}
                  </div>
                  <RatingDots score={similarity} />
                  <span style={{ color, fontSize: 12, fontWeight: 700 }}>{scoreOutOfFive(similarity)}/5</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" style={{ borderLeft: "3px solid var(--green)" }}>
        <div className="card-head">
          <div className="card-title">RM Assessment</div>
          <span className="badge badge-green">RM</span>
        </div>
        <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
          Additional context for this match
          <textarea rows="5" value={noteText} onChange={(event) => setNoteText(event.target.value)} />
        </label>
        <button
          className="btn-primary"
          type="button"
          onClick={handleSaveNote}
          style={{ marginTop: 10, opacity: noteStatus === "saved" ? 0.7 : 1 }}
        >
          {noteStatus === "saved" ? "Saved ✓" : "Save note"}
        </button>
      </section>
    </div>
  );
}
