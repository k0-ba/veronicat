import type { Settings, SettingsData } from '../core/Settings';
import { t, setLang, type StringKey } from './i18n';
import type { StoryNode } from '../world/storyTree';
import { renderStoryTree } from './StoryTree';
import { SKIN_IDS } from '../player/catSkins';

/**
 * Title + pause menu with Settings / Controls / Credits pages, built into #title.
 * Navigation is one flat list of controls per page, so mouse, keyboard and gamepad
 * all drive the same focus index: ↑↓ move, ←→ adjust, Enter/A activate, Esc/B back.
 */
type Page = 'root' | 'settings' | 'controls' | 'credits' | 'story';
type Mode = 'title' | 'pause';

export interface MenuHandlers {
  play(): void;
  resume(): void;
  restart(): void;
  /** Level picker on the title menu: options, the running one, and how to switch. */
  levels: { options: Array<[string, string]>; current: string; select(id: string): void };
  /** Story start points for the running level (first = from the beginning); empty if none. */
  starts(): Array<[string, string]>;
  /** Live story tree of the current level, or null if it has none. */
  story(): StoryNode[] | null;
}

interface Ctl {
  el: HTMLElement;
  activate?(): void;
  adjust?(dir: -1 | 1): void;
}

const RAIN_STEPS: Array<[number, StringKey]> = [[0, 'rainOff'], [0.33, 'rainLow'], [0.66, 'rainMid'], [1, 'rainHigh']];
const PIXEL_STEPS = [1, 1.5, 2];

export class Menu {
  isOpen = true;
  private panel: HTMLElement;
  private page: Page = 'root';
  private mode: Mode = 'title';
  private ready = false;
  private ctls: Ctl[] = [];
  private focusIdx = 0;
  private openedAt = 0;
  private padPrev: boolean[] = [];
  private padDir = '';
  private padNext = 0;
  /** Root items that open a page, in render order, so Back lands on the right one. */
  private rootPages: Page[] = [];
  private rootPageStart = 0;
  /** Chosen story start point (title menu), read by main on Play. */
  startAt = '';
  private relayout: (() => void) | null = null;

  constructor(private el: HTMLElement, private settings: Settings, private h: MenuHandlers) {
    this.panel = el.querySelector('.panel')!;
    // Registered after Input's own keydown listener, so a resume here clears the
    // Esc that Input just recorded instead of racing it.
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('resize', () => this.relayout?.());
    settings.onChange((s, key) => {
      if (key === 'lang' || key === null) {
        setLang(s.lang);
        this.render(this.focusIdx);
      }
    });
  }

  setReady() {
    this.ready = true;
    if (this.isOpen) this.render(0);
  }

  open(mode: Mode) {
    this.mode = mode;
    this.page = 'root';
    this.isOpen = true;
    this.el.hidden = false;
    this.openedAt = performance.now();
    this.seedPad();
    this.render(0);
  }

  /** Open (or switch to) a page directly, e.g. the story tree on N. */
  show(mode: Mode, page: Page) {
    if (!this.isOpen || this.mode !== mode) this.open(mode);
    this.go(page);
  }

  get currentPage() { return this.page; }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  // ── pages ──

  private render(focus = 0) {
    const p = this.panel;
    p.innerHTML = '';
    this.ctls = [];
    p.classList.toggle('menu-wide', this.page === 'settings');
    p.classList.toggle('menu-story', this.page === 'story');
    this.relayout = null;

    const kicker = div('kicker', this.mode === 'pause' ? t('paused') : t('kicker'));
    p.append(kicker);
    if (this.page === 'root') {
      p.append(el('h1', '', 'Szotyi'), el('p', 'lede', t('lede')));
    } else {
      p.append(el('h2', 'menu-title', t(this.page)));
    }

    const body = div('menu-body');
    p.append(body);
    if (this.page === 'root') this.buildRoot(body);
    else if (this.page === 'settings') this.buildSettings(body);
    else if (this.page === 'controls') this.buildControls(body);
    else if (this.page === 'story') focus = this.buildStory(body, focus);
    else this.buildCredits(body);

    p.append(div('menu-hint', `${t('navHint')}<br>${t('padHint')}`));
    p.scrollTop = 0;
    // buildStory sets it; TS can't see that through the call.
    (this.relayout as (() => void) | null)?.();
    this.setFocus(Math.min(focus, this.ctls.length - 1), this.page === 'story');
  }

