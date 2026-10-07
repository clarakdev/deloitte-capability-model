import { mulberry32 } from "./engine/easing.js";
import raw from "./data/employees.sample.json";

// Palette and helpers mirror capability-matcher/src/pages/Frame3.jsx.
export const AVATAR_COLORS = [
  { bg: "#1e2a14", color: "#86BC25" },
  { bg: "#0d1f33", color: "#5b9bd5" },
  { bg: "#1c0d33", color: "#9b6dd4" },
  { bg: "#2a1800", color: "#d4922a" },
  { bg: "#2a0d0d", color: "#e05252" },
  { bg: "#082020", color: "#1D9E75" },
];

export const avatarColor = (empId) => {
  const n = parseInt(empId.replace(/\D/g, ""), 10) || 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
};

export const getInitials = (name) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const capacityColor = (remaining) => {
  if (remaining >= 50) return { bg: "#1e2a14", color: "#86BC25" };
  if (remaining > 0) return { bg: "#2a1e0a", color: "#d4922a" };
  return { bg: "#2a0d0d", color: "#e05252" };
};

export const scoreColor = (score) => {
  if (score >= 0.85) return { bg: "#1e2a14", color: "#86BC25" };
  if (score >= 0.7) return { bg: "#0d1f33", color: "#5b9bd5" };
  return { bg: "#2a1e0a", color: "#d4922a" };
};

export const scoreOutOfTen = (s) => Math.ceil(Math.max(0, Math.min(1, s)) * 10);

export const ROLE_LEVELS = [
  "Analyst",
  "Consultant",
  "Senior Consultant",
  "Manager",
  "Senior Manager",
  "Director",
  "Partner",
];

// The demo project window used for availability figures.
export const DEMO_WINDOW = { start: "2026-08-25", end: "2026-09-05" };

const overlaps = (a, w) => a.start_date <= w.end && a.end_date >= w.start;

export const allocatedPercent = (emp, w = DEMO_WINDOW) =>
  Math.min(
    100,
    (emp.allocations ?? []).filter((a) => overlaps(a, w)).reduce((s, a) => s + a.percentage, 0),
  );

export const remainingCapacity = (emp, w = DEMO_WINDOW) => 100 - allocatedPercent(emp, w);

export const FEATURED_ID = "EMP004";
export const featured = raw.find((e) => e.id === FEATURED_ID);

const CAPACITIES = [100, 100, 75, 60, 50, 40, 25, 10];

/** Capacity shown in list rows; the featured employee uses real allocation data. */
export const capacityFor = (emp) =>
  emp.id === FEATURED_ID
    ? remainingCapacity(emp)
    : CAPACITIES[Math.floor(mulberry32((parseInt(emp.id.replace(/\D/g, ""), 10) || 1) * 104729)() * CAPACITIES.length)];

/** Shuffled (not ranked) list order, identical each run. */
export const shuffledPool = (() => {
  const pool = raw.filter((e) => e.id !== FEATURED_ID);
  const rand = mulberry32(2024);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
})();

export const FILTER_LOCATION = "Auckland";

// Row pattern for the ranked list (best first). K stays through both filters,
// U is removed by "Available only", X is removed by the location filter.
const RANK_PATTERN = "KXUKXUKXKUXKXKUXKXKXUKXKXKUXKX";

/**
 * The ranked candidate list shown after matching. Each entry also records
 * whether the person is available and whether they match FILTER_LOCATION, so
 * the filter scene can remove the right rows.
 */
export const ranked = (() => {
  const used = new Set();
  const take = (pred) => {
    const e = shuffledPool.find((x) => !used.has(x.id) && pred(x));
    used.add(e.id);
    return e;
  };
  let leave = 0;
  return [...RANK_PATTERN].map((cat, r) => {
    const emp =
      cat === "K"
        ? take((x) => x.location === FILTER_LOCATION)
        : cat === "X"
          ? take((x) => x.location !== FILTER_LOCATION)
          : take(() => true);
    const unavailable = cat === "U";
    const onLeave = unavailable && leave++ % 2 === 0;
    return {
      emp,
      score: 0.972 - r * 0.017,
      unavailable,
      onLeave,
      capacity: unavailable ? 0 : capacityFor(emp),
      inLocation: emp.location === FILTER_LOCATION,
      keep: cat === "K",
    };
  });
})();
