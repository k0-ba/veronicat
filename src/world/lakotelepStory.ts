import type { Lakotelep } from './Lakotelep';
import type { StoryNodeDef } from './storyTree';

/**
 * Story tree of the Csillag-lakótelep slice. Chapters 1–3 read the level's live flags
 * and stage; the rest is the player tree from docs/worldbuilding/NARRATIVA.md
 * (playable: false) so the player sees where the story is heading.
 * Order matters: a node's parents must come before it.
 */
type L = Pick<Lakotelep, 'flags' | 'stage'>;

const STAGES: Array<Lakotelep['stage']> = ['intro', 'descend', 'courtyard', 'garage', 'toStop', 'gabor', 'escort', 'toUnderpass', 'end'];
const past = (l: L, stage: Lakotelep['stage']) => STAGES.indexOf(l.stage) > STAGES.indexOf(stage);
const at = (l: L, ...stages: Array<Lakotelep['stage']>) => stages.includes(l.stage);

export const LAKOTELEP_STORY: StoryNodeDef<L>[] = [
  { id: 'prologue', title: 'Prológus — Emlék a tetőn', sub: 'egy héttel korábban', kind: 'chapter', parents: [], playable: false },
  {
    id: 'ch1', title: '1 — Üres ablak', sub: '20:40', kind: 'chapter', parents: ['prologue'], playable: true,
    current: (l) => at(l, 'intro', 'descend', 'courtyard'),
    beats: [
      { label: 'Judit telefonál, Bori nincs otthon', done: (l) => past(l, 'intro') },
      { label: 'Le az erkélyekről az udvarra', done: (l) => past(l, 'descend') },
      { label: 'Ilonka néni ablaka', side: true, done: (l) => l.flags.ilonka },
      { label: 'Csirkemáj', side: true, done: (l) => l.flags.ilonkaAte },
      { label: 'Bori első cicajele', done: (l) => l.flags.sign1 },
    ],
  },
  {
    id: 'ch2', title: '2 — Garázssor', sub: '20:52', kind: 'chapter', parents: ['ch1'], playable: true,
    current: (l) => at(l, 'garage'),
    beats: [
      { label: 'Kihallgatás a garázstetőről', done: (l) => l.flags.overheard },
      { label: 'Dani kulcstartója', side: true, done: (l) => l.flags.keychain },
      { label: 'Második jel: a buszmegálló felé', done: (l) => l.flags.sign2 },
    ],
  },
  {
    id: 'ch3', title: '3 — Buszmegálló: Gábor', sub: '21:15', kind: 'chapter', parents: ['ch2'], playable: true,
    current: (l) => at(l, 'toStop', 'gabor', 'escort', 'toUnderpass'),
    beats: [
      { label: 'Az utolsó busz', done: (l) => l.flags.busArrived },
      { label: 'Gábor észreveszi Füstöt', done: (l) => l.flags.gaborNoticed },
      { label: 'Dörgölőzés', done: (l) => l.flags.gaborRubbed },
      { label: 'Egy kupak tej', done: (l) => l.flags.milk },
      { label: 'Hazakíséred Gábort', side: true, done: (l) => l.flags.gaborHome },
      { label: 'Harmadik jel: lefelé', done: (l) => at(l, 'end') },
    ],
  },
  {
    id: 'ch4', title: '4 — Aluljáró', sub: '22:00 · a slice vége', kind: 'chapter', parents: ['ch2', 'ch3'], playable: false,
    beats: [
      { label: 'Csont, Marika, Laci', done: () => false },
      { label: 'Csont labdája (bizalom: aluljáró)', side: true, done: () => false },
    ],
  },
  { id: 'ch5', title: '5 — Tetők: a Kórus', sub: '23:00', kind: 'chapter', parents: ['ch4'], playable: false },
  { id: 'ch6', title: '6 — Patkányüldözés', sub: '0:00', kind: 'choice', parents: ['ch5'], playable: false },
  { id: 'ch6a', title: 'Elkapja és elengedi', sub: 'Kanóc tartozik', kind: 'branch', parents: ['ch6'], playable: false },
  { id: 'ch6b', title: 'Elszalasztja', sub: 'Füst kimenti Kanócot', kind: 'branch', parents: ['ch6'], playable: false },
  { id: 'ch7', title: '7 — Csatorna', sub: '1:00', kind: 'chapter', parents: ['ch6a', 'ch6b'], playable: false },
  { id: 'ch8', title: '8 — Csillag tér állomás', sub: '2:00', kind: 'chapter', parents: ['ch7'], playable: false },
  { id: 'ch9', title: '9 — Kit hoz segítségül?', sub: '3:00 · döntés', kind: 'choice', parents: ['ch8'], playable: false },
  {
    id: 'endUnderpass', title: 'Az Aluljáró', kind: 'ending', parents: ['ch9'], playable: false,
    condition: { label: 'bizalom: aluljáró', met: () => false },
  },
  {
    id: 'endHome', title: 'Hazafelé', kind: 'ending', parents: ['ch9'], playable: false,
    condition: { label: 'bizalom: Gábor', met: (l) => l.flags.gaborHome },
  },
  {
    id: 'endSorry', title: 'Bocsánat', kind: 'ending', parents: ['ch9'], playable: false,
    condition: { label: 'Dani kulcstartója', met: (l) => l.flags.keychain },
  },
  {
    id: 'endBase', title: 'Alap', sub: 'Ilonka néni hív segítséget', kind: 'ending', parents: ['ch9'], playable: false,
  },
  { id: 'epilogue', title: 'Epilógus — Az új fal', sub: 'egy hét múlva', kind: 'chapter', parents: ['endUnderpass', 'endHome', 'endSorry', 'endBase'], playable: false },
];
