// Core engine -- parse scene, build audio graph, schedule patterns, run timeline

import { parseTime } from './scales.js';
import { createMasterChain } from './effects.js';
import { createVoice } from './synthesis.js';
import { Sequencer } from './sequencer.js';
import { Transport } from './transport.js';

export class GramophoneEngine {
  constructor() {
    this.ctx = null;
    this.scene = null;
    this.voices = new Map();
    this.sequencer = null;
    this.masterChain = null;
    this.analyser = null;
    this.transport = new Transport();
    this.timeline = [];
    this.timelineIdx = 0;
    this.rafId = null;
  }

  loadScene(json) {
    const scene = typeof json === 'string' ? JSON.parse(json) : json;
    this.cleanup();
    this.scene = scene;
    console.log(`[gramophone] load "${scene.title}" — ${scene.voices?.length ?? 0} voices, ${scene.patterns?.length ?? 0} patterns, ${scene.bpm ?? 120} BPM`);

    if (!this.ctx) this.ctx = new AudioContext();

    // Analyser for visualizer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    const bpm = scene.bpm || 120;
    const key = scene.key || 'C';
    const scale = scene.scale || 'minor';
    const swing = scene.swing || 0;

    // Master effects chain
    this.masterChain = createMasterChain(this.ctx, scene.master || {}, bpm);
    this.masterChain.output.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Build voice spec lookup for sidechain references
    const voiceSpecs = new Map();
    for (const spec of (scene.voices || [])) voiceSpecs.set(spec.id, spec);

    // Voices
    this.voices.clear();
    for (const spec of (scene.voices || [])) {
      try {
        const voice = createVoice(this.ctx, spec);

        if (spec.sidechain) {
          // Insert sidechain gain node between voice output and master
          const scGain = this.ctx.createGain();
          voice.output.connect(scGain);
          scGain.connect(this.masterChain.input);
          voice._sidechainGain = scGain;
        } else {
          voice.output.connect(this.masterChain.input);
        }

        this.voices.set(spec.id, voice);
      } catch (e) {
        console.error(`Failed to create voice "${spec.id}":`, e);
      }
    }

    // Auto-gain: scale master input to prevent overload with many voices
    const voiceCount = this.voices.size;
    if (voiceCount > 3) {
      this.masterChain.input.gain.value = 1 / Math.sqrt(voiceCount / 3);
    }

    // Build sidechain map: sourceVoiceId → [{ gain, amount, release }]
    const sidechains = new Map();
    for (const spec of (scene.voices || [])) {
      if (!spec.sidechain) continue;
      const voice = this.voices.get(spec.id);
      if (!voice?._sidechainGain) continue;
      const src = spec.sidechain.source;
      if (!sidechains.has(src)) sidechains.set(src, []);
      sidechains.get(src).push({
        gain: voice._sidechainGain,
        amount: spec.sidechain.amount ?? 0.8,
        release: spec.sidechain.release ?? 0.1,
      });
    }

    // Determine which patterns are started by timeline events
    const timelineStarts = new Set();
    for (const evt of (scene.timeline || [])) {
      if (evt.type === 'start' && evt.pattern) timelineStarts.add(evt.pattern);
    }

    // Sequencer
    this.sequencer = new Sequencer(this.ctx, bpm, key, scale, swing);
    this.sequencer.sidechains = sidechains.size > 0 ? sidechains : null;
    for (const voice of this.voices.values()) this.sequencer.addVoice(voice);
    for (const spec of (scene.patterns || [])) {
      this.sequencer.addPattern(spec, !timelineStarts.has(spec.id));
    }

    // Timeline events -- parse offsets, sort
    this.timeline = this.parseTimeline(scene.timeline || [], bpm);
    this.timelineIdx = 0;
    this.transport.reset();
  }

