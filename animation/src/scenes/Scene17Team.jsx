import { useT } from "../engine/timeline.js";
import { ease, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import { PageFrame } from "../components/ProductPage.jsx";
import TeamReport from "../components/TeamReport.jsx";
import { TEXT_W, TEXT_X } from "../layout.js";

// Scenes 17–19: the team report appears; the next two beats only change the text.

const EM = { color: "#fff", weight: 600 };
const GREEN = "#86BC25";

const TEXT_TEAM = [
  "Once",
  "all",
  "the",
  "roles",
  "are",
  "filled,",
  "the",
  { text: "team", ...EM },
  "is",
  "examined",
  { text: "as", ...EM },
  { text: "a", ...EM },
  { text: "whole.", ...EM },
];

const TEXT_LOCK = [
  "This",
  "team",
  "is",
  { text: "not", ...EM },
  { text: "locked", ...EM },
  { text: "in.", ...EM },
  "Project",
  "needs",
  "change,",
  "so",
  "the",
  "decisions",
  "can",
  "be",
  { text: "changed", ...EM },
  "as",
  "well.",
];

const TEXT_WIN = [
  { text: "Data-informed", ...EM },
  { text: "decisions", ...EM },
  "help",
  "resource",
  "managers",
  "build",
  "a",
  { text: "winning", color: GREEN, weight: 600 },
  { text: "team!", color: GREEN, weight: 600 },
];

const TEXT_STYLE = { fontSize: 52, fontWeight: 400, lineHeight: 1.3, color: "#a8a8a8", letterSpacing: "-0.01em" };
const COLUMN = {
  position: "absolute",
  left: TEXT_X,
  top: 150,
  bottom: 0,
  width: TEXT_W,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 34,
};

export default function Scene17Team() {
  const t = useT();
  if (t < TL.teamText[0] - 0.1 || t >= TL.finalOut[1]) return null;

  const enter = prog(t, TL.teamIn[0], TL.teamIn[1], ease.outCubic);
  const leave = prog(t, TL.finalOut[0], TL.finalOut[1], ease.inOutCubic);
  const radar = prog(t, TL.teamRadar[0], TL.teamRadar[1], ease.linear);
  const comp = prog(t, TL.teamComp[0], TL.teamComp[1], ease.linear);
  const chem = prog(t, TL.teamChem[0], TL.teamChem[1], ease.linear);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={COLUMN}>
        <Words words={TEXT_TEAM} t={t} window={TL.teamText} exit={TL.teamTextOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      </div>
      <div style={COLUMN}>
        <Words words={TEXT_LOCK} t={t} window={TL.lockText} exit={TL.finalOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
        <Words words={TEXT_WIN} t={t} window={TL.winText} exit={TL.finalOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      </div>

      <PageFrame enter={enter} leave={leave}>
        <TeamReport radar={radar} comp={comp} chem={chem} />
      </PageFrame>
    </div>
  );
}
