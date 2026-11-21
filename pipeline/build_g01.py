"""THE CURATOR — Gallery 01 asset pipeline (Blender, headless via the bpy module).

Builds the gallery architecture and its static sculptures from app/src/data/g01.layout.json,
bakes physically based daylight (sky + sun, direct + bounced) into a lightmap with Cycles,
renders an HDR light probe for the movable sculptures, and exports GLB files for the game.

Coordinates in this file are GAME coordinates (metres, Y up). They are converted to
Blender's Z-up space on creation, and glTF export converts them back.

usage: python3 build_g01.py [--lm 2048] [--samples 256] [--probe-samples 96] [--skip-bake]
"""
import bpy, bmesh, json, math, os, sys, time
import numpy as np
from mathutils import Vector

ARGS = sys.argv[1:]
def arg(name, default):
    return type(default)(ARGS[ARGS.index(name) + 1]) if name in ARGS else default
LM = arg('--lm', 2048); SAMPLES = arg('--samples', 256); PROBE_SAMPLES = arg('--probe-samples', 96)
SKIP_BAKE = '--skip-bake' in ARGS; REF_RENDER = '--ref' in ARGS; REF_SPP = arg('--ref-spp', 128); REF_W = arg('--ref-w', 1280)

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..', 'app')
L = json.load(open(os.path.join(APP, 'src/data/g01.layout.json')))
OUT = os.path.join(APP, 'public/assets/g01'); os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def B(x, y, z): return Vector((x, -z, y))           # game (x, y-up, z) -> blender (x, y, z-up)

# ---------------------------------------------------------------- materials
def srgb(h): c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
MATS = {  # name: (albedo hex ≈ texture average, roughness, box-projection tile size in metres)
    'M_Plaster':    ('#D8CFC2', 0.9, 2.6),
    'M_Ceiling':    ('#D3CABC', 0.95, 2.6),
    'M_Shaft':      ('#E6E0D6', 0.95, 2.0),
    'M_Concrete':   ('#BDB6AD', 0.45, 3.2),
    'M_Travertine': ('#D2C6B4', 0.75, 1.1),
    'M_Limestone':  ('#D9D0C2', 0.8, 0.9),
    'M_Sandstone':  ('#C7B8A5', 0.85, 1.4),
    'M_Canvas':     ('#E3D9C8', 0.95, 1.6),
    'M_Frame':      ('#EEEAE3', 0.7, 1.6),
    'M_StoneWarm':  ('#A88A6C', 0.85, 0.5),
}
mat = {}
for name, (hexc, rough, _) in MATS.items():
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*srgb(hexc), 1)
    p.inputs['Roughness'].default_value = rough
    mat[name] = m

# ---------------------------------------------------------------- geometry helpers
made = []
def from_bmesh(name, bm, material):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    me.materials.append(mat[material]); made.append(ob); return ob

