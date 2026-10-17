import * as THREE from 'three';

/**
 * Greybox material kit. A 1 m world-space grid on every surface lets everyone read scale
 * (cat ≈ 0.58 m) — art will replace these per material name, so keep the names stable.
 */
function gridTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, s, s);
  // Subtle noise so lighting has something to grip.
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(s / 2, 0); g.lineTo(s / 2, s);
  g.moveTo(0, s / 2); g.lineTo(s, s / 2);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.32)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let grid: THREE.CanvasTexture | null = null;

function mat(name: string, color: number, roughness: number, metalness = 0) {
  grid ??= gridTexture();
  const m = new THREE.MeshStandardMaterial({ name, color, roughness, metalness, map: grid });
  return m;
}

export function createMaterials() {
  return {
    ground: mat('ground_wet_asphalt', 0x3a3f47, 0.38, 0.1),
    wallA: mat('wall_brick_left', 0x5b4a52, 0.9),
    wallB: mat('wall_concrete_right', 0x4a5560, 0.85),
    wallBack: mat('wall_back', 0x3d4450, 0.9),
    roof: mat('roof_tar', 0x30343b, 0.8),
    wood: mat('wood_crate', 0x8a6a48, 0.75),
    metal: mat('metal_painted', 0x6f7f86, 0.45, 0.6),
    dumpster: mat('metal_dumpster', 0x2f5a46, 0.55, 0.4),
    fabric: mat('fabric_scratch', 0xb59a70, 1.0),
    robot: mat('robot_shell', 0xc8c0b0, 0.5, 0.3),
    goal: mat('vent_warm', 0x7a6a5a, 0.6, 0.5),
    puddle: new THREE.MeshStandardMaterial({ name: 'puddle', color: 0x0c1016, roughness: 0.05, metalness: 0.9 }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;

/** Rescale BoxGeometry UVs so the grid texture is 1 tile per metre on every face. */
export function worldUVBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z — 4 verts each.
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

/** Emissive sign with text — placeholder for real signage art. */
export function neonSign(text: string, color: string, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round(512 * (h / w));
  const g = c.getContext('2d')!;
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, c.width, c.height);
  g.font = `700 ${Math.round(c.height * 0.62)}px ui-rounded, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  g.fillStyle = '#ffffff';
  g.shadowBlur = 0;
  g.globalAlpha = 0.55;
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({
    name: 'neon_' + text, color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 2.2,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
