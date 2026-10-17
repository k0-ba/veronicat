# Blender (headless): rig + animate the Meshy cat and export a skinned, animated GLB.
#
#   blender -b --factory-startup -P rig_build.py -- <src.glb> <landmarks.json> <out.glb> [preview_dir]
#
# Skeleton: the *body* of Rigify's cat metarig (Animals/cat.py) — same bone names and
# hierarchy (spine…spine.005, tail.001–004, shoulder/upper_arm/forearm/hand/f_toe,
# thigh/shin/foot/r_toe, ear) without the face and finger bones, fitted to this mesh
# from landmarks.json. Weights: automatic (bone heat) on a manifold voxel proxy,
# transferred to the real mesh. Clips: IK-driven procedural gaits, baked to FK.
import bpy, sys, json, math, os
import numpy as np
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, LM, OUT = argv[0], argv[1], argv[2]
PREVIEW = argv[3] if len(argv) > 3 else None
FPS = 30
L = json.load(open(LM))

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.fps = FPS
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
mesh.name = "cat"
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Drop the parent empty the importer may add.
for o in list(bpy.data.objects):
    if o.type == 'EMPTY':
        bpy.data.objects.remove(o)

# ── decimate for the web ────────────────────────────────────────────────────
dec = mesh.modifiers.new("dec", 'DECIMATE')
dec.ratio = 0.07
bpy.ops.object.modifier_apply(modifier="dec")
print("TRIS", sum(len(p.vertices) - 2 for p in mesh.data.polygons))

V = lambda p: Vector(p)
P = {k: V(v) for k, v in L["picks"].items()}
legs = L["legs"]
zmin = L["zmin"]

def line_at(name, z):
    """Point on a leg centreline at height z (linear interp)."""
    pts = legs[name]["line"]
    for a, b in zip(pts, pts[1:]):
        if a[2] <= z <= b[2]:
            t = (z - a[2]) / (b[2] - a[2])
            return V(a).lerp(V(b), t)
    return V(pts[-1] if z > pts[-1][2] else pts[0])

# ── armature ────────────────────────────────────────────────────────────────
arm_data = bpy.data.armatures.new("cat_rig")
rig = bpy.data.objects.new("cat_rig", arm_data)
scn.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones

def bone(name, head, tail, parent=None, deform=True, connect=False, roll_up=True):
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    b.use_deform = deform
    if roll_up:
        b.align_roll(Vector((0, 0, 1)) if abs((b.tail - b.head).normalized().z) < 0.9 else Vector((0, -1, 0)))
    return b

ground = zmin
mid_x = (P["hips"].x + P["chest"].x) / 2
bone("root", (mid_x, 0, ground), (mid_x, -0.3, ground), deform=False)
# Spine: pelvis (spine) points forward (−Y) from the hips.
bone("spine", P["tail0"].lerp(P["hips"], 0.4), P["hips"], "root")
bone("spine.001", P["hips"], P["spine1"], "spine", connect=True)
bone("spine.002", P["spine1"], P["spine2"], "spine.001", connect=True)
bone("spine.003", P["spine2"], P["chest"], "spine.002", connect=True)
bone("spine.004", P["chest"], P["neck_base"], "spine.003", connect=True)       # neck root
head_base = P["neck_base"].lerp(P["head"], 0.75)
bone("spine.005", P["neck_base"], head_base, "spine.004", connect=True)        # neck
bone("spine.006", head_base, P["nose"], "spine.005", connect=True)             # head
ear_base = P["head"] + Vector((0.0, 0.02, 0.07))
for s in (1, -1):
    side = ".L" if s > 0 else ".R"
    tip = P["ear_tip.L"].copy()
    hx = P["head"].x
    tip.x = hx + s * abs(tip.x - hx + 0.07)
    base = ear_base.copy(); base.x = hx + s * 0.06
    bone("ear" + side, base, tip, "spine.006")
# Tail.
tails = [P["tail0"], P["tail1"], P["tail2"], P["tail3"], P["tail4"]]
bone("tail.001", tails[0], tails[1], "spine")
for i in range(1, 4):
    bone(f"tail.00{i+1}", tails[i], tails[i + 1], f"tail.00{i}", connect=True)

