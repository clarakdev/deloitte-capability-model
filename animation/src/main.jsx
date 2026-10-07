import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans/400-italic.css";
import "@fontsource/ibm-plex-sans/500-italic.css";
import "./styles.css";

import { createRoot } from "react-dom/client";
import { Player } from "./engine/Player.jsx";
import { CUES, END, SCENES } from "./timeline.js";
import Backdrop from "./components/Backdrop.jsx";
import Scene1Question from "./scenes/Scene1Question.jsx";
import Scene2Problem from "./scenes/Scene2Problem.jsx";
import Scene3Weigh from "./scenes/Scene3Weigh.jsx";

function Show() {
  return (
    <Player cues={CUES} end={END} scenes={SCENES}>
      <Backdrop />
      <Scene1Question />
      <Scene2Problem />
      <Scene3Weigh />
    </Player>
  );
}

// Wait for fonts so the very first frame (and every render frame) is correct.
const FACES = ["400", "500", "600", "700", "italic 500"].map((w) => `${w} 24px "IBM Plex Sans"`);
Promise.all(FACES.map((f) => document.fonts.load(f))).then(() =>
  createRoot(document.getElementById("root")).render(<Show />),
);
