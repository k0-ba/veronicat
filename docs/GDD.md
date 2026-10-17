# Veronicat — Game Design Document

> **Állapot:** vázlat v0.1 · 2026-10-17
> **Forrás:** az első design-beszélgetés Veronikával (game director) — gépi leirat, helyenként hiányos.
> **Jelölés:** ami Veronikától jön, az **döntés**. Ami *[javaslat]* jelölésű, az a leiratból levont
> következtetés vagy kitöltés — Veronikának még jóvá kell hagynia. A nyitott kérdések a dokumentum végén.
> **Worldbuilding:** részletes világ, karakterek, kapcsolatok és narratív fa: [worldbuilding/](worldbuilding/README.md)

---

## 1. Egy mondatban

Egy cica egy esős, elhagyatott kelet-európai panelvárosban keresi a gazdáját, egy kamaszlányt, akinek
baja esett — és a város furcsa, jószívű lakóinak segítségével megtalálja és megmenti.

## 2. Alappillérek

| Pillér | Mit jelent a gyakorlatban |
|---|---|
| **Narratív a mag, platformozás a fűszer** | A haladást a történet és a szereplőkkel való találkozás viszi. Platformozás (ugrálás, mászás, tetők) bekeverhető és szívesen látott, de nem ez a műfaj magja — a történetet és a felfedezést szolgálja. |
| **Cicaszemszög** | A cica nem beszél, nem old meg emberi feladatokat. Amit tud: menni, ugrani, nyávogni, szaglászni, üldözni, dorombolni. A történetet is ezeken keresztül éljük meg. |
| **Melankolikus, de meleg** | A világ szürke, nedves és üres — de akikkel találkozunk, azok kedvesek. A hangulat kontrasztja a magány és az apró jóságok között van. |

## 3. Történet

### 3.1 A cica célja (döntés)

A cica a **gazdáját keresi**. A gazda egy **12–16 év közötti lány**, akivel **valami baj történt** —
elrabolták, vagy valamilyen bajba keveredett. A cica meg akarja őt találni és menteni.

### 3.2 Javasolt ív *[javaslat]*

1. **Nyitás** — a cica egyedül van; a lány nem jött haza / eltűnt. Valami nyom marad utána (illat,
   tárgy, egy félbehagyott hely, ahol együtt szoktak lenni).
2. **Keresés** — a cica a városban bolyong, és a lakók közül egyre többen segítik — mindegyik egy-egy
   darab információt, tárgyat vagy utat ad.
3. **Fordulópont** — a patkány megmondja, hol van a lány (lásd 5.4).
4. **Megmentés** — a cica eljut hozzá. Az, hogy pontosan mi történt a lánnyal, és hogyan menti meg egy
   cica, **nyitott kérdés** (lásd 9.).

### 3.3 Hangvétel

A „baj” a célközönségtől függően lehet valódi veszély (elrablás) vagy kisebb, földhözragadtabb gond
(eltévedt, bajba keveredett, elszökött). Ez meghatározza a játék hangulatát — **eldöntendő.**

## 4. Világ és hangulat (döntés)

- **Hely:** Közép-Kelet-Európa, poszt-szovjet esztétika.
- **Idő:** őszi este, esik az eső.
- **Város:** elhagyatott, kevesek által járt.
- **Elemek:** panelházak, graffitik, aluljárók.

### Javasolt kiegészítők *[javaslat]*

- Nátriumlámpák narancssárga fénye a nedves aszfalton, pocsolya-tükröződések.
- Lépcsőházak, garázssorok, kapualjak, tetők, pincék, csatorna — ezek a cica „útvonalai”, amelyeket
  ember nem használ.
- Kevés ember, de sok nyoma: kivilágított ablakok, kiszűrődő tévéhang, szárítókötélen lógó ruha.

## 5. Szereplők

### 5.1 A cica — játékos karakter

Néma főszereplő. Személyiség, név, kinézet: **nyitott** (a jelenlegi asset egy Meshy AI modell, rig
nélkül).

### 5.2 A gazda — kamaszlány (döntés: 12–16 év)

A játék nagy részében nincs jelen — a hiánya a motor. *[javaslat]* Jelenléte a tárgyain, illatán, a
helyeken keresztül érződik, amelyek kötik őket egymáshoz.

### 5.3 Jószívű hajléktalanok (döntés)

Kedves, segítőkész hajléktalanok. *[javaslat]* Lehet egy kis közösség egy aluljáróban vagy tűz körül —
menedék az eső elől, meleg pont a városban. Funkciójuk: biztonságos hely, egy tipp vagy irány.

### 5.4 Az irodai munkás férfi (döntés)

