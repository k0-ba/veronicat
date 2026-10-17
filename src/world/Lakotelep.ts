import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { Interactions } from '../gameplay/Interactions';
import type { Audio } from '../core/Audio';
import type { Cat } from '../player/Cat';
import type { GameLevel, EndSummary } from './types';
import { worldUVBox } from './materials';
import { panelTexture, asphaltTexture, corrugatedTexture, catSign, graffiti, panelBlock, streetLamp, tree, bus } from './props';
import { Human } from '../npc/Human';
import { Script } from '../story/Script';
import type { Dialogue } from '../story/Dialogue';

/**
 * Vertical slice v0.2 — Csillag-lakótelep, 20:40.
 * NARRATIVA.md chapters 1–3 compressed: Üres ablak → Garázssor → Buszmegálló (Gábor).
 * See docs/VERTICAL_SLICE.md for the beat list. Coordinates in metres:
 *   +x east, +z south. Panel 7 (Bori) is north, panel 4 (Gábor) south across the street.
 */

type Stage = 'intro' | 'descend' | 'courtyard' | 'garage' | 'toStop' | 'gabor' | 'escort' | 'toUnderpass' | 'end';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Key places.
const BORI_BALCONY = { x0: -5.7, x1: -3.3, y: 6 };
const NEIGHBOUR_BALCONY = { x0: -2.5, x1: -0.5, y: 6 };
const LOW_BALCONY = { x0: 0.3, x1: 2.7, y: 3 };
const FACADE_Z = -14;
const ENCLOSURE = { x0: 2, x1: 6, z0: -11.6, z1: -9.4, h: 1.9 };
const SIGN1 = V(4, 1.1, ENCLOSURE.z1 + 0.02);
const GARAGE = { x0: 16, x1: 21, z0: -12, z1: 12, h: 2.6, openZ0: -3, openZ1: 0 };
const VENT = V(18.5, GARAGE.h, -1.5);
const DRUM = V(15.3, 0, 1.6);
const SIGN2 = V(18.5, 1.3, GARAGE.z1 + 0.02);
const STOP = { x0: 6, x1: 10, z0: 12.4, z1: 13.9 };
const GABOR_DOOR = V(1.5, 0, 21.3);
const PIT = { x0: -16, x1: -13, z0: 7, z1: 12 };
const SIGN3 = V(PIT.x0 + 0.02, 0.55, 8.2);
const ILONKA_WIN = V(-13.5, 0, FACADE_Z);

export class Lakotelep implements GameLevel {
  readonly group = new THREE.Group();
  readonly spawn = V(-4.5, BORI_BALCONY.y, FACADE_Z + 0.55);
  readonly spawnYaw = Math.PI / 2; // looking east along the balcony
  onGoal: (s?: EndSummary) => void = () => {};

  stage: Stage = 'intro';
  flags = {
    ilonka: false, ilonkaAte: false, sign1: false, overheard: false, keychain: false,
    sign2: false, busArrived: false, gaborNoticed: false, gaborRubbed: false, milk: false, gaborHome: false,
  };

