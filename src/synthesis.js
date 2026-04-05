// Voice implementations -- oscillator, noise, drum, chord

import { resolveEnvelope } from './scales.js';

export function createVoice(ctx, spec) {
  const gain = ctx.createGain();
  gain.gain.value = spec.gain ?? 0.5;

  const pan = ctx.createStereoPanner();
  pan.pan.value = spec.pan ?? 0;
  gain.connect(pan);

  // Optional filter
  let filterNode = null;
  if (spec.filter) {
    filterNode = ctx.createBiquadFilter();
    filterNode.type = spec.filter.type || 'lowpass';
    filterNode.frequency.value = spec.filter.frequency ?? 1000;
    filterNode.Q.value = spec.filter.Q ?? 1;
    if (spec.filter.gain !== undefined) filterNode.gain.value = spec.filter.gain;
  }

  const envelope = resolveEnvelope(spec.envelope);

  // Connect source through optional filter to voice gain
  const connectSource = (node) => {
    if (filterNode) {
      node.connect(filterNode);
      filterNode.connect(gain);
    } else {
      node.connect(gain);
    }
  };

  let impl;
  switch (spec.type) {
    case 'oscillator': impl = oscillatorVoice(ctx, spec, envelope, connectSource); break;
    case 'noise': impl = noiseVoice(ctx, spec, connectSource); break;
    case 'drum': impl = drumVoice(ctx, spec, gain); break;
    case 'chord': impl = chordVoice(ctx, spec, envelope, connectSource); break;
    default: impl = { trigger() {} };
  }

  return {
    ...impl,
    id: spec.id,
    type: spec.type,
    output: pan,
    gainNode: gain,
    panNode: pan,
    filterNode,
    muted: false,
  };
}

// --- Oscillator voice ---

function oscillatorVoice(ctx, spec, envelope, connectSource) {
  const waveform = spec.waveform || 'sine';
  const detune = spec.detune || 0;
  const activeDrones = [];
  let lastNote = null;

  function trigger(freq, velocity, duration, time) {
    if (!freq) return;

    // Cut previous note to prevent overlap artifacts
    // cancelAndHoldAtTime freezes the automation at its current computed value
    // (unlike cancelScheduledValues which can snap back and cause clicks)
    if (lastNote) {
      try {
        lastNote.env.gain.cancelAndHoldAtTime(time);
        lastNote.env.gain.linearRampToValueAtTime(0, time + 0.003);
        lastNote.osc.stop(time + 0.006);
      } catch (e) {}
      lastNote = null;
    }

    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const env = ctx.createGain();
    env.gain.value = 0;

    const vel = velocity ?? 1;
    const peak = vel;
    const sus = envelope.sustain * vel;

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + envelope.attack);

    const atkEnd = time + envelope.attack;
    const decEnd = atkEnd + envelope.decay;

    osc.connect(env);
    connectSource(env);
    osc.start(time);

    if (duration != null) {
      const end = time + duration;

      // Schedule decay only up to note end -- no ramps past the note boundary,
      // so no cancellation needed and no discontinuities
      if (end >= decEnd) {
        // Decay completes before note ends -- full decay then hold at sustain
        env.gain.linearRampToValueAtTime(sus, decEnd);
        env.gain.setValueAtTime(sus, end);
      } else if (end > atkEnd) {
        // Note ends mid-decay -- compute the actual envelope level at note end
        const progress = (end - atkEnd) / envelope.decay;
        const envAtEnd = peak + (sus - peak) * progress;
        env.gain.linearRampToValueAtTime(envAtEnd, end);
      }
      // else: note ends during attack -- attack ramp handles it

      env.gain.linearRampToValueAtTime(0.0001, end + envelope.release);
      osc.stop(end + envelope.release + 0.02);
      lastNote = { osc, env };
    } else {
      env.gain.linearRampToValueAtTime(sus, decEnd);
      activeDrones.push({ osc, env });
    }
  }

  function stop(time) {
    const t = time || ctx.currentTime;
    for (const d of activeDrones) {
      try { d.env.gain.cancelScheduledValues(t); d.env.gain.setValueAtTime(0, t); d.osc.stop(t + 0.01); } catch (e) {}
    }
    activeDrones.length = 0;
  }

  return { trigger, stop };
}

// --- Noise voice ---

function generateNoiseBuffer(ctx, color) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