def box(name, x0, x1, y0, y1, z0, z1, material):
    bm = bmesh.new()
    v = [bm.verts.new(B(x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    idx = lambda i, j, k: v[i * 4 + j * 2 + k]
    faces = [((0,0,0),(0,0,1),(0,1,1),(0,1,0)), ((1,0,0),(1,1,0),(1,1,1),(1,0,1)),
             ((0,0,0),(1,0,0),(1,0,1),(0,0,1)), ((0,1,0),(0,1,1),(1,1,1),(1,1,0)),
             ((0,0,0),(0,1,0),(1,1,0),(1,0,0)), ((0,0,1),(1,0,1),(1,1,1),(0,1,1))]
    for f in faces: bm.faces.new([idx(*c) for c in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, material)

def bevel(ob, width=0.006, segments=2):
    mod = ob.modifiers.new('bevel', 'BEVEL'); mod.width = width; mod.segments = segments; mod.limit_method = 'ANGLE'
    return ob

def sweep(name, centre_fn, section_fn, rings, n, material, caps=True):
    """centre_fn(t)->(x,y,z) game coords; section_fn(t, phi)->(dx,dy,dz) offset in game coords."""
    bm = bmesh.new(); grid = []
    for i in range(rings + 1):
        t = i / rings; c = centre_fn(t); row = []
        for j in range(n):
            d = section_fn(t, 2 * math.pi * j / n)
            row.append(bm.verts.new(B(c[0] + d[0], c[1] + d[1], c[2] + d[2])))
        grid.append(row)
    for i in range(rings):
        for j in range(n):
            bm.faces.new([grid[i][j], grid[i][(j + 1) % n], grid[i + 1][(j + 1) % n], grid[i + 1][j]])
    if caps:
        for row in (grid[0], grid[-1]):
            c = sum((v.co for v in row), Vector()) / n; cv = bm.verts.new(c)
            for j in range(n): bm.faces.new([row[j], row[(j + 1) % n], cv])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, material)
    for poly in ob.data.polygons: poly.use_smooth = True
    return ob

R = L['room']; X0, X1, Z0, Z1, H, W, SLAB = R['x0'], R['x1'], R['z0'], R['z1'], R['height'], R['wall'], R['slab']
TOP = H + SLAB
D = L['door']; dx0, dx1 = D['x'] - D['width'] / 2, D['x'] + D['width'] / 2; DH = D['height']
VD = D['vestibuleDepth']; vz1 = Z0 - W; vz0 = vz1 - VD; VX = 1.6; VH = 3.4

# ---------------------------------------------------------------- architecture
box('Floor', X0 - W, X1 + W, -0.25, 0, Z0 - W, Z1 + W, 'M_Concrete')
box('WallL', X0 - W, X0, 0, TOP, Z0 - W, Z1 + W, 'M_Plaster')
box('WallR', X1, X1 + W, 0, TOP, Z0 - W, Z1 + W, 'M_Plaster')
box('WallFront', X0, X1, 0, TOP, Z1, Z1 + W, 'M_Plaster')
box('WallBackL', X0, dx0, 0, TOP, Z0 - W, Z0, 'M_Plaster')
box('WallBackR', dx1, X1, 0, TOP, Z0 - W, Z0, 'M_Plaster')
box('WallBackTop', dx0, dx1, DH, TOP, Z0 - W, Z0, 'M_Plaster')
SK = L['skylights']; sx0, sx1 = SK[0]['x0'], SK[0]['x1']
box('CeilL', X0, sx0, H, TOP, Z0, Z1, 'M_Ceiling')
box('CeilR', sx1, X1, H, TOP, Z0, Z1, 'M_Ceiling')
edges = sorted([(s['z0'], s['z1']) for s in SK])
cur = Z0
for i, (a, b) in enumerate(edges):
    box(f'CeilMid{i}', sx0, sx1, H, TOP, cur, a, 'M_Ceiling'); cur = b
box('CeilMidLast', sx0, sx1, H, TOP, cur, Z1, 'M_Ceiling')
SD, SW = L['shaft']['depth'], L['shaft']['wall']
for i, s in enumerate(SK):
    y0, y1 = TOP, TOP + SD
    box(f'Shaft{i}L', s['x0'] - SW, s['x0'], y0, y1, s['z0'] - SW, s['z1'] + SW, 'M_Shaft')
    box(f'Shaft{i}R', s['x1'], s['x1'] + SW, y0, y1, s['z0'] - SW, s['z1'] + SW, 'M_Shaft')
    box(f'Shaft{i}B', s['x0'], s['x1'], y0, y1, s['z0'] - SW, s['z0'], 'M_Shaft')
    box(f'Shaft{i}F', s['x0'], s['x1'], y0, y1, s['z1'], s['z1'] + SW, 'M_Shaft')
# vestibule beyond the hidden door: its own small skylight spills warm light when the door opens
box('VestFloor', -VX - W, VX + W, -0.25, 0, vz0 - W, vz1, 'M_Concrete')
box('VestWallL', -VX - W, -VX, 0, VH + SLAB, vz0 - W, vz1, 'M_Plaster')
box('VestWallR', VX, VX + W, 0, VH + SLAB, vz0 - W, vz1, 'M_Plaster')
box('VestWallBack', -VX, VX, 0, VH + SLAB, vz0 - W, vz0, 'M_Plaster')
box('VestCeilF', -VX, VX, VH, VH + SLAB, vz1 - 0.9, vz1, 'M_Ceiling')
box('VestCeilB', -VX, VX, VH, VH + SLAB, vz0, vz0 + 0.5, 'M_Ceiling')
box('VestCeilL', -VX, -1.0, VH, VH + SLAB, vz0 + 0.5, vz1 - 0.9, 'M_Ceiling')
box('VestCeilR', 1.0, VX, VH, VH + SLAB, vz0 + 0.5, vz1 - 0.9, 'M_Ceiling')

# ---------------------------------------------------------------- static sculpture & furniture
Dc = L['decor']
p = Dc['platformFront']; bevel(box('PlatformFront', p['x'] - p['w'] / 2, p['x'] + p['w'] / 2, 0, p['h'], p['z'] - p['d'] / 2, p['z'] + p['d'] / 2, 'M_Travertine'))
p = Dc['pedestalFront']; ph = Dc['platformFront']['h']; s = p['s']
bevel(box('PedestalFront', p['x'] - s / 2, p['x'] + s / 2, ph, ph + s, p['z'] - s / 2, p['z'] + s / 2, 'M_Travertine'))
top_front = ph + s
p = Dc['pedestalFar']; bevel(box('PedestalFar', p['x'] - p['w'] / 2, p['x'] + p['w'] / 2, 0, p['h'], p['z'] - p['w'] / 2, p['z'] + p['w'] / 2, 'M_Travertine'))
p = Dc['platformRight']
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=p['r'], depth=p['h'], location=B(p['x'], p['h'] / 2, p['z']), rotation=(0, 0, math.radians(22.5)))
ob = bpy.context.active_object; ob.name = 'PlatformRight'; ob.data.materials.append(mat['M_Travertine']); made.append(ob); bevel(ob)
p = Dc['pedestalRight']; prh = Dc['platformRight']['h']
bevel(box('PedestalRight', p['x'] - p['w'] / 2, p['x'] + p['w'] / 2, prh - 0.005, prh + p['h'], Dc['platformRight']['z'] - p['w'] / 2, Dc['platformRight']['z'] + p['w'] / 2, 'M_Travertine'))
top_right = prh + p['h']

def pebble(name, x, y, z, rx, ry, rz, seed, material='M_StoneWarm'):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=B(x, y, z))
    ob = bpy.context.active_object; ob.name = name; ob.scale = (rx, rz, ry)
    tex = bpy.data.textures.new(name + 'N', 'CLOUDS'); tex.noise_scale = 0.6; tex.noise_depth = 3
    try: tex.random_seed = seed
    except Exception: pass
    mod = ob.modifiers.new('disp', 'DISPLACE'); mod.texture = tex; mod.strength = 0.16; mod.mid_level = 0.5
    ob.data.materials.append(mat[material]); made.append(ob)
    for poly in ob.data.polygons: poly.use_smooth = True
    return ob
pf = Dc['pedestalFront']; pebble('StoneFront', pf['x'] + 0.05, top_front + 0.1, pf['z'], 0.15, 0.11, 0.13, 3)
pfar = Dc['pedestalFar']; pebble('StoneFar', pfar['x'], pfar['h'] + 0.15, pfar['z'], 0.08, 0.16, 0.07, 7)

# crescent / hook sculpture on the right pedestal (tapering tube swept round a vertical arc)
pr = Dc['pedestalRight']; Rc = 0.6; a0, a1 = 0.38 * math.pi, 1.7 * math.pi
def cres_r(t): return 0.05 + 0.22 * math.sin(math.pi * t ** 0.8) ** 0.7
cy = top_right + Rc + cres_r((1.5 * math.pi - a0) / (a1 - a0)) * 0.92
yaw = math.radians(-30)
def rot(x, z): return (x * math.cos(yaw) - z * math.sin(yaw), x * math.sin(yaw) + z * math.cos(yaw))
def cres_c(t):
    a = a0 + (a1 - a0) * t; x, z = rot(math.cos(a) * Rc, 0.0)
    return (pr['x'] + x, cy + math.sin(a) * Rc, Dc['platformRight']['z'] + z)
def cres_s(t, ph):
    a = a0 + (a1 - a0) * t; r = cres_r(t); rr = r * math.cos(ph); zz = r * 0.78 * math.sin(ph)
    x, z = rot(math.cos(a) * rr, zz); return (x, math.sin(a) * rr, z)
sweep('Crescent', cres_c, cres_s, 120, 40, 'M_Limestone')

# standing stone disc
dc = Dc['disc']
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=dc['r'], location=B(dc['x'], dc['r'] - 0.01, dc['z']), rotation=(0, 0, math.radians(-20)))
ob = bpy.context.active_object; ob.name = 'Disc'; ob.scale = (1, 0.27, 1); ob.data.materials.append(mat['M_Limestone']); made.append(ob)
for poly in ob.data.polygons: poly.use_smooth = True

