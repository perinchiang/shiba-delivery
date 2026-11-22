"""Author the standing courier first. All the other poses use this bind skeleton."""

import math
import struct
import zlib
import bmesh
import bpy
from mathutils import Quaternion
from forms import (
    Parts, V, X, UP, Z, TAU, blender_v, material, smooth,
    HEAD_SCALE, HEAD_PIVOT, head_transform, spline,
)
from riding_fit import CHASSIS_DROP, RIDER_ORIGIN, PELVIS_TILT, CHEST_TILT, HEAD_LEVEL, SOLE_DEPTH, footrest, palm
from helmet import make_helmet, HINGE, HINGE_RAW, PARK_ANGLE
from accessories import curled_tail, tail_rotations, TAIL_JOINTS, TAIL_PATH

BONES = {}
SIDES = [(-1, "L"), (1, "R")]


def rig_bones():
    d = {}

    def add(name, start, end, parent=None):
        d[name] = (V(start), V(end), parent)

    def add_head(name, start, end, parent=None):
        d[name] = (head_transform(start), head_transform(end), parent)

    add("Root", (0, 0, 0), (0, 0.12, 0))
    add("Pelvis", (0, 0.39, 0), (0, 0.57, 0), "Root")
    add("Chest", (0, 0.57, 0), (0, 0.87, 0), "Pelvis")
    add_head("Head", (0, 1.25, 0.035), (0, 1.52, 0.035), "Chest")
    add_head("GoggleHinge", HINGE_RAW, (0, HINGE_RAW[1] + .10, HINGE_RAW[2]), "Head")
    for name, start, end, parent in TAIL_JOINTS:
        add(name, TAIL_PATH[start], TAIL_PATH[end], parent)
    for s, tag in SIDES:
        add_head("Ear_" + tag, (s * 0.36, 1.57, 0.01), (s * 0.48, 1.90, 0.025), "Head")
        add_head("Eye_" + tag, (s * 0.238, 1.279, 0.442), (s * 0.238, 1.325, 0.442), "Head")
        # Party Animals-inspired relaxed long arms: shoulder sits inside the
        # rounded upper torso socket, curving smoothly over the deltoid into a
        # natural ~14-degree relaxed hang with full two-bone elbow articulation.
        add("UpperArm_" + tag, (s * 0.200, 0.704, 0.014), (s * 0.308, 0.592, 0.026), "Chest")
        add("Forearm_" + tag, (s * 0.308, 0.592, 0.026), (s * 0.340, 0.456, 0.048), "UpperArm_" + tag)
        add("Paw_" + tag, (s * 0.340, 0.456, 0.048), (s * 0.348, 0.422, 0.054), "Forearm_" + tag)
        add("Thigh_" + tag, (s * 0.151, 0.39, 0), (s * 0.151, 0.20, 0), "Pelvis")
        add("Shin_" + tag, (s * 0.151, 0.20, 0), (s * 0.151, 0.098, 0.051), "Thigh_" + tag)
        add("Foot_" + tag, (s * 0.151, 0.098, 0.051), (s * 0.151, 0.094, 0.164), "Shin_" + tag)
    return d


BONES = rig_bones()


def create_rig(collection):
    data = bpy.data.armatures.new("Courier · shared biped")
    rig = bpy.data.objects.new("CourierRig", data)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (a, b, parent) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head = blender_v(a)
        bone.tail = blender_v(b)
        if parent:
            bone.parent = data.edit_bones[parent]
        bone.use_connect = bool(parent and (BONES[parent][1] - a).length < 0.00001)
    bpy.ops.object.mode_set(mode="OBJECT")
    data.display_type = "OCTAHEDRAL"
    for name in ["Body", "Face and tail", "Left limbs", "Right limbs"]:
        data.collections.new(name)
    for bone in data.bones:
        family = (
            "Face and tail"
            if bone.name.startswith(("Eye", "Ear", "Tail", "Head", "Goggle"))
            else "Left limbs"
            if bone.name.endswith("_L")
            else "Right limbs"
            if bone.name.endswith("_R")
            else "Body"
        )
        for old in list(bone.collections):
            old.unassign(bone)
        data.collections[family].assign(bone)
    rig["forward"] = "+Z glTF / -Y Blender"
    rig["unit"] = "metre"
    rig["soleDepth"] = SOLE_DEPTH
    rig["character"] = "Rongwan · A-Chai"
    return rig


