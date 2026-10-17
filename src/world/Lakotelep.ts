import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { Interactions } from '../gameplay/Interactions';
import type { Audio } from '../core/Audio';
import type { Cat } from '../player/Cat';
import type { GameLevel, EndSummary } from './types';
import { worldUVBox } from './materials';
import { panelTexture, asphaltTexture, corrugatedTexture, catSign, graffiti, tag, stencil, type StencilKind, panelBlock, streetLamp, tree, leafLitter, bus } from './props';
import { Human } from '../npc/Human';
import { Dog } from '../npc/Dog';
import { Sky, MOON_DIR } from './Sky';
import { Script } from '../story/Script';
import type { Dialogue } from '../story/Dialogue';

/**
 * Vertical slice v0.3 — Csillag-lakótelep, 20:40 → 23:50.
 * NARRATIVA.md compressed: Üres ablak → Garázssor → Buszmegálló (Gábor) → Aluljáró →
 * Csillag tér (Bori a rács mögött) → kit hozol segítségül → négy befejezés.
 * See docs/PLAYTEST.md for the route. Coordinates in metres:
 *   +x east, +z south. Panel 7 (Bori) is north, panel 4 (Gábor) south across the street,
 *   the underpass hall runs under panel 4, Csillag tér is west of the street.
 */

type Stage = 'intro' | 'descend' | 'courtyard' | 'garage' | 'toStop' | 'gabor' | 'escort' | 'toUnderpass'
  | 'hall' | 'camp' | 'toSquare' | 'square' | 'fetch' | 'rescue' | 'end';
const STAGE_ORDER: Stage[] = ['intro', 'descend', 'courtyard', 'garage', 'toStop', 'gabor', 'escort', 'toUnderpass',
  'hall', 'camp', 'toSquare', 'square', 'fetch', 'rescue', 'end'];
type Helper = '' | 'gabor' | 'laci' | 'dani' | 'ilonka';
export type Ending = 'underpass' | 'home' | 'sorry' | 'base';

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
// Chapter 4: the underpass hall under panel 4, and the west stairs up to Csillag tér.
const HALL = { x0: -24, x1: -6, z0: 20, z1: 32 };
const PIT2 = { x0: -34, x1: -28, z0: 26, z1: 29 };
const FIRE = V(-15, -3, 26.2);
const KIOSK_IN = { x0: -10, x1: -8, z0: 29.6, z1: 31.6, h: 1.8 };
const CSONT_BED = V(-11.2, -3, 22.6);
// Chapter 5: Csillag tér with the closed metro entrance (Bori behind the grille).
const SQUARE = { x0: -52, x1: -26, z0: 11.8, z1: 36 };
const METRO = { x0: -46, x1: -42, z0: 24, z1: 31 };
const GRILLE = V(-44, 0, 22.9);
const BORI_SPOT = V(-44, -3, 30.1);
const SQ_KIOSK = { x0: -35, x1: -32.6, z0: 14.5, z1: 16.9, h: 2.4 };
const SIGN4 = V(METRO.x1 + 0.27, 1.2, 25.4);

export class Lakotelep implements GameLevel {
  readonly group = new THREE.Group();
  readonly spawn = V(-4.5, BORI_BALCONY.y, FACADE_Z + 0.55);
  readonly spawnYaw = Math.PI / 2; // looking east along the balcony
  onGoal: (s?: EndSummary) => void = () => {};

