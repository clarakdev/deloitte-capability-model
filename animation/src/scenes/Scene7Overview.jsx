import { useT } from "../engine/timeline.js";
import { ease, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import { PageFrame } from "../components/ProductPage.jsx";
import ProjectOverview from "../components/ProjectOverview.jsx";
import { TEXT_W, TEXT_X } from "../layout.js";

const EM = { color: "#fff", weight: 600 };

const TEXT = [
  "Describe",
  "your",
  { text: "project,", ...EM },
  "and",
  "the",
  { text: "roles", ...EM },
  "it",
  "needs.",
];

export default function Scene7Overview() {
  const t = useT();
  if (t < TL.ovText[0] - 0.1 || t >= TL.ovOut[1]) return null;

  const enter = prog(t, TL.ovIn[0], TL.ovIn[1], ease.outCubic);
  const leave = prog(t, TL.ovOut[0], TL.ovOut[1], ease.inOutCubic);
  const typed = prog(t, TL.ovType[0], TL.ovType[1], ease.linear);
  const rolesP = prog(t, TL.ovRoles[0], TL.ovRoles[1], ease.linear);
  const blink = Math.floor(t * 2.2) % 2 === 0;
  const caret = t < TL.ovRoles[0] + 0.3 && (typed > 0 && typed < 1 ? true : blink);

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
          words={TEXT}
          t={t}
          window={TL.ovText}
          exit={TL.ovOut}
          perWord={0.09}
          wordDur={0.8}
          style={{ fontSize: 52, fontWeight: 400, lineHeight: 1.3, color: "#a8a8a8", letterSpacing: "-0.01em" }}
        />
      </div>

      <PageFrame enter={enter} leave={leave}>
        <ProjectOverview typed={typed} caret={caret} rolesP={rolesP} />
      </PageFrame>
    </div>
  );
}
