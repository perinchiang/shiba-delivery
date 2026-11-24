"""blender --background --factory-startup --python-exit-code 2 --python coastal-town-kit.py

Build the stylized East-Asian / Kamakura-Onomichi coastal hillside town modular 3D kit
(art/town/coastal-town-kit.glb) for Shiba Delivery (S2 Step 1 · Hub #1).

Conventions:
- Blender Z-up, metric units matching the 0.84 street-scale Shiba & scooter; front faces -Y.
- glTF exports Y-up, front facing +Z.
- Buildings include deep stone/concrete slope foundations (down to z = -2.4m) so they seat
  seamlessly on sloped hillside streets without floating corners.
- Exact hexes 0x527a78 (window glass) and 0xe8d798 (warm lamps / headlights / lightboxes)
  are preserved with glass=True so src/morning/time-of-day.js automatically illuminates them
  at dusk and night.
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau

# Harmonized with src/morning/city-palette.js & time-of-day.js
C_GLASS = 0x527a78           # exact WINDOW_HEXES match -> dusk/night auto glow
C_LAMP_GLOW = 0xe8d798       # exact WINDOW_HEXES match -> warm lamp / headlight glow
C_WALL_CREAM = 0xf5ebd5
C_WALL_IVORY = 0xf7f1e3
C_WALL_WARM = 0xf0dec0
C_WALL_MINT = 0xdbe6d9
C_WALL_PEACH = 0xf2d9c2
C_WALL_RECESS = 0x7b7265
C_CONCRETE = 0xb8b2a4
C_CONCRETE_DARK = 0x8f8a7d
C_STONE_PLINTH = 0x9c9586
C_STONE_CAP = 0xc5bcaa
C_TRIM = 0xfaf3e3
C_TIMBER = 0x785137
C_TIMBER_LIGHT = 0xa87c53
C_IRON = 0x424d4c
C_IRON_LIGHT = 0x6f7b7a
C_AC_BODY = 0xe5e3da
C_AC_GRILLE = 0x545d5c

# Roof palette (coastal terracotta, coastal slate-blue, sage tile)
C_ROOF_TERRA = 0xc65b3e
C_ROOF_TERRA_RIDGE = 0xa4462d
C_ROOF_BLUE = 0x4b748f
C_ROOF_BLUE_RIDGE = 0x385a70
C_ROOF_SAGE = 0x567f6f
C_ROOF_SAGE_RIDGE = 0x406456

# Awning / storefront / tram / street furniture accents
C_AWNING_RED = 0xcf5642
C_AWNING_TEAL = 0x3b7c73
C_AWNING_GOLD = 0xd99b38
C_AWNING_BLUE = 0x44759b
C_KONBINI_GREEN = 0x398c68
C_KONBINI_ORANGE = 0xe3843c
C_TRAM_GREEN = 0x2f6c4f
C_TRAM_CREAM = 0xf4ebd2
C_TRAM_GOLD = 0xd9a841
C_TRAM_ROOF = 0xc9c6bc
C_WARN_YELLOW = 0xf0c22e
C_WARN_RED = 0xd23b32
C_WARN_DARK = 0x2a2b2c
C_CABINET_YELLOW = 0xf4c236
C_CABINET_CHARCOAL = 0x394043
C_CABINET_LED = 0x66d97a
C_VEND_RED = 0xd44f42
C_VEND_WHITE = 0xf5f2ea
C_LEAF_MID = 0x619956
C_FLOWER_CORAL = 0xe87b59
C_FLOWER_GOLD = 0xf5c352


def hex_srgb(h):
    return (((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0, 1.0)


def shade_srgb(col_srgb, ao=1.0, tint_cool=0.0):
    r, g, b, a = col_srgb
    f = max(0.46, min(1.10, ao))
    cool_r, cool_g, cool_b = 0.80, 0.86, 0.98
    k = max(0.0, min(1.0, (1.0 - f) * 0.58 + tint_cool))
    return (
        max(0.0, min(1.0, r * (f * (1.0 - k) + cool_r * f * k))),
        max(0.0, min(1.0, g * (f * (1.0 - k) + cool_g * f * k))),
        max(0.0, min(1.0, b * (f * (1.0 - k) + cool_b * f * k))),
        a,
    )


class TownMesh:
    """Beveled, vertex-AO shaded, weighted-normal architectural mesh builder."""

    def __init__(self, name):
        self.name = name
        self.parts = []

    @staticmethod
    def _weighted_normals(bm, crease_dot=0.25):
        bm.normal_update()
        areas = {f: max(f.calc_area(), 1e-6) ** 2 for f in bm.faces}
        nors = {}
        for f in bm.faces:
            fn = f.normal
            if not f.smooth:
                for loop in f.loops:
                    nors[loop] = fn.copy()
                continue
            for loop in f.loops:
                acc = fn * areas[f]
                for lf in loop.vert.link_faces:
                    if lf is not f and lf.smooth and lf.normal.dot(fn) > crease_dot:
                        acc += lf.normal * areas[lf]
                nors[loop] = acc.normalized() if acc.length > 1e-6 else fn.copy()
        return nors

    def _finalize(self, bm, color, ao_fn=None, smooth=True, glass=False):
        base = hex_srgb(color) if isinstance(color, int) else color
        col_layer = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            f.smooth = smooth
            for loop in f.loops:
                if glass:
                    loop[col_layer] = base
                else:
                    p = loop.vert.co
                    ao = ao_fn(p, f.normal) if ao_fn else 1.0
                    cool = 0.22 if (ao_fn and f.normal.z < -0.35) else 0.0
                    loop[col_layer] = shade_srgb(base, ao, tint_cool=cool)
        self.parts.append((bm, self._weighted_normals(bm)))

    def box(self, center, size, color, bevel=0.024, segments=1, rot=(0.0, 0.0, 0.0),
            ao_fn=None, smooth=True, glass=False):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = size
        for v in bm.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
        if bevel > 0.0:
            b_off = min(bevel, min(sx, sy, sz) * 0.38)
            if b_off > 0.002:
                bmesh.ops.bevel(
                    bm, geom=list(bm.edges), offset=b_off, segments=segments,
                    profile=0.5, affect='EDGES', clamp_overlap=True,
                )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass)

    def cyl(self, center, r_bot, r_top, height, color, segs=12, rot=(0.0, 0.0, 0.0),
            ao_fn=None, smooth=True, glass=False):
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=r_bot, radius2=r_top, depth=height,
        )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass)

    def gable_prism(self, center, width, depth, base_z, ridge_h, thickness, color,
                    ridge_along_x=True, bevel=0.025, ao_fn=None):
        bm = bmesh.new()
        hw, hd = width * 0.5, depth * 0.5
        if ridge_along_x:
            pts = [(-hd, 0.0), (0.0, ridge_h), (hd, 0.0)]
            if thickness > 0.0:
                pts.extend([(hd, -thickness), (0.0, ridge_h - thickness), (-hd, -thickness)])
            vl = [bm.verts.new((-hw, y, z)) for (y, z) in pts]
            vr = [bm.verts.new((hw, y, z)) for (y, z) in pts]
        else:
            pts = [(-hw, 0.0), (0.0, ridge_h), (hw, 0.0)]
            if thickness > 0.0:
                pts.extend([(hw, -thickness), (0.0, ridge_h - thickness), (-hw, -thickness)])
            vl = [bm.verts.new((x, -hd, z)) for (x, z) in pts]
            vr = [bm.verts.new((x, hd, z)) for (x, z) in pts]
        n = len(pts)
        bm.faces.new(vl)
        bm.faces.new(list(reversed(vr)))
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new((vl[i], vl[ni], vr[ni], vr[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel > 0.002:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1,
                            profile=0.5, affect='EDGES', clamp_overlap=True)
        mat = Euler((0, 0, 0), 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector((center[0], center[1], base_z))
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=True)

    def build(self, shared_mat, collection):
        merged = bmesh.new()
        col_dst = merged.loops.layers.color.new('Color')
        nor_list = []
        for bm, nors in self.parts:
            col_src = bm.loops.layers.color.active
            vmap = {v: merged.verts.new(v.co) for v in bm.verts}
            for f in bm.faces:
                try:
                    nf = merged.faces.new([vmap[v] for v in f.verts])
                except ValueError:
                    continue
                nf.smooth = f.smooth
                for ol, nl in zip(f.loops, nf.loops):
                    nl[col_dst] = ol[col_src]
                    nor_list.append(nors[ol])
            bm.free()
        mesh = bpy.data.meshes.new(self.name)
        merged.to_mesh(mesh)
        merged.free()
        mesh.materials.append(shared_mat)
        if len(nor_list) == len(mesh.loops):
            mesh.normals_split_custom_set(nor_list)
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        return obj


def make_ao_fn(eave_z, floor_z=0.0):
    def fn(p, n):
        ground = 0.78 + 0.22 * max(0.0, min(1.0, (p.z - floor_z) / 1.4))
        eave = 1.0
        if p.z < eave_z + 0.15 and p.z > eave_z - 1.1:
            eave = 0.80 + 0.20 * max(0.0, min(1.0, (eave_z - p.z) / 1.0))
        top_boost = 1.04 if n.z > 0.65 else (0.86 if n.z < -0.35 else 1.0)
        return ground * eave * top_boost
    return fn


def add_recessed_window(m, x, y, z, w, h, facing='-Y', ao_fn=None,
                        frame_col=C_TRIM, shutter_col=None, flowerbox=False):
    """True 0.16m recessed window opening on -Y, +Y, -X, or +X face."""
    d_rec = 0.16
    if facing in ('-Y', '+Y'):
        sy = -1.0 if facing == '-Y' else 1.0
        # Back glass pane recessed cleanly
        m.box((x, y - sy * 0.02, z), (w - 0.10, 0.04, h - 0.10), C_GLASS,
              bevel=0.0, smooth=False, glass=True)
        # Shaded surround reveal box
        m.box((x, y + sy * 0.04, z + h * 0.5 - 0.05), (w + 0.14, d_rec, 0.12), frame_col, bevel=0.015, ao_fn=ao_fn)
        m.box((x, y + sy * 0.05, z - h * 0.5 + 0.02), (w + 0.24, d_rec + 0.09, 0.11), frame_col, bevel=0.015, ao_fn=ao_fn)
        for s in (-1.0, 1.0):
            m.box((x + s * (w * 0.5 + 0.01), y + sy * 0.04, z), (0.11, d_rec, h + 0.04), frame_col, bevel=0.015, ao_fn=ao_fn)
        # Center mullions
        m.box((x, y + sy * 0.02, z), (0.055, 0.06, h - 0.06), frame_col, bevel=0.008, ao_fn=ao_fn)
        m.box((x, y + sy * 0.02, z - 0.06), (w - 0.06, 0.055, 0.055), frame_col, bevel=0.008, ao_fn=ao_fn)
        if shutter_col is not None:
            for s in (-1.0, 1.0):
                m.box((x + s * (w * 0.5 + 0.24), y + sy * 0.08, z), (0.30, 0.07, h + 0.02),
                      shutter_col, bevel=0.014, ao_fn=ao_fn)
        if flowerbox:
            m.box((x, y + sy * 0.16, z - h * 0.5 - 0.06), (w * 0.86, 0.22, 0.19),
                  C_TIMBER, bevel=0.016, ao_fn=ao_fn)
            for k in (-1, 0, 1):
                m.box((x + k * w * 0.25, y + sy * 0.17, z - h * 0.5 + 0.08), (0.20, 0.18, 0.14),
                      C_LEAF_MID, bevel=0.04, ao_fn=ao_fn)
    else:
        sx = -1.0 if facing == '-X' else 1.0
        m.box((x - sx * 0.02, y, z), (0.04, w - 0.10, h - 0.10), C_GLASS,
              bevel=0.0, smooth=False, glass=True)
        m.box((x + sx * 0.04, y, z + h * 0.5 - 0.05), (d_rec, w + 0.14, 0.12), frame_col, bevel=0.015, ao_fn=ao_fn)
        m.box((x + sx * 0.05, y, z - h * 0.5 + 0.02), (d_rec + 0.09, w + 0.24, 0.11), frame_col, bevel=0.015, ao_fn=ao_fn)
        for s in (-1.0, 1.0):
            m.box((x + sx * 0.04, y + s * (w * 0.5 + 0.01), z), (d_rec, 0.11, h + 0.04), frame_col, bevel=0.015, ao_fn=ao_fn)
        m.box((x + sx * 0.02, y, z), (0.06, 0.055, h - 0.06), frame_col, bevel=0.008, ao_fn=ao_fn)


def add_striped_awning(m, x, y, z, width, depth, color_a, ao_fn=None, rot_z=0.0):
    """Sloped striped fabric awning along -Y (front) when rot_z=0."""
    count = max(6, int(round(width / 0.44)))
    step = width / count
    rot = (-0.28, 0.0, rot_z)
    for i in range(count):
        col = color_a if i % 2 == 0 else C_TRIM
        off = (i + 0.5) * step - width * 0.5
        if abs(rot_z) < 0.1:
            m.box((x + off, y - depth * 0.48, z), (step + 0.004, depth, 0.07), col,
                  bevel=0.01, rot=(-0.28, 0.0, 0.0), ao_fn=ao_fn)
            m.box((x + off, y - depth * 0.94, z - depth * 0.14 - 0.09), (step, 0.05, 0.20),
                  col, bevel=0.01, ao_fn=ao_fn)
        else:
            sx = -1.0 if rot_z > 0 else 1.0
            m.box((x + sx * depth * 0.48, y + off, z), (depth, step + 0.004, 0.07), col,
                  bevel=0.01, rot=(0.0, sx * 0.28, 0.0), ao_fn=ao_fn)
            m.box((x + sx * depth * 0.94, y + off, z - depth * 0.14 - 0.09), (0.05, step, 0.20),
                  col, bevel=0.01, ao_fn=ao_fn)


def add_ac_unit(m, x, y, z, facing='-Y', ao_fn=None):
    """Compact Japanese wall-mounted outdoor AC compressor unit."""
    if facing in ('-Y', '+Y'):
        sy = -1.0 if facing == '-Y' else 1.0
        m.box((x, y + sy * 0.18, z), (0.76, 0.34, 0.56), C_AC_BODY, bevel=0.025, ao_fn=ao_fn)
        m.cyl((x - 0.14, y + sy * 0.35, z), 0.19, 0.19, 0.04, C_AC_GRILLE, segs=12,
              rot=(math.pi * 0.5, 0.0, 0.0), ao_fn=ao_fn)
        for s in (-0.28, 0.28):
            m.box((x + s, y + sy * 0.14, z - 0.32), (0.06, 0.32, 0.06), C_IRON_LIGHT, bevel=0.008, ao_fn=ao_fn)
    else:
        sx = -1.0 if facing == '-X' else 1.0
        m.box((x + sx * 0.18, y, z), (0.34, 0.76, 0.56), C_AC_BODY, bevel=0.025, ao_fn=ao_fn)
        m.cyl((x + sx * 0.35, y - 0.14, z), 0.19, 0.19, 0.04, C_AC_GRILLE, segs=12,
              rot=(0.0, math.pi * 0.5, 0.0), ao_fn=ao_fn)


def add_balcony(m, x, y, z, width, depth=0.92, rail_col=C_IRON, ao_fn=None):
    """2nd/3rd floor Japanese coastal balcony facing -Y."""
    m.box((x, y - depth * 0.5, z), (width, depth, 0.14), C_CONCRETE, bevel=0.02, ao_fn=ao_fn)
    # Railing posts & top bar
    fy = y - depth + 0.06
    m.box((x, fy, z + 0.92), (width, 0.06, 0.06), rail_col, bevel=0.01, ao_fn=ao_fn)
    m.box((x, fy, z + 0.46), (width - 0.08, 0.04, 0.04), rail_col, bevel=0.008, ao_fn=ao_fn)
    posts = max(4, int(round(width / 0.56)))
    for i in range(posts + 1):
        px = x - width * 0.5 + 0.06 + (i / posts) * (width - 0.12)
        m.box((px, fy, z + 0.48), (0.045, 0.045, 0.86), rail_col, bevel=0.008, ao_fn=ao_fn)
    for s in (-1.0, 1.0):
        sx = x + s * (width * 0.5 - 0.04)
        m.box((sx, y - depth * 0.5, z + 0.92), (0.06, depth, 0.06), rail_col, bevel=0.01, ao_fn=ao_fn)
        m.box((sx, y - depth * 0.5, z + 0.46), (0.04, depth, 0.04), rail_col, bevel=0.008, ao_fn=ao_fn)


def add_shopfront_ground(m, w, y_front, height, door_x, awning_col, ao_fn, sign_band_col=None):
    """Lived-in ground-floor East-Asian shopfront facing -Y."""
    # Glazed storefront display window + warm wooden/aluminum mullions
    m.box((0.0, y_front + 0.08, height * 0.46), (w - 0.55, 0.14, height * 0.82), C_WALL_RECESS, bevel=0.01, ao_fn=ao_fn)
    # Wide display glass pane
    win_w = w - 2.35
    win_x = -0.78 if door_x > 0 else 0.78
    m.box((win_x, y_front + 0.02, 1.48), (win_w, 0.05, 1.72), C_GLASS, bevel=0.0, smooth=False, glass=True)
    # Kickplate below display window
    m.box((win_x, y_front - 0.02, 0.34), (win_w + 0.12, 0.14, 0.62), C_STONE_CAP, bevel=0.018, ao_fn=ao_fn)
    # Mullions on display window
    for t in (-0.33, 0.33):
        m.box((win_x + t * win_w, y_front - 0.02, 1.48), (0.06, 0.08, 1.78), C_TIMBER, bevel=0.01, ao_fn=ao_fn)
    m.box((win_x, y_front - 0.02, 0.64), (win_w + 0.12, 0.16, 0.09), C_TIMBER, bevel=0.014, ao_fn=ao_fn)
    m.box((win_x, y_front - 0.02, 2.36), (win_w + 0.12, 0.14, 0.10), C_TIMBER, bevel=0.014, ao_fn=ao_fn)

    # Entrance sliding door with inset glass
    m.box((door_x, y_front - 0.02, 1.18), (1.36, 0.12, 2.36), C_TIMBER, bevel=0.016, ao_fn=ao_fn)
    m.box((door_x, y_front - 0.05, 1.44), (0.98, 0.04, 1.38), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((door_x, y_front - 0.08, 1.44), (0.05, 0.04, 1.42), C_TIMBER, bevel=0.008, ao_fn=ao_fn)
    # Stone entry step
    m.box((door_x, y_front - 0.24, 0.07), (1.62, 0.44, 0.14), C_CONCRETE, bevel=0.018, ao_fn=ao_fn)

    # Fascia / signboard band above shopfront
    if sign_band_col is not None:
        m.box((0.0, y_front - 0.10, height + 0.28), (w - 0.14, 0.22, 0.86), sign_band_col, bevel=0.022, ao_fn=ao_fn)
    # Striped fabric awning below fascia
    add_striped_awning(m, 0.0, y_front - 0.02, height - 0.16, w - 0.40, 1.15, awning_col, ao_fn=ao_fn)


# ==============================================================================
# 1) Town_Shop_Corner: 2.5-story coastal tiled shop-house (8.2m x 7.0m)
# ==============================================================================
def build_shop_corner(mat, col):
    m = TownMesh('Town_Shop_Corner')
    w, d, h = 8.2, 7.0, 6.8
    ao = make_ao_fn(h)
    # Deep foundation plinth for sloped road seating (z = -2.4..0.24)
    m.box((0, 0, -1.08), (w + 0.26, d + 0.26, 2.64), C_STONE_PLINTH, bevel=0.03, ao_fn=ao)
    # Main warm plaster body
    m.box((0, 0, h * 0.5), (w, d, h), C_WALL_CREAM, bevel=0.035, ao_fn=ao)
    # Horizontal belt course between 1F shop and 2F living
    m.box((0, 0, 3.45), (w + 0.18, d + 0.18, 0.18), C_TRIM, bevel=0.02, ao_fn=ao)

    # Ground floor shopfront facing -Y
    add_shopfront_ground(m, w, -d * 0.5, 3.15, door_x=2.45, awning_col=C_AWNING_RED, ao_fn=ao, sign_band_col=C_TRIM)

    # 2nd floor front windows + central balcony + AC unit
    add_recessed_window(m, -2.35, -d * 0.5, 5.15, 1.48, 1.42, '-Y', ao_fn=ao, shutter_col=C_ROOF_BLUE, flowerbox=True)
    add_recessed_window(m, 0.25, -d * 0.5, 5.15, 1.56, 1.48, '-Y', ao_fn=ao)
    add_recessed_window(m, 2.65, -d * 0.5, 5.15, 1.32, 1.38, '-Y', ao_fn=ao, shutter_col=C_ROOF_BLUE)
    add_balcony(m, 0.25, -d * 0.5, 4.22, 2.60, 0.88, rail_col=C_IRON, ao_fn=ao)
    add_ac_unit(m, 3.10, -d * 0.5, 3.92, '-Y', ao_fn=ao)

    # Side windows (+X and -X) for corner readability
    for sx, face in ((-1.0, '-X'), (1.0, '+X')):
        add_recessed_window(m, sx * w * 0.5, -1.3, 5.15, 1.35, 1.32, face, ao_fn=ao)
        add_recessed_window(m, sx * w * 0.5, 1.5, 5.15, 1.35, 1.32, face, ao_fn=ao)
        add_recessed_window(m, sx * w * 0.5, 0.0, 1.85, 1.65, 1.30, face, ao_fn=ao)
        add_ac_unit(m, sx * w * 0.5, 2.35, 4.10, face, ao_fn=ao)

    # Pitched coastal blue-tile roof with thick overhang & ridge beam
    m.gable_prism((0, 0, 0), w + 0.95, d + 1.15, h + 0.08, 2.15, 0.26, C_ROOF_BLUE,
                  ridge_along_x=True, bevel=0.028, ao_fn=ao)
    # Gable filler triangles
    m.gable_prism((0, 0, 0), w - 0.06, d - 0.06, h - 0.02, 2.02, 0.0, C_WALL_CREAM,
                  ridge_along_x=True, bevel=0.0, ao_fn=ao)
    m.box((0, 0, h + 2.24), (w + 1.05, 0.28, 0.22), C_ROOF_BLUE_RIDGE, bevel=0.025, ao_fn=ao)
    # Rooftop small brick chimney
    m.box((-2.4, 1.4, h + 1.65), (0.62, 0.62, 1.55), C_STONE_CAP, bevel=0.025, ao_fn=ao)
    m.box((-2.4, 1.4, h + 2.46), (0.76, 0.76, 0.14), C_ROOF_BLUE_RIDGE, bevel=0.02, ao_fn=ao)
    return m.build(mat, col)


# ==============================================================================
# 2) Town_Shop_Tall: 3-story East-Asian commercial shophouse (7.4m x 6.8m)
# ==============================================================================
def build_shop_tall(mat, col):
    m = TownMesh('Town_Shop_Tall')
    w, d, h = 7.4, 6.8, 9.4
    ao = make_ao_fn(h)
    m.box((0, 0, -1.08), (w + 0.26, d + 0.26, 2.64), C_CONCRETE_DARK, bevel=0.03, ao_fn=ao)
    m.box((0, 0, h * 0.5), (w, d, h), C_WALL_WARM, bevel=0.035, ao_fn=ao)
    # Floor bands
    for fz in (3.45, 6.45):
        m.box((0, 0, fz), (w + 0.16, d + 0.16, 0.16), C_TRIM, bevel=0.018, ao_fn=ao)
    # Roof parapet & cornice
    m.box((0, 0, h + 0.28), (w + 0.28, d + 0.28, 0.60), C_TRIM, bevel=0.025, ao_fn=ao)
    m.box((0, 0, h + 0.62), (w + 0.36, d + 0.36, 0.12), C_ROOF_TERRA, bevel=0.02, ao_fn=ao)
    # Rooftop water tank + stair penthouse (classic East-Asian town silhouette)
    m.box((1.65, 1.45, h + 1.15), (2.25, 2.15, 1.65), C_WALL_IVORY, bevel=0.028, ao_fn=ao)
    m.box((1.65, 1.45, h + 2.02), (2.42, 2.32, 0.12), C_CONCRETE_DARK, bevel=0.02, ao_fn=ao)
    m.cyl((-1.85, 1.25, h + 1.32), 0.66, 0.66, 1.25, C_IRON_LIGHT, segs=14, ao_fn=ao)
    m.cyl((-1.85, 1.25, h + 0.55), 0.52, 0.52, 0.38, C_IRON, segs=10, ao_fn=ao)

    # 1F shopfront facing -Y
    add_shopfront_ground(m, w, -d * 0.5, 3.15, door_x=-2.10, awning_col=C_AWNING_TEAL, ao_fn=ao, sign_band_col=C_TRIM)

    # 2F & 3F windows + balconies + AC units
    for wz in (5.00, 7.95):
        for wx in (-2.05, 0.0, 2.05):
            add_recessed_window(m, wx, -d * 0.5, wz, 1.32, 1.36, '-Y', ao_fn=ao,
                                shutter_col=C_ROOF_SAGE if wz < 6.0 and abs(wx) > 1.0 else None)
    add_balcony(m, 0.0, -d * 0.5, 4.18, 4.95, 0.86, rail_col=C_IRON, ao_fn=ao)
    add_balcony(m, 1.05, -d * 0.5, 7.12, 3.55, 0.80, rail_col=C_IRON, ao_fn=ao)
    add_ac_unit(m, -2.65, -d * 0.5, 7.38, '-Y', ao_fn=ao)
    add_ac_unit(m, 2.75, -d * 0.5, 4.48, '-Y', ao_fn=ao)

    # Side windows
    for sx, face in ((-1.0, '-X'), (1.0, '+X')):
        for wz in (5.00, 7.95):
            add_recessed_window(m, sx * w * 0.5, -1.1, wz, 1.22, 1.28, face, ao_fn=ao)
            add_recessed_window(m, sx * w * 0.5, 1.4, wz, 1.22, 1.28, face, ao_fn=ao)
    return m.build(mat, col)


# ==============================================================================
# 3) Town_Shop_Konbini: 2-story bright coastal convenience store / pharmacy (9.4m x 7.2m)
# ==============================================================================
def build_shop_konbini(mat, col):
    m = TownMesh('Town_Shop_Konbini')
    w, d, h = 9.4, 7.2, 6.5
    ao = make_ao_fn(h)
    m.box((0, 0, -1.08), (w + 0.26, d + 0.26, 2.64), C_CONCRETE, bevel=0.03, ao_fn=ao)
    m.box((0, 0, h * 0.5), (w, d, h), C_WALL_IVORY, bevel=0.035, ao_fn=ao)
    m.box((0, 0, h + 0.24), (w + 0.26, d + 0.26, 0.52), C_CONCRETE, bevel=0.025, ao_fn=ao)

    # Signature coastal konbini tri-stripe fascia band (green / white / warm orange)
    fy = -d * 0.5
    m.box((0, fy - 0.14, 3.36), (w + 0.16, 0.30, 0.92), C_TRIM, bevel=0.022, ao_fn=ao)
    m.box((0, fy - 0.30, 3.66), (w + 0.10, 0.06, 0.18), C_KONBINI_GREEN, bevel=0.01, ao_fn=ao)
    m.box((0, fy - 0.30, 3.12), (w + 0.10, 0.06, 0.14), C_KONBINI_ORANGE, bevel=0.01, ao_fn=ao)
    # Recessed warm glow soffit strip under canopy
    m.box((0, fy - 0.22, 2.90), (w - 0.30, 0.18, 0.06), C_LAMP_GLOW, bevel=0.0, smooth=False, glass=True)

    # Full-width bright konbini windows + automatic glass double doors
    m.box((-2.55, fy + 0.02, 1.56), (3.40, 0.05, 2.08), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((2.55, fy + 0.02, 1.56), (3.40, 0.05, 2.08), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((0.0, fy + 0.03, 1.36), (1.76, 0.05, 2.48), C_GLASS, bevel=0.0, smooth=False, glass=True)
    for mx in (-4.28, -2.55, -0.88, 0.0, 0.88, 2.55, 4.28):
        m.box((mx, fy - 0.02, 1.48), (0.09, 0.12, 2.75), C_IRON_LIGHT, bevel=0.01, ao_fn=ao)
    m.box((-2.55, fy - 0.02, 0.28), (3.56, 0.14, 0.56), C_CONCRETE, bevel=0.015, ao_fn=ao)
    m.box((2.55, fy - 0.02, 0.28), (3.56, 0.14, 0.56), C_CONCRETE, bevel=0.015, ao_fn=ao)

    # 2F apartments above konbini
    for wx in (-2.9, 0.0, 2.9):
        add_recessed_window(m, wx, fy, 5.15, 1.52, 1.38, '-Y', ao_fn=ao)
    add_balcony(m, 0.0, fy, 4.26, 7.80, 0.82, rail_col=C_IRON_LIGHT, ao_fn=ao)
    add_ac_unit(m, -3.75, fy, 4.55, '-Y', ao_fn=ao)
    add_ac_unit(m, 3.75, fy, 4.55, '-Y', ao_fn=ao)
    return m.build(mat, col)


# ==============================================================================
# 4) Town_House_SlopeA: 2-story Kamakura/Onomichi coastal residence w/ low stone wall
# ==============================================================================
def build_house_slope_a(mat, col):
    m = TownMesh('Town_House_SlopeA')
    w, d, h = 7.4, 5.8, 5.4
    ao = make_ao_fn(h)
    # Deep terraced stone foundation plinth (extends down to -2.4m)
    m.box((0, 0, -1.08), (w + 0.48, d + 0.48, 2.64), C_STONE_PLINTH, bevel=0.035, ao_fn=ao)
    m.box((0, 0, 0.24), (w + 0.56, d + 0.56, 0.14), C_STONE_CAP, bevel=0.02, ao_fn=ao)
    # Main warm cream body
    m.box((0, 0, h * 0.5 + 0.24), (w, d, h), C_WALL_CREAM, bevel=0.032, ao_fn=ao)
    # Mid belt trim
    m.box((0, 0, 3.05), (w + 0.14, d + 0.14, 0.13), C_TIMBER, bevel=0.016, ao_fn=ao)

    fy = -d * 0.5
    # Entry door + tiled porch canopy
    m.box((-1.85, fy - 0.02, 1.38), (1.18, 0.12, 2.20), C_TIMBER, bevel=0.016, ao_fn=ao)
    m.box((-1.85, fy - 0.05, 1.72), (0.42, 0.04, 0.56), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((-1.85, fy - 0.55, 2.68), (1.92, 1.05, 0.14), C_ROOF_TERRA, bevel=0.018, rot=(-0.22, 0.0, 0.0), ao_fn=ao)
    # Front warm porch lamp
    m.box((-1.05, fy - 0.12, 2.25), (0.16, 0.16, 0.22), C_LAMP_GLOW, bevel=0.01, smooth=False, glass=True)

    # Windows (1F & 2F) + balcony + AC unit
    add_recessed_window(m, 1.35, fy, 1.68, 1.95, 1.35, '-Y', ao_fn=ao, shutter_col=C_ROOF_SAGE, flowerbox=True)
    add_recessed_window(m, -1.65, fy, 4.35, 1.45, 1.28, '-Y', ao_fn=ao, shutter_col=C_ROOF_SAGE)
    add_recessed_window(m, 1.55, fy, 4.35, 1.75, 1.32, '-Y', ao_fn=ao)
    add_balcony(m, 1.55, fy, 3.52, 2.65, 0.82, rail_col=C_TIMBER, ao_fn=ao)
    add_ac_unit(m, -3.15, fy, 0.72, '-Y', ao_fn=ao)

    # Side windows
    for sx, face in ((-1.0, '-X'), (1.0, '+X')):
        add_recessed_window(m, sx * w * 0.5, 0.2, 4.35, 1.25, 1.22, face, ao_fn=ao)
        add_recessed_window(m, sx * w * 0.5, 0.2, 1.68, 1.25, 1.22, face, ao_fn=ao)

    # Terracotta tiled pitched roof
    roof_z = h + 0.28
    m.gable_prism((0, 0, 0), w + 0.96, d + 1.08, roof_z, 1.95, 0.24, C_ROOF_TERRA,
                  ridge_along_x=True, bevel=0.026, ao_fn=ao)
    m.gable_prism((0, 0, 0), w - 0.06, d - 0.06, roof_z - 0.02, 1.84, 0.0, C_WALL_CREAM,
                  ridge_along_x=True, bevel=0.0, ao_fn=ao)
    m.box((0, 0, roof_z + 1.98), (w + 1.04, 0.26, 0.20), C_ROOF_TERRA_RIDGE, bevel=0.022, ao_fn=ao)

    # Front low Japanese garden wall + gate posts + red mailbox (street-facing at y = -d/2 - 1.55)
    wy = fy - 1.55
    m.box((1.35, wy, 0.52), (4.70, 0.34, 1.25), C_STONE_PLINTH, bevel=0.025, ao_fn=ao)
    m.box((1.35, wy, 1.18), (4.82, 0.42, 0.12), C_STONE_CAP, bevel=0.018, ao_fn=ao)
    m.box((-3.30, wy, 0.52), (0.95, 0.34, 1.25), C_STONE_PLINTH, bevel=0.025, ao_fn=ao)
    # Gate pillars flanking walkway
    for gx in (-2.75, -1.02):
        m.box((gx, wy, 0.68), (0.44, 0.44, 1.52), C_STONE_CAP, bevel=0.024, ao_fn=ao)
        m.box((gx, wy, 1.48), (0.50, 0.50, 0.10), C_ROOF_TERRA, bevel=0.015, ao_fn=ao)
    # Small red postbox on right gate pillar
    m.box((-1.02, wy - 0.25, 1.08), (0.28, 0.16, 0.34), C_AWNING_RED, bevel=0.018, ao_fn=ao)
    return m.build(mat, col)


# ==============================================================================
# 5) Town_House_SlopeB: 2-story sage/slate coastal house w/ side porch & low wood fence
# ==============================================================================
def build_house_slope_b(mat, col):
    m = TownMesh('Town_House_SlopeB')
    w, d, h = 6.6, 5.6, 5.2
    ao = make_ao_fn(h)
    m.box((0, 0, -1.08), (w + 0.48, d + 0.48, 2.64), C_STONE_PLINTH, bevel=0.035, ao_fn=ao)
    m.box((0, 0, h * 0.5 + 0.22), (w, d, h), C_WALL_MINT, bevel=0.032, ao_fn=ao)
    # Side 1F lean-to annex (+X)
    m.box((w * 0.5 + 1.05, 0.3, -1.08), (2.25, 4.10, 2.64), C_STONE_PLINTH, bevel=0.03, ao_fn=ao)
    m.box((w * 0.5 + 1.00, 0.3, 1.65), (2.15, 3.90, 2.90), C_WALL_IVORY, bevel=0.028, ao_fn=ao)
    m.box((w * 0.5 + 1.15, 0.3, 3.24), (2.65, 4.40, 0.22), C_ROOF_SAGE, bevel=0.022, rot=(0.0, 0.26, 0.0), ao_fn=ao)

    fy = -d * 0.5
    # Front door & striped window awning
    m.box((1.55, fy - 0.02, 1.35), (1.14, 0.12, 2.16), C_TIMBER, bevel=0.016, ao_fn=ao)
    m.box((1.55, fy - 0.50, 2.62), (1.76, 0.96, 0.14), C_ROOF_SAGE, bevel=0.018, rot=(-0.22, 0.0, 0.0), ao_fn=ao)
    add_recessed_window(m, -1.25, fy, 1.68, 1.85, 1.32, '-Y', ao_fn=ao, flowerbox=True)
    add_striped_awning(m, -1.25, fy - 0.04, 2.52, 2.15, 0.85, C_AWNING_BLUE, ao_fn=ao)
    add_recessed_window(m, -1.35, fy, 4.22, 1.38, 1.24, '-Y', ao_fn=ao, shutter_col=C_ROOF_BLUE)
    add_recessed_window(m, 1.45, fy, 4.22, 1.38, 1.24, '-Y', ao_fn=ao, shutter_col=C_ROOF_BLUE)
    add_ac_unit(m, -2.85, fy, 0.72, '-Y', ao_fn=ao)

    roof_z = h + 0.26
    m.gable_prism((0, 0, 0), w + 0.92, d + 1.04, roof_z, 1.88, 0.24, C_ROOF_SAGE,
                  ridge_along_x=True, bevel=0.026, ao_fn=ao)
    m.gable_prism((0, 0, 0), w - 0.06, d - 0.06, roof_z - 0.02, 1.76, 0.0, C_WALL_MINT,
                  ridge_along_x=True, bevel=0.0, ao_fn=ao)
    m.box((0, 0, roof_z + 1.90), (w + 1.00, 0.26, 0.20), C_ROOF_SAGE_RIDGE, bevel=0.022, ao_fn=ao)

    # Low timber-and-stone yard fence in front
    wy = fy - 1.48
    m.box((-1.35, wy, 0.45), (3.85, 0.28, 1.05), C_STONE_PLINTH, bevel=0.022, ao_fn=ao)
    for k in range(7):
        m.box((-3.05 + k * 0.56, wy, 1.15), (0.14, 0.08, 0.48), C_TIMBER_LIGHT, bevel=0.01, ao_fn=ao)
    m.box((-1.35, wy, 1.26), (3.80, 0.09, 0.09), C_TIMBER, bevel=0.01, ao_fn=ao)
    return m.build(mat, col)


# ==============================================================================
# 6) Town_Tram_Car: Iconic Enoden-style green & cream coastal train carriage (12.4m x 2.55m)
#    Runs along X-axis (length along X, side doors/windows facing -Y/+Y)
# ==============================================================================
def build_tram_car(mat, col):
    m = TownMesh('Town_Tram_Car')
    L, W, H = 12.4, 2.58, 3.15
    ao = make_ao_fn(H + 0.7, floor_z=0.4)
    # Bogie undercarriage & wheels
    m.box((0, 0, 0.62), (L - 0.8, W - 0.35, 0.55), C_IRON, bevel=0.03, ao_fn=ao)
    for bx in (-3.8, 3.8):
        m.box((bx, 0, 0.44), (2.2, W - 0.25, 0.36), C_WARN_DARK, bevel=0.02, ao_fn=ao)
        for wx in (-0.68, 0.68):
            for wy in (-0.72, 0.72):
                m.cyl((bx + wx, wy, 0.36), 0.34, 0.34, 0.14, C_IRON_LIGHT, segs=14,
                      rot=(math.pi * 0.5, 0.0, 0.0), ao_fn=ao)
    # Lower green skirt & upper cream body
    m.box((0, 0, 1.48), (L, W, 1.22), C_TRAM_GREEN, bevel=0.08, ao_fn=ao)
    m.box((0, 0, 2.68), (L - 0.04, W - 0.02, 1.24), C_TRAM_CREAM, bevel=0.08, ao_fn=ao)
    # Signature Enoden gold waistline stripe
    m.box((0, 0, 2.08), (L + 0.04, W + 0.04, 0.11), C_TRAM_GOLD, bevel=0.015, ao_fn=ao)
    # Rounded roof shell + HVAC pods + diamond pantograph
    m.box((0, 0, 3.44), (L - 0.22, W - 0.18, 0.38), C_TRAM_ROOF, bevel=0.14, segments=2, ao_fn=ao)
    for ax in (-2.4, 2.4):
        m.box((ax, 0, 3.74), (2.15, 1.45, 0.32), C_AC_BODY, bevel=0.05, ao_fn=ao)
    # Pantograph frame on top
    m.box((0, 0, 3.72), (1.15, 1.10, 0.14), C_IRON, bevel=0.015, ao_fn=ao)
    m.box((0, 0, 4.35), (0.14, 1.45, 0.08), C_IRON_LIGHT, bevel=0.01, ao_fn=ao)
    for sx in (-1.0, 1.0):
        m.box((sx * 0.26, 0, 4.04), (0.06, 0.65, 0.68), C_IRON, bevel=0.008,
              rot=(0.0, sx * 0.38, 0.0), ao_fn=ao)

    # Side panoramic windows & doors (both -Y and +Y)
    for sy in (-1.0, 1.0):
        wy = sy * (W * 0.5 + 0.01)
        for wx in (-4.4, -2.9, -0.7, 0.7, 2.9, 4.4):
            m.box((wx, wy, 2.62), (1.16, 0.05, 0.92), C_GLASS, bevel=0.0, smooth=False, glass=True)
            m.box((wx, wy + sy * 0.01, 2.16), (1.22, 0.05, 0.06), C_IRON_LIGHT, bevel=0.008, ao_fn=ao)
        for dx in (-1.85, 1.85):
            m.box((dx, wy, 2.10), (1.02, 0.06, 2.02), C_TRAM_GREEN, bevel=0.015, ao_fn=ao)
            m.box((dx, wy + sy * 0.02, 2.58), (0.74, 0.04, 0.92), C_GLASS, bevel=0.0, smooth=False, glass=True)

    # Front & rear driver windows + glowing round headlights
    for sx in (-1.0, 1.0):
        fx = sx * (L * 0.5 + 0.01)
        for wy in (-0.56, 0.56):
            m.box((fx, wy, 2.62), (0.05, 0.92, 0.88), C_GLASS, bevel=0.0, smooth=False, glass=True)
        # Warm glowing round headlamp & destination sign
        m.cyl((fx + sx * 0.03, 0.0, 3.16), 0.14, 0.14, 0.10, C_LAMP_GLOW, segs=12,
              rot=(0.0, math.pi * 0.5, 0.0), smooth=False, glass=True)
        for ly in (-0.82, 0.82):
            m.cyl((fx + sx * 0.02, ly, 1.54), 0.11, 0.11, 0.08, C_LAMP_GLOW, segs=10,
                  rot=(0.0, math.pi * 0.5, 0.0), smooth=False, glass=True)
    return m.build(mat, col)


# ==============================================================================
# 7) Town_Crossing_Post & Town_Crossing_Bar: Iconic Japanese fumikiri crossing gate
# ==============================================================================
def build_crossing_gate(mat, col):
    mp = TownMesh('Town_Crossing_Post')
    ao = make_ao_fn(3.6)
    # Concrete base + yellow/black striped vertical pole
    mp.box((0, 0, 0.18), (0.58, 0.58, 0.42), C_CONCRETE, bevel=0.025, ao_fn=ao)
    for k in range(10):
        c = C_WARN_YELLOW if k % 2 == 0 else C_WARN_DARK
        mp.cyl((0, 0, 0.56 + k * 0.30), 0.085, 0.085, 0.30, c, segs=10, ao_fn=ao)
    # Iconic X crossbuck sign
    for rot_y in (0.62, -0.62):
        mp.box((0, -0.14, 2.92), (0.16, 0.05, 1.02), C_WARN_YELLOW, bevel=0.01,
               rot=(0.0, rot_y, 0.0), ao_fn=ao)
    # Twin flashing warning lamp housing
    mp.box((0, -0.16, 2.15), (0.78, 0.14, 0.34), C_WARN_DARK, bevel=0.02, ao_fn=ao)
    for lx in (-0.22, 0.22):
        mp.cyl((lx, -0.24, 2.15), 0.11, 0.11, 0.08, C_WARN_RED, segs=12,
               rot=(math.pi * 0.5, 0.0, 0.0), smooth=False, glass=True)
    # Gate motor box on side
    mp.box((0.26, 0.0, 1.05), (0.34, 0.34, 0.42), C_WARN_YELLOW, bevel=0.02, ao_fn=ao)
    mp.build(mat, col)

    # Separate striped barrier bar pivoted at (0,0,0), extending along +X (length 4.4m)
    mb = TownMesh('Town_Crossing_Bar')
    mb.box((-0.38, 0, 0), (0.55, 0.14, 0.18), C_WARN_DARK, bevel=0.02)
    segs = 9
    seg_l = 4.4 / segs
    for k in range(segs):
        c = C_WARN_YELLOW if k % 2 == 0 else C_WARN_DARK
        mb.cyl((0.18 + (k + 0.5) * seg_l, 0, 0), 0.045, 0.042, seg_l, c, segs=10,
               rot=(0.0, math.pi * 0.5, 0.0))
    mb.build(mat, col)


# ==============================================================================
# 8) Town_Utility_Pole: Japanese coastal concrete pole w/ crossarms, transformer & lamp
# ==============================================================================
def build_utility_pole(mat, col):
    m = TownMesh('Town_Utility_Pole')
    ao = make_ao_fn(8.8)
    m.cyl((0, 0, 4.4), 0.17, 0.11, 8.8, C_CONCRETE, segs=12, ao_fn=ao)
    # Warning yellow/black wrap near base
    m.cyl((0, 0, 1.15), 0.178, 0.174, 0.65, C_WARN_YELLOW, segs=12, ao_fn=ao)
    # Two metal crossarms & ceramic insulators
    for cz, cw in ((8.35, 1.75), (7.65, 1.45)):
        m.box((0, 0, cz), (cw, 0.09, 0.09), C_IRON_LIGHT, bevel=0.012, ao_fn=ao)
        for ix in (-cw * 0.42, 0.0, cw * 0.42):
            m.cyl((ix, 0, cz + 0.09), 0.045, 0.035, 0.10, C_TRIM, segs=8, ao_fn=ao)
    # Pole-mounted cylindrical transformer
    m.cyl((0.36, 0.0, 6.45), 0.24, 0.24, 0.72, C_IRON_LIGHT, segs=12, ao_fn=ao)
    # Streetlamp arm overhanging toward -Y (into road) + glowing warm lamp bulb
    m.box((0, -0.58, 5.55), (0.07, 1.16, 0.07), C_IRON, bevel=0.01, rot=(0.14, 0.0, 0.0), ao_fn=ao)
    m.box((0, -1.16, 5.66), (0.28, 0.42, 0.10), C_IRON_LIGHT, bevel=0.02, ao_fn=ao)
    m.box((0, -1.16, 5.58), (0.22, 0.34, 0.06), C_LAMP_GLOW, bevel=0.0, smooth=False, glass=True)
    return m.build(mat, col)


# ==============================================================================
# 9) Town_Vending & 10) Town_Battery_Cabinet & 11) Town_Bus_Stop
# ==============================================================================
def build_street_furniture(mat, col):
    # Vending machine
    mv = TownMesh('Town_Vending')
    ao = make_ao_fn(2.0)
    mv.box((0, 0, 0.96), (1.10, 0.72, 1.92), C_VEND_WHITE, bevel=0.03, ao_fn=ao)
    mv.box((0, -0.35, 1.48), (0.94, 0.05, 0.72), C_LAMP_GLOW, bevel=0.0, smooth=False, glass=True)
    mv.box((0, -0.36, 1.84), (1.02, 0.06, 0.18), C_VEND_RED, bevel=0.012, ao_fn=ao)
    mv.box((0, -0.35, 0.42), (0.86, 0.08, 0.30), C_IRON, bevel=0.015, ao_fn=ao)
    mv.build(mat, col)

    # Courier Battery-Swap Cabinet (yellow/charcoal lockers w/ green LED accents)
    mb = TownMesh('Town_Battery_Cabinet')
    ao_b = make_ao_fn(2.2)
    mb.box((0, 0, 1.05), (1.86, 0.68, 2.10), C_CABINET_CHARCOAL, bevel=0.03, ao_fn=ao_b)
    mb.box((0, -0.02, 2.16), (1.96, 0.88, 0.18), C_CABINET_YELLOW, bevel=0.025, ao_fn=ao_b)
    mb.box((0, -0.35, 1.92), (1.68, 0.05, 0.24), C_CABINET_YELLOW, bevel=0.012, ao_fn=ao_b)
    # 3x4 glowing battery locker bays
    for row in range(4):
        for col_i in range(3):
            bx = -0.52 + col_i * 0.52
            bz = 0.42 + row * 0.36
            mb.box((bx, -0.34, bz), (0.44, 0.05, 0.29), C_IRON_LIGHT, bevel=0.01, ao_fn=ao_b)
            mb.box((bx + 0.14, -0.37, bz + 0.07), (0.07, 0.03, 0.05), C_CABINET_LED,
                   bevel=0.0, smooth=False, glass=True)
    mb.build(mat, col)

    # Coastal Bus / Tram Stop Shelter
    ms = TownMesh('Town_Bus_Stop')
    ao_s = make_ao_fn(2.6)
    ms.box((0, 0, 2.48), (3.45, 1.48, 0.14), C_ROOF_BLUE, bevel=0.024, rot=(-0.10, 0.0, 0.0), ao_fn=ao_s)
    for px in (-1.45, 1.45):
        ms.cyl((px, 0.48, 1.24), 0.055, 0.055, 2.48, C_IRON, segs=10, ao_fn=ao_s)
    ms.box((0, 0.50, 1.32), (2.78, 0.05, 1.65), C_GLASS, bevel=0.0, smooth=False, glass=True)
    ms.box((0, 0.18, 0.48), (2.35, 0.46, 0.09), C_TIMBER_LIGHT, bevel=0.015, ao_fn=ao_s)
    for lx in (-0.92, 0.92):
        ms.box((lx, 0.18, 0.24), (0.09, 0.38, 0.46), C_IRON, bevel=0.01, ao_fn=ao_s)
    # Round Japanese bus stop lollipop sign beside shelter
    ms.cyl((-2.05, 0.0, 1.15), 0.04, 0.04, 2.30, C_IRON_LIGHT, segs=8, ao_fn=ao_s)
    ms.cyl((-2.05, 0.0, 2.18), 0.26, 0.26, 0.06, C_AWNING_BLUE, segs=16,
           rot=(math.pi * 0.5, 0.0, 0.0), ao_fn=ao_s)
    ms.build(mat, col)


def main():
    col = bpy.context.scene.collection
    mat = bpy.data.materials.new('CoastalTown_VertexColor')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    vcol = nt.nodes.new('ShaderNodeVertexColor')
    vcol.layer_name = 'Color'
    nt.links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.88

    build_shop_corner(mat, col)
    build_shop_tall(mat, col)
    build_shop_konbini(mat, col)
    build_house_slope_a(mat, col)
    build_house_slope_b(mat, col)
    build_tram_car(mat, col)
    build_crossing_gate(mat, col)
    build_utility_pole(mat, col)
    build_street_furniture(mat, col)

    out_path = Path(__file__).resolve().parent / 'coastal-town-kit.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_attributes=True,
        export_materials='EXPORT',
    )

    total_tris = 0
    for obj in col.objects:
        if obj.type == 'MESH':
            tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            total_tris += tris
            print(f'  {obj.name:24s}: {len(obj.data.vertices):5d} verts, {tris:5d} tris')
    print(f'Exported {out_path} ({out_path.stat().st_size / 1024:.1f} KB), total {total_tris} tris.')


if __name__ == '__main__':
    main()
