import * as THREE from 'three';
import { worldUVBox } from './materials';

/**
 * Reusable greybox builders for the housing estate. Every builder returns plain meshes;
 * the level decides what collides. Art replaces these one by one.
 */

// ───────────── textures ─────────────

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Prefab concrete panels: one tile = 3 × 3 m with seams and rain streaks. */
export function panelTexture() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c9c6bf';
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 26);
    // Rain streaks.
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(40,40,40,0.18)');
      grad.addColorStop(1, 'rgba(40,40,40,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 2 + Math.random() * 5, 80 + Math.random() * 176);
    }
    g.strokeStyle = 'rgba(30,30,30,0.55)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
  });
  t.repeat.set(1 / 3, 1 / 3);
  return t;
}

export function asphaltTexture() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#5a5d63';
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 40);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = 'rgba(20,20,20,0.35)';
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  });
  t.repeat.set(1 / 4, 1 / 4);
  return t;
}

export function corrugatedTexture() {
  const t = canvasTex(64, 64, (g) => {
    for (let x = 0; x < 64; x++) {
      const v = 120 + Math.sin((x / 64) * Math.PI * 8) * 40;
      g.fillStyle = `rgb(${v},${v - 5},${v - 12})`;
      g.fillRect(x, 0, 1, 64);
    }
    noise(g, 64, 64, 30);
  });
  return t;
}

/**
 * Bori's sign ✅ (VILAG.md): three-stroke cat head + arrow, yellow spray paint.
 * `arrow`: direction in the decal's plane, radians (0 = right). `fresh` adds drips.
 */
export function catSign(arrow: number | null, fresh = true) {
  const tex = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = '#ffd21f';
    g.fillStyle = '#ffd21f';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(255,210,31,0.6)';
    g.shadowBlur = 6;
    g.lineWidth = 11;
    // Stroke 1: ears + crown.
    g.beginPath();
    g.moveTo(52, 120); g.lineTo(66, 52); g.lineTo(100, 88); g.lineTo(140, 88); g.lineTo(172, 52); g.lineTo(186, 120);
    g.stroke();
    // Stroke 2: jaw.
    g.beginPath();
    g.moveTo(52, 120); g.quadraticCurveTo(118, 200, 186, 120);
    g.stroke();
    // Stroke 3: eyes.
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(88, 122); g.lineTo(100, 122); g.stroke();
    g.beginPath(); g.moveTo(138, 122); g.lineTo(150, 122); g.stroke();
    if (fresh) {
      g.lineWidth = 4;
      for (const [x, y, l] of [[60, 128, 46], [120, 162, 60], [182, 126, 34]]) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + l); g.stroke();
        g.beginPath(); g.arc(x, y + l + 2, 3, 0, Math.PI * 2); g.fill();
      }
    }
  });
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, emissive: 0xffc400, emissiveMap: tex, emissiveIntensity: 0.35,
    roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
  g.add(head);
  if (arrow !== null) {
    const at = canvasTex(256, 64, (c) => {
      c.strokeStyle = '#ffd21f';
      c.lineWidth = 12;
      c.lineCap = 'round';
      c.shadowColor = 'rgba(255,210,31,0.6)';
      c.shadowBlur = 6;
      c.beginPath(); c.moveTo(16, 32); c.lineTo(230, 32); c.lineTo(196, 8); c.moveTo(230, 32); c.lineTo(196, 56); c.stroke();
    });
    const am = mat.clone();
    am.map = at; am.emissiveMap = at;
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), am);
    a.rotation.z = arrow;
    a.position.set(Math.cos(arrow) * 0.75, Math.sin(arrow) * 0.75 - 0.05, 0);
    g.add(a);
  }
  g.userData.materials = g.children.map((m) => (m as THREE.Mesh).material);
  return g;
}