# the tall twisting ribbon (hero sculpture, right foreground)
rb = Dc['ribbon']; RH = rb['height']; ryaw = math.radians(rb['yawDeg']); k = RH / 3.5
def rspine(t): return (math.sin(t * math.pi * 1.35) * 0.6 * k - 0.36 * k * t, RH * t, math.sin(t * math.pi + 0.3) * 0.32 * k)
def rrot(x, z): return (x * math.cos(ryaw) - z * math.sin(ryaw), x * math.sin(ryaw) + z * math.cos(ryaw))
def rib_c(t):
    c = rspine(t); x, z = rrot(c[0], c[2]); return (rb['x'] + x, c[1], rb['z'] + z)
def rib_s(t, ph):
    th = t * math.pi * 1.55 + 0.2
    w = (0.29 + 0.09 * math.sin(math.pi * t)) * k; b = (0.115 - 0.02 * t) * k
    kk = min(1, min(t * 7, (1 - t) * 10)) ** 0.45; w *= 0.5 + 0.5 * kk; b *= 0.55 + 0.45 * kk
    cs, sn = math.cos(ph), math.sin(ph)
    px = w * math.copysign(abs(cs) ** 0.6, cs); pz = b * math.copysign(abs(sn) ** 0.6, sn)
    x, z = px * math.cos(th) - pz * math.sin(th), px * math.sin(th) + pz * math.cos(th)
    x, z = rrot(x, z); return (x, 0, z)
