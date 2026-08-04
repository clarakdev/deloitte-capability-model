function formatRoleLabel(role) {
  const normalizedRole = String(role || 'Employee').toLowerCase()
  if (normalizedRole === 'admin') return 'Resource Manager'
  if (normalizedRole === 'manager') return 'Manager'
  if (normalizedRole === 'employee') return 'Employee'
  return role || 'Employee'
}

export default function Portal({ profile, onStartMatching }) {
  const rawRoleLabel = profile?.role || 'Employee'
  const roleLabel = formatRoleLabel(rawRoleLabel)
  const isAdmin = String(rawRoleLabel).toLowerCase() === 'admin'
  const isManager = String(rawRoleLabel).toLowerCase() === 'manager'

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 88px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: 560 }}>
        <div className="card-head" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="page-title">Welcome back</h1>
            <p className="page-sub">{profile?.first_name || 'User'} • {roleLabel}</p>
          </div>
          <span className="badge badge-green">Portal</span>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="card-title" style={{ marginBottom: 8 }}>Start Capability Matching</h2>
          <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 16 }}>
            Continue into the existing capability-matching workflow for the selected project and role.
          </p>
          <button className="btn-primary" onClick={onStartMatching}>
            Start Capability Matching
          </button>
        </div>

        {isAdmin ? (
          <p style={{ color: '#aaaaaa', fontSize: 13 }}>
            Resource Manager access allows you to view all projects and all employees.
          </p>
        ) : null}

        {isManager ? (
          <p style={{ color: '#aaaaaa', fontSize: 13 }}>
            Manager access allows you to view only projects you are part of.
          </p>
        ) : null}
      </div>
    </div>
  )
}
