"""A-Chai's open-face helmet with ear ports and articulated touring goggles. Artist coordinates are Y-up, +Z forward."""

import math
from forms import Parts, V, TAU, material, smooth

CENTER = V((0, 1.255, 0.027))
RX, RY, RZ = 0.604, 0.554, 0.501
HINGE = (0, 1.271, 0.030)
PARK_ANGLE = math.radians(-38)


def shell_at(theta, polar, offset=0):
    s = math.sin(polar)
    x, y, z = s * math.sin(theta), math.cos(polar), s * math.cos(theta)
    n = V((x / RX, y / RY, z / RZ)).normalized()
    return CENTER + V((RX * x, RY * y, RZ * z)) + offset * n, n


def polar_at(height):
    return math.acos((height - CENTER.y) / RY)


def skirt(theta):
    # High above the brows, lower over the temples, then around the nape.
    front = math.cos(theta)
    # A jet helmet has cheek protection in front of the nape and an open face.
    # The raked cutaway rises from the side pivots to a flush forehead lip.
    height = 1.071 + 0.399 * smooth(0.18, 0.78, front) + 0.045 * smooth(0.78, 1, front)
    height += 0.041 * smooth(0.10, 0.78, -front)
    return polar_at(height)


def build_shell(p, paint, edging, liner, stripe):
    around, levels = 96, 32
    grid = {}

    def grid_point(i, j):
        key = (i % around if j else 0, j)
        if key not in grid:
            theta = TAU * key[0] / around
            grid[key] = p.vertex(*shell_at(theta, skirt(theta) * j / levels))
        return grid[key]

    # Leave out a grid patch on each side and retopologize it around a rolled ear opening.
    ports = [(24, 18, 30), (72, 66, 78)]
    low, high = 5, 25
    for j in range(levels):
        for i in range(around):
            if low <= j < high and any(left <= i < right for _, left, right in ports):
                continue
            a, b = grid_point(i, j + 1), grid_point(i + 1, j + 1)
            if j:
                p.face((a, b, grid_point(i + 1, j), grid_point(i, j)), paint)
            else:
                p.face((a, b, grid_point(0, 0)), paint)

    for center, left, right in ports:
        edge = (
            [(i, low) for i in range(left, right)]
            + [(right, j) for j in range(low, high)]
            + [(i, high) for i in range(right, left, -1)]
            + [(left, j) for j in range(high, low, -1)]
        )
        outer, inner = [], []
        for i, j in edge:
            u = (i - center) / (right - center)
            v = (2 * j - low - high) / (high - low)
            ang = math.atan2(v, u)
            c, s = math.cos(ang), math.sin(ang)
            theta = TAU * i / around
            outer.append((theta, skirt(theta) * j / levels))
            inner.append(
                (
                    TAU * center / around + 0.215 * math.copysign(abs(c) ** 0.80, c),
                    0.758 + 0.327 * math.copysign(abs(s) ** 0.80, s),
                )
            )
        row = [grid_point(i, j) for i, j in edge]
        for f, inset, mat in [(0.4, 0, paint), (0.75, 0, paint), (1, 0, paint), (1, -0.016, liner)]:
            next_row = [
                p.vertex(*shell_at(t0 + (t1 - t0) * f, p0 + (p1 - p0) * f, inset))
                for (t0, p0), (t1, p1) in zip(outer, inner)
            ]
            for i in range(len(row)):
                k = (i + 1) % len(row)
                p.face((row[i], row[k], next_row[k], next_row[i]), mat)
            row = next_row
        border = [shell_at(t, angle, 0.001)[0] for t, angle in inner]
        p.tube(border + [border[0]], 0.009, edging, 9)

    rolled = [shell_at(TAU * i / around, skirt(TAU * i / around)) for i in range(around)]
    inner = [p.vertex(point - 0.025 * n, -n) for point, n in rolled]
    for i in range(around):
        k = (i + 1) % around
        p.face((grid_point(i, levels), grid_point(k, levels), inner[k], inner[i]), liner)
    p.tube([point for point, _ in rolled] + [rolled[0][0]], 0.020, liner, 14)
    line = [shell_at(TAU * i / around, skirt(TAU * i / around) - 0.043, 0.001)[0] for i in range(around + 1)]
    p.tube(line, 0.006, edging, 9)
    # Twin enamel pinstripes follow parallel planes across the crown.
    for centre in (-0.043, 0.043):
        rows = []
        for j in range(49):
            angle = -(skirt(math.pi) - 0.04) + (skirt(math.pi) + skirt(0) - 0.08) * j / 48
            pair = []
            for x in (centre - 0.010, centre + 0.010):
                f = math.sqrt(1 - (x / RX) ** 2)
                yy, zz = math.cos(angle) * f, math.sin(angle) * f
                normal = V((x / (RX * RX), yy / RY, zz / RZ)).normalized()
                pair.append(p.vertex(CENTER + V((x, RY * yy, RZ * zz)) + 0.002 * normal, normal))
            rows.append(pair)
        for a, b in zip(rows, rows[1:]):
            p.face((a[0], a[1], b[1], b[0]), stripe)


