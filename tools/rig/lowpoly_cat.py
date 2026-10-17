# Blender (headless): animate the low-poly rigged cat (art_source/cat_rigged.fbx) with the
# game's clip set and export a skinned GLB with per-face region masks for runtime skins.
#
#   blender -b --factory-startup -P lowpoly_cat.py -- <cat_rigged.fbx> <out.glb> [preview_dir]
#
# Rig: pelvis → body_1 → body_2 → neck → head (+ears); 4-segment legs
# leg_{front,back}_{left,right}_1..4 (upper, lower, pastern/metatarsus, paw); tail_1..4.
# The FBX leaves the hind legs and tail as loose roots; they are parented to the pelvis here.
#
# Legs are posed by a small planar solver instead of Blender IK: every joint of the leg
# flexes together by one amount (zig-zag: knee one way, hock the other; elbow forward,
# wrist back), and the whole leg then turns at the hip/shoulder so the paw lands on its
# target. That keeps the elbow behind, the knee forward and the hock behind at all
# times, with the paw flat on the ground in stance — no rubbery bends.
#
# Model space: +X forward, +Y = left, +Z up, metres. Exported facing glTF +Z.
import bpy, sys, math, os
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
scn = bpy.context.scene
scn.render.fps = 30
FPS = 30
rig = next(o for o in scn.objects if o.type == 'ARMATURE')
mesh = next(o for o in scn.objects if o.type == 'MESH')
for o in list(scn.objects):
    if o not in (rig, mesh):
        bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
rig.name, mesh.name = "CatArmature", "Cat"
rig.animation_data_create()
rig.animation_data.action = None

# ── rig fix-up: hind legs and tail follow the pelvis ────────────────────────
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for n in ("leg_back_left_1", "leg_back_right_1", "tail_1"):
    eb[n].use_connect = False
    eb[n].parent = eb["pelvis"]
bpy.ops.object.mode_set(mode='OBJECT')

bones, pb = rig.data.bones, rig.pose.bones
R = {b.name: b.matrix_local.copy() for b in bones}
PAR = {b.name: (b.parent.name if b.parent else None) for b in bones}
ORDER = []
def visit(b):
    ORDER.append(b.name)
    for c in b.children:
        visit(c)
for b in bones:
    if b.parent is None:
        visit(b)
for p in pb:
    p.rotation_mode = 'QUATERNION'

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
HEAD = lambda n: R[n].translation.copy()
TAIL = lambda n: (R[n] @ Vector((0, bones[n].length, 0)))
HIP = (HEAD("leg_back_left_1") + HEAD("leg_back_right_1")) / 2

def nose_up(a): return Quaternion(Y, -a)
def to_left(a): return Quaternion(Z, a)

# ── leg solver ──────────────────────────────────────────────────────────────
def ang(v):  # sagittal angle: 0 = straight down, + = forward
    return math.atan2(v.x, -v.z)
def vec(a, l):
    return Vector((math.sin(a) * l, 0, -math.cos(a) * l))

LEGS = {}
for side, s in (("left", "L"), ("right", "R")):
    for end, e in (("front", "F"), ("back", "B")):
        names = [f"leg_{end}_{side}_{i}" for i in (1, 2, 3, 4)]
        J = [HEAD(names[0])] + [TAIL(n) for n in names]
        segs = [J[i + 1] - J[i] for i in range(4)]
        a = [ang(v) for v in segs]
        LEGS[e + s] = dict(
            names=names, L=[v.length for v in segs], r12=a[1] - a[0], r23=a[2] - a[1],
            r34=a[3] - a[2], ball=J[3].copy(), end=e,
            # flex weights: (joint 1–2, joint 2–3) per unit of fold
            w=(1.0, 0.35) if e == "F" else (-1.0, 1.0),
            lim12=(-0.05, 2.2) if e == "F" else (-2.4, 0.15),
            lim23=(-2.6, 1.3) if e == "F" else (0.25, 2.6),
        )

def leg_shape(lg, s, curl):
    d12 = min(max(lg["r12"] + lg["w"][0] * s, lg["lim12"][0]), lg["lim12"][1])
    d23 = min(max(lg["r23"] + lg["w"][1] * s - curl, lg["lim23"][0]), lg["lim23"][1])
    L = lg["L"]
    return d12, d23, vec(0, L[0]) + vec(d12, L[1]) + vec(d12 + d23, L[2])

