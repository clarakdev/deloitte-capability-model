// Frame1.jsx — Project overview screen (Step 1 of 4).
//
// What it does:
//   1. On mount, calls getProject() which hits GET /project on the backend
//   2. Displays the project name, description, and a clickable card per role
//   3. US105 — Add role: user can add a new role via a form panel.
//      New roles are stored in local React state only (no backend yet).
//      When the backend is ready, addRole() in api.js will replace setLocalRoles().
//   4. When a role card is clicked, calls onSelectRole(roleId) which tells
//      App.jsx to store that roleId and navigate to Frame 2
//
// Props:
//   onSelectRole(roleId) — called when user clicks a role, e.g. "ROLE001"

import { useEffect, useState } from 'react'
import { getProject } from '../api/api'

// Visual colour coding for each role card avatar
const ROLE_COLORS = [
  { bg: '#1e2a14', color: '#86BC25', initials: 'SA' },
  { bg: '#0d1f33', color: '#5b9bd5', initials: 'DE' },
  { bg: '#1c0d33', color: '#9b6dd4', initials: 'CL' },
  { bg: '#2a1800', color: '#d4922a', initials: 'CA' },
  { bg: '#2a0d0d', color: '#e05252', initials: 'PM' },
  { bg: '#082020', color: '#1D9E75', initials: 'NR' },
]

