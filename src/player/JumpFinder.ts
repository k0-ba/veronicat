import * as THREE from 'three';
import type { Physics, Collider } from '../physics/Physics';

/**
 * Stray-style *contextual* jumping: the cat never jumps freely. Each few frames we
 * scan a fan of columns in front of the cat for surfaces it could land on, and offer
 * the best one as a prompt. Pressing jump commits to a precomputed arc.
 *
 * No hand-placed jump nodes needed — any flat-enough box top in the greybox works.
 * Level designers can still bias it with `JumpHint`s later (see docs/ARCHITECTURE.md).
 */

export const JUMP = {
  maxUp: 2.2,        // highest ledge a cat reaches (Stray cat ≈ 2 m)
  maxDown: 4.0,      // highest safe drop
  minDist: 0.45,
  maxDist: 3.0,
  fanDeg: 38,        // half-angle of the search cone
  minHeightDiff: 0.22, // below this it's just walking (unless it's a gap)
  clearance: 0.32,   // free space above the landing spot
  footprint: 0.13,   // support probe offset — rejects edges and thin rails
};

export interface JumpTarget {
  point: THREE.Vector3;   // landing point on the surface (feet position)
  collider: Collider;
  dh: number;
  dist: number;
  score: number;
  kind: 'up' | 'down' | 'gap';
}

/** Shared arc so detection (clearance check) and execution trace the same path. */
export function arcPoint(from: THREE.Vector3, to: THREE.Vector3, t: number, out = new THREE.Vector3()) {
  const dh = to.y - from.y;
  // Up: ease-out vertically, lag horizontally so the paws clear the lip.
  // Down: small hop, then gravity-ish ease-in.
  const th = dh > 0 ? Math.pow(t, 1.35) : t;
  out.x = from.x + (to.x - from.x) * th;
  out.z = from.z + (to.z - from.z) * th;
  const vy = dh > 0 ? 1 - (1 - t) * (1 - t) : t * t;
  const hop = dh > 0 ? 0.28 : 0.22 + Math.max(0, 0.15 - dh * 0.02);
  out.y = from.y + dh * vy + hop * 4 * t * (1 - t);
  return out;
}

