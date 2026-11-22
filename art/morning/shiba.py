"""Author the standing courier first. All the other poses use this bind skeleton."""

import math
import struct
import zlib
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
        # A clean Animal Crossing-style A pose.  The shoulder starts on the
        # narrow outer yoke; the long, slender two-bone chain stays outside
        # the pear-shaped torso instead of being buried in the belly.
        add("UpperArm_" + tag, (s * 0.208, 0.720, 0.015), (s * 0.280, 0.590, 0.040), "Chest")
        add("Forearm_" + tag, (s * 0.280, 0.590, 0.040), (s * 0.379, 0.490, 0.070), "UpperArm_" + tag)
        add("Paw_" + tag, (s * 0.379, 0.490, 0.070), (s * 0.394, 0.457, 0.076), "Forearm_" + tag)
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
    # Build the garment shell as deliberately separate, weighted volumes.  A
    # continuous voxel/remesh pass used to weld the sleeves into the belly;
    # keeping the yoke, body and sleeves as clean islands preserves a real
    # underarm gap through every pose.
    jacket_parts = Parts()
    p = jacket_parts
    def body_weights(point):
        chest = smooth(.435, .745, point.y)
        return {"Pelvis": 1 - chest, "Chest": chest}

    # Short, softly inflated pear jacket.  The lower hem sits at the waist,
    # while the 25 longitudinal rings keep every trim surface genuinely
    # curved instead of approximating the torso with boxes.
    profile = [(.430, .258, .215), (.455, .265, .222), (.56, .258, .221),
               (.66, .228, .212), (.715, .208, .195), (.745, .200, .178),
               (.790, .192, .175)]

    def coat_shape(y):
        y = max(profile[0][0], min(profile[-1][0], y))
        for (ya, rxa, rza), (yb, rxb, rzb) in zip(profile, profile[1:]):
            if y <= yb:
                t = (y - ya) / (yb - ya)
                return rxa + (rxb - rxa) * t, rza + (rzb - rza) * t
        return profile[-1][1:]

    def coat_surface(y, angle, lift=.0025):
        rx, rz = coat_shape(y)
        side_factor = 0.62 + 0.38 * abs(math.sin(angle)) if .54 <= y <= .78 else 1.0
        radial = V((math.cos(angle) / (rx * side_factor), 0, math.sin(angle) / rz)).normalized()
        return V((rx * side_factor * math.cos(angle), y, rz * math.sin(angle))) + lift * radial

    p.bind = body_weights
    rings = []
    seg = 56
    vertical = 25
    for i in range(vertical):
        y = profile[0][0] + (profile[-1][0] - profile[0][0]) * i / (vertical - 1)
        rx, rz = coat_shape(y)
        row = []
        for j in range(seg):
            a = TAU * j / seg
            side_factor = 0.62 + 0.38 * abs(math.sin(a)) if .54 <= y <= .78 else 1.0
            x, z = rx * side_factor * math.cos(a), rz * math.sin(a)
            row.append(p.vertex((x, y, z), V((math.cos(a) / (rx * side_factor), 0, math.sin(a) / rz))))
        rings.append(row)
    for a, b in zip(rings, rings[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            p.face((a[j], a[k], b[k], b[j]), jacket)
    p.face(tuple(reversed(rings[0])), jacket)
    p.face(tuple(rings[-1]), jacket)

    # Sleeves are rounded rubber-hose tubes.  The centreline is sampled into
    # sixteen sections and weights are computed from its true arc-length
    # parameter, never from world Y (the elbow is deliberately below the
    # shoulder and that old shortcut inverted the two bones).
    for s, t in SIDES:
        shoulder = BONES["UpperArm_" + t][0] + V((s * .024, 0, 0))
        elbow = BONES["Forearm_" + t][0] + V((s * .024, 0, 0))
        wrist = BONES["Forearm_" + t][1] + V((s * .024, 0, 0))
        path = spline([shoulder, elbow, wrist], 8)
        cumulative = [0.0]
        for a, b in zip(path, path[1:]):
            cumulative.append(cumulative[-1] + (b - a).length)
        total = cumulative[-1]

        def arm_t(point, points=path, lengths=cumulative, length=total):
            best_d, best_t = float("inf"), 0.0
            for i, (a, b) in enumerate(zip(points, points[1:])):
                ab = b - a
                u = max(0.0, min(1.0, (V(point) - a).dot(ab) / max(ab.length_squared, 1e-12)))
                q = a + u * ab
                d = (V(point) - q).length_squared
                if d < best_d:
                    best_d, best_t = d, (lengths[i] + u * ab.length) / length
            return max(0.0, min(1.0, best_t))

        def sleeve_weights(point, tag=t):
            t_axis = arm_t(point)
            chest = .18 * (1 - smooth(0.0, .16, t_axis))
            fore = smooth(.25, .75, t_axis)
            return {"Chest": chest, "UpperArm_" + tag: (1 - chest) * (1 - fore),
                    "Forearm_" + tag: (1 - chest) * fore}
        jacket_parts.bind = sleeve_weights
        jacket_parts.oval(shoulder, (.079, .081, .079), jacket, 28, 14,
                           rot=Quaternion(Z, -s * .13))
        jacket_parts.tube(path, lambda u: .078 - .008 * u, jacket, 24, 2)
    jacket_obj = jacket_parts.finish("Uniform", collection, armature=rig)

    # Charcoal collar/yoke, pants, cuffs, zipper and compact reflective bands
    # are kept in the same exported Uniform object (four garment materials).
    trim_parts = Parts()
    trim_parts.bind = "Pelvis"
    trim_parts.oval((0, 0.411, -0.005), (0.27, 0.17, 0.22), pants)
    def surface_strip(y0, y1, mat, a0=0.0, a1=TAU, around=48, steps=6, lift=.0038):
        rows = []
        for s_idx in range(steps + 1):
            y = y0 + (y1 - y0) * s_idx / steps
            rows.append([trim_parts.vertex(coat_surface(y, a, lift), V((math.cos(a), 0, math.sin(a))))
                         for a in [a0 + (a1 - a0) * j / around for j in range(around + 1)]])
        for ra, rb in zip(rows, rows[1:]):
            for j in range(around):
                trim_parts.face((ra[j], ra[j + 1], rb[j + 1], rb[j]), mat)

    trim_parts.bind = body_weights
    # Shoulder yoke, snug waist side panels, hem and collar all follow the
    # same torso profile and weights.  No rigid applique floats or Z-fights.
    surface_strip(.712, .754, charcoal, steps=5, lift=.0038)
    surface_strip(.430, .456, charcoal, steps=4, lift=.0038)
    surface_strip(.752, .788, charcoal, steps=4, lift=.0042)
    for centre in (0, math.pi):
        surface_strip(.515, .685, charcoal, centre - .26, centre + .26, 14, steps=6, lift=.0038)
    # Silver bands wrap the front and back curvature in one continuous ring.
    surface_strip(.630, .643, reflective, steps=2, lift=.0046)
    # A fine front placket follows the surface normal from hem to collar.
    trim_parts.tube([coat_surface(y, math.pi / 2, .0045) for y in [
        .456 + (.756 - .456) * i / 12 for i in range(13)]], .0055, charcoal, 12, 3)
    # Small left chest pocket cleanly seated on the yellow chest below the yoke.
    pocket = []
    for s_idx in range(5):
        y = .652 + (.695 - .652) * s_idx / 4
        row = []
        for a in [1.78 + .30 * j / 8 for j in range(9)]:
            row.append(trim_parts.vertex(coat_surface(y, a, .0044), V((math.cos(a), 0, math.sin(a)))))
        pocket.append(row)
    for ra, rb in zip(pocket, pocket[1:]):
        for j in range(8): trim_parts.face((ra[j], ra[j + 1], rb[j + 1], rb[j]), charcoal)
    for s, t in SIDES:
        shoulder = BONES["UpperArm_" + t][0] + V((s * .024, 0, 0))
        elbow = BONES["Forearm_" + t][0] + V((s * .024, 0, 0))
        wrist = BONES["Forearm_" + t][1] + V((s * .024, 0, 0))
        axis = (BONES["Forearm_" + t][1] - BONES["Forearm_" + t][0]).normalized()
        cuff_a = wrist - axis * 0.058
        cuff_b = wrist - axis * 0.010
        trim_parts.bind = "Forearm_" + t
        trim_parts.tube([cuff_a, cuff_b], lambda u: .0755, charcoal, 24, 4)
        # Narrow silver safety bands are concentric rings around each forearm.
        axis = (wrist - elbow).normalized()
        stripe_center = elbow + axis * .50 * (wrist - elbow).length
        ring_u = axis.cross(UP).normalized()
        ring_v = axis.cross(ring_u).normalized()
        stripe = []
        for j in range(25):
            a = TAU * j / 24
            stripe.append(stripe_center + .0755 * (ring_u * math.cos(a) + ring_v * math.sin(a)))
        trim_parts.bind = "Forearm_" + t
        trim_parts.tube(stripe, .0045, reflective, 8, 1, caps=False)
    trim_obj = trim_parts.finish("Uniform trims", collection, armature=rig)
    curled_tail(collection, rig)
    for s, t in SIDES:
        p, mitten_end = part("Mitten_" + t, "Paw_" + t)
        p.oval(BONES["Paw_" + t][0], (0.070, 0.072, 0.068), cream)
        mitten_end()
        p, end = part("Haunch_" + t, "Thigh_" + t)
        p.oval((s * 0.151, 0.295, 0), (0.117, 0.16, 0.117), pants)
        p.bind = "Shin_" + t
        p.oval((s * 0.151, 0.152, 0.018), (0.098, 0.104, 0.096), fur)
        end()
        p, end = part("Shoe_" + t, "Foot_" + t)
        riding_shoe(p, BONES["Foot_" + t][0], shoe, outsole)
        end()

    # Join the shell and trims.  The resulting object retains four garment
    # material islands while the sleeve/body surfaces remain physically separate.
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
                bone_turn(rig, "Pelvis", Quaternion(Z, 0.055 * math.sin(phase)) @ Quaternion(UP, 0.05 * math.sin(phase)))
                bone_turn(rig, "Chest", Quaternion(UP, -0.06 * math.sin(phase)) @ Quaternion(Z, -0.03 * math.sin(phase)))
            for s, t in SIDES:
                if name == "Ride":
                    upper, lower, thigh, shin, foot = riding_limbs(s, t)
                elif name == "Walk":
                    swing = (-s) * math.sin(phase)
                    upper = Quaternion(X, swing * 0.54) @ Quaternion(Z, s * (0.04 + 0.04 * abs(swing)))
                    lower = Quaternion(X, -0.08 - max(0.0, -swing) * 0.16)
                    thigh, shin, foot = (
                        Quaternion(X, -swing * 0.78),
                        Quaternion(),
                        Quaternion(X, swing * 0.78 * 0.42),
                    )
                else:
                    upper = Quaternion(X, -0.025)
                    lower = Quaternion(X, -0.06)
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