# Legs.
for side in (".L", ".R"):
    s = 1 if side == ".L" else -1
    # front
    f = "front" + side
    tip = V(legs[f]["toe_tip"])
    paw = line_at(f, ground + 0.035)
    wrist = line_at(f, ground + 0.11)
    elbow = line_at(f, -0.13)
    # Shoulder joint on the body: symmetric (mean of both elbows), not per-leg —
    # the mesh is mid-stride, so the two elbows sit far apart.
    ey = (line_at("front.L", -0.13).y + line_at("front.R", -0.13).y) / 2
    sh = Vector((elbow.x * 0.85 + mid_x * 0.15, ey - 0.07, elbow.z + 0.17))
    scap = sh + Vector((0, 0.10, 0.17)); scap.x = sh.x * 0.6 + mid_x * 0.4
    bone("shoulder" + side, scap, sh, "spine.004")
    bone("upper_arm" + side, sh, elbow, "shoulder" + side, connect=True)
    bone("forearm" + side, elbow, wrist, "upper_arm" + side, connect=True)
    bone("hand" + side, wrist, paw, "forearm" + side, connect=True)
    bone("f_toe" + side, paw, Vector((tip.x, tip.y, paw.z)), "hand" + side, connect=True)
    # hind
    h = "hind" + side
    tip = V(legs[h]["toe_tip"])
    toe = line_at(h, ground + 0.035)
    hock = line_at(h, ground + 0.24)
    knee = line_at(h, -0.13)
    hip = P["hips"] + Vector((0, 0.02, -0.12)); hip.x = mid_x + s * 0.10
    bone("thigh" + side, hip, knee, "spine")
    bone("shin" + side, knee, hock, "thigh" + side, connect=True)
    bone("foot" + side, hock, toe, "shin" + side, connect=True)
    bone("r_toe" + side, toe, Vector((tip.x, tip.y, toe.z)), "foot" + side, connect=True)

# Control bones (not exported): IK targets at the paws + pole targets.
def pole_point(a, b, c, dist=0.6):
    ab = (c - a).normalized()
    proj = a + ab * (b - a).dot(ab)
    d = (b - proj)
    if d.length < 1e-4:
        d = Vector((0, 1, 0))
    return b + d.normalized() * dist

for side in (".L", ".R"):
    for upper, lower, end in (("upper_arm", "hand", "f_toe"), ("thigh", "foot", "r_toe")):
        u, l, e = eb[upper + side], eb[lower + side], eb[end + side]
        c = bone("ik_" + lower + side, l.tail, l.tail + (e.tail - e.head), "root", deform=False)
        c.roll = e.roll
        # Children of the paw control: the wrist/hock IK goal and the hand/foot orientation.
        w = bone("ik_w_" + lower + side, l.head, l.head + Vector((0, 0, 0.05)), c.name, deform=False)
        o = bone("ik_o_" + lower + side, l.head, l.tail, c.name, deform=False, roll_up=False)
        o.roll = l.roll
        mid = eb[("forearm" if upper == "upper_arm" else "shin") + side].head
        pp = pole_point(u.head, mid, l.tail)
        bone("pole_" + lower + side, pp, pp + Vector((0, 0, 0.1)), "root", deform=False)

bpy.ops.object.mode_set(mode='OBJECT')

# ── weights: geometric, from vertex position only ──────────────────────────
# Bone heat on this mesh leaks leg weights across the belly, and edge-based smoothing
# tears at the UV-seam splits the glTF importer makes. Weights here are smooth
# functions of position (identical on both sides of a seam): each leg owns a
# tube around its centreline that widens into the body; everything else follows
# the spine/neck/head/tail by inverse-distance.
co = np.array([v.co[:] for v in mesh.data.vertices])
nv = len(co)
dbones = [b for b in rig.data.bones if b.use_deform]
names = [b.name for b in dbones]
bi = {n: i for i, n in enumerate(names)}
H = np.array([b.head_local[:] for b in dbones]); T = np.array([b.tail_local[:] for b in dbones])
def segd(h, t):
    ht = t - h
    u = np.clip(((co - h) @ ht) / max(1e-9, ht @ ht), 0, 1)
    return np.linalg.norm(h + u[:, None] * ht - co, axis=1)
