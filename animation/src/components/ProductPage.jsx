import { lerp } from "../engine/easing.js";

// Product pages (Frames 1 and 2) are drawn at their native CSS sizes inside a
// framed "screen" which is then scaled up as a whole, so proportions match the app.
export const PAGE_W = 760; // native px, including the frame padding
export const PAGE_K = 1.2; // scale to stage pixels
export const PAGE_X = 1830 - PAGE_W * PAGE_K;
export const PAGE_Y = 178;

const GREEN = "#86BC25";

/**
 * Framed product screen.
 *  enter: 0..1 slide/fade-in progress   leave: 0..1 slide/fade-out progress
 *  height: native px (omit to size to content)
 */
export function PageFrame({ enter = 1, leave = 0, height, children }) {
  const vis = enter * (1 - leave);
  const dx = lerp(70, 0, enter) + lerp(0, -70, leave);
  const blur = (1 - enter) * 10 + leave * 10;
  return (
    <div
      style={{
        position: "absolute",
        left: PAGE_X,
        top: PAGE_Y,
        width: PAGE_W * PAGE_K,
        opacity: vis,
        transform: `translateX(${dx}px)`,
        filter: blur > 0.2 ? `blur(${blur}px)` : "none",
      }}
    >
      <div
        style={{
          width: PAGE_W,
          height,
          padding: 24,
          transform: `scale(${PAGE_K})`,
          transformOrigin: "0 0",
          background: "#0a0a0a",
          border: "1px solid #2a2a2a",
          borderRadius: 14,
          boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PageTitle({ title, sub }) {
  return (
    <>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#f0f0f0", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#aaaaaa", marginBottom: 20 }}>{sub}</div>
    </>
  );
}

export function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#1c1c1c",
        border: "1px solid #2a2a2a",
        borderRadius: 10,
        padding: "18px 20px",
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, minHeight: 22 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#c8c8c8" }}>{title}</span>
      {children}
    </div>
  );
}

const BADGES = {
  green: { background: "#1e2a14", color: GREEN },
  blue: { background: "#0d1f33", color: "#5b9bd5" },
};

export function Badge({ kind = "green", children }) {
  return (
    <span
      style={{
        ...BADGES[kind],
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 20,
        letterSpacing: "0.03em",
      }}
    >
      {children}
    </span>
  );
}
