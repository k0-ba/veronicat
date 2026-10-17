# Blender (headless): find skeleton landmarks on the Meshy cat.
#   blender -b --factory-startup -P landmarks.py -- <src.glb> <out.json>
# Legs are found automatically (paw clusters tracked upward slice by slice);
# spine / neck / head / tail come from side-view picks (Y,Z) with X taken from the mesh.
import bpy, sys, json
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
M = np.array(mesh.matrix_world)
V = np.array([v.co for v in mesh.data.vertices])
V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
X, Y, Z = V[:, 0], V[:, 1], V[:, 2]
zmin = Z.min()

def kmeans(P, k, iters=30):
    # deterministic init: extremes in y then x
    idx = [np.argmin(P[:, 1] + P[:, 0]), np.argmin(P[:, 1] - P[:, 0]), np.argmax(P[:, 1] + P[:, 0]), np.argmax(P[:, 1] - P[:, 0])][:k]
    C = P[idx].copy()
    for _ in range(iters):
        lab = np.argmin(((P[:, None, :] - C[None]) ** 2).sum(-1), 1)
        C = np.array([P[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
    return C, lab

# --- legs ---------------------------------------------------------------
bot = Z < zmin + 0.06
C, lab = kmeans(np.c_[X[bot], Y[bot]], 4)
legs = {}
for j in range(4):
    cx, cy = C[j]
    name = ('front' if cy < 0 else 'hind') + ('.L' if cx > 0 else '.R')  # cat faces -Y, left = +X
    line = []
    c = np.array([cx, cy])
    for z0 in np.arange(zmin, -0.12, 0.02):
        s = (Z >= z0) & (Z < z0 + 0.02)
        P = np.c_[X[s], Y[s]]
        if len(P) == 0:
            continue
        d = np.linalg.norm(P - c, axis=1)
        near = P[d < 0.09]
        if len(near) < 5:
            break
        c = near.mean(0)
        line.append([float(c[0]), float(c[1]), float(z0 + 0.01)])
    # the paw's front tip (for toe bones)
    s = bot & (np.linalg.norm(np.c_[X, Y] - C[j], axis=1) < 0.09)
    tip = V[s][np.argmin(V[s][:, 1])]
    legs[name] = {"line": line, "toe_tip": [float(v) for v in tip]}

# --- picks from the 900x700 ortho side render (scale 2.4, centred on bbox) ---
cy0 = (Y.min() + Y.max()) / 2
cz0 = (Z.min() + Z.max()) / 2
px = 2.4 / 900
def pick(u, v):
    y = cy0 + (u - 450) * px
    z = cz0 + (350 - v) * px
    s = (np.abs(Y - y) < 0.04) & (np.abs(Z - z) < 0.04)
    x = float(X[s].mean()) if s.any() else 0.0
    return [x, float(y), float(z)]

picks = {
    "hips": pick(625, 285), "spine1": pick(540, 270), "spine2": pick(450, 262),
    "chest": pick(360, 262), "neck_base": pick(285, 255), "head": pick(185, 225),
    "nose": pick(105, 262), "ear_tip.L": pick(165, 145),
    "tail0": pick(690, 300), "tail1": pick(700, 360), "tail2": pick(712, 415),
    "tail3": pick(755, 412), "tail4": pick(795, 360),
}
json.dump({"zmin": float(zmin), "legs": legs, "picks": picks, "center": [float(cy0), float(cz0)]}, open(out, "w"), indent=1)
print("LEGS", {k: (len(v["line"]), v["line"][0], v["line"][-1]) for k, v in legs.items()})
