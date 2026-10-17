import * as THREE from 'three';

/**
 * Coat colours for the low-poly cat (public/models/cat_lowpoly.glb). The bake script
 * (tools/rig/lowpoly_cat.py) writes a mask into COLOR_0 per face: R = region id / 32,
 * G = tabby stripe value, B = patch noise. A skin maps those to vertex colours, so
 * switching skins is a recolour, not a reload.
 */
const enum R { Back, Belly, Chest, Muzzle, Face, HeadTop, Ear, EarIn, Eye, Nose, LegUp, LegLow, Paw, Tail, TailTip }

interface Skin {
  /** Coat colour; regions not listed in `parts` use it. */
  coat: number;
  parts: Partial<Record<R, number>>;
  /** Tabby stripes on the coat regions: darker colour where the stripe value passes `at`. */
  stripes?: { color: number; at: number };
  /** Calico patches on the coat regions: noise below lo → a, above hi → b. */
  patches?: { a: number; b: number; lo: number; hi: number };
}

const STRIPED = new Set([R.Back, R.HeadTop, R.LegUp, R.LegLow, R.Tail]);

export const SKINS: Record<string, Skin> = {
  szotyi: {
    coat: 0x85878c,
    parts: { [R.Belly]: 0xb4b3af, [R.Chest]: 0xb4b3af, [R.Muzzle]: 0xc6c3bd, [R.EarIn]: 0xc99494, [R.Eye]: 0xc9b23c,
      [R.Nose]: 0xb67a80, [R.Paw]: 0xa3a3a1, [R.TailTip]: 0x3c3d42, [R.Ear]: 0x6e7075 },
    stripes: { color: 0x4b4d53, at: 0.62 },
  },
  black: {
    coat: 0x1f1f23,
    parts: { [R.Belly]: 0x27272c, [R.EarIn]: 0x4a3b3e, [R.Eye]: 0xd7b12c, [R.Nose]: 0x2d2a2c },
  },
  ginger: {
    coat: 0xcf7a37,
    parts: { [R.Belly]: 0xe8bb8d, [R.Chest]: 0xe8bb8d, [R.Muzzle]: 0xecc59b, [R.Paw]: 0xe3ae7c, [R.EarIn]: 0xe2a196,
      [R.Eye]: 0x7aa647, [R.Nose]: 0xd57f86, [R.TailTip]: 0x9c4f1d },
    stripes: { color: 0x9f501c, at: 0.6 },
  },
  tuxedo: {
    coat: 0x1d1d21,
    parts: { [R.Belly]: 0xebeae4, [R.Chest]: 0xebeae4, [R.Muzzle]: 0xebeae4, [R.Paw]: 0xebeae4, [R.EarIn]: 0x5a4446,
      [R.Eye]: 0x8cb648, [R.Nose]: 0xd28a90 },
  },
  calico: {
    coat: 0xeceae3,
    parts: { [R.EarIn]: 0xe5aaa4, [R.Eye]: 0xc7a23a, [R.Nose]: 0xd98e94, [R.TailTip]: 0x27252a },
    patches: { a: 0xd4843e, b: 0x29272b, lo: 0.4, hi: 0.6 },
  },
  siamese: {
    coat: 0xe6d9bf,
    parts: { [R.Face]: 0x4b3529, [R.Muzzle]: 0x4b3529, [R.Ear]: 0x3f2c22, [R.EarIn]: 0x5a4034, [R.LegLow]: 0x6d5140,
      [R.Paw]: 0x4b3529, [R.Tail]: 0x5e4535, [R.TailTip]: 0x3f2c22, [R.Eye]: 0x4f93dc, [R.Nose]: 0x3a2a24,
      [R.Belly]: 0xefe6d3 },
  },
};

export type SkinId = keyof typeof SKINS;
export const SKIN_IDS = Object.keys(SKINS) as SkinId[];

const tmp = new THREE.Color();

/** Recolour every masked mesh under `root` with skin `id`. Unmasked meshes are left alone. */
export function applySkin(root: THREE.Object3D, id: string) {
  const skin = SKINS[id] ?? SKINS.szotyi;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const mask: THREE.BufferAttribute | undefined = g.userData.skinMask ?? (g.getAttribute('color') as THREE.BufferAttribute | undefined);
    if (!mask) return;
    g.userData.skinMask = mask;
    const out = new Float32Array(mask.count * 3);
    for (let i = 0; i < mask.count; i++) {
      const region = Math.round(mask.getX(i) * 32) as R;
      const stripe = mask.getY(i), noise = mask.getZ(i);
      let hex = skin.parts[region] ?? skin.coat;
      if (!(region in skin.parts)) {
        if (skin.stripes && STRIPED.has(region) && stripe > skin.stripes.at) hex = skin.stripes.color;
        if (skin.patches && region !== R.Belly && region !== R.Chest && region !== R.Muzzle && region !== R.Paw) {
          if (noise < skin.patches.lo) hex = skin.patches.a;
          else if (noise > skin.patches.hi) hex = skin.patches.b;
        }
      }
      tmp.setHex(hex); // sRGB → linear working space
      out[i * 3] = tmp.r; out[i * 3 + 1] = tmp.g; out[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.vertexColors = true;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  });
}
