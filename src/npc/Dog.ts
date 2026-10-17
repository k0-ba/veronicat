import * as THREE from 'three';

/**
 * Placeholder dog (Csont: old, big, black mix, one cloudy eye). Same contract as Human:
 * place / walkTo / update, plus `lying`, `barking` and `wag` states for the story.
 */
export class Dog {
  root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private legs: THREE.Group[] = [];
  yaw = 0;
  speed = 1.6;
  lying = true;
  barking = false;
  wag = 0;              // 0..1 tail wag amount
  lookTarget: THREE.Vector3 | null = null;
  private lie = 1;
  private path: THREE.Vector3[] = [];
  private pathResolve: (() => void) | null = null;
  private phase = 0;
  private moving = 0;
  private time = Math.random() * 10;

  constructor(color = 0x1c1a1a) {
    const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0b0b, roughness: 0.7 });
    this.root.add(this.body);
    this.body.position.y = 0.5;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), fur);
    torso.rotation.x = Math.PI / 2;
    this.body.add(torso);
    // Legs: pivots at the shoulders/hips.
    for (const [x, z] of [[-0.11, 0.25], [0.11, 0.25], [-0.11, -0.25], [0.11, -0.25]]) {
      const g = new THREE.Group();
      g.position.set(x, -0.08, z);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 3, 6), fur);
      leg.position.y = -0.2;
      g.add(leg);
      this.body.add(g);
      this.legs.push(g);
    }
    // Head: muzzle, ears, one cloudy eye.
    this.head.position.set(0, 0.16, 0.42);
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), fur);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.16), fur);
    muzzle.position.set(0, -0.03, 0.12);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark);
    nose.position.set(0, -0.005, 0.2);
    this.head.add(skull, muzzle, nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.03), fur);
      ear.position.set(s * 0.08, 0.03, -0.02);
      ear.rotation.z = s * 0.5;
      this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6),
        new THREE.MeshStandardMaterial({ color: s < 0 ? 0xb8c4c8 : 0x2a1a08, roughness: 0.3, emissive: s < 0 ? 0x30383a : 0 }));
      eye.position.set(s * 0.05, 0.03, 0.1);
      this.head.add(eye);
    }
    this.tail.position.set(0, 0.06, -0.38);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.28, 3, 6), fur);
    tail.position.y = 0.15;
    this.tail.add(tail);
    this.tail.rotation.x = -0.6;
    this.body.add(this.tail);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  place(p: THREE.Vector3, yaw = this.yaw) {
    this.root.position.copy(p);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  walkTo(points: THREE.Vector3[]): Promise<void> {
    this.lying = false;
    this.path = points.map((p) => p.clone());
    return new Promise((r) => { this.pathResolve = r; });
  }
  stop() { this.path = []; const r = this.pathResolve; this.pathResolve = null; r?.(); }
  get walking() { return this.path.length > 0; }

  faceTo(p: THREE.Vector3) { this.yaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z); }

  update(dt: number) {
    this.time += dt;
    const pos = this.root.position;
    let moving = false;
    let targetYaw = this.yaw;
    if (this.path.length) {
      const goal = this.path[0];
      const to = goal.clone().sub(pos).setY(0);
      const d = to.length();
      if (d < 0.1) {
        this.path.shift();
        if (!this.path.length) { const r = this.pathResolve; this.pathResolve = null; r?.(); }
      } else {
        targetYaw = Math.atan2(to.x, to.z);
        pos.addScaledVector(to.normalize(), Math.min(d, this.speed * dt));
        pos.y += (goal.y - pos.y) * Math.min(1, dt * 6);
        moving = true;
      }
    } else if (this.lookTarget && !this.lying) {
      targetYaw = Math.atan2(this.lookTarget.x - pos.x, this.lookTarget.z - pos.z);
    }
    let dy = targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 6);
    this.root.rotation.y = this.yaw;
    this.moving += ((moving ? 1 : 0) - this.moving) * Math.min(1, dt * 8);

    // Lying down: body lowered, legs folded.
    this.lie += ((this.lying ? 1 : 0) - this.lie) * Math.min(1, dt * 3);
    const l = this.lie;
    this.phase += dt * this.speed * 7 * this.moving;
    const s = Math.sin(this.phase) * 0.6 * this.moving;
    const bark = this.barking ? Math.max(0, Math.sin(this.time * 12)) : 0;
    this.body.position.y = 0.5 - l * 0.32 + Math.abs(Math.cos(this.phase)) * 0.02 * this.moving + bark * 0.03;
    this.legs.forEach((g, i) => {
      g.rotation.x = (i === 0 || i === 3 ? s : -s) * (1 - l) + l * (i < 2 ? -1.4 : 1.4);
    });
    this.head.rotation.x = -bark * 0.35 + l * 0.25;
    this.tail.rotation.z = Math.sin(this.time * 14) * 0.7 * this.wag;
    this.tail.rotation.x = -0.6 + this.wag * 0.4 - l * 0.4;
  }
}
