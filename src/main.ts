import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Physics, FIXED_DT } from './physics/Physics';
import { Input } from './core/Input';
import { Audio } from './core/Audio';
import { Cat } from './player/Cat';
import { FollowCamera } from './camera/FollowCamera';
import { Level } from './world/Level';
import { Lakotelep } from './world/Lakotelep';
import type { GameLevel, EndSummary } from './world/types';
import { Dialogue } from './story/Dialogue';
import { Scent } from './gameplay/Scent';
import { Rain } from './world/Rain';
import { Interactions } from './gameplay/Interactions';
import { HUD } from './ui/HUD';
import { Menu } from './ui/Menu';
import { Settings } from './core/Settings';
import { t, tPrompt } from './ui/i18n';
import { evaluateStory } from './world/storyTree';
import { LAKOTELEP_STORY } from './world/lakotelepStory';
import type { JumpTarget } from './player/JumpFinder';

/** The Meshy cat faces -Z in its file; rotate so it faces +Z (the cat's forward). */
const CAT_MODEL_YAW = 0;
/** Clip advance of cat_lowpoly.glb in cat-lengths/s (printed by tools/rig/lowpoly_cat.py). */
const LOWPOLY_SPEED = { walk: 0.6196, run: 2.7451 };

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const settings = new Settings();
  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.data.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;

  const camera = new THREE.PerspectiveCamera(settings.data.fov, innerWidth / innerHeight, 0.05, 120);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  const physics = await Physics.create();
  const input = new Input(canvas);
  const audio = new Audio();
  const hud = new HUD();
  const interactions = new Interactions();

  const params = new URLSearchParams(location.search);
  const dialogue = new Dialogue();
  const scent = new Scent(canvas);
  scene.add(scent.points);

  let cat!: Cat;
  // Default: the lakótelep slice. `?level=alley` = the original greybox alley.
  const level: GameLevel = params.get('level') === 'alley'
    ? new Level(scene, physics, interactions, audio, () => cat)
    : new Lakotelep(scene, physics, interactions, audio, () => cat, dialogue);
  cat = new Cat(physics, audio, level.spawn);
  cat.yaw = level.spawnYaw;
  scene.add(cat.root);
  const follow = new FollowCamera(camera, physics);
  const rain = new Rain();
  scene.add(rain.mesh);

  // Jump target marker: soft ring + faint beam.
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.15, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.renderOrder = 10; // visible through the ledge lip, so you can see where you'll land
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.5, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  beam.position.y = 0.25;
  marker.add(ring, beam);
  marker.visible = false;
  scene.add(marker);

  // Debug: physics wireframe + readout. Toggle with ` or ?debug in the URL.
  const debugLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  debugLines.frustumCulled = false;
  scene.add(debugLines);
  hud.debugVisible = params.has('debug');

  // ── settings, applied live ──
  const againBtn = document.getElementById('again')!;
  let shadowsOn = renderer.shadowMap.enabled;
  settings.onChange((s) => {
    audio.setVolumes(s.masterVolume, s.musicVolume, s.ambienceVolume, s.sfxVolume);
    input.sensitivity = s.sensitivity;
    input.invertY = s.invertY;
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    const pr = Math.min(devicePixelRatio, s.pixelRatio);
    if (renderer.getPixelRatio() !== pr) {
      renderer.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
    }
    if (shadowsOn !== s.shadows) {
      shadowsOn = renderer.shadowMap.enabled = s.shadows;
      // Shadow sampling is compiled into the shaders: rebuild them.
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    }
    rain.setDensity(s.rain);
    againBtn.textContent = t('again');
  });

  // ── title / pause menu ──
  const titleEl = document.getElementById('title')!;
  const endEl = document.getElementById('end')!;
  const menu = new Menu(titleEl, settings, {
    play: () => start(),
    resume: () => start(),
    restart: () => { resetGame(); start(); },
    story: () => (level instanceof Lakotelep ? evaluateStory(LAKOTELEP_STORY, level) : null),
    levels: {
      get options(): Array<[string, string]> { return [['lakotelep', t('levelLakotelep')], ['alley', t('levelAlley')]]; },
      current: level instanceof Lakotelep ? 'lakotelep' : 'alley',
      // Levels are built at boot, so switching reloads with the same URL switch as before.
      select: (id) => {
        const q = new URLSearchParams(location.search);
        if (id === 'alley') q.set('level', 'alley'); else q.delete('level');
        q.delete('beat');
        location.search = q.toString();
      },
    },
    starts: () => (level instanceof Lakotelep ? [
      ['', t('startBeginning')], ['courtyard', t('startCourtyard')], ['garage', t('startGarage')],
      ['bus', t('startBus')], ['underpass', t('startUnderpass')], ['hall', t('startHall')],
      ['square', t('startSquare')], ['fetch', t('startFetch')],
    ] : []),
  });
  menu.startAt = params.get('beat') ?? '';
  // `?beat=` is a one-shot jump: drop it from the address so a reload starts on the balcony again.
  if (params.has('beat')) {
    const q = new URLSearchParams(location.search);
    q.delete('beat');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
  }
  // Cat model: the low-poly rig; coats are a recolour, so only the first call loads.
  let catLoaded = false;
  const loadCat = async (skin: string) => {
    if (catLoaded) { cat.setSkin(skin); return; }
    catLoaded = true;
    try {
      await cat.loadModel(`${import.meta.env.BASE_URL}models/cat_lowpoly.glb`, CAT_MODEL_YAW, { speeds: LOWPOLY_SPEED, skin });
    } catch (e) {
      console.warn('cat_lowpoly.glb failed, using placeholder', e);
    }
  };
  await loadCat(settings.data.catSkin);
  settings.onChange((s, key) => { if (key === 'catSkin' || key === null) void loadCat(s.catSkin); });
  menu.setReady();

  let running = false;
  let paused = false;
  let begun = false;
  const begin = () => {
    begun = true;
    level.begin?.();
    // Title menu "Kezdés" (or `?beat=courtyard|garage|bus|underpass`) jumps into the story.
    const beat = menu.startAt;
    if (beat && level instanceof Lakotelep) level.skipTo(beat);
  };
  /** Play from the title, resume from pause, or replay from the end card. */
  const start = () => {
    menu.close();
    endEl.hidden = true;
    paused = false;
    audio.start();
    input.lock();
    input.clearPressed();
    running = true;
    if (!begun) begin();
  };
  againBtn.onclick = () => { resetGame(); start(); };

  const pause = () => {
    if (!running) return;
    running = false;
    paused = true;
    audio.setPaused(true);
    if (document.pointerLockElement) document.exitPointerLock();
    menu.open('pause');
  };
  // Esc while pointer-locked is eaten by the browser to release the lock; losing the
  // lock any other way (alt-tab, focus loss) should pause too.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && running) pause();
  });
  addEventListener('blur', () => pause());

  level.onGoal = (summary?: EndSummary) => {
    running = false;
    document.exitPointerLock?.();
    if (summary) {
      endEl.querySelector('.kicker')!.textContent = summary.kicker;
      endEl.querySelector('h1')!.textContent = summary.title;
      endEl.querySelector('.lede')!.textContent = summary.lede;
      const list = endEl.querySelector('.summary')!;
      list.innerHTML = '';
      for (const it of summary.items ?? []) {
        const li = document.createElement('li');
        li.className = it.done ? 'done' : '';
        li.textContent = it.label;
        list.appendChild(li);
      }
    }
    endEl.hidden = false;
  };

  const resetGame = () => {
    level.reset();
    cat.carry(null);
    dialogue.clearAll();
    cat.teleport(level.spawn, level.spawnYaw);
    follow.snapBehind(cat.yaw, cat.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)));
    begun = false;
    if (running) begin();
  };

  // ── loop ──
  let acc = 0;
  let last = performance.now();
  let time = 0;
  let target: JumpTarget | null = null;
  let scanTick = 0;
  let fpsAvg = 60;
  const moveWorld = new THREE.Vector3();

  const frame = (now: number, manual = false) => {
    if (!manual) requestAnimationFrame((t) => frame(t));
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    fpsAvg += (1 / Math.max(dt, 1e-4) - fpsAvg) * 0.05;

    input.poll(dt);
    menu.update();
    if (running && input.consume('pause')) pause();
    if (running && input.consume('story') && level instanceof Lakotelep) { pause(); menu.show('pause', 'story'); }
    const look = running ? input.consumeLook() : { x: 0, y: 0 };
    if (paused) {
      // Simulation frozen; keep drawing the scene behind the menu.
      input.consumeLook();
      hud.setPrompts([]);
      composer.render();
      return;
    }

    // Camera-relative movement.
    const fwd = follow.forward();
    const right = follow.right();
    moveWorld.set(0, 0, 0).addScaledVector(fwd, input.move.y).addScaledVector(right, input.move.x);
    if (!running) moveWorld.set(0, 0, 0);

    if (running) {
      if (input.consume('reset')) resetGame();
      if (input.consume('debug')) hud.debugVisible = !hud.debugVisible;

      // Jump target scan (every 3rd frame) — aim with stick if moving, else with camera.
      if (cat.state === 'ground' && ++scanTick % 3 === 0) {
        const intent = moveWorld.lengthSq() > 0.01 ? moveWorld.clone().normalize() : fwd.clone();
        target = cat.jumpFinder.update(cat.feet, intent);
      } else if (cat.state !== 'ground') {
        target = null;
      }

      const focused = interactions.update(cat.feet, cat.forward(), cat.busy || cat.state !== 'ground');
      if (input.consume('jump') && target) cat.startJump(target);
      const focusAction = focused?.action ?? 'interact';
      if (input.consume('interact') && focused && focusAction === 'interact') focused.onInteract();
      if (input.consume('meow')) {
        audio.meow();
        level.meow(cat.feet);
        hud.toast(t('meowToast'), 700);
        if (focused && focusAction === 'meow') focused.onInteract();
      }
      input.consume('jump'); // drop stale presses

      const prompts: Array<{ key: string; label: string }> = [];
      if (target && cat.state === 'ground') prompts.push({ key: input.label('jump'), label: target.kind === 'down' ? t('jumpDown') : t('jump') });
      if (focused) prompts.push({ key: input.label(focused.action ?? 'interact'), label: tPrompt(focused.label) });
      hud.setPrompts(prompts);
    } else {
      hud.setPrompts([]);
    }

    // Fixed-step simulation.
    acc += dt;
    let steps = 0;
    while (acc >= FIXED_DT && steps < 4) {
      cat.fixedUpdate(FIXED_DT, moveWorld.clone(), input.sprint);
      physics.step();
      acc -= FIXED_DT;
      steps++;
    }
    if (steps === 4) acc = 0;
    const alpha = acc / FIXED_DT;

    if (cat.feet.y < -4) resetGame();

    physics.syncMeshes(alpha);
    cat.render(alpha, dt, time);
    level.update(dt, time);
    scent.update(dt, time, running && input.scent, level.scentTrail?.());
    level.setScentMode?.(scent.active);

    follow.update(dt, cat.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)), look, {
      catYaw: cat.yaw,
      catSpeed: cat.speed,
      idleLook: (performance.now() - input.lastLookTime) / 1000,
      airborne: cat.state === 'jump' || cat.state === 'fall',
    });
    const wet = level.weather?.() ?? 1;
    rain.setDensity(settings.data.rain * wet);
    audio.setRain(wet);
    rain.update(dt, camera.position);
    // Camera squeezed against a wall: hide the cat rather than fill the screen with fur.
    cat.root.visible = camera.position.distanceTo(cat.root.position) > 0.42;

    // Marker.
    marker.visible = !!target && cat.state === 'ground' && running;
    if (target) {
      marker.position.copy(target.point);
      const s = 1 + Math.sin(time * 6) * 0.08;
      ring.scale.setScalar(s);
    }

    hud.setObjective(running || begun ? level.objectiveHTML() : '');

    if (hud.debugVisible) {
      const { vertices, colors } = physics.world.debugRender();
      debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      debugLines.visible = true;
      hud.setDebug([
        `fps   ${fpsAvg.toFixed(0)}`,
        `state ${cat.state}`,
        `feet  ${cat.feet.x.toFixed(2)} ${cat.feet.y.toFixed(2)} ${cat.feet.z.toFixed(2)}`,
        `speed ${cat.speed.toFixed(2)}`,
        `jump  ${target ? `${target.kind} dh=${target.dh.toFixed(2)} d=${target.dist.toFixed(2)}` : '-'}`,
        `calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`,
      ].join('\n'));
    } else {
      debugLines.visible = false;
    }

    composer.render();
  };
  requestAnimationFrame((t) => frame(t));

  // Handle for automated tests / console tinkering.
  (window as any).__game = { cat, level, physics, follow, input, resetGame, start, pause, dialogue, scent, settings, menu,
    get paused() { return paused; },
    /** Advance n frames by hand (for headless tests where rAF is paused). */
    advance(n = 1) { for (let i = 0; i < n; i++) frame(last + 1000 / 60, true); },
    get target() { return target; },
    // ── test kit: drive the game headlessly (rAF is paused in hidden tabs) ──
    /** Advance n frames, letting story coroutines (promises) settle between them. */
    async tick(n = 1) { for (let i = 0; i < n; i++) { this.advance(1); for (let k = 0; k < 8; k++) await null; } },
    pos: () => cat.feet.toArray().map((v) => +v.toFixed(2)).join(',') + ' ' + cat.state,
    async walk(x: number, z: number, frames = 600, run = true) {
      for (let i = 0; i < frames; i++) {
        const d = new THREE.Vector3(x - cat.feet.x, 0, z - cat.feet.z);
        const len = d.length();
        if (len < 0.12) break;
        cat.fixedUpdate(FIXED_DT, d.normalize().multiplyScalar(len < 0.6 ? 0.4 : 1), run && len > 0.6);
        physics.step();
        await this.tick(1);
      }
      return this.pos();
    },
    async jump(x: number, z: number) {
      const t = cat.jumpFinder.update(cat.feet, new THREE.Vector3(x, 0, z).normalize());
      if (!t) return 'none @' + this.pos();
      cat.startJump(t);
      await this.tick(90);
      return `${t.kind} → ${this.pos()}`;
    },
    face(p: THREE.Vector3) { cat.yaw = Math.atan2(p.x - cat.feet.x, p.z - cat.feet.z); },
    key(code: string) {
      dispatchEvent(new KeyboardEvent('keydown', { code }));
      dispatchEvent(new KeyboardEvent('keyup', { code }));
    },
    focused: () => interactions.focused?.id ?? null,
  };
}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Hiba a betöltéskor: ' + (e?.message ?? e);
});
