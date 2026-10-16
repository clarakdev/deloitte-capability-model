# Capability Matcher – Showcase Animation

Motion-graphics demo of the product, built as a small React app with a custom
deterministic timeline engine. One set of scenes produces both:

- an **interactive presentation** (keypress advances, like PowerPoint build steps)
- a **seamless looping MP4** (1080p60)

It is self-contained: nothing here touches `capability-matcher/`, and it uses a
static snapshot of `data/employees.json` and `data/project.json` (no backend needed).

## Run

```bash
cd animation
npm install
npm run dev          # http://localhost:5199  (add ?dev for the scrubber)
npm run render       # -> renders/showcase.mp4 (~35 min for 1080p60, ~3 min of video)
```

`npm run render` uses the installed Edge/Chrome and `ffmpeg` on PATH.

| Render option | Effect |
|---|---|
| `-- --fps 30 --crf 22` | Quick, smaller draft |
| `-- --from 0 --to 5` | Only that range of video time |
| `-- --shot 4.5,12.4` | PNGs of those timeline times in `renders/shots/` |

## Scenes and beats

Each beat is one keypress (cue labels are in `CUES`).

| # | Scene | Beats |
|---|---|---|
| 1 | Question | 1 |
| 2 | Problem (scrolling employee list) | 1 |
| 3 | What gets weighed up (employee card) | 5: four bullets, then "And more…" |
| 4 | Abundance of data (card stays) | 2: one per line |
| 5 | Deloitte Matchmaker | 1 |
| 6 | The five steps | 2: steps appear, then Project Overview highlights |
| 7 | Describe the project and roles | 1 |
| 8 | Capability inference | 1 |
| 9 | Humans stay in control | 3: skill removed and added, weights move, final line |
| 10 | Every employee is matched (endless ticking list) | 1; the list keeps ticking at the rest point |
| 11 | "All in just a few seconds" | 1; still ticking |
| 12 | Ranked candidates (list stops, rows flip) | 1 |
| 13 | Filters (Available only + location) | 1 |
| 14 | AI report on the top candidate | 1 |
| 15 | Gap analysis for the selected candidate | 1 |
| 16 | Two candidates compared side by side | 1 |
| 17 | Team report | 1 |
| 18 | "This team is not locked in" | 1 |
| 19 | "Data-informed decisions…" | 1 |
| 20 | Closing title | 1 (then one more press fades out and restarts) |

## Presenting

| Key | Action |
|---|---|
| Space / → / Enter | Play to the next cue (pressing mid-beat finishes it instantly) |
| ← | Back to the previous cue |
| 1–9, 0 | Jump to the start of scene 1–10 |
| [ / ] | Jump to the previous / next scene |
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
- **Endless motion:** `useLive()` (from `engine/timeline.js`) is ambient time that
  keeps running while the timeline rests at a cue (`live = t + time spent paused`;
  in the video it is video time, so holds animate too). Scene 10's ticking list
  uses it. To hand off cleanly to a normal beat, a scene can read the pause offset
  as `live - t` (constant while a beat plays), as the list's stop-and-settle does.

```
src/engine/      easing, Player (keys, clock, render hook), cue/hold maths, scroll motion profile
src/components/  EmployeeRow (Frame3 row; optional match meter / fit / AI-report button / tick),
                 EmployeeCard (new), ProjectOverview (Frame1), SkillRequirements (Frame2),
                 FilterBar (Frame3 filters), AiReportPanel (Frame3 inline report),
                 GapPanel (Frame4, simplified), TeamReport (team report page, simplified),
                 Radar (radar plot), ProductPage (shared card/badge/page frame), Words, Backdrop
src/scenes/      one file per scene group (Scene6Steps is the progress bar that stays up through
                 scenes 6-19; Scene8Skills = scenes 8-9, one skills page; Scene10Match = scenes
                 10-14, one candidate list; Scene15Gap = 15-16, gap panels; Scene17Team = 17-19,
                 team report; Scene20Title = closing title)
src/theme.js     product colours + sample-data helpers (featured employee, ranked list)
src/story.js     data for the gap/team scenes (capabilities, two compared candidates, the team)
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
`src/data/employees.sample.json` and `src/data/project.sample.json` from `../data/`. The featured
employee is `FEATURED_ID` there and in `src/theme.js`. Availability uses the
fixed demo window in `theme.js`.
