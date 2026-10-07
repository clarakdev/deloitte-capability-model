import { lerp } from "../engine/easing.js";

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Blend two #rrggbb colours. */
export const mix = (a, b, p) => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return `rgb(${Math.round(lerp(r1, r2, p))}, ${Math.round(lerp(g1, g2, p))}, ${Math.round(lerp(b1, b2, p))})`;
};

/** Item progress inside a staggered group: item i of n, group progress p. */
export const stagger = (p, i, n, span = 0.4) => {
  const start = (1 - span) * (n <= 1 ? 0 : i / (n - 1));
  return Math.min(1, Math.max(0, (p - start) / span));
};
