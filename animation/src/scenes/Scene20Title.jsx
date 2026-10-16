import { useT } from "../engine/timeline.js";
import { ease, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";

const GREEN = "#86BC25";

// Closing title, centred. It leaves with the global outro, which returns the show to its blank first frame.
export default function Scene20Title() {
  const t = useT();
  if (t < TL.title[0] - 0.1 || t >= TL.outro[1]) return null;

  const p = prog(t, TL.title[0], TL.title[1], ease.outCubic);
  const out = prog(t, TL.outro[0], TL.outro[1], ease.inOutCubic);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity: p * (1 - out),
          transform: `translateY(${(1 - p) * 40 - out * 30}px) scale(${0.96 + 0.04 * p})`,
          filter: p < 1 || out > 0 ? `blur(${(1 - p) * 12 + out * 12}px)` : "none",
          fontSize: 148,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          color: GREEN,
          whiteSpace: "nowrap",
        }}
      >
        Deloitte Matchmaker
      </div>
    </div>
  );
}
