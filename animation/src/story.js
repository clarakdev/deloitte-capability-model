import { shuffledPool, ranked } from "./theme.js";

// Data behind the gap-analysis and team-report scenes. Everything is
// illustrative but built from real sample employees and the skills of scene 9.

export const CAPABILITIES = [
  "Identify customer requirements",
  "Provide technical documentation",
  "Manage relationships with stakeholders",
  "Perform risk analysis",
  "Ensure compliance with legal requirements",
];

export const GAP_THRESHOLD = 0.6;

// The two candidates compared in scene 16: the top two that survive the filters.
const keepers = ranked.filter((c) => c.keep);

export const GAP_A = {
  emp: keepers[0].emp,
  score: keepers[0].score,
  sims: [0.88, 0.83, 0.55, 0.93, 0.77],
};
export const GAP_B = {
  emp: keepers[1].emp,
  score: keepers[1].score,
  sims: [0.9, 0.68, 0.95, 0.74, 0.66],
};

const byName = (name) => shuffledPool.find((e) => e.name === name);

export const PROJECT_NAME = "Government Digital Services Modernisation";

// One person per role of the project; Solution Architect is the candidate picked in scene 15.
export const TEAM = [
  { role: "Solution Architect", emp: GAP_A.emp, score: 0.97 },
  { role: "Data Engineer", emp: byName("Julia Jackson"), score: 0.88 },
  { role: "Change & Adoption Lead", emp: GAP_B.emp, score: 0.95 },
  { role: "Cybersecurity Analyst", emp: byName("Oliver Hughes"), score: 0.86 },
  { role: "Project Manager", emp: byName("Laura Thomas"), score: 0.9 },
];

export const ROLE_GROUPS = [
  { label: "Senior Consultant & below", levels: ["Analyst", "Consultant", "Senior Consultant"], color: "#86BC25" },
  { label: "Manager–Director", levels: ["Manager", "Senior Manager", "Director"], color: "#5b9bd5" },
  { label: "Partner", levels: ["Partner"], color: "#9b6dd4" },
];

export const CHEMISTRY = {
  Pioneer: { color: "#EF9F27", desc: "Values possibilities and spark of new ideas" },
  Guardian: { color: "#5b9bd5", desc: "Values stability, thoroughness and best practice" },
  Driver: { color: "#e05252", desc: "Values challenge, momentum and results" },
  Integrator: { color: "#86BC25", desc: "Values relationships, harmony and connection" },
};

export const scoreOutOfFive = (s) => Math.ceil(Math.max(0, Math.min(1, s)) * 5);

// Gap-score colours: >80% strong, 60–80% adequate, <60% gap.
export const simColor = (sim, isGap) => {
  if (isGap || sim < GAP_THRESHOLD) return "#e05252";
  if (sim <= 0.8) return "#5b9bd5";
  return "#86BC25";
};
