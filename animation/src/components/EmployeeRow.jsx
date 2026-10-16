import { avatarColor, capacityColor, capacityFor, getInitials, scoreColor, scoreOutOfTen } from "../theme.js";
import { mix } from "./util.js";

// Natural (unscaled) size, based on the candidate rows in Frame3.jsx.
export const ROW_W = 640;
export const ROW_H = 64; // plain rows (no fit elements)
export const ROW_H_FIT = 72; // product height with the score bar

const GREEN = "#86BC25";
const METER_W = 150;

/** Five thin bars, one per capability requirement. */
function Meter({ meter }) {
  return (
    <div style={{ width: METER_W, opacity: meter.opacity, display: "flex", flexDirection: "column", gap: 6 }}>
      {meter.fills.map((f, i) => (
        <div key={i} style={{ height: 4, borderRadius: 2, background: "#262626", overflow: "hidden" }}>
          <div style={{ width: `${f * 100}%`, height: "100%", borderRadius: 2, background: GREEN }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Employee row, as in the product's candidate list.
 *  selected: 0..1 green highlight
 *  h:        native height (ROW_H, or ROW_H_FIT to hold the score bar)
 *  capacity: remaining % to show in the availability pill; null hides the pill
 *  onLeave:  show a red "On Leave" pill instead of the capacity
 *  score:    0..1 role fit; shows the thin bar and x/10 badge, revealed by `fit` (0..1)
 *  meter:    { opacity, fills: [5 × 0..1] } – the five-bar capability match (scene 10)
 *  dim:      0..1 opacity multiplier (the product greys out unavailable rows)
 *  ai:       { btn 0..1 (button appears), state 0|1|2 (idle / generating / done), press 0..1 } – "Generate AI report"
 *  pick:     { slot 0..1 (tick circle appears), fill 0..1 (ticked) } – selection circle on the right
 *  joined:   0..1 flattens the bottom corners so an AI report panel can attach below
 */
export default function EmployeeRow({
  emp,
  selected = 0,
  h = ROW_H,
  capacity = capacityFor(emp),
  onLeave = false,
  score = null,
  fit = 1,
  meter = null,
  dim = 1,
  ai = null,
  pick = null,
  joined = 0,
}) {
  const av = avatarColor(emp.id);
  const cap = onLeave ? { bg: "#2a0d0d", color: "#e05252" } : capacityColor(capacity ?? 0);
  const sc = score === null ? null : scoreColor(score);

  return (
    <div
      style={{
        width: ROW_W,
        height: h,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: mix("#161616", "#131a0d", selected),
        border: `1px solid ${mix("#2a2a2a", GREEN, selected)}`,
        borderRadius: 8,
        borderBottomLeftRadius: 8 * (1 - joined),
        borderBottomRightRadius: 8 * (1 - joined),
        boxShadow: selected ? `0 0 ${28 * selected}px rgba(134,188,37,${0.35 * selected})` : "none",
        opacity: dim,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          flexShrink: 0,
          background: av.bg,
          color: av.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {getInitials(emp.name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#d0d0d0" }}>{emp.name}</div>
        <div
          style={{
            fontSize: 11,
            color: "#999999",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {emp.title} · {emp.role_level} · {emp.business_unit} · {emp.location}
        </div>
        {score !== null && (
          <div
            style={{
              height: 3 * fit,
              background: "#1f1f1f",
              borderRadius: 2,
              marginTop: 7 * fit,
              opacity: fit,
              overflow: "hidden",
            }}
          >
            <div style={{ height: 3, borderRadius: 2, width: `${Math.round(score * 100)}%`, background: GREEN }} />
          </div>
        )}
      </div>

      {meter && <Meter meter={meter} />}

      {(score !== null || capacity !== null || onLeave) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 5,
            flexShrink: 0,
            opacity: score === null ? 1 : fit,
          }}
        >
          {sc && (
            <span
              style={{
                background: sc.bg,
                color: sc.color,
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 20,
              }}
            >
              {scoreOutOfTen(score)}/10
            </span>
          )}
          {(capacity !== null || onLeave) && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 10,
                background: cap.bg,
                color: cap.color,
              }}
            >
              {onLeave ? "On Leave" : `${capacity}% available`}
            </span>
          )}
          {ai && ai.btn > 0.01 && (
            <span
              style={{
                display: "block",
                marginTop: 4 * ai.btn,
                height: 25 * ai.btn,
                opacity: ai.btn,
                overflow: "hidden",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: "15px",
                padding: "4px 10px",
                boxSizing: "border-box",
                borderRadius: 10,
                whiteSpace: "nowrap",
                border: `1px solid ${mix("#333333", GREEN, Math.max(ai.state === 2 ? 1 : 0, ai.press))}`,
                background: ai.state === 2 ? "#1e2a14" : mix("#161616", "#1e2a14", ai.press),
                color: ai.state === 2 ? GREEN : mix("#888888", GREEN, ai.press),
                filter: `brightness(${ai.state === 1 ? 0.8 : 1 + 0.2 * ai.press})`,
                transform: `scale(${1 - 0.06 * ai.press})`,
              }}
            >
              {ai.state === 1 ? "Generating…" : ai.state === 2 ? "AI report ✓" : "Generate AI report"}
            </span>
          )}
        </div>
      )}

      {pick && pick.slot > 0.001 && (
        <div
          style={{
            width: 20 * pick.slot,
            marginLeft: -14 * (1 - pick.slot),
            flexShrink: 0,
            overflow: "hidden",
            opacity: pick.slot,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              boxSizing: "border-box",
              border: `1.5px solid ${mix("#2a2a2a", GREEN, pick.fill)}`,
              background: mix("#161616", GREEN, pick.fill),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "#0a0a0a",
            }}
          >
            <span style={{ opacity: pick.fill }}>✓</span>
          </div>
        </div>
      )}
    </div>
  );
}
