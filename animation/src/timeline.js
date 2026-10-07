// All timings (seconds, timeline time). Scenes read these so that retiming
// something means editing one number here.
//
// Every CUE is a resting point of the interactive version: a keypress plays
// from one cue to the next. Animation windows below must finish before the
// next cue and start after the previous one.

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
  bulletsOut: [19.8, 20.5], // bullet list leaves; the card stays

  // Scene 4 – abundance of data (same card on screen)
  dataA: [19.9, 21.7],
  dataB: [22.2, 24.0],
  dataOut: [24.6, 25.4],
  cardOut: [24.6, 25.4],

  // Scene 5 – "We present Deloitte Matchmaker"
  presentA: [25.4, 26.3], // "We present"
  presentB: [26.2, 27.5], // product name
  presentC: [27.3, 28.9], // tagline
  presentOut: [29.2, 29.9],

  // Scene 6 – the five steps
  stepBar: [29.7, 30.3],
  steps: [
    [30.0, 30.6],
    [30.4, 31.0],
    [30.8, 31.4],
    [31.2, 31.8],
    [31.6, 32.2],
  ],
  hl1: [32.4, 33.2], // "Project Overview" highlighted

  // Scene 7 – describe the project and its roles
  ovText: [33.8, 35.4],
  ovIn: [33.8, 34.9], // page slides in
  ovType: [34.9, 37.0], // description is typed
  ovRoles: [37.0, 38.6], // role rows appear

  // Scene 8 – capability inference
  hl2: [39.2, 40.0], // highlight moves to "Capability Inference"
  ovOut: [39.2, 39.9],
  skText: [39.7, 41.8],
  skIn: [39.8, 40.7],
  skInfer: [40.7, 41.5], // shimmering placeholders
  skResolve: [41.5, 42.9], // skills appear one by one

  // Scene 9 – humans stay in control
  skTextOut: [43.4, 44.0],
  humanA: [43.9, 45.5], // "Skills can be added, removed, and weighted."
  cutPress: [45.0, 45.3], // the ✕ is pressed
  cut: [45.3, 46.1], // the skill collapses away
  searchType: [46.6, 47.8],
  searchResults: [47.8, 48.3],
  searchPick: [48.4, 48.8],
  addIn: [48.9, 49.8], // new skill grows into the list
  weights: [50.3, 52.3], // every slider moves at once
  humanB: [52.9, 54.7], // "The AI always defers the final decision to a human."

  // Scene 9 leaves: skills page, both text blocks and the footnote
  skOut: [55.3, 56.1],

  // Scene 10 – every employee is matched (endless ticking list)
  hl3: [55.5, 56.4], // highlight moves to "Candidate Selection"
  matchText: [56.3, 58.7],
  listIn: [56.4, 57.3],

  // Scene 11 – "All in just a few seconds."
  fastText: [59.3, 60.5],

  // Scene 12 – the list stops and flips into ranked candidates
  matchTextOut: [61.1, 61.8],
  stop: [61.2, 62.6], // ticking decelerates to rest on a row
  orderText: [61.9, 63.5],
  flip: [62.7, 64.0], // rows flip one by one (staggered) into ranked rows

  // Scene 13 – filters
  orderTextOut: [64.8, 65.5],
  filterText: [65.4, 67.0],
  filtersIn: [65.5, 66.4],
  availTick: [67.0, 67.3], // "Available only" is ticked
  availCollapse: [67.4, 68.2], // unavailable rows leave, the rest move up
  locOpen: [68.7, 69.1], // location dropdown opens
  locCheck: [69.7, 70.0], // a location is ticked
  locClose: [70.4, 70.7], // dropdown closes, button shows 1 selected
  locCollapse: [70.7, 71.5], // rows from other locations leave

  // Everything fades back to the empty first frame so the video loops.
  outro: [72.6, 74.6],
};

export const END = 74.6;

// `hold` = seconds the picture rests at this cue in the looping video
// (ignored interactively).
export const CUES = [
  { t: 3.0, hold: 2.0, label: "Question" },
  { t: 10.2, hold: 1.6, label: "Problem" },
  { t: 12.4, hold: 1.5, label: "Previous experience" },
  { t: 14.0, hold: 1.5, label: "Relevant skills" },
  { t: 15.6, hold: 1.5, label: "Time and availability" },
  { t: 17.2, hold: 1.5, label: "Role level" },
  { t: 19.6, hold: 2.5, label: "And more…" },
  { t: 22.0, hold: 2.0, label: "Abundance of data" },
  { t: 24.4, hold: 2.5, label: "Missed opportunities" },
  { t: 29.0, hold: 3.0, label: "Deloitte Matchmaker" },
  { t: 32.2, hold: 2.0, label: "The five steps" },
  { t: 33.6, hold: 1.5, label: "Project overview highlighted" },
  { t: 39.0, hold: 2.5, label: "Project and roles described" },
  { t: 43.2, hold: 2.5, label: "Skills inferred" },
  { t: 50.1, hold: 1.5, label: "Skill removed and added" },
  { t: 52.7, hold: 1.5, label: "Weights adjusted" },
  { t: 55.1, hold: 3.0, label: "Human decides" },
  { t: 59.0, hold: 3.0, label: "Every employee is matched" },
  { t: 60.9, hold: 2.5, label: "All in a few seconds" },
  { t: 64.3, hold: 2.5, label: "Ranked candidates" },
  { t: 71.9, hold: 3.0, label: "Filtered" },
  { t: END, hold: 0.6, label: "Outro" },
];

// Number keys jump to these (the resting state *before* each scene plays);
// 1-9 then 0 reach the first ten, and [ / ] step through all of them.
export const SCENES = [
  { label: "Question", t: 0 },
  { label: "Problem", t: 3.0 },
  { label: "What gets weighed up", t: 10.2 },
  { label: "Abundance of data", t: 19.6 },
  { label: "Deloitte Matchmaker", t: 24.4 },
  { label: "Five steps", t: 29.0 },
  { label: "Project overview", t: 33.6 },
  { label: "Capability inference", t: 39.0 },
  { label: "Editing skills", t: 43.2 },
  { label: "Candidate matching", t: 55.1 },
  { label: "Ranked candidates", t: 60.9 },
  { label: "Filters", t: 64.3 },
];
