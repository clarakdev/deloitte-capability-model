# Capability Matcher – Showcase Animation

Motion-graphics demo of the product, built as a small React app with a custom
deterministic timeline engine. One set of scenes produces both:

- an **interactive presentation** (keypress advances, like PowerPoint build steps)
- a **seamless looping MP4** (1080p60)

It is self-contained: nothing here touches `capability-matcher/`, and it uses a
static snapshot of `data/employees.json` (no backend needed).

## Run

```bash
cd animation
npm install
npm run dev          # http://localhost:5199  (add ?dev for the scrubber)
npm run render       # -> renders/showcase.mp4 (~6 min for 1080p60)
```

`npm run render` uses the installed Edge/Chrome and `ffmpeg` on PATH.

| Render option | Effect |
|---|---|
| `-- --fps 30 --crf 22` | Quick, smaller draft |
| `-- --from 0 --to 5` | Only that range of video time |
| `-- --shot 4.5,12.4` | PNGs of those timeline times in `renders/shots/` |

## Presenting

| Key | Action |
|---|---|
| Space / → / Enter | Play to the next cue (pressing mid-beat finishes it instantly) |
| ← | Back to the previous cue |
| 1–9 | Jump to the start of a scene |
| Home | Reset to the blank first frame |
| F | Fullscreen |
| D | Toggle the dev scrubber (also `?dev`; `?t=12.4` opens paused at 12.4 s) |
| V | Preview the looping video in the browser |

After the last beat, one more press fades out and restarts.

## How it works

- Every scene is a pure function of the timeline time `t` (`useT()`); no CSS
  transitions or timers. That is what makes video frames exact and seeking free.
- **All timings live in [`src/timeline.js`](src/timeline.js)**: `TL` holds the
  animation windows, `CUES` holds the pause points. In the video, playback never
  stops but each cue holds the picture for `hold` seconds.
- The video loops because the final frame is identical to the first (blank
  backdrop; the glow animation loops over `END`).

```
src/engine/      easing, Player (keys, clock, render hook), cue/hold maths, scroll motion profile
src/components/  EmployeeRow (replica of Frame3 row), EmployeeCard (new), Words, Backdrop
src/scenes/      one file per scene
src/theme.js     product colours + sample-data helpers (featured employee, availability)
src/layout.js    shared positions (list column, card, text)
scripts/         render.mjs, snapshot-data.mjs
```

## Adding a scene

1. Add its windows to `TL` and its pause points to `CUES` (extend `END`; keep
   the final state blank to preserve the loop).
2. Create `src/scenes/SceneN….jsx`, derive everything from `useT()` and `TL`,
   return `null` outside its time range.
3. Mount it in `src/main.jsx` and add it to `SCENES` for number-key jumps.

## Data

`node scripts/snapshot-data.mjs` regenerates
`src/data/employees.sample.json` from `../data/employees.json`. The featured
employee is `FEATURED_ID` there and in `src/theme.js`. Availability uses the
fixed demo window in `theme.js`.
