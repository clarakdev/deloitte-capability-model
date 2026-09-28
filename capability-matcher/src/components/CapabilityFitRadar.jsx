// CapabilityFitRadar.jsx — card showing an employee's per-capability fit for a role.

import RadarChart from "./RadarChart";

export default function CapabilityFitRadar({ fitData = [], colorFor, scoreFor, gapThreshold = 0.6 }) {
  const items = fitData.map((fit, index) => {
    const similarity = Number(fit.similarity) || 0;
    return {
      key: fit.cap_id || `${fit.cap_name || fit.name}-${index}`,
      label: fit.cap_name || fit.name || `Capability ${index + 1}`,
      sublabel: fit.is_gap ? "Gap — upskilling needed" : null,
      value: similarity,
      displayValue: `${scoreFor(similarity)}/5`,
      color: colorFor(similarity, fit.is_gap),
    };
  });

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Capability fit profile</span>
        <span className="badge badge-blue">{items.length} axes</span>
      </div>
      <RadarChart
        items={items}
        ariaLabel="Capability fit radar chart"
        threshold={gapThreshold}
        thresholdLabel={`Gap threshold (${Math.round(gapThreshold * 100)}%)`}
        emptyText="No capability fit data available."
      />
    </div>
  );
}
