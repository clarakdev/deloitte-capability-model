import { useEffect, useState } from 'react'
import { getAllEmployees } from '../api/api'

// Renders a lightweight employee summary card once an admin expands a row,
// keeping the directory view clean while still surfacing the role and skill fit.
const roleSkillPreview = {
  admin: ['Cloud Architecture', 'Risk Management', 'Stakeholder Reporting'],
  manager: ['Project Management', 'Data Analysis', 'Stakeholder Communication'],
  employee: ['React', 'Python', 'Data Analysis'],
}

export default function AdminEmployeesTab() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadEmployees() {
      try {
        const data = await getAllEmployees()
        if (!isMounted) return
        setEmployees(data || [])
        setError('')
      } catch (err) {
        if (!isMounted) return
        setError(err?.message || 'Unable to load the employee directory.')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadEmployees()

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
        <span className="card-title">All Employees</span>
        <span className="badge badge-green">{employees.length} total</span>
      </div>

      {employees.length === 0 ? (
        <p style={{ color: '#aaaaaa', fontSize: 13 }}>No employees are available in the directory.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {employees.map((employee) => {
            const roleName = employee.role || 'Employee'
            const roleSkills = roleSkillPreview[String(roleName).toLowerCase()] || roleSkillPreview.employee
            const isExpanded = expandedEmployeeId === employee.id

            return (
              <div key={employee.id} style={{ border: '1px solid #2a2a2a', borderRadius: 8, padding: 14 }}>
                <button
                  type="button"
                  onClick={() => setExpandedEmployeeId(isExpanded ? null : employee.id)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">{employee.first_name || ''} {employee.last_name || ''}</span>
                    <span className="badge badge-green">{roleName}</span>
                  </div>
                  <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 6 }}>
                    Employee ID: {employee.employee_id || '—'}
                  </p>
                </button>

                {isExpanded && (
                  <div
                    style={{
                      marginTop: 12,
                      border: '1px solid #2a2a2a',
                      borderRadius: 8,
                      padding: 12,
                      background: '#171717',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ color: '#f0f0f0', fontSize: 12, fontWeight: 700 }}>Summary</span>
                      <span className="badge badge-green">{roleName}</span>
                    </div>
                    <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 10 }}>
                      Assigned role: <span style={{ color: '#f0f0f0' }}>{roleName}</span>
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {roleSkills.map((skill) => (
                        <span key={skill} className="badge badge-blue" style={{ fontSize: 10 }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