def solve_leg(lg, J0, T, curl=0.0, toe=None):
    """Joint positions J0..J4 so that the ball of the paw (J3) lands on T."""
    dist = (Vector((T.x, 0, T.z)) - Vector((J0.x, 0, J0.z))).length
    lo, hi = -1.2, 3.0          # fold amount: low = straighter (longer leg)
    for _ in range(40):
        mid = (lo + hi) / 2
        if leg_shape(lg, mid, curl)[2].length > dist: lo = mid
        else: hi = mid
    d12, d23, V = leg_shape(lg, (lo + hi) / 2, curl)
    phi = ang(Vector((T.x - J0.x, 0, T.z - J0.z))) - ang(V)
    a1 = phi; a2 = a1 + d12; a3 = a2 + d23
    L = lg["L"]
    # Paw: flat on the ground unless told otherwise (toe = absolute sagittal angle).
    a4 = toe if toe is not None else math.pi / 2
    pts = [J0]
    tot = sum(L[:3])
    acc = 0.0
    for a, l in ((a1, L[0]), (a2, L[1]), (a3, L[2]), (a4, L[3])):
        acc += l
        p = pts[-1] + vec(a, l)
        p.y = J0.y + (T.y - J0.y) * min(1.0, acc / tot)
        pts.append(p)
    return pts

# ── posing ──────────────────────────────────────────────────────────────────
TAILS = ["tail_1", "tail_2", "tail_3", "tail_4"]

def solve_pose(P):
    g = lambda k, d=0.0: P.get(k, d)
    extra = {
        "body_1": nose_up(g("flex") + g("bend1")) @ to_left(g("sway")),
        "body_2": nose_up(-g("flex") * 1.6 + g("bend2")) @ to_left(-g("sway") * 0.5),
        "neck": nose_up(g("neck")) @ to_left(g("head_yaw") * 0.5),
        "head": nose_up(g("head")) @ to_left(g("head_yaw") * 0.5),
        "ear_left": Quaternion(X, -g("ears")) @ nose_up(-g("ears_back")),
        "ear_right": Quaternion(X, g("ears")) @ nose_up(-g("ears_back")),
    }
    for i, t in enumerate(TAILS):
        up = g("tail_up") if i == 0 else 0.0
        extra[t] = nose_up(-up - g("tail_curl") * (0.4 + 0.25 * i))  # tail points −X: up = −pitch @ to_left(g("tail_yaw") * (0.3 + 0.25 * i))
    feet = P.get("feet", {})
    curls, toes = P.get("curl", {}), P.get("toe", {})
    air = P.get("air", False)
    M, aim = {}, {}
    q_body = nose_up(g("pitch"))
    for n in ORDER:
        p = PAR[n]
        base = (M[p] @ R[p].inverted() @ R[n]) if p else R[n].copy()
        head = base.translation.copy()
        rot = base.to_quaternion()
        if n == "pelvis":
            head = HIP + q_body @ (head - HIP) + Vector((g("fwd"), 0, g("drop")))
            rot = q_body @ rot
        elif n in extra:
            rot = extra[n] @ rot
        elif n in aim:
            d = aim[n]
            rot = (rot @ Y).rotation_difference(d) @ rot
        M[n] = Matrix.Translation(head) @ rot.to_matrix().to_4x4()
        for k, lg in LEGS.items():
            if n == lg["names"][0] and n not in aim:
                T = lg["ball"] + Vector(feet.get(k, (0, 0, 0)))
                if not air:
                    T.z = max(T.z, lg["ball"].z)
                pts = solve_leg(lg, head, T, curls.get(k, 0.0), toes.get(k))
                for i, bn in enumerate(lg["names"]):
                    aim[bn] = pts[i + 1] - pts[i]
                d = aim[n]
                rot = (base.to_quaternion() @ Y).rotation_difference(d) @ base.to_quaternion()
                M[n] = Matrix.Translation(head) @ rot.to_matrix().to_4x4()
    return M

LAST = {}
def key(f, P):
    M = solve_pose(P)
    for n in ORDER:
        p = PAR[n]
        base = (M[p] @ R[p].inverted() @ R[n]) if p else R[n]
        basis = base.inverted() @ M[n]
        q = basis.to_quaternion()
        if n in LAST and LAST[n].dot(q) < 0:
            q.negate()
        LAST[n] = q
        b = pb[n]
        b.rotation_quaternion = q
        b.keyframe_insert("rotation_quaternion", frame=f)
        if p is None:
            b.location = basis.translation
            b.keyframe_insert("location", frame=f)

