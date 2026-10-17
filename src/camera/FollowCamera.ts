import * as THREE from 'three';
import type { Physics } from '../physics/Physics';

/**
 * Third-person orbit camera tuned for a small character:
 * - low, close framing (the world should feel big)
 * - collision pull-in with a ray fan, smooth push-out
 * - gentle auto-recenter behind the cat while walking without mouse input
 * - vertical lag so jumps read as jumps
 */
export class FollowCamera {
  yaw = 0;
  pitch = 0.32;
  distance = 1.7;
  private curDist = 1.7;
  private pivot = new THREE.Vector3();
  private pivotY = 0;
  private initialised = false;

  constructor(public camera: THREE.PerspectiveCamera, private physics: Physics) {}

  /** Horizontal forward of the camera — used to map stick input to world space. */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  snapBehind(catYaw: number, target: THREE.Vector3) {
    this.yaw = catYaw + Math.PI;
    this.pitch = 0.3;
    this.pivot.copy(target);
    this.pivotY = target.y;
    this.curDist = this.distance;
    this.initialised = true;
  }

  update(dt: number, target: THREE.Vector3, look: { x: number; y: number }, opts: {
    catYaw: number; catSpeed: number; idleLook: number; airborne: boolean;
  }) {
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, -0.45, 1.25);

    // Auto-recenter: only when moving and the player hasn't touched the camera lately.
    if (opts.idleLook > 1.6 && opts.catSpeed > 0.4) {
      const behind = opts.catYaw + Math.PI;
      let d = (behind - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-0.9 * dt)) * Math.min(1, opts.catSpeed / 2);
    }

    if (!this.initialised) this.snapBehind(opts.catYaw, target);

    // Pivot: fast in XZ, laggy in Y (more lag while airborne).
    const kxz = 1 - Math.exp(-14 * dt);
    const ky = 1 - Math.exp(-(opts.airborne ? 4 : 9) * dt);
    this.pivot.x += (target.x - this.pivot.x) * kxz;
    this.pivot.z += (target.z - this.pivot.z) * kxz;
    this.pivotY += (target.y - this.pivotY) * ky;
    this.pivot.y = this.pivotY;

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    // Collision: closest hit among a small fan of rays (centre + 4 offsets).
    let allowed = this.distance;
    const right = this.right();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [ox, oy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.1], [0, -0.1]]) {
      const o = this.pivot.clone().addScaledVector(right, ox).addScaledVector(up, oy);
      const hit = this.physics.ray(o, dir, this.distance + 0.2, { solid: true, ignoreDynamic: true });
      if (hit) allowed = Math.min(allowed, Math.max(0.25, hit.distance - 0.14));
    }
    // Pull in instantly, ease back out.
    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist += (allowed - this.curDist) * (1 - Math.exp(-3 * dt));

    this.camera.position.copy(this.pivot).addScaledVector(dir, this.curDist);
    // Look slightly above the pivot so the cat sits in the lower third.
    const lookAt = this.pivot.clone();
    lookAt.y += 0.08;
    this.camera.lookAt(lookAt);
  }
}
