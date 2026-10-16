import { Sparkles } from "lucide-react";
import { clamp } from "../engine/easing.js";
import { Badge, Card, CardHead, PageTitle } from "./ProductPage.jsx";
import { mix } from "./util.js";

const GREEN = "#86BC25";
export const ITEM_H = 78; // native px: card (70) + gap (8)
export const SKILLS_FRAME_H = 702;

function Skeleton({ shimmer }) {
  const bar = {
    borderRadius: 4,
    backgroundColor: "#242424",
    backgroundImage: "linear-gradient(100deg, transparent 30%, rgba(134,188,37,0.28) 50%, transparent 70%)",
    backgroundSize: "260px 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: `${shimmer * 620 - 260}px 0`,
  };
  return (
    <div style={{ position: "absolute", inset: 0, padding: "14px 14px" }}>
      <div style={{ ...bar, width: 230, height: 13 }} />
      <div style={{ ...bar, width: "100%", height: 6, marginTop: 20 }} />
    </div>
  );
}

function WeightSlider({ weight }) {
  const f = clamp((weight - 1) / 4);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
      <span style={{ fontSize: 10, color: "#555", width: 42 }}>Weight</span>
      <span style={{ fontSize: 10, color: "#555" }}>1</span>
      <div style={{ flex: 1, height: 18, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: "#3a3a3a" }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 7,
            height: 4,
            borderRadius: 2,
            background: GREEN,
            width: `calc(7px + (100% - 14px) * ${f})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: GREEN,
            boxShadow: "0 0 0 2px #141414",
            left: `calc((100% - 14px) * ${f})`,
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: "#555" }}>5</span>
      <span
        style={{
          background: GREEN,
          color: "#0a0a0a",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 5,
          padding: "2px 8px",
          minWidth: 24,
          textAlign: "center",
        }}
      >
        {Math.round(weight)}
      </span>
    </div>
  );
}

/**
 * One capability row.
 *  resolve: 0 = shimmering placeholder, 1 = real content
 *  hf:      0..1 height/opacity factor (collapse on removal, grow on add)
 *  press:   0..1 the ✕ is being pressed (row turns red)
 */
function SkillItem({ item, shimmer }) {
  const { name, kind, weight, resolve, hf, press } = item;
  if (hf <= 0.001) return null;
  return (
    <div style={{ height: ITEM_H * hf, overflow: "hidden", opacity: clamp(hf * 1.6) }}>
      <div
        style={{
          position: "relative",
          height: ITEM_H - 8,
          marginBottom: 8,
          padding: "12px 14px",
          background: mix("#141414", "#2b1313", press),
          border: `1px solid ${mix("#2a2a2a", "#e05252", press)}`,
          borderRadius: 8,
        }}
      >
        <div style={{ opacity: resolve }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 22 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#d0d0d0" }}>{name}</span>
            {kind === "ai" ? <Badge kind="green">AI suggested</Badge> : <Badge kind="blue">Manual</Badge>}
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                lineHeight: 1,
                color: mix("#444444", "#ffffff", press),
                background: `rgba(224,82,82,${0.9 * press})`,
                boxShadow: press ? `0 0 ${14 * press}px rgba(224,82,82,${0.6 * press})` : "none",
                transform: `scale(${1 - 0.12 * press})`,
              }}
            >
              ✕
            </span>
          </div>
          <WeightSlider weight={weight} />
        </div>
        {resolve < 1 && (
          <div style={{ opacity: 1 - resolve }}>
            <Skeleton shimmer={shimmer} />
          </div>
        )}
      </div>
    </div>
  );
}

function SearchRow({ search }) {
  const { text, focus, caret, press, results, resultsP, pick } = search;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "#111",
            border: `1px solid ${mix("#252525", GREEN, focus)}`,
            borderRadius: 6,
            padding: "8px 11px",
            fontSize: 12,
            color: "#bbb",
            height: 34,
          }}
        >
          {text ? (
            <>
              {text}
              {caret && <span style={{ width: 1, height: 14, background: "#ddd", marginLeft: 1 }} />}
            </>
          ) : (
            <>
              {caret && <span style={{ width: 1, height: 14, background: "#ddd", marginRight: 1 }} />}
              <span style={{ color: "#6a6a6a" }}>Search ESCO skills e.g. risk management...</span>
            </>
          )}
        </div>
        <div
          style={{
            background: GREEN,
            borderRadius: 7,
            padding: "9px 20px",
            fontSize: 12,
            fontWeight: 700,
            color: "#0a0a0a",
            transform: `scale(${1 - 0.06 * press})`,
            filter: `brightness(${1 + 0.25 * press})`,
          }}
        >
          Search
        </div>
      </div>

      {resultsP > 0.01 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(100% + 10px)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 6,
            background: "#161616",
            border: "1px solid #2a2a2a",
            borderRadius: 10,
            boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
            opacity: resultsP,
            transform: `translateY(${(1 - resultsP) * 10}px)`,
          }}
        >
          {results.map((r, i) => {
            const on = i === 0 ? pick : 0;
            return (
              <div
                key={r.label}
                style={{
                  padding: "9px 12px",
                  background: mix("#111111", "#1b2412", on),
                  border: `1px solid ${mix("#222222", GREEN, on)}`,
                  borderRadius: 7,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#d0d0d0" }}>{r.label}</span>
                <span style={{ fontSize: 11, color: "#555" }}>{r.description}…</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Simplified Skill Requirements page (product Frame 2).
 *  items:     capability rows (see SkillItem)
 *  inferring: 0..1 shows the "AI inferring" chip instead of the skill count
 *  shimmer:   0..1 loop position of the placeholder shimmer
 */
export default function SkillRequirements({ role, items, inferring, shimmer, search }) {
  const count = items.filter((it) => it.hf > 0.5 && it.resolve > 0.5).length;
  return (
    <>
      <PageTitle title="Skill requirements" sub={`AI-suggested skills for ${role} — adjust weights, remove, or add from ESCO`} />

      <Card>
        <CardHead title="Required capabilities">
          {inferring > 0.5 ? (
            <Badge kind="blue">
              <Sparkles size={11} />
              AI inferring…
            </Badge>
          ) : (
            <Badge kind="green">{count} skills</Badge>
          )}
        </CardHead>
        {items.map((it) => (
          <SkillItem key={it.id} item={it} shimmer={shimmer} />
        ))}
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <CardHead title="Add a skill">
          <Badge kind="blue">ESCO search</Badge>
        </CardHead>
        <SearchRow search={search} />
      </Card>
    </>
  );
}