sweep('Ribbon', rib_c, rib_s, 180, 48, 'M_Limestone')

# wall works on the left wall
for i, a in enumerate(Dc['art']):
    z0, z1, y0, y1 = a['z'] - a['w'] / 2, a['z'] + a['w'] / 2, a['y'] - a['h'] / 2, a['y'] + a['h'] / 2
    if a['kind'] == 'canvas':
        fr = 0.07
        bevel(box(f'Art{i}FrameT', X0, X0 + 0.06, y1 - fr, y1, z0, z1, 'M_Frame'), 0.003)
        bevel(box(f'Art{i}FrameB', X0, X0 + 0.06, y0, y0 + fr, z0, z1, 'M_Frame'), 0.003)
        bevel(box(f'Art{i}FrameL', X0, X0 + 0.06, y0 + fr, y1 - fr, z0, z0 + fr, 'M_Frame'), 0.003)
        bevel(box(f'Art{i}FrameR', X0, X0 + 0.06, y0 + fr, y1 - fr, z1 - fr, z1, 'M_Frame'), 0.003)
        box(f'Art{i}Canvas', X0, X0 + 0.035, y0 + fr, y1 - fr, z0 + fr, z1 - fr, 'M_Canvas')
    else:
        bevel(box(f'Art{i}Panel', X0, X0 + 0.04, y0, y1, z0, z1, 'M_Frame'), 0.002)

# the hidden door: a plaster panel recessed 3 mm, with a hairline shadow gap (exported separately so it can slide)
door = box('DoorPanel', dx0 + 0.004, dx1 - 0.004, 0.004, DH - 0.004, Z0 - 0.09, Z0 - 0.003, 'M_Plaster')
made.remove(door)

# ---------------------------------------------------------------- apply modifiers
def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e: log('modifier fail', ob.name, e)
for ob in made + [door]:
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); apply_all(ob)

# ---------------------------------------------------------------- UV0: world-scaled box projection (texture mapping)
TILE = {n: v[2] for n, v in MATS.items()}
def box_uv(ob):
    me = ob.data
    while len(me.uv_layers): me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='uv0')
    mw = ob.matrix_world
    for poly in me.polygons:
        n = (mw.to_3x3() @ poly.normal); ax = max(range(3), key=lambda i: abs(n[i]))
        tile = TILE[me.materials[poly.material_index].name]
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2: u, v = co.x, co.y          # floor / ceiling (blender up = z)
            elif ax == 0: u, v = co.y, co.z         # faces pointing +-x
            else: u, v = co.x, co.z                 # faces pointing +-y (game z)
            uv.data[li].uv = (u / tile, v / tile)
