// Pattern scheduling against BPM clock

import { resolveNote, parseTime } from './scales.js';

export class Sequencer {
  constructor(ctx, bpm, key, scale, swing) {
    this.ctx = ctx;
    this.bpm = bpm;
    this.key = key || 'C';
    this.scale = scale || 'minor';
    this.swing = swing || 0;
    this.voices = new Map();
    this.patterns = new Map();
    this.sidechains = null; // Map: sourceVoiceId → [{ gain, amount, release }]
    this.running = false;
    this.timer = null;
    this.lookAhead = 0.12;
    this.tickMs = 25;
  }

  addVoice(voice) { this.voices.set(voice.id, voice); }

  addPattern(spec, active) {
    this.patterns.set(spec.id, {
      spec,
      position: 0,
      nextTime: 0,
      active: active !== false,
    });
  }

  start(time) {
    this.running = true;
    for (const state of this.patterns.values()) {
      if (state.active) {
        state.nextTime = time;
        state.position = 0;
      }
    }
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop() {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  startPattern(id, time) {
    const s = this.patterns.get(id);
    if (s) { s.active = true; s.nextTime = time; s.position = 0; }
  }

  stopPattern(id) {
    const s = this.patterns.get(id);
    if (s) s.active = false;
  }

  tick() {
    if (!this.running) return;
    const until = this.ctx.currentTime + this.lookAhead;
    for (const state of this.patterns.values()) {
      if (!state.active) continue;
      this.schedulePattern(state, until);
    }
  }

  schedulePattern(state, until) {
    while (state.nextTime < until) {
      const voice = this.voices.get(state.spec.voice);
      if (!voice || voice.muted) {
        this.advance(state);
        continue;
      }

      const event = this.resolveEvent(state);
      if (event) {
        let time = state.nextTime;

        // Timing humanize: micro-offset the trigger from its grid position
        if (state.spec.humanize) {
          time += (Math.random() - 0.5) * 2 * state.spec.humanize;
        }

        // Swing: push off-beat notes later
        if (this.swing > 0 && state.position % 2 === 1) {
          const step = this.stepDuration(state.spec);
          time += step * this.swing * 0.5;
        }

        // Velocity humanize: random variation per trigger
        if (state.spec.velocityHumanize && event.velocity != null) {
          event.velocity = Math.max(0.01, Math.min(1,
            event.velocity + (Math.random() - 0.5) * 2 * state.spec.velocityHumanize));
        }

        voice.trigger(event.freq, event.velocity, event.duration, time);

        // Sidechain ducking: duck voices that listen to this voice
        // cancelAndHoldAtTime freezes the gain at its current automation value,
        // then we ramp smoothly to the duck level (no instant gain jumps)
        if (this.sidechains?.has(voice.id)) {
          for (const sc of this.sidechains.get(voice.id)) {
            const g = sc.gain.gain;
            const duck = 1 - sc.amount;
            const attack = 0.001;
            g.cancelAndHoldAtTime(time);
            g.linearRampToValueAtTime(duck, time + attack);
            g.linearRampToValueAtTime(1, time + attack + sc.release);
          }
        }
      }

      this.advance(state);

      // Stop non-looping patterns that finished their cycle
      if (!state.spec.loop && state.position >= this.patternLength(state.spec)) {
        state.active = false;
        break;
      }
    }
  }

  resolveEvent(state) {
    const { spec } = state;
    const pos = state.position;

    switch (spec.type) {
      case 'notes': {
        const idx = pos % spec.notes.length;
        const note = spec.notes[idx];
        if (note === '-') return null;
        if (spec.probability != null && Math.random() > spec.probability) return null;
        const freq = resolveNote(note, this.key, this.scale, spec.octave ?? 4);
        const vel = Array.isArray(spec.velocity) ? spec.velocity[idx] : (spec.velocity ?? 1);
        return { freq, velocity: vel, duration: parseTime(spec.duration || '1/4', this.bpm) };
      }

      case 'rhythm': {
        const idx = pos % spec.steps;
        if (!spec.hits[idx]) return null;
        const vel = Array.isArray(spec.velocity) ? spec.velocity[idx] : (spec.velocity ?? 1);
        return { freq: null, velocity: vel, duration: null };
      }

      case 'arpeggio': {
        const notes = spec.chord || [];
        const octaves = spec.octaves || 1;
        const full = [];
        for (let o = 0; o < octaves; o++) {
          for (const n of notes) {
            if (typeof n === 'string' && /^[A-G]/.test(n)) {
              const m = n.match(/^([A-Gb#]+)(\d)$/);
              if (m) full.push(`${m[1]}${parseInt(m[2]) + o}`);
              else full.push(n);
            } else full.push(n);
          }
        }
        const dir = spec.direction || 'up';
        let seq;
        if (dir === 'down') seq = [...full].reverse();
        else if (dir === 'updown') seq = [...full, ...full.slice(1, -1).reverse()];
        else if (dir === 'downup') { const r = [...full].reverse(); seq = [...r, ...r.slice(1, -1).reverse()]; }
        else if (dir === 'random') seq = full;
        else seq = full;

        const note = dir === 'random' ? full[Math.floor(Math.random() * full.length)] : seq[pos % seq.length];
        const freq = resolveNote(note, this.key, this.scale, 4);
        const rate = parseTime(spec.rate || '1/8', this.bpm);
        return { freq, velocity: spec.velocity ?? 0.8, duration: rate * 0.8 };
      }

      case 'drone': {
        if (pos > 0) return null; // Trigger once
        const freq = resolveNote(spec.note, this.key, this.scale, 3);
        return { freq, velocity: spec.velocity ?? 1, duration: null };
      }

      case 'generative': {
        if (Math.random() > (spec.probability ?? 0.5)) return null;
        const pool = spec.pool || [];
        const note = pool[Math.floor(Math.random() * pool.length)];
        const freq = resolveNote(note, this.key, this.scale, 4);
        const [lo, hi] = spec.velocityRange || [0.3, 0.8];
        return { freq, velocity: lo + Math.random() * (hi - lo), duration: parseTime(spec.rate || '1/4', this.bpm) * 0.8 };
      }

      case 'progression': {
        const idx = pos % spec.chords.length;
        const chord = spec.chords[idx];
        const freqs = (chord.notes || []).map(n => resolveNote(n, this.key, this.scale, 3)).filter(Boolean);
        const dur = parseTime(chord.duration || '1m', this.bpm);
        return { freq: freqs, velocity: spec.velocity ?? 0.7, duration: dur * 0.95 };
      }

      default: return null;
    }
  }

  stepDuration(spec) {
    switch (spec.type) {
      case 'notes': return parseTime(spec.duration || '1/4', this.bpm);
      case 'rhythm': return parseTime('1m', this.bpm) / (spec.steps || 16);
      case 'arpeggio': return parseTime(spec.rate || '1/8', this.bpm);
      case 'drone': return 999999;
      case 'generative': return parseTime(spec.rate || '1/4', this.bpm);
      case 'progression': return 0; // Handled per-chord
      default: return parseTime('1/4', this.bpm);
    }
  }

  advance(state) {
    const { spec } = state;
    let step;
    if (spec.type === 'progression') {
      const idx = state.position % spec.chords.length;
      step = parseTime(spec.chords[idx].duration || '1m', this.bpm);
    } else {
      step = this.stepDuration(spec);
    }
    state.nextTime += step;
    state.position++;
  }

  patternLength(spec) {
    switch (spec.type) {
      case 'notes': return spec.notes.length;
      case 'rhythm': return spec.steps || 16;
      case 'progression': return spec.chords.length;
      default: return Infinity;
    }
  }
}
