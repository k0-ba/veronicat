/**
 * Player settings: one plain object, persisted to localStorage, applied live through
 * `onChange` listeners. Storage can be missing (private mode, blocked site data), so
 * every access is guarded and the defaults always work.
 */
export type Lang = 'hu' | 'en';

export interface SettingsData {
  masterVolume: number;   // 0..1
  musicVolume: number;    // 0..1
  sfxVolume: number;      // 0..1
  sensitivity: number;    // multiplier on the base look speed, 0.25..3
  invertY: boolean;
  fov: number;            // degrees
  shadows: boolean;
  pixelRatio: number;     // cap on devicePixelRatio
  rain: number;           // 0..1 share of the rain streaks drawn
  lang: Lang;
}

export const DEFAULT_SETTINGS: SettingsData = {
  masterVolume: 0.8,
  musicVolume: 0.8,
  sfxVolume: 0.8,
  sensitivity: 1,
  invertY: false,
  fov: 62,
  shadows: true,
  pixelRatio: 2,
  rain: 1,
  lang: 'hu',
};

const KEY = 'veronicat.settings.v1';

export class Settings {
  data: SettingsData;
  private listeners: Array<(s: SettingsData, key: keyof SettingsData | null) => void> = [];

  constructor() {
    this.data = { ...DEFAULT_SETTINGS, ...Settings.load() };
  }

  private static load(): Partial<SettingsData> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const out: Partial<SettingsData> = {};
      // Keep only known keys with the right type, so an old or hand-edited blob can't break boot.
      for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof SettingsData>) {
        if (typeof parsed?.[k] === typeof DEFAULT_SETTINGS[k]) (out as any)[k] = parsed[k];
      }
      return out;
    } catch {
      return {};
    }
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this.save();
    for (const l of this.listeners) l(this.data, key);
  }

  reset() {
    this.data = { ...DEFAULT_SETTINGS, lang: this.data.lang };
    this.save();
    for (const l of this.listeners) l(this.data, null);
  }

  /** Subscribe and get called once immediately with the current values. */
  onChange(fn: (s: SettingsData, key: keyof SettingsData | null) => void) {
    this.listeners.push(fn);
    fn(this.data, null);
  }
}
