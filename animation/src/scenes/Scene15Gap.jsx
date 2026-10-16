import { useT } from "../engine/timeline.js";
import { ease, lerp, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import GapPanel, { GAP_FRAME_W, GAP_K, GAP_W } from "../components/GapPanel.jsx";
import { GAP_A, GAP_B } from "../story.js";
import { TEXT_W, TEXT_X } from "../layout.js";

// Scenes 15–16: one gap-analysis panel on the right, then it slides left to make room for a second.

const EM = { color: "#fff", weight: 600 };
const PANEL_Y = 250;
const GAP_BETWEEN = 50;
const X_RIGHT = 1830 - GAP_W; // scene 15: right-aligned, text on the left
const X_LEFT = (1920 - (2 * GAP_W + GAP_BETWEEN)) / 2; // scene 16: pair centred
const X_B = X_LEFT + GAP_W + GAP_BETWEEN;

const TEXT_GAP = [
  "Selecting",
  "a",
  "candidate",
  "brings",
  "up",
  "a",
  { text: "full", ...EM },
  { text: "report", ...EM },
  "on",
  "their",
  { text: "skill", ...EM },
  { text: "gaps,", ...EM },
  "points",
  "where",
  "they",
  "may",
  "need",
  { text: "training", ...EM },
  "for",
  "the",
  "role.",
];

const TEXT_CMP = [
  { text: "Two", ...EM },
  { text: "candidates", ...EM },
  "can",
  "be",
  "selected",
  "and",
  "compared",
  { text: "side-by-side.", ...EM },
];

function Frame({ x, enter, leave, leaveDx, children }) {
  const vis = enter * (1 - leave);
  const blur = (1 - enter) * 10 + leave * 10;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: PANEL_Y,
        width: GAP_FRAME_W,
        opacity: vis,
        transform: `translateX(${(1 - enter) * 70 + leave * leaveDx}px) scale(${GAP_K})`,
        transformOrigin: "0 0",
        filter: blur > 0.2 ? `blur(${blur}px)` : "none",
        background: "#0a0a0a",
        border: "1px solid #2a2a2a",
        borderRadius: 14,
        boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </div>
  );
}

export default function Scene15Gap() {
  const t = useT();
  if (t < TL.gapText[0] - 0.1 || t >= TL.cmpOut[1]) return null;

  const leave = prog(t, TL.cmpOut[0], TL.cmpOut[1], ease.inOutCubic);
  const inA = prog(t, TL.gapAIn[0], TL.gapAIn[1], ease.outCubic);
  const inB = prog(t, TL.gapBIn[0], TL.gapBIn[1], ease.outCubic);
  const move = prog(t, TL.moveA[0], TL.moveA[1], ease.inOutCubic);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: TEXT_X,
          top: 150,
          bottom: 0,
          width: TEXT_W,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Words
          words={TEXT_GAP}
          t={t}
          window={TL.gapText}
          exit={TL.gapTextOut}
          perWord={0.09}
          wordDur={0.8}
          style={{ fontSize: 52, fontWeight: 400, lineHeight: 1.3, color: "#a8a8a8", letterSpacing: "-0.01em" }}
        />
      </div>

      {t >= TL.cmpText[0] - 0.1 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 160, display: "flex", justifyContent: "center" }}>
          <Words
            words={TEXT_CMP}
            t={t}
            window={TL.cmpText}
            exit={TL.cmpOut}
            gap="0.28em"
            perWord={0.09}
            wordDur={0.8}
            style={{
              width: 1600,
              justifyContent: "center",
              fontSize: 46,
              fontWeight: 400,
              lineHeight: 1.3,
              color: "#a8a8a8",
              letterSpacing: "-0.01em",
            }}
          />
        </div>
      )}

      <Frame x={lerp(X_RIGHT, X_LEFT, move)} enter={inA} leave={leave} leaveDx={-50}>
        <GapPanel cand={GAP_A} t={t} t0={TL.gapAIn[0]} />
      </Frame>

      {t >= TL.gapBIn[0] - 0.1 && (
        <Frame x={X_B} enter={inB} leave={leave} leaveDx={50}>
          <GapPanel cand={GAP_B} t={t} t0={TL.gapBIn[0]} speed={1.25} />
        </Frame>
      )}
    </div>
  );
}
