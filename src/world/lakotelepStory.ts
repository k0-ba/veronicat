import type { Lakotelep } from './Lakotelep';
import type { StoryNodeDef } from './storyTree';

/**
 * Story tree of the Csillag-lakótelep slice. Chapters 1–6 and the four endings read the level's live flags
 * and stage; the rest is the player tree from docs/worldbuilding/NARRATIVA.md
 * (playable: false) so the player sees where the story is heading.
 * Order matters: a node's parents must come before it.
 */
type L = Pick<Lakotelep, 'flags' | 'stage' | 'ending'>;

const STAGES: Array<Lakotelep['stage']> = ['intro', 'descend', 'courtyard', 'garage', 'toStop', 'gabor', 'escort', 'toUnderpass',
  'hall', 'camp', 'toSquare', 'square', 'fetch', 'rescue', 'end'];
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
      { label: 'Kihallgatás a garázstetőről', side: true, done: (l) => l.flags.overheard },
      { label: 'Dani kulcstartója', side: true, done: (l) => l.flags.keychain },
      { label: 'Második jel: a buszmegálló felé', done: (l) => l.flags.sign2 },
    ],
  },
  {
    id: 'ch3', title: '3 — Buszmegálló: Gábor', sub: '21:15', kind: 'chapter', parents: ['ch2'], playable: true,
    current: (l) => at(l, 'toStop', 'gabor', 'escort', 'toUnderpass'),
    beats: [
      { label: 'Az utolsó busz', done: (l) => l.flags.busArrived },
      { label: 'Gábor észreveszi Szotyit', done: (l) => l.flags.gaborNoticed },
      { label: 'Dörgölőzés', done: (l) => l.flags.gaborRubbed },
      { label: 'Egy kupak tej', done: (l) => l.flags.milk },
      { label: 'Hazakíséred Gábort', side: true, done: (l) => l.flags.gaborTrust },
      { label: 'Harmadik jel: lefelé', done: (l) => past(l, 'toUnderpass') },
    ],
  },
  {
    id: 'ch4', title: '4 — Aluljáró', sub: '22:00', kind: 'chapter', parents: ['ch3'], playable: true,
    current: (l) => at(l, 'hall', 'camp'),
    beats: [
      { label: 'Csont, a fekete kutya', done: (l) => l.flags.csontMet },
      { label: 'Marika, Laci, Tomi a tűznél', done: (l) => l.flags.camp },
      { label: 'Csont labdája (bizalom: aluljáró)', side: true, done: (l) => l.flags.ballGiven },
      { label: 'Fel a nyugati lépcsőn', done: (l) => past(l, 'toSquare') },
    ],
  },
  {
    id: 'ch5', title: '5 — Csillag tér', sub: '23:10 · kitisztul az ég', kind: 'chapter', parents: ['ch4'], playable: true,
    current: (l) => at(l, 'toSquare', 'square'),
    beats: [
      { label: 'A Kórus: kenyér a galamboknak', side: true, done: (l) => l.flags.pigeons },
      { label: 'Negyedik jel a falon', side: true, done: (l) => l.flags.sign4 },
      { label: 'Bori a metrórács mögött', done: (l) => l.flags.bori },
    ],
  },
  {
    id: 'ch6', title: '6 — Kit hozol?', sub: '23:40 · döntés', kind: 'choice', parents: ['ch5'], playable: true,
    current: (l) => at(l, 'fetch', 'rescue'),
    done: (l) => l.ending !== null,
    beats: [
      { label: 'Segítség a rácshoz', done: (l) => l.ending !== null },
    ],
  },
  {
    id: 'endUnderpass', title: 'Az Aluljáró', sub: 'Laci és Csont', kind: 'ending', parents: ['ch6'], playable: true,
    done: (l) => l.ending === 'underpass',
    condition: { label: 'Csont labdája', met: (l) => l.flags.ballGiven },
  },
  {
    id: 'endHome', title: 'Hazafelé', sub: 'Gábor', kind: 'ending', parents: ['ch6'], playable: true,
    done: (l) => l.ending === 'home',
    condition: { label: 'hazakísérted Gábort', met: (l) => l.flags.gaborTrust },
  },
  {
    id: 'endSorry', title: 'Bocsánat', sub: 'Dani', kind: 'ending', parents: ['ch6'], playable: true,
    done: (l) => l.ending === 'sorry',
    condition: { label: 'Dani kulcstartója', met: (l) => l.flags.keychain },
  },
  {
    id: 'endBase', title: 'Ilonka néni', sub: 'mindig elérhető', kind: 'ending', parents: ['ch6'], playable: true,
    done: (l) => l.ending === 'base',
  },
  { id: 'epilogue', title: 'Epilógus — Az új fal', sub: 'egy hét múlva', kind: 'chapter', parents: ['endUnderpass', 'endHome', 'endSorry', 'endBase'], playable: false },
  // The full game, beyond this build (NARRATIVA.md).
  { id: 'x1', title: 'Teljes játék — Tetők: a Kórus', sub: 'a galambok éjszakája', kind: 'chapter', parents: ['epilogue'], playable: false },
  { id: 'x2', title: 'Patkányüldözés', sub: 'Kanóc', kind: 'choice', parents: ['x1'], playable: false },
  { id: 'x3', title: 'Csatorna', kind: 'chapter', parents: ['x2'], playable: false },
  { id: 'x4', title: 'Állomás', sub: 'az utolsó metró', kind: 'chapter', parents: ['x3'], playable: false },
];