  parseTimeline(events, bpm) {
    let prevOffset = 0;
    return events.map(evt => {
      let offset;
      if (evt.offset === '<<') {
        offset = prevOffset;
      } else if (typeof evt.offset === 'string' && evt.offset.startsWith('<<+=')) {
        offset = prevOffset + parseTime(evt.offset.slice(4), bpm);
      } else {
        offset = parseTime(evt.offset ?? 0, bpm);
      }
      prevOffset = offset;
      return {
        ...evt,
        _offset: offset,
        _duration: evt.duration ? parseTime(evt.duration, bpm) : 0,
      };
    }).sort((a, b) => a._offset - b._offset);
  }

  async play() {
    if (this.transport.state === 'playing') return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const now = this.ctx.currentTime + 0.05;
    console.log(`[gramophone] play — voices: ${this.voices.size}, ctx: ${this.ctx.state}`);

    // Fade in master output to mask startup transients
    const mg = this.masterChain.nodes.masterGain.gain;
    const targetGain = this.masterChain.config.gain ?? 0.8;
    if (this.transport.state !== 'paused') {
      mg.setValueAtTime(0, now);
      mg.linearRampToValueAtTime(targetGain, now + 0.08);
    }

    if (this.transport.state === 'paused') {
      const offset = this.transport.pauseOffset;
      this._seqStartTime = now - offset;
      this.sequencer.start(now);
    } else {
      this._seqStartTime = now;
      this.timelineIdx = 0;
      this.sequencer.start(now);
    }

    this.transport.play(now);
    this.tickTimeline();
  }