D = np.stack([segd(H[i], T[i]) for i in range(len(names))], 1)
def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
# Body underside height along y (low percentile of the mid-line strip).
mid = np.abs(co[:, 0] - mid_x) < 0.03
ys = np.linspace(co[:, 1].min(), co[:, 1].max(), 40)
under = []
for y0 in ys:
    sel = mid & (np.abs(co[:, 1] - y0) < 0.04)
    under.append(np.percentile(co[sel, 2], 3) if sel.sum() > 10 else zmin)
under = np.array(under)
CHAIN = {"front": ["shoulder", "upper_arm", "forearm", "hand", "f_toe"],
         "hind": ["thigh", "shin", "foot", "r_toe"]}
Wleg = np.zeros((nv, len(names))); msum = np.zeros(nv)
cl = {}
for leg, line in legs.items():
    pts = np.array(sorted(line["line"], key=lambda q: q[2]))
    cx = np.interp(co[:, 2], pts[:, 2], pts[:, 0]); cy = np.interp(co[:, 2], pts[:, 2], pts[:, 1])
    cl[leg] = np.hypot(co[:, 0] - cx, co[:, 1] - cy)
tops = [sorted(l["line"], key=lambda q: q[2])[-1][1] for l in legs.values()]
span = (ys > min(tops)) & (ys < max(tops))
zu = float(np.median(under[span]))
print("UNDER profile", np.round(under[span], 3), "->", round(zu, 3))
# Nearest leg by distance to its bone chain (thigh/upper_arm and below).
chains = {}
for leg in legs:
    kind, side = leg.split(".")
    chains[leg] = [bi[c + "." + side] for c in CHAIN[kind]]
dchain = {leg: D[:, [c for c in cols if not names[c].startswith(("shoulder",))]].min(1) for leg, cols in chains.items()}
legnames = list(legs)
def chain_weights(cols, bw=0.06):
    """Weights along a connected bone chain: nearest bone, with a smooth hat blend of
    half-width bw across each joint (no candy-wrapper pinch at wrist/hock)."""
    out = np.zeros((nv, len(cols)))
    j = np.argmin(D[:, cols], 1)
    for k, c in enumerate(cols):
        h, t = H[c], T[c]; ht = t - h; ln = np.linalg.norm(ht)
        u = np.clip(((co - h) @ ht) / (ln * ln), 0, 1) * ln     # distance along bone
        sel = j == k
        wk = np.ones(nv)
        if k > 0:      # blend into the previous bone near the head
            a = 0.5 + 0.5 * sstep(0, 1, np.clip(u / bw, 0, 1))
            out[sel, k - 1] += (1 - a)[sel]; wk *= a
        if k < len(cols) - 1:   # and into the next one near the tail
            b = 0.5 + 0.5 * sstep(0, 1, np.clip((ln - u) / bw, 0, 1))
            out[sel, k + 1] += (wk * (1 - b))[sel]; wk *= b
        out[sel, k] += wk[sel]
    return out / out.sum(1, keepdims=True)
near_leg = np.argmin(np.stack([dchain[l] for l in legnames], 1), 1)
dmin = np.min(np.stack([dchain[l] for l in legnames], 1), 1)
below = (1 - sstep(zu - 0.04, zu + 0.04, co[:, 2])) * (1 - sstep(0.13, 0.21, dmin))  # under the belly, near a leg
inner = (1 - sstep(0.09, 0.17, np.min(np.stack([dchain[l] for l in legnames], 1), 1))) \
        * (1 - sstep(zu + 0.04, zu + 0.17, co[:, 2]))       # haunch/shoulder inside the body
mlev = np.maximum(below, inner)
for k, leg in enumerate(legnames):
    cols = chains[leg]
    m = np.where(near_leg == k, mlev, 0.0)
    Wleg[:, cols] += m[:, None] * chain_weights(cols)
    msum += m
