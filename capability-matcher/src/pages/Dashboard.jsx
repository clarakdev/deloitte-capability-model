import { useMemo, useState } from 'react'
import ProfileTab from './ProfileTab'
import ProjectsTab from './ProjectsTab'
import SkillsTab from './SkillsTab'
import AdminProjectsTab from './AdminProjectsTab'
import AdminEmployeesTab from './AdminEmployeesTab'

// Keeps the dashboard shell visually stable for every role and makes the
// account header action area reusable for secure sign-out.
function formatRoleLabel(role) {
  const normalizedRole = String(role || 'Employee').toLowerCase()
  if (normalizedRole === 'admin') return 'Resource Manager'
  if (normalizedRole === 'manager') return 'Manager'
  if (normalizedRole === 'employee') return 'Employee'
  return role || 'Employee'
}

export default function Dashboard({ profile, onStartMatching, onLogout }) {
  const rawRoleLabel = profile?.role || 'Employee'
  const roleLabel = formatRoleLabel(rawRoleLabel)
  const normalizedRole = String(rawRoleLabel).toLowerCase()
  const isManager = normalizedRole === 'manager'
  const isAdmin = normalizedRole === 'admin'

  const [activeTab, setActiveTab] = useState('profile')

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'profile', label: 'Profile' },
      { id: 'projects', label: 'My Projects' },
      { id: 'skills', label: 'My Skills' },
    ]

    if (isManager || isAdmin) {
      baseTabs.push({ id: 'matcher', label: 'Capability Matcher' })
    }

    if (isAdmin) {
      baseTabs.push({ id: 'allProjects', label: 'All Projects' })
      baseTabs.push({ id: 'allEmployees', label: 'All Employees' })
    }

    return baseTabs
  }, [isManager, isAdmin])

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ') || 'User'

  function renderPanelContent() {
    if (activeTab === 'profile') {
      return <ProfileTab profile={profile} />
    }

    if (activeTab === 'projects') {
      return <ProjectsTab />
    }

    if (activeTab === 'skills') {
      return <SkillsTab profile={profile} />
    }

    if (activeTab === 'matcher') {
      return null
    }

    if (activeTab === 'allProjects') {
      return <AdminProjectsTab />
    }

    return <AdminEmployeesTab />
  }

  return (
    <div
      className="page"
      style={{ minHeight: 'calc(100vh - 88px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        className="card dashboard-shell"
        style={{
          width: '100%',
          maxWidth: 960,
          minWidth: 920,
          minHeight: '78vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="card-head" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="page-title">Welcome back</h1>
            <p className="page-sub">{fullName} • {roleLabel}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-green">Dashboard</span>
            <button type="button" className="btn-secondary" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'matcher') {
                    onStartMatching()
                    return
                  }

                  setActiveTab(tab.id)
                }}
                className={isActive ? 'btn-primary' : 'btn-secondary'}
                style={{
                  padding: '8px 14px',
                  minWidth: 118,
                  justifyContent: 'center',
                  borderColor: isActive ? '#86BC25' : '#2a2a2a',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {renderPanelContent()}
      </div>
    </div>
  )
}
