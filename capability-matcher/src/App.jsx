// App.jsx — the root component. Manages which frame is currently visible
// and holds the shared state that gets passed between frames:
//   frame   — which of the 4 steps the user is on (1–4)
//   roleId  — the selected role (e.g. "ROLE001"), set in Frame 1, used in 2/3/4
//   empId   — the selected employee (e.g. "EMP001"), set in Frame 3, used in Frame 4
//   mode    — "auto" skips Frame 3 (AI picks candidates), "hands" includes it

import { useState } from 'react'
import Frame0 from './pages/Frame0'
import Frame1 from './pages/Frame1'
import Frame2 from './pages/Frame2'
import Frame3 from './pages/Frame3'
import Frame4 from './pages/Frame4'
import './App.css'

// The four steps shown in the progress bar at the top
const STEPS = [
  { num: 0, label: 'Projects' },
  { num: 1, label: 'Project setup' },
  { num: 2, label: 'Skill requirements' },
  { num: 3, label: 'Select team' },
  { num: 4, label: 'Gap analysis' },
]

export default function App() {
  const [frame, setFrame] = useState(0)
  const [roleId, setRoleId] = useState(null)
  const [empId, setEmpId] = useState(null)
  const [mode, setMode] = useState('hands') // 'auto' | 'hands'
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)

  function goTo(f) { setFrame(f) }

  return (
    <>
      {/* ── Top bar — logo + Auto/Hands-on toggle ── */}
      <div className="topbar">
        <div className="topbar-dot" />
        <span className="topbar-title">Capability Matcher</span>
        <div className="topbar-divider" />
        <span className="topbar-sub">Deloitte Talent Intelligence</span>

        {/* Mode toggle — switches between Auto (AI picks team) and Hands-on (you pick) */}
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

      {/* ── Step progress bar ── */}
      {/* Each step is idle (grey), active (green), or done (green + checkmark) */}
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

      {/* ── Frame routing ── */}
      {/* Only the active frame renders. State is passed down as props.
          onSelectRole — called by Frame 1 when user clicks a role card
          onBack/onNext — navigation between frames
          In Auto mode, Frame 2's Next button jumps straight to Frame 4 (skips Frame 3) */}
      {frame === 0 && (
        <Frame0
          onSelectProject={(project) => {
            setSelectedProject(project)
            goTo(1)
          }}
        />
      )}

      {frame === 1 && (
        <Frame1
          project={selectedProject}
          onSelectRole={(role, hasAssignment) => {
            setSelectedRole(role)
            setRoleId(role.id)
            if (hasAssignment) {
              setEmpId(null)
              goTo(4)
            } else {
              goTo(2)
            }
          }}
          onBack={() => goTo(0)}
        />
      )}
      {frame === 2 && (
        <Frame2
          roleId={roleId}
          role={selectedRole}
          mode={mode}
          onBack={() => goTo(1)}
          onNext={(id) => { setRoleId(id); goTo(mode === 'auto' ? 4 : 3) }}
        />
      )}
      {frame === 3 && (
        <Frame3
          roleId={roleId}
          projectId={selectedProject?.id}
          onBack={() => goTo(2)}
          onNext={(eid) => { setEmpId(eid); goTo(4) }}
        />
      )}
      {frame === 4 && (
        <Frame4
          roleId={roleId}
          projectId={selectedProject?.id}
          empId={empId}
          mode={mode}
          onBack={() => goTo(mode === 'auto' ? 2 : 3)}
          onBackToRoles={() => goTo(1)}
        />
      )}
    </>
  )
}