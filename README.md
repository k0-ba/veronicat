# Veronicat

Cicás 3D böngészős játék (a Stray-ből merítve, saját világgal). **Vertical slice v0.2**:
Szotyi, Bori macskája egy esős októberi estén a Csillag-lakótelepen — 1. Üres ablak,
2. Garázssor, 3. Buszmegálló (Gábor), vége az aluljárónál. Terv: [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md).
A v0.1 sikátor-greybox: `?level=alley`.

- Élő: https://veronicat.pages.dev/
- Repó: https://github.com/k0-ba/veronicat (privát)
- Lokálisan: `npm install && npm run dev` → http://localhost:5181/
- Technikai leírás: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Vezérlés: WASD séta · Shift futás · egér kamera · Space ugrás a kijelölt pontra ·
E interakció · Q nyávogás · F szagmód (tartsd) · R újrakezdés · Esc szünet/menü · N történetfa · `` ` `` debug. Gamepad is megy (Start menü, Select újrakezdés).

Cica asset (rigelt, animált): Quaternius „Animal Pack Vol.2” — **CC0**
(<https://opengameart.org/content/animated-animales-low-poly>). A klipeket
(idle, walk, run, crouch, jump, land, swipe, scratch, sleep) a
`tools/rig/quaternius_cat.py` szerzi a cica saját IK rigjén, majd FK-ra bake-eli:

```bash
blender -b --factory-startup "art_source/quaternius_animals2/x/Animal Pack Vol.2 by @Quaternius/Blends/Cat.blend" \
  -P tools/rig/quaternius_cat.py -- public/models/cat.glb [preview_dir]
```

(A korábbi Meshy AI cica auto-rigje — `tools/rig/rig_build.py` — félbehagyva: a
mesh lépés közbeni pózban van, a lábak lendítése szétszakítja a bőrt.)
