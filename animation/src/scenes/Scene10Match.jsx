import { useLive, useT } from "../engine/timeline.js";
import { clamp, ease, lerp, mulberry32, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";
import EmployeeRow, { ROW_H_FIT } from "../components/EmployeeRow.jsx";
import FilterBar from "../components/FilterBar.jsx";
import { ranked, shuffledPool } from "../theme.js";
import { H, TEXT_W, TEXT_X } from "../layout.js";

// Scenes 10–13 share one list: endless ticking → stop → flip into ranked rows → filters.

// List geometry (stage px). Rows are the product's rows drawn at scale K.
const K = 1.3;
const LX = 998;
const CY = 590; // centre of the "active" row while ticking
const PITCH = 104;
const RH = ROW_H_FIT;
const TOP_SLOT = 3; // the ranked list's first row sits this many slots above the active row
const FILTER_Y = 166;

// Ticking rhythm: one row every TICK seconds, moving for the first MOVE of each tick.
const TICK = 0.42;
const MOVE = 0.55;
const FLIP_STEP = 0.09;
const FLIP_DUR = 0.66;
const SLOT_COUNT = 10; // rows that flip (the rest start off-screen)

const EM = { color: "#fff", weight: 600 };
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

const TEXT_MATCH = [
  "The",
  "system",
  "goes",
  "through",
  { text: "every", ...EM },
  { text: "employee,", ...EM },
  "and",
  "matches",
  "their",
  { text: "known", ...EM },
  { text: "skills", ...EM },
  "with",
  "each",
  "of",
  "the",
  { text: "capability", ...EM },
  { text: "requirements.", ...EM },
];
const TEXT_FAST = ["All", "in", { text: "just", ...EM }, { text: "a", ...EM }, { text: "few", ...EM }, { text: "seconds.", ...EM }];
const TEXT_ORDER = [
  "The",
  { text: "best-fitting", ...EM },
  { text: "candidates", ...EM },
  "are",
  "presented",
  { text: "in", ...EM },
  { text: "order.", ...EM },
];
const TEXT_FILTER = [
  "Aspects",
  "such",
  "as",
  { text: "location", ...EM },
  "and",
  { text: "availability", ...EM },
  "can",
  "be",
  { text: "filtered.", ...EM },
];

// ── endless random rows ──────────────────────────────────────────────
const hash01 = (n) => mulberry32((Math.imul(n | 0, 2654435761) + 12345) >>> 0)();

const perms = new Map();
const permFor = (epoch) => {
  if (!perms.has(epoch)) {
    const a = shuffledPool.map((_, i) => i);
    const rnd = mulberry32((epoch * 7919 + 101) >>> 0);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    perms.set(epoch, a);
  }
  return perms.get(epoch);
};

// Row j of the endless sequence: a fresh shuffle of everyone per epoch, so repeats are far apart.
const tickEmp = (j) => {
  const n = shuffledPool.length;
  const epoch = Math.floor(j / n);
  return shuffledPool[permFor(epoch)[j - epoch * n]];
};

const level = (j, b) => 0.15 + 0.85 * Math.pow(hash01(j * 5 + b + 1000003), 0.8);

/** Scroll position (in rows) at ambient time L: steps up one row per tick. */
const scrollAt = (L) => {
  const x = L / TICK;
  const n = Math.floor(x);
  return n + ease.inOutCubic(clamp((x - n) / MOVE));
};

/** The five capability bars of row j, filling as the row arrives at the centre. */
const meterFor = (j, pos, L, fade = 1) => {
  const start = (j - 1) * TICK + 0.25 * TICK;
  return {
    opacity: clamp(1.2 - 0.9 * Math.abs(j - pos)) * fade,
    fills: [0, 1, 2, 3, 4].map((b) => level(j, b) * prog(L, start + b * 0.03, start + b * 0.03 + 0.22, ease.outCubic)),
  };
};

function Placed({ y, opacity = 1, dx = 0, children }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate(${LX + dx}px, ${y - (RH * K) / 2}px) scale(${K})`,
        transformOrigin: "0 0",
        opacity,
      }}
    >
      {children}
    </div>
  );
}

export default function Scene10Match() {
  const t = useT();
  const live = useLive();
  if (t < TL.matchText[0] - 0.1 || t >= TL.outro[1]) return null;

  const off = live - t; // pause offset; constant while a beat plays
  const [ts, te] = TL.stop;
  const f0 = TL.flip[0];

  // Scroll position: ticks with ambient time, then decelerates onto row F.
  let pos;
  let F = 0;
  if (t < ts) {
    pos = scrollAt(live);
  } else {
    const p0 = scrollAt(ts + off);
    F = Math.round(p0 + (te - ts) / (3 * TICK));
    pos = p0 + (F - p0) * prog(t, ts, te, ease.outCubic);
  }
  const L = t + off;

  const listIn = prog(t, TL.listIn[0], TL.listIn[1], ease.outCubic);
  const out = prog(t, TL.outro[0], TL.outro[1], ease.inOutCubic);
  const flipDone = prog(t, TL.flip[0], TL.flip[1], ease.linear);

  const rows = [];

  const tickingRow = (j, y, opacity, meterFade = 1) => (
    <Placed key={`t${j}`} y={y} opacity={opacity}>
      <EmployeeRow
        emp={tickEmp(j)}
        h={RH}
        capacity={null}
        selected={clamp(1 - 1.4 * Math.abs(j - pos))}
        meter={meterFor(j, pos, L, meterFade)}
      />
    </Placed>
  );

  if (t < f0) {
    for (let j = Math.floor(pos) - 6; j <= Math.ceil(pos) + 7; j++) {
      const y = CY + (j - pos) * PITCH;
      if (y > -80 && y < H + 80) rows.push(tickingRow(j, y, 1));
    }
  } else {
    // Rows above the ranked list's first row fade away as the flip begins.
    const away = 1 - prog(t, f0, f0 + 0.5, ease.linear);
    if (away > 0) {
      for (let k = -TOP_SLOT - 4; k < -TOP_SLOT; k++) rows.push(tickingRow(F + k, CY + k * PITCH, away));
    }

    // Ranked rows. Filters collapse rows (cumulative heights), the rest move up to fill the space.
    const collapseA = prog(t, TL.availCollapse[0], TL.availCollapse[1], ease.inOutCubic);
    const collapseB = prog(t, TL.locCollapse[0], TL.locCollapse[1], ease.inOutCubic);
    let y = CY - TOP_SLOT * PITCH;
    ranked.forEach((c, r) => {
      const hf = (c.unavailable ? 1 - collapseA : 1) * (!c.inLocation && !c.unavailable ? 1 - collapseB : 1);
      const yr = y;
      y += PITCH * hf;
      if (hf < 0.01 || yr > H + 80) return;

      const fp = r < SLOT_COUNT ? prog(t, f0 + r * FLIP_STEP, f0 + r * FLIP_STEP + FLIP_DUR, ease.linear) : 1;
      const angle = fp >= 1 ? 0 : fp < 0.5 ? 90 * ease.inQuad(fp * 2) : -90 * (1 - ease.outQuad((fp - 0.5) * 2));
      const fresh = fp < 0.5;
      const k = r - TOP_SLOT;

      rows.push(
        <Placed key={`r${r}`} y={yr} opacity={hf} dx={(1 - hf) * 40}>
          <div style={{ transform: `perspective(1400px) rotateX(${angle}deg)` }}>
            {fresh ? (
              <EmployeeRow
                emp={tickEmp(F + k)}
                h={RH}
                capacity={null}
                selected={clamp(1 - 1.4 * Math.abs(k))}
                meter={meterFor(F + k, F, L, 1 - clamp(fp * 2))}
              />
            ) : (
              <EmployeeRow
                emp={c.emp}
                h={RH}
                score={c.score}
                fit={ease.outQuad(clamp((fp - 0.5) * 2))}
                capacity={c.onLeave ? null : c.capacity}
                onLeave={c.onLeave}
                dim={c.unavailable ? 0.45 : 1}
              />
            )}
          </div>
        </Placed>,
      );
    });
  }

  // Top fade while rows pass under the progress bar; tightens once the ranked list sits below the filters.
  const topEdge = lerp(330, 218, flipDone);
  const mask = `linear-gradient(to bottom, transparent 140px, #000 ${topEdge}px, #000 ${H - 120}px, transparent ${H - 20}px)`;

  const fEnter = prog(t, TL.filtersIn[0], TL.filtersIn[1], ease.linear);
  const avail = prog(t, TL.availTick[0], TL.availTick[1], ease.outCubic);
  const locOpen =
    prog(t, TL.locOpen[0], TL.locOpen[1], ease.outCubic) * (1 - prog(t, TL.locClose[0], TL.locClose[1], ease.outCubic));
  const locChecked = prog(t, TL.locCheck[0], TL.locCheck[1], ease.outCubic);
  const locActive = prog(t, TL.locCheck[0] + 0.1, TL.locCheck[1] + 0.25, ease.outCubic);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ ...COLUMN, justifyContent: "center" }}>
        <Words words={TEXT_MATCH} t={t} window={TL.matchText} exit={TL.matchTextOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
        <Words words={TEXT_FAST} t={t} window={TL.fastText} exit={TL.matchTextOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      </div>
      <div style={COLUMN}>
        <Words words={TEXT_ORDER} t={t} window={TL.orderText} exit={TL.orderTextOut} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      </div>
      <div style={COLUMN}>
        <Words words={TEXT_FILTER} t={t} window={TL.filterText} exit={TL.outro} perWord={0.09} wordDur={0.8} style={TEXT_STYLE} />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: listIn * (1 - out),
          transform: `translate(${(1 - listIn) * 60}px, ${out * 24}px)`,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        {rows}
      </div>

      {t >= TL.filtersIn[0] && (
        <div
          style={{
            position: "absolute",
            left: LX,
            top: FILTER_Y,
            transform: `scale(${K})`,
            transformOrigin: "0 0",
            opacity: 1 - out,
          }}
        >
          <FilterBar enter={fEnter} avail={avail} locOpen={locOpen} locChecked={locChecked} locActive={locActive} />
        </div>
      )}
    </div>
  );
}