over = np.maximum(msum, 1)
Wleg /= over[:, None]; msum = np.minimum(msum, 1)
ax = [i for i, n in enumerate(names) if n.startswith(("spine", "tail", "ear"))]
wa = np.zeros((nv, len(names)))
wa[:, ax] = 1 / (D[:, ax] + 0.01) ** 4
for n in names:   # tail / ears only take what is actually on them
    if n.startswith("tail"):
        wa[:, bi[n]] *= 1 - sstep(0.035, 0.075, D[:, bi[n]])
    elif n.startswith("ear"):
        wa[:, bi[n]] *= 1 - sstep(0.025, 0.05, D[:, bi[n]])
wa /= wa.sum(1, keepdims=True) + 1e-12
W = Wleg + (1 - msum)[:, None] * wa
# Top-4, normalise, write groups.
order = np.argsort(-W, 1)
keep = np.zeros_like(W, dtype=bool)
np.put_along_axis(keep, order[:, :4], True, 1)
W = np.where(keep & (W > 0.01), W, 0); W /= W.sum(1, keepdims=True)
for n in names:
    g = mesh.vertex_groups.new(name=n)
    col = W[:, bi[n]]
    for i in np.nonzero(col)[0]:
        g.add([int(i)], float(col[i]), 'REPLACE')
am = mesh.modifiers.new("Armature", 'ARMATURE'); am.object = rig
mesh.parent = rig

# ── IK setup ────────────────────────────────────────────────────────────────
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones

def signed_angle(u, v, n):
    a = u.angle(v)
    if u.cross(v).angle(n) < 1:
        a = -a
    return a

for side in (".L", ".R"):
    for upper, lower, end in (("upper_arm", "hand", "f_toe"), ("thigh", "foot", "r_toe")):
        # 2-bone IK (upper + middle) to the wrist/hock; a 3-bone chain folds the wrist.
        midn = ("forearm" if upper == "upper_arm" else "shin") + side
        ik = pb[midn].constraints.new('IK')
        ik.target = rig; ik.subtarget = "ik_w_" + lower + side
        ik.pole_target = rig; ik.pole_subtarget = "pole_" + lower + side
        ik.chain_count = 2
        ori = pb[lower + side].constraints.new('COPY_ROTATION')
        ori.target = rig; ori.subtarget = "ik_o_" + lower + side
        base = rig.data.bones[upper + side]; tipb = rig.data.bones[midn]
        polep = rig.data.bones["pole_" + lower + side].head_local
        normal = (tipb.tail_local - base.head_local).cross(polep - base.head_local)
        proj = normal.cross(base.tail_local - base.head_local)
        ik.pole_angle = signed_angle(base.x_axis, proj, base.tail_local - base.head_local)
        cr = pb[end + side].constraints.new('COPY_ROTATION')
        cr.target = rig; cr.subtarget = "ik_" + lower + side
        # Let the shoulder blade swing a little with the arm.
    pb["shoulder" + side].rotation_mode = 'XYZ'

for b in pb:
    b.rotation_mode = 'XYZ'

REST = {b.name: b.bone.matrix_local.copy() for b in pb}
def rest_head(n): return rig.data.bones[n].head_local.copy()

# ── procedural clip authoring ──────────────────────────────────────────────
FEET = {"hand.L": "front.L", "hand.R": "front.R", "foot.L": "hind.L", "foot.R": "hind.R"}
paw_rest = {k: rest_head("ik_" + k) for k in FEET}
sh_y = {s: rest_head("upper_arm" + s).y for s in (".L", ".R")}
hip_y = {s: rest_head("thigh" + s).y for s in (".L", ".R")}
# Neutral standing paw spots: under the shoulder / just behind the hip, natural width.
neutral = {}
for k in FEET:
    s = k[-2:]
    p = paw_rest[k].copy()
    # Centre each front/hind pair between its two rest paws: the least swing per leg.
    pair = ("hand.L", "hand.R") if k.startswith("hand") else ("foot.L", "foot.R")
    p.y = (paw_rest[pair[0]].y + paw_rest[pair[1]].y) / 2
    p.x = mid_x + (p.x - mid_x) * 0.75
    neutral[k] = p