def smooth(t): return t * t * (3 - 2 * t)

def lerp_pose(A, B, t):
    out = {}
    for k in set(A) | set(B):
        if k in ("feet",):
            fa, fb = A.get(k, {}), B.get(k, {})
            out[k] = {fk: Vector(fa.get(fk, (0, 0, 0))).lerp(Vector(fb.get(fk, (0, 0, 0))), t) for fk in set(fa) | set(fb)}
        elif k in ("curl", "toe"):
            fa, fb = A.get(k, {}), B.get(k, {})
            dflt = 0.0 if k == "curl" else math.pi / 2
            out[k] = {fk: fa.get(fk, dflt) * (1 - t) + fb.get(fk, dflt) * t for fk in set(fa) | set(fb)}
        elif k == "air":
            out[k] = A.get(k, False) or B.get(k, False)
        else:
            out[k] = A.get(k, 0.0) * (1 - t) + B.get(k, 0.0) * t
    return out

CLIPS = {}
def new_clip(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    LAST.clear()
    return act

def keyed(name, T, keys):
    """keys: [(t, pose)] with t in 0..1; smoothstep between keys."""
    act = new_clip(name)
    n = max(1, round(T * FPS))
    for f in range(n + 1):
        t = f / n
        for (ta, A), (tb, B) in zip(keys, keys[1:]):
            if ta <= t <= tb:
                key(f, lerp_pose(A, B, smooth((t - ta) / max(1e-6, tb - ta))))
                break
    CLIPS[name] = (act, n)

def foot_cycle(p, duty, half, lift):
    """Stance: paw slides back from +half to −half. Swing: arcs forward. → (dx, dz, swing 0..1 or None)"""
    p %= 1.0
    if p < duty:
        return half * (1 - 2 * p / duty), 0.0, None
    s = (p - duty) / (1 - duty)
    return -half + 2 * half * smooth(s), lift * math.sin(math.pi * s) ** 0.8, s

def gait(name, T, duty, half, lift, phases, extra, curl, reach=None):
    act = new_clip(name)
    n = max(2, round(T * FPS))
    for f in range(n + 1):
        p = (f % n) / n
        P = extra(p)
        P["feet"], P["curl"], P["toe"] = {}, {}, {}
        for k, ph in phases.items():
            e = k[0]
            dx, dz, sw = foot_cycle(p + ph, duty, half[e], lift[e])
            dx += (reach or {}).get(e, 0.0)
            P["feet"][k] = (dx, 0, dz)
            if sw is not None:
                c = curl[e] * math.sin(math.pi * min(1, sw * 1.15)) ** 1.5
                P["curl"][k] = c
                # paw hangs off the pastern while folded, flattens again before touch-down
                lg = LEGS[k]
                P["toe"][k] = math.pi / 2 - (0.9 if e == "F" else 0.6) * math.sin(math.pi * sw)
        key(f, P)
    CLIPS[name] = (act, n)
    speed = (2 * half["B"] / duty) / T
    print("GAIT", name, "speed %.3f m/s" % speed)
    return speed

TAU = 2 * math.pi
NEUTRAL = {"tail_up": 0.35, "tail_curl": -0.25, "head": 0.05}

# ── locomotion ──────────────────────────────────────────────────────────────
WALK_T = 0.56
walk_speed = gait("walk", WALK_T, 0.58, {"F": 0.07, "B": 0.07}, {"F": 0.03, "B": 0.026},
    {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75},
    lambda p: {"drop": -0.006 + 0.003 * math.cos(2 * TAU * p), "pitch": 0.015 * math.sin(2 * TAU * p),
               "sway": 0.05 * math.sin(TAU * p),
               "neck": -0.03 * math.cos(2 * TAU * p) - 0.05, "head": 0.1, "head_yaw": -0.04 * math.sin(TAU * p),
               "tail_up": 0.75, "tail_curl": -0.35, "tail_yaw": 0.18 * math.sin(TAU * p + 0.6)},
    curl={"F": 1.6, "B": 0.7})

RUN_T = 0.36
run_speed = gait("run", RUN_T, 0.32, {"F": 0.105, "B": 0.11}, {"F": 0.05, "B": 0.04},
    {"BL": 0.0, "BR": 0.07, "FL": 0.47, "FR": 0.56},
    lambda p: {"drop": -0.012 + 0.012 * math.cos(2 * TAU * (p - 0.38)),
               "pitch": 0.11 * math.sin(TAU * (p - 0.02)),
               "flex": 0.16 * math.cos(TAU * p),
               "neck": 0.06 * math.sin(TAU * p) - 0.12, "head": 0.18,
               "tail_up": 0.1 + 0.1 * math.sin(TAU * p), "tail_curl": 0.05 + 0.1 * math.sin(TAU * p - 1)},
    curl={"F": 1.9, "B": 1.0}, reach={"F": 0.02, "B": -0.01})

IDLE_T = 4.0
act = new_clip("idle")
n = round(IDLE_T * FPS)
for f in range(n + 1):
    p = (f % n) / n
    look = 0.4 * math.sin(TAU * p) * smooth(min(1, abs(math.sin(TAU * p)) * 1.5))
    twitch = max(0.0, math.sin(TAU * (p * 3 - 0.1))) ** 12
    key(f, {"drop": -0.002 * (1 - math.cos(4 * TAU * p)), "flex": 0.01 * math.sin(4 * TAU * p),
            "head_yaw": look, "head": 0.08 + 0.05 * math.sin(2 * TAU * p), "neck": -0.04,
            "ears": 0.25 * twitch,
            "tail_up": 0.35, "tail_curl": -0.25 + 0.12 * math.sin(TAU * p),
            "tail_yaw": 0.35 * math.sin(TAU * p + 1.0)})
CLIPS["idle"] = (act, n)

# ── jump family ─────────────────────────────────────────────────────────────
CROUCH = {"drop": -0.045, "pitch": -0.04, "flex": 0.06, "neck": -0.15, "head": 0.25, "ears_back": 0.2,
          "tail_up": -0.1, "tail_curl": 0.05,
          "feet": {"BL": (0.03, 0, 0), "BR": (0.03, 0, 0), "FL": (0.015, 0, 0), "FR": (0.015, 0, 0)}}
keyed("crouch", 0.22, [(0, NEUTRAL), (1, CROUCH)])
# Scrubbed by the game: 0 = take-off, 1 = touch-down (front paws first).
TAKEOFF = {"drop": 0.01, "pitch": 0.32, "flex": -0.12, "neck": -0.15, "head": 0.0, "tail_up": 0.2, "air": True,
           "feet": {"FL": (0.04, 0, 0.07), "FR": (0.03, 0, 0.06), "BL": (-0.07, 0, -0.01), "BR": (-0.06, 0, -0.01)},
           "curl": {"FL": 1.8, "FR": 1.7}, "toe": {"BL": 0.2, "BR": 0.2}}
STRETCH = {"drop": 0.0, "pitch": 0.06, "flex": -0.16, "neck": -0.1, "head": 0.05, "tail_up": 0.25, "tail_curl": 0.1,
           "air": True,
           "feet": {"FL": (0.09, 0, 0.04), "FR": (0.08, 0, 0.035), "BL": (-0.09, 0, 0.03), "BR": (-0.085, 0, 0.03)},
           "curl": {"FL": 0.6, "FR": 0.6}, "toe": {"BL": 0.3, "BR": 0.3, "FL": 1.2, "FR": 1.2}}
REACH = {"drop": 0.0, "pitch": -0.18, "flex": 0.1, "neck": 0.12, "head": 0.18, "tail_up": 0.45, "tail_curl": -0.2,
         "air": True,
         "feet": {"FL": (0.05, 0, -0.01), "FR": (0.04, 0, 0.0), "BL": (0.05, 0, 0.05), "BR": (0.045, 0, 0.045)},
         "curl": {"BL": 0.8, "BR": 0.8}, "toe": {"FL": 1.3, "FR": 1.3}}
keyed("jump", 1.0, [(0, CROUCH), (0.15, TAKEOFF), (0.5, STRETCH), (0.82, REACH), (1.0, REACH)])
LAND0 = {"drop": -0.03, "pitch": -0.14, "flex": 0.08, "neck": 0.1, "head": 0.12, "tail_up": 0.5,
         "feet": {"BL": (0.03, 0, 0.03), "BR": (0.025, 0, 0.025)}}
LAND1 = {"drop": -0.04, "pitch": -0.01, "flex": 0.06, "tail_up": 0.3, "head": 0.1}
keyed("land", 0.35, [(0, LAND0), (0.4, LAND1), (1, NEUTRAL)])

# ── actions ─────────────────────────────────────────────────────────────────
RAISE = {"pitch": 0.1, "drop": -0.01, "neck": -0.1, "head": 0.15, "tail_up": 0.4, "ears_back": 0.3,
         "feet": {"FR": (0.03, -0.004, 0.08), "FL": (-0.01, 0, 0)}, "curl": {"FR": 1.4}}
STRIKE = {"pitch": -0.04, "drop": -0.015, "neck": 0.12, "head": 0.2, "tail_up": 0.45, "ears_back": 0.3,
          "feet": {"FR": (0.13, 0.01, 0.035), "FL": (-0.01, 0, 0)}, "curl": {"FR": -0.2}, "toe": {"FR": 1.2}}
keyed("swipe", 0.45, [(0, NEUTRAL), (0.35, RAISE), (0.55, STRIKE), (1, NEUTRAL)])

# Scratch: rear up on the hind legs, front paws raking a vertical surface ahead.
REAR = 0.95
SH = HIP + nose_up(REAR) @ (HEAD("leg_front_left_1") - HIP)
def wall(k, z):
    return (SH.x + 0.085 - LEGS[k]["ball"].x, 0, z - LEGS[k]["ball"].z)
UP = {"pitch": REAR, "drop": -0.01, "flex": -0.05, "neck": -0.75, "head": -0.3, "tail_up": 0.75, "tail_curl": -0.15,
      "air": True, "feet": {"BL": (0.02, 0, 0), "BR": (0.02, 0, 0)}, "toe": {"FL": 0.0, "FR": 0.0}}
def scr(lz, rz):
    P = dict(UP)
    P["feet"] = dict(UP["feet"]); P["feet"].update({"FL": wall("FL", lz), "FR": wall("FR", rz)})
    return P
keyed("scratch", 1.0, [(0, NEUTRAL), (0.18, scr(0.29, 0.26)), (0.38, scr(0.24, 0.30)),
                       (0.58, scr(0.30, 0.24)), (0.78, scr(0.25, 0.29)), (1.0, NEUTRAL)])

# Nap: loaf — body down on folded legs, paws tucked, head low, tail round the side.
LOAF = {"drop": -0.085, "pitch": 0.03, "flex": 0.03, "neck": -0.2, "head": -0.12, "ears_back": 0.15,
        "tail_up": -0.12, "tail_yaw": 1.5, "tail_curl": 0.06,
        "feet": {"FL": (-0.02, 0.004, 0.012), "FR": (-0.02, -0.004, 0.012), "BL": (0.07, -0.004, 0), "BR": (0.07, 0.004, 0)},
        "curl": {"FL": 2.4, "FR": 2.4}, "toe": {"FL": -0.6, "FR": -0.6}}
LOAF2 = dict(LOAF); LOAF2["drop"] = -0.087; LOAF2["head"] = -0.15
keyed("sleep", 3.0, [(0, LOAF), (0.5, LOAF2), (1.0, LOAF)])

rig.animation_data.action = None
for b in pb:
    b.rotation_quaternion = Quaternion(); b.location = (0, 0, 0)
for tr in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(tr)
for name, (act, n) in CLIPS.items():
    tr = rig.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 0, act); tr.mute = True

