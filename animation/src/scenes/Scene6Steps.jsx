import { useT } from "../engine/timeline.js";
import { clamp, ease, lerp, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import { mix } from "../components/util.js";

const GREEN = "#86BC25";
const STEPS = ["Project Overview", "Capability Inference", "Candidate Selection", "Gap Analysis", "Team Report"];

const BAR = { x: 110, y: 52, w: 1700, h: 88 };
const FONT = '500 25px "IBM Plex Sans"';
const CIRCLE = 40;
const GAP = 14; // circle ↔ label
const PAD_X = 26; // inside each slot
const ARROW_W = 44; // space between slots, holds the ›

let layoutCache;

// Slots are sized to their labels using real font metrics, so spacing is even.
// Computed on first render (fonts are loaded before the show mounts).
function getLayout() {
  if (layoutCache) return layoutCache;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = FONT;
  const widths = STEPS.map((s) => PAD_X * 2 + CIRCLE + GAP + ctx.measureText(s).width);
  const total = widths.reduce((a, b) => a + b, 0) + ARROW_W * (STEPS.length - 1);
  let x = (BAR.w - total) / 2;
  layoutCache = widths.map((w) => {
    const slot = { x, w };
    x += w + ARROW_W;
    return slot;
  });
  return layoutCache;
}

/**
 * Product-style progress bar, enlarged. Stays on screen from scene 6 to the
 * end; the highlight lands on step 1, then slides along as the story advances.
 */
export default function Scene6Steps() {
  const t = useT();
  if (t < TL.stepBar[0] || t >= TL.outro[1]) return null;

  const slots = getLayout();
  const barIn = prog(t, TL.stepBar[0], TL.stepBar[1], ease.outCubic);
  const out = prog(t, TL.outro[0], TL.outro[1], ease.inOutCubic);
  const appear = prog(t, TL.hl1[0], TL.hl1[1], ease.outCubic);
  const pos = prog(t, TL.hl2[0], TL.hl2[1], ease.inOutCubic) + prog(t, TL.hl3[0], TL.hl3[1], ease.inOutCubic); // 0 = step 1 … 2 = step 3

  const seg = Math.min(Math.floor(pos), STEPS.length - 2);
  const pill = {
    x: lerp(slots[seg].x, slots[seg + 1].x, pos - seg),
    w: lerp(slots[seg].w, slots[seg + 1].w, pos - seg),
  };

  return (
    <div
      style={{
        position: "absolute",
        left: BAR.x,
        top: BAR.y,
        width: BAR.w,
        height: BAR.h,
        opacity: barIn * (1 - out),
        transform: `translateY(${(1 - barIn) * -30 - out * 24}px)`,
        background: "rgba(13,13,13,0.94)",
        border: "1px solid #2a2a2a",
        borderRadius: 20,
        boxShadow: "0 18px 50px rgba(0,0,0,0.4)",
      }}
    >
      {/* Sliding highlight */}
      <div
        style={{
          position: "absolute",
          left: pill.x,
          top: 12,
          width: pill.w,
          height: BAR.h - 24,
          borderRadius: 14,
          background: "rgba(134,188,37,0.12)",
          border: `1px solid ${GREEN}`,
          boxShadow: "0 0 30px rgba(134,188,37,0.28)",
          opacity: appear,
          transform: `scale(${0.94 + 0.06 * appear})`,
        }}
      />

      {STEPS.map((label, i) => {
        const p = prog(t, TL.steps[i][0], TL.steps[i][1], ease.outCubic);
        const active = appear * Math.max(0, 1 - Math.abs(pos - i));
        const done = clamp(pos - i, 0, 1);
        const lit = Math.min(1, active + done);
        const slot = slots[i];
        return (
          <div key={label}>
            <div
              style={{
                position: "absolute",
                left: slot.x,
                top: 0,
                width: slot.w,
                height: BAR.h,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: GAP,
                opacity: p,
                transform: `translateY(${(1 - p) * -22}px)`,
                filter: p < 1 ? `blur(${(1 - p) * 6}px)` : "none",
              }}
            >
              <div
                style={{
                  width: CIRCLE,
                  height: CIRCLE,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 19,
                  fontWeight: 700,
                  background: mix("#222222", GREEN, lit),
                  color: mix("#707070", "#0a0a0a", lit),
                  flexShrink: 0,
                }}
              >
                {done > 0.5 ? "✓" : i + 1}
              </div>
              <span
                style={{
                  font: FONT,
                  whiteSpace: "nowrap",
                  color: mix(mix("#707070", "#ffffff", active), GREEN, done),
                }}
              >
                {label}
              </span>
            </div>
            {i > 0 && (
              <span
                style={{
                  position: "absolute",
                  left: slot.x - ARROW_W,
                  top: 0,
                  width: ARROW_W,
                  height: BAR.h,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 30,
                  color: "#3a3a3a",
                  opacity: p,
                }}
              >
                ›
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
