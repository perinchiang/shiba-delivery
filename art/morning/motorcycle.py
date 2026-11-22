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


def rear_open_shell(parts, profiles, cap_start, cap_end, cap_start_z=1, cap_end_z=-1, band_y=0.745):
    """Sweep a rounded XY rectangle along Z for a rear-opening box or insulated hatch door."""
    rows = []
    for z, cy, hx, hy, r, axial_z, sign, paint in profiles:
        split_y = max(cy - hy + r + 0.002, min(cy + hy - r - 0.002, band_y))
        row = []
        row.append(parts.vertex((hx, split_y, z), (sign, 0, axial_z)))
        for quadrant, (sx, sy) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
            if quadrant == 2:
                row.append(parts.vertex((-hx, split_y, z), (-sign, 0, axial_z)))
            for j in range(8):
                theta = (quadrant + j / 7) * math.pi / 2
                dx, dy = math.cos(theta), math.sin(theta)
                point = (sx * (hx - r) + r * dx, cy + sy * (hy - r) + r * dy, z)
                row.append(parts.vertex(point, (sign * dx, sign * dy, axial_z)))
        rows.append(row)
    for i in range(len(rows) - 1):
        paint = profiles[i][7]
        for j in range(len(rows[i])):
            k = (j + 1) % len(rows[i])
            mid_y = 0.25 * (
                parts.p[rows[i][j]].y + parts.p[rows[i][k]].y
                + parts.p[rows[i + 1][k]].y + parts.p[rows[i + 1][j]].y
            )
            mat = paint(mid_y) if callable(paint) else paint
            parts.face((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]), mat)
    for row, axial, paint in [(rows[0], cap_start_z, cap_start), (rows[-1], cap_end_z, cap_end)]:
        rim = [parts.vertex(parts.p[i], (0, 0, axial), already_transformed=True) for i in row]
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
    # Plump, cushy retro scrambler bench with stitched tuck-and-roll bolsters and cream piping.
    # Top contact height at Seat_Contact (z = -0.213, y = 0.843 - SEAT_DROP) is preserved exactly.
    seat = [
        (-.655, .768, .052, .152), (-.63, .762, .080, .218),
        (-.54, .760, .084, .232), (-.43, .759, .085, .226),
        (-.32, .758, .083, .195), (-.21, .759, .084, .158),
        (-.13, .760, .081, .151), (-.085, .758, .070, .151),
        (-.066, .762, .046, .137),
    ]
    profile = [(z, h - SEAT_DROP, ry, rx) for z, h, ry, rx in seat]
    p.loft(profile, lambda y: m["SeatEdge"] if y > -.72 else m["Frame"], 4, 48, .65)

    def seat_section(target_z):
        for i in range(len(profile) - 1):
            z0, h0, ry0, rx0 = profile[i]
            z1, h1, ry1, rx1 = profile[i + 1]
            if z0 <= target_z <= z1:
                t = (target_z - z0) / (z1 - z0)
                return (
                    h0 + (h1 - h0) * t,
                    ry0 + (ry1 - ry0) * t,
                    rx0 + (rx1 - rx0) * t,
                )
        return profile[0][1:]

    # 5 sculpted stitched tuck-and-roll leather bolster ribs across the bench behind Seat_Contact.
    for rib_z in (-0.58, -0.505, -0.43, -0.355, -0.28):
        h, ry, rx = seat_section(rib_z)
        arc = []
        for k in range(15):
            u = -1 + 2 * k / 14
            a = math.pi / 2 + u * 0.92
            cx, cy = math.cos(a), math.sin(a)
            x = rx * math.copysign(abs(cx) ** 0.65, cx)
            y = h + ry * math.copysign(abs(cy) ** 0.65, cy)
            # Offset inward along local surface normal so the bolster crest rides +3mm proud evenly across the crown.
            nx, ny = cx / max(rx, 0.05), cy / max(ry, 0.04)
            inv = 1.0 / math.hypot(nx, ny)
            arc.append((x - nx * inv * 0.0092, y - ny * inv * 0.0092, rib_z))
        p.tube(arc, 0.0122, m["SeatEdge"], 12)
    # Recessed dark stitch seams framing each tuck-and-roll bolster from welt to welt.
    for seam_z in (-0.618, -0.542, -0.468, -0.392, -0.318):
        h, ry, rx = seat_section(seam_z)
        seam = []
        for k in range(15):
            u = -1 + 2 * k / 14
            a = math.pi / 2 + u * 0.96
            cx, cy = math.cos(a), math.sin(a)
            x = rx * math.copysign(abs(cx) ** 0.65, cx)
            y = h + ry * math.copysign(abs(cy) ** 0.65, cy)
            nx, ny = cx / max(rx, 0.05), cy / max(ry, 0.04)
            inv = 1.0 / math.hypot(nx, ny)
            seam.append((x - nx * inv * 0.0006, y - ny * inv * 0.0006, seam_z))
        p.tube(seam, 0.0028, m["Frame"], 8)
    # Crisp Cream piping welts riding continuously along both upper leather shoulders of the bench.
    welt_a = 0.46
    welt_cx = abs(math.cos(welt_a)) ** 0.65
    welt_cy = abs(math.sin(welt_a)) ** 0.65
    for side in (-1, 1):
        p.tube(
            [
                (side * (rx * welt_cx + 0.0025), h + ry * welt_cy + 0.0015, z)
                for z, h, ry, rx in profile
            ],
            0.0052,
            m["Cream"],
            10,
            3,
        )
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
    # Widened rear carrier shelf and rails supporting the 3-slot rear-opening courier box.
    p.box((0, 0.647, BOX_Z), (0.620, 0.042, 0.420), 0.018, m["Frame"])
    p.finish("Rack_Deck", collection, frame)
    p = Parts()
    for s in (-1, 1):
        p.tube(
            [(s * 0.125, 0.62, -0.42), (s * 0.210, 0.645, -0.81), (s * 0.210, 0.647, -1.048)],
            0.018,
            m["Steel"],
            12,
            3,
        )
    p.finish("Passenger_Frame_Platform", collection, frame)
    p = Parts()
    gold, honey, lining = m["Gold"], m["Honey"], m["Cream"]
    exterior = lambda y: honey if y < 0.745 else gold
    # 5-sided hollow rear-opening insulated courier box:
    # outer x in [-0.305, 0.305], y in [0.668, 1.080], z in [BOX_Z - 0.200, BOX_Z + 0.200]
    # inner x in [-0.282, 0.282], y in [0.696, 1.050], z in [BOX_Z - 0.200, BOX_Z + 0.178]
    rear_open_shell(
        p,
        [
            (BOX_Z + 0.200, 0.874, 0.270, 0.171, 0.025, 1.0, 0.2, exterior),
            (BOX_Z + 0.193, 0.874, 0.293, 0.194, 0.036, 0.55, 1.0, exterior),
            (BOX_Z + 0.176, 0.874, 0.305, 0.206, 0.042, 0.0, 1.0, exterior),
            (BOX_Z - 0.184, 0.874, 0.305, 0.206, 0.042, 0.0, 1.0, exterior),
            (BOX_Z - 0.198, 0.874, 0.300, 0.201, 0.038, -0.55, 1.0, exterior),
            (BOX_Z - 0.200, 0.874, 0.295, 0.196, 0.034, -1.0, 0.0, honey),
            (BOX_Z - 0.200, 0.873, 0.285, 0.181, 0.025, -1.0, 0.0, lining),
            (BOX_Z - 0.194, 0.873, 0.282, 0.177, 0.022, -0.2, -1.0, lining),
            (BOX_Z + 0.171, 0.873, 0.282, 0.177, 0.022, 0.0, -1.0, lining),
            (BOX_Z + 0.178, 0.873, 0.272, 0.167, 0.016, -1.0, -0.2, lining),
        ],
        gold,
        lining,
        cap_start_z=1,
        cap_end_z=-1,
    )
    # 2 low interior floor divider strips creating 3 neat meal compartments.
    for sx in (-1, 1):
        p.box((sx * 0.098, 0.714, BOX_Z - 0.008), (0.014, 0.036, 0.340), 0.005, honey)
        # Top-rear metallic hinge knuckles meeting the hinged hatch door.
        p.box((sx * 0.165, 1.073, BOX_Z - 0.194), (0.036, 0.020, 0.024), 0.005, m["Steel"])
    p.finish("Delivery_Box", collection, frame)
    p = Parts()
    for s in (-1, 1):
        x = s * 0.307
        p.box((x, 0.900, BOX_Z), (0.008, 0.125, 0.195), 0.004, m["Ivory"])
        p.tube(
            [
                (x + s * 0.006, 0.940, BOX_Z - 0.086),
                (x + s * 0.008, 0.890, BOX_Z),
                (x + s * 0.006, 0.940, BOX_Z + 0.086),
            ],
            0.006,
            m["Honey"],
            8,
        )
    p.finish("Box_Envelope_and_Clasp", collection, frame)
    # Top-rear hinged hatch door swinging upward & backward around +X.
    hinge = (0, 1.072, BOX_Z - 0.202)
    lid = empty("Cargo_Lid", collection, hinge, frame)
    lid["hingeAxis"] = "x"
    lid["openAngle"] = 2.65
    p = Parts()
    rear_open_shell(
        p,
        [
            (BOX_Z - 0.190, 0.873, 0.268, 0.164, 0.016, 1.0, 0.2, lining),
            (BOX_Z - 0.199, 0.873, 0.276, 0.172, 0.020, 0.2, 1.0, lining),
            (BOX_Z - 0.200, 0.873, 0.296, 0.193, 0.035, 1.0, 0.0, honey),
            (BOX_Z - 0.202, 0.873, 0.302, 0.199, 0.039, 0.2, 1.0, exterior),
            (BOX_Z - 0.212, 0.873, 0.302, 0.199, 0.039, 0.0, 1.0, exterior),
            (BOX_Z - 0.217, 0.873, 0.294, 0.191, 0.034, -0.6, 1.0, exterior),
            (BOX_Z - 0.218, 0.873, 0.278, 0.175, 0.024, -1.0, 0.0, gold),
        ],
        lining,
        gold,
        cap_start_z=1,
        cap_end_z=-1,
    )
    # Matching lower Honey trim strip, rear envelope emblem, DeepTeal latch handle, and hinge straps on the hatch.
    back = BOX_Z - 0.219
    p.box((0, 0.713, back + 0.002), (0.548, 0.062, 0.007), 0.003, honey)
    p.box((0, 0.916, back), (0.240, 0.132, 0.010), 0.004, m["Ivory"])
    p.tube(
        [(-0.108, 0.962, back - 0.007), (0, 0.903, back - 0.008), (0.108, 0.962, back - 0.007)],
        0.0065,
        m["Honey"],
        8,
    )
    p.box((0, 0.768, back - 0.004), (0.120, 0.038, 0.022), 0.008, m["DeepTeal"])
    p.box((0, 0.768, back - 0.014), (0.072, 0.014, 0.010), 0.004, m["Steel"])
    for sx in (-1, 1):
        p.box((sx * 0.165, 1.056, back + 0.003), (0.032, 0.030, 0.016), 0.005, m["Steel"])
    p.finish("Lid_Shell", collection, lid, origin=hinge)
    marker("Cargo_Floor", (0, 0.696, BOX_Z))
    marker("Cargo_Approach", (0.78, 0, BOX_Z - 0.96))
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
