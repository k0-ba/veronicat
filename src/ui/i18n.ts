import type { Lang } from '../core/Settings';

/**
 * UI strings. Hungarian is the source language; English covers the menus and HUD
 * prompts only. Story dialogue stays Hungarian until it gets its own pass.
 */
const STRINGS = {
  kicker: { hu: 'vertical slice · v0.2 · Csillag-lakótelep', en: 'vertical slice · v0.2 · Csillag housing estate' },
  lede: {
    hu: 'Bori nem jött haza. A macskája tudja, merre ment — csak követnie kell a sárga jeleket.',
    en: "Bori didn't come home. Her cat knows where she went — it only has to follow the yellow marks.",
  },
  loading: { hu: 'Betöltés…', en: 'Loading…' },
  paused: { hu: 'szünet', en: 'paused' },
  play: { hu: 'Játék', en: 'Play' },
  resume: { hu: 'Folytatás', en: 'Continue' },
  restart: { hu: 'Újrakezdés', en: 'Restart' },
  settings: { hu: 'Beállítások', en: 'Settings' },
  controls: { hu: 'Irányítás', en: 'Controls' },
  credits: { hu: 'Készítők', en: 'Credits' },
  story: { hu: 'Történet', en: 'Story' },
  level: { hu: 'Pálya', en: 'Level' },
  levelLakotelep: { hu: 'Csillag-lakótelep', en: 'Csillag estate' },
  levelAlley: { hu: 'Sikátor (v0.1 greybox)', en: 'Alley (v0.1 greybox)' },
  startAt: { hu: 'Kezdés', en: 'Start at' },
  startBeginning: { hu: 'Elejéről', en: 'Beginning' },
  startCourtyard: { hu: '1 — Udvar', en: '1 — Courtyard' },
  startGarage: { hu: '2 — Garázssor', en: '2 — Garages' },
  startBus: { hu: '3 — Buszmegálló', en: '3 — Bus stop' },
  startUnderpass: { hu: 'Az aluljáró előtt', en: 'Before the underpass' },
  storyLede: {
    hu: 'Szotyi útja eddig. A bejárt ágak kiemelve; ami előtted van, csak sejlik.',
    en: "Szotyi's path so far. Visited paths are highlighted; what lies ahead is only a hint.",
  },
  st_done: { hu: 'bejárva', en: 'visited' },
  st_current: { hu: 'most', en: 'now' },
  st_open: { hu: 'elérhető', en: 'unlocked' },
  st_locked: { hu: 'zárva', en: 'locked' },
  stFuture: { hu: 'következő buildben', en: 'not in this build' },
  sideThread: { hu: 'mellékszál', en: 'side thread' },
  cueChoice: { hu: 'döntés', en: 'choice' },
  cueEnding: { hu: 'befejezés', en: 'ending' },
  storyMore: { hu: '… a nyom tovább vezet', en: '… the trail goes on' },
  storyHint: { hu: 'N: történetfa', en: 'N: story tree' },
  noStory: { hu: 'Ehhez a pályához nincs történetfa.', en: 'This level has no story tree.' },
  back: { hu: 'Vissza', en: 'Back' },
  defaults: { hu: 'Alapértékek', en: 'Reset to defaults' },
  navHint: {
    hu: '↑↓ választás · ←→ állítás · Enter ok · Esc vissza',
    en: '↑↓ select · ←→ adjust · Enter confirm · Esc back',
  },
  padHint: {
    hu: 'Kontroller: D-pad / bal kar · A ok · B vissza · Start folytatás',
    en: 'Gamepad: D-pad / left stick · A confirm · B back · Start resume',
  },

  secAudio: { hu: 'Hang', en: 'Audio' },
  secControls: { hu: 'Irányítás', en: 'Controls' },
  secGraphics: { hu: 'Grafika', en: 'Graphics' },
  secLanguage: { hu: 'Nyelv', en: 'Language' },
  secCat: { hu: 'Macska', en: 'Cat' },
  catSkin: { hu: 'Bunda', en: 'Coat' },
  skin_szotyi: { hu: 'Szotyi (szürke cirmos)', en: 'Szotyi (grey tabby)' },
  skin_black: { hu: 'Fekete', en: 'Black' },
  skin_ginger: { hu: 'Vörös cirmos', en: 'Ginger tabby' },
  skin_tuxedo: { hu: 'Szmokingos', en: 'Tuxedo' },
  skin_calico: { hu: 'Háromszínű', en: 'Calico' },
  skin_siamese: { hu: 'Sziámi', en: 'Siamese' },
  skin_classic: { hu: 'Régi modell', en: 'Old model' },
  masterVolume: { hu: 'Fő hangerő', en: 'Master volume' },
  musicVolume: { hu: 'Zene', en: 'Music' },
  ambienceVolume: { hu: 'Környezet/Eső', en: 'Ambience/Rain' },
  sfxVolume: { hu: 'Effektek', en: 'Sound effects' },
  sensitivity: { hu: 'Egér/kar érzékenység', en: 'Look sensitivity' },
  invertY: { hu: 'Függőleges invertálás', en: 'Invert Y axis' },
  fov: { hu: 'Látószög (FOV)', en: 'Field of view' },
  shadows: { hu: 'Árnyékok', en: 'Shadows' },
  pixelRatio: { hu: 'Felbontás (pixelarány)', en: 'Resolution (pixel ratio)' },
  rain: { hu: 'Eső sűrűsége', en: 'Rain density' },
  lang: { hu: 'Nyelv', en: 'Language' },
  on: { hu: 'Be', en: 'On' },
  off: { hu: 'Ki', en: 'Off' },
  rainOff: { hu: 'Nincs', en: 'Off' },
  rainLow: { hu: 'Ritka', en: 'Light' },
  rainMid: { hu: 'Közepes', en: 'Medium' },
  rainHigh: { hu: 'Zuhé', en: 'Downpour' },
  langNote: { hu: 'A párbeszédek egyelőre magyarul szólnak.', en: 'Dialogue is in Hungarian for now.' },

  cWalk: { hu: 'séta', en: 'walk' },
  cRun: { hu: 'futás', en: 'run' },
  cLook: { hu: 'kamera', en: 'camera' },
  cJump: { hu: 'ugrás a kijelölt pontra', en: 'jump to the marked spot' },
  cInteract: { hu: 'interakció', en: 'interact' },
  cMeow: { hu: 'nyávogás (embereknek is)', en: 'meow (people hear it too)' },
  cScent: { hu: 'szagmód (tartsd lenyomva)', en: 'scent mode (hold)' },
  cReset: { hu: 'újrakezdés', en: 'restart' },
  cPause: { hu: 'szünet / menü', en: 'pause / menu' },
  cStory: { hu: 'történetfa', en: 'story tree' },
  mouse: { hu: 'Egér', en: 'Mouse' },
  padControls: {
    hu: 'Kontroller: bal kar séta · jobb kar kamera · A ugrás · X interakció · Y nyávogás · B szagmód · Start menü · Select újrakezdés',
    en: 'Gamepad: left stick walk · right stick camera · A jump · X interact · Y meow · B scent · Start menu · Select restart',
  },

  crArt: { hu: 'Art director, világ', en: 'Art direction, world' },
  crCode: { hu: 'Prototípus, kód, procedurális hang', en: 'Prototype, code, procedural audio' },
  crCat: { hu: 'Macska modell (CC0)', en: 'Cat model (CC0)' },
  crAnim: { hu: 'Macska animációk', en: 'Cat animations' },
  crAnimWho: { hu: 'saját, a Quaternius rigen', en: 'in-house, on the Quaternius rig' },
  crTech: { hu: 'Motor', en: 'Engine' },
  crThanks: { hu: 'Köszönet minden kóbor macskának a Csillag-lakótelepen.', en: 'Thanks to every stray cat on the Csillag estate.' },

  jump: { hu: 'Ugrás', en: 'Jump' },
  jumpDown: { hu: 'Leugrás', en: 'Jump down' },
  meowToast: { hu: 'Miáú', en: 'Meow' },
  again: { hu: 'Még egyszer', en: 'Once more' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

/** Interaction labels come from level code in Hungarian; translate the known ones. */
const PROMPTS_EN: Record<string, string> = {
  'Nyávogás': 'Meow',
  'Evés': 'Eat',
  'Ivás': 'Drink',
  'Felvétel': 'Pick up',
  'Szaglászás': 'Sniff',
  'Dörgölőzés': 'Rub',
  'Karmolás': 'Scratch',
  'Lelökés': 'Knock off',
  'Szundi': 'Nap',
};

let lang: Lang = 'hu';
export function setLang(l: Lang) { lang = l; document.documentElement.lang = l; }
export function getLang() { return lang; }
export function t(key: StringKey): string { return STRINGS[key][lang]; }
export function tPrompt(label: string): string { return lang === 'en' ? PROMPTS_EN[label] ?? label : label; }
