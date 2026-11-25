"""
Builds a hockey player for the uniform builder, using only Blender's own Python.

  blender --background --python blender/build_player.py           (Blender app)
  python blender/build_player.py                                  (the `bpy` module)

Writes to blender/out/:
  hockey_player.blend   the scene, to open and edit in Blender
  hockey_player.glb     the model for the website (glTF 2.0)
  render_white.png      plain white, as delivered to the website
  render_kit.png        a colour preview to check the shapes

Every part is its own object, named to match the brief, plain white, with UVs laid
out the way the website paints them:
  around the body (u): 0.25 = front centre, 0.75 = back centre, seam at the sides
  along the part (v):  0 = hem, cuff or bottom, 1 = top
Units are metres, Z is up, the player faces -Y (front view looks along +Y).
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
TAU = math.tau

# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
col = bpy.data.collections.new('HockeyPlayer')
scene.collection.children.link(col)


def link(obj):
    col.objects.link(obj)
    return obj


# ------------------------------------------------------------------ helpers
def skin_part(name, verts, edges, radii, subdiv=2):
    """A smooth tube body from a skeleton (Skin modifier), applied to a real mesh."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector(v) for v in verts], edges, [])
    obj = link(bpy.data.objects.new(name, me))
    mod = obj.modifiers.new('skin', 'SKIN')
    mod.use_smooth_shade = True
    sv = me.skin_vertices[0].data
    for i, r in enumerate(radii):
        sv[i].radius = r if isinstance(r, (tuple, list)) else (r, r)
    sv[0].use_root = True
    sub = obj.modifiers.new('subd', 'SUBSURF')
    sub.levels = subdiv
    sub.render_levels = subdiv
    apply_all(obj)
    return obj


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def cut(obj, keep):
    """Delete the vertices where keep(co) is False, leaving open edges (hems, cuffs)."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS')
    bm.to_mesh(obj.data); bm.free()


def thicken(obj, t):
    m = obj.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = t
    m.offset = 1.0
    m.use_even_offset = True
    m.use_quality_normals = True


def wrinkles(obj, strength, size, seed):
    tex = bpy.data.textures.new(obj.name + '_folds', 'CLOUDS')
    tex.noise_scale = size
    tex.noise_depth = 2
    m = obj.modifiers.new('folds', 'DISPLACE')
    m.texture = tex
    m.strength = strength
    m.mid_level = 0.5
    m.texture_coords = 'GLOBAL'
    obj.location.x += 0  # keep transform clean
    return m


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def uv_cylinder(obj, centre_fn, axis_fn=None, v_range=None):
    """Wrap UVs around the part: u from the angle around it, v along it."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    vals = [axis_fn(v.co) if axis_fn else v.co.z for v in bm.verts]
    lo, hi = v_range or (min(vals), max(vals))
    for f in bm.faces:
        us = []
        for l in f.loops:
            co = l.vert.co
            c = centre_fn(co)
            u = (math.atan2(-(co.y - c[1]), co.x - c[0]) / TAU) % 1.0
            vv = ((axis_fn(co) if axis_fn else co.z) - lo) / max(hi - lo, 1e-6)
            us.append([u, vv])
        if max(p[0] for p in us) - min(p[0] for p in us) > 0.5:   # face crossing the side seam
            for p in us:
                if p[0] < 0.5:
                    p[0] += 1.0
        for l, p in zip(f.loops, us):
            l[uv].uv = p
    bm.to_mesh(me); bm.free()