  pause() {
    if (this.transport.state !== 'playing') return;
    this.transport.pause();
    if (this.sequencer) this.sequencer.stop();
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  stop() {
    this.transport.stop();
    if (this.sequencer) this.sequencer.stop();
    this.timelineIdx = 0;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    // Stop all active continuous sources (noise drones, etc.)
    for (const voice of this.voices.values()) {
      voice.stop?.(this.ctx?.currentTime);
    }
  }

  tickTimeline() {
    if (this.transport.state !== 'playing') return;
    this.rafId = requestAnimationFrame(() => this.tickTimeline());

    const elapsed = this.ctx.currentTime - this._seqStartTime;

    while (this.timelineIdx < this.timeline.length) {
      const evt = this.timeline[this.timelineIdx];
      if (evt._offset > elapsed + 0.1) break;
      this.fireTimelineEvent(evt);
      this.timelineIdx++;
    }
  }

  fireTimelineEvent(evt) {
    const time = this._seqStartTime + evt._offset;

    if (evt.type === 'start') {
      this.sequencer.startPattern(evt.pattern, time);
      return;
    }
    if (evt.type === 'stop') {
      this.sequencer.stopPattern(evt.pattern);
      return;
    }
    if (evt.type === 'mute') {
      const v = this.voices.get(evt.target);
      if (v) v.muted = true;
      return;
    }
    if (evt.type === 'unmute') {
      const v = this.voices.get(evt.target);
      if (v) v.muted = false;
      return;
    }

    // Parameter animation (to / set)
    const params = evt.to || evt.set;
    if (!evt.target || !params) return;
    const instant = evt.type === 'set' || !evt._duration;

    for (const [param, value] of Object.entries(params)) {
      const ap = this.resolveParam(evt.target, param);
      if (!ap) continue;
      if (instant) {
        ap.setValueAtTime(value, time);
      } else {
        ap.setValueAtTime(ap.value, time);
        ap.linearRampToValueAtTime(value, time + evt._duration);
      }
    }
  }

  resolveParam(target, param) {
    if (target === 'master') {
      if (param === 'gain') return this.masterChain.nodes.masterGain?.gain;
      return null;
    }
    if (target.startsWith('master.')) {
      const fx = target.split('.')[1];
      const node = this.masterChain.nodes[fx];
      if (!node) return null;
      if (fx === 'reverb' && param === 'wet') return node.wet?.gain;
      if (fx === 'delay') {
        if (param === 'wet') return node.wet?.gain;
        if (param === 'feedback') return node.feedback?.gain;
        if (param === 'time') return node.delayNode?.delayTime;
      }
      if (fx === 'compression') return node[param];
      return null;
    }
    // Voice
    const voice = this.voices.get(target);
    if (!voice) return null;
    if (param === 'gain') return voice.gainNode?.gain;
    if (param === 'pan') return voice.panNode?.pan;
    if (param === 'frequency' || param === 'filter.frequency') return voice.filterNode?.frequency;
    if (param === 'Q' || param === 'filter.Q') return voice.filterNode?.Q;
    return null;
  }

  cleanup() {
    this.stop();
    if (this.masterChain) {
      try { this.masterChain.input.disconnect(); } catch (e) {}
      try { this.masterChain.output.disconnect(); } catch (e) {}
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
    }
    for (const voice of this.voices.values()) {
      try { voice.output.disconnect(); } catch (e) {}
      if (voice._sidechainGain) try { voice._sidechainGain.disconnect(); } catch (e) {}
    }
    this.voices.clear();
  }

  // Toggle individual effects on/off for diagnostics
  toggleEffect(name) {
    const nodes = this.masterChain?.nodes;
    if (!nodes) return false;

    switch (name) {
      case 'reverb':
        if (nodes.reverb) {
          const w = nodes.reverb.wet.gain;
          const on = w.value > 0;
          w.value = on ? 0 : (this.masterChain.config.reverb?.wet ?? 0.3);
          return !on;
        }
        return false;

      case 'delay':
        if (nodes.delay) {
          const w = nodes.delay.wet.gain;
          const on = w.value > 0;
          w.value = on ? 0 : (this.masterChain.config.delay?.wet ?? 0.2);
          return !on;
        }
        return false;

      case 'compression':
        if (nodes.compression) {
          const c = nodes.compression;
          const on = c.ratio.value > 1;
          if (on) {
            c._savedRatio = c.ratio.value;
            c._savedThreshold = c.threshold.value;
            c.ratio.value = 1;
            c.threshold.value = 0;
          } else {
            c.ratio.value = c._savedRatio ?? 4;
            c.threshold.value = c._savedThreshold ?? -12;
          }
          return !on;
        }
        return false;

      case 'warmth':
        if (nodes.warmth) {
          const s = nodes.warmth.shaper;
          if (!s._linearCurve) {
            const n = 8192;
            s._linearCurve = new Float32Array(n);
            for (let i = 0; i < n; i++) s._linearCurve[i] = (i / (n - 1)) * 2 - 1;
            s._warmCurve = s.curve;
          }
          const on = s.curve !== s._linearCurve;
          s.curve = on ? s._linearCurve : s._warmCurve;
          // Also bypass the hi-cut and lo-boost
          const h = nodes.warmth.hiCut;
          const l = nodes.warmth.loBoost;
          if (on) {
            h._savedFreq = h.frequency.value;
            l._savedGain = l.gain.value;
            h.frequency.value = 20000;
            l.gain.value = 0;
          } else {
            h.frequency.value = h._savedFreq ?? 10800;
            l.gain.value = l._savedGain ?? 1.6;
          }
          return !on;
        }
        return false;

      case 'limiter':
        if (nodes.limiter) {
          const lim = nodes.limiter;
          const on = lim.ratio.value > 1;
          if (on) {
            lim._savedRatio = lim.ratio.value;
            lim._savedThreshold = lim.threshold.value;
            lim.ratio.value = 1;
            lim.threshold.value = 0;
          } else {
            lim.ratio.value = lim._savedRatio ?? 20;
            lim.threshold.value = lim._savedThreshold ?? -3;
          }
          return !on;
        }
        return false;
    }
    return false;
  }

  getVoiceIds() { return [...this.voices.keys()]; }

  soloVoice(index) {
    const ids = this.getVoiceIds();
    if (index < 0) {
      for (const v of this.voices.values()) v.muted = false;
      return 'ALL';
    }
    for (let i = 0; i < ids.length; i++) {
      this.voices.get(ids[i]).muted = (i !== index);
    }
    return ids[index];
  }

  getAnalyser() { return this.analyser; }
  getTransport() { return this.transport; }
  getScene() { return this.scene; }
}
