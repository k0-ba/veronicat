import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RAPIER, type Physics, type RigidBody, type Collider } from '../physics/Physics';
import { JumpFinder, arcPoint, jumpDuration, type JumpTarget } from './JumpFinder';
import type { Audio } from '../core/Audio';
import { CatAnimator, NATIVE_SPEED } from './CatAnimator';

/** Collider: a small upright capsule. Cats are long, but a capsule keeps the KCC sane. */
const RADIUS = 0.13;
const HALF_H = 0.06;
const FOOT_OFFSET = RADIUS + HALF_H + 0.01; // body centre above the feet

const SPEED_WALK = 0.75;
const SPEED_RUN = 3.1;
const ACCEL = 9;
const TURN_RATE = 10;
const GRAVITY = 22;
/** Stray rule: the cat never walks off a ledge higher than this — it has to jump. */
const SAFE_DROP = 0.45;

/** Visual length of the cat in metres; the GLB is scaled to this. */
const CAT_LENGTH = 0.58;

export type CatState = 'ground' | 'crouch' | 'jump' | 'land' | 'fall' | 'scratch' | 'nap' | 'swipe' | 'eat' | 'sniff';

export class Cat {
  root = new THREE.Group();            // positioned at feet, yawed
  private visual = new THREE.Group();  // procedural animation layer
  private modelHolder = new THREE.Group();
  /** Things carried in the mouth get parented here. */
  mouth = new THREE.Group();
  carrying: THREE.Object3D | null = null;

  body!: RigidBody;
  collider!: Collider;
  private kcc!: RAPIER.KinematicCharacterController;
  jumpFinder: JumpFinder;

  state: CatState = 'ground';
  feet = new THREE.Vector3();
  private prevFeet = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = Math.PI;
  private prevYaw = Math.PI;
  speed = 0;

  private stateTime = 0;
  private jump: { from: THREE.Vector3; to: THREE.Vector3; dur: number; kind: JumpTarget['kind'] } | null = null;
  private phase = 0;
  private landImpact = 0;
  private stepAccum = 0;
  private lean = 0;
  /** Skeletal clips, when the GLB has them (else the procedural squash below is all). */
  private anim: CatAnimator | null = null;
  private animState: CatState | null = null;
  private sinceLand = 9;

  constructor(private physics: Physics, private audio: Audio, spawn: THREE.Vector3) {
    this.jumpFinder = new JumpFinder(physics);
    this.root.add(this.visual);
    this.visual.add(this.modelHolder);
    this.mouth.position.set(0, 0.15, CAT_LENGTH * 0.52);
    this.visual.add(this.mouth);
    this.buildPlaceholder();
    this.createBody(spawn);
  }