/** Random tag-style graffiti (not Bori's) for garage doors and walls. */
export function graffiti(text: string, color: string, w = 2, h = 0.8) {
  const tex = canvasTex(512, Math.round(512 * (h / w)), (g) => {
    g.font = `italic 900 ${Math.round(512 * (h / w) * 0.6)}px Impact, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#111';
    g.strokeText(text, 256, 512 * (h / w) / 2);
    g.fillStyle = color;
    g.fillText(text, 256, 512 * (h / w) / 2);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
}

/** Spray overspray: a soft halo of dots around whatever was just painted. */
function overspray(g: CanvasRenderingContext2D, w: number, h: number, color: string, n: number) {
  g.save();
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.15 + Math.random() * 0.35;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drips(g: CanvasRenderingContext2D, color: string, pts: Array<[number, number]>, maxLen: number) {
  g.save();
  g.strokeStyle = g.fillStyle = color;
  g.lineCap = 'round';
  for (const [x, y] of pts) {
    if (Math.random() < 0.45) continue;
    const l = maxLen * (0.3 + Math.random() * 0.7);
    g.lineWidth = 2 + Math.random() * 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2, y + l); g.stroke();
    g.beginPath(); g.arc(x, y + l + 1, g.lineWidth * 0.8, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

const sprayMat = (tex: THREE.Texture, glow = 0) => new THREE.MeshStandardMaterial({
  map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  ...(glow ? { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow } : {}),
});

/**
 * Real hand-styled tags from ambientCG "GraffitiSet001" (CC0, https://ambientcg.com/a/GraffitiSet001):
 * 16 tags in a 4 × 4 atlas, baked to grey strokes + alpha so each copy is tinted. Rects are
 * each tag's trimmed bounds in image space (u0, v0, u1, v1, y down).
 */
const TAG_RECTS = [
  [0.002, 0.028, 0.247, 0.231], [0.257, 0.032, 0.495, 0.208], [0.503, 0.046, 0.747, 0.23], [0.753, 0.047, 0.998, 0.191],
  [0.0, 0.31, 0.242, 0.424], [0.252, 0.321, 0.5, 0.433], [0.501, 0.323, 0.748, 0.428], [0.751, 0.287, 1.0, 0.452],
  [0.002, 0.551, 0.243, 0.728], [0.253, 0.566, 0.497, 0.705], [0.5, 0.539, 0.748, 0.703], [0.75, 0.557, 1.0, 0.71],
  [0.003, 0.792, 0.248, 0.952], [0.25, 0.821, 0.5, 0.936], [0.501, 0.827, 0.748, 0.917], [0.75, 0.806, 0.998, 0.932],
];
export const TAG_COUNT = TAG_RECTS.length;
let tagAtlas: THREE.Texture | null = null;
const atlas = () => {
  if (!tagAtlas) {
    tagAtlas = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/graffiti_tags.png`);
    tagAtlas.colorSpace = THREE.SRGBColorSpace;
    tagAtlas.anisotropy = 8;
  }
  return tagAtlas;
};

/** Sprayed tag `i` (0..15) from the atlas, `w` metres wide, tinted `color`, with a faint dark shadow. */
export function sprayTag(i: number, color: string, w = 1.6) {
  const [u0, v0, u1, v1] = TAG_RECTS[((i % TAG_COUNT) + TAG_COUNT) % TAG_COUNT];
  const h = (w * (v1 - v0)) / (u1 - u0);
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), 1 - v1 + uv.getY(k) * (v1 - v0));
  const mat = (c: THREE.ColorRepresentation, opacity: number, factor: number) => new THREE.MeshStandardMaterial({
    map: atlas(), color: c, transparent: true, opacity, roughness: 0.8, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor,
  });
  const mesh = new THREE.Mesh(geo, mat(color, 1, -3));
  const shadow = new THREE.Mesh(geo, mat(0x000000, 0.55, -2));
  shadow.position.set(w * 0.012, -w * 0.012, 0);
  shadow.renderOrder = -1;
  mesh.add(shadow);
  return mesh;
}

export type StencilKind = 'dog' | 'skull' | 'eye' | 'crown' | 'smiley' | 'star' | 'arrow' | 'heart' | 'bird' | 'bolt';

/**
 * Decoy street art — sprayed doodles in the same loose hand as Bori's sign but never a
 * three-stroke cat head, so the sign has to be read, not just spotted by colour.
 */
