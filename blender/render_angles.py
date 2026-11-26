import os, math, bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.environ['BLEND'], load_ui=False, use_scripts=False)
sc = bpy.context.scene
OUT = os.environ['OUT']
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('SAMPLES', 40)); sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 900
cam = sc.camera
for c in list(cam.constraints): cam.constraints.remove(c)
tgt = bpy.data.objects.new('ShotTarget', None); sc.collection.objects.link(tgt)
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
# keep the lights on the player whichever side the camera is on
rig = bpy.data.objects.new('LightRig', None); sc.collection.objects.link(rig)
for l in [o for o in bpy.data.objects if o.type == 'LIGHT']:
    for c in list(l.constraints): l.constraints.remove(c)
    l.parent = rig
    lc = l.constraints.new('TRACK_TO'); lc.target = tgt; lc.track_axis = 'TRACK_NEGATIVE_Z'; lc.up_axis = 'UP_Y'
bd = bpy.data.objects.get('Backdrop')
if bd: bd.hide_render = True
bpy.ops.mesh.primitive_circle_add(vertices=96, radius=7, fill_type='NGON', location=(0, 0, 0))
fl = bpy.context.active_object
fm = bpy.data.materials.new('StudioFloor'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.11, 0.115, 0.125, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
fl.data.materials.append(fm)
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.17, 0.185, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.5
shots = [
    ('01_front', 0, 4.6, 1.0, 0.95, 62),
    ('02_three_quarter', 35, 4.6, 1.1, 0.95, 62),
    ('03_side', 90, 4.6, 1.0, 0.95, 62),
    ('04_back', 180, 4.6, 1.0, 0.95, 62),
    ('05_back_three_quarter', 215, 4.6, 1.2, 0.95, 62),
    ('06_helmet', 25, 1.1, 1.85, 1.72, 70),
    ('07_glove_sleeve', 25, 1.25, 1.2, 0.95, 60),
    ('08_skates', 30, 1.3, 0.45, 0.15, 60),
]
only = os.environ.get('ONLY')
for name, ang, dist, h, th, lens in shots:
    if only and name not in only.split(','): continue
    a = math.radians(ang)
    cam.location = (dist * math.sin(a), -dist * math.cos(a), h)
    tgt.location = (0.33, -0.19, th) if name == '07_glove_sleeve' else (0, 0, th)
    if name == '07_glove_sleeve': cam.location = (0.33 + dist * math.sin(a), -0.19 - dist * math.cos(a), h)
    cam.data.lens = lens
    rig.rotation_euler = (0, 0, a)
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('DONE', name)
