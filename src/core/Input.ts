/**
 * Unified input: keyboard + mouse (pointer lock) + standard gamepad.
 * Gameplay code reads *actions*, never raw keys, so rebinding / touch later is one file.
 */
export type Action = 'jump' | 'interact' | 'meow' | 'reset' | 'debug' | 'pause';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'jump',
  KeyE: 'interact',
  KeyQ: 'meow',
  KeyR: 'reset',
  Backquote: 'debug',
  Escape: 'pause',
};

// Standard gamepad mapping: 0=A 1=B 2=X 3=Y 8=Back/Select 9=Start
const PAD_ACTIONS: Array<[number, Action]> = [
  [0, 'jump'],
  [2, 'interact'],
  [3, 'meow'],
  [8, 'reset'],
  [9, 'pause'],
];

export class Input {
  /** Movement intent in camera space: x = right, y = forward, magnitude 0..1. */
  move = { x: 0, y: 0 };
  sprint = false;
  /** Held, not pressed: scent mode while down. */
  scent = false;
  /** Accumulated look delta since last consume (radians-ish units). */
  look = { x: 0, y: 0 };
  lastLookTime = 0;
  usingPad = false;
  /** From settings: multiplier on look speed, and vertical look flip. */
  sensitivity = 1;
  invertY = false;

  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private padPrev: boolean[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a) {
        this.pressed.add(a);
        e.preventDefault();
      }
      this.usingPad = false;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      const k = 0.0022 * this.sensitivity;
      this.look.x += e.movementX * k;
      this.look.y += e.movementY * k * (this.invertY ? -1 : 1);
      this.lastLookTime = performance.now();
    });
    canvas.addEventListener('click', () => this.lock());
  }

  lock() {
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.()?.catch?.(() => {});
    }
  }

  /** Call once per rendered frame before gameplay reads input. */
  poll(dt: number) {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.scent = this.keys.has('KeyF');

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
      if (lx || ly) { x = lx; y = -ly; this.usingPad = true; }
      if (rx || ry) {
        this.look.x += rx * 2.6 * dt * this.sensitivity;
        this.look.y += ry * 1.8 * dt * this.sensitivity * (this.invertY ? -1 : 1);
        this.lastLookTime = performance.now();
        this.usingPad = true;
      }
      // Stick fully pushed = run, like most third-person games; RT/LB also sprint.
      if (Math.hypot(lx, ly) > 0.92 || pad.buttons[7]?.pressed || pad.buttons[4]?.pressed) this.sprint = true;
      if (pad.buttons[1]?.pressed || pad.buttons[6]?.pressed) this.scent = true;
      for (const [i, a] of PAD_ACTIONS) {
        const down = !!pad.buttons[i]?.pressed;
        if (down && !this.padPrev[i]) { this.pressed.add(a); this.usingPad = true; }
        this.padPrev[i] = down;
      }
    }
    this.move.x = x;
    this.move.y = y;
  }

  /** True once per press. */
  consume(a: Action): boolean {
    if (!this.pressed.has(a)) return false;
    this.pressed.delete(a);
    return true;
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.x = this.look.y = 0;
    return l;
  }

  clearPressed() {
    this.pressed.clear();
  }

  label(a: Action): string {
    if (this.usingPad) return ({ jump: 'A', interact: 'X', meow: 'Y', reset: '⧉', debug: '-', pause: '≡' } as const)[a];
    return ({ jump: 'Space', interact: 'E', meow: 'Q', reset: 'R', debug: '`', pause: 'Esc' } as const)[a];
  }
}
