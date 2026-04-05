# Gramophone

Declarative audio engine. JSON in, sound out. Web Audio API underneath.

Describe voices, patterns, effects, and timeline in JSON. Gramophone synthesizes everything from oscillators and noise. Self-contained and browser-native.

## Quick start

```bash
python3 -m http.server 8769
# Open http://localhost:8769
```

Select a scene from the sidebar browser, or add `?scene=examples/swagger.json` to the URL.

## What's in the box

- **4 voice types:** oscillator, noise, drum (7 synthesized percussion sounds), chord (unison stacking)
- **6 pattern types:** notes, rhythm, arpeggio, drone, generative (probabilistic), chord progression
- **Master effects chain:** reverb, BPM-synced delay, compression, warmth (soft saturation + high rolloff + low boost), limiter
- **Timeline choreography:** parameter automation, pattern start/stop, filter sweeps
- **Musical helpers:** key/scale system, scale-degree notation, BPM clock, swing, musical time divisions
- **Sidechain ducking:** any voice ducks when another voice triggers
- **Velocity humanize + timing humanize:** per-pattern groove controls
- **Waveform + spectrum visualizer:** real-time canvas rendering
- **Peak meter + diagnostic tools:** effect bypass (keys 1-5), voice solo (S)
- **9 example scenes** organized by category in the sidebar browser

## Scene format

A minimal scene:

```json
{
  "title": "Hello",
  "bpm": 120,
  "key": "C",
  "scale": "minor",
  "voices": [
    { "id": "lead", "type": "oscillator", "waveform": "sine", "gain": 0.3, "envelope": "pluck" }
  ],
  "patterns": [
    { "id": "melody", "voice": "lead", "type": "notes",
      "notes": ["C4", "Eb4", "G4", "Bb4"], "duration": "1/4", "loop": true }
  ],
  "master": { "reverb": { "decay": 2.0, "wet": 0.3 }, "warmth": 0.4 }
}
```

Full spec: [DESIGN.md](DESIGN.md). Composition guide: [CLAUDE.md](CLAUDE.md).

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `R` | Stop |
| `V` | Toggle waveform / spectrum |
| `1`-`5` | Bypass effect (reverb, delay, compression, warmth, limiter) |
| `S` | Cycle voice solo |

## Support

If Gramophone is useful to you, consider supporting the work: [ko-fi.com/arkitecc](https://ko-fi.com/arkitecc)

## License

Apache 2.0
