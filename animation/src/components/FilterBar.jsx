import { mix, stagger } from "./util.js";

const GREEN = "#86BC25";

export const LOCATIONS = ["Auckland", "Auckland-North Shore", "Christchurch", "Dunedin", "Hamilton", "Queenstown"];

function Checkbox({ checked }) {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        flexShrink: 0,
        borderRadius: 3,
        border: `1px solid ${mix("#6b6b6b", GREEN, checked)}`,
        background: mix("#141414", GREEN, checked),
        color: "#0a0a0a",
        fontSize: 10,
        fontWeight: 800,
        lineHeight: "11px",
        textAlign: "center",
      }}
    >
      <span style={{ display: "inline-block", opacity: checked, transform: `scale(${0.5 + 0.5 * checked})` }}>✓</span>
    </span>
  );
}

function Toggle({ label, on, enter }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: mix("#1a1a1a", "#1e2a14", on),
        border: `1px solid ${mix("#222222", GREEN, on)}`,
        borderRadius: 7,
        padding: "7px 14px",
        fontSize: 12,
        color: mix("#888888", GREEN, on),
        fontWeight: on > 0.5 ? 600 : 400,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 10}px)`,
        whiteSpace: "nowrap",
      }}
    >
      <Checkbox checked={on} />
      {label}
    </label>
  );
}

function DropdownButton({ label, count, active, enter }) {
  return (
    <div
      style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: mix("#1a1a1a", "#1e2a14", active),
        border: `1px solid ${mix("#222222", GREEN, active)}`,
        borderRadius: 7,
        padding: "7px 14px",
        color: mix("#888888", GREEN, active),
        fontSize: 12,
        fontWeight: active > 0.5 ? 600 : 400,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 10}px)`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {count > 0 && (
        <span
          style={{
            minWidth: 17,
            height: 17,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: GREEN,
            color: "#0a0a0a",
            fontSize: 9,
            fontWeight: 700,
            transform: `scale(${Math.min(1, count)})`,
          }}
        >
          1
        </span>
      )}
      <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
    </div>
  );
}

function LocationDropdown({ open, checked }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        width: 230,
        background: "#161616",
        border: "1px solid #333333",
        borderRadius: 8,
        padding: 8,
        zIndex: 50,
        boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        opacity: open,
        transform: `translateY(${(1 - open) * -8}px)`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderRadius: 6,
          padding: "8px 9px",
          fontSize: 11,
          color: "#666666",
          marginBottom: 6,
        }}
      >
        Search locations...
      </div>
      {LOCATIONS.map((loc, i) => (
        <div
          key={loc}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 6px",
            borderRadius: 5,
            fontSize: 11,
            color: i === 0 && checked > 0.5 ? "#f0f0f0" : "#aaaaaa",
            background: i === 0 ? mix("#161616", "#202020", checked) : "transparent",
          }}
        >
          <Checkbox checked={i === 0 ? checked : 0} />
          <span>{loc}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The four filters from the product's candidate page.
 *  enter:     0..1 appearance progress (staggered per filter)
 *  avail:     0..1 "Available only" ticked
 *  locOpen:   0..1 location dropdown open
 *  locChecked 0..1 first location (Auckland) ticked
 *  locActive: 0..1 location button shows its selected state
 */
export default function FilterBar({ enter, avail, locOpen, locChecked, locActive }) {
  const e = (i) => stagger(enter, i, 4, 0.55);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "nowrap" }}>
      <Toggle label="Available only" on={avail} enter={e(0)} />
      <Toggle label="Prior experience only" on={0} enter={e(1)} />
      <div style={{ position: "relative" }}>
        <DropdownButton label="Location" count={locActive} active={locActive} enter={e(2)} />
        {locOpen > 0.01 && <LocationDropdown open={locOpen} checked={locChecked} />}
      </div>
      <DropdownButton label="Role level" count={0} active={0} enter={e(3)} />
    </div>
  );
}