def uv_box(obj):
    """Simple planar UVs for the hard parts (no stripes go on them)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    xs = [v.co.x for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x - min(xs)) / max(max(xs) - min(xs), 1e-6), (l.vert.co.z - min(zs)) / max(max(zs) - min(zs), 1e-6))
    bm.to_mesh(me); bm.free()


def material(name, color, rough=0.8, sheen=0.0, coat=0.0, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if 'Sheen Weight' in b.inputs:
        b.inputs['Sheen Weight'].default_value = sheen
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'BLENDED'
    return m


def set_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def box(name, size, loc, bevel=0.02, segs=3):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me))
    obj.location = loc
    if bevel:
        b = obj.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = segs
        s = obj.modifiers.new('subd', 'SUBSURF'); s.levels = 1; s.render_levels = 1
        apply_all(obj)
    smooth(obj)
    return obj


def tube(name, a, b, r, verts=24):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    obj = bpy.context.active_object
    obj.name = name; obj.data.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    for c in obj.users_collection:
        c.objects.unlink(obj)
    link(obj)
    smooth(obj)
    return obj


def bake_transform(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


# ------------------------------------------------------------------ pose (metres)
# Standing, knees soft, holding the stick across the body like the mock-up photo.
SH = 0.215                        # shoulder half-width
ARM = lambda s: [(s * SH, 0.00, 1.46), (s * 0.29, -0.04, 1.20), (s * 0.24, -0.27, 1.03)]
LEG = lambda s: [(s * 0.105, 0.00, 0.93), (s * 0.125, -0.04, 0.53), (s * 0.12, 0.00, 0.17)]
WHITE = material('Fabric_White', (0.92, 0.92, 0.92), rough=0.8, sheen=0.15)
PAD = material('Gear_White', (0.9, 0.9, 0.9), rough=0.45, coat=0.3)

# ------------------------------------------------------------------ mannequin (head and neck)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, 0.005, 1.70))
head = bpy.context.active_object
head.name = 'mannequin'; head.scale = (0.092, 0.105, 0.122)
for c in head.users_collection: c.objects.unlink(head)
link(head); bake_transform(head); smooth(head)
neck = tube('neck', (0, 0.01, 1.50), (0, 0.01, 1.62), 0.058)
bpy.ops.object.select_all(action='DESELECT')
head.select_set(True); neck.select_set(True); bpy.context.view_layer.objects.active = head
bpy.ops.object.join()
set_mat(head, material('Mannequin', (0.62, 0.63, 0.65), rough=0.5))

# ------------------------------------------------------------------ jersey body
jb = skin_part('jersey_body',
               [(0, 0, 0.78), (0, 0, 0.98), (0, 0, 1.18), (0, 0, 1.38), (0, 0, 1.50), (0, 0.005, 1.56)],
               [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)],
               [(0.30, 0.19), (0.27, 0.165), (0.255, 0.15), (0.26, 0.14), (0.17, 0.11), (0.075, 0.068)], subdiv=3)
cut(jb, lambda co: 0.79 < co.z < 1.545)
wrinkles(jb, 0.006, 0.07, 1)
thicken(jb, 0.006)
apply_all(jb)
smooth(jb)
uv_cylinder(jb, lambda co: (0, 0))
set_mat(jb, WHITE)

# ------------------------------------------------------------------ collar (a band around the neck opening)
collar = link(bpy.data.objects.new('collar', bpy.data.meshes.new('collar')))
bm = bmesh.new()
rings = []
for k, (z, rx, ry, dy) in enumerate([(1.505, 0.112, 0.090, 0.0), (1.53, 0.096, 0.080, 0.0), (1.55, 0.082, 0.072, 0.004)]):
    rings.append([bm.verts.new((rx * math.cos(t), dy + ry * math.sin(t), z - (0.02 if math.sin(t) < 0 else 0) * (1 - k / 2)))
                  for t in [i / 48 * TAU for i in range(48)]])
for a, b in zip(rings, rings[1:]):
    for i in range(48):
        bm.faces.new((a[i], a[(i + 1) % 48], b[(i + 1) % 48], b[i]))
bm.to_mesh(collar.data); bm.free()
thicken(collar, 0.006); apply_all(collar); smooth(collar)
uv_cylinder(collar, lambda co: (0, 0))
set_mat(collar, WHITE)

# ------------------------------------------------------------------ sleeves
for side, name in ((1, 'sleeve_left'), (-1, 'sleeve_right')):
    a = ARM(side)
    s = skin_part(name, [(side * 0.12, 0, 1.43)] + a, [(0, 1), (1, 2), (2, 3)],
                  [0.09, 0.088, 0.078, 0.066], subdiv=3)
    wrist = Vector(a[2])
    axis = (Vector(a[2]) - Vector(a[0])).normalized()
    cut(s, lambda co, w=wrist, ax=axis: (co - w).dot(ax) < -0.035 and abs(co.x) > 0.17)
    wrinkles(s, 0.005, 0.05, 2)
    thicken(s, 0.005); apply_all(s); smooth(s)
    shoulder, elbow, wr = (Vector(p) for p in a)

    def centre(co, sh=shoulder, el=elbow, w=wr):
        # nearest point on the arm's two bones
        best = None
        for p, q in ((sh, el), (el, w)):
            t = max(0, min(1, (co - p).dot(q - p) / (q - p).length_squared))
            c = p + (q - p) * t
            if best is None or (co - c).length < (co - best).length:
                best = c
        return best

    def along(co, sh=shoulder, el=elbow, w=wr):
        l1 = (el - sh).length
        c = centre(co)
        if (c - sh).length <= l1 + 1e-6 and (c - el).length > 1e-4 and (c - sh).dot(el - sh) >= 0 and (c - sh).length <= l1:
            d = (c - sh).length
        else:
            d = l1 + (c - el).length
        return -(d)                     # v = 0 at the cuff, 1 at the shoulder
    uv_cylinder(s, centre, along)
    set_mat(s, WHITE)

# ------------------------------------------------------------------ pants (breezers)
pants = skin_part('pants_shell',
                  [(0, 0, 1.0), (0, 0, 0.90), (0.125, -0.005, 0.82), (0.135, -0.03, 0.62), (-0.125, -0.005, 0.82), (-0.135, -0.03, 0.62)],
                  [(0, 1), (1, 2), (2, 3), (1, 4), (4, 5)],
                  [(0.215, 0.145), (0.235, 0.16), 0.145, 0.138, 0.145, 0.138], subdiv=3)
cut(pants, lambda co: co.z < 0.99 and co.z > 0.585)
wrinkles(pants, 0.008, 0.07, 3)
thicken(pants, 0.008); apply_all(pants); smooth(pants)
uv_cylinder(pants, lambda co: (math.copysign(0.13, co.x) if co.z < 0.86 else 0, -0.015))
set_mat(pants, PAD)
belt = skin_part('pants_belt', [(0, 0, 1.0), (0, 0, 0.965)], [(0, 1)], [(0.218, 0.148), (0.218, 0.148)], subdiv=2)
cut(belt, lambda co: 0.96 < co.z < 1.005)
thicken(belt, 0.01); apply_all(belt); smooth(belt)
uv_cylinder(belt, lambda co: (0, 0))
set_mat(belt, PAD)

# ------------------------------------------------------------------ socks (over shin pads)
for side, name in ((1, 'sock_left'), (-1, 'sock_right')):
    hip, knee, ankle = LEG(side)
    s = skin_part(name, [(knee[0], knee[1], 0.72), knee, ((knee[0] + ankle[0]) / 2, -0.035, 0.36), ankle], [(0, 1), (1, 2), (2, 3)], [0.105, 0.095, (0.085, 0.10), 0.06], subdiv=3)
    cut(s, lambda co: 0.15 < co.z < 0.70)
    wrinkles(s, 0.006, 0.05, 4)
    apply_all(s); smooth(s)
    uv_cylinder(s, lambda co, k=knee, a=ankle: (k[0] + (a[0] - k[0]) * (k[2] - co.z) / (k[2] - a[2]), -0.02))
    set_mat(s, WHITE)

# ------------------------------------------------------------------ skates
for side, sfx in ((1, 'left'), (-1, 'right')):
    x = LEG(side)[2][0]
    boot = box(f'skate_boot_{sfx}', (0.105, 0.27, 0.16), (x, -0.04, 0.135), bevel=0.035)
    toe = box(f'skate_toe_cap_{sfx}', (0.1, 0.09, 0.06), (x, -0.155, 0.08), bevel=0.025)
    tongue = box(f'skate_tongue_{sfx}', (0.07, 0.035, 0.12), (x, -0.095, 0.215), bevel=0.015)
    tongue.rotation_euler.x = 0.28
    holder = box(f'skate_holder_{sfx}', (0.035, 0.30, 0.045), (x, -0.04, 0.035), bevel=0.008)
    blade = box(f'skate_blade_{sfx}', (0.006, 0.31, 0.022), (x, -0.04, 0.008), bevel=0.003)
    for o, m in ((boot, material('Skate', (0.08, 0.08, 0.09), 0.35, coat=0.6)), (toe, PAD), (tongue, material('Skate', (0.08, 0.08, 0.09))),
                 (holder, PAD), (blade, material('Steel', (0.8, 0.82, 0.85), 0.2, metal=1.0))):
        set_mat(o, m); uv_box(o)

# ------------------------------------------------------------------ gloves
for side, sfx in ((1, 'left'), (-1, 'right')):
    a = ARM(side)
    w = Vector(a[2]); fwd = (Vector(a[2]) - Vector(a[1])).normalized()
    cuff = tube(f'glove_cuff_{sfx}', w - fwd * 0.07, w + fwd * 0.07, 0.078, 32)
    roll = tube(f'glove_cuff_roll_{sfx}', w - fwd * 0.075, w - fwd * 0.055, 0.084, 32)
    back = box(f'glove_back_{sfx}', (0.105, 0.10, 0.12), w + fwd * 0.12 + Vector((0, 0, -0.01)), bevel=0.03)
    back.rotation_euler = (0.9, 0, 0)
    fingers = box(f'glove_fingers_{sfx}', (0.1, 0.07, 0.09), w + fwd * 0.17 + Vector((0, -0.02, -0.07)), bevel=0.028)
    fingers.rotation_euler = (0.4, 0, 0)
    thumb = box(f'glove_thumb_{sfx}', (0.035, 0.05, 0.08), w + fwd * 0.12 + Vector((-side * 0.06, -0.01, -0.02)), bevel=0.015)
    palm = box(f'glove_palm_{sfx}', (0.095, 0.04, 0.1), w + fwd * 0.13 + Vector((0, 0.04, -0.03)), bevel=0.015)
    for o in (cuff, roll, back, fingers, thumb, palm):
        set_mat(o, PAD); uv_box(o)
    set_mat(palm, material('Palm', (0.86, 0.83, 0.76), 0.8))

# ------------------------------------------------------------------ helmet
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, 0.01, 1.715))
hs = bpy.context.active_object
hs.name = 'helmet_shell'; hs.scale = (0.112, 0.13, 0.13)
for c in hs.users_collection: c.objects.unlink(hs)
link(hs); bake_transform(hs)
cut(hs, lambda co: co.z > 1.705 - 0.06 * max(0, co.y + 0.02) * 10 or (co.y > 0.04 and co.z > 1.64))
thicken(hs, 0.008); apply_all(hs); smooth(hs)
set_mat(hs, PAD); uv_box(hs)
for side, sfx in ((1, 'left'), (-1, 'right')):
    ear = box(f'helmet_ear_guard_{sfx}', (0.03, 0.075, 0.07), (side * 0.105, 0.005, 1.655), bevel=0.012)
    set_mat(ear, PAD); uv_box(ear)
strap = tube('helmet_chin_strap', (-0.095, 0.0, 1.62), (0.095, 0.0, 1.62), 0.006, 12)
set_mat(strap, PAD)
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=0.065, location=(0, 0.0, 1.665), end_fill_type='NOTHING')
visor = bpy.context.active_object
visor.name = 'visor'; visor.scale = (0.118, 0.135, 1)
for c in visor.users_collection: c.objects.unlink(visor)
link(visor); bake_transform(visor)
cut(visor, lambda co: co.y < -0.06)
smooth(visor)
set_mat(visor, material('Visor', (0.85, 0.9, 1.0), 0.05, alpha=0.25)); uv_box(visor)

# ------------------------------------------------------------------ stick (held across the body)
hl, hr = Vector(ARM(-1)[2]) + Vector((0, -0.13, -0.08)), Vector(ARM(1)[2]) + Vector((0, -0.13, -0.08))
d = (hr - hl).normalized()
butt, heel = hl - d * 0.1, hr + d * 0.62 + Vector((0, 0, -0.12))
shaft = tube('stick_shaft', butt, heel, 0.014, 16)
knob = tube('stick_tape_knob', butt, butt + (heel - butt).normalized() * 0.12, 0.016, 16)
bdir = (heel - butt).normalized()
blade = box('stick_blade', (0.29, 0.012, 0.075), heel + Vector((0.14, 0, 0.0)), bevel=0.005)
blade.rotation_euler = (0, -math.atan2(bdir.z, bdir.x) * 0.6, 0)
tape = box('stick_tape_blade', (0.2, 0.014, 0.065), heel + Vector((0.17, 0, 0.0)), bevel=0.004)
tape.rotation_euler = blade.rotation_euler
STICK = material('Stick', (0.05, 0.05, 0.055), 0.3, coat=0.7)
TAPE = material('Tape', (0.93, 0.93, 0.9), 0.9)
for o, m in ((shaft, STICK), (knob, TAPE), (blade, STICK), (tape, TAPE)):
    set_mat(o, m); uv_box(o)

for o in col.objects:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)

# ------------------------------------------------------------------ studio: floor, lights, camera
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
floor = bpy.context.active_object; floor.name = 'Floor'
fm = material('Floor', (0.012, 0.013, 0.015), 0.35)
set_mat(floor, fm)
floor.is_shadow_catcher = False

def light(name, kind, loc, energy, size, rot=None, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == 'AREA': ld.size = size
    lo = bpy.data.objects.new(name, ld); lo.location = loc
    scene.collection.objects.link(lo)
    c = lo.constraints.new('TRACK_TO'); c.target = head; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return lo

light('Key', 'AREA', (-2.0, -3.0, 3.2), 700, 2.5)
light('Fill', 'AREA', (2.6, -2.2, 1.6), 260, 3.0)
light('Rim', 'AREA', (0.8, 2.8, 2.8), 600, 1.5, color=(0.85, 0.9, 1.0))
world = bpy.data.worlds.new('World'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.055, 0.06, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6

cam_d = bpy.data.cameras.new('Camera'); cam_d.lens = 70
cam = bpy.data.objects.new('Camera', cam_d); scene.collection.objects.link(cam)
cam.location = (1.0, -4.6, 1.15)
tgt = bpy.data.objects.new('CamTarget', None); tgt.location = (0.12, 0, 0.93); scene.collection.objects.link(tgt)
c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
scene.camera = cam

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = int(os.environ.get('SAMPLES', 48))
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 900, 1100
scene.view_settings.view_transform = 'AgX'

# ------------------------------------------------------------------ save, export, render
blend = os.path.join(OUT, 'hockey_player.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)

bpy.ops.object.select_all(action='DESELECT')
for o in col.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'hockey_player.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)

if os.environ.get('RENDER', '1') == '1':
    scene.render.filepath = os.path.join(OUT, 'render_white.png')
    bpy.ops.render.render(write_still=True)
    # colour preview: a dark home kit, to check that the parts read clearly
    KIT = {'jersey_body': (0.02, 0.02, 0.02), 'sleeve_left': (0.02, 0.02, 0.02), 'sleeve_right': (0.02, 0.02, 0.02), 'collar': (0.9, 0.62, 0.03),
           'pants_shell': (0.02, 0.02, 0.02), 'pants_belt': (0.02, 0.02, 0.02), 'sock_left': (0.02, 0.02, 0.02), 'sock_right': (0.02, 0.02, 0.02),
           'helmet_shell': (0.02, 0.02, 0.02)}
    for o in col.objects:
        base = o.name.rsplit('_', 1)[0] if o.name.startswith(('glove', 'skate')) else o.name
        c = KIT.get(o.name) or ((0.9, 0.62, 0.03) if base in ('glove_cuff', 'glove_cuff_roll') else (0.03, 0.03, 0.03) if base.startswith('glove') else None)
        if c and o.data.materials:
            m = o.data.materials[0].copy(); m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1)
            o.data.materials[0] = m
    scene.render.filepath = os.path.join(OUT, 'render_kit.png')
    bpy.ops.render.render(write_still=True)

print('PARTS', sorted(o.name for o in col.objects))
print('TRIS', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.objects))
