import { useT } from "../engine/timeline.js";
import { TL } from "../timeline.js";
import Words from "../components/Words.jsx";

const GREEN = "#86BC25";

const WORDS = [
  "How",
  "do",
  "project",
  "managers",
  "pick",
  { br: true },
  "the",
  { text: "best", color: GREEN },
  { text: "people", color: GREEN },
  "to",
  "fill",
  "roles?",
];

export default function Scene1Question() {
  const t = useT();
  if (t >= TL.qOut[1]) return null;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Words
        words={WORDS}
        t={t}
        window={TL.qIn}
        exit={TL.qOut}
        gap="0.3em"
        perWord={0.1}
        style={{
          width: 1500,
          justifyContent: "center",
          textAlign: "center",
          fontSize: 104,
          fontWeight: 500,
          lineHeight: 1.18,
          letterSpacing: "-0.02em",
          color: "#f0f0f0",
        }}
      />
    </div>
  );
}