  private script: Script;
  private mats = {
    panel: new THREE.MeshStandardMaterial({ name: 'panel_concrete', color: 0x9c9a94, roughness: 0.92, map: panelTexture() }),
    panel4: new THREE.MeshStandardMaterial({ name: 'panel_concrete_b', color: 0x8f9693, roughness: 0.92, map: panelTexture() }),
    asphalt: new THREE.MeshStandardMaterial({ name: 'asphalt_wet', color: 0x55585e, roughness: 0.32, metalness: 0.15, map: asphaltTexture() }),
    road: new THREE.MeshStandardMaterial({ name: 'road_wet', color: 0x3a3d42, roughness: 0.22, metalness: 0.2, map: asphaltTexture() }),
    pavement: new THREE.MeshStandardMaterial({ name: 'pavement', color: 0x6d6c68, roughness: 0.55, map: asphaltTexture() }),
    grass: new THREE.MeshStandardMaterial({ name: 'grass_mud', color: 0x2c3326, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ name: 'concrete', color: 0x8a8780, roughness: 0.9, map: panelTexture() }),
    metal: new THREE.MeshStandardMaterial({ name: 'metal_rusty', color: 0x5d5a52, roughness: 0.6, metalness: 0.5 }),
    garage: new THREE.MeshStandardMaterial({ name: 'garage_tin', color: 0x7b7f73, roughness: 0.55, metalness: 0.45, map: corrugatedTexture() }),
    brick: new THREE.MeshStandardMaterial({ name: 'garage_brick', color: 0x7a5a4a, roughness: 0.95, map: panelTexture() }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass_dirty', color: 0x9fb5c0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.22 }),
    dumpster: new THREE.MeshStandardMaterial({ name: 'dumpster', color: 0x3b5c45, roughness: 0.55, metalness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 }),
  };

  private borisWindow!: THREE.Mesh;
  private boriLit!: THREE.Texture;
  private boriDark!: THREE.Texture;
  private ilonkaWindow!: THREE.Mesh;
  private ilonka!: Human;
  private ilonkaFood!: THREE.Object3D;
  private boys: Human[] = [];
  private speakerLed!: THREE.MeshBasicMaterial;
  private keychain!: THREE.Object3D;
  private gabor!: Human;
  private milkCap!: THREE.Object3D;
  private busObj!: { group: THREE.Group; light: THREE.PointLight };
  private busState: 'away' | 'arriving' | 'stopped' | 'leaving' = 'away';
  private busT = 0;
  private signs: THREE.Object3D[] = [];
  private shooCooldown = 0;
  private underpassLight!: THREE.PointLight;

  constructor(
    private scene: THREE.Scene, private physics: Physics, private interactions: Interactions,
    private audio: Audio, private cat: () => Cat, private dialogue: Dialogue,
  ) {
    this.script = new Script(dialogue);
    scene.add(this.group);
    this.buildAtmosphere();
    this.buildGround();
    this.buildPanel7();
    this.buildCourtyard();
    this.buildGarages();
    this.buildStreet();
    this.buildPanel4();
    this.buildUnderpass();
    this.buildSkyline();
    this.buildPeople();
    this.buildInteractions();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, opts: { collide?: boolean; shadow?: boolean } = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const m = new THREE.Mesh(worldUVBox(w, h, d), mat);
    m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    m.castShadow = opts.shadow ?? true;
    m.receiveShadow = true;
    this.group.add(m);
    if (opts.collide !== false) this.physics.addFixedBox(m.position, new THREE.Vector3(w, h, d));
    return m;
  }

  private wall(x0: number, z0: number, x1: number, z1: number, h: number) {
    // Invisible boundary.
    const c = V((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    this.physics.addFixedBox(c, V(Math.max(0.2, x1 - x0), h, Math.max(0.2, z1 - z0)));
  }

  private add(o: THREE.Object3D) { this.group.add(o); return o; }

  // ───────────────────────────── build ─────────────────────────────

  private buildAtmosphere() {
    this.scene.fog = new THREE.FogExp2(0x101826, 0.032);
    this.scene.background = new THREE.Color(0x0f1724);
    this.scene.add(new THREE.HemisphereLight(0x50638a, 0x1c1812, 0.7));
    const moon = new THREE.DirectionalLight(0x8aa4cc, 0.9);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    moon.userData.follow = true;
    this.scene.add(moon, moon.target);
    this.moon = moon;
  }
  private moon!: THREE.DirectionalLight;

  private buildGround() {
    const m = this.mats;
    // Ground in four pieces around the underpass pit.
    this.box(-60, -0.3, -45, 60, 0, PIT.z0, m.asphalt, { shadow: false });
    this.box(-60, -0.3, PIT.z1, 60, 0, 55, m.asphalt, { shadow: false });
    this.box(-60, -0.3, PIT.z0, PIT.x0, 0, PIT.z1, m.asphalt, { shadow: false });
    this.box(PIT.x1, -0.3, PIT.z0, 60, 0, PIT.z1, m.asphalt, { shadow: false });
    // Visual layers: pavement, road, grass patches (no collision, a hair above ground).
    const flat = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, y = 0.005) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
      p.rotation.x = -Math.PI / 2;
      p.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      p.receiveShadow = true;
      // World-scale UVs for the shared textures.
      const uv = p.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * (z1 - z0));
      return this.add(p);
    };
    flat(-60, 14, 60, 20, m.road, 0.006);
    flat(-60, 12, PIT.x0, 14, m.pavement);
    flat(PIT.x1, 12, 60, 14, m.pavement);
    flat(-60, 20, 60, 22, m.pavement);
    flat(-22, -8, -8, 4, m.grass, 0.008);
    flat(8, 0, 14, 9, m.grass, 0.008);
    // Lane markings + zebra crossing (Gábor's way home).
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 });
    for (let x = -58; x < 60; x += 6) flat(x, 16.92, x + 3, 17.08, paint, 0.009);
    for (let z = 14.3; z < 19.8; z += 0.9) flat(0.6, z, 2.6, z + 0.45, paint, 0.009);
    // Puddles reflect the sodium lamps.
    const puddle = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.03, metalness: 0.95 });
    for (const [x, z, s] of [[3, -6, 2.2], [-6, 0, 1.6], [12, -2, 1.8], [8, 15.5, 2.4], [-3, 18, 2], [14, 10, 1.4], [-11, 9, 1.6]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(s / 2, 28), puddle);
      p.rotation.x = -Math.PI / 2;
      p.scale.set(1, 0.6, 1);
      p.position.set(x, 0.011, z);
      this.add(p);
    }
  }

  private buildPanel7() {
    const m = this.mats;
    // Columns: x = -22.5 + 3c. Bori's window: floor 2, c = 6 (x -4.5). Ilonka: floor 0, c = 3.
    const block = panelBlock({
      x0: -24, x1: 12, z0: -26, z1: FACADE_Z, floors: 5, faces: ['s'], material: m.panel,
      skip: (_f, floor, c) => (floor === 2 && c === 6) || (floor === 0 && c === 3) || (floor === 0 && c === 10),
    });
    this.add(block.group);
    this.physics.addFixedBox(V(-6, block.height / 2, -20), V(36, block.height, 12));

    // Bori's window (lit with Judit's silhouette → dark).
    this.boriLit = windowTexture('#ffb866', 'phone');
    this.boriDark = windowTexture('#141a24', null);
    this.borisWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.35), new THREE.MeshBasicMaterial({ map: this.boriLit }));
    this.borisWindow.position.set(-4.5, 6 + 1.55, FACADE_Z + 0.02);
    this.add(this.borisWindow);

    // Ilonka's ground-floor window + sill.
    this.ilonkaWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.35), new THREE.MeshBasicMaterial({ map: windowTexture('#ffcf8a', 'curtain') }));
    this.ilonkaWindow.position.set(ILONKA_WIN.x, 1.55, FACADE_Z + 0.02);
    this.add(this.ilonkaWindow);
    this.box(-14.3, 0, FACADE_Z, -12.7, 0.9, FACADE_Z + 0.42, m.concrete);

    // Balconies (route): slab + railings. Railing colliders only where the route must not pass.
    const balcony = (x0: number, x1: number, y: number, rails: { w?: boolean; e?: boolean; front?: boolean }) => {
      const d = 1.25;
      this.box(x0, y - 0.15, FACADE_Z, x1, y, FACADE_Z + d, m.concrete);
      const railMat = m.metal;
      const zf = FACADE_Z + d - 0.04;
      if (rails.front !== false) this.box(x0, y, zf, x1, y + 0.95, zf + 0.04, railMat);
      if (rails.w) this.box(x0, y, FACADE_Z, x0 + 0.04, y + 0.95, FACADE_Z + d, railMat);
      if (rails.e) this.box(x1 - 0.04, y, FACADE_Z, x1, y + 0.95, FACADE_Z + d, railMat);
      // Hanging laundry / flower box flavour.
      return d;
    };
    balcony(BORI_BALCONY.x0, BORI_BALCONY.x1, BORI_BALCONY.y, { w: true });
    balcony(NEIGHBOUR_BALCONY.x0, NEIGHBOUR_BALCONY.x1, NEIGHBOUR_BALCONY.y, {});
    balcony(LOW_BALCONY.x0, LOW_BALCONY.x1, LOW_BALCONY.y, { e: true, front: false });
    // Flower box on the low balcony's open edge (visual hint: you can go here).
    this.box(LOW_BALCONY.x0 + 0.2, LOW_BALCONY.y, FACADE_Z + 1.12, LOW_BALCONY.x0 + 0.9, LOW_BALCONY.y + 0.18, FACADE_Z + 1.25, m.brick, { collide: false });
    // Decorative balconies elsewhere (no colliders; out of reach).
    for (const [c, f] of [[1, 1], [2, 3], [4, 2], [8, 4], [10, 2], [11, 3], [3, 4], [9, 1]]) {
      const x = -22.5 + c * 3;
      this.box(x - 1.2, f * 3 - 0.15, FACADE_Z, x + 1.2, f * 3, FACADE_Z + 1.2, m.concrete, { collide: false });
      this.box(x - 1.2, f * 3, FACADE_Z + 1.16, x + 1.2, f * 3 + 0.95, FACADE_Z + 1.2, m.metal, { collide: false });
    }
    // Laundry on Bori's neighbour's line.
    const cloth = [0xb84a4a, 0xe8e2d0, 0x4a6ab8];
    cloth.forEach((c, i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 1 }));
      p.position.set(-2.2 + i * 0.5, 6 + 1.65, FACADE_Z + 0.9);
      this.add(p);
    });
    // Stairwell door with a canopy (c = 10).
    this.box(6.3, 2.6, FACADE_Z, 8.7, 2.75, FACADE_Z + 1.3, m.concrete);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshBasicMaterial({ color: 0x3a3420 }));
    door.position.set(7.5, 1.1, FACADE_Z + 0.02);
    this.add(door);
    // Sign: house number.
    const num = graffiti('7', '#e8e2d0', 0.6, 0.6);
    num.position.set(9.2, 2.3, FACADE_Z + 0.03);
    this.add(num);
  }

  private buildCourtyard() {
    const m = this.mats;
    // Trash enclosure (kukatároló) — the route's last step down, and sign #1.
    const e = ENCLOSURE;
    this.box(e.x0, 0, e.z0, e.x1, e.h - 0.12, e.z0 + 0.15, m.concrete);
    this.box(e.x0, 0, e.z0, e.x0 + 0.15, e.h - 0.12, e.z1, m.concrete);
    this.box(e.x1 - 0.15, 0, e.z0, e.x1, e.h - 0.12, e.z1, m.concrete);
    this.box(e.x0, 0, e.z1 - 0.15, e.x0 + 1.2, e.h - 0.12, e.z1, m.concrete);
    this.box(e.x1 - 1.2, 0, e.z1 - 0.15, e.x1, e.h - 0.12, e.z1, m.concrete);
    this.box(e.x0 - 0.1, e.h - 0.12, e.z0 - 0.1, e.x1 + 0.1, e.h, e.z1 + 0.1, m.concrete);
    for (const x of [2.7, 3.9, 5.1]) this.box(x - 0.45, 0, -11.3, x + 0.45, 1.15, -10.4, m.dumpster, { collide: false });
    const s1 = catSign(-0.6, true);
    s1.position.copy(SIGN1);
    this.add(s1);
    this.signs.push(s1);
    const tag = graffiti('CSILLAG', '#7ad0ff', 1.6, 0.5);
    tag.position.set(e.x0 - 0.02, 1.2, -10.5);
    tag.rotation.y = -Math.PI / 2;
    this.add(tag);

    // Playground: climbing frame (optional platforming), carpet beater, benches.
    const px = -10, pz = -3;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      this.box(px + dx - 0.05, 0, pz + dz - 0.05, px + dx + 0.05, 1.6, pz + dz + 0.05, m.metal);
    }
    this.box(px - 0.85, 1.48, pz - 0.85, px + 0.85, 1.6, pz + 0.85, new THREE.MeshStandardMaterial({ color: 0xa04030, roughness: 0.7 }));
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a6aa0, roughness: 0.4 }));
    slide.position.set(px + 1.6, 0.8, pz);
    slide.rotation.set(0, Math.PI / 2, 0);
    slide.rotateX(-0.6);
    this.add(slide);
    // Poroló (carpet beater) — iconic courtyard silhouette.
    this.box(-15.05, 0, 1.95, -14.95, 1.7, 2.05, m.metal);
    this.box(-12.05, 0, 1.95, -11.95, 1.7, 2.05, m.metal);
    this.box(-15.05, 1.62, 1.97, -11.95, 1.7, 2.03, m.metal, { collide: false });
    // Benches.
    const bench = (x: number, z: number, rot = 0) => {
      const w = rot ? 0.5 : 1.8, d = rot ? 1.8 : 0.5;
      this.box(x - w / 2, 0.38, z - d / 2, x + w / 2, 0.45, z + d / 2, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 }));
      this.box(x - w / 2 + 0.1, 0, z - d / 2 + 0.1, x - w / 2 + 0.2, 0.38, z + d / 2 - 0.1, m.metal, { collide: false });
      this.box(x + w / 2 - 0.2, 0, z - d / 2 + 0.1, x + w / 2 - 0.1, 0.38, z + d / 2 - 0.1, m.metal, { collide: false });
    };
    bench(-6, 1.5);
    bench(-2.5, 1.5);
    bench(9, 4, 1);
    // Trees.
    for (const [x, z, s] of [[-19, -5, 1.1], [-3, -6, 0.9], [-17, 3, 1.2], [11, 7, 1], [-6, 6, 0.8], [13, -9, 0.9]]) this.add(tree(x, z, s));
    // Lamps.
    const lamps: Array<[number, number, THREE.Vector3]> = [[0, -7, V(1, 0, 0)], [-11, -5, V(1, 0, 0)], [12.6, -4, V(1, 0, 0)]];
    for (const [x, z, d] of lamps) this.add(streetLamp(x, z, d).group);
    // Boundaries: west fence, north-east fence.
    this.box(-24.05, 0, -14, -23.95, 1.6, 12, m.metal);
    for (let z = -13.5; z < 12; z += 0.6) this.box(-24.1, 0, z, -23.9, 1.7, z + 0.05, m.metal, { collide: false });
    this.box(12, 0, -14.1, 22, 2, -13.9, m.brick);
  }

  private buildGarages() {
    const m = this.mats;
    const g = GARAGE;
    // Solid blocks either side of the open garage.
    this.box(g.x0, 0, g.z0, g.x1, g.h, g.openZ0, m.brick);
    this.box(g.x0, 0, g.openZ1, g.x1, g.h, g.z1, m.brick);
    // Open garage: back wall + roof.
    this.box(g.x1 - 0.2, 0, g.openZ0, g.x1, g.h, g.openZ1, m.brick);
    this.box(g.x0, g.h - 0.2, g.openZ0, g.x1, g.h, g.openZ1, m.brick);
    // Tin roof skin + doors.
    const roofSkin = new THREE.Mesh(new THREE.PlaneGeometry(g.x1 - g.x0 + 0.3, g.z1 - g.z0), m.garage);
    roofSkin.rotation.x = -Math.PI / 2;
    roofSkin.position.set((g.x0 + g.x1) / 2 - 0.15, g.h + 0.01, (g.z0 + g.z1) / 2);
    roofSkin.receiveShadow = true;
    this.add(roofSkin);
    const tags = ['ROBI', 'FTC', 'K+D', '', 'NO FUTURE', '', 'DANI', 'X'];
    for (let k = 0; k < 8; k++) {
      const z0 = g.z0 + k * 3;
      if (z0 === g.openZ0) continue;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.1), m.garage);
      door.position.set(g.x0 - 0.01, 1.05, z0 + 1.5);
      door.rotation.y = -Math.PI / 2;
      this.add(door);
      if (tags[k]) {
        const t = graffiti(tags[k], ['#ff5a5a', '#9cff6a', '#ff9de0', '#6ad8ff'][k % 4], 2.2, 0.7);
        t.position.set(g.x0 - 0.02, 1.0, z0 + 1.5);
        t.rotation.y = -Math.PI / 2;
        this.add(t);
      }
    }
    // Rolled-up door of the open one.
    this.box(g.x0, g.h - 0.45, g.openZ0 + 0.2, g.x0 + 0.25, g.h - 0.2, g.openZ1 - 0.2, m.garage, { collide: false });
    // Inside: table, speaker, crate, cold tube light.
    this.box(19.4, 0, -2.4, 20.6, 0.75, -1.4, new THREE.MeshStandardMaterial({ color: 0x5a4a3a }), { collide: false });
    const spk = this.box(19.6, 0.75, -2.2, 20.0, 1.15, -1.9, new THREE.MeshStandardMaterial({ color: 0x15161a }), { collide: false });
    this.speakerLed = new THREE.MeshBasicMaterial({ color: 0x40ffb0 });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14), this.speakerLed);
    led.position.set(-0.21, 0.02, 0);
    led.rotation.y = -Math.PI / 2;
    spk.add(led);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.4), new THREE.MeshBasicMaterial({ color: 0xd8f0ff }));
    tube.position.set(19, g.h - 0.25, -1.5);
    this.add(tube);
    const inside = new THREE.PointLight(0xc8e4ff, 9, 9, 1.6);
    inside.position.set(18.6, 2.1, -1.5);
    this.add(inside);
    // Roof vent above the boys: overhearing spot.
    this.box(VENT.x - 0.3, g.h, VENT.z - 0.3, VENT.x + 0.3, g.h + 0.32, VENT.z + 0.3, m.metal);
    // Container to climb onto the roofs.
    this.box(13.6, 0, -13.6, 15.4, 1.4, -12.2, m.dumpster);
    // Oil drum with Dani's keychain.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x2f4d7a, roughness: 0.5, metalness: 0.5 }));
    drum.position.set(DRUM.x, 0.45, DRUM.z);
    drum.castShadow = true;
    this.add(drum);
    this.physics.addFixedBox(V(DRUM.x, 0.45, DRUM.z), V(0.56, 0.9, 0.56));
    this.keychain = keychainMesh();
    this.keychain.position.set(DRUM.x, 0.92, DRUM.z);
    this.add(this.keychain);
    // Sign #2 at the row's south end, arrow → west (bus stop).
    const s2 = catSign(Math.PI, true);
    s2.position.copy(SIGN2);
    this.add(s2);
    this.signs.push(s2);
    // East fence behind garages.
    this.box(21.9, 0, -14, 22.1, 2.2, 12, m.metal);
  }

  private buildStreet() {
    const m = this.mats;
    // Bus shelter.
    const s = STOP;
    const glassBack = this.box(s.x0, 0, s.z0, s.x1, 2.3, s.z0 + 0.05, m.glass, { shadow: false });
    glassBack.renderOrder = 2;
    this.box(s.x0, 0, s.z0, s.x0 + 0.05, 2.3, s.z1, m.glass, { shadow: false });
    for (const x of [s.x0, s.x1 - 0.06]) this.box(x, 0, s.z0, x + 0.06, 2.3, s.z0 + 0.06, m.metal, { collide: false });
    this.box(s.x0 - 0.1, 2.3, s.z0 - 0.1, s.x1 + 0.1, 2.42, s.z1 + 0.1, m.metal);
    this.box(7, 0.4, 12.55, 9, 0.47, 12.95, new THREE.MeshStandardMaterial({ color: 0x5a3a2a }));
    this.box(10.4, 0, 12.6, 10.9, 0.85, 13.1, m.dumpster); // bin → roof shortcut
    const stopSign = graffiti('17 · CSILLAG TÉR', '#f4e4a0', 1.6, 0.35);
    stopSign.position.set(8, 2.1, s.z0 + 0.07);
    this.add(stopSign);
    const shelterLight = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: 0xe8f4ff }));
    shelterLight.position.set(8, 2.28, 13.2);
    this.add(shelterLight);
    // Street lamps over the road.
    for (const x of [11.5, -8, 26]) this.add(streetLamp(x, 12.6, V(0, 0, 1), { light: x !== 26 }).group);
    // Bus.
    this.busObj = bus();
    this.busObj.group.rotation.y = Math.PI; // heading −x, door side north
    this.busObj.group.position.set(60, 0, 15.6);
    this.busObj.group.visible = false;
    this.add(this.busObj.group);
    // Street boundaries (invisible).
    this.wall(-26, 12, -25.8, 22, 4);
    this.wall(32, 12, 32.2, 22, 4);
    this.box(12, 0, 22.4, 32, 2, 22.6, m.brick);
  }

  private buildPanel4() {
    const m = this.mats;
    const block = panelBlock({
      x0: -24, x1: 12, z0: 22, z1: 34, floors: 5, faces: ['n'], material: m.panel4, litChance: 0.34,
      skip: (_f, floor, c) => floor === 0 && c === 8,
    });
    this.add(block.group);
    this.physics.addFixedBox(V(-6, block.height / 2, 28), V(36, block.height, 12));
    // Gábor's entrance (c = 8 → x 1.5) with canopy and warm door light.
    this.box(0.2, 2.5, 21, 2.8, 2.65, 22, m.concrete);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), new THREE.MeshBasicMaterial({ color: 0x6a5a3a }));
    door.position.set(1.5, 1.1, 21.98);
    door.rotation.y = Math.PI;
    this.add(door);
    const doorLight = new THREE.PointLight(0xffc27a, 5, 6, 1.6);
    doorLight.position.set(1.5, 2.3, 21.4);
    this.add(doorLight);
    const num = graffiti('4', '#e8e2d0', 0.6, 0.6);
    num.position.set(3.3, 2.3, 21.97);
    num.rotation.y = Math.PI;
    this.add(num);
    this.add(tree(-10, 21, 0.9));
  }

  private buildUnderpass() {
    const m = this.mats;
    const p = PIT;
    // Pit walls (go below ground) with low parapets.
    this.box(p.x0 - 0.25, -3.3, p.z0, p.x0, 0.9, 20, m.concrete);
    this.box(p.x1, -3.3, p.z0, p.x1 + 0.25, 0.9, 20, m.concrete);
    // Ramp collider under visual steps: from (z0, y0) down to (z1, -3).
    const len = Math.hypot(p.z1 - p.z0, 3);
    const ang = Math.atan2(3, p.z1 - p.z0);
    const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), ang);
    const center = V((p.x0 + p.x1) / 2, -1.5 - 0.1, (p.z0 + p.z1) / 2);
    this.physics.addFixedBoxQ(center, V(p.x1 - p.x0, 0.2, len), q);
    for (let i = 0; i < 10; i++) {
      const z0 = p.z0 + i * 0.5;
      this.box(p.x0, -3.3, z0, p.x1, -0.3 * (i + 1) + 0.0, z0 + 0.5, m.concrete, { collide: false });
    }
    // Tunnel floor + ceiling under the road.
    this.box(p.x0, -3.3, p.z1, p.x1, -3, 20, m.concrete);
    this.box(p.x0, -0.6, p.z1, p.x1, -0.3, 20, m.concrete, { collide: false });
    this.box(p.x0, -3.3, 19.8, p.x1, 0, 20, m.concrete);
    // Sign board above the entrance.
    const board = graffiti('ALULJÁRÓ', '#e8f0ff', 2.6, 0.45);
    (board.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x9ab8ff);
    (board.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    board.position.set((p.x0 + p.x1) / 2, 2.1, p.z0 - 0.05);
    board.rotation.y = Math.PI;
    this.add(board);
    for (const x of [p.x0 - 0.12, p.x1 + 0.12]) this.box(x - 0.05, 0.9, p.z0 - 0.05, x + 0.05, 2.35, p.z0 + 0.05, m.metal, { collide: false });
    // Sign #3: arrow pointing down the stairs, on the west parapet inner face.
    const s3 = catSign(-Math.PI / 2, true);
    s3.position.copy(SIGN3);
    s3.rotation.y = Math.PI / 2;
    s3.scale.setScalar(0.8);
    this.add(s3);
    this.signs.push(s3);
    // Warm glow from below: the homeless camp's fire (chapter 4 teaser).
    this.underpassLight = new THREE.PointLight(0xff7a30, 10, 9, 1.5);
    this.underpassLight.position.set(-14.5, -2.2, 15);
    this.add(this.underpassLight);
    this.add(streetLamp(-11.3, 7.5, V(-1, 0, 0)).group);
  }

  private buildSkyline() {
    // Distant blocks beyond the fog for the "endless estate" feeling.
    for (const [x0, z0, floors, rot] of [[-70, -60, 10, 0], [-20, -70, 10, 0], [30, -55, 8, 0], [55, -20, 10, 1], [60, 30, 9, 1], [-75, 30, 10, 1], [-30, 60, 10, 0], [30, 60, 8, 0]] as const) {
      const w = rot ? 12 : 40, d = rot ? 40 : 12;
      const b = panelBlock({ x0, x1: x0 + w, z0, z1: z0 + d, floors, faces: ['n', 's'], material: this.mats.panel, litChance: 0.18 });
      this.add(b.group);
    }
  }

  private buildPeople() {
    // Ilonka néni in her window (no collider — the sill belongs to the cat).
    this.ilonka = new Human({ height: 1.58, build: 1.15, coat: 0x8a5a7a, coatLength: 1, legs: 0x5a4a5a, skin: 0xe0b8a0, hair: 0xb8b0a8, curlers: true });
    this.ilonka.place(V(ILONKA_WIN.x - 0.3, 0, FACADE_Z + 0.2), 0);
    this.ilonka.setVisible(false);
    this.add(this.ilonka.root);
    this.ilonkaFood = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.05, 14), this.mats.white);
    const food = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a3a }));
    food.scale.y = 0.4;
    food.position.y = 0.03;
    this.ilonkaFood.add(bowl, food);
    this.ilonkaFood.position.set(ILONKA_WIN.x + 0.35, 0.93, FACADE_Z + 0.28);
    this.ilonkaFood.visible = false;
    this.add(this.ilonkaFood);

    // The Hoodies in the open garage.
    const hoodie = (coat: number, h: number) => new Human({ height: h, coat, coatLength: 0, legs: 0x1e1e24, hood: true, skin: 0xd8a888, hair: 0x2a1e18 }, this.physics);
    const robi = hoodie(0x2a2a30, 1.82), dani = hoodie(0x34404a, 1.72), kristof = hoodie(0x3a2a3a, 1.75);
    robi.place(V(19.4, 0, -0.6), -2.2);
    dani.place(V(17.6, 0, -2.3), 0.9);
    kristof.place(V(18.2, 0, -0.5), 2.6);
    this.boys = [robi, dani, kristof];
    for (const b of this.boys) this.add(b.root);
    robi.phoneUp = false;

    // Gábor ✅ — könyvelő, ballonkabát, aktatáska, szemüveg.
    this.gabor = new Human({ height: 1.76, build: 1.1, coat: 0x8a7d62, coatLength: 1, legs: 0x3a3c42, skin: 0xd9a88a, hair: 0x5a4a3a, glasses: true, bag: 0x2a2018 }, this.physics);
    this.gabor.speed = 1.15;
    this.gabor.place(V(60, 0, 14.2), 0);
    this.gabor.setVisible(false);
    this.add(this.gabor.root);
    this.milkCap = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x3a6ad0, roughness: 0.4 }));
    const milk = new THREE.Mesh(new THREE.CircleGeometry(0.043, 16), new THREE.MeshStandardMaterial({ color: 0xf8f6ee, roughness: 0.2 }));
    milk.rotation.x = -Math.PI / 2;
    milk.position.y = 0.016;
    this.milkCap.add(cap, milk);
    this.milkCap.visible = false;
    this.add(this.milkCap);
  }

  // ───────────────────────────── interactions ─────────────────────────────

  private buildInteractions() {
    const I = this.interactions;
    const cat = () => this.cat();
    const faceTo = (p: THREE.Vector3) => { const c = cat(); c.yaw = Math.atan2(p.x - c.feet.x, p.z - c.feet.z); };

    I.add({
      id: 'ilonka', label: 'Nyávogás', action: 'meow', radius: 2.4, heightBand: [-1, 1.4],
      position: () => V(ILONKA_WIN.x, 0, FACADE_Z + 0.6),
      enabled: () => !this.flags.ilonka && this.stage !== 'intro',
      onInteract: () => this.script.run(() => this.beatIlonka()),
    });
    I.add({
      id: 'ilonkaFood', label: 'Evés', radius: 0.55, heightBand: [-0.3, 0.3],
      position: () => this.ilonkaFood.position,
      enabled: () => this.ilonkaFood.visible && !this.flags.ilonkaAte,
      onInteract: () => {
        faceTo(this.ilonkaFood.position);
        cat().doEat(2.2);
        this.flags.ilonkaAte = true;
        this.script.run(async () => {
          await this.script.wait(2.2);
          this.ilonkaFood.visible = false;
          await this.script.say('Ilonka néni', 'Na, ugye. Most menj haza, mielőtt megfázol.');
          this.ilonka.setVisible(false);
          this.ilonkaWindow.visible = true;
        });
      },
    });
    const sniffSign = (id: string, pos: THREE.Vector3, band: [number, number], after: () => void) => I.add({
      id, label: 'Szaglászás', radius: 1.6, heightBand: band,
      position: () => (pos === SIGN3 ? V(-15.4, -0.6, pos.z) : V(pos.x, 0, pos.z + 0.4)),
      onInteract: () => { faceTo(pos); cat().doSniff(); after(); },
    });
    sniffSign('sign1', SIGN1, [-0.5, 2.2], () => this.script.run(() => this.beatSign1()));
    sniffSign('sign2', SIGN2, [-3, 0.6], () => this.script.run(() => this.beatSign2()));
    sniffSign('sign3', SIGN3, [-0.8, 1], () => this.script.run(() => this.beatSign3()));
    I.add({
      id: 'keychain', label: 'Felvétel', radius: 0.6, heightBand: [-0.3, 0.4],
      position: () => V(DRUM.x, 0.9, DRUM.z),
      enabled: () => !this.flags.keychain,
      onInteract: () => {
        faceTo(V(DRUM.x, 0, DRUM.z));
        this.flags.keychain = true;
        this.group.remove(this.keychain);
        this.keychain.scale.setScalar(0.8);
        cat().carry(this.keychain);
        this.dialogue.showHint('Egy kulcstartó — a kis sárga cicát <b>Bori</b> rajzolta rá. Dani zsebéből eshetett ki.');
      },
    });
    I.add({
      id: 'gaborMeow', label: 'Nyávogás', action: 'meow', radius: 4, heightBand: [-0.6, 3],
      position: () => this.gabor.root.position,
      enabled: () => this.stage === 'gabor' && !this.flags.gaborNoticed && this.gabor.root.visible && !this.gabor.walking,
      onInteract: () => { this.flags.gaborNoticed = true; },
    });
    I.add({
      id: 'gaborRub', label: 'Dörgölőzés', radius: 1.1, heightBand: [-0.4, 0.4],
      position: () => this.gabor.root.position,
      enabled: () => this.stage === 'gabor' && this.flags.gaborNoticed && !this.flags.gaborRubbed && this.gaborReady,
      onInteract: () => {
        faceTo(this.gabor.root.position);
        this.flags.gaborRubbed = true;
        this.audio.purr(1.8);
        cat().doSwipe(); // head-bump reads ok with the swipe wiggle for now
      },
    });
    I.add({
      id: 'milk', label: 'Ivás', radius: 0.6, heightBand: [-0.3, 0.3],
      position: () => this.milkCap.position,
      enabled: () => this.milkCap.visible && !this.flags.milk,
      onInteract: () => {
        faceTo(this.milkCap.position);
        cat().doEat(3);
        this.flags.milk = true;
      },
    });
  }
  private gaborReady = false;

  // ───────────────────────────── story beats ─────────────────────────────

  begin() {
    this.script.run(() => this.beatIntro());
  }

  private async beatIntro() {
    const s = this.script;
    this.stage = 'intro';
    this.dialogue.showCard('1 — Üres ablak', 'Csillag-lakótelep · október · 20:40', 4200);
    await s.wait(2.6);
    await s.say('Judit', 'Bori? Szia, kicsim… Akkor Rékáéknál alszol?');
    await s.wait(0.5);
    await s.say('Judit', 'Jó. Holnap beszélünk. És vedd fel, ha hívlak, jó?');
    await s.say('Judit', 'Füst! Hol van ez a macska… Na mindegy, késésben vagyok.');
    await s.wait(0.6);
    (this.borisWindow.material as THREE.MeshBasicMaterial).map = this.boriDark;
    this.audio.thumpDoor();
    await s.wait(1.2);
    this.dialogue.showHint('Bori nem jött haza. Az ő szobája üres — és hiányzik a <b>sárga</b> festékszóró.', 5000);
    if (this.stage === 'intro') this.stage = 'descend';
    await s.wait(5.5);
    if (this.cat().feet.y > 5) this.dialogue.showHint('Ugrani csak oda lehet, ahol <b>gyűrű</b> jelenik meg. Nézz a szomszéd erkély felé.', 5000);
  }

  private async beatIlonka() {
    const s = this.script;
    this.flags.ilonka = true;
    await s.wait(0.8);
    this.ilonkaWindow.visible = false;
    this.ilonka.setVisible(true);
    this.ilonka.lookTarget = this.cat().root.position;
    this.ilonka.talking = true;
    await s.say('Ilonka néni', 'Nahát, Füst! Te meg mit keresel idekint ilyen időben?');
    this.ilonkaFood.visible = true;
    await s.say('Ilonka néni', 'Tessék, egyél csak. Csirkemáj, a tiéd.');
    await s.say('Ilonka néni', 'A Kertész lány ma este nem jött vissza. Pedig mindig köszön, ha elmegy itt…');
    this.ilonka.talking = false;
  }

  private async beatSign1() {
    if (this.flags.sign1) { this.dialogue.showHint('Bori festéke. A nyom a <b>garázsok</b> felé vezet.'); return; }
    this.flags.sign1 = true;
    await this.script.wait(1.1);
    this.dialogue.showHint('Bori festéke. <b>Friss</b> — nemrég járt itt.', 4000);
    await this.script.wait(1.5);
    this.stage = 'garage';
    this.dialogue.showCard('2 — Garázssor', '20:52');
    await this.script.wait(3);
    this.dialogue.showHint('Tartsd lenyomva az <b>F</b>-et: <b>szagmód</b> — Bori nyoma látható lesz.', 5000);
  }

  private async beatOverhear() {
    const s = this.script;
    const [robi, dani, kristof] = this.boys;
    this.flags.overheard = true;
    const talk = (h: Human, on: boolean) => { h.talking = on; };
    talk(robi, true);
    await s.say('Robi', 'Majd kijön, ha megunja. Nem hal bele egy éjszakába.');
    talk(robi, false); talk(kristof, true);
    await s.say('Kristóf', 'Hahaha! Bezártuk a festőt a Csillag alá!');
    talk(kristof, false); talk(dani, true);
    await s.say('Dani', 'És ha nem tud kijönni? Robi, az a rács belülről nem nyílik…');
    talk(dani, false); talk(robi, true);
    await s.say('Robi', 'Kuss már, Dani. Reggel lemegyünk és kiengedjük. Kész.');
    talk(robi, false); talk(dani, true);
    await s.say('Dani', '…Én akkor is szólok valakinek.');
    talk(dani, false);
    await s.wait(0.6);
    this.dialogue.showHint('Bori nem magától maradt távol. <b>Bajban van.</b>', 5000);
  }

  private async beatSign2() {
    if (this.flags.sign2) { this.dialogue.showHint('A nyíl a <b>buszmegálló</b> felé mutat.'); return; }
    this.flags.sign2 = true;
    await this.script.wait(1.1);
    this.dialogue.showHint('Még egy jel. A nyíl a <b>buszmegálló</b> felé mutat.', 4000);
    this.stage = 'toStop';
    await this.script.wait(1.2);
    this.dialogue.showCard('3 — Buszmegálló', '21:15');
    this.script.run(() => this.beatGabor());
  }

  private async beatGabor() {
    const s = this.script;
    if (this.flags.busArrived) return;
    this.flags.busArrived = true;
    await s.wait(2.5);
    // The last bus pulls in.
    this.busState = 'arriving';
    this.busT = 0;
    this.busObj.group.visible = true;
    await s.until(() => this.busState === 'stopped');
    this.gabor.setVisible(true);
    this.gabor.place(V(8.6, 0, 14.6), Math.PI);
    await s.wait(0.6);
    await this.gabor.walkTo([V(8.4, 0, 13.4)]);
    this.busState = 'leaving';
    this.gabor.faceTo(V(8.4, 0, 20));
    this.gabor.phoneUp = true;
    this.stage = 'gabor';
    this.gaborReady = false;
    await s.say('Gábor', 'Utolsó busz, utolsó ember. Mint mindig.');
    // Waiting for the cat.
    await s.until(() => this.flags.gaborNoticed || this.cat().feet.distanceTo(this.gabor.root.position) < 1.6);
    this.flags.gaborNoticed = true;
    this.gabor.phoneUp = false;
    this.gabor.lookTarget = this.cat().root.position;
    this.gabor.talking = true;
    await s.say('Gábor', 'Hát te? Ilyen időben, egyedül?');
    this.gabor.talking = false;
    this.gaborReady = true;
    await s.until(() => this.flags.gaborRubbed);
    this.gabor.crouch = 1;
    await s.wait(0.9);
    this.gabor.talking = true;
    await s.say('Gábor', 'Na, na… Várj csak, van itt valami.');
    const front = this.gabor.root.position.clone().add(V(Math.sin(this.gabor.yaw) * 0.45, 0, Math.cos(this.gabor.yaw) * 0.45));
    this.milkCap.position.set(front.x, 0.015, front.z);
    this.milkCap.visible = true;
    await s.say('Gábor', 'Csak egy kupaknyi. A kávémhoz vettem, de neked jobban kell.');
    this.gabor.talking = false;
    await s.until(() => this.flags.milk);
    await s.wait(3);
    this.milkCap.visible = false;
    this.gabor.talking = true;
    await s.say('Gábor', 'Na. Legalább valakinek jó estéje van.');
    this.gabor.crouch = 0;
    await s.wait(0.8);
    await s.say('Gábor', 'Gyere, kísérj haza, ha már itt vagy. Ott lakom, szemben.');
    this.gabor.talking = false;
    this.gabor.lookTarget = null;
    // Escort across the zebra crossing.
    this.stage = 'escort';
    await this.gabor.walkTo([V(5, 0, 13.6), V(1.6, 0, 13.6), V(1.6, 0, 20.6), GABOR_DOOR]);
    this.gabor.faceTo(this.cat().feet);
    this.gabor.lookTarget = this.cat().root.position;
    await s.until(() => this.cat().feet.distanceTo(GABOR_DOOR) < 3.5);
    this.gabor.crouch = 0.7;
    this.gabor.talking = true;
    await s.say('Gábor', 'Várj csak… te vagy a sárga kabátos lány cicája, ugye? A szemközti házból.');
    await s.say('Gábor', 'Mindig ilyen későn jár haza. Mint én.');
    await s.say('Gábor', 'Na, menj haza, kis szürke. Biztos vár téged.', 0.4);
    this.gabor.talking = false;
    this.gabor.crouch = 0;
    this.gabor.lookTarget = null;
    await s.wait(0.6);
    await this.gabor.walkTo([V(1.5, 0, 21.9)]);
    this.gabor.setVisible(false);
    this.audio.thumpDoor();
    this.flags.gaborHome = true;
    this.stage = 'toUnderpass';
    await s.wait(1);
    this.dialogue.showHint('Haza? Bori nincs otthon. A szagnyom az <b>aluljáró</b> felé vezet.', 5000);
  }

  private async beatSign3() {
    if (!this.flags.gaborHome) {
      this.dialogue.showHint('Bori jele, lefelé mutat. De a nyom még a <b>buszmegálló</b> felé is visz…');
      return;
    }
    await this.script.wait(1.2);
    this.stage = 'end';
    const f = this.flags;
    this.onGoal({
      kicker: 'vertical slice v0.2 · vége',
      title: 'Lefelé.',
      lede: 'Bori jele az aluljáróba mutat. Lentről tűz fénye és rádió hangja szűrődik fel. Folytatás: 4 — Aluljáró.',
      items: [
        { label: 'Ilonka néni csirkemája', done: f.ilonkaAte },
        { label: 'Kihallgattad a Kapucnisokat', done: f.overheard },
        { label: 'Dani kulcstartója a szádban', done: f.keychain },
        { label: 'Gábor bizalma (tej + hazakísérés)', done: f.gaborHome },
      ],
    });
  }

  // ───────────────────────────── runtime ─────────────────────────────

  meow(from: THREE.Vector3) {
    // People react to a meow even if it wasn't aimed at them.
    if (this.stage === 'gabor' && from.distanceTo(this.gabor.root.position) < 5) this.flags.gaborNoticed = true;
    const garage = V(18.5, 0, -1.5);
    if (from.distanceTo(garage) < 5 && from.y < 1.5 && this.shooCooldown <= 0) this.shoo();
  }

  private shoo() {
    this.shooCooldown = 6;
    const robi = this.boys[0];
    robi.lookTarget = this.cat().root.position;
    this.script.run(async () => {
      robi.talking = true;
      await this.script.say('Robi', ['Hess innen, dög!', 'Mi van, cica? Kopj le!', 'Ne bámulj, menj már!'][Math.floor(Math.random() * 3)]);
      robi.talking = false;
    });
    this.audio.stomp();
  }

  update(dt: number, time: number) {
    this.script.update(dt);
    const cat = this.cat();
    const c = cat.feet;

    // Follow the cat with the shadow frustum.
    this.moon.position.set(c.x - 8, c.y + 18, c.z + 6);
    this.moon.target.position.copy(c);

    // Stage transitions driven by position.
    if (this.stage === 'descend' && c.y < 0.3) {
      this.stage = 'courtyard';
      this.dialogue.showHint('Lent vagy. Szimatolj körül — Bori <b>sárga jelét</b> keresd.', 4500);
    }

    // Boys: idle chatter animation, react to a cat on the ground in front of the garage.
    this.shooCooldown -= dt;
    const inFront = c.y < 1 && c.x > 13 && c.x < 16.4 && c.z > -3.8 && c.z < 0.6;
    for (const b of this.boys) {
      b.lookTarget = inFront ? cat.root.position : null;
      b.update(dt);
    }
    if (inFront && this.shooCooldown <= 0 && !this.flags.overheard) this.shoo();
    if (!this.flags.overheard && c.y > GARAGE.h - 0.3 && Math.hypot(c.x - VENT.x, c.z - VENT.z) < 2.4) {
      this.script.run(() => this.beatOverhear());
    }
    this.speakerLed.color.setHSL(0.42, 1, 0.3 + Math.max(0, Math.sin(time * Math.PI * 3.2)) * 0.35);
    const dGarage = Math.hypot(c.x - 18.5, c.z + 1.5);
    this.audio.setMusic(Math.max(0, 1 - dGarage / 20) * (this.stage === 'end' ? 0 : 1));

    // Bus.
    this.updateBus(dt);
    this.ilonka.update(dt);
    if (this.gabor.root.visible) {
      // Escort: wait for the cat if it lags behind.
      if (this.stage === 'escort' && this.gabor.walking) {
        const far = c.distanceTo(this.gabor.root.position) > 6;
        if (far && !this.gabor.paused) {
          this.gabor.paused = true;
          this.gabor.lookTarget = cat.root.position;
          this.script.run(() => this.script.say('Gábor', 'Jössz, kis szürke?'));
        } else if (!far && c.distanceTo(this.gabor.root.position) < 3.5 && this.gabor.paused) {
          this.gabor.paused = false;
          this.gabor.lookTarget = null;
        }
      }
      this.gabor.update(dt);
    }

    // Signs pulse gently; brighter in scent mode.
    for (const s of this.signs) {
      for (const m of s.userData.materials as THREE.MeshStandardMaterial[]) {
        m.emissiveIntensity = (this.scentOn ? 1.6 : 0.3) + Math.sin(time * 2.4) * 0.08;
      }
    }
    this.underpassLight.intensity = 10 + Math.sin(time * 11) * 1.5 + Math.sin(time * 23) * 1;
  }

  private updateBus(dt: number) {
    const g = this.busObj.group;
    const stopX = 8.4;
    if (this.busState === 'arriving') {
      this.busT += dt;
      const t = Math.min(1, this.busT / 6);
      const e = 1 - Math.pow(1 - t, 3);
      g.position.x = THREE.MathUtils.lerp(60, stopX, e);
      this.busObj.light.intensity = 3;
      this.audio.setEngine(1 - e * 0.5);
      if (t >= 1) { this.busState = 'stopped'; this.busT = 0; this.audio.hiss(); }
    } else if (this.busState === 'stopped') {
      this.audio.setEngine(0.45);
    } else if (this.busState === 'leaving') {
      this.busT += dt;
      const t = this.busT / 7;
      g.position.x = stopX - t * t * 70;
      this.audio.setEngine(Math.max(0, 0.6 - t * 0.6));
      if (t >= 1) { this.busState = 'away'; g.visible = false; this.audio.setEngine(0); }
    }
  }

  private scentOn = false;
  setScentMode(on: boolean) { this.scentOn = on; }

  scentTrail(): THREE.Vector3[] | null {
    const f = this.flags;
    switch (this.stage) {
      case 'intro':
      case 'descend':
        return [V(-4.5, 6, -13.4), V(-1.5, 6.1, -13.4), V(1.5, 3.1, -13.2), V(3.5, 1.95, -11), V(4, 0.1, -8.6)];
      case 'courtyard':
        return f.sign1 ? null : [this.cat().feet.clone().setY(0.1), V(4, 0.1, -8.6)];
      case 'garage':
        if (!f.overheard) return [V(4, 0.1, -8.6), V(9, 0.1, -10), V(14.5, 1.45, -12.9), V(16.6, GARAGE.h, -11), V(17.6, GARAGE.h, -4), V(VENT.x, GARAGE.h, VENT.z - 0.6)];
        return [V(VENT.x, GARAGE.h, VENT.z), V(18.5, GARAGE.h, 6), V(18.5, GARAGE.h, 11.6), V(18.5, 0.1, 12.6)];
      case 'toStop':
      case 'gabor':
        return [V(18.5, 0.1, 12.6), V(14, 0.1, 13), V(9, 0.1, 13.2)];
      case 'escort':
        return [V(5, 0.1, 13.6), V(1.6, 0.1, 13.6), V(1.6, 0.1, 21)];
      case 'toUnderpass':
        return [V(1.6, 0.1, 20), V(1.6, 0.1, 14.5), V(-6, 0.1, 11.5), V(-14.5, 0.1, 6.4), V(-14.5, -0.4, 8.6)];
      default:
        return null;
    }
  }

  objectiveHTML() {
    const f = this.flags;
    const main: Record<Stage, string> = {
      intro: 'Bori ablaka…',
      descend: 'Bori nem jött haza. Juss le az <b>udvarra</b> — erkélyről erkélyre.',
      courtyard: 'Keresd Bori <b>sárga cicajelét</b> az udvaron.',
      garage: f.overheard ? 'Bori bajban van. Kövesd a jeleit a <b>garázssor végéig</b>.' : 'A nyom a <b>garázssor</b> felé vezet. A tetőkről mindent hallani.',
      toStop: 'Menj a <b>buszmegállóhoz</b>.',
      gabor: f.milk ? 'Gábor…' : f.gaborNoticed ? 'Menj oda hozzá, <b>dörgölőzz</b>.' : 'Valaki leszállt a buszról. <b>Nyávogj</b> neki.',
      escort: 'Kísérd haza <b>Gábort</b>.',
      toUnderpass: 'Kövesd a nyomot az <b>aluljáróig</b>.',
      end: '',
    };
    const side: string[] = [];
    if (f.ilonkaAte) side.push('Ilonka néni ✓');
    if (f.overheard) side.push('kihallgatás ✓');
    if (f.keychain) side.push('kulcstartó ✓');
    if (f.gaborHome) side.push('Gábor bizalma ✓');
    return main[this.stage] + (side.length ? `<br><small>${side.join(' · ')}</small>` : '') +
      `<br><small class="dim">F: szagmód</small>`;
  }

  /** Debug / test: jump straight to a beat (`?beat=garage|bus|end`). */
  skipTo(beat: string) {
    const cat = this.cat();
    this.script.cancelAll();
    if (beat === 'courtyard') { this.stage = 'courtyard'; cat.teleport(V(4, 0, -6), Math.PI); }
    if (beat === 'garage') { this.flags.sign1 = true; this.stage = 'garage'; cat.teleport(V(12, 0, -10), Math.PI / 2); }
    if (beat === 'bus') {
      Object.assign(this.flags, { sign1: true, overheard: true });
      cat.teleport(V(16, 0, 13), -Math.PI / 2);
      this.script.run(() => this.beatSign2());
    }
    if (beat === 'underpass') {
      Object.assign(this.flags, { sign1: true, overheard: true, sign2: true, busArrived: true, gaborNoticed: true, gaborRubbed: true, milk: true, gaborHome: true });
      this.stage = 'toUnderpass';
      cat.teleport(V(-12, 0, 5), -Math.PI / 2);
    }
  }

  reset() {
    this.script.cancelAll();
    this.dialogue.clearAll();
    for (const k of Object.keys(this.flags) as Array<keyof typeof this.flags>) this.flags[k] = false;
    this.stage = 'intro';
    (this.borisWindow.material as THREE.MeshBasicMaterial).map = this.boriLit;
    this.ilonkaWindow.visible = true;
    this.ilonka.setVisible(false);
    this.ilonkaFood.visible = false;
    const cat = this.cat();
    cat.carry(null);
    this.keychain.scale.setScalar(1);
    this.keychain.position.set(DRUM.x, 0.92, DRUM.z);
    this.add(this.keychain);
    this.gabor.setVisible(false);
    this.gabor.crouch = 0;
    this.gabor.paused = false;
    this.gabor.lookTarget = null;
    this.gabor.place(V(60, 0, 14.2));
    this.gaborReady = false;
    this.milkCap.visible = false;
    this.busState = 'away';
    this.busObj.group.visible = false;
    this.busObj.group.position.x = 60;
    this.audio.setEngine(0);
  }
}

