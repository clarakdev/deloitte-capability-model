import { clamp, ease, prog } from "../engine/easing.js";

const VIEW = 260;
const C = VIEW / 2;
const R = VIEW / 2 - 30;
const GRID = [0.2, 0.4, 0.6, 0.8, 1];

const at = (i, n, s) => {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return { x: C + Math.cos(a) * R * s, y: C + Math.sin(a) * R * s };
};
const ring = (n, s) =>
  Array.from({ length: n }, (_, i) => {
    const p = at(i, n, s);
    return `${p.x},${p.y}`;
  }).join(" ");

/**
 * The product's radar plot (numbered vertices) with a draw-in animation.
 *  items:     [{ value 0..1, color }]
 *  p:         0..1 draw-in progress (vertices grow outward with a slight stagger)
 *  threshold: optional 0..1 dashed gap ring
 */
export default function Radar({ items, p = 1, size = 240, threshold = null }) {
  const n = items.length;
  const grow = (i) => prog(p, i * 0.05, 0.6 + i * 0.05, ease.outCubic);
  const pts = items.map((it, i) => at(i, n, clamp(it.value) * grow(i)));
  const polygon = pts.map((q) => `${q.x},${q.y}`).join(" ");
  const frame = prog(p, 0, 0.35, ease.outCubic);

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      style={{ width: size, height: size, display: "block", overflow: "visible", flexShrink: 0 }}
    >
      <g opacity={frame}>
        {GRID.map((s) => (
          <polygon key={s} points={ring(n, s)} fill={s === 1 ? "#141414" : "none"} stroke="#2a2a2a" strokeWidth="1" />
        ))}
        {threshold !== null && (
          <polygon
            points={ring(n, threshold)}
            fill="none"
            stroke="#e05252"
            strokeOpacity="0.55"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {items.map((_, i) => {
          const e = at(i, n, 1);
          return <line key={i} x1={C} y1={C} x2={e.x} y2={e.y} stroke="#2a2a2a" strokeWidth="1" />;
        })}
      </g>

      <polygon
        points={polygon}
        fill="#86BC25"
        fillOpacity="0.16"
        stroke="#86BC25"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {items.map((it, i) => {
        const q = pts[i];
        const g = grow(i);
        const label = at(i, n, 1 + (8.5 + 6) / R);
        return (
          <g key={i}>
            <circle cx={q.x} cy={q.y} r={3.5 * g} fill={it.color} stroke="#0a0a0a" strokeWidth="1.5" />
            <g opacity={frame}>
              <circle cx={label.x} cy={label.y} r="8.5" fill="#1c1c1c" stroke={it.color} strokeWidth="1" />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="9"
                fontWeight="700"
                fill="#d0d0d0"
              >
                {i + 1}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
