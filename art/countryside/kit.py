"""Blender --background --factory-startup --python-exit-code 2 --python kit.py

Build the stylized solid-3D countryside asset kit (countryside-kit.glb) for Shiba Delivery.
All assets are clean vertex-colored solid 3D forms (no alpha cutout cards, no painted noise).
Blender Z-up exports to glTF Y-up with each named mesh centered at the ground origin.
"""
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau


def hex_srgb(h):
    return (((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0, 1.0)


def lerp_hex(a, b, t):
    t = max(0.0, min(1.0, t))
    ca, cb = hex_srgb(a), hex_srgb(b)
    return (
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
        1.0,
    )


class MeshBuilder:
    """Accumulates solid 3D geometry with per-vertex colors and optional custom normals."""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.vcols = []       # per-vertex sRGB RGBA
        self.smooth = []      # per-face bool
        self.custom_nor = []  # per-vertex Vector or None

    def add_vert(self, p, col, normal=None):
        idx = len(self.verts)
        self.verts.append((float(p[0]), float(p[1]), float(p[2])))
        self.vcols.append(hex_srgb(col) if isinstance(col, int) else col)
        self.custom_nor.append(normal.normalized() if normal is not None else None)
        return idx

    def add_face(self, indices, smooth=True):
        self.faces.append(tuple(indices))
        self.smooth.append(smooth)

    def add_tube(self, points, radii, cols, sides=6, cap_start=False, cap_end=True, smooth=True):
        pts = [Vector(p) for p in points]
        rings = []
        prev_u = None
        for i, (p, r, c) in enumerate(zip(pts, radii, cols)):
            if i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = (pts[i + 1] - pts[i - 1]).normalized()
            if prev_u is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.92 else Vector((1, 0, 0))
                u = t.cross(ref).normalized()
            else:
                u = (prev_u - t * prev_u.dot(t))
                if u.length < 1e-4:
                    ref = Vector((0, 0, 1)) if abs(t.z) < 0.92 else Vector((1, 0, 0))
                    u = t.cross(ref)
                u.normalize()
            v = t.cross(u).normalized()
            prev_u = u
            ring = []
            for s in range(sides):
                ang = TAU * s / sides
                d = u * math.cos(ang) + v * math.sin(ang)
                ring.append(self.add_vert(p + d * r, c))
            rings.append(ring)
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            for s in range(sides):
                ns = (s + 1) % sides
                self.add_face((r0[s], r0[ns], r1[ns], r1[s]), smooth)
        if cap_start and len(rings):
            self.add_face(tuple(reversed(rings[0])), False)
        if cap_end and len(rings):
            self.add_face(tuple(rings[-1]), False)

    def add_blade(self, points, widths, thicks, cols, smooth=True):
        """Solid 3D arched leaf blade with clean triangular cross-section (thick silhouette, lean tris)."""
        pts = [Vector(p) for p in points]
        rings = []
        prev_side = None
        for i, (p, w, th, c) in enumerate(zip(pts, widths, thicks, cols)):
            if i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = (pts[i + 1] - pts[i - 1]).normalized()
            horiz = Vector((p.x, p.y, 0.0))
            if horiz.length > 1e-4:
                out = horiz.normalized()
            elif prev_side is not None:
                out = prev_side.cross(t).normalized()
            else:
                out = Vector((1, 0, 0))
            side = t.cross(out)
            if side.length < 1e-4:
                side = Vector((0, 1, 0))
            side.normalize()
            up_n = side.cross(t).normalized()
            prev_side = side
            # 3-point solid prism: crisp solid volume from every angle with 25% fewer tris
            v_l = self.add_vert(p - side * w - up_n * (th * 0.4), c)
            v_top = self.add_vert(p + up_n * th, c)
            v_r = self.add_vert(p + side * w - up_n * (th * 0.4), c)
            rings.append((v_l, v_top, v_r))
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(3):
                nk = (k + 1) % 3
                self.add_face((a[k], a[nk], b[nk], b[k]), smooth)
        tip = self.add_vert(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.015, cols[-1])
        last = rings[-1]
        for k in range(3):
            nk = (k + 1) % 3
            self.add_face((last[k], last[nk], tip), smooth)

    def add_box(self, center, size, col, rot_z=0.0, rot_y=0.0, rot_x=0.0, smooth=False):
        cx, cy, cz = center
        hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
        corners = [
            Vector((-hx, -hy, -hz)), Vector((hx, -hy, -hz)),
            Vector((hx, hy, -hz)), Vector((-hx, hy, -hz)),
            Vector((-hx, -hy, hz)), Vector((hx, -hy, hz)),
            Vector((hx, hy, hz)), Vector((-hx, hy, hz)),
        ]
        if rot_x or rot_y or rot_z:
            from mathutils import Euler
            e = Euler((rot_x, rot_y, rot_z), 'XYZ')
            corners = [e.to_matrix() @ v for v in corners]
        offset = Vector((cx, cy, cz))
        idx = [self.add_vert(v + offset, col) for v in corners]
        quads = [
            (0, 3, 2, 1), (4, 5, 6, 7),
            (0, 1, 5, 4), (2, 3, 7, 6),
            (1, 2, 6, 5), (3, 0, 4, 7),
        ]
        for q in quads:
            self.add_face([idx[k] for k in q], smooth)

    def add_puff(self, center, radii, segs, rings, col_bot, col_mid, col_top,
                 lump=0.08, seed=0.0, normal_origin=None, normal_blend=0.78):
        """Sculpted rounded puff/cushion sphere with smooth outward transferred normals."""
        c = Vector(center)
        rx, ry, rz = radii
        n_orig = Vector(normal_origin) if normal_origin is not None else c
        grid = []
        for r in range(rings + 1):
            phi = math.pi * r / rings  # 0 (top) .. pi (bottom)
            sp, cp = math.sin(phi), math.cos(phi)
            row = []
            for s in range(segs):
                theta = TAU * s / segs
                dx = sp * math.cos(theta)
                dy = sp * math.sin(theta)
                dz = cp
                # Soft organic scallop without jagged noise
                bulge = 1.0 + lump * (
                    0.55 * math.sin(3.0 * theta + seed + 1.4 * dz)
                    + 0.45 * math.cos(2.0 * theta - seed * 0.7 + 2.5 * phi)
                ) * sp
                # Slightly flatten bottom so canopy puffs feel cozy & layered
                z_mod = dz * (0.82 if dz < 0 else 1.04)
                p = Vector((c.x + dx * rx * bulge, c.y + dy * ry * bulge, c.z + z_mod * rz * bulge))
                # Height color gradient inside the canopy
                t = max(0.0, min(1.0, (dz + 1.0) * 0.5))
                if t < 0.5:
                    col = lerp_hex(col_bot, col_mid, t * 2.0)
                else:
                    col = lerp_hex(col_mid, col_top, (t - 0.5) * 2.0)
                local_n = Vector((dx / max(rx, 0.1), dy / max(ry, 0.1), dz / max(rz, 0.1))).normalized()
                radial_n = (p - n_orig)
                radial_n.z *= 1.15
                radial_n = radial_n.normalized() if radial_n.length > 1e-4 else Vector((0, 0, 1))
                # Blend toward canopy radial normal for soft Ghibli / ACNH foliage shading
                blended_n = (local_n * (1.0 - normal_blend) + radial_n * normal_blend).normalized()
                # Nudge normal slightly upward so undersides stay luminous, never muddy black
                blended_n = (blended_n + Vector((0, 0, 0.22))).normalized()
                row.append(self.add_vert(p, col, blended_n))
            grid.append(row)
        for r in range(rings):
            for s in range(segs):
                ns = (s + 1) % segs
                a, b = grid[r][s], grid[r][ns]
                d, e = grid[r + 1][s], grid[r + 1][ns]
                if r == 0:
                    self.add_face((a, d, e), True)
                elif r == rings - 1:
                    self.add_face((a, d, b), True)
                else:
                    self.add_face((a, d, e, b), True)

    def build_object(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        attr = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        for poly, sm in zip(mesh.polygons, self.smooth):
            poly.use_smooth = sm
            for li in poly.loop_indices:
                vi = mesh.loops[li].vertex_index
                attr.data[li].color_srgb = self.vcols[vi]
        if any(n is not None for n in self.custom_nor):
            mesh.update()
            loop_nors = []
            for poly in mesh.polygons:
                for li in poly.loop_indices:
                    vi = mesh.loops[li].vertex_index
                    cn = self.custom_nor[vi]
                    loop_nors.append(cn if cn is not None else mesh.vertices[vi].normal)
            mesh.normals_split_custom_set(loop_nors)
        mat = bpy.data.materials.new(self.name + '_Mat')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = 0.88
        vcol_node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        vcol_node.layer_name = 'Color'
        mat.node_tree.links.new(vcol_node.outputs['Color'], bsdf.inputs['Base Color'])
        mesh.materials.append(mat)
        return obj


def build_rice_clump(name, seed, height, blade_count, panicle_count, palette):
    """Chunky stylized solid-3D rice/wheat clump with graceful arched blades & sculpted tapered grain ears."""
    rng = random.Random(seed)
    b = MeshBuilder(name)
    c_base, c_mid, c_tip, c_stem, c_grain_low, c_grain_hi = palette

    # Lush fountain of solid arched 3D leaves with sleek tapered tips
    for i in range(blade_count):
        ang = TAU * i / blade_count + rng.uniform(-0.24, 0.24)
        ca, sa = math.cos(ang), math.sin(ang)
        r0 = rng.uniform(0.03, 0.14)
        bh = height * rng.uniform(0.66, 0.92)
        reach = height * rng.uniform(0.30, 0.50)
        pts, widths, thicks, cols = [], [], [], []
        segs = 5
        for k in range(segs):
            t = k / (segs - 1)
            rad = r0 + reach * (t ** 1.45)
            z = bh * (1.32 * t - 0.42 * t * t)
            pts.append((ca * rad, sa * rad, z))
            widths.append(0.058 * ((1.0 - t) ** 0.82 + 0.08) * (0.9 + 0.18 * (height / 1.35)))
            thicks.append(0.015 * (1.0 - 0.65 * t))
            col = lerp_hex(c_base, c_mid, t * 1.45) if t < 0.6 else lerp_hex(c_mid, c_tip, (t - 0.6) / 0.4)
            cols.append(col)
        b.add_blade(pts, widths, thicks, cols, smooth=True)

    # Gracefully curving stems flowing smoothly into sculpted plump beaded golden grain ears (no harsh elbows!)
    for i in range(panicle_count):
        ang = TAU * (i + 0.35) / panicle_count + rng.uniform(-0.26, 0.26)
        ca, sa = math.cos(ang), math.sin(ang)
        r0 = rng.uniform(0.02, 0.12)
        ph = height * rng.uniform(0.92, 1.07)
        reach_total = height * rng.uniform(0.46, 0.60)

        # Single smooth cubic Bezier arch from soil root -> high crest -> gracefully drooping grain tip!
        p0 = Vector((ca * r0, sa * r0, 0.0))
        p1 = Vector((ca * (r0 + reach_total * 0.14), sa * (r0 + reach_total * 0.14), ph * 1.14))
        p2 = Vector((ca * (r0 + reach_total * 0.68), sa * (r0 + reach_total * 0.68), ph * 1.20))
        p3 = Vector((ca * (r0 + reach_total), sa * (r0 + reach_total), ph * 0.72))

        def eval_bez(u):
            v = 1.0 - u
            return (p0 * (v ** 3) + p1 * (3.0 * v * v * u)
                    + p2 * (3.0 * v * u * u) + p3 * (u ** 3))

        # Slender lower stalk (u = 0.0 .. 0.48)
        stem_pts, stem_r, stem_c = [], [], []
        for k in range(4):
            u = 0.48 * (k / 3.0)
            stem_pts.append(eval_bez(u))
            stem_r.append(0.017 * (1.0 - 0.22 * (k / 3.0)))
            stem_c.append(lerp_hex(c_base, c_stem, k / 3.0))
        b.add_tube(stem_pts, stem_r, stem_c, sides=4, cap_start=False, cap_end=False)

        # Sculpted plump wheat/rice ear along u = 0.44 .. 1.00 (smooth neck -> beaded golden grain -> tapered tip)
        ear_pts, ear_r, ear_c = [], [], []
        ear_steps = 9
        scale_h = 0.78 + 0.22 * (height / 1.35)
        for k in range(ear_steps):
            t = k / (ear_steps - 1)
            u = 0.44 + 0.56 * t
            ear_pts.append(eval_bez(u))
            # Smooth gradual swell (no abrupt club bulge at the neck) -> plump beaded grain -> fine pointed tip
            envelope = (math.sin(math.pi * (t ** 0.92))) ** 1.15
            kernel = 1.0 + 0.28 * math.sin(t * math.pi * 7.0)
            r = max(0.005, 0.036 * envelope * kernel * scale_h)
            if k == 0:
                r = 0.014
            elif k == ear_steps - 1:
                r = 0.004
            ear_r.append(r)
            tone = 0.18 + 0.82 * math.sin(math.pi * (0.12 + 0.76 * t))
            if k % 2 == 1:
                tone = min(1.0, tone + 0.16)
            ear_c.append(lerp_hex(c_grain_low, c_grain_hi, tone))
        b.add_tube(ear_pts, ear_r, ear_c, sides=5, cap_start=False, cap_end=True)

        # 2 short drooping lateral grain tassels branching off the main panicle for rich close-up rice-ear texture!
        side_v = Vector((-sa, ca, 0.0))
        for b_idx, (u_att, sgn) in enumerate([(0.58, 1.0), (0.72, -1.0)]):
            base_p = eval_bez(u_att)
            dir_v = (eval_bez(min(1.0, u_att + 0.12)) - base_p).normalized()
            sp_dir = (dir_v * 0.75 + side_v * (0.42 * sgn) + Vector((0, 0, -0.35))).normalized()
            t_len = 0.17 * scale_h * (1.0 - 0.15 * b_idx)
            sp_pts = [
                base_p,
                base_p + sp_dir * (t_len * 0.48) + Vector((0, 0, 0.01)),
                base_p + sp_dir * t_len + Vector((0, 0, -0.04)),
            ]
            sp_r = [0.010, 0.025 * scale_h, 0.005]
            sp_c = [lerp_hex(c_grain_low, c_grain_hi, 0.35), lerp_hex(c_grain_low, c_grain_hi, 0.88), hex_srgb(c_grain_hi)]
            b.add_tube(sp_pts, sp_r, sp_c, sides=4, cap_start=False, cap_end=True)

    return b.build_object()


# One bark and foliage palette for the town and riverbank. The larger shapes carry
# the silhouette at riding distance; folded leaves are accents along the skyline.
BARK = (0x796049, 0x987858, 0xaa8763)
BANYAN = (0x416f60, 0x699879, 0xa2bc81)
WILLOW = (0x52775e, 0x839f68, 0xb4c580)


def folded_leaf(b, base, angle, length, width, rise, color):
    """A gently folded, almond-shaped leaf, solid on both faces."""
    root = Vector(base)
    along = Vector((math.cos(angle), math.sin(angle), 0))
    across = Vector((-along.y, along.x, 0))
    up = Vector((0, 0, 1))
    mid = root + along * length * 0.49 + up * rise * 0.62
    points = [root, mid - across * width, root + along * length + up * rise,
              mid + across * width, mid + up * width * 0.44, mid - up * width * 0.25]
    v = [b.add_vert(point, color) for point in points]
    for i in range(4):
        j = (i + 1) % 4
        b.add_face((v[i], v[j], v[4]), False)
        b.add_face((v[j], v[i], v[5]), False)


def spreading_roots(b, foot, count):
    for i in range(count):
        a = i * 2.4
        dx, dy = math.cos(a), math.sin(a)
        reach = foot * (1.65 + 0.20 * math.sin(a))
        b.add_tube([(0, 0, foot * 1.80), (dx * foot * .70, dy * foot * .70, .18),
                    (dx * reach, dy * reach, -.035)],
                   [foot * .55, foot * .48, .07], BARK[::-1], sides=8)


def build_tree_round():
    """Low spreading banyan, with three unequal tiers and a visible fork."""
    b = MeshBuilder('Tree_Round')
    spreading_roots(b, .42, 5)
    b.add_tube([(0, 0, -.12), (.06, 0, .54), (-.15, .02, 1.64),
                (.13, .08, 2.55), (.35, .22, 4.02)],
               [.42, .31, .24, .19, .10], [*BARK[:2], *BARK], sides=11)
    # Each lateral branch owns its crown. Stagger heights to retain sky gaps
    # between the horizontal boughs when seen against a shopfront.
    shoulders = [(0.18, 1.48, 3.43, 1.14), (2.45, 1.22, 3.82, 1.21),
                 (4.12, 1.30, 3.18, 1.05), (5.44, .98, 4.08, .91)]
    for i, (a, reach, height, radius) in enumerate(shoulders):
        dx, dy = math.cos(a), math.sin(a)
        x, y = reach * dx, reach * dy
        b.add_tube([(-.10, .02, 1.63 + i * .19), (x * .53, y * .53, height - .95),
                    (x * .88, y * .88, height - .69), (x, y, height)],
                   [.20, .16, .115, .065], [*BARK, BARK[-1]], sides=8)
        b.add_puff((x, y, height), (radius * 1.20, radius, radius * .70),
                   16, 8, *BANYAN, lump=.17, seed=a, normal_blend=.24)
        # Paired new leaves break the rim on the exposed end of each shoulder.
        base = (x + dx * radius * .92, y + dy * radius * .80, height + radius * .37)
        for turn, length, rise in [(-.60, .53, .19), (.50, .42, .31)]:
            folded_leaf(b, base, a + turn, length, .13, rise, 0xa0ba7f)
    b.add_puff((.16, .16, 4.53), (1.55, 1.37, .87), 18, 9,
               *BANYAN, lump=.16, seed=1.3, normal_blend=.24)
    b.add_puff((-.65, -.34, 4.49), (1.0, .92, .70), 14, 7,
               *BANYAN, lump=.12, seed=3.4, normal_blend=.30)
    return b.build_object()


def build_tree_willow():
    """A leaning river willow with grouped, tapered sprays and open windows."""
    b = MeshBuilder('Tree_Willow')
    spreading_roots(b, .37, 4)
    b.add_tube([(0, 0, -.12), (.13, .02, .85), (.53, .14, 1.98),
                (.40, .12, 2.86), (.60, .16, 4.70)],
               [.38, .29, .25, .18, .09], [*BARK[:2], *BARK], sides=10)
    for i, (a, reach, height) in enumerate([
            (.25, 1.92, 3.97), (1.60, 1.36, 4.37), (2.85, 1.81, 3.88),
            (4.10, 1.59, 4.28), (5.32, 1.76, 4.08)]):
        dx, dy = math.cos(a), math.sin(a)
        x, y = .40 + dx * reach, .12 + dy * reach
        b.add_tube([(.40, .12, 2.62), (x * .68, y * .68, height - .67), (x, y, height)],
                   [.17, .12, .07], BARK, sides=8)
        b.add_puff((x, y, height + .32), (1.37, 1.26, .84), 14, 8,
                   *WILLOW, lump=.14, seed=a, normal_blend=.27)
        # Broad folded sprays sweep sideways as well as down. The middle of
        # each bunch hangs longest, leaving a scalloped edge between boughs.
        for j, offset in enumerate([-1.02, -.74, -.31, -.08, .17, .83, 1.08]):
            direction = a + offset
            ux, uy = math.cos(direction), math.sin(direction)
            drop = 1.25 + .96 * math.cos(offset * 1.6) + .32 * math.sin(i + j * 2.1)
            points = []
            for t in [0, .22, .5, .77, 1]:
                outward = 1.06 + .38 * math.sin(t * math.pi)
                sweep = .38 * t * t
                points.append((x + ux * outward - uy * sweep, y + uy * outward + ux * sweep,
                               height + .47 - t * drop))
            b.add_blade(points, [.065, .20, .17, .105, .012], [.04, .075, .06, .04, .008],
                        [WILLOW[1], 0x89a670, 0x91ad70, 0xa4b879, WILLOW[2]])
    b.add_puff((.54, .14, 4.99), (1.77, 1.58, .94), 16, 8,
               *WILLOW, lump=.12, seed=1.4, normal_blend=.30)
    return b.build_object()


def build_utility_pole(name, with_lamp=False):
    """Charming stylized rural concrete utility pole with ceramic insulators & optional retro lamp."""
    b = MeshBuilder(name)
    # Tapered warm-gray concrete pole
    b.add_tube(
        [(0, 0, -0.15), (0, 0, 1.15), (0, 0, 1.60), (0, 0, 6.25)],
        [0.145, 0.132, 0.126, 0.082],
        [hex_srgb(0x9a9c96), hex_srgb(0xc6c3b7), hex_srgb(0xd4d0c4), hex_srgb(0xdcd8cc)],
        sides=10, cap_start=False, cap_end=True,
    )
    # Concrete base collar
    b.add_tube([(0, 0, -0.08), (0, 0, 0.24)], [0.22, 0.18], [hex_srgb(0x91958f), hex_srgb(0xa8aba4)], sides=10)
    # Crisp retro warning collar bands (warm golden yellow + deep slate)
    for z0, z1, col in [(1.05, 1.21, 0x3b494c), (1.21, 1.37, 0xefb948), (1.37, 1.51, 0x3b494c)]:
        b.add_tube([(0, 0, z0), (0, 0, z1)], [0.136, 0.134], [hex_srgb(col)] * 2, sides=10, cap_start=False, cap_end=False)

    # Pole cap
    b.add_tube([(0, 0, 6.22), (0, 0, 6.32)], [0.095, 0.06], [hex_srgb(0x4b5c5d)] * 2, sides=10)

    # Dark slate crossarm + mounting bracket + diagonal struts (oriented along Y in Blender -> Z in glTF)
    arm_z = 5.68
    b.add_box((0.0, 0.0, arm_z), (0.14, 1.92, 0.13), 0x455658)
    b.add_box((0.0, 0.0, arm_z), (0.22, 0.26, 0.20), 0x38484a)
    for sy in (-1, 1):
        b.add_tube([(0.0, 0.0, arm_z - 0.62), (0.0, sy * 0.56, arm_z - 0.04)],
                   [0.024, 0.024], [hex_srgb(0x4c5e60)] * 2, sides=6)

    # 4 cute glossy ceramic insulators sitting on top of the crossarm
    for y_pos in (-0.82, -0.34, 0.34, 0.82):
        b.add_tube(
            [(0.0, y_pos, arm_z + 0.05), (0.0, y_pos, arm_z + 0.12),
             (0.0, y_pos, arm_z + 0.18), (0.0, y_pos, arm_z + 0.23)],
            [0.032, 0.062, 0.046, 0.034],
            [hex_srgb(0x526466), hex_srgb(0xe8f0ec), hex_srgb(0xfaf8f0), hex_srgb(0xffffff)],
            sides=10, cap_start=False, cap_end=True,
        )

    if with_lamp:
        # Curved gooseneck retro village streetlamp reaching toward the road (-Y in Blender -> +Z in glTF)
        neck_pts = [
            (0.0, -0.08, 4.72), (0.0, -0.38, 4.92), (0.0, -0.78, 5.14),
            (0.0, -1.16, 5.18), (0.0, -1.36, 5.02),
        ]
        b.add_tube(neck_pts, [0.030, 0.026, 0.024, 0.023, 0.025], [hex_srgb(0x445759)] * 5, sides=8)
        # Vintage enamel lampshade hood (deep jade green top, warm cream inner glow)
        lx, ly, lz = 0.0, -1.36, 5.02
        b.add_tube(
            [(lx, ly, lz + 0.04), (lx, ly, lz - 0.04), (lx, ly, lz - 0.14), (lx, ly, lz - 0.16)],
            [0.055, 0.15, 0.27, 0.25],
            [hex_srgb(0x2c5c55), hex_srgb(0x367066), hex_srgb(0x3e7d72), hex_srgb(0xf5e5bc)],
            sides=14, cap_start=True, cap_end=True,
        )
        # Warm glowing bulb dome underneath
        b.add_puff((lx, ly, lz - 0.16), (0.10, 0.10, 0.085), 10, 6, 0xffe49e, 0xfff3c8, 0xffffff, lump=0.0)

    return b.build_object()


def build_road_mirror():
    """Iconic Asian countryside orange convex curve mirror."""
    b = MeshBuilder('RoadMirror')
    # Slim post with white/orange stripes near bottom
    b.add_tube(
        [(0, 0, -0.10), (0, 0, 0.55), (0, 0, 2.72)],
        [0.058, 0.052, 0.046],
        [hex_srgb(0x889291), hex_srgb(0xd7d6cc), hex_srgb(0xdfe0d8)],
        sides=10,
    )
    for z0, z1, col in [(0.45, 0.62, 0xe0683c), (0.62, 0.78, 0xf5eedb), (0.78, 0.94, 0xe0683c)]:
        b.add_tube([(0, 0, z0), (0, 0, z1)], [0.055, 0.055], [hex_srgb(col)] * 2, sides=10, cap_start=False, cap_end=False)
    # Mounting bracket
    b.add_box((0.08, 0, 2.58), (0.20, 0.07, 0.08), 0x45585a)
    # Rounded terracotta-orange mirror housing facing +X in Blender (+X in glTF)
    # Build as short cylinder oriented along X
    mx, my, mz = 0.20, 0.0, 2.58
    b.add_tube(
        [(mx - 0.12, my, mz), (mx - 0.04, my, mz), (mx + 0.04, my, mz)],
        [0.14, 0.37, 0.39],
        [hex_srgb(0xc45630), hex_srgb(0xdf6b3b), hex_srgb(0xea7948)],
        sides=18, cap_start=True, cap_end=True,
    )
    # Clean reflective pale sky-cyan mirror dome
    b.add_puff((mx + 0.05, my, mz), (0.06, 0.33, 0.33), 16, 8, 0x9ec9d8, 0xcbe8f0, 0xf3fbff, lump=0.0)
    # Little visor hood on top
    b.add_box((mx + 0.08, my, mz + 0.36), (0.24, 0.54, 0.045), 0xdf6b3b, rot_y=0.14)
    return b.build_object()


def build_bollard():
    """Crisp chamfered roadside curve reflector bollard."""
    b = MeshBuilder('Bollard')
    b.add_tube(
        [(0, 0, -0.06), (0, 0, 0.10), (0, 0, 0.56), (0, 0, 0.68), (0, 0, 0.78), (0, 0, 0.82)],
        [0.075, 0.068, 0.064, 0.064, 0.060, 0.036],
        [hex_srgb(0x7c8582), hex_srgb(0xf2ead7), hex_srgb(0xf7f1e1),
         hex_srgb(0xe2623c), hex_srgb(0xf7f1e1), hex_srgb(0xfff9ea)],
        sides=8, cap_start=False, cap_end=True,
    )
    return b.build_object()


def build_road_tuft(name, with_flowers=False):
    """Plump stylized 3D grass/clover cluster (optionally with cute daisy blossoms) to soften road edges."""
    rng = random.Random(901 if with_flowers else 404)
    b = MeshBuilder(name)
    blades = 7 if with_flowers else 8
    for i in range(blades):
        ang = TAU * i / blades + rng.uniform(-0.25, 0.25)
        ca, sa = math.cos(ang), math.sin(ang)
        h = rng.uniform(0.24, 0.38)
        reach = rng.uniform(0.14, 0.26)
        pts, widths, thicks, cols = [], [], [], []
        for k in range(4):
            t = k / 3.0
            rad = 0.03 + reach * (t ** 1.35)
            z = h * (1.25 * t - 0.36 * t * t)
            pts.append((ca * rad, sa * rad, z))
            widths.append(0.052 * (1.0 - 0.65 * t))
            thicks.append(0.015 * (1.0 - 0.5 * t))
            cols.append(lerp_hex(0x467e52, 0x99c25b, t))
        b.add_blade(pts, widths, thicks, cols, smooth=True)
    if with_flowers:
        for i in range(4):
            ang = TAU * i / 4.0 + 0.45
            rad = rng.uniform(0.08, 0.18)
            fx, fy, fz = math.cos(ang) * rad, math.sin(ang) * rad, rng.uniform(0.28, 0.42)
            b.add_tube([(fx * 0.4, fy * 0.4, 0.0), (fx, fy, fz)],
                       [0.014, 0.011], [hex_srgb(0x4e8650), hex_srgb(0x76aa55)], sides=4)
            petal_col = 0xfff8e4 if i % 2 == 0 else 0xfbe28c
            for p in range(5):
                pa = TAU * p / 5.0
                px = fx + math.cos(pa) * 0.052
                py = fy + math.sin(pa) * 0.052
                b.add_puff((px, py, fz), (0.036, 0.036, 0.018), 5, 2, petal_col, petal_col, 0xffffff, lump=0.0)
            b.add_puff((fx, fy, fz + 0.016), (0.028, 0.028, 0.020), 5, 2, 0xe8a535, 0xf6c548, 0xffe073, lump=0.0)
    return b.build_object()


def build_reed_clump():
    """Riverbank stylized 3D reeds & plump cattails."""
    rng = random.Random(712)
    b = MeshBuilder('ReedClump')
    for i in range(8):
        ang = TAU * i / 8.0 + rng.uniform(-0.22, 0.22)
        ca, sa = math.cos(ang), math.sin(ang)
        h = rng.uniform(0.75, 1.15)
        reach = rng.uniform(0.18, 0.34)
        pts, widths, thicks, cols = [], [], [], []
        for k in range(5):
            t = k / 4.0
            pts.append((ca * (0.05 + reach * (t ** 1.6)), sa * (0.05 + reach * (t ** 1.6)), h * (1.18 * t - 0.24 * t * t)))
            widths.append(0.042 * (1.0 - 0.65 * t))
            thicks.append(0.012 * (1.0 - 0.5 * t))
            cols.append(lerp_hex(0x3a6f57, 0x8db55a, t))
        b.add_blade(pts, widths, thicks, cols, smooth=True)
    for i in range(3):
        ang = TAU * i / 3.0 + 0.6
        ca, sa = math.cos(ang), math.sin(ang)
        h = rng.uniform(0.95, 1.20)
        lean = 0.14
        top = (ca * lean, sa * lean, h)
        b.add_tube([(ca * 0.04, sa * 0.04, 0.0), (ca * lean * 0.5, sa * lean * 0.5, h * 0.55), top],
                   [0.018, 0.015, 0.012], [hex_srgb(0x4a7f56), hex_srgb(0x699b56), hex_srgb(0x7ca655)], sides=5)
        # Cute rounded cattail sausage head
        b.add_tube(
            [(ca * lean * 0.72, sa * lean * 0.72, h * 0.72),
             (ca * lean * 0.80, sa * lean * 0.80, h * 0.76),
             (ca * lean * 0.90, sa * lean * 0.90, h * 0.90),
             (ca * lean * 0.95, sa * lean * 0.95, h * 0.94)],
            [0.018, 0.044, 0.042, 0.016],
            [hex_srgb(0x6a442d), hex_srgb(0x885738), hex_srgb(0x9a6542), hex_srgb(0x7c4e31)],
            sides=8, cap_start=True, cap_end=True,
        )
    return b.build_object()


# Build all modular countryside assets
tall_palette_a = (0x5d8d47, 0x99b74a, 0xdfc154, 0xd1b954, 0xda9b32, 0xfbdd6e)
tall_palette_b = (0x679248, 0xa8be4e, 0xe8c452, 0xd9bc52, 0xe2a438, 0xffe47d)
low_palette = (0x3e7e53, 0x6ea952, 0xb2c859, 0x9ebb56, 0xd0b854, 0xf2d66e)

assets = [
    build_rice_clump('RiceTall_A', seed=101, height=1.40, blade_count=6, panicle_count=4, palette=tall_palette_a),
    build_rice_clump('RiceTall_B', seed=207, height=1.34, blade_count=6, panicle_count=3, palette=tall_palette_b),
    build_rice_clump('RiceLow', seed=313, height=0.84, blade_count=5, panicle_count=2, palette=low_palette),
    build_tree_round(),
    build_tree_willow(),
    build_utility_pole('UtilityPole', with_lamp=False),
    build_utility_pole('UtilityPole_Lamp', with_lamp=True),
    build_road_mirror(),
    build_bollard(),
    build_road_tuft('RoadTuft', with_flowers=False),
    build_road_tuft('RoadFlowers', with_flowers=True),
    build_reed_clump(),
]

for obj in assets:
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'{obj.name:18s}: {len(obj.data.vertices):4d} verts, {tris:4d} tris')

out_path = Path(__file__).resolve().with_name('countryside-kit.glb')
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format='GLB',
    export_yup=True,
    export_texcoords=False,
    export_normals=True,
    export_vertex_color='ACTIVE',
    export_materials='NONE',
)
print(f'Wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KB)')