  private createBody(spawn: THREE.Vector3) {
    const w = this.physics.world;
    this.body = w.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + FOOT_OFFSET, spawn.z),
    );
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(HALF_H, RADIUS).setMass(4), this.body);
    this.physics.playerBody = this.body;

    this.kcc = w.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(48));
    this.kcc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(35));
    this.kcc.enableAutostep(0.14, 0.08, false);
    this.kcc.enableSnapToGround(0.12);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(4);

    this.feet.copy(spawn);
    this.prevFeet.copy(spawn);
  }

  /** Grey placeholder until the GLB arrives (also the fallback if it fails). */
  private buildPlaceholder() {
    const m = new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 0.8 });
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 10), m);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), m);
    head.position.set(0, 0.28, 0.22);
    g.add(torso, head);
    g.traverse((o) => { o.castShadow = true; });
    g.name = 'placeholder';
    this.modelHolder.add(g);
  }

  async loadModel(url: string, yawOffset = 0) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    // Normalise: longest horizontal axis → CAT_LENGTH, feet at y=0, centred.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = CAT_LENGTH / Math.max(size.x, size.z);
    model.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    model.position.set(-c.x, -box.min.y * s, -c.z);
    const holder = new THREE.Group();
    holder.add(model);
    holder.rotation.y = yawOffset;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false; // bind-pose bounds
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissiveMap) mat.emissiveIntensity = 0.0; // Meshy bakes a junk emissive
        mat.envMapIntensity = 0.6;
      }
    });
    this.modelHolder.clear();
    this.modelHolder.add(holder);
    this.anim = gltf.animations.length ? new CatAnimator(model, gltf.animations) : null;
    this.animState = null;
  }

  get busy() {
    return this.state === 'jump' || this.state === 'crouch' || this.state === 'scratch' || this.state === 'nap'
      || this.state === 'swipe' || this.state === 'eat' || this.state === 'sniff';
  }

  /** Forward (facing) direction on the XZ plane. */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  teleport(p: THREE.Vector3, yaw = this.yaw) {
    this.feet.copy(p);
    this.prevFeet.copy(p);
    this.velocity.set(0, 0, 0);
    this.yaw = this.prevYaw = yaw;
    this.body.setTranslation({ x: p.x, y: p.y + FOOT_OFFSET, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + FOOT_OFFSET, z: p.z });
    this.setState('ground');
    this.jump = null;
    this.jumpFinder.clear();
  }

  setState(s: CatState) {
    if (s === this.state) return;
    this.state = s;
    this.stateTime = 0;
  }

  startJump(target: JumpTarget) {
    if (this.busy || this.state === 'fall') return false;
    this.jump = { from: this.feet.clone(), to: target.point.clone(), dur: jumpDuration(this.feet, target.point), kind: target.kind };
    this.setState('crouch');
    this.velocity.set(0, 0, 0);
    return true;
  }

  doScratch() { if (!this.busy) { this.setState('scratch'); this.audio.scratch(); } }
  doSwipe() { if (!this.busy) this.setState('swipe'); }
  doNap() { this.setState('nap'); this.audio.purr(4); }
  private actionDur = 1;
  doEat(seconds = 2.4) { if (!this.busy) { this.actionDur = seconds; this.setState('eat'); this.audio.purr(seconds + 0.5); } }
  doSniff() { if (!this.busy) { this.actionDur = 1.1; this.setState('sniff'); this.audio.sniff(); } }

  /** Pick something up in the mouth (drops whatever was carried before). */
  carry(obj: THREE.Object3D | null) {
    if (this.carrying) this.mouth.remove(this.carrying);
    this.carrying = obj;
    if (obj) { obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); this.mouth.add(obj); }
  }

  /**
   * Fixed-step update.
   * @param moveWorld desired horizontal direction * magnitude (0..1) in world space
   */
  fixedUpdate(dt: number, moveWorld: THREE.Vector3, sprint: boolean) {
    this.prevFeet.copy(this.feet);
    this.prevYaw = this.yaw;
    this.stateTime += dt;

    switch (this.state) {
      case 'crouch':
        if (this.jump) this.faceTowards(this.jump.to, dt, 18);
        if (this.stateTime > 0.09) { this.setState('jump'); this.audio.jump(); }
        break;
      case 'jump': this.updateJump(); break;
      case 'scratch':
        if (this.stateTime > 1.0) this.setState('ground');
        break;
      case 'swipe':
        if (this.stateTime > 0.35) this.setState('ground');
        break;
      case 'nap': break;
      case 'eat':
      case 'sniff':
        if (this.stateTime > this.actionDur) this.setState('ground');
        break;
      case 'land':
        if (this.stateTime > 0.12) this.setState('ground');
        this.walk(dt, moveWorld.multiplyScalar(0.3), false);
        break;
      default:
        this.walk(dt, moveWorld, sprint);
    }
  }

  private updateJump() {
    const j = this.jump!;
    const t = Math.min(1, this.stateTime / j.dur);
    const p = arcPoint(j.from, j.to, t);
    this.feet.copy(p);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + FOOT_OFFSET, z: p.z });
    if (t >= 1) {
      this.landImpact = Math.min(1.2, 0.35 + Math.abs(j.to.y - j.from.y) * 0.25);
      this.audio.land(this.landImpact);
      this.jump = null;
      this.velocity.set(0, 0, 0);
      this.jumpFinder.clear();
      this.setState('land');
    }
  }

  private faceTowards(p: THREE.Vector3, dt: number, rate = TURN_RATE) {
    const target = Math.atan2(p.x - this.feet.x, p.z - this.feet.z);
    this.yaw = dampAngle(this.yaw, target, rate, dt);
  }

  private walk(dt: number, moveWorld: THREE.Vector3, sprint: boolean) {
    const mag = Math.min(1, moveWorld.length());
    const targetSpeed = mag * (sprint ? SPEED_RUN : SPEED_WALK) * (mag < 0.5 && !sprint ? 0.7 : 1);
    const desired = mag > 0.01 ? moveWorld.clone().normalize().multiplyScalar(targetSpeed) : new THREE.Vector3();

    // Smooth horizontal velocity.
    const k = 1 - Math.exp(-ACCEL * dt);
    this.velocity.x += (desired.x - this.velocity.x) * k;
    this.velocity.z += (desired.z - this.velocity.z) * k;

    if (mag > 0.05) {
      const targetYaw = Math.atan2(moveWorld.x, moveWorld.z);
      this.yaw = dampAngle(this.yaw, targetYaw, TURN_RATE, dt);
    }

    const grounded = this.kcc.computedGrounded();
    if (grounded && this.velocity.y < 0) this.velocity.y = -0.1; // snap-to-ground does the rest
    else this.velocity.y -= GRAVITY * dt;

    let move = this.velocity.clone().multiplyScalar(dt);
    if (grounded) move = this.ledgeGuard(move);

    this.kcc.computeColliderMovement(this.collider, move, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = this.kcc.computedMovement();
    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.feet.set(next.x, next.y - FOOT_OFFSET, next.z);

    // Kill velocity into walls so we don't keep pushing. On slopes/steps the controller
    // shortens the horizontal part (it went *up* instead) — that's not a wall, so keep the
    // requested velocity, otherwise the speed decays frame by frame and the cat stalls.
    const climbed = m.y > 1e-4; // actually rose (slope or autostep), not just "didn't sink"
    if (dt > 0 && !climbed) {
      this.velocity.x = m.x / dt;
      this.velocity.z = m.z / dt;
    }
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    const nowGrounded = this.kcc.computedGrounded();
    if (!nowGrounded && this.state === 'ground' && this.velocity.y < -2) this.setState('fall');
    if (nowGrounded && this.state === 'fall') {
      this.landImpact = Math.min(1.2, -this.velocity.y * 0.08);
      this.audio.land(this.landImpact);
      this.setState('land');
    }
  }

  /**
   * Stray-like ledge safety: probe the ground ahead; if the next step would drop more
   * than SAFE_DROP, cancel that axis of movement (keeps sliding along the edge).
   */
  private ledgeGuard(move: THREE.Vector3) {
    const h = new THREE.Vector3(move.x, 0, move.z);
    if (h.lengthSq() < 1e-8) return move;
    const safe = (dx: number, dz: number) => {
      const dir = new THREE.Vector3(dx, 0, dz);
      const len = dir.length();
      if (len < 1e-6) return true;
      dir.divideScalar(len);
      const probe = this.feet.clone().addScaledVector(dir, len + RADIUS * 0.6);
      probe.y += 0.2;
      return !!this.physics.ray(probe, new THREE.Vector3(0, -1, 0), 0.2 + SAFE_DROP);
    };
    if (safe(move.x, move.z)) return move;
    if (safe(move.x, 0)) return new THREE.Vector3(move.x, move.y, 0);
    if (safe(0, move.z)) return new THREE.Vector3(0, move.y, move.z);
    return new THREE.Vector3(0, move.y, 0);
  }

  /** Drive the skeletal clips from the gameplay state. */
  private animate(dt: number) {
    const a = this.anim!;
    this.sinceLand += dt;
    if (this.state !== this.animState) {
      if (this.state === 'crouch') a.restart('crouch', 0.12);
      if (this.state === 'land') { a.restart('land'); this.sinceLand = 0; }
      if (this.state === 'swipe') a.restart('swipe', 0.35);
      if (this.state === 'scratch') a.restart('scratch', 1.0);
      this.animState = this.state;
    }
    const sp = this.speed;
    const walkN = NATIVE_SPEED.walk * CAT_LENGTH, runN = NATIVE_SPEED.run * CAT_LENGTH;
    // Locomotion: idle → walk → run by speed, playback rate locked to ground speed.
    const loco = () => {
      const wr = THREE.MathUtils.clamp((sp - SPEED_WALK) / (SPEED_RUN * 0.8 - SPEED_WALK), 0, 1);
      const moving = THREE.MathUtils.clamp(sp / 0.12, 0, 1);
      a.setTimeScale('walk', THREE.MathUtils.clamp(sp / walkN, 0.5, 2.2));
      a.setTimeScale('run', THREE.MathUtils.clamp(sp / runN, 0.6, 1.8));
      return { idle: 1 - moving, walk: moving * (1 - wr), run: moving * wr };
    };
    let fade = 12;
    switch (this.state) {
      case 'crouch': a.setTargets({ crouch: 1 }); fade = 30; break;
      case 'jump': {
        const t = this.jump ? this.stateTime / this.jump.dur : 1;
        a.scrubJump(t);
        a.setTargets({ jump: 1 }); fade = 30;
        break;
      }
      case 'fall': a.scrubJump(0.85); a.setTargets({ jump: 1 }); fade = 8; break;
      case 'land': a.setTargets({ land: 1 }); fade = 30; break;
      case 'swipe': a.setTargets({ swipe: 1 }); fade = 20; break;
      case 'scratch': a.setTargets({ scratch: 1 }); fade = 10; break;
      case 'nap': a.setTargets({ sleep: 1 }); fade = 3; break;
      case 'eat': case 'sniff': a.setTargets({ idle: 1 }); break;
      default: {
        // Let the landing clip finish unless the player is already moving off.
        const landLeft = 1 - this.sinceLand / 0.3;
        const l = landLeft > 0 && sp < 0.3 ? landLeft : 0;
        const w = loco();
        a.setTargets({ ...w, land: l });
      }
    }
    a.update(dt, fade);
  }

  /** Render-rate: interpolate + procedural animation of the static mesh. */
  render(alpha: number, dt: number, time: number) {
    this.root.position.lerpVectors(this.prevFeet, this.feet, alpha);
    this.root.rotation.y = lerpAngle(this.prevYaw, this.yaw, alpha);

    const v = this.visual;
    const speedN = Math.min(1, this.speed / SPEED_RUN);
    let sy = 1, sz = 1, pitch = 0, bob = 0, roll = 0;

    if (this.state === 'ground' || this.state === 'land' || this.state === 'fall') {
      const freq = 4 + speedN * 9;
      this.phase += dt * freq * (this.speed > 0.05 ? 1 : 0);
      const amp = this.speed > 0.05 ? 0.008 + speedN * 0.02 : 0;
      bob = Math.abs(Math.sin(this.phase)) * amp;
      pitch = Math.sin(this.phase * 2) * 0.03 * speedN - speedN * 0.05;
      // Idle breathing.
      if (this.speed < 0.05) sy = 1 + Math.sin(time * 2.4) * 0.012;
      // Footstep sound roughly with the gait.
      this.stepAccum += dt * freq * (this.speed > 0.2 ? 1 : 0);
      if (this.stepAccum > Math.PI) { this.stepAccum = 0; this.audio.step(); }
    }

    // Turn lean.
    const yawVel = angleDiff(this.prevYaw, this.yaw) / Math.max(dt, 1e-3);
    this.lean += (THREE.MathUtils.clamp(-yawVel * 0.04 * (0.4 + speedN), -0.25, 0.25) - this.lean) * Math.min(1, dt * 8);
    roll = this.lean;

    if (this.anim) {
      this.animate(dt);
      // Clips carry the body motion; keep only the turn lean, a light landing squash
      // and the head-down states that have no clip of their own.
      const p = this.state === 'eat' ? 0.25 : this.state === 'sniff' ? 0.15 : 0;
      if (this.landImpact > 0) {
        sy = 1 - this.landImpact * 0.06;
        this.landImpact = Math.max(0, this.landImpact - dt * 5);
      }
      v.position.y = 0;
      v.scale.set(1 / Math.sqrt(sy), sy, 1);
      v.rotation.set(p, 0, roll * 0.6);
      return;
    }

    if (this.state === 'crouch') { sy = 0.78; sz = 1.08; pitch = 0.12; }
    if (this.state === 'jump' && this.jump) {
      const t = Math.min(1, this.stateTime / this.jump.dur);
      const dh = this.jump.to.y - this.jump.from.y;
      sz = 1 + Math.sin(t * Math.PI) * 0.18;
      sy = 1 - Math.sin(t * Math.PI) * 0.08;
      pitch = dh > 0 ? THREE.MathUtils.lerp(-0.6, 0.2, t) : THREE.MathUtils.lerp(-0.1, 0.45, t);
    }
    if (this.landImpact > 0) {
      sy *= 1 - this.landImpact * 0.18;
      sz *= 1 + this.landImpact * 0.08;
      this.landImpact = Math.max(0, this.landImpact - dt * 5);
    }
    if (this.state === 'scratch') {
      pitch = -0.55 + Math.sin(this.stateTime * 26) * 0.08;
      bob = 0.06;
    }
    if (this.state === 'swipe') {
      const t = this.stateTime / 0.35;
      pitch = -Math.sin(t * Math.PI) * 0.3;
      roll = Math.sin(t * Math.PI) * 0.25;
    }
    if (this.state === 'eat') {
      // Head down, rhythmic lapping.
      pitch = 0.32 + Math.sin(this.stateTime * 14) * 0.04;
      sy = 0.9;
    }
    if (this.state === 'sniff') {
      pitch = 0.22 + Math.sin(this.stateTime * 22) * 0.025;
      bob = -0.01;
    }
    if (this.state === 'nap') {
      const t = Math.min(1, this.stateTime / 0.8);
      sy = THREE.MathUtils.lerp(1, 0.62, t) + Math.sin(time * 1.6) * 0.012;
      sz = THREE.MathUtils.lerp(1, 0.9, t);
      roll = THREE.MathUtils.lerp(0, 0.35, t);
    }

    v.position.y = bob;
    v.scale.set(1 / Math.sqrt(sy * sz), sy, sz); // rough volume preservation
    v.rotation.set(pitch, 0, roll);
  }
}

function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function lerpAngle(a: number, b: number, t: number) { return a + angleDiff(a, b) * t; }
function dampAngle(a: number, b: number, rate: number, dt: number) {
  return a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));
}