for k in FEET:
    print("PAW", k, "rest", np.round(paw_rest[k][:], 3), "neutral", np.round(neutral[k][:], 3))
for s_ in (".L", ".R"):
    print("JOINTS", s_, {n: np.round(rest_head(n + s_)[:], 3).tolist() for n in ("shoulder", "upper_arm", "forearm", "hand", "f_toe", "thigh", "shin", "foot", "r_toe")})
def set_ctrl(name, pos, rot=None):
    b = pb[name]
    rest = REST[name]
    m = Matrix.Translation(pos) @ (rot.to_matrix().to_4x4() if rot else Matrix.Identity(4)) @ rest.to_3x3().to_4x4()
    b.matrix = m
    b.keyframe_insert("location"); b.keyframe_insert("rotation_euler")

def set_rot(name, x=0.0, y=0.0, z=0.0, loc=None):
    b = pb[name]
    b.rotation_euler = Euler((x, y, z))
    b.keyframe_insert("rotation_euler")
    if loc is not None:
        b.location = Vector(loc)
        b.keyframe_insert("location")

def clear_pose():
    for b in pb:
        b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0); b.scale = (1, 1, 1)

def smooth(t): return t * t * (3 - 2 * t)

def foot_cycle(p, duty, half, lift):
    """In-place foot path. p∈[0,1). Returns (dy, dz, toe_curl). Forward is −Y."""
    if p < duty:
        q = p / duty
        return (-half + 2 * half * q, 0.0, 0.0)
    q = (p - duty) / (1 - duty)
    return (half - 2 * half * smooth(q), lift * math.sin(math.pi * q) ** 0.8, math.sin(math.pi * q))

BODY = ["spine", "spine.001", "spine.002", "spine.003", "spine.004", "spine.005", "spine.006",
        "tail.001", "tail.002", "tail.003", "tail.004", "ear.L", "ear.R", "shoulder.L", "shoulder.R"]

def gait(name, T, duty, half, lift, phases, bob, pitch_amp, spine_flex, tail_amp, body_drop=0.0):
    n = int(round(T * FPS))
    for f in range(n + 1):
        scn.frame_set(f)
        t = (f % n) / n
        clear_pose()
        w = 2 * math.pi * t
        # Body: two bobs per cycle (walk) or one (gallop) — given by `bob` as (amp, harmonics).
        amp, harm = bob
        dz = -body_drop + amp * math.cos(harm * w)
        # Pelvis points forward: local Y = forward, Z = up (roll aligned to world up).
        set_rot("spine", x=pitch_amp * math.sin(w), loc=(0, 0, dz))
        set_rot("spine.001", x=spine_flex * math.sin(w))
        set_rot("spine.002", x=spine_flex * math.sin(w + 0.4), z=0.04 * math.sin(w))
        set_rot("spine.003", x=-spine_flex * 0.5 * math.sin(w + 0.8))
        set_rot("spine.004", x=-pitch_amp * 0.6 * math.sin(w))
        set_rot("spine.005", x=-pitch_amp * 0.4 * math.sin(w))
        set_rot("spine.006", x=0.05 * math.sin(harm * w))
        for i, nm in enumerate(["tail.001", "tail.002", "tail.003", "tail.004"]):
            set_rot(nm, x=0.15 * math.sin(w * harm - i * 0.7) * tail_amp, z=tail_amp * 0.25 * math.sin(w - i * 0.9))
        for k, ph in phases.items():
            dy, dzf, curl = foot_cycle((t + ph) % 1.0, duty, half, lift)
            p = neutral[k] + Vector((0, dy, dzf))
            set_ctrl("ik_" + k, p, Euler((curl * (-1.1 if k.startswith("hand") else -0.6), 0, 0)))
            pole = "pole_" + k
            set_ctrl(pole, rest_head(pole) + Vector((0, dy * 0.5, dzf * 0.5)))
    return n

