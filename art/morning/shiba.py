"""Author the standing courier first. All the other poses use this bind skeleton."""

import math
import struct
import zlib
import bpy
from mathutils import Quaternion
from forms import Parts, V, X, UP, Z, TAU, blender_v, material, smooth
from riding_fit import RIDER_ORIGIN, PELVIS_TILT, CHEST_TILT, HEAD_LEVEL, SOLE_DEPTH, footrest, palm
from helmet import make_helmet, HINGE, PARK_ANGLE
from accessories import fit_jacket_neckline, kerchief, curled_tail, tail_rotations, TAIL_JOINTS, TAIL_PATH

BONES = {}
SIDES = [(-1, "L"), (1, "R")]


def rig_bones():
    d = {}

    def add(name, start, end, parent=None):
        d[name] = (V(start), V(end), parent)

    add("Root", (0, 0, 0), (0, 0.12, 0))
    add("Pelvis", (0, 0.39, 0), (0, 0.57, 0), "Root")
    add("Chest", (0, 0.57, 0), (0, 0.87, 0), "Pelvis")
    add("Head", (0, 1.25, 0.035), (0, 1.52, 0.035), "Chest")
    add("GoggleHinge", HINGE, (0, HINGE[1]+.10, HINGE[2]), "Head")
    add("KerchiefEnds", (-.057, .743, -.228), (-.057, .693, -.263), "Chest")
    for name, start, end, parent in TAIL_JOINTS:
        add(name, TAIL_PATH[start], TAIL_PATH[end], parent)
    for s, tag in SIDES:
        add("Ear_" + tag, (s * 0.36, 1.57, 0.01), (s * 0.48, 1.90, 0.025), "Head")
        add("Eye_" + tag, (s * 0.238, 1.279, 0.442), (s * 0.238, 1.325, 0.442), "Head")
        add("UpperArm_" + tag, (s * 0.276, 0.77, 0.014), (s * 0.295, 0.653, 0.03), "Chest")
        add("Forearm_" + tag, (s * 0.295, 0.653, 0.03), (s * 0.309, 0.565, 0.046), "UpperArm_" + tag)
        add("Paw_" + tag, (s * 0.309, 0.565, 0.046), (s * 0.316, 0.507, 0.055), "Forearm_" + tag)
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
    parts.face(tuple(parts.vertex(parts.p[i], -UP) for i in rings[0]), rubber)
    top = parts.vertex(ankle + UP * SOLE_DEPTH, UP)
    for j in range(segments):
        parts.face((rings[-1][j], rings[-1][(j + 1) % segments], top), leather)