for ob in made + [door]: box_uv(ob)

# ---------------------------------------------------------------- join statics, cull never-seen faces
for o in bpy.context.selected_objects: o.select_set(False)
for ob in made: ob.select_set(True)
bpy.context.view_layer.objects.active = made[0]
bpy.ops.object.join()
static = bpy.context.active_object; static.name = 'G01_Static'
bm = bmesh.new(); bm.from_mesh(static.data); bm.normal_update()
openings = [(0.5 * (s['x0'] + s['x1']), 0.5 * (s['z0'] + s['z1'])) for s in SK]
kill = []
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal; gx, gy, gz = c.x, c.z, -c.y; nx, ny, nz = n.x, n.z, -n.y
    if ny > 0.9 and gy > TOP - 0.01 and gy > 3.69: kill.append(f); continue                     # roof / wall tops
    if ny < -0.9 and gy < 0.001: kill.append(f); continue                                        # undersides on the ground
    if abs(nx) > 0.9 and abs(gx) > X1 + W - 0.01: kill.append(f); continue                     # outer side walls
    if nz > 0.9 and gz > Z1 + W - 0.01: kill.append(f); continue                                 # outer front wall
    if nz < -0.9 and gz < vz0 - W + 0.01: kill.append(f); continue                               # outer vestibule back
    if abs(nx) > 0.9 and VX + W - 0.01 < abs(gx) < VX + W + 0.01 and gz < Z0: kill.append(f); continue
    if nz < -0.9 and abs(gz - (Z0 - W)) < 0.01 and abs(gx) > VX: kill.append(f); continue      # back wall outside the vestibule
    if gy > TOP + 0.01:                                                                        # shaft walls: keep inner faces only
        ox, oz = min(openings, key=lambda o: (o[0] - gx) ** 2 + (o[1] - gz) ** 2)
        if nx * (ox - gx) + nz * (oz - gz) <= 0: kill.append(f); continue
bmesh.ops.delete(bm, geom=kill, context='FACES')
bm.to_mesh(static.data); bm.free()
log('static faces', len(static.data.polygons), 'culled', len(kill))

# ---------------------------------------------------------------- lightmap UVs (one atlas for room + door panel)
for ob in (static, door):
    lm = ob.data.uv_layers.new(name='lightmap'); ob.data.uv_layers.active = lm
for o in bpy.context.selected_objects: o.select_set(False)
static.select_set(True); door.select_set(True); bpy.context.view_layer.objects.active = static
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0025, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
try: bpy.ops.uv.pack_islands(rotate=True, margin=0.0025)
except Exception as e: log('pack_islands', e)
bpy.ops.object.mode_set(mode='OBJECT')
log('lightmap uvs done')

# ---------------------------------------------------------------- light: sky dome + sun (only enters through the skylights)
S = L['sun']; el = math.radians(S['elevationDeg']); tx, tz = S['travel']; hn = math.hypot(tx, tz)
travel = Vector((tx / hn * math.cos(el), -math.sin(el), tz / hn * math.cos(el)))      # game coords
travel_b = Vector((travel.x, -travel.z, travel.y))
sun_data = bpy.data.lights.new('Sun', 'SUN'); sun_data.energy = S['strength']; sun_data.angle = math.radians(S['angleDeg']); sun_data.color = S['color']
sun = bpy.data.objects.new('Sun', sun_data); scene.collection.objects.link(sun)
sun.rotation_euler = (-travel_b).to_track_quat('Z', 'Y').to_euler()
world = bpy.data.worlds.new('Sky'); scene.world = world
try: world.use_nodes = True
except Exception: pass
bg = world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (*L['sky']['color'], 1); bg.inputs['Strength'].default_value = L['sky']['strength']

scene.render.engine = 'CYCLES'; cy = scene.cycles
cy.device = 'CPU'; cy.samples = SAMPLES
cy.max_bounces = 6; cy.diffuse_bounces = 5; cy.glossy_bounces = 2; cy.transparent_max_bounces = 2
try: cy.use_adaptive_sampling = False
except Exception: pass
scene.render.threads_mode = 'AUTO'

def float_image(name, w, h):
    im = bpy.data.images.new(name, w, h, float_buffer=True, alpha=True); im.generated_color = (0, 0, 0, 0); return im