L = mesh.dimensions.x
print("SPEEDS walk %.4f run %.4f per body-length/s (body %.3f m)" % (walk_speed / L, run_speed / L, L))

# ── region masks for runtime skins ──────────────────────────────────────────
# COLOR_0 per face: R = region id / 32, G = tabby stripe 0..1, B = patch noise 0..1.
# Ids are listed in src/player/catSkins.ts.
BACK, BELLY, CHEST, MUZZLE, FACE, HEADTOP, EAR, EARIN, EYE, NOSE, LEGUP, LEGLOW, PAW, TAIL_, TAILTIP = range(15)
me = mesh.data
for p in me.polygons:
    p.use_smooth = False
vg = {g.index: g.name for g in mesh.vertex_groups}
def dom(vi):
    gs = me.vertices[vi].groups
    return vg[max(gs, key=lambda g: g.weight).group] if gs else "body_1"

def noise(c):
    v = (math.sin(c.x * 41 + 1.3) * math.sin(c.y * 57 + 0.4) + math.sin(c.z * 47 + 2.1) * math.sin(c.x * 23 - c.z * 31)
         + 0.6 * math.sin(c.x * 83 + c.y * 61 + c.z * 29))
    return min(1, max(0, 0.5 + v / 4.4))

def classify(p):
    c, nrm = p.center, p.normal
    ds = [dom(v) for v in p.vertices]
    g = max(sorted(set(ds)), key=ds.count)  # sorted: deterministic ties
    ay = abs(c.y)
    if g.startswith("ear"):
        return EARIN if nrm.x > 0.5 else EAR, 0.0
    if g == "head":
        if nrm.x > 0.6 and 0.015 < ay < 0.036 and 0.206 < c.z < 0.228 and c.x > 0.252:
            return EYE, 0.0
        if c.x > 0.272 and ay < 0.012 and 0.192 < c.z < 0.214:
            return NOSE, 0.0
        if nrm.z < -0.5 or (c.x > 0.25 and c.z < 0.2):
            return MUZZLE, 0.0
        if c.x > 0.245 and nrm.x > 0.3:
            return FACE, 0.0
        st = 0.5 + 0.5 * math.sin(c.y * TAU / 0.022) if nrm.z > 0.3 else 0.5 + 0.5 * math.sin((c.x - c.z) * TAU / 0.03)
        return HEADTOP, st
    if (g in ("neck", "body_2") or g.startswith("leg_front") and g.endswith("_1")) and \
            c.x > 0.125 and 0.08 < c.z < 0.19 and nrm.x > 0.3 and nrm.z < 0.5:
        return CHEST, 0.0   # bib: front of the chest and shoulders
    if g.startswith("leg"):
        seg = int(g.split("_")[-1])
        st = 0.5 + 0.5 * math.sin(c.z * TAU / 0.038)
        if seg == 4 or c.z < 0.014: return PAW, 0.0
        if seg == 1 and c.z > 0.1: return LEGUP, st
        return LEGLOW, st
    if g.startswith("tail"):
        st = 0.5 + 0.5 * math.sin(c.x * TAU / 0.055)
        return (TAILTIP if g == "tail_4" else TAIL_), st
    # trunk
    if nrm.z < -0.45:
        return BELLY, 0.0
    if (g in ("neck", "body_2") and c.x > 0.12 and nrm.x > 0.15 and c.z < 0.185) or (g == "neck" and nrm.z < -0.2):
        return CHEST, 0.0
    up = max(0.0, nrm.z)
    st = 0.5 + 0.5 * math.sin((c.x + 0.4 * (c.z - 0.2) * (1 if c.y > 0 else -1) * 0) * TAU / 0.05 + up * 1.2)
    return BACK, st * (0.4 + 0.6 * min(1, (c.z - 0.1) / 0.08))

