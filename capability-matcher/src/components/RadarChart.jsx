// RadarChart.jsx — reusable radar plot with numbered vertices and a linked legend.
//
// Long capability/role names cannot fit around the plot, so each vertex is
// labelled with a number and the full names live in a legend beside (or below,
// on narrow containers) the chart. Hovering or focusing a vertex or a legend row
// highlights the matching pair, and a caption under the plot shows the full name
// so the link is visible even when the legend has wrapped out of view.

import { useState } from "react";

const VIEW_SIZE = 260;
const CENTER = VIEW_SIZE / 2;
const RADIUS = VIEW_SIZE / 2 - 30;
const GRID_LEVELS = [0.2, 0.4, 0.6, 0.8, 1];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function pointAt(index, count, scale) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * scale,
    y: CENTER + Math.sin(angle) * RADIUS * scale,
  };
}

function ringPoints(count, scale) {
  return Array.from({ length: count }, (_, index) => {
    const point = pointAt(index, count, scale);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function badgeSize(count) {
  if (count <= 12) return { r: 8.5, font: 9 };
  if (count <= 20) return { r: 7.5, font: 8 };
  return { r: 6, font: 6.5 };
}

/**
 * items: [{ key, label, sublabel?, value (0–1), displayValue, color }]
 * threshold: optional 0–1 value drawn as a dashed reference ring.
 * onItemClick: optional; makes legend rows and vertices clickable.
 */
export default function RadarChart({
  items = [],
  ariaLabel = "Radar chart",
  threshold = null,
  thresholdLabel = "",
  onItemClick = null,
  emptyText = "No data to plot.",
  hint = "Hover a point or row to see details",
}) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (items.length === 0) {
    return <div style={{ color: "var(--muted2)", fontSize: 12 }}>{emptyText}</div>;
  }

  const count = items.length;
  const canPlot = count >= 3;
  const badge = badgeSize(count);
  const activeItem = activeIndex !== null ? items[activeIndex] : null;
  const dataPolygon = items
    .map((item, index) => {
      const point = pointAt(index, count, clamp01(item.value));
      return `${point.x},${point.y}`;
    })
    .join(" ");
  const clickable = typeof onItemClick === "function";

  function deactivate() {
    setActiveIndex(null);
  }

  function handleKey(event, item) {
    if (!clickable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onItemClick(item);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: "0 0 260px", maxWidth: "100%", margin: "0 auto" }}>
        {canPlot ? (
          <svg
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
            role="img"
            aria-label={ariaLabel}
            style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
            onMouseLeave={deactivate}
          >
            {GRID_LEVELS.map((scale) => (
              <polygon
                key={scale}
                points={ringPoints(count, scale)}
                fill={scale === 1 ? "#141414" : "none"}
                stroke="var(--border)"
                strokeWidth="1"
              />
            ))}

            {threshold !== null && (
              <polygon
                points={ringPoints(count, clamp01(threshold))}
                fill="none"
                stroke="#e05252"
                strokeOpacity="0.55"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {items.map((item, index) => {
              const end = pointAt(index, count, 1);
              const isActive = index === activeIndex;
              return (
                <line
                  key={`spoke-${item.key}`}
                  x1={CENTER}
                  y1={CENTER}
                  x2={end.x}
                  y2={end.y}
                  stroke={isActive ? item.color || "var(--green)" : "var(--border)"}
                  strokeWidth={isActive ? 1.5 : 1}
                />
              );
            })}

            <polygon
              points={dataPolygon}
              fill="var(--green)"
              fillOpacity="0.16"
              stroke="var(--green)"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {items.map((item, index) => {
              const point = pointAt(index, count, clamp01(item.value));
              const labelPoint = pointAt(index, count, 1 + (badge.r + 6) / RADIUS);
              const isActive = index === activeIndex;
              const color = item.color || "var(--green)";
              return (
                <g
                  key={`vertex-${item.key}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={clickable ? () => onItemClick(item) : undefined}
                  style={{ cursor: clickable ? "pointer" : "default" }}
                >
                  <title>{`${index + 1}. ${item.label}${item.sublabel ? ` — ${item.sublabel}` : ""}: ${item.displayValue}`}</title>
                  {/* Wide invisible hit area so thin spokes are easy to hover */}
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={labelPoint.x}
                    y2={labelPoint.y}
                    stroke="transparent"
                    strokeWidth="14"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isActive ? 5 : 3.5}
                    fill={color}
                    stroke="#0a0a0a"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={labelPoint.x}
                    cy={labelPoint.y}
                    r={badge.r}
                    fill={isActive ? color : "#1c1c1c"}
                    stroke={color}
                    strokeWidth="1"
                  />
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={badge.font}
                    fontWeight="700"
                    fill={isActive ? "#0a0a0a" : "#d0d0d0"}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div
            style={{
              minHeight: 120,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              color: "var(--muted2)",
              fontSize: 11,
              padding: 12,
            }}
          >
            A radar plot needs at least 3 items — see the list for scores.
          </div>
        )}

        <div
          aria-live="polite"
          style={{
            minHeight: 30,
            marginTop: 6,
            textAlign: "center",
            fontSize: 11,
            lineHeight: 1.35,
            color: activeItem ? "#d0d0d0" : "#666",
          }}
        >
          {activeItem ? (
            <>
              <strong style={{ color: activeItem.color || "var(--green)" }}>
                {activeIndex + 1}.
              </strong>{" "}
              {activeItem.label}
              {activeItem.sublabel && <span style={{ color: "#888" }}> — {activeItem.sublabel}</span>}
              <span style={{ color: activeItem.color || "var(--green)", fontWeight: 700 }}>
                {" "}· {activeItem.displayValue}
              </span>
            </>
          ) : (
            hint
          )}
        </div>

        {threshold !== null && canPlot && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 10,
              color: "#777",
            }}
          >
            <svg width="18" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="18" y2="2" stroke="#e05252" strokeOpacity="0.7" strokeDasharray="3 3" />
            </svg>
            {thresholdLabel}
          </div>
        )}
      </div>

      <ol
        aria-label={`${ariaLabel} legend`}
        onMouseLeave={deactivate}
        style={{
          flex: "1 1 240px",
          minWidth: 0,
          listStyle: "none",
          margin: 0,
          padding: 0,
          maxHeight: count > 9 ? 290 : "none",
          overflowY: count > 9 ? "auto" : "visible",
        }}
      >
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          const color = item.color || "var(--green)";
          return (
            <li
              key={`legend-${item.key}`}
              tabIndex={0}
              role={clickable ? "button" : undefined}
              title={`${item.label}${item.sublabel ? ` — ${item.sublabel}` : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={deactivate}
              onClick={clickable ? () => onItemClick(item) : undefined}
              onKeyDown={(event) => handleKey(event, item)}
              style={{
                display: "grid",
                gridTemplateColumns: "22px minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                background: isActive ? "#1f1f1f" : "transparent",
                cursor: clickable ? "pointer" : "default",
                outline: "none",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: `1px solid ${color}`,
                  background: isActive ? color : "transparent",
                  color: isActive ? "#0a0a0a" : "#d0d0d0",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {index + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#d0d0d0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
                {item.sublabel && (
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      color: "#888",
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.sublabel}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{item.displayValue}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
