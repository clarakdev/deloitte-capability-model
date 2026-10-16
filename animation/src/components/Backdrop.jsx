import { END } from "../timeline.js";
import { useT } from "../engine/timeline.js";

/** Dull-blue surface with a soft green gradient from the top-left. It breathes slowly and loops exactly over the show. */
export default function Backdrop() {
  const t = useT();
  const reach = 58 + Math.sin((t / END) * Math.PI * 2) * 6;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(160deg, rgba(134,188,37,0.13) 0%, rgba(134,188,37,0) ${reach}%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1.2px, transparent 1.4px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, #000 30%, transparent 85%)",
        }}
      />
    </div>
  );
}