def write_default_coat(path):
    # A replaceable equirectangular coat map; its continuous urajiro follows the original head.
    width, height = 512, 256
    raw = bytearray()
    orange = (216, 123, 56)
    cream = (255, 237, 204)
    for row in range(height):
        lat = math.pi * (0.5 - (row + 0.5) / height)
        y = math.sin(lat)
        ring = math.cos(lat)
        raw.append(0)
        for col in range(width):
            a = TAU * ((col + 0.5) / width - 0.5)
            x, z = math.sin(a) * ring, math.cos(a) * ring
            edge = -0.77 + smooth(-0.62, 0.48, z) * (0.54 + 0.30 * abs(x) ** 1.4)
            f = 1 - smooth(edge - 0.026, edge + 0.026, y)
            raw.extend(round(o + (c - o) * f) for o, c in zip(orange, cream))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def coat_material(path):
    img = bpy.data.images.load(str(path))
    img.name = "Shiba_Urajiro.png"
    img.pack()
    img.filepath = "//Shiba_Urajiro.png"
    coat = material("Fur · replaceable UV coat", "ffffff")
    nodes = coat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.label = "Shiba coat · replace image"
    tex.location = (-380, 260)
    coat.node_tree.links.new(tex.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return coat


def padded(parts, outline, centre, radius, depth, paint, rot=None):
    """Softly bevelled applique, looking along +Z."""
    c = V(centre)
    rings = []
    for factor, z, nz in [
        (0.89, -depth, -1),
        (1, -0.4 * depth, -0.22),
        (1, 0.4 * depth, 0.22),
        (0.89, depth, 1),
    ]:
        row = []
        for x, y in outline:
            p = V((x * radius[0] * factor, y * radius[1] * factor, z))
            n = V((x * (1 - abs(nz)), y * (1 - abs(nz)), nz))
            if rot:
                p = rot @ p
                n = rot @ n
            row.append(parts.vertex(c + p, n))
        rings.append(row)
    for i in range(len(rings) - 1):
        for j in range(len(outline)):
            k = (j + 1) % len(outline)
            parts.face((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]), paint)
    for row, z, normal in [(rings[0], -depth, -1), (rings[-1], depth, 1)]:
        off = V((0, 0, z))
        n = Z * normal
        mid = parts.vertex(c + (rot @ off if rot else off), rot @ n if rot else n)
        for j in range(len(row)):
            parts.face((mid, row[j], row[(j + 1) % len(row)]), paint)


def riding_shoe(parts, ankle, leather, rubber):
    """Keep the round toe and original dimensions; give the peg a flat sole to bear on."""
    width, length = 0.116, 0.153
    profile = [(-SOLE_DEPTH, 0.53), (-0.078, 0.60), (-0.075, 0.66), (-0.070, 0.69), (-0.064, 0.70)]
    for j in range(18):
        lat = -0.79 + (math.pi / 2 + 0.79) * j / 18
        profile.append((SOLE_DEPTH * math.sin(lat), math.cos(lat)))
    profile.append((SOLE_DEPTH, 0))
    segments = 32
    rings = []
    for i, (height, radius) in enumerate(profile[:-1]):
        prev_y, prev_r = profile[max(0, i - 1)]
        next_y, next_r = profile[i + 1]
        dy, dr = next_y - prev_y, next_r - prev_r
        row = []
        for j in range(segments):
            angle = TAU * j / segments
            x, z = math.sin(angle), math.cos(angle)
            normal = V((dy * x / width, -dr, dy * z / length))
            row.append(parts.vertex(ankle + V((width * radius * x, height, length * radius * z)), normal))
        if rings:
            for j in range(segments):
                k = (j + 1) % segments
                parts.face((rings[-1][j], rings[-1][k], row[k], row[j]), rubber if i <= 4 else leather)
        rings.append(row)
    parts.face(tuple(parts.vertex(parts.p[i], -UP, already_transformed=True) for i in rings[0]), rubber)
    top = parts.vertex(ankle + UP * SOLE_DEPTH, UP)
    for j in range(segments):
        parts.face((rings[-1][j], rings[-1][(j + 1) % segments], top), leather)


