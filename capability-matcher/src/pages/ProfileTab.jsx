function formatRoleLabel(role) {
  const normalizedRole = String(role || 'Employee').toLowerCase()
  if (normalizedRole === 'admin') return 'Resource Manager'
  if (normalizedRole === 'manager') return 'Manager'
  if (normalizedRole === 'employee') return 'Employee'
  return role || 'Employee'
}

export default function ProfileTab({ profile }) {
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ') || 'User'

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-head">
        <span className="card-title">Profile overview</span>
        <span className="badge badge-green">{formatRoleLabel(profile?.role)}</span>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <p style={{ color: '#aaaaaa', fontSize: 12, marginBottom: 4 }}>Full name</p>
          <p style={{ color: '#f0f0f0', fontSize: 14, fontWeight: 600 }}>{fullName}</p>
        </div>

        <div>
          <p style={{ color: '#aaaaaa', fontSize: 12, marginBottom: 4 }}>Role</p>
          <p style={{ color: '#f0f0f0', fontSize: 14, fontWeight: 600 }}>{formatRoleLabel(profile?.role)}</p>
        </div>

        <div>
          <p style={{ color: '#aaaaaa', fontSize: 12, marginBottom: 4 }}>Employee ID</p>
          <p style={{ color: '#f0f0f0', fontSize: 14, fontWeight: 600 }}>{profile?.employee_id || '—'}</p>
        </div>
      </div>
    </div>
  )
}
