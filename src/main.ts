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
import { Rain } from './world/Rain';
import { Interactions } from './gameplay/Interactions';
import { HUD } from './ui/HUD';
import type { JumpTarget } from './player/JumpFinder';

/** The Meshy cat faces -Z in its file; rotate so it faces +Z (the cat's forward). */
const CAT_MODEL_YAW = 0;

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 120);

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

  let cat!: Cat;
  const level = new Level(scene, physics, interactions, audio, () => cat);
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
  hud.debugVisible = new URLSearchParams(location.search).has('debug');

  // ── start screen ──
  const loadingEl = document.getElementById('loading')!;
  const startBtn = document.getElementById('start') as HTMLButtonElement;
  const titleEl = document.getElementById('title')!;
  const endEl = document.getElementById('end')!;
  try {
    await cat.loadModel(`${import.meta.env.BASE_URL}models/cat.glb`, CAT_MODEL_YAW);
  } catch (e) {
    console.warn('cat.glb failed, using placeholder', e);
  }
  loadingEl.hidden = true;
  startBtn.hidden = false;

  let running = false;
  const start = () => {
    titleEl.hidden = true;
    endEl.hidden = true;
    audio.start();
    input.lock();
    input.clearPressed();
    running = true;
  };
  startBtn.onclick = start;
  document.getElementById('again')!.onclick = () => { resetGame(); start(); };

  level.onGoal = () => {
    running = false;
    document.exitPointerLock?.();
    endEl.hidden = false;
  };

  const resetGame = () => {
    level.reset();
    cat.teleport(level.spawn, level.spawnYaw);
    follow.snapBehind(cat.yaw, cat.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)));
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
    const look = running ? input.consumeLook() : { x: 0, y: 0 };

    // Camera-relative movement.
    const fwd = follow.forward();
    const right = follow.right();
    moveWorld.set(0, 0, 0).addScaledVector(fwd, input.move.y).addScaledVector(right, input.move.x);
    if (!running) moveWorld.set(0, 0, 0);

    if (running) {
      if (input.consume('reset')) resetGame();
      if (input.consume('debug')) hud.debugVisible = !hud.debugVisible;
      if (input.consume('meow')) { audio.meow(); level.meow(cat.feet); hud.toast('Miáú', 700); }

      // Jump target scan (every 3rd frame) — aim with stick if moving, else with camera.
      if (cat.state === 'ground' && ++scanTick % 3 === 0) {
        const intent = moveWorld.lengthSq() > 0.01 ? moveWorld.clone().normalize() : fwd.clone();
        target = cat.jumpFinder.update(cat.feet, intent);
      } else if (cat.state !== 'ground') {
        target = null;
      }

      const focused = interactions.update(cat.feet, cat.forward(), cat.busy || cat.state !== 'ground');
      if (input.consume('jump') && target) cat.startJump(target);
      if (input.consume('interact') && focused) focused.onInteract();
      input.consume('jump'); // drop stale presses

      const prompts: Array<{ key: string; label: string }> = [];
      if (target && cat.state === 'ground') prompts.push({ key: input.label('jump'), label: target.kind === 'down' ? 'Leugrás' : 'Ugrás' });
      if (focused) prompts.push({ key: input.label(focused.action ?? 'interact'), label: focused.label });
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

    follow.update(dt, cat.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)), look, {
      catYaw: cat.yaw,
      catSpeed: cat.speed,
      idleLook: (performance.now() - input.lastLookTime) / 1000,
      airborne: cat.state === 'jump' || cat.state === 'fall',
    });
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

    objective(level, hud);

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
  (window as any).__game = { cat, level, physics, follow, input, resetGame, start,
    /** Advance n frames by hand (for headless tests where rAF is paused). */
    advance(n = 1) { for (let i = 0; i < n; i++) frame(last + 1000 / 60, true); },
    get target() { return target; } };
}

function objective(level: Level, hud: HUD) {
  const f = level.flags;
  let main: string;
  if (f.reachedRoof) main = 'Keresd a <b>meleg szellőzőt</b> a tetőn, és szundíts egyet.';
  else if (f.reachedBalcony) main = 'Tovább: a <b>cégéren</b> át a túloldali párkányra, onnan a tetőre.';
  else main = 'Juss fel a <b>tetőre</b> — a ládákon és a klímán át az erkélyre.';
  const side: string[] = [];
  if (f.scratched) side.push('karmolás ✓');
  if (f.robotRubbed) side.push('robotbarát ✓');
  if (f.cansKnocked) side.push(`lelökött dobozok: ${f.cansKnocked}/3`);
  hud.setObjective(main + (side.length ? `<br><small>${side.join(' · ')}</small>` : ''));
}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Hiba a betöltéskor: ' + (e?.message ?? e);
});
