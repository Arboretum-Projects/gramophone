# Gramophone -- Design Document

JSON in, sound out. Declarative audio engine. Web Audio API underneath.

---

## Philosophy

The same pattern as the visual engines: describe what you want in JSON, the engine handles how it sounds. Opinionated defaults make everything warm, spacious, and present before you touch a parameter. The "bloom" of audio is reverb + gentle compression + warmth. Baked in, tunable, always present.

Self-contained. A single JSON file IS the composition. Everything generated from oscillators, noise, and synthesis.

---

## Scene Format

```json
{
  "title": "Scene Name",
  "bpm": 120,
  "key": "Cm",
  "swing": 0,
  "master": {},
  "voices": [],
  "patterns": [],
  "timeline": []
}
```

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | `"Untitled"` | Scene name |
| `bpm` | number | `120` | Beats per minute. Drives all time-based sequencing |
| `key` | string | `"C"` | Root key. Voices and patterns can reference scale degrees as well as absolute notes |
| `scale` | string | `"minor"` | Scale type. Used with `key` to resolve scale-degree references |
| `swing` | number | `0` | Swing amount (0-1). Shifts off-beat notes later for groove |
| `master` | object | `{}` | Master output chain (reverb, compression, warmth, limiter) |
| `voices` | array | `[]` | Sound sources: oscillators, noise, drums, chords |
| `patterns` | array | `[]` | Sequences that drive voices: note patterns, rhythms, arpeggios, generative loops |
| `timeline` | array | `[]` | Timed events: fade parameters, trigger patterns, filter sweeps |

---

## Voices

A voice is a sound source. Every voice has an ID, a type, and parameters specific to that type. Voices are silent until patterns trigger them.

### Oscillator

The basic synth voice. A waveform at a pitch.