export function stencil(kind: StencilKind, color: string, size = 0.7, arrowAngle = 0) {
  const tex = canvasTex(256, 256, (g) => {
    overspray(g, 256, 256, color, 70);
    g.strokeStyle = g.fillStyle = color;
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 11;
    g.shadowColor = color; g.shadowBlur = 8;
    const P = (...pts: number[]) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); };
    const O = (x: number, y: number, r: number, fill = false) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fill ? g.fill() : g.stroke(); };
    switch (kind) {
      case 'dog': // floppy ears, long snout — Csont, as the Kapucnisok see him
        O(128, 120, 54); P(80, 90, 52, 160, 78, 170); g.stroke(); P(176, 90, 204, 160, 178, 170); g.stroke();
        O(108, 112, 6, true); O(150, 112, 6, true); O(128, 150, 12, true); break;
      case 'skull':
        O(128, 108, 60); P(96, 160, 96, 196, 160, 196, 160, 160); g.stroke();
        O(104, 108, 14, true); O(152, 108, 14, true); P(112, 196, 112, 180); g.stroke(); P(144, 196, 144, 180); g.stroke(); break;
      case 'eye':
        g.beginPath(); g.moveTo(36, 128); g.quadraticCurveTo(128, 40, 220, 128); g.quadraticCurveTo(128, 216, 36, 128); g.stroke();
        O(128, 128, 26, true); break;
      case 'crown':
        P(52, 180, 40, 84, 90, 134, 128, 64, 166, 134, 216, 84, 204, 180); g.closePath(); g.stroke(); break;
      case 'smiley':
        O(128, 128, 80); O(100, 108, 9, true); O(156, 108, 9, true);
        g.beginPath(); g.arc(128, 132, 46, 0.2, Math.PI - 0.2); g.stroke(); break;
      case 'star': {
        g.beginPath();
        for (let k = 0; k <= 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 36 : 92;
          k ? g.lineTo(128 + Math.cos(a) * r, 132 + Math.sin(a) * r) : g.moveTo(128 + Math.cos(a) * r, 132 + Math.sin(a) * r);
        }
        g.stroke(); break;
      }
      case 'arrow': {
        g.save(); g.translate(128, 128); g.rotate(arrowAngle);
        P(-90, 0, 80, 0); g.stroke(); P(44, -36, 84, 0, 44, 36); g.stroke(); g.restore(); break;
      }
      case 'heart':
        g.beginPath(); g.moveTo(128, 200); g.bezierCurveTo(20, 130, 60, 40, 128, 92); g.bezierCurveTo(196, 40, 236, 130, 128, 200); g.stroke();
        g.lineWidth = 7; g.font = '900 44px Impact, system-ui'; g.textAlign = 'center'; g.fillText('K+D', 128, 140); break;
      case 'bird': // the Kórus
        P(40, 120, 90, 96, 128, 124, 166, 96, 216, 120); g.stroke(); O(128, 132, 10, true); break;
      case 'bolt':
        P(150, 36, 90, 136, 140, 136, 104, 220); g.stroke(); break;
    }
    g.shadowBlur = 0;
    drips(g, color, [[90, 190], [128, 200], [170, 186]], 50);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), sprayMat(tex, color.toLowerCase().startsWith('#ff') ? 0.12 : 0));
}

// ───────────── buildings ─────────────

export interface PanelBlockOpts {
  x0: number; x1: number; z0: number; z1: number;
  floors: number;
  floorH?: number;
  /** Faces that get windows: 'n' | 's' */
  faces: Array<'n' | 's'>;
  litChance?: number;
  skip?: (face: 'n' | 's', floor: number, col: number) => boolean;
  material: THREE.Material;
}

/**
 * Prefab block. Windows are one InstancedMesh (unlit colour per instance: dark, warm,
 * TV-blue) so 120 windows cost one draw call and still bloom.
 */
export function panelBlock(o: PanelBlockOpts) {
  const fh = o.floorH ?? 3;
  const w = o.x1 - o.x0, d = o.z1 - o.z0, h = o.floors * fh;
  const group = new THREE.Group();
  const shell = new THREE.Mesh(worldUVBox(w, h, d), o.material);
  shell.position.set((o.x0 + o.x1) / 2, h / 2, (o.z0 + o.z1) / 2);
  shell.castShadow = shell.receiveShadow = true;
  group.add(shell);
  // Roof parapet + floor seam bands for the prefab look.
  const band = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.9 });
  for (let f = 1; f <= o.floors; f++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.12, d + 0.06), band);
    // Top band sits a hair above the roof so the two top faces don't z-fight.
    b.position.set(shell.position.x, f * fh - (f === o.floors ? 0.05 : 0.06), shell.position.z);
    group.add(b);
  }

  const cols = Math.floor(w / 3);
  const transforms: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const lit = o.litChance ?? 0.28;
  for (const face of o.faces) {
    const z = face === 's' ? o.z1 + 0.02 : o.z0 - 0.02;
    const rotY = face === 's' ? 0 : Math.PI;
    for (let f = 0; f < o.floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (o.skip?.(face, f, c)) continue;
        const x = o.x0 + 1.5 + c * 3;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, f * fh + 1.55, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
          new THREE.Vector3(1, 1, 1),
        );
        transforms.push(m);
        const r = Math.random();
        colors.push(r < lit ? new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.7, 0.45 + Math.random() * 0.15)
          : r < lit + 0.05 ? new THREE.Color(0x4f6fb8) : new THREE.Color(0x10141c));
      }
    }
  }
  const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 1.35), new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), transforms.length);
  transforms.forEach((m, i) => { win.setMatrixAt(i, m); win.setColorAt(i, colors[i]); });
  group.add(win);
  return { group, height: h };
}

