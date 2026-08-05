// App.jsx — the root component. Manages which frame is currently visible
// and holds the shared state that gets passed between frames:
//   frame   — which of the 4 steps the user is on (0–4)
//   roleId  — the selected role UUID from Supabase
//   empId   — the selected employee (e.g. "EMP001"), set in Frame 3, used in Frame 4
//   mode    — "auto" skips Frame 3 (AI picks candidates), "hands" includes it

import { useState } from 'react'
import Frame0 from './pages/Frame0'
import Frame1 from './pages/Frame1'
import Frame2 from './pages/Frame2'
import Frame3 from './pages/Frame3'
import Frame4 from './pages/Frame4'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { requestAutoSelect } from './api/api'
import './index.css'
import './App.css'

const STEPS = [
  { num: 0, label: 'Projects' },
  { num: 1, label: 'Project setup' },
  { num: 2, label: 'Skill requirements' },
  { num: 3, label: 'Select team' },
  { num: 4, label: 'Gap analysis' },
]

export default function App() {
  const [frame, setFrame]               = useState(0)
  const [roleId, setRoleId]             = useState(null)
  const [empId, setEmpId]               = useState(null)
  const [mode, setMode]                 = useState('hands')
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [viewSavedAssignment, setViewSavedAssignment] = useState(false)
  const [view, setView] = useState('login')
  const [profile, setProfile] = useState(null)
  const [topK, setTopK] = useState(5)
  
  // LLM auto-select result passed to Frame 4
  const [autoSelect, setAutoSelect] = useState(null)
  const [autoSelectLoading, setAutoSelectLoading] = useState(false)

  function goTo(f) { setFrame(f) }

  function handleLoginSuccess(profileData) {
    setProfile(profileData)

    // The shared dashboard now becomes the immediate post-login landing page
    // for every role. The existing capability-matching flow remains available
    // from inside the dashboard shell, rather than as a separate portal route.
    setView('dashboard')
  }

  function handleStartMatching() {
    setFrame(0)
    setView('flow')
  }

  function parseProjectStartDate(startDateText) {
    if (!startDateText) return null
    try {
      const date = new Date(startDateText)
      if (!isNaN(date)) return date.toISOString().split('T')[0]
      return null
    } catch {
      return null
    }
  }
  // Resets the capability-matching session and returns the user to the shared
  // dashboard shell without leaving the app in a stale frame state.
  function handleExitToDashboard() {
    setFrame(0)
    setRoleId(null)
    setEmpId(null)
    setMode('hands')
    setSelectedProject(null)
    setSelectedRole(null)
    setViewSavedAssignment(false)
    setAutoSelect(null)
    setView('dashboard')
  }

  // Clears the authenticated account surface and sends the user back to the
  // sign-in entry point for a clean secure handoff.
  function handleLogout() {
    setProfile(null)
    setFrame(0)
    setRoleId(null)
    setEmpId(null)
    setMode('hands')
    setSelectedProject(null)
    setSelectedRole(null)
    setViewSavedAssignment(false)
    setAutoSelect(null)
    setView('login')
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-dot" />
        <span className="topbar-title">Capability Matcher</span>
        <div className="topbar-divider" />
        <span className="topbar-sub">Deloitte Talent Intelligence</span>

        {/* Flow-only controls live in the shared top bar so users can exit the
            matching session without losing the dashboard context. */}
        {view === 'flow' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExitToDashboard}
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              Back to Dashboard
            </button>

            <div style={{ display: 'flex', background: '#1c1c1c', borderRadius: 6, padding: 3, gap: 2 }}>
              <button
                type="button"
                onClick={() => setMode('auto')}
                style={{
                  padding: '4px 14px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: mode === 'auto' ? '#86BC25' : 'transparent',
                  color: mode === 'auto' ? '#0a0a0a' : '#555',
                }}
              >
                Auto
              </button>

              <button
                type="button"
                onClick={() => setMode('hands')}
                style={{
                  padding: '4px 14px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: mode === 'hands' ? '#86BC25' : 'transparent',
                  color: mode === 'hands' ? '#0a0a0a' : '#555',
                }}
              >
                Hands-on
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step progress bar — only visible inside matching flow */}
      {view === 'flow' && (
        <div className="stepbar">
          {STEPS.map((s, i) => {
            const state = s.num < frame ? 'done' : s.num === frame ? 'active' : 'idle'
            return (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="step">
                  <div className={`step-num ${state}`}>{state === 'done' ? '✓' : i + 1}</div>
                  <span className={`step-label ${state}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <span className="step-arrow">›</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Screen routing ── */}
      {view === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}

      {view === 'dashboard' && (
        <Dashboard
          profile={profile}
          onStartMatching={handleStartMatching}
          onLogout={handleLogout}
        />
      )}

      {view === 'flow' && (
        <>
          {/* Frame 0 — Project list */}
          {frame === 0 && (
            <Frame0
              profile={profile}
              onSelectProject={(project) => {
                setSelectedProject(project)
                goTo(1)
              }}
            />
          )}

          {/* Frame 1 — Roles list */}
          {frame === 1 && (
            <Frame1
              project={selectedProject}
              onSelectRole={(role, hasAssignment, savedEmployeeId = null, roleTopK = 5) => {
                setSelectedRole(role)
                setRoleId(role.id)
                setTopK(roleTopK)
                if (hasAssignment) {
                  setEmpId(savedEmployeeId)
                  setViewSavedAssignment(true)
                  setAutoSelect(null)
                  goTo(4)
                } else {
                  setEmpId(null)
                  setViewSavedAssignment(false)
                  setAutoSelect(null)
                  goTo(2)
                }
              }}
              onBack={() => goTo(0)}
            />
          )}

          {/* Frame 2 — Skill requirements */}
          {frame === 2 && (
            <Frame2
              roleId={roleId}
              role={selectedRole}
              topK={topK}
              mode={mode}
              autoSelectLoading={autoSelectLoading}
              onBack={() => goTo(1)}
              onNext={(id) => {
                setRoleId(id)
                setViewSavedAssignment(false) 
                if (mode === 'auto') {
                  setAutoSelect(null)
                  setAutoSelectLoading(true)
                  requestAutoSelect(id, parseProjectStartDate(selectedProject?.start_date))
                    .then(result => {
                      setAutoSelect(result)
                      setAutoSelectLoading(false)
                      goTo(4)  // only navigate AFTER result is ready
                    })
                    .catch(() => {
                      setAutoSelect({ error: 'unavailable' })
                      setAutoSelectLoading(false)
                      goTo(4)
                    })
                } else {
                  goTo(3)
                }
              }}
            />
          )}

          {/* Frame 3 — Candidate selection */}
          {frame === 3 && (
            <Frame3
              roleId={roleId}
              projectId={selectedProject?.id}
              projectStartDate={parseProjectStartDate(selectedProject?.start_date)}
              onBack={() => goTo(2)}
              onNext={(eid) => { setEmpId(eid); goTo(4) }}
            />
          )}

          {/* Frame 4 — Gap analysis */}
          {frame === 4 && (
            <Frame4
              roleId={roleId}
              projectId={selectedProject?.id}
              empId={empId}
              mode={mode}
              autoSelect={autoSelect}
              viewSavedAssignment={viewSavedAssignment}
              selectedRole={selectedRole}
              onBack={() => goTo(mode === 'auto' ? 2 : 3)}
              onBackToRoles={() => goTo(1)}
            />
          )}
        </>
      )}
    </>
  )
}