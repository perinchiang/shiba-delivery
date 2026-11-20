"""Rounded modelling tools. Artist coordinates are X across, Y up, +Z forward.
Blender meshes use (x, -z, y); glTF's standard Y-up export reverses this once.
"""

import math
import bpy
from mathutils import Vector, Quaternion

V = Vector
TAU = math.tau
UP = V((0, 1, 0))
X = V((1, 0, 0))
Z = V((0, 0, 1))
ZERO = V((0, 0, 0))


def blender_v(p):
    return V((p[0], -p[2], p[1]))


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color(hex_code):
    return tuple(linear(int(hex_code[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


def material(name, hex_code, metallic=0.0, roughness=0.72):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color(hex_code)
    m.use_nodes = True
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = m.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return m


def smooth(a, b, v):
    t = max(0, min(1, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def spline(points, steps):
    pts = [V(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        a, b, c, d = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for k in range(steps):
            t = k / steps
            out.append(
                (
                    2 * b
                    + (-a + c) * t
                    + (2 * a - 5 * b + 4 * c - d) * t * t
                    + (-a + 3 * b - 3 * c + d) * t * t * t
                )
                * 0.5
            )
    return out + [pts[-1]]


def empty(name, collection, pos=(0, 0, 0), parent=None, size=0.05):
    o = bpy.data.objects.new(name, None)
    collection.objects.link(o)
    o.parent = parent
    o.location = blender_v(pos) - (parent.matrix_world.translation if parent else ZERO)
    o.empty_display_type = "PLAIN_AXES"
    o.empty_display_size = size
    bpy.context.view_layer.update()
    return o


class Parts:
    """One editable mesh per art component, with material slots and optional skin weights."""

    def __init__(self):
        self.p, self.n, self.uv, self.weights = [], [], [], []
        self.faces, self.mat_ids, self.mats = [], [], []
        self.bind = None

    def vertex(self, pos, normal, uv=(0, 0)):
        p, n = V(pos), V(normal).normalized()
        self.p.append(p)
        self.n.append(n)
        self.uv.append(uv)
        w = self.bind(p) if callable(self.bind) else self.bind
        self.weights.append({w: 1.0} if isinstance(w, str) else w)
        return len(self.p) - 1

    def face(self, idx, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        a, b, c = [self.p[i] for i in idx[:3]]
        if (b - a).cross(c - a).dot(sum((self.n[i] for i in idx), ZERO.copy())) < 0:
            idx = tuple(reversed(idx))
        self.faces.append(idx)
        self.mat_ids.append(self.mats.index(mat))

    def oval(self, center, radii, mat, seg=28, rings=18, rot=None, lower=-math.pi / 2, upper=math.pi / 2):
        c = V(center)
        rx, ry, rz = radii
        grid = []
        for j in range(rings + 1):
            v = j / rings
            lat = lower + (upper - lower) * v
            row = []
            for k in range(seg + 1):
                u = k / seg
                a = (u - 0.5) * TAU
                x, y, z = math.sin(a) * math.cos(lat), math.sin(lat), math.cos(a) * math.cos(lat)
                point = V((rx * x, ry * y, rz * z))
                n = V((x / rx, y / ry, z / rz)).normalized()
                if rot:
                    point = rot @ point
                    n = rot @ n
                row.append(self.vertex(c + point, n, (u, v)))
            grid.append(row)
        for j in range(rings):
            for i in range(seg):
                a, b, c0, d = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
                if j == 0 and lower <= -math.pi / 2:
                    self.face((a, c0, d), mat)
                elif j == rings - 1 and upper >= math.pi / 2:
                    self.face((a, b, c0), mat)
                else:
                    self.face((a, b, c0, d), mat)

    def box(self, center, dims, radius, mat, rot=None):
        c, half = V(center), V(dims) * 0.5
        rad = max(0.0002, min(radius, min(half) * 0.98))

        def seq(h):
            return [-h, -h + 0.35 * rad, -h + rad, h - rad, h - 0.35 * rad, h]

        for axis in range(3):
            a, b = (axis + 1) % 3, (axis + 2) % 3
            for sign in (-1, 1):
                rows = []
                for x in seq(half[a]):
                    row = []
                    for y in seq(half[b]):
                        p = V((0, 0, 0))
                        p[axis] = sign * half[axis]
                        p[a] = x
                        p[b] = y
                        core = V(tuple(max(-h + rad, min(h - rad, k)) for k, h in zip(p, half)))
                        n = (p - core).normalized()
                        q = core + rad * n
                        if rot:
                            q = rot @ q
                            n = rot @ n
                        row.append(self.vertex(c + q, n))
                    rows.append(row)
                for i in range(5):
                    for j in range(5):
                        self.face((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]), mat)

    def tube(self, points, radius, mat, segments=12, steps=1, caps=True):
        path = spline(points, steps) if steps > 1 else [V(p) for p in points]
        tangent = (path[1] - path[0]).normalized()
        normal = tangent.cross(UP if abs(tangent.y) < 0.85 else X).normalized()
        grid = []
        for i, p in enumerate(path):
            tangent = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
            normal = (normal - tangent * normal.dot(tangent)).normalized()
            second = tangent.cross(normal).normalized()
            r = radius(i / (len(path) - 1)) if callable(radius) else radius
            row = []
            for j in range(segments):
                a = j * TAU / segments
                n = normal * math.cos(a) + second * math.sin(a)
                row.append(self.vertex(p + r * n, n))
            grid.append(row)
        for i in range(len(grid) - 1):
            for j in range(segments):
                k = (j + 1) % segments
                self.face((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]), mat)
        if caps:
            for row, p, t in [
                (grid[0], path[0], path[0] - path[1]),
                (grid[-1], path[-1], path[-1] - path[-2]),
            ]:
                rim = [self.vertex(self.p[v], t) for v in row]
                mid = self.vertex(p, t)
                for j in range(segments):
                    self.face((mid, rim[j], rim[(j + 1) % segments]), mat)

    def torus(self, center, major, radial, width, mat, seg=56, cross=12):
        c = V(center)
        g = []
        for i in range(seg):
            a = i * TAU / seg
            r = V((0, math.cos(a), math.sin(a)))
            row = []
            for j in range(cross):
                b = j * TAU / cross
                p = c + r * (major + radial * math.cos(b)) + X * (width * math.sin(b))
                n = r * (math.cos(b) / radial) + X * (math.sin(b) / width)
                row.append(self.vertex(p, n))
            g.append(row)
        for i in range(seg):
            for j in range(cross):
                self.face(
                    (g[i][j], g[(i + 1) % seg][j], g[(i + 1) % seg][(j + 1) % cross], g[i][(j + 1) % cross]),
                    mat,
                )

    def loft(self, sections, mat, steps=4, sides=32, exponent=0.83):
        """Transverse oval sections ordered tail to nose: (z, centre Y, radius Y, radius X)."""
        profile = spline(sections, steps)
        rings = []

        def contour(s, a):
            z, h, ry, rx = s
            x, y = math.cos(a), math.sin(a)
            return V(
                (
                    max(0.001, rx) * math.copysign(abs(x) ** exponent, x),
                    h + max(0.001, ry) * math.copysign(abs(y) ** exponent, y),
                    z,
                )
            )

        for i, s in enumerate(profile):
            row = []
            for j in range(sides):
                a = j * TAU / sides
                p = contour(s, a)
                circum = contour(s, a + 0.001) - contour(s, a - 0.001)
                along = contour(profile[min(i + 1, len(profile) - 1)], a) - contour(profile[max(i - 1, 0)], a)
                row.append(self.vertex(p, circum.cross(along)))
            rings.append(row)
        for i in range(len(rings) - 1):
            for j in range(sides):
                k = (j + 1) % sides
                m = mat(math.sin((j + 0.5) * TAU / sides)) if callable(mat) else mat
                self.face((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]), m)
        for row, sign in [(rings[0], -1), (rings[-1], 1)]:
            rim = [self.vertex(self.p[v], Z * sign) for v in row]
            self.face(tuple(rim), mat(0) if callable(mat) else mat)

    def finish(self, name, collection, parent=None, armature=None, origin=(0, 0, 0)):
        origin = V(origin)
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([blender_v(p - origin) for p in self.p], [], self.faces)
        for mat in self.mats:
            mesh.materials.append(mat)
        mesh.polygons.foreach_set("material_index", self.mat_ids)
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        uv = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            uv.data[loop.index].uv = self.uv[loop.vertex_index]
        mesh.normals_split_custom_set_from_vertices([blender_v(n) for n in self.n])
        mesh.update()
        o = bpy.data.objects.new(name, mesh)
        collection.objects.link(o)
        o.parent = armature or parent
        o.location = blender_v(origin) - (o.parent.matrix_world.translation if o.parent else ZERO)
        if armature:
            groups = {}
            for i, weights in enumerate(self.weights):
                for bone, weight in (weights or {}).items():
                    if weight <= 0:
                        continue
                    if bone not in groups:
                        groups[bone] = o.vertex_groups.new(name=bone)
                    groups[bone].add([i], weight, "REPLACE")
            mod = o.modifiers.new("Courier skeleton", "ARMATURE")
            mod.object = armature
        return o
