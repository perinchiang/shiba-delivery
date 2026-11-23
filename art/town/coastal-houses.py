"""blender --background --factory-startup --python-exit-code 2 --python coastal-houses.py

Build the stylized East Asian coastal town detached-house 3D sample kit (coastal-houses.glb)
for Shiba Delivery (Style A: Soft Storybook).

Conventions:
- Blender Z-up, metric units matching the 0.84 street-scale Shiba & scooter; front faces -Y.
- glTF exports Y-up, front facing +Z.
- Every structural edge is beveled for a rounded, chunky miniature feel.
- Smooth vertex-color AO grounds bases, eaves, and recesses; window panes use exact
  0x527a78 (and vending display 0xe8d798) so time-of-day.js lights them at dusk/night.
"""
import math
import random
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau

# Palette harmonized with src/morning/city-palette.js & time-of-day.js
C_GLASS = 0x527a78          # exact WINDOW_HEXES match for automatic dusk/night glow
C_DISPLAY_GLASS = 0xe8d798  # exact WINDOW_HEXES match for vending machine display
C_CREAM_WALL = 0xf7e7c6
C_WHITE_WALL = 0xf7f1e3
C_SAND_WALL = 0xf3e0ba
C_PLINTH = 0xc5b8a0
C_TRIM = 0xfaf2df
C_TIMBER = 0x8a6043
C_TIMBER_LIGHT = 0xb88960
C_ROOF_TERRA = 0xca7050
C_ROOF_SAGE = 0x527f72
C_ROOF_SLATE = 0x5d7b92
C_BRICK = 0xc1795b
C_DARK_IRON = 0x4b5652
C_STEP_STONE = 0xd2c5ac
C_SOIL = 0x7c5f46
C_HEDGE_LOW = 0x4f8458
C_HEDGE_HI = 0x7ab064
C_CITRUS = 0xf08c2e


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


def shade_srgb(col_srgb, ao=1.0, tint_cool=0.0):
    """Apply smooth storybook AO darkening, nudging shadowed regions gently toward cool slate."""
    r, g, b, a = col_srgb
    f = max(0.55, min(1.12, ao))
    # Cool shadow lift keeps shadows clean and pastel rather than muddy brown/gray
    cool_r, cool_g, cool_b = 0.84, 0.88, 0.98
    k = max(0.0, min(1.0, (1.0 - f) * 0.55 + tint_cool))
    return (
        max(0.0, min(1.0, r * (f * (1.0 - k) + cool_r * f * k))),
        max(0.0, min(1.0, g * (f * (1.0 - k) + cool_g * f * k))),
        max(0.0, min(1.0, b * (f * (1.0 - k) + cool_b * f * k))),
        a,
    )