def make_character(collection, rig, coat_path):
    fur = material("Fur · fox orange", "d87b38")
    cream = material("Fur · warm cream", "ffedcc")
    ink = material("Face · espresso", "32272a", 0, 0.49)
    blush = material("Face · peach", "df9e83")
    earinner = material("Ear · terracotta", "8f5847")
    jacket = material("Uniform · courier yellow", "f2bc2b", 0, .62)
    charcoal = material("Uniform · charcoal trim", "2b2f37", 0, .68)
    pants = material("Uniform · charcoal pants", "252931", 0, .68)
    reflective = material("Uniform · reflective silver", "e6ebf0", .15, .32)
    shoe = material("Shoes · walnut", "60483c")
    outsole = material("Shoes · dark rubber sole", "493d35", 0, 0.85)
    white = material("Face · catchlight", "fff7d8")

    def part(name, bone):
        p = Parts()
        if name in {
            "Head_Coat", "Muzzle", "Muzzle_Smile",
            "Ear_L_Mesh", "Ear_R_Mesh", "Eye_L_Mesh", "Eye_R_Mesh",
        }:
            p.transform = head_transform
        p.bind = bone
        return p, lambda: p.finish(name, collection, armature=rig)

    p, end = part("Head_Coat", "Head")
    p.oval((0, 1.25, 0.035), (0.574, 0.492, 0.463), coat_material(coat_path), 80, 56)
    end()
    p, end = part("Muzzle", "Head")
    p.oval((0, 1.127, 0.433), (0.205, 0.126, 0.137), cream)
    p.oval((0, 1.183, 0.550), (0.087, 0.056, 0.060), ink)
    for s, t in SIDES:
        p.oval((s * 0.238, 1.410, 0.405), (0.09, 0.047, 0.035), cream, rot=Quaternion(Z, -s * 0.19))
        p.oval((s * 0.347, 1.18, 0.385), (0.054, 0.024, 0.014), blush, rot=Quaternion(UP, s * 0.57))
    end()
    p, end = part("Muzzle_Smile", "Head")

    def muzzle_surface(x, y):
        z = 0.433 + 0.137 * math.sqrt(1 - (x / 0.205) ** 2 - ((y - 1.127) / 0.126) ** 2)
        return V((x, y, z + 0.004))

    p.tube([muzzle_surface(0, y) for y in (1.151, 1.130, 1.115, 1.108)], 0.0085, ink, 12, 3)
    for s, _ in SIDES:
        line = [
            muzzle_surface(s * x, y)
            for x, y in [(0, 1.108), (0.023, 1.096), (0.048, 1.092), (0.070, 1.097), (0.090, 1.109)]
        ]
        p.tube(line, lambda t: 0.0085 - 0.0022 * t * t, ink, 12, 5)
        p.oval(line[-1], (0.0063, 0.0063, 0.0063), ink, 12, 8)
    end()
    outline = [
        (-0.88, -0.50),
        (-0.98, -0.34),
        (-0.87, 0.10),
        (-0.59, 0.63),
        (-0.25, 1.05),
        (-0.06, 1.17),
        (0.10, 1.14),
        (0.32, 0.91),
        (0.62, 0.45),
        (0.93, -0.18),
        (0.96, -0.43),
        (0.73, -0.54),
        (0.13, -0.59),
        (-0.52, -0.59),
    ]
    for s, t in SIDES:
        q = Quaternion(Z, -s * 0.26)
        c = V((s * 0.36, 1.69, 0.024))
        p, end = part("Ear_" + t + "_Mesh", "Ear_" + t)
        padded(p, outline, c, (0.17, 0.225), 0.043, fur, q)
        padded(p, outline, c + V((0, 0.002, 0.044)), (0.112, 0.162), 0.009, earinner, q)
        end()
        p, end = part("Eye_" + t + "_Mesh", "Eye_" + t)
        eye = V((s * 0.238, 1.279, 0.442))
        q = Quaternion(UP, s * 0.36)
        p.oval(eye, (0.054, 0.073, 0.035), ink, rot=q)
        p.oval(eye + q @ V((-0.016, 0.023, 0.029)), (0.014, 0.016, 0.009), white, 16, 10, rot=q)
        end()
    make_helmet(collection, rig)
    # Build the courier windbreaker as a SINGLE continuous quad manifold
    # (Party Animals / Nintendo stylized character topology): a smooth 12-sided
    # rounded torso cage with an 8-sided circular armhole on each shoulder from
    # which the plush rubber-hose sleeves are continuously extruded, then
    # Catmull-Clark subdivided (level 2).  No L-shaped torso notch, no detached
    # noodle seams, no voxel-melted armpit webbing.
    bm = bmesh.new()
    deform = bm.verts.layers.deform.new()
    group_names = ["Pelvis", "Chest", "UpperArm_L", "Forearm_L", "UpperArm_R", "Forearm_R"]
    gidx = {name: idx for idx, name in enumerate(group_names)}

    def add_vert(pt, weights):
        v = bm.verts.new(blender_v(pt))
        total_w = sum(weights.values()) or 1.0
        for name, w in weights.items():
            if w > 1e-6:
                v[deform][gidx[name]] = w / total_w
        return v

    def torso_weights(y):
        c = smooth(.435, .720, y)
        return {"Pelvis": 1.0 - c, "Chest": c}

    # 12 columns x 7 smooth convex torso rings (pre-subsurf cage inflated ~4%
    # to compensate for Catmull-Clark shrinkage).
    cols = 12
    torso_spec = [
        (0.424, 0.248, 0.242),  # 0: hem tuck (meets pants & tail cleanly after subsurf)
        (0.456, 0.256, 0.236),  # 1: cozy elastic waist hem
        (0.530, 0.246, 0.229),  # 2: soft rounded lower jacket
        (0.610, 0.230, 0.218),  # 3: armpit bottom edge
        (0.678, 0.212, 0.204),  # 4: armhole midline
        (0.738, 0.190, 0.184),  # 5: shoulder top edge
        (0.778, 0.152, 0.148),  # 6: collar neckline (well below chinstrap)
    ]
    grid = []
    for i, (y, rx, rz) in enumerate(torso_spec):
        row = []
        w = torso_weights(y)
        for j in range(cols):
            a = TAU * j / cols
            row.append(add_vert(V((rx * math.cos(a), y, rz * math.sin(a))), w))
        grid.append(row)

    # Gently round the 4 corner vertices of each 2x2 armhole into an octagon.
    for s, (c_mid, c_f, c_b) in [(1, (0, 1, 11)), (-1, (6, 5, 7))]:
        center = V((s * 0.212, 0.676, 0.010))
        for ri, ci in [(5, c_f), (3, c_f), (3, c_b), (5, c_b)]:
            cur = grid[ri][ci].co
            artist = V((cur.x, cur.z, -cur.y))
            nudged = artist.lerp(center + (artist - center) * 0.88, 0.45)
            nudged.x = s * max(abs(nudged.x), 0.172)
            grid[ri][ci].co = blender_v(nudged)

    # Torso quads, omitting the 2x2 armhole patch on each shoulder side.
    omitted = {(3, 11), (4, 11), (3, 0), (4, 0), (3, 5), (4, 5), (3, 6), (4, 6)}
    for i in range(len(torso_spec) - 1):
        for j in range(cols):
            if (i, j) in omitted:
                continue
            k = (j + 1) % cols
            bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))

    # Clean bottom & top caps (concentric inner ring + center fan-free quad cap).
    for row_idx, y_cap, inset in [(0, 0.425, 0.55), (len(torso_spec) - 1, 0.780, 0.52)]:
        outer = grid[row_idx]
        w = torso_weights(y_cap)
        inner = []
        for v in outer:
            p_a = V((v.co.x * inset, y_cap, -v.co.y * inset))
            inner.append(add_vert(p_a, w))
        for j in range(cols):
            k = (j + 1) % cols
            bm.faces.new((outer[j], outer[k], inner[k], inner[j]))
        center_v = add_vert(V((0.0, y_cap, 0.0)), w)
        for j in range(cols):
            k = (j + 1) % cols
            bm.faces.new((inner[j], inner[k], center_v))

    # Continuously extrude plush Party Animals arms from each 8-gon armhole.
    arm_paths = {}
    for s, tag in SIDES:
        c_mid, c_f, c_b = (0, 1, 11) if s > 0 else (6, 5, 7)
        hole = [
            grid[5][c_mid],  # 0: top (+Y)
            grid[5][c_f],    # 1: top-front
            grid[4][c_f],    # 2: mid-front (+Z)
            grid[3][c_f],    # 3: bot-front
            grid[3][c_mid],  # 4: armpit bottom (-Y)
            grid[3][c_b],    # 5: bot-back
            grid[4][c_b],    # 6: mid-back (-Z)
            grid[5][c_b],    # 7: top-back
        ]
        # Give the armhole ring gentle shoulder influence so the seam flexes
        # smoothly without pulling the torso belly.
        hole_arm_w = [0.16, 0.22, 0.26, 0.20, 0.16, 0.20, 0.26, 0.22]
        for v, aw in zip(hole, hole_arm_w):
            v[deform][gidx["Pelvis"]] = 0.0
            v[deform][gidx["Chest"]] = 1.0 - aw
            v[deform][gidx["UpperArm_" + tag]] = aw

        sh_bone = BONES["UpperArm_" + tag][0]
        el_bone = BONES["Forearm_" + tag][0]
        wr_bone = BONES["Forearm_" + tag][1]
        # Smooth organic Party Animals arm centerline curving over the deltoid
        # and dropping naturally into the relaxed ~14-degree forearm hang.
        ctrl = [
            V((s * 0.206, 0.680, 0.012)),
            V((s * 0.256, 0.664, 0.017)),
            V((s * 0.286, 0.630, 0.021)),
            el_bone,
            el_bone.lerp(wr_bone, 0.50),
            wr_bone,
        ]
        centres = spline(ctrl, 2)  # 11 smooth stations (indices 0..10), ring 0 is hole
        arm_paths[tag] = centres

        # Parallel-transport frames so k=0 flows smoothly over the outer arm
        # and k=2 stays cleanly aligned with the front (+Z) without any twist.
        up_vec = UP.copy()
        front_vec = Z.copy()
        prev_ring = hole
        n_rings = len(centres) - 1  # 10 extruded arm rings (r=1..10)
        for r in range(1, len(centres)):
            u = r / n_rings
            pt = centres[r]
            if r < len(centres) - 1:
                tan = (centres[r + 1] - centres[r - 1]).normalized()
            else:
                tan = (centres[r] - centres[r - 1]).normalized()
            # Project previous frame onto plane perpendicular to new tangent.
            front_vec = (front_vec - tan * front_vec.dot(tan)).normalized()
            up_vec = (s * front_vec.cross(tan)).normalized()
            # Plump deltoid tapering gently into a soft rubber-hose wrist.
            rad_u = 0.088 * (1.0 - smooth(0.0, 0.25, u)) + (0.084 - 0.010 * u) * smooth(0.0, 0.25, u)
            rad_f = 0.084 * (1.0 - smooth(0.0, 0.25, u)) + (0.082 - 0.009 * u) * smooth(0.0, 0.25, u)
            chest_w = 0.36 * (1.0 - smooth(0.0, 0.26, u))
            fore_w = smooth(0.28, 0.74, u)
            w = {
                "Chest": chest_w,
                "UpperArm_" + tag: (1.0 - chest_w) * (1.0 - fore_w),
                "Forearm_" + tag: (1.0 - chest_w) * fore_w,
            }
            ring = []
            for k in range(8):
                phi = k * TAU / 8.0
                pos = pt + up_vec * (rad_u * math.cos(phi)) + front_vec * (rad_f * math.sin(phi))
                ring.append(add_vert(pos, w))
            for k in range(8):
                kn = (k + 1) % 8
                bm.faces.new((prev_ring[k], prev_ring[kn], ring[kn], ring[k]))
            prev_ring = ring

        # Recessed wrist cap inside the mitten so the manifold is watertight.
        tan_end = (centres[-1] - centres[-2]).normalized()
        cap_w = {"Forearm_" + tag: 1.0}
        cap_ring = [
            add_vert(centres[-1] + tan_end * 0.006 + up_vec * (0.048 * math.cos(k * TAU / 8.0))
                     + front_vec * (0.048 * math.sin(k * TAU / 8.0)), cap_w)
            for k in range(8)
        ]
        for k in range(8):
            kn = (k + 1) % 8
            bm.faces.new((prev_ring[k], prev_ring[kn], cap_ring[kn], cap_ring[k]))
        cap_mid = add_vert(centres[-1] + tan_end * 0.008, cap_w)
        for k in range(8):
            kn = (k + 1) % 8
            bm.faces.new((cap_ring[k], cap_ring[kn], cap_mid))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Uniform")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    jacket_obj = bpy.data.objects.new("Uniform", mesh)
    collection.objects.link(jacket_obj)
    for mat in (jacket, charcoal, reflective):
        jacket_obj.data.materials.append(mat)
    for name in group_names:
        jacket_obj.vertex_groups.new(name=name)

    # Subdivide the single manifold cage (Catmull-Clark level 2) BEFORE binding
    # Armature so shoulders, armpits, torso and 32-ring rubber-hose arms are
    # completely seamless and vertex group weights interpolate cleanly.
    sub = jacket_obj.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    bpy.context.view_layer.objects.active = jacket_obj
    jacket_obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    jacket_obj.parent = rig
    mod_arm = jacket_obj.modifiers.new("Armature", "ARMATURE")
    mod_arm.object = rig

    # Assign Meituan yellow/charcoal/reflective color-blocking directly on the
    # subdivided manifold faces — zero overlapping strips, zero Z-fighting.
    arm_vgroups = {
        "L": (jacket_obj.vertex_groups["UpperArm_L"].index, jacket_obj.vertex_groups["Forearm_L"].index),
        "R": (jacket_obj.vertex_groups["UpperArm_R"].index, jacket_obj.vertex_groups["Forearm_R"].index),
    }

    def vert_arm_weight(v_idx):
        v = jacket_obj.data.vertices[v_idx]
        wl = wr = 0.0
        for g in v.groups:
            if g.group in arm_vgroups["L"]:
                wl += g.weight
            elif g.group in arm_vgroups["R"]:
                wr += g.weight
        return (wl, "L") if wl >= wr else (wr, "R")

    def arm_arc_u(pt, tag):
        pts = arm_paths[tag]
        seg_lens = [(b - a).length for a, b in zip(pts, pts[1:])]
        total = sum(seg_lens) or 1.0
        best_d, best_u, acc = float("inf"), 0.0, 0.0
        for a, b, sl in zip(pts, pts[1:], seg_lens):
            ab = b - a
            frac = max(0.0, min(1.0, (pt - a).dot(ab) / max(ab.length_squared, 1e-12)))
            d = (pt - (a + ab * frac)).length_squared
            if d < best_d:
                best_d, best_u = d, (acc + frac * sl) / total
            acc += sl
        return best_u

    # Material slots: 0=jacket (yellow), 1=charcoal, 2=reflective
    for poly in jacket_obj.data.polygons:
        c = poly.center
        p = V((c.x, c.z, -c.y))
        weights = [vert_arm_weight(vi) for vi in poly.vertices]
        avg_arm = sum(w for w, _ in weights) / len(weights)
        tag = weights[0][1]
        if avg_arm >= 0.42:
            u = arm_arc_u(p, tag)
            if u >= 0.85:
                poly.material_index = 1  # charcoal wrist cuff
            elif 0.77 <= u < 0.82:
                poly.material_index = 2  # reflective sleeve ring
            else:
                poly.material_index = 0  # courier yellow sleeve
        else:
            if p.y >= 0.706 or p.y <= 0.456:
                poly.material_index = 1  # charcoal shoulder yoke & hem
            elif 0.456 < p.y < 0.585 and abs(p.x) > 0.180 and abs(p.z) < 0.140:
                poly.material_index = 1  # charcoal slimming side panels
            elif 0.614 <= p.y <= 0.632 and abs(p.z) > 0.135:
                poly.material_index = 2  # reflective front & back stripe
            elif 0.456 < p.y < 0.706 and p.z > 0.14 and abs(p.x) < 0.008:
                poly.material_index = 1  # center zipper placket
            elif 0.650 <= p.y <= 0.688 and p.z > 0.14 and -0.118 <= p.x <= -0.052:
                poly.material_index = 1  # neat left chest pocket
            else:
                poly.material_index = 0  # courier yellow body

    # Snug charcoal windbreaker stand collar (below chinstrap) & dark trousers.
    trim_parts = Parts()
    trim_parts.bind = "Pelvis"
    trim_parts.oval((0, 0.411, -0.005), (0.244, 0.17, 0.218), pants)
    trim_parts.bind = "Chest"
    trim_parts.tube(
        [(0.146 * math.cos(a), 0.774, 0.142 * math.sin(a)) for a in [TAU * j / 32 for j in range(33)]],
        0.015, charcoal, 14, 1, caps=False,
    )
    trim_obj = trim_parts.finish("Uniform trims", collection, armature=rig)
    curled_tail(collection, rig)
    for s, t in SIDES:
        p, mitten_end = part("Mitten_" + t, "Paw_" + t)
        p.oval(BONES["Paw_" + t][0], (0.073, 0.075, 0.071), cream)
        mitten_end()
        p, end = part("Haunch_" + t, "Thigh_" + t)
        p.oval((s * 0.151, 0.295, 0), (0.117, 0.16, 0.117), pants)
        p.bind = "Shin_" + t
        p.oval((s * 0.151, 0.152, 0.018), (0.098, 0.104, 0.096), fur)
        end()
        p, end = part("Shoe_" + t, "Foot_" + t)
        riding_shoe(p, BONES["Foot_" + t][0], shoe, outsole)
        end()

    # Join the seamless manifold shell with pants & stand collar.
    uniform_obj = jacket_obj
    bpy.ops.object.select_all(action="DESELECT")
    jacket_obj.select_set(True)
    trim_obj.select_set(True)
    bpy.context.view_layer.objects.active = jacket_obj
    bpy.ops.object.join()
    uniform_obj.name = "Uniform"


