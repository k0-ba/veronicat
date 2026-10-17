# Veronicat

Cicás 3D böngészős játék (a Stray-ből merítve, saját világgal). **Vertical slice v0.2**:
Füst, Bori macskája egy esős októberi estén a Csillag-lakótelepen — 1. Üres ablak,
2. Garázssor, 3. Buszmegálló (Gábor), vége az aluljárónál. Terv: [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md).
A v0.1 sikátor-greybox: `?level=alley`.

- Élő: https://veronicat.holoesthesia.workers.dev/
- Lokálisan: `npm install && npm run dev` → http://localhost:5181/
- Technikai leírás: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Vezérlés: WASD séta · Shift futás · egér kamera · Space ugrás a kijelölt pontra ·
E interakció · Q nyávogás · F szagmód (tartsd) · R újrakezdés · `` ` `` debug. Gamepad is megy.

Eredeti cica asset: `cat-in-motion-3d-model-free.zip` (Meshy AI) → `public/models/cat.glb`:

```bash
npx @gltf-transform/cli optimize source.glb public/models/cat.glb \
  --simplify-ratio 0.08 --simplify-error 0.002 --texture-compress webp --texture-size 1024 --compress meshopt
```
