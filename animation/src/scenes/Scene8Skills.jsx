import { useT } from "../engine/timeline.js";
import { clamp, ease, lerp, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import { PageFrame } from "../components/ProductPage.jsx";
import SkillRequirements, { SKILLS_FRAME_H } from "../components/SkillRequirements.jsx";
import { TEXT_W, TEXT_X } from "../layout.js";

// Scenes 8 and 9 share one skills page, so they live together.

const EM = { color: "#fff", weight: 600 };
const ROLE = "Solution Architect";
const QUERY = "compliance";

// Real ESCO skills. Every skill starts at the default weight; `w1` is the weight after the human adjusts it.
const DEFAULT_WEIGHT = 3;
const SKILLS = [
  { id: "req", name: "Identify customer requirements", kind: "ai", w1: 4 },
  { id: "doc", name: "Provide technical documentation", kind: "ai", w1: 2 },
  { id: "stake", name: "Manage relationships with stakeholders", kind: "ai", w1: 5 },
  { id: "budget", name: "Manage budgets", kind: "ai", cut: true },
  { id: "risk", name: "Perform risk analysis", kind: "ai", w1: 4 },
  { id: "legal", name: "Ensure compliance with legal requirements", kind: "manual", w1: 5, added: true },
];

const RESULTS = [
  { label: "Ensure compliance with legal requirements", description: "Guarantee compliance with established and applicable standards and legal requirements such as specif" },
  { label: "Ensure compliance with safety legislation", description: "Implement safety programmes to comply with national laws and legislation. Ensure that equipment and " },
  { label: "Apply system organisational policies", description: "Implement internal policies related to the development, internal and external usage of technological" },
];

const TEXT_8 = [
  "For",
  "each",
  "role,",
  "the",
  "system",
  "will",
  { text: "predict", ...EM },
  "the",
  "relevant",
  { text: "skill", ...EM },
  { text: "requirements*", ...EM },
  "for",
  "you.",
];

const TEXT_9A = [
  "Skills",
  "can",
  "be",
  { text: "added,", ...EM },
  { text: "removed,", ...EM },
  "and",
  { text: "weighted.", ...EM },
];

const TEXT_9B = [
  "The",
  "AI",
  "always",
  "defers",
  "the",
  { text: "final", ...EM },
  { text: "decision", ...EM },
  "to",
  "a",
  { text: "human.", color: "#86BC25", weight: 600 },
];

const TEXT_STYLE = { fontSize: 52, fontWeight: 400, lineHeight: 1.3, color: "#a8a8a8", letterSpacing: "-0.01em" };
const COLUMN = { position: "absolute", left: TEXT_X, top: 150, bottom: 0, width: TEXT_W, display: "flex" };

// Slot in which each AI skill resolves from its shimmering placeholder.
const resolveWindow = (i) => {
  const [a, b] = TL.skResolve;
  const dur = 0.5;
  const s = a + (i * (b - a - dur)) / 4;
  return [s, s + dur];
};

function buildItems(t) {
  const wk = prog(t, TL.weights[0], TL.weights[1], ease.inOutCubic);
  let aiIndex = 0;
  return SKILLS.map((s) => {
    let resolve = 1;
    let hf = 1;
    let press = 0;
    let weight = DEFAULT_WEIGHT;

    if (s.kind === "ai") {
      const [a, b] = resolveWindow(aiIndex++);
      resolve = prog(t, a, b, ease.outCubic);
    }
    if (s.cut) {
      press = prog(t, TL.cutPress[0], TL.cutPress[1], ease.outCubic);
      hf = 1 - prog(t, TL.cut[0], TL.cut[1], ease.inOutCubic);
    }
    if (s.added) {
      hf = prog(t, TL.addIn[0], TL.addIn[1], ease.outCubic);
    }
    if (s.w1 !== undefined) weight = lerp(weight, s.w1, wk);
    return { id: s.id, name: s.name, kind: s.kind, weight, resolve, hf, press };
  });
}

function buildSearch(t) {
  const typing = prog(t, TL.searchType[0], TL.searchType[1], ease.linear);
  const cleared = t >= TL.addIn[0];
  const text = cleared ? "" : QUERY.slice(0, Math.round(typing * QUERY.length));
  const focus =
    prog(t, TL.searchType[0] - 0.3, TL.searchType[0], ease.outCubic) * (1 - prog(t, TL.searchPick[1], TL.searchPick[1] + 0.3, ease.outCubic));
  const blink = Math.floor(t * 2.2) % 2 === 0;
  const caret = focus > 0.5 && (typing > 0 && typing < 1 ? true : blink);

  const a = TL.searchType[1];
  const press = prog(t, a, a + 0.12, ease.outCubic) * (1 - prog(t, a + 0.15, a + 0.3, ease.outCubic));

  const resultsP =
    prog(t, TL.searchResults[0], TL.searchResults[1], ease.outCubic) *
    (1 - prog(t, TL.searchPick[1], TL.searchPick[1] + 0.3, ease.outCubic));
  const pick = prog(t, TL.searchPick[0], TL.searchPick[0] + 0.25, ease.outCubic);

  return { text, focus, caret, press, results: RESULTS, resultsP, pick };
}

export default function Scene8Skills() {
  const t = useT();
  if (t < TL.skText[0] - 0.1 || t >= TL.skOut[1]) return null;

  const enter = prog(t, TL.skIn[0], TL.skIn[1], ease.outCubic);
  const leave = prog(t, TL.skOut[0], TL.skOut[1], ease.inOutCubic);
  const shimmer = clamp(((t - TL.skIn[0]) * 0.7) % 1);
  const inferring = t < TL.skResolve[1] - 0.2 ? 1 : 0;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ ...COLUMN, alignItems: "center" }}>
        <Words words={TEXT_8} t={t} window={TL.skText} exit={TL.skTextOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      </div>

      {t >= TL.humanA[0] - 0.1 && (
        <div style={{ ...COLUMN, flexDirection: "column", justifyContent: "center", gap: 34 }}>
          <Words words={TEXT_9A} t={t} window={TL.humanA} exit={TL.skOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
          <Words words={TEXT_9B} t={t} window={TL.humanB} exit={TL.skOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
        </div>
      )}

      <PageFrame enter={enter} leave={leave} height={SKILLS_FRAME_H}>
        <SkillRequirements
          role={ROLE}
          items={buildItems(t)}
          inferring={inferring}
          shimmer={shimmer}
          search={buildSearch(t)}
        />
      </PageFrame>

      <div
        style={{
          position: "absolute",
          left: TEXT_X,
          bottom: 36,
          fontSize: 19,
          color: "#8993a3",
          opacity: prog(t, TL.skText[0] + 1.2, TL.skText[0] + 2.0, ease.outCubic) * (1 - leave),
        }}
      >
        *Skill taxonomy sourced from the European Commission&rsquo;s ESCO classification
      </div>
    </div>
  );
}
