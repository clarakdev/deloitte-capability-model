// Frame3.jsx — Candidate selection screen (Step 3 of 4). Hands-on mode only.

import { useEffect, useState } from "react";
import { getCandidates, requestLLMReport } from "../api/api";

function getInitials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "#1e2a14", color: "#86BC25" },
  { bg: "#0d1f33", color: "#5b9bd5" },
  { bg: "#1c0d33", color: "#9b6dd4" },
  { bg: "#2a1800", color: "#d4922a" },
  { bg: "#2a0d0d", color: "#e05252" },
  { bg: "#082020", color: "#1D9E75" },
];

function avatarColor(empId) {
  const n = parseInt(empId.replace(/\D/g, ""), 10) || 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function scoreColor(score) {
  if (score >= 0.85) return { bg: "#1e2a14", color: "#86BC25" };
  if (score >= 0.7) return { bg: "#0d1f33", color: "#5b9bd5" };
  return { bg: "#2a1e0a", color: "#d4922a" };
}

export default function Frame3({
  roleId,
  projectId,
  projectStartDate,
  onBack,
  onNext,
}) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [priorExpOnly, setPriorExpOnly] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [locationSearch, setLocationSearch] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);

  // Per-employee LLM report state: empId → { status, data, error, hidden }
  const [reports, setReports] = useState({});

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    getCandidates(roleId, availableOnly, priorExpOnly, projectStartDate)
      .then(setCandidates)
      .catch(() =>
        setError("Could not load candidates. Is the backend running?"),
      )
      .finally(() => setLoading(false));
  }, [roleId, availableOnly, priorExpOnly]);

  // Generate or toggle the LLM report for one candidate
  async function handleGenerateReport(empId) {
    const existing = reports[empId];
    if (existing?.status === "done" || existing?.status === "error") {
      setReports((r) => ({
        ...r,
        [empId]: { ...existing, hidden: !existing.hidden },
      }));
      return;
    }
    if (existing?.status === "loading") return;

    setReports((r) => ({
      ...r,
      [empId]: { status: "loading", hidden: false },
    }));
    try {
      const data = await requestLLMReport(roleId, empId);
      setReports((r) => ({
        ...r,
        [empId]: { status: "done", data, hidden: false },
      }));
    } catch (err) {
      const msg = err?.message?.includes("503")
        ? "AI report unavailable — check OPENROUTER_API_KEY. Deterministic matching still works."
        : "Could not generate AI report. Is the backend running?";
      setReports((r) => ({
        ...r,
        [empId]: { status: "error", error: msg, hidden: false },
      }));
    }
  }

  const locationOptions = [
    ...new Set(candidates.map((c) => c.location).filter(Boolean)),
  ].sort();

  const filteredLocationOptions = locationOptions.filter((location) =>
    location.toLowerCase().includes(locationSearch.toLowerCase()),
  );

  const displayedCandidates = candidates.filter(
    (candidate) =>
      selectedLocations.length === 0 ||
      selectedLocations.includes(candidate.location),
  );

  if (error) return <div className="error">{error}</div>;

  return (
    <div className="page">
      <div className="page-title">Select a team member</div>
      <div className="page-sub">
        Candidates ranked by capability match score — click a card to select
      </div>

      {/* Filter toggles */}
      <div
        style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: availableOnly ? "#1e2a14" : "#1a1a1a",
            border: `1px solid ${availableOnly ? "#86BC25" : "#222"}`,
            borderRadius: 7,
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 12,
            color: availableOnly ? "#86BC25" : "#888",
            fontWeight: availableOnly ? 600 : 400,
          }}
        >
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            style={{ accentColor: "#86BC25" }}
          />
          Available only
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: priorExpOnly ? "#1e2a14" : "#1a1a1a",
            border: `1px solid ${priorExpOnly ? "#86BC25" : "#222"}`,
            borderRadius: 7,
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 12,
            color: priorExpOnly ? "#86BC25" : "#888",
            fontWeight: priorExpOnly ? 600 : 400,
          }}
        >
          <input
            type="checkbox"
            checked={priorExpOnly}
            onChange={(e) => setPriorExpOnly(e.target.checked)}
            style={{ accentColor: "#86BC25" }}
          />
          Prior experience only
        </label>

        <div className="location-filter">
          <button
            type="button"
            className={`location-filter-button ${selectedLocations.length > 0 ? "active" : ""}`}
            onClick={() => setLocationOpen((open) => !open)}
          >
            Location
            {selectedLocations.length > 0 && (
              <span className="location-count">{selectedLocations.length}</span>
            )}
            <span className="location-arrow">▾</span>
          </button>

          {locationOpen && (
            <div className="location-dropdown">
              <input
                type="text"
                className="location-search"
                placeholder="Search locations..."
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
              />

              <div className="location-options">
                {filteredLocationOptions.length === 0 ? (
                  <div className="location-empty">No matching locations</div>
                ) : (
                  filteredLocationOptions.map((location) => (
                    <label key={location} className="location-option">
                      <input
                        type="checkbox"
                        checked={selectedLocations.includes(location)}
                        onChange={() => {
                          setSelectedLocations((current) =>
                            current.includes(location)
                              ? current.filter((item) => item !== location)
                              : [...current, location],
                          );
                        }}
                      />

                      <span>{location}</span>
                    </label>
                  ))
                )}
              </div>

              {selectedLocations.length > 0 && (
                <button
                  type="button"
                  className="location-clear"
                  onClick={() => setSelectedLocations([])}
                >
                  Clear selection
                </button>
              )}
            </div>
          )}
        </div>

        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#555",
            alignSelf: "center",
          }}
        >
          {loading ? "Loading…" : `${displayedCandidates.length} candidates`}
        </span>
      </div>

      {/* Candidate cards */}
      {loading && <div className="loading">Ranking candidates…</div>}

      {!loading && displayedCandidates.length === 0 && (
        <div
          style={{ color: "var(--muted2)", fontSize: 13, padding: "24px 0" }}
        >
          No candidates match the current filters.
        </div>
      )}

      {!loading &&
        displayedCandidates.map((c) => {
          const av = avatarColor(c.employee_id);
          const sc = scoreColor(c.match_score);
          const isSelected = c.employee_id === selectedId;
          const isUnavailable = !c.available; // can't select unavailable employees
          const rpt = reports[c.employee_id];
          const showPanel =
            rpt &&
            !rpt.hidden &&
            (rpt.status === "loading" ||
              rpt.status === "done" ||
              rpt.status === "error");

          return (
            <div key={c.employee_id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => !isUnavailable && setSelectedId(c.employee_id)}
                title={
                  isUnavailable
                    ? "This employee is unavailable for the project start date"
                    : ""
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 16px",
                  background: isSelected ? "#131a0d" : "#161616",
                  border: `1px solid ${isSelected ? "#86BC25" : "#2a2a2a"}`,
                  borderRadius: showPanel ? "8px 8px 0 0" : 8,
                  cursor: isUnavailable ? "not-allowed" : "pointer",
                  opacity: isUnavailable ? 0.45 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: av.bg,
                    color: av.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {getInitials(c.name)}
                </div>

                {/* Name, title, score bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#d0d0d0" }}
                  >
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#999999", marginTop: 2 }}>
                    {c.title} · {c.business_unit} · {c.location}
                  </div>
                  <div
                    style={{
                      height: 3,
                      background: "#1f1f1f",
                      borderRadius: 2,
                      marginTop: 7,
                    }}
                  >
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        width: `${Math.round(c.match_score * 100)}%`,
                        background: "#86BC25",
                      }}
                    />
                  </div>
                </div>

                {/* Right side: score, badges, AI report button */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      background: sc.bg,
                      color: sc.color,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 9px",
                      borderRadius: 20,
                    }}
                  >
                    {Math.round(c.match_score * 100)}%
                  </span>

                  <div style={{ display: "flex", gap: 5 }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 10,
                        background: c.available ? "#1e2a14" : "#2a0d0d",
                        color: c.available ? "#86BC25" : "#e05252",
                      }}
                    >
                      {c.available ? "Available" : "Unavailable"}
                    </span>
                    {c.has_prior_experience && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 10,
                          background: "#0d1f33",
                          color: "#5b9bd5",
                        }}
                      >
                        Prior exp
                      </span>
                    )}
                  </div>

                  {/* Generate AI report button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateReport(c.employee_id);
                    }}
                    disabled={rpt?.status === "loading"}
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      border: `1px solid ${rpt?.status === "done" ? "#86BC25" : "#333"}`,
                      background:
                        rpt?.status === "done" ? "#1e2a14" : "transparent",
                      color: rpt?.status === "done" ? "#86BC25" : "#888",
                      opacity: rpt?.status === "loading" ? 0.5 : 1,
                    }}
                  >
                    {rpt?.status === "loading"
                      ? "Generating…"
                      : rpt?.status === "done"
                        ? "AI report ✓"
                        : rpt?.status === "error"
                          ? "AI report — retry"
                          : "Generate AI report"}
                  </button>
                </div>

                {/* Selection checkmark */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: `1.5px solid ${isSelected ? "#86BC25" : "#2a2a2a"}`,
                    background: isSelected ? "#86BC25" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#0a0a0a",
                    fontWeight: 700,
                  }}
                >
                  {isSelected && "✓"}
                </div>
              </div>

              {/* Inline AI report panel */}
              {showPanel && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#0f0f0f",
                    border: "1px solid #2a2a2a",
                    borderTop: "none",
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                  }}
                >
                  {rpt.status === "loading" && (
                    <div style={{ fontSize: 12, color: "#888" }}>
                      Generating AI report…
                    </div>
                  )}
                  {rpt.status === "error" && (
                    <div style={{ fontSize: 12, color: "#e05252" }}>
                      {rpt.error}
                    </div>
                  )}
                  {rpt.status === "done" && (
                    <>
                      <p
                        style={{
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: "#c0c0c0",
                          margin: 0,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {rpt.data.report}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

      {/* Navigation */}
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn-primary"
          disabled={!selectedId}
          onClick={() => onNext(selectedId)}
          style={{
            opacity: selectedId ? 1 : 0.4,
            cursor: selectedId ? "pointer" : "default",
          }}
        >
          View gap analysis →
        </button>
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  );
}
