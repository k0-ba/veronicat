# Blender: import the Meshy cat, report bounds, render orthographic side/top/front views.
import bpy, sys, mathutils
argv = sys.argv[sys.argv.index("--") + 1:]
src, outdir = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.context.view_layer.update()
ws = [mesh.matrix_world @ mathutils.Vector(c) for c in mesh.bound_box]
mn = mathutils.Vector((min(v.x for v in ws), min(v.y for v in ws), min(v.z for v in ws)))
mx = mathutils.Vector((max(v.x for v in ws), max(v.y for v in ws), max(v.z for v in ws)))
print("BBOX", tuple(round(x,3) for x in mn), tuple(round(x,3) for x in mx), "verts", len(mesh.data.vertices))
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'
scn.display.shading.light = 'STUDIO'
scn.display.shading.color_type = 'TEXTURE'
scn.render.resolution_x = 900; scn.render.resolution_y = 700
cam_data = bpy.data.cameras.new("cam"); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.4
cam = bpy.data.objects.new("cam", cam_data); scn.collection.objects.link(cam); scn.camera = cam
c = (mn + mx) / 2
views = {"side": ((5,0,0),(90,0,90)), "top": ((0,0,5),(0,0,0)), "front": ((0,-5,0),(90,0,0)), "back": ((0,5,0),(90,0,180))}
import math
for name,(off,rot) in views.items():
    cam.location = c + mathutils.Vector(off)
    cam.rotation_euler = [math.radians(r) for r in rot]
    scn.render.filepath = f"{outdir}/{name}.png"
    bpy.ops.render.render(write_still=True)