export function jumpDuration(from: THREE.Vector3, to: THREE.Vector3) {
  const dx = Math.hypot(to.x - from.x, to.z - from.z);
  const dh = to.y - from.y;
  return 0.32 + dx * 0.07 + (dh > 0 ? dh * 0.06 : Math.sqrt(-dh) * 0.12);
}

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class JumpFinder {
  current: JumpTarget | null = null;
  private tmp = new THREE.Vector3();

  constructor(private physics: Physics) {}

  /**
   * @param feet cat feet position
   * @param intent horizontal unit vector the player is "aiming" (input or camera)
   */
  update(feet: THREE.Vector3, intent: THREE.Vector3): JumpTarget | null {
    const best = this.search(feet, intent);
    // Hysteresis: don't flicker between two similar candidates.
    if (this.current && best && best.collider !== this.current.collider) {
      const stillValid = this.validate(feet, this.current.point);
      if (stillValid && best.score < this.rescore(feet, intent, this.current) + 0.25) {
        return this.current;
      }
    }
    if (this.current && best && best.collider === this.current.collider &&
        best.point.distanceTo(this.current.point) < 0.35) {
      // Same surface, nearby — keep the old point steady unless it went invalid.
      if (this.validate(feet, this.current.point)) return this.current;
    }
    this.current = best;
    return best;
  }

  clear() { this.current = null; }

  private search(feet: THREE.Vector3, intent: THREE.Vector3): JumpTarget | null {
    const perSurface = new Map<number, JumpTarget>();
    const steps = 9;
    for (let ai = 0; ai < steps; ai++) {
      const a = THREE.MathUtils.degToRad(-JUMP.fanDeg + (2 * JUMP.fanDeg * ai) / (steps - 1));
      const dir = intent.clone().applyAxisAngle(UP, a);
      for (let d = JUMP.minDist; d <= JUMP.maxDist; d += 0.22) {
        const col = feet.clone().addScaledVector(dir, d);
        for (const hit of this.column(col, feet.y)) {
          const t = this.evaluate(feet, hit.point, hit.collider, a, d);
          if (!t) continue;
          const prev = perSurface.get(hit.collider.handle);
          // Keep, per surface, the nearest-to-centre good spot.
          if (!prev || t.score > prev.score) perSurface.set(hit.collider.handle, t);
        }
      }
    }
    let best: JumpTarget | null = null;
    for (const t of perSurface.values()) if (!best || t.score > best.score) best = t;
    return best;
  }

  /** All upward-facing surfaces in a vertical column within the jump envelope. */
  private column(xz: THREE.Vector3, feetY: number) {
    const out: Array<{ point: THREE.Vector3; collider: Collider }> = [];
    const top = feetY + JUMP.maxUp + 0.05;
    const bottom = feetY - JUMP.maxDown;
    const o = new THREE.Vector3(xz.x, top, xz.z);
    for (let i = 0; i < 4 && o.y > bottom; i++) {
      const h = this.physics.ray(o, DOWN, o.y - bottom, { ignoreDynamic: true });
      if (!h) break;
      if (h.normal.y > 0.8) out.push({ point: h.point, collider: h.collider });
      o.y = h.point.y - 0.03;
    }
    return out;
  }

  private evaluate(feet: THREE.Vector3, p: THREE.Vector3, collider: Collider, angle: number, dist: number): JumpTarget | null {
    const dh = p.y - feet.y;
    if (dh > JUMP.maxUp || dh < -JUMP.maxDown) return null;
    let kind: JumpTarget['kind'];
    if (dh > JUMP.minHeightDiff) kind = 'up';
    // Overlaps the cat's SAFE_DROP (0.45) on purpose: no height may be neither walkable
    // nor jumpable, or the cat gets stuck on benches.
    else if (dh < -0.35) kind = 'down';
    else {
      // Roughly level: only a jump if there's a gap between here and there.
      if (dist < 0.9 || !this.hasGap(feet, p)) return null;
      kind = 'gap';
    }
    if (!this.validate(feet, p)) return null;
    p = this.inset(feet, p);

    const angleCost = Math.abs(angle) / THREE.MathUtils.degToRad(JUMP.fanDeg);
    const distCost = dist / JUMP.maxDist;
    let score = 1 - angleCost * 0.9 - distCost * 0.55;
    if (kind === 'up') score += 0.1;       // slight preference: climbing is the main verb
    if (kind === 'down') score -= Math.max(0, -dh - 2.5) * 0.05;
    return { point: p.clone(), collider, dh, dist, score, kind };
  }

  private rescore(feet: THREE.Vector3, intent: THREE.Vector3, t: JumpTarget) {
    const to = t.point.clone().sub(feet).setY(0);
    const dist = to.length();
    const angle = to.angleTo(intent);
    const angleCost = angle / THREE.MathUtils.degToRad(JUMP.fanDeg);
    if (angleCost > 1.25 || dist > JUMP.maxDist * 1.1) return -Infinity;
    let score = 1 - angleCost * 0.9 - (dist / JUMP.maxDist) * 0.55;
    if (t.kind === 'up') score += 0.1;
    return score;
  }

  /** Landing spot geometry + a clear arc from here to there. */
  validate(feet: THREE.Vector3, p: THREE.Vector3) {
    // Headroom.
    if (this.physics.ray(this.tmp.copy(p).setY(p.y + 0.02), UP, JUMP.clearance)) return false;
    // Footprint: at least 3 of 4 probes find the same surface height → not on a rail/edge.
    let support = 0;
    const f = JUMP.footprint;
    for (const [ox, oz] of [[f, 0], [-f, 0], [0, f], [0, -f]]) {
      const o = new THREE.Vector3(p.x + ox, p.y + 0.25, p.z + oz);
      const h = this.physics.ray(o, DOWN, 0.4, { ignoreDynamic: true });
      // 0.1 tolerance: accepts stairs/ramps up to ~35°, still rejects edges and rails.
      if (h && Math.abs(h.point.y - p.y) < 0.1) support++;
    }
    if (support < 3) return false;
    // Arc clearance, traced at chest height of the cat.
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const lift = new THREE.Vector3(0, 0.16, 0);
    arcPoint(feet, p, 0, a).add(lift);
    for (let i = 1; i <= 8; i++) {
      arcPoint(feet, p, i / 8, b).add(lift);
      if (!this.physics.segmentClear(a, b)) return false;
      a.copy(b);
    }
    return true;
  }

  /** Nudge the landing point away from the near edge, so the cat lands *on* things. */
  private inset(feet: THREE.Vector3, p: THREE.Vector3) {
    const dir = p.clone().sub(feet).setY(0);
    if (dir.lengthSq() < 1e-6) return p;
    dir.normalize();
    for (const step of [0.22, 0.12]) {
      const q = p.clone().addScaledVector(dir, step);
      const h = this.physics.ray(q.clone().setY(p.y + 0.25), DOWN, 0.4, { ignoreDynamic: true });
      if (h && Math.abs(h.point.y - p.y) < 0.03 && this.validate(feet, h.point)) return h.point;
    }
    return p;
  }

  private hasGap(feet: THREE.Vector3, p: THREE.Vector3) {
    for (const t of [0.35, 0.5, 0.65]) {
      const m = feet.clone().lerp(p, t);
      m.y = Math.max(feet.y, p.y) + 0.1;
      const h = this.physics.ray(m, DOWN, 0.7, { ignoreDynamic: true });
      if (!h) return true;
    }
    return false;
  }
}
