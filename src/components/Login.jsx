import React, { useState } from 'react';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Login failed. Please check your credentials.');
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user_role', data.role);
      localStorage.setItem('username', data.username);

      setUsername('');
      setPassword('');
      onLoginSuccess(data.access_token, data.role, data.username);
    } catch (err) {
      setError(err.message || 'Unable to log in right now.');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Sign In</h2>
        <p style={styles.subtitle}>Access the Deloitte capability matching workspace</p>

        {error ? (
          <div style={styles.errorBox} role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label} htmlFor="username">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={styles.input}
            placeholder="Enter your username"
            autoComplete="username"
            required
          />

          <label style={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={styles.input}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />

          <button type="submit" style={styles.button}>
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f3f7ff 0%, #eef2ff 100%)',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 12px 35px rgba(15, 23, 42, 0.12)',
  },
  title: {
    margin: '0 0 8px',
    color: '#0f172a',
    fontSize: '28px',
  },
  subtitle: {
    margin: '0 0 20px',
    color: '#475569',
    fontSize: '14px',
  },
  errorBox: {
    background: '#fee2e2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    padding: '12px 14px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '15px',
    outline: 'none',
  },
  button: {
    marginTop: '8px',
    padding: '12px 16px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};

export function LoginExamplePage() {
  const handleLoginSuccess = (token, role, username) => {
    console.log('Login successful', { token, role, username });
  };

  return <Login onLoginSuccess={handleLoginSuccess} />;
}

export default Login;
