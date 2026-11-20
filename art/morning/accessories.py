"""A chest-fitted kerchief and a three-joint curled tail. Artist space is Y-up, +Z forward."""

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


# Centre of the folded tape from the front bib to the back, mirrored across
# the body. The upper side panels of the jacket are cut to this neckline.
TIE_ROUTE = [
    (0.174, 0.771, 0.175),
    (0.173, 0.766, 0.150),
    (0.161, 0.760, 0.119),
    (0.154, 0.755, 0.086),
    (0.157, 0.755, 0.060),
    (0.162, 0.757, 0.034),
    (0.173, 0.761, 0.006),
    (0.191, 0.770, -0.030),
    (0.210, 0.777, -0.061),
    (0.227, 0.778, -0.091),
    (0.234, 0.775, -0.122),
    (0.215, 0.771, -0.149),
    (0.191, 0.770, -0.174),
    (0.148, 0.763, -0.201),
]


def fit_jacket_neckline(p):
    # Only tailor the upper side panels. The shirt front, lower back hem and
    # outer sleeve caps retain their original contours. There is now a neck
    # opening for the cloth to pass through when a paw reaches over the box.
    profile = [(-0.226, 1.0)]
    for x, y, z in reversed(TIE_ROUTE):
        span = 0.32 * math.sqrt(max(0.001, 1 - ((y - 0.014 - 0.60) / 0.36) ** 2 - (z / 0.25) ** 2))
        profile.append((z, min(1.0, (x - 0.010) / span)))
    profile.append((0.200, 1.0))

    def scale(y, z):
        if z <= profile[0][0] or z >= profile[-1][0] or y <= 0.675:
            return 1.0
        for (a, sa), (b, sb) in zip(profile, profile[1:]):
            if z <= b:
                t = (z - a) / (b - a)
                ratio = sa + t * (sb - sa)
                return 1 + (ratio - 1) * smooth(0.675, 0.742, y)

    for i, pt in enumerate(p.p):
        x, y, z = pt
        sx = scale(y, z)
        if sx == 1:
            continue
        dy = (scale(y + 0.0001, z) - scale(y - 0.0001, z)) / 0.0002
        dz = (scale(y, z + 0.0001) - scale(y, z - 0.0001)) / 0.0002
        nx, ny, nz = p.n[i]
        p.n[i] = V((nx / sx, ny - nx * x * dy / sx, nz - nx * x * dz / sx)).normalized()
        pt.x *= sx


