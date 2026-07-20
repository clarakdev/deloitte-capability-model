// Frame1.jsx — Project overview screen (Step 1 of 4).

import { useEffect, useState } from 'react'
import { getRoles, createRole, updateRole, deleteRole, getSavedCapabilities, getAssignment, getProjectAssignments  } from '../api/api'

const ROLE_COLORS = [
  { bg: '#1e2a14', color: '#86BC25', initials: 'SA' },
  { bg: '#0d1f33', color: '#5b9bd5', initials: 'DE' },
  { bg: '#1c0d33', color: '#9b6dd4', initials: 'CL' },
  { bg: '#2a1800', color: '#d4922a', initials: 'CA' },
  { bg: '#2a0d0d', color: '#e05252', initials: 'PM' },
  { bg: '#082020', color: '#1D9E75', initials: 'NR' },
]

function getInitials(title) {
  return title.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Frame1({ project: initialProject, onSelectRole, onBack }) {
  const [project]                       = useState(initialProject)
  const [roles, setRoles]               = useState([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [error, setError]               = useState(null)
  const [expanded, setExpanded]         = useState(null)

  // Add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle]       = useState('')
  const [newDesc, setNewDesc]         = useState('')
  const [formError, setFormError]     = useState('')

  // Edit
  const [editingRole, setEditingRole] = useState(null)
  const [editFields, setEditFields]   = useState({ title: '', description: '' })

  // Drag and drop
  const [dragId, setDragId]       = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  const [assignments, setAssignments]   = useState({}) // roleId -> assignment
  const [savedCaps, setSavedCaps]       = useState({})  // roleId -> caps array

  // Load assignments for this project
  useEffect(() => {
    if (!initialProject?.id) return
    getProjectAssignments(initialProject.id)
      .then(data => {
        const map = {}
        data.forEach(a => { map[a.role_id] = a })
        setAssignments(map)
      })
      .catch(console.error)
  }, [initialProject?.id])

  // Load roles from Supabase
  useEffect(() => {
    if (!initialProject?.id) return
    console.log('Loading roles for project:', initialProject.id)
    getRoles(initialProject.id)
      .then(data => {
        console.log('Roles loaded:', data)
        setRoles(data)
      })
      .catch(e => {
        console.error('Roles error:', e)
        setError('Could not load roles.')
      })
      .finally(() => {
        console.log('Roles loading done')
        setRolesLoading(false)
      })
  }, [initialProject?.id])

  //Add role
  async function handleAddRole() {
    if (!newTitle.trim()) { setFormError('Role title is required.'); return }
    if (!newDesc.trim())  { setFormError('Role description is required.'); return }
    try {
      const newRole = await createRole(initialProject.id, {
        title:       newTitle.trim(),
        description: newDesc.trim(),
        sort_order:  roles.length,
      })
      setRoles(prev => [...prev, newRole])
      setNewTitle('')
      setNewDesc('')
      setFormError('')
      setShowAddForm(false)
    } catch (e) {
      setFormError('Failed to save role. Try again.')
    }
  }

  // Edit role
  async function handleSaveEdit() {
    if (!editFields.title.trim())       { setFormError('Role title is required.'); return }
    if (!editFields.description.trim()) { setFormError('Role description is required.'); return }
    try {
      const updated = await updateRole(editingRole, {
        title:       editFields.title.trim(),
        description: editFields.description.trim(),
      })
      setRoles(prev => prev.map(r => r.id === editingRole ? { ...r, ...updated } : r))
      setEditingRole(null)
      setEditFields({ title: '', description: '' })
      setFormError('')
    } catch (e) {
      setFormError('Failed to update role. Try again.')
    }
  }

  // Remove role
  async function handleRemoveRole(roleId) {
    if (!window.confirm('Remove this role? This cannot be undone.')) return
    try {
      await deleteRole(roleId)
      setRoles(prev => prev.filter(r => r.id !== roleId))
    } catch (e) {
      alert('Failed to delete role. Try again.')
    }
  }

  // Duplicate role
  async function handleDuplicateRole(role) {
    try {
      const duplicate = await createRole(initialProject.id, {
        title:       `${role.title} (copy)`,
        description: role.description,
        sort_order:  roles.length,
      })
      setRoles(prev => [...prev, duplicate])
    } catch (e) {
      alert('Failed to duplicate role. Try again.')
    }
  }

  //Expand role details
  async function handleExpand(roleId) {
    setExpanded(prev => prev === roleId ? null : roleId)
    if (!savedCaps[roleId]) {
      try {
        const caps = await getSavedCapabilities(roleId)
        setSavedCaps(prev => ({ ...prev, [roleId]: caps }))
      } catch (e) {
        console.error('Failed to load caps for role', roleId)
      }
    }
  }

  // Drag and drop reordering
  function handleDragStart(roleId) { setDragId(roleId) }

  function handleDragOver(e, roleId) {
    e.preventDefault()
    setDragOverId(roleId)
  }

  async function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const from = roles.findIndex(r => r.id === dragId)
    const to   = roles.findIndex(r => r.id === targetId)
    if (from === -1 || to === -1) { setDragId(null); setDragOverId(null); return }

    const reordered = [...roles]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    setRoles(reordered)
    setDragId(null)
    setDragOverId(null)

    // Persist new order to Supabase
    // Each role gets an order value based on its new position
    try {
      await Promise.all(
        reordered.map((role, index) => updateRole(role.id, { sort_order: index }))
      )
    } catch (e) {
      alert('Failed to save new order. Try again.')
    }
  }

  function handleDragEnd() { setDragId(null); setDragOverId(null) }

  if (error) return <div className="error">{error}</div>

  return (
    <div className="page">
      <button
        className="btn-secondary"
        onClick={onBack}
        style={{ marginBottom: 16, fontSize: 11, padding: '5px 14px' }}
      >
        Back to projects
      </button>

      <div className="page-title">{project.name}</div>
      <div className="page-sub">Select a role to begin capability matching</div>

      {/* Project description */}
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
          <span className="badge badge-green">{roles.length} roles</span>
        </div>

        {rolesLoading ? (
          <div style={{ fontSize: 12, color: '#555', padding: '12px 0' }}>Loading roles...</div>
        ) : roles.length === 0 ? (
          <div style={{ fontSize: 12, color: '#555', padding: '12px 0' }}>No roles yet. Add one below.</div>
        ) : roles.map((role, i) => {
          const c = ROLE_COLORS[i % ROLE_COLORS.length]
          const isExpanded = expanded === role.id

          return (
            <div
              key={role.id}
              draggable={true}
              onDragStart={() => handleDragStart(role.id)}
              onDragOver={(e) => handleDragOver(e, role.id)}
              onDrop={() => handleDrop(role.id)}
              onDragEnd={handleDragEnd}
              style={{
                borderBottom: i < roles.length - 1 ? '1px solid #1f1f1f' : 'none',
                opacity: dragId === role.id ? 0.4 : 1,
                borderTop: dragOverId === role.id && dragId !== role.id
                  ? '2px solid #86BC25' : '2px solid transparent',
                transition: 'opacity 0.15s',
              }}
            >
              {/* Role row */}
              <div
                onClick={() => handleExpand(role.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 0', cursor: 'pointer',
                }}
              >
                {/* Drag handle */}
                <span style={{
                  color: '#333', fontSize: 14, cursor: 'grab',
                  flexShrink: 0, userSelect: 'none',
                }}>⠿</span>

                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: c.bg, color: c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{getInitials(role.title)}</div>

                {/* Title */}
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#eeeeee' }}>
                  {role.title}
                </div>

                {/* Action buttons */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingRole(role.id)
                    setEditFields({ title: role.title, description: role.description })
                    setExpanded(role.id)
                  }}
                  style={{
                    background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                    color: '#888888', fontSize: 11, padding: '3px 10px',
                    fontFamily: 'inherit', borderRadius: 5,
                  }}
                >Edit</button>

                <button
                  onClick={(e) => { e.stopPropagation(); handleDuplicateRole(role) }}
                  style={{
                    background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                    color: '#888888', fontSize: 11, padding: '3px 10px',
                    fontFamily: 'inherit', borderRadius: 5,
                  }}
                >Duplicate</button>

                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveRole(role.id) }}
                  style={{
                    background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                    color: '#888888', fontSize: 11, padding: '3px 10px',
                    fontFamily: 'inherit', borderRadius: 5,
                  }}
                >Remove</button>

                {/* Chevron */}
                <span style={{
                  color: '#444', fontSize: 12, display: 'inline-block',
                  transition: 'transform 0.2s', marginLeft: 4,
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
                        >Cancel</button>
                      </div>
                    </div>

                  ) : (

                    // Normal view
                    <>
                      {/* Capabilities preview */}
                      {savedCaps[role.id] && savedCaps[role.id].length > 0 ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 600, color: '#888888',
                            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
                          }}>
                            Required capabilities ({savedCaps[role.id].length})
                          </div>
                          {savedCaps[role.id].map(cap => (
                            <div key={cap.cap_id} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 12, color: '#aaaaaa', padding: '3px 0',
                            }}>
                              <span style={{ color: '#86BC25', fontSize: 10 }}>›</span>
                              {cap.name}
                              <span style={{
                                fontSize: 10, background: '#1e2a14', color: '#86BC25',
                                borderRadius: 3, padding: '1px 6px', marginLeft: 'auto',
                              }}>{cap.weight}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{
                          fontSize: 12, color: '#999999', lineHeight: 1.8,
                          borderLeft: '2px solid #2a2a2a',
                          paddingLeft: 12, marginBottom: 14, textAlign: 'left',
                        }}>
                          {role.description}
                        </p>
                      )}

                      {/* Assigned employee */}
                      {assignments[role.id] && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: '#1e2a14', border: '1px solid #2a3a18',
                          borderRadius: 7, padding: '8px 12px', marginBottom: 12,
                        }}>
                          <span style={{ fontSize: 11, color: '#86BC25', fontWeight: 600 }}>
                            {assignments[role.id].employee_name}
                          </span>
                          <span style={{ fontSize: 10, color: '#5a8a00', marginLeft: 'auto' }}>
                            {Math.round(assignments[role.id].match_score * 100)}% match
                          </span>
                        </div>
                      )}

                      {/* Action button — changes based on progress */}
                      {assignments[role.id] ? (
                        // Employee already assigned — show view analysis + option to redo
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn-primary"
                            onClick={(e) => { e.stopPropagation(); onSelectRole(role, true) }}
                            style={{ fontSize: 11, padding: '7px 16px' }}
                          >
                            View analysis →
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={(e) => { e.stopPropagation(); onSelectRole(role, false) }}
                            style={{ fontSize: 11, padding: '7px 16px' }}
                          >
                            Redo matching
                          </button>
                        </div>
                      ) : savedCaps[role.id] && savedCaps[role.id].length > 0 ? (
                        // Capabilities saved but no employee yet
                        <button
                          className="btn-primary"
                          onClick={(e) => { e.stopPropagation(); onSelectRole(role, false) }}
                          style={{ fontSize: 11, padding: '7px 16px' }}
                        >
                          Continue matching →
                        </button>
                      ) : (
                        // Nothing done yet
                        <button
                          className="btn-primary"
                          onClick={(e) => { e.stopPropagation(); onSelectRole(role, false) }}
                          style={{ fontSize: 11, padding: '7px 16px' }}
                        >
                          Match this role →
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add role form */}
        {showAddForm && (
          <div style={{
            marginTop: 16, padding: 16,
            background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
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
              >Cancel</button>
            </div>
          </div>
        )}

        {/* Bottom drop zone — allows dragging to the very end of the list */}
        {dragId && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverId('bottom') }}
            onDrop={() => {
              if (!dragId) return
              const from = roles.findIndex(r => r.id === dragId)
              if (from === -1) { setDragId(null); setDragOverId(null); return }
              const reordered = [...roles]
              const [moved] = reordered.splice(from, 1)
              reordered.push(moved)
              setRoles(reordered)
              setDragId(null)
              setDragOverId(null)
              Promise.all(
                reordered.map((role, index) => updateRole(role.id, { sort_order: index }))
              ).catch(() => alert('Failed to save new order.'))
            }}
            style={{
              height: 24,
              borderTop: dragOverId === 'bottom' ? '2px solid #86BC25' : '2px solid transparent',
              marginTop: 4,
              transition: 'border-color 0.1s',
            }}
          />
        )}

        {/* Add role button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px dashed #2a2a2a',
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