def make_character(collection, rig, coat_path):
    fur = material("Fur · fox orange", "d87b38")
    cream = material("Fur · warm cream", "ffedcc")
    ink = material("Face · espresso", "32272a", 0, 0.49)
    blush = material("Face · peach", "df9e83")
    earinner = material("Ear · terracotta", "8f5847")
    jacket = material("Uniform · bottle green", "26776c")
    pants = material("Uniform · dark teal", "154f50")
    orange = material("Kerchief · vermilion weave", "cf4735", 0, .94)
    shoe = material("Shoes · walnut", "60483c")
    outsole = material("Shoes · dark rubber sole", "493d35", 0, 0.85)
    gold = material("Uniform · ochre zipper", "ebae48")
    white = material("Face · catchlight", "fff7d8")

    def part(name, bone):
        p = Parts()
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
    p, end = part("Uniform", "Chest")
    # Anchor the fabric immediately above the tail opening to the waistband.
    # The upper jacket still follows the leaning and turning chest.
    def rear_hem(point):
        low = 1 - smooth(.46, .63, point.y)
        centre = 1 - smooth(.115, .24, abs(point.x))
        rear = 1 - smooth(-.18, -.08, point.z)
        hem = low * centre * rear
        return {"Pelvis": hem, "Chest": 1 - hem}

    p.bind = rear_hem
    p.oval((0, 0.60, 0), (0.32, 0.36, 0.25), jacket, 64, 48)
    fit_jacket_neckline(p)
    p.bind = "Pelvis"
    p.oval((0, 0.41, -0.005), (0.27, 0.17, 0.22), pants)
    p.bind = "Chest"
    p.box((0, 0.64, 0.234), (0.022, 0.32, 0.02), 0.005, gold)
    p.box((-0.15, 0.64, 0.203), (0.11, 0.095, 0.034), 0.014, cream)
    end()
    kerchief(collection, rig, orange)
    curled_tail(collection, rig)
    for s, t in SIDES:
        shoulder = BONES["UpperArm_" + t][0]

        def sleeve(p, tag=t):
            f = smooth(0.068, 0.171, 0.77 - p.y)
            return {"UpperArm_" + tag: 1 - f, "Forearm_" + tag: f}

        p, end = part("Sleeve_" + t, sleeve)
        p.oval(shoulder + V((s * 0.023, -0.105, 0.016)), (0.105, 0.162, 0.112), jacket)
        end()
        p, end = part("Mitten_" + t, "Paw_" + t)
        p.oval(BONES["Paw_" + t][0], (0.093, 0.102, 0.096), cream)
        end()
        p, end = part("Haunch_" + t, "Thigh_" + t)
        p.oval((s * 0.151, 0.295, 0), (0.117, 0.16, 0.117), pants)
        p.bind = "Shin_" + t
        p.oval((s * 0.151, 0.152, 0.018), (0.098, 0.104, 0.096), fur)
        end()
        p, end = part("Shoe_" + t, "Foot_" + t)
        riding_shoe(p, BONES["Foot_" + t][0], shoe, outsole)
        end()


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
        "UpperArm_" + tag, "Forearm_" + tag, back.inverted() @ (palm(s) - shoulder), V((s * 0.40, -1, -0.22))
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
                off = RIDER_ORIGIN
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
                bone_turn(rig, "Pelvis", Quaternion(Z, 0.045 * math.sin(phase)))
            for s, t in SIDES:
                if name == "Ride":
                    upper, lower, thigh, shin, foot = riding_limbs(s, t)
                else:
                    swing = (-s) * math.sin(phase) if name == "Walk" else 0
                    upper, lower = Quaternion(X, -0.12 + swing * 0.62), Quaternion()
                    thigh, shin, foot = (
                        Quaternion(X, -swing * 0.78),
                        Quaternion(),
                        Quaternion(X, swing * 0.78 * 0.42),
                    )
                for prefix, q in [
                    ("UpperArm_", upper),
                    ("Forearm_", lower),
                    ("Thigh_", thigh),
                    ("Shin_", shin),
                    ("Foot_", foot),
                ]:
                    bone_turn(rig, prefix + t, q)
            bone_turn(rig, "GoggleHinge", Quaternion(X, 0 if name == "Ride" else PARK_ANGLE))
            flutter = {"Stand": .035, "Walk": .12, "Ride": .17}[name]
            bone_turn(rig, "KerchiefEnds", Quaternion(X, flutter * math.sin(phase))
                      @ Quaternion(UP, .50 * flutter * math.cos(phase)))
            for joint, rotation in tail_rotations(name, phase):
                bone_turn(rig, joint, rotation)
            for pb in rig.pose.bones:
                pb.keyframe_insert(data_path="rotation_quaternion", frame=f, group=pb.name)
            root.keyframe_insert(data_path="location", frame=f, group="Root")
        # Smooth the accessory loops only. Making the entire
        # action cyclic would change the automatic handles of the existing gait.
        for curve in act.layers[0].strips[0].channelbag(slot).fcurves:
            if curve.data_path.startswith(('pose.bones["Tail', 'pose.bones["KerchiefEnds')):
                curve.modifiers.new("CYCLES")
        anim.action = None
        track = anim.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, act)
        strip.action_slot = slot
        track.mute = True
    return anim
