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
from mathutils.bvhtree import BVHTree

bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau

# Harmonized with src/morning/city-palette.js & time-of-day.js
C_GLASS = 0x527a78           # exact WINDOW_HEXES match -> dusk/night auto glow
C_LAMP_GLOW = 0xe8d798       # exact WINDOW_HEXES match -> warm lamp / headlight glow
C_PORCH_GLOW = 0xffe4a0      # exact PORCH_LAMP_HEXES match -> 100% deterministic warm night glow
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

# Hero Direction A ("Haikaze-so" coastal flat-roof zakkyo mixed-use building) palette
C_HERO_WALL = 0xf5ecd2
C_HERO_SLAB = 0xa6bc97
C_HERO_SLAB_DARK = 0x8ca37e
C_HERO_DECK = 0xcfc9b9
C_HERO_STEEL = 0x407570
C_HERO_STEEL_HI = 0x5c968e
C_HERO_DOOR = 0x6f988c
C_HERO_DOOR_FRAME = 0xbcc4bf
C_HERO_WOOD = 0x9b623d
C_HERO_WOOD_DARK = 0x68422b
C_HERO_NOREN = 0xc2382e
C_HERO_PIPE = 0xedeae0
C_HERO_POT = 0xb96c4a
C_HERO_TILE_A = 0xe5c5c2
C_HERO_TILE_B = 0xc8dfd6
C_HERO_TILE_C = 0xeee1b8
C_HERO_TILE_D = 0xcad6e6
C_CRATE_YELLOW = 0xebb936
C_CRATE_BLUE = 0x3568aa
C_CRATE_RED = 0xc84133
C_CRATE_GREEN = 0x3a8d58
C_BIKE_FRAME = 0x323b3f
C_BIKE_TIRE = 0x24282b
C_VEND_CYAN = 0x78c7d4
C_VEND_PINK = 0xebb0b8

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


# Exact 1024x1024 UV rectangles matching src/morning/coastal-detail-atlas.js (canvas pixels x0, y0, x1, y1)
UV_VEND_WHITE = (0, 0, 256, 512)
UV_VEND_PINK = (256, 0, 512, 512)
UV_AC_FRONT = (512, 0, 768, 256)
UV_MENU_BOARD = (768, 0, 1024, 384)
UV_WINDOW_SHOP = (512, 256, 768, 512)
UV_WINDOW_APT = (768, 384, 1024, 640)
UV_NOREN = [
    (0, 512, 128, 768),
    (128, 512, 256, 768),
    (256, 512, 384, 768),
    (384, 512, 512, 768),
]
UV_MOSAIC_TILE = (512, 512, 768, 768)
UV_WOOD_DOOR = (0, 768, 256, 1024)
UV_APT_DOOR = (256, 768, 512, 1024)
UV_LANTERN_GLOW = (512, 768, 768, 1024)
UV_CRATE_SIDE = (768, 640, 1024, 896)
UV_POSTER_WALL = (768, 896, 1024, 1024)

# Precomputed 20 Fibonacci-hemisphere unit ray directions for fast Blender BVHTree Contact AO baking
_AO_RAYS = []
_GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))
for _i in range(20):
    _z = 0.14 + 0.84 * ((_i + 0.5) / 20.0)
    _r = math.sqrt(max(0.0, 1.0 - _z * _z))
    _phi = _i * _GOLDEN_ANGLE
    _AO_RAYS.append((math.cos(_phi) * _r, math.sin(_phi) * _r, _z))


def _uv_bounds(rect, pad=2.0):
    x0, y0, x1, y1 = rect
    return (
        (x0 + pad) / 1024.0,
        1.0 - (y1 - pad) / 1024.0,  # v_bot (Blender V-up -> glTF flipY=false canvas bottom)
        (x1 - pad) / 1024.0,
        1.0 - (y0 + pad) / 1024.0,  # v_top (Blender V-up -> glTF flipY=false canvas top)
    )


