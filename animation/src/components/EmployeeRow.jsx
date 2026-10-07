import { avatarColor, capacityColor, capacityFor, getInitials } from "../theme.js";
import { mix } from "./util.js";

// Natural (unscaled) size, based on the candidate rows in Frame3.jsx. The
// role-fit elements (score bar and x/10 badge) are omitted on purpose: the
// list is not tied to any particular role.
export const ROW_W = 640;
export const ROW_H = 64;

/** `selected` is 0..1 – blends the product's idle row into its selected row. */
export default function EmployeeRow({ emp, selected = 0 }) {
  const av = avatarColor(emp.id);
  const remaining = capacityFor(emp);
  const cap = capacityColor(remaining);

  return (
    <div
      style={{
        width: ROW_W,
        height: ROW_H,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: mix("#161616", "#131a0d", selected),
        border: `1px solid ${mix("#2a2a2a", "#86BC25", selected)}`,
        borderRadius: 8,
        boxShadow: selected ? `0 0 ${28 * selected}px rgba(134,188,37,${0.35 * selected})` : "none",
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
      </div>

      <span
        style={{
          flexShrink: 0,
          fontSize: 10,
          padding: "2px 7px",
          borderRadius: 10,
          background: cap.bg,
          color: cap.color,
        }}
      >
        {remaining}% available
      </span>
    </div>
  );
}