def bend_limb(first, second, reach, pole):
    """Two rest-length segments, solved in the tilted parent's frame."""
    a, b, _ = BONES[first]
    _, c, _ = BONES[second]
    d = reach.length
    v = reach.normalized()
    l1 = (b - a).length
    l2 = (c - b).length
    assert abs(l1 - l2) < d < l1 + l2
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0, l1 * l1 - along * along))
    pole = (pole - v * pole.dot(v)).normalized()
    mid = along * v + h * pole
    upper = (b - a).normalized().rotation_difference(mid.normalized())
    lower = (c - b).normalized().rotation_difference(upper.inverted() @ (reach - mid).normalized())
    return upper, lower


def riding_limbs(s, tag):
    hip = BONES["Pelvis"][0]
    chest = BONES["Chest"][0]
    back = PELVIS_TILT @ CHEST_TILT
    shoulder = RIDER_ORIGIN + hip + PELVIS_TILT @ (chest - hip) + back @ (BONES["UpperArm_" + tag][0] - chest)
    upper, lower = bend_limb(
        "UpperArm_" + tag,
        "Forearm_" + tag,
        # The authored palm marker is the real grip point; no hidden reach
        # offset is needed now that the arm lengths match the motorcycle.
        back.inverted() @ (palm(s) - shoulder),
        V((s * 0.40, -1, -0.22)),
    )
    hip_joint = RIDER_ORIGIN + hip + PELVIS_TILT @ (BONES["Thigh_" + tag][0] - hip)
    ankle = footrest(s) + UP * SOLE_DEPTH
    thigh, shin = bend_limb(
        "Thigh_" + tag,
        "Shin_" + tag,
        PELVIS_TILT.inverted() @ (ankle - hip_joint),
        PELVIS_TILT.inverted() @ V((s * 0.64, 0, 1)),
    )
    foot = (PELVIS_TILT @ thigh @ shin).inverted()
    return upper, lower, thigh, shin, foot


