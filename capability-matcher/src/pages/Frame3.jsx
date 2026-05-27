// Frame3.jsx — Candidate selection screen (Step 3 of 4). Hands-on mode only.
//
// What it does:
//   1. On mount, calls getCandidates(roleId) → GET /roles/{roleId}/candidates
//      The backend ranks all 30 employees by semantic fit to the role's
//      current capability list (weighted cosine similarity).
//   2. Displays employees as cards ranked by match_score (highest first).
//   3. Two filter toggles:
//      - Available only   → ?available_only=true   (removes unavailable employees)
//      - Prior experience → ?require_prior_experience=true (only employees who
//        have held this role title before — exactly 3 per role in demo data)
//   4. User clicks a candidate card to select them, then clicks Submit to
//      call onNext(empId) which stores the empId in App.jsx and goes to Frame 4.
//
// Props:
//   roleId       — e.g. "ROLE001"
//   onBack()     — navigate back to Frame 2
//   onNext(empId)— navigate to Frame 4 with the selected employee id

import { useEffect, useState } from 'react'
import { getCandidates } from '../api/api'

// Generates initials from a full name e.g. "Jane Smith" → "JS"
function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// Assigns a consistent avatar colour based on the employee's id
// so the same person always gets the same colour across frames
const AVATAR_COLORS = [
  { bg: '#1e2a14', color: '#86BC25' },
  { bg: '#0d1f33', color: '#5b9bd5' },
  { bg: '#1c0d33', color: '#9b6dd4' },
  { bg: '#2a1800', color: '#d4922a' },
  { bg: '#2a0d0d', color: '#e05252' },
  { bg: '#082020', color: '#1D9E75' },
]

