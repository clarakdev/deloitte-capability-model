// All timings (seconds, timeline time). Scenes read these so that retiming
// something means editing one number here.

export const TL = {
  // Scene 1 – the question
  qIn: [0.3, 2.6], // word-by-word reveal
  qOut: [3.0, 3.8],

  // Scene 2 – the problem + scrolling list
  pIn: [3.7, 5.4],
  scroll: [3.6, 9.9], // list whizzes up, then settles on the featured row
  select: [9.3, 9.9], // featured row gets its "selected" highlight
  pOut: [10.2, 10.9],

  // Scene 3 – what gets weighed up
  morph: [10.3, 11.7], // row expands into the employee card
  bullets: [
    [11.2, 12.0], // Previous experience
    [12.4, 13.3], // Relevant skills
    [14.0, 14.9], // Time and availability
    [15.6, 16.5], // Role level (Salary/budget)
  ],
  more: [17.2, 18.7], // "And more…" + extra card details
  outro: [19.6, 21.6], // everything fades back to the empty first frame
};

export const END = 21.6;

// One keypress plays up to the next cue. `hold` = seconds the picture rests
// at this cue in the looping video (ignored interactively).
export const CUES = [
  { t: 3.0, hold: 2.0, label: "Question" },
  { t: 10.2, hold: 1.6, label: "Problem" },
  { t: 12.4, hold: 1.5, label: "Previous experience" },
  { t: 14.0, hold: 1.5, label: "Relevant skills" },
  { t: 15.6, hold: 1.5, label: "Time and availability" },
  { t: 17.2, hold: 1.5, label: "Role level" },
  { t: 19.6, hold: 2.5, label: "And more…" },
  { t: 21.6, hold: 0.6, label: "Outro" },
];

// Number keys jump to these (state at the *start* of each scene).
export const SCENES = [
  { label: "Question", t: 0 },
  { label: "Problem", t: 3.0 },
  { label: "What gets weighed up", t: 10.2 },
];
