import * as THREE from 'three';

/**
 * Skeletal clip layer for the cat GLB (clips authored by tools/rig/quaternius_cat.py):
 * idle, walk, run, crouch, jump (scrubbed 0..1), land, swipe, scratch, sleep.
 * Every action runs all the time; the cat state just sets target weights, which are
 * smoothed here, so any state change cross-fades.
 */
export type ClipName = 'idle' | 'walk' | 'run' | 'crouch' | 'jump' | 'land' | 'swipe' | 'scratch' | 'sleep';

const ONE_SHOT: ClipName[] = ['crouch', 'land', 'swipe', 'scratch'];

/** Body advance per clip cycle, in cat-lengths per second (printed by the bake script). */
export const NATIVE_SPEED = { walk: 0.8242, run: 3.7291 };

export class CatAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private weight = new Map<ClipName, number>();
  private target = new Map<ClipName, number>();

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) {
      const name = clip.name as ClipName;
      const a = this.mixer.clipAction(clip);
      if (ONE_SHOT.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      if (name === 'jump') a.paused = true;
      a.play();
      a.setEffectiveWeight(0);
      this.actions.set(name, a);
      this.weight.set(name, 0);
    }
  }

  has(name: ClipName) { return this.actions.has(name); }

  /** Restart a one-shot from frame 0 (call on state entry). */
  restart(name: ClipName, duration?: number) {
    const a = this.actions.get(name);
    if (!a) return;
    a.reset();
    a.timeScale = duration ? a.getClip().duration / duration : 1;
    a.play();
  }

  /** Scrub the paused jump clip: 0 = take-off, 1 = touch-down. */
  scrubJump(t: number) {
    const a = this.actions.get('jump');
    if (a) a.time = THREE.MathUtils.clamp(t, 0, 0.999) * a.getClip().duration;
  }

  setTimeScale(name: ClipName, s: number) {
    const a = this.actions.get(name);
    if (a) a.timeScale = s;
  }

  /** Target weights for this frame; unnamed clips fade to 0. */
  setTargets(t: Partial<Record<ClipName, number>>) {
    this.target.clear();
    for (const [k, v] of Object.entries(t)) this.target.set(k as ClipName, v);
  }

  update(dt: number, fadeRate = 12) {
    const k = 1 - Math.exp(-fadeRate * dt);
    let sum = 0;
    for (const [name, w] of this.weight) {
      const nw = w + ((this.target.get(name) ?? 0) - w) * k;
      this.weight.set(name, nw);
      sum += nw;
    }
    for (const [name, a] of this.actions) a.setEffectiveWeight(this.weight.get(name)! / Math.max(sum, 1e-4));
    this.mixer.update(dt);
  }
}