def pose_clip(name, T, keys, loop=False):
    """keys: list of (t, dict) where dict holds body/feet overrides; linear blend by smoothstep."""
    n = max(1, int(round(T * FPS)))
    for f in range(n + 1):
        scn.frame_set(f)
        t = f / n
        # find segment
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                u = smooth((t - t0) / max(1e-6, t1 - t0))
                break
        else:
            a = b = keys[-1][1]; u = 0
        clear_pose()
        def g(key, default=0.0):
            va, vb = a.get(key, default), b.get(key, default)
            if isinstance(va, (tuple, list)):
                return [x + (y - x) * u for x, y in zip(va, vb)]
            return va + (vb - va) * u
        pb["spine"].location = (0, g("fwd"), g("drop")); pb["spine"].keyframe_insert("location")
        set_rot("spine", x=-g("pitch"))   # authored: + = nose down
        set_rot("spine.001", x=g("flex")); set_rot("spine.002", x=g("flex")); set_rot("spine.003", x=-g("flex") * 0.5)
        set_rot("spine.004", x=g("neck")); set_rot("spine.005", x=g("neck") * 0.5)
        set_rot("spine.006", x=g("head"), z=g("head_turn"))
        for i, nm in enumerate(["tail.001", "tail.002", "tail.003", "tail.004"]):
            set_rot(nm, x=g("tail") + g("tail_wave") * math.sin(2 * math.pi * t * 2 - i), z=g("tail_side"))
        for e in ("ear.L", "ear.R"):
            set_rot(e, x=g("ears"))
        for k in FEET:
            off = Vector(g(k, (0.0, 0.0, 0.0)))
            curl = g(k + "_curl")
            set_ctrl("ik_" + k, neutral[k] + off, Euler((curl, 0, 0)))
            pole = "pole_" + k
            set_ctrl(pole, rest_head(pole) + off * 0.5)
    return n

CLIPS = {}
def make(name, fn, *a, **kw):
    act = bpy.data.actions.new(name + "_ctrl")
    rig.animation_data_create()
    rig.animation_data.action = act
    n = fn(name, *a, **kw)
    CLIPS[name] = (act, n)

make("walk", gait, 0.6, 0.58, 0.20, 0.10,
     {"foot.L": 0.0, "hand.L": 0.25, "foot.R": 0.5, "hand.R": 0.75},
     bob=(0.012, 2), pitch_amp=0.02, spine_flex=0.02, tail_amp=0.5)
make("run", gait, 0.36, 0.34, 0.26, 0.16,
     {"foot.L": 0.0, "foot.R": 0.1, "hand.L": 0.5, "hand.R": 0.6},
     bob=(0.04, 1), pitch_amp=0.08, spine_flex=0.10, tail_amp=0.3)

Z0 = (0.0, 0.0, 0.0)
make("idle", pose_clip, 3.0, [
    (0.0, {"tail": 0.0, "tail_side": -0.25, "head_turn": 0.0}),
    (0.5, {"tail": 0.05, "tail_side": 0.25, "head_turn": 0.15, "drop": -0.004}),
    (1.0, {"tail": 0.0, "tail_side": -0.25, "head_turn": 0.0})])
make("crouch", pose_clip, 0.15, [
    (0.0, {}),
    (1.0, {"drop": -0.12, "pitch": 0.08, "neck": -0.1, "head": 0.15, "tail": -0.2, "ears": 0.3,
           "hand.L": (0, -0.02, 0), "hand.R": (0, -0.02, 0), "foot.L": (0, -0.06, 0), "foot.R": (0, -0.06, 0)})])
# Jump: scrubbed by the game from 0 (take-off) to 1 (touch-down).
make("jump", pose_clip, 1.0, [
    (0.0, {"drop": 0.02, "pitch": -0.35, "flex": -0.05, "tail": -0.3,
           "hand.L": (0, -0.30, 0.22), "hand.R": (0, -0.26, 0.20), "foot.L": (0, 0.32, 0.05), "foot.R": (0, 0.30, 0.04),
           "hand.L_curl": -0.6, "hand.R_curl": -0.6}),
    (0.5, {"drop": 0.0, "pitch": 0.0, "flex": 0.08, "tail": 0.2, "neck": 0.1,
           "hand.L": (0, -0.05, 0.22), "hand.R": (0, -0.03, 0.22), "foot.L": (0, -0.08, 0.20), "foot.R": (0, -0.06, 0.20),
           "hand.L_curl": -1.0, "hand.R_curl": -1.0, "foot.L_curl": -0.5, "foot.R_curl": -0.5}),
    (1.0, {"drop": 0.0, "pitch": 0.22, "flex": 0.0, "tail": 0.3, "neck": 0.1, "head": -0.1,
           "hand.L": (0, -0.22, 0.02), "hand.R": (0, -0.18, 0.0), "foot.L": (0, 0.02, 0.18), "foot.R": (0, 0.04, 0.16)})])
