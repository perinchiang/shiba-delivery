"""Build the reclining granite water buffalo used on Rongwan's stone bridge."""
import math
from pathlib import Path
import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
parts = []
stone = (0.27, 0.32, 0.28)
light = (0.38, 0.42, 0.35)
crease = (0.11, 0.145, 0.13)
horn = (0.24, 0.27, 0.23)
lichen = (0.30, 0.35, 0.20)


def finish(obj, color):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    mesh = obj.data
    attr = mesh.color_attributes.new(name="Stone", type='BYTE_COLOR', domain='CORNER')
    for face in mesh.polygons:
        for idx in face.loop_indices:
            attr.data[idx].color = (*color, 1)
    parts.append(obj)
    return obj


def oval(name, pos, size, color=stone, tilt=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.rotation_euler.y = tilt
    for face in obj.data.polygons:
        face.use_smooth = True
    return finish(obj, color)


def plinth(pos, size, chamfer, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new("Chiselled rim", 'BEVEL')
    mod.width, mod.segments = chamfer, 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    finish(obj, color)


def sweep(name, points, radii, color):
    points = list(map(Vector, points))
    verts, faces = [], []
    sides = 10
    for i, (p, r) in enumerate(zip(points, radii)):
        tangent = (points[min(i+1,len(points)-1)] - points[max(i-1,0)]).normalized()
        axis = tangent.cross(Vector((0, 1, 0)))
        if axis.length < .01:
            axis = tangent.cross(Vector((0, 0, 1)))
        axis.normalize()
        other = tangent.cross(axis)
        for j in range(sides):
            a = math.tau*j/sides
            verts.append(p + r*(axis*math.cos(a) + other*math.sin(a)))
        if i:
            for j in range(sides):
                k = (j+1) % sides
                faces.append(((i-1)*sides+j, (i-1)*sides+k, i*sides+k, i*sides+j))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(len(verts)-sides, len(verts))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for face in mesh.polygons:
        face.use_smooth = True
    finish(obj, color)


# The granite footing extends below the sloped bank to the waterline.
plinth((0,0,-1.37), (1.12,1.43,2.78), .065, stone)
plinth((0,0,.12), (1.04,1.35,.24), .07, stone)
plinth((0,0,.56), (.86,1.12,.85), .065, stone)
plinth((0,0,1.00), (1.03,1.31,.15), .05, light)
plinth((0,0,1.09), (.96,1.25,.09), .035, lichen)
oval("Haunch", (0,.10,1.40), (.40,.56,.30))
oval("Shoulder hump", (0,-.17,1.53), (.35,.32,.31))
for s in (-1,1):
    oval("Folded hind leg", (s*.31,.25,1.26), (.14,.29,.14), light)
    oval("Tucked front hoof", (s*.24,-.37,1.22), (.117,.25,.094), stone)
oval("Forehead", (0,-.34,1.66), (.29,.25,.27), light)
oval("Muzzle", (0,-.53,1.54), (.235,.18,.135))
for s in (-1,1):
    sweep("Crescent horn", [(s*.19,-.32,1.78),(s*.34,-.32,1.82),
          (s*.50,-.24,1.84),(s*.60,-.11,1.89),(s*.62,.035,1.98),
          (s*.59,.12,2.045)], [.105,.096,.075,.052,.029,.005], horn)
    oval("Ear", (s*.31,-.31,1.665), (.167,.078,.069), stone, s*.27)
    oval("Eye carving", (s*.198,-.512,1.704), (.044,.026,.027), crease, s*.25)
    oval("Brow", (s*.193,-.511,1.745), (.070,.035,.024), stone, s*-.24)
    oval("Nostril", (s*.103,-.689,1.561), (.032,.016,.024), crease)
sweep("Tail carved into flank", [(.17,.54,1.54),(.32,.54,1.44),(.39,.42,1.31),
      (.395,.23,1.28),(.39,.09,1.31)], [.046,.037,.03,.027,.046], horn)

bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
obj = bpy.context.object
obj.name = "Rongwan bridge · reclining water buffalo"
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
mat = bpy.data.materials.new("Morning granite")
mat.use_nodes = True
shader = mat.node_tree.nodes.get("Principled BSDF")
shader.inputs["Roughness"].default_value = .92
attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
attr.layer_name = "Stone"
mat.node_tree.links.new(attr.outputs["Color"], shader.inputs["Base Color"])
obj.data.materials.clear()
obj.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=str(Path(__file__).resolve().with_name("bridge-buffalo.glb")),
                          export_format='GLB', export_yup=True, export_texcoords=False)