def helmet_mounts(p, trim, liner, band, metal):
    # A broad elastic strap stays on the rigid shell. Only the arms ahead of
    # the two studs turn. The back of the band sits below both ear openings.
    theta0 = math.pi / 2
    rows = []
    for i in range(81):
        theta = theta0 + math.pi * i / 80
        h = HINGE[1] - 0.060 * (-math.cos(theta))
        rows.append(
            [
                p.vertex(*shell_at(theta, polar_at(h + dy), lift))
                for dy, lift in [(-0.030, 0.005), (-0.023, 0.013), (0.023, 0.013), (0.030, 0.005)]
            ]
        )
    for a, b in zip(rows, rows[1:]):
        for j, mat in enumerate([trim, band, trim]):
            p.face((a[j], b[j], b[j + 1], a[j + 1]), mat)

    for side in [-1, 1]:
        # Padded shell sockets and low-profile concentric pivot rivets.
        for x0, x1, r, mat in [
            (0.584, 0.607, 0.066, liner),
            (0.606, 0.623, 0.053, trim),
            (0.621, 0.634, 0.034, metal),
            (0.633, 0.636, 0.015, liner),
        ]:
            p.tube([(side * x0, HINGE[1], HINGE[2]), (side * x1, HINGE[1], HINGE[2])], r, mat, 32)

        # Two intake slots sit in the lacquer above the open face.
        for angle in [0.26, 0.39]:
            row = []
            for polar, width in [(0.53, 0.004), (0.56, 0.021), (0.67, 0.024), (0.73, 0.013), (0.75, 0.002)]:
                row.append(
                    [
                        p.vertex(*shell_at(side * angle + d * width, polar, offset))
                        for d, offset in [(-1, 0.001), (-0.72, 0.006), (0.72, 0.006), (1, 0.001)]
                    ]
                )
            for a, b in zip(row, row[1:]):
                for j, mat in enumerate([trim, liner, trim]):
                    p.face((a[j], b[j], b[j + 1], a[j + 1]), mat)


def chinstrap(p, webbing, edge, buckle):
    # Run under the jaw, ahead of the bandana. The ends sit under the liner
    # below the temple rivets, so the helmet reads as a fastened piece of kit.
    def surface(a, across, lift=0):
        z = 0.230 - 0.125 * smooth(0.10, 1.38, abs(a)) + across
        nz = (z - 0.035) / 0.463
        ring = math.sqrt(1 - nz * nz)
        nx, ny = ring * math.sin(a), -ring * math.cos(a)
        n = V((nx / 0.574, ny / 0.492, nz / 0.463)).normalized()
        rise = 0.0025 + 0.018 * smooth(1.14, 1.45, abs(a))
        pt = V((0.574 * nx, 1.25 + 0.492 * ny, z)) + (rise + lift) * n
        return pt, n

    rows = []
    for i in range(81):
        a = -1.45 + 2.90 * i / 80
        rows.append(
            [
                p.vertex(*surface(a, d, h))
                for d, h in [(-0.016, 0), (-0.012, 0.002), (0.012, 0.002), (0.016, 0)]
            ]
        )
    for a, b in zip(rows, rows[1:]):
        for j, mat in enumerate([edge, webbing, edge]):
            p.face((a[j], b[j], b[j + 1], a[j + 1]), mat)
    # A single little brass keeper on the left cheek wraps around the webbing.
    path = [
        surface(a, d, 0.005)[0]
        for a, d in [(-1.09, -0.021), (-1.01, -0.021), (-1.01, 0.021), (-1.09, 0.021), (-1.09, -0.021)]
    ]
    p.tube(path, 0.004, buckle, 9)


