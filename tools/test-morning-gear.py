"""Run Blender -b art/morning/Rongwan-Courier.blend --python-exit-code 2 --python tools/test-morning-gear.py."""

import sys
from pathlib import Path
import bpy
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(bpy.data.filepath).parent))
from forms import blender_v
from helmet import HINGE, PARK_ANGLE


def triangles(name, materials=None, posed=False):
    obj = bpy.data.objects[name]
    if posed:
        obj = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = obj.data
    mesh.calc_loop_triangles()
    faces = [
        tuple(face.vertices)
        for face in mesh.loop_triangles
        if materials is None or mesh.materials[face.material_index].name in materials
    ]
    return [v.co.copy() for v in mesh.vertices], faces


def surface(points, faces):
    return BVHTree.FromPolygons(points, faces, all_triangles=True)


# The fabric is one sewn strip all the way from one free end to the other.
kerchief = bpy.data.objects["Kerchief"].data
neighbors = [set() for _ in kerchief.vertices]
for edge in kerchief.edges:
    a, b = edge.vertices
    neighbors[a].add(b)
    neighbors[b].add(a)
visited = {0}
pending = [0]
while pending:
    for neighbor in neighbors[pending.pop()] - visited:
        visited.add(neighbor)
        pending.append(neighbor)
assert len(visited) == len(neighbors), "detached cloth in the knot, band or front panel"

# The rotating strap touches its pivot rivets by design. Test the optical
# assembly against the actual lacquer shell, ears, eye and face triangles.
obstacles = {
    name: surface(*triangles(name))
    for name in (
        "Head_Coat",
        "Muzzle",
        "Muzzle_Smile",
        "Eye_L_Mesh",
        "Eye_R_Mesh",
        "Ear_L_Mesh",
        "Ear_R_Mesh",
    )
}
obstacles["Helmet shell"] = surface(
    *triangles("Helmet", {"Helmet · marigold lacquer", "Helmet · cream enamel"})
)
points, faces = triangles("Helmet_Goggles")
pivot = blender_v(HINGE)
for step in range(77):
    turn = Matrix.Rotation(PARK_ANGLE * step / 76, 3, "X")
    lenses = surface([pivot + turn @ (p - pivot) for p in points], faces)
    for name, static in obstacles.items():
        assert not lenses.overlap(static), f"Goggles intersect {name} at sweep step {step}"

rig = bpy.data.objects["CourierRig"]
for action in ("Stand", "Walk", "Ride"):
    rig.animation_data.action = bpy.data.actions[action]
    rig.animation_data.action_slot = bpy.data.actions[action].slots[0]
    for frame in range(1, (73 if action == "Stand" else 25) + 1, 3):
        bpy.context.scene.frame_set(frame)
        cloth = surface(*triangles("Kerchief", posed=True))
        for name in ("Uniform", "Head_Coat", "Helmet_Chinstrap"):
            assert not cloth.overlap(surface(*triangles(name, posed=True))), (
                f"Cloth intersects {name} in {action} {frame}"
            )
print("PASS: continuous band, 77 visor angles, and cloth fit through all three authored cycles.")
