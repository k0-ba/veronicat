import * as THREE from 'three';

/**
 * Szagmód (hold F): the world desaturates (CSS filter on the canvas — cheap, no extra
 * pass) and Bori's trail appears as drifting yellow motes along the current story path.
 */
export class Scent {
  points: THREE.Points;
  private count = 260;
  private offsets: Float32Array;
  private curve: THREE.CatmullRomCurve3 | null = null;
  private curveKey = '';
  private strength = 0;
  active = false;

  constructor(private canvas: HTMLCanvasElement) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    this.offsets = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      this.offsets[i * 4] = Math.random();               // param along curve
      this.offsets[i * 4 + 1] = (Math.random() - 0.5) * 0.35;
      this.offsets[i * 4 + 2] = Math.random() * 0.3;
      this.offsets[i * 4 + 3] = (Math.random() - 0.5) * 0.35;
    }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,170,1)');
    grad.addColorStop(0.4, 'rgba(255,210,60,0.6)');
    grad.addColorStop(1, 'rgba(255,200,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: 0xffd23f,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  update(dt: number, time: number, held: boolean, trail: THREE.Vector3[] | null | undefined) {
    this.active = held;
    this.strength += ((held ? 1 : 0) - this.strength) * Math.min(1, dt * 5);
    const s = this.strength;
    this.canvas.style.filter = s > 0.01 ? `saturate(${1 - s * 0.75}) brightness(${1 - s * 0.18}) contrast(${1 + s * 0.1})` : '';
    document.body.classList.toggle('scent', held);

    const key = trail ? trail.map((p) => p.toArray().join(',')).join('|') : '';
    if (key !== this.curveKey) {
      this.curveKey = key;
      this.curve = trail && trail.length >= 2 ? new THREE.CatmullRomCurve3(trail, false, 'centripetal') : null;
    }
    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = this.curve ? s * 0.85 : 0;
    this.points.visible = mat.opacity > 0.01;
    if (!this.points.visible || !this.curve) return;

    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const len = this.curve.getLength();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      // Flow toward the target at ~0.8 m/s.
      let u = this.offsets[o] + (dt * 0.8) / len;
      if (u > 1) u -= 1;
      this.offsets[o] = u;
      this.curve.getPointAt(u, p);
      const wob = Math.sin(time * 2 + i) * 0.04;
      pos.setXYZ(i, p.x + this.offsets[o + 1] + wob, p.y + 0.08 + this.offsets[o + 2], p.z + this.offsets[o + 3]);
    }
    pos.needsUpdate = true;
  }
}
