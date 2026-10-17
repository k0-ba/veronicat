import * as THREE from 'three';

/** Cheap streak rain in a box that follows the camera. */
export class Rain {
  mesh: THREE.LineSegments;
  private pos: Float32Array;
  private speeds: Float32Array;
  private readonly count = 1800;
  private readonly box = new THREE.Vector3(14, 10, 14);

  constructor() {
    this.pos = new Float32Array(this.count * 6);
    this.speeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.respawn(i, true, new THREE.Vector3());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x9fb4cc, transparent: true, opacity: 0.28, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
  }

  private respawn(i: number, anyHeight: boolean, c: THREE.Vector3) {
    const x = c.x + (Math.random() - 0.5) * this.box.x;
    const z = c.z + (Math.random() - 0.5) * this.box.z;
    const y = c.y + (anyHeight ? (Math.random() - 0.5) : 0.5) * this.box.y;
    const len = 0.18 + Math.random() * 0.14;
    const o = i * 6;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.pos[o + 3] = x + 0.02; this.pos[o + 4] = y - len; this.pos[o + 5] = z;
    this.speeds[i] = 9 + Math.random() * 4;
  }

  update(dt: number, center: THREE.Vector3) {
    const half = this.box.y / 2;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const dy = this.speeds[i] * dt;
      this.pos[o + 1] -= dy;
      this.pos[o + 4] -= dy;
      this.pos[o] += dt * 0.3; this.pos[o + 3] += dt * 0.3;
      const out = this.pos[o + 1] < center.y - half ||
        Math.abs(this.pos[o] - center.x) > this.box.x / 2 ||
        Math.abs(this.pos[o + 2] - center.z) > this.box.z / 2;
      if (out) this.respawn(i, false, center);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
