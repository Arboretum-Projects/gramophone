# Gramophone -- Composition Guide

JSON in, sound out. Describe voices, patterns, effects, and timeline in JSON. The engine handles synthesis, scheduling, and the master chain. You handle the composition.

Full spec: [DESIGN.md](DESIGN.md)

---

## The Creative Instinct

The engine can make any sound. The composition guide teaches principles. The danger is collapsing every scene into the same safe patterns: stepwise melodies, root-anchored bass, straight eighth-note hats, 2-bar chord cycles. Those are one point on a vast creative surface.

**Start from the scene's identity.** What is this piece about? A house track pumps. A nighttime drive breathes. A battle charges. An ambient piece dissolves. The theme dictates the melodic contour, the bass role, the rhythmic density, and the envelope shapes. Decide the character first, then choose the patterns that serve it.

**Experiment.** Try a bass that never moves (drone). Try a lead that plays three notes in four bars (atmospheric). Try hats on every 16th (urgency) or only on off-beats (swing). Try a descending arp. Try a melody built from one repeated note with rhythmic variation. The guide below teaches what works in general. Use it as a foundation, then push past it.

**Each scene should sound like itself.** Give it a distinct voice.

---

## Three Layers of Composition

### 1. The Sound (Voices)

Voices are instruments. Each one occupies a frequency zone. Only one element should dominate any zone.

| Zone | Range | What Lives Here |
|------|-------|-----------------|
| Sub | 20-80 Hz | Sub oscillator (sine, low octave) |
| Bass | 80-300 Hz | Bass synth (sawtooth/square with lowpass filter) |
| Low-mid | 300-600 Hz | Chord pads (high-pass at 150-300 Hz when bass is present) |
| Mid | 600 Hz-1.2 kHz | Lead synth body, chord clarity |
| Upper-mid | 1.2-5 kHz | Attack transients, lead presence, hat body |
| High | 5-20 kHz | Hi-hat shimmer, air, reverb tails |

A full scene needs **3-5 melodic/harmonic voices** plus drums. More than that and the ear loses track. A functional voice stack:

1. **Sub/bass** (below 200 Hz): sine or filtered sawtooth, mono (pan: 0)
2. **Chord pad** (300 Hz-4 kHz): chord voice with spread voicing, wide stereo
3. **Lead melody** (500 Hz-5 kHz): oscillator, centered or slight pan
4. **High texture** (2 kHz+): arpeggio or generative, wider pan

Drums sit on top of this. That is a complete arrangement.

### 2. The Rhythm (Patterns)

Patterns drive voices. The pattern type determines the musical role.

**Drums: groove comes from velocity variation + swing + ghost notes.**

Velocity ranges (0-1 scale):
- Kick: 0.85-1.0. Snare downbeat: 0.8-0.9. Hi-hat: 0.4-0.7. Ghost snare: 0.3-0.5.
- Vary hat velocity by 0.1-0.15 per hit. Keep kick variation under 0.1.

Swing: 0.04-0.08 for most electronic music. 0.10-0.15 for hip-hop/shuffle feel.

Ghost notes: Add 2-4 ghost snare hits per bar at 40-50% of main snare velocity. If you can hear them as distinct hits, they are too loud.

Common drum patterns (16-step grid, 1 = hit, 0 = rest):

```
4-on-the-floor (house, 120-128 BPM):
  kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]
  snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
  hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]

Halftime (trap, 80-100 BPM):
  kick:  [1,0,1,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]
  snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]

Breakbeat (DnB, 160-180 BPM):
  kick:  [1,0,0,0, 0,1,0,0, 0,0,0,0, 0,0,0,0]
  snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
```

**Melody: match the contour to the scene's character.**

Every scene needs a different melodic shape. The trap is writing the same "root → up a 3rd → step down → rest" contour in every key. Before writing notes, decide what KIND of melody the scene needs:

| Role | Contour | When to use |
|------|---------|-------------|
| **Atmospheric** | Long held notes, wide spacing, few pitches | Nighttime, ambient, driving |
| **Angular** | Wide leaps (4ths, 5ths, octaves), dramatic silences | Cinematic, action, tension |
| **Rhythmic stab** | Repeated notes on off-beats, syncopated hits | House, dance, energy |
| **Flowing** | Stepwise motion, call-and-response phrases | Melodic, emotional, vocal |
| **Motivic** | Short 2-3 note cell that repeats and develops | Minimal, building, hypnotic |

