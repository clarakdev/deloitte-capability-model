import { Briefcase, CalendarClock, Sparkles, TrendingUp, Award, Wrench, Building2 } from "lucide-react";
import { lerp } from "../engine/easing.js";
import {
  DEMO_WINDOW,
  ROLE_LEVELS,
  allocatedPercent,
  avatarColor,
  getInitials,
  remainingCapacity,
} from "../theme.js";
import { mix, stagger } from "./util.js";

export const CARD_W = 930;
export const CARD_H_BASE = 790;
export const CARD_H_FULL = 940;

const GREEN = "#86BC25";
const PAD = 28;
const COL_W = (CARD_W - PAD * 2 - 24) / 2;

const fade = (p, dy = 14) => ({
  opacity: p,
  transform: `translateY(${(1 - p) * dy}px)`,
});

function Chip({ children, bg, color, size = 15, p = 1 }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color,
        fontSize: size,
        fontWeight: 500,
        padding: "5px 12px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        ...fade(p, 8),
      }}
    >
      {children}
    </span>
  );
}

/**
 * Framed section. `lit` 0..1 reveals the content, `active` 0..1 adds the
 * green spotlight while this section's bullet is the current one.
 */
function Section({ icon: Icon, title, lit, active, height, children }) {
  const frame = mix("#2a2a2a", GREEN, active);
  return (
    <div
      style={{
        width: COL_W,
        height,
        padding: "20px 22px",
        background: mix("#101010", "#121a0b", active),
        border: `1px solid ${frame}`,
        borderRadius: 12,
        opacity: lerp(0.35, 1, lit),
        boxShadow: active ? `0 0 ${36 * active}px rgba(134,188,37,${0.28 * active})` : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: mix("#6f6f6f", GREEN, Math.max(active, lit * 0.6)),
          marginBottom: 14,
        }}
      >
        <Icon size={18} strokeWidth={2} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Experience({ emp, p }) {
  const path = [...emp.prior_roles, emp.current_role];
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, ...fade(stagger(p, 0, 4)) }}>
        <span style={{ fontSize: 56, fontWeight: 600, color: "#fff", lineHeight: 1 }}>
          {emp.years_experience}
        </span>
        <span style={{ fontSize: 17, color: "#999" }}>years of experience</span>
      </div>

      <div style={{ marginTop: 12, position: "relative", paddingLeft: 20 }}>
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 10,
            width: 2,
            height: `${stagger(p, 1, 4) * 100}%`,
            maxHeight: (path.length - 1) * 25,
            background: "#3a3a3a",
          }}
        />
        {path.map((r, i) => {
          const sp = stagger(p, 1 + i * 0.5, 4);
          const current = i === path.length - 1;
          return (
            <div
              key={r}
              style={{
                position: "relative",
                fontSize: 16,
                lineHeight: "25px",
                color: current ? "#f0f0f0" : "#999",
                fontWeight: current ? 600 : 400,
                ...fade(sp, 8),
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: -20,
                  top: 8,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: current ? GREEN : "#444",
                }}
              />
              {r}
              {current && <span style={{ color: "#777", fontWeight: 400 }}> · now</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
        {emp.project_experience.map((x, i) => (
          <Chip key={x} bg="#1c1c1c" color="#bbb" size={13} p={stagger(p, 2.4 + i * 0.5, 4)}>
            {x}
          </Chip>
        ))}
      </div>
    </>
  );
}

const SKILL_STYLE = {
  "Technology Skills": { bg: "#1e2a14", color: GREEN },
  "Business Skills": { bg: "#0d1f33", color: "#5b9bd5" },
};

function Skills({ emp, p }) {
  const n = emp.skills.length;
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        {emp.skills.map((s, i) => {
          const st = SKILL_STYLE[s.category] ?? SKILL_STYLE["Business Skills"];
          return (
            <Chip key={s.name} bg={st.bg} color={st.color} size={16} p={stagger(p, i, n, 0.5)}>
              {s.name}
            </Chip>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 20, fontSize: 13, color: "#888", ...fade(stagger(p, n, n + 1, 0.3)) }}>
        {Object.entries(SKILL_STYLE).map(([k, v]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i style={{ width: 9, height: 9, borderRadius: "50%", background: v.color }} />
            {k.replace(" Skills", "")}
          </span>
        ))}
      </div>
    </>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

function Availability({ emp, p }) {
  const remaining = remainingCapacity(emp);
  const used = allocatedPercent(emp);
  const overlapping = emp.allocations.filter(
    (a) => a.start_date <= DEMO_WINDOW.end && a.end_date >= DEMO_WINDOW.start,
  );
  const barP = stagger(p, 1, 4, 0.5);
  const amber = ["#d4922a", "#a8741f", "#7d561a"];

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, ...fade(stagger(p, 0, 4)) }}>
        <span style={{ fontSize: 56, fontWeight: 600, color: GREEN, lineHeight: 1 }}>
          {Math.round(remaining * stagger(p, 0, 4, 0.8))}%
        </span>
        <span style={{ fontSize: 17, color: "#999" }}>available</span>
      </div>
      <div style={{ fontSize: 14, color: "#777", marginTop: 4, ...fade(stagger(p, 0.6, 4)) }}>
        Project window · {fmtDate(DEMO_WINDOW.start)} – {fmtDate(DEMO_WINDOW.end)}
      </div>

      <div
        style={{
          display: "flex",
          height: 22,
          borderRadius: 6,
          overflow: "hidden",
          background: "#1c1c1c",
          marginTop: 14,
          gap: 2,
        }}
      >
        {overlapping.map((a, i) => (
          <div
            key={a.project_id}
            style={{ width: `${a.percentage * barP}%`, background: amber[i % amber.length] }}
          />
        ))}
        <div style={{ width: `${(100 - used) * barP}%`, background: GREEN }} />
      </div>

      <div style={{ marginTop: 12 }}>
        {overlapping.map((a, i) => (
          <div
            key={a.project_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: 14,
              lineHeight: "24px",
              color: "#aaa",
              ...fade(stagger(p, 2 + i, 4)),
            }}
          >
            <i style={{ width: 9, height: 9, borderRadius: 3, background: amber[i % amber.length] }} />
            <span style={{ color: "#ddd" }}>{a.project_id}</span>
            <span>{a.percentage}%</span>
            <span style={{ color: "#777" }}>
              {fmtDate(a.start_date)} – {fmtDate(a.end_date)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function RoleLevel({ emp, p }) {
  const idx = ROLE_LEVELS.indexOf(emp.role_level);
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 108 }}>
        {ROLE_LEVELS.map((lvl, i) => {
          const bp = stagger(p, i, ROLE_LEVELS.length, 0.5);
          const reached = i <= idx;
          const isCurrent = i === idx;
          const h = (28 + i * 13) * bp;
          return (
            <div
              key={lvl}
              style={{
                width: 38,
                height: h,
                borderRadius: 6,
                background: isCurrent ? GREEN : reached ? "#3d5a12" : "#222",
                boxShadow: isCurrent ? "0 0 22px rgba(134,188,37,0.55)" : "none",
              }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: 14, ...fade(stagger(p, 5, 6, 0.5)) }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: "#fff", lineHeight: 1.1 }}>{emp.role_level}</div>
        <div style={{ fontSize: 14, color: "#888", marginTop: 4 }}>
          Level {idx + 1} of {ROLE_LEVELS.length} · sets skill expectations and project budget
        </div>
      </div>
    </>
  );
}

function MoreTile({ icon: Icon, title, items, p, width }) {
  return (
    <div
      style={{
        width,
        padding: "16px 18px",
        background: "#101010",
        border: "1px solid #2a2a2a",
        borderRadius: 12,
        ...fade(p, 18),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#7a7a7a",
          marginBottom: 10,
        }}
      >
        <Icon size={16} />
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((x) => (
          <Chip key={x} bg="#1c1c1c" color="#c8c8c8" size={13}>
            {x}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * Expanded employee profile. Content is laid out for the full card height;
 * the scene decides how much of it is currently revealed.
 *  lit/active: 4 numbers (0..1), one per highlighted section
 *  more: 0..1 progress of the "and more" strip
 */
export default function EmployeeCard({ emp, lit, active, more }) {
  const av = avatarColor(emp.id);
  const sectionH = 290;
  const tileW = (CARD_W - PAD * 2 - 32) / 3;

  return (
    <div style={{ width: CARD_W, height: CARD_H_FULL, padding: PAD, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, height: 110 }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: av.bg,
            color: av.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {getInitials(emp.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 40, fontWeight: 500, color: "#f0f0f0", lineHeight: 1.15 }}>{emp.name}</div>
          <div style={{ fontSize: 19, color: "#999", marginTop: 4 }}>
            {emp.title} · {emp.role_level} · {emp.business_unit} · {emp.location}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <Chip bg="#1c0d33" color="#9b6dd4" size={15}>
            {emp.business_chemistry}
          </Chip>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 24 }}>
        <Section icon={Briefcase} title="Previous experience" lit={lit[0]} active={active[0]} height={sectionH}>
          <Experience emp={emp} p={lit[0]} />
        </Section>
        <Section icon={Sparkles} title="Relevant skills" lit={lit[1]} active={active[1]} height={sectionH}>
          <Skills emp={emp} p={lit[1]} />
        </Section>
        <Section icon={CalendarClock} title="Time & availability" lit={lit[2]} active={active[2]} height={sectionH}>
          <Availability emp={emp} p={lit[2]} />
        </Section>
        <Section icon={TrendingUp} title="Role level" lit={lit[3]} active={active[3]} height={sectionH}>
          <RoleLevel emp={emp} p={lit[3]} />
        </Section>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
        <MoreTile icon={Award} title="Certifications" items={emp.certifications} p={stagger(more, 0, 3, 0.5)} width={tileW} />
        <MoreTile icon={Wrench} title="Tools" items={emp.tools} p={stagger(more, 1, 3, 0.5)} width={tileW} />
        <MoreTile
          icon={Building2}
          title="Industries"
          items={emp.industry_experience}
          p={stagger(more, 2, 3, 0.5)}
          width={tileW}
        />
      </div>
    </div>
  );
}

