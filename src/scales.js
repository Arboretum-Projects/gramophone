// Musical theory helpers -- note parsing, scale resolution, time conversion

const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS = { '#': 1, b: -1 };

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

const ENVELOPE_PRESETS = {
  pluck: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  pad: { attack: 0.8, decay: 0.3, sustain: 0.7, release: 1.5 },
  stab: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
  swell: { attack: 2.0, decay: 0.5, sustain: 0.6, release: 2.0 },
  percussive: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
};

const DEFAULT_ENVELOPE = { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 };

function noteToMidi(note) {
  if (!note || note === '-') return null;
  const m = String(note).match(/^([A-G])(#|b)?(-?\d)$/);
  if (!m) return null;
  return (parseInt(m[3]) + 1) * 12 + NOTE_SEMITONES[m[1]] + (m[2] ? ACCIDENTALS[m[2]] : 0);
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteToFreq(note) {
  const midi = noteToMidi(note);
  return midi !== null ? midiToFreq(midi) : null;
}

function keyRoot(key) {
  const clean = key.replace(/m$/, '');
  const m = clean.match(/^([A-G])(#|b)?$/);
  if (!m) return 0;
  return NOTE_SEMITONES[m[1]] + (m[2] ? ACCIDENTALS[m[2]] : 0);
}

function resolveScaleDegree(degree, key, scale, octave) {
  const intervals = SCALES[scale] || SCALES.major;
  const root = keyRoot(key);

  let str = String(degree);
  let acc = 0;
  if (str.startsWith('b')) { acc = -1; str = str.slice(1); }
  else if (str.startsWith('#')) { acc = 1; str = str.slice(1); }

  const deg = parseInt(str) - 1;
  const octShift = Math.floor(deg / intervals.length);
  const idx = ((deg % intervals.length) + intervals.length) % intervals.length;

  const midi = root + (octave + 1) * 12 + intervals[idx] + acc + octShift * 12;
  return midiToFreq(midi);
}

function resolveNote(note, key, scale, octave) {
  if (!note || note === '-') return null;
  if (Array.isArray(note)) return note.map(n => resolveNote(n, key, scale, octave)).filter(Boolean);
  if (typeof note === 'string' && /^[A-G]/.test(note)) return noteToFreq(note);
  if (typeof note === 'number' || /^[b#]?\d/.test(String(note))) {
    return resolveScaleDegree(note, key, scale, octave ?? 4);
  }
  return null;
}

function parseTime(value, bpm) {
  if (typeof value === 'number') return value;
  const str = String(value);
  const beat = 60 / bpm;
  const measure = beat * 4;

  const mm = str.match(/^(\d+)m$/);
  if (mm) return parseInt(mm[1]) * measure;

  const dm = str.match(/^(\d+)\/(\d+)(d|t)?$/);
  if (dm) {
    let dur = (parseInt(dm[1]) / parseInt(dm[2])) * measure;
    if (dm[3] === 'd') dur *= 1.5;
    if (dm[3] === 't') dur *= 2 / 3;
    return dur;
  }

  return parseFloat(str) || 0;
}

function resolveEnvelope(env) {
  if (!env) return { ...DEFAULT_ENVELOPE };
  if (typeof env === 'string') return { ...DEFAULT_ENVELOPE, ...(ENVELOPE_PRESETS[env] || {}) };
  return { ...DEFAULT_ENVELOPE, ...env };
}

export {
  SCALES, ENVELOPE_PRESETS, DEFAULT_ENVELOPE,
  noteToMidi, midiToFreq, noteToFreq,
  keyRoot, resolveScaleDegree, resolveNote,
  parseTime, resolveEnvelope,
};