Egy férfi, aki **munkából tart hazafelé**, irodai munkás, és **ad a cicának egy kis tejet**.
*[A leiratban itt egy rész érthetetlen — talán a családjára (feleség?) utal. Tisztázandó.]*
*[javaslat]* Egy fáradt, magányos ember, akinek a cicával való találkozás az este egyetlen kedves
pillanata — a kölcsönösség (ő is segít, és neki is jól esik) erősíti a melegséget.

### 5.5 A patkány (döntés)

- Először **üldözendő zsákmány**: a cica kergeti — **ez lehet a játék egyik ügyességi része**.
- **Később a patkány segít**: elárulja, hol található a lány / merre kell menni.
- *[A leirat itt hiányos: „Fúlcsort, vagy ilyesmik” — talán csatorna? fülbevaló? Tisztázandó.]*

*[javaslat]* Szép ív: ellenségből szövetséges. A patkány a város „alsó” világát ismeri (csatorna,
pince) — ezért tudja, amit az emberek nem.

### 5.6 További állatok *(felvetve, nem eldöntött)*

Felmerültek a **galambok** vagy más állatok. *[javaslat]* Az állatok „beszélhetnek” a cicával
(az emberek nem) — ez megoldaná a narratíva közlésének problémáját egy néma főhőssel.

## 6. Játékmenet

### 6.1 Műfaj (döntés)

**Narratív felfedezős játék**, bekevert platformozással. A platformozás része a játéknak, de **nem a core műfaj**: eszköz a felfedezéshez és a cicás mozgás öröméhez, nem önálló kihívás-sorozat.

### 6.2 Alap ciklus *[javaslat]*

```
felfedezés → találkozás egy szereplővel → cicás interakció → jutalom (infó / tárgy / új út) → következő terület
```

### 6.3 Cica-igék *[javaslat]*

| Ige | Narratív használat |
|---|---|
| Séta / futás / kontextusugrás | felfedezés, új utak (már benne van a vertical slice-ban) |
| Nyávogás | figyelemfelkeltés, emberek / állatok reakciója |
| Dorombolás, odadörgölőzés | kapcsolat egy szereplővel (pl. a férfi a tejjel) |
| Szaglászás | a lány nyomának követése |
| Üldözés | patkányos szekvencia — ügyességi csúcspont |
| Tárgy vitele szájban | apró „adok-kapok” a szereplőkkel |

### 6.4 Platformozás és ügyesség helye (döntés: másodlagos elem)

- **Platformozás:** bekeverhető — tetők, párkányok, kerítések, szárítókötelek; a cica természetes
  mozgása. Új utakat, rejtett helyeket, rálátást ad a városra.
- **Ügyességi csúcspont:** a patkányüldözés.
- *[javaslat]* Arány: a platformszakaszok rövidek és két narratív momentum között kötnek össze
  helyszíneket; kudarc esetén nincs büntetés, csak gyors újrapróbálás.

## 7. Kapcsolat a jelenlegi kóddal

A mostani vertical slice (esős sikátor greybox, kontextusugrás a tetőig) **technikai váz** — a
mechanikák (mozgás, kamera, interakció, nyávogás) újrahasznosíthatók. Viszont:

- A „tetőig ugrálás” belefér az irányba (a platformozás megengedett másodlagos elem) — de a
  slice-ba narratív momentum is kell, hogy ne a platformozás legyen a lényeg.
- Kell egy **NPC / párbeszéd / reakció** rendszer (jelenleg nincs).
- A patkányhoz **AI-üldözés** mechanika kell.
- A greybox környezet → panel / aluljáró / graffiti irányba fordítható.

## 8. Következő lépések *[javaslat]*

1. Veronika jóváhagyja / javítja a *[javaslat]* részeket.
2. Eldönteni a lány sorsát és a játék hangvételét (3.3).
3. Térkép-vázlat: 3–5 helyszín (pl. sikátor → aluljáró a hajléktalanokkal → panelház bejárata a
   férfival → csatorna a patkánnyal → végső helyszín).
4. A greybox slice-ba egy első NPC-találkozás (a férfi a tejjel) — a narratív ciklus prototípusa.

## 9. Nyitott kérdések

- Mi történt pontosan a lánnyal? Elrablás vagy más baj? Ki / mi a „gonosz”, ha van?
- Hogyan ment meg egy cica egy embert? (segítséget hív, megmutatja az utat, kiszabadítja…?)
- Hogyan közöl a játék információt? Beszélnek az állatok? Van szöveg? Csak gesztusok?
- A férfiról szóló félmondat a leiratban — mire utalt (család, feleség)?
- „Fúlcsort” — mit jelentett? (csatorna? egy tárgy?)
- Milyen állatok legyenek még (galambok, kutyák, varjak)?
- A cica neve, kinézete, személyisége.
- Hossz: egy rövid, egy ülésben végigjátszható élmény, vagy több fejezet?
- Mi a kapcsolat a lány és a cica között a történet elején? (Van flashback / emlék?)
