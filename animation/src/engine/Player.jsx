import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  LiveContext,
  TimeContext,
  nextCue,
  prevCueTime,
  videoDuration,
  videoToTimeline,
} from "./timeline.js";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

function useStageScale() {
  const calc = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const on = () => setScale(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return scale;
}

const fmt = (s) => s.toFixed(2).padStart(5, "0");

/**
 * Runs a timeline in one of three ways:
 *  - present (default): keypress-driven playback between cues
 *  - ?render:           frame-addressable via window.__setTime(videoSeconds)
 *  - ?dev:              adds a scrubber; ?t=12.4 starts paused at that time
 */
export function Player({ cues, end, scenes, children }) {
  const params = new URLSearchParams(window.location.search);
  const renderMode = params.has("render");
  const scale = useStageScale();

  const [t, setTRaw] = useState(Number(params.get("t") ?? 0));
  const [dev, setDev] = useState(params.has("dev"));
  const [videoPreview, setVideoPreview] = useState(false);
  const tRef = useRef(t);
  const targetRef = useRef(null);
  const vRef = useRef(0);
  const videoRef = useRef(false);
  // Time spent paused so far. `live = t + offset` keeps ambient motion running while the timeline rests at a cue.
  const offsetRef = useRef(0);
  const [, bump] = useReducer((n) => n + 1, 0);

  const setT = useCallback((v) => {
    tRef.current = v;
    setTRaw(v);
  }, []);

  const total = videoDuration(cues, end);

  // Render mode hook for the Playwright script.
  useEffect(() => {
    if (!renderMode) return;
    window.__videoDuration = total;
    window.__setTime = (v) => {
      const tl = videoToTimeline(v, cues, end);
      offsetRef.current = v - tl;
      // bump() forces a render even when tl is unchanged (a hold), so ambient motion advances.
      flushSync(() => {
        setT(tl);
        bump();
      });
    };
    window.__setTimeline = (tl) => {
      offsetRef.current = 0;
      flushSync(() => {
        setT(tl);
        bump();
      });
    };
    window.__ready = true;
  }, [renderMode, cues, end, total, setT]);

  // Real-time clock (interactive playback + video preview).
  useEffect(() => {
    if (renderMode) return;
    let raf;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (videoRef.current) {
        vRef.current = (vRef.current + dt) % total;
        const tl = videoToTimeline(vRef.current, cues, end);
        offsetRef.current = vRef.current - tl;
        setT(tl);
      } else if (targetRef.current !== null) {
        const next = tRef.current + dt;
        if (next >= targetRef.current) {
          setT(targetRef.current);
          targetRef.current = null;
        } else {
          setT(next);
        }
      } else {
        offsetRef.current += dt;
        bump();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [renderMode, cues, end, total, setT]);

  const stopVideo = () => {
    videoRef.current = false;
    setVideoPreview(false);
  };

  const advance = useCallback(() => {
    if (videoRef.current) return;
    if (targetRef.current !== null) {
      // Pressing mid-beat finishes it immediately, like a slideshow.
      setT(targetRef.current);
      targetRef.current = null;
      return;
    }
    const cue = nextCue(cues, tRef.current);
    if (cue) {
      targetRef.current = cue.t;
    } else {
      setT(0);
      targetRef.current = cues[0].t;
    }
  }, [cues, setT]);

  const back = useCallback(() => {
    if (videoRef.current) return;
    targetRef.current = null;
    setT(prevCueTime(cues, tRef.current));
  }, [cues, setT]);

  const jump = useCallback(
    (time) => {
      stopVideo();
      targetRef.current = null;
      setT(time);
    },
    [setT],
  );

  useEffect(() => {
    if (renderMode) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if ([" ", "ArrowRight", "ArrowDown", "Enter", "PageDown"].includes(k)) {
        e.preventDefault();
        advance();
      } else if (["ArrowLeft", "ArrowUp", "Backspace", "PageUp"].includes(k)) {
        e.preventDefault();
        back();
      } else if (k === "Home") {
        jump(0);
      } else if (k === "f" || k === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
      } else if (k === "d" || k === "D") {
        setDev((d) => !d);
      } else if (k === "v" || k === "V") {
        if (videoRef.current) {
          stopVideo();
        } else {
          targetRef.current = null;
          vRef.current = 0;
          videoRef.current = true;
          setVideoPreview(true);
        }
      } else if (/^[0-9]$/.test(k) && scenes[(Number(k) + 9) % 10]) {
        jump(scenes[(Number(k) + 9) % 10].t);
      } else if (k === "[" || k === "]") {
        const here = scenes.reduce((best, s, i) => (s.t <= tRef.current + 0.01 ? i : best), 0);
        jump(scenes[Math.max(0, Math.min(scenes.length - 1, here + (k === "]" ? 1 : -1)))].t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renderMode, advance, back, jump, scenes]);

  const idle = !renderMode && t === 0 && targetRef.current === null && !videoPreview;

  return (
    <div className={`viewport${dev ? " dev" : ""}${renderMode ? " render" : ""}`}>
      <div
        className="stage"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <TimeContext.Provider value={t}>
          <LiveContext.Provider value={t + offsetRef.current}>{children}</LiveContext.Provider>
        </TimeContext.Provider>
      </div>

      {idle && !dev && <div className="hint">Press Space to begin</div>}

      {dev && !renderMode && (
        <div className="scrubber">
          <div className="scrubber-row">
            <span className="mono">
              t = {fmt(t)} / {fmt(end)}
              {videoPreview ? "  ▶ video preview" : ""}
            </span>
            <span className="muted">
              Space/→ next · ← back · 1-9,0 or [ ] scene · V video preview · F fullscreen · D hide
            </span>
          </div>
          <div className="scrubber-track">
            <input
              type="range"
              min={0}
              max={end}
              step={0.01}
              value={t}
              onChange={(e) => jump(Number(e.target.value))}
            />
            {cues.map((c) => (
              <i key={c.t} className="cue" style={{ left: `${(c.t / end) * 100}%` }} title={c.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
