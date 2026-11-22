"""A three-joint curled tail and its motion helpers. Artist space is Y-up, +Z forward."""

import math
from pathlib import Path
import bpy
from mathutils import Quaternion
from forms import Parts, V, X, Z, TAU, material, smooth, spline


def printed_material(name, filename, roughness, sheen):
    mat = material(name, "ffffff", 0, roughness)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Sheen Weight"].default_value = sheen
    image = bpy.data.images.load(str(Path(__file__).with_name(filename)))
    image.pack()
    image.filepath = "//" + filename
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-380, 240)
    mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    return mat


TAIL_PATH = [
    (0.010, 0.435, -0.207),
    (0.018, 0.437, -0.253),
    (0.052, 0.444, -0.292),
    (0.107, 0.468, -0.322),
    (0.149, 0.514, -0.339),
    (0.132, 0.562, -0.347),
    (0.080, 0.591, -0.345),
    (0.027, 0.589, -0.338),
    (-0.004, 0.566, -0.333),
    (-0.009, 0.538, -0.331),
    (0.022, 0.520, -0.337),
]
TAIL_JOINTS = [
    ("Tail", 0, 2, "Pelvis"),
    ("TailMid", 2, 5, "Tail"),
    ("TailTip", 5, 10, "TailMid"),
]


def curled_tail(collection, rig):
    p = Parts()
    coat = printed_material("Fur · brushed Shiba plume", "Plume_Coat.png", 0.93, 0.32)
    steps = 7
    path = spline(TAIL_PATH, steps)
    distances = [0.0]
    for a, b in zip(path, path[1:]):
        distances.append(distances[-1] + (b - a).length)
    fractions = [d / distances[-1] for d in distances]
    mid = fractions[TAIL_JOINTS[1][1] * steps]
    tip = fractions[TAIL_JOINTS[2][1] * steps]

    # One continuous skin. Assign an entire cross-section the same arc-length
    # weights, including on the returning tip where height no longer increases.
    def radius(t):
        # The root is short and compact. The guard hairs fan out on the
        # outer bend and sweep down to one rounded cream tuft in the curl.
        base = 0.040 + 0.060 * smooth(0.02, 0.42, t) - 0.048 * smooth(0.46, 0.92, t)
        cap = max(0, (t - 0.875) / 0.125)
        return base * math.sqrt(max(0, 1 - cap * cap))

    # Parallel transport keeps locks combed along the curl. A broad uneven
    # profile and shallow overlapping locks break up the silhouette in close-up.
    frames = []
    normal = X.copy()
    sides = 40
    for i, pt in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        normal = (normal - tangent * normal.dot(tangent)).normalized()
        frames.append((tangent, normal, tangent.cross(normal)))

    locks = []
    for layer, t0 in enumerate((0.20, 0.36, 0.53, 0.69, 0.83)):
        for j in range(6):
            locks.append(
                (
                    t0 + 0.027 * math.sin(j * 4 + layer),
                    j * TAU / 6 + layer * 0.58,
                    0.008 + 0.003 * math.cos(j + layer),
                )
            )

    def surface(i, angle):
        t = fractions[i]
        tangent, n, across = frames[i]
        radial = math.cos(angle) * n + math.sin(angle) * across
        loft = 0
        sweep = 0
        for t0, direction, height in locks:
            d = (t - t0) / 0.091
            if abs(d) >= 1:
                continue
            band = abs((angle - direction - 0.23 * d + math.pi) % TAU - math.pi) / 0.47
            if band < 1:
                lobe = (1 - band * band) ** 2 * (1 - d * d) ** 2
                loft += height * lobe
                sweep += 0.014 * lobe
        # Build the main volume perpendicular to the spine of the curl.
        # Keep the original locks as surface detail on this round section.
        offset = radial * (radius(t) + loft) + tangent * sweep
        # Ease the depth at the two contact surfaces, between coat and case.
        offset.z *= 1 - 0.24 * smooth(0.07, 0.30, t)
        return path[i] + offset - Z * (0.006 * smooth(0.11, 0.33, t))

    previous = None
    for i, t in enumerate(fractions):
        wm, wt = smooth(mid - 0.12, mid + 0.12, t), smooth(tip - 0.13, tip + 0.13, t)
        p.bind = lambda _, m=wm, k=wt: {"Tail": 1 - m, "TailMid": m - k, "TailTip": k}
        if i == len(path) - 1:
            end = p.vertex(path[i], frames[i][0], (t, 0.5))
            for a, b in zip(previous, previous[1:]):
                p.face((a, b, end), coat)
            break
        row = []
        for j in range(sides + 1):
            a = TAU * j / sides
            pt = surface(i, a)
            du = surface(min(i + 1, len(path) - 1), a) - surface(max(0, i - 1), a)
            dv = surface(i, a + 0.004) - surface(i, a - 0.004)
            row.append(p.vertex(pt, dv.cross(du), (t, j / sides)))
        if previous is None:
            p.face(tuple(reversed(row[:-1])), coat)
        else:
            for j in range(sides):
                p.face((previous[j], previous[j + 1], row[j + 1], row[j]), coat)
        previous = row
    return p.finish("Curled_Tail", collection, armature=rig)


def tail_rotations(action, phase):
    # Small rotations of stiff, overlapping sections retain the curl. The
    # outer joints reach their extrema just after the joint closer to the rump.
    angles = {
        "Stand": ((3.2, 2.4), (1.3, 1.2), (0.9, 1.3)),
        "Walk": ((4.4, 8.0), (2.2, 3.9), (1.7, 3.0)),
        "Ride": ((1.9, 1.6), (1.2, 0.8), (1.0, 0.7)),
    }
    for i, ((name, *_), (pitch, sway)) in enumerate(zip(TAIL_JOINTS, angles[action])):
        beat = phase - i * 0.34
        lift = pitch * math.sin((2 if action == "Walk" else 1) * beat)
        rock = sway * math.sin(beat + 0.68)
        rotation = Quaternion(X, math.radians(lift)) @ Quaternion(Z, math.radians(rock))
        if action == "Ride" and i == 0:
            rotation = Quaternion(V((0.2, 0, 1)).normalized(), math.radians(-17)) @ rotation
        yield name, rotation
