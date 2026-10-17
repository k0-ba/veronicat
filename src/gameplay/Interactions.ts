import * as THREE from 'three';
import type { Action } from '../core/Input';

/**
 * Anything the cat can do something *to*: knock, scratch, rub, nap, press.
 * One prompt at a time — the closest valid interactable roughly in front of the cat.
 */
export interface Interactable {
  id: string;
  label: string;
  action?: Action;             // default 'interact'
  radius: number;
  position: () => THREE.Vector3;
  /** Height band in which the cat counts as "at" it (relative to its position). */
  heightBand?: [number, number];
  enabled?: () => boolean;
  onInteract: () => void;
}

export class Interactions {
  list: Interactable[] = [];
  focused: Interactable | null = null;

  add(i: Interactable) {
    this.list.push(i);
    return i;
  }

  update(catFeet: THREE.Vector3, catForward: THREE.Vector3, catBusy: boolean) {
    this.focused = null;
    if (catBusy) return null;
    let best = Infinity;
    const to = new THREE.Vector3();
    for (const i of this.list) {
      if (i.enabled && !i.enabled()) continue;
      const p = i.position();
      const [lo, hi] = i.heightBand ?? [-0.4, 0.6];
      const dy = p.y - catFeet.y;
      if (dy < lo || dy > hi) continue;
      to.copy(p).sub(catFeet).setY(0);
      const d = to.length();
      if (d > i.radius) continue;
      // Must be roughly in front, unless we're basically on top of it.
      if (d > 0.25 && to.normalize().dot(catForward) < 0.2) continue;
      if (d < best) { best = d; this.focused = i; }
    }
    return this.focused;
  }
}
