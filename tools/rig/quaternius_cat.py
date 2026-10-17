# Blender (headless): author the game's clip set on Quaternius' CC0 low-poly cat
# (Animal Pack Vol.2, Cat.blend) and export a skinned, animated GLB.
#
#   blender -b --factory-startup Cat.blend -P quaternius_cat.py -- <out.glb> [preview_dir]
#
# The pack ships only Idle + Walking; everything here is authored procedurally on
# its own rig (pelvis "Bone", spine "Bone.001", neck/head "Bone.002/003", tail
# "Bone.004–007", 2-bone IK legs driven by IKFront/Back Left/Right), baked to FK.
# Model space: +X forward, +Y = left, +Z up. Exported facing glTF +Z.
import bpy, sys, math, os
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None
scn = bpy.context.scene
FPS = scn.render.fps  # 24 in the source file

rig = bpy.data.objects["CatArmature"]
mesh = bpy.data.objects["Cat"]
pb = rig.pose.bones
bones = rig.data.bones
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
rig.animation_data_create()

# ── colours (the source materials carry no colour of their own) ──────────────
COLORS = {"Grey": (0.10, 0.105, 0.115), "White": (0.80, 0.80, 0.78), "Pink": (0.85, 0.42, 0.50)}
for m in mesh.data.materials:
    c = COLORS.get(m.name, (0.5, 0.5, 0.5))
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED') \
        if any(n.type == 'BSDF_PRINCIPLED' for n in m.node_tree.nodes) else None
    if bsdf is None:
        bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out = next(n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
        m.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Base Color'].default_value = (*c, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    m.diffuse_color = (*c, 1)

# ── helpers ─────────────────────────────────────────────────────────────────
PELVIS, SPINE, NECK, HEAD = "Bone", "Bone.001", "Bone.002", "Bone.003"
TAIL = ["Bone.004", "Bone.005", "Bone.006", "Bone.007"]
FEET = {"FL": "IKFrontLeft", "FR": "IKFrontRight", "BL": "IKBackLeft", "BR": "IKBackRight"}
REST = {n: bones[n].head_local.copy() for n in FEET.values()}
HIP = bones[PELVIS].head_local.copy()          # pelvis pivot
Y, Z = Vector((0, 1, 0)), Vector((0, 0, 1))

def local_q(name, axis, angle):
    """Rotation about an armature-space axis, expressed in the bone's rest frame."""
    R = bones[name].matrix_local.to_3x3()
    return Quaternion(R.inverted() @ axis, angle)

def pitch(name, a):   # + = nose / bone tip up (towards +Z when pointing +X)
    return local_q(name, Y, -a)

def yaw(name, a):     # + = towards the cat's left (+Y)
    return local_q(name, Z, a)

def key_rot(name, q):
    b = pb[name]
    b.rotation_quaternion = q
    b.keyframe_insert("rotation_quaternion")

def key_loc_world(name, d):
    """Root-level bone: armature-space offset from rest → local location."""
    b = pb[name]
    b.location = bones[name].matrix_local.to_3x3().inverted() @ Vector(d)
    b.keyframe_insert("location")

def rot_about_hip(p, a):
    """Where an armature-space point goes when the pelvis pitches by a (nose up +)."""
    v = Vector(p) - HIP
    q = Quaternion(Y, -a)
    return HIP + q @ v

def smooth(t): return t * t * (3 - 2 * t)

def pose(f, P):
    """Key one frame. P keys (all optional):
       drop, fwd (pelvis), pitch (body, nose up +), flex (spine), neck, head, head_yaw,
       tail (pitch, + = swept back), tail_yaw, feet {FL: (dx,dy,dz)} offsets from rest,
       feet_abs {FL: Vector} absolute armature-space targets."""
    scn.frame_set(f)
    g = lambda k, d=0.0: P.get(k, d)
    key_loc_world(PELVIS, (g("fwd"), 0, g("drop")))
    key_rot(PELVIS, pitch(PELVIS, g("pitch")))
    key_rot(SPINE, pitch(SPINE, g("flex")))
    key_rot(NECK, pitch(NECK, g("neck")) @ yaw(NECK, g("head_yaw") * 0.5))
    key_rot(HEAD, pitch(HEAD, g("head")) @ yaw(HEAD, g("head_yaw") * 0.5))
    for i, t in enumerate(TAIL):
        tp = g("tail") * (0.55 if i == 0 else 0.25) + g("tail_curl") * (i / 3)
        key_rot(t, pitch(t, tp) @ yaw(t, g("tail_yaw") * (0.4 + 0.3 * i)))
    for k, n in FEET.items():
        if k in P.get("feet_abs", {}):
            tgt = Vector(P["feet_abs"][k])
        else:
            tgt = REST[n] + Vector(P.get("feet", {}).get(k, (0, 0, 0)))
        tgt.z = max(tgt.z, REST[n].z)
        key_loc_world(n, tgt - REST[n])
        key_rot(n, Quaternion())

def lerp_pose(A, B, t):
    out = {}
    for k in set(A) | set(B):
        if k in ("feet", "feet_abs"):
            fa, fb = A.get(k, {}), B.get(k, {})
            out[k] = {}
            for fk in set(fa) | set(fb):
                if k == "feet_abs":
                    da = Vector(fa.get(fk, REST[FEET[fk]])); db = Vector(fb.get(fk, REST[FEET[fk]]))
                else:
                    da = Vector(fa.get(fk, (0, 0, 0))); db = Vector(fb.get(fk, (0, 0, 0)))
                out[k][fk] = da.lerp(db, t)
        else:
            out[k] = A.get(k, 0.0) * (1 - t) + B.get(k, 0.0) * t
    return out

CLIPS = {}
def new_clip(name):
    act = bpy.data.actions.new(name + "_ctrl")
    rig.animation_data.action = act
    for b in pb:
        b.location = (0, 0, 0); b.rotation_quaternion = Quaternion(); b.scale = (1, 1, 1)
    return act

def keyed(name, T, keys):
    """keys: [(t, pose)] with t in 0..1; smoothstep between keys."""
    act = new_clip(name)
    n = max(1, round(T * FPS))
    for f in range(n + 1):
        t = f / n
        for (ta, A), (tb, B) in zip(keys, keys[1:]):
            if ta <= t <= tb:
                pose(f, lerp_pose(A, B, smooth((t - ta) / max(1e-6, tb - ta))))
                break
    CLIPS[name] = (act, n)

def foot_cycle(p, duty, half, lift):
    """Stance: paw slides back from +half to −half. Swing: arcs forward."""
    p %= 1.0
    if p < duty:
        return (half * (1 - 2 * p / duty), 0.0)
    s = (p - duty) / (1 - duty)
    return (-half + 2 * half * smooth(s), lift * math.sin(math.pi * s))

def gait(name, T, duty, half, lift, phases, extra):
    act = new_clip(name)
    n = max(2, round(T * FPS))
    for f in range(n + 1):
        p = f / n
        P = extra(p)
        P["feet"] = {}
        for k, ph in phases.items():
            dx, dz = foot_cycle(p + ph, duty, half[k[0]], lift[k[0]])
            P["feet"][k] = (dx, 0, dz)
        pose(f, P)
    CLIPS[name] = (act, n)
    speed = (2 * half["B"] / duty) / T   # body advance per second, model units
    print("GAIT", name, "native speed %.3f units/s" % speed)
    return speed

TAU = 2 * math.pi
# ── locomotion ──────────────────────────────────────────────────────────────
WALK_T = 0.75
walk_speed = gait("walk", WALK_T, 0.62, {"F": 1.3, "B": 1.3}, {"F": 0.5, "B": 0.42},
     {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75},
     lambda p: {"drop": -0.06 + 0.05 * math.cos(2 * TAU * p), "pitch": 0.02 * math.sin(TAU * p),
                "neck": -0.04 * math.cos(2 * TAU * p), "head": 0.05,
                "tail": 0.25, "tail_yaw": 0.22 * math.sin(TAU * p), "tail_curl": 0.15})
RUN_T = 0.42
run_speed = gait("run", RUN_T, 0.32, {"F": 1.65, "B": 1.7}, {"F": 0.75, "B": 0.6},
     {"BL": 0.0, "BR": 0.1, "FL": 0.5, "FR": 0.6},
     lambda p: {"drop": -0.25 + 0.18 * math.cos(TAU * (p - 0.35)),
                "pitch": 0.10 * math.sin(TAU * (p - 0.1)),
                "flex": -0.16 * math.sin(TAU * p),
                "neck": 0.08 * math.sin(TAU * p) - 0.05, "head": 0.1,
                "tail": 0.95 + 0.12 * math.sin(TAU * p), "tail_curl": -0.1})

NEUTRAL = {"tail": 0.15, "tail_curl": 0.15}
IDLE_T = 3.0
act = new_clip("idle")
n = round(IDLE_T * FPS)
for f in range(n + 1):
    p = f / n
    look = 0.35 * math.sin(TAU * p) * smooth(min(1, abs(math.sin(TAU * p)) * 1.5))
    pose(f, {"drop": -0.02 * (1 - math.cos(3 * TAU * p)), "flex": 0.01 * math.sin(3 * TAU * p),
             "head_yaw": look, "head": 0.05 + 0.05 * math.sin(2 * TAU * p),
             "tail": 0.15, "tail_curl": 0.15 + 0.1 * math.sin(TAU * p),
             "tail_yaw": 0.3 * math.sin(TAU * p + 1.0)})
CLIPS["idle"] = (act, n)

# ── jump family ─────────────────────────────────────────────────────────────
CROUCH = {"drop": -0.55, "pitch": 0.08, "flex": 0.12, "neck": -0.1, "head": 0.15,
          "tail": 0.7, "feet": {"BL": (0.15, 0, 0), "BR": (0.15, 0, 0)}}
keyed("crouch", 0.2, [(0, NEUTRAL), (1, CROUCH)])
# Scrubbed by the game: 0 = take-off, 1 = touch-down (front paws first).
TAKEOFF = {"drop": 0.05, "pitch": 0.35, "flex": -0.1, "neck": -0.15, "head": -0.1, "tail": 0.9,
           "feet": {"FL": (0.6, 0, 0.9), "FR": (0.5, 0, 0.8), "BL": (-0.9, 0, 0.1), "BR": (-0.8, 0, 0.1)}}
STRETCH = {"drop": 0.0, "pitch": 0.08, "flex": -0.18, "neck": -0.1, "head": 0.0, "tail": 1.1,
           "feet": {"FL": (1.1, 0, 0.9), "FR": (1.0, 0, 0.8), "BL": (-1.1, 0, 0.6), "BR": (-1.0, 0, 0.55)}}
REACH = {"drop": 0.0, "pitch": -0.22, "flex": 0.12, "neck": 0.1, "head": 0.15, "tail": 1.2,
         "feet": {"FL": (0.7, 0, 0.0), "FR": (0.6, 0, 0.1), "BL": (0.5, 0, 0.9), "BR": (0.45, 0, 0.85)}}
keyed("jump", 1.0, [(0, CROUCH), (0.15, TAKEOFF), (0.5, STRETCH), (0.82, REACH), (1.0, REACH)])
LAND0 = {"drop": -0.45, "pitch": -0.18, "flex": 0.12, "neck": 0.1, "head": 0.1, "tail": 1.0,
         "feet": {"BL": (0.35, 0, 0.35), "BR": (0.3, 0, 0.3)}}
LAND1 = {"drop": -0.6, "pitch": -0.02, "flex": 0.1, "tail": 0.6}
keyed("land", 0.35, [(0, LAND0), (0.4, LAND1), (1, NEUTRAL)])

# ── actions ─────────────────────────────────────────────────────────────────
RAISE = {"pitch": 0.12, "drop": -0.1, "neck": -0.1, "head": 0.1, "tail": 0.4,
         "feet": {"FR": (0.5, -0.05, 1.5), "FL": (-0.1, 0, 0)}}
STRIKE = {"pitch": -0.05, "drop": -0.15, "neck": 0.1, "head": 0.15, "tail": 0.5,
          "feet": {"FR": (1.7, 0.15, 0.45), "FL": (-0.1, 0, 0)}}
keyed("swipe", 0.45, [(0, NEUTRAL), (0.35, RAISE), (0.55, STRIKE), (1, NEUTRAL)])

# Scratch: rear up on the hind legs, front paws raking a vertical surface ahead.
REAR = 0.85
def wall(side_y, z):
    sh = rot_about_hip(bones["Bone.014"].head_local, REAR)
    return Vector((sh.x + 1.25, side_y, z))
UP = {"pitch": REAR, "drop": -0.05, "neck": -0.55, "head": -0.25, "tail": -0.2, "tail_curl": 0.2,
      "feet": {"BL": (0.25, 0, 0), "BR": (0.25, 0, 0)}}
def scr(lz, rz):
    P = dict(UP); P["feet_abs"] = {"FL": wall(0.42, lz), "FR": wall(-0.42, rz)}; return P
keyed("scratch", 1.0, [(0, NEUTRAL), (0.18, scr(3.4, 3.0)), (0.38, scr(2.7, 3.5)),
                       (0.58, scr(3.5, 2.7)), (0.78, scr(2.8, 3.4)), (1.0, NEUTRAL)])

# Nap: loaf — body down on folded legs, head low, tail wrapped round the side.
LOAF = {"drop": -1.2, "pitch": 0.04, "flex": 0.05, "neck": -0.25, "head": -0.1,
        "tail": 1.9, "tail_yaw": 0.9, "tail_curl": 0.1,
        "feet": {"FL": (0.05, -0.08, 0), "FR": (0.05, 0.08, 0), "BL": (0.8, -0.1, 0), "BR": (0.8, 0.1, 0)}}
LOAF2 = dict(LOAF); LOAF2["drop"] = -1.23; LOAF2["head"] = -0.13
keyed("sleep", 3.0, [(0, LOAF), (0.5, LOAF2), (1.0, LOAF)])

# ── bake to FK on the deform bones, drop the IK rig ────────────────────────
deform = [b.name for b in bones if b.use_deform]
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='POSE')
baked = {}
for name, (act, n) in CLIPS.items():
    rig.animation_data.action = act
    bpy.ops.pose.select_all(action='DESELECT')
    for nm in deform:
        pb[nm].select = True
    bpy.ops.nla.bake(frame_start=0, frame_end=n, step=1, only_selected=True, visual_keying=True,
                     clear_constraints=False, use_current_action=False, bake_types={'POSE'})
    out = rig.animation_data.action
    out.name = name; out.use_fake_user = True
    baked[name] = out