  stage: Stage = 'intro';
  flags = {
    ilonka: false, ilonkaAte: false, sign1: false, overheard: false, keychain: false,
    sign2: false, busArrived: false, gaborNoticed: false, gaborRubbed: false, milk: false, gaborHome: false,
    /** Escorted Gábor all the way to his door (trust → "Hazafelé"). */
    gaborTrust: false,
    csontMet: false, camp: false, bread: false, ball: false, ballGiven: false,
    pigeons: false, sign4: false, bori: false,
  };
  helper: Helper = '';
  ending: Ending | null = null;

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
    garage: new THREE.MeshStandardMaterial({ name: 'garage_tin', color: 0x7b7f73, roughness: 0.55, metalness: 0.45, map: corrugatedTexture(),
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), // doors / roof skin / shutters sit 1–2 cm proud
    brick: new THREE.MeshStandardMaterial({ name: 'garage_brick', color: 0x7a5a4a, roughness: 0.95, map: panelTexture() }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass_dirty', color: 0x9fb5c0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.22 }),
    dumpster: new THREE.MeshStandardMaterial({ name: 'dumpster', color: 0x3b5c45, roughness: 0.55, metalness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 }),
  };

  private borisWindow!: THREE.Mesh;
  private boriLit!: THREE.Texture;
  private boriDark!: THREE.Texture;
  private ilonkaWindow!: THREE.Mesh;
  private ilonkaClosed!: THREE.Texture;
  private ilonkaOpen!: THREE.Texture;
  private setIlonkaOpen(open: boolean) { (this.ilonkaWindow.material as THREE.MeshBasicMaterial).map = open ? this.ilonkaOpen : this.ilonkaClosed; }
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
  private lastSafe = V(-4.5, 6, -13.4);
  private safeT = 0;
  private stageT = 0;
  private nudged = false;
  private keychainAt = 0;
  private clock = 0;
  private sinceKeychain() { return this.clock - this.keychainAt; }
  private underpassLight!: THREE.PointLight;
  private flame!: THREE.Mesh;
  private sky = new Sky();
  private rainAmt = 1;
  private gaborGaveUp = false;
  private escortWait = 0;
  // Underpass people.
  private marika!: Human;
  private laci!: Human;
  private tomi!: Human;
  private csont = new Dog();
  private ball!: THREE.Object3D;
  private bread!: THREE.Object3D;
  // Csillag tér.
  private bori!: Human;
  private grille!: THREE.Group;
  private grilleCollider!: ReturnType<Physics['addFixedBox']>;
  private grilleOpen = 0;
  private grilleOpening = false;
  private metroLight!: THREE.PointLight;
  private police!: THREE.PointLight;
  private policeOn = false;
  private pigeons: Array<{ obj: THREE.Object3D; home: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; t: number }> = [];
  private squareHinted = false;
  private follow: { who: Human; queue: THREE.Vector3[]; last: THREE.Vector3; near: boolean; lostT: number } | null = null;

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
    this.buildHall();
    this.buildSquare();
    // October: leaves under every plane tree, piles swept against kerbs and walls, a few blown down the stairs.
    this.add(leafLitter([
      [-19, -5, 2.4], [-3, -6, 2], [-17, 3, 2.6], [11, 7, 2.2], [-6, 6, 1.8], [13, -9, 2], [-10, 21, 1.8],
      [-49, 22, 2.4], [-49, 32, 2.2], [-28, 33.5, 2],
      [-22.6, -10, 1.1, true], [-21.8, 8.5, 0.9, true], [14.6, 6, 0.8, true], [6.5, -12.6, 0.9, true], [-6.8, 21.6, 0.8, true],
      [-50.6, 27, 1.2, true], [-30, 35.2, 1, true], [-38, 13, 0.8, true],
      [-14.5, 13, 0.9, false, -3], [-26.5, 27.5, 0.8, false, -3],
    ]));
    this.buildStreetArt();
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

  /**
   * Street art that isn't Bori's: doodles crowd every sign so it has to be read (three
   * strokes, an arrow), not just spotted as the one yellow thing on the wall.
   * Each entry: kind/text, colour, size, x, y, z, rotation about y.
   */
  private buildStreetArt() {
    const N = 0, E = Math.PI / 2, W = -Math.PI / 2;
    const art: Array<[StencilKind | string, string, number, number, number, number, number]> = [
      // Sign 1 — trash enclosure front (south face).
      ['smiley', '#ffb21f', 0.55, 2.55, 1.25, -9.37, N], ['bolt', '#ff5a5a', 0.5, 5.45, 0.8, -9.37, N], ['ROBI', '#9cff6a', 0.9, 2.6, 0.5, -9.37, N],
      // Sign 2 — garage row's south end.
      ['star', '#ffe14a', 0.6, 16.7, 1.6, 12.03, N], ['eye', '#6ad8ff', 0.7, 20.2, 1.2, 12.03, N], ['arrow', '#ff9de0', 0.6, 17.2, 0.6, 12.03, N],
      ['K+D', '#ff5a5a', 1.0, 20.1, 0.45, 12.03, N],
      // Sign 3 — west parapet of the underpass stairs, and the tunnel.
      ['crown', '#ffd21f', 0.45, -15.97, 0.5, 10.0, E], ['skull', '#e8e2d0', 0.45, -15.97, 0.45, 11.3, E],
      ['NO FUTURE', '#ff5a5a', 2.0, -15.98, -1.4, 15.5, E], ['dog', '#ffd21f', 0.8, -13.02, -1.6, 16.5, W], ['FTC', '#9cff6a', 1.4, -13.02, -1.3, 13.6, W],
      ['heart', '#ff9de0', 0.8, -15.98, -1.8, 18.4, E],
      // Hall.
      ['bird', '#e8e2d0', 0.8, -23.98, -1.4, 23.5, E], ['smiley', '#ffd21f', 0.6, -6.02, -1.6, 25, W], ['arrow', '#ffb21f', 0.7, -6.02, -2.3, 28.8, W],
      // Csillag tér — round sign 4 on the metro pavilion and the brick wall.
      ['star', '#ffd21f', 0.55, -41.73, 1.9, 27.0, E], ['bird', '#6ad8ff', 0.6, -41.73, 0.8, 28.4, E], ['eye', '#ffb21f', 0.6, -41.73, 1.5, 29.8, E],
      ['CSILLAG', '#ffd21f', 2.2, -51.98, 1.3, 26, E], ['crown', '#ff5a5a', 0.7, -51.98, 1.7, 30.5, E], ['bolt', '#ffe14a', 0.6, -51.98, 1.0, 19.5, E],
    ];
    for (const [k, col, size, x, y, z, ry] of art) {
      const isText = /[A-Z+]{2,}/.test(k);
      const mesh = isText ? tag(k, col, size * 1.6, size * 0.55) : stencil(k as StencilKind, col, size, Math.random() * 6);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      this.add(mesh);
    }
  }

  // ───────────────────────────── build ─────────────────────────────

  private buildAtmosphere() {
    this.scene.fog = new THREE.FogExp2(0x101826, 0.032);
    this.scene.background = new THREE.Color(0x0f1724);
    // Stars through the gaps in the clouds; the sky clears over Csillag tér.
    this.scene.add(this.sky.mesh);
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
    // Ground slab with holes for the two underpass stairs and the metro entrance. (The
    // hall below has its own shadow-casting ceiling slab: no moonlight underground.)
    // The slab is pushed back in depth so the pit/metro walls that share its top plane and
    // hole edges always win instead of flickering (z-fighting).
    const slab = m.asphalt.clone();
    slab.polygonOffset = true;
    slab.polygonOffsetFactor = 1;
    slab.polygonOffsetUnits = 4;
    for (const [x0, z0, x1, z1] of carve(-60, -45, 60, 55, [PIT, PIT2, METRO])) this.box(x0, -0.3, z0, x1, 0, z1, slab, { shadow: false });
    // Visual layers: pavement/road, grass, paint, puddles — each a centimetre apart and
    // pulled forward in depth by its layer, so distant ones don't flicker either.
    const layered = new Map<string, THREE.Material>();
    const layer = (mat: THREE.Material, y: number) => {
      const k = mat.uuid + y;
      if (!layered.has(k)) {
        const c = mat.clone();
        c.polygonOffset = true;
        c.polygonOffsetFactor = -1 - Math.round(y * 100);
        c.polygonOffsetUnits = -4;
        layered.set(k, c);
      }
      return layered.get(k)!;
    };
    const flat = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, y = 0.01) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), layer(mat, y));
      p.rotation.x = -Math.PI / 2;
      p.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      p.receiveShadow = true;
      // World-scale UVs for the shared textures.
      const uv = p.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * (z1 - z0));
      return this.add(p);
    };
    flat(-26, 14, 60, 20, m.road, 0.01);
    flat(-26, 12, PIT.x0, 14, m.pavement);
    flat(PIT.x1, 12, 60, 14, m.pavement);
    flat(-26, 20, 60, 22, m.pavement);
    // Csillag tér: paving around the stair and metro holes.
    for (const [x0, z0, x1, z1] of carve(SQUARE.x0, SQUARE.z0, SQUARE.x1, SQUARE.z1, [PIT2, METRO])) flat(x0, z0, x1, z1, m.pavement);
    flat(-22, -8, -8, 4, m.grass, 0.02);
    flat(8, 0, 14, 9, m.grass, 0.02);
    // Lane markings + zebra crossing (Gábor's way home).
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 });
    for (let x = -24; x < 60; x += 6) flat(x, 16.92, x + 3, 17.08, paint, 0.03);
    for (let z = 14.3; z < 19.8; z += 0.9) flat(0.6, z, 2.6, z + 0.45, paint, 0.03);
    // Puddles reflect the sodium lamps.
    const puddle = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.03, metalness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -4 });
    for (const [x, z, s] of [[3, -6, 2.2], [-6, 0, 1.6], [12, -2, 1.8], [8, 15.5, 2.4], [-3, 18, 2], [14, 10, 1.4], [-11, 9, 1.6], [-30, 20, 2], [-38, 31, 1.6]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(s / 2, 28), puddle);
      p.rotation.x = -Math.PI / 2;
      p.scale.set(1, 0.6, 1);
      p.position.set(x, 0.04, z);
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
    this.ilonkaClosed = windowTexture('#ffcf8a', 'curtain');
    this.ilonkaOpen = windowTexture('#ffd9a0', null);
    this.ilonkaWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.35), new THREE.MeshBasicMaterial({ map: this.ilonkaClosed }));
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
    const csTag = tag('CSILLAG', '#7ad0ff', 1.6, 0.55);
    csTag.position.set(e.x0 - 0.02, 1.2, -10.5);
    csTag.rotation.y = -Math.PI / 2;
    this.add(csTag);

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
    const tags = ['ROBI', 'FTC', 'K+D', 'ZUGLÓ', 'NO FUTURE', 'HÉV', 'DANI', 'X'];
    for (let k = 0; k < 8; k++) {
      const z0 = g.z0 + k * 3;
      if (z0 === g.openZ0) continue;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.1), m.garage);
      door.position.set(g.x0 - 0.01, 1.05, z0 + 1.5);
      door.rotation.y = -Math.PI / 2;
      this.add(door);
      if (tags[k]) {
        const t = tag(tags[k], ['#ff5a5a', '#9cff6a', '#ff9de0', '#6ad8ff'][k % 4], 2.3, 0.8, k % 3 === 1);
        t.position.set(g.x0 - 0.02, 1.0 + (k % 2) * 0.25, z0 + 1.5 + ((k * 7) % 5 - 2) * 0.08);
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
    this.wall(32, 12, 32.2, 22, 4);
    this.box(12, 0, 22.4, 32, 2, 22.6, m.brick);
    // Playable-area shell, tall enough that no roof or fence can be jumped over.
    const H = 9;
    this.wall(-24.3, -14.2, -24.1, 12, H);   // courtyard west, behind the fence
    this.wall(-26, 11.8, -24.1, 12, H);      // street west corner, north cap
    // (street west end is open: it runs into Csillag tér — see buildSquare)
    this.wall(22.1, -14.2, 22.3, 12, H);     // behind the garages (roof is higher than the fence)
    this.wall(22.1, 11.8, 32.2, 12, H);      // street east corner, north cap
    this.wall(32.2, 11.8, 32.4, 22.8, H);    // street east
    this.wall(12, 22.6, 32.4, 22.8, H);      // street east, south
    this.wall(12, -14.4, 22.3, -14.2, H);    // north-east, behind the brick wall
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
    // Pit + tunnel walls stay below ground; the 0.9 m parapets only frame the open pit
    // (z0..z1) — past z1 the road runs over the tunnel.
    this.box(p.x0 - 0.25, -3.3, p.z0, p.x0, 0, 20, m.concrete);
    this.box(p.x1, -3.3, p.z0, p.x1 + 0.25, 0, 20, m.concrete);
    this.box(p.x0 - 0.25, 0, p.z0, p.x0, 0.9, p.z1, m.concrete);
    this.box(p.x1, 0, p.z0, p.x1 + 0.25, 0.9, p.z1, m.concrete);
    this.box(p.x0 - 0.25, 0, p.z1 - 0.25, p.x1 + 0.25, 0.9, p.z1, m.concrete); // south rail over the tunnel mouth
    // Ramp collider under visual steps: from (z0, y0) down to (z1, -3).
    const len = Math.hypot(p.z1 - p.z0, 3);
    const ang = Math.atan2(3, p.z1 - p.z0);
    const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), ang);
    const center = V((p.x0 + p.x1) / 2, -1.5 - 0.1, (p.z0 + p.z1) / 2);
    this.physics.addFixedBoxQ(center, V(p.x1 - p.x0, 0.2, len), q);
    for (let i = 0; i < 10; i++) {
      const z0 = p.z0 + i * 0.5;
      this.box(p.x0, -3.3, z0, p.x1, -0.3 * (i + 0.5), z0 + 0.5, m.concrete, { collide: false });
    }
    // Tunnel floor + ceiling under the road.
    this.box(p.x0, -3.3, p.z1, p.x1, -3, 20, m.concrete);
    this.box(p.x0, -0.6, p.z1, p.x1, -0.3, 20, m.concrete, { collide: false });
    // (tunnel opens into the hall at z 20 — see buildHall)
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
    // Ceiling lamp halfway down the tunnel (the hall's fire is further in).
    const tl = new THREE.PointLight(0xa8c0ff, 3, 7, 1.6);
    tl.position.set(-14.5, -0.9, 15.5);
    this.add(tl);
    this.add(streetLamp(-11.3, 7.5, V(-1, 0, 0)).group);
  }

  /** Chapter 4 — the underpass hall: fire barrel, cardboard beds, Csont, Marika, Laci, Tomi. */
  private buildHall() {
    const m = this.mats, h = HALL;
    const tile = new THREE.MeshStandardMaterial({ name: 'underpass_tile', color: 0x8a8578, roughness: 0.8, map: panelTexture() });
    const cardboard = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1 });
    const blanket = new THREE.MeshStandardMaterial({ color: 0x5a3a4a, roughness: 1 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 });
    // Floor, shadow-casting ceiling, walls (tunnel opening north, corridor opening west).
    this.box(h.x0, -3.3, h.z0, h.x1, -3, h.z1, tile);
    this.box(h.x0, -0.6, h.z0, h.x1, -0.3, h.z1, m.concrete, { collide: false });
    this.box(h.x0, -3.3, h.z0 - 0.25, PIT.x0 - 0.25, -0.3, h.z0, tile);
    this.box(PIT.x1 + 0.25, -3.3, h.z0 - 0.25, h.x1, -0.3, h.z0, tile);
    this.box(h.x0, -3.3, h.z1, h.x1, -0.3, h.z1 + 0.25, tile);
    this.box(h.x1, -3.3, h.z0, h.x1 + 0.25, -0.3, h.z1, tile);
    this.box(h.x0 - 0.25, -3.3, h.z0, h.x0, -0.3, PIT2.z0 - 0.25, tile);
    this.box(h.x0 - 0.25, -3.3, PIT2.z1 + 0.25, h.x0, -0.3, h.z1, tile);
    // Shuttered shops along the north wall.
    for (const [x, name, col] of [[-21.5, 'TRAFIK', '#c8c0a0'], [-9, 'VIRÁG', '#e09ab0'], [-19, 'NO FUTURE', '#ff5a5a']] as const) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), m.garage);
      sh.position.set(x, -1.9, h.z0 + 0.02);
      this.add(sh);
      const t = name === 'NO FUTURE' ? tag(name, col, 2.2, 0.6) : graffiti(name, col, 2, 0.45);
      t.position.set(x, name === 'NO FUTURE' ? -2.2 : -0.85, h.z0 + 0.03);
      this.add(t);
    }

    // West corridor and stairs up to Csillag tér (rising westwards).
    this.box(PIT2.x1, -3.3, PIT2.z0, h.x0, -3, PIT2.z1, tile);
    this.box(PIT2.x1, -0.6, PIT2.z0, h.x0, -0.3, PIT2.z1, m.concrete, { collide: false });
    this.box(PIT2.x0, -3.3, PIT2.z0 - 0.25, h.x0, 0, PIT2.z0, m.concrete);
    this.box(PIT2.x0, -3.3, PIT2.z1, h.x0, 0, PIT2.z1 + 0.25, m.concrete);
    const run = PIT2.x1 - PIT2.x0;
    const ang = Math.atan2(3, run);
    this.physics.addFixedBoxQ(V((PIT2.x0 + PIT2.x1) / 2, -1.6, (PIT2.z0 + PIT2.z1) / 2), V(Math.hypot(run, 3), 0.2, PIT2.z1 - PIT2.z0),
      new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -ang));
    for (let i = 0; i < 12; i++) {
      const x0 = PIT2.x0 + i * 0.5;
      this.box(x0, -3.3, PIT2.z0, x0 + 0.5, -3 * (i + 0.5) / 12, PIT2.z1, m.concrete, { collide: false });
    }
    // Parapets around the stair hole on the square; the west end is the way in.
    this.box(PIT2.x0, 0, PIT2.z0 - 0.25, PIT2.x1 + 0.25, 0.9, PIT2.z0, m.concrete);
    this.box(PIT2.x0, 0, PIT2.z1, PIT2.x1 + 0.25, 0.9, PIT2.z1 + 0.25, m.concrete);
    this.box(PIT2.x1, 0, PIT2.z0, PIT2.x1 + 0.25, 0.9, PIT2.z1, m.concrete);
    const board = graffiti('ALULJÁRÓ', '#e8f0ff', 2.6, 0.45);
    (board.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x9ab8ff);
    (board.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    board.position.set(PIT2.x1 + 0.27, 1.4, (PIT2.z0 + PIT2.z1) / 2);
    board.rotation.y = -Math.PI / 2;
    this.add(board);
    const cool = new THREE.PointLight(0x9ab8ff, 4, 8, 1.6);
    cool.position.set(-25, -1, 27.5);
    this.add(cool);

    // The camp: fire barrel, beds, Marika's shopping cart, Laci's radio crate.
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.85, 16), new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.7, metalness: 0.5 }));
    barrel.position.set(FIRE.x, FIRE.y + 0.425, FIRE.z);
    barrel.castShadow = true;
    this.add(barrel);
    this.physics.addFixedBox(V(FIRE.x, FIRE.y + 0.45, FIRE.z), V(0.6, 0.9, 0.6));
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flame.position.set(FIRE.x, FIRE.y + 1.1, FIRE.z);
    this.add(this.flame);
    this.underpassLight = new THREE.PointLight(0xff7a30, 12, 11, 1.4);
    this.underpassLight.position.set(FIRE.x, FIRE.y + 1.4, FIRE.z);
    this.add(this.underpassLight);
    for (const [x0, z0, x1, z1] of [[-22.8, 30, -20.4, 31.4], [-20, 30.2, -18, 31.6], [-23.4, 23, -22.2, 25.4]]) {
      this.box(x0, -3, z0, x1, -2.88, z1, cardboard, { collide: false });
      this.box(x0 + 0.1, -2.88, z0 + 0.1, x1 - 0.3, -2.8, z1 - 0.1, blanket, { collide: false });
    }
    this.box(CSONT_BED.x - 0.7, -3, CSONT_BED.z - 0.45, CSONT_BED.x + 0.7, -2.9, CSONT_BED.z + 0.45, blanket, { collide: false });
    this.box(-18.2, -3, 27.2, -17.6, -2.1, 28.0, m.metal); // shopping cart
    this.box(-13.4, -3, 25.0, -12.6, -2.5, 25.6, wood);    // radio crate
    this.box(-13.25, -2.5, 25.1, -12.75, -2.25, 25.4, new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5 }), { collide: false });
    // Escape crates by the tunnel mouth (out of Csont's reach).
    this.box(-18.6, -3, 20.2, -17.4, -1.95, 21.4, wood);
    this.box(-12.6, -3, 20.2, -11.6, -2.15, 21.0, wood);
    // Tomi's corner: the shuttered kiosk where Csont's ball always ends up.
    const k = KIOSK_IN;
    this.box(k.x0, -3, k.z0, k.x1, -3 + k.h, k.z1, new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.6, metalness: 0.3 }));
    this.box(k.x0 - 1.2, -3, 30.4, k.x0 - 0.2, -2.2, 31.4, wood);
    const kTag = graffiti('ÚJSÁG', '#f4e4a0', 1.6, 0.35);
    kTag.position.set((k.x0 + k.x1) / 2, -1.6, k.z0 - 0.01);
    kTag.rotation.y = Math.PI;
    this.add(kTag);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8302a, roughness: 0.5 }));
    this.ball.position.set(-9.2, -3 + k.h + 0.075, 30.3);
    this.add(this.ball);
    this.bread = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.09), new THREE.MeshStandardMaterial({ color: 0xc08a48, roughness: 0.9 }));
    this.bread.position.set(-16.1, -2.96, 26.9);
    this.bread.visible = false;
    this.add(this.bread);

    // People (NARRATIVA ch. 4 ✅, looks from KARAKTEREK.md).
    this.marika = new Human({ height: 1.5, build: 1.3, coat: 0x7a5a6a, coatLength: 0.7, legs: 0x4a4a52, skin: 0xe0b090, hair: 0x9a8a80, hat: 0xc02a2a }, this.physics);
    this.marika.place(V(-16.5, -3, 27.4), 2.4);
    this.laci = new Human({ height: 1.8, build: 1.3, coat: 0x41505e, coatLength: 0.6, legs: 0x34343a, skin: 0xd8a888, hair: 0xd8d4cc }, this.physics);
    this.laci.place(V(-13.7, -3, 27.3), -2.2);
    this.tomi = new Human({ height: 1.74, build: 0.85, coat: 0x34402f, coatLength: 0, hood: true, legs: 0x26262c, skin: 0xd8a888, hair: 0x3a2a20 }, this.physics);
    this.tomi.place(V(-11.4, -3, 31.0), Math.PI);
    for (const p of [this.marika, this.laci, this.tomi]) this.add(p.root);
    this.csont.place(CSONT_BED, Math.PI);
    this.add(this.csont.root);
  }

  /** Chapter 5 — Csillag tér: the closed metro entrance, the Kórus on the kiosk. */
  private buildSquare() {
    const m = this.mats, q = SQUARE, H = 9;
    // Shell.
    this.wall(q.x0, q.z0 - 0.2, q.x1, q.z0, H);
    this.wall(q.x0 - 0.2, q.z0, q.x0, q.z1, H);
    this.wall(q.x0, q.z1, -24, q.z1 + 0.2, H);
    this.wall(-24.2, 22, -24, q.z1, H);
    // Edges: a brick wall west, a low fence north, backdrop blocks.
    this.box(q.x0 - 0.3, 0, q.z0, q.x0, 2.4, q.z1, m.brick);
    this.box(q.x0, 0, q.z0 - 0.1, q.x1, 1.2, q.z0, m.metal);
    this.add(panelBlock({ x0: -54, x1: -24, z0: q.z1 + 0.3, z1: q.z1 + 10, floors: 5, faces: ['n'], material: m.panel4, litChance: 0.2 }).group);
    this.add(panelBlock({ x0: -51, x1: -27, z0: -4, z1: 6, floors: 5, faces: ['s'], material: m.panel, litChance: 0.22 }).group);
    // The star mosaic the square is named after.
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 1.1 : 2.6, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const mosaic = new THREE.Mesh(new THREE.ShapeGeometry(star), new THREE.MeshStandardMaterial({ color: 0xb8963a, roughness: 0.35, metalness: 0.3 }));
    mosaic.rotation.x = -Math.PI / 2;
    mosaic.position.set(-35, 0.012, 23);
    mosaic.receiveShadow = true;
    this.add(mosaic);

    // Metro entrance pavilion (never finished, chained up) — Bori is down the stairs.
    const M = METRO;
    const tiles = new THREE.MeshStandardMaterial({ color: 0xb8b4a8, roughness: 0.5, map: panelTexture() });
    this.box(M.x0 - 0.25, -3.3, M.z0, M.x0, 2.6, M.z1 + 0.25, m.concrete);
    this.box(M.x1, -3.3, M.z0, M.x1 + 0.25, 2.6, M.z1 + 0.25, m.concrete);
    this.box(M.x0, -3.3, M.z1, M.x1, 2.6, M.z1 + 0.25, tiles);
    this.box(M.x0 - 0.4, 2.6, M.z0 - 0.3, M.x1 + 0.4, 2.8, M.z1 + 0.4, m.concrete);
    this.box(M.x0 - 0.25, 2.4, M.z0 - 0.25, M.x1 + 0.25, 2.6, M.z0, m.concrete);
    this.box(M.x0, -3.3, 29, M.x1, -3, M.z1, tiles);
    const run = 29 - M.z0;
    const ang = Math.atan2(3, run);
    this.physics.addFixedBoxQ(V((M.x0 + M.x1) / 2, -1.6, (M.z0 + 29) / 2), V(M.x1 - M.x0, 0.2, Math.hypot(run, 3)),
      new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), ang));
    for (let i = 0; i < 10; i++) {
      const z0 = M.z0 + i * 0.5;
      this.box(M.x0, -3.3, z0, M.x1, -3 * (i + 0.5) / 10, z0 + 0.5, tiles, { collide: false });
    }
    const mSign = graffiti('M', '#ff3a30', 0.7, 0.7);
    (mSign.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xff2a20);
    (mSign.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
    mSign.position.set((M.x0 + M.x1) / 2, 2.72, M.z0 - 0.42);
    mSign.rotation.y = Math.PI;
    this.add(mSign);
    const name = graffiti('CSILLAG TÉR', '#e8e2d0', 2.6, 0.4);
    name.position.set((M.x0 + M.x1) / 2, 2.15, M.z0 - 0.27);
    name.rotation.y = Math.PI;
    this.add(name);
    // Bori's mural on the back wall, big.
    const mural = catSign(null, false);
    mural.scale.setScalar(3.2);
    mural.position.set((M.x0 + M.x1) / 2, -1.5, M.z1 - 0.03);
    mural.rotation.y = Math.PI;
    this.add(mural);
    this.signs.push(mural);
    // The grille: bars + Robi's padlock. Its collider is what keeps the cat out.
    this.grille = new THREE.Group();
    const bar = new THREE.MeshStandardMaterial({ color: 0x3a3c3a, roughness: 0.5, metalness: 0.7 });
    for (let x = M.x0 + 0.1; x < M.x1; x += 0.12) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.4, 0.025), bar);
      b.position.set(x, 1.2, 0);
      this.grille.add(b);
    }
    for (const y of [0.1, 1.2, 2.3]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(M.x1 - M.x0, 0.05, 0.04), bar);
      b.position.set((M.x0 + M.x1) / 2, y, 0);
      this.grille.add(b);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.05), new THREE.MeshStandardMaterial({ color: 0xc8a030, metalness: 0.8, roughness: 0.3 }));
    lock.position.set(-44, 1.05, -0.05);
    this.grille.add(lock);
    this.grille.position.z = M.z0 - 0.12;
    this.add(this.grille);
    this.grilleCollider = this.physics.addFixedBox(V(-44, 1.2, M.z0 - 0.12), V(M.x1 - M.x0, 2.4, 0.12));
    this.metroLight = new THREE.PointLight(0x9ab0ff, 3, 7, 1.6);
    this.metroLight.position.set(-44, -0.8, 28.5);
    this.add(this.metroLight);
    // Sign #4: on the pavilion's east wall, arrow round the corner to the grille.
    const s4 = catSign(Math.PI / 2, true);
    s4.position.copy(SIGN4);
    s4.rotation.y = Math.PI / 2;
    s4.scale.setScalar(0.8);
    this.add(s4);
    this.signs.push(s4);
    // Bori ✅: yellow jacket, sitting at the bottom of the stairs, ankle twisted.
    this.bori = new Human({ height: 1.62, build: 0.9, coat: 0xf2c230, coatLength: 0, legs: 0x2a3448, skin: 0xe8b898, hair: 0x4a2a1a });
    this.bori.place(BORI_SPOT, Math.PI);
    this.bori.crouch = 1;
    this.add(this.bori.root);
    this.bori.setVisible(false);

    // Newspaper kiosk with the Kórus on its roof.
    const K = SQ_KIOSK;
    this.box(K.x0, 0, K.z0, K.x1, K.h, K.z1, new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: 0.6, metalness: 0.3 }));
    this.box(K.x0 - 0.2, K.h, K.z0 - 0.2, K.x1 + 0.2, K.h + 0.1, K.z1 + 0.2, m.metal);
    const news = graffiti('ÚJSÁG · DOHÁNY', '#f4e4a0', 2.2, 0.35);
    news.position.set(K.x1 + 0.01, 2.0, (K.z0 + K.z1) / 2);
    news.rotation.y = Math.PI / 2;
    this.add(news);
    const grey = new THREE.MeshStandardMaterial({ color: 0x7a7e86, roughness: 0.8 });
    const neck = new THREE.MeshStandardMaterial({ color: 0x4a6a62, roughness: 0.5, metalness: 0.3 });
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), grey);
      body.scale.set(0.8, 0.8, 1.3);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), neck);
      head.position.set(0, 0.08, 0.1);
      p.add(body, head);
      const home = V(K.x0 + 0.2 + (i % 4) * 0.6, K.h + 0.18, K.z0 + 0.4 + Math.floor(i / 4) * 1.4);
      p.position.copy(home);
      p.rotation.y = Math.random() * Math.PI * 2;
      this.add(p);
      this.pigeons.push({ obj: p, home, from: home.clone(), to: home.clone(), t: 1 });
    }
    // Benches, a phone booth, trees, lamps.
    for (const [x0, z0, x1, z1] of [[-31, 30, -29.2, 30.5], [-40.5, 17, -38.7, 17.5]]) {
      this.box(x0, 0.38, z0, x1, 0.45, z1, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 }));
    }
    this.box(-49.5, 0, 14, -48.5, 2.3, 15, m.glass, { shadow: false });
    this.box(-49.55, 2.3, 13.95, -48.45, 2.4, 15.05, new THREE.MeshStandardMaterial({ color: 0x2a5a9a }));
    for (const [x, z, sc] of [[-49, 22, 1.1], [-49, 32, 1], [-28, 33.5, 0.9]]) this.add(tree(x, z, sc));
    this.add(streetLamp(-38, 20.5, V(1, 0, 0)).group);
    this.add(streetLamp(-29.5, 32, V(0, 0, -1), { light: false }).group);
    this.police = new THREE.PointLight(0x3060ff, 0, 18, 1.4);
    this.police.position.set(-30, 1.6, 17);
    this.add(this.police);
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
    // Standing *in* the open window: back half inside the wall, legs hidden by the sill,
    // only the upper body leans out over the sill.
    this.ilonka.place(V(ILONKA_WIN.x - 0.25, 0, FACADE_Z - 0.06), 0);
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
      enabled: () => !this.flags.ilonka && this.stage !== 'intro' && STAGE_ORDER.indexOf(this.stage) < STAGE_ORDER.indexOf('fetch'),
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
          this.setIlonkaOpen(false);
        });
      },
    });
    const sniffSign = (id: string, pos: THREE.Vector3, band: [number, number], after: () => void) => I.add({
      id, label: 'Szaglászás', radius: 1.6, heightBand: band,
      position: () => (pos === SIGN3 ? V(-15.4, -0.6, pos.z) : pos === SIGN4 ? V(pos.x + 0.4, 0, pos.z) : V(pos.x, 0, pos.z + 0.4)),
      onInteract: () => { faceTo(pos); cat().doSniff(); after(); },
    });
    sniffSign('sign1', SIGN1, [-0.5, 2.2], () => this.script.run(() => this.beatSign1()));
    sniffSign('sign2', SIGN2, [-3, 0.6], () => this.script.run(() => this.beatSign2()));
    sniffSign('sign3', SIGN3, [-0.8, 1], () => this.script.run(() => this.beatSign3()));
    sniffSign('sign4', SIGN4, [-0.6, 1.6], () => this.script.run(() => this.beatSign4()));
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
        this.keychainAt = this.clock;
        this.dialogue.showHint('Egy kulcstartó — a kis sárga cicát <b>Bori</b> rajzolta rá. Dani zsebéből eshetett ki. Bori jele a <b>garázssor déli végén</b> folytatódik.', 6000);
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

    // ── chapter 4: the underpass ──
    I.add({
      id: 'ball', label: 'Felvétel', radius: 0.6, heightBand: [-0.3, 0.4],
      position: () => this.ball.getWorldPosition(new THREE.Vector3()),
      enabled: () => !this.flags.ball,
      onInteract: () => {
        this.flags.ball = true;
        this.refreshMouth();
        this.dialogue.showHint('Csont labdája. Vidd oda <b>Csontnak</b>.', 4000);
      },
    });
    I.add({
      id: 'giveBall', label: 'Labda odaadása', radius: 1.8, heightBand: [-0.5, 0.5],
      position: () => this.csont.root.position,
      enabled: () => this.flags.ball && !this.flags.ballGiven && this.csont.root.visible,
      onInteract: () => { faceTo(this.csont.root.position); this.script.run(() => this.beatBall()); },
    });
    I.add({
      id: 'bread', label: 'Felvétel', radius: 1.0, heightBand: [-0.3, 0.4],
      position: () => this.bread.position,
      enabled: () => this.bread.visible && !this.flags.bread,
      onInteract: () => {
        this.flags.bread = true;
        this.refreshMouth();
        this.dialogue.showHint('Egy darab kenyér. A <b>galamboknak</b>, a Csillag téren.', 4000);
      },
    });
    // ── chapter 5: Csillag tér ──
    I.add({
      id: 'feedPigeons', label: 'Kenyér letétele', radius: 4.5, heightBand: [-0.5, 0.5],
      position: () => V((SQ_KIOSK.x0 + SQ_KIOSK.x1) / 2, 0, SQ_KIOSK.z1 + 1),
      enabled: () => this.flags.bread && !this.flags.pigeons && this.cat().feet.y > -0.3,
      onInteract: () => this.script.run(() => this.beatPigeons()),
    });
    // ── who comes to help (depends on the trust you built) ──
    I.add({
      id: 'callGabor', label: 'Nyávogás', action: 'meow', radius: 3.2, heightBand: [-0.6, 3],
      position: () => GABOR_DOOR,
      enabled: () => this.stage === 'fetch' && !this.helper && this.flags.gaborTrust,
      onInteract: () => this.script.run(() => this.fetchGabor()),
    });
    I.add({
      id: 'callLaci', label: 'Nyávogás', action: 'meow', radius: 3.5, heightBand: [-0.6, 1.5],
      position: () => this.laci.root.position,
      enabled: () => this.stage === 'fetch' && !this.helper && this.flags.ballGiven,
      onInteract: () => this.script.run(() => this.fetchLaci()),
    });
    I.add({
      id: 'giveKeychain', label: 'Kulcstartó odaadása', radius: 3, heightBand: [-0.6, 0.6],
      position: () => this.boys[1].root.position,
      enabled: () => this.stage === 'fetch' && !this.helper && this.flags.keychain,
      onInteract: () => this.script.run(() => this.fetchDani()),
    });
    I.add({
      id: 'callIlonka', label: 'Nyávogás', action: 'meow', radius: 2.6, heightBand: [-1, 1.4],
      position: () => V(ILONKA_WIN.x, 0, FACADE_Z + 0.6),
      enabled: () => this.stage === 'fetch' && !this.helper,
      onInteract: () => this.script.run(() => this.fetchIlonka()),
    });
  }

  /** One thing in the mouth at a time; the story flags keep the rest. */
  private refreshMouth() {
    const f = this.flags;
    const want = f.ball && !f.ballGiven ? this.ball
      : f.bread && !f.pigeons ? this.bread
      : f.keychain && this.helper !== 'dani' ? this.keychain : null;
    const cat = this.cat();
    if (cat.carrying === want) return;
    if (cat.carrying) cat.carrying.visible = false;
    if (want) { want.visible = true; want.scale.setScalar(want === this.keychain ? 0.8 : 1); }
    cat.carry(want);
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
    await s.say('Judit', 'Szotyi! Hol van ez a macska… Na mindegy, késésben vagyok.');
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
    this.setIlonkaOpen(true);
    this.ilonka.setVisible(true);
    this.ilonka.lookTarget = this.cat().root.position;
    this.ilonka.talking = true;
    await s.say('Ilonka néni', 'Nahát, Szotyi! Te meg mit keresel idekint ilyen időben?');
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
    // Sniffed late (sign #2 already found)? Just count it — never rewind the story.
    if (this.stage !== 'intro' && this.stage !== 'descend' && this.stage !== 'courtyard') return;
    await this.script.wait(1.5);
    if (this.stage !== 'intro' && this.stage !== 'descend' && this.stage !== 'courtyard') return;
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
    // Escorting him is optional: he waits a while at the door, then goes in alone.
    const t0 = this.clock;
    await s.until(() => this.cat().feet.distanceTo(GABOR_DOOR) < 3.5 || this.gaborGaveUp || this.clock - t0 > 12);
    if (!this.gaborGaveUp && this.cat().feet.distanceTo(GABOR_DOOR) < 3.5) {
      this.flags.gaborTrust = true;
      this.gabor.crouch = 0.7;
      this.gabor.talking = true;
      await s.say('Gábor', 'Várj csak… te vagy a sárga kabátos lány cicája, ugye? A szemközti házból.');
      await s.say('Gábor', 'Mindig ilyen későn jár haza. Mint én.');
      await s.say('Gábor', 'Ha bármi baj van, kis szürke, a földszinten lakom. Na, menj haza. Biztos vár téged.', 0.4);
      this.gabor.talking = false;
      this.gabor.crouch = 0;
    } else {
      await s.say('Gábor', 'Na jó. Akkor szia, kis szürke.');
    }
    this.gabor.lookTarget = null;
    await s.wait(0.6);
    await this.gabor.walkTo([V(1.5, 0, 21.9)]);
    this.gabor.setVisible(false);
    this.audio.thumpDoor();
    this.flags.gaborHome = true;
    if (this.stage === 'escort') this.stage = 'toUnderpass';
    await s.wait(1);
    this.dialogue.showHint('Haza? Bori nincs otthon. A szagnyom az <b>aluljáró</b> felé vezet.', 5000);
  }

  private async beatSign3() {
    if (!this.flags.gaborHome) {
      this.dialogue.showHint('Bori jele, lefelé mutat. De a nyom még a <b>buszmegálló</b> felé is visz…');
      return;
    }
    if (this.stage !== 'toUnderpass') { this.dialogue.showHint('Bori jele lefelé mutat — az <b>aluljáróba</b>.'); return; }
    await this.script.wait(1.1);
    this.dialogue.showHint('Bori lement. Lentről tűz pattog és egy rádió szól.', 4000);
    this.stage = 'hall';
    await this.script.wait(1.4);
    this.dialogue.showCard('4 — Aluljáró', '22:00');
  }

  // ── chapter 4 ──

  private async beatCsont() {
    const s = this.script, cat = this.cat();
    this.flags.csontMet = true;
    const d = this.csont;
    d.lookTarget = cat.root.position;
    d.barking = true;
    this.audio.bark(3);
    const to = cat.feet.clone().sub(d.root.position).setY(0);
    const stop = d.root.position.clone().addScaledVector(to.normalize(), Math.max(0, cat.feet.distanceTo(d.root.position) - 1.4));
    d.walkTo([stop.setY(-3)]);
    this.dialogue.showHint('Egy kutya! <b>Ugorj fel</b> valahova — a ládákra.', 4500);
    const t0 = this.clock;
    let k = 0;
    await s.until(() => {
      if (this.clock - t0 > 1.2 * (k + 1)) { k++; this.audio.bark(2); }
      return cat.feet.y > -2.3 || this.clock - t0 > 7;
    });
    this.tomi.lookTarget = d.root.position;
    this.tomi.talking = true;
    await s.say('Tomi', 'Csont! Ül! Hagyd a cicát.');
    this.tomi.talking = false;
    d.barking = false;
    d.lookTarget = null;
    await d.walkTo([CSONT_BED]);
    d.lying = true;
    d.wag = 0.25;
    this.marika.lookTarget = cat.root.position;
    this.marika.talking = true;
    await s.say('Marika', 'Nahát… Ez a kis festő macskája! Szotyi, ugye? Gyere, gyere ide a tűzhöz.');
    this.marika.talking = false;
    this.tomi.talking = true;
    await s.say('Tomi', 'Nem bánt. Csak öreg. És hangos.');
    this.tomi.talking = false;
    this.tomi.lookTarget = null;
    if (this.stage === 'hall') this.stage = 'camp';
  }

  private async beatCamp() {
    const s = this.script, cat = this.cat();
    this.flags.camp = true;
    this.laci.lookTarget = cat.root.position;
    this.marika.lookTarget = cat.root.position;
    this.laci.crouch = 0.5;
    this.laci.talking = true;
    await s.say('Laci', '…Ez a csonka fül. Kis Ördög? Hazajöttél?');
    await s.say('Laci', 'Én etettelek, amikor ekkora voltál. Aztán jött egy sárga kabátos kislány, és hazavitt. Jól tette.');
    this.laci.talking = false;
    this.marika.talking = true;
    await s.say('Marika', 'A kis festő! Itt ment át este, festékszagú volt a kabátja. Fel a térre, a túlsó lépcsőn.');
    await s.say('Marika', 'Mondtam neki, hogy ilyenkor ne mászkáljon. Rám hallgat valaki? Senki.');
    this.bread.visible = true;
    await s.say('Marika', 'Tessék, vidd ezt a kenyeret. A téren a galambok mindent látnak — csak etetni kell őket.');
    this.marika.talking = false;
    this.laci.crouch = 0;
    if (this.stage === 'camp' || this.stage === 'hall') this.stage = 'toSquare';
    await s.wait(0.8);
    this.tomi.lookTarget = cat.root.position;
    this.tomi.talking = true;
    await s.say('Tomi', 'Csont labdája megint fent van az újságos tetején. Én már nem érem el…');
    this.tomi.talking = false;
    this.tomi.lookTarget = null;
    this.marika.lookTarget = this.laci.lookTarget = null;
    this.dialogue.showHint('Bori nyoma a <b>nyugati lépcsőn</b> megy fel a Csillag térre. (A labda és a kenyér nem kötelező.)', 6000);
  }

  private async beatBall() {
    const s = this.script, d = this.csont;
    this.flags.ballGiven = true;
    this.refreshMouth();
    this.ball.visible = true;
    this.ball.position.copy(d.root.position).add(V(Math.sin(d.yaw) * 0.45, 0.075, Math.cos(d.yaw) * 0.45));
    this.add(this.ball);
    d.lying = false;
    d.wag = 1;
    this.audio.bark(1);
    await s.wait(0.6);
    this.tomi.talking = true;
    await s.say('Tomi', 'Nézd, Csont… barátod lett.');
    this.tomi.talking = false;
    this.laci.talking = true;
    await s.say('Laci', 'Ha bármi baj van, Kis Ördög, tudod, hol találsz.');
    this.laci.talking = false;
    this.dialogue.showHint('<b>Bizalom: az aluljáró.</b> Laci bácsi segítene, ha kell.', 4500);
    await s.wait(3);
    d.lying = true;
    d.wag = 0.5;
  }

  // ── chapter 5: Csillag tér ──

  private beatSquare() {
    this.stage = 'square';
    this.sky.clearTarget = 1;
    this.bori.setVisible(true);
    this.script.run(async () => {
      this.dialogue.showCard('5 — Csillag tér', '23:10');
      await this.script.wait(3.5);
      this.dialogue.showHint('Elállt az eső. A Csillag tér fölött kitisztul az ég.', 5000);
      await this.script.wait(6);
      if (this.stage === 'square') this.dialogue.showHint('A régi <b>metrólejáró</b>… Bori festékszaga onnan jön.', 5000);
    });
  }

  private async beatPigeons() {
    const s = this.script, cat = this.cat();
    this.flags.pigeons = true;
    const at = cat.feet.clone().add(cat.forward().multiplyScalar(0.35)).setY(0.035);
    this.refreshMouth();
    this.bread.visible = true;
    this.bread.position.copy(at);
    this.add(this.bread);
    this.audio.flutter();
    this.pigeons.forEach((p, i) => {
      p.from = p.obj.position.clone();
      p.to = at.clone().add(V(Math.cos(i * 0.9) * (0.35 + (i % 3) * 0.12), 0.06, Math.sin(i * 0.9) * (0.35 + (i % 3) * 0.12)));
      p.t = -i * 0.08;
    });
    await s.wait(1.6);
    await s.say('A Kórus', 'Kenyér! Kenyér! Kenyér! Kenyér!');
    await s.say('A Kórus', 'A sárga kabátos? Lement, lement! Lement a Csillag alá!');
    await s.say('A Kórus', 'A rács, a rács — bezárták! A fiúk! Nevettek, nevettek!');
    await s.say('A Kórus', 'Ott, ott, ott! A régi metró! Kenyér!');
    this.bread.visible = false;
  }

  private async beatSign4() {
    if (this.flags.bori) { this.dialogue.showHint('Bori jele. Ő ott van lent, a rács mögött.'); return; }
    this.flags.sign4 = true;
    await this.script.wait(1.1);
    this.dialogue.showHint('Bori festéke. Friss. A nyíl a <b>rács</b> felé mutat, a sarkon túl.', 4500);
  }

  private async beatBori() {
    const s = this.script, b = this.bori, cat = this.cat();
    this.flags.bori = true;
    b.lookTarget = cat.root.position;
    b.talking = true;
    await s.say('Bori', '…Ki van ott? Robi, ha te vagy az, ez nem vicces!');
    this.audio.meow(1.1);
    await s.wait(0.8);
    await s.say('Bori', 'Szotyi?! SZOTYI! Te vagy az?');
    await s.say('Bori', 'Te hülye macska… Hogy kerültél ide?');
    await s.say('Bori', 'Robi rám zárta a rácsot, viccből. Aztán megcsúsztam a lépcsőn… a bokám.');
    await s.say('Bori', 'A telefonom lemerült. Hideg van, és lent már áll a víz.');
    await s.say('Bori', 'Szotyi. Hozz valakit. Bárkit. Kérlek.', 0.6);
    b.talking = false;
    this.stage = 'fetch';
    this.dialogue.showCard('6 — Kit hozol?', '23:40');
    await s.wait(3.5);
    this.dialogue.showHint(`Ki segíthet? ${this.helperList()}`, 9000);
  }

  /** Who can be fetched with the trust built so far (Ilonka néni always). */
  private helperList() {
    const f = this.flags, out: string[] = [];
    if (f.ballGiven) out.push('<b>Laci bácsi</b> (aluljáró)');
    if (f.gaborTrust) out.push('<b>Gábor</b> (4-es ház, nyávogj az ajtónál)');
    if (f.keychain) out.push('<b>Dani</b> (garázs, vidd neki a kulcstartót)');
    out.push('<b>Ilonka néni</b> (7-es ház, földszint)');
    return out.join(' · ');
  }

  // ── chapter 6: fetching help ──

  private async fetchGabor() {
    const s = this.script, g = this.gabor;
    this.helper = 'gabor';
    this.stage = 'rescue';
    await s.wait(1.2);
    this.audio.thumpDoor();
    g.place(V(1.5, 0, 21.6), Math.PI);
    g.setVisible(true);
    g.lookTarget = this.cat().root.position;
    g.talking = true;
    await s.say('Gábor', 'Kis szürke? Hát te… Mi a baj? Valami történt, ugye.');
    await s.say('Gábor', 'Jó. Mutasd. Megyek.');
    g.talking = false;
    g.lookTarget = null;
    this.startFollow(g);
    this.dialogue.showHint('Vezesd Gábort a <b>Csillag térre</b>, a metrólejáró rácsához.', 5000);
  }

  private async fetchLaci() {
    const s = this.script, l = this.laci;
    this.helper = 'laci';
    this.stage = 'rescue';
    l.lookTarget = this.cat().root.position;
    l.crouch = 0.5;
    l.talking = true;
    await s.say('Laci', 'Mi az, Kis Ördög? …Megtaláltad, ugye. Látom rajtad.');
    l.crouch = 0;
    await s.say('Laci', 'Tomi, a zseblámpát. Csont, gyere. Marika, te vigyázz a tűzre.');
    l.talking = false;
    this.marika.talking = true;
    await s.say('Marika', 'Hogyisne! Siessetek már!');
    this.marika.talking = false;
    l.lookTarget = null;
    this.csont.lying = false;
    this.csont.wag = 0.8;
    this.startFollow(l);
    this.dialogue.showHint('Vezesd Laci bácsit (és Csontot) a <b>metrólejáróhoz</b>.', 5000);
  }

  private async fetchDani() {
    const s = this.script, [robi, dani] = this.boys;
    this.helper = 'dani';
    this.stage = 'rescue';
    const cat = this.cat();
    this.refreshMouth();
    this.keychain.visible = true;
    this.keychain.scale.setScalar(1);
    this.keychain.position.copy(cat.feet).add(cat.forward().multiplyScalar(0.3)).setY(cat.feet.y + 0.01);
    this.add(this.keychain);
    dani.lookTarget = cat.root.position;
    await dani.walkTo([this.keychain.position.clone().setY(0).add(V(0.5, 0, 0))]);
    dani.crouch = 1;
    await s.wait(0.8);
    this.group.remove(this.keychain);
    dani.crouch = 0;
    dani.talking = true;
    await s.say('Dani', 'Ez… az én kulcstartóm. Bori rajzolta rá a cicát.');
    await s.say('Dani', 'Te Bori macskája vagy. Ő küldött, ugye?');
    dani.talking = false;
    robi.talking = true;
    await s.say('Robi', 'Dani, ne csináld már. Reggel úgyis…');
    robi.talking = false;
    dani.talking = true;
    await s.say('Dani', 'Nem, Robi. Elég volt. A lakat kulcsa nálam van.');
    dani.talking = false;
    dani.lookTarget = null;
    this.startFollow(dani);
    this.dialogue.showHint('Vezesd Danit a <b>Csillag térre</b>, a rácshoz.', 5000);
  }

  private async fetchIlonka() {
    const s = this.script;
    this.helper = 'ilonka';
    this.stage = 'rescue';
    await s.wait(0.8);
    this.setIlonkaOpen(true);
    this.ilonka.setVisible(true);
    this.ilonka.lookTarget = this.cat().root.position;
    this.ilonka.talking = true;
    await s.say('Ilonka néni', 'Szotyi? Megint te? Mi van veled ma este, kincsem?');
    await s.say('Ilonka néni', '…Valami baj van. Ugye a Kertész lány? Tudtam én.');
    await s.say('Ilonka néni', 'Na jó. Felhívom a rendőrséget. Ilyen időben nem kóborol egy rendes lány.');
    this.ilonka.talking = false;
    this.ilonka.setVisible(false);
    this.setIlonkaOpen(false);
    this.dialogue.showHint('Siess vissza a <b>Csillag térre</b>.', 5000);
  }

  private startFollow(who: Human) {
    this.follow = { who, queue: [this.cat().feet.clone()], last: this.cat().feet.clone(), near: false, lostT: 0 };
  }

  // ── endings ──

  private async rescue() {
    const s = this.script, b = this.bori, who = this.helper;
    const h = who === 'gabor' ? this.gabor : who === 'laci' ? this.laci : who === 'dani' ? this.boys[1] : null;
    this.follow = null;
    if (h) {
      h.paused = false;
      await h.walkTo([V(-43.2, 0, 22.3)]);
      h.faceTo(V(-44, -2, 29));
      h.lookTarget = b.head.getWorldPosition(new THREE.Vector3());
    }
    b.lookTarget = h ? h.head.getWorldPosition(new THREE.Vector3()) : null;
    if (who === 'gabor' && h) {
      h.talking = true;
      await s.say('Gábor', 'Kislány? Ott lent vagy? A sárga kabátos…');
      h.talking = false;
      await s.say('Bori', 'Segítsen, kérem… nem tudok felmenni, és zárva a rács.');
      h.phoneUp = true;
      h.talking = true;
      await s.say('Gábor', 'Halló, mentők? Csillag tér, a régi metrólejáró. Egy lány van lent, bezárva, megsérült.');
      h.phoneUp = false;
      await s.say('Gábor', 'Már jönnek. Itt maradok, amíg ideérnek. Nem megyek sehova.');
      h.talking = false;
      this.policeOn = true;
      await s.wait(3.5);
      return this.finish('home');
    }
    if (who === 'ilonka') {
      this.policeOn = true;
      await s.wait(1.5);
      await s.say('Rendőr', 'Rendőrség! Van itt valaki?');
      await s.say('Bori', 'Itt vagyok! Lent! A rács mögött!');
      await s.say('Rendőr', 'Egy pillanat, kislány. Hozzuk a vágót.');
      await s.wait(2);
      return this.finish('base');
    }
    if (!h) return;
    h.talking = true;
    if (who === 'laci') {
      await s.say('Laci', 'Ez a régi gyári rács. Harminc éve én szereltem fel. A zsanérját nem zárja lakat.');
    } else {
      await s.say('Dani', 'Bori? Én vagyok. Dani.');
      h.talking = false;
      await s.say('Bori', '…Dani?');
      h.talking = true;
      await s.say('Dani', 'Itt a kulcs. Robi lakatja, de a kulcs nálam volt. Egész este.');
    }
    h.talking = false;
    await h.walkTo([V(-44, 0, 22.6)]);
    h.crouch = 0.6;
    for (let i = 0; i < 3; i++) { this.audio.clank(); await s.wait(0.6); }
    h.crouch = 0;
    this.grilleOpening = true;
    this.grilleCollider.setEnabled(false);
    await s.wait(1.2);
    await h.walkTo([V(-44, 0, 24.3), V(-44, -3, 29), V(-43.5, -3, 29.6)]);
    h.crouch = 0.6;
    h.talking = true;
    await s.say(who === 'laci' ? 'Laci' : 'Dani', who === 'laci' ? 'Gyere, kislány. Kapaszkodj belém. A Kis Ördög hozott.' : 'Bocsánat. Mindenért. Szólnom kellett volna.');
    h.talking = false;
    h.crouch = 0;
    b.crouch = 0;
    b.speed = 0.55;
    h.speed = 0.6;
    const up = h.walkTo([V(-43.5, -3, 29), V(-43.5, 0, 24.2), V(-43.2, 0, 22.0)]);
    await s.wait(0.7);
    await b.walkTo([V(-44.3, -3, 29), V(-44.3, 0, 24.2), V(-44.4, 0, 22.2)]);
    await up;
    b.faceTo(this.cat().feet);
    b.lookTarget = this.cat().root.position;
    b.crouch = 0.8;
    b.talking = true;
    await s.say('Bori', 'Szotyi. Gyere ide, te hülye, drága macska.');
    b.talking = false;
    this.audio.purr(3);
    await s.wait(2.5);
    this.finish(who === 'laci' ? 'underpass' : 'sorry');
  }

  private finish(e: Ending) {
    this.stage = 'end';
    this.ending = e;
    const f = this.flags;
    const text: Record<Ending, [string, string]> = {
      underpass: ['Az Aluljáró', 'Laci bácsi kiemelte a régi gyári rácsot a zsanérjáról; Tomi és Csont segítettek felhozni Borit. A láthatatlan emberek mentették meg.'],
      home: ['Hazafelé', 'Gábor hívta a mentőket, és ott maradt a rácsnál, amíg kiértek. Életében először csinált valami bátrat.'],
      sorry: ['Bocsánat', 'Dani kinyitotta a lakatot, amit Robi zárt rá. Másnap reggel mind a hárman becsöngettek Kertészékhez.'],
      base: ['Ilonka néni', 'Ilonka néni hívta a rendőrséget. Éjfél után vágták le a lakatot — Szotyi végig ott ült a rácsnál.'],
    };
    this.onGoal({
      kicker: 'vertical slice v0.3 · befejezés',
      title: text[e][0],
      lede: `${text[e][1]} Egy hét múlva új falfestmény kerül a tűzfalra: egy szürke cica és egy sárga kabátos lány.`,
      items: [
        { label: 'Ilonka néni csirkemája', done: f.ilonkaAte },
        { label: 'Kihallgattad a Kapucnisokat', done: f.overheard },
        { label: 'Dani kulcstartója', done: f.keychain },
        { label: 'Gábor bizalma (tej + hazakísérés)', done: f.gaborTrust },
        { label: 'Csont labdája (bizalom: aluljáró)', done: f.ballGiven },
        { label: 'A Kórus (kenyér a galamboknak)', done: f.pigeons },
      ],
    });
  }

  // ───────────────────────────── runtime ─────────────────────────────

  meow(from: THREE.Vector3) {
    // People react to a meow even if it wasn't aimed at them.
    if (this.stage === 'gabor' && from.distanceTo(this.gabor.root.position) < 5) this.flags.gaborNoticed = true;
    const garage = V(18.5, 0, -1.5);
    const calm = this.stage === 'fetch' || this.stage === 'rescue' || this.stage === 'end';
    if (!calm && from.distanceTo(garage) < 5 && from.y < 1.5 && this.shooCooldown <= 0) this.shoo();
    // Bori hears a meow at the grille.
    if (this.stage === 'square' && from.distanceTo(GRILLE) < 4 && !this.flags.bori) this.script.run(() => this.beatBori());
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
    this.clock += dt;
    const cat = this.cat();
    const c = cat.feet;

    // Follow the cat with the shadow frustum.
    this.moon.position.copy(c).addScaledVector(MOON_DIR, 22);
    this.moon.target.position.copy(c);

    // Safety net: if the cat ever ends up outside the playable area (or falls through),
    // put it back where it last stood on solid ground.
    if (!inBounds(c)) {
      cat.teleport(this.lastSafe.clone(), cat.yaw);
      this.dialogue.showHint('Erre nincs tovább. Visszamentél oda, ahol utoljára álltál.', 3000);
    } else if (cat.state === 'ground') {
      this.safeT -= dt;
      if (this.safeT <= 0) { this.lastSafe.copy(c); this.safeT = 0.5; }
    }

    // Stuck nudges: the garage chapter's way on is sign #2 at the row's south end.
    if (this.stage === 'garage') {
      this.stageT += dt;
      if (!this.nudged && (this.stageT > 100 || (this.flags.keychain && this.sinceKeychain() > 25))) {
        this.nudged = true;
        this.dialogue.showHint('Bori következő jele a <b>garázssor déli végén</b>, az út felőli falon. Tartsd az <b>F</b>-et.', 6000);
      }
    } else {
      this.stageT = 0;
    }

    // Stage transitions driven by position.
    if (this.stage === 'descend' && c.y < 0.3) {
      this.stage = 'courtyard';
      this.dialogue.showHint('Lent vagy. Szimatolj körül — Bori <b>sárga jelét</b> keresd.', 4500);
    }
    const inHall = c.y < -2.4 && c.z > HALL.z0 + 0.3 && c.x > HALL.x0;
    if (this.stage === 'hall' && !this.flags.csontMet && inHall) this.script.run(() => this.beatCsont());
    if ((this.stage === 'camp' || this.stage === 'hall') && this.flags.csontMet && !this.flags.camp && c.distanceTo(FIRE) < 3.2) this.script.run(() => this.beatCamp());
    const onSquare = c.x < SQUARE.x1 && c.y > -0.5;
    if (onSquare && (this.stage === 'toUnderpass' || this.stage === 'hall' || this.stage === 'camp' || this.stage === 'toSquare')) this.beatSquare();
    if (onSquare && !this.squareHinted && STAGE_ORDER.indexOf(this.stage) < STAGE_ORDER.indexOf('toUnderpass')) {
      this.squareHinted = true;
      this.dialogue.showHint('A Csillag tér. Csak a galambok vannak fent… Bori nyoma még máshol folytatódik.', 4500);
    }
    if (this.stage === 'square' && !this.flags.bori && Math.hypot(c.x - GRILLE.x, c.z - GRILLE.z) < 2.2) this.script.run(() => this.beatBori());
    if (this.stage === 'rescue' && this.helper === 'ilonka' && !this.policeOn && Math.hypot(c.x - GRILLE.x, c.z - GRILLE.z) < 4) this.script.run(() => this.rescue());
    this.updateFollow(dt);

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
      // Escort: wait for the cat if it lags behind — for a while; then he goes on alone.
      if (this.stage === 'escort' && this.gabor.walking && !this.gaborGaveUp) {
        const far = c.distanceTo(this.gabor.root.position) > 6;
        if (far && !this.gabor.paused) {
          this.gabor.paused = true;
          this.gabor.lookTarget = cat.root.position;
          this.script.run(() => this.script.say('Gábor', 'Jössz, kis szürke?'));
        } else if (!far && c.distanceTo(this.gabor.root.position) < 3.5 && this.gabor.paused) {
          this.gabor.paused = false;
          this.gabor.lookTarget = null;
        }
        if (this.gabor.paused) {
          this.escortWait += dt;
          if (this.escortWait > 12) {
            this.gaborGaveUp = true;
            this.gabor.paused = false;
            this.gabor.lookTarget = null;
          }
        }
      }
      this.gabor.update(dt);
    }
    // Underpass people and the dog.
    for (const p of [this.marika, this.laci, this.tomi]) p.update(dt);
    if (this.follow?.who === this.laci || (this.helper === 'laci' && this.stage === 'end')) {
      const lp = this.laci.root.position;
      if (this.csont.root.position.distanceTo(lp) > 1.6 && !this.csont.walking) {
        this.csont.walkTo([lp.clone().add(V(0.7, 0, 0.6))]);
      }
    }
    this.csont.update(dt);
    if (this.bori.root.visible) this.bori.update(dt);
    // Grille slides up once opened; pigeons fly to the bread.
    if (this.grilleOpening && this.grilleOpen < 1) {
      this.grilleOpen = Math.min(1, this.grilleOpen + dt * 0.6);
      this.grille.position.y = this.grilleOpen * 2.3;
    }
    for (const [i, p] of this.pigeons.entries()) {
      if (p.t < 1) {
        p.t = Math.min(1, p.t + dt * 0.8);
        const k = Math.max(0, p.t);
        p.obj.position.lerpVectors(p.from, p.to, k);
        p.obj.position.y += Math.sin(k * Math.PI) * 1.2;
      } else {
        p.obj.position.y = p.to.y + Math.abs(Math.sin(time * 6 + i)) * 0.015 * (this.flags.pigeons ? 1 : 0.4);
      }
    }
    // Weather: the sky clears over Csillag tér and the rain stops.
    this.sky.update(dt, time, c);
    const dry = this.sky.clearTarget >= 1;
    this.rainAmt += ((dry ? 0 : 1) - this.rainAmt) * Math.min(1, dt * 0.25);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = 0.032 - (1 - this.rainAmt) * 0.01;
    this.police.intensity = this.policeOn ? (Math.sin(time * 9) > 0 ? 40 : 4) : 0;
    this.metroLight.intensity = 3 + Math.sin(time * 17) * 0.4 + (Math.sin(time * 1.3) > 0.97 ? -2 : 0);

    // Signs pulse gently; brighter in scent mode.
    for (const s of this.signs) {
      for (const m of s.userData.materials as THREE.MeshStandardMaterial[]) {
        m.emissiveIntensity = (this.scentOn ? 1.6 : 0.3) + Math.sin(time * 2.4) * 0.08;
      }
    }
    this.underpassLight.intensity = 12 + Math.sin(time * 11) * 1.5 + Math.sin(time * 23) * 1;
    this.flame.scale.set(1, 1 + Math.sin(time * 13) * 0.12 + Math.sin(time * 29) * 0.06, 1);
  }

  /** Helper follows the cat along its own walked trail; arrives at the grille → ending. */
  private updateFollow(dt: number) {
    const f = this.follow;
    if (!f) return;
    const cat = this.cat(), c = cat.feet, who = f.who, p = who.root.position;
    if (cat.state === 'ground' && c.distanceTo(f.last) > 0.9) {
      if (Math.abs(c.y - f.last.y) < 0.6) f.queue.push(c.clone());
      f.last.copy(c);
    }
    const d = c.distanceTo(p);
    if (d < 2) f.near = true; else if (d > 3) f.near = false;
    who.paused = f.near;
    if (!who.walking && f.queue.length) who.walkTo(f.queue.splice(0));
    f.lostT = d > 16 ? f.lostT + dt : 0;
    if (f.lostT > 10) {
      f.lostT = -20;
      const name = who === this.gabor ? 'Gábor' : who === this.laci ? 'Laci' : 'Dani';
      this.script.run(() => this.script.say(name, 'Hova lettél, cica? Várj meg!'));
    }
    if (p.y > -0.5 && Math.hypot(p.x - GRILLE.x, p.z - GRILLE.z) < 4.5) this.script.run(() => this.rescue());
  }

  /** Rain where the cat is (1 = street), 0 underground / in the garage / once it cleared. */
  weather() {
    const c = this.cat().feet;
    if (c.y < -1) return 0;
    if (c.x > GARAGE.x0 && c.x < GARAGE.x1 && c.z > GARAGE.openZ0 && c.z < GARAGE.openZ1 && c.y < GARAGE.h) return 0;
    if (c.x > METRO.x0 && c.x < METRO.x1 && c.z > METRO.z0 && c.z < METRO.z1) return 0;
    return this.rainAmt;
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
        if (f.overheard || f.keychain || this.cat().feet.y < 1 && this.cat().feet.x > 12.5)
          return this.cat().feet.y > GARAGE.h - 0.4
            ? [this.cat().feet.clone(), V(18.5, GARAGE.h, 11.6), V(18.5, 0.1, 12.6)]
            : [this.cat().feet.clone().setY(0.1), V(14.5, 0.1, 6), V(15.6, 0.1, 12.6), V(18.5, 0.1, 12.6)];
        return [V(4, 0.1, -8.6), V(9, 0.1, -10), V(14.5, 1.45, -12.9), V(16.6, GARAGE.h, -11), V(17.6, GARAGE.h, -4), V(VENT.x, GARAGE.h, VENT.z - 0.6)];
      case 'toStop':
      case 'gabor':
        return [V(18.5, 0.1, 12.6), V(14, 0.1, 13), V(9, 0.1, 13.2)];
      case 'escort':
        return [V(5, 0.1, 13.6), V(1.6, 0.1, 13.6), V(1.6, 0.1, 21)];
      case 'toUnderpass':
        return [V(1.6, 0.1, 20), V(1.6, 0.1, 14.5), V(-6, 0.1, 11.5), V(-14.5, 0.1, 6.4), V(-14.5, -0.4, 8.6)];
      case 'hall':
        return [V(-14.5, -0.4, 8.6), V(-14.5, -2.9, 12.5), V(-14.5, -2.9, 19.5), V(-14.5, -2.9, 23.5)];
      case 'camp':
        return [this.cat().feet.clone(), V(-15, -2.9, 25.2)];
      case 'toSquare':
      case 'square': {
        const up = [V(-35, 0.1, 27.5), V(-40.5, 0.1, 23), V(-44, 0.1, 23)];
        return this.cat().feet.y < -0.5
          ? [this.cat().feet.clone(), V(-23, -2.9, 27.5), V(-28, -2.9, 27.5), ...up]
          : [this.cat().feet.clone().setY(0.1), ...up.slice(1)];
      }
      case 'rescue':
        return this.helper === 'ilonka' || this.follow ? [this.cat().feet.clone(), V(-44, 0.1, 23)] : null;
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
      garage: f.overheard ? 'Bori bajban van. Kövesd a jeleit a <b>garázssor déli végéig</b>.' : 'Bori következő jele a <b>garázssor déli végén</b> van. <small>(A tetőről mindent hallani…)</small>',
      toStop: 'Menj a <b>buszmegállóhoz</b>.',
      gabor: f.milk ? 'Gábor…' : f.gaborNoticed ? 'Menj oda hozzá, <b>dörgölőzz</b>.' : 'Valaki leszállt a buszról. <b>Nyávogj</b> neki.',
      escort: 'Kísérd haza <b>Gábort</b>. <small>(Nem kötelező — de ő is emlékezni fog rád.)</small>',
      toUnderpass: 'Kövesd a nyomot az <b>aluljáróig</b>.',
      hall: 'Lent, az aluljáróban: tűz, rádió… és valaki más is.',
      camp: 'Menj oda a <b>tűzhöz</b>.',
      toSquare: 'Bori a <b>nyugati lépcsőn</b> ment fel a Csillag térre.' + (f.ball && !f.ballGiven ? ' <small>(Vidd Csontnak a labdát.)</small>' : ''),
      square: 'Keresd Borit a <b>metrólejárónál</b>. <small>(Nyávogj a rácsnál.)</small>',
      fetch: `Hozz segítséget: ${this.helperList()}`,
      rescue: this.helper === 'ilonka' ? 'Ilonka néni telefonál. Siess vissza a <b>rácshoz</b>.' : 'Vezesd a <b>Csillag térre</b>, a rácshoz.',
      end: '',
    };
    const side: string[] = [];
    if (f.ilonkaAte) side.push('Ilonka néni ✓');
    if (f.overheard) side.push('kihallgatás ✓');
    if (f.keychain) side.push('kulcstartó ✓');
    if (f.gaborTrust) side.push('Gábor bizalma ✓');
    if (f.ballGiven) side.push('Csont labdája ✓');
    if (f.pigeons) side.push('a Kórus ✓');
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
    const pastGabor = { sign1: true, overheard: true, sign2: true, busArrived: true, gaborNoticed: true, gaborRubbed: true, milk: true, gaborHome: true, gaborTrust: true };
    if (beat === 'underpass') {
      Object.assign(this.flags, pastGabor);
      this.stage = 'toUnderpass';
      cat.teleport(V(-12, 0, 5), -Math.PI / 2);
    }
    if (beat === 'hall') {
      Object.assign(this.flags, pastGabor);
      this.stage = 'hall';
      cat.teleport(V(-14.5, -3, 16), 0);
    }
    if (beat === 'square') {
      Object.assign(this.flags, pastGabor, { keychain: true, csontMet: true, camp: true, bread: true });
      this.csont.lying = true;
      this.stage = 'toSquare';
      this.refreshMouth();
      cat.teleport(V(-36, 0, 27.5), -Math.PI / 2);
    }
    if (beat === 'fetch') {
      Object.assign(this.flags, pastGabor, { keychain: true, csontMet: true, camp: true, ball: true, ballGiven: true, bori: true });
      this.stage = 'fetch';
      this.sky.clear = 1;
      this.rainAmt = 0;
      this.bori.setVisible(true);
      this.refreshMouth();
      cat.teleport(V(-40, 0, 21), Math.PI / 2);
    }
    // Replace the chapter-1 card begin() just showed with the one we jumped to.
    const cards: Record<string, [string, string]> = {
      courtyard: ['1 — Üres ablak', '20:46'], garage: ['2 — Garázssor', '20:52'], bus: ['3 — Buszmegálló', '21:15'],
      underpass: ['3 — Buszmegálló', '21:50'], hall: ['4 — Aluljáró', '22:00'], square: ['5 — Csillag tér', '23:10'], fetch: ['6 — Kit hozol?', '23:40'],
    };
    if (cards[beat]) this.dialogue.showCard(...cards[beat]);
  }

  reset() {
    this.script.cancelAll();
    this.dialogue.clearAll();
    for (const k of Object.keys(this.flags) as Array<keyof typeof this.flags>) this.flags[k] = false;
    this.stage = 'intro';
    this.stageT = 0;
    this.nudged = false;
    this.lastSafe.set(-4.5, 6, -13.4);
    (this.borisWindow.material as THREE.MeshBasicMaterial).map = this.boriLit;
    this.setIlonkaOpen(false);
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
    this.gabor.speed = 1.15;
    this.gabor.phoneUp = false;
    this.gaborGaveUp = false;
    this.escortWait = 0;
    // Chapters 4–6.
    this.helper = '';
    this.ending = null;
    this.follow = null;
    this.squareHinted = false;
    this.sky.clear = 0.4;
    this.rainAmt = 1;
    this.policeOn = false;
    this.marika.place(V(-16.5, -3, 27.4), 2.4);
    this.laci.place(V(-13.7, -3, 27.3), -2.2);
    this.tomi.place(V(-11.4, -3, 31.0), Math.PI);
    const [robi, dani, kristof] = this.boys;
    robi.place(V(19.4, 0, -0.6), -2.2);
    dani.place(V(17.6, 0, -2.3), 0.9);
    kristof.place(V(18.2, 0, -0.5), 2.6);
    for (const h of [this.marika, this.laci, this.tomi, ...this.boys]) { h.paused = false; h.crouch = 0; h.lookTarget = null; h.talking = false; h.speed = 1.25; h.walkTo([]); }
    this.csont.stop();
    this.csont.place(CSONT_BED, Math.PI);
    this.csont.lying = true;
    this.csont.barking = false;
    this.csont.wag = 0;
    this.ball.visible = true;
    this.ball.position.set(-9.2, -3 + KIOSK_IN.h + 0.075, 30.3);
    this.add(this.ball);
    this.bread.visible = false;
    this.bread.position.set(-16.1, -2.96, 26.9);
    this.add(this.bread);
    this.keychain.visible = true;
    for (const p of this.pigeons) { p.obj.position.copy(p.home); p.from.copy(p.home); p.to.copy(p.home); p.t = 1; }
    this.grilleOpen = 0;
    this.grilleOpening = false;
    this.grille.position.y = 0;
    this.grilleCollider.setEnabled(true);
    this.bori.walkTo([]);
    this.bori.place(BORI_SPOT, Math.PI);
    this.bori.crouch = 1;
    this.bori.speed = 1.25;
    this.bori.lookTarget = null;
    this.bori.setVisible(false);
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

/** Playable area: courtyard + garages, the street strip, the underpass, Csillag tér. */
function inBounds(c: THREE.Vector3) {
  if (c.y < -3.6 || c.y > 20) return false;
  if (c.z >= -14.5 && c.z <= 12.2 && c.x >= -24.5 && c.x <= 22.5) return true;
  if (c.z >= 11.5 && c.z <= 23 && c.x >= -26.5 && c.x <= 32.6) return true;
  if (c.z >= 11.4 && c.z <= 36.4 && c.x >= -52.4 && c.x <= -23.8) return true;              // Csillag tér
  if (c.y < -0.2 && c.z >= 19.5 && c.z <= 32.5 && c.x >= -34.5 && c.x <= -5.5) return true; // hall + west stairs
  return false;
}

/** Rectangle minus holes, as a few boxes (grid split, merged along x). */
function carve(x0: number, z0: number, x1: number, z1: number, holes: Array<{ x0: number; x1: number; z0: number; z1: number }>) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h.z0, h.z1])])].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
  const out: Array<[number, number, number, number]> = [];
  for (let j = 0; j < zs.length - 1; j++) {
    const zc = (zs[j] + zs[j + 1]) / 2;
    let start: number | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const xc = (xs[i] + xs[i + 1]) / 2;
      const hole = holes.some((h) => xc > h.x0 && xc < h.x1 && zc > h.z0 && zc < h.z1);
      if (!hole && start === null) start = xs[i];
      if (hole && start !== null) { out.push([start, zs[j], xs[i], zs[j + 1]]); start = null; }
    }
    if (start !== null) out.push([start, zs[j], xs[xs.length - 1], zs[j + 1]]);
  }
  return out;
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
