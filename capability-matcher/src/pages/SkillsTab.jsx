import { useEffect, useState } from 'react'
import { getMySkills } from '../api/api'

// Uses the current profile to choose a realistic sample skill set for the demo
// instead of a single static preview list.
export default function SkillsTab({ profile }) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formSkill, setFormSkill] = useState('')
  const [formJustification, setFormJustification] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadSkills() {
      try {
        const data = await getMySkills(profile)
        if (!isMounted) return
        setSkills(data || [])
        setError('')
      } catch (err) {
        if (!isMounted) return
        setError(err?.message || 'Unable to load your skills right now.')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadSkills()

    return () => {
      isMounted = false
    }
  }, [profile])

  async function handleSubmitRequest(event) {
    event.preventDefault()

    const payload = {
      skill: formSkill.trim(),
      justification: formJustification.trim(),
    }

    console.log('Update Skill Request submitted:', payload)

    setFormSkill('')
    setFormJustification('')
    setSuccessMessage('Your skill update request has been logged. We will review it shortly.')
  }

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
        <span className="card-title">My Skills</span>
        <span className="badge badge-green">{skills.length} tracked</span>
      </div>

      {skills.length === 0 ? (
        <p style={{ color: '#aaaaaa', fontSize: 13, marginBottom: 16 }}>
          No skills are currently surfaced for this profile record.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          {skills.map((skill, index) => (
            <div key={`${skill}-${index}`} style={{ border: '1px solid #2a2a2a', borderRadius: 8, padding: 10 }}>
              <span style={{ color: '#f0f0f0', fontSize: 13, fontWeight: 600 }}>{skill}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 16 }}>
        <div className="card-head" style={{ marginBottom: 12 }}>
          <span className="card-title">Update Skill Request</span>
          <span className="badge badge-green">Request</span>
        </div>

        {successMessage ? (
          <p style={{ color: '#86BC25', fontSize: 13, marginBottom: 12 }}>{successMessage}</p>
        ) : null}

        <form onSubmit={handleSubmitRequest} style={{ display: 'grid', gap: 12 }}>
          <label htmlFor="skillRequestInput" style={{ fontSize: 12, fontWeight: 600, color: '#c8c8c8' }}>
            Skill
          </label>
          <input
            id="skillRequestInput"
            type="text"
            value={formSkill}
            onChange={(event) => setFormSkill(event.target.value)}
            placeholder="Enter a skill to update"
            required
            style={{
              background: '#0a0a0a',
              color: '#f0f0f0',
              border: '1px solid #2a2a2a',
              borderRadius: 7,
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          />

          <label htmlFor="skillRequestText" style={{ fontSize: 12, fontWeight: 600, color: '#c8c8c8' }}>
            Justification
          </label>
          <textarea
            id="skillRequestText"
            value={formJustification}
            onChange={(event) => setFormJustification(event.target.value)}
            placeholder="Explain why this skill update is needed"
            rows={4}
            required
            style={{
              background: '#0a0a0a',
              color: '#f0f0f0',
              border: '1px solid #2a2a2a',
              borderRadius: 7,
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: 13,
              resize: 'vertical',
            }}
          />

          <button type="submit" className="btn-primary">
            Submit Request
          </button>
        </form>
      </div>
    </div>
  )
}