class StorybookMesh:
    """Builds beveled solid geometry via bmesh with per-corner vertex colors and weighted normals."""

    def __init__(self, name):
        self.name = name
        self.parts = []  # list of (bmesh, custom_nors_or_none)

    @staticmethod
    def _weighted_normals(bm, crease_dot=0.25):
        """Compute area-squared weighted loop normals so flat walls never bend gradients from bevels."""
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

    def add_beveled_box(
        self,
        center,
        size,
        color,
        bevel=0.035,
        segments=2,
        rot=(0.0, 0.0, 0.0),
        ao_fn=None,
        smooth=True,
        glass=False,
    ):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = size
        for v in bm.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
        if bevel > 0.0:
            max_b = min(sx, sy, sz) * 0.42
            b_off = min(bevel, max_b)
            if b_off > 0.002:
                bmesh.ops.bevel(
                    bm,
                    geom=list(bm.edges),
                    offset=b_off,
                    segments=segments,
                    profile=0.5,
                    affect='EDGES',
                    clamp_overlap=True,
                )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)

        base_srgb = hex_srgb(color) if isinstance(color, int) else color
        col_layer = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            f.smooth = smooth
            for loop in f.loops:
                if glass:
                    loop[col_layer] = base_srgb
                else:
                    p = loop.vert.co
                    ao = ao_fn(p, f.normal) if ao_fn else 1.0
                    loop[col_layer] = shade_srgb(base_srgb, ao)
        self.parts.append((bm, self._weighted_normals(bm)))

    def add_pitched_prism(
        self,
        center,
        width,
        depth,
        wall_top_z,
        ridge_h,
        thickness,
        color,
        ridge_along_x=True,
        bevel=0.03,
        ao_fn=None,
        smooth=True,
    ):
        """Solid extruded gable prism (wall triangle or overhanging pitched roof slab)."""
        bm = bmesh.new()
        hw, hd = width * 0.5, depth * 0.5
        if ridge_along_x:
            # Cross-section in YZ, extruded along X
            pts_2d = [(-hd, 0.0), (0.0, ridge_h), (hd, 0.0)]
            if thickness > 0.0:
                pts_2d.extend([(hd, -thickness), (0.0, ridge_h - thickness), (-hd, -thickness)])
            verts_l = [bm.verts.new((-hw, y, z)) for (y, z) in pts_2d]
            verts_r = [bm.verts.new((hw, y, z)) for (y, z) in pts_2d]
        else:
            pts_2d = [(-hw, 0.0), (0.0, ridge_h), (hw, 0.0)]
            if thickness > 0.0:
                pts_2d.extend([(hw, -thickness), (0.0, ridge_h - thickness), (-hw, -thickness)])
            verts_l = [bm.verts.new((x, -hd, z)) for (x, z) in pts_2d]
            verts_r = [bm.verts.new((x, hd, z)) for (x, z) in pts_2d]

        n = len(pts_2d)
        bm.faces.new(verts_l)
        bm.faces.new(list(reversed(verts_r)))
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new((verts_l[i], verts_l[ni], verts_r[ni], verts_r[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel > 0.002:
            bmesh.ops.bevel(
                bm,
                geom=list(bm.edges),
                offset=bevel,
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
        bmesh.ops.translate(bm, vec=Vector((center[0], center[1], wall_top_z)), verts=bm.verts)

        base_srgb = hex_srgb(color) if isinstance(color, int) else color
        col_layer = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            f.smooth = smooth
            for loop in f.loops:
                p = loop.vert.co
                ao = ao_fn(p, f.normal) if ao_fn else 1.0
                loop[col_layer] = shade_srgb(base_srgb, ao)
        self.parts.append((bm, self._weighted_normals(bm)))

    def add_shed_slab(
        self,
        center,
        width,
        depth,
        z_low,
        z_high,
        thickness,
        color,
        slope_dir='-y',
        bevel=0.03,
        ao_fn=None,
        smooth=True,
    ):
        """Thick beveled slanted roof slab rising toward +Y (or -Y/+X/-X)."""
        bm = bmesh.new()
        hw, hd = width * 0.5, depth * 0.5
        if slope_dir in ('-y', '+y'):
            za = z_low if slope_dir == '-y' else z_high
            zb = z_high if slope_dir == '-y' else z_low
            pts = [(-hd, za), (hd, zb), (hd, zb - thickness), (-hd, za - thickness)]
            vl = [bm.verts.new((-hw, y, z)) for (y, z) in pts]
            vr = [bm.verts.new((hw, y, z)) for (y, z) in pts]
        else:
            za = z_low if slope_dir == '-x' else z_high
            zb = z_high if slope_dir == '-x' else z_low
            pts = [(-hw, za), (hw, zb), (hw, zb - thickness), (-hw, za - thickness)]
            vl = [bm.verts.new((x, -hd, z)) for (x, z) in pts]
            vr = [bm.verts.new((x, hd, z)) for (x, z) in pts]
        bm.faces.new(vl)
        bm.faces.new(list(reversed(vr)))
        for i in range(4):
            ni = (i + 1) % 4
            bm.faces.new((vl[i], vl[ni], vr[ni], vr[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel > 0.002:
            bmesh.ops.bevel(
                bm,
                geom=list(bm.edges),
                offset=bevel,
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
        bmesh.ops.translate(bm, vec=Vector((center[0], center[1], 0.0)), verts=bm.verts)

        base_srgb = hex_srgb(color) if isinstance(color, int) else color
        col_layer = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            f.smooth = smooth
            for loop in f.loops:
                p = loop.vert.co
                ao = ao_fn(p, f.normal) if ao_fn else 1.0
                loop[col_layer] = shade_srgb(base_srgb, ao)
        self.parts.append((bm, self._weighted_normals(bm)))

    def add_cylinder(
        self,
        center,
        radius_bot,
        radius_top,
        height,
        color,
        segs=12,
        rot=(0.0, 0.0, 0.0),
        ao_fn=None,
        smooth=True,
        bevel=0.0,
    ):
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=radius_bot,
            radius2=radius_top,
            depth=height,
        )
        if bevel > 0.002:
            cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
            if cap_edges:
                bmesh.ops.bevel(
                    bm, geom=cap_edges, offset=bevel, segments=2, profile=0.5, affect='EDGES', clamp_overlap=True
                )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)

        base_srgb = hex_srgb(color) if isinstance(color, int) else color
        col_layer = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            f.smooth = smooth
            for loop in f.loops:
                p = loop.vert.co
                ao = ao_fn(p, f.normal) if ao_fn else 1.0
                loop[col_layer] = shade_srgb(base_srgb, ao)
        self.parts.append((bm, self._weighted_normals(bm)))

    def add_puff(self, center, radii, segs, rings, col_bot, col_mid, col_top, lump=0.08, seed=0.0, normal_origin=None):
        """Organic layered foliage sphere with transferred smooth normals (matches countryside/kit.py)."""
        bm = bmesh.new()
        c = Vector(center)
        rx, ry, rz = radii
        n_orig = Vector(normal_origin) if normal_origin is not None else c
        grid = []
        v_cols = {}
        v_nors = {}
        for r in range(rings + 1):
            phi = math.pi * r / rings
            sp, cp = math.sin(phi), math.cos(phi)
            row = []
            for s in range(segs):
                theta = TAU * s / segs
                dx, dy, dz = sp * math.cos(theta), sp * math.sin(theta), cp
                bulge = 1.0 + lump * (
                    0.55 * math.sin(3.0 * theta + seed + 1.4 * dz)
                    + 0.45 * math.cos(2.0 * theta - seed * 0.7 + 2.5 * phi)
                ) * sp
                z_mod = dz * (0.82 if dz < 0 else 1.04)
                p = Vector((c.x + dx * rx * bulge, c.y + dy * ry * bulge, c.z + z_mod * rz * bulge))
                t = max(0.0, min(1.0, (dz + 1.0) * 0.5))
                col = lerp_hex(col_bot, col_mid, t * 2.0) if t < 0.5 else lerp_hex(col_mid, col_top, (t - 0.5) * 2.0)
                local_n = Vector((dx / max(rx, 0.1), dy / max(ry, 0.1), dz / max(rz, 0.1))).normalized()
                radial_n = (p - n_orig)
                radial_n.z *= 1.15
                radial_n = radial_n.normalized() if radial_n.length > 1e-4 else Vector((0, 0, 1))
                blended_n = (local_n * 0.22 + radial_n * 0.78 + Vector((0, 0, 0.22))).normalized()
                v = bm.verts.new(p)
                v_cols[v] = col
                v_nors[v] = blended_n
                row.append(v)
            grid.append(row)
        for r in range(rings):
            for s in range(segs):
                ns = (s + 1) % segs
                a, b, d, e = grid[r][s], grid[r][ns], grid[r + 1][s], grid[r + 1][ns]
                if r == 0:
                    f = bm.faces.new((a, d, e))
                elif r == rings - 1:
                    f = bm.faces.new((a, d, b))
                else:
                    f = bm.faces.new((a, d, e, b))
                f.smooth = True
        bm.verts.ensure_lookup_table()
        col_layer = bm.loops.layers.color.new('Color')
        custom_nors = {}
        for f in bm.faces:
            for loop in f.loops:
                loop[col_layer] = v_cols[loop.vert]
                custom_nors[loop] = v_nors[loop.vert]
        self.parts.append((bm, custom_nors))

    def build_object(self):
        """Merge all bmesh parts into a single Mesh Object with unified Color attribute."""
        merged = bmesh.new()
        col_layer = merged.loops.layers.color.new('Color')
        loop_nors = []
        has_custom = False

        for bm, custom_nors in self.parts:
            src_col = bm.loops.layers.color.get('Color')
            vert_map = {}
            for v in bm.verts:
                vert_map[v] = merged.verts.new(v.co)
            for f in bm.faces:
                try:
                    nf = merged.faces.new([vert_map[v] for v in f.verts])
                except ValueError:
                    continue
                nf.smooth = f.smooth
                for src_l, dst_l in zip(f.loops, nf.loops):
                    dst_l[col_layer] = src_l[src_col] if src_col else (1.0, 1.0, 1.0, 1.0)
                    if custom_nors is not None and src_l in custom_nors:
                        loop_nors.append(custom_nors[src_l])
                        has_custom = True
                    else:
                        loop_nors.append(None)
            bm.free()

        mesh = bpy.data.meshes.new(self.name)
        merged.to_mesh(mesh)
        merged.free()

        # Convert bmesh color layer into standard CORNER BYTE_COLOR attribute named 'Color'
        # so Three.js GLTFLoader receives crisp sRGB->linear vertex colors matching kit.py.
        src_attr = mesh.color_attributes.get('Color')
        loop_rgba = [tuple(src_attr.data[i].color_srgb) for i in range(len(mesh.loops))] if src_attr else []
        if src_attr:
            mesh.color_attributes.remove(src_attr)
        attr = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        for i, rgba in enumerate(loop_rgba):
            attr.data[i].color_srgb = rgba

        if has_custom:
            mesh.update()
            final_nors = []
            for li, cn in enumerate(loop_nors):
                if cn is not None:
                    final_nors.append(cn)
                else:
                    vi = mesh.loops[li].vertex_index
                    final_nors.append(mesh.vertices[vi].normal)
            mesh.normals_split_custom_set(final_nors)

        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        mat = bpy.data.materials.new(self.name + '_Mat')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = 0.90
        vcol_node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        vcol_node.layer_name = 'Color'
        mat.node_tree.links.new(vcol_node.outputs['Color'], bsdf.inputs['Base Color'])
        mesh.materials.append(mat)
        return obj


def wall_ao_fn(eave_z, base_z=0.35):
    """Smooth AO curve: grounds plinth at z=0, softly shades under eaves."""
    def fn(p, n):
        ao = 1.0
        if p.z < base_z:
            ao *= 0.78 + 0.22 * max(0.0, p.z / base_z)
        if eave_z is not None and abs(n.z) < 0.55 and p.z > eave_z - 0.95 and p.z <= eave_z + 0.08:
            t = max(0.0, min(1.0, (eave_z - p.z) / 0.95))
            ao *= 0.85 + 0.15 * t
        if n.z < -0.5:
            ao *= 0.80
        return ao
    return fn


def add_window(m, x, y, z, w, h, facing='-y', trim_col=C_TRIM, sill_col=C_TIMBER, shutter_col=None):
    """Beveled window frame + recessed exact-hex glass pane (0x527a78 for dusk/night glow) + sill."""
    rot_z = {'-y': 0.0, '+y': math.pi, '+x': math.pi * 0.5, '-x': -math.pi * 0.5}[facing]
    dx, dy = {'-y': (0, -1), '+y': (0, 1), '+x': (1, 0), '-x': (-1, 0)}[facing]
    px, py = -dy, dx  # local right along facade

    def pos(lx, ly, lz):
        return (x + px * lx + dx * ly, y + py * lx + dy * ly, z + lz)

    # Outer beveled frame border
    m.add_beveled_box(pos(0, 0.03, 0), (w + 0.16, 0.12, h + 0.16), trim_col, bevel=0.018, rot=(0, 0, rot_z))
    # Recessed pure glass pane (vertical outward face -> tagBakedEmissiveMesh lights at night)
    m.add_beveled_box(pos(0, 0.072, 0), (w, 0.04, h), C_GLASS, bevel=0.0, rot=(0, 0, rot_z), smooth=False, glass=True)
    # Cross mullions
    m.add_beveled_box(pos(0, 0.095, 0), (0.055, 0.045, h), trim_col, bevel=0.01, rot=(0, 0, rot_z))
    m.add_beveled_box(pos(0, 0.095, -h * 0.08), (w, 0.045, 0.052), trim_col, bevel=0.01, rot=(0, 0, rot_z))
    # Timber sill
    m.add_beveled_box(pos(0, 0.085, -h * 0.5 - 0.04), (w + 0.28, 0.22, 0.085), sill_col, bevel=0.018, rot=(0, 0, rot_z))
    if shutter_col is not None:
        for side in (-1, 1):
            m.add_beveled_box(
                pos(side * (w * 0.5 + 0.22), 0.055, 0),
                (0.24, 0.075, h + 0.04),
                shutter_col,
                bevel=0.015,
                rot=(0, 0, rot_z),
            )


def add_door(m, x, y, z_bot, w=1.06, h=2.06, facing='-y', frame_col=C_TRIM, door_col=C_TIMBER, canopy_col=C_ROOF_TERRA):
    rot_z = {'-y': 0.0, '+y': math.pi, '+x': math.pi * 0.5, '-x': -math.pi * 0.5}[facing]
    dx, dy = {'-y': (0, -1), '+y': (0, 1), '+x': (1, 0), '-x': (-1, 0)}[facing]
    px, py = -dy, dx

    def pos(lx, ly, lz):
        return (x + px * lx + dx * ly, y + py * lx + dy * ly, z_bot + lz)

    m.add_beveled_box(pos(0, 0.04, h * 0.5), (w + 0.22, 0.14, h + 0.12), frame_col, bevel=0.02, rot=(0, 0, rot_z))
    m.add_beveled_box(pos(0, 0.08, h * 0.5 - 0.02), (w, 0.08, h - 0.04), door_col, bevel=0.015, rot=(0, 0, rot_z))
    # Small door transom/peek window (glows warmly at night)
    m.add_beveled_box(pos(0, 0.115, h * 0.66), (w * 0.48, 0.04, 0.44), C_GLASS, bevel=0.0, rot=(0, 0, rot_z), smooth=False, glass=True)
    # Warm brass handle
    m.add_beveled_box(pos(w * 0.34, 0.135, h * 0.44), (0.06, 0.05, 0.18), 0xe2b85b, bevel=0.01, rot=(0, 0, rot_z))
    # Front awning canopy + step
    m.add_beveled_box(pos(0, 0.42, h + 0.18), (w + 0.72, 0.92, 0.14), canopy_col, bevel=0.028, rot=(0, 0, rot_z))
    m.add_beveled_box(pos(0, 0.44, 0.09), (w + 0.48, 0.96, 0.18), C_STEP_STONE, bevel=0.025, rot=(0, 0, rot_z), ao_fn=wall_ao_fn(None))


def build_house_a():
    """House_A: 2-story warm cream gable detached house with terracotta roof & 2F balcony."""
    m = StorybookMesh('House_A')
    yc = 1.15  # set back toward rear of 8.8x8.2 lot so front yard is ~2.8m deep
    w, d, plinth_h, body_h = 5.6, 4.4, 0.36, 4.75
    top_z = plinth_h + body_h
    ao = wall_ao_fn(top_z)

    # Plinth + main body
    m.add_beveled_box((0, yc, plinth_h * 0.5), (w + 0.24, d + 0.24, plinth_h), C_PLINTH, bevel=0.04, ao_fn=ao)
    m.add_beveled_box((0, yc, plinth_h + body_h * 0.5), (w, d, body_h), C_CREAM_WALL, bevel=0.055, ao_fn=ao)
    # Mid-belt trim band
    m.add_beveled_box((0, yc, 2.75), (w + 0.14, d + 0.14, 0.14), C_TRIM, bevel=0.025, ao_fn=ao)
    # Gable triangles (left/right ends -> ridge along X)
    m.add_pitched_prism((0, yc, 0), w - 0.04, d - 0.04, top_z - 0.04, 1.55, 0.0, C_CREAM_WALL, ridge_along_x=True, bevel=0.03, ao_fn=ao)
    # Thick overhanging terracotta roof + ridge cap + chimney
    m.add_pitched_prism((0, yc, 0), w + 0.84, d + 0.92, top_z + 0.02, 1.66, 0.22, C_ROOF_TERRA, ridge_along_x=True, bevel=0.035, ao_fn=wall_ao_fn(None))
    m.add_beveled_box((0, yc, top_z + 1.68), (w + 0.94, 0.26, 0.18), 0x9b5139, bevel=0.03)
    m.add_beveled_box((1.65, yc + 0.75, top_z + 1.45), (0.56, 0.56, 1.05), C_BRICK, bevel=0.035)
    m.add_beveled_box((1.65, yc + 0.75, top_z + 1.98), (0.68, 0.68, 0.12), C_TRIM, bevel=0.025)

    front_y = yc - d * 0.5
    # Ground floor: door left-center + cozy window right
    add_door(m, -1.25, front_y, plinth_h - 0.16, canopy_col=C_ROOF_TERRA)
    add_window(m, 1.25, front_y, 1.52, 1.38, 1.10, facing='-y', shutter_col=C_ROOF_SAGE)
    # 2nd floor: balcony + wide sliding glass door/window + left window
    m.add_beveled_box((1.05, front_y - 0.44, 2.84), (2.75, 0.92, 0.16), C_TRIM, bevel=0.03, ao_fn=wall_ao_fn(None))
    m.add_beveled_box((1.05, front_y - 0.86, 3.68), (2.75, 0.08, 0.10), C_TIMBER, bevel=0.02)
    for bx in (-0.26, 0.40, 1.05, 1.70, 2.36):
        m.add_beveled_box((bx, front_y - 0.86, 3.28), (0.07, 0.07, 0.78), C_TIMBER_LIGHT, bevel=0.015)
    for by in (front_y - 0.42, front_y - 0.86):
        pass
    for side in (-0.26, 2.36):
        m.add_beveled_box((side, front_y - 0.44, 3.68), (0.08, 0.90, 0.10), C_TIMBER, bevel=0.02)
    add_window(m, 1.05, front_y, 3.82, 1.65, 1.32, facing='-y')
    add_window(m, -1.45, front_y, 3.92, 1.18, 1.05, facing='-y')
    # Side & rear windows so house looks complete from all 360° angles
    add_window(m, w * 0.5, yc, 1.55, 1.15, 1.02, facing='+x')
    add_window(m, -w * 0.5, yc, 3.88, 1.15, 1.02, facing='-x')
    add_window(m, 0.0, yc + d * 0.5, 3.88, 1.35, 1.05, facing='+y')
    return m.build_object()


def build_house_b():
    """House_B: Split-shed Japanese coastal home, off-white plaster, sage-jade roof & wood slats."""
    m = StorybookMesh('House_B')
    yc = 1.15
    w, d, plinth_h = 5.4, 4.3, 0.34
    front_y = yc - d * 0.5

    # Left wing (tall shed rising toward rear) + right wing (cozy lower shed rising toward center)
    ao_tall = wall_ao_fn(5.1)
    m.add_beveled_box((0, yc, plinth_h * 0.5), (w + 0.24, d + 0.24, plinth_h), C_PLINTH, bevel=0.04, ao_fn=ao_tall)
    m.add_beveled_box((-1.15, yc + 0.10, plinth_h + 2.35), (3.1, d, 4.70), C_WHITE_WALL, bevel=0.055, ao_fn=ao_tall)
    m.add_beveled_box((1.55, yc - 0.05, plinth_h + 1.95), (2.4, d - 0.25, 3.90), C_WHITE_WALL, bevel=0.055, ao_fn=wall_ao_fn(4.25))
    # Warm timber vertical cladding accent band on upper front
    m.add_beveled_box((-1.15, front_y + 0.06, 3.95), (3.16, 0.12, 1.45), C_TIMBER_LIGHT, bevel=0.025)
    # Split shed roofs (sage-jade)
    m.add_shed_slab((-1.15, yc + 0.10, 0), 3.65, d + 0.85, 4.90, 5.95, 0.20, C_ROOF_SAGE, slope_dir='-y', bevel=0.032)
    m.add_shed_slab((1.65, yc - 0.05, 0), 2.85, d + 0.55, 4.18, 4.88, 0.18, C_ROOF_SAGE, slope_dir='-y', bevel=0.032)

    # Entrance porch + decorative vertical wooden screen slats
    add_door(m, 1.35, front_y - 0.12, plinth_h - 0.14, canopy_col=C_TIMBER)
    for k in range(5):
        m.add_beveled_box((0.20 + k * 0.13, front_y - 0.26, 1.45), (0.065, 0.075, 2.20), C_TIMBER, bevel=0.012, ao_fn=wall_ao_fn(None))

    add_window(m, -1.25, front_y + 0.10, 1.55, 1.50, 1.12, facing='-y')
    add_window(m, -1.25, front_y + 0.04, 3.88, 1.42, 1.05, facing='-y')
    add_window(m, 1.55, front_y - 0.12, 3.25, 1.10, 0.92, facing='-y')
    add_window(m, -2.70, yc + 0.10, 1.60, 1.15, 1.02, facing='-x')
    add_window(m, 2.75, yc - 0.05, 1.60, 1.05, 0.98, facing='+x')
    add_window(m, -1.15, yc + 0.10 + d * 0.5, 3.82, 1.35, 1.02, facing='+y')
    return m.build_object()


def build_house_c():
    """House_C: Warm sand corner house with coastal slate-blue roof & side carport awning."""
    m = StorybookMesh('House_C')
    yc = 1.15
    w, d, plinth_h, body_h = 5.0, 4.3, 0.34, 4.55
    xc = -0.35  # offset slightly left so carport awning fits comfortably inside the 8.8m lot
    top_z = plinth_h + body_h
    ao = wall_ao_fn(top_z)

    m.add_beveled_box((xc, yc, plinth_h * 0.5), (w + 0.22, d + 0.22, plinth_h), C_PLINTH, bevel=0.04, ao_fn=ao)
    m.add_beveled_box((xc, yc, plinth_h + body_h * 0.5), (w, d, body_h), C_SAND_WALL, bevel=0.055, ao_fn=ao)
    m.add_pitched_prism((xc, yc, 0), w - 0.04, d - 0.04, top_z - 0.04, 1.40, 0.0, C_SAND_WALL, ridge_along_x=False, bevel=0.03, ao_fn=ao)
    m.add_pitched_prism((xc, yc, 0), w + 0.85, d + 0.88, top_z + 0.02, 1.52, 0.21, C_ROOF_SLATE, ridge_along_x=False, bevel=0.035)
    m.add_beveled_box((xc, yc, top_z + 1.52), (0.24, d + 0.94, 0.17), 0x435b6d, bevel=0.03)

    # Cozy side carport / bike awning on right side (+X)
    m.add_shed_slab((xc + w * 0.5 + 0.72, yc - 0.15, 0), 1.62, 3.15, 2.28, 2.66, 0.12, C_ROOF_SLATE, slope_dir='+x', bevel=0.025)
    for py in (yc - 1.45, yc + 1.15):
        m.add_cylinder((xc + w * 0.5 + 1.38, py, 1.18), 0.068, 0.068, 2.36, C_TIMBER, segs=10, ao_fn=wall_ao_fn(None), bevel=0.01)

    front_y = yc - d * 0.5
    add_door(m, xc + 1.10, front_y, plinth_h - 0.14, canopy_col=C_ROOF_SLATE)
    add_window(m, xc - 1.15, front_y, 1.52, 1.35, 1.08, facing='-y', shutter_col=C_ROOF_SLATE)
    add_window(m, xc - 1.10, front_y, 3.72, 1.25, 1.02, facing='-y')
    add_window(m, xc + 1.10, front_y, 3.72, 1.15, 0.98, facing='-y')
    add_window(m, xc - w * 0.5, yc, 1.55, 1.20, 1.02, facing='-x')
    add_window(m, xc, yc + d * 0.5, 3.72, 1.30, 1.02, facing='+y')
    return m.build_object()


def build_lot_wall(name, style):
    """1.1m-tall beveled low perimeter wall (~8.8m x 8.2m) with front gate, mailbox & stepping stones."""
    m = StorybookMesh(name)
    hw, hd = 4.4, 4.1  # outer half-width & half-depth
    wall_h = 1.06
    cap_h = 0.11
    ao = wall_ao_fn(None, base_z=0.30)

    if style == 'cream':
        wall_col, cap_col, pillar_col = 0xf4ead4, 0xd1b894, 0xebdec2
    elif style == 'brick':
        wall_col, cap_col, pillar_col = 0xc88463, 0xf2e6ce, 0xbc7556
    else:  # timber
        wall_col, cap_col, pillar_col = 0xc7986a, 0x865d41, 0xeee2c9

    # Back wall, left wall, right wall
    m.add_beveled_box((0, hd - 0.13, wall_h * 0.5), (hw * 2, 0.26, wall_h), wall_col, bevel=0.03, ao_fn=ao)
    m.add_beveled_box((0, hd - 0.13, wall_h + cap_h * 0.45), (hw * 2 + 0.08, 0.34, cap_h), cap_col, bevel=0.025)
    for sx in (-1, 1):
        m.add_beveled_box((sx * (hw - 0.13), 0.12, wall_h * 0.5), (0.26, hd * 2 - 0.24, wall_h), wall_col, bevel=0.03, ao_fn=ao)
        m.add_beveled_box((sx * (hw - 0.13), 0.12, wall_h + cap_h * 0.45), (0.34, hd * 2 - 0.16, cap_h), cap_col, bevel=0.025)

    # Front wall segments leaving a 2.0m centered gate opening (-1.0 .. +1.0)
    seg_w = hw - 1.0
    for sx in (-1, 1):
        cx = sx * (1.0 + seg_w * 0.5)
        m.add_beveled_box((cx, -hd + 0.13, wall_h * 0.5), (seg_w, 0.26, wall_h), wall_col, bevel=0.03, ao_fn=ao)
        m.add_beveled_box((cx, -hd + 0.13, wall_h + cap_h * 0.45), (seg_w + 0.06, 0.34, cap_h), cap_col, bevel=0.025)
        # Gate pillars (right pillar at +1.20 is slightly wider for mounting the SignKit nameplate)
        px = sx * 1.18
        pw = 0.44 if sx > 0 else 0.38
        ph = 1.44 if sx > 0 else 1.32
        m.add_beveled_box((px, -hd + 0.15, ph * 0.5), (pw, 0.40, ph), pillar_col, bevel=0.035, ao_fn=ao)
        m.add_beveled_box((px, -hd + 0.15, ph + 0.05), (pw + 0.10, 0.48, 0.10), cap_col, bevel=0.025)

    # Cute retro mailbox on left pillar
    m.add_beveled_box((-1.18, -hd - 0.07, 1.02), (0.24, 0.14, 0.30), 0xd45b44, bevel=0.025)
    m.add_beveled_box((-1.18, -hd - 0.08, 1.13), (0.16, 0.04, 0.03), 0xf8efd9, bevel=0.008)

    # Front low flowerbed hedge inside wall + stepping stones from gate toward house
    for sx in (-1, 1):
        m.add_beveled_box((sx * 2.75, -hd + 0.60, 0.18), (2.35, 0.62, 0.36), C_SOIL, bevel=0.03, ao_fn=ao)
        m.add_beveled_box((sx * 2.75, -hd + 0.60, 0.50), (2.20, 0.52, 0.38), C_HEDGE_LOW if sx < 0 else C_HEDGE_HI, bevel=0.14)
    for k in range(4):
        m.add_beveled_box(((-0.14 if k % 2 == 0 else 0.16), -hd + 0.35 + k * 0.72, 0.025), (0.72, 0.48, 0.05), C_STEP_STONE, bevel=0.02)

    return m.build_object()


def build_ac_unit():
    """Chunky rounded outdoor AC compressor unit with recessed circular fan grill."""
    m = StorybookMesh('Prop_ACUnit')
    ao = wall_ao_fn(None, base_z=0.15)
    m.add_beveled_box((0, 0.17, 0.29), (0.82, 0.34, 0.58), 0xeee7d7, bevel=0.045, ao_fn=ao)
    m.add_cylinder((-0.14, 0.015, 0.29), 0.21, 0.21, 0.04, 0x5c6669, segs=16, rot=(math.pi * 0.5, 0, 0), bevel=0.01)
    for k in (-0.11, 0.0, 0.11):
        m.add_beveled_box((-0.14, -0.008, 0.29 + k), (0.36, 0.02, 0.025), 0xdad2c2, bevel=0.006)
    m.add_beveled_box((0.24, 0.01, 0.40), (0.16, 0.03, 0.08), 0x628b7f, bevel=0.008)
    for sx in (-0.28, 0.28):
        m.add_beveled_box((sx, 0.22, -0.03), (0.07, 0.42, 0.07), C_DARK_IRON, bevel=0.015)
    return m.build_object()


def build_citrus_tree():
    """Cozy ~2.3m yard citrus tree with warm trunk, layered crown & small bright oranges."""
    m = StorybookMesh('Prop_CitrusTree')
    ao = wall_ao_fn(None, base_z=0.25)
    m.add_cylinder((0, 0, 0.48), 0.16, 0.11, 0.96, C_TIMBER, segs=10, ao_fn=ao, bevel=0.02)
    origin = (0.0, 0.0, 1.48)
    m.add_puff((0.0, 0.0, 1.42), (0.82, 0.80, 0.62), 12, 6, 0x457d4d, 0x63a159, 0x89be66, lump=0.08, seed=1.1, normal_origin=origin)
    m.add_puff((0.28, -0.22, 1.72), (0.56, 0.54, 0.46), 10, 5, 0x4f8851, 0x72ad5d, 0x99ca6d, lump=0.07, seed=2.4, normal_origin=origin)
    m.add_puff((-0.26, 0.18, 1.84), (0.50, 0.50, 0.42), 10, 5, 0x528b52, 0x79b260, 0xa2d071, lump=0.07, seed=3.7, normal_origin=origin)
    for (fx, fy, fz) in [
        (-0.48, -0.52, 1.45), (0.42, -0.62, 1.38), (0.58, -0.18, 1.72),
        (-0.12, -0.68, 1.66), (-0.54, 0.22, 1.74), (0.18, 0.56, 1.56),
        (0.05, -0.46, 1.98), (-0.36, -0.34, 1.92),
    ]:
        m.add_puff((fx, fy, fz), (0.068, 0.068, 0.066), 6, 3, 0xd66b22, C_CITRUS, 0xffad42, lump=0.0)
    return m.build_object()


def build_vending_machine():
    """Tall (~1.98m) Japanese corner vending machine with warm glowing display window & colorful cans."""
    m = StorybookMesh('Prop_VendingMachine')
    ao = wall_ao_fn(None, base_z=0.28)
    # 1.98m tall so bounding box passes time-of-day.js >=1.95m check and illuminates display at night!
    m.add_beveled_box((0, 0, 0.99), (1.14, 0.72, 1.98), 0xf8f1e2, bevel=0.055, ao_fn=ao)
    m.add_beveled_box((0, -0.02, 1.86), (1.20, 0.78, 0.22), 0x488c7c, bevel=0.045)
    # Illuminated beverage showcase window (exact C_DISPLAY_GLASS for warm night glow)
    m.add_beveled_box((0, -0.345, 1.30), (0.94, 0.05, 0.78), C_DISPLAY_GLASS, bevel=0.0, smooth=False, glass=True)
    # Drink rows & colorful mini drink cans inside showcase
    can_cols = [0xe66a4c, 0x5da99c, 0xf2c64b, 0x628ec2, 0xe88a4c]
    for ri, rz in enumerate((1.06, 1.29, 1.52)):
        m.add_beveled_box((0, -0.368, rz - 0.06), (0.90, 0.025, 0.025), 0x4b5652, bevel=0.005)
        for ci in range(6):
            cx = -0.35 + ci * 0.14
            m.add_beveled_box((cx, -0.368, rz + 0.015), (0.075, 0.03, 0.11), can_cols[(ri * 2 + ci) % len(can_cols)], bevel=0.01)
    # Pickup flap + red button/coin slot
    m.add_beveled_box((0, -0.355, 0.42), (0.84, 0.06, 0.24), 0x56625f, bevel=0.02)
    m.add_beveled_box((0.35, -0.365, 0.76), (0.14, 0.03, 0.18), 0xd86744, bevel=0.01)
    return m.build_object()


def build_corner_mirror():
    """Japanese convex traffic safety mirror on tall orange-striped post."""
    m = StorybookMesh('Prop_CornerMirror')
    ao = wall_ao_fn(None, base_z=0.30)
    m.add_cylinder((0, 0, 1.25), 0.052, 0.048, 2.50, 0xe8b24a, segs=10, ao_fn=ao, bevel=0.01)
    m.add_cylinder((0, -0.08, 2.32), 0.36, 0.36, 0.12, 0xe6722d, segs=16, rot=(math.pi * 0.5, 0, 0), bevel=0.025)
    m.add_cylinder((0, -0.14, 2.32), 0.30, 0.30, 0.05, 0xdde9ed, segs=16, rot=(math.pi * 0.5, 0, 0), bevel=0.01)
    return m.build_object()


def build_utility_pole():
    """Clean storybook street utility pole with crossarm & insulators."""
    m = StorybookMesh('Prop_UtilityPole')
    ao = wall_ao_fn(None, base_z=0.45)
    m.add_cylinder((0, 0, 3.40), 0.16, 0.11, 6.80, 0xd8d0c1, segs=10, ao_fn=ao, bevel=0.015)
    m.add_cylinder((0, 0, 1.15), 0.155, 0.155, 0.55, 0xf2c244, segs=10)
    m.add_beveled_box((0, 0, 6.28), (1.75, 0.12, 0.12), C_DARK_IRON, bevel=0.025)
    for ix in (-0.72, 0.0, 0.72):
        m.add_cylinder((ix, 0, 6.40), 0.055, 0.042, 0.14, 0xf6f2e8, segs=8)
    return m.build_object()


assets = [
    build_house_a(),
    build_house_b(),
    build_house_c(),
    build_lot_wall('Lot_Wall_Cream', 'cream'),
    build_lot_wall('Lot_Wall_Brick', 'brick'),
    build_lot_wall('Lot_Wall_Timber', 'timber'),
    build_ac_unit(),
    build_citrus_tree(),
    build_vending_machine(),
    build_corner_mirror(),
    build_utility_pole(),
]

for obj in assets:
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'{obj.name:22s}: {len(obj.data.vertices):5d} verts, {tris:5d} tris')

out_path = Path(__file__).resolve().with_name('coastal-houses.glb')
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format='GLB',
    export_yup=True,
    export_texcoords=False,
    export_normals=True,
    export_vertex_color='ACTIVE',
    export_materials='EXPORT',
)
print(f'Wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KB)')