// Generates initials from a role title e.g. "Cloud Architect" → "CA"
function getInitials(title) {
  return title
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function Frame1({ onSelectRole }) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [expanded, setExpanded]     = useState(null)
  const [localRoles, setLocalRoles] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle]       = useState('')
  const [newDesc, setNewDesc]         = useState('')
  const [formError, setFormError]     = useState('')
  const [editingRole, setEditingRole]   = useState(null)  // id of role being edited
  const [editFields, setEditFields]     = useState({ title: '', description: '' })
  const [dragOverId, setDragOverId] = useState(null)  // role being dragged over
  const [dragId, setDragId]         = useState(null)   // role being dragged
  
  useEffect(() => {
    getProject()
      .then(setProject)
      .catch(() => setError('Could not load project. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  // Validates the form, creates a new role object, and adds it to localRoles.
  // The role id is generated locally as a temporary identifier (LOCAL_xxx).
  // When the backend endpoint is ready, this function will be replaced with
  // a call to addRole() from api.js which will persist it server-side.
  function handleAddRole() {
    if (!newTitle.trim()) {
      setFormError('Role title is required.')
      return
    }
    if (!newDesc.trim()) {
    setFormError('Role description is required.')
    return
    }
    const newRole = {
      id:          `LOCAL_${Date.now()}`,
      title:       newTitle.trim(),
      description: newDesc.trim(),
      isLocal:     true,
    }
    setLocalRoles(prev => [...prev, newRole])
    setNewTitle('')
    setNewDesc('')
    setFormError('')
    setShowAddForm(false)
  }

  // Only locally added roles can be removed for now.
  // Backend roles are managed server-side.
  function handleRemoveLocalRole(roleId) {
    setLocalRoles(prev => prev.filter(r => r.id !== roleId))
  }

  // Saves the edited title and description back into localRoles.
  // When the backend is ready, this will call updateRole() from api.js instead.
  function handleSaveEdit() {
    if (!editFields.title.trim()) {
      setFormError('Role title is required.')
      return
    }
    if (!editFields.description.trim()) {
      setFormError('Role description is required.')
      return
    }
    setLocalRoles(prev => prev.map(r =>
      r.id === editingRole
        ? { ...r, title: editFields.title.trim(), description: editFields.description.trim() }
        : r
    ))
    setEditingRole(null)
    setEditFields({ title: '', description: '' })
    setFormError('')
  }

  // Creates a copy of an existing local role with "(copy)" appended to the title.
  // The duplicate does not inherit any capabilities — those are generated fresh.
  // When the backend is ready, this will call duplicateRole() from api.js instead.
  function handleDuplicateRole(role) {
    const duplicate = {
      id:          `LOCAL_${Date.now()}`,
      title:       `${role.title} (copy)`,
      description: role.description,
      isLocal:     true,
    }
    setLocalRoles(prev => [...prev, duplicate])
  }

  // Drag and drop reordering
  // Only local roles can be reordered for now.
  // When the backend is ready, this will call reorderRoles() from api.js.
  // We reorder the full allRoles list but only move local roles backend roles stay fixed at the top.
  function handleDragStart(roleId) {
    setDragId(roleId)
  }

  function handleDragOver(e, roleId) {
    e.preventDefault() // required to allow drop
    setDragOverId(roleId)
  }

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }

    // Only reorder within localRoles
    const from = localRoles.findIndex(r => r.id === dragId)
    const to   = localRoles.findIndex(r => r.id === targetId)

    if (from === -1 || to === -1) {
      // Can't drag backend roles or drag onto backend roles
      setDragId(null)
      setDragOverId(null)
      return
    }

    const reordered = [...localRoles]
    const [moved]   = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    setLocalRoles(reordered)
    setDragId(null)
    setDragOverId(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setDragOverId(null)
  }

  if (loading) return <div className="loading">Loading project...</div>
  if (error)   return <div className="error">{error}</div>

  // Merge backend roles and locally added roles into one list for display
  const allRoles = [...project.roles, ...localRoles]

  return (
    <div className="page">
      <div className="page-title">{project.name}</div>
      <div className="page-sub">Select a role to begin capability matching</div>

      {/* Project description card */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Project overview</span>
        </div>
        <p style={{ fontSize: 13, color: '#cccccc', lineHeight: 1.7 }}>
          {project.description}
        </p>
      </div>

      {/* Roles list */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Roles required</span>
          <span className="badge badge-green">{allRoles.length} roles</span>
        </div>

        {allRoles.map((role, i) => {
          const c = ROLE_COLORS[i % ROLE_COLORS.length]
          const initials = role.isLocal ? getInitials(role.title) : c.initials
          const isExpanded = expanded === role.id

          return (
            <div
              key={role.id}
              draggable={role.isLocal}
              onDragStart={() => handleDragStart(role.id)}
              onDragOver={(e) => handleDragOver(e, role.id)}
              onDrop={() => handleDrop(role.id)}
              onDragEnd={handleDragEnd}
              style={{
                borderBottom: i < allRoles.length - 1 ? '1px solid #1f1f1f' : 'none',
                opacity: dragId === role.id ? 0.4 : 1,
                borderTop: dragOverId === role.id && dragId !== role.id
                  ? '2px solid #86BC25'
                  : '2px solid transparent',
                transition: 'opacity 0.15s',
              }}
            >
              {/* Role row — click to expand */}
              <div
                onClick={() => setExpanded(isExpanded ? null : role.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 0', cursor: 'pointer',
                }}
              >
                {/* Drag handle — only shown for local roles */}
                {role.isLocal && (
                  <span style={{
                    color: '#333', fontSize: 14, cursor: 'grab',
                    flexShrink: 0, userSelect: 'none', paddingRight: 2,
                  }}>⠿</span>
                )}

                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: c.bg, color: c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{initials}</div>

                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: '#eeeeee',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {role.title}
                  </div>
                </div>

                {/* Edit button — only for locally added roles */}
                {role.isLocal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingRole(role.id)
                      setEditFields({ title: role.title, description: role.description })
                      setExpanded(role.id)  // auto-expand so the form appears in context
                    }}
                    style={{
                      background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                      color: '#888888', fontSize: 11, padding: '3px 10px',
                      fontFamily: 'inherit', borderRadius: 5,
                    }}
                    title="Edit role"
                  >Edit</button>
                )}

                {/* Duplicate button — only for locally added roles */}
                {role.isLocal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicateRole(role)
                    }}
                    style={{
                      background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                      color: '#888888', fontSize: 11, padding: '3px 10px',
                      fontFamily: 'inherit', borderRadius: 5,
                    }}
                    title="Duplicate role"
                  >Duplicate</button>
                )}

                {/* Remove button — only for locally added roles */}
                {role.isLocal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveLocalRole(role.id)
                    }}
                    style={{
                      background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                      color: '#888888', fontSize: 11, padding: '3px 10px',
                      fontFamily: 'inherit', borderRadius: 5,
                    }}
                    title="Remove role"
                  >Remove</button>
                )}

                {/* Expand chevron */}
                <span style={{
                  color: '#555', fontSize: 14,
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>›</span>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{ paddingBottom: 16, paddingLeft: 50 }}>
                  {editingRole === role.id ? (

                    // Edit form 
                    <div style={{
                      padding: 16, background: '#141414',
                      border: '1px solid #2a2a2a', borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', marginBottom: 12 }}>
                        Edit role
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <label style={{
                          fontSize: 10, fontWeight: 600, color: '#888888',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          display: 'block', marginBottom: 5,
                        }}>
                          Role title <span style={{ color: '#e05252' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={editFields.title}
                          onChange={e => { setEditFields(f => ({ ...f, title: e.target.value })); setFormError('') }}
                          style={{
                            width: '100%', background: '#111', border: '1px solid #2a2a2a',
                            borderRadius: 6, padding: '8px 11px', fontSize: 12,
                            color: '#e0e0e0', fontFamily: 'inherit',
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{
                          fontSize: 10, fontWeight: 600, color: '#888888',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          display: 'block', marginBottom: 5,
                        }}>
                          Description <span style={{ color: '#e05252' }}>*</span>
                        </label>
                        <textarea
                          value={editFields.description}
                          onChange={e => { setEditFields(f => ({ ...f, description: e.target.value })); setFormError('') }}
                          rows={3}
                          style={{
                            width: '100%', background: '#111', border: '1px solid #2a2a2a',
                            borderRadius: 6, padding: '8px 11px', fontSize: 12,
                            color: '#e0e0e0', fontFamily: 'inherit', resize: 'vertical',
                          }}
                        />
                        {formError && (
                          <div style={{ fontSize: 11, color: '#e05252', marginTop: 4 }}>
                            {formError}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" onClick={handleSaveEdit}>
                          Save changes
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setEditingRole(null)
                            setEditFields({ title: '', description: '' })
                            setFormError('')
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                  ) : (

                    // Normal expanded view
                    <>
                      <p style={{
                        fontSize: 12, color: '#999999', lineHeight: 1.8,
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
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add role form — shown when showAddForm is true */}
        {showAddForm && (
          <div style={{
            marginTop: 16, padding: 16,
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', marginBottom: 12 }}>
              New role
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{
                fontSize: 10, fontWeight: 600, color: '#888888',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                display: 'block', marginBottom: 5,
              }}>
                Role title <span style={{ color: '#e05252' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Business Analyst"
                value={newTitle}
                onChange={e => { setNewTitle(e.target.value); setFormError('') }}
                style={{
                  width: '100%', background: '#111', border: '1px solid #2a2a2a',
                  borderRadius: 6, padding: '8px 11px', fontSize: 12,
                  color: '#e0e0e0', fontFamily: 'inherit',
                }}
              />
              {formError && (
                <div style={{ fontSize: 11, color: '#e05252', marginTop: 4 }}>
                  {formError}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{
                fontSize: 10, fontWeight: 600, color: '#888888',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                display: 'block', marginBottom: 5,
              }}>
                Description <span style={{ color: '#e05252' }}>*</span>
              </label>
              <textarea
                placeholder="Describe the responsibilities and requirements of this role"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={3}
                style={{
                  width: '100%', background: '#111', border: '1px solid #2a2a2a',
                  borderRadius: 6, padding: '8px 11px', fontSize: 12,
                  color: '#e0e0e0', fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleAddRole}>
                Add role
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddForm(false)
                  setNewTitle('')
                  setNewDesc('')
                  setFormError('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add role button — hidden when form is open */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              marginTop: 14,
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none',
              border: '1px dashed #2a2a2a',
              borderRadius: 6, padding: '7px 14px',
              fontSize: 11, color: '#777777',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + Add role
          </button>
        )}
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}