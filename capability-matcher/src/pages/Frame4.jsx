// Frame4.jsx — Gap analysis screen (Step 4 of 4).
//
// Handles three entry points:
//   1. viewSavedAssignment=true — came from "View analysis" in Frame 1
//      loads the saved employee from Supabase assignments table
//   2. Auto mode — empId is null, autoSelect has the LLM pick
//      saves the assignment to Supabase
//   3. Hands-on mode — empId set from Frame 3 candidate selection
//      saves the assignment to Supabase

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  getCandidateFit,
  getCandidates,
  getAssignment,
  saveAssignment,
  requestLLMReport,
  inferCapabilities,
} from '../api/api'

function simColor(sim, isGap) {
  if (isGap)       return '#e05252'
  if (sim >= 0.85) return '#86BC25'
  return '#5b9bd5'
}

function scoreOutOfFive(score) {
  return Math.ceil(Math.max(0, Math.min(1, score)) * 5)
}

function WeightDots({ weight }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: 2,
          background: i <= weight ? '#86BC25' : '#222',
        }} />
      ))}
    </div>
  )
}

export default function Frame4({
  roleId, projectId, empId, mode,
  autoSelect, viewSavedAssignment,
  selectedRole,
  onBack, onBackToRoles
}) {
  const [fitData, setFitData]                     = useState([])
  const [employee, setEmployee]                   = useState(null)
  const [loading, setLoading]                     = useState(true)
  const [error, setError]                         = useState(null)
  const [showTopCandidates, setShowTopCandidates] = useState(false)
  const [report, setReport]                       = useState(null)
  const [reportStatus, setReportStatus]           = useState('idle')
  const [showReport, setShowReport]               = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      try {
        // Step 1 — load role from Supabase to get title and description
        // needed to re-infer capabilities if backend was restarted
        let roleTitle = selectedRole?.title || ''
        let roleDescription = selectedRole?.description || ''

        if (!roleTitle && roleId) {
          const { data } = await supabase
            .from('roles')
            .select('title, description')
            .eq('id', roleId)
            .single()
          if (data) {
            roleTitle = data.title
            roleDescription = data.description
          }
        }

        // Step 2 — re-infer capabilities into FastAPI memory
        if (roleTitle) {
          try {
            await inferCapabilities(roleId, roleTitle, roleDescription)
          } catch (e) {
            console.warn('Could not re-infer capabilities:', e)
          }
        }

        // Step 3 — load candidates and resolve employee
        let resolvedEmpId = empId
        let resolvedEmployee = null

        const candidates = await getCandidates(roleId, false, false)
        if (candidates.length === 0) {
          setError('No candidates found for this role.')
          return
        }

        if (viewSavedAssignment) {
          const savedAssignment = await getAssignment(roleId)
          if (!savedAssignment) {
            setError('No saved assignment found for this role.')
            return
          }
          resolvedEmpId = savedAssignment.employee_id
          resolvedEmployee = candidates.find(c => c.employee_id === resolvedEmpId) || {
            employee_id:   savedAssignment.employee_id,
            name:          savedAssignment.employee_name,
            match_score:   savedAssignment.match_score,
            title:         '',
            business_unit: '',
            location:      '',
          }

        } else if (mode === 'auto') {
          if (autoSelect && !autoSelect.error) {
            resolvedEmpId = autoSelect.selected_employee_id
          } else {
            resolvedEmpId = candidates[0].employee_id
          }
          resolvedEmployee = candidates.find(c => c.employee_id === resolvedEmpId) || candidates[0]
          if (projectId) {
            await saveAssignment(roleId, projectId, resolvedEmployee)
          }

        } else if (resolvedEmpId) {
          resolvedEmployee = candidates.find(c => c.employee_id === resolvedEmpId) || null
          if (!resolvedEmployee) {
            setError('Selected employee could not be found.')
            return
          }

        } else {
          setError('No employee was selected.')
          return
        }

        setEmployee(resolvedEmployee)
        const fit = await getCandidateFit(roleId, resolvedEmpId)
        setFitData(fit)

      } catch (e) {
        console.error('Gap analysis error:', e)
        setError('Could not load gap analysis. Is the backend running?')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [roleId, empId, projectId, mode, viewSavedAssignment])

  async function handleGenerateReport() {
    if (reportStatus === 'loading') return
    if (reportStatus === 'done' || reportStatus === 'error') {
      setShowReport(p => !p)
      return
    }
    setReportStatus('loading')
    setShowReport(true)
    try {
      const data = await requestLLMReport(roleId, employee?.employee_id)
      setReport(data)
      setReportStatus('done')
    } catch (err) {
      const msg = err?.message?.includes('503')
        ? 'AI report unavailable — check OPENROUTER_API_KEY. Deterministic matching still works.'
        : 'Could not generate AI report. Is the backend running?'
      setReport({ error: msg })
      setReportStatus('error')
    }
  }



  if (loading) return <div className="loading">Running gap analysis…</div>
  if (error)   return <div className="error">{error}</div>

  const gapCount     = fitData.filter(f => f.is_gap).length
  const coveredCount = fitData.filter(f => !f.is_gap).length
  const avgSimilarity = fitData.length
    ? fitData.reduce((s, f) => s + f.similarity, 0) / fitData.length
    : 0

  return (
    <div className="page">
      <div className="page-title">Gap analysis</div>
      <div className="page-sub">
        {mode === 'auto' ? 'Auto-matched candidate' : viewSavedAssignment ? 'Saved assignment' : 'Manually selected candidate'} · per-capability fit breakdown
      </div>

      {/* Employee summary card */}
      {employee && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
              <div style={{ fontSize: 11, color: '#999999', marginTop: 2 }}>
                {[employee.title, employee.business_unit, employee.location].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#86BC25' }}>
                {Math.round(employee.match_score * 100)}%
              </div>
              <div style={{ fontSize: 10, color: '#999999' }}>overall match</div>
            </div>
          </div>
        </div>
      )}
      {/* Generate AI fit report button — hands-on mode */}
      {!loading && employee && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={handleGenerateReport}
            disabled={reportStatus === 'loading'}
            style={{
              fontSize: 11, fontWeight: 600,
              padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'inherit',
              border: `1px solid ${reportStatus === 'done' ? '#86BC25' : '#2a2a2a'}`,
              background: reportStatus === 'done' ? '#1e2a14' : 'transparent',
              color: reportStatus === 'done' ? '#86BC25' : '#888888',
              opacity: reportStatus === 'loading' ? 0.5 : 1,
            }}
          >
            {reportStatus === 'loading' ? 'Generating AI report…'
              : reportStatus === 'done' ? (showReport ? 'Hide AI report ▲' : 'Show AI report ▼')
              : reportStatus === 'error' ? 'AI report — retry'
              : 'Generate AI fit report'}
          </button>

          {/* Inline report panel */}
          {showReport && reportStatus !== 'idle' && (
            <div style={{
              marginTop: 8, padding: '14px 16px',
              background: '#0f0f0f',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
            }}>
              {reportStatus === 'loading' && (
                <div style={{ fontSize: 12, color: '#888' }}>Generating AI report…</div>
              )}
              {reportStatus === 'error' && (
                <div style={{ fontSize: 12, color: '#e05252' }}>{report?.error}</div>
              )}
              {reportStatus === 'done' && (
                <>
                  {mode !== 'auto' && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 26, fontWeight: 700, color: '#86BC25' }}>
                        {report.overall_fit_score}
                      </span>
                      <span style={{
                        fontSize: 10, color: '#888',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        overall fit score
                      </span>
                    </div>
                  )}
                  <p style={{
                    fontSize: 12, lineHeight: 1.7, color: '#c0c0c0',
                    margin: 0, whiteSpace: 'pre-wrap',
                  }}>
                    {report.report}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto mode — LLM rationale card */}
      {mode === 'auto' && autoSelect && !autoSelect.error && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <span className="card-title">AI selection rationale</span>
            <span className="badge badge-green">Auto</span>
          </div>
          <p style={{ fontSize: 12, color: '#aaaaaa', lineHeight: 1.7, marginBottom: 12 }}>
            {autoSelect.rationale}
          </p>

          {/* Collapsible top-5 panel */}
          {autoSelect.all_top_candidates?.length > 0 && (
            <>
              <button
                onClick={() => setShowTopCandidates(p => !p)}
                style={{
                  background: 'none', border: '1px solid #2a2a2a',
                  borderRadius: 6, padding: '5px 12px',
                  fontSize: 11, color: '#888', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {showTopCandidates ? 'Hide' : 'Show'} top {autoSelect.all_top_candidates.length} candidates
              </button>

              {showTopCandidates && (
                <div style={{ marginTop: 10 }}>
                  {autoSelect.all_top_candidates.map((c, i) => (
                    <div key={c.employee_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 0',
                      borderBottom: i < autoSelect.all_top_candidates.length - 1
                        ? '1px solid #1a1a1a' : 'none',
                    }}>
                      <span style={{ fontSize: 11, color: '#555', width: 16 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: '#d0d0d0', flex: 1 }}>{c.name}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#86BC25',
                        background: '#1e2a14', borderRadius: 4, padding: '2px 8px',
                      }}>
                        {Math.round(c.match_score * 100)}%
                      </span>
                      {c.employee_id === autoSelect.selected_employee_id && (
                        <span style={{
                          fontSize: 10, color: '#86BC25',
                          background: '#1e2a14', borderRadius: 4,
                          padding: '2px 8px', fontWeight: 600,
                        }}>Selected</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, marginBottom: 14,
      }}>
        {[
          { num: `${scoreOutOfFive(avgSimilarity)}/5`, label: 'Avg fit' },
          { num: coveredCount,                           label: 'Skills covered' },
          { num: gapCount,                               label: 'Gaps to address' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#111', borderRadius: 8, padding: 14, textAlign: 'center',
          }}>
            <div style={{
              fontSize: 22, fontWeight: 700,
              color: s.label === 'Gaps to address' && gapCount > 0 ? '#e05252' : '#e8e8e8',
            }}>{s.num}</div>
            <div style={{
              fontSize: 10, color: '#aaaaaa',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3,
            }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-capability breakdown */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Capability breakdown</span>
          <span className="badge badge-green">{fitData.length} capabilities</span>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 60px 120px 80px',
          gap: 8, fontSize: 10, fontWeight: 600, color: '#aaaaaa',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          paddingBottom: 8, borderBottom: '1px solid #1e1e1e',
        }}>
          <span>Capability</span>
          <span style={{ textAlign: 'center' }}>Weight</span>
          <span>Closest skill</span>
          <span style={{ textAlign: 'right' }}>Fit (1–5)</span>
        </div>

        {fitData.map((f, i) => {
          const barColor = simColor(f.similarity, f.is_gap)
          return (
            <div key={f.cap_id} style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 120px 80px',
              gap: 8, alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < fitData.length - 1 ? '1px solid #1a1a1a' : 'none',
              borderLeft: f.is_gap ? '3px solid #e05252' : '3px solid transparent',
              paddingLeft: 8,
            }}>
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
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <WeightDots weight={f.weight} />
              </div>
              <div style={{
                fontSize: 11,
                color: f.best_match_skill ? '#888' : '#444',
                fontStyle: f.best_match_skill ? 'normal' : 'italic',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.best_match_skill || 'No match found'}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: barColor, marginBottom: 4 }}>
                  {scoreOutOfFive(f.similarity)}/5
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

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 11, color: '#555' }}>
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

      {/* Navigation */}
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        {onBackToRoles && (
          <button className="btn-primary" onClick={onBackToRoles}>
            Next role →
          </button>
        )}
        <button
          className="btn-secondary"
          onClick={() => alert('Export feature coming in Sprint 2!')}
        >
          Export report
        </button>
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}