import { useT } from "../engine/timeline.js";
import { ease, lerp, prog } from "../engine/easing.js";
import { TL } from "../timeline.js";
import EmployeeRow, { ROW_H, ROW_W } from "../components/EmployeeRow.jsx";
import EmployeeCard, { CARD_H_BASE, CARD_H_FULL } from "../components/EmployeeCard.jsx";
import { mix } from "../components/util.js";
import { featured } from "../theme.js";
import { CARD_RECT, H, ROW_K, ROW_RECT, TEXT_X } from "../layout.js";

const GREEN = "#86BC25";
const BULLETS = ["Previous experience", "Relevant skills", "Time and availability", "Salary/budget"];
const BULLET_SIZE = 62;
const BULLET_PITCH = 100;
const BULLETS_TOP = 300;

export default function Scene3Weigh() {
  const t = useT();
  if (t < TL.morph[0] || t >= TL.cardOut[1]) return null;

  const m = prog(t, TL.morph[0], TL.morph[1], ease.inOutCubic);
  const more = prog(t, TL.more[0], TL.more[1], ease.inOutCubic);
  const moreItems = prog(t, TL.more[0] + 0.4, TL.more[1] + 0.2, ease.linear);
  const bOut = prog(t, TL.bulletsOut[0], TL.bulletsOut[1], ease.inOutCubic);
  const cOut = prog(t, TL.cardOut[0], TL.cardOut[1], ease.inOutCubic);

  // Section progress: lit (content revealed) and active (spotlight)
  const starts = [...TL.bullets.map((b) => b[0]), TL.more[0]];
  const lit = TL.bullets.map((b) => prog(t, b[0] + 0.05, b[0] + 1.0, ease.linear));
  const active = TL.bullets.map((b, i) => {
    const on = prog(t, b[0], b[0] + 0.4, ease.outCubic);
    const off = prog(t, starts[i + 1], starts[i + 1] + 0.4, ease.outCubic);
    return on * (1 - off);
  });

  const cardH = lerp(CARD_H_BASE, CARD_H_FULL, more);
  const rect = {
    x: lerp(ROW_RECT.x, CARD_RECT.x, m),
    y: lerp(ROW_RECT.y, (H - cardH) / 2, m),
    w: lerp(ROW_RECT.w, CARD_RECT.w, m),
    h: lerp(ROW_RECT.h, cardH, m),
  };
  const rowFade = 1 - prog(t, TL.morph[0] + 0.05, TL.morph[0] + 0.4, ease.linear);
  const cardFade = prog(t, TL.morph[0] + 0.7, TL.morph[0] + 1.25, ease.linear);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Bullets */}
      <div style={{ position: "absolute", left: TEXT_X, top: BULLETS_TOP, width: 800 }}>
        {BULLETS.map((text, i) => {
          const inP = prog(t, TL.bullets[i][0], TL.bullets[i][0] + 0.7, ease.outCubic);
          return (
            <div
              key={text}
              style={{
                position: "absolute",
                top: i * BULLET_PITCH,
                display: "flex",
                alignItems: "center",
                gap: 26,
                fontSize: BULLET_SIZE,
                fontWeight: 500,
                letterSpacing: "-0.015em",
                color: mix("#6a6a6a", "#ffffff", active[i]),
                opacity: inP * (1 - bOut),
                transform: `translateX(${(1 - inP) * -60 - bOut * 40}px)`,
                filter: inP < 1 || bOut > 0 ? `blur(${(1 - inP) * 8 + bOut * 8}px)` : "none",
                whiteSpace: "nowrap",
              }}
            >
              <i style={{ width: 16, height: 16, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />
              {text}
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            top: BULLETS.length * BULLET_PITCH + 14,
            left: 42,
            fontSize: 54,
            fontWeight: 400,
            fontStyle: "italic",
            color: "#d0d0d0",
            opacity: prog(t, TL.more[0], TL.more[0] + 0.8, ease.outCubic) * (1 - bOut),
            transform: `translateX(${(1 - prog(t, TL.more[0], TL.more[0] + 0.8, ease.outCubic)) * -40 - bOut * 40}px)`,
            filter: bOut > 0 ? `blur(${bOut * 8}px)` : "none",
          }}
        >
          And more…
        </div>
      </div>

      {/* Row → card */}
      <div
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y + cOut * 30,
          width: rect.w,
          height: rect.h,
          borderRadius: lerp(8, 16, m),
          overflow: "hidden",
          opacity: 1 - cOut,
          background: mix("#131a0d", "#101010", m),
          border: `1px solid ${mix("#86BC25", "#2a2a2a", m)}`,
          boxShadow: `0 ${30 * m}px ${70 * m}px rgba(0,0,0,0.55), 0 0 ${28 * (1 - m)}px rgba(134,188,37,${0.35 * (1 - m)})`,
        }}
      >
        {rowFade > 0 && (
          <div
            style={{
              position: "absolute",
              left: -1,
              top: -1,
              opacity: rowFade,
              transform: `scale(${ROW_K})`,
              transformOrigin: "0 0",
              width: ROW_W,
              height: ROW_H,
            }}
          >
            <EmployeeRow emp={featured} selected={1} />
          </div>
        )}
        {cardFade > 0 && (
          <div style={{ position: "absolute", left: 0, top: 0, opacity: cardFade }}>
            <EmployeeCard emp={featured} lit={lit} active={active} more={moreItems} />
          </div>
        )}
      </div>
    </div>
  );
}