  private buildRoot(body: HTMLElement) {
    const list = div('menu-list');
    body.append(list);
    if (!this.ready) {
      list.append(div('menu-loading', t('loading')));
      return;
    }
    this.rootPages = [];
    if (this.mode === 'title') {
      this.button(list, t('play'), () => this.h.play(), true);
      const lv = this.h.levels;
      this.option(list, t('level'), lv.options, () => lv.current, (id) => lv.select(id));
      const starts = this.h.starts();
      if (starts.length > 1) this.option(list, t('startAt'), starts, () => this.startAt, (id) => { this.startAt = id; });
    } else {
      this.button(list, t('resume'), () => this.h.resume(), true);
      this.button(list, t('restart'), () => this.h.restart());
    }
    const pages: Array<Exclude<Page, 'root'>> = this.mode === 'pause' && this.h.story() ? ['story', 'settings', 'controls', 'credits'] : ['settings', 'controls', 'credits'];
    this.rootPageStart = this.ctls.length;
    for (const pg of pages) {
      this.rootPages.push(pg);
      this.button(list, t(pg), () => this.go(pg));
    }
  }

  private buildSettings(body: HTMLElement) {
    const s = this.settings;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    body.append(div('set-sec', t('secAudio')));
    this.slider(body, 'masterVolume', 0, 1, 0.05, pct);
    this.slider(body, 'musicVolume', 0, 1, 0.05, pct);
    this.slider(body, 'ambienceVolume', 0, 1, 0.05, pct);
    this.slider(body, 'sfxVolume', 0, 1, 0.05, pct);

    body.append(div('set-sec', t('secControls')));
    this.slider(body, 'sensitivity', 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`);
    this.choice(body, 'invertY', [[false, t('off')], [true, t('on')]]);

    body.append(div('set-sec', t('secGraphics')));
    this.slider(body, 'fov', 45, 90, 1, (v) => `${v}°`);
    this.choice(body, 'shadows', [[true, t('on')], [false, t('off')]]);
    this.choice(body, 'pixelRatio', PIXEL_STEPS.map((v): [number, string] => [v, `${v}×`]));
    this.choice(body, 'rain', RAIN_STEPS.map(([v, k]): [number, string] => [v, t(k)]));

    body.append(div('set-sec', t('secCat')));
    this.choice(body, 'catSkin', [...SKIN_IDS, 'classic'].map((id): [string, string] => [id, t(`skin_${id}` as StringKey)]));

    body.append(div('set-sec', t('secLanguage')));
    this.choice(body, 'lang', [['hu', 'Magyar'], ['en', 'English']]);
    if (s.data.lang === 'en') body.append(div('set-note', t('langNote')));

    const list = div('menu-list menu-foot');
    body.append(list);
    this.button(list, t('defaults'), () => s.reset());
    this.button(list, t('back'), () => this.back(), true);
  }

  private buildControls(body: HTMLElement) {
    const rows: Array<[string, StringKey]> = [
      ['WASD', 'cWalk'], ['Shift', 'cRun'], [t('mouse'), 'cLook'], ['Space', 'cJump'],
      ['E', 'cInteract'], ['Q', 'cMeow'], ['F', 'cScent'], ['R', 'cReset'], ['Esc', 'cPause'], ['N', 'cStory'],
    ];
    const dl = el('dl', 'controls');
    for (const [k, v] of rows) dl.append(el('dt', '', k), el('dd', '', t(v)));
    body.append(dl, el('p', 'hint', t('padControls')));
    const list = div('menu-list menu-foot');
    body.append(list);
    this.button(list, t('back'), () => this.back(), true);
  }

  private buildCredits(body: HTMLElement) {
    const rows: Array<[string, string]> = [
      [t('crArt'), 'Veronika'],
      [t('crCode'), 'k0ba'],
      [t('crCat'), 'Quaternius'],
      [t('crAnim'), t('crAnimWho')],
      [t('crTech'), 'three.js · Rapier · Vite'],
    ];
    const dl = el('dl', 'credits');
    for (const [k, v] of rows) dl.append(el('dt', '', k), el('dd', '', v));
    body.append(dl, el('p', 'hint', t('crThanks')));
    const list = div('menu-list menu-foot');
    body.append(list);
    this.button(list, t('back'), () => this.back(), true);
  }

  private buildStory(body: HTMLElement, focus: number) {
    const nodes = this.h.story();
    body.append(el('p', 'lede story-lede', `${t('storyLede')}`));
    if (!nodes) {
      body.append(el('p', 'hint', t('noStory')));
    } else {
      const tree = renderStoryTree(nodes);
      body.append(tree.el);
      for (const c of tree.focusables) this.add(null, { el: c });
      this.relayout = tree.layoutEdges;
      if (focus === 0) focus = tree.currentIdx;
    }
    const list = div('menu-list menu-foot');
    body.append(list);
    this.button(list, t('back'), () => this.back(), true);
    return focus;
  }

  private go(page: Page) {
    this.page = page;
    this.render(0);
  }

  private back() {
    if (this.page !== 'root') {
      const from = this.page;
      this.page = 'root';
      this.render(0);
      // Land back on the item that opened the page.
      const i = this.rootPages.indexOf(from);
      if (i >= 0) this.setFocus(i + this.rootPageStart, false);
    } else if (this.mode === 'pause' && performance.now() - this.openedAt > 250) {
      // The 250 ms guard: the Esc that broke pointer lock can arrive after the menu opened.
      this.h.resume();
    }
  }

  // ── controls ──

  private button(parent: HTMLElement, label: string, fn: () => void, primary = false) {
    const b = el('button', primary ? 'mi' : 'mi secondary', label) as HTMLButtonElement;
    b.type = 'button';
    b.onclick = fn;
    this.add(parent, { el: b, activate: fn });
  }

  private slider<K extends 'masterVolume' | 'musicVolume' | 'ambienceVolume' | 'sfxVolume' | 'sensitivity' | 'fov'>(
    parent: HTMLElement, key: K, min: number, max: number, step: number, fmt: (v: number) => string,
  ) {
    const s = this.settings;
    const row = div('set-row set-slider');
    row.tabIndex = 0;
    row.setAttribute('role', 'slider');
    row.setAttribute('aria-label', t(key));
    const val = div('set-val');
    const range = document.createElement('input');
    range.type = 'range';
    range.tabIndex = -1;
    Object.assign(range, { min: String(min), max: String(max), step: String(step) });
    const show = () => {
      const v = s.data[key];
      range.value = String(v);
      range.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      val.textContent = fmt(v);
      row.setAttribute('aria-valuetext', fmt(v));
    };
    const set = (v: number) => {
      const snapped = Math.round(Math.min(max, Math.max(min, v)) / step) * step;
      s.set(key, +snapped.toFixed(4) as SettingsData[K]);
      show();
    };
    range.oninput = () => set(+range.value);
    row.append(div('set-label', t(key)), val, range);
    show();
    this.add(parent, { el: row, adjust: (d) => set(s.data[key] + d * step) });
  }

  private choice<K extends keyof SettingsData>(parent: HTMLElement, key: K, opts: Array<[SettingsData[K], string]>) {
    const s = this.settings;
    const row = div('set-row set-choice');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', t(key as StringKey));
    const val = div('set-val');
    const index = () => {
      // Nearest option, so a float stored by an older build still lands somewhere.
      const cur = s.data[key];
      let best = 0, bestD = Infinity;
      opts.forEach(([v], i) => {
        const d = typeof v === 'number' ? Math.abs(v - (cur as number)) : v === cur ? 0 : Infinity;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    };
    const show = () => { val.innerHTML = `<span>‹</span>${opts[index()][1]}<span>›</span>`; };
    const step = (d: -1 | 1) => {
      const i = (index() + d + opts.length) % opts.length;
      s.set(key, opts[i][0]);
      if (key !== 'lang') show(); // lang re-renders the whole menu
    };
    row.onclick = () => step(1);
    row.append(div('set-label', t(key as StringKey)), val);
    show();
    this.add(parent, { el: row, activate: () => step(1), adjust: step });
  }

  /** A ‹ value › row that isn't a stored setting (level, start point). */
  private option(parent: HTMLElement, label: string, opts: Array<[string, string]>, get: () => string, set: (v: string) => void) {
    const row = div('set-row set-choice menu-option');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', label);
    const val = div('set-val');
    const index = () => Math.max(0, opts.findIndex(([v]) => v === get()));
    const show = () => { val.innerHTML = `<span>‹</span>${opts[index()][1]}<span>›</span>`; };
    const step = (d: -1 | 1) => {
      set(opts[(index() + d + opts.length) % opts.length][0]);
      show();
    };
    row.onclick = () => step(1);
    row.append(div('set-label', label), val);
    show();
    this.add(parent, { el: row, activate: () => step(1), adjust: step });
  }

  /** `parent` null: the element is already in the page (story cards). */
  private add(parent: HTMLElement | null, c: Ctl) {
    const i = this.ctls.length;
    this.ctls.push(c);
    c.el.classList.add('mi');
    c.el.addEventListener('mouseenter', () => this.setFocus(i, false));
    c.el.addEventListener('focus', () => { if (this.focusIdx !== i) this.setFocus(i, false); });
    parent?.append(c.el);
  }

  private setFocus(i: number, scroll = true) {
    if (!this.ctls.length) return;
    this.focusIdx = (i + this.ctls.length) % this.ctls.length;
    this.ctls.forEach((c, k) => c.el.classList.toggle('is-focus', k === this.focusIdx));
    const target = this.ctls[this.focusIdx].el;
    if (document.activeElement !== target) target.focus({ preventScroll: true });
    if (scroll) target.scrollIntoView({ block: 'nearest' });
  }

  // ── input ──

  private onKey(e: KeyboardEvent) {
    if (!this.isOpen) return;
    const c = this.ctls[this.focusIdx];
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this.setFocus(this.focusIdx - 1); break;
      case 'ArrowDown': case 'KeyS': this.setFocus(this.focusIdx + 1); break;
      case 'Tab': this.setFocus(this.focusIdx + (e.shiftKey ? -1 : 1)); break;
      case 'ArrowLeft': case 'KeyA': c?.adjust?.(-1); break;
      case 'ArrowRight': case 'KeyD': c?.adjust?.(1); break;
      case 'Enter': case 'NumpadEnter': case 'Space': if (!e.repeat) c?.activate?.(); break;
      case 'Escape': case 'Backspace': if (!e.repeat) this.back(); break;
      case 'KeyN':
        if (e.repeat || this.mode !== 'pause' || !this.h.story()) return;
        if (this.page === 'story') this.h.resume(); else this.go('story');
        break;
      default: return;
    }
    e.preventDefault();
  }

  private seedPad() {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    this.padPrev = pad ? pad.buttons.map((b) => b.pressed) : [];
    this.padDir = pad ? padDirection(pad) : '';
    this.padNext = performance.now() + 350;
  }

  /** Gamepad navigation; call once per frame while the menu is open. */
  update() {
    if (!this.isOpen) return;
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (!pad) return;
    const now = performance.now();
    const pressed = (i: number) => {
      const down = !!pad.buttons[i]?.pressed;
      const edge = down && !this.padPrev[i];
      this.padPrev[i] = down;
      return edge;
    };
    const dir = padDirection(pad);
    let fire = '';
    if (dir !== this.padDir) { fire = dir; this.padNext = now + 350; }
    else if (dir && now >= this.padNext) { fire = dir; this.padNext = now + 110; }
    this.padDir = dir;
    if (fire === 'up') this.setFocus(this.focusIdx - 1);
    if (fire === 'down') this.setFocus(this.focusIdx + 1);
    if (fire === 'left') this.ctls[this.focusIdx]?.adjust?.(-1);
    if (fire === 'right') this.ctls[this.focusIdx]?.adjust?.(1);

    const a = pressed(0), b = pressed(1), start = pressed(9);
    if (a) this.ctls[this.focusIdx]?.activate?.();
    else if (b) this.back();
    else if (start && this.ready) {
      if (this.mode === 'pause') this.h.resume();
      else if (this.page === 'root') this.h.play();
    }
  }
}

function padDirection(pad: Gamepad): string {
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  if (b(12) || y < -0.6) return 'up';
  if (b(13) || y > 0.6) return 'down';
  if (b(14) || x < -0.6) return 'left';
  if (b(15) || x > 0.6) return 'right';
  return '';
}

function el(tag: string, cls: string, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const div = (cls: string, html = '') => el('div', cls, html);