def kerchief(collection, rig, cloth):
    p = Parts()
    p.bind = "Chest"
    print_mat = printed_material("Kerchief · block-printed paisley", "Kerchief_Paisley.png", 0.94, 0.15)
    underside = material("Kerchief · red underside", "b83d30", 0, 0.94)
    # A folded cross section with a soft edge. Every neighbouring pair of
    # rows is sewn together, from one loose end around the neck to the other.
    across = 8

    def section(sample, weight=0):
        ring = []
        p.bind = {"Chest": 1 - weight, "KerchiefEnds": weight}
        for back in (False, True):
            for j in range(across + 1):
                v = (across - j if back else j) / across
                pt, n = sample(v)
                f = math.sin(v * math.pi)
                thick = -0.0018 if back else 0.0019 + 0.0013 * f
                uv = ((pt.x + 0.180) / 0.360, (pt.y - 0.590) / 0.223)
                ring.append(p.vertex(pt + thick * n, -n if back else n, uv))
        return ring

    def sew(a, b, printed=False):
        for j in range(len(a)):
            k = (j + 1) % len(a)
            m = (
                (print_mat if printed else cloth)
                if j < across
                else underside
                if across < j < 2 * across + 1
                else cloth
            )
            p.face((a[j], a[k], b[k], b[j]), m)

    def bib(u, v):
        x = 0.156 * u + 0.009 * v * (1 - u * u)
        top = 0.797 - 0.015 * smooth(0.030, 0.145, abs(x)) + 0.0015 * u
        fall = 0.016 + 0.173 * (1 - math.sqrt(u * u + 0.0016) / math.sqrt(1.0016))
        y = top - fall * v
        z = 0.25 * math.sqrt(max(0, 1 - (x / 0.32) ** 2 - ((y - 0.60) / 0.36) ** 2))
        z += 0.011 + (1 - smooth(0.018, 0.12, abs(x))) * max(0, 0.255 - z)
        z += 0.018 * (1 - smooth(0, 0.62, v)) * (1 - 0.5 * abs(u))
        z += 0.004 * math.sin(math.pi * v) + 0.004 * math.exp(-(((u + 0.45 - 0.36 * v) / 0.21) ** 2)) * (
            1 - v
        )
        return V((x, y, z))

    def bib_sample(u, v):
        pt = bib(u, v)
        n = (bib(u, v + 0.001) - bib(u, v - 0.001)).cross(bib(u + 0.001, v) - bib(u - 0.001, v)).normalized()
        return pt, n

    bib_rows = [section(lambda v, u=i / 24 - 1: bib_sample(u, v)) for i in range(49)]
    for a, b in zip(bib_rows, bib_rows[1:]):
        sew(a, b, True)

    for side in (-1, 1):

        def controls():
            # Entries are the middle of the strip, the direction across the
            # weave, half-width and how much that station follows the free end.
            start, _ = bib_sample(side, 0.5)
            dv = (bib(side, 1) - bib(side, 0)) * 0.5
            yield start, dv, 0.0
            for x, y, z in TIE_ROUTE:
                # A double-fold tie is about 2 cm across. The roll sits inside
                # the sleeve cap and just outside the tailored neckline.
                yield V((side * x, y, z)), V((side * 0.002, -0.0095, 0)), 0.0
            # Dress each side of the overhand knot separately so the diagonal
            # overpass and the two returning cloth ends remain legible.
            k = -0.057
            if side > 0:
                yield V((0.078, 0.759, -0.225)), V((0.003, -0.012, -0.004)), 0.0
            for x, y, z, wx, wy, wz, w in [
                (0.088, 0.753, -0.237, 0.006, -0.012, -0.004, 0),
                (0.059, 0.750, -0.242, 0.007, -0.013, -0.003, 0),
                (0.027, 0.743, -0.251, 0.008, -0.013, -0.003, 0),
            ]:
                px = k + side * x
                depth = -0.25 * math.sqrt(max(0, 1 - (px / 0.32) ** 2 - ((y - 0.60) / 0.36) ** 2))
                extra = 0.011 + 0.013 * (1 - smooth(0.027, 0.088, x))
                yield V((px, y, depth - extra)), V((side * wx, wy, wz)), w
            wraps = (
                [
                    (0.010, 0.750, -0.260, 0.009, -0.011, -0.002, 0),
                    (-0.008, 0.759, -0.264, 0.010, -0.009, -0.003, 0),
                    (-0.024, 0.752, -0.260, 0.011, 0.002, -0.007, 0),
                    (-0.023, 0.735, -0.253, 0.012, -0.003, -0.005, 0),
                    (-0.027, 0.717, -0.263, 0.015, -0.007, -0.003, 0.12),
                    (-0.043, 0.701, -0.272, 0.019, -0.007, -0.003, 0.75),
                    (-0.063, 0.678, -0.279, 0.018, -0.009, -0.003, 1),
                ]
                if side == 1
                else [
                    (-0.012, 0.738, -0.254, -0.006, -0.010, 0.002, 0),
                    (0.003, 0.738, -0.275, -0.006, -0.011, 0.003, 0),
                    (0.020, 0.748, -0.274, 0.008, -0.012, 0.005, 0),
                    (0.026, 0.744, -0.259, 0.011, -0.005, 0.002, 0),
                    (0.022, 0.727, -0.252, 0.013, -0.006, 0.003, 0),
                    (0.029, 0.711, -0.259, 0.017, 0.006, 0.006, 0.25),
                    (0.054, 0.696, -0.273, 0.016, 0.010, 0.004, 1),
                ]
            )
            for x, y, z, wx, wy, wz, w in wraps:
                yield V((k + x, y, z)), V((wx, wy, wz)), w

        ctrl = list(controls())
        centres = spline([c[0] for c in ctrl], 4)
        widths = spline([c[1] for c in ctrl], 4)
        prev = bib_rows[0 if side < 0 else -1]
        for i in range(1, len(centres)):
            along = (centres[min(i + 1, len(centres) - 1)] - centres[i - 1]).normalized()
            width = widths[i]
            normal = width.cross(along).normalized() * side
            a = min(i // 4, len(ctrl) - 2)
            t = i / 4 - a
            weight = (1 - t) * ctrl[a][2] + t * ctrl[a + 1][2]

            def sample(v):
                fold = 0.0025 * math.sin(math.pi * v)
                return centres[i] + (2 * v - 1) * width + fold * normal, normal

            row = section(sample, weight)
            sew(prev, row)
            prev = row
        # Close the bias-cut tip as a strip of quads; all rows, including
        # the knot and both loose ends, belong to one continuous cloth.
        for j in range(across):
            p.face((prev[j], prev[j + 1], prev[-j - 2], prev[-j - 1]), underside)

    return p.finish("Kerchief", collection, armature=rig)


# The root grows out of the rump, the belly of the curl bows sideways, then
# the cream tip curls back into the opening. Joints follow this same centreline.
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
