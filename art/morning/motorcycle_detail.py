"""Monkey silhouette: balloon tyres, saddle/tank seam, raked twins, exposed motor and shocks."""

import math
from mathutils import Quaternion
from forms import Parts, V, X, UP, Z, TAU
from motorcycle import AXLE, FRONT, REAR, BOX_Z
from riding_fit import SEAT_DROP


def tyre(collection, parent, z, m):
    p = Parts()
    c = V((0, AXLE, z))
    p.torus(c, 0.245, 0.069, 0.097, m["Rubber"], 64, 18)
    for side in (-1, 1):
        # The small tread islands sit in two staggered rows and follow the crown.
        for i in range(30):
            a = TAU * (i + (0.35 if side > 0 else 0)) / 30
            axis = V((0, math.cos(a), math.sin(a)))
            q = Quaternion(X, a) @ Quaternion(UP, side * 0.39)
            p.oval(c + axis * 0.308 + X * (side * 0.041), (0.039, 0.007, 0.027), m["Tread"], 8, 4, q)
        p.torus(c + X * (side * 0.080), 0.240, 0.005, 0.003, m["Tread"], 52, 8)
    p.torus(c, 0.181, 0.018, 0.058, m["DeepTeal"], 50, 12)
    p.torus(c, 0.195, 0.011, 0.063, m["Steel"], 50, 10)
    p.tube([c - X * 0.069, c + X * 0.069], 0.050, m["Pewter"], 24)
    for s in (-1, 1):
        for i in range(5):
            a = TAU * i / 5 + 0.15

            def pt(r, angle, x):
                return c + V((s * x, r * math.cos(angle), r * math.sin(angle)))

            p.tube(
                [pt(0.044, a, 0.059), pt(0.106, a + 0.080, 0.047), pt(0.178, a + 0.22, 0.041)],
                lambda t: 0.019 - 0.006 * t,
                m["Steel"],
                9,
                2,
            )
            p.tube([pt(0.107, a + 0.080, 0.046), pt(0.174, a - 0.130, 0.041)], 0.008, m["Pewter"], 8)
        p.oval(c + X * (s * 0.074), (0.021, 0.037, 0.037), m["Steel"], 16, 10)
    # Slim ventilated disc inside the near fork leg, with alternating mounting pins.
    off = c - X * 0.073
    p.torus(off, 0.119, 0.014, 0.006, m["Steel"], 44, 10)
    for i in range(6):
        a = i * TAU / 6
        p.tube(
            [
                off + V((0, 0.043 * math.cos(a), 0.043 * math.sin(a))),
                off + V((0, 0.111 * math.cos(a + 0.28), 0.111 * math.sin(a + 0.28))),
            ],
            0.008,
            m["Pewter"],
            8,
        )
    p.finish("Front_Wheel_Mesh" if z == FRONT else "Rear_Wheel_Mesh", collection, parent, origin=c)


def fender(parts, z, radius, a0, a1, width, mat):
    # A rolled sheet with a curved transverse crown, open underneath the wheel.
    g = []
    for i in range(29):
        a = math.radians(a0 + (a1 - a0) * i / 28)
        radial = V((0, math.cos(a), math.sin(a)))
        row = []
        for j in range(15):
            b = TAU * j / 14
            x = width * math.cos(b)
            r = radius + 0.014 * math.sin(b) - 0.022 * math.cos(b) ** 2
            n = (X * (0.18 * math.cos(b)) + radial * math.sin(b)).normalized()
            row.append(parts.vertex(V((0, AXLE, z)) + radial * r + X * x, n))
        g.append(row)
    for i in range(len(g) - 1):
        for j in range(14):
            parts.face((g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j]), mat)
    for row in [g[0], g[-1]]:
        parts.face(tuple(row[:-1]), mat)


def spring(parts, a, b, mat):
    a, b = V(a), V(b)
    axis = (b - a).normalized()
    cross = axis.cross(X).normalized()
    path = []
    for i in range(56):
        t = i / 55
        theta = TAU * t * 6
        path.append(a.lerp(b, t) + (X * math.cos(theta) + cross * math.sin(theta)) * 0.029)
    parts.tube(path, 0.0075, mat, 8)