def denoise_lightmap(im, sigma=1.3):
    w, h = im.size; px = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    mask = (px[..., 3] > 0.5).astype(np.float32)
    rgb = px[..., :3] * mask[..., None]
    r = int(math.ceil(sigma * 3)); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    def blur(a):
        a = np.apply_along_axis(lambda m: np.convolve(m, k, mode='same'), 0, a)
        return np.apply_along_axis(lambda m: np.convolve(m, k, mode='same'), 1, a)
    num = np.stack([blur(rgb[..., c]) for c in range(3)], -1); den = blur(mask)[..., None]
    out = np.where(den > 1e-4, num / np.maximum(den, 1e-4), 0)
    px[..., :3] = np.where(mask[..., None] > 0, out, px[..., :3]); px[..., 3] = 1
    im.pixels.foreach_set(px.ravel())

if not SKIP_BAKE:
    # --- 1. lightmap: diffuse lighting only (no albedo) — sky + sun, direct + all bounces
    lmimg = float_image('G01_Lightmap', LM, LM)
    for m in bpy.data.materials:
        nt = m.node_tree; node = nt.nodes.new('ShaderNodeTexImage'); node.image = lmimg; nt.nodes.active = node
    for o in bpy.context.selected_objects: o.select_set(False)
    static.select_set(True); door.select_set(True); bpy.context.view_layer.objects.active = static
    bk = scene.render.bake; bk.margin = 6; bk.use_clear = True
    log(f'baking lightmap {LM}px @ {SAMPLES} spp …')
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, use_clear=True)
    log('bake done; denoising')
    denoise_lightmap(lmimg)
    lmimg.filepath_raw = os.path.join(OUT, 'lightmap.hdr'); lmimg.file_format = 'HDR'; lmimg.save()
    log('saved lightmap.hdr')

    # --- 2. light probe for the movable sculptures: equirect panorama from the puzzle area
    cam_d = bpy.data.cameras.new('Probe'); cam_d.type = 'PANO'
    try: cam_d.panorama_type = 'EQUIRECTANGULAR'
    except Exception: cy.panorama_type = 'EQUIRECTANGULAR'
    cam = bpy.data.objects.new('Probe', cam_d); scene.collection.objects.link(cam)
    pc = L['puzzle']['circle']; cam.location = B(pc['x'] + 1.2, 1.3, pc['z'])
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))     # look along game -z (down the room)
    scene.camera = cam; scene.render.resolution_x, scene.render.resolution_y = 1024, 512; scene.render.resolution_percentage = 100
    cy.samples = PROBE_SAMPLES; cy.use_denoising = True
    scene.render.image_settings.file_format = 'HDR'; scene.render.filepath = os.path.join(OUT, 'probe.hdr')
    log('rendering probe …'); bpy.ops.render.render(write_still=True); log('probe done')

    if REF_RENDER:   # ground-truth path-traced still from the game camera, for side-by-side checks
        C = L['camera']; rc_d = bpy.data.cameras.new('Ref'); rc = bpy.data.objects.new('Ref', rc_d); scene.collection.objects.link(rc)
        rc.location = B(*C['position']); tgt = B(*C['target'])
        rc.rotation_euler = (tgt - rc.location).to_track_quat('-Z', 'Y').to_euler()
        rc_d.sensor_fit = 'VERTICAL'; rc_d.angle_y = math.radians(C['fovDeg'])
        scene.camera = rc; scene.render.resolution_x, scene.render.resolution_y = REF_W, int(REF_W * 0.625)
        cy.samples = REF_SPP; scene.view_settings.view_transform = 'AgX'
        scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = os.path.join(HERE, 'ref_cycles.png')
        log('rendering reference still …'); bpy.ops.render.render(write_still=True); log('reference done')

# remove helper image nodes before export (materials are rebuilt in the game from names)
for m in bpy.data.materials:
    for nd in list(m.node_tree.nodes):
        if nd.type == 'TEX_IMAGE': m.node_tree.nodes.remove(nd)

def export(objs, path):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_apply=True, export_yup=True)
    log('exported', os.path.basename(path), f'{os.path.getsize(path) / 1e6:.1f} MB')
export([static, door], os.path.join(OUT, 'gallery01.glb'))

log('pipeline complete (run build_blade.py for the movable sculpture)')
