// Frame0.jsx — Project list screen (entry point of the app).
//
// What it does:
//   1. On mount, fetches all projects from Supabase belonging to the current user
//   2. Displays them as clickable cards showing name, client, and role count
//   3. User can create a new project via a form panel
//   4. User can edit or delete an existing project
//   5. Clicking a project navigates to Frame 1 (role management for that project)
//
// Props:
//   onSelectProject(project) — called when user clicks a project card

import { useEffect, useState } from 'react'
import { getProjects, createProject, updateProject, deleteProject } from '../api/api'

export default function Frame0({ onSelectProject }) {
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  // Add project form
  const [showForm, setShowForm]     = useState(false)
  const [formError, setFormError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [fields, setFields]         = useState({
    name: '', client: '', description: '', duration: '', start_date: ''
  })

  // Edit state
  const [editingId, setEditingId]   = useState(null)
  const [editFields, setEditFields] = useState({
    name: '', client: '', description: '', duration: '', start_date: ''
  })

  // Load projects
  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const data = await getProjects()
      setProjects(data)
    } catch (e) {
      setError('Could not load projects. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  // Create project
  async function handleCreate() {
    if (!fields.name.trim()) { setFormError('Project name is required.'); return }
    setSaving(true)
    try {
      const project = await createProject(fields)
      setProjects(prev => [project, ...prev])
      setFields({ name: '', client: '', description: '', duration: '', start_date: '' })
      setShowForm(false)
      setFormError('')
    } catch (e) {
      setFormError('Failed to create project. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // Update project
  async function handleUpdate() {
    if (!editFields.name.trim()) { setFormError('Project name is required.'); return }
    setSaving(true)
    try {
      const updated = await updateProject(editingId, editFields)
      setProjects(prev => prev.map(p => p.id === editingId ? { ...p, ...updated } : p))
      setEditingId(null)
      setFormError('')
    } catch (e) {
      setFormError('Failed to update project. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // Delete project
  async function handleDelete(id) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    try {
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      alert('Failed to delete project.')
    }
  }

  if (loading) return <div className="loading">Loading projects...</div>
  if (error)   return <div className="error">{error}</div>

  return (
    <div className="page">
      <div className="page-title">Your Projects</div>
      <div className="page-sub">Select a project to begin capability matching</div>

      {/* Project cards */}
      {projects.length === 0 && !showForm && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          color: '#555', fontSize: 13,
        }}>
          No projects yet. Create one to get started.
        </div>
      )}

      {projects.map(project => (
        <div
          key={project.id}
          className="card"
          style={{ cursor: 'pointer' }}
        >
          {editingId === project.id ? (

            // Edit form
            <div onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', marginBottom: 12 }}>
                Edit project
              </div>
              {formError && <div style={{ fontSize: 11, color: '#e05252', marginBottom: 8 }}>{formError}</div>}
              {[
                { key: 'name', label: 'Project name', required: true },
                { key: 'client', label: 'Client' },
                { key: 'description', label: 'Description' },
                { key: 'duration', label: 'Duration' },
                { key: 'start_date', label: 'Start date' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label style={{
                    fontSize: 10, fontWeight: 600, color: '#888888',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    display: 'block', marginBottom: 5,
                  }}>
                    {f.label} {f.required && <span style={{ color: '#e05252' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    value={editFields[f.key]}
                    onChange={e => { setEditFields(prev => ({ ...prev, [f.key]: e.target.value })); setFormError('') }}
                    style={{
                      width: '100%', background: '#111', border: '1px solid #2a2a2a',
                      borderRadius: 6, padding: '8px 11px', fontSize: 12,
                      color: '#e0e0e0', fontFamily: 'inherit',
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn-primary" onClick={handleUpdate} disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button className="btn-secondary" onClick={() => { setEditingId(null); setFormError('') }}>
                  Cancel
                </button>
              </div>
            </div>

          ) : (

            // Project card view
            <div onClick={() => onSelectProject(project)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#eeeeee', marginBottom: 4 }}>
                    {project.name}
                  </div>
                  {project.client && (
                    <div style={{ fontSize: 11, color: '#888888', marginBottom: 6 }}>
                      {project.client}
                    </div>
                  )}
                  {project.description && (
                    <p style={{ fontSize: 12, color: '#777777', lineHeight: 1.6, marginBottom: 8 }}>
                      {project.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {project.duration && (
                      <span style={{
                        fontSize: 10, background: '#1a1a1a', border: '1px solid #2a2a2a',
                        borderRadius: 4, padding: '2px 8px', color: '#666666',
                      }}>{project.duration}</span>
                    )}
                    {project.start_date && (
                      <span style={{
                        fontSize: 10, background: '#1a1a1a', border: '1px solid #2a2a2a',
                        borderRadius: 4, padding: '2px 8px', color: '#666666',
                      }}>{project.start_date}</span>
                    )}
                    <span style={{
                      fontSize: 10, background: '#1e2a14', border: '1px solid #2a3a18',
                      borderRadius: 4, padding: '2px 8px', color: '#86BC25',
                    }}>
                      {project.roles ? project.roles.length : 0} roles
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div
                  style={{ display: 'flex', gap: 6, marginLeft: 16, flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setEditingId(project.id)
                      setEditFields({
                        name:        project.name || '',
                        client:      project.client || '',
                        description: project.description || '',
                        duration:    project.duration || '',
                        start_date:  project.start_date || '',
                      })
                      setFormError('')
                    }}
                    style={{
                      background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                      color: '#888888', fontSize: 11, padding: '3px 10px',
                      fontFamily: 'inherit', borderRadius: 5,
                    }}
                  >Edit</button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    style={{
                      background: 'none', border: '1px solid #2a2a2a', cursor: 'pointer',
                      color: '#888888', fontSize: 11, padding: '3px 10px',
                      fontFamily: 'inherit', borderRadius: 5,
                    }}
                  >Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Create project form */}
      {showForm && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', marginBottom: 12 }}>
            New project
          </div>
          {formError && <div style={{ fontSize: 11, color: '#e05252', marginBottom: 8 }}>{formError}</div>}
          {[
            { key: 'name', label: 'Project name', required: true },
            { key: 'client', label: 'Client' },
            { key: 'description', label: 'Description' },
            { key: 'duration', label: 'Duration' },
            { key: 'start_date', label: 'Start date' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 10 }}>
              <label style={{
                fontSize: 10, fontWeight: 600, color: '#888888',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                display: 'block', marginBottom: 5,
              }}>
                {f.label} {f.required && <span style={{ color: '#e05252' }}>*</span>}
              </label>
              <input
                type="text"
                value={fields[f.key]}
                onChange={e => { setFields(prev => ({ ...prev, [f.key]: e.target.value })); setFormError('') }}
                style={{
                  width: '100%', background: '#111', border: '1px solid #2a2a2a',
                  borderRadius: 6, padding: '8px 11px', fontSize: 12,
                  color: '#e0e0e0', fontFamily: 'inherit',
                }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create project'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setFormError('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create project button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px dashed #2a2a2a',
            borderRadius: 6, padding: '7px 14px',
            fontSize: 11, color: '#777777',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + New project
        </button>
      )}

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}