"""Compact Monkey-inspired motorcycle. Start with the rider contact triangle and delivery box."""

import math
from mathutils import Quaternion
from forms import Parts as MeshParts, V, X, UP, Z, TAU, empty as make_empty, material, spline
from riding_fit import CHASSIS_DROP, FRAME_KNEE, WHEEL_RATIO, STAND_LEAN, RIDER_ORIGIN, SEAT_DROP, footrest, grip, palm

FRONT = 0.675
REAR = -0.891
AXLE = 0.317
BOX_Z = -0.867
PALETTE = {}
# The side stand is authored directly in the final, lowered bike space.
STAND_PARTS = ("Stand_Hinge", "Stand_Leg_and_Tang", "Side_Stand", "Stand_Axis", "Stand_Toe", "Stand_Foot")


def chassis_height(height):
    """Scale the chassis below the frame knee with the wheels; shift the rest down rigidly."""
    return height - min(height, FRAME_KNEE) * (1 - WHEEL_RATIO)


def chassis_point(point, part):
    p = V(point)
    if part not in STAND_PARTS:
        p.y = chassis_height(p.y)
    return p


def empty(name, collection, pos=(0, 0, 0), parent=None, size=.05):
    if name == "Seat_Rider":
        position = V(pos) - UP * CHASSIS_DROP
    else:
        position = chassis_point(pos, name)
    return make_empty(name, collection, position, parent, size)


class Parts(MeshParts):
    """Fit the lowered chassis around two smaller wheels."""
    def finish(self, name, collection, parent=None, origin=(0, 0, 0)):
        hub = V(origin)
        wheel = name in ("Front_Wheel_Mesh", "Rear_Wheel_Mesh")
        for i, pt in enumerate(self.p):
            normal = self.n[i].copy()
            if wheel:
                delta = pt - hub
                self.p[i] = chassis_point(hub, name) + V((delta.x, delta.y * WHEEL_RATIO, delta.z * WHEEL_RATIO))
                normal.z /= WHEEL_RATIO
                normal.y /= WHEEL_RATIO
            elif name == "Motor":
                # Keep the crankcase circular inside the compact cradle.
                scale = 0.88
                self.p[i] = V((
                    pt.x * 0.94,
                    (FRAME_KNEE - CHASSIS_DROP) + (pt.y - FRAME_KNEE) * scale,
                    0.035 + (pt.z - 0.035) * scale,
                ))
                normal.x /= 0.94
                normal.y /= scale
                normal.z /= scale
            elif name not in STAND_PARTS:
                self.p[i] = chassis_point(pt, name)
                # Inverse-transpose the normal through the change in height.
                if pt.y < FRAME_KNEE:
                    normal.y /= WHEEL_RATIO
            self.n[i] = normal.normalized()
        return super().finish(name, collection, parent=parent, origin=chassis_point(hub, name))


def paints():
    for key, hex_code, metal, rough in [
        ("Mint", "53aa9b", 0.05, 0.64),
        ("DeepTeal", "25584f", 0.10, 0.68),
        ("Cream", "f1d5a0", 0, 0.8),
        ("SeatEdge", "9b7650", 0, 0.73),
        ("Steel", "bfcbc2", 0.33, 0.54),
        ("Pewter", "6a7978", 0.30, 0.56),
        ("Rubber", "30383b", 0, 0.87),
        ("Tread", "374041", 0, 0.85),
        ("Frame", "354445", 0.12, 0.72),
        ("Gold", "f0b856", 0.01, 0.68),
        ("Honey", "d39545", 0.05, 0.67),
        ("Lamp", "ffe29a", 0, 0.4),
        ("Rust", "ba6750", 0.12, 0.56),
        ("Ivory", "ffeaca", 0.01, 0.68),
    ]:
        PALETTE[key] = material("Bike · " + key, hex_code, metal, rough)
    return PALETTE