def bone_turn(rig, name, rotation):
    pb = rig.pose.bones[name]
    rest = pb.bone.matrix_local.to_quaternion()
    axis, angle = rotation.to_axis_angle()
    pb.rotation_quaternion = rest.inverted() @ Quaternion(blender_v(axis), angle) @ rest


def author_actions(rig):
    anim = rig.animation_data_create()
    ground_offset = SOLE_DEPTH - BONES["Foot_L"][0].y
    for name in ("Stand", "Walk", "Ride"):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        slot = act.slots.new("OBJECT", rig.name)
        anim.action = act
        anim.action_slot = slot
        cycle = 72 if name == "Stand" else 24
        for f in range(1, cycle + 2, cycle // 8):
            phase = (f - 1) * TAU / cycle
            for pb in rig.pose.bones:
                pb.rotation_mode = "QUATERNION"
                pb.rotation_quaternion = Quaternion()
                pb.location = (0, 0, 0)
                pb.scale = (1, 1, 1)
            if name == "Ride":
                off = RIDER_ORIGIN - UP * CHASSIS_DROP
                bone_turn(rig, "Pelvis", PELVIS_TILT)
                bone_turn(rig, "Chest", CHEST_TILT)
                bone_turn(rig, "Head", HEAD_LEVEL)
            elif name == "Walk":
                off = UP * (ground_offset + abs(math.sin(phase)) * 0.055)
            else:
                off = UP * ground_offset
            root = rig.pose.bones["Root"]
            root.location = root.bone.matrix_local.to_quaternion().inverted() @ blender_v(off)
            if name == "Walk":
                # Subtle energetic delivery-trot lean with natural counter-twist.
                bone_turn(rig, "Pelvis", Quaternion(Z, 0.045 * math.sin(phase)) @ Quaternion(UP, 0.055 * math.sin(phase)))
                bone_turn(rig, "Chest", Quaternion(X, 0.085) @ Quaternion(UP, -0.075 * math.sin(phase)) @ Quaternion(Z, -0.025 * math.sin(phase)))
            for s, t in SIDES:
                if name == "Ride":
                    upper, lower, thigh, shin, foot = riding_limbs(s, t)
                elif name == "Walk":
                    # Natural 60% human / 40% stylized cartoon jog swing:
                    # arms swing cleanly forward/back in the sagittal plane with
                    # a soft bent elbow (no outward Z-flare, no upturned wrists).
                    swing = (-s) * math.sin(phase)
                    arm_fwd = -swing  # opposite to same-side leg
                    upper = Quaternion(X, -0.46 * arm_fwd)
                    lower = Quaternion(X, -0.34 - 0.28 * max(0.0, arm_fwd))
                    thigh, shin, foot = (
                        Quaternion(X, -swing * 0.78),
                        Quaternion(),
                        Quaternion(X, swing * 0.78 * 0.42),
                    )
                else:
                    upper = Quaternion(X, -0.02)
                    lower = Quaternion(X, -0.10)
                    thigh, shin, foot = Quaternion(), Quaternion(), Quaternion()
                for prefix, q in [
                    ("UpperArm_", upper),
                    ("Forearm_", lower),
                    ("Thigh_", thigh),
                    ("Shin_", shin),
                    ("Foot_", foot),
                ]:
                    bone_turn(rig, prefix + t, q)
            bone_turn(rig, "GoggleHinge", Quaternion(X, 0 if name == "Ride" else PARK_ANGLE))
            for joint, rotation in tail_rotations(name, phase):
                bone_turn(rig, joint, rotation)
            for pb in rig.pose.bones:
                pb.keyframe_insert(data_path="rotation_quaternion", frame=f, group=pb.name)
            root.keyframe_insert(data_path="location", frame=f, group="Root")
        # Smooth the accessory loops only. Making the entire
        # action cyclic would change the automatic handles of the existing gait.
        for curve in act.layers[0].strips[0].channelbag(slot).fcurves:
            if curve.data_path.startswith('pose.bones["Tail'):
                curve.modifiers.new("CYCLES")
        anim.action = None
        track = anim.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, act)
        strip.action_slot = slot
        track.mute = True
    return anim
