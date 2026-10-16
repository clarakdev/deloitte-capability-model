import { ease, prog } from "../engine/easing.js";

/**
 * Word-by-word kinetic text.
 *  words:  array of strings or { text, color, weight }
 *  window: [start, end] for the reveal
 *  exit:   optional [start, end] for the fade/blur-out of the whole block
 */
export default function Words({ words, t, window: [s, e], exit, gap = "0.28em", style, perWord = 0.09, wordDur = 0.8 }) {
  const n = words.length;
  const total = Math.max(0.001, e - s);
  const step = n > 1 ? Math.min(perWord, (total - wordDur) / (n - 1)) : 0;
  const out = exit ? prog(t, exit[0], exit[1], ease.inOutCubic) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: gap,
        opacity: 1 - out,
        transform: `translateY(${-40 * out}px)`,
        filter: out > 0 ? `blur(${12 * out}px)` : "none",
        ...style,
      }}
    >
      {words.map((w, i) => {
        const word = typeof w === "string" ? { text: w } : w;
        if (word.br) return <div key={i} style={{ flexBasis: "100%", height: 0 }} />;
        const p = prog(t, s + i * step, s + i * step + wordDur, ease.outCubic);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: word.color,
              fontWeight: word.weight,
              opacity: p,
              transform: `translateY(${(1 - p) * 34}px)`,
              filter: p < 1 ? `blur(${(1 - p) * 10}px)` : "none",
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}