// ───────────────────────────── small assets ─────────────────────────────

/** Lit window with an optional silhouette ('phone' = Judit, 'curtain' = Ilonka). */
function windowTexture(bg: string, kind: 'phone' | 'curtain' | null) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 50, 10, 64, 64, 100);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, shade(bg));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  if (kind === 'phone') {
    g.fillStyle = 'rgba(30,18,10,0.85)';
    g.beginPath(); g.arc(70, 46, 13, 0, Math.PI * 2); g.fill();          // head
    g.fillRect(52, 58, 36, 70);                                          // body
    g.save(); g.translate(80, 60); g.rotate(-0.9); g.fillRect(0, -5, 26, 10); g.restore(); // arm to ear
  }
  if (kind === 'curtain') {
    g.fillStyle = 'rgba(255,240,220,0.45)';
    for (let x = 0; x < 128; x += 10) g.fillRect(x, 0, 5, 128);
    g.fillStyle = 'rgba(40,25,20,0.6)';
    g.beginPath(); g.arc(40, 56, 11, 0, Math.PI * 2); g.fill();
    g.fillRect(26, 66, 28, 62);
  }
  // Frame cross.
  g.fillStyle = '#2a2a2a';
  g.fillRect(62, 0, 4, 128);
  g.fillRect(0, 44, 128, 4);
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.45, g = ((n >> 8) & 255) * 0.45, b = (n & 255) * 0.45;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function keychainMesh() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 }));
  ring.rotation.x = Math.PI / 2;
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.07), new THREE.MeshStandardMaterial({ color: 0xffd21f, emissive: 0xffc400, emissiveIntensity: 0.4 }));
  tag.position.z = 0.06;
  const key = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.006, 0.08), new THREE.MeshStandardMaterial({ color: 0xb8a060, metalness: 0.8, roughness: 0.3 }));
  key.position.set(0.03, 0, 0.05);
  key.rotation.y = 0.6;
  g.add(ring, tag, key);
  return g;
}
