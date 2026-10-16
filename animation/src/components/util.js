import { lerp } from "../engine/easing.js";

const parse = (c) => (c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number));

/** Blend two colours (#rrggbb or rgb(r, g, b)). */
export const mix = (a, b, p) => {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return `rgb(${Math.round(lerp(r1, r2, p))}, ${Math.round(lerp(g1, g2, p))}, ${Math.round(lerp(b1, b2, p))})`;
};

/** Item progress inside a staggered group: item i of n, group progress p. */
export const stagger = (p, i, n, span = 0.4) => {
  const start = (1 - span) * (n <= 1 ? 0 : i / (n - 1));
  return Math.min(1, Math.max(0, (p - start) / span));
};
