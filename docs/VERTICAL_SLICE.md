# Vertical slice v0.2 — „Üres ablak → Garázssor → Buszmegálló”

> Cél: **minél hamarabb játszható, tesztelhető** szelet, ami megmutatja a GDD magját:
> *felfedezés → találkozás → cicás interakció → jutalom → következő terület.*
> Greybox minőség, de már a ✅ világban (panel, eső, nátriumlámpa, Bori sárgája).
> Később szépítjük — most a ciklus érzetét teszteljük.

## Miért ez a három fejezet?

A NARRATIVA.md 1–3. fejezetét sűrítjük egyetlen összefüggő pályába (~5–8 perc). Ebben benne van
minden, amit a GDD a slice-tól kér:

| GDD-elem | Hol jelenik meg |
|---|---|
| Narratív mag, néma cica | Judit telefonja, a Kapucnisok kihallgatása, Gábor — mind feliratos jelenet |
| Gábor és a tej ✅ | a slice csúcspontja: nyávogás → dörgölőzés → tej → elkísérés |
| Platformozás mint fűszer ✅ | leereszkedés az erkélyeken, garázstetők (kihallgatás csak felülről megy) |
| Bori sárga cicajelei | 3 jel vezet végig — ez a vizuális nyelv |
| Szaglászás ige | `F` lenyomva: „szagmód”, a sárga nyom láthatóvá válik a következő célig |
| Tárgy szájban | Dani kulcstartója (opcionális, a „Bocsánat” befejezés előkészítése) |
| Mellékszál | Ilonka néni ablaka (opcionális) |

## Ütemterv (beat-ek)

0. **Címkártya** — *Csillag-lakótelep · október · 20:40* · „1 — Üres ablak”
1. **Ablakpárkány, 2. emelet.** Bent Judit telefonál (felirat), lekapcsolja a villanyt, elmegy.
   → Cél: *jutni le az udvarra* (erkély → erkély → kukatároló teteje → föld).
2. **Ilonka néni** *(opcionális)* — a földszinti ablaknál nyávogás → kinyitja, falatot tesz a
   párkányra: „a Kertész lány ma este nem jött vissza”.
3. **1. cicajel** a kukatárolón → szaglászás → „2 — Garázssor”. A szagnyom a garázsok felé visz.
4. **Garázssor.** A nyitott garázsban a Kapucnisok, zene. Elölről elhessegetik a cicát.
   Konténerről fel a bádogtetőkre → a szellőzőnél **kihallgatás** (Robi, Dani, Kristóf).
   Opcionális: Dani kulcstartója a garázs mellett → szájba.
5. **2. cicajel** a garázssor végén, nyíl az utca felé → „3 — Buszmegálló”.
6. **Buszmegálló.** Befut az utolsó busz, leszáll **Gábor**. Nyávogás → észrevesz;
   dörgölőzés → leguggol, tejet önt egy kupakba; ivás → dorombolás.
   „Na, gyere, kísérj haza.” → elkíséred a 4-es panel kapujáig →
   „Te vagy a sárga kabátos lány cicája, ugye? A szemközti házból.” → **bizalom: Gábor ✓**
7. **3. cicajel** az aluljáró lejáratánál, nyíl lefelé → záró kártya:
   *Folytatás: 4 — Aluljáró* + összefoglaló (kit ismertél meg, mit vittél magaddal).

Nincs kudarcállapot (GDD: „kudarc esetén nincs büntetés”). Leesésnél / beragadásnál `R`.

## Technikai feladatok

| Rendszer | Fájl | Megjegyzés |
|---|---|---|
| Szint-interfész | `world/types.ts` | több pálya: `?level=alley` a régi tesztsikátor |
| Lakótelep pálya | `world/Lakotelep.ts`, `world/props.ts` | panelek instanced ablakokkal, garázssor, megálló, busz, lámpák |
| Történet-szkript | `story/Story.ts` | `await say()`, `await until()` — async beat-ek, könnyű írni |
| Feliratok / kártyák | `story/Dialogue.ts` | beszélő neve, szín; állat = dőlt (később) |
| Ember NPC | `npc/Human.ts` | procedurális low-poly test, járás/guggolás/fejfordítás, útvonal, ütköző |
| Szagmód | `gameplay/Scent.ts` | `F` tartva: deszaturált kép + sárga részecskenyom |
| Tárgy szájban | `player/Cat.ts` | `mouth` socket |
| Debug ugrás | `?beat=garage` / `?beat=bus` / `?beat=end` | tesztelés gyorsan |

## Amit szándékosan kihagyunk most

Riggelt cica, valódi modellek az emberekhez, hangok mintából, szinkron, mobil vezérlés,
mentés, több befejezés. A rendszerek úgy készülnek, hogy ezek később rácsatolhatók legyenek.