function noiseVoice(ctx, spec, connectSource) {
  const buffer = generateNoiseBuffer(ctx, spec.color || 'white');
  let activeSource = null;

  function trigger(freq, velocity, duration, time) {
    // Stop existing source before creating a new one
    if (activeSource) {
      try { activeSource.stop(time); } catch (e) {}
      activeSource = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const env = ctx.createGain();
    env.gain.value = velocity ?? 1;

    source.connect(env);
    connectSource(env);
    source.start(time);

    if (duration != null) {
      env.gain.setValueAtTime(velocity ?? 1, time + duration);
      env.gain.linearRampToValueAtTime(0, time + duration + 0.05);
      source.stop(time + duration + 0.06);
    }

    activeSource = source;
  }

  function stop(time) {
    if (activeSource) {
      try { activeSource.stop(time || ctx.currentTime); } catch (e) {}
      activeSource = null;
    }
  }

  return { trigger, stop };
}

// --- Drum voice ---

function drumVoice(ctx, spec, output) {
  const sound = spec.sound;
  const pitchOff = spec.pitch || 0;
  const decayOff = spec.decay || 0;

  function trigger(freq, velocity, duration, time) {
    const vel = velocity ?? 1;
    DRUMS[sound]?.(ctx, output, vel, pitchOff, decayOff, time);
  }

  return { trigger };
}

function quickNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const DRUMS = {
  kick(ctx, out, vel, pitch, decayOff, t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = 150 * Math.pow(2, pitch / 12);
    const d = Math.max(0.1, 0.4 + decayOff * 0.1);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + d + 0.01);
  },

  snare(ctx, out, vel, pitch, decayOff, t) {
    const d = Math.max(0.1, 0.2 + decayOff * 0.05);
    // Tone
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 200 * Math.pow(2, pitch / 12);
    og.gain.setValueAtTime(vel * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + d * 0.5);
    osc.connect(og); og.connect(out);
    osc.start(t); osc.stop(t + d);
    // Noise
    const ns = ctx.createBufferSource();
    ns.buffer = quickNoise(ctx, 0.3);
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass'; nf.frequency.value = 1000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + d);
    ns.connect(nf); nf.connect(ng); ng.connect(out);
    ns.start(t); ns.stop(t + d + 0.01);
  },

  hihat(ctx, out, vel, pitch, decayOff, t) {
    const d = Math.max(0.02, 0.05 + decayOff * 0.02);
    const ns = ctx.createBufferSource();
    ns.buffer = quickNoise(ctx, 0.15);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 8000 * Math.pow(2, pitch / 12); f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    ns.connect(f); f.connect(g); g.connect(out);
    ns.start(t); ns.stop(t + d + 0.01);
  },

  clap(ctx, out, vel, pitch, decayOff, t) {
    const d = Math.max(0.05, 0.15 + decayOff * 0.05);
    for (let i = 0; i < 3; i++) {
      const off = t + i * 0.01;
      const ns = ctx.createBufferSource();
      ns.buffer = quickNoise(ctx, 0.05);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.4, off);
      g.gain.exponentialRampToValueAtTime(0.001, off + d);
      ns.connect(f); f.connect(g); g.connect(out);
      ns.start(off); ns.stop(off + d + 0.01);
    }
  },

  tom(ctx, out, vel, pitch, decayOff, t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = 150 * Math.pow(2, pitch / 12);
    const d = Math.max(0.15, 0.3 + decayOff * 0.08);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 1.2, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + d + 0.01);
  },

  rim(ctx, out, vel, pitch, decayOff, t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800 * Math.pow(2, pitch / 12);
    g.gain.setValueAtTime(vel * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + 0.04);
  },

  cymbal(ctx, out, vel, pitch, decayOff, t) {
    const d = Math.max(0.3, 1.0 + decayOff * 0.2);
    const ns = ctx.createBufferSource();
    ns.buffer = quickNoise(ctx, 2);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    ns.connect(f); f.connect(g); g.connect(out);
    ns.start(t); ns.stop(t + d + 0.01);
  },
};

// --- Chord voice ---

function chordVoice(ctx, spec, envelope, connectSource) {
  const waveform = spec.waveform || 'triangle';
  const numVoices = spec.voices || 3;
  const spread = spec.spread || 5;
  const activeDrones = [];

  function trigger(freqs, velocity, duration, time) {
    if (!freqs) return;
    const arr = Array.isArray(freqs) ? freqs : [freqs];
    const vel = (velocity ?? 1) / Math.max(1, numVoices * arr.length * 0.5);

    for (const freq of arr) {
      for (let v = 0; v < numVoices; v++) {
        const det = numVoices > 1 ? (v / (numVoices - 1) - 0.5) * spread * 2 : 0;
        const osc = ctx.createOscillator();
        osc.type = waveform;
        osc.frequency.value = freq;
        osc.detune.value = det;

        const env = ctx.createGain();
        env.gain.value = 0;
        const peak = vel;
        const sus = envelope.sustain * vel;

        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(peak, time + envelope.attack);

        const atkEnd = time + envelope.attack;
        const decEnd = atkEnd + envelope.decay;

        osc.connect(env);
        connectSource(env);
        osc.start(time);

        if (duration != null) {
          const end = time + duration;

          if (end >= decEnd) {
            env.gain.linearRampToValueAtTime(sus, decEnd);
            env.gain.setValueAtTime(sus, end);
          } else if (end > atkEnd) {
            const progress = (end - atkEnd) / envelope.decay;
            const envAtEnd = peak + (sus - peak) * progress;
            env.gain.linearRampToValueAtTime(envAtEnd, end);
          }

          env.gain.linearRampToValueAtTime(0.0001, end + envelope.release);
          osc.stop(end + envelope.release + 0.02);
        } else {
          env.gain.linearRampToValueAtTime(sus, decEnd);
          activeDrones.push({ osc, env });
        }
      }
    }
  }

  function stop(time) {
    const t = time || ctx.currentTime;
    for (const d of activeDrones) {
      try { d.env.gain.cancelScheduledValues(t); d.env.gain.setValueAtTime(0, t); d.osc.stop(t + 0.01); } catch (e) {}
    }
    activeDrones.length = 0;
  }

  return { trigger, stop };
}