export function streetLamp(x: number, z: number, armDir: THREE.Vector3, opts: { light?: boolean; intensity?: number } = {}) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a5048, roughness: 0.6, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), metal);
  pole.position.set(x, 3, z);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.4), metal);
  const yaw = Math.atan2(armDir.x, armDir.z);
  arm.rotation.y = yaw;
  arm.position.set(x + armDir.x * 0.7, 5.95, z + armDir.z * 0.7);
  const headPos = new THREE.Vector3(x + armDir.x * 1.35, 5.85, z + armDir.z * 1.35);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.5), metal);
  head.rotation.y = yaw;
  head.position.copy(headPos);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.38), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  bulb.rotation.y = yaw;
  bulb.position.copy(headPos).setY(5.78);
  g.add(pole, arm, head, bulb);
  pole.castShadow = true;
  let light: THREE.PointLight | null = null;
  if (opts.light !== false) {
    // Sodium orange ✅ (VILAG.md palette).
    light = new THREE.PointLight(0xff8a2a, opts.intensity ?? 28, 16, 1.7);
    light.position.copy(headPos).setY(5.5);
    g.add(light);
  }
  return { group: g, light };
}

// Plane-tree bark: the camouflage patches of a London plane (cream, olive, grey-brown).
let barkTex: THREE.Texture | null = null;
function planeBark() {
  barkTex ??= canvasTex(256, 256, (g) => {
    g.fillStyle = '#6f6a52';
    g.fillRect(0, 0, 256, 256);
    const cols = ['#b8b08a', '#8a8a62', '#cfc6a0', '#5a5444', '#9a9270'];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 26;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.5);
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr * 1.4);
      }
      g.closePath();
      g.fill();
    }
  });
  return barkTex;
}

const AUTUMN = [0xc98a1e, 0xd9a52a, 0xb5651d, 0x9c4a1a, 0xe0b84a, 0x7a6a24, 0x8a3a18];
const autumnLeaf = new Map<number, THREE.MeshStandardMaterial>();
const leafMat = (c: number) => {
  if (!autumnLeaf.has(c)) autumnLeaf.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  return autumnLeaf.get(c)!;
};

/** Autumn plane tree (platán): mottled trunk, forked limbs, a ragged yellow-brown crown. */
export function tree(x: number, z: number, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const bark = new THREE.MeshStandardMaterial({ map: planeBark(), roughness: 0.95 });
  const trunkH = 3.4 * s;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, trunkH, 9), bark);
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const tips: THREE.Vector3[] = [];
  const limbs = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + Math.random() * 0.8;
    const tilt = 0.45 + Math.random() * 0.35;
    const len = (1.8 + Math.random() * 0.9) * s;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.12 * s, len, 6), bark);
    const dir = new THREE.Vector3(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
    const base = new THREE.Vector3(0, trunkH - 0.3 * s, 0);
    limb.position.copy(base).addScaledVector(dir, len / 2);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(limb);
    tips.push(base.clone().addScaledVector(dir, len));
  }
  // Crown: clumps around the limb tips, mixed autumn colours, a few already bare gaps.
  for (const t of tips) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const c = AUTUMN[Math.floor(Math.random() * AUTUMN.length)];
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry((0.65 + Math.random() * 0.5) * s, 0), leafMat(c));
      b.position.set(t.x + (Math.random() - 0.5) * 1.1 * s, t.y + (Math.random() - 0.3) * 0.8 * s, t.z + (Math.random() - 0.5) * 1.1 * s);
      b.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      b.scale.y = 0.75;
      g.add(b);
    }
  }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

