export default function Frame4({ roleId, empId, onBack }) {
  return (
    <div className="page">
      <div className="page-title">Gap analysis</div>
      <div className="page-sub">Role: {roleId} · Employee: {empId}</div>
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}