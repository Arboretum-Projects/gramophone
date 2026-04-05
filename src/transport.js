// Playback controls -- play, pause, stop, seek

export class Transport {
  constructor() {
    this.state = 'stopped'; // stopped | playing | paused
    this.startTime = 0;
    this.pauseOffset = 0;
    this.onStateChange = null;
  }

  get elapsed() {
    if (this.state === 'stopped') return 0;
    if (this.state === 'paused') return this.pauseOffset;
    return (performance.now() / 1000) - this.startTime + this.pauseOffset;
  }

  play(ctxTime) {
    if (this.state === 'playing') return;
    if (this.state === 'paused') {
      this.startTime = performance.now() / 1000;
    } else {
      this.startTime = performance.now() / 1000;
      this.pauseOffset = 0;
    }
    this.state = 'playing';
    this.onStateChange?.('playing');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.pauseOffset = this.elapsed;
    this.state = 'paused';
    this.onStateChange?.('paused');
  }

  stop() {
    this.state = 'stopped';
    this.pauseOffset = 0;
    this.onStateChange?.('stopped');
  }

  reset() {
    this.state = 'stopped';
    this.startTime = 0;
    this.pauseOffset = 0;
  }
}
