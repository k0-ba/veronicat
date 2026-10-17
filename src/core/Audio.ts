/**
 * Placeholder procedural audio (no asset files). Every sound is a named method so the
 * sound designer can swap each one for a sample later without touching gameplay code.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.rainLoop();
  }

  private noise(dur: number, loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    s.start(this.ctx!.currentTime, Math.random(), loop ? undefined : dur);
    return s;
  }

  private rainLoop() {
    const c = this.ctx!;
    const src = this.noise(0, true);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    const g = c.createGain();
    g.gain.value = 0.09;
    src.connect(hp).connect(lp).connect(g).connect(this.master);
  }

  meow(pitch = 1) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const f = 520 * pitch * (0.92 + Math.random() * 0.16);
    osc.frequency.setValueAtTime(f * 0.8, t);
    osc.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18);
    osc.frequency.linearRampToValueAtTime(f * 0.9, t + 0.55);
    // Two formants sweeping "i → a → u" give the vowel-ish mew.
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 6;
    f1.frequency.setValueAtTime(900, t);
    f1.frequency.linearRampToValueAtTime(1500, t + 0.2);
    f1.frequency.linearRampToValueAtTime(700, t + 0.55);
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 8;
    f2.frequency.setValueAtTime(2400, t);
    f2.frequency.linearRampToValueAtTime(2900, t + 0.2);
    f2.frequency.linearRampToValueAtTime(1800, t + 0.55);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.setValueAtTime(0.5, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(f1).connect(g);
    osc.connect(f2).connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  private thump(freq: number, vol: number, dur: number) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const src = this.noise(dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(g).connect(this.master);
  }

  sniff() {
    const c = this.ctx;
    if (!c) return;
    for (let i = 0; i < 3; i++) {
      const t = c.currentTime + i * 0.13;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.start(t, Math.random(), 0.08);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      src.connect(bp).connect(g).connect(this.master);
    }
  }

  /** Muffled bass loop from the boys' speaker; volume follows distance (0..1). */
  private music: { gain: GainNode } | null = null;
  setMusic(vol: number) {
    const c = this.ctx;
    if (!c) return;
    if (!this.music) {
      const gain = c.createGain();
      gain.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.connect(gain).connect(this.master);
      // Four-on-the-floor kick + off-beat bass, scheduled ahead in a loop.
      const bpm = 96, beat = 60 / bpm;
      let next = c.currentTime + 0.1;
      const notes = [55, 55, 65.4, 49];
      let n = 0;
      const tick = () => {
        while (next < c.currentTime + 0.5) {
          const o = c.createOscillator();
          o.frequency.setValueAtTime(110, next);
          o.frequency.exponentialRampToValueAtTime(40, next + 0.12);
          const g = c.createGain();
          g.gain.setValueAtTime(0.9, next);
          g.gain.exponentialRampToValueAtTime(0.001, next + 0.25);
          o.connect(g).connect(lp);
          o.start(next); o.stop(next + 0.26);
          const b = c.createOscillator();
          b.type = 'sawtooth';
          b.frequency.value = notes[Math.floor(n / 4) % 4];
          const bg = c.createGain();
          bg.gain.setValueAtTime(0.0001, next + beat / 2);
          bg.gain.exponentialRampToValueAtTime(0.35, next + beat / 2 + 0.02);
          bg.gain.exponentialRampToValueAtTime(0.001, next + beat * 0.95);
          b.connect(bg).connect(lp);
          b.start(next + beat / 2); b.stop(next + beat);
          next += beat; n++;
        }
      };
      setInterval(tick, 200);
      this.music = { gain };
    }
    this.music.gain.gain.setTargetAtTime(vol * 0.5, c.currentTime, 0.2);
  }

  /** Bus: low diesel rumble with volume 0..1. */
  private engine: { gain: GainNode } | null = null;
  setEngine(vol: number) {
    const c = this.ctx;
    if (!c) return;
    if (!this.engine) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 38;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const gain = c.createGain();
      gain.gain.value = 0;
      o.connect(lp).connect(gain).connect(this.master);
      o.start();
      this.engine = { gain };
    }
    this.engine.gain.gain.setTargetAtTime(vol * 0.35, c.currentTime, 0.15);
  }

  hiss() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const src = this.noise(0.6);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(hp).connect(g).connect(this.master);
  }

  jump() { this.thump(900, 0.25, 0.12); }
  /** Distant door closing (stairwell / flat). */
  thumpDoor() { this.thump(260, 0.5, 0.3); }
  /** Someone stamping a foot to shoo the cat. */
  stomp() { this.thump(400, 0.7, 0.18); }
  land(strength = 1) { this.thump(500, 0.35 * Math.min(1.5, strength), 0.16); }
  step() { this.thump(1800, 0.03, 0.05); }

  scratch() {
    const c = this.ctx;
    if (!c) return;
    for (let i = 0; i < 5; i++) {
      const t = c.currentTime + i * 0.16;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.start(t, Math.random(), 0.12);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200 + Math.random() * 1500;
      bp.Q.value = 1.4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(bp).connect(g).connect(this.master);
    }
  }

  clank() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    for (const f of [420, 1130, 2260]) {
      const o = c.createOscillator();
      o.frequency.value = f * (0.95 + Math.random() * 0.1);
      const g = c.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.42);
    }
  }

  beep(up = true) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(up ? 440 : 880, t);
    o.frequency.setValueAtTime(up ? 880 : 440, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.setValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.21);
  }

  purr(dur = 2.5) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const src = this.noise(dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const am = c.createGain();
    const lfo = c.createOscillator();
    lfo.frequency.value = 24;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.4);
    g.gain.setValueAtTime(0.9, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(am).connect(g).connect(this.master);
    lfo.start(t);
    lfo.stop(t + dur);
  }
}
