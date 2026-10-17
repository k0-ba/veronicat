import * as THREE from 'three';
import { RAPIER, type Physics, type RigidBody } from '../physics/Physics';

/**
 * Placeholder human: procedural low-poly body with a two-segment leg rig, so we can
 * walk, crouch (to pour milk for a cat) and turn the head. Proportions and colours come
 * from the character sheets; real models replace `buildBody` later — the API stays.
 */
export interface HumanLook {
  height?: number;       // metres
  build?: number;        // 1 = average, >1 broader
  skin?: number;
  hair?: number;
  coat: number;          // upper body
  coatLength?: number;   // 0 = jacket, 1 = long coat
  legs: number;
  shoes?: number;
  hood?: boolean;
  hat?: number;          // knitted hat colour
  glasses?: boolean;
  bag?: number;          // briefcase colour
  curlers?: boolean;
}

const tmpV = new THREE.Vector3();

export class Human {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  head = new THREE.Group();
  private legs: Array<{ thigh: THREE.Group; shin: THREE.Group }> = [];
  private arms: Array<{ upper: THREE.Group; fore: THREE.Group }> = [];
  private body: RigidBody | null = null;

  private h: number;
  private thighLen: number;
  private shinLen: number;
  private hipY: number;

  yaw = 0;
  speed = 1.25;
  crouch = 0;            // 0..1 target
  private crouchCur = 0;
  lookTarget: THREE.Vector3 | null = null;
  talking = false;
  phoneUp = false;
  private path: THREE.Vector3[] = [];
  private pathResolve: (() => void) | null = null;
  paused = false;
  private phase = 0;
  private moving = 0;
  private time = Math.random() * 10;

  constructor(look: HumanLook, physics?: Physics) {
    this.h = look.height ?? 1.75;
    this.thighLen = this.h * 0.25;
    this.shinLen = this.h * 0.25;
    this.hipY = this.thighLen + this.shinLen + 0.04;
    this.buildBody(look);
    if (physics) {
      this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      physics.world.createCollider(RAPIER.ColliderDesc.capsule(this.h * 0.3, 0.22), this.body);
    }
  }

