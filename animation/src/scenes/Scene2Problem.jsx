import { useT } from "../engine/timeline.js";
import { ease, prog, clamp } from "../engine/easing.js";
import { makeScrollProfile } from "../engine/motion.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import EmployeeRow, { ROW_H } from "../components/EmployeeRow.jsx";
import { featured, shuffledPool } from "../theme.js";
import { H, ROW_K, ROW_PITCH, ROW_RECT, TEXT_W, TEXT_X } from "../layout.js";

const GREEN = "#86BC25";
const TARGET_INDEX = 100; // list index of the featured employee
const START_Y = H + 100; // centre of row 0 at t = scroll start (just below the screen)
const TRAVEL = START_Y - H / 2 + TARGET_INDEX * ROW_PITCH;
const BLUR_PER_PX_S = 1 / 420; // vertical motion blur (std-dev px per px/s)
const profile = makeScrollProfile({ accel: 0.15, decel: 0.5 });

const BODY = [
  "An",
  "organization",
  "may",
  "have",
  { text: "thousands", color: "#fff", weight: 600 },
  { text: "of", color: "#fff", weight: 600 },
  { text: "employees", color: "#fff", weight: 600 },
  "to",
  "choose",
  "from,",
  "and",
  "a",
  "lot",
  "needs",
  "to",
  "be",
  "weighed",
  "up.",
];

const employeeAt = (i) => (i === TARGET_INDEX ? featured : shuffledPool[i % shuffledPool.length]);

export default function Scene2Problem() {
  const t = useT();
  const listGone = TL.morph[0] + 0.9;
  if (t < TL.pIn[0] - 0.1 || t >= listGone) return null;

  const tau = clamp((t - TL.scroll[0]) / (TL.scroll[1] - TL.scroll[0]));
  const scrolled = profile.pos(tau) * TRAVEL;
  const speedPxS = (profile.speed(tau) * TRAVEL) / (TL.scroll[1] - TL.scroll[0]);
  const blur = Math.min(18, speedPxS * BLUR_PER_PX_S);

  const selected = prog(t, TL.select[0], TL.select[1], ease.outCubic);
  const othersOut = prog(t, TL.morph[0], TL.morph[0] + 0.7, ease.inOutCubic);

  const cyOf = (i) => START_Y + i * ROW_PITCH - scrolled;
  const margin = ROW_H * ROW_K;
  const first = Math.max(0, Math.ceil((-margin - START_Y + scrolled) / ROW_PITCH));
  const last = Math.floor((H + margin - START_Y + scrolled) / ROW_PITCH);

  const rows = [];
  for (let i = first; i <= last; i++) {
    const isTarget = i === TARGET_INDEX;
    if (isTarget && t >= TL.morph[0]) continue; // scene 3 takes over the featured row
    const emp = employeeAt(i);
    const cy = cyOf(i);
    const away = Math.sign(cy - H / 2) * 50 * othersOut;
    rows.push(
      <div
        key={i}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${ROW_RECT.x}px, ${cy - (ROW_H * ROW_K) / 2 + (isTarget ? 0 : away)}px) scale(${ROW_K})`,
          transformOrigin: "0 0",
          opacity: isTarget ? 1 : 1 - othersOut,
        }}
      >
        <EmployeeRow emp={emp} selected={isTarget ? selected : 0} />
      </div>,
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="vblur" x="-5%" y="-10%" width="110%" height="120%">
          <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
        </filter>
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: blur > 0.4 ? "url(#vblur)" : "none",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
        }}
      >
        {rows}
      </div>

      <div
        style={{
          position: "absolute",
          left: TEXT_X,
          top: 0,
          bottom: 0,
          width: TEXT_W,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Words
          words={["Problem:"]}
          t={t}
          window={[TL.pIn[0], TL.pIn[0] + 0.8]}
          exit={TL.pOut}
          style={{ fontSize: 40, fontWeight: 600, color: GREEN, letterSpacing: "0.02em", marginBottom: 18 }}
        />
        <Words
          words={BODY}
          t={t}
          window={[TL.pIn[0] + 0.3, TL.pIn[1] + 0.3]}
          exit={TL.pOut}
          perWord={0.07}
          wordDur={0.7}
          style={{ fontSize: 52, fontWeight: 400, lineHeight: 1.3, color: "#a8a8a8", letterSpacing: "-0.01em" }}
        />
      </div>
    </div>
  );
}
