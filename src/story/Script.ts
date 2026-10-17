import type { Dialogue } from './Dialogue';

/**
 * Tiny coroutine runner on *game* time, so story beats read like a screenplay:
 *
 *   await s.say('Gábor', 'Hát te? Ilyen időben?');
 *   await s.until(() => flags.rubbed);
 *
 * A reset bumps the generation; every pending await of the old run rejects with
 * `Cancelled`, which `run()` swallows — so restarting never leaves ghosts behind.
 */
export class Cancelled extends Error {}

export class Script {
  time = 0;
  private gen = 0;
  private waits: Array<{ gen: number; pred: () => boolean; resolve: () => void; reject: (e: Error) => void }> = [];

  constructor(private dialogue: Dialogue) {}

  update(dt: number) {
    this.time += dt;
    const pending = this.waits;
    this.waits = [];
    for (const w of pending) {
      if (w.gen !== this.gen) { w.reject(new Cancelled()); continue; }
      let ok = false;
      try { ok = w.pred(); } catch (e) { console.error(e); }
      if (ok) w.resolve(); else this.waits.push(w);
    }
  }

  until(pred: () => boolean): Promise<void> {
    const gen = this.gen;
    return new Promise((resolve, reject) => this.waits.push({ gen, pred, resolve, reject }));
  }

  wait(seconds: number) {
    const t = this.time + seconds;
    return this.until(() => this.time >= t);
  }

  /** Show a subtitle for a reading-speed duration, then fade it. */
  async say(speaker: string | null, text: string, extra = 0) {
    const el = this.dialogue.line(speaker, text);
    try {
      await this.wait(1.3 + text.length * 0.052 + extra);
    } finally {
      this.dialogue.clearLine(el);
    }
  }

  /** Launch a beat; cancellation is silent, real errors are logged. */
  run(fn: () => Promise<void>) {
    fn().catch((e) => { if (!(e instanceof Cancelled)) console.error(e); });
  }

  cancelAll() {
    this.gen++;
    this.update(0);
  }
}