make("land", pose_clip, 0.35, [
    (0.0, {"pitch": 0.22, "hand.L": (0, -0.22, 0.02), "hand.R": (0, -0.18, 0.0), "foot.L": (0, 0.02, 0.18), "foot.R": (0, 0.04, 0.16), "tail": 0.3}),
    (0.35, {"drop": -0.10, "pitch": 0.10, "neck": -0.1, "head": 0.1, "tail": 0.1}),
    (1.0, {})])
make("swipe", pose_clip, 0.45, [
    (0.0, {}),
    (0.35, {"pitch": -0.15, "drop": -0.02, "head": 0.15, "hand.R": (0, -0.22, 0.28), "hand.R_curl": -0.8, "foot.L": (0, -0.03, 0), "foot.R": (0, -0.03, 0)}),
    (0.6, {"pitch": -0.1, "drop": -0.02, "hand.R": (0.12, -0.32, 0.05), "hand.R_curl": 0.3}),
    (1.0, {})])
make("scratch", pose_clip, 1.0, [
    (0.0, {"pitch": -0.55, "drop": 0.05, "flex": -0.1, "head": 0.3, "tail": 0.1,
           "hand.L": (0, -0.30, 0.55), "hand.R": (0, -0.30, 0.45), "foot.L": (0, -0.10, 0), "foot.R": (0, -0.10, 0)}),
    (0.25, {"pitch": -0.55, "drop": 0.05, "flex": -0.1, "head": 0.3, "tail": 0.1,
           "hand.L": (0, -0.30, 0.42), "hand.R": (0, -0.30, 0.58), "foot.L": (0, -0.10, 0), "foot.R": (0, -0.10, 0)}),
    (0.5, {"pitch": -0.55, "drop": 0.05, "flex": -0.1, "head": 0.3, "tail": 0.1,
           "hand.L": (0, -0.30, 0.58), "hand.R": (0, -0.30, 0.42), "foot.L": (0, -0.10, 0), "foot.R": (0, -0.10, 0)}),
    (0.75, {"pitch": -0.55, "drop": 0.05, "flex": -0.1, "head": 0.3, "tail": 0.1,
           "hand.L": (0, -0.30, 0.42), "hand.R": (0, -0.30, 0.58), "foot.L": (0, -0.10, 0), "foot.R": (0, -0.10, 0)}),
    (1.0, {"pitch": -0.55, "drop": 0.05, "flex": -0.1, "head": 0.3, "tail": 0.1,
           "hand.L": (0, -0.30, 0.55), "hand.R": (0, -0.30, 0.45), "foot.L": (0, -0.10, 0), "foot.R": (0, -0.10, 0)})])
# Loaf / nap: body down, paws tucked under, tail wrapped, head low.
LOAF = {"drop": -0.30, "pitch": 0.02, "neck": -0.15, "head": -0.1, "tail": -0.1, "tail_side": 0.5, "ears": 0.2,
        "hand.L": (0, 0.10, 0.0), "hand.R": (0, 0.10, 0.0), "foot.L": (0, -0.12, 0.0), "foot.R": (0, -0.12, 0.0),
        "hand.L_curl": 1.2, "hand.R_curl": 1.2}
LOAF2 = dict(LOAF, drop=-0.295, neck=-0.13)
make("sleep", pose_clip, 3.0, [(0.0, LOAF), (0.5, LOAF2), (1.0, LOAF)])

