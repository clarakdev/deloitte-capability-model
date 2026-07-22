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
import { requestAutoSelect } from './api/api'
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
  //LLM auto-select result passed to Frame 4
  const [autoSelect, setAutoSelect]     = useState(null)

  function goTo(f) { setFrame(f) }

  return (
    <>
      <div className="topbar">
        <div className="topbar-dot" />
        <span className="topbar-title">Capability Matcher</span>
        <div className="topbar-divider" />
        <span className="topbar-sub">Deloitte Talent Intelligence</span>
        <div style={{ marginLeft: 'auto', display: 'flex', background: '#1c1c1c', borderRadius: 6, padding: 3, gap: 2 }}>
          <button
            onClick={() => setMode('auto')}
            style={{
              padding: '4px 14px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              background: mode === 'auto' ? '#86BC25' : 'transparent',
              color: mode === 'auto' ? '#0a0a0a' : '#555',
            }}>Auto</button>
          <button
            onClick={() => setMode('hands')}
            style={{
              padding: '4px 14px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              background: mode === 'hands' ? '#86BC25' : 'transparent',
              color: mode === 'hands' ? '#0a0a0a' : '#555',
            }}>Hands-on</button>
        </div>
      </div>

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

      {/* Frame 0 — Project list (new, Supabase) */}
      {frame === 0 && (
        <Frame0
          onSelectProject={(project) => {
            setSelectedProject(project)
            goTo(1)
          }}
        />
      )}

      {/* Frame 1 — Roles list (Supabase) */}
      {frame === 1 && (
        <Frame1
          project={selectedProject}
          onSelectRole={(role, hasAssignment, savedEmployeeId = null) => {
            setSelectedRole(role)
            setRoleId(role.id)
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
          mode={mode}
          onBack={() => goTo(1)}
          onNext={(id) => {
            setRoleId(id)
            setViewSavedAssignment(false)
            if (mode === 'auto') {
              // Ask the LLM to pick the best of the top 5 before showing Frame 4
              setAutoSelect(null)
              requestAutoSelect(id)
                .then(setAutoSelect)
                .catch(() => setAutoSelect({ error: 'unavailable' }))
              goTo(4)
            } else {
              goTo(3)
            }
          }}
        />
      )}

      {/* Frame 3 — Candidate selection (hands-on only) */}
      {frame === 3 && (
        <Frame3
          roleId={roleId}
          projectId={selectedProject?.id}
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
          onBack={() => goTo(mode === 'auto' ? 2 : 3)}
          onBackToRoles={() => goTo(1)}
        />
      )}
    </>
  )
}