Composition principles that apply across all types:
- Chord tones (root, 3rd, 5th, 7th) on strong beats. Non-chord tones on weak beats.
- After a leap, move stepwise in the opposite direction.
- Silence is a note. A melody that breathes is more memorable than one that fills every beat.

**Bass: the role defines the pattern.**

The bass serves the groove. Different scenes need different bass roles:

| Role | Pattern | When to use |
|------|---------|-------------|
| **Octave pump** | Root alternating low/high octave, rhythmic | House, dance, sidechain pumping |
| **Driving pulse** | Repeated root with syncopated lifts | Driving, synthwave, urgency |
| **Walking line** | Stepwise motion connecting chord tones | Jazz-influenced, sophisticated |
| **Ostinato** | Fixed rhythmic cell, pitch changes at chord boundaries | Cinematic, dramatic, mechanical |
| **Drone** | Single sustained note | Ambient, minimal, grounding |

Avoid defaulting to "root → rest → root → rest → up a 3rd → step down." That's one pattern among many. Pan center, keep below 200 Hz with a lowpass filter.

**Chords: smooth voice leading.**

- Pads: shell voicing (root + 3rd + 7th, omit 5th). Spread across 2 octaves.
- Arpeggios: close voicing within one octave. Let the movement create the spread.
- When moving between chords, keep common tones stationary. Move other notes by the smallest interval possible.
- In ambient contexts: one chord change per 4-8 bars. In active sections: one per 1-2 bars.

### 3. The Arc (Timeline)

Timeline events build and release energy over time. All sections should be multiples of 4 or 8 bars.

**Introduction order** (the canonical build):

| Bar | What Enters |
|-----|-------------|
| 1 | Kick alone, or atmosphere |
| 9 | Hi-hats and percussion |
| 17 | Bass |
| 25 | Chord pad or arpeggio |
| 33+ | Lead melody (or save for the drop) |

Reverse the order for breakdowns and outros.

**Section lengths:**
- Intro: 8-32 bars. Minimal.
- Build: 16-32 bars. One new element every 8 bars.
- Drop: 16-32 bars. Everything in.
- Breakdown: 8-32 bars. Drums out, pad/atmosphere only.
- Outro: 8-16 bars. Elements peel away.

**Filter sweeps for tension:** Slowly raise a lowpass filter on a pad or lead during a build (4-8 bars). When the drop hits, open the filter fully. The release of the filter IS the energy release.

**Parameter automation examples:**
```json
{ "target": "pad", "to": { "filter.frequency": 4000 }, "duration": "8m", "offset": "8m" }
{ "target": "lead", "to": { "gain": 0.2 }, "duration": "4m", "offset": "16m" }
{ "target": "master.reverb", "to": { "wet": 0.5 }, "duration": "8m", "offset": "8m" }
```

---

## Chord Progressions That Work

**Minor (most electronic music defaults here):**
- i - VI - III - VII (e.g., Am - F - C - G). The workhorse. Melancholic, bittersweet.
- i - VII - VI - VII (e.g., Am - G - F - G). Loop-friendly, perpetual motion.
- i - iv - i - VII (e.g., Am - Dm - Am - G). Darker, more modal.

**Major (euphoric, uplifting):**
- I - V - vi - IV (e.g., C - G - Am - F). Universal.
- I - IV - I - V (e.g., C - F - C - G). Anthemic.

**Modal (ambient, floating):**
- Dorian i - IV (e.g., Am - D). Hopeful minor.
- Lydian I - II. Dreamy, weightless.
- Tritone alternation (C - Gb). Minimalist ambient.

**Borrowed chord trick:** In a major key, borrow the iv chord from parallel minor. I - IV - iv - I (e.g., C - F - Fm - C). The Fm creates a surprising dip.

---

## Effects as Composition

**Reverb** is the room. Default to `wet: 0.2-0.25`. Go to `0.3-0.35` only for spacious scenes (bells, ambient). Above `0.35` the reverb swallows transients and the mix loses definition. `decay: 1.5-2.5` for natural rooms. `decay: 3-5` for ambient spaces, but pair long decay with lower wet to keep clarity. Higher `damping` darkens the tail. Use `0.5+` on dense mixes to keep the reverb out of the way.