def goggles(p, gasket, frame, elastic, glass, glint):
    # Model the optical surfaces in the eyes-down position. A single bone
    # swings both lenses, the bridge and the side arms around the shell studs.
    def lens_point(side, u, v, lift):
        theta = side * (0.419 + 0.309 * u)
        y = 1.299 + 0.103 * v + 0.019 * max(0, -u) - 0.006 * u
        normal = V((math.sin(theta) / 0.607, 0.21 * v, math.cos(theta) / 0.517)).normalized()
        pt = V((0.607 * math.sin(theta), y, 0.032 + 0.517 * math.cos(theta)))
        return pt + lift * normal, normal

    for side in [-1, 1]:
        rows = []
        for i in range(32):
            t = i / 31
            theta = 0.704 + (math.pi / 2 - 0.704) * t
            y = 1.311 + (HINGE[1] - 1.311) * smooth(0, 1, t) + 0.005 * math.sin(t * math.pi)
            half = 0.018 + 0.009 * math.sin(math.pi * t)
            radial = V((side * math.sin(theta), 0, math.cos(theta)))
            centre = V((side * 0.616 * math.sin(theta), y, HINGE[2] + 0.528 * math.cos(theta)))
            rows.append(
                [
                    p.vertex(centre + V((0, half * dy, 0)) + dist * radial, radial)
                    for dy, dist in [(-1, 0), (-0.77, 0.005), (0.77, 0.005), (1, 0)]
                ]
            )
        for a, b in zip(rows, rows[1:]):
            for j, mat in enumerate([gasket, elastic, gasket]):
                p.face((a[j], b[j], b[j + 1], a[j + 1]), mat)

        previous = None
        for scale, lift, mat in [
            (1.02, -0.004, gasket),
            (1.04, 0.008, gasket),
            (1, 0.019, gasket),
            (0.96, 0.023, frame),
            (0.85, 0.025, frame),
            (0.815, 0.022, gasket),
            (0.81, 0.025, glass),
            (0.53, 0.038, glass),
            (0.22, 0.044, glass),
        ]:
            ring = []
            for j in range(56):
                angle = j * TAU / 56
                x, y = math.cos(angle), math.sin(angle)
                u = scale * math.copysign(abs(x) ** 0.79, x)
                v = scale * math.copysign(abs(y) ** 0.81, y)
                ring.append(p.vertex(*lens_point(side, u, v, lift)))
            if previous:
                for j in range(len(ring)):
                    k = (j + 1) % len(ring)
                    p.face((previous[j], previous[k], ring[k], ring[j]), mat)
            previous = ring
        centre = p.vertex(*lens_point(side, 0, 0, 0.045))
        for j in range(len(ring)):
            p.face((ring[j], ring[(j + 1) % len(ring)], centre), glass)
        # Hand-painted-style high reflection, confined to the upper outer corner.
        arc = [
            lens_point(side, u, v, h)[0]
            for u, v, h in [
                (0.03, 0.67, 0.034),
                (0.21, 0.64, 0.036),
                (0.38, 0.55, 0.037),
                (0.47, 0.46, 0.037),
            ]
        ]
        p.tube(arc, lambda t: 0.0015 + 0.003 * math.sin(t * math.pi), glint, 8, 3)

    bridge = [
        (-0.083, 1.315, 0.561),
        (-0.050, 1.33, 0.570),
        (0, 1.338, 0.574),
        (0.050, 1.33, 0.570),
        (0.083, 1.315, 0.561),
    ]
    p.tube(bridge, 0.015, gasket, 14, 4)
    p.tube([V(pt) + V((0, 0.004, 0.009)) for pt in bridge], 0.008, frame, 10, 4)


def make_helmet(collection, rig):
    lacquer = material("Helmet · marigold lacquer", "eeb448", 0.08, 0.29)
    stripe = material("Helmet · cream enamel", "ffe4af", 0.02, 0.39)
    edging = material("Helmet · amber edging", "c79353", 0.11, 0.47)
    liner = material("Helmet · padded dark edge", "503d36", 0, 0.78)
    band = material("Goggles · woven saddle strap", "855c45", 0, 0.84)
    gasket = material("Goggles · face cushion", "433d39", 0, 0.79)
    rim = material("Goggles · brushed champagne", "f2d396", 0.17, 0.35)
    glass = material("Goggles · tinted optical glass", "69a4ac", 0.05, 0.19)
    glass.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.37
    glass.diffuse_color = (*glass.diffuse_color[:3], 0.37)
    glass.surface_render_method = "BLENDED"
    glint = material("Goggles · sky reflection", "d4e9df", 0.10, 0.28)
    p = Parts()
    p.bind = "Head"
    build_shell(p, lacquer, edging, liner, stripe)
    helmet_mounts(p, edging, liner, band, rim)
    p.finish("Helmet", collection, armature=rig)
    p = Parts()
    p.bind = "Head"
    chinstrap(p, band, liner, rim)
    p.finish("Helmet_Chinstrap", collection, armature=rig)
    p = Parts()
    p.bind = "GoggleHinge"
    goggles(p, gasket, rim, band, glass, glint)
    p.finish("Helmet_Goggles", collection, armature=rig)