# ── bake every clip to FK on the deform bones ──────────────────────────────
deform = [b.name for b in rig.data.bones if b.use_deform]
baked = {}
for name, (act, n) in CLIPS.items():
    rig.animation_data.action = act
    bpy.ops.pose.select_all(action='DESELECT')
    for nm in deform:
        pb[nm].select = True
    bpy.ops.nla.bake(frame_start=0, frame_end=n, step=1, only_selected=True, visual_keying=True,
                     clear_constraints=False, use_current_action=False, bake_types={'POSE'})
    out = rig.animation_data.action
    out.name = name
    out.use_fake_user = True
    baked[name] = out
    print("BAKED", name, n, "frames")

# Strip control rig: constraints, control bones, control actions.
for b in pb:
    for c in list(b.constraints):
        b.constraints.remove(c)
for act, _ in CLIPS.values():
    bpy.data.actions.remove(act)
bpy.ops.object.mode_set(mode='EDIT')
for b in list(arm_data.edit_bones):
    if b.name.startswith(("ik_", "pole_")):
        arm_data.edit_bones.remove(b)
bpy.ops.object.mode_set(mode='POSE')

# Push each baked action to its own NLA track so the exporter emits one clip each.
rig.animation_data.action = None
for name, act in baked.items():
    tr = rig.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 0, act)
    tr.mute = True

# ── optional preview renders (side view, a few frames per clip) ────────────
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.render.resolution_x, scn.render.resolution_y = 640, 480
    cd = bpy.data.cameras.new("cam"); cd.type = 'ORTHO'; cd.ortho_scale = 2.8
    cam = bpy.data.objects.new("cam", cd); scn.collection.objects.link(cam); scn.camera = cam
    cam.location = (5, 0, 0); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.animation_data.action = None
    for b in rig.pose.bones:
        b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0)
    scn.render.filepath = f"{PREVIEW}/rest.png"; bpy.ops.render.render(write_still=True)
    if os.environ.get("RIGDEBUG"):
        rig.animation_data.action = baked["idle"]; scn.frame_set(0)
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        P1 = np.array([v.co[:] for v in ev.vertices])
        P0 = np.array([v.co[:] for v in mesh.data.vertices])
        d = np.linalg.norm(P1 - P0, axis=1)
        print("DISP pct50/90/99/max", np.percentile(d, [50, 90, 99]), d.max())
        gn = {g.index: g.name for g in mesh.vertex_groups}
        for i in np.argsort(-d)[:12]:
            v = mesh.data.vertices[int(i)]
            print("V", i, np.round(P0[i], 3), "->", np.round(P1[i], 3),
                  [(gn[g.group], round(g.weight, 2)) for g in v.groups])
        # Blend divergence: deformed pos vs rigid attachment to the max-weight bone.
        Mx = {b.name: (rig.matrix_world @ b.matrix @ b.bone.matrix_local.inverted()) for b in rig.pose.bones}
        div = []
        for v in mesh.data.vertices:
            if not v.groups or v.co.z > -0.25: continue
            g = max(v.groups, key=lambda g: g.weight)
            rigid = Mx[gn[g.group]] @ v.co
            div.append(((Vector(P1[v.index]) - rigid).length, v.index))
        div.sort(reverse=True)
        for dd, i in div[:10]:
            v = mesh.data.vertices[i]
            print("DIV %.3f" % dd, i, np.round(P0[i], 3), [(gn[g.group], round(g.weight, 2)) for g in v.groups])
        for nm in ("spine", "spine.003", "thigh.L", "upper_arm.L", "shoulder.L"):
            print("POSE", nm, np.round(rig.pose.bones[nm].matrix.to_translation()[:], 3), np.round(rig.pose.bones[nm].matrix.to_euler()[:], 2))
    for name, act in baked.items():
        rig.animation_data.action = act
        n = CLIPS[name][1]
        for i, f in enumerate([0, n // 4, n // 2, (3 * n) // 4]):
            scn.frame_set(f)
            scn.render.filepath = f"{PREVIEW}/{name}_{i}.png"
            bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None

bpy.ops.object.mode_set(mode='OBJECT') if rig.mode != 'OBJECT' else None
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_def_bones=True,
    export_skins=True, export_all_influences=False, export_yup=True,
    export_image_format='JPEG', export_jpeg_quality=85,
)
print("EXPORTED", OUT)
