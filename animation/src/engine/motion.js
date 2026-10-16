/**
 * Scroll motion: ramps up quickly, cruises, then glides to a soft stop.
 * Returns pos(τ) 0..1 (τ = normalised time 0..1) from a tabulated integral
 * of the velocity curve, so total distance is exact.
 */
export function makeScrollProfile({ accel = 0.16, decel = 0.5 } = {}) {
  const N = 2000;
  const v = (tau) => {
    if (tau < accel) {
      const u = tau / accel;
      return u * u;
    }
    if (tau > 1 - decel) {
      const u = (tau - (1 - decel)) / decel;
      return 0.5 * (1 + Math.cos(Math.PI * u));
    }
    return 1;
  };

  const table = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    table[i] = table[i - 1] + (v((i - 0.5) / N) / N);
  }
  const total = table[N];

  const pos = (tau) => {
    if (tau <= 0) return 0;
    if (tau >= 1) return 1;
    const x = tau * N;
    const i = Math.floor(x);
    return (table[i] + (table[i + 1] - table[i]) * (x - i)) / total;
  };
  /** Speed as a fraction of the average speed (≥ 0). */
  const speed = (tau) => (tau <= 0 || tau >= 1 ? 0 : v(tau) / total);

  return { pos, speed };
}