def exhaust(collection, frame, m):
    p = Parts()
    # Follow the cylinder down and then outside the swingarm, below the rider's boot.
    p.tube(
        [
            (-0.071, 0.587, 0.185),
            (-0.112, 0.549, 0.226),
            (-0.136, 0.441, 0.239),
            (-0.143, 0.365, 0.156),
            (-0.147, 0.353, -0.050),
            (-0.156, 0.392, -0.213),
            (-0.169, 0.473, -0.356),
        ],
        0.027,
        m["Pewter"],
        16,
        6,
    )
    a, b = V((-0.166, 0.466, -0.329)), V((-0.221, 0.559, -0.965))
    axis = (b - a).normalized()
    outward = (-X + axis * X.dot(axis)).normalized()
    top = axis.cross(outward).normalized()
    # Turn the rolled metal lip back into a recessed, genuinely open outlet.
    profile = [
        (0, 0.028, 0.028, m["Pewter"]),
        (0.080, 0.043, 0.047, m["Steel"]),
        (0.145, 0.054, 0.060, m["Steel"]),
        (0.195, 0.056, 0.062, m["Pewter"]),
        (0.78, 0.056, 0.063, m["Pewter"]),
        (0.84, 0.056, 0.063, m["Steel"]),
        (0.90, 0.054, 0.059, m["Steel"]),
        (0.97, 0.048, 0.051, m["Pewter"]),
        (0.995, 0.048, 0.050, m["Steel"]),
        (1.0, 0.043, 0.046, m["Steel"]),
        (1.0, 0.034, 0.036, m["Frame"]),
        (0.980, 0.030, 0.032, m["Frame"]),
        (0.894, 0.028, 0.030, m["Rubber"]),
    ]
    rings = []
    for i, (t, w, h, mat) in enumerate(profile):
        row = []
        for j in range(36):
            phase = TAU * j / 36
            normal = outward * math.cos(phase) + top * math.sin(phase)
            if i >= 10:
                normal = -normal
            if 8 <= i <= 10:
                normal = (axis + normal * 0.35).normalized()
            row.append(
                p.vertex(a.lerp(b, t) + outward * (w * math.cos(phase)) + top * (h * math.sin(phase)), normal)
            )
        if rings:
            for j in range(len(row)):
                k = (j + 1) % len(row)
                p.face((rings[-1][j], rings[-1][k], row[k], row[j]), mat)
        rings.append(row)
    p.face(tuple(p.vertex(p.p[k], axis) for k in rings[-1]), m["Rubber"])

    def guard(t, angle):
        return a.lerp(b, t) + outward * (0.062 * math.cos(angle)) + top * (0.071 * math.sin(angle))

    rows = []
    for i in range(21):
        t = i / 20
        # Narrow softly at both ends; leave the silver outlet in full view.
        extent = 0.90 - 0.26 * abs(2 * t - 1) ** 4
        row = []
        for j in range(11):
            angle = 0.22 + (j / 5 - 1) * extent
            row.append(
                p.vertex(guard(0.17 + 0.63 * t, angle), outward * math.cos(angle) + top * math.sin(angle))
            )
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(len(rows[i]) - 1):
            p.face((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]), m["Steel"])
    for t in (0.32, 0.41, 0.50, 0.59):
        p.tube([guard(t + 0.024, -0.38), guard(t, 0.10), guard(t - 0.020, 0.53)], 0.006, m["Pewter"], 8, 3)
    for t in (0.22, 0.744):
        p.oval(guard(t, 0.10), (0.009, 0.010, 0.010), m["Frame"], 12, 8)
    p.tube([(-0.117, 0.627, -0.667), (-0.168, 0.588, -0.680), (-0.203, 0.551, -0.682)], 0.013, m["Frame"], 10)
    p.finish("High_Side_Exhaust", collection, frame)


