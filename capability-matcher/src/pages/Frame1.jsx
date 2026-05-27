// Frame1.jsx — Project overview screen (Step 1 of 4).
//
// What it does:
//   1. On mount, calls getProject() which hits GET /project on the backend
//   2. The backend reads data/project.json and returns the project + 5 roles
//   3. Displays the project name, description, and a clickable card per role
//   4. When a role card is clicked, calls onSelectRole(roleId) which tells
//      App.jsx to store that roleId and navigate to Frame 2
//
// Props:
//   onSelectRole(roleId) — called when user clicks a role, e.g. "ROLE001"

import { useEffect, useState } from 'react'
import { getProject } from '../api/api'

// Visual colour coding for each role card avatar
// One entry per role — bg is the circle background, color is the text/icon colour
const ROLE_COLORS = [
  { bg: '#1e2a14', color: '#86BC25', initials: 'SA' },
  { bg: '#0d1f33', color: '#5b9bd5', initials: 'DE' },
  { bg: '#1c0d33', color: '#9b6dd4', initials: 'CL' },
  { bg: '#2a1800', color: '#d4922a', initials: 'CA' },
  { bg: '#2a0d0d', color: '#e05252', initials: 'PM' },
]

export default function Frame1({ onSelectRole }) {
  // project — holds the data returned from GET /project once loaded
  // loading  — true while the fetch is in progress (shows a spinner message)
  // error    — holds an error message if the fetch fails
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Tracks which role row is expanded (by role id, or null if none)
  const [expanded, setExpanded] = useState(null)
  
  // useEffect with empty [] runs once when the component first mounts.
  // This is where we fetch the project data from the backend.
  useEffect(() => {
    getProject()
      .then(setProject)
      .catch(() => setError('Could not load project. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [])
  
  // Show loading/error states before rendering the real content
  if (loading) return <div className="loading">Loading project...</div>
  if (error)   return <div className="error">{error}</div>

  return (
    <div className="page">
      <div className="page-title">{project.name}</div>
      <div className="page-sub">Select a role to begin capability matching</div>
      
      {/* Project description card */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Project overview</span>
          <span className="badge badge-blue">Sprint 1 demo</span>
        </div>
        <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7 }}>{project.description}</p>
      </div>

      {/* Roles list — one row per role, clicking any row selects that role */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Roles required</span>
          <span className="badge badge-green">{project.roles.length} roles</span>
        </div>
        {project.roles.map((role, i) => {
          const c = ROLE_COLORS[i % ROLE_COLORS.length]
          const isExpanded = expanded === role.id

          return (
            <div
              key={role.id}
              style={{
                borderBottom: i < project.roles.length - 1 ? '1px solid #1f1f1f' : 'none',
              }}
            >
              {/* Entire row is clickable — toggles expanded state */}
              <div
                onClick={() => setExpanded(isExpanded ? null : role.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 0',
                  cursor: 'pointer',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: c.bg, color: c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{c.initials}</div>

                {/* Title only — no preview text, description shows when expanded */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#d0d0d0' }}>
                    {role.title}
                  </div>
                </div>

                {/* Chevron — rotates when expanded */}
                <span style={{
                  color: '#555', fontSize: 14,
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>›</span>
              </div>

              {/* Expanded content — full description + start button */}
              {isExpanded && (
                <div style={{ paddingBottom: 16, paddingLeft: 50 }}>
                  <p style={{
                    fontSize: 12, color: '#888', lineHeight: 1.8,
                    borderLeft: '2px solid #2a2a2a',
                    paddingLeft: 12, marginBottom: 14,
                  }}>
                    {role.description}
                  </p>
                  <button
                    className="btn-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectRole(role.id)
                    }}
                    style={{ fontSize: 11, padding: '7px 16px' }}
                  >
                    Start matching this role →
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Required ESCO attribution — must appear on any screen using ESCO data */}
      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}