def cargo_shell(parts, profiles, z, cap_bottom, cap_top):
    """Sweep a rounded rectangle through the base, soft wall, rim and lining."""
    rows = []
    for y, hx, hz, r, vertical, sign, paint in profiles:
        row = []
        for quadrant, (sx, sz) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
            for j in range(8):
                theta = (quadrant + j / 7) * math.pi / 2
                dx, dz = math.cos(theta), math.sin(theta)
                point = (sx * (hx - r) + r * dx, y, z + sz * (hz - r) + r * dz)
                row.append(parts.vertex(point, (sign * dx, vertical, sign * dz)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(len(rows[i])):
            k = (j + 1) % len(rows[i])
            parts.face((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]), profiles[i][6])
    for row, vertical, paint in [(rows[0], -1, cap_bottom), (rows[-1], 1, cap_top)]:
        rim = [parts.vertex(parts.p[i], (0, vertical, 0)) for i in row]
        parts.face(tuple(rim), paint)


def equipment(collection):
    m = paints()
    root = empty("Motorcycle", collection, size=0.13)
    frame = empty("Frame", collection, parent=root)
    steering = empty("Steering", collection, (0, 1.267, 0.150), root)
    front = empty("Wheel_F", collection, (0, AXLE, FRONT), steering)
    rear = empty("Wheel_R", collection, (0, AXLE, REAR), frame)

    def marker(n, p, parent=frame):
        return empty(n, collection, p, parent, 0.027)

    marker("SteerAxisLower", (0, 0.89, 0.345), steering)
    marker("Seat_Rider", RIDER_ORIGIN)
    marker("Seat_Contact", (0, 0.843 - SEAT_DROP, -0.213))
    for s, t in [(-1, "L"), (1, "R")]:
        marker("Grip_" + t, grip(s), steering)
        marker("PalmTarget_" + t, palm(s), steering)
        marker("Footrest_" + t, footrest(s))
    # Sculpt the three interfaces before building the chassis around them.
    p = Parts()
    # A full-length upholstered motorcycle cushion with a welt and flat mounting pan.
    # The hidden inner foam gives slightly under the thighs at the rider station.
    seat = [
        (-.655, .786, .035, .139), (-.63, .786, .058, .206),
        (-.54, .784, .063, .218), (-.43, .783, .064, .211),
        (-.32, .781, .062, .190), (-.21, .781, .062, .158),
        (-.13, .782, .059, .151), (-.085, .780, .048, .151),
        (-.066, .776, .032, .137),
    ]
    profile = [(z, h - SEAT_DROP, ry, rx) for z, h, ry, rx in seat]
    p.loft(profile, lambda y: m["SeatEdge"] if y > -.62 else m["Frame"], 4, 48, .65)
    for side in (-1, 1):
        p.tube([(side * (rx - .001), h - .009, z) for z, h, ry, rx in profile],
               .0045, m["Cream"], 10, 3)
    p.finish("Solo_Saddle", collection, frame)
    p = Parts()
    for s in (-1, 1):
        x, y, z = footrest(s)
        p.tube(
            [
                (s * 0.085, 0.416, z - 0.068),
                (s * 0.140, y - 0.065, z - 0.036),
                (s * 0.176, y - 0.027, z),
                (x, y - 0.027, z),
            ],
            0.017,
            m["Pewter"],
            12,
            3,
        )
        p.box((x, y - 0.022, z), (0.162, 0.043, 0.102), 0.019, m["DeepTeal"])
        for dx in (-0.052, -0.026, 0, 0.026, 0.052):
            p.box((x + dx, y - 0.0015, z), (0.010, 0.003, 0.078), 0.0013, m["Frame"])
    p.finish("Rider_Footpegs", collection, frame)
    p = Parts()
    for s in (-1, 1):
        middle = grip(s)
        sweep = V((s * 0.065, -0.010, -0.049))
        start, end = middle - sweep, middle + sweep
        p.tube(
            [
                (s * 0.050, 1.158, 0.185),
                (s * 0.111, 1.184, 0.177),
                (s * 0.165, 1.189, 0.162),
                (s * 0.212, 1.170, 0.138),
                start,
            ],
            0.023,
            m["Steel"],
            14,
            4,
        )
        p.tube([start, end], 0.037, m["DeepTeal"], 18)
        for f in (0.12, 0.28, 0.44, 0.60, 0.76, 0.92):
            p.tube([start.lerp(end, f - 0.023), start.lerp(end, f + 0.023)], 0.0385, m["Frame"], 16)
        for tip in [start, end]:
            p.oval(tip, (0.037, 0.037, 0.037), m["DeepTeal"], 16, 10)
    p.finish("Swept_Handlebar", collection, steering, origin=(0, 1.267, 0.150))
    p = Parts()
    # At the original passenger station: shelf and box stay inside the rear tyre envelope.
    p.box((0, 0.647, BOX_Z), (0.455, 0.041, 0.390), 0.018, m["Frame"])
    p.finish("Rack_Deck", collection, frame)
    p = Parts()
    for s in (-1, 1):
        p.tube(
            [(s * 0.120, 0.62, -0.42), (s * 0.165, 0.645, -0.81), (s * 0.165, 0.647, -1.048)],
            0.018,
            m["Steel"],
            12,
            3,
        )
    p.finish("Passenger_Frame_Platform", collection, frame)
    p = Parts()
    gold, honey, lining = m["Gold"], m["Honey"], m["Cream"]
    cargo_shell(
        p,
        [
            (0.668, 0.218, 0.176, 0.033, -1, 1, honey),
            (0.675, 0.229, 0.186, 0.039, -0.55, 1, honey),
            (0.691, 0.238, 0.194, 0.044, 0, 1, gold),
            (1.098, 0.238, 0.194, 0.044, 0, 1, gold),
            (1.117, 0.235, 0.192, 0.043, 0.5, 1, gold),
            (1.120, 0.224, 0.181, 0.035, 1, -1, lining),
            (1.110, 0.222, 0.178, 0.029, 0.1, -1, lining),
            (0.699, 0.222, 0.178, 0.029, 0, -1, lining),
            (0.689, 0.214, 0.172, 0.025, 1, -1, lining),
        ],
        BOX_Z,
        honey,
        lining,
    )
    p.finish("Delivery_Box", collection, frame)
    p = Parts()
    for s in (-1, 1):
        x = s * 0.239
        p.box((x, 0.927, BOX_Z), (0.008, 0.130, 0.190), 0.004, m["Ivory"])
        p.tube(
            [
                (x + s * 0.006, 0.967, BOX_Z - 0.083),
                (x + s * 0.008, 0.917, BOX_Z),
                (x + s * 0.006, 0.967, BOX_Z + 0.083),
            ],
            0.006,
            m["Honey"],
            8,
        )
    back = BOX_Z - 0.196
    p.box((0, 0.905, back), (0.195, 0.120, 0.010), 0.004, m["Ivory"])
    p.tube(
        [(-0.089, 0.947, back - 0.007), (0, 0.894, back - 0.008), (0.089, 0.947, back - 0.007)],
        0.006,
        m["Honey"],
        8,
    )
    p.box((0, 1.064, back - 0.002), (0.055, 0.048, 0.018), 0.006, m["DeepTeal"])
    p.finish("Box_Envelope_and_Clasp", collection, frame)
    lid = empty("Cargo_Lid", collection, (0.237, 1.122, BOX_Z), frame)
    p = Parts()
    cargo_shell(
        p,
        [
            (1.119, 0.234, 0.190, 0.042, -1, 1, honey),
            (1.124, 0.243, 0.197, 0.046, -0.3, 1, honey),
            (1.131, 0.244, 0.197, 0.046, 0, 1, gold),
            (1.146, 0.241, 0.194, 0.045, 0.55, 1, gold),
            (1.154, 0.227, 0.184, 0.042, 1, 1, gold),
        ],
        BOX_Z,
        honey,
        gold,
    )
    p.finish("Lid_Shell", collection, lid, origin=(0.237, 1.122, BOX_Z))
    marker("Cargo_Floor", (0, 0.689, BOX_Z))
    marker("Cargo_Approach", (-0.77, 0, BOX_Z + 0.44))
    # Left side stand, modelled deployed on the street at STAND_LEAN.
    # A canted hinge folds the leg horizontally back under the left swingarm
    # while bringing its heel tang just behind the left footpeg.
    pivot = V((0.155, 0.345, -0.300))
    pad_contact = V((0.340, 0.340 * math.tan(STAND_LEAN), -0.380))
    pad_rot = Quaternion(Z, STAND_LEAN)
    pad_center = pad_contact + pad_rot @ (UP * 0.012)
    deployed_dir = (pad_center - pivot).normalized()
    stowed_dir = V((0.030, -0.025, -0.330)).normalized()
    stand_axis = deployed_dir.cross(stowed_dir).normalized()
    stow_angle = math.acos(max(-1.0, min(1.0, deployed_dir.dot(stowed_dir))))
    stand = empty("Side_Stand", collection, pivot, frame)
    stand["stowAngle"] = stow_angle
    stand["leanAngle"] = STAND_LEAN
    marker("Stand_Axis", pivot + stand_axis * 0.20, stand)
    marker("Stand_Foot", pad_contact, stand)
    p = Parts()
    p.tube([(0.095, 0.345, -0.300), pivot + X * 0.022], 0.026, m["Pewter"], 16)
    p.finish("Stand_Hinge", collection, frame)
    p = Parts()
    p.tube([pivot, (0.245, 0.215, -0.335), pad_center + UP * 0.008], 0.016, m["Steel"], 14, 3)
    p.oval(pivot + X * 0.014, (0.022, 0.022, 0.022), m["Pewter"], 14, 10)
    p.box(pad_center, (0.088, 0.024, 0.104), 0.008, m["Frame"], rot=pad_rot)
    tang = V((0.288, 0.502, -0.352))
    p.tube([(0.175, 0.355, -0.315), (0.235, 0.440, -0.345), tang], 0.011, m["Pewter"], 12, 3)
    p.box(tang, (0.056, 0.022, 0.044), 0.008, m["DeepTeal"])
    p.finish("Stand_Leg_and_Tang", collection, stand, origin=pivot)
    marker("Stand_Toe", tang + UP * 0.011, stand)
    return root, frame, steering, front, rear


def detail(collection, assembly):
    from motorcycle_detail import build

    build(collection, assembly, PALETTE)
