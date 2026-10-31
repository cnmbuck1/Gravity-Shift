/**
 * All sound is synthesised with Web Audio (no asset files, nothing to license):
 * a continuous rolling layer driven by ball speed, plus short one-shots for impacts and events.
 * The context is created on the first user gesture, as iOS requires.
 */
export class AudioManager {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private humGain!: GainNode;
  private hum!: OscillatorNode;
  private noise!: AudioBuffer;

  /** Call from a tap handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Pink-ish noise buffer reused by every noise-based sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
      d[i] = last * 6;
    }

    // Rolling layer: band-passed noise (surface rumble) + low hum (metal-on-metal resonance).
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.Q.value = 0.9;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    src.start();

    this.hum = ctx.createOscillator();
    this.hum.type = 'triangle';
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(this.humGain).connect(this.master);
    this.hum.start();
  }

  /** Called every frame. */
  setRolling(speed: number, grounded: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 9);
    const on = this.enabled && grounded && speed > 0.15;
    this.rollGain.gain.setTargetAtTime(on ? 0.05 + s * 0.22 : 0, t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(180 + s * 900, t, 0.08);
    this.hum.frequency.setTargetAtTime(55 + s * 70, t, 0.1);
    this.humGain.gain.setTargetAtTime(on ? s * 0.05 : 0, t, 0.08);
  }

  /** Metallic clank, strength in m/s of velocity change. */
  impact(strength: number): void {
    const v = Math.min(1, (strength - 1) / 7);
    this.noiseBurst(0.05 + v * 0.4, 2400, 0.06);
    this.tone(900 + Math.random() * 500, 0.04 + v * 0.18, 0.25, 'sine', 0.6);
    this.tone(2300 + Math.random() * 600, 0.02 + v * 0.08, 0.12, 'sine');
  }

  checkpoint(): void {
    this.tone(660, 0.18, 0.25, 'sine');
    window.setTimeout(() => this.tone(990, 0.18, 0.4, 'sine'), 110);
  }

  shift(): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.8);
    this.tone(110, 0.25, 0.7, 'sawtooth', 0.5, 220);
  }

  fall(): void {
    this.tone(520, 0.2, 0.7, 'triangle', 0.4, 90);
  }

  zone(): void {
    this.tone(440, 0.1, 0.3, 'sine');
    window.setTimeout(() => this.tone(587, 0.1, 0.35, 'sine'), 90);
  }

  goal(): void {
    [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => this.tone(f, 0.2, 0.5, 'sine'), i * 110));
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private tone(freq: number, vol: number, dur: number, type: OscillatorType, decay = 1, endFreq?: number): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(vol: number, freq: number, dur: number): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }
}
