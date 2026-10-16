import { ease, prog } from "../engine/easing.js";
import { scoreOutOfTen } from "../theme.js";
import { CHEMISTRY, PROJECT_NAME, ROLE_GROUPS, TEAM } from "../story.js";
import { Badge, Card, CardHead } from "./ProductPage.jsx";
import Radar from "./Radar.jsx";
import { stagger } from "./util.js";

const GREEN = "#86BC25";
const teamColor = (score10) => (score10 >= 8 ? GREEN : score10 >= 6 ? "#d4922a" : "#e05252");

const fadeUp = (p, dy = 12) => ({ opacity: p, transform: `translateY(${(1 - p) * dy}px)` });

const groupOf = (level) => ROLE_GROUPS.findIndex((g) => g.levels.includes(level));

/**
 * Simplified Team Capability Report (product TeamReportPage).
 *  radar / comp / chem: 0..1 draw-in progress of each section
 */
export default function TeamReport({ radar, comp, chem }) {
  const n = TEAM.length;
  const items = TEAM.map((m) => {
    const s10 = scoreOutOfTen(m.score);
    return { value: m.score, color: teamColor(s10), s10, role: m.role, name: m.emp.name };
  });
  const avg = items.reduce((a, b) => a + b.s10, 0) / n;

  const groupCounts = ROLE_GROUPS.map((_, gi) => TEAM.filter((m) => groupOf(m.emp.role_level) === gi).length);
  const chemCounts = Object.fromEntries(Object.keys(CHEMISTRY).map((k) => [k, 0]));
  TEAM.forEach((m) => {
    if (chemCounts[m.emp.business_chemistry] !== undefined) chemCounts[m.emp.business_chemistry]++;
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#f0f0f0", marginBottom: 4 }}>Team Capability Report</div>
          <div style={{ fontSize: 12, color: "#aaaaaa" }}>{PROJECT_NAME}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ border: "1px solid #333333", borderRadius: 7, padding: "9px 18px", fontSize: 12, color: "#aaaaaa" }}>
            Back to Roles
          </span>
          <span style={{ background: GREEN, borderRadius: 7, padding: "9px 18px", fontSize: 12, fontWeight: 700, color: "#0a0a0a" }}>
            Generate Report
          </span>
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <CardHead title="Team Capability Match">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 20, fontWeight: 600, color: GREEN }}>{(avg * prog(radar, 0.2, 0.9, ease.linear)).toFixed(1)}/10</strong>
            <span style={{ color: "#aaaaaa", fontSize: 11 }}>average role fit</span>
            <Badge kind="blue">AI match</Badge>
          </div>
        </CardHead>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <Radar items={items} p={radar} size={236} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {items.map((it, i) => {
              const p = stagger(radar, i, n, 0.5);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", ...fadeUp(p, 8) }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `1px solid ${it.color}`,
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
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#d0d0d0", whiteSpace: "nowrap" }}>{it.role}</span>
                    <span style={{ display: "block", fontSize: 10, color: "#888", marginTop: 1 }}>{it.name}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: it.color }}>{it.s10}/10</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <Card style={{ marginBottom: 0, borderLeft: `3px solid ${GREEN}`, ...fadeUp(prog(comp, 0, 0.3, ease.outCubic), 14) }}>
          <CardHead title="Team Composition">
            <Badge kind="green">RM</Badge>
          </CardHead>
          <div style={{ display: "flex", width: "100%", height: 34, overflow: "hidden", borderRadius: 8, background: "#141414" }}>
            {ROLE_GROUPS.map((g, gi) => {
              const pct = (groupCounts[gi] / n) * 100;
              return (
                <div
                  key={g.label}
                  style={{
                    flex: `0 0 ${pct * prog(comp, 0.1, 0.8, ease.outCubic)}%`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: g.color,
                    color: "#111",
                    fontSize: 12,
                    fontWeight: 600,
                    overflow: "hidden",
                  }}
                >
                  {pct >= 10 && prog(comp, 0.6, 0.9, ease.linear) > 0.5 ? `${Math.round(pct)}%` : null}
                </div>
              );
            })}
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 14, fontSize: 11, color: "#c8c8c8" }}>
            {ROLE_GROUPS.map((g, gi) => (
              <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 6, ...fadeUp(stagger(comp, gi, 3, 0.5), 6) }}>
                <i style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, flexShrink: 0 }} />
                <span>{g.label}</span>
                <strong style={{ marginLeft: "auto", fontWeight: 600 }}>
                  {groupCounts[gi]} ({Math.round((groupCounts[gi] / n) * 100)}%)
                </strong>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ marginBottom: 0, padding: 16, ...fadeUp(prog(chem, 0, 0.3, ease.outCubic), 14) }}>
          <CardHead title="Team Business Chemistry">
            <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>DELOITTE</span>
          </CardHead>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(CHEMISTRY).map(([type, { color, desc }], i) => {
              const p = stagger(chem, i, 4, 0.5);
              const count = chemCounts[type];
              return (
                <div
                  key={type}
                  style={{
                    background: "#111",
                    borderRadius: 8,
                    padding: "9px 10px",
                    border: `1px solid ${count > 0 ? color + "44" : "#222"}`,
                    ...fadeUp(p, 8),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color, background: color + "22", borderRadius: 4, padding: "2px 7px" }}>
                      {type[0]}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#d0d0d0" }}>{type}</span>
                    <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color }}>{Math.round(count * p)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#777", lineHeight: 1.35 }}>{desc}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 1, marginTop: 12, background: "#141414" }}>
            {Object.entries(CHEMISTRY).map(
              ([type, { color }]) =>
                chemCounts[type] > 0 && (
                  <div
                    key={type}
                    style={{ flex: "0 0 auto", width: `${(chemCounts[type] / n) * 100 * prog(chem, 0.4, 1, ease.outCubic)}%`, background: color, borderRadius: 2 }}
                  />
                ),
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
