import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };
export type Collider = RAPIER.Collider;
export type RigidBody = RAPIER.RigidBody;

export const FIXED_DT = 1 / 60;

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: Collider;
}

/**
 * Thin wrapper around a Rapier world: fixed-step simulation, three.js mesh sync for
 * dynamic bodies, and query helpers that speak THREE.Vector3.
 */
export class Physics {
  world: RAPIER.World;
  /** Dynamic bodies whose meshes follow the simulation. */
  private synced: Array<{ body: RigidBody; mesh: THREE.Object3D; prev: THREE.Vector3; prevQ: THREE.Quaternion }> = [];
  /** Colliders the player is excluded from in queries (set by the cat). */
  playerBody: RigidBody | null = null;

  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
  }

  step() {
    for (const s of this.synced) {
      const t = s.body.translation();
      const r = s.body.rotation();
      s.prev.set(t.x, t.y, t.z);
      s.prevQ.set(r.x, r.y, r.z, r.w);
    }
    this.world.step();
  }

  /** Interpolate dynamic meshes between the last two physics states. */
  syncMeshes(alpha: number) {
    const q = new THREE.Quaternion();
    for (const s of this.synced) {
      const t = s.body.translation();
      const r = s.body.rotation();
      s.mesh.position.lerpVectors(s.prev, new THREE.Vector3(t.x, t.y, t.z), alpha);
      q.set(r.x, r.y, r.z, r.w);
      s.mesh.quaternion.slerpQuaternions(s.prevQ, q, alpha);
    }
  }

  addFixedBox(center: THREE.Vector3, size: THREE.Vector3, rotY = 0, friction = 0.8) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(center.x, center.y, center.z)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)),
    );
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setFriction(friction),
      body,
    );
  }

  addDynamic(mesh: THREE.Object3D, desc: RAPIER.ColliderDesc, opts: { mass?: number } = {}) {
    const q = mesh.quaternion;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.2)
        .setAngularDamping(0.4)
        .setCcdEnabled(true),
    );
    if (opts.mass) desc.setMass(opts.mass);
    this.world.createCollider(desc, body);
    this.synced.push({ body, mesh, prev: mesh.position.clone(), prevQ: mesh.quaternion.clone() });
    return body;
  }

  addSensor(center: THREE.Vector3, radius: number) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    return this.world.createCollider(RAPIER.ColliderDesc.ball(radius).setSensor(true), body);
  }

  /**
   * Ray query that ignores the player and sensors. `solid=false` means a ray starting
   * inside a box reports the exit face, which the callers reject via the normal.
   */
  ray(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, opts: { solid?: boolean; ignoreDynamic?: boolean } = {}): RayHit | null {
    const ray = new RAPIER.Ray(origin, dir);
    const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | (opts.ignoreDynamic ? RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC : 0);
    const hit = this.world.castRayAndGetNormal(
      ray, maxDist, opts.solid ?? false, flags, undefined, undefined, this.playerBody ?? undefined,
    );
    if (!hit) return null;
    const d = hit.timeOfImpact;
    return {
      point: origin.clone().addScaledVector(dir, d),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: d,
      collider: hit.collider,
    };
  }

  /** True if the straight segment a→b is free of static geometry. */
  segmentClear(a: THREE.Vector3, b: THREE.Vector3) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-4) return true;
    dir.divideScalar(len);
    return !this.ray(a, dir, len, { solid: true, ignoreDynamic: true });
  }
}