```json
{
  "id": "lead",
  "type": "oscillator",
  "waveform": "sawtooth",
  "octave": 4,
  "detune": 4,
  "gain": 0.3,
  "envelope": { "attack": 0.01, "decay": 0.2, "sustain": 0.6, "release": 0.4 },
  "filter": { "type": "lowpass", "frequency": 2000, "Q": 1 },
  "effects": ["delay"]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `waveform` | string | `"sine"` | `sine`, `square`, `sawtooth`, `triangle` |
| `octave` | number | `4` | Base octave (0-8). Patterns supply the note, voice supplies the octave default |
| `detune` | number | `0` | Detuning in cents. Small values (2-8) add richness |
| `gain` | number | `0.5` | Voice volume (0-1) |
| `pan` | number | `0` | Stereo position (-1 left, 0 center, 1 right) |
| `envelope` | object | ADSR defaults | Attack/Decay/Sustain/Release envelope |
| `filter` | object | none | Biquad filter (lowpass, highpass, bandpass, notch) |
| `effects` | array | `[]` | Named effects from the master effects list, or inline effect objects |
| `sidechain` | object | none | Sidechain ducking. `{ "source": "kick", "amount": 0.8, "release": 0.1 }` ducks this voice when the source voice triggers |

### Noise

Textural sound source. No pitch.

```json
{
  "id": "atmosphere",
  "type": "noise",
  "color": "pink",
  "gain": 0.08,
  "filter": { "type": "bandpass", "frequency": 800, "Q": 3 }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `color` | string | `"white"` | `white` (flat spectrum), `pink` (warm, -3dB/octave), `brown` (dark, -6dB/octave) |

Noise voices are continuous by default. The envelope only applies when driven by a pattern.

### Drum

Synthesized percussion. Fully self-contained, generated from synthesis recipes.

```json
{
  "id": "kick",
  "type": "drum",
  "sound": "kick",
  "gain": 0.7,
  "pitch": 0,
  "decay": 0
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sound` | string | required | `kick`, `snare`, `hihat`, `clap`, `tom`, `rim`, `cymbal` |
| `pitch` | number | `0` | Pitch offset in semitones from the default tuning |
| `decay` | number | `0` | Decay offset. Positive for longer, negative for tighter |

Each drum sound is a synthesis recipe:
- **kick**: Low sine (150Hz->40Hz pitch sweep) + fast exponential decay
- **snare**: Mid sine (200Hz) + filtered white noise burst + medium decay
- **hihat**: Bandpass-filtered white noise (8kHz) + very short decay
- **clap**: Layered noise bursts with slight timing spread
- **tom**: Mid sine (100-300Hz depending on pitch) + moderate decay
- **rim**: High sine click (800Hz) + very short decay
- **cymbal**: Highpass-filtered noise + long decay with gentle rolloff

### Chord

A voice that plays multiple notes simultaneously. Built from oscillators.

```json
{
  "id": "pad",
  "type": "chord",
  "waveform": "triangle",
  "voices": 3,
  "spread": 6,
  "gain": 0.2,
  "envelope": { "attack": 0.8, "decay": 0.3, "sustain": 0.7, "release": 1.5 },
  "filter": { "type": "lowpass", "frequency": 1200 }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `voices` | number | `3` | Number of oscillators per note. Creates unison richness |
| `spread` | number | `5` | Detune spread in cents across unison voices |

When a pattern sends a chord (e.g., `["C4", "Eb4", "G4"]`), the engine creates `voices` oscillators per note, slightly detuned across the `spread` range.

---

## Envelopes

ADSR envelope shapes how a note's volume evolves over time. All values in seconds except sustain (0-1 level).

```json
{
  "attack": 0.01,
  "decay": 0.2,
  "sustain": 0.6,
  "release": 0.4
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `attack` | `0.01` | Time to reach peak volume |
| `decay` | `0.1` | Time from peak to sustain level |
| `sustain` | `0.8` | Held volume level (0-1) while note is active |
| `release` | `0.3` | Time to fade to silence after note ends |

Preset envelopes:
- `"pluck"`: `{ attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1 }`
- `"pad"`: `{ attack: 0.8, decay: 0.3, sustain: 0.7, release: 1.5 }`
- `"stab"`: `{ attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.05 }`
- `"swell"`: `{ attack: 2.0, decay: 0.5, sustain: 0.6, release: 2.0 }`
- `"percussive"`: `{ attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.1 }`

---

## Filters

Biquad filters shape the frequency content of a voice.

```json
{
  "type": "lowpass",
  "frequency": 2000,
  "Q": 1
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `type` | `"lowpass"` | `lowpass`, `highpass`, `bandpass`, `notch`, `allpass`, `peaking`, `lowshelf`, `highshelf` |
| `frequency` | `1000` | Cutoff/center frequency in Hz |
| `Q` | `1` | Resonance / quality factor. Higher = sharper peak at cutoff |
| `gain` | `0` | Gain in dB (only for peaking, lowshelf, highshelf) |

Filter frequency and Q are animatable via timeline events.

---

## Effects

Effects process audio through additional nodes. Defined at the master level and referenced by name, or defined inline on a voice.

### Master Effects

```json
{
  "master": {
    "reverb": { "decay": 2.5, "wet": 0.3 },
    "delay": { "time": "3/8", "feedback": 0.3, "wet": 0.2 },
    "compression": { "threshold": -12, "ratio": 4, "attack": 0.003, "release": 0.25 },
    "warmth": 0.4,
    "limiter": true,
    "gain": 0.8
  }
}
```

### Reverb

Algorithmic reverb. The "bloom" of audio.

| Field | Default | Description |
|-------|---------|-------------|
| `decay` | `2.0` | Reverb tail length in seconds |
| `wet` | `0.3` | Wet/dry mix (0 = dry, 1 = fully wet) |
| `damping` | `0.5` | High-frequency absorption (0 = bright, 1 = dark) |
| `preDelay` | `0.01` | Delay before reverb onset in seconds |

### Delay

Echo effect. Time values can be absolute (seconds) or musical (`"1/4"`, `"3/8"`, `"1/8d"` for dotted).

| Field | Default | Description |
|-------|---------|-------------|
| `time` | `"1/4"` | Delay time. Musical divisions sync to BPM |
| `feedback` | `0.3` | How much signal feeds back (0-0.95) |
| `wet` | `0.2` | Wet/dry mix |
| `filter` | `2000` | Lowpass on feedback loop. Darkens repeats naturally |

### Compression

Glues the mix together.

| Field | Default | Description |
|-------|---------|-------------|
| `threshold` | `-12` | Level (dB) where compression starts |
| `ratio` | `4` | Compression ratio |
| `attack` | `0.003` | Attack time in seconds |
| `release` | `0.25` | Release time in seconds |

### Warmth

The signature Gramophone tint. A single number (0-1) that applies:
- Subtle saturation (waveshaper with soft knee)
- Gentle high-frequency rolloff (lowpass at 12kHz, slopes down)
- Very slight low-end boost (+2dB shelf at 200Hz)

`"warmth": 0.4` is the default. `0` is clean/clinical. `1` is lo-fi tape.

### Limiter

Safety net. Prevents clipping on the master output. Boolean, on by default.

---

## Patterns

Patterns drive voices. They determine when notes play, which notes, and how they evolve. A pattern references a voice by ID and describes a repeating musical figure.

### Note Pattern

A sequence of notes that loops.

```json
{
  "id": "melody",
  "voice": "lead",
  "type": "notes",
  "notes": ["C4", "Eb4", "G4", "Bb4", "G4", "Eb4"],
  "duration": "1/8",
  "humanize": 0.02,
  "velocity": [0.8, 0.6, 0.9, 0.7, 0.6, 0.5],
  "loop": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `notes` | required | Array of note names (`"C4"`, `"Eb4"`), scale degrees (`1`, `b3`, `5`), or rests (`"-"`) |
| `duration` | `"1/4"` | Note duration. Musical divisions or seconds |
| `humanize` | `0` | Random timing offset in seconds. Small values (0.01-0.03) add life. Offsets each trigger from its grid position |
| `velocity` | `1` | Volume per note. Single value or array matching notes length |
| `velocityHumanize` | `0` | Random velocity variation per trigger (0-1). `0.1` means each note's velocity varies by up to +/-0.1 |
| `loop` | `true` | Whether the pattern repeats |
| `probability` | `1` | Chance each note fires (0-1). `0.7` means 30% of notes randomly skip |

### Rhythm Pattern

A grid-based pattern for drums and percussion.

```json
{
  "id": "beat",
  "voice": "kick",
  "type": "rhythm",
  "steps": 16,
  "hits": [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
  "velocity": [1, 0, 0, 0, 0.8, 0, 0, 0, 1, 0, 0, 0.6, 0.9, 0, 0, 0],
  "loop": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `steps` | `16` | Grid resolution per bar |
| `hits` | required | Array of 1s and 0s. `1` = trigger, `0` = rest |
| `velocity` | `1` | Volume per step. Array or single value |
| `loop` | `true` | Repeat |

### Arpeggio

Automatically cycles through chord tones.

```json
{
  "id": "arp",
  "voice": "bell",
  "type": "arpeggio",
  "chord": ["C4", "Eb4", "G4", "Bb4"],
  "direction": "up",
  "rate": "1/16",
  "octaves": 2,
  "loop": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `chord` | required | Notes to arpeggiate. Can use scale degrees |
| `direction` | `"up"` | `up`, `down`, `updown`, `downup`, `random` |
| `rate` | `"1/8"` | Speed of arpeggiation |
| `octaves` | `1` | Octave range to span |

### Drone

Continuous sustained tone. Always on, shaped by timeline events.

```json
{
  "id": "sub",
  "voice": "bass",
  "type": "drone",
  "note": "C2"
}
```

The voice's envelope is ignored for drones. The note sustains indefinitely. Use timeline events to fade drones in/out or sweep their filter.

### Generative

Probabilistic note selection from a pool.

```json
{
  "id": "ambient-bells",
  "voice": "bell",
  "type": "generative",
  "pool": ["C5", "Eb5", "G5", "Bb5", "C6"],
  "rate": "1/2",
  "probability": 0.6,
  "velocityRange": [0.2, 0.7],
  "humanize": 0.05,
  "loop": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `pool` | required | Notes to randomly select from |
| `rate` | `"1/4"` | How often a note can trigger |
| `probability` | `0.5` | Chance a note fires on each interval |
| `velocityRange` | `[0.3, 0.8]` | Random velocity range [min, max] |
| `humanize` | `0` | Timing randomness |

### Chord Progression

Drives a chord voice through a sequence of chords.

```json
{
  "id": "changes",
  "voice": "pad",
  "type": "progression",
  "chords": [
    { "notes": ["C3", "Eb3", "G3"], "duration": "1m" },
    { "notes": ["Ab2", "C3", "Eb3"], "duration": "1m" },
    { "notes": ["Bb2", "D3", "F3"], "duration": "1m" },
    { "notes": ["G2", "Bb2", "D3"], "duration": "1m" }
  ],
  "loop": true
}
```

`"1m"` = one measure. Chord changes happen on the downbeat. The voice's envelope handles the transitions.

---

## Timeline

Timeline events change parameters over time: choreographed events at specific offsets.

```json
{
  "timeline": [
    { "target": "lead", "to": { "gain": 0.3 }, "duration": "2m", "ease": "inOut", "offset": 0 },
    { "target": "master.reverb", "to": { "wet": 0.6 }, "duration": "4m", "offset": "4m" },
    { "target": "kick", "to": { "gain": 0.7 }, "duration": "1/4", "offset": "8m" },
    { "type": "start", "pattern": "melody", "offset": "4m" },
    { "type": "stop", "pattern": "beat", "offset": "16m" }
  ]
}
```

### Target Syntax

- `"lead"` targets voice by ID (animates gain, filter.frequency, pan, detune, etc.)
- `"master.reverb"` targets master effect (animates wet, decay, etc.)
- `"master"` targets master output (animates gain, warmth)

### Event Types

| Type | Description |
|------|-------------|
| `to` (default) | Animate a parameter from current value to target over duration |
| `set` | Instant parameter change |
| `start` | Start a pattern that was initially inactive |
| `stop` | Stop a running pattern |
| `mute` / `unmute` | Mute/unmute a voice without stopping its patterns |

### Time Values

All duration and offset values can be:
- **Seconds**: `2.5`
- **Musical**: `"1/4"` (quarter note), `"1m"` (one measure), `"4m"` (four measures), `"1/8d"` (dotted eighth)
- **Relative**: `"<<"` (same time as previous), `"<<+=1m"` (one measure after previous start)

---

## Musical Helpers

### Note Names

Standard format: note name + octave. `C4` is middle C.

- Sharps: `C#4`, `F#3`
- Flats: `Eb4`, `Bb3`
- Rests: `"-"`

### Scale Degrees

When `key` and `scale` are set, patterns can use scale degrees (resolved to absolute notes at runtime):

- `1` = root, `2` = second, `3` = third, etc.
- `b3` = flat third, `#4` = sharp fourth
- Degrees resolve against the current key/scale

### Scales

`major`, `minor` (natural), `harmonicMinor`, `melodicMinor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `aeolian`, `locrian`, `pentatonic`, `minorPentatonic`, `blues`, `chromatic`, `wholeTone`

### Musical Time

At 120 BPM in 4/4:
- `"1m"` = 2 seconds (one measure)
- `"1/4"` = 0.5 seconds (quarter note)
- `"1/8"` = 0.25 seconds (eighth note)
- `"1/16"` = 0.125 seconds (sixteenth note)
- `"1/8d"` = 0.375 seconds (dotted eighth)
- `"1/8t"` = 0.167 seconds (triplet eighth)

---

## Defaults -- The Gramophone Sound

Every scene gets these defaults. They're the reason a minimal JSON file already sounds good.

### Master Defaults

```json
{
  "reverb": { "decay": 2.0, "wet": 0.3, "damping": 0.5 },
  "compression": { "threshold": -12, "ratio": 4 },
  "warmth": 0.4,
  "limiter": true,
  "gain": 0.8
}
```

### Voice Defaults

- Envelope: `{ attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }`
- Gain: `0.5`
- Pan: `0` (center)

### The Aesthetic

The warmth parameter is the soul of the Gramophone sound. At `0.4` (default), every voice gets:
- Soft saturation that adds harmonics while staying clean
- A gentle high-frequency rolloff that prevents harshness
- A subtle low-end presence boost

The reverb at `0.3` wet puts every sound in a room. The compression at -12dB/4:1 glues the mix. Together, these three defaults produce the Gramophone signature: warm, spacious, present.

Turn warmth to `0` for clinical digital. Turn it to `1` for lo-fi tape warmth. The default sits in the sweet spot.

---

## File Structure

```
gramophone/
  index.html              -- Player app (transport + waveform visualizer)
  src/
    engine.js             -- Core: parse scene, build audio graph, schedule patterns
    synthesis.js          -- Voice implementations (oscillator, noise, drum, chord)
    effects.js            -- Effect nodes (reverb, delay, warmth, compression)
    sequencer.js          -- Pattern scheduling against BPM clock
    scales.js             -- Musical theory helpers (note parsing, scale resolution)
    transport.js          -- Playback controls (play, pause, seek, BPM)
    visualizer.js         -- Waveform / frequency display (AnalyserNode)
  examples/
    ambient-drone.json
    four-on-the-floor.json
    generative-bells.json
    chord-progression.json
    ...
```

---

