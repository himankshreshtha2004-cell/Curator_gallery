"""THE CURATOR — the movable 'arc blade' sculpture for Gallery 01 (Blender, headless).
A crescent sliver of pale limestone balanced on a tapered stone fin, on a low sandstone disc.
Its arc is a segment of the etched circle's radius, so its sun shadow can draw that circle."""
import bpy, bmesh, json, math, os
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.join(HERE, '..', 'app')
L = json.load(open(os.path.join(APP, 'src/data/g01.layout.json'))); OUT = os.path.join(APP, 'public/assets/g01')
bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene
def B(x, y, z): return Vector((x, -z, y))
mats = {}
for n, c in (('M_Sandstone', (0.58, 0.48, 0.38)), ('M_Limestone', (0.70, 0.64, 0.56))):
    m = bpy.data.materials.new(n); m.diffuse_color = (*c, 1); mats[n] = m
TILE = {'M_Sandstone': 1.4, 'M_Limestone': 0.9}
def sweep(name, centre_fn, section_fn, rings, n, material):
    bm = bmesh.new(); grid = []
    for i in range(rings + 1):
        t = i / rings; c = centre_fn(t); grid.append([bm.verts.new(B(*(c[k] + section_fn(t, 2 * math.pi * j / n)[k] for k in range(3)))) for j in range(n)])
    for i in range(rings):
        for j in range(n): bm.faces.new([grid[i][j], grid[i][(j + 1) % n], grid[i + 1][(j + 1) % n], grid[i + 1][j]])
    for row in (grid[0], grid[-1]):
        cv = bm.verts.new(sum((v.co for v in row), Vector()) / n)
        for j in range(n): bm.faces.new([row[j], row[(j + 1) % n], cv])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); me.materials.append(mats[material])
    for p in me.polygons: p.use_smooth = True
    return ob
def box_uv(ob):
    me = ob.data
    while len(me.uv_layers): me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='uv0')
    for poly in me.polygons:
        n = poly.normal; ax = max(range(3), key=lambda i: abs(n[i])); tile = TILE[me.materials[poly.material_index].name]
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = (co.x, co.y) if ax == 2 else (co.y, co.z) if ax == 0 else (co.x, co.z)
            uv.data[li].uv = (u / tile, v / tile)
BL = L['puzzle']['blade']; R = L['puzzle']['circle']['radius']; span = math.radians(L['puzzle']['arcSpanDeg'])
h, aw = BL['armHeight'], BL['arcWidth']
# a low hewn sandstone block
bpy.ops.mesh.primitive_cube_add(size=1, location=B(0, 0.065, 0))
base = bpy.context.active_object; base.name = 'BladeBase'; base.scale = (0.3, 0.3, 0.13)
bpy.ops.object.transform_apply(scale=True)
base.data.materials.append(mats['M_Sandstone'])
bv = base.modifiers.new('b', 'BEVEL'); bv.width = 0.012; bv.segments = 3
bpy.ops.object.modifier_apply(modifier='b')
# tapered fin (elliptical section, wide at the foot, thin under the arc)
arc_low = h - 0.03
def fin_c(t): return (0, 0.12 + (arc_low + 0.012 - 0.12) * t, 0)
def fin_s(t, ph):
    wx = 0.026 * (1 - t) + 0.017 * t; wz = 0.026 * (1 - t) + 0.017 * t
    flare = 1 + 0.5 * max(0, 1 - t * 10) ** 2
    return (math.cos(ph) * wx * flare, 0, math.sin(ph) * wz * flare)
fin = sweep('BladeStem', fin_c, fin_s, 60, 32, 'M_Limestone')
# crescent sliver: radial width = the etched line width; height swells in the middle and thins at the tips
def arc_c(t):
    a = span * (t * 1.006 - 0.003); return (R * math.sin(a), h, R - R * math.cos(a))
def arc_s(t, ph):
    a = span * (t * 1.006 - 0.003); inward = (-math.sin(a), 0, math.cos(a))
    swell = (1 - t) ** 0.35 * min(1, t * 14 + 0.6) ** 0.5
    rr = (aw / 2) * (0.72 + 0.28 * swell); hh = 0.018 + 0.03 * swell
    cs, sn = math.cos(ph), math.sin(ph)
    r = rr * math.copysign(abs(cs) ** 0.55, cs); y = hh * math.copysign(abs(sn) ** 0.55, sn)
    return (inward[0] * r, y, inward[2] * r)
arc = sweep('BladeArc', arc_c, arc_s, 120, 36, 'M_Limestone')
for ob in (base, fin, arc): box_uv(ob)
for o in scene.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = arc
path = os.path.join(OUT, 'blade.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_yup=True)
print('exported', path, os.path.getsize(path))
