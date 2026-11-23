"""blender --background --factory-startup --python-exit-code 2 --python hillside-village.py

Build the Ghibli painterly hillside village 3D architectural & landmark kit
(hillside-village.glb) for Shiba Delivery (Style A: Soft Storybook).

Conventions:
- Blender Z-up, metric units matching the 0.84 street-scale Shiba & scooter; front faces -Y.
- glTF exports Y-up, front facing +Z.
- Cottages & windmill feature deep stone plinths (extending down to z = -1.8m..-2.0m)
  so they seat seamlessly into rolling hillside slopes without floating.
- Windows are true 3D recessed openings (~0.18m reveal depth) framed by beveled casing,
  protruding sills, mullions, shutters, and flowerboxes.
- Exact hexes 0x527a78 (window glass) and 0xe8d798 (lantern) are preserved with smooth=False
  so src/morning/time-of-day.js automatically illuminates them at dusk/night.
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau

# Palette harmonized with src/morning/city-palette.js & time-of-day.js
C_GLASS = 0x527a78            # exact WINDOW_HEXES match for automatic dusk/night glow
C_LANTERN_GLASS = 0xe8d798    # exact WINDOW_HEXES match for glowing roadside lantern
C_WALL_CREAM = 0xf6ecd6
C_WALL_IVORY = 0xf8f1e1
C_WALL_SAND = 0xf2e3c6
C_WALL_RECESS = 0x8d8272      # deep shaded reveal tone inside recessed openings
C_STONE_PLINTH = 0xa99f8d
C_STONE_CAP = 0xc9bfa9
C_TRIM = 0xfaf2e0
C_TIMBER = 0x7c5439
C_TIMBER_LIGHT = 0xa97c52
C_SHUTTER_SAGE = 0x5a8c72
C_SHUTTER_BLUE = 0x587d92
C_SHUTTER_WARM = 0x865d41
C_ROOF_TERRA = 0xc85c3e       # unified Ghibli terracotta red across village
C_ROOF_TERRA_B = 0xcb6243
C_ROOF_RIDGE = 0xa8472e
C_IRON = 0x45504d
C_FLOWERBOX = 0x8a5b3e
C_LEAF_BOT = 0x4d8452
C_LEAF_MID = 0x6ca459
C_LEAF_TOP = 0x94c668
C_FLOWER_CREAM = 0xfff3d4
C_FLOWER_CORAL = 0xe87d5c
C_FLOWER_GOLD = 0xf4c554
C_SAIL_LINEN = 0xf7efd8
C_MOSS_TOP = 0x6b9454
C_ROCK_STONE = 0x999282


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
    """Apply smooth storybook AO darkening, nudging shadowed regions toward cool slate."""
    r, g, b, a = col_srgb
    f = max(0.45, min(1.12, ao))
    cool_r, cool_g, cool_b = 0.80, 0.86, 0.98
    k = max(0.0, min(1.0, (1.0 - f) * 0.62 + tint_cool))
    return (
        max(0.0, min(1.0, r * (f * (1.0 - k) + cool_r * f * k))),
        max(0.0, min(1.0, g * (f * (1.0 - k) + cool_g * f * k))),
        max(0.0, min(1.0, b * (f * (1.0 - k) + cool_b * f * k))),
        a,
    )


class GhibliMesh:
    """Builds beveled architectural geometry with weighted normals and baked vertex AO."""

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

    def _finalize_bm(self, bm, color, ao_fn=None, smooth=True, glass=False, custom_nors=None):
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
                    cool = 0.0
                    if ao_fn and f.normal.z < -0.35:
                        cool = 0.24
                    loop[col_layer] = shade_srgb(base_srgb, ao, tint_cool=cool)
        nors = custom_nors if custom_nors is not None else self._weighted_normals(bm)
        self.parts.append((bm, nors))

    def add_box(
        self,
        center,
        size,
        color,
        bevel=0.025,
        segments=1,
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
            b_off = min(bevel, min(sx, sy, sz) * 0.40)
            if b_off > 0.002:
                bmesh.ops.bevel(
                    bm, geom=list(bm.edges), offset=b_off, segments=segments,
                    profile=0.5, affect='EDGES', clamp_overlap=True,
                )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize_bm(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass)

    def add_pitched_prism(
        self,
        center,
        width,
        depth,
        base_z,
        ridge_h,
        thickness,
        color,
        ridge_along_x=True,
        bevel=0.028,
        ao_fn=None,
        smooth=True,
    ):
        bm = bmesh.new()
        hw, hd = width * 0.5, depth * 0.5
        if ridge_along_x:
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
                bm, geom=list(bm.edges), offset=bevel, segments=1,
                profile=0.5, affect='EDGES', clamp_overlap=True,
            )
        bmesh.ops.translate(bm, vec=Vector((center[0], center[1], base_z)), verts=bm.verts)
        self._finalize_bm(bm, color, ao_fn=ao_fn, smooth=smooth)

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
        bevel=0.025,
        ao_fn=None,
        smooth=True,
    ):
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
                bm, geom=list(bm.edges), offset=bevel, segments=1,
                profile=0.5, affect='EDGES', clamp_overlap=True,
            )
        bmesh.ops.translate(bm, vec=Vector((center[0], center[1], 0.0)), verts=bm.verts)
        self._finalize_bm(bm, color, ao_fn=ao_fn, smooth=smooth)

    def add_cylinder(
        self,
        center,
        radius_bot,
        radius_top,
        height,
        color,
        segs=14,
        rot=(0.0, 0.0, 0.0),
        ao_fn=None,
        smooth=True,
        bevel=0.0,
        glass=False,
    ):
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=radius_bot, radius2=radius_top, depth=height,
        )
        if bevel > 0.002:
            cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
            if cap_edges:
                bmesh.ops.bevel(
                    bm, geom=cap_edges, offset=bevel, segments=1,
                    profile=0.5, affect='EDGES', clamp_overlap=True,
                )
        mat = Euler(rot, 'XYZ').to_matrix().to_4x4()
        mat.translation = Vector(center)
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        self._finalize_bm(bm, color, ao_fn=ao_fn, smooth=smooth, glass=glass)

    def add_recessed_wall_shell(
        self,
        bounds,
        wall_color,
        recess_color,
        openings,
        ao_fn=None,
        recess_depth=0.18,
    ):
        """Build a solid wall mass with TRUE 3D recessed window/door cavities (zero booleans/coplanar seams).

        bounds: (xmin, xmax, ymin, ymax, zmin, zmax)
        openings: list of dicts { 'face': '-y'|'+y'|'+x'|'-x', 'u0', 'u1', 'z0', 'z1', 'depth'? }
                  u is along local X for -y/+y faces, or local Y for +x/-x faces.
        Each exterior face with openings builds a shared watertight quad grid where opening cells
        step inward by recess_depth, forming shaded reveal jambs + lintel + sill.
        Faces without openings keep single clean panels; corner joints bevel subtly.
        """
        xmin, xmax, ymin, ymax, zmin, zmax = bounds
        by_face = {'-y': [], '+y': [], '-x': [], '+x': []}
        for op in openings:
            by_face[op['face']].append(op)

        def build_face_sheet(face_id):
            bm = bmesh.new()
            ops = by_face[face_id]
            if face_id in ('-y', '+y'):
                u_min, u_max = xmin, xmax
                y_out = ymin if face_id == '-y' else ymax
                in_dir = 1.0 if face_id == '-y' else -1.0
                out_norm = Vector((0.0, -1.0 if face_id == '-y' else 1.0, 0.0))
                make_pt = lambda u, dep, z: Vector((u, y_out + in_dir * dep, z))
            else:
                u_min, u_max = ymin, ymax
                x_out = xmin if face_id == '-x' else xmax
                in_dir = 1.0 if face_id == '-x' else -1.0
                out_norm = Vector((-1.0 if face_id == '-x' else 1.0, 0.0, 0.0))
                make_pt = lambda u, dep, z: Vector((x_out + in_dir * dep, u, z))

            us = {round(u_min, 5), round(u_max, 5)}
            zs = {round(zmin, 5), round(zmax, 5)}
            for op in ops:
                us.add(round(max(u_min + 0.05, min(u_max - 0.05, op['u0'])), 5))
                us.add(round(max(u_min + 0.05, min(u_max - 0.05, op['u1'])), 5))
                zs.add(round(max(zmin + 0.05, min(zmax - 0.05, op['z0'])), 5))
                zs.add(round(max(zmin + 0.05, min(zmax - 0.05, op['z1'])), 5))
            us = sorted(us)
            zs = sorted(zs)
            nu, nz = len(us) - 1, len(zs) - 1

            # Determine which cells belong to an opening
            cell_op = [[None] * nz for _ in range(nu)]
            for i in range(nu):
                um = 0.5 * (us[i] + us[i + 1])
                for j in range(nz):
                    zm = 0.5 * (zs[j] + zs[j + 1])
                    for op in ops:
                        if op['u0'] <= um <= op['u1'] and op['z0'] <= zm <= op['z1']:
                            cell_op[i][j] = op
                            break

            # Build single watertight exterior face grid + true 3D recessed pockets
            v_out = [[bm.verts.new(make_pt(us[i], 0.0, zs[j])) for j in range(nz + 1)] for i in range(nu + 1)]
            wall_faces = []
            recess_faces = []
            for i in range(nu):
                for j in range(nz):
                    if cell_op[i][j] is None:
                        wall_faces.append(bm.faces.new((v_out[i][j], v_out[i + 1][j], v_out[i + 1][j + 1], v_out[i][j + 1])))

            jamb_checks = []
            back_checks = []
            for op in ops:
                d = op.get('depth', recess_depth)
                i0 = us.index(round(max(u_min + 0.05, min(u_max - 0.05, op['u0'])), 5))
                i1 = us.index(round(max(u_min + 0.05, min(u_max - 0.05, op['u1'])), 5))
                j0 = zs.index(round(max(zmin + 0.05, min(zmax - 0.05, op['z0'])), 5))
                j1 = zs.index(round(max(zmin + 0.05, min(zmax - 0.05, op['z1'])), 5))
                in_bot = [bm.verts.new(make_pt(us[i], d, zs[j0])) for i in range(i0, i1 + 1)]
                in_top = [bm.verts.new(make_pt(us[i], d, zs[j1])) for i in range(i0, i1 + 1)]
                in_l = [in_bot[0]] + [bm.verts.new(make_pt(us[i0], d, zs[j])) for j in range(j0 + 1, j1)] + [in_top[0]]
                in_r = [in_bot[-1]] + [bm.verts.new(make_pt(us[i1], d, zs[j])) for j in range(j0 + 1, j1)] + [in_top[-1]]
                op_center = make_pt(0.5 * (us[i0] + us[i1]), 0.5 * d, 0.5 * (zs[j0] + zs[j1]))

                bf = bm.faces.new((in_bot[0], in_bot[-1], in_top[-1], in_top[0]))
                recess_faces.append(bf)
                back_checks.append(bf)

                op_jambs = []
                for k in range(i1 - i0):
                    op_jambs.append(bm.faces.new((v_out[i0 + k][j0], v_out[i0 + k + 1][j0], in_bot[k + 1], in_bot[k])))
                    op_jambs.append(bm.faces.new((v_out[i0 + k + 1][j1], v_out[i0 + k][j1], in_top[k], in_top[k + 1])))
                for k in range(j1 - j0):
                    op_jambs.append(bm.faces.new((v_out[i0][j0 + k + 1], v_out[i0][j0 + k], in_l[k], in_l[k + 1])))
                    op_jambs.append(bm.faces.new((v_out[i1][j0 + k], v_out[i1][j0 + k + 1], in_r[k + 1], in_r[k])))
                recess_faces.extend(op_jambs)
                jamb_checks.append((op_center, op_jambs))

            bm.normal_update()
            for f in wall_faces:
                if f.normal.dot(out_norm) < 0.0:
                    f.normal_flip()
            for f in back_checks:
                if f.normal.dot(out_norm) < 0.0:
                    f.normal_flip()
            for op_center, op_jambs in jamb_checks:
                for f in op_jambs:
                    if f.normal.dot(op_center - f.calc_center_median()) < 0.0:
                        f.normal_flip()
            bm.normal_update()

            base_wall = hex_srgb(wall_color)
            base_rec = hex_srgb(recess_color)
            col_layer = bm.loops.layers.color.new('Color')
            custom_nors = {}
            recess_set = set(recess_faces)
            for f in bm.faces:
                is_rec = f in recess_set
                f.smooth = not is_rec
                col = base_rec if is_rec else base_wall
                for loop in f.loops:
                    p = loop.vert.co
                    ao = ao_fn(p, f.normal) if ao_fn else 1.0
                    if is_rec:
                        ao *= 0.72
                    loop[col_layer] = shade_srgb(col, ao, tint_cool=(0.22 if is_rec else 0.0))
                    custom_nors[loop] = f.normal.copy() if is_rec else out_norm.copy()
            self.parts.append((bm, custom_nors))

        for fid in ('-y', '+y', '-x', '+x'):
            build_face_sheet(fid)

        # Inner light-blocking core inset past the deepest pocket (0.26m per side)
        cw = max(0.2, xmax - xmin - 0.52)
        cd = max(0.2, ymax - ymin - 0.52)
        self.add_box(
            (0.5 * (xmin + xmax), 0.5 * (ymin + ymax), 0.5 * (zmin + zmax)),
            (cw, cd, zmax - zmin - 0.04),
            wall_color, bevel=0.0, ao_fn=ao_fn, smooth=False,
        )

    def add_puff(self, center, radii, segs, rings, col_bot, col_mid, col_top, lump=0.09, seed=0.0):
        bm = bmesh.new()
        c = Vector(center)
        rx, ry, rz = radii
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
                p = Vector((c.x + dx * rx * bulge, c.y + dy * ry * bulge, c.z + dz * rz * bulge))
                t = max(0.0, min(1.0, (dz + 1.0) * 0.5))
                col = lerp_hex(col_bot, col_mid, t * 2.0) if t < 0.5 else lerp_hex(col_mid, col_top, (t - 0.5) * 2.0)
                n = Vector((dx, dy, dz + 0.20)).normalized()
                v = bm.verts.new(p)
                v_cols[v] = col
                v_nors[v] = n
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
        merged = bmesh.new()
        col_layer = merged.loops.layers.color.new('Color')
        loop_nors = []
        has_custom = False

        for bm, custom_nors in self.parts:
            src_col = bm.loops.layers.color.get('Color')
            vert_map = {v: merged.verts.new(v.co) for v in bm.verts}
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

        src_attr = mesh.color_attributes.get('Color')
        loop_rgba = [tuple(src_attr.data[i].color_srgb) for i in range(len(mesh.loops))] if src_attr else []
        if src_attr:
            mesh.color_attributes.remove(src_attr)
        attr = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        for i, rgba in enumerate(loop_rgba):
            attr.data[i].color_srgb = rgba

        if has_custom:
            mesh.update()
            final_nors = [
                cn if cn is not None else mesh.vertices[mesh.loops[li].vertex_index].normal
                for li, cn in enumerate(loop_nors)
            ]
            mesh.normals_split_custom_set(final_nors)

        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        mat = bpy.data.materials.get('Ghibli_Village_Shared_Mat')
        if mat is None:
            mat = bpy.data.materials.new('Ghibli_Village_Shared_Mat')
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Roughness'].default_value = 0.90
            vcol_node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
            vcol_node.layer_name = 'Color'
            mat.node_tree.links.new(vcol_node.outputs['Color'], bsdf.inputs['Base Color'])
        mesh.materials.append(mat)
        return obj


def hill_ao(eave_z, base_z=0.55):
    def fn(p, n):
        ao = 1.0
        if p.z < base_z:
            # Ground plinth softly into terrain
            t = max(0.0, min(1.0, (p.z + 0.4) / (base_z + 0.4)))
            ao *= 0.72 + 0.28 * t
        if eave_z is not None and abs(n.z) < 0.55 and eave_z - 1.15 < p.z <= eave_z + 0.15:
            t = max(0.0, min(1.0, (eave_z - p.z) / 1.15))
            ao *= 0.78 + 0.22 * t
        if n.z < -0.45:
            ao *= 0.74
        return ao
    return fn


def populate_recessed_window(m, face, cx, cy, cz, w, h, trim_col=C_TRIM, sill_col=C_TIMBER_LIGHT,
                             shutter_col=C_SHUTTER_SAGE, flowerbox=False, reveal=0.18, seed=0.0):
    """Add recessed glass, wood mullions, protruding sill, outer frame casing, shutters & flowerbox
    cleanly inside an opening punched into add_recessed_wall_shell."""
    rot_z = {'-y': 0.0, '+y': math.pi, '+x': math.pi * 0.5, '-x': -math.pi * 0.5}[face]
    dx, dy = {'-y': (0.0, -1.0), '+y': (0.0, 1.0), '+x': (1.0, 0.0), '-x': (-1.0, 0.0)}[face]
    px, py = -dy, dx  # local horizontal along facade

    def pt(lu, dep, lz):
        # dep > 0 steps inward from exterior wall plane
        return (cx + px * lu - dx * dep, cy + py * lu - dy * dep, cz + lz)

    # 1) Recessed glass pane (0x527a78 flat normal) tucked 0.13m behind wall surface
    m.add_box(pt(0.0, reveal - 0.03, 0.0), (w - 0.06, 0.035, h - 0.06), C_GLASS,
              bevel=0.0, rot=(0, 0, rot_z), smooth=False, glass=True)
    # 2) Thick inner wooden window frame & mullions forward of glass
    m.add_box(pt(0.0, reveal - 0.06, 0.0), (0.055, 0.055, h - 0.04), trim_col, bevel=0.0, rot=(0, 0, rot_z))
    m.add_box(pt(0.0, reveal - 0.06, -h * 0.06), (w - 0.04, 0.055, 0.055), trim_col, bevel=0.0, rot=(0, 0, rot_z))
    for su in (-1, 1):
        m.add_box(pt(su * (w * 0.5 - 0.035), reveal - 0.065, 0.0), (0.07, 0.06, h), trim_col, bevel=0.0, rot=(0, 0, rot_z))
    m.add_box(pt(0.0, reveal - 0.065, h * 0.5 - 0.035), (w, 0.06, 0.07), trim_col, bevel=0.0, rot=(0, 0, rot_z))

    # 3) Outer stone/timber protruding lintel & sill casting deep storybook shadow
    m.add_box(pt(0.0, -0.04, h * 0.5 + 0.06), (w + 0.24, 0.14, 0.11), C_STONE_CAP, bevel=0.018, rot=(0, 0, rot_z))
    m.add_box(pt(0.0, -0.07, -h * 0.5 - 0.045), (w + 0.28, 0.22, 0.10), sill_col, bevel=0.02, rot=(0, 0, rot_z))

    # 4) Hinged exterior wooden/sage shutters on both sides of the opening
    if shutter_col is not None:
        sw = max(0.24, w * 0.34)
        for su in (-1, 1):
            m.add_box(pt(su * (w * 0.5 + sw * 0.5 + 0.06), -0.035, 0.0), (sw, 0.055, h + 0.02),
                      shutter_col, bevel=0.012, rot=(0, 0, rot_z))
            for bar_z in (-h * 0.30, h * 0.30):
                m.add_box(pt(su * (w * 0.5 + sw * 0.5 + 0.06), -0.062, bar_z), (sw - 0.04, 0.02, 0.045),
                          C_TIMBER, bevel=0.0, rot=(0, 0, rot_z))

    # 5) Optional timber flowerbox filled with puff leaves & colorful blooms under sill
    if flowerbox:
        m.add_box(pt(0.0, -0.14, -h * 0.5 - 0.20), (w + 0.14, 0.24, 0.20), C_FLOWERBOX, bevel=0.018, rot=(0, 0, rot_z))
        for k in (-1, 0, 1):
            bx, by, bz = pt(k * (w * 0.28), -0.15, -h * 0.5 - 0.06)
            m.add_puff((bx, by, bz), (0.19, 0.16, 0.13), 6, 3, C_LEAF_BOT, C_LEAF_MID, C_LEAF_TOP, lump=0.14, seed=seed + k)
            fl_col = [C_FLOWER_CREAM, C_FLOWER_CORAL, C_FLOWER_GOLD][(k + 1) % 3]
            fx, fy, fz = pt(k * (w * 0.26) + 0.04, -0.20, -h * 0.5 + 0.02)
            m.add_puff((fx, fy, fz), (0.055, 0.055, 0.05), 5, 2, fl_col, fl_col, 0xffffff, lump=0.05)


def populate_recessed_door(m, face, cx, cy, z_bot, w=1.08, h=2.08, door_col=C_TIMBER, canopy_col=C_ROOF_TERRA, reveal=0.22):
    """Deep recessed timber door with stone steps & tiled overhang hood."""
    rot_z = {'-y': 0.0, '+y': math.pi, '+x': math.pi * 0.5, '-x': -math.pi * 0.5}[face]
    dx, dy = {'-y': (0.0, -1.0), '+y': (0.0, 1.0), '+x': (1.0, 0.0), '-x': (-1.0, 0.0)}[face]
    px, py = -dy, dx

    def pt(lu, dep, z):
        return (cx + px * lu - dx * dep, cy + py * lu - dy * dep, z)

    # Recessed wooden door leaf + vertical plank strips + small door window
    m.add_box(pt(0.0, reveal - 0.04, z_bot + h * 0.5), (w - 0.04, 0.06, h - 0.02), door_col, bevel=0.012, rot=(0, 0, rot_z))
    m.add_box(pt(0.0, reveal - 0.08, z_bot + h * 0.66), (w * 0.36, 0.03, h * 0.24), C_GLASS, bevel=0.0, rot=(0, 0, rot_z), smooth=False, glass=True)
    m.add_box(pt(0.32, reveal - 0.09, z_bot + h * 0.48), (0.04, 0.04, 0.14), 0xd8a84a, bevel=0.008, rot=(0, 0, rot_z))
    # Stone surround frame + thick entrance steps
    m.add_box(pt(0.0, -0.05, z_bot + h + 0.07), (w + 0.30, 0.16, 0.14), C_STONE_CAP, bevel=0.02, rot=(0, 0, rot_z))
    m.add_box(pt(0.0, -0.34, z_bot * 0.5 - 0.12), (w + 0.48, 0.72, max(0.45, z_bot + 0.24)), C_STONE_PLINTH, bevel=0.025, rot=(0, 0, rot_z))
    # Small tiled entry porch hood + timber brackets
    hood_y = z_bot + h + 0.40
    slope = face
    m.add_shed_slab(pt(0.0, -0.36, 0.0)[:2], w + 0.68 if face in ('-y', '+y') else 0.78,
                    0.78 if face in ('-y', '+y') else w + 0.68,
                    hood_y - 0.24, hood_y + 0.05, 0.13, canopy_col, slope_dir=slope, bevel=0.02)
    for su in (-1, 1):
        m.add_box(pt(su * (w * 0.5 + 0.08), -0.26, z_bot + h + 0.06), (0.09, 0.44, 0.10), C_TIMBER, bevel=0.015, rot=(0, 0, rot_z))


def add_ghibli_gable_roof(m, cx, cy, z_eave, wall_w, wall_d, overhang, ridge_h, thickness,
                          roof_col=C_ROOF_TERRA, plaster_col=C_WALL_CREAM, ridge_along_x=True, chimney=True, ao=None):
    """Chunky Ghibli terracotta roof with thick overhang, exposed timber rafters, gable wall, ridge cap, tile ribs & chimney."""
    # Gable plaster triangle under roof
    m.add_pitched_prism((cx, cy, 0.0), wall_w, wall_d, z_eave - 0.02, ridge_h - 0.12, 0.0, plaster_col,
                        ridge_along_x=ridge_along_x, bevel=0.02, ao_fn=ao)
    rw = wall_w + overhang * 2.0
    rd = wall_d + overhang * 2.0
    # Thick terracotta roof slab
    m.add_pitched_prism((cx, cy, 0.0), rw, rd, z_eave + thickness * 0.4, ridge_h, thickness, roof_col,
                        ridge_along_x=ridge_along_x, bevel=0.035)
    # Raised terracotta semicircular-look ridge cap + bargeboard fascia accents
    if ridge_along_x:
        m.add_box((cx, cy, z_eave + thickness * 0.4 + ridge_h + 0.05), (rw + 0.10, 0.24, 0.16), C_ROOF_RIDGE, bevel=0.04)
        # Exposed timber rafter tails lining front (-Y) and back (+Y) eaves
        n_raf = max(4, int(rw / 0.85))
        for k in range(n_raf + 1):
            rx = cx - rw * 0.45 + (rw * 0.90) * (k / n_raf)
            for sy in (-1, 1):
                m.add_box((rx, cy + sy * (wall_d * 0.5 + overhang * 0.55), z_eave - 0.06),
                          (0.09, overhang * 0.95, 0.11), C_TIMBER, bevel=0.015)
        # Sculpted horizontal tile course ribs along front/back roof slopes
        slope_len = math.hypot(rd * 0.5, ridge_h)
        slope_ang = math.atan2(ridge_h, rd * 0.5)
        n_ribs = max(4, int(rw / 0.72))
        for col_i in range(n_ribs):
            tx = cx - rw * 0.46 + (rw * 0.92) * (col_i / max(1, n_ribs - 1))
            for sy in (-1, 1):
                mid_y = cy + sy * (rd * 0.25)
                mid_z = z_eave + thickness * 0.4 + ridge_h * 0.5 + 0.015
                m.add_box((tx, mid_y, mid_z), (0.068, slope_len * 0.94, 0.055),
                          C_ROOF_RIDGE, bevel=0.0, rot=(-sy * slope_ang, 0, 0))
    else:
        m.add_box((cx, cy, z_eave + thickness * 0.4 + ridge_h + 0.05), (0.24, rd + 0.10, 0.16), C_ROOF_RIDGE, bevel=0.04)
        n_raf = max(4, int(rd / 0.85))
        for k in range(n_raf + 1):
            ry = cy - rd * 0.45 + (rd * 0.90) * (k / n_raf)
            for sx in (-1, 1):
                m.add_box((cx + sx * (wall_w * 0.5 + overhang * 0.55), ry, z_eave - 0.06),
                          (overhang * 0.95, 0.09, 0.11), C_TIMBER, bevel=0.015)

    # Cozy cream plaster chimney + terracotta crown pot
    if chimney:
        ch_x = cx + wall_w * 0.24
        ch_y = cy + wall_d * 0.14
        ch_base = z_eave + ridge_h * 0.45
        ch_top = z_eave + ridge_h + 0.95
        m.add_box((ch_x, ch_y, 0.5 * (ch_base + ch_top)), (0.64, 0.64, ch_top - ch_base), plaster_col, bevel=0.03)
        m.add_box((ch_x, ch_y, ch_top + 0.06), (0.76, 0.76, 0.14), C_STONE_CAP, bevel=0.025)
        m.add_cylinder((ch_x, ch_y, ch_top + 0.26), 0.14, 0.12, 0.30, C_ROOF_TERRA, segs=10, bevel=0.015)


# ==============================================================================
# 1. Ghibli_Cottage_A: 1.5-story gabled hillside cottage (~7.4m x 5.6m)
# ==============================================================================
def build_cottage_a():
    m = GhibliMesh('Ghibli_Cottage_A')
    W, D = 7.4, 5.6
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.62
    eave_z = 3.85
    ao = hill_ao(eave_z, base_z=0.70)

    # Deep hillside stone plinth down to z = -1.8m (never floats on slopes)
    m.add_box((0.0, 0.0, 0.5 * (plinth_h - 1.80)), (W + 0.22, D + 0.22, plinth_h + 1.80), C_STONE_PLINTH, bevel=0.04, ao_fn=ao)
    m.add_box((0.0, 0.0, plinth_h + 0.04), (W + 0.32, D + 0.32, 0.12), C_STONE_CAP, bevel=0.025, ao_fn=ao)

    # Slotted exterior walls with genuine 3D recessed openings
    openings = [
        {'face': '-y', 'u0': -2.55, 'u1': -1.05, 'z0': 1.38, 'z1': 2.66},  # GF left window
        {'face': '-y', 'u0': -0.25, 'u1': 0.85,  'z0': 0.66, 'z1': 2.74, 'depth': 0.22},  # GF door
        {'face': '-y', 'u0': 1.55,  'u1': 2.75,  'z0': 1.38, 'z1': 2.66},  # GF right window
        {'face': '+x', 'u0': -0.80, 'u1': 0.80,  'z0': 1.48, 'z1': 2.72},  # Side window
        {'face': '-x', 'u0': -0.75, 'u1': 0.75,  'z0': 1.48, 'z1': 2.72},  # Side window
        {'face': '+y', 'u0': -1.80, 'u1': -0.45, 'z0': 1.45, 'z1': 2.68},  # Back window
        {'face': '+y', 'u0': 0.65,  'u1': 2.00,  'z0': 1.45, 'z1': 2.68},  # Back window
    ]
    m.add_recessed_wall_shell((-hw, hw, -hd, hd, plinth_h + 0.06, eave_z), C_WALL_CREAM, C_WALL_RECESS, openings, ao_fn=ao)

    # Timber corner posts & upper belt beam for rich Ghibli craftsmanship
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add_box((sx * (hw - 0.05), sy * (hd - 0.05), 0.5 * (plinth_h + eave_z)),
                      (0.22, 0.22, eave_z - plinth_h), C_TIMBER, bevel=0.02, ao_fn=ao)
    m.add_box((0.0, 0.0, eave_z - 0.08), (W + 0.08, D + 0.08, 0.16), C_TIMBER, bevel=0.02, ao_fn=ao)

    # Populate all recessed openings with sashes, shutters, sills & flowerboxes
    populate_recessed_window(m, '-y', -1.80, -hd, 2.02, 1.50, 1.28, shutter_col=C_SHUTTER_SAGE, flowerbox=True, seed=1.2)
    populate_recessed_door(m, '-y', 0.30, -hd, 0.66, w=1.10, h=2.08, canopy_col=C_ROOF_TERRA)
    populate_recessed_window(m, '-y', 2.15, -hd, 2.02, 1.20, 1.28, shutter_col=C_SHUTTER_SAGE, flowerbox=True, seed=3.4)
    populate_recessed_window(m, '+x', hw, 0.0, 2.10, 1.60, 1.24, shutter_col=C_SHUTTER_WARM, flowerbox=False)
    populate_recessed_window(m, '-x', -hw, 0.0, 2.10, 1.50, 1.24, shutter_col=C_SHUTTER_WARM, flowerbox=False)
    populate_recessed_window(m, '+y', -1.12, hd, 2.06, 1.35, 1.23, shutter_col=C_SHUTTER_SAGE, flowerbox=False)
    populate_recessed_window(m, '+y', 1.32, hd, 2.06, 1.35, 1.23, shutter_col=C_SHUTTER_SAGE, flowerbox=False)

    # Attic gable round/arched accent windows on -X / +X ends
    for sx, fdir in [(-1, '-x'), (1, '+x')]:
        wx = sx * (hw + 0.02)
        m.add_box((wx, 0.0, eave_z + 0.92), (0.14, 0.88, 0.92), C_TRIM, bevel=0.02)
        m.add_box((wx + sx * 0.04, 0.0, eave_z + 0.92), (0.04, 0.66, 0.70), C_GLASS, bevel=0.0, smooth=False, glass=True)

    # Chunky unified red terracotta gable roof + chimney
    add_ghibli_gable_roof(m, 0.0, 0.0, eave_z, W, D, overhang=0.52, ridge_h=2.55, thickness=0.22,
                          roof_col=C_ROOF_TERRA, plaster_col=C_WALL_CREAM, ridge_along_x=True, chimney=True, ao=ao)
    return m.build_object()


# ==============================================================================
# 2. Ghibli_Cottage_B: 2-story stepped coastal house + awning & 2F balcony (~8.4m x 6.2m)
# ==============================================================================
def build_cottage_b():
    m = GhibliMesh('Ghibli_Cottage_B')
    MW, MD = 5.6, 5.8
    m_x0, m_x1 = -3.9, 1.7
    mcx = 0.5 * (m_x0 + m_x1)  # -1.1
    hd = MD * 0.5              # 2.9
    plinth_h = 0.58
    main_eave = 5.65
    ao = hill_ao(main_eave, base_z=0.68)

    # Side wing bounds (right extension)
    s_x0, s_x1 = 1.65, 4.35
    sy0, sy1 = -2.35, 2.55
    scx, scy = 0.5 * (s_x0 + s_x1), 0.5 * (sy0 + sy1)
    sw, sd = s_x1 - s_x0, sy1 - sy0
    side_eave = 3.25

    # Unified deep stone plinth down to z = -1.8m
    m.add_box((mcx, 0.0, 0.5 * (plinth_h - 1.80)), (MW + 0.20, MD + 0.20, plinth_h + 1.80), C_STONE_PLINTH, bevel=0.04, ao_fn=ao)
    m.add_box((scx, scy, 0.5 * (plinth_h - 1.80)), (sw + 0.20, sd + 0.20, plinth_h + 1.80), C_STONE_PLINTH, bevel=0.04, ao_fn=ao)
    m.add_box((mcx, 0.0, plinth_h + 0.03), (MW + 0.30, MD + 0.30, 0.11), C_STONE_CAP, bevel=0.022, ao_fn=ao)
    m.add_box((scx, scy, plinth_h + 0.03), (sw + 0.28, sd + 0.28, 0.11), C_STONE_CAP, bevel=0.022, ao_fn=ao)

    # Main 2-story block walls
    main_ops = [
        {'face': '-y', 'u0': mcx - 2.10, 'u1': mcx - 0.30, 'z0': 1.15, 'z1': 2.65},  # GF cafe shopfront window
        {'face': '-y', 'u0': mcx + 0.45, 'u1': mcx + 1.55, 'z0': 0.62, 'z1': 2.70, 'depth': 0.22},  # GF entry door
        {'face': '-y', 'u0': mcx - 2.05, 'u1': mcx - 0.85, 'z0': 3.65, 'z1': 4.88},  # 2F left window
        {'face': '-y', 'u0': mcx + 0.25, 'u1': mcx + 1.75, 'z0': 3.50, 'z1': 4.95},  # 2F balcony French door/win
        {'face': '-x', 'u0': -0.80, 'u1': 0.80, 'z0': 1.40, 'z1': 2.60},
        {'face': '-x', 'u0': -0.75, 'u1': 0.75, 'z0': 3.65, 'z1': 4.85},
        {'face': '+y', 'u0': mcx - 1.55, 'u1': mcx - 0.25, 'z0': 3.65, 'z1': 4.85},
        {'face': '+y', 'u0': mcx + 0.45, 'u1': mcx + 1.75, 'z0': 1.45, 'z1': 2.65},
    ]
    m.add_recessed_wall_shell((m_x0, m_x1, -hd, hd, plinth_h + 0.05, main_eave), C_WALL_IVORY, C_WALL_RECESS, main_ops, ao_fn=ao)

    # Lower right wing walls
    side_ops = [
        {'face': '-y', 'u0': scx - 0.65, 'u1': scx + 0.65, 'z0': 1.35, 'z1': 2.55},
        {'face': '+x', 'u0': scy - 0.75, 'u1': scy + 0.75, 'z0': 1.35, 'z1': 2.55},
    ]
    m.add_recessed_wall_shell((s_x0, s_x1, sy0, sy1, plinth_h + 0.05, side_eave), C_WALL_CREAM, C_WALL_RECESS, side_ops, ao_fn=ao)

    # Timber stringcourse belt between GF and 2F
    m.add_box((mcx, 0.0, 3.12), (MW + 0.14, MD + 0.14, 0.14), C_TIMBER, bevel=0.02, ao_fn=ao)

    # Populate recessed openings
    populate_recessed_window(m, '-y', mcx - 1.20, -hd, 1.90, 1.80, 1.50, shutter_col=None, flowerbox=True, seed=4.5)
    populate_recessed_door(m, '-y', mcx + 1.00, -hd, 0.62, w=1.10, h=2.08, canopy_col=C_ROOF_TERRA)
    populate_recessed_window(m, '-y', mcx - 1.45, -hd, 4.26, 1.20, 1.23, shutter_col=C_SHUTTER_SAGE, flowerbox=True, seed=6.1)
    populate_recessed_window(m, '-y', mcx + 1.00, -hd, 4.22, 1.50, 1.45, shutter_col=C_SHUTTER_SAGE, flowerbox=False)
    populate_recessed_window(m, '-x', m_x0, 0.0, 2.00, 1.60, 1.20, shutter_col=C_SHUTTER_WARM, flowerbox=False)
    populate_recessed_window(m, '-x', m_x0, 0.0, 4.25, 1.50, 1.20, shutter_col=C_SHUTTER_WARM, flowerbox=False)
    populate_recessed_window(m, '+y', mcx - 0.90, hd, 4.25, 1.30, 1.20, shutter_col=C_SHUTTER_SAGE, flowerbox=False)
    populate_recessed_window(m, '+y', mcx + 1.10, hd, 2.05, 1.30, 1.20, shutter_col=C_SHUTTER_SAGE, flowerbox=False)
    populate_recessed_window(m, '-y', scx, sy0, 1.95, 1.30, 1.20, shutter_col=C_SHUTTER_SAGE, flowerbox=True, seed=8.2)
    populate_recessed_window(m, '+x', s_x1, scy, 1.95, 1.50, 1.20, shutter_col=C_SHUTTER_WARM, flowerbox=False)

    # 3D Striped cafe awning above GF shop window
    aw_cx, aw_y = mcx - 1.20, -hd - 0.42
    for si in range(7):
        sx_off = aw_cx - 0.90 + si * 0.30
        col = C_ROOF_TERRA if si % 2 == 0 else C_WALL_IVORY
        m.add_shed_slab((sx_off, aw_y), 0.30, 0.92, 2.75, 3.04, 0.065, col, slope_dir='-y', bevel=0.008)
        m.add_box((sx_off, -hd - 0.87, 2.66), (0.295, 0.05, 0.14), col, bevel=0.008)

    # 2F Timber Balcony over front right section (under right 2F window)
    bal_x = mcx + 1.00
    bal_y = -hd - 0.56
    m.add_box((bal_x, bal_y, 3.22), (2.25, 1.15, 0.14), C_TIMBER, bevel=0.025)
    for bx in (bal_x - 0.90, bal_x, bal_x + 0.90):
        m.add_box((bx, -hd - 0.38, 3.02), (0.12, 0.72, 0.24), C_TIMBER, bevel=0.015)
    # Balcony railings
    m.add_box((bal_x, -hd - 1.10, 4.10), (2.22, 0.09, 0.08), C_TIMBER_LIGHT, bevel=0.015)
    for su in (-1, 1):
        m.add_box((bal_x + su * 1.07, -hd - 0.56, 4.10), (0.09, 1.12, 0.08), C_TIMBER_LIGHT, bevel=0.015)
    for px in range(7):
        rx = bal_x - 1.05 + px * 0.35
        m.add_box((rx, -hd - 1.10, 3.68), (0.06, 0.06, 0.80), C_TIMBER, bevel=0.01)

    # Unified red terracotta roof on main 2F + matching shed roof on side wing
    add_ghibli_gable_roof(m, mcx, 0.0, main_eave, MW, MD, overhang=0.50, ridge_h=2.35, thickness=0.22,
                          roof_col=C_ROOF_TERRA, plaster_col=C_WALL_IVORY, ridge_along_x=True, chimney=True, ao=ao)
    m.add_shed_slab((scx + 0.18, scy), sw + 0.65, sd + 0.75, side_eave - 0.05, side_eave + 1.25, 0.20,
                    C_ROOF_TERRA_B, slope_dir='+x', bevel=0.03)
    return m.build_object()


# ==============================================================================
# 3. Ghibli_Cottage_C: Tall compact 2-story cottage with projecting roof dormer (~5.8m x 5.4m)
# ==============================================================================
def build_cottage_c():
    m = GhibliMesh('Ghibli_Cottage_C')
    W, D = 5.8, 5.4
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.65
    eave_z = 4.35
    ao = hill_ao(eave_z, base_z=0.72)

    m.add_box((0.0, 0.0, 0.5 * (plinth_h - 1.80)), (W + 0.22, D + 0.22, plinth_h + 1.80), C_STONE_PLINTH, bevel=0.04, ao_fn=ao)
    m.add_box((0.0, 0.0, plinth_h + 0.04), (W + 0.32, D + 0.32, 0.12), C_STONE_CAP, bevel=0.025, ao_fn=ao)

    openings = [
        {'face': '-y', 'u0': -1.95, 'u1': -0.65, 'z0': 1.40, 'z1': 2.66},
        {'face': '-y', 'u0': 0.35,  'u1': 1.45,  'z0': 0.68, 'z1': 2.74, 'depth': 0.22},
        {'face': '-y', 'u0': -0.75, 'u1': 0.75,  'z0': 3.05, 'z1': 4.02},  # Upper window
        {'face': '+x', 'u0': -0.70, 'u1': 0.70,  'z0': 1.45, 'z1': 2.68},
        {'face': '-x', 'u0': -0.70, 'u1': 0.70,  'z0': 1.45, 'z1': 2.68},
        {'face': '+y', 'u0': -0.75, 'u1': 0.75,  'z0': 1.45, 'z1': 2.68},
    ]
    m.add_recessed_wall_shell((-hw, hw, -hd, hd, plinth_h + 0.06, eave_z), C_WALL_SAND, C_WALL_RECESS, openings, ao_fn=ao)

    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add_box((sx * (hw - 0.05), sy * (hd - 0.05), 0.5 * (plinth_h + eave_z)),
                      (0.20, 0.20, eave_z - plinth_h), C_TIMBER, bevel=0.02, ao_fn=ao)

    populate_recessed_window(m, '-y', -1.30, -hd, 2.03, 1.30, 1.26, shutter_col=C_SHUTTER_BLUE, flowerbox=True, seed=9.1)
    populate_recessed_door(m, '-y', 0.90, -hd, 0.68, w=1.10, h=2.06, canopy_col=C_ROOF_TERRA)
    populate_recessed_window(m, '-y', 0.0, -hd, 3.54, 1.50, 0.97, shutter_col=C_SHUTTER_BLUE, flowerbox=False)
    populate_recessed_window(m, '+x', hw, 0.0, 2.06, 1.40, 1.23, shutter_col=C_SHUTTER_WARM, flowerbox=False)
    populate_recessed_window(m, '-x', -hw, 0.0, 2.06, 1.40, 1.23, shutter_col=C_SHUTTER_WARM, flowerbox=False)
    populate_recessed_window(m, '+y', 0.0, hd, 2.06, 1.50, 1.23, shutter_col=C_SHUTTER_BLUE, flowerbox=False)

    # Steep Ghibli terracotta roof
    add_ghibli_gable_roof(m, 0.0, 0.0, eave_z, W, D, overhang=0.50, ridge_h=2.70, thickness=0.22,
                          roof_col=C_ROOF_TERRA, plaster_col=C_WALL_SAND, ridge_along_x=True, chimney=True, ao=ao)

    # Projecting Gable Dormer popping out of front roof slope!
    dm_y0, dm_y1 = -hd + 0.12, -hd + 1.95
    dm_z0, dm_z1 = eave_z + 0.65, eave_z + 1.85
    dm_ops = [{'face': '-y', 'u0': -0.50, 'u1': 0.50, 'z0': dm_z0 + 0.18, 'z1': dm_z1 - 0.14}]
    m.add_recessed_wall_shell((-0.90, 0.90, dm_y0, dm_y1, dm_z0, dm_z1), C_WALL_SAND, C_WALL_RECESS, dm_ops, ao_fn=ao, recess_depth=0.14)
    populate_recessed_window(m, '-y', 0.0, dm_y0, 0.5 * (dm_z0 + dm_z1 + 0.04), 1.00, 0.88, shutter_col=C_SHUTTER_BLUE, flowerbox=False, reveal=0.14)
    add_ghibli_gable_roof(m, 0.0, 0.5 * (dm_y0 + dm_y1), dm_z1, 1.80, dm_y1 - dm_y0, overhang=0.24, ridge_h=0.92,
                          thickness=0.14, roof_col=C_ROOF_RIDGE, plaster_col=C_WALL_SAND, ridge_along_x=False, chimney=False, ao=ao)
    return m.build_object()


# ==============================================================================
# 4. Ghibli_Windmill_Tower & Ghibli_Windmill_Blades (~14.2m hero landmark!)
# ==============================================================================
WINDMILL_HUB_BLENDER = (0.0, -2.52, 10.65)  # Exports to Three.js local (0.0, 10.65, +2.52)


def build_windmill_tower():
    m = GhibliMesh('Ghibli_Windmill_Tower')
    ao = hill_ao(10.0, base_z=1.0)

    # 1) Deep battered circular stone foundation down to z = -2.0m
    m.add_cylinder((0.0, 0.0, 0.4), 2.85, 2.48, 4.80, C_STONE_PLINTH, segs=20, ao_fn=ao, bevel=0.04)
    m.add_cylinder((0.0, 0.0, 2.85), 2.58, 2.46, 0.22, C_STONE_CAP, segs=20, bevel=0.03)

    # 2) Gently tapered warm cream plaster tower drum (z = 2.9 .. 10.2)
    m.add_cylinder((0.0, 0.0, 6.55), 2.42, 1.94, 7.30, C_WALL_CREAM, segs=20, ao_fn=ao, bevel=0.02)
    m.add_cylinder((0.0, 0.0, 7.20), 2.28, 2.24, 0.22, C_TIMBER, segs=20, bevel=0.02)

    # 3) Encircling coastal timber gallery catwalk & railing at z = 7.35m
    gal_z = 7.42
    m.add_cylinder((0.0, 0.0, gal_z), 2.88, 2.88, 0.16, C_TIMBER_LIGHT, segs=20, bevel=0.025)
    for k in range(12):
        ang = TAU * k / 12
        cx, cy = math.cos(ang), math.sin(ang)
        m.add_box((cx * 2.42, cy * 2.42, gal_z - 0.22), (0.68, 0.14, 0.28), C_TIMBER, bevel=0.015, rot=(0, 0, ang))
    # Gallery railing posts & handrail ring
    for k in range(16):
        ang = TAU * k / 16
        rx, ry = math.cos(ang) * 2.76, math.sin(ang) * 2.76
        m.add_box((rx, ry, gal_z + 0.48), (0.08, 0.08, 0.88), C_TIMBER, bevel=0.01, rot=(0, 0, ang))
        nx, ny = math.cos(ang + TAU / 32) * 2.76, math.sin(ang + TAU / 32) * 2.76
        seg_len = 2.76 * TAU / 16 + 0.06
        m.add_box((nx, ny, gal_z + 0.90), (0.09, seg_len, 0.08), C_TIMBER_LIGHT, bevel=0.015, rot=(0, 0, ang + TAU / 32))
        m.add_box((nx, ny, gal_z + 0.50), (0.06, seg_len, 0.06), C_TIMBER_LIGHT, bevel=0.01, rot=(0, 0, ang + TAU / 32))

    # 4) Recessed ground door & spiraling tower windows
    # Entrance archway vestibule protruding subtly at -Y
    m.add_box((0.0, -2.42, 1.32), (1.70, 0.65, 2.40), C_STONE_CAP, bevel=0.035, ao_fn=ao)
    m.add_box((0.0, -2.62, 1.25), (1.06, 0.25, 2.02), C_TIMBER, bevel=0.02)
    m.add_box((0.0, -2.75, 1.56), (0.42, 0.04, 0.48), C_GLASS, bevel=0.0, smooth=False, glass=True)
    # Windows spiraling around the upper drum (exact C_GLASS for warm night glow)
    for wz, wang in [(4.75, -0.55), (6.15, 0.42), (8.75, -0.28), (5.50, 2.55)]:
        r_at_z = 2.42 - (wz - 2.90) / 7.30 * 0.48
        wx, wy = math.sin(wang) * (r_at_z + 0.03), -math.cos(wang) * (r_at_z + 0.03)
        m.add_box((wx, wy, wz), (0.76, 0.16, 1.02), C_TRIM, bevel=0.018, rot=(0, 0, wang))
        vx, vy = math.sin(wang) * (r_at_z + 0.09), -math.cos(wang) * (r_at_z + 0.09)
        m.add_box((vx, vy, wz), (0.56, 0.05, 0.82), C_GLASS, bevel=0.0, rot=(0, 0, wang), smooth=False, glass=True)
        m.add_box((vx, vy, wz - 0.44), (0.86, 0.22, 0.09), C_TIMBER, bevel=0.015, rot=(0, 0, wang))

    # 5) Conical red terracotta tiled cap roof (z = 10.05 .. 13.75) + timber fascia + finial spire
    m.add_cylinder((0.0, 0.0, 10.12), 2.15, 2.06, 0.26, C_TIMBER, segs=20, bevel=0.02)
    m.add_cylinder((0.0, 0.0, 11.95), 2.52, 0.18, 3.65, C_ROOF_TERRA, segs=20, bevel=0.02)
    m.add_cylinder((0.0, 0.0, 13.92), 0.18, 0.04, 0.55, C_ROOF_RIDGE, segs=12)
    # Subtle radial conical tile seams
    for k in range(10):
        ang = TAU * k / 10
        mx, my = math.cos(ang) * 1.25, math.sin(ang) * 1.25
        m.add_box((mx, my, 11.98), (2.52, 0.075, 0.08), C_ROOF_RIDGE, bevel=0.015, rot=(0, 0.96, ang))

    # 6) Front timber hub dormer housing projecting toward -Y at hub height (z = 10.65)
    hx, hy, hz = WINDMILL_HUB_BLENDER
    m.add_box((0.0, -1.65, hz), (1.36, 1.55, 1.32), C_WALL_CREAM, bevel=0.03)
    m.add_pitched_prism((0.0, -1.72, 0.0), 1.62, 1.85, hz + 0.64, 0.72, 0.16, C_ROOF_RIDGE, ridge_along_x=False, bevel=0.02)
    # Wooden axle neck sticking forward to blade hub center (0, -2.52, 10.65)
    m.add_cylinder((0.0, -2.35, hz), 0.26, 0.22, 0.58, C_TIMBER, segs=14, rot=(math.pi * 0.5, 0, 0), bevel=0.02)
    return m.build_object()


def build_windmill_blades():
    """4 sweeping 5.8m radius timber-and-linen windmill sails centered at origin (hub spins around Y->ThreeJS Z)."""
    m = GhibliMesh('Ghibli_Windmill_Blades')
    # Central turned timber spinner nose facing -Y
    m.add_cylinder((0.0, -0.14, 0.0), 0.34, 0.18, 0.44, C_TIMBER, segs=16, rot=(math.pi * 0.5, 0, 0), bevel=0.025)
    m.add_cylinder((0.0, 0.04, 0.0), 0.38, 0.38, 0.18, C_IRON, segs=16, rot=(math.pi * 0.5, 0, 0), bevel=0.015)

    arm_len = 5.75
    for k in range(4):
        ang = k * math.pi * 0.5
        # Build each sail arm in XY=X/Z plane rotating cleanly around Y axis
        ca, sa = math.cos(ang), math.sin(ang)
        def to_arm(r, side, depth):
            # r along arm length, side perpendicular to arm in XZ plane, depth along -Y
            x = ca * r - sa * side
            z = sa * r + ca * side
            return (x, depth, z)

        # Heavy main spar
        m.add_box(to_arm(arm_len * 0.5, 0.0, -0.04), (arm_len, 0.14, 0.14), C_TIMBER, bevel=0.018, rot=(0.0, -ang, 0.0))
        # Cross lattice bars + outer sail rail
        sail_r0, sail_r1 = 1.25, arm_len - 0.15
        sail_w = 1.05
        sail_r_mid = 0.5 * (sail_r0 + sail_r1)
        m.add_box(to_arm(sail_r_mid, sail_w, -0.02), (sail_r1 - sail_r0, 0.07, 0.07),
                  C_TIMBER_LIGHT, bevel=0.01, rot=(0.14, -ang, 0.0))
        for b in range(7):
            rb = sail_r0 + (sail_r1 - sail_r0) * (b / 6.0)
            m.add_box(to_arm(rb, sail_w * 0.46, -0.02), (0.065, 0.065, sail_w + 0.10),
                      C_TIMBER_LIGHT, bevel=0.008, rot=(0.14, -ang, 0.0))
        # Warm cream linen sail panel slightly angled (cant around arm axis) to catch sunlight!
        m.add_box(to_arm(sail_r_mid, sail_w * 0.48, -0.055), (sail_r1 - sail_r0 - 0.12, 0.032, sail_w - 0.08),
                  C_SAIL_LINEN, bevel=0.008, rot=(0.14, -ang, 0.0))

    return m.build_object()


# ==============================================================================
# 5. Props: Ghibli_Signpost, Ghibli_Fence_Seg, Ghibli_Rock_Cluster
# ==============================================================================
def build_signpost():
    m = GhibliMesh('Ghibli_Signpost')
    ao = hill_ao(2.3, base_z=0.35)
    m.add_cylinder((0.0, 0.0, 1.05), 0.11, 0.09, 2.90, C_TIMBER, segs=10, ao_fn=ao, bevel=0.015)
    # Crossarm & hanging warm lantern
    m.add_box((0.28, 0.0, 2.28), (0.85, 0.10, 0.10), C_TIMBER, bevel=0.015)
    m.add_cylinder((0.62, 0.0, 2.02), 0.14, 0.09, 0.12, C_IRON, segs=8)
    m.add_cylinder((0.62, 0.0, 1.84), 0.10, 0.11, 0.24, C_LANTERN_GLASS, segs=8, smooth=False, glass=True)
    m.add_cylinder((0.62, 0.0, 1.69), 0.11, 0.08, 0.06, C_IRON, segs=8)
    # Directional wood sign boards
    m.add_box((-0.18, 0.08, 1.92), (0.88, 0.05, 0.22), C_TIMBER_LIGHT, bevel=0.012, rot=(0, 0, 0.18))
    m.add_box((0.18, -0.08, 1.62), (0.82, 0.05, 0.22), C_TIMBER_LIGHT, bevel=0.012, rot=(0, 0, -0.22))
    return m.build_object()


def build_fence_seg():
    """4.0m rustic timber roadside post-and-rail fence segment (posts sunk to -0.45m)."""
    m = GhibliMesh('Ghibli_Fence_Seg')
    ao = hill_ao(None, base_z=0.30)
    for px in (-1.90, 0.0, 1.90):
        m.add_box((px, 0.0, 0.30), (0.14, 0.14, 1.50), C_TIMBER, bevel=0.02, ao_fn=ao)
    m.add_box((0.0, 0.06, 0.86), (4.05, 0.06, 0.11), C_TIMBER_LIGHT, bevel=0.012)
    m.add_box((0.0, 0.06, 0.48), (4.05, 0.06, 0.10), C_TIMBER_LIGHT, bevel=0.012)
    return m.build_object()


def build_rock_cluster():
    """Chunky moss-topped rounded hillside boulder cluster sunk cleanly into ground."""
    m = GhibliMesh('Ghibli_Rock_Cluster')
    specs = [
        ((0.0, 0.0, 0.30), (1.15, 0.92, 0.65), 1.4),
        ((-0.82, -0.24, 0.18), (0.68, 0.60, 0.45), 2.7),
        ((0.76, 0.28, 0.22), (0.74, 0.64, 0.50), 4.1),
    ]
    for (c, radii, seed) in specs:
        m.add_puff(c, radii, 10, 5, C_ROCK_STONE, 0x8d8d78, C_MOSS_TOP, lump=0.18, seed=seed)
    return m.build_object()


assets = [
    build_cottage_a(),
    build_cottage_b(),
    build_cottage_c(),
    build_windmill_tower(),
    build_windmill_blades(),
    build_signpost(),
    build_fence_seg(),
    build_rock_cluster(),
]

for obj in assets:
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'{obj.name:24s}: {len(obj.data.vertices):5d} verts, {tris:5d} tris')

print(f'Windmill blade Three.js local offset: ({WINDMILL_HUB_BLENDER[0]:.3f}, {WINDMILL_HUB_BLENDER[2]:.3f}, {-WINDMILL_HUB_BLENDER[1]:.3f})')

out_path = Path(__file__).resolve().with_name('hillside-village.glb')
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
