// Frame2.jsx — Skill requirements screen (Step 2 of 4).
//
// What it does:
//   1. On mount, calls getCapabilities(roleId) → GET /roles/{id}/capabilities
//      The backend auto-infers the top 5 ESCO skills using AI on the first call.
//      Subsequent calls return the current edited list (stored in backend memory).
//   2. Displays each capability with its name, ESCO description, and a weight
//      slider (1–5). The user can adjust weights, remove skills, or add new ones.
//   3. Adding a skill: user types in the search box → searchEsco(q) hits
//      GET /esco/search?q=... → results appear → user clicks one to add it.
//   4. In Auto mode, Next jumps straight to Frame 4 (backend picks best candidate).
//      In Hands-on mode, Next goes to Frame 3 (user picks manually).
//
// Props:
//   roleId        — e.g. "ROLE001", set in Frame 1
//   mode          — "auto" | "hands" (controls what the Next button says)
//   onBack()      — navigate back to Frame 1
//   onNext(id)    — navigate to Frame 3 or 4

import { useEffect, useState } from 'react'
import {
  getCapabilities,
  updateCapability,
  deleteCapability,
  addCapability,
  searchEsco,
} from '../api/api'

export default function Frame2({ roleId, mode, onBack, onNext }) {
  // caps    — the current list of capabilities for this role
  // loading — true while the initial fetch is running
  // error   — error message if the fetch fails
  const [caps, setCaps]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Search box state
  // query        — what the user has typed in the search box
  // searchResults — list of ESCO skills returned from the backend search
  // searching    — true while the search fetch is in progress
  const [query, setQuery]             = useState('')
  const [searchResults, setResults]   = useState([])
  const [searching, setSearching]     = useState(false)

  // saving — tracks which capId is currently being saved (shows a spinner on that row)
  const [saving, setSaving] = useState(null)

  // ── Load capabilities on mount ──────────────────────────────────────────
  // Runs once when Frame 2 first appears. Triggers AI inference on the backend
  // if this is the first time this role's capabilities have been requested.
  useEffect(() => {
    getCapabilities(roleId)
      .then(setCaps)
      .catch(() => setError('Could not load capabilities. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [roleId])

  // ── Weight change ───────────────────────────────────────────────────────
  // Called when the user moves a weight slider.
  // Sends PUT /roles/{roleId}/capabilities/{capId} with the new weight.
  // Updates the local caps list immediately so the UI feels instant.
  async function handleWeightChange(capId, newWeight) {
    setSaving(capId)
    try {
      const updated = await updateCapability(roleId, capId, { weight: newWeight })
      setCaps(updated)
    } catch {
      alert('Failed to update weight.')
    } finally {
      setSaving(null)
    }
  }

  // ── Remove capability ───────────────────────────────────────────────────
  // Sends DELETE /roles/{roleId}/capabilities/{capId}.
  // Backend returns the new list (without the deleted item) which we store.
  async function handleRemove(capId) {
    setSaving(capId)
    try {
      const updated = await deleteCapability(roleId, capId)
      setCaps(updated)
    } catch {
      alert('Failed to remove capability.')
    } finally {
      setSaving(null)
    }
  }

  // ── ESCO search ─────────────────────────────────────────────────────────
  // Called when user types in the search box and presses Enter or clicks Search.
  // Hits GET /esco/search?q=... on the backend.
  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const results = await searchEsco(query)
      setResults(results)
    } catch {
      alert('Search failed.')
    } finally {
      setSearching(false)
    }
  }

  // ── Add capability from search results ──────────────────────────────────
  // Called when user clicks a skill in the search results list.
  // Sends POST /roles/{roleId}/capabilities with the skill's ESCO URI.
  // Backend returns the full updated list, which we store.
  // Clears the search box and results after adding.
  async function handleAdd(skill) {
    try {
      const updated = await addCapability(roleId, skill.concept_uri, 3)
      setCaps(updated)
      setQuery('')
      setResults([])
    } catch (e) {
      // 409 means the skill is already in the list
      if (e.message.includes('409')) {
        alert('That skill is already in the list.')
      } else {
        alert('Failed to add capability.')
      }
    }
  }

  if (loading) return <div className="loading">Loading capabilities...</div>
  if (error)   return <div className="error">{error}</div>

  return (
    <div className="page">
      <div className="page-title">Skill requirements</div>
      <div className="page-sub">
        AI-suggested skills for this role — adjust weights, remove, or add from ESCO
      </div>

      {/* ── Capability list ── */}
      {/* One card per capability. Each shows the skill name, ESCO description,
          a weight slider, and a remove button. */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Required capabilities</span>
          <span className="badge badge-green">{caps.length} skills</span>
        </div>

        {caps.length === 0 && (
          <div style={{ color: 'var(--muted2)', fontSize: 13, padding: '8px 0' }}>
            No capabilities yet. Add one using the search below.
          </div>
        )}

        {caps.map((cap) => (
          <div
            key={cap.cap_id}
            style={{
              padding: '12px 0',
              borderBottom: '1px solid #1e1e1e',
            }}
          >
            {/* Row 1: skill name + is_inferred badge + remove button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#d0d0d0' }}>
                {cap.name}
              </span>

              {/* Badge shows whether this skill was auto-inferred by AI or added manually */}
              {cap.is_inferred
                ? <span className="badge badge-green">AI suggested</span>
                : <span className="badge badge-blue">Manual</span>
              }

              {/* Remove button — disabled while a save is in progress on this row */}
              <button
                onClick={() => handleRemove(cap.cap_id)}
                disabled={saving === cap.cap_id}
                style={{
                  background: 'none', border: 'none', color: '#444',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px',
                }}
                title="Remove skill"
              >✕</button>
            </div>

            {/* Full ESCO description — always visible */}
            {cap.esco_description && (
            <p style={{
                fontSize: 11, color: '#777', lineHeight: 1.7,
                marginBottom: 10,
                paddingLeft: 10,
                borderLeft: '2px solid #2a2a2a',
            }}>
                {cap.esco_description}
            </p>
            )}

            {/* Row 3: weight slider
                The weight (1–5) controls how much this skill influences the
                candidate ranking. Higher weight = this skill matters more. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 42 }}>Weight</span>
              <input
                type="range"
                min={1} max={5} step={1}
                defaultValue={cap.weight}
                onMouseUp={(e) => handleWeightChange(cap.cap_id, Number(e.target.value))}
                onTouchEnd={(e) => handleWeightChange(cap.cap_id, Number(e.target.value))}
                style={{ flex: 1, accentColor: '#86BC25', height: 3 }}
              />
              {/* Show current weight value. While saving, show a small indicator. */}
              <span style={{ fontSize: 11, fontWeight: 700, color: '#86BC25', minWidth: 14 }}>
                {saving === cap.cap_id ? '…' : cap.weight}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Add skill via ESCO search ── */}
      {/* User types a keyword, clicks Search, then picks from the results list.
          The search hits GET /esco/search?q=... on the backend which does
          text match first, then semantic (AI) fallback if few results found. */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Add a skill</span>
          <span className="badge badge-blue">ESCO search</span>
        </div>

        {/* Search input + button */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search ESCO skills e.g. risk management..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1, background: '#111', border: '1px solid #252525',
              borderRadius: 6, padding: '8px 11px', fontSize: 12,
              color: '#bbb', fontFamily: 'inherit',
            }}
          />
          <button
            className="btn-primary"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Search results list */}
        {/* Each result shows the skill name and a short description.
            Clicking it calls handleAdd() which POSTs it to the backend. */}
        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {searchResults.slice(0, 8).map((skill) => (
              <div
                key={skill.concept_uri}
                onClick={() => handleAdd(skill)}
                style={{
                  padding: '9px 12px',
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: 7,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: '#d0d0d0' }}>
                  {skill.preferred_label}
                </span>
                {skill.description && (
                  <span style={{ fontSize: 11, color: '#555' }}>
                    {skill.description.slice(0, 100)}…
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={() => onNext(roleId)}>
          {mode === 'auto' ? 'Run auto-match →' : 'Browse candidates →'}
        </button>
      </div>

      <div className="esco-attribution">
        This service uses the ESCO classification of the European Commission.
      </div>
    </div>
  )
}