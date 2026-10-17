/**
 * Narrative progress tree: a level declares its chapters (and branches / endings) as
 * data with predicates over its live story state; the UI only renders what
 * `evaluateStory` returns, so new chapters show up by adding definitions.
 */
export type StoryNodeKind = 'chapter' | 'branch' | 'choice' | 'ending';
export type StoryStatus = 'done' | 'current' | 'open' | 'locked';

export interface StoryBeatDef<S> {
  label: string;
  /** Optional side thread rather than the main path. */
  side?: boolean;
  done(s: S): boolean;
}

export interface StoryNodeDef<S> {
  id: string;
  title: string;
  /** In-world time or a short tagline. */
  sub?: string;
  kind: StoryNodeKind;
  parents: string[];
  /** False: designed (NARRATIVA.md) but not in this build. */
  playable: boolean;
  beats?: StoryBeatDef<S>[];
  done?(s: S): boolean;
  current?(s: S): boolean;
  /** Ending / branch condition already satisfied by the player's choices. */
  condition?: { label: string; met(s: S): boolean };
}

export interface StoryNode {
  id: string;
  title: string;
  sub?: string;
  kind: StoryNodeKind;
  parents: string[];
  playable: boolean;
  status: StoryStatus;
  beats: Array<{ label: string; side: boolean; done: boolean }>;
  condition?: { label: string; met: boolean };
}

export function evaluateStory<S>(defs: StoryNodeDef<S>[], state: S): StoryNode[] {
  const status = new Map<string, StoryStatus>();
  return defs.map((d) => {
    const beats = (d.beats ?? []).map((b) => ({ label: b.label, side: !!b.side, done: b.done(state) }));
    const main = beats.filter((b) => !b.side);
    const done = d.done ? d.done(state) : d.playable && main.length > 0 && main.every((b) => b.done);
    // A playable node whose parents are all outside this build is this build's entry point.
    const reachable = d.parents.length === 0 || d.parents.some((p) => status.get(p) === 'done') ||
      d.parents.every((p) => defs.find((x) => x.id === p)?.playable === false);
    let st: StoryStatus;
    if (done) st = 'done';
    else if (d.playable && (d.current?.(state) ?? false)) st = 'current';
    else if (d.playable && reachable) st = 'open';
    else st = 'locked';
    status.set(d.id, st);
    return {
      id: d.id, title: d.title, sub: d.sub, kind: d.kind, parents: d.parents, playable: d.playable,
      status: st, beats,
      condition: d.condition && { label: d.condition.label, met: d.condition.met(state) },
    };
  });
}