**Delay** creates rhythmic depth. Dotted eighth (`"3/8"`) is the most musical delay time. It syncopates against the beat, creating rhythmic counterpoint. Quarter note (`"1/4"`) for grounded echo. Keep `feedback` under 0.4 for rhythmic delay, higher for ambient wash.

**Warmth** is the Gramophone signature. `0.3-0.5` for warm presence. `0.6-0.8` for lo-fi tape character. `0` for clinical digital.

**Compression** glues the mix. Default `-12dB / 4:1` works for most scenes. Lower threshold (`-18` to `-24`) for heavier glue in ambient scenes.

---

## Quick Reference: Scene Skeleton

```json
{
  "title": "...",
  "bpm": 120,
  "key": "C",
  "scale": "minor",
  "swing": 0.05,
  "voices": [
    { "id": "kick", "type": "drum", "sound": "kick", "gain": 0.7 },
    { "id": "snare", "type": "drum", "sound": "snare", "gain": 0.5 },
    { "id": "hat", "type": "drum", "sound": "hihat", "gain": 0.3 },
    { "id": "bass", "type": "oscillator", "waveform": "sawtooth", "gain": 0.25,
      "envelope": { "attack": 0.005, "decay": 0.15, "sustain": 0.4, "release": 0.1 },
      "filter": { "type": "lowpass", "frequency": 600, "Q": 2 } },
    { "id": "pad", "type": "chord", "waveform": "triangle", "voices": 3, "spread": 6, "gain": 0.1,
      "envelope": "pad", "filter": { "type": "lowpass", "frequency": 2000 } },
    { "id": "lead", "type": "oscillator", "waveform": "sawtooth", "gain": 0.12, "detune": 4,
      "envelope": "pluck", "filter": { "type": "lowpass", "frequency": 3000 } }
  ],
  "patterns": [
    "... drums, bass, melody, chords ..."
  ],
  "timeline": [
    "... stagger entries by 8-bar sections, automate filters ..."
  ],
  "master": {
    "reverb": { "decay": 2.0, "wet": 0.3 },
    "delay": { "time": "3/8", "feedback": 0.25, "wet": 0.15 },
    "compression": { "threshold": -12, "ratio": 4 },
    "warmth": 0.4,
    "gain": 0.75
  }
}
```

---

## Patterns to Avoid

- **Every hit at full velocity.** Robotic. Vary velocity on hats by 0.1-0.15, ghost notes at 40-50%.
- **All voices in the same octave.** Mud. Spread: bass in octave 2, chords in 3, lead in 4-5.
- **Chord changes every beat.** Restless. Let chords breathe for 2-8 bars.
- **Lead melody playing constantly.** Exhausting. Leave gaps. Silence is a note.
- **Everything starting at once.** No arc. Stagger entries across 16-32 bars.
- **Delay and reverb both maxed.** Wash. Pick one to be prominent, keep the other subtle.
- **High filter Q on bass voices.** Q above 3 creates resonant peaks that spike well above the gain setting. Keep bass Q at 1-2.

---

## Web Audio Envelope Lesson

**Never schedule automation ramps past the note boundary and cancel them later.**

Three approaches were tried for handling notes shorter than attack+decay:

1. `setValueAtTime(sustain, noteEnd)` — **Wrong.** Jumps from mid-decay to sustain. Gain discontinuity on every note. Sounds like per-beat clipping, especially on pure sine sub-bass.

2. `cancelAndHoldAtTime(noteEnd)` — **Wrong.** Cancels the decay ramp entirely. Gain holds at peak from attack end to note end (no decay). Bells sustain at full volume instead of fading. The Web Audio spec says it computes the mid-ramp value, but browser implementations vary.

3. **Compute partial decay ramps (correct).** Schedule the decay ramp only up to the note end. Compute the envelope level at note end mathematically: `peak + (sustain - peak) * (noteEnd - attackEnd) / decayDuration`. All ramps are sequential with no overlap. No cancellation needed.

For **note cutoff** (cutting the previous note when a new one triggers) and **sidechain ducking**, `cancelAndHoldAtTime` works correctly because it's interrupting automation at approximately the current time, not mid-future-ramp.

**Diagnostic approach that found the root cause:** peak meter (ruled out amplitude), effect bypass toggles 1-5 (ruled out effects chain), voice solo S key (isolated the sub). Isolate before you mitigate.
