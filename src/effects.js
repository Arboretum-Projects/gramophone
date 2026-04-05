// Effect nodes -- reverb, delay, compression, warmth, limiter

import { parseTime } from './scales.js';

function generateImpulseResponse(ctx, decay, damping, preDelay) {
  const rate = ctx.sampleRate;
  const pre = Math.floor((preDelay || 0.01) * rate);
  const length = Math.floor(decay * rate) + pre;
  const buffer = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / rate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * t / decay);
    }
    // Damping via multi-pass IIR lowpass
    const coeff = (damping ?? 0.5) * 0.7;
    for (let pass = 0; pass < 4; pass++) {
      let prev = 0;
      for (let i = pre; i < length; i++) {
        data[i] = prev * coeff + data[i] * (1 - coeff);
        prev = data[i];
      }
    }
  }
  return buffer;
}

function makeWarmthCurve(amount) {
  const n = 8192;
  const curve = new Float32Array(n);
  const drive = 1 + amount * 3;
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

export function createMasterChain(ctx, config, bpm) {
  const cfg = {
    reverb: config.reverb !== false ? { decay: 2.0, wet: 0.3, damping: 0.5, preDelay: 0.01, ...(config.reverb || {}) } : null,
    delay: config.delay || null,
    compression: config.compression !== false ? { threshold: -12, ratio: 4, attack: 0.003, release: 0.25, ...(config.compression || {}) } : null,
    warmth: config.warmth ?? 0.4,
    limiter: config.limiter ?? true,
    gain: config.gain ?? 0.8,
  };

  const nodes = {};
  const input = ctx.createGain();
  let chain = input;

  // Reverb -- convolver with wet/dry mix
  if (cfg.reverb && cfg.reverb.wet > 0) {
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const convolver = ctx.createConvolver();
    const merge = ctx.createGain();

    convolver.buffer = generateImpulseResponse(ctx, cfg.reverb.decay, cfg.reverb.damping, cfg.reverb.preDelay);
    dry.gain.value = 1;
    wet.gain.value = cfg.reverb.wet;

    chain.connect(dry);
    chain.connect(convolver);
    convolver.connect(wet);
    dry.connect(merge);
    wet.connect(merge);

    nodes.reverb = { convolver, dry, wet, merge };
    chain = merge;
  }

  // Delay -- feedback loop with filter
  if (cfg.delay) {
    const delayTime = parseTime(cfg.delay.time || '1/4', bpm);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delayNode = ctx.createDelay(4);
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const merge = ctx.createGain();

    delayNode.delayTime.value = delayTime;
    feedback.gain.value = Math.min(cfg.delay.feedback ?? 0.3, 0.95);
    wet.gain.value = cfg.delay.wet ?? 0.2;
    dry.gain.value = 1;
    filter.type = 'lowpass';
    filter.frequency.value = cfg.delay.filter || 2000;

    chain.connect(dry);
    chain.connect(delayNode);
    delayNode.connect(filter);
    filter.connect(feedback);
    feedback.connect(delayNode);
    delayNode.connect(wet);
    dry.connect(merge);
    wet.connect(merge);

    nodes.delay = { delayNode, feedback, filter, dry, wet, merge };
    chain = merge;
  }

  // Compression
  if (cfg.compression) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = cfg.compression.threshold;
    comp.ratio.value = cfg.compression.ratio;
    comp.attack.value = cfg.compression.attack;
    comp.release.value = cfg.compression.release;
    chain.connect(comp);
    nodes.compression = comp;
    chain = comp;
  }

  // Warmth -- saturation + high rolloff + low boost
  if (cfg.warmth > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeWarmthCurve(cfg.warmth);
    shaper.oversample = '2x';

    const hiCut = ctx.createBiquadFilter();
    hiCut.type = 'lowpass';
    hiCut.frequency.value = 12000 - cfg.warmth * 4000;

    const loBoost = ctx.createBiquadFilter();
    loBoost.type = 'lowshelf';
    loBoost.frequency.value = 200;
    loBoost.gain.value = cfg.warmth * 4;

    chain.connect(shaper);
    shaper.connect(hiCut);
    hiCut.connect(loBoost);

    nodes.warmth = { shaper, hiCut, loBoost };
    chain = loBoost;
  }

  // Limiter -- tighter than before to catch transient spikes
  if (cfg.limiter) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.0005;
    limiter.release.value = 0.05;
    limiter.knee.value = 0;
    chain.connect(limiter);
    nodes.limiter = limiter;
    chain = limiter;
  }

  // Master gain
  const masterGain = ctx.createGain();
  masterGain.gain.value = cfg.gain;
  chain.connect(masterGain);
  nodes.masterGain = masterGain;

  // Safety clip -- soft clipper as absolute last node
  // Linear below 0.8, smooth compression above, ceiling at ~0.98
  const safetyClip = ctx.createWaveShaper();
  const clipN = 8192;
  const clipCurve = new Float32Array(clipN);
  for (let i = 0; i < clipN; i++) {
    const x = (i / (clipN - 1)) * 2 - 1;
    const abs = Math.abs(x);
    if (abs < 0.8) {
      clipCurve[i] = x;
    } else {
      const over = (abs - 0.8) / 0.2;
      const compressed = 0.8 + 0.18 * Math.tanh(over * 2.5);
      clipCurve[i] = x >= 0 ? compressed : -compressed;
    }
  }
  safetyClip.curve = clipCurve;
  safetyClip.oversample = '4x';
  masterGain.connect(safetyClip);
  nodes.safetyClip = safetyClip;

  return { input, output: safetyClip, nodes, config: cfg };
}