col = me.color_attributes.new("skin", 'FLOAT_COLOR', 'CORNER')
me.color_attributes.active_color = col
me.color_attributes.render_color_index = me.color_attributes.find("skin")
counts = {}
for p in me.polygons:
    rid, st = classify(p)
    counts[rid] = counts.get(rid, 0) + 1
    v = (rid / 32, min(1, max(0, st)), noise(p.center), 1.0)
    for li in p.loop_indices:
        col.data[li].color = v
print("REGIONS", sorted(counts.items()))

mat = bpy.data.materials.new("CatSkin")
mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
bsdf.inputs['Roughness'].default_value = 0.85
me.materials.clear()
me.materials.append(mat)

# ── preview renders ─────────────────────────────────────────────────────────
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.render.resolution_x, scn.render.resolution_y = 400, 300
    cd = bpy.data.cameras.new("pcam"); cd.type = 'ORTHO'; cd.ortho_scale = 0.75
    cam = bpy.data.objects.new("pcam", cd); scn.collection.objects.link(cam); scn.camera = cam
    cam.location = (-0.05, -3, 0.15); cam.rotation_euler = (math.radians(90), 0, 0)
    for name, (act, n) in CLIPS.items():
        rig.animation_data.action = act
        for i in range(6):
            scn.frame_set(round(i * n / 6))
            scn.render.filepath = f"{PREVIEW}/{name}_{i}.png"
            bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None
    bpy.data.objects.remove(cam)

# Face glTF +Z (Blender −Y), like the previous cat.
rig.rotation_euler = (0, 0, -math.pi / 2)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_def_bones=False,
    export_skins=True, export_yup=True, export_apply=False,
    export_vertex_color='ACTIVE', export_all_vertex_colors=False,
)
print("EXPORTED", OUT)
