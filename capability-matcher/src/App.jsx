import { useState } from 'react'
import Frame1 from './pages/Frame1'
import Frame2 from './pages/Frame2'
import Frame3 from './pages/Frame3'
import Frame4 from './pages/Frame4'
import './App.css'

const STEPS = [
  { num: 1, label: 'Project setup' },
  { num: 2, label: 'Skill requirements' },
  { num: 3, label: 'Select team' },
  { num: 4, label: 'Gap analysis' },
]

export default function App() {
  const [frame, setFrame]   = useState(1)
  const [roleId, setRoleId] = useState(null)
  const [empId, setEmpId]   = useState(null)
  const [mode, setMode]     = useState('hands') // 'auto' | 'hands'

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
              color:      mode === 'auto' ? '#0a0a0a'  : '#555',
            }}>Auto</button>
          <button
            onClick={() => setMode('hands')}
            style={{
              padding: '4px 14px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              background: mode === 'hands' ? '#86BC25' : 'transparent',
              color:      mode === 'hands' ? '#0a0a0a'  : '#555',
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

      {frame === 1 && (
        <Frame1
          onSelectRole={(id) => { setRoleId(id); goTo(2) }}
        />
      )}
      {frame === 2 && (
        <Frame2
          roleId={roleId}
          mode={mode}
          onBack={() => goTo(1)}
          onNext={(id) => { setRoleId(id); goTo(mode === 'auto' ? 4 : 3) }}
        />
      )}
      {frame === 3 && (
        <Frame3
          roleId={roleId}
          onBack={() => goTo(2)}
          onNext={(eid) => { setEmpId(eid); goTo(4) }}
        />
      )}
      {frame === 4 && (
        <Frame4
          roleId={roleId}
          empId={empId}
          mode={mode}
          onBack={() => goTo(mode === 'auto' ? 2 : 3)}
        />
      )}
    </>
  )
}