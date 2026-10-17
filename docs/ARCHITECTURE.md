# Veronicat — technikai váz (vertical slice v0.2)

Ez a dokumentum a **technológiai** alapot írja le. A világ, a történet és a látvány a
design dokumentumból jön (Veronika, art director) — a kód úgy van felépítve, hogy ezek
cserélhetők legyenek anélkül, hogy a mozgást/kamerát újra kellene írni.

## Stack

| Réteg | Választás | Miért |
|---|---|---|
| Render | three.js (WebGL2) | érett, sok példa, GLB-pipeline |
| Fizika | Rapier 3D (WASM) | gyors, determinisztikus, kész *kinematic character controller* |
| Build | Vite + TypeScript | gyors HMR, statikus kimenet |
| Asset | GLB + meshopt + WebP (`@gltf-transform/cli`) | 24 MB → 620 KB a cicán |
| Host | **Cloudflare** (Workers static assets, a Pages utódja) | korlátlan ingyenes sávszél (3D assetnél ez számít), globális CDN, Access-szel privát link. A Vercel Hobby 100 GB/hó sávszélnél áll meg és nem kereskedelmi. |

## Mit vettünk át a Stray-ből (technikailag)

1. **Kontextusos ugrás** — `src/player/JumpFinder.ts`
   A cica nem ugrik szabadon. Néhány frame-enként egy ~76°-os legyezőben, 0.45–3 m-en
   belül függőleges sugarakkal keresünk vízszintes felületet (max +2.2 m / −4 m).
   Szűrők: belmagasság, „talp-teszt” (4 szonda — kizárja a korlátot, peremet), és az
   ívpálya ütközésmentessége. A győztes pont fölé kerül a gyűrű + gomb-prompt.
   **Nem kell kézzel lerakni ugráspontokat** — bármely greybox doboz teteje működik.
2. **Peremvédelem** — `Cat.ledgeGuard`: sétálva nem lehet leesni 0.45 m-nél
   magasabbról; tengelyenként csúszik a perem mentén. Lejjebb jutni ugrással lehet.
3. **Fizikai „macskabűn”** — dinamikus tárgyak (Rapier), a karakter tolja őket,
   `E`-vel le lehet ütni őket (a lökés a nyitott perem felé torzít).
4. **Kontextus-interakciók** — `src/gameplay/Interactions.ts`: egyszerre egy prompt,
   a legközelebbi, cica előtti, magasságsávba eső elem. Karmolás, dörgölőzés,
   szundi, lelökés mind ugyanaz az interfész.
5. **Nyávogás mint ige** — `Q`; a pálya reagál (`Level.meow`), pl. a robot felébred.
6. **Kis karakter kamerája** — alacsony, közeli orbit, ütközéskor azonnal behúz,
   lassan enged ki, mozgás közben finoman visszaáll a cica mögé, ugráskor Y-késleltetés.

## Fájltérkép

```
src/
  main.ts                 boot, renderer, bloom, fix lépésű loop, HUD-bekötés
  core/Input.ts           billentyű + egér (pointer lock) + gamepad → akciók
  core/Audio.ts           procedurális placeholder hangok (nyáú, dorombolás, eső…); master → zene / effekt buszok
  core/Settings.ts        beállítások (hang, érzékenység, FOV, grafika, nyelv) → localStorage, élő onChange
  ui/Menu.ts              cím- és szünetmenü + Beállítások / Irányítás / Készítők; egér, billentyű, gamepad
  ui/i18n.ts              UI-szövegek (hu alap, en a menükhöz és promptokhoz)
  physics/Physics.ts      Rapier wrapper, ray-helper, dinamikus mesh-szinkron
  player/Cat.ts           karakter: KCC, állapotgép, procedurális animáció
  player/JumpFinder.ts    Stray-szerű ugráscél-kereső + közös ívfüggvény
  camera/FollowCamera.ts  harmadik személyű kamera ütközéssel
  gameplay/Interactions.ts interakció-regiszter
  world/types.ts          GameLevel interfész (minden pálya ezt valósítja meg)
  world/Lakotelep.ts      v0.2 slice: Csillag-lakótelep, 1–3. fejezet + sztori-beatek
  world/props.ts          panelház, lámpa, fa, busz, Bori-féle cicajel, graffiti
  world/Level.ts          v0.1 greybox sikátor (?level=alley)
  story/Script.ts         korutin-futtató játékidőn (wait / until / say), reset-biztos
  story/Dialogue.ts       feliratok, fejezetkártya, Füst-tipp (DOM)
  npc/Human.ts            procedurális placeholder ember (járás, guggolás, fejfordítás)
  gameplay/Scent.ts       szagmód: deszaturálás + sárga szagnyom-részecskék
  world/materials.ts      greybox anyagkészlet (1 m-es rács), neon táblák
  world/Rain.ts           eső
public/models/cat.glb     Quaternius CC0 low-poly cica, 20 csontos skin + 9 klip (CatAnimator.ts)
```

## Ismert korlátok / következő lépések

- **A cica modell statikus (nincs csontváz).** Most procedurális „squash & stretch”,
  billegés, dőlés adja a mozgást. Következő lépés: riggelt + animált cica
  (idle / walk / run / jump / land / scratch / sleep klipek). A `Cat.render` az a pont,
  ahová az `AnimationMixer` bekerül; az állapotgép (`CatState`) már megvan hozzá.
- Láb-IK lépcsőn/peremen (a csontvázas modell után).
- Szint-szerkesztés: most kódban vannak a dobozok. Ha Veronika Blenderben épít,
  akkor GLB-ből töltjük be, és a `COL_` előtagú mesh-ekből generálunk ütköztetőt.
- Mobil/érintő vezérlés még nincs.
- Hang: minden hang egy nevesített metódus az `Audio`-ban → mintára cserélhető.

## Futtatás

```bash
npm install
npm run dev            # http://localhost:5181/
npm run build          # dist/
./scripts/deploy.sh --deploy
```

Debug: `` ` `` (backtick) vagy `?debug` az URL-ben → fizikai drótváz + állapot-kiírás.
Ugrás egy beatre: `?beat=courtyard|garage|bus|underpass`. Régi sikátor: `?level=alley`.

Fej nélküli teszt (rejtett fülön a rAF áll): `__game.start()`, `await __game.tick(n)`
(képkocka + a sztori-promise-ok lefutása), `await __game.walk(x, z)`, `await __game.jump(dx, dz)`,
`__game.face(v)`, `__game.key('KeyE')`, `__game.focused()`, `__game.level.flags`.
Vigyázat: ha közben valaki játszik ugyanabban a fülben, a teszt és a játékos egymásba lép.
