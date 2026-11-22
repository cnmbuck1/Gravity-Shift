/**
 * Background music, synthesised live with Web Audio like every other sound in the game (no audio
 * files, nothing to license). A slow, spacey loop: a soft pad, a sine bass and a sparse,
 * echoing arpeggio over four chords. The arpeggio is re-rolled every bar, so it never repeats
 * exactly. It plays on its own bus, so Settings > Music and Settings > Sound are independent.
 */

const BPM = 78;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/** Two bars per chord. Am7, Fmaj7, Cadd9, G6 (MIDI notes). */
const CHORDS: { bass: number; pad: number[]; arp: number[] }[] = [
  { bass: 45, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79, 81] },
  { bass: 41, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76, 77] },
  { bass: 48, pad: [55, 60, 62, 64], arp: [67, 72, 74, 76, 79] },
  { bass: 43, pad: [55, 59, 62, 64], arp: [67, 71, 74, 76, 79] },
];
const VOLUME = 0.38;
const LOOKAHEAD = 1.2;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class MusicPlayer {
  private bus: GainNode;
  private delayIn: GainNode;
  private timer: number | null = null;
  private nextBar = 0;
  private bar = 0;

  constructor(private ctx: AudioContext) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);

    // Echo for the arpeggio: a dark feedback delay a dotted eighth long.
    this.delayIn = ctx.createGain();
    this.delayIn.gain.value = 0.45;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    this.delayIn.connect(delay).connect(tone).connect(fb).connect(delay);
    tone.connect(this.bus);
  }

  setEnabled(on: boolean): void {
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(on ? VOLUME : 0, t, on ? 0.8 : 0.25);
    if (on && this.timer === null) {
      this.nextBar = t + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 250);
      this.schedule();
    } else if (!on && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const now = this.ctx.currentTime;
    // The app was in the background (timers throttled): pick up from now instead of catching up.
    if (this.nextBar < now) this.nextBar = now + 0.05;
    while (this.nextBar < now + LOOKAHEAD) {
      this.playBar(this.bar, this.nextBar);
      this.bar++;
      this.nextBar += BAR;
    }
  }

  private playBar(bar: number, t: number): void {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (bar % 2 === 0) for (const n of chord.pad) this.pad(hz(n), t, BAR * 2);
    this.bass(hz(chord.bass), t, BAR * 0.95);
    // Eighth-note arpeggio with rests, drifting through the chord tones.
    let i = Math.floor(Math.random() * chord.arp.length);
    for (let step = 0; step < 8; step++) {
      if (Math.random() < (step % 2 === 0 ? 0.3 : 0.55)) continue;
      i = Math.max(0, Math.min(chord.arp.length - 1, i + (Math.random() < 0.5 ? -1 : 1)));
      this.pluck(hz(chord.arp[i]), t + step * BEAT * 0.5);
    }
  }

  private pad(freq: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + 1.6);
    g.gain.setValueAtTime(0.022, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.8);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    f.connect(g).connect(this.bus);
    for (const cents of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 2);
    }
  }

  private bass(freq: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(freq: number, t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g);
    g.connect(this.bus);
    g.connect(this.delayIn);
    o.start(t);
    o.stop(t + 0.65);
  }
}
