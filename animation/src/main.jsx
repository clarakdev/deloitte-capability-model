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
import Scene4Data from "./scenes/Scene4Data.jsx";
import Scene5Present from "./scenes/Scene5Present.jsx";
import Scene6Steps from "./scenes/Scene6Steps.jsx";
import Scene7Overview from "./scenes/Scene7Overview.jsx";
import Scene8Skills from "./scenes/Scene8Skills.jsx";
import Scene10Match from "./scenes/Scene10Match.jsx";

function Show() {
  return (
    <Player cues={CUES} end={END} scenes={SCENES}>
      <Backdrop />
      <Scene1Question />
      <Scene2Problem />
      <Scene3Weigh />
      <Scene4Data />
      <Scene5Present />
      <Scene6Steps />
      <Scene7Overview />
      <Scene8Skills />
      <Scene10Match />
    </Player>
  );
}

// Wait for fonts so the very first frame (and every render frame) is correct.
const FACES = ["400", "500", "600", "700", "italic 500"].map((w) => `${w} 24px "IBM Plex Sans"`);
Promise.all(FACES.map((f) => document.fonts.load(f))).then(() =>
  createRoot(document.getElementById("root")).render(<Show />),
);
