import type * as THREE from 'three';

export interface EndSummary {
  kicker: string;
  title: string;
  lede: string;
  items?: Array<{ label: string; done: boolean }>;
}

/** What main.ts needs from a playable level. */
export interface GameLevel {
  readonly spawn: THREE.Vector3;
  readonly spawnYaw: number;
  onGoal: (summary?: EndSummary) => void;
  /** Called once when the player presses start (story scripts begin here). */
  begin?(): void;
  update(dt: number, time: number): void;
  meow(from: THREE.Vector3): void;
  reset(): void;
  objectiveHTML(): string;
  /** Polyline the scent mode reveals (current story target), or null. */
  scentTrail?(): THREE.Vector3[] | null;
  /** Things that glow brighter in scent mode (Bori's signs). */
  setScentMode?(on: boolean): void;
}