  private buildBody(l: HumanLook) {
    const b = l.build ?? 1;
    const mat = (c: number, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const skin = mat(l.skin ?? 0xd9a88a, 0.7);
    const coat = mat(l.coat, 0.75);
    const legs = mat(l.legs);
    const shoes = mat(l.shoes ?? 0x1c1c1e, 0.5);
    const hair = mat(l.hair ?? 0x3a2a20, 0.9);
    const h = this.h;

    this.root.add(this.hips);
    this.hips.position.y = this.hipY;

    // Legs: thigh pivot at hip, shin pivot at knee.
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.1 * b, 0, 0);
      const tMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065 * b, this.thighLen - 0.1, 3, 8), legs);
      tMesh.position.y = -this.thighLen / 2;
      thigh.add(tMesh);
      const shin = new THREE.Group();
      shin.position.y = -this.thighLen;
      const sMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * b, this.shinLen - 0.1, 3, 8), legs);
      sMesh.position.y = -this.shinLen / 2;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1 * b, 0.07, 0.24), shoes);
      shoe.position.set(0, -this.shinLen + 0.0, 0.05);
      shin.add(sMesh, shoe);
      thigh.add(shin);
      this.hips.add(thigh);
      this.legs.push({ thigh, shin });
    }

    // Torso + coat.
    this.hips.add(this.torso);
    const torsoLen = h * 0.3;
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * b, torsoLen - 0.2, 4, 10), coat);
    chest.scale.set(1, 1, 0.68);
    chest.position.y = torsoLen / 2 + 0.02;
    this.torso.add(chest);
    const cl = l.coatLength ?? 0.3;
    if (cl > 0) {
      const skirtH = 0.15 + cl * this.thighLen * 1.4;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * b, 0.22 * b, skirtH, 10, 1, true), coat);
      skirt.material = coat.clone();
      (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      skirt.scale.z = 0.75;
      skirt.position.y = -skirtH / 2 + 0.12;
      this.torso.add(skirt);
    }

    // Head.
    this.head.position.y = torsoLen + 0.12;
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin);
    neck.position.y = -0.05;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), skin);
    skull.scale.set(0.92, 1.08, 1);
    skull.position.y = 0.09;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairCap.position.set(0, 0.11, -0.01);
    this.head.add(neck, skull, hairCap);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.08, 0.105);
    this.head.add(nose);
    if (l.glasses) {
      const gm = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.3 });
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 6, 14), gm);
        ring.position.set(s * 0.04, 0.11, 0.098);
        this.head.add(ring);
      }
    }
    if (l.hood) {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), coat);
      hood.position.set(0, 0.1, -0.025);
      hood.rotation.x = -0.25;
      this.head.add(hood);
    }
    if (l.hat !== undefined) {
      const hat = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(l.hat, 1));
      hat.position.y = 0.12;
      hat.scale.y = 1.15;
      this.head.add(hat);
    }
    if (l.curlers) {
      const cm = mat(0xff8fb1, 0.5);
      for (let i = 0; i < 7; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 8), cm);
        const a = (i / 7) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.08, 0.18, Math.sin(a) * 0.08 - 0.01);
        c.rotation.z = Math.PI / 2;
        c.rotation.y = -a;
        this.head.add(c);
      }
    }

    // Arms.
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.22 * b, torsoLen - 0.04, 0);
      const uMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.052 * b, h * 0.15, 3, 8), coat);
      uMesh.position.y = -h * 0.09;
      upper.add(uMesh);
      const fore = new THREE.Group();
      fore.position.y = -h * 0.18;
      const fMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.045 * b, h * 0.13, 3, 8), coat);
      fMesh.position.y = -h * 0.075;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
      hand.position.y = -h * 0.16;
      fore.add(fMesh, hand);
      upper.add(fore);
      this.torso.add(upper);
      this.arms.push({ upper, fore });
      if (side === 1 && l.bag !== undefined) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.38), mat(l.bag, 0.5));
        bag.position.set(0, -h * 0.16 - 0.14, 0);
        fore.add(bag);
      }
    }

    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  place(p: THREE.Vector3, yaw = this.yaw) {
    this.root.position.copy(p);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    this.syncBody(true);
  }

  /** Walk a polyline; resolves on arrival. `paused` halts without losing the path. */
  walkTo(points: THREE.Vector3[]): Promise<void> {
    this.path = points.map((p) => p.clone());
    return new Promise((r) => { this.pathResolve = r; });
  }

  get walking() { return this.path.length > 0; }

  faceTo(p: THREE.Vector3) {
    this.yaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
  }

  setVisible(v: boolean) {
    this.root.visible = v;
    if (this.body) this.body.setEnabled(v);
  }

  update(dt: number) {
    this.time += dt;
    const pos = this.root.position;

    // Path following.
    let targetYaw = this.yaw;
    let moving = false;
    if (this.path.length && !this.paused && this.crouchCur < 0.1) {
      const goal = this.path[0];
      tmpV.copy(goal).sub(pos).setY(0);
      const d = tmpV.length();
      if (d < 0.08) {
        this.path.shift();
        if (!this.path.length) { const r = this.pathResolve; this.pathResolve = null; r?.(); }
      } else {
        targetYaw = Math.atan2(tmpV.x, tmpV.z);
        const step = Math.min(d, this.speed * dt);
        tmpV.normalize();
        pos.addScaledVector(tmpV, step);
        pos.y += (goal.y - pos.y) * Math.min(1, dt * 6);
        moving = true;
      }
    }
    this.yaw = dampAngle(this.yaw, targetYaw, 7, dt);
    this.root.rotation.y = this.yaw;
    this.moving += ((moving ? 1 : 0) - this.moving) * Math.min(1, dt * 8);

    // Gait.
    this.phase += dt * this.speed * 5.2 * this.moving;
    const s = Math.sin(this.phase);
    const swing = 0.5 * this.moving;
    this.crouchCur += (this.crouch - this.crouchCur) * Math.min(1, dt * 4);
    const c = this.crouchCur;

    const [L, R] = this.legs;
    L.thigh.rotation.x = -s * swing - c * 1.55;
    R.thigh.rotation.x = s * swing - c * 1.25;
    L.shin.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.7 * this.moving + c * 2.3;
    R.shin.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.7 * this.moving + c * 2.2;
    // Crouch lowers the hips so the feet stay on the ground (approximate leg IK).
    const legReach = this.thighLen * Math.cos(c * 1.4) + this.shinLen * Math.cos(c * 0.85);
    this.hips.position.y = THREE.MathUtils.lerp(this.hipY, legReach + 0.04, c)
      + Math.abs(Math.cos(this.phase)) * 0.03 * this.moving;
    this.hips.position.z = -c * 0.12;

    const breathe = Math.sin(this.time * 1.7) * 0.012;
    this.torso.rotation.x = 0.05 * this.moving + c * 0.5 + breathe;
    this.torso.rotation.z = s * 0.03 * this.moving;

    const [la, ra] = this.arms;
    la.upper.rotation.x = s * 0.45 * this.moving - c * 0.6;
    la.fore.rotation.x = -0.25 - c * 0.4;
    ra.upper.rotation.x = -s * 0.45 * this.moving - c * 1.1;
    ra.fore.rotation.x = -0.25 - c * 0.9;
    if (this.phoneUp && !moving) {
      la.upper.rotation.x = -0.35;
      la.upper.rotation.z = 0.25;
      la.fore.rotation.x = -1.6;
    } else {
      la.upper.rotation.z = 0;
    }

    // Head: look at target (clamped), nod while talking.
    let hy = 0, hx = this.phoneUp && !moving ? 0.45 : 0;
    if (this.lookTarget) {
      const wp = new THREE.Vector3();
      this.head.getWorldPosition(wp);
      const to = this.lookTarget.clone().sub(wp);
      const localYaw = angleDiff(this.yaw, Math.atan2(to.x, to.z));
      hy = THREE.MathUtils.clamp(localYaw, -1.1, 1.1);
      hx = THREE.MathUtils.clamp(-Math.atan2(to.y, Math.hypot(to.x, to.z)) - this.torso.rotation.x, -0.5, 0.9);
      // Turn the whole body if the target is far behind.
      if (Math.abs(localYaw) > 1.4 && !moving) this.yaw = dampAngle(this.yaw, this.yaw + localYaw, 3, dt);
    }
    if (this.talking) hx += Math.sin(this.time * 9) * 0.04;
    this.head.rotation.y += (hy - this.head.rotation.y) * Math.min(1, dt * 6);
    this.head.rotation.x += (hx - this.head.rotation.x) * Math.min(1, dt * 6);

    this.syncBody(false);
  }

  private syncBody(teleport: boolean) {
    if (!this.body) return;
    const p = this.root.position;
    const t = { x: p.x, y: p.y + this.h * 0.3 + 0.22, z: p.z };
    if (teleport) this.body.setTranslation(t, true);
    this.body.setNextKinematicTranslation(t);
  }
}

function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dampAngle(a: number, b: number, rate: number, dt: number) {
  return a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));
}