function avatarColor(empId) {
  // Uses the numeric part of the id (e.g. "EMP007" → 7) to pick a colour
  const n = parseInt(empId.replace(/\D/g, ''), 10) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

// Converts a 0–1 match score to a colour for the score badge
function scoreColor(score) {
  if (score >= 0.85) return { bg: '#1e2a14', color: '#86BC25' } // strong
  if (score >= 0.70) return { bg: '#0d1f33', color: '#5b9bd5' } // good
  return { bg: '#2a1e0a', color: '#d4922a' }                    // moderate
}

export default function Frame3({ roleId, onBack, onNext }) {
  // candidates   — full list returned from the backend (sorted by match_score)
  // loading      — true while fetching
  // error        — error message if fetch fails
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  // selectedId — the empId the user has clicked on (null = none selected yet)
  const [selectedId, setSelectedId] = useState(null)

  // Filter toggles — when changed, re-fetches from the backend with new params
  const [availableOnly, setAvailableOnly]   = useState(false)
  const [priorExpOnly, setPriorExpOnly]     = useState(false)

  // ── Fetch candidates whenever filters change ─────────────────────────────
  // The dependency array [roleId, availableOnly, priorExpOnly] means this
  // runs on mount AND whenever either filter toggle is switched.
  // This ensures weights changed in Frame 2 are reflected here too —
  // every visit re-fetches fresh ranked results from the backend.
  useEffect(() => {
    setLoading(true)
    setSelectedId(null) // clear selection when filters change
    getCandidates(roleId, availableOnly, priorExpOnly)
      .then(setCandidates)
      .catch(() => setError('Could not load candidates. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [roleId, availableOnly, priorExpOnly])

  if (error) return <div className="error">{error}</div>

  return (
    <div className="page">
      <div className="page-title">Select a team member</div>
      <div className="page-sub">
        Candidates ranked by capability match score — click a card to select
      </div>

      {/* ── Filter toggles ── */}
      {/* These hit the backend with different query params.
          Both flags are always shown on every candidate card regardless
          of whether the filter is active. */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
      }}>

        {/* Available only filter */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: availableOnly ? '#1e2a14' : '#1a1a1a',
          border: `1px solid ${availableOnly ? '#86BC25' : '#222'}`,
          borderRadius: 7, padding: '7px 14px', cursor: 'pointer',
          fontSize: 12, color: availableOnly ? '#86BC25' : '#888',
          fontWeight: availableOnly ? 600 : 400,
        }}>
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={e => setAvailableOnly(e.target.checked)}
            style={{ accentColor: '#86BC25' }}
          />
          Available only
        </label>

        {/* Prior experience filter */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: priorExpOnly ? '#1e2a14' : '#1a1a1a',
          border: `1px solid ${priorExpOnly ? '#86BC25' : '#222'}`,
          borderRadius: 7, padding: '7px 14px', cursor: 'pointer',
          fontSize: 12, color: priorExpOnly ? '#86BC25' : '#888',
          fontWeight: priorExpOnly ? 600 : 400,
        }}>
          <input
            type="checkbox"
            checked={priorExpOnly}
            onChange={e => setPriorExpOnly(e.target.checked)}
            style={{ accentColor: '#86BC25' }}
          />
          Prior experience only
        </label>

        {/* Live count of results */}
        <span style={{
          marginLeft: 'auto', fontSize: 11, color: '#555',
          alignSelf: 'center',
        }}>
          {loading ? 'Loading…' : `${candidates.length} candidates`}
        </span>
      </div>

      {/* ── Candidate cards ── */}
      {loading && <div className="loading">Ranking candidates…</div>}

      {!loading && candidates.length === 0 && (
        <div style={{ color: 'var(--muted2)', fontSize: 13, padding: '24px 0' }}>
          No candidates match the current filters.
        </div>
      )}

      {!loading && candidates.map((c) => {
        const av  = avatarColor(c.employee_id)
        const sc  = scoreColor(c.match_score)
        const isSelected = c.employee_id === selectedId

        return (
          <div
            key={c.employee_id}
            onClick={() => setSelectedId(c.employee_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px',
              background: isSelected ? '#131a0d' : '#1a1a1a',
              border: `1px solid ${isSelected ? '#86BC25' : '#222'}`,
              borderRadius: 8,
              marginBottom: 8,
              cursor: 'pointer',
            }}
          >
            {/* Avatar circle with initials */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: av.bg, color: av.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>
              {getInitials(c.name)}
            </div>

            {/* Name, title, business unit */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#d0d0d0' }}>
                {c.name}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                {c.title} · {c.business_unit} · {c.location}
              </div>

              {/* Match score bar */}
              <div style={{
                height: 3, background: '#1f1f1f', borderRadius: 2, marginTop: 7,
              }}>
                <div style={{
                  height: 3, borderRadius: 2,
                  width: `${Math.round(c.match_score * 100)}%`,
                  background: '#86BC25',
                }} />
              </div>
            </div>

            {/* Right side: score badge + status flags */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'flex-end', gap: 5, flexShrink: 0,
            }}>
              {/* Match score percentage */}
              <span style={{
                background: sc.bg, color: sc.color,
                fontSize: 11, fontWeight: 700,
                padding: '3px 9px', borderRadius: 20,
              }}>
                {Math.round(c.match_score * 100)}%
              </span>

              <div style={{ display: 'flex', gap: 5 }}>
                {/* Available badge — shown on every card regardless of filter */}
                <span style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 10,
                  background: c.available ? '#1e2a14' : '#2a0d0d',
                  color:      c.available ? '#86BC25' : '#e05252',
                }}>
                  {c.available ? 'Available' : 'Unavailable'}
                </span>

                {/* Prior experience badge — shown when true */}
                {c.has_prior_experience && (
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 10,
                    background: '#0d1f33', color: '#5b9bd5',
                  }}>
                    Prior exp
                  </span>
                )}
              </div>
            </div>

            {/* Selection checkmark */}
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              border: `1.5px solid ${isSelected ? '#86BC25' : '#2a2a2a'}`,
              background: isSelected ? '#86BC25' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: '#0a0a0a', fontWeight: 700,
            }}>
              {isSelected && '✓'}
            </div>
          </div>
        )
      })}

      {/* ── Navigation ── */}
      {/* Submit is disabled until a candidate is selected */}
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button
          className="btn-primary"
          disabled={!selectedId}
          onClick={() => onNext(selectedId)}
          style={{ opacity: selectedId ? 1 : 0.4, cursor: selectedId ? 'pointer' : 'default' }}
        >
          View gap analysis →
        </button>
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}