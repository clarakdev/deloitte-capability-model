import { createContext, useContext } from "react";

/** The current timeline time (seconds) – scenes derive everything from this. */
export const TimeContext = createContext(0);
export const useT = () => useContext(TimeContext);

/**
 * Cues are the pause points of the interactive version (one keypress plays
 * up to the next cue). In the video render, playback never stops, but each
 * cue freezes the picture for `hold` seconds so viewers get time to read.
 */
export function cueTimes(cues) {
  return cues.map((c) => c.t);
}

export function videoDuration(cues, end) {
  return end + cues.reduce((sum, c) => sum + (c.hold ?? 0), 0);
}

/** Maps video time (with holds inserted at cues) to timeline time. */
export function videoToTimeline(v, cues, end) {
  let tl = 0;
  let vv = 0;
  for (const cue of cues) {
    const span = cue.t - tl;
    if (v < vv + span) return tl + (v - vv);
    vv += span;
    tl = cue.t;
    const hold = cue.hold ?? 0;
    if (v < vv + hold) return cue.t;
    vv += hold;
  }
  return end;
}

export function nextCue(cues, t) {
  return cues.find((c) => c.t > t + 1e-3) ?? null;
}

export function prevCueTime(cues, t) {
  const earlier = cues.filter((c) => c.t < t - 0.05);
  return earlier.length ? earlier[earlier.length - 1].t : 0;
}
