import React, { useEffect, useState } from 'react';
import Login from './components/Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    const storedToken = localStorage.getItem('access_token');
    const storedRole = localStorage.getItem('user_role');
    const storedUsername = localStorage.getItem('username');

    if (storedToken && storedRole && storedUsername) {
      setIsAuthenticated(true);
      setUserRole(storedRole);
      setUsername(storedUsername);
    }
  }, []);

  const handleLoginSuccess = (token, role, currentUsername) => {
    setIsAuthenticated(true);
    setUserRole(role);
    setUsername(currentUsername);
    localStorage.setItem('access_token', token);
    localStorage.setItem('user_role', role);
    localStorage.setItem('username', currentUsername);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('username');
    setIsAuthenticated(false);
    setUserRole('');
    setUsername('');
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Deloitte Capability Matching</h1>
          <p style={styles.subtitle}>Workforce capability insights and role matching</p>
        </div>
        <div style={styles.profileBox}>
          <div>
            <div style={styles.profileName}>{username}</div>
            <div style={styles.profileRole}>{userRole}</div>
          </div>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.content}>
        {/* PANEL 1: CAPABILITY RANKING */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Capability Ranking</h2>
            <span style={styles.badge}>Role-based view</span>
          </div>
          <p style={styles.panelText}>
            This dashboard view is visible after authentication. The current role is passed down to supporting panels so permission-sensitive actions can be hidden or disabled.
          </p>
          <button
            style={{
              ...styles.secondaryButton,
              opacity: userRole === 'Admin' ? 1 : 0.5,
              cursor: userRole === 'Admin' ? 'pointer' : 'not-allowed',
            }}
            disabled={userRole !== 'Admin'}
          >
            Manage Role Capabilities
          </button>
        </section>

        {/* PANEL 2: MATCHING WORKSPACE */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Matching Workspace</h2>
            <span style={styles.badge}>RBAC-aware</span>
          </div>
          <p style={styles.panelText}>
            Use the current role state to conditionally enable or disable actions such as export, editing, or advanced matching features.
          </p>
          <button
            style={{
              ...styles.secondaryButton,
              opacity: ['Admin', 'HR User', 'Project Manager'].includes(userRole) ? 1 : 0.5,
              cursor: ['Admin', 'HR User', 'Project Manager'].includes(userRole) ? 'pointer' : 'not-allowed',
            }}
            disabled={!['Admin', 'HR User', 'Project Manager'].includes(userRole)}
          >
            Open Matching Screen
          </button>
        </section>

        {/* PANEL 3: DEDICATED EMPLOYEE SELF-SERVICE PORTAL */}
        {userRole === 'Employee' && (
          <section style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>My Career Growth</h2>
              <span style={{ ...styles.badge, background: '#e2e8f0', color: '#475569' }}>Self Service</span>
            </div>
            <p style={styles.panelText}>
              View your personal compatibility breakdown against active firm roles and discover targeted ESCO upskilling pathways.
            </p>
            <button style={styles.secondaryButton}>
              View My Skill Gaps
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
    color: '#0f172a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '28px',
  },
  subtitle: {
    margin: '6px 0 0',
    color: '#64748b',
    fontSize: '14px',
  },
  profileBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: '#ffffff',
    borderRadius: '12px',
    padding: '12px 16px',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
  },
  profileName: {
    fontWeight: '700',
    color: '#0f172a',
  },
  profileRole: {
    fontSize: '13px',
    color: '#64748b',
    textTransform: 'capitalize',
  },
  logoutButton: {
    border: 'none',
    borderRadius: '8px',
    background: '#dc2626',
    color: '#ffffff',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  content: {
    display: 'grid',
    gap: '20px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  },
  panel: {
    background: '#ffffff',
    borderRadius: '14px',
    padding: '20px',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.07)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  panelTitle: {
    margin: 0,
    fontSize: '20px',
  },
  badge: {
    background: '#dbeafe',
    color: '#1d4ed8',
    fontSize: '12px',
    fontWeight: '700',
    padding: '4px 8px',
    borderRadius: '999px',
  },
  panelText: {
    color: '#475569',
    lineHeight: 1.5,
    marginBottom: '14px',
  },
  secondaryButton: {
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    padding: '10px 14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default App;