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
    b.position.set(shell.position.x, f * fh - 0.06, shell.position.z);
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
  const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 1.35), new THREE.MeshBasicMaterial({ color: 0xffffff }), transforms.length);
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

export function tree(x: number, z: number, s = 1) {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x2b241e, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2d3a26, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 3.2 * s, 7), bark);
  trunk.position.set(x, 1.6 * s, z);
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.1 + Math.random() * 0.6) * s, 0), leaf);
    b.position.set(x + (Math.random() - 0.5) * 1.4 * s, (3.3 + Math.random() * 1.4) * s, z + (Math.random() - 0.5) * 1.4 * s);
    b.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(b);
  }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
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