class TownMesh:
    """Beveled, vertex-AO shaded (or BVH raycast-AO baked), multi-material architectural mesh builder."""

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

    def _finalize(self, bm, color, ao_fn=None, smooth=True, glass=False, mat_idx=0, ao_mode='full'):
        base = hex_srgb(color) if isinstance(color, int) else color
        col_layer = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            f.smooth = smooth
            f.material_index = mat_idx
            for loop in f.loops:
                if glass:
                    loop[col_layer] = base
                else:
                    p = loop.vert.co
                    ao = ao_fn(p, f.normal) if ao_fn else 1.0
                    cool = 0.22 if (ao_fn and f.normal.z < -0.35) else 0.0
                    loop[col_layer] = shade_srgb(base, ao, tint_cool=cool)
        eff_mode = 'none' if glass else ao_mode
        self.parts.append((bm, self._weighted_normals(bm), eff_mode))

    def box(self, center, size, color, bevel=0.024, segments=1, rot=(0.0, 0.0, 0.0),
            ao_fn=None, smooth=True, glass=False, mat_idx=0, ao_mode='full'):
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
        self._finalize(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass, mat_idx=mat_idx, ao_mode=ao_mode)

    def grid_box(self, center, size, color, step=0.65, bevel=0.028, rot=(0.0, 0.0, 0.0),
                 ao_fn=None, smooth=True, glass=False, mat_idx=0, ao_mode='full'):
        """Subdivided beveled box so BVH Contact AO resolves clean localized shadows around props & eaves."""
        sx, sy, sz = size
        nx = max(1, int(round(sx / step)))
        ny = max(1, int(round(sy / step)))
        nz = max(1, int(round(sz / step)))
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
        for axis_i, n_div, span in ((0, nx, sx), (1, ny, sy), (2, nz, sz)):
            if n_div <= 1:
                continue
            p_no = Vector((1.0 if axis_i == 0 else 0.0,
                           1.0 if axis_i == 1 else 0.0,
                           1.0 if axis_i == 2 else 0.0))
            for k in range(1, n_div):
                pos = -0.5 * span + (k / n_div) * span
                bmesh.ops.bisect_plane(
                    bm,
                    geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                    plane_co=p_no * pos,
                    plane_no=p_no,
                )
        bm.normal_update()
        if bevel > 0.0:
            b_off = min(bevel, min(sx / nx, sy / ny, sz / nz) * 0.30)
            if b_off > 0.002:
                sharp_edges = [
                    e for e in bm.edges
                    if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5
                ]
                if sharp_edges:
                    bmesh.ops.bevel(
                        bm, geom=sharp_edges, offset=b_off, segments=1,
                        profile=0.5, affect='EDGES', clamp_overlap=True,
                    )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass, mat_idx=mat_idx, ao_mode=ao_mode)

    def cyl(self, center, r_bot, r_top, height, color, segs=12, rot=(0.0, 0.0, 0.0),
            ao_fn=None, smooth=True, glass=False, mat_idx=0, ao_mode='full'):
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=r_bot, radius2=r_top, depth=height,
        )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass, mat_idx=mat_idx, ao_mode=ao_mode)

    def quad_uv(self, p0, p1, p2, p3, uv_rect, mat_idx=2, color=0xffffff, ao_mode='soft', double_sided=False):
        """UV-mapped quad (p0=BL, p1=BR, p2=TR, p3=TL, CCW outward normal) matched to 1024x1024 Detail Atlas."""
        u0, v_bot, u1, v_top = _uv_bounds(uv_rect)
        uvs = [(u0, v_bot), (u1, v_bot), (u1, v_top), (u0, v_top)]
        bm = bmesh.new()
        uv_layer = bm.loops.layers.uv.new('UVMap')
        vs = [bm.verts.new(Vector(p)) for p in (p0, p1, p2, p3)]
        f = bm.faces.new(vs)
        for loop, uv in zip(f.loops, uvs):
            loop[uv_layer].uv = uv
        if double_sided:
            vs_b = [bm.verts.new(Vector(p)) for p in (p1, p0, p3, p2)]
            fb = bm.faces.new(vs_b)
            for loop, uv in zip(fb.loops, uvs):
                loop[uv_layer].uv = uv
        self._finalize(bm, color, ao_fn=None, smooth=False, glass=False, mat_idx=mat_idx, ao_mode=ao_mode)

    def pipe_elbow(self, corner, dir_in, dir_out, radius, bend_r, color, segs_ring=10, segs_arc=6,
                   mat_idx=0, ao_fn=None):
        """Smooth curved 90-degree tubular pipe elbow connecting dir_in (entering corner) to dir_out (exiting)."""
        d_in = Vector(dir_in).normalized()
        d_out = Vector(dir_out).normalized()
        c_pt = Vector(corner)
        arc_c = c_pt - d_in * bend_r + d_out * bend_r
        r2 = d_in.cross(d_out)
        if r2.length < 1e-5:
            return
        r2.normalize()
        bm = bmesh.new()
        rings = []
        for s in range(segs_arc + 1):
            a = (s / segs_arc) * (math.pi * 0.5)
            ca, sa = math.cos(a), math.sin(a)
            p_ctr = arc_c + d_in * (bend_r * sa) - d_out * (bend_r * ca)
            r1 = d_in * sa - d_out * ca
            ring = []
            for k in range(segs_ring):
                phi = k * TAU / segs_ring
                vpos = p_ctr + (r1 * math.cos(phi) + r2 * math.sin(phi)) * radius
                ring.append(bm.verts.new(vpos))
            rings.append(ring)
        for s in range(segs_arc):
            ra, rb = rings[s], rings[s + 1]
            for k in range(segs_ring):
                nk = (k + 1) % segs_ring
                bm.faces.new((ra[k], ra[nk], rb[nk], rb[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=True, mat_idx=mat_idx)

    def leaf_blade(self, base_pt, fwd_dir, length, width, arch, color, mat_idx=0, ao_fn=None):
        """Arched, tapered, subtly cupped 3D botanical leaf blade (solid thin double-sided geometry)."""
        f = Vector(fwd_dir)
        f.z = 0.0
        if f.length < 1e-5:
            f = Vector((1.0, 0.0, 0.0))
        f.normalize()
        up = Vector((0.0, 0.0, 1.0))
        side = f.cross(up).normalized()
        b = Vector(base_pt)
        # 4 longitudinal stations from stem base -> mid-broad -> taper -> tip
        stations = [
            (0.00, 0.14, 0.00, 0.00),
            (0.32, 0.50, arch * 0.72, 0.014),
            (0.68, 0.42, arch * 0.96, 0.012),
            (1.00, 0.03, arch * 0.48, 0.00),
        ]
        bm = bmesh.new()
        thick = 0.009
        top_rings = []
        bot_rings = []
        for t, hw_f, z_off, cup in stations:
            ctr = b + f * (t * length) + up * z_off
            hw = width * hw_f
            p_l = ctr - side * hw + up * cup
            p_m = ctr
            p_r = ctr + side * hw + up * cup
            top_rings.append([bm.verts.new(p_l + up * thick * 0.5),
                              bm.verts.new(p_m + up * thick * 0.5),
                              bm.verts.new(p_r + up * thick * 0.5)])
            bot_rings.append([bm.verts.new(p_l - up * thick * 0.5),
                              bm.verts.new(p_m - up * thick * 0.5),
                              bm.verts.new(p_r - up * thick * 0.5)])
        for i in range(len(stations) - 1):
            ta, tb = top_rings[i], top_rings[i + 1]
            ba, bb = bot_rings[i], bot_rings[i + 1]
            for j in (0, 1):
                bm.faces.new((ta[j], ta[j + 1], tb[j + 1], tb[j]))
                bm.faces.new((ba[j + 1], ba[j], bb[j], bb[j + 1]))
            # Side edges
            bm.faces.new((ta[0], tb[0], bb[0], ba[0]))
            bm.faces.new((ta[2], ba[2], bb[2], tb[2]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self._finalize(bm, color, ao_fn=ao_fn, smooth=True, mat_idx=mat_idx)

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

    @staticmethod
    def _bake_bvh_contact_ao(merged, col_dst, face_ao_modes, max_dist=1.25):
        """Offline Blender BVHTree raycast soft pastel sky-cool Contact AO baked into vertex colors."""
        merged.normal_update()
        bvh = BVHTree.FromBMesh(merged)
        cache = {}
        n_rays = float(len(_AO_RAYS))

        def sample_ao(co, nor):
            key = (
                int(round(co.x * 60.0)), int(round(co.y * 60.0)), int(round(co.z * 60.0)),
                int(round(nor.x * 6.0)), int(round(nor.y * 6.0)), int(round(nor.z * 6.0)),
            )
            cached = cache.get(key)
            if cached is not None:
                return cached
            n = nor.normalized() if nor.length > 1e-6 else Vector((0.0, 0.0, 1.0))
            ref = Vector((1.0, 0.0, 0.0)) if abs(n.z) > 0.85 else Vector((0.0, 0.0, 1.0))
            t_vec = ref.cross(n).normalized()
            b_vec = n.cross(t_vec).normalized()
            origin = co + n * 0.028
            occ = 0.0
            for rx, ry, rz in _AO_RAYS:
                d = t_vec * rx + b_vec * ry + n * rz
                hit_d = max_dist
                # Analytical ground plane z = 0.0 for gentle sidewalk grounding
                if d.z < -0.01 and origin.z > 0.004:
                    tg = -origin.z / d.z
                    if 0.0 < tg < hit_d:
                        hit_d = tg
                loc, _hn, _idx, dist = bvh.ray_cast(origin, d, hit_d)
                if loc is not None and dist < hit_d:
                    hit_d = dist
                if hit_d < max_dist:
                    occ += (1.0 - hit_d / max_dist) ** 1.45
            occ_ratio = min(1.0, occ / n_rays)
            # Clean sunlit Ghibli occlusion curve: airy bright walls + crisp subtle contact shadows
            val = (1.0 - occ_ratio * 0.34) * (1.02 if n.z > 0.65 else 1.0)
            cache[key] = val
            return val

        for f, mode in zip(merged.faces, face_ao_modes):
            if mode == 'none':
                continue
            fn = f.normal
            mat_i = f.material_index
            for loop in f.loops:
                raw_ao = sample_ao(loop.vert.co, fn)
                if mode == 'soft' or mat_i == 2:
                    # Keep illustrated UV atlas faces vibrant & true-to-palette with gentle edge grounding
                    ao = 0.92 + 0.09 * max(0.0, min(1.0, raw_ao))
                elif mat_i == 1:
                    # Keep painted steel treads/railings/doors crisp pine-teal (never crushed black-green)
                    ao = 0.85 + 0.18 * max(0.0, min(1.0, raw_ao))
                else:
                    # Warm cream stucco & sage concrete: luminous open walls + clean pastel sky-cool crevices
                    ao = max(0.76, min(1.04, raw_ao))
                c = loop[col_dst]
                loop[col_dst] = shade_srgb((c[0], c[1], c[2], 1.0), ao, tint_cool=0.0)

    def build(self, shared_mat, collection, bake_raycast_ao=False):
        mats = shared_mat if isinstance(shared_mat, (list, tuple)) else [shared_mat]
        need_uv = len(mats) > 1 or any(bm.loops.layers.uv.active is not None for bm, _, _ in self.parts)
        merged = bmesh.new()
        col_dst = merged.loops.layers.color.new('Color')
        uv_dst = merged.loops.layers.uv.new('UVMap') if need_uv else None
        nor_list = []
        face_ao_modes = []
        for bm, nors, ao_mode in self.parts:
            col_src = bm.loops.layers.color.active
            uv_src = bm.loops.layers.uv.active
            vmap = {v: merged.verts.new(v.co) for v in bm.verts}
            for f in bm.faces:
                try:
                    nf = merged.faces.new([vmap[v] for v in f.verts])
                except ValueError:
                    continue
                nf.smooth = f.smooth
                nf.material_index = f.material_index
                face_ao_modes.append(ao_mode)
                for ol, nl in zip(f.loops, nf.loops):
                    nl[col_dst] = ol[col_src]
                    if uv_dst is not None:
                        nl[uv_dst].uv = ol[uv_src].uv if uv_src is not None else (0.01, 0.01)
                    nor_list.append(nors[ol])
            bm.free()

        if bake_raycast_ao:
            self._bake_bvh_contact_ao(merged, col_dst, face_ao_modes)

        mesh = bpy.data.meshes.new(self.name)
        merged.to_mesh(mesh)
        merged.free()
        for m_slot in mats:
            mesh.materials.append(m_slot)
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
    """True 3D framed window with >=3cm glass-to-wall separation (zero mobile Z-fighting)."""
    d_rec = 0.18
    if facing in ('-Y', '+Y'):
        sy = -1.0 if facing == '-Y' else 1.0
        # Glass sits strictly proud of the solid wall (back at +0.025m, front at +0.065m)
        m.box((x, y + sy * 0.045, z), (w - 0.10, 0.04, h - 0.10), C_GLASS,
              bevel=0.0, smooth=False, glass=True)
        # Thick protruding beveled casing & deep sill frame proud of glass (+0.08..+0.20m)
        m.box((x, y + sy * 0.10, z + h * 0.5 - 0.04), (w + 0.16, d_rec, 0.13), frame_col, bevel=0.015, ao_fn=ao_fn)
        m.box((x, y + sy * 0.12, z - h * 0.5 + 0.02), (w + 0.26, d_rec + 0.09, 0.12), frame_col, bevel=0.015, ao_fn=ao_fn)
        for s in (-1.0, 1.0):
            m.box((x + s * (w * 0.5 + 0.01), y + sy * 0.10, z), (0.12, d_rec, h + 0.05), frame_col, bevel=0.015, ao_fn=ao_fn)
        # Center mullions cleanly in front of glass (+0.075m)
        m.box((x, y + sy * 0.085, z), (0.055, 0.05, h - 0.06), frame_col, bevel=0.008, ao_fn=ao_fn)
        m.box((x, y + sy * 0.085, z - 0.06), (w - 0.06, 0.05, 0.055), frame_col, bevel=0.008, ao_fn=ao_fn)
        if shutter_col is not None:
            for s in (-1.0, 1.0):
                m.box((x + s * (w * 0.5 + 0.24), y + sy * 0.10, z), (0.30, 0.07, h + 0.02),
                      shutter_col, bevel=0.014, ao_fn=ao_fn)
        if flowerbox:
            m.box((x, y + sy * 0.20, z - h * 0.5 - 0.06), (w * 0.86, 0.22, 0.19),
                  C_TIMBER, bevel=0.016, ao_fn=ao_fn)
            for k in (-1, 0, 1):
                m.box((x + k * w * 0.25, y + sy * 0.21, z - h * 0.5 + 0.08), (0.20, 0.18, 0.14),
                      C_LEAF_MID, bevel=0.04, ao_fn=ao_fn)
    else:
        sx = -1.0 if facing == '-X' else 1.0
        m.box((x + sx * 0.045, y, z), (0.04, w - 0.10, h - 0.10), C_GLASS,
              bevel=0.0, smooth=False, glass=True)
        m.box((x + sx * 0.10, y, z + h * 0.5 - 0.04), (d_rec, w + 0.16, 0.13), frame_col, bevel=0.015, ao_fn=ao_fn)
        m.box((x + sx * 0.12, y, z - h * 0.5 + 0.02), (d_rec + 0.09, w + 0.26, 0.12), frame_col, bevel=0.015, ao_fn=ao_fn)
        for s in (-1.0, 1.0):
            m.box((x + sx * 0.10, y + s * (w * 0.5 + 0.01), z), (d_rec, 0.12, h + 0.05), frame_col, bevel=0.015, ao_fn=ao_fn)
        m.box((x + sx * 0.085, y, z), (0.05, 0.055, h - 0.06), frame_col, bevel=0.008, ao_fn=ao_fn)


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
    """Lived-in ground-floor East-Asian shopfront facing -Y (all glass >=4cm proud of wall)."""
    # Wide display glass pane cleanly proud of the solid wall at y_front
    win_w = w - 2.35
    win_x = -0.78 if door_x > 0 else 0.78
    m.box((win_x, y_front - 0.055, 1.48), (win_w, 0.05, 1.72), C_GLASS, bevel=0.0, smooth=False, glass=True)
    # Kickplate below display window
    m.box((win_x, y_front - 0.08, 0.34), (win_w + 0.14, 0.16, 0.62), C_STONE_CAP, bevel=0.018, ao_fn=ao_fn)
    # Mullions & frame proud of glass
    for t in (-0.50, -0.33, 0.33, 0.50):
        m.box((win_x + t * win_w, y_front - 0.09, 1.48), (0.07, 0.09, 1.82), C_TIMBER, bevel=0.01, ao_fn=ao_fn)
    m.box((win_x, y_front - 0.09, 0.64), (win_w + 0.14, 0.18, 0.10), C_TIMBER, bevel=0.014, ao_fn=ao_fn)
    m.box((win_x, y_front - 0.09, 2.36), (win_w + 0.14, 0.16, 0.11), C_TIMBER, bevel=0.014, ao_fn=ao_fn)

    # Entrance sliding door with inset glass strictly in front of door panel
    m.box((door_x, y_front - 0.06, 1.18), (1.36, 0.12, 2.36), C_TIMBER, bevel=0.016, ao_fn=ao_fn)
    m.box((door_x, y_front - 0.14, 1.44), (0.98, 0.04, 1.38), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((door_x, y_front - 0.17, 1.44), (0.06, 0.04, 1.42), C_TIMBER, bevel=0.008, ao_fn=ao_fn)
    # Stone entry step
    m.box((door_x, y_front - 0.28, 0.07), (1.62, 0.44, 0.14), C_CONCRETE, bevel=0.018, ao_fn=ao_fn)

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

    # Full-width bright konbini windows + automatic glass double doors (>=4.5cm proud of wall)
    m.box((-2.55, fy - 0.055, 1.56), (3.40, 0.05, 2.08), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((2.55, fy - 0.055, 1.56), (3.40, 0.05, 2.08), C_GLASS, bevel=0.0, smooth=False, glass=True)
    m.box((0.0, fy - 0.055, 1.36), (1.76, 0.05, 2.48), C_GLASS, bevel=0.0, smooth=False, glass=True)
    for mx in (-4.28, -2.55, -0.88, 0.0, 0.88, 2.55, 4.28):
        m.box((mx, fy - 0.08, 1.48), (0.10, 0.14, 2.75), C_IRON_LIGHT, bevel=0.01, ao_fn=ao)
    m.box((-2.55, fy - 0.08, 0.28), (3.56, 0.16, 0.56), C_CONCRETE, bevel=0.015, ao_fn=ao)
    m.box((2.55, fy - 0.08, 0.28), (3.56, 0.16, 0.56), C_CONCRETE, bevel=0.015, ao_fn=ao)

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
    # Entry door + tiled porch canopy (glass strictly proud of timber door)
    m.box((-1.85, fy - 0.06, 1.38), (1.18, 0.12, 2.20), C_TIMBER, bevel=0.016, ao_fn=ao)
    m.box((-1.85, fy - 0.135, 1.72), (0.42, 0.04, 0.56), C_GLASS, bevel=0.0, smooth=False, glass=True)
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

    # Side panoramic windows & doors (both -Y and +Y, cleanly proud of body)
    for sy in (-1.0, 1.0):
        wy = sy * (W * 0.5 + 0.045)
        for wx in (-4.4, -2.9, -0.7, 0.7, 2.9, 4.4):
            m.box((wx, wy, 2.62), (1.16, 0.045, 0.92), C_GLASS, bevel=0.0, smooth=False, glass=True)
            m.box((wx, wy + sy * 0.025, 2.16), (1.22, 0.05, 0.06), C_IRON_LIGHT, bevel=0.008, ao_fn=ao)
        for dx in (-1.85, 1.85):
            m.box((dx, sy * (W * 0.5 + 0.03), 2.10), (1.02, 0.06, 2.02), C_TRAM_GREEN, bevel=0.015, ao_fn=ao)
            m.box((dx, sy * (W * 0.5 + 0.08), 2.58), (0.74, 0.04, 0.92), C_GLASS, bevel=0.0, smooth=False, glass=True)

    # Front & rear driver windows + glowing round headlights
    for sx in (-1.0, 1.0):
        fx = sx * (L * 0.5 + 0.045)
        for wy in (-0.56, 0.56):
            m.box((fx, wy, 2.62), (0.045, 0.92, 0.88), C_GLASS, bevel=0.0, smooth=False, glass=True)
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


# ==============================================================================
# 12) Town_Hero_Haikaze: Direction A Benchmark Hero Building ("海风庄")
#     2.5-story flat-roofed concrete coastal zakkyo mixed-use building with:
#     - 1F corner noodle shopfront (red 4-panel noren, cedar sliding doors,
#       pastel mosaic tile wainscot, vintage leaning bicycle, colorful crates)
#     - Corner glowing vending machine + AC unit tucked under 2F concrete overhang
#     - Real walkable exterior pine-teal painted steel staircase (14 steps)
#     - 2F recessed open-air L-shaped concrete corridor (Doors 201 & 202,
#       intercoms, electric meter boxes, warm sconces, AC units, potted plants)
#     - Sculpted white bent PVC drainpipes + flat sage-green parapet + rooftop
#       pine-teal guardrail & utility penthouse
#
#     Walkable geometry contract (matched 1:1 in src/morning/coastal-town.js):
#     - 2F L-corridor deck top: bz = 3.25m, bx in [-4.20..+4.25], by in [-3.90..-2.20]
#       and bx in [+2.55..+4.25], by in [-3.90..+3.90]
#     - Exterior staircase: bx in [+4.25..+5.60]
#       * bottom concrete pad: by in [-2.70..-1.95], top bz = 0.12m
#       * 14 steps: by = -1.95 (bz = 0.12m) -> by = +2.35 (bz = 3.25m)
#       * top landing bridge: by in [+2.35..+3.80], top bz = 3.25m
# ==============================================================================
def _add_uv_panel(m, cx, cy, cz, w, h, facing, uv_rect, color=0xffffff, ao_mode='soft', double_sided=False):
    """Axis-aligned UV-mapped quad cleanly oriented outward on -Y/+Y/+X/-X faces."""
    hw, hh = w * 0.5, h * 0.5
    if facing == '-Y':
        m.quad_uv((cx - hw, cy, cz - hh), (cx + hw, cy, cz - hh),
                  (cx + hw, cy, cz + hh), (cx - hw, cy, cz + hh),
                  uv_rect, mat_idx=2, color=color, ao_mode=ao_mode, double_sided=double_sided)
    elif facing == '+Y':
        m.quad_uv((cx + hw, cy, cz - hh), (cx - hw, cy, cz - hh),
                  (cx - hw, cy, cz + hh), (cx + hw, cy, cz + hh),
                  uv_rect, mat_idx=2, color=color, ao_mode=ao_mode, double_sided=double_sided)
    elif facing == '+X':
        m.quad_uv((cx, cy - hw, cz - hh), (cx, cy + hw, cz - hh),
                  (cx, cy + hw, cz + hh), (cx, cy - hw, cz + hh),
                  uv_rect, mat_idx=2, color=color, ao_mode=ao_mode, double_sided=double_sided)
    elif facing == '-X':
        m.quad_uv((cx, cy + hw, cz - hh), (cx, cy - hw, cz - hh),
                  (cx, cy - hw, cz + hh), (cx, cy + hw, cz + hh),
                  uv_rect, mat_idx=2, color=color, ao_mode=ao_mode, double_sided=double_sided)


def _add_botanical_plant(m, x, y, z, scale=1.0, seed=0):
    """Terracotta pot with woody stems & 12 arched, cupped 3D botanical leaf blades (zero blocky cubes!)."""
    s = scale
    # Tapered terracotta pot + rolled rim + rich dark soil
    m.cyl((x, y, z + 0.16 * s), 0.125 * s, 0.175 * s, 0.32 * s, C_HERO_POT, segs=12, mat_idx=0)
    m.cyl((x, y, z + 0.315 * s), 0.192 * s, 0.192 * s, 0.055 * s, C_HERO_POT, segs=12, mat_idx=0)
    m.cyl((x, y, z + 0.328 * s), 0.158 * s, 0.158 * s, 0.028 * s, C_TIMBER, segs=10, mat_idx=0)
    # 3 slim woody central stems rising slightly splayed
    for k, (ox, oy, h_st) in enumerate(((0.0, 0.0, 0.28), (0.04, -0.03, 0.22), (-0.04, 0.03, 0.24))):
        m.cyl((x + ox * s, y + oy * s, z + (0.33 + h_st * 0.5) * s),
              0.016 * s, 0.011 * s, h_st * s, 0x5c4a32, segs=6,
              rot=(oy * 2.5, -ox * 2.5, 0.0), mat_idx=0)
    # Two lush tiers of arched botanical leaf blades fanning organically around pot
    greens = (0x54914c, 0x67a45a, 0x457d41, 0x76b064)
    tiers = [
        (7, 0.37, 0.34, 0.125, 0.14),  # lower broader spreading fronds
        (5, 0.50, 0.27, 0.105, 0.20),  # upper upright crown leaves
    ]
    idx = 0
    for count, z_base, l_len, l_wid, arch in tiers:
        for i in range(count):
            ang = (i + 0.35 * seed + 0.5 * idx) * TAU / count
            dx, dy = math.cos(ang), math.sin(ang)
            col = greens[(idx + seed) % len(greens)]
            m.leaf_blade(
                (x + dx * 0.03 * s, y + dy * 0.03 * s, z + z_base * s),
                (dx, dy, 0.0),
                l_len * s * (0.90 + 0.18 * ((i + seed) % 3) * 0.5),
                l_wid * s,
                arch * s,
                col,
                mat_idx=0,
            )
            idx += 1


def _add_open_crate(m, x, y, z, col, rot_z=0.0, bottles=False, exposed='-Y'):
    """Hollow Japanese plastic beverage crate with molded lattice ribs & visible glass bottles inside!"""
    cw, cd, ch = 0.44, 0.34, 0.28
    wt = 0.028
    cos_r, sin_r = math.cos(rot_z), math.sin(rot_z)

    def pt(lx, ly, lz):
        return (x + lx * cos_r - ly * sin_r, y + lx * sin_r + ly * cos_r, z + lz)

    # Bottom floor plate + 4 thin side walls + thickened top rim lip (true hollow interior!)
    m.box(pt(0.0, 0.0, 0.02), (cw, cd, 0.04), col, bevel=0.008, rot=(0.0, 0.0, rot_z), mat_idx=0)
    for sy in (-1.0, 1.0):
        m.box(pt(0.0, sy * (cd * 0.5 - wt * 0.5), ch * 0.5), (cw, wt, ch), col,
              bevel=0.008, rot=(0.0, 0.0, rot_z), mat_idx=0)
        m.box(pt(0.0, sy * (cd * 0.5), ch - 0.018), (cw + 0.018, 0.036, 0.036), col,
              bevel=0.006, rot=(0.0, 0.0, rot_z), mat_idx=0)
    for sx in (-1.0, 1.0):
        m.box(pt(sx * (cw * 0.5 - wt * 0.5), 0.0, ch * 0.5), (wt, cd - wt, ch), col,
              bevel=0.008, rot=(0.0, 0.0, rot_z), mat_idx=0)
        m.box(pt(sx * (cw * 0.5), 0.0, ch - 0.018), (0.036, cd + 0.018, 0.036), col,
              bevel=0.006, rot=(0.0, 0.0, rot_z), mat_idx=0)
    # UV molded crate lattice detail panel on visible outer side (tinted by crate color!)
    if exposed == '-Y' and abs(rot_z) < 0.08:
        _add_uv_panel(m, x, y - cd * 0.5 - 0.010, z + ch * 0.5, cw - 0.04, ch - 0.04,
                      '-Y', UV_CRATE_SIDE, color=col, ao_mode='full')
    elif exposed == '+X' and abs(rot_z) < 0.08:
        _add_uv_panel(m, x + cw * 0.5 + 0.010, y, z + ch * 0.5, cd - 0.04, ch - 0.04,
                      '+X', UV_CRATE_SIDE, color=col, ao_mode='full')

    if bottles:
        # 6 glossy glass soda / beer bottles visibly rising out of the hollow crate!
        b_cols = (0x7a4622, 0x3b8a57, 0x4ca4c9, 0x7a4622, 0x3b8a57, 0x4ca4c9)
        idx = 0
        for bx in (-0.12, 0.0, 0.12):
            for by in (-0.075, 0.075):
                bc = b_cols[idx % len(b_cols)]
                m.cyl(pt(bx, by, 0.17), 0.036, 0.034, 0.22, bc, segs=8, mat_idx=1)
                m.cyl(pt(bx, by, 0.305), 0.032, 0.014, 0.065, bc, segs=8, mat_idx=1)
                m.cyl(pt(bx, by, 0.345), 0.016, 0.016, 0.022, 0xf2eee0, segs=8, mat_idx=1)
                idx += 1


def _add_vintage_bicycle(m, x, y, z, yaw=0.0):
    """Compact stylized Japanese mamachari bicycle with true tangent spoked rims & semi-gloss metal frame."""
    cos_y, sin_y = math.cos(yaw), math.sin(yaw)

    def pt(lx, ly, lz):
        return (x + lx * cos_y - ly * sin_y, y + lx * sin_y + ly * cos_y, z + lz)

    # Front & rear open spoked wheels (r = 0.31m) built from tangent tire segments + metal spokes
    for wx in (-0.54, 0.54):
        segs = 16
        r_mid = 0.285
        seg_len = 2.0 * math.pi * r_mid / segs + 0.010
        for k in range(segs):
            ang = (k + 0.5) * TAU / segs
            rx = wx + math.cos(ang) * r_mid
            rz = 0.31 + math.sin(ang) * r_mid
            m.box(pt(rx, 0.0, rz), (0.042, 0.044, seg_len), C_BIKE_TIRE, bevel=0.008,
                  rot=(0.0, -ang, yaw), mat_idx=0)
        for sa in (0.0, math.pi * 0.25, math.pi * 0.5, math.pi * 0.75):
            m.box(pt(wx, 0.0, 0.31), (0.013, 0.013, 0.54), C_IRON_LIGHT, bevel=0.0,
                  rot=(0.0, sa, yaw), mat_idx=1)
        m.cyl(pt(wx, 0.0, 0.31), 0.042, 0.042, 0.075, C_IRON_LIGHT, segs=10,
              rot=(math.pi * 0.5, 0.0, yaw), mat_idx=1)
        m.box(pt(wx, 0.0, 0.635), (0.36, 0.058, 0.032), C_BIKE_FRAME, bevel=0.01,
              rot=(0.0, 0.0, yaw), mat_idx=1)

    # Semi-gloss painted bicycle frame tubes
    m.box(pt(-0.08, 0.0, 0.56), (0.64, 0.04, 0.04), C_BIKE_FRAME, bevel=0.008,
          rot=(0.0, -0.35, yaw), mat_idx=1)
    m.box(pt(-0.02, 0.0, 0.42), (0.58, 0.035, 0.035), C_BIKE_FRAME, bevel=0.008,
          rot=(0.0, -0.58, yaw), mat_idx=1)
    m.box(pt(-0.24, 0.0, 0.56), (0.04, 0.04, 0.52), C_BIKE_FRAME, bevel=0.008,
          rot=(0.0, -0.22, yaw), mat_idx=1)
    m.box(pt(0.42, 0.0, 0.62), (0.04, 0.04, 0.68), C_BIKE_FRAME, bevel=0.008,
          rot=(0.0, -0.26, yaw), mat_idx=1)
    m.box(pt(-0.32, 0.0, 0.34), (0.48, 0.035, 0.035), C_BIKE_FRAME, bevel=0.008,
          rot=(0.0, 0.10, yaw), mat_idx=1)
    # Leather saddle
    m.box(pt(-0.28, 0.0, 0.85), (0.24, 0.14, 0.065), C_HERO_WOOD_DARK, bevel=0.02,
          rot=(0.0, 0.0, yaw), mat_idx=0)
    # Chrome handlebar + grips
    m.box(pt(0.36, 0.0, 0.94), (0.035, 0.48, 0.035), C_IRON_LIGHT, bevel=0.008,
          rot=(0.0, 0.0, yaw), mat_idx=1)
    # Front wire basket + silver rim
    m.box(pt(0.56, 0.0, 0.82), (0.28, 0.34, 0.24), C_BIKE_FRAME, bevel=0.014,
          rot=(0.0, 0.0, yaw), mat_idx=1)
    m.box(pt(0.56, 0.0, 0.935), (0.30, 0.36, 0.028), C_IRON_LIGHT, bevel=0.006,
          rot=(0.0, 0.0, yaw), mat_idx=1)


def _add_hero_vending(m, x, y, z, facing='+X', variant='white'):
    """Detailed UV-illustrated Japanese drink vending machine (enamel metal body + backlit showcase)."""
    w, d, h = 0.96, 0.48, 1.88
    body_col = C_VEND_PINK if variant == 'pink' else C_VEND_WHITE
    uv_rect = UV_VEND_PINK if variant == 'pink' else UV_VEND_WHITE
    if facing == '+X':
        # Semi-gloss enameled steel cabinet + recessed leveling plinth
        m.box((x, y, z + 0.04), (d - 0.04, w - 0.04, 0.08), C_WARN_DARK, bevel=0.01, mat_idx=1)
        m.box((x, y, z + h * 0.5 + 0.02), (d, w, h - 0.04), body_col, bevel=0.026, mat_idx=1)
        # Illustrated front face proud by 1.4cm (zero Z-fighting, glowing drink rows & poster at night!)
        _add_uv_panel(m, x + d * 0.5 + 0.014, y, z + h * 0.5 + 0.02, w - 0.04, h - 0.08,
                      '+X', uv_rect, color=0xffffff, ao_mode='soft')
    else:
        m.box((x, y, z + 0.04), (w - 0.04, d - 0.04, 0.08), C_WARN_DARK, bevel=0.01, mat_idx=1)
        m.box((x, y, z + h * 0.5 + 0.02), (w, d, h - 0.04), body_col, bevel=0.026, mat_idx=1)
        _add_uv_panel(m, x, y - d * 0.5 - 0.014, z + h * 0.5 + 0.02, w - 0.04, h - 0.08,
                      '-Y', uv_rect, color=0xffffff, ao_mode='soft')


def _add_hero_ac_unit(m, x, y, z, facing='-Y'):
    """Japanese outdoor AC compressor with UV radial fan grille, brand badge & wrapped copper refrigerant pipe!"""
    if facing == '-Y':
        m.box((x, y - 0.18, z), (0.78, 0.36, 0.58), C_AC_BODY, bevel=0.024, mat_idx=1)
        _add_uv_panel(m, x, y - 0.372, z, 0.72, 0.52, '-Y', UV_AC_FRONT, color=0xffffff, ao_mode='full')
        for s in (-0.28, 0.28):
            m.box((x + s, y - 0.15, z - 0.33), (0.06, 0.34, 0.055), C_IRON_LIGHT, bevel=0.008, mat_idx=1)
        # Wrapped insulated white copper pipe exiting +X side and curving neatly into wall sleeve!
        m.cyl((x + 0.44, y - 0.18, z - 0.14), 0.026, 0.026, 0.12, C_HERO_PIPE, segs=8,
              rot=(0.0, math.pi * 0.5, 0.0), mat_idx=0)
        m.pipe_elbow((x + 0.54, y - 0.18, z - 0.14), (1, 0, 0), (0, 1, 0), 0.026, 0.06, C_HERO_PIPE, mat_idx=0)
        m.cyl((x + 0.54, y - 0.07, z - 0.14), 0.026, 0.026, 0.12, C_HERO_PIPE, segs=8,
              rot=(math.pi * 0.5, 0.0, 0.0), mat_idx=0)
        m.cyl((x + 0.54, y - 0.015, z - 0.14), 0.052, 0.052, 0.035, C_AC_BODY, segs=10,
              rot=(math.pi * 0.5, 0.0, 0.0), mat_idx=1)
    elif facing == '+X':
        m.box((x + 0.18, y, z), (0.36, 0.78, 0.58), C_AC_BODY, bevel=0.024, mat_idx=1)
        _add_uv_panel(m, x + 0.372, y, z, 0.72, 0.52, '+X', UV_AC_FRONT, color=0xffffff, ao_mode='full')
        for s in (-0.28, 0.28):
            m.box((x + 0.15, y + s, z - 0.33), (0.34, 0.06, 0.055), C_IRON_LIGHT, bevel=0.008, mat_idx=1)
        # Wrapped refrigerant pipe exiting +Y side and curving into wall duct cap
        m.cyl((x + 0.18, y + 0.44, z - 0.14), 0.026, 0.026, 0.12, C_HERO_PIPE, segs=8,
              rot=(math.pi * 0.5, 0.0, 0.0), mat_idx=0)
        m.pipe_elbow((x + 0.18, y + 0.54, z - 0.14), (0, 1, 0), (-1, 0, 0), 0.026, 0.06, C_HERO_PIPE, mat_idx=0)
        m.cyl((x + 0.07, y + 0.54, z - 0.14), 0.026, 0.026, 0.12, C_HERO_PIPE, segs=8,
              rot=(0.0, math.pi * 0.5, 0.0), mat_idx=0)
        m.cyl((x + 0.015, y + 0.54, z - 0.14), 0.052, 0.052, 0.035, C_AC_BODY, segs=10,
              rot=(0.0, math.pi * 0.5, 0.0), mat_idx=1)


def _add_hero_window(m, x, y, z, w, h, facing='-Y', frame_col=C_HERO_DOOR_FRAME,
                     frame_mat=1, uv_rect=UV_WINDOW_APT):
    """3D aluminum/wood framed window with glossy sky-reflected & night-curtain-lit UV glass."""
    d_rec = 0.18
    if facing in ('-Y', '+Y'):
        sy = -1.0 if facing == '-Y' else 1.0
        _add_uv_panel(m, x, y + sy * 0.050, z, w - 0.10, h - 0.10, facing, uv_rect, ao_mode='soft')
        m.box((x, y + sy * 0.10, z + h * 0.5 - 0.04), (w + 0.16, d_rec, 0.12), frame_col, bevel=0.014, mat_idx=frame_mat)
        m.box((x, y + sy * 0.12, z - h * 0.5 + 0.02), (w + 0.24, d_rec + 0.08, 0.11), frame_col, bevel=0.014, mat_idx=frame_mat)
        for s in (-1.0, 1.0):
            m.box((x + s * (w * 0.5 + 0.01), y + sy * 0.10, z), (0.11, d_rec, h + 0.04), frame_col, bevel=0.014, mat_idx=frame_mat)
        m.box((x, y + sy * 0.092, z), (0.050, 0.045, h - 0.06), frame_col, bevel=0.008, mat_idx=frame_mat)
        m.box((x, y + sy * 0.092, z - 0.05), (w - 0.06, 0.045, 0.048), frame_col, bevel=0.008, mat_idx=frame_mat)
    else:
        sx = -1.0 if facing == '-X' else 1.0
        _add_uv_panel(m, x + sx * 0.050, y, z, w - 0.10, h - 0.10, facing, uv_rect, ao_mode='soft')
        m.box((x + sx * 0.10, y, z + h * 0.5 - 0.04), (d_rec, w + 0.16, 0.12), frame_col, bevel=0.014, mat_idx=frame_mat)
        m.box((x + sx * 0.12, y, z - h * 0.5 + 0.02), (d_rec + 0.08, w + 0.24, 0.11), frame_col, bevel=0.014, mat_idx=frame_mat)
        for s in (-1.0, 1.0):
            m.box((x + sx * 0.10, y + s * (w * 0.5 + 0.01), z), (d_rec, 0.11, h + 0.04), frame_col, bevel=0.014, mat_idx=frame_mat)
        m.box((x + sx * 0.092, y, z), (0.045, 0.050, h - 0.06), frame_col, bevel=0.008, mat_idx=frame_mat)


def _add_aframe_menu(m, x, y, z, yaw=0.0):
    """Charming Japanese cedar A-frame sidewalk ramen chalkboard menu stand (A字看板)."""
    w, h = 0.54, 0.82
    tilt = 0.20
    cos_y, sin_y = math.cos(yaw), math.sin(yaw)

    def pt(lx, ly, lz):
        return (x + lx * cos_y - ly * sin_y, y + lx * sin_y + ly * cos_y, z + lz)

    # Front & rear easel wooden legs forming true 'A' meeting cleanly at top hinge (rot_x=-tilt tilts +Z -> +Y)
    for side in (-1.0, 1.0):
        m.box(pt(side * 0.27, -0.10, 0.44), (0.042, 0.036, 0.90), C_HERO_WOOD, bevel=0.008,
              rot=(-tilt, 0.0, yaw), mat_idx=0)
        m.box(pt(side * 0.27,  0.10, 0.44), (0.042, 0.036, 0.90), C_HERO_WOOD_DARK, bevel=0.008,
              rot=(tilt, 0.0, yaw), mat_idx=0)
    m.box(pt(0.0, 0.0, 0.87), (0.58, 0.055, 0.042), C_HERO_WOOD_DARK, bevel=0.008, rot=(0.0, 0.0, yaw), mat_idx=0)
    # Wooden backing board tilted cleanly along front easel plane (top leans +Y toward hinge)
    m.box(pt(0.0, -0.11, 0.49), (w, 0.032, h - 0.06), C_HERO_WOOD_DARK, bevel=0.01,
          rot=(-tilt, 0.0, yaw), mat_idx=0)
    # UV-mapped chalk menu board proud of front face (strictly parallel to front backing board!)
    hw = (w - 0.03) * 0.5
    z_bot, z_top = 0.14, 0.84
    y_bot = -0.11 - 0.028 - (0.49 - z_bot) * math.sin(tilt)
    y_top = -0.11 - 0.028 + (z_top - 0.49) * math.sin(tilt)
    m.quad_uv(pt(-hw, y_bot, z_bot), pt(hw, y_bot, z_bot),
              pt(hw, y_top, z_top), pt(-hw, y_top, z_top),
              UV_MENU_BOARD, mat_idx=2, color=0xffffff, ao_mode='soft')


def _add_apartment_door(m, x_wall, y_center, z_floor, meter_side=-1.0):
    """Japanese 2F painted steel apartment door with UV panel detail, peephole, intercom, meter & glowing sconce."""
    dw, dh = 0.98, 2.12
    # Semi-gloss aluminum outer frame proud of wall
    m.box((x_wall + 0.04, y_center, z_floor + dh * 0.5), (0.10, dw + 0.14, dh + 0.08), C_HERO_DOOR_FRAME,
          bevel=0.012, mat_idx=1)
    # Solid steel door leaf + UV panel/peephole/mailslot overlay cleanly proud by 1.2cm
    m.box((x_wall + 0.055, y_center, z_floor + dh * 0.5), (0.06, dw, dh), C_HERO_DOOR, bevel=0.012, mat_idx=1)
    _add_uv_panel(m, x_wall + 0.098, y_center, z_floor + dh * 0.5, dw - 0.02, dh - 0.02,
                  '+X', UV_APT_DOOR, color=0xffffff, ao_mode='full')
    # Brushed stainless door lever handle
    m.box((x_wall + 0.11, y_center - 0.36, z_floor + 1.02), (0.026, 0.055, 0.17), C_IRON_LIGHT, bevel=0.006, mat_idx=1)
    m.box((x_wall + 0.14, y_center - 0.30, z_floor + 1.02), (0.036, 0.13, 0.030), C_HERO_PIPE, bevel=0.006, mat_idx=1)
    # Intercom & doorbell panel mounted cleanly beside door frame
    iy = y_center + meter_side * 0.66
    m.box((x_wall + 0.045, iy, z_floor + 1.32), (0.07, 0.14, 0.22), C_HERO_PIPE, bevel=0.01, mat_idx=1)
    m.box((x_wall + 0.085, iy, z_floor + 1.38), (0.02, 0.08, 0.07), C_IRON, bevel=0.004, mat_idx=1)
    # Electric meter box & metal conduit mounted high beside door
    m.box((x_wall + 0.08, iy, z_floor + 2.38), (0.14, 0.22, 0.30), C_AC_BODY, bevel=0.014, mat_idx=1)
    m.box((x_wall + 0.155, iy, z_floor + 2.40), (0.025, 0.12, 0.11), C_IRON, bevel=0.004, mat_idx=1)
    m.cyl((x_wall + 0.04, iy, z_floor + 2.75), 0.022, 0.022, 0.52, C_IRON_LIGHT, segs=8, mat_idx=1)
    # Deterministic glowing warm frosted-glass corridor bulkhead sconce above door
    m.box((x_wall + 0.055, y_center, z_floor + 2.42), (0.08, 0.28, 0.16), C_HERO_STEEL, bevel=0.012, mat_idx=1)
    _add_uv_panel(m, x_wall + 0.110, y_center, z_floor + 2.42, 0.22, 0.11,
                  '+X', UV_LANTERN_GLOW, color=0xffffff, ao_mode='soft')


def _add_railing_run(m, p0, p1, z_base, height=1.02, spacing=0.28, col=C_HERO_STEEL):
    """Crisp semi-gloss painted steel railing run (top rail, lower rail, dense vertical pickets)."""
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 0.05:
        return
    ang = math.atan2(dy, dx)
    mx, my = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    m.box((mx, my, z_base + height), (length + 0.06, 0.068, 0.056), col, bevel=0.012, rot=(0.0, 0.0, ang), mat_idx=1)
    m.box((mx, my, z_base + 0.14), (length, 0.045, 0.040), col, bevel=0.008, rot=(0.0, 0.0, ang), mat_idx=1)
    for px, py in (p0, p1):
        m.box((px, py, z_base + height * 0.5), (0.070, 0.070, height), col, bevel=0.012, mat_idx=1)
    n = max(2, int(round(length / spacing)))
    for i in range(1, n):
        t = i / n
        px = x0 + dx * t
        py = y0 + dy * t
        m.box((px, py, z_base + 0.14 + (height - 0.14) * 0.5), (0.032, 0.032, height - 0.16),
              col, bevel=0.006, mat_idx=1)


def build_hero_haikaze(hero_mats, col):
    m = TownMesh('Town_Hero_Haikaze')

    # 1) Deep concrete foundation plinth & crisp sidewalk skirt
    m.box((0.0, 0.18, -1.16), (8.68, 7.82, 2.48), C_STONE_PLINTH, bevel=0.03, mat_idx=0)
    m.box((-0.05, 0.0, 0.04), (8.72, 7.98, 0.08), C_HERO_DECK, bevel=0.018, mat_idx=0)

    # 2) 1F Solid Shop/Storage Volume: bx in [-4.20, +3.80], by in [-3.52, +3.90], bz in [0.0, 2.94]
    #    Subdivided grid_box ensures Contact AO hugs eaves, windows, crates & pipes without darkening open stucco!
    m.grid_box((-0.20, 0.19, 1.48), (8.00, 7.42, 2.94), C_HERO_WALL, step=0.60, bevel=0.032, mat_idx=0)
    m.box((-0.20, 0.19, 0.14), (8.08, 7.50, 0.22), C_CONCRETE, bevel=0.018, mat_idx=0)

    # 3) Iconic Muted Sage-Green 2F Concrete Balcony Slab (walkable top at exact bz = 3.25m)
    m.grid_box((0.0, 0.0, 3.085), (8.64, 7.92, 0.33), C_HERO_SLAB, step=0.75, bevel=0.025, mat_idx=0)
    m.grid_box((0.0, 0.0, 3.245), (8.42, 7.70, 0.02), C_HERO_DECK, step=0.75, bevel=0.004, mat_idx=0)
    m.box((0.0, 0.0, 2.91), (8.50, 7.78, 0.04), C_HERO_SLAB_DARK, bevel=0.008, mat_idx=0)

    # 4) 2F Recessed Apartment Core: bx in [-4.20, +2.55], by in [-2.20, +3.90], bz in [3.25, 6.42]
    m.grid_box((-0.825, 0.85, 4.835), (6.75, 6.10, 3.17), C_HERO_WALL, step=0.60, bevel=0.032, mat_idx=0)
    m.box((-0.825, 0.85, 3.32), (6.80, 6.15, 0.14), C_CONCRETE, bevel=0.012, mat_idx=0)

    # 5) Bold Flat Rooftop Sage-Green Concrete Parapet Overhang + Metal Rooftop Guardrail
    m.grid_box((0.0, 0.0, 6.74), (8.80, 8.10, 0.72), C_HERO_SLAB, step=0.80, bevel=0.032, mat_idx=0)
    m.box((0.0, 0.0, 7.04), (8.24, 7.54, 0.14), C_CONCRETE, bevel=0.012, mat_idx=0)
    _add_railing_run(m, (-4.16, -3.82), (4.16, -3.82), 7.10, height=0.88, spacing=0.34)
    _add_railing_run(m, (4.16, -3.82), (4.16, 3.82), 7.10, height=0.88, spacing=0.34)
    _add_railing_run(m, (4.16, 3.82), (-4.16, 3.82), 7.10, height=0.88, spacing=0.34)
    _add_railing_run(m, (-4.16, 3.82), (-4.16, -3.82), 7.10, height=0.88, spacing=0.34)
    # Rooftop stair/utility penthouse + metal exhaust stack
    m.box((-2.25, 1.55, 7.72), (2.15, 2.05, 1.38), C_HERO_WALL, bevel=0.028, mat_idx=0)
    m.box((-2.25, 1.55, 8.44), (2.32, 2.22, 0.12), C_HERO_SLAB, bevel=0.02, mat_idx=0)
    m.box((1.85, 2.15, 7.46), (0.95, 0.72, 0.72), C_AC_BODY, bevel=0.025, mat_idx=1)
    m.cyl((1.05, 2.35, 7.45), 0.14, 0.14, 0.68, C_IRON_LIGHT, segs=10, mat_idx=1)

    # 6) 2F Open-Air L-Shaped Corridor Balustrade (semi-gloss painted steel)
    _add_railing_run(m, (-4.18, -2.20), (-4.18, -3.86), 3.25, height=1.02, spacing=0.28)
    _add_railing_run(m, (-4.18, -3.86), (4.18, -3.86), 3.25, height=1.02, spacing=0.28)
    _add_railing_run(m, (4.18, -3.86), (4.18, 2.35), 3.25, height=1.02, spacing=0.28)
    _add_railing_run(m, (2.55, 3.86), (4.22, 3.86), 3.25, height=1.02, spacing=0.28)

    # 7) HERO EXTERIOR SEMI-GLOSS PAINTED STEEL STAIRCASE: bx in [+4.25, +5.60]
    m.box((4.94, -2.325, 0.06), (1.44, 0.78, 0.12), C_CONCRETE, bevel=0.018, mat_idx=0)
    n_steps = 14
    y_s0, y_s1 = -1.95, 2.35
    z_s0, z_s1 = 0.12, 3.25
    dy_step = (y_s1 - y_s0) / n_steps
    dz_step = (z_s1 - z_s0) / n_steps
    for i in range(n_steps):
        sy = y_s0 + (i + 0.5) * dy_step
        sz_top = z_s0 + (i + 1) * dz_step
        m.box((4.925, sy, sz_top - 0.028), (1.24, dy_step + 0.03, 0.056), C_HERO_STEEL_HI, bevel=0.010, mat_idx=1)
        # Crisp metallic anti-slip front tread nosing bar!
        m.box((4.925, y_s0 + i * dy_step + 0.02, sz_top - 0.004), (1.20, 0.032, 0.016), C_HERO_DOOR_FRAME, bevel=0.004, mat_idx=1)
        m.box((4.925, y_s0 + i * dy_step + 0.02, sz_top - dz_step * 0.5 - 0.02),
              (1.20, 0.045, dz_step + 0.04), C_HERO_STEEL, bevel=0.006, mat_idx=1)

    flight_len = math.hypot(y_s1 - y_s0, z_s1 - z_s0)
    flight_ang = math.atan2(z_s1 - z_s0, y_s1 - y_s0)
    mid_y = (y_s0 + y_s1) * 0.5
    mid_z = (z_s0 + z_s1) * 0.5 - 0.06
    for sx in (4.30, 5.55):
        m.box((sx, mid_y, mid_z), (0.088, flight_len + 0.25, 0.34), C_HERO_STEEL,
              bevel=0.014, rot=(flight_ang, 0.0, 0.0), mat_idx=1)
    m.box((5.55, mid_y, mid_z + 1.06), (0.068, flight_len + 0.22, 0.056), C_HERO_STEEL,
          bevel=0.012, rot=(flight_ang, 0.0, 0.0), mat_idx=1)
    m.box((5.55, mid_y, mid_z + 0.56), (0.044, flight_len + 0.16, 0.040), C_HERO_STEEL,
          bevel=0.008, rot=(flight_ang, 0.0, 0.0), mat_idx=1)
    for k in range(11):
        t = k / 10.0
        py = y_s0 + (y_s1 - y_s0) * t
        pz = z_s0 + (z_s1 - z_s0) * t
        thick = 0.066 if (k == 0 or k == 10) else 0.032
        m.box((5.55, py, pz + 0.50), (thick, thick, 1.02), C_HERO_STEEL, bevel=0.007, mat_idx=1)

    # Top steel landing bridge + guardrails + support columns + structural knee braces!
    m.box((4.925, 3.075, 3.16), (1.38, 1.48, 0.18), C_HERO_STEEL, bevel=0.018, mat_idx=1)
    m.box((4.925, 3.075, 3.245), (1.28, 1.38, 0.02), C_HERO_DECK, bevel=0.004, mat_idx=0)
    _add_railing_run(m, (5.55, 2.35), (5.55, 3.78), 3.25, height=1.02, spacing=0.28)
    _add_railing_run(m, (4.22, 3.78), (5.55, 3.78), 3.25, height=1.02, spacing=0.28)
    m.box((5.52, 2.42, 1.58), (0.11, 0.11, 3.16), C_HERO_STEEL, bevel=0.014, mat_idx=1)
    m.box((5.52, 3.74, 1.58), (0.11, 0.11, 3.16), C_HERO_STEEL, bevel=0.014, mat_idx=1)
    m.box((4.92, 3.74, 2.98), (1.30, 0.09, 0.14), C_HERO_STEEL, bevel=0.012, mat_idx=1)
    m.box((5.52, 3.08, 2.86), (0.09, 1.32, 0.12), C_HERO_STEEL, bevel=0.012, mat_idx=1)
    # Bolted steel column base plates + diagonal knee gusset braces
    for py_c in (2.42, 3.74):
        m.box((5.52, py_c, 0.03), (0.24, 0.24, 0.06), C_IRON, bevel=0.008, mat_idx=1)
    m.box((5.20, 3.74, 2.74), (0.56, 0.07, 0.08), C_HERO_STEEL, bevel=0.008, rot=(0.0, 0.72, 0.0), mat_idx=1)

    # 8) 2F Apartment Doors (201 & 202), UV Windows, AC Units w/ Refrigerant Pipes & Botanical Plants
    _add_apartment_door(m, 2.55, -0.80, 3.25, meter_side=1.0)   # Door 201
    _add_apartment_door(m, 2.55, 1.35, 3.25, meter_side=-1.0)   # Door 202
    _add_hero_window(m, 2.55, -1.78, 4.86, 0.64, 1.08, '+X', uv_rect=UV_WINDOW_APT)
    _add_hero_window(m, 2.55, 2.75, 4.86, 0.84, 1.08, '+X', uv_rect=UV_WINDOW_APT)
    _add_hero_ac_unit(m, 2.55, 2.85, 5.92, '+X')

    # Front (-Y) 2F apartment wall (above 1F noodle shop)
    _add_hero_window(m, -1.55, -2.20, 4.95, 1.72, 1.24, '-Y', uv_rect=UV_WINDOW_APT)
    _add_hero_ac_unit(m, 0.85, -2.20, 5.52, '-Y')
    # Hooded stainless kitchen exhaust vent
    m.box((-3.52, -2.30, 5.65), (0.34, 0.22, 0.30), C_AC_BODY, bevel=0.035, mat_idx=1)
    m.box((-3.52, -2.36, 5.55), (0.28, 0.14, 0.12), C_IRON, bevel=0.01, mat_idx=1)

    # Alley (-X) & Rear (+Y) windows (all UV-mapped with sky reflection & night glow!)
    _add_hero_window(m, -4.20, -0.35, 4.95, 1.32, 1.18, '-X', uv_rect=UV_WINDOW_APT)
    _add_hero_window(m, -4.20, 2.15, 4.95, 1.32, 1.18, '-X', uv_rect=UV_WINDOW_APT)
    _add_hero_window(m, -4.20, 1.35, 1.75, 1.48, 1.10, '-X', frame_col=C_HERO_WOOD, frame_mat=0, uv_rect=UV_WINDOW_SHOP)
    _add_hero_window(m, -1.60, 3.90, 4.95, 1.48, 1.22, '+Y', uv_rect=UV_WINDOW_APT)
    _add_hero_window(m, 0.85, 3.90, 4.95, 1.48, 1.22, '+Y', uv_rect=UV_WINDOW_APT)
    _add_hero_window(m, -1.20, 3.90, 1.72, 1.55, 1.12, '+Y', uv_rect=UV_WINDOW_APT)

    # Lush 2F botanical potted plants (true curved leaf blades!)
    _add_botanical_plant(m, -3.72, -3.42, 3.25, scale=1.08, seed=1)
    _add_botanical_plant(m, -3.18, -3.50, 3.25, scale=0.76, seed=3)
    _add_botanical_plant(m, 2.88, 0.25, 3.25, scale=0.92, seed=2)
    _add_botanical_plant(m, 3.84, 0.20, 3.25, scale=0.72, seed=4)
    _add_botanical_plant(m, 2.88, 2.25, 3.25, scale=0.84, seed=5)

    # 9) Sculpted White Bent PVC Rain Drainpipes w/ Smooth 90° Curved Elbows + Rooftop Rain Hopper (集水斗)!
    r_p = 0.050
    br = 0.14
    # Square Japanese roof rain collector box under rooftop parapet
    m.box((2.15, -2.30, 6.46), (0.24, 0.24, 0.24), C_HERO_PIPE, bevel=0.018, mat_idx=1)
    m.cyl((2.15, -2.30, 6.32), r_p, r_p, 0.12, C_HERO_PIPE, segs=10, mat_idx=1)
    # Smooth curved elbow out toward 2F balcony edge
    m.pipe_elbow((2.15, -2.30, 6.18), (0, 0, -1), (0, -1, 0), r_p, br, C_HERO_PIPE, mat_idx=1)
    m.cyl((2.15, -3.10, 6.18), r_p, r_p, 1.32, C_HERO_PIPE, segs=10, rot=(math.pi * 0.5, 0.0, 0.0), mat_idx=1)
    m.pipe_elbow((2.15, -3.90, 6.18), (0, -1, 0), (0, 0, -1), r_p, br, C_HERO_PIPE, mat_idx=1)
    m.cyl((2.15, -3.90, 4.56), r_p, r_p, 2.96, C_HERO_PIPE, segs=10, mat_idx=1)
    # Smooth S-bend tucking back onto 1F wall and dropping to sidewalk
    m.pipe_elbow((2.15, -3.90, 2.94), (0, 0, -1), (0, 1, 0), r_p, 0.12, C_HERO_PIPE, mat_idx=1)
    m.cyl((2.15, -3.74, 2.94), r_p, r_p, 0.08, C_HERO_PIPE, segs=10, rot=(math.pi * 0.5, 0.0, 0.0), mat_idx=1)
    m.pipe_elbow((2.15, -3.58, 2.94), (0, 1, 0), (0, 0, -1), r_p, 0.12, C_HERO_PIPE, mat_idx=1)
    m.cyl((2.15, -3.58, 1.44), r_p, r_p, 2.76, C_HERO_PIPE, segs=10, mat_idx=1)
    # Metal pipe mounting brackets & bottom drainage shoe
    for pz in (0.65, 1.85, 3.85, 5.35):
        py_c = -3.58 if pz < 3.0 else -3.90
        m.cyl((2.15, py_c, pz), 0.066, 0.066, 0.048, C_IRON_LIGHT, segs=10, mat_idx=1)
    m.pipe_elbow((2.15, -3.58, 0.14), (0, 0, -1), (0, -1, 0), r_p, 0.08, C_HERO_PIPE, mat_idx=1)
    # Secondary inner-corner 2F drainpipe hugging wall cleanly
    m.box((2.64, -2.14, 6.46), (0.18, 0.18, 0.20), C_HERO_PIPE, bevel=0.015, mat_idx=1)
    m.cyl((2.64, -2.14, 4.82), 0.042, 0.042, 3.10, C_HERO_PIPE, segs=10, mat_idx=1)
    for pz in (3.85, 5.35):
        m.cyl((2.64, -2.14, pz), 0.056, 0.056, 0.045, C_IRON_LIGHT, segs=10, mat_idx=1)

    # 10) 1F Lived-in Corner Noodle Shopfront on -Y wall (by = -3.52)
    fy = -3.52
    m.box((-1.32, fy - 0.06, 2.52), (4.72, 0.16, 0.16), C_HERO_WOOD, bevel=0.016, mat_idx=0)
    dx_door = -0.78
    m.box((dx_door, fy - 0.04, 1.24), (2.14, 0.12, 2.38), C_HERO_WOOD_DARK, bevel=0.016, mat_idx=0)
    # Twin sliding doors: UV cedar wood plank lower panels + glossy warm-lit shop glass upper panes + brass pulls
    for sx in (-0.49, 0.49):
        m.box((dx_door + sx, fy - 0.09, 0.58), (0.90, 0.06, 0.92), C_HERO_WOOD, bevel=0.01, mat_idx=0)
        _add_uv_panel(m, dx_door + sx, fy - 0.132, 0.58, 0.86, 0.88, '-Y', UV_WOOD_DOOR, ao_mode='full')
        _add_uv_panel(m, dx_door + sx, fy - 0.128, 1.54, 0.78, 0.94, '-Y', UV_WINDOW_SHOP, ao_mode='soft')
        m.box((dx_door + sx, fy - 0.158, 1.54), (0.045, 0.04, 0.96), C_HERO_WOOD_DARK, bevel=0.006, mat_idx=0)
        m.box((dx_door + sx, fy - 0.158, 1.54), (0.82, 0.04, 0.045), C_HERO_WOOD_DARK, bevel=0.006, mat_idx=0)
        # Recessed brushed brass door pull handle
        m.box((dx_door + sx * 0.22, fy - 0.145, 1.02), (0.045, 0.03, 0.18), 0xd4b262, bevel=0.008, mat_idx=1)
    m.box((dx_door, fy - 0.20, 0.07), (2.34, 0.34, 0.14), C_CONCRETE, bevel=0.016, mat_idx=0)

    # Iconic Crimson 4-Panel Woven Noren (潮 風 拉 麺!) with bamboo rod & subtle breeze sway!
    m.cyl((dx_door, fy - 0.24, 2.34), 0.022, 0.022, 2.18, C_HERO_WOOD_DARK, segs=10,
          rot=(0.0, math.pi * 0.5, 0.0), mat_idx=0)
    for ni in range(4):
        nx = dx_door - 0.72 + ni * 0.48
        y_bot_off = -0.275 if ni % 2 == 0 else -0.235
        hw = 0.215
        m.quad_uv(
            (nx - hw, fy + y_bot_off, 1.71),
            (nx + hw, fy + y_bot_off, 1.71),
            (nx + hw, fy - 0.24, 2.33),
            (nx - hw, fy - 0.24, 2.33),
            UV_NOREN[ni], mat_idx=2, color=0xffffff, ao_mode='full', double_sided=True,
        )

    # Cozy wooden shop window (left of door) + glossy UV pastel glazed ceramic mosaic wainscot!
    wx_shop = -2.72
    _add_hero_window(m, wx_shop, fy, 1.66, 1.18, 0.88, '-Y', frame_col=C_HERO_WOOD, frame_mat=0, uv_rect=UV_WINDOW_SHOP)
    m.box((wx_shop, fy - 0.018, 0.62), (1.30, 0.036, 0.84), C_HERO_WALL, bevel=0.006, mat_idx=0)
    _add_uv_panel(m, wx_shop, fy - 0.046, 0.62, 1.26, 0.80, '-Y', UV_MOSAIC_TILE, ao_mode='full')

    # Glowing ribbed Japanese paper chochin lantern mounted cleanly ABOVE the vertical wood plaque!
    lx, ly, lz = 0.56, fy - 0.22, 2.18
    m.box((lx, fy - 0.11, lz + 0.22), (0.05, 0.24, 0.05), C_HERO_WOOD_DARK, bevel=0.008, mat_idx=0)
    m.cyl((lx, ly, lz + 0.18), 0.10, 0.10, 0.04, C_WARN_DARK, segs=12, mat_idx=1)
    m.cyl((lx, ly, lz - 0.18), 0.10, 0.10, 0.04, C_WARN_DARK, segs=12, mat_idx=1)
    # Four-sided glowing UV lantern body for crisp glowing warm light from every angle
    m.box((lx, ly, lz), (0.20, 0.20, 0.34), C_PORCH_GLOW, bevel=0.03, mat_idx=0, ao_mode='soft')
    _add_uv_panel(m, lx, ly - 0.108, lz, 0.19, 0.32, '-Y', UV_LANTERN_GLOW, ao_mode='soft')
    _add_uv_panel(m, lx + 0.108, ly, lz, 0.19, 0.32, '+X', UV_LANTERN_GLOW, ao_mode='soft')
    _add_uv_panel(m, lx - 0.108, ly, lz, 0.19, 0.32, '-X', UV_LANTERN_GLOW, ao_mode='soft')

    # Charming retro summer ramen poster ("冷やし中華 はじめました！") neatly mounted on right cream wall!
    _add_uv_panel(m, 3.00, fy - 0.024, 1.56, 0.96, 0.48, '-Y', UV_POSTER_WALL, ao_mode='soft')

    # Wooden Japanese A-frame sidewalk chalkboard menu stand (A字看板) right of drainpipe — keeps pastel mosaic tiles unobstructed!
    _add_aframe_menu(m, 2.94, fy - 0.34, 0.08, yaw=0.22)

    # Hollow open-walled stacked plastic beverage crates w/ visible colorful glass bottles in top crates!
    crate_stack_1 = [
        (0.92, fy - 0.22, 0.08, C_CRATE_GREEN, 0.02, False),
        (0.92, fy - 0.22, 0.36, C_CRATE_RED, -0.02, False),
        (0.92, fy - 0.22, 0.64, C_CRATE_BLUE, 0.01, False),
        (0.92, fy - 0.22, 0.92, C_CRATE_YELLOW, 0.03, True),
        (1.42, fy - 0.22, 0.08, C_CRATE_GREEN, -0.02, False),
        (1.42, fy - 0.22, 0.36, C_CRATE_BLUE, 0.02, False),
        (1.42, fy - 0.22, 0.64, C_CRATE_YELLOW, -0.01, True),
    ]
    for cx_c, cy_c, cz_c, cc, cr, has_b in crate_stack_1:
        _add_open_crate(m, cx_c, cy_c, cz_c, cc, rot_z=cr, bottles=has_b, exposed='-Y')

    # Vintage Japanese mamachari bicycle with spoked rims leaning on far-left corner!
    _add_vintage_bicycle(m, -3.52, fy - 0.28, 0.08, yaw=0.06)

    # 11) 1F Stair-Side Corner (+X wall at bx = +3.80):
    #     UV-illustrated glowing white vending machine + AC unit with wrapped refrigerant pipes above it!
    _add_hero_vending(m, 4.04, -3.22, 0.08, facing='+X', variant='white')
    _add_hero_ac_unit(m, 3.80, -3.22, 2.38, '+X')

    #     Under-stair lived-in props: hollow bottle crates + pastel pink illustrated vending machine + fire box
    under_crates = [
        (4.78, 0.88, 0.08, C_CRATE_BLUE, 0.02, False),
        (4.78, 0.88, 0.36, C_CRATE_RED, -0.02, False),
        (4.78, 0.88, 0.64, C_CRATE_YELLOW, 0.03, True),
        (4.78, 1.36, 0.08, C_CRATE_GREEN, -0.02, False),
        (4.78, 1.36, 0.36, C_CRATE_YELLOW, 0.01, True),
    ]
    for cx_c, cy_c, cz_c, cc, cr, has_b in under_crates:
        _add_open_crate(m, cx_c, cy_c, cz_c, cc, rot_z=cr, bottles=has_b, exposed='+X')
    _add_hero_vending(m, 4.04, 2.95, 0.08, facing='+X', variant='pink')
    # Compact red Japanese fire-extinguisher cabinet tucked under stairs on +X wall
    m.box((3.90, 0.15, 0.56), (0.20, 0.28, 0.62), C_WARN_RED, bevel=0.016, mat_idx=1)

    return m.build(hero_mats, col, bake_raycast_ao=True)


def _make_vcol_mat(name, roughness=0.88, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    vcol = nt.nodes.new('ShaderNodeVertexColor')
    vcol.layer_name = 'Color'
    nt.links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def main():
    col = bpy.context.scene.collection
    mat = _make_vcol_mat('CoastalTown_VertexColor', roughness=0.88, metallic=0.0)
    hero_mats = [
        _make_vcol_mat('Hero_Plaster', roughness=0.90, metallic=0.0),
        _make_vcol_mat('Hero_Metal', roughness=0.34, metallic=0.30),
        _make_vcol_mat('Hero_Atlas', roughness=0.55, metallic=0.05),
    ]

    build_shop_corner(mat, col)
    build_shop_tall(mat, col)
    build_shop_konbini(mat, col)
    build_house_slope_a(mat, col)
    build_house_slope_b(mat, col)
    build_tram_car(mat, col)
    build_crossing_gate(mat, col)
    build_utility_pole(mat, col)
    build_street_furniture(mat, col)
    build_hero_haikaze(hero_mats, col)

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