/**
 * Fallen leaves: one InstancedMesh for every loose leaf and heaped pile in the level.
 * spots: [x, z, radius, pile?, groundY?] — piles are mounds, the rest lies flat.
 */
export function leafLitter(spots: Array<[number, number, number, boolean?, number?]>) {
  // Five-lobed plane leaf outline (+ a stem), ~16 cm across.
  const leaf = new THREE.Shape();
  const lobes = 5, R = 0.08, r = 0.06;
  for (let k = 0; k <= lobes * 2; k++) {
    const a = Math.PI / 2 + ((k / (lobes * 2)) * Math.PI * 2 - Math.PI) * 0.82;
    const rad = k % 2 ? r : R * (k === lobes ? 1 : 0.85);
    k ? leaf.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : leaf.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  leaf.lineTo(0.004, -0.02); leaf.lineTo(0.004, -0.06); leaf.lineTo(-0.004, -0.06); leaf.lineTo(-0.004, -0.02);
  leaf.closePath();
  const geo = new THREE.ShapeGeometry(leaf);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -4 });
  const count = spots.reduce((n, [, , r, pile]) => n + Math.round((pile ? 260 : 45) * r * r), 0);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  let i = 0;
  for (const [x, z, r, pile, y0 = 0] of spots) {
    const n = Math.round((pile ? 260 : 45) * r * r);
    // Ragged, wind-blown outline: lobes around the centre, thinning out at the edge.
    const ph1 = Math.random() * 6, ph2 = Math.random() * 6, wind = Math.random() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const edge = r * (0.75 + 0.25 * Math.sin(3 * a + ph1) + 0.15 * Math.sin(5 * a + ph2) + 0.35 * Math.max(0, Math.cos(a - wind)));
      const d = (pile ? Math.sqrt(Math.random()) : Math.random() ** 0.8) * edge;
      const h = pile ? 0.38 * r * Math.max(0, 1 - (d / edge) ** 2) * Math.random() : 0;
      p.set(x + Math.cos(a) * d, y0 + 0.05 + h, z + Math.sin(a) * d * (pile ? 0.8 : 1));
      e.set(pile ? (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 0.15, Math.random() * Math.PI * 2, pile ? (Math.random() - 0.5) * 1.2 : 0);
      sc.setScalar(0.8 + Math.random() * 0.7);
      mesh.setMatrixAt(i, m.compose(p, q.setFromEuler(e), sc));
      mesh.setColorAt(i, col.setHex(AUTUMN[Math.floor(Math.random() * AUTUMN.length)]).multiplyScalar(0.55 + Math.random() * 0.45));
      i++;
    }
  }
  mesh.receiveShadow = true;
  return mesh;
}

/** The last bus: a box with lit windows, headlights and a door side. */
export function bus() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(worldUVBox(11, 2.6, 2.5), new THREE.MeshStandardMaterial({ color: 0xc9a640, roughness: 0.5, metalness: 0.2 }));
  body.position.y = 1.55;
  body.castShadow = true;
  g.add(body);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xd8e6c8 });
  for (const side of [1, -1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.9), winMat);
    w.position.set(0, 2.0, side * 1.26);
    if (side < 0) w.rotation.y = Math.PI;
    g.add(w);
  }
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
  for (const s of [-0.8, 0.8]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), lamp);
    hl.position.set(5.51, 0.75, s);
    hl.rotation.y = Math.PI / 2;
    g.add(hl);
  }
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const s of [-0.9, 0.9]) {
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), tail);
    tl.position.set(-5.51, 0.9, s);
    tl.rotation.y = -Math.PI / 2;
    g.add(tl);
  }
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const x of [-3.6, 3.4]) for (const z of [-1.2, 1.2]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 14), wheelMat);
    wh.rotation.x = Math.PI / 2;
    wh.position.set(x, 0.48, z);
    g.add(wh);
  }
  const light = new THREE.PointLight(0xd8e6c8, 0, 8, 1.6);
  light.position.set(0, 1.8, 2.2);
  g.add(light);
  const number = graffiti('17', '#ffffff', 0.8, 0.5);
  (number.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xffffff);
  (number.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
  number.position.set(5.52, 2.3, 0);
  number.rotation.y = Math.PI / 2;
  g.add(number);
  return { group: g, light };
}
