import { useT } from "../engine/timeline.js";
import { ease, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";

const GREEN = "#86BC25";

const TAGLINE = ["Your", "new", "AI-powered", "tool", "to", "find", "your", "best", "team."];

// Centered announcement. Each line has its own reveal window; all three leave together.
export default function Scene5Present() {
  const t = useT();
  if (t < TL.presentA[0] - 0.1 || t >= TL.presentOut[1]) return null;

  const out = prog(t, TL.presentOut[0], TL.presentOut[1], ease.inOutCubic);
  const titleIn = prog(t, TL.presentB[0], TL.presentB[1], ease.outCubic);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <Words
        words={["We", "present"]}
        t={t}
        window={TL.presentA}
        exit={TL.presentOut}
        perWord={0.12}
        wordDur={0.7}
        style={{ justifyContent: "center", fontSize: 54, fontWeight: 400, color: "#b8b8b8", letterSpacing: "-0.01em" }}
      />
      <div
        style={{
          opacity: (1 - out) * titleIn,
          transform: `translateY(${(1 - titleIn) * 40 - out * 40}px) scale(${0.96 + 0.04 * titleIn})`,
          filter: titleIn < 1 || out > 0 ? `blur(${(1 - titleIn) * 12 + out * 12}px)` : "none",
          fontSize: 132,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          color: GREEN,
          whiteSpace: "nowrap",
        }}
      >
        Deloitte Matchmaker
      </div>
      <Words
        words={TAGLINE}
        t={t}
        window={TL.presentC}
        exit={TL.presentOut}
        perWord={0.09}
        wordDur={0.8}
        style={{
          justifyContent: "center",
          marginTop: 26,
          fontSize: 48,
          fontWeight: 400,
          color: "#d0d0d0",
          letterSpacing: "-0.01em",
        }}
      />
    </div>
  );
}
