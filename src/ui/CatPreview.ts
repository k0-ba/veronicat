import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { applySkin } from '../player/catSkins';

/**
 * Small live portrait of the cat for the coat picker: its own renderer and scene, the
 * same GLB the game uses, the idle clip looping and a slow sway so the coat reads from
 * several sides. Renders only while `active` (menu open on the root page).
 */
export class CatPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 10);
  private holder = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private url = '';
  private skin = '';
  private raf = 0;
  private last = 0;
  private time = 0;

  constructor(private base: string) {
    this.canvas.className = 'cat-preview-canvas';
    this.scene.add(this.holder);
    this.scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x2a2018, 1.4));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.2);
    key.position.set(1.2, 1.6, 1.4);
    const rim = new THREE.DirectionalLight(0x8aa8ff, 1.6);
    rim.position.set(-1.4, 0.8, -1.2);
    this.scene.add(key, rim);
    // A soft ground disc so the cat stands on something.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.55, 1);
    this.scene.add(shadow);
    this.camera.position.set(0.55, 0.32, 0.95);
    this.camera.lookAt(0, 0.14, 0);
  }

  /** Show coat `id`. */
  setSkin(id: string) {
    this.skin = id;
    const url = `${this.base}models/cat_lowpoly.glb`;
    if (url !== this.url) {
      this.url = url;
      void this.load(url);
    } else if (this.model) {
      applySkin(this.model, id);
    }
  }

  set active(on: boolean) {
    if (on && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    } else if (!on && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private async load(url: string) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    if (url !== this.url) return; // a newer pick won
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = 0.58 / Math.max(size.x, size.z);
    model.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    model.position.set(-c.x, -box.min.y * s, -c.z);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.emissiveMap) mat.emissiveIntensity = 0;
    });
    this.holder.clear();
    this.holder.add(model);
    this.model = model;
    this.mixer = null;
    const idle = gltf.animations.find((a) => a.name === 'idle') ?? gltf.animations[0];
    if (idle) {
      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.clipAction(idle).play();
    }
    applySkin(model, this.skin);
  }

  private ensureRenderer() {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setClearColor(0x000000, 0);
    this.renderer = r;
    return r;
  }

  private frame(t: number) {
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.time += dt;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return; // not in the page right now
    const r = this.ensureRenderer();
    const dpr = Math.min(2, devicePixelRatio);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      r.setPixelRatio(dpr);
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.mixer?.update(dt);
    // Slow sway: three-quarter view, turning a little each way.
    this.holder.rotation.y = 0.5 + Math.sin(this.time * 0.45) * 0.75;
    if (!this.mixer) this.holder.position.y = Math.sin(this.time * 2.2) * 0.003; // breathing for clip-less models
    r.render(this.scene, this.camera);
  }
}
