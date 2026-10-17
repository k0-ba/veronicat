import type { StoryNode } from '../world/storyTree';
import { t } from './i18n';

/**
 * Renders evaluated story nodes as a layered tree: layer = longest path from a root,
 * cards in rows, SVG edges drawn after layout. Knows nothing about any one story.
 */
/** How many steps past the unlocked frontier show up, as nameless cue cards. */
const LOOKAHEAD = 2;

export function renderStoryTree(all: StoryNode[]) {
  // Spoiler control: unlocked nodes are shown; locked ones only as cues within
  // LOOKAHEAD steps of the frontier; everything further out stays hidden.
  const depth = new Map<string, number>();
  for (const n of all) {
    if (n.status !== 'locked') { depth.set(n.id, 0); continue; }
    const ds = n.parents.map((p) => depth.get(p) ?? Infinity);
    depth.set(n.id, ds.length ? Math.max(...ds) + 1 : Infinity);
  }
  const nodes = all.filter((n) => depth.get(n.id)! <= LOOKAHEAD);
  const more = nodes.length < all.length && all.some((n) => depth.get(n.id)! > LOOKAHEAD && n.parents.length > 0);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const layer = new Map<string, number>();
  for (const n of nodes) {
    const ps = n.parents.filter((p) => byId.has(p));
    layer.set(n.id, ps.length ? Math.max(...ps.map((p) => layer.get(p) ?? 0)) + 1 : 0);
  }
  const rows: StoryNode[][] = [];
  for (const n of nodes) (rows[layer.get(n.id)!] ??= []).push(n);

  // Outer element scrolls sideways on narrow screens; the inner one is as wide as the
  // widest row, so every row centres on the same axis and edges share one origin.
  const root = document.createElement('div');
  root.className = 'story-tree';
  const inner = document.createElement('div');
  inner.className = 'story-inner';
  root.append(inner);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('story-edges');
  inner.append(svg);

  const cards = new Map<string, HTMLElement>();
  for (const row of rows) {
    if (!row) continue;
    const r = document.createElement('div');
    r.className = 'story-row';
    for (const n of row) {
      const c = card(n);
      cards.set(n.id, c);
      r.append(c);
    }
    inner.append(r);
  }
  if (more) {
    const r = document.createElement('div');
    r.className = 'story-row story-more';
    r.textContent = t('storyMore');
    inner.append(r);
  }

  /** Call once the tree is in the DOM (and on resize): edges need real positions. */
  const layoutEdges = () => {
    const box = inner.getBoundingClientRect();
    const ox = box.left, oy = box.top;
    svg.setAttribute('width', String(inner.offsetWidth));
    svg.setAttribute('height', String(inner.offsetHeight));
    svg.innerHTML = '';
    for (const n of nodes) {
      const to = cards.get(n.id)!.getBoundingClientRect();
      for (const pid of n.parents) {
        const fromEl = cards.get(pid);
        if (!fromEl) continue;
        const from = fromEl.getBoundingClientRect();
        const x1 = from.left + from.width / 2 - ox, y1 = from.bottom - oy;
        const x2 = to.left + to.width / 2 - ox, y2 = to.top - oy;
        // An edge that skips a layer bows sideways so it doesn't run through the cards between.
        const skip = layer.get(n.id)! - layer.get(pid)! > 1;
        const bow = skip ? Math.max(from.width, to.width) * 0.75 : 0;
        const dy = (y2 - y1) * 0.5;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} C${x1 + bow},${y1 + dy} ${x2 + bow},${y2 - dy} ${x2},${y2}`);
        const parent = byId.get(pid)!;
        const lit = parent.status === 'done' && (n.status === 'done' || n.status === 'current' || n.status === 'open');
        path.setAttribute('class', lit ? 'lit' : parent.status === 'done' ? 'half' : '');
        svg.append(path);
      }
    }
  };

  const focusables = [...cards.values()];
  const currentIdx = Math.max(0, nodes.findIndex((n) => n.status === 'current'));
  return { el: root, focusables, currentIdx, layoutEdges };
}

function card(n: StoryNode) {
  if (n.status === 'locked') return cueCard(n);
  const c = document.createElement('div');
  c.className = `story-card st-${n.status} kind-${n.kind}${n.playable ? '' : ' future'}`;
  c.tabIndex = 0;
  const statusLabel = t(`st_${n.status}` as const);
  let html = `<div class="story-meta"><span class="story-badge">${statusLabel}</span>${n.sub ? `<span>${esc(n.sub)}</span>` : ''}</div>`;
  html += `<div class="story-title">${esc(n.title)}</div>`;
  if (n.beats.length) {
    // Done beats and the next main beat are named; later ones fold into one ellipsis,
    // undiscovered side threads stay a nameless hint.
    const nextMain = n.beats.find((b) => !b.side && !b.done);
    let folded = false;
    const items: string[] = [];
    for (const b of n.beats) {
      if (b.done || b === nextMain) {
        items.push(`<li class="${b.done ? 'done' : 'next'}${b.side ? ' side' : ''}">${esc(b.label)}${b.side ? ` <em>${t('sideThread')}</em>` : ''}</li>`);
      } else if (b.side) {
        items.push(`<li class="side cue">??? <em>${t('sideThread')}</em></li>`);
      } else if (!folded) {
        folded = true;
        items.push('<li class="cue">…</li>');
      }
    }
    html += '<ul class="story-beats">' + items.join('') + '</ul>';
  }
  if (n.condition) {
    html += `<div class="story-cond${n.condition.met ? ' met' : ''}">${n.condition.met ? '●' : '○'} ${esc(n.condition.label)}</div>`;
  }
  c.innerHTML = html;
  c.setAttribute('aria-label', `${n.title} — ${statusLabel}`);
  return c;
}

/** A locked node: its place in the tree, never its name. */
function cueCard(n: StoryNode) {
  const c = document.createElement('div');
  c.className = `story-card st-locked cue kind-${n.kind}`;
  c.tabIndex = 0;
  const label = t(n.kind === 'choice' ? 'cueChoice' : n.kind === 'ending' ? 'cueEnding' : 'st_locked');
  c.innerHTML = `<div class="story-meta"><span class="story-badge">${label}</span></div><div class="story-title">???</div>`;
  c.setAttribute('aria-label', label);
  return c;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}
