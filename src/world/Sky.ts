import * as THREE from 'three';

/**
 * Night sky dome: procedural stars (twinkling, a faint Milky Way band), the moon, and a
 * drifting cloud deck whose coverage follows `clear` (0 = overcast rain, 1 = open sky).
 * Follows the player, ignores fog, draws behind everything.
 */
/** Where the moon hangs (low in the west-south-west, over Csillag tér); the moonlight uses it too. */
export const MOON_DIR = new THREE.Vector3(-0.78, 0.4, 0.48).normalize();

export class Sky {
  readonly mesh: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uClear: { value: 0.4 },
    uMoonDir: { value: MOON_DIR.clone() },
    uHorizon: { value: new THREE.Color(0x101826) },
    uZenith: { value: new THREE.Color(0x03060d) },
  };
  /** Target the coverage eases towards. */
  clearTarget = 0.4;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // on the far plane
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uClear;
        uniform vec3 uMoonDir, uHorizon, uZenith;
        varying vec3 vDir;

        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

        // One star per cell of a 3D grid on the direction: size, brightness and twinkle from the hash.
        float stars(vec3 d, float scale, float density) {
          vec3 p = d * scale;
          vec3 c = floor(p);
          float h = hash(c);
          if (h > density) return 0.0;
          vec3 jitter = vec3(hash(c + 7.1), hash(c + 3.7), hash(c + 1.3)) - 0.5;
          vec3 sp = normalize(c + 0.5 + jitter * 0.7);
          float dist = length(d - sp) * scale;
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 40.0) + h * 100.0);
          float b = pow(hash(c + 11.0), 5.0) * 4.0 + 0.5;
          return smoothstep(0.12, 0.0, dist) * b * tw;
        }

        void main() {
          vec3 d = normalize(vDir);
          float up = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));

          // Stars + a faint band across the sky.
          float s = stars(d, 160.0, 0.07) + stars(d, 320.0, 0.05) * 0.6;
          vec3 bandAxis = normalize(vec3(0.3, 0.2, 1.0));
          float band = exp(-pow(dot(d, normalize(cross(bandAxis, vec3(0.0, 1.0, 0.2)))) * 4.0, 2.0));
          col += vec3(0.05, 0.06, 0.09) * band * fbm(d * 6.0) * smoothstep(0.0, 0.3, up);
          s += stars(d, 520.0, 0.12) * band * 0.7;
          col += vec3(0.85, 0.9, 1.0) * s * 1.8 * smoothstep(0.02, 0.2, up);

          // Clouds: lit from below by the city's sodium glow, drifting slowly.
          vec2 uv = d.xz / (d.y + 0.18);
          float n = fbm(vec3(uv * 0.9 + vec2(uTime * 0.012, uTime * 0.004), uTime * 0.01));
          float cover = smoothstep(uClear - 0.15, uClear + 0.25, n);
          vec3 cloud = mix(vec3(0.07, 0.075, 0.09), vec3(0.17, 0.13, 0.11), smoothstep(0.35, 0.0, up));
          float m = dot(d, uMoonDir);
          float glow = pow(max(m, 0.0), 40.0);
          cloud += vec3(0.32, 0.36, 0.44) * glow * 0.9;          // moonlit cloud edges
          float cv = cover * (1.0 - uClear * 0.55) * smoothstep(-0.05, 0.12, d.y);
          col = mix(col, cloud, cv);

          // Moon: a big pale disc with faint maria, a halo, glowing through thin cloud.
          float disc = smoothstep(0.99955, 0.99968, m);
          vec3 tang = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
          vec2 mp = vec2(dot(d, tang), dot(d, cross(tang, uMoonDir))) * 40.0;
          float maria = fbm(vec3(mp * 1.6, 3.0));
          vec3 moonCol = vec3(1.0, 0.97, 0.9) * (3.2 - smoothstep(0.45, 0.7, maria) * 1.1);
          col = mix(col, moonCol, disc * (1.0 - cv * 0.8));
          col += vec3(0.5, 0.58, 0.75) * (pow(max(m, 0.0), 900.0) * 0.6 + glow * 0.08) * (1.0 - cv * 0.4);

          // Fade into the fog colour at the horizon so the distant blocks sit in it.
          col = mix(uHorizon, col, smoothstep(-0.02, 0.18, d.y));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  /** 0 = overcast, 1 = open starry sky. */
  get clear() { return this.uniforms.uClear.value; }
  set clear(v: number) { this.uniforms.uClear.value = v; this.clearTarget = v; }

  update(dt: number, time: number, center: THREE.Vector3) {
    this.mesh.position.copy(center);
    this.uniforms.uTime.value = time;
    const u = this.uniforms.uClear;
    u.value += (this.clearTarget - u.value) * Math.min(1, dt * 0.15);
  }
}
