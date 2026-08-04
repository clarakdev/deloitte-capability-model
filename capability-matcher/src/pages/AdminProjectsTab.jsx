import { useEffect, useState } from 'react'
import { getAllProjects } from '../api/api'

// Adds a stable fallback label for project ownership so admin cards remain
// readable even when the creator profile information is not populated.
function getCreatorLabel(project) {
  return project?.created_by_name || project?.created_by || 'Resource Management Team'
}

export default function AdminProjectsTab() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadProjects() {
      try {
        const data = await getAllProjects()
        if (!isMounted) return
        setProjects(data || [])
        setError('')
      } catch (err) {
        if (!isMounted) return
        setError(err?.message || 'Unable to load the projects directory.')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadProjects()

    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 0 }}>
        <p style={{ color: '#aaaaaa', fontSize: 13 }}>Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card" style={{ marginBottom: 0 }}>
        <p style={{ color: '#e05252', fontSize: 13 }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-head">
        <span className="card-title">All Projects</span>
        <span className="badge badge-green">{projects.length} total</span>
      </div>

      {projects.length === 0 ? (
        <p style={{ color: '#aaaaaa', fontSize: 13 }}>No projects are available in the directory.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {projects.map((project) => (
            <div key={project.id} style={{ border: '1px solid #2a2a2a', borderRadius: 8, padding: 14 }}>
              <div className="card-head" style={{ marginBottom: 8 }}>
                <span className="card-title">{project.name}</span>
                <span className="badge badge-green">{project.roles?.length || 0} roles</span>
              </div>
              <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 6 }}>{project.client || 'Client not specified'}</p>
              <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 6 }}>
                {project.description || 'No project description provided.'}
              </p>
              <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 4 }}>
                Duration: {project.duration || '—'} • Start: {project.start_date || '—'}
              </p>
              <p style={{ color: '#aaaaaa', fontSize: 13 }}>
                Created by: {getCreatorLabel(project)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
