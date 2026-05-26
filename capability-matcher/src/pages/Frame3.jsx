export default function Frame3({ roleId, onBack, onNext }) {
  return (
    <div className="page">
      <div className="page-title">Select team</div>
      <div className="page-sub">Role: {roleId}</div>
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={() => onNext('EMP001')}>Next →</button>
      </div>
    </div>
  )
}