import { useT } from "../engine/timeline.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import { TEXT_W, TEXT_X } from "../layout.js";

const EM = { color: "#fff", weight: 600 };

const LINE_A = [
  "Modern",
  "companies",
  "have",
  "an",
  { text: "abundance", ...EM },
  { text: "of", ...EM },
  { text: "data...", ...EM },
];

const LINE_B = [
  "...but",
  { text: "miss", ...EM },
  { text: "opportunities", ...EM },
  "to",
  "exploit",
  "it.",
];

const TEXT_STYLE = {
  fontSize: 52,
  fontWeight: 400,
  lineHeight: 1.3,
  color: "#a8a8a8",
  letterSpacing: "-0.01em",
};

// Left-hand text only: the employee card from scene 3 stays on screen.
export default function Scene4Data() {
  const t = useT();
  if (t < TL.dataA[0] - 0.1 || t >= TL.dataOut[1]) return null;

  return (
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
        gap: 34,
      }}
    >
      <Words words={LINE_A} t={t} window={TL.dataA} exit={TL.dataOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      <Words words={LINE_B} t={t} window={TL.dataB} exit={TL.dataOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
    </div>
  );
}
