// Frame4.jsx — Gap analysis screen (Step 4 of 4).
//
// What it does:
//   1. On mount, calls getCandidateFit(roleId, empId)
//      → GET /roles/{roleId}/candidates/{empId}/fit
//      The backend compares each required capability against the employee's
//      skills using cosine similarity and flags gaps (similarity < 0.6).
//   2. Shows a summary stat row: overall score, gaps count, strong matches.
//   3. Shows one row per capability with:
//      - cap_name: the required ESCO skill
//      - weight: how important it is (1–5)
//      - best_match_skill: the employee's closest matching skill
//      - similarity: score 0–1 shown as a bar
//      - is_gap: red row if true (similarity < 0.6), green if covered
//   4. Export button is a placeholder for now (Sprint 2).
//
// Props:
//   roleId  — e.g. "ROLE001"
//   empId   — e.g. "EMP007", selected in Frame 3 (null in Auto mode)
//   mode    — "auto" | "hands"
//   onBack()— navigate back to Frame 2 (auto) or Frame 3 (hands)

import { useEffect, useState } from 'react'
import { getCandidateFit, getCandidates } from '../api/api'

// Converts similarity score 0–1 into a colour for the bar and badge
function simColor(sim, isGap) {
  if (isGap)      return '#e05252' // red   — gap (< 0.6)
  if (sim >= 0.85) return '#86BC25' // green — strong match
  return '#5b9bd5'                  // blue  — adequate match
}

// Renders a row of 5 small squares showing the weight visually
// e.g. weight=3 → ■ ■ ■ □ □
function WeightDots({ weight }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: 2,
          background: i <= weight ? '#86BC25' : '#222',
        }} />
      ))}
    </div>
  )
}

export default function Frame4({ roleId, empId, mode, onBack }) {
  // fitData  — array of per-capability fit items from the backend
  // employee — basic employee info (fetched from candidates list)
  // loading  — true while fetching
  // error    — error message if fetch fails
  const [fitData, setFitData]     = useState([])
  const [employee, setEmployee]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // ── Fetch fit data on mount ───────────────────────────────────────────────
  // In Hands-on mode: empId comes from Frame 3 (user's selection).
  // In Auto mode: empId is null, so we first fetch the top candidate
  //   from GET /roles/{roleId}/candidates and use the first result.
  useEffect(() => {
    async function load() {
      try {
        let resolvedEmpId = empId

        // Auto mode — no empId passed in, pick the top-ranked candidate
        if (!resolvedEmpId) {
          const candidates = await getCandidates(roleId, false, false)
          if (candidates.length === 0) {
            setError('No candidates found for this role.')
            return
          }
          resolvedEmpId = candidates[0].employee_id
          setEmployee(candidates[0])
        } else {
          // Hands-on mode — fetch candidates just to get this employee's info
          const candidates = await getCandidates(roleId, false, false)
          setEmployee(candidates.find(c => c.employee_id === resolvedEmpId) || null)
        }

        // Fetch the per-capability fit breakdown for this employee
        const fit = await getCandidateFit(roleId, resolvedEmpId)
        setFitData(fit)
      } catch {
        setError('Could not load gap analysis. Is the backend running?')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [roleId, empId])

  if (loading) return <div className="loading">Running gap analysis…</div>
  if (error)   return <div className="error">{error}</div>

  // ── Derived summary stats ─────────────────────────────────────────────────
  const gapCount      = fitData.filter(f => f.is_gap).length
  const coveredCount  = fitData.filter(f => !f.is_gap).length
  const avgSimilarity = fitData.length
    ? (fitData.reduce((s, f) => s + f.similarity, 0) / fitData.length)
    : 0

  return (
    <div className="page">
      <div className="page-title">Gap analysis</div>
      <div className="page-sub">
        {mode === 'auto' ? 'Auto-matched top candidate' : 'Manually selected candidate'} · per-capability fit breakdown
      </div>

      {/* ── Employee summary card ── */}
      {employee && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: '#1e2a14', color: '#86BC25',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
            }}>
              {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d0' }}>
                {employee.name}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                {employee.title} · {employee.business_unit} · {employee.location}
              </div>
            </div>

            {/* Overall match score */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#86BC25' }}>
                {Math.round(employee.match_score * 100)}%
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>overall match</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary stats row ── */}
      {/* Three quick numbers at a glance */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, marginBottom: 14,
      }}>
        {[
          { num: `${Math.round(avgSimilarity * 100)}%`, label: 'Avg similarity' },
          { num: coveredCount,                           label: 'Skills covered' },
          { num: gapCount,                               label: 'Gaps to address' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#111', borderRadius: 8,
            padding: 14, textAlign: 'center',
          }}>
            <div style={{
              fontSize: 22, fontWeight: 700,
              color: s.label === 'Gaps to address' && gapCount > 0 ? '#e05252' : '#e8e8e8',
            }}>
              {s.num}
            </div>
            <div style={{
              fontSize: 10, color: '#555',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Per-capability breakdown ── */}
      {/* One row per required capability. Red = gap, green/blue = covered. */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Capability breakdown</span>
          <span className="badge badge-green">{fitData.length} capabilities</span>
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 120px 80px',
          gap: 8,
          fontSize: 10, fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          paddingBottom: 8,
          borderBottom: '1px solid #1e1e1e',
        }}>
          <span>Capability</span>
          <span style={{ textAlign: 'center' }}>Weight</span>
          <span>Closest skill</span>
          <span style={{ textAlign: 'right' }}>Similarity</span>
        </div>

        {/* One row per capability */}
        {fitData.map((f, i) => {
          const barColor = simColor(f.similarity, f.is_gap)
          return (
            <div
              key={f.cap_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 120px 80px',
                gap: 8,
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < fitData.length - 1 ? '1px solid #1a1a1a' : 'none',
                // Highlight gap rows with a subtle red left border
                borderLeft: f.is_gap ? '3px solid #e05252' : '3px solid transparent',
                paddingLeft: 8,
              }}
            >
              {/* Capability name + gap label */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#d0d0d0' }}>
                  {f.cap_name}
                </div>
                {f.is_gap && (
                  <div style={{ fontSize: 10, color: '#e05252', marginTop: 2 }}>
                    Gap — upskilling needed
                  </div>
                )}
              </div>

              {/* Weight dots — visual representation of importance */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <WeightDots weight={f.weight} />
              </div>

              {/* Employee's closest matching skill */}
              {/* Shows what they have that is closest to this requirement */}
              <div style={{
                fontSize: 11, color: f.best_match_skill ? '#888' : '#444',
                fontStyle: f.best_match_skill ? 'normal' : 'italic',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {f.best_match_skill || 'No match found'}
              </div>

              {/* Similarity score as percentage + mini bar */}
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: barColor, marginBottom: 4,
                }}>
                  {Math.round(f.similarity * 100)}%
                </div>
                <div style={{ height: 3, background: '#1f1f1f', borderRadius: 2 }}>
                  <div style={{
                    height: 3, borderRadius: 2,
                    width: `${Math.round(f.similarity * 100)}%`,
                    background: barColor,
                  }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Legend ── */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 20,
        fontSize: 11, color: '#555',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#86BC25' }} />
          Strong match (≥85%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#5b9bd5' }} />
          Adequate (60–84%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#e05252' }} />
          Gap (&lt;60%)
        </span>
      </div>

      {/* ── Navigation ── */}
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button
          className="btn-primary"
          onClick={() => alert('Export feature not ready yet for now...')}
        >
          Export report →
        </button>
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}