def build(collection, assembly, m):
    root, frame, steering, front, rear = assembly
    for node, z in [(front, FRONT), (rear, REAR)]:
        tyre(collection, node, z, m)
    p = Parts()
    for s in (-1, 1):
        # Main down tube and lower cradle, triangular rear subframe and short swingarm.
        p.tube(
            [
                (s * 0.070, 0.927, 0.386),
                (s * 0.075, 0.735, 0.415),
                (s * 0.103, 0.420, 0.282),
                (s * 0.100, 0.321, 0.10),
                (s * 0.100, 0.325, -0.214),
                (s * 0.093, 0.495, -0.344),
                (s * 0.085, 0.725, -0.385),
            ],
            0.023,
            m["Frame"],
            12,
            4,
        )
        p.tube(
            [
                (s * 0.07, 0.942, 0.35),
                (s * 0.065, 0.800, 0.075),
                (s * 0.095, 0.707, -0.337),
                (s * 0.12, 0.641, -0.684),
            ],
            0.029,
            m["DeepTeal"],
            12,
            3,
        )
        p.tube(
            [(s * 0.10, 0.465, -0.223), (s * 0.122, 0.630, -0.656), (s * 0.130, 0.653, -0.920)],
            0.021,
            m["Frame"],
            12,
            3,
        )
        p.tube(
            [(s * 0.11, 0.707, -0.331), (s * 0.13, 0.646, -0.674), (s * 0.10, 0.495, -0.337)],
            0.015,
            m["Steel"],
            10,
        )
        p.tube(
            [(s * 0.119, 0.447, -0.195), (s * 0.144, 0.374, -0.577), (s * 0.134, 0.317, REAR)],
            0.028,
            m["Pewter"],
            12,
            3,
        )
        ax = V((s * 0.135, 0.323, REAR + 0.030))
        top = V((s * 0.152, 0.640, -0.660))
        p.tube([ax, top], 0.015, m["Steel"], 11)
        p.tube([ax.lerp(top, 0.10), ax.lerp(top, 0.31)], 0.024, m["DeepTeal"], 12)
        spring(p, ax.lerp(top, 0.25), ax.lerp(top, 0.87), m["Rust"])
        for point in [ax, top]:
            p.oval(point, (0.030, 0.026, 0.026), m["Steel"], 14, 8)
    for s in (-1, 1):
        p.tube(
            [
                (s * 0.064, 0.912, 0.381),
                (s * 0.071, 0.806, 0.171),
                (s * 0.073, 0.765, -0.072),
                (s * 0.087, 0.740, -0.304),
            ],
            0.023,
            m["DeepTeal"],
            12,
            3,
        )
        p.tube(
            [(s * 0.061, 0.826, 0.297), (s * 0.07, 0.718, 0.171), (s * 0.070, 0.617, 0.129)],
            0.024,
            m["Frame"],
            12,
            3,
        )
    p.box((0, 0.702 - SEAT_DROP / 2, -0.32), (0.220, 0.088, 0.270), 0.034, m["DeepTeal"])
    p.box((0, 0.751 - SEAT_DROP, -0.33), (0.217, 0.050, 0.267), 0.020, m["SeatEdge"])
    fender(p, REAR, 0.340, -78, 54, 0.110, m["Mint"])
    p.oval((0, 0.598, -1.052), (0.061, 0.032, 0.030), m["Rust"])
    for s in (-1, 1):
        p.oval((s * 0.118, 0.599, -1.026), (0.027, 0.021, 0.026), m["Gold"], 16, 10)
    p.finish("Chassis_and_Rear_Suspension", collection, frame)

    p = Parts()
    # Three distinct masses in side view: solo saddle, two-tone fuel-tank form and headstock.
    tank = [
        (-0.072, 0.830, 0.018, 0.018),
        (-0.028, 0.861, 0.052, 0.052),
        (0.045, 0.891, 0.092, 0.093),
        (0.140, 0.907, 0.126, 0.151),
        (0.266, 0.919, 0.155, 0.185),
        (0.364, 0.922, 0.146, 0.175),
        (0.420, 0.905, 0.113, 0.137),
        (0.455, 0.883, 0.063, 0.075),
        (0.463, 0.880, 0.018, 0.021),
    ]
    p.loft(tank, lambda h: m["Ivory"] if h > 0.20 else m["Mint"], 5, 48, 0.78)
    p.oval((0, 1.070, 0.247), (0.035, 0.009, 0.042), m["Pewter"], 16, 8)
    for s in (-1, 1):
        p.oval((s * 0.175, 0.958, 0.272), (0.012, 0.038, 0.045), m["DeepTeal"], 22, 13)
        p.oval((s * 0.186, 0.958, 0.272), (0.005, 0.027, 0.033), m["Ivory"], 22, 12)
        p.tube(
            [(s * 0.192, 0.956, 0.253), (s * 0.192, 0.949, 0.267), (s * 0.192, 0.971, 0.286)],
            0.004,
            m["Mint"],
            7,
        )
    p.finish("Two_Tone_Tank", collection, frame)
    # Rounded tool/battery cover within the backbone. The rear of the tank stays narrow between the knees.
    p = Parts()
    p.loft(
        [
            (-0.492, 0.658, 0.018, 0.072),
            (-0.393, 0.670, 0.056, 0.113),
            (-0.243, 0.662, 0.074, 0.123),
            (-0.050, 0.662, 0.084, 0.110),
            (0.110, 0.698, 0.087, 0.109),
            (0.227, 0.721, 0.049, 0.077),
            (0.252, 0.717, 0.017, 0.042),
        ],
        m["DeepTeal"],
        5,
        36,
        0.71,
    )
    p.finish("Side_Covers", collection, frame)
    p = Parts()
    # Motor and crankcase tucked into the cradle, clear of the boots on the two side pegs.
    p.oval((0, 0.475, 0.035), (0.113, 0.128, 0.142), m["Pewter"])
    p.box((0, 0.612, 0.132), (0.161, 0.166, 0.185), 0.036, m["Frame"])
    for h in (0.565, 0.594, 0.624, 0.652):
        p.box((0, h, 0.135), (0.179, 0.017, 0.193), 0.008, m["Pewter"])
    for s in (-1, 1):
        p.oval((s * 0.099, 0.478, 0.027), (0.039, 0.096, 0.103), m["Steel"], 25, 16)
        p.oval((s * 0.131, 0.480, 0.032), (0.011, 0.069, 0.077), m["Pewter"], 24, 14)
        p.oval((s * 0.139, 0.481, 0.032), (0.005, 0.051, 0.058), m["Steel"], 22, 14)
        for i in range(4):
            a = 0.48 + TAU * i / 4
            p.oval(
                (s * 0.128, 0.478 + 0.081 * math.cos(a), 0.027 + 0.085 * math.sin(a)),
                (0.008, 0.009, 0.009),
                m["Frame"],
                10,
                6,
            )
    p.box((0, 0.693, 0.182), (0.173, 0.102, 0.163), 0.035, m["DeepTeal"])
    p.finish("Motor", collection, frame)
    exhaust(collection, frame, m)

    p = Parts()
    for s in (-1, 1):
        base = V((s * 0.131, AXLE, FRONT))
        crown = V((s * 0.125, 1.040, 0.315))
        p.tube([base, crown], 0.023, m["Steel"], 14)
        p.tube([base.lerp(crown, 0.12), base.lerp(crown, 0.44)], 0.031, m["Pewter"], 14)
        p.tube([base.lerp(crown, 0.45), crown], 0.037, m["Mint"], 16)
        p.tube([base.lerp(crown, 0.48), base.lerp(crown, 0.52)], 0.041, m["DeepTeal"], 14)
        p.oval(base, (0.026, 0.046, 0.035), m["Steel"], 18, 12)
        p.oval((s * 0.156, 0.689, 0.490), (0.012, 0.029, 0.021), m["Gold"], 15, 9)
    for y, z in [(0.924, 0.376), (1.026, 0.326)]:
        p.box((0, y, z), (0.300, 0.043, 0.076), 0.018, m["Pewter"])
    p.tube([(0, 0.914, 0.377), (0, 1.097, 0.287), (0, 1.170, 0.184)], 0.047, m["DeepTeal"], 14)
    p.tube([(-0.051, 1.158, 0.185), (0.051, 1.158, 0.185)], 0.022, m["Steel"], 14)
    fender(p, FRONT, 0.381, -48, 59, 0.116, m["Ivory"])
    for s in (-1, 1):
        p.tube([(s * 0.122, 0.486, 0.592), (s * 0.103, 0.626, 0.774)], 0.010, m["Pewter"], 9)
    # Separate round headlamp bucket, bezel and domed warm lens. Round instrument on top.
    p.oval((0, 1.002, 0.405), (0.132, 0.126, 0.112), m["DeepTeal"])
    p.tube([(0, 1.006, 0.454), (0, 1.006, 0.496)], 0.116, m["Steel"], 36)
    p.oval((0, 1.006, 0.496), (0.103, 0.103, 0.030), m["Lamp"], 32, 18)
    p.oval((-0.033, 1.040, 0.519), (0.034, 0.010, 0.008), m["Ivory"], 14, 8)
    p.oval((0.025, 1.133, 0.301), (0.064, 0.043, 0.062), m["Frame"], 20, 12)
    p.oval((0.025, 1.164, 0.292), (0.049, 0.014, 0.050), m["Cream"], 18, 10)
    for s in (-1, 1):
        p.tube(
            [(s * 0.197, 1.177, 0.147), (s * 0.302, 1.269, 0.254), (s * 0.408, 1.357, 0.362)],
            0.013,
            m["Pewter"],
            12,
            3,
        )
        p.oval((s * 0.422, 1.373, 0.369), (0.062, 0.049, 0.026), m["Mint"], 22, 14, Quaternion(Z, s * 0.19))
        p.oval((s * 0.422, 1.374, 0.348), (0.051, 0.039, 0.009), m["Steel"], 20, 12, Quaternion(Z, s * 0.19))
        p.tube(
            [(s * 0.197, 1.177, 0.147), (s * 0.18, 1.150, 0.214), (s * 0.119, 1.068, 0.260)],
            0.006,
            m["Frame"],
            8,
            3,
        )
    p.finish("Fork_Headlamp_and_Mirrors", collection, steering, origin=(0, 1.267, 0.15))
