import * as THREE from 'three';
import { RAPIER, type Physics, type RigidBody } from '../physics/Physics';
import { createMaterials, worldUVBox, neonSign, type Materials } from './materials';
import type { Interactions } from '../gameplay/Interactions';
import type { Audio } from '../core/Audio';
import type { Cat } from '../player/Cat';

/**
 * Greybox vertical slice: "Esős sikátor" (rainy alley).
 *
 * Route: crate → stacked crate → AC unit → balcony → hanging sign → left ledge → roof
 * → warm vent (nap = end of slice). Side verbs on the way: scratch a carpet roll,
 * wake/rub a dormant robot, knock paint cans off the balcony, push trash.
 *
 * All numbers are metres. Cat ≈ 0.58 m long, jump reach ≈ 2.2 m up / 3 m across.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, 0, 6.4);
  readonly spawnYaw = Math.PI; // facing -Z, into the alley
  readonly goalPoint = new THREE.Vector3(-5.6, 5.55, -4.2);

  onGoal: () => void = () => {};
  /** Progress flags the HUD reads. */
  flags = { scratched: false, robotRubbed: false, cansKnocked: 0, reachedBalcony: false, reachedRoof: false };

  private m: Materials;
  private robot!: { head: THREE.Object3D; eyes: THREE.MeshStandardMaterial; awake: number; light: THREE.PointLight };
  private cans: Array<{ body: RigidBody; mesh: THREE.Mesh; knocked: boolean; home: THREE.Vector3 }> = [];
  private steam!: THREE.Points;
  private flicker: Array<{ mat: THREE.MeshStandardMaterial; light?: THREE.PointLight; base: number; seed: number }> = [];

  constructor(private scene: THREE.Scene, private physics: Physics, private interactions: Interactions, private audio: Audio, private cat: () => Cat) {
    this.m = createMaterials();
    scene.add(this.group);
    this.buildLighting();
    this.buildShell();
    this.buildRoute();
    this.buildProps();
    this.buildRobot();
    this.buildGoal();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  /** Static box. (x, z) centre, yBottom, size w×h×d. */
  private solid(x: number, yb: number, z: number, w: number, h: number, d: number, mat: THREE.Material, opts: { rotY?: number; shadow?: boolean; collide?: boolean } = {}) {
    const mesh = new THREE.Mesh(worldUVBox(w, h, d), mat);
    mesh.position.set(x, yb + h / 2, z);
    mesh.rotation.y = opts.rotY ?? 0;
    mesh.castShadow = opts.shadow ?? true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (opts.collide !== false) {
      this.physics.addFixedBox(mesh.position, new THREE.Vector3(w, h, d), opts.rotY ?? 0);
    }
    return mesh;
  }

  private visual(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private point(color: number, intensity: number, dist: number, x: number, y: number, z: number) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    this.group.add(l);
    return l;
  }

  // ───────────────────────────── build ─────────────────────────────

  private buildLighting() {
    this.scene.fog = new THREE.FogExp2(0x0d1421, 0.055);
    this.scene.background = new THREE.Color(0x0d1421);
    this.scene.add(new THREE.HemisphereLight(0x5a7194, 0x1a1410, 0.55));

    const moon = new THREE.DirectionalLight(0x9db8e0, 1.1);
    moon.position.set(-6, 14, 6);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 40;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.02;
    moon.target.position.set(0, 0, -1);
    this.scene.add(moon, moon.target);
  }

  private buildShell() {
    const m = this.m;
    this.solid(0, -0.3, 0, 18, 0.3, 26, m.ground, { shadow: false });
    // Left building — low; its roof is the destination.
    this.solid(-6, 0, -1, 6, 5.2, 18, m.wallA);
    // Right building — tall, unclimbable wall the route clings to.
    this.solid(6, 0, -1, 6, 9.5, 18, m.wallB);
    // Back wall closes the alley.
    this.solid(0, 0, -10.5, 6, 11, 1, m.wallBack);
    // Front fence (thin: never offered as a jump target thanks to the footprint test).
    this.solid(0, 0, 7.8, 6, 2.6, 0.06, m.metal);
    for (let x = -2.75; x <= 2.75; x += 0.5) this.visual(new THREE.BoxGeometry(0.05, 2.6, 0.05), m.metal, x, 1.3, 7.8);

    // Roof props for silhouette.
    this.solid(-7.6, 5.2, 1.5, 1.0, 1.6, 1.0, m.wallA);               // chimney
    this.solid(-7.2, 5.2, -7.5, 1.6, 0.5, 1.6, m.metal);              // tank base
    this.visual(new THREE.CylinderGeometry(0.75, 0.75, 1.6, 20), m.metal, -7.2, 6.5, -7.5);
    this.visual(new THREE.CylinderGeometry(0.02, 0.02, 3, 6), m.metal, -4.2, 6.7, 3.5); // antenna

    // Puddles.
    for (const [x, z, s] of [[0.6, 3.4, 1.4], [-1.2, -3.5, 1.8], [1.4, -7, 1.1]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(s / 2, 24), m.puddle);
      p.rotation.x = -Math.PI / 2;
      p.scale.set(1, 0.6, 1);
      p.position.set(x, 0.004, z);
      p.receiveShadow = true;
      this.group.add(p);
    }

    // Signs + their light.
    const bar = neonSign('TEJBÁR', '#ff4fd8', 2.4, 0.7);
    bar.position.set(0, 4.3, -9.99);
    this.group.add(bar);
    const barLight = this.point(0xff4fd8, 6, 9, 0, 4.0, -9.2);
    this.flicker.push({ mat: bar.material as THREE.MeshStandardMaterial, light: barLight, base: 2.2, seed: 1 });

    // Street lamp near spawn.
    this.visual(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 8), m.metal, 2.75, 1.7, 6.8);
    const bulb = this.visual(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ emissive: 0xffc58a, emissiveIntensity: 3, color: 0 }), 2.45, 3.35, 6.8);
    bulb.castShadow = false;
    this.point(0xffb36b, 5, 8, 2.4, 3.2, 6.8);
  }

  private buildRoute() {
    const m = this.m;
    // 1–2: crates.
    this.solid(1.9, 0, 4.2, 0.7, 0.55, 0.7, m.wood, { rotY: 0.12 });
    this.solid(2.35, 0, 3.0, 0.9, 1.15, 0.9, m.wood);
    // 3: AC unit on the right wall + brackets.
    this.solid(2.6, 1.95, 1.5, 0.8, 0.55, 1.0, m.metal);
    this.visual(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x222 }), 2.19, 2.22, 1.5).rotation.z = Math.PI / 2;
    for (const z of [1.15, 1.85]) this.visual(new THREE.BoxGeometry(0.6, 0.05, 0.05), m.metal, 2.7, 1.9, z);

    // 4: balcony with railing, door glow.
    this.solid(2.2, 3.15, -1.9, 1.6, 0.15, 2.4, m.metal);
    this.solid(1.42, 3.3, -1.9, 0.04, 0.55, 2.4, m.metal, { shadow: true });     // rail (collides)
    this.solid(2.2, 3.3, -3.08, 1.6, 0.55, 0.04, m.metal);                       // rail end
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa860, emissiveIntensity: 1.4 }));
    door.position.set(2.995, 3.3 + 0.95, -2.2);
    door.rotation.y = -Math.PI / 2;
    this.group.add(door);
    this.point(0xffa860, 4, 5, 2.5, 4.2, -2.2);

    // 5: hanging sign over the alley (cables are visual).
    const sign = this.solid(0.1, 3.55, -1.9, 0.9, 0.3, 0.7, m.metal);
    sign.castShadow = true;
    for (const x of [-0.25, 0.45]) this.visual(new THREE.CylinderGeometry(0.01, 0.01, 3, 4), m.metal, x, 5.35, -1.9);
    for (const side of [1, -1]) {
      const n = neonSign('NYITVA', '#3ff2ff', 0.8, 0.24);
      n.position.set(0.1, 3.7, -1.9 + side * 0.352);
      if (side < 0) n.rotation.y = Math.PI;
      this.group.add(n);
      this.flicker.push({ mat: n.material as THREE.MeshStandardMaterial, base: 2.2, seed: 7 + side });
    }
    this.point(0x3ff2ff, 3, 5, 0.1, 3.3, -1.0);

    // 6: ledge on the left building.
    this.solid(-2.65, 4.15, -2.2, 0.7, 0.2, 2.2, m.wallA);
    // Vertical pipes on the right wall (visual + thin colliders).
    for (const z of [0.4, -4.6]) this.solid(2.93, 0, z, 0.12, 9, 0.12, m.metal);
  }

  private buildProps() {
    const m = this.m;
    // Dumpster with lid — also a jumpable surface.
    this.solid(-2.1, 0, -6.2, 1.5, 1.05, 0.9, m.dumpster);
    this.solid(-2.1, 1.05, -6.2, 1.55, 0.06, 0.95, m.dumpster);
    // Cardboard boxes.
    this.solid(1.6, 0, -6.6, 0.6, 0.45, 0.5, m.wood, { rotY: -0.3 });
    this.solid(2.3, 0, -8.6, 0.9, 0.9, 0.9, m.wood);

    // Scratchable carpet roll leaning on the left wall.
    const roll = this.visual(new THREE.CylinderGeometry(0.17, 0.17, 1.15, 16), m.fabric, -2.75, 0.58, 4.6);
    roll.rotation.z = 0.08;
    this.physics.addFixedBox(new THREE.Vector3(-2.75, 0.58, 4.6), new THREE.Vector3(0.34, 1.15, 0.34));
    this.interactions.add({
      id: 'scratch', label: 'Karmolás', radius: 0.75,
      position: () => new THREE.Vector3(-2.75, 0, 4.6),
      onInteract: () => {
        const c = this.cat();
        c.yaw = Math.atan2(-2.75 - c.feet.x, 4.6 - c.feet.z);
        c.doScratch();
        this.flags.scratched = true;
      },
    });

    // Paint cans on the balcony lip — knockable, Stray's signature cat crime.
    const canMat = [0xd14b3a, 0xe0b23a, 0x3a8fd1].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.6 }));
    const canPos = [[1.58, -0.8], [1.82, -0.78], [2.76, -0.8]];
    const edgeOut = new THREE.Vector3(0, 0, 1); // the balcony's open lip
    canPos.forEach(([x, z], i) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 14), canMat[i]);
      mesh.position.set(x, 3.3 + 0.1, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      const body = this.physics.addDynamic(mesh, RAPIER.ColliderDesc.cylinder(0.1, 0.08).setFriction(0.6).setRestitution(0.3), { mass: 0.4 });
      const can = { body, mesh, knocked: false, home: mesh.position.clone() };
      this.cans.push(can);
      this.interactions.add({
        id: 'can' + i, label: 'Lelökés', radius: 0.55, heightBand: [-0.2, 0.5],
        position: () => mesh.position,
        enabled: () => !can.knocked,
        onInteract: () => {
          const c = this.cat();
          c.yaw = Math.atan2(mesh.position.x - c.feet.x, mesh.position.z - c.feet.z);
          c.doSwipe();
          // Swipe away from the cat, biased over the open edge (cats know where edges are).
          const f = mesh.position.clone().sub(c.feet).setY(0).normalize().add(edgeOut).normalize();
          setTimeout(() => {
            body.applyImpulse({ x: f.x * 0.9, y: 0.35, z: f.z * 0.9 }, true);
            body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.02, y: 0, z: (Math.random() - 0.5) * 0.02 }, true);
          }, 140);
        },
      });
    });

    // Pushable trash on the ground (the KCC applies impulses to dynamic bodies).
    const trashMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.3 });
    for (const [x, z] of [[-1.2, -6.5], [-1.5, -5.3], [0.9, 5.2]]) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), trashMat);
      mesh.scale.set(1, 0.8, 1);
      mesh.position.set(x, 0.2, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.physics.addDynamic(mesh, RAPIER.ColliderDesc.ball(0.19).setFriction(0.9), { mass: 0.8 });
    }
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), canMat[i % 3]);
      mesh.position.set(-0.6 + i * 0.25, 0.06, 5.0 - i * 0.18);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.physics.addDynamic(mesh, RAPIER.ColliderDesc.cylinder(0.06, 0.035).setRestitution(0.4), { mass: 0.05 });
    }
  }

  private buildRobot() {
    const m = this.m;
    const g = new THREE.Group();
    g.position.set(-2.45, 0, 1.0);
    g.rotation.y = Math.PI / 2;
    this.group.add(g);
    const body = new THREE.Mesh(worldUVBox(0.55, 0.7, 0.4), m.robot);
    body.position.y = 0.35;
    const head = new THREE.Group();
    head.position.y = 0.88;
    const skull = new THREE.Mesh(worldUVBox(0.42, 0.3, 0.32), m.robot);
    const eyes = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3ff2ff, emissiveIntensity: 0 });
    for (const x of [-0.09, 0.09]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), eyes);
      e.position.set(x, 0.02, 0.161);
      head.add(e);
    }
    head.add(skull);
    head.rotation.x = 0.5; // slumped
    g.add(body, head);
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.physics.addFixedBox(new THREE.Vector3(-2.45, 0.5, 1.0), new THREE.Vector3(0.4, 1.0, 0.55));
    const light = this.point(0x3ff2ff, 0, 2.5, -2.1, 0.9, 1.0);
    this.robot = { head, eyes, awake: 0, light };

    this.interactions.add({
      id: 'robot', label: 'Dörgölőzés', radius: 0.85,
      position: () => new THREE.Vector3(-2.2, 0, 1.0),
      enabled: () => this.robot.awake > 0,
      onInteract: () => {
        this.flags.robotRubbed = true;
        this.robot.awake = 8;
        this.audio.purr(1.6);
        this.audio.beep(true);
      },
    });
  }

  private buildGoal() {
    const m = this.m;
    const [x, , z] = this.goalPoint.toArray();
    this.solid(x, 5.2, z, 0.85, 0.35, 0.85, m.goal);
    // Grille on top.
    for (let i = -3; i <= 3; i++) this.visual(new THREE.BoxGeometry(0.02, 0.01, 0.7), m.metal, x + i * 0.1, 5.556, z).castShadow = false;
    const warm = this.point(0xff9a4a, 6, 4, x, 5.9, z);
    this.flicker.push({ mat: new THREE.MeshStandardMaterial(), light: warm, base: 6, seed: 3 });

    // Steam.
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x + (Math.random() - 0.5) * 0.6;
      pos[i * 3 + 1] = 5.6 + Math.random() * 1.6;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const puff = document.createElement('canvas');
    puff.width = puff.height = 64;
    const pg = puff.getContext('2d')!;
    const grad = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = grad;
    pg.fillRect(0, 0, 64, 64);
    this.steam = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffd2b0, size: 0.35, map: new THREE.CanvasTexture(puff), transparent: true, opacity: 0.12, depthWrite: false,
    }));
    this.group.add(this.steam);

    this.interactions.add({
      id: 'nap', label: 'Szundi', radius: 0.5, heightBand: [-0.2, 0.2],
      position: () => this.goalPoint,
      onInteract: () => {
        const c = this.cat();
        c.doNap();
        setTimeout(() => this.onGoal(), 2600);
      },
    });
  }

  // ───────────────────────────── runtime ─────────────────────────────

  /** Called when the cat meows: anything listening reacts. */
  meow(from: THREE.Vector3) {
    const robotPos = new THREE.Vector3(-2.45, 0.9, 1.0);
    if (from.distanceTo(robotPos) < 4.5) {
      if (this.robot.awake <= 0) this.audio.beep(true);
      this.robot.awake = 8;
    }
  }

  update(dt: number, time: number) {
    const cat = this.cat();

    // Robot: wake → look at the cat → doze off again.
    const r = this.robot;
    const wasAwake = r.awake > 0;
    r.awake = Math.max(0, r.awake - dt);
    if (wasAwake && r.awake === 0) this.audio.beep(false);
    const on = r.awake > 0 ? 1 : 0;
    r.eyes.emissiveIntensity += (on * 3 - r.eyes.emissiveIntensity) * Math.min(1, dt * 4);
    r.light.intensity = r.eyes.emissiveIntensity * 0.6;
    if (on) {
      const local = r.head.parent!.worldToLocal(cat.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)));
      const yaw = Math.atan2(local.x, local.z);
      const pitch = -Math.atan2(local.y - r.head.position.y, Math.hypot(local.x, local.z));
      r.head.rotation.y += (THREE.MathUtils.clamp(yaw, -1.2, 1.2) - r.head.rotation.y) * Math.min(1, dt * 5);
      r.head.rotation.x += (THREE.MathUtils.clamp(pitch, -0.4, 0.6) - r.head.rotation.x) * Math.min(1, dt * 5);
    } else {
      r.head.rotation.x += (0.5 - r.head.rotation.x) * Math.min(1, dt * 1.5);
      r.head.rotation.y += (0 - r.head.rotation.y) * Math.min(1, dt * 1.5);
    }

    // Cans: count the ones that left the balcony.
    for (const c of this.cans) {
      if (!c.knocked && c.mesh.position.y < 3.0) {
        c.knocked = true;
        this.flags.cansKnocked++;
      }
      if (c.knocked && c.mesh.position.y < 0.3 && !(c as any).clanked) {
        (c as any).clanked = true;
        this.audio.clank();
      }
    }

    // Progress flags for objectives.
    if (cat.feet.y > 3.2 && cat.feet.x > 1.3) this.flags.reachedBalcony = true;
    if (cat.feet.y > 5.0) this.flags.reachedRoof = true;

    // Neon flicker.
    for (const f of this.flicker) {
      const n = Math.sin(time * 13 + f.seed) * Math.sin(time * 7.3 + f.seed * 2);
      const drop = n > 0.93 ? 0.25 : 1;
      f.mat.emissiveIntensity = f.base * drop;
      if (f.light) f.light.userData.base ??= f.light.intensity;
      if (f.light) f.light.intensity = f.light.userData.base * (drop < 1 ? 0.4 : 1) * (1 + Math.sin(time * 3 + f.seed) * 0.05);
    }

    // Steam drift.
    const p = this.steam.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * (0.35 + (i % 7) * 0.04);
      let x = p.getX(i) + Math.sin(time + i) * dt * 0.05;
      let z = p.getZ(i);
      if (y > 7.3) {
        y = 5.6;
        x = this.goalPoint.x + (Math.random() - 0.5) * 0.6;
        z = this.goalPoint.z + (Math.random() - 0.5) * 0.6;
      }
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  /** Reset the dynamic bits for a replay. */
  reset() {
    for (const c of this.cans) {
      c.body.setTranslation(c.home, true);
      c.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      c.knocked = false;
      (c as any).clanked = false;
    }
    this.flags = { scratched: false, robotRubbed: false, cansKnocked: 0, reachedBalcony: false, reachedRoof: false };
  }
}
