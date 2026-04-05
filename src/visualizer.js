// Waveform and frequency visualization via AnalyserNode

export class Visualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyser;
    this.running = false;
    this.mode = 'waveform'; // waveform | spectrum
    this.waveData = new Uint8Array(analyser.fftSize);
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  start() {
    this.running = true;
    this.draw();
  }

  stop() {
    this.running = false;
  }

  resize() {
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
  }

  draw() {
    if (!this.running) return;
    requestAnimationFrame(() => this.draw());

    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    if (this.mode === 'waveform') {
      this.drawWaveform(w, h);
    } else {
      this.drawSpectrum(w, h);
    }
  }

  drawWaveform(w, h) {
    this.analyser.getByteTimeDomainData(this.waveData);
    const { ctx, waveData } = this;
    const len = waveData.length;
    const mid = h / 2;

    // Subtle center line
    ctx.strokeStyle = 'rgba(255, 180, 100, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Waveform
    ctx.strokeStyle = 'rgba(255, 180, 100, 0.7)';
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const step = w / len;
    for (let i = 0; i < len; i++) {
      const v = (waveData[i] / 128.0) - 1;
      const y = mid + v * mid * 0.8;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.stroke();

    // Glow pass
    ctx.strokeStyle = 'rgba(255, 180, 100, 0.15)';
    ctx.lineWidth = 6 * devicePixelRatio;
    ctx.stroke();
  }

  drawSpectrum(w, h) {
    this.analyser.getByteFrequencyData(this.freqData);
    const { ctx, freqData } = this;
    const bars = Math.min(freqData.length, 128);
    const barW = w / bars;

    for (let i = 0; i < bars; i++) {
      const val = freqData[i] / 255;
      const barH = val * h * 0.85;

      const hue = 25 + val * 15;
      ctx.fillStyle = `hsla(${hue}, 80%, ${50 + val * 20}%, ${0.5 + val * 0.4})`;
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);

      // Glow
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${val * 0.15})`;
      ctx.fillRect(i * barW - 2, h - barH - 4, barW + 3, barH + 8);
    }
  }

  toggleMode() {
    this.mode = this.mode === 'waveform' ? 'spectrum' : 'waveform';
  }
}
