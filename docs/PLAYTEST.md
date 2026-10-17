# Playtest útmutató — vertical slice v0.2 (Csillag-lakótelep)

Mit akar a slice: **20–25 perc**, a NARRATIVA 1–3. fejezete tömörítve. Szotyi (Bori macskája)
követi Bori sárga cicajeleit a lakótelepen, és rájön, hogy Bori bajban van. **Van vége**: a 3. jel
az aluljárónál → záró kártya („Lefelé.”), az opcionális dolgok összesítőjével. Az aluljáróba
magába (4. fejezet) még nem lehet bemenni — ez a következő slice.

## A fő út (kötelező lépések)

| # | Hol | Mit csinálsz | Mi történik |
|---|---|---|---|
| 1 | Bori erkélye (2. emelet) | Végighallgatod Judit telefonját | Az ablak elsötétül, kezdődik az ereszkedés |
| 2 | Erkélyek | Szomszéd erkély → alsó erkély → kukatároló teteje → udvar | Leérve: „keresd a sárga jelet” |
| 3 | Kukatároló déli fala | **1. jel** megszaglászása (E) | „2 — Garázssor” kártya |
| 4 | Garázssor **déli vége**, az út felőli falon | **2. jel** megszaglászása | „3 — Buszmegálló” kártya, jön a busz |
| 5 | Buszmegálló | Gábor leszáll → nyávogj (Q) vagy menj közel → dörgölőzz (E) → idd meg a tejet (E) | Gábor elindul haza |
| 6 | Zebra → szemközti ház (4-es) | Kísérd haza (ha lemaradsz, megvár) | Bemegy, „az aluljáró felé vezet a nyom” |
| 7 | Aluljáró lépcsőjének bal fala | **3. jel** megszaglászása | **Vége** — záró kártya |

**F (tartsd):** szagmód — sárga részecskék mutatják a következő lépés felé vezető nyomot.

## Opcionális (nem kell a végigjátszáshoz)

- **Ilonka néni** (földszinti ablak, a házfal nyugati részén): nyávogj alatta → csirkemáj a párkányon.
- **Kihallgatás:** konténer → garázstető → a tetőszellőző a nyitott garázs fölött. Itt derül ki,
  hogy Borit bezárták. Ha a garázs előtt a földön mászkálsz, elhessegetnek.
- **Dani kulcstartója** az olajos hordó tetején (a garázsok előtt). Felveszed, a szádban marad —
  *a slice-ban nincs következménye*, a későbbi fejezetekhez van előkészítve.

## Szándékos — ne jelentsd hibának

- **Csak 3 Bori-jel van** (sárga, háromvonásos cicafej + nyíl). Minden más falfirka — `CSILLAG`,
  `ROBI`, `FTC`, `K+D`, `NO FUTURE`, `DANI`, `X`, a házszámok, a `17 · CSILLAG TÉR` megállótábla —
  díszlet / a Kapucnisok tagjei, nem vezetnek sehová. *Ha valahol több sárga cicafejet látsz,
  az hiba — írd meg, hol.*
- **Az aluljáró zsákutca.** Le lehet menni a lépcsőn, lent tűzfény világít, de az alagút
  le van zárva — ez a 4. fejezet (Aluljáró) teasere. A 3. jel *Gábor hazakísérése előtt* csak
  egy tippet ad, utána zárja a slice-ot.
- **A busz csak a 2. jel megszaglászása után jön** — előtte a megálló üres.
- **Bori erkélyéről nem lehet egyből a földre ugrani** (6 m, a max. ugrás lefelé 4 m) —
  az erkélyeken át vezet az út.
- **Láthatatlan falak** a pálya szélén (utca két vége, garázsok mögött). Ha mégis kiesel,
  visszarak oda, ahol utoljára álltál.
- **Nincs Bori, nincs 4. fejezet, a lépcsőházak / ajtók nem nyílnak**, a többi ablak díszlet.
- Placeholder: az emberek procedurális bábuk, a hangok szintetizáltak, a „dörgölőzés” animáció ideiglenes.

## Talált hibák

Javítva (v0.2.1): ~~sorrend-törés az 1. jelnél~~, ~~az aluljáró mellvédjei átszelték az utcát~~,
~~Ilonka néni a ház előtt állt~~ (most a nyitott ablakban áll, a párkány mögött).

4. **Fák, lámpaoszlopok és a busz átjárhatóak** (nincs ütköztetőjük). A busz a macskán át is
   áthajt.
5. **„Hess innen!” a kihallgatás után is jöhet:** ha a garázs közelében nyávogsz, Robi akkor is
   elhessegethet, amikor már elvileg nem figyelnek.
6. **Lassú tempó:** a séta 0,75 m/s lett a riggelt cicával; a pálya ~30–40 m-es szakaszain
   sétálva ez hosszú. Shift (futás) sokat segít — érdemes figyelni, mennyire zavaró.
7. **Az eső az aluljáróban és a garázsban is esik** (kamera körüli eső, nem takarja a tető).
8. **Elhalványuló feliratok:** gyors egymásutánban 3 sor is fent maradhat egyszerre
   (régi + új), olvashatóság kérdéses.

## Debug parancsok

- `?beat=courtyard|garage|bus|underpass` — ugrás egy fejezetbe
- `?debug` vagy `` ` `` — fizikai drótváz + koordináták (hibajelentéshez jól jön a `feet` sor)
- `R` — újrakezdés
