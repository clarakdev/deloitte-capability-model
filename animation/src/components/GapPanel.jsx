import { ease, prog } from "../engine/easing.js";
import { avatarColor, getInitials, scoreOutOfTen } from "../theme.js";
import { CAPABILITIES, GAP_THRESHOLD, scoreOutOfFive, simColor } from "../story.js";
import { Badge, Card, CardHead } from "./ProductPage.jsx";
import Radar from "./Radar.jsx";
import { stagger } from "./util.js";

export const GAP_FRAME_W = 660; // native px incl. padding
export const GAP_K = 1.18; // native → stage scale
export const GAP_W = GAP_FRAME_W * GAP_K;

const fadeUp = (p, dy = 12) => ({ opacity: p, transform: `translateY(${(1 - p) * dy}px)` });

/**
 * Simplified gap analysis for one candidate (product Frame 4): summary,
 * stats, and one card pairing the radar plot with a fit bar per capability.
 *  t / t0: current time and the time the panel starts drawing in
 *  speed:  >1 compresses the draw-in so a later panel still fits before its cue
 */
export default function GapPanel({ cand, t, t0, speed = 1 }) {
  const { emp, score, sims } = cand;
  const w = (a, b, e = ease.outCubic) => prog(t, t0 + a / speed, t0 + b / speed, e);
  const sum = w(0.3, 0.8);
  const stats = w(0.7, 1.3);
  const radar = w(1.0, 2.1, ease.linear);
  const bars = w(1.3, 2.3, ease.linear);

  const gaps = sims.filter((s) => s < GAP_THRESHOLD).length;
  const covered = sims.length - gaps;
  const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
  const av = avatarColor(emp.id);
  const items = sims.map((s) => ({ value: s, color: simColor(s, s < GAP_THRESHOLD) }));

  return (
    <div style={{ width: GAP_FRAME_W, padding: 20 }}>
      <Card style={{ padding: "14px 16px", marginBottom: 12, ...fadeUp(sum) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              flexShrink: 0,
              background: av.bg,
              color: av.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {getInitials(emp.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#d0d0d0" }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: "#999999", marginTop: 2 }}>
              {[emp.title, emp.business_unit, emp.location].join(" · ")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#86BC25" }}>{scoreOutOfTen(score)}/10</div>
            <div style={{ fontSize: 10, color: "#999999" }}>overall match</div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
        {[
          { num: `${Math.round(scoreOutOfFive(avg) * stats)}/5`, label: "Avg fit" },
          { num: Math.round(covered * stats), label: "Skills covered" },
          { num: Math.round(gaps * stats), label: "Gaps to address", red: gaps > 0 },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{ background: "#111", borderRadius: 8, padding: "12px 14px", textAlign: "center", ...fadeUp(stagger(stats, i, 3, 0.6), 10) }}
          >
            <div style={{ fontSize: 22, fontWeight: 600, color: s.red ? "#e05252" : "#e8e8e8" }}>{s.num}</div>
            <div style={{ fontSize: 10, color: "#aaaaaa", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <Card style={{ marginBottom: 0, opacity: sum }}>
        <CardHead title="Capability fit profile">
          <Badge kind="blue">{sims.length} axes</Badge>
        </CardHead>

        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <Radar items={items} p={radar} size={240} threshold={GAP_THRESHOLD} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {sims.map((s, i) => {
              const col = simColor(s, s < GAP_THRESHOLD);
              const bp = stagger(bars, i, sims.length, 0.55);
              return (
                <div key={i} style={{ padding: "6px 4px", opacity: 0.25 + 0.75 * bp }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        border: `1px solid ${col}`,
                        color: "#d0d0d0",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#d0d0d0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {CAPABILITIES[i]}
                      </span>
                      {s < GAP_THRESHOLD && (
                        <span style={{ display: "block", fontSize: 10, color: "#e05252", marginTop: 1, opacity: bp }}>
                          Gap — upskilling needed
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{scoreOutOfFive(s)}/5</span>
                  </div>
                  <div style={{ height: 3, background: "#1f1f1f", borderRadius: 2, marginTop: 6, marginLeft: 28 }}>
                    <div style={{ height: 3, borderRadius: 2, width: `${Math.round(s * 100 * bp)}%`, background: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 10, color: "#777", opacity: bars }}>
          {[
            ["#86BC25", "Strong match (>80%)"],
            ["#5b9bd5", "Adequate (60–80%)"],
            ["#e05252", "Gap (<60%)"],
          ].map(([c, l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              {l}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