for b in pb:
    for c in list(b.constraints):
        b.constraints.remove(c)
for act, _ in CLIPS.values():
    bpy.data.actions.remove(act)
rig.animation_data.action = None
for tr in list(rig.animation_data.nla_tracks):   # Blender's "[Action Stash]" leftovers
    rig.animation_data.nla_tracks.remove(tr)
for name, act in baked.items():
    tr = rig.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 0, act); tr.mute = True
bpy.ops.object.mode_set(mode='OBJECT')

# Native locomotion speeds (model units/s) → the game scales by model size.
L = mesh.dimensions.x
print("SPEEDS walk %.4f run %.4f per body-length/s (body %.3f units)" % (walk_speed / L, run_speed / L, L))

# ── preview renders ─────────────────────────────────────────────────────────
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.render.resolution_x, scn.render.resolution_y = 480, 360
    cd = bpy.data.cameras.new("pcam"); cd.type = 'ORTHO'; cd.ortho_scale = 9
    cam = bpy.data.objects.new("pcam", cd); scn.collection.objects.link(cam); scn.camera = cam
    cam.location = (0.3, -20, 2.4); cam.rotation_euler = (math.radians(90), 0, 0)
    for name, act in baked.items():
        rig.animation_data.action = act
        n = CLIPS[name][1]
        for i, f in enumerate([0, n // 4, n // 2, (3 * n) // 4]):
            scn.frame_set(f)
            scn.render.filepath = f"{PREVIEW}/{name}_{i}.png"
            bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None

# Face glTF +Z (Blender −Y), like the previous cat.
rig.rotation_euler = (0, 0, -math.pi / 2)
for o in list(scn.objects):
    if o not in (rig, mesh):
        bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_def_bones=True,
    export_skins=True, export_yup=True, export_apply=False,
)
print("EXPORTED", OUT)
