"""
Shiba Delivery — Shared Miniature-Diorama Props Library (Blender 5.2.3 LTS)
==========================================================================
Builds the first official reusable prop catalog in Animal Crossing / miniature-diorama
aesthetic (chunky tactile bevels, real Boolean cutouts, lathe-spun bottles/pots/lanterns,
Bezier curve tubes/pipes/bicycle frames, sculpted curved botanical leaves, Cycles Shader
Node PBR materials).

Saves:
  - art/shared/props/Shared-Props.blend   (editable master .blend library!)
  - art/shared/props/prop_*.glb           (individual reusable GLB assets!)
  - output/blender-qa/haikaze-hero/00-shared-props-showcase.png (Cycles inspection sheet)

Run headless:
  blender --background --factory-startup --python-exit-code 2 --python art/shared/props/build_shared_props.py
"""
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT = Path(__file__).resolve().parents[3]
TEX_DIR = ROOT / "art" / "shared" / "textures"
OUT_DIR = Path(__file__).resolve().parent
QA_DIR = ROOT / "output" / "blender-qa" / "haikaze-hero"
QA_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Color & Material Helpers (Animal Crossing Miniature Diorama Shader Nodes!)
# ---------------------------------------------------------------------------
def srgb_to_linear(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, a=1.0):
    r = ((h >> 16) & 255) / 255.0
    g = ((h >> 8) & 255) / 255.0
    b = (h & 255) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)


def load_image(filename, colorspace="sRGB"):
    path = str(TEX_DIR / filename)
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    img.pack()
    return img


def make_diorama_mat(
    name,
    hex_col,
    roughness=0.55,
    metallic=0.0,
    coat=0.0,
    coat_rough=0.15,
    subsurface=0.0,
    bump_scale=35.0,
    bump_strength=0.06,
    ao_tint=0.22,
    emissive_hex=None,
    emissive_strength=0.0,
    alpha=1.0,
    transmission=0.0,
    ior=1.45,
):
    """Tactile Animal Crossing / painted miniature diorama PBR shader with Cycles AO & micro-grain."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    base = hex_rgba(hex_col)
    # Soft cool-warm diorama ambient occlusion tint in crevices (pure Cycles magic!)
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 2
    ao.inputs["Distance"].default_value = 0.24
    ao.inputs["Color"].default_value = base

    # Subtle gouache / clay micro-variation
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = bump_scale
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.62
    nt.links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])

    # Slight shade shift in crevices toward soft coastal cool-warm shadow
    dark_col = (
        base[0] * (1.0 - ao_tint * 1.05),
        base[1] * (1.0 - ao_tint * 0.92),
        min(1.0, base[2] * (1.0 - ao_tint * 0.72)),
        1.0,
    )
    mix_ao = nt.nodes.new("ShaderNodeMix")
    mix_ao.data_type = "RGBA"
    mix_ao.inputs["A"].default_value = dark_col
    mix_ao.inputs["B"].default_value = base
    nt.links.new(ao.outputs["AO"], mix_ao.inputs["Factor"])

    # Very subtle tactile color modulation from micro-noise
    mix_var = nt.nodes.new("ShaderNodeMix")
    mix_var.data_type = "RGBA"
    mix_var.blend_type = "MULTIPLY"
    mix_var.inputs["Factor"].default_value = 0.06 if bump_strength > 0 else 0.0
    nt.links.new(mix_ao.outputs["Result"], mix_var.inputs["A"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.86, 0.85, 0.83, 1.0)
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix_var.inputs["B"])
    nt.links.new(mix_var.outputs["Result"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if "Subsurface Weight" in bsdf.inputs and subsurface > 0:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
        if "Subsurface Scale" in bsdf.inputs:
            bsdf.inputs["Subsurface Scale"].default_value = 0.025
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    if "Transmission Weight" in bsdf.inputs and transmission > 0:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    if emissive_hex is not None and emissive_strength > 0:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emissive_hex)
        bsdf.inputs["Emission Strength"].default_value = emissive_strength

    if bump_strength > 0:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.008
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def make_ai_surface_mat(
    name,
    color_file,
    normal_file=None,
    tex_scale=0.55,
    roughness=0.72,
    metallic=0.0,
    coat=0.06,
    coat_rough=0.16,
    subsurface=0.04,
    normal_strength=0.45,
    ao_tint=0.22,
    sat_mult=1.0,
    val_mult=1.0,
):
    """Seamless triplanar (BOX-projected) AI hand-painted PBR surface material with Cycles AO & Normal relief!"""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (tex_scale, tex_scale, tex_scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    t_col = nt.nodes.new("ShaderNodeTexImage")
    t_col.image = load_image(color_file, "sRGB")
    t_col.projection = "BOX"
    t_col.projection_blend = 0.25
    nt.links.new(mp.outputs["Vector"], t_col.inputs["Vector"])

    # Calibrate saturation & value so AI textures stay rich & warm under sunny AgX lighting!
    col_out = t_col.outputs["Color"]
    if abs(sat_mult - 1.0) > 1e-3 or abs(val_mult - 1.0) > 1e-3:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = sat_mult
        hsv.inputs["Value"].default_value = val_mult
        nt.links.new(col_out, hsv.inputs["Color"])
        col_out = hsv.outputs["Color"]

    # Cycles Ambient Occlusion soft cool-warm crevice depth (keeps diorama sculpted & tactile!)
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 2
    ao.inputs["Distance"].default_value = 0.28
    nt.links.new(col_out, ao.inputs["Color"])

    # Multiply soft crevice shadow gently into AI texture color
    ramp_ao = nt.nodes.new("ShaderNodeValToRGB")
    s_lo = 1.0 - ao_tint
    ramp_ao.color_ramp.elements[0].position = 0.0
    ramp_ao.color_ramp.elements[0].color = (s_lo * 0.94, s_lo * 0.98, min(1.0, s_lo * 1.08), 1.0)
    ramp_ao.color_ramp.elements[1].position = 1.0
    ramp_ao.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(ao.outputs["AO"], ramp_ao.inputs["Fac"])

    mix_ao = nt.nodes.new("ShaderNodeMix")
    mix_ao.data_type = "RGBA"
    mix_ao.blend_type = "MULTIPLY"
    mix_ao.inputs["Factor"].default_value = 1.0
    nt.links.new(col_out, mix_ao.inputs["A"])
    nt.links.new(ramp_ao.outputs["Color"], mix_ao.inputs["B"])
    nt.links.new(mix_ao.outputs["Result"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if "Subsurface Weight" in bsdf.inputs and subsurface > 0:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
        if "Subsurface Scale" in bsdf.inputs:
            bsdf.inputs["Subsurface Scale"].default_value = 0.02

    if normal_file and (TEX_DIR / normal_file).exists():
        # Use Bump from BOX-projected grayscale height (Blender NormalMap needs tangent UVs,
        # whereas BOX-projected Bump works flawlessly on ALL procedural/Boolean faces with ZERO seams!)
        t_bump = nt.nodes.new("ShaderNodeTexImage")
        t_bump.image = load_image(color_file, "Non-Color")
        t_bump.projection = "BOX"
        t_bump.projection_blend = 0.25
        nt.links.new(mp.outputs["Vector"], t_bump.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = normal_strength
        bump.inputs["Distance"].default_value = 0.012
        nt.links.new(t_bump.outputs["Color"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def make_image_mat(name, filename, roughness=0.45, coat=0.12, emissive_strength=0.0, normal_file=None):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = load_image(filename, "sRGB")
    tex.extension = "CLIP"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.14
    if emissive_strength > 0:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    if normal_file:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = load_image(normal_file, "Non-Color")
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.75
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------------------
# Clean Blender Geometry Primitives (Real Bevels, Curves, Lathe, Booleans!)
# ---------------------------------------------------------------------------
def ensure_collection(name, parent=None):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
    else:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def link_obj(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def set_smooth(obj, weighted=True):
    if obj.type != "MESH":
        return
    mesh = obj.data
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    if weighted:
        mod = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        mod.keep_sharp = False
        mod.weight = 60


def apply_all_modifiers(obj):
    if obj.type != "MESH":
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            pass
    obj.select_set(False)


def add_rounded_box(name, loc, size, mat, col, bevel=0.018, segs=3, rot=(0, 0, 0), parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(rot)
    if mat:
        obj.data.materials.append(mat)
    link_obj(obj, col)
    if parent:
        obj.parent = parent
    if bevel > 0:
        b = obj.modifiers.new("Bevel", "BEVEL")
        b.width = min(bevel, min(size) * 0.42)
        b.segments = segs
        b.limit_method = "ANGLE"
        b.harden_normals = False
    set_smooth(obj)
    return obj


def add_cyl(name, loc, r, h, mat, col, segs=24, bevel=0.005, rot=(0, 0, 0), parent=None, r_top=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r,
        radius2=r if r_top is None else r_top,
        depth=h,
    )
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(rot)
    if mat:
        obj.data.materials.append(mat)
    link_obj(obj, col)
    if parent:
        obj.parent = parent
    if bevel > 0:
        b = obj.modifiers.new("Bevel", "BEVEL")
        b.width = min(bevel, r * 0.35, h * 0.35)
        b.segments = 2
        b.limit_method = "ANGLE"
    set_smooth(obj)
    return obj


def add_lathe(name, profile_rz, loc, mat, col, segs=28, rot=(0, 0, 0), parent=None, cap_bottom=True, cap_top=True):
    """Create a smooth revolved 3D solid from a list of (radius, z) profile points."""
    bm = bmesh.new()
    rings = []
    for r, z in profile_rz:
        ring = []
        for i in range(segs):
            ang = math.tau * i / segs
            v = bm.verts.new((r * math.cos(ang), r * math.sin(ang), z))
            ring.append(v)
        rings.append(ring)
    for k in range(len(rings) - 1):
        r0, r1 = rings[k], rings[k + 1]
        for i in range(segs):
            ni = (i + 1) % segs
            bm.faces.new((r0[i], r0[ni], r1[ni], r1[i]))
    if cap_bottom and profile_rz[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile_rz[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(rot)
    if mat:
        obj.data.materials.append(mat)
    link_obj(obj, col)
    if parent:
        obj.parent = parent
    set_smooth(obj)
    return obj


def add_curve_tube(name, points, radius, mat, col, resolution=12, bevel_res=6, cyclic=False, parent=None, spline_type="NURBS"):
    """Smooth real 3D curved tube (pipes, handlebars, bicycle frames, delivery hooks, wires)."""
    cdata = bpy.data.curves.new(name, type="CURVE")
    cdata.dimensions = "3D"
    cdata.resolution_u = resolution
    cdata.bevel_depth = radius
    cdata.bevel_resolution = bevel_res
    cdata.use_fill_caps = not cyclic
    spline = cdata.splines.new(spline_type)
    spline.points.add(len(points) - 1)
    for i, pt in enumerate(points):
        spline.points[i].co = (pt[0], pt[1], pt[2], 1.0)
    spline.use_cyclic_u = cyclic
    if spline_type == "NURBS":
        spline.use_endpoint_u = not cyclic
        spline.order_u = min(4, len(points))

    obj = bpy.data.objects.new(name, cdata)
    link_obj(obj, col)
    # Convert curve cleanly to smooth mesh for consistent glTF export
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.active_object
    mesh_obj.select_set(False)
    if mat:
        mesh_obj.data.materials.append(mat)
    if parent:
        mesh_obj.parent = parent
    set_smooth(mesh_obj, weighted=False)
    return mesh_obj


def add_uv_quad(name, loc, w, h, mat, col, facing="-Y", rot=(0, 0, 0), parent=None):
    """Flat cleanly UV-mapped quad panel facing -Y (or rotated) with exact [0..1] UV bounds."""
    bm = bmesh.new()
    hw, hh = w * 0.5, h * 0.5
    if facing == "-Y":
        coords = [(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)]
    elif facing == "+X":
        coords = [(0, -hw, -hh), (0, hw, -hh), (0, hw, hh), (0, -hw, hh)]
    elif facing == "+Z":
        coords = [(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)]
    else:
        coords = [(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)]
    verts = [bm.verts.new(c) for c in coords]
    face = bm.faces.new(verts)
    uv_layer = bm.loops.layers.uv.new("UVMap")
    uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for loop, uv in zip(face.loops, uvs):
        loop[uv_layer].uv = uv
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(rot)
    if mat:
        obj.data.materials.append(mat)
    link_obj(obj, col)
    if parent:
        obj.parent = parent
    return obj


def boolean_cut(target, cutter):
    """Apply real Blender EXACT Boolean difference cutout and clean up cutter."""
    apply_all_modifiers(target)
    mod = target.modifiers.new("BoolCut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    target.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)


def make_root(name, col):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.25
    link_obj(empty, col)
    return empty


def join_prop_meshes(root_empty, keep_empties=True):
    """Apply modifiers on child meshes cleanly while keeping hierarchy intact (or parented to root)."""
    for ch in list(root_empty.children):
        if ch.type == "MESH":
            apply_all_modifiers(ch)
            if "Chainring" in ch.name or "RearCog" in ch.name:
                ch.data.polygons.foreach_set("use_smooth", [False] * len(ch.data.polygons))
            else:
                set_smooth(ch, weighted=False)
        elif ch.type == "EMPTY" and not keep_empties:
            bpy.data.objects.remove(ch, do_unlink=True)
    return root_empty


# ---------------------------------------------------------------------------
# Shared Materials Palette (Cozy Animal Crossing Miniature Diorama!)
# ---------------------------------------------------------------------------
def build_prop_materials():
    M = {}
    M["enamel_white"] = make_diorama_mat("Prop_Enamel_White", 0xF7F3E9, roughness=0.28, coat=0.45, bump_strength=0.025)
    M["enamel_pink"] = make_diorama_mat("Prop_Enamel_Pink", 0xF5C8D4, roughness=0.28, coat=0.45, bump_strength=0.025)
    M["enamel_cream"] = make_diorama_mat("Prop_Enamel_Cream", 0xEFEAE0, roughness=0.38, coat=0.25, bump_strength=0.03)
    M["accent_teal"] = make_diorama_mat("Prop_Accent_Teal", 0x2A7E9C, roughness=0.26, coat=0.5, bump_strength=0.02)
    M["accent_coral"] = make_diorama_mat("Prop_Accent_Coral", 0xE26A7E, roughness=0.26, coat=0.5, bump_strength=0.02)
    M["dark_metal"] = make_diorama_mat("Prop_Dark_Metal", 0x2D383A, roughness=0.36, metallic=0.65, coat=0.2, bump_strength=0.03)
    M["chrome"] = make_diorama_mat("Prop_Chrome", 0xD8DFE2, roughness=0.16, metallic=0.88, coat=0.3, bump_strength=0.01)
    M["brass"] = make_diorama_mat("Prop_Brushed_Brass", 0xDDA84C, roughness=0.24, metallic=0.85, coat=0.25, bump_strength=0.025)
    M["rubber"] = make_diorama_mat("Prop_Rubber", 0x2B2C2E, roughness=0.82, bump_scale=80.0, bump_strength=0.05)
    M["leather"] = make_diorama_mat("Prop_Leather", 0x7A4224, roughness=0.48, coat=0.18, subsurface=0.05, bump_strength=0.05)
    M["cedar"] = make_ai_surface_mat("Prop_Warm_Cedar", "tex_wood_cedar.png", "tex_wood_cedar_normal.png", tex_scale=0.85, roughness=0.50, coat=0.14, subsurface=0.03, normal_strength=0.16, ao_tint=0.22, sat_mult=1.20, val_mult=0.68)
    M["cedar_dark"] = make_diorama_mat("Prop_Dark_Cedar", 0x62371D, roughness=0.54, bump_scale=30.0, bump_strength=0.07)
    M["kraft_paper"] = make_diorama_mat("Prop_Kraft_Paper", 0xD2A66E, roughness=0.86, subsurface=0.06, bump_scale=55.0, bump_strength=0.09, ao_tint=0.22)
    M["flower_yellow"] = make_diorama_mat("Prop_Flower_Yellow", 0xFCE058, roughness=0.48, subsurface=0.25, bump_strength=0.02)
    M["flower_coral"] = make_diorama_mat("Prop_Flower_Coral", 0xF58478, roughness=0.48, subsurface=0.25, bump_strength=0.02)
    M["flower_center"] = make_diorama_mat("Prop_Flower_Center", 0xE27A22, roughness=0.65, bump_strength=0.04)
    M["terracotta"] = make_diorama_mat("Prop_Terracotta", 0xC6643E, roughness=0.68, subsurface=0.12, bump_scale=48.0, bump_strength=0.09)
    M["soil"] = make_diorama_mat("Prop_Soil", 0x4A3424, roughness=0.92, bump_scale=65.0, bump_strength=0.16)
    M["leaf_deep"] = make_diorama_mat("Prop_Leaf_Deep", 0x3A7B47, roughness=0.42, coat=0.22, subsurface=0.22, bump_scale=30.0, bump_strength=0.04)
    M["leaf_bright"] = make_diorama_mat("Prop_Leaf_Bright", 0x5EA152, roughness=0.38, coat=0.25, subsurface=0.28, bump_scale=30.0, bump_strength=0.04)
    M["pipe_white"] = make_diorama_mat("Prop_Pipe_White", 0xEDEAE2, roughness=0.44, coat=0.18, bump_strength=0.03)
    M["sage_enamel"] = make_diorama_mat("Prop_Sage_Enamel", 0x7E9C7B, roughness=0.32, coat=0.42, bump_strength=0.025)
    M["bike_teal"] = make_diorama_mat("Prop_Bike_Paint_Teal", 0x24565B, roughness=0.24, metallic=0.25, coat=0.60, bump_strength=0.015)
    # Ready-to-swap color-variant paint slots (swap 1 material to recolor any shared bicycle!)
    M["bike_mustard"] = make_diorama_mat("Prop_Bike_Paint_Mustard", 0xE2A634, roughness=0.24, metallic=0.18, coat=0.60, bump_strength=0.015)
    M["bike_coral"] = make_diorama_mat("Prop_Bike_Paint_Coral", 0xD65B4E, roughness=0.24, metallic=0.18, coat=0.60, bump_strength=0.015)
    M["bike_cream"] = make_diorama_mat("Prop_Bike_Paint_Cream", 0xEFE5CF, roughness=0.26, metallic=0.12, coat=0.55, bump_strength=0.015)
    M["pedal_amber"] = make_diorama_mat("Prop_Pedal_Reflector", 0xF29E26, roughness=0.18, coat=0.80, bump_strength=0.01)
    M["chain_steel"] = make_diorama_mat("Prop_Chain_Steel", 0x424B4F, roughness=0.30, metallic=0.82, coat=0.22, bump_strength=0.02)

    # Translucent glossy glass for vending showcase & soda bottles
    M["clear_glass"] = make_diorama_mat(
        "Prop_Clear_Glass", 0xEAF8FF, roughness=0.06, coat=0.6, bump_strength=0.0,
        ao_tint=0.0, alpha=0.26, transmission=0.72, ior=1.48
    )
    M["showcase_glow"] = make_diorama_mat(
        "Prop_Showcase_Glow", 0xFFFBF0, roughness=0.25, bump_strength=0.0, ao_tint=0.05,
        emissive_hex=0xFFF6DF, emissive_strength=1.45
    )
    M["led_cold"] = make_diorama_mat("Prop_LED_Cold", 0x3CA8E8, roughness=0.22, bump_strength=0.0, emissive_hex=0x58C4FF, emissive_strength=0.85)
    M["led_hot"] = make_diorama_mat("Prop_LED_Hot", 0xEC5A50, roughness=0.22, bump_strength=0.0, emissive_hex=0xFF7262, emissive_strength=0.85)
    M["led_btn"] = make_diorama_mat("Prop_LED_Button", 0xF8F6EE, roughness=0.18, coat=0.5, bump_strength=0.0, emissive_hex=0xFFF5D4, emissive_strength=0.9)
    M["led_green"] = make_diorama_mat("Prop_LED_Green", 0x4EE884, roughness=0.2, bump_strength=0.0, emissive_hex=0x5CFF96, emissive_strength=2.2)

    # Crate colors (tactile glossy molded HDPE plastic!)
    M["crate_yellow"] = make_diorama_mat("Prop_Crate_Yellow", 0xF0BE38, roughness=0.34, coat=0.35, bump_strength=0.025)
    M["crate_blue"] = make_diorama_mat("Prop_Crate_Blue", 0x2F6EB2, roughness=0.34, coat=0.35, bump_strength=0.025)
    M["crate_red"] = make_diorama_mat("Prop_Crate_Red", 0xD2443C, roughness=0.34, coat=0.35, bump_strength=0.025)
    M["crate_green"] = make_diorama_mat("Prop_Crate_Green", 0x3D8B50, roughness=0.34, coat=0.35, bump_strength=0.025)

    # Colorful miniature drink cans & glass soda bottles!
    M["drink_ramune"] = make_diorama_mat("Prop_Drink_Ramune", 0x4EC0EB, roughness=0.14, coat=0.8, bump_strength=0.0, transmission=0.32)
    M["drink_matcha"] = make_diorama_mat("Prop_Drink_Matcha", 0x62AC56, roughness=0.18, coat=0.65, bump_strength=0.0)
    M["drink_orange"] = make_diorama_mat("Prop_Drink_Orange", 0xF59532, roughness=0.16, coat=0.75, bump_strength=0.0)
    M["drink_peach"] = make_diorama_mat("Prop_Drink_Peach", 0xF5A8BC, roughness=0.18, coat=0.65, bump_strength=0.0)
    M["drink_coffee"] = make_diorama_mat("Prop_Drink_Coffee", 0x8C583A, roughness=0.22, metallic=0.25, coat=0.5, bump_strength=0.0)
    M["drink_lemon"] = make_diorama_mat("Prop_Drink_Lemon", 0xF6DC4E, roughness=0.16, coat=0.75, bump_strength=0.0)
    M["drink_cola"] = make_diorama_mat("Prop_Drink_Cola", 0xC8322E, roughness=0.18, metallic=0.25, coat=0.6, bump_strength=0.0)
    M["drink_label"] = make_diorama_mat("Prop_Drink_Label", 0xFCF8EE, roughness=0.32, bump_strength=0.01)
    M["glass_emerald"] = make_diorama_mat("Prop_Glass_Emerald", 0x44A868, roughness=0.10, coat=0.85, bump_strength=0.0, transmission=0.45)
    M["glass_amber"] = make_diorama_mat("Prop_Glass_Amber", 0xC87A2C, roughness=0.10, coat=0.85, bump_strength=0.0, transmission=0.45)

    # Chochin paper lantern warm subsurface glow
    M["lantern_paper"] = make_diorama_mat(
        "Prop_Lantern_Paper", 0xFFF2D2, roughness=0.65, subsurface=0.42, bump_scale=60.0, bump_strength=0.05,
        emissive_hex=0xFFCB74, emissive_strength=2.2
    )
    M["lacquer_black"] = make_diorama_mat("Prop_Lacquer_Black", 0x1E1D1C, roughness=0.18, coat=0.75, bump_strength=0.01)

    # Image-backed graphics
    M["vending_poster_white"] = make_image_mat("Prop_VendingPoster_White", "tex_vending_poster_white.png", roughness=0.26, coat=0.4, emissive_strength=0.18)
    M["vending_poster_pink"] = make_image_mat("Prop_VendingPoster_Pink", "tex_vending_poster_pink.png", roughness=0.26, coat=0.4, emissive_strength=0.18)
    M["menu_chalk"] = make_image_mat("Prop_Menu_Chalkboard", "tex_menu_chalkboard.png", roughness=0.82, coat=0.0)
    M["chalk_white"] = make_diorama_mat("Prop_Chalk_White", 0xFAF6EA, roughness=0.92, bump_strength=0.04)
    M["chalk_coral"] = make_diorama_mat("Prop_Chalk_Coral", 0xEC8272, roughness=0.92, bump_strength=0.04)
    return M


# ---------------------------------------------------------------------------
# 1) PROP: Miniature Diorama Japanese Vending Machine (3D Recessed Showcase!)
# ---------------------------------------------------------------------------
def build_vending_machine(name, variant, M):
    col = ensure_collection(name)
    root = make_root(name, col)
    is_pink = (variant == "pink")
    mat_body = M["enamel_pink"] if is_pink else M["enamel_white"]
    mat_accent = M["accent_coral"] if is_pink else M["accent_teal"]
    mat_poster = M["vending_poster_pink"] if is_pink else M["vending_poster_white"]

    W, D, H = 0.78, 0.50, 1.66
    # Molded rubber leveling feet
    for fx in (-0.31, 0.31):
        for fy in (-0.17, 0.17):
            add_cyl(f"{name}_Foot", (fx, fy, 0.025), 0.036, 0.05, M["rubber"], col, segs=16, bevel=0.006, parent=root)

    # Main cabinet body with TRUE Boolean cutouts for upper showcase & lower pickup chute!
    cab = add_rounded_box(f"{name}_Cabinet", (0, 0, 0.05 + H * 0.5), (W, D, H), mat_body, col, bevel=0.038, segs=3, parent=root)
    # Cut upper glowing display window (z=0.84..1.58, 0.19m deep into -Y face!)
    c_win = add_rounded_box("tmp_win", (0, -D * 0.5 + 0.09, 1.21), (0.64, 0.24, 0.74), None, col, bevel=0.02, segs=2)
    boolean_cut(cab, c_win)
    # Cut lower pickup dispenser slot (right-bottom z=0.22..0.46)
    c_slot = add_rounded_box("tmp_slot", (0.14, -D * 0.5 + 0.07, 0.34), (0.34, 0.20, 0.24), None, col, bevel=0.022, segs=2)
    boolean_cut(cab, c_slot)

    # Glowing showcase interior lining + warm LED ceiling light bar
    add_rounded_box(f"{name}_BackGlow", (0, -0.05, 1.21), (0.63, 0.02, 0.73), M["showcase_glow"], col, bevel=0.004, parent=root)
    add_rounded_box(f"{name}_TopLED", (0, -0.15, 1.565), (0.60, 0.10, 0.025), M["showcase_glow"], col, bevel=0.006, parent=root)
    # Decorative colored header stripe on top visor
    add_rounded_box(f"{name}_HeaderStripe", (0, -D * 0.5 - 0.003, 1.635), (0.66, 0.022, 0.052), mat_accent, col, bevel=0.010, parent=root)

    # 3 real 3D shelves packed with 18 adorable lathe-spun miniature drink cans & bottles!
    drink_rows = [
        [M["drink_ramune"], M["drink_ramune"], M["drink_lemon"], M["drink_orange"], M["drink_matcha"], M["drink_matcha"]],
        [M["drink_peach"], M["drink_peach"], M["drink_ramune"], M["drink_cola"], M["drink_cola"], M["drink_orange"]],
        [M["drink_coffee"], M["drink_coffee"], M["drink_matcha"], M["drink_peach"], M["drink_lemon"], M["drink_coffee"]],
    ] if not is_pink else [
        [M["drink_peach"], M["drink_peach"], M["drink_ramune"], M["drink_lemon"], M["drink_peach"], M["drink_matcha"]],
        [M["drink_orange"], M["drink_peach"], M["drink_ramune"], M["drink_ramune"], M["drink_cola"], M["drink_peach"]],
        [M["drink_coffee"], M["drink_peach"], M["drink_lemon"], M["drink_matcha"], M["drink_coffee"], M["drink_coffee"]],
    ]

    shelf_zs = [1.34, 1.11, 0.88]
    bottle_prof = [(0.026, 0.0), (0.027, 0.095), (0.021, 0.125), (0.012, 0.145), (0.013, 0.165), (0.011, 0.168)]
    for r_idx, sz in enumerate(shelf_zs):
        # Shelf ledge + colored hot/cold price rail
        add_rounded_box(f"{name}_Shelf_{r_idx}", (0, -0.135, sz), (0.62, 0.16, 0.018), M["chrome"], col, bevel=0.004, parent=root)
        rail_mat = M["led_hot"] if r_idx == 2 else M["led_cold"]
        add_rounded_box(f"{name}_PriceRail_{r_idx}", (0, -0.215, sz - 0.008), (0.60, 0.018, 0.022), rail_mat, col, bevel=0.004, parent=root)

        for c_idx in range(6):
            bx = -0.24 + c_idx * 0.096
            dmat = drink_rows[r_idx][c_idx]
            if r_idx == 2:
                # Cute chunky aluminum drink can
                add_cyl(f"{name}_Can_{r_idx}_{c_idx}", (bx, -0.135, sz + 0.068), 0.027, 0.118, dmat, col, segs=18, bevel=0.005, parent=root)
                add_cyl(f"{name}_CanTop_{r_idx}_{c_idx}", (bx, -0.135, sz + 0.128), 0.023, 0.006, M["chrome"], col, segs=16, bevel=0.002, parent=root)
                add_cyl(f"{name}_CanLbl_{r_idx}_{c_idx}", (bx, -0.135, sz + 0.068), 0.0278, 0.048, M["drink_label"], col, segs=18, bevel=0.001, parent=root)
            else:
                # Adorable lathe-spun miniature Japanese bottle!
                add_lathe(f"{name}_Btl_{r_idx}_{c_idx}", bottle_prof, (bx, -0.135, sz + 0.009), dmat, col, segs=18, parent=root)
                add_cyl(f"{name}_Cap_{r_idx}_{c_idx}", (bx, -0.135, sz + 0.172), 0.014, 0.016, M["drink_label"], col, segs=14, bevel=0.003, parent=root)
                add_cyl(f"{name}_Lbl_{r_idx}_{c_idx}", (bx, -0.135, sz + 0.062), 0.028, 0.044, M["drink_label"], col, segs=16, bevel=0.001, parent=root)

            # Tiny glowing rounded selection button right beneath each drink!
            add_rounded_box(f"{name}_Btn_{r_idx}_{c_idx}", (bx, -0.224, sz - 0.036), (0.044, 0.016, 0.022), M["led_btn"], col, bevel=0.005, parent=root)

    # Clear glossy front showcase glass pane + slim aluminum trim frame
    add_rounded_box(f"{name}_Glass", (0, -0.236, 1.21), (0.635, 0.012, 0.735), M["clear_glass"], col, bevel=0.003, parent=root)

    # Middle control strip (coin slot, digital green LED readout, return knob, colored band)
    add_rounded_box(f"{name}_MidBand", (0, -D * 0.5 - 0.004, 0.74), (0.68, 0.018, 0.095), mat_accent, col, bevel=0.010, parent=root)
    add_rounded_box(f"{name}_CoinPanel", (0.18, -D * 0.5 - 0.012, 0.74), (0.22, 0.022, 0.072), M["dark_metal"], col, bevel=0.008, parent=root)
    add_rounded_box(f"{name}_LEDPrice", (0.13, -D * 0.5 - 0.022, 0.752), (0.075, 0.010, 0.026), M["led_green"], col, bevel=0.003, parent=root)
    add_cyl(f"{name}_CoinSlot", (0.24, -D * 0.5 - 0.022, 0.742), 0.018, 0.012, M["chrome"], col, segs=16, rot=(math.pi * 0.5, 0, 0), parent=root)

    # Lower-left framed seaside soda art poster!
    add_rounded_box(f"{name}_PosterFrame", (-0.18, -D * 0.5 - 0.005, 0.36), (0.31, 0.020, 0.33), M["enamel_white"], col, bevel=0.008, parent=root)
    add_uv_quad(f"{name}_PosterArt", (-0.18, -D * 0.5 - 0.017, 0.36), 0.27, 0.29, mat_poster, col, facing="-Y", parent=root)

    # Recessed pickup dispenser flap (angled dark acrylic door inside Boolean pocket)
    add_rounded_box(f"{name}_DispenserFlap", (0.14, -D * 0.5 + 0.055, 0.35), (0.31, 0.025, 0.20), M["dark_metal"], col, bevel=0.010, rot=(-0.18, 0, 0), parent=root)
    add_rounded_box(f"{name}_PushBar", (0.14, -D * 0.5 + 0.032, 0.29), (0.22, 0.014, 0.022), M["chrome"], col, bevel=0.005, parent=root)

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 2) PROP: Outdoor AC Unit (Real Recessed Fan Shroud + 3D Blades + Wire Grille!)
# ---------------------------------------------------------------------------
def build_ac_unit(M):
    name = "Prop_AC_Unit"
    col = ensure_collection(name)
    root = make_root(name, col)

    W, D, H = 0.78, 0.33, 0.54
    # Main rounded housing (y in [-D..0], z in [0.06..0.06+H] so mounting flush to wall is effortless)
    body = add_rounded_box(f"{name}_Body", (0, -D * 0.5, 0.06 + H * 0.5), (W, D, H), M["enamel_cream"], col, bevel=0.028, segs=3, parent=root)
    # Real Boolean cylindrical cutout for fan shroud on front (-Y) face!
    cutter = add_cyl("tmp_fan_cut", (-0.12, -D + 0.04, 0.06 + H * 0.5), 0.20, 0.16, None, col, segs=28, bevel=0.01, rot=(math.pi * 0.5, 0, 0))
    boolean_cut(body, cutter)

    # Dark interior backing cavity behind fan
    add_cyl(f"{name}_Chamber", (-0.12, -D + 0.095, 0.06 + H * 0.5), 0.195, 0.04, M["dark_metal"], col, segs=24, bevel=0.002, rot=(math.pi * 0.5, 0, 0), parent=root)
    # Sculpted 3-blade propeller fan + spinner hub
    fx, fy, fz = -0.12, -D + 0.055, 0.06 + H * 0.5
    add_cyl(f"{name}_Hub", (fx, fy, fz), 0.048, 0.045, M["dark_metal"], col, segs=18, bevel=0.008, rot=(math.pi * 0.5, 0, 0), parent=root)
    for k in range(3):
        ang = k * math.tau / 3.0 + 0.35
        bx = fx + math.cos(ang) * 0.095
        bz = fz + math.sin(ang) * 0.095
        add_rounded_box(f"{name}_Blade_{k}", (bx, fy, bz), (0.14, 0.016, 0.075), M["dark_metal"], col, bevel=0.007, rot=(0.35, ang, 0), parent=root)

    # 3D concentric circular protective wire grille rings + radial spokes
    gy = -D - 0.006
    for r_ring in (0.065, 0.115, 0.165, 0.205):
        pts = [(fx + r_ring * math.cos(math.tau * i / 24), gy, fz + r_ring * math.sin(math.tau * i / 24)) for i in range(24)]
        add_curve_tube(f"{name}_Ring_{int(r_ring*100)}", pts, 0.0055, M["dark_metal"], col, resolution=6, bevel_res=3, cyclic=True, parent=root)
    for k in range(4):
        ang = k * math.pi / 4.0
        p0 = (fx - 0.205 * math.cos(ang), gy - 0.002, fz - 0.205 * math.sin(ang))
        p1 = (fx + 0.205 * math.cos(ang), gy - 0.002, fz + 0.205 * math.sin(ang))
        add_curve_tube(f"{name}_Spoke_{k}", [p0, p1], 0.0055, M["dark_metal"], col, resolution=2, bevel_res=3, parent=root, spline_type="POLY")

    # Right front recessed badge + louver slots
    add_rounded_box(f"{name}_BrandBadge", (0.24, -D - 0.004, 0.06 + H * 0.72), (0.14, 0.012, 0.036), M["accent_teal"], col, bevel=0.005, parent=root)
    for i in range(5):
        add_rounded_box(f"{name}_Louver_{i}", (0.24, -D - 0.003, 0.18 + i * 0.044), (0.17, 0.012, 0.014), M["dark_metal"], col, bevel=0.004, parent=root)

    # Heavy L-brackets underneath + rubber feet
    for sx in (-0.26, 0.26):
        add_rounded_box(f"{name}_Foot_{sx}", (sx, -D * 0.5, 0.03), (0.06, 0.30, 0.055), M["dark_metal"], col, bevel=0.008, parent=root)
        add_rounded_box(f"{name}_BrkWall_{sx}", (sx, -0.025, -0.10), (0.055, 0.045, 0.26), M["dark_metal"], col, bevel=0.008, parent=root)
        add_rounded_box(f"{name}_BrkDiag_{sx}", (sx, -0.15, -0.09), (0.04, 0.28, 0.04), M["dark_metal"], col, bevel=0.006, rot=(-0.65, 0, 0), parent=root)

    # Smooth curved white tape-wrapped refrigerant conduit curving cleanly from right side into wall!
    hose_pts = [
        (0.39, -0.16, 0.20),
        (0.47, -0.16, 0.18),
        (0.50, -0.10, 0.10),
        (0.48, -0.02, 0.04),
        (0.45, 0.02, 0.02),
    ]
    add_curve_tube(f"{name}_Pipe", hose_pts, 0.026, M["pipe_white"], col, resolution=12, bevel_res=5, parent=root)
    # Wall entry putty flange collar
    add_cyl(f"{name}_Flange", (0.45, -0.005, 0.02), 0.046, 0.025, M["enamel_cream"], col, segs=16, rot=(math.pi * 0.5, 0, 0), parent=root)

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 3) PROP: Circular Doorstep Delivery Hook (Patrick's Signature Interaction Prop!)
# ---------------------------------------------------------------------------
def build_door_hook(M):
    name = "Prop_Door_Hook"
    col = ensure_collection(name)
    root = make_root(name, col)

    # Adorable chunky oval sage-enamel backing rosette mounted flush on wall (y=0, projects to -Y)
    plaque = add_cyl(f"{name}_Plaque", (0, -0.014, 0.0), 0.055, 0.024, M["sage_enamel"], col, segs=24, bevel=0.008, rot=(math.pi * 0.5, 0, 0), parent=root)
    plaque.scale = (0.85, 1.0, 1.25)
    apply_all_modifiers(plaque)

    # Outer cream bezel ring + two cute domed brass screws
    add_cyl(f"{name}_CenterCollar", (0, -0.028, 0.0), 0.024, 0.018, M["brass"], col, segs=18, bevel=0.005, rot=(math.pi * 0.5, 0, 0), parent=root)
    for sz in (-0.046, 0.046):
        add_cyl(f"{name}_Screw", (0, -0.026, sz), 0.007, 0.008, M["brass"], col, segs=12, bevel=0.003, rot=(math.pi * 0.5, 0, 0), parent=root)

    # Chunky circular-loop brushed-brass hook (instantly readable circular silhouette from doorway cam!)
    # Circular ring hanging cleanly + curved front lip so a delivery bag hooks right onto it
    hook_pts = [
        (0.0, -0.026, 0.0),
        (0.0, -0.072, -0.006),
        (0.0, -0.098, -0.036),
        (0.0, -0.090, -0.074),
        (0.0, -0.052, -0.088),
        (0.0, -0.022, -0.068),
        (0.0, -0.022, -0.036),
    ]
    add_curve_tube(f"{name}_BrassHook", hook_pts, 0.010, M["brass"], col, resolution=14, bevel_res=6, parent=root)
    # Cute brass safety ball tip at hook end
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.015)
    sm = bpy.data.meshes.new(f"{name}_BallTip")
    bm.to_mesh(sm)
    bm.free()
    ball = bpy.data.objects.new(f"{name}_BallTip", sm)
    ball.location = Vector((0.0, -0.098, -0.034))
    ball.data.materials.append(M["brass"])
    link_obj(ball, col)
    ball.parent = root
    set_smooth(ball, weighted=False)

    # Outer decorative circular brass ring halo (super cute & unmistakably "circular hook"!)
    ring_pts = [(0.046 * math.cos(math.tau * i / 24), -0.056, -0.042 + 0.046 * math.sin(math.tau * i / 24)) for i in range(24)]
    add_curve_tube(f"{name}_OuterRing", ring_pts, 0.0075, M["brass"], col, resolution=8, bevel_res=4, cyclic=True, parent=root)

    # Named Empty anchor where A-Chai's delivery bag handle hangs & swings!
    anchor = bpy.data.objects.new("Hook_Hang_Point", None)
    anchor.empty_display_type = "SPHERE"
    anchor.empty_display_size = 0.025
    anchor.location = Vector((0.0, -0.075, -0.080))
    link_obj(anchor, col)
    anchor.parent = root

    return join_prop_meshes(root, keep_empties=True)


# ---------------------------------------------------------------------------
# 4) PROP: Hollow Lattice Japanese Bottle Crate + 6 Lathe-Spun Glass Bottles!
# ---------------------------------------------------------------------------
def build_bottle_crate(name, mat_crate, M, with_bottles=True):
    col = ensure_collection(name)
    root = make_root(name, col)

    W, D, H = 0.42, 0.34, 0.27
    t = 0.022
    # Solid molded base floor
    add_rounded_box(f"{name}_Floor", (0, 0, 0.014), (W, D, 0.026), mat_crate, col, bevel=0.008, parent=root)
    # Chunky top rim collar (4 beveled rails)
    add_rounded_box(f"{name}_TopF", (0, -D * 0.5 + t * 0.5, H - 0.022), (W, t + 0.008, 0.042), mat_crate, col, bevel=0.009, parent=root)
    add_rounded_box(f"{name}_TopB", (0,  D * 0.5 - t * 0.5, H - 0.022), (W, t + 0.008, 0.042), mat_crate, col, bevel=0.009, parent=root)
    add_rounded_box(f"{name}_TopL", (-W * 0.5 + t * 0.5, 0, H - 0.022), (t + 0.008, D, 0.042), mat_crate, col, bevel=0.009, parent=root)
    add_rounded_box(f"{name}_TopR", ( W * 0.5 - t * 0.5, 0, H - 0.022), (t + 0.008, D, 0.042), mat_crate, col, bevel=0.009, parent=root)

    # Lower band rails (leaving clean lattice openings & carry handle cutouts!)
    add_rounded_box(f"{name}_LowF", (0, -D * 0.5 + t * 0.5, 0.055), (W, t, 0.06), mat_crate, col, bevel=0.007, parent=root)
    add_rounded_box(f"{name}_LowB", (0,  D * 0.5 - t * 0.5, 0.055), (W, t, 0.06), mat_crate, col, bevel=0.007, parent=root)
    add_rounded_box(f"{name}_LowL", (-W * 0.5 + t * 0.5, 0, 0.055), (t, D, 0.06), mat_crate, col, bevel=0.007, parent=root)
    add_rounded_box(f"{name}_LowR", ( W * 0.5 - t * 0.5, 0, 0.055), (t, D, 0.06), mat_crate, col, bevel=0.007, parent=root)

    # 4 plump corner pillars + side lattice slats
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_rounded_box(f"{name}_Corner_{sx}_{sy}", (sx * (W * 0.5 - 0.02), sy * (D * 0.5 - 0.02), H * 0.5),
                            (0.040, 0.040, H), mat_crate, col, bevel=0.010, parent=root)
    for rx in (-0.11, 0.0, 0.11):
        for sy in (-1, 1):
            add_rounded_box(f"{name}_RibX", (rx, sy * (D * 0.5 - t * 0.5), 0.155), (0.024, t, 0.16), mat_crate, col, bevel=0.006, parent=root)
    for ry in (-0.06, 0.06):
        for sx in (-1, 1):
            add_rounded_box(f"{name}_RibY", (sx * (W * 0.5 - t * 0.5), ry, 0.155), (t, 0.024, 0.16), mat_crate, col, bevel=0.006, parent=root)

    # Interior grid dividers
    add_rounded_box(f"{name}_DivY", (0, 0, 0.11), (W - 0.05, 0.012, 0.14), mat_crate, col, bevel=0.003, parent=root)
    for dx in (-0.065, 0.065):
        add_rounded_box(f"{name}_DivX", (dx, 0, 0.11), (0.012, D - 0.05, 0.14), mat_crate, col, bevel=0.003, parent=root)

    # 6 adorable lathe-spun Japanese glass soda bottles standing inside!
    if with_bottles:
        b_prof = [(0.036, 0.0), (0.038, 0.155), (0.034, 0.195), (0.016, 0.245), (0.017, 0.285), (0.019, 0.295), (0.014, 0.302)]
        bmats = [M["glass_emerald"], M["drink_ramune"], M["glass_amber"]]
        cap_mats = [M["crate_red"], M["crate_yellow"], M["accent_teal"]]
        idx = 0
        for gx in (-0.13, 0.0, 0.13):
            for gy in (-0.08, 0.08):
                add_lathe(f"{name}_Bottle_{idx}", b_prof, (gx, gy, 0.026), bmats[idx % 3], col, segs=18, parent=root)
                add_cyl(f"{name}_BCap_{idx}", (gx, gy, 0.332), 0.018, 0.014, cap_mats[idx % 3], col, segs=14, bevel=0.003, parent=root)
                add_cyl(f"{name}_BLbl_{idx}", (gx, gy, 0.125), 0.039, 0.058, M["drink_label"], col, segs=16, bevel=0.001, parent=root)
                idx += 1

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 5) PROP: Animal Crossing Plump Botanical Potted Plant (Terracotta + Curved Leaves!)
# ---------------------------------------------------------------------------
def build_potted_plant(name, variant, M):
    col = ensure_collection(name)
    root = make_root(name, col)
    tall = (variant == "tall")

    # Terracotta saucer + lathe-spun rolled-rim terracotta pot
    saucer_prof = [(0.11, 0.0), (0.145, 0.006), (0.165, 0.038), (0.152, 0.042), (0.132, 0.016), (0.0, 0.016)]
    pot_prof = [
        (0.115, 0.016),
        (0.158, 0.235),
        (0.175, 0.242),
        (0.178, 0.285),
        (0.164, 0.296),
        (0.145, 0.288),
        (0.140, 0.230),
    ]
    add_lathe(f"{name}_Saucer", saucer_prof, (0, 0, 0), M["terracotta"], col, segs=26, parent=root)
    add_lathe(f"{name}_Pot", pot_prof, (0, 0, 0), M["terracotta"], col, segs=26, parent=root, cap_top=False)

    # Mounded dark potting soil dome
    soil_prof = [(0.142, 0.235), (0.125, 0.268), (0.075, 0.282), (0.001, 0.288)]
    add_lathe(f"{name}_Soil", soil_prof, (0, 0, 0), M["soil"], col, segs=20, parent=root, cap_bottom=False)

    # Sculpted curved plump botanical leaves (smooth Subsurf teardrop blades with midrib fold!)
    n_leaves = 11 if tall else 9
    for i in range(n_leaves):
        ang = i * 2.39996 + (0.4 if tall else 0.0)  # golden angle!
        tier = i / float(n_leaves)
        stem_h = (0.28 + tier * 0.34) if tall else (0.18 + tier * 0.20)
        reach = (0.18 + (1.0 - tier) * 0.14) if tall else (0.16 + (1.0 - tier) * 0.12)
        c_dir = Vector((math.cos(ang), math.sin(ang), 0.0))

        # Curved green stem
        p0 = Vector((0, 0, 0.26)) + c_dir * 0.02
        p1 = p0 + c_dir * (reach * 0.45) + Vector((0, 0, stem_h * 0.65))
        p2 = p0 + c_dir * reach + Vector((0, 0, stem_h))
        add_curve_tube(f"{name}_Stem_{i}", [p0, p1, p2], 0.011, M["leaf_deep"], col, resolution=8, bevel_res=4, parent=root)

        # Plump curved teardrop leaf mesh with central vein crease + Subsurf!
        bm = bmesh.new()
        l_len = (0.22 + (1.0 - tier) * 0.07) if tall else (0.18 + (1.0 - tier) * 0.06)
        l_wid = l_len * 0.56
        # 5 cross-sections along leaf length: base -> wide belly -> tip
        secs = [
            (0.00, 0.014, 0.000, 0.00),
            (0.25, l_wid * 0.78, 0.022, 0.018),
            (0.55, l_wid * 1.00, 0.028, 0.024),
            (0.82, l_wid * 0.62, 0.008, 0.016),
            (1.00, 0.006, -0.028, 0.002),
        ]
        rows = []
        for frac, hw, arch_z, cup_z in secs:
            x = frac * l_len
            vL = bm.verts.new((x, -hw, arch_z + cup_z))
            vM = bm.verts.new((x, 0.0, arch_z))
            vR = bm.verts.new((x,  hw, arch_z + cup_z))
            rows.append((vL, vM, vR))
        for k in range(len(rows) - 1):
            bm.faces.new((rows[k][0], rows[k + 1][0], rows[k + 1][1], rows[k][1]))
            bm.faces.new((rows[k][1], rows[k + 1][1], rows[k + 1][2], rows[k][2]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        lmesh = bpy.data.meshes.new(f"{name}_Leaf_{i}")
        bm.to_mesh(lmesh)
        bm.free()

        lobj = bpy.data.objects.new(f"{name}_Leaf_{i}", lmesh)
        lobj.location = p2
        pitch = 0.25 + (1.0 - tier) * 0.38
        lobj.rotation_euler = Euler((0.0, pitch, ang))
        lobj.data.materials.append(M["leaf_bright"] if i % 2 == 0 else M["leaf_deep"])
        link_obj(lobj, col)
        lobj.parent = root
        sol = lobj.modifiers.new("Solidify", "SOLIDIFY")
        sol.thickness = 0.012
        sub = lobj.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = 2
        sub.render_levels = 2
        set_smooth(lobj, weighted=False)

    # Adorable tiny miniature Animal Crossing blooms rising cheerfully above the bush planter leaves!
    if not tall:
        bloom_specs = [
            (0.09, -0.10, 0.50, M["flower_yellow"]),
            (-0.11, -0.05, 0.48, M["flower_coral"]),
            (0.02,  0.11, 0.52, M["flower_yellow"]),
            (-0.04, -0.12, 0.45, M["flower_coral"]),
            (0.11,  0.04, 0.47, M["flower_coral"]),
        ]
        for bi, (bx, by, bz, fmat) in enumerate(bloom_specs):
            add_curve_tube(f"{name}_FStem_{bi}", [(bx * 0.25, by * 0.25, 0.27), (bx, by, bz)], 0.008, M["leaf_deep"], col, resolution=4, bevel_res=3, parent=root)
            add_cyl(f"{name}_FCtr_{bi}", (bx, by, bz + 0.008), 0.020, 0.018, M["flower_center"], col, segs=12, bevel=0.006, parent=root)
            for pk in range(5):
                pa = pk * math.tau / 5.0
                px_p = bx + math.cos(pa) * 0.033
                py_p = by + math.sin(pa) * 0.033
                add_cyl(f"{name}_FPet_{bi}_{pk}", (px_p, py_p, bz + 0.005), 0.020, 0.014, fmat, col, segs=10, bevel=0.005, parent=root)

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 9) PROP: Miniature Kraft Paper Takeaway Delivery Bag (Hooks onto Prop_Door_Hook!)
# ---------------------------------------------------------------------------
def build_delivery_bag(M):
    """Adorable crinkled kraft-paper ramen takeaway bag with twine loop handles (origin at top handle hang-point!)."""
    name = "Prop_Delivery_Bag"
    col = ensure_collection(name)
    root = make_root(name, col)

    # Origin (0,0,0) = exact top inner arch of the twine handle so placing at Hook_Hang_Point hangs effortlessly!
    # Curved twin brown twisted-paper handles arching from (0,0,0) down into the bag top cuff
    for sy in (-0.016, 0.016):
        h_pts = [(-0.042, sy, -0.115), (-0.036, sy, -0.042), (0.0, sy * 0.4, 0.0), (0.036, sy, -0.042), (0.042, sy, -0.115)]
        add_curve_tube(f"{name}_Handle_{sy}", h_pts, 0.0065, M["leather"], col, resolution=10, bevel_res=4, parent=root)

    # Plump tapered kraft-paper bag body with softly folded top cuff!
    bag = add_rounded_box(f"{name}_Body", (0.0, 0.0, -0.235), (0.19, 0.125, 0.24), M["kraft_paper"], col, bevel=0.024, segs=3, parent=root)
    # Folded paper cuff flap along top rim
    add_rounded_box(f"{name}_FoldTop", (0.0, -0.008, -0.128), (0.196, 0.132, 0.048), M["kraft_paper"], col, bevel=0.014, segs=2, parent=root)
    # Cute crimson round shop seal sticker + cream center dot on front (-Y) face!
    add_cyl(f"{name}_Sticker", (0.0, -0.068, -0.155), 0.026, 0.008, M["crate_red"], col, segs=18, bevel=0.002, rot=(math.pi * 0.5, 0, 0), parent=root)
    add_cyl(f"{name}_StickerDot", (0.0, -0.072, -0.155), 0.014, 0.006, M["enamel_white"], col, segs=14, rot=(math.pi * 0.5, 0, 0), parent=root)
    # Subtle side gusset crease detail
    for sx in (-0.095, 0.095):
        add_rounded_box(f"{name}_Gusset_{sx}", (sx, 0.0, -0.235), (0.010, 0.014, 0.20), M["leather"], col, bevel=0.003, parent=root)

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 6) PROP: Retro Japanese Mamachari Vintage Bicycle (Real Drivetrain, Hubs & Rims!)
#    Supports 1-click paint recolor via paint_mat (Teal / Mustard / Coral / Cream)!
# ---------------------------------------------------------------------------
def build_toothed_sprocket(name, center, r_pitch, r_inner, thickness, n_teeth, n_arms, mat, col, parent=None):
    """Build a crisp real 3D spoked & toothed bicycle chainring / freewheel cog in the XZ plane (axle along Y)."""
    cx, cy, cz = center
    # Outer toothed gear ring in XZ plane
    bm = bmesh.new()
    half_t = thickness * 0.5
    r_tip = r_pitch + min(0.0085, r_pitch * 0.14)
    r_root = r_pitch - min(0.0055, r_pitch * 0.09)
    n_pts = n_teeth * 4
    outer_f, outer_b, inner_f, inner_b = [], [], [], []
    for i in range(n_pts):
        ang = math.tau * i / n_pts
        step = i % 4
        # Crisp flat-topped trapezoidal bicycle sprocket tooth profile
        ro = r_tip if step in (1, 2) else r_root
        x_o, z_o = cx + ro * math.cos(ang), cz + ro * math.sin(ang)
        x_i, z_i = cx + r_inner * math.cos(ang), cz + r_inner * math.sin(ang)
        outer_f.append(bm.verts.new((x_o, cy - half_t, z_o)))
        outer_b.append(bm.verts.new((x_o, cy + half_t, z_o)))
        inner_f.append(bm.verts.new((x_i, cy - half_t, z_i)))
        inner_b.append(bm.verts.new((x_i, cy + half_t, z_i)))
    for i in range(n_pts):
        ni = (i + 1) % n_pts
        bm.faces.new((inner_f[i], outer_f[i], outer_f[ni], inner_f[ni]))
        bm.faces.new((outer_b[i], inner_b[i], inner_b[ni], outer_b[ni]))
        bm.faces.new((outer_f[i], outer_b[i], outer_b[ni], outer_f[ni]))
        bm.faces.new((inner_b[i], inner_f[i], inner_f[ni], inner_b[ni]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    link_obj(obj, col)
    if parent:
        obj.parent = parent
    set_smooth(obj, weighted=False)

    # Center spider hub boss + radial cutout arms connecting boss to toothed ring!
    r_boss = max(0.015, r_inner * 0.34)
    add_cyl(f"{name}_Boss", (cx, cy, cz), r_boss, thickness * 1.45, mat, col, segs=18, bevel=0.002, rot=(math.pi * 0.5, 0, 0), parent=parent)
    if n_arms > 0 and r_inner > r_boss + 0.008:
        arm_len = (r_inner - r_boss) + 0.010
        arm_r_mid = (r_boss + r_inner) * 0.5
        arm_w = max(0.010, r_pitch * 0.16)
        for k in range(n_arms):
            a = k * math.tau / n_arms + 0.20
            ax = cx + arm_r_mid * math.cos(a)
            az = cz + arm_r_mid * math.sin(a)
            add_rounded_box(f"{name}_Arm_{k}", (ax, cy, az), (arm_len, thickness * 0.92, arm_w),
                            mat, col, bevel=0.0025, segs=2, rot=(0.0, -a, 0.0), parent=parent)
    return obj


def build_vintage_bicycle(M, name="Prop_Vintage_Bicycle", paint_mat=None):
    col = ensure_collection(name)
    root = make_root(name, col)
    m_paint = paint_mat or M["bike_teal"]

    r_wheel = 0.305
    zc = r_wheel + 0.032
    wx_r, wx_f = -0.52, 0.52

    # 1) Front & Rear Wheels: balloon tire + real lathe-spun box-section chrome rim +
    #    real dual-flange lathe-spun hub + axle locknuts + 24 tangentially laced spokes + brass nipples!
    rim_profile = [
        (0.264, -0.013),
        (0.273, -0.017),
        (0.283, -0.017),
        (0.283, -0.011),
        (0.274, -0.008),
        (0.274,  0.008),
        (0.283,  0.011),
        (0.283,  0.017),
        (0.273,  0.017),
        (0.264,  0.013),
        (0.264, -0.013),
    ]
    hub_profile = [
        (0.007, -0.056),
        (0.014, -0.056),
        (0.014, -0.044),
        (0.019, -0.041),
        (0.019, -0.034),
        (0.036, -0.033),  # Right high hub flange (-Y side)
        (0.036, -0.027),
        (0.017, -0.023),  # Tapered hub barrel waist
        (0.015,  0.000),
        (0.017,  0.023),
        (0.036,  0.027),  # Left high hub flange (+Y side)
        (0.036,  0.033),
        (0.019,  0.034),
        (0.019,  0.041),
        (0.014,  0.044),
        (0.014,  0.056),
        (0.007,  0.056),
    ]

    for label, wx in (("Rear", wx_r), ("Front", wx_f)):
        # Plump balloon rubber tire torus
        t_pts = [(wx + r_wheel * math.cos(math.tau * i / 36), 0.0, zc + r_wheel * math.sin(math.tau * i / 36)) for i in range(36)]
        add_curve_tube(f"{name}_{label}Tire", t_pts, 0.030, M["rubber"], col, resolution=6, bevel_res=5, cyclic=True, parent=root)
        # Real lathe-spun aluminum/chrome box-section rim (wheel hub axis = Y -> rot_x = +pi/2)
        add_lathe(f"{name}_{label}Rim", rim_profile, (wx, 0.0, zc), M["chrome"], col, segs=36,
                  rot=(math.pi * 0.5, 0, 0), parent=root, cap_bottom=False, cap_top=False)
        # Real lathe-spun dual-flange bicycle hub!
        add_lathe(f"{name}_{label}Hub", hub_profile, (wx, 0.0, zc), M["chrome"], col, segs=22,
                  rot=(math.pi * 0.5, 0, 0), parent=root)
        # Hex axle locknuts & dropout washers on both ends of hub axle
        for sy in (-0.053, 0.053):
            add_cyl(f"{name}_{label}Nut_{sy}", (wx, sy, zc), 0.0135, 0.010, M["dark_metal"], col, segs=6, bevel=0.002,
                    rot=(math.pi * 0.5, 0, 0), parent=root)
        # Tiny brass Schrader tire valve stem poking inward from rim!
        add_cyl(f"{name}_{label}Valve", (wx, 0.0, zc - 0.252), 0.0045, 0.024, M["brass"], col, segs=8, bevel=0.001, parent=root)

        # 24 tangentially laced dual-flange wire spokes (12 per flange, crossed!) + brass nipples
        r_flange = 0.031
        r_nipple = 0.265
        n_per_side = 12
        for side_idx, sy in enumerate((-0.030, 0.030)):
            for k in range(n_per_side):
                a_rim = (k + side_idx * 0.5) * math.tau / n_per_side
                # Alternating leading/trailing tangential lace angle for realistic crossed spokes!
                lace = 0.42 if (k % 2 == 0) else -0.42
                a_hub = a_rim + lace
                p0 = (wx + r_flange * math.cos(a_hub), sy, zc + r_flange * math.sin(a_hub))
                p1 = (wx + r_nipple * math.cos(a_rim), 0.0, zc + r_nipple * math.sin(a_rim))
                add_curve_tube(f"{name}_{label}Spoke_{side_idx}_{k}", [p0, p1], 0.0026, M["chrome"], col,
                               resolution=2, bevel_res=2, parent=root, spline_type="POLY")
                # Brass spoke nipple where spoke seats into rim
                nx = wx + (r_nipple - 0.004) * math.cos(a_rim)
                nz = zc + (r_nipple - 0.004) * math.sin(a_rim)
                add_cyl(f"{name}_{label}Nip_{side_idx}_{k}", (nx, 0.0, nz), 0.0045, 0.011, M["brass"], col, segs=6,
                        bevel=0.0, rot=(0.0, math.pi * 0.5 - a_rim, 0.0), parent=root)

        # Curved glossy painted mudguard fender hugging upper wheel arc + slender chrome fender stays!
        f_ang0, f_ang1 = (0.32, 2.58) if label == "Rear" else (0.58, 2.76)
        f_pts = []
        for k in range(14):
            a = f_ang0 + (f_ang1 - f_ang0) * (k / 13.0)
            f_pts.append((wx + (r_wheel + 0.044) * math.cos(a), 0.0, zc + (r_wheel + 0.044) * math.sin(a)))
        add_curve_tube(f"{name}_{label}Fender", f_pts, 0.023, m_paint, col, resolution=6, bevel_res=4, parent=root)
        # Dual chrome V-stays anchoring fender tail to hub axle!
        a_stay = 2.48 if label == "Rear" else 2.66
        for sy in (-0.046, 0.046):
            p_fend = (wx + (r_wheel + 0.040) * math.cos(a_stay), sy * 0.35, zc + (r_wheel + 0.040) * math.sin(a_stay))
            add_curve_tube(f"{name}_{label}FendStay_{sy}", [(wx, sy, zc), p_fend], 0.0042, M["chrome"], col,
                           resolution=2, bevel_res=2, parent=root, spline_type="POLY")

    # 2) Step-through classic Japanese mamachari curved steel frame (single paint slot!)
    add_curve_tube(f"{name}_DownTube", [(0.36, 0, 0.78), (0.16, 0, 0.48), (-0.08, 0, 0.34)], 0.019, m_paint, col, parent=root)
    add_curve_tube(f"{name}_StepTube", [(0.38, 0, 0.68), (0.12, 0, 0.42), (-0.10, 0, 0.35)], 0.016, m_paint, col, parent=root)
    add_curve_tube(f"{name}_SeatTube", [(-0.08, 0, 0.33), (-0.22, 0, 0.76)], 0.019, m_paint, col, parent=root, spline_type="POLY")
    add_curve_tube(f"{name}_HeadTube", [(0.34, 0, 0.84), (0.41, 0, 0.62)], 0.022, m_paint, col, parent=root, spline_type="POLY")
    # Bottom bracket shell + chrome bearing cups
    add_cyl(f"{name}_BB", (-0.08, 0.0, 0.34), 0.026, 0.080, m_paint, col, segs=18, bevel=0.004, rot=(math.pi * 0.5, 0, 0), parent=root)
    add_cyl(f"{name}_BBAxle", (-0.08, 0.0, 0.34), 0.013, 0.132, M["chrome"], col, segs=14, bevel=0.002, rot=(math.pi * 0.5, 0, 0), parent=root)
    # Front fork legs + rear triangle stays (widened slightly at rear axle to clear hub & cog cleanly!)
    for sy in (-0.048, 0.048):
        add_curve_tube(f"{name}_Fork_{sy}", [(0.40, sy * 0.55, 0.64), (0.46, sy, 0.46), (wx_f, sy, zc)], 0.012, m_paint, col, parent=root)
        add_curve_tube(f"{name}_StayTop_{sy}", [(-0.20, sy * 0.45, 0.70), (wx_r, sy, zc)], 0.010, m_paint, col, parent=root, spline_type="POLY")
        add_curve_tube(f"{name}_StayBot_{sy}", [(-0.08, sy * 0.65, 0.34), (wx_r, sy, zc)], 0.0105, m_paint, col, parent=root, spline_type="POLY")

    # 3) REAL EXPOSED BICYCLE DRIVETRAIN (Right / -Y side: Toothed Chainring + Rear Cog + Chain + Cranks + Pedals!)
    y_drv = -0.046
    # Front 24-tooth 5-arm cutout chainring at bottom bracket (-0.08, y_drv, 0.34)
    build_toothed_sprocket(f"{name}_Chainring", (-0.08, y_drv, 0.34), r_pitch=0.084, r_inner=0.064,
                           thickness=0.008, n_teeth=24, n_arms=5, mat=M["chrome"], col=col, parent=root)
    # Rear 12-tooth freewheel cog on right rear hub (wx_r, -0.039, zc)
    build_toothed_sprocket(f"{name}_RearCog", (wx_r, -0.039, zc), r_pitch=0.034, r_inner=0.020,
                           thickness=0.009, n_teeth=12, n_arms=0, mat=M["chain_steel"], col=col, parent=root)

    # Exact external-tangent closed chain loop wrapping front chainring & rear cog!
    c1x, c1z, r1 = -0.08, 0.340, 0.086
    c2x, c2z, r2 = wx_r, zc, 0.036
    dx_c, dz_c = c2x - c1x, c2z - c1z
    dist_c = math.hypot(dx_c, dz_c)
    base_ang = math.atan2(dz_c, dx_c)
    alpha = math.acos(max(-0.99, min(0.99, (r1 - r2) / dist_c)))
    chain_pts = []
    # Wrap around front (+X) arc of front chainring from lower tangent to upper tangent
    a_start_f = base_ang - alpha
    a_end_f = base_ang + alpha - math.tau  # go around +X front side!
    # Ensure we traverse the +X side of c1 cleanly
    for i in range(13):
        t = i / 12.0
        a = (base_ang - alpha) + t * (2.0 * alpha - math.tau)
        # Check direction: base_ang is ~pi, alpha is ~1.46 -> base_ang - alpha ~ +1.68 (top-ish),
        # going clockwise through 0 (+X front) to base_ang + alpha - 2pi ~ -1.68 (bottom-ish)
        chain_pts.append((c1x + r1 * math.cos(a), y_drv, c1z + r1 * math.sin(a)))
    # Wrap around rear (-X) arc of rear cog from bottom tangent back to top tangent
    for i in range(9):
        t = i / 8.0
        a = (base_ang + alpha) - t * (2.0 * alpha)
        chain_pts.append((c2x + r2 * math.cos(a), -0.041, c2z + r2 * math.sin(a)))

    # Smooth continuous chain core + discrete gunmetal link plates along top & bottom runs!
    add_curve_tube(f"{name}_ChainLoop", chain_pts, 0.0068, M["chain_steel"], col,
                   resolution=4, bevel_res=3, cyclic=True, parent=root, spline_type="POLY")
    # Crisp outer chain-link beads along straight top & bottom tangent spans for unmistakable chain texture!
    p_f_top = (c1x + r1 * math.cos(base_ang - alpha), y_drv, c1z + r1 * math.sin(base_ang - alpha))
    p_r_top = (c2x + r2 * math.cos(base_ang - alpha), -0.041, c2z + r2 * math.sin(base_ang - alpha))
    p_f_bot = (c1x + r1 * math.cos(base_ang + alpha), y_drv, c1z + r1 * math.sin(base_ang + alpha))
    p_r_bot = (c2x + r2 * math.cos(base_ang + alpha), -0.041, c2z + r2 * math.sin(base_ang + alpha))
    for span_tag, pa, pb in (("Top", p_f_top, p_r_top), ("Bot", p_f_bot, p_r_bot)):
        va, vb = Vector(pa), Vector(pb)
        dv = vb - va
        ang_y = -math.atan2(dv.z, dv.x)
        n_links = 16
        for li in range(1, n_links):
            pos = va.lerp(vb, li / float(n_links))
            add_rounded_box(f"{name}_Link_{span_tag}_{li}", pos, (0.018, 0.015, 0.013),
                            M["dark_metal"] if li % 2 == 0 else M["chain_steel"], col,
                            bevel=0.003, segs=1, rot=(0.0, ang_y, 0.0), parent=root)

    # Forged Chrome Left & Right Crank Arms + Platform Pedals with Amber Reflectors!
    crank_len = 0.148
    for side_tag, sy_crank, cr_ang in (("R", -0.064, -0.58), ("L", 0.064, math.pi - 0.58)):
        px_e = -0.08 + crank_len * math.cos(cr_ang)
        pz_e =  0.34 + crank_len * math.sin(cr_ang)
        mx_c = (-0.08 + px_e) * 0.5
        mz_c = ( 0.34 + pz_e) * 0.5
        add_rounded_box(f"{name}_CrankArm_{side_tag}", (mx_c, sy_crank, mz_c), (crank_len + 0.024, 0.012, 0.022),
                        M["chrome"], col, bevel=0.004, segs=2, rot=(0.0, -cr_ang, 0.0), parent=root)
        # Crank pivot cap
        add_cyl(f"{name}_CrankCap_{side_tag}", (-0.08, sy_crank + (-0.006 if sy_crank < 0 else 0.006), 0.34),
                0.015, 0.008, M["dark_metal"], col, segs=14, bevel=0.002, rot=(math.pi * 0.5, 0, 0), parent=root)
        # Horizontal pedal spindle + chunky vintage rubber platform pedal + amber side reflectors!
        dir_y = -1.0 if sy_crank < 0 else 1.0
        py_ped = sy_crank + dir_y * 0.044
        add_cyl(f"{name}_PedSpindle_{side_tag}", (px_e, sy_crank + dir_y * 0.022, pz_e), 0.006, 0.046,
                M["chrome"], col, segs=10, rot=(math.pi * 0.5, 0, 0), parent=root)
        add_rounded_box(f"{name}_Pedal_{side_tag}", (px_e, py_ped, pz_e), (0.082, 0.064, 0.024),
                        M["rubber"], col, bevel=0.006, segs=2, parent=root)
        add_rounded_box(f"{name}_PedCage_{side_tag}", (px_e, py_ped, pz_e), (0.088, 0.068, 0.010),
                        M["chrome"], col, bevel=0.002, segs=1, parent=root)
        add_rounded_box(f"{name}_PedRefl_{side_tag}", (px_e + 0.044, py_ped, pz_e), (0.006, 0.036, 0.010),
                        M["pedal_amber"], col, bevel=0.001, segs=1, parent=root)

    # 4) Sprung leather saddle + seatpost
    add_curve_tube(f"{name}_SeatPost", [(-0.22, 0, 0.74), (-0.25, 0, 0.85)], 0.014, M["chrome"], col, parent=root, spline_type="POLY")
    add_rounded_box(f"{name}_Saddle", (-0.26, 0, 0.875), (0.23, 0.16, 0.065), M["leather"], col, bevel=0.026, segs=3, parent=root)

    # 5) Swept-back classic chrome handlebars + brown grips + brake levers + brass bell + retro headlight
    add_curve_tube(f"{name}_Stem", [(0.34, 0, 0.82), (0.31, 0, 0.96)], 0.015, M["chrome"], col, parent=root, spline_type="POLY")
    hb_pts = [(0.18, -0.24, 0.94), (0.29, -0.18, 0.97), (0.31, 0.0, 0.97), (0.29, 0.18, 0.97), (0.18, 0.24, 0.94)]
    add_curve_tube(f"{name}_Handlebar", hb_pts, 0.013, M["chrome"], col, resolution=12, parent=root)
    for sy in (-1, 1):
        add_curve_tube(f"{name}_Grip_{sy}", [(0.17, sy * 0.245, 0.935), (0.24, sy * 0.215, 0.955)], 0.018, M["leather"], col, parent=root, spline_type="POLY")
        add_curve_tube(f"{name}_BrakeLev_{sy}", [(0.26, sy * 0.19, 0.962), (0.29, sy * 0.22, 0.932), (0.23, sy * 0.24, 0.916)],
                       0.005, M["chrome"], col, resolution=4, bevel_res=2, parent=root, spline_type="POLY")
    add_cyl(f"{name}_Bell", (0.27, 0.14, 0.995), 0.024, 0.022, M["brass"], col, segs=16, bevel=0.008, parent=root)
    add_cyl(f"{name}_Headlamp", (0.48, 0.0, 0.70), 0.032, 0.055, M["chrome"], col, segs=16, rot=(0, math.pi * 0.5, 0), parent=root)

    # 6) Cute front woven wire basket with AI cedar wood floor!
    bx_k, bz_k = 0.52, 0.82
    add_rounded_box(f"{name}_BasketFloor", (bx_k, 0, bz_k - 0.10), (0.24, 0.30, 0.020), M["cedar"], col, bevel=0.006, parent=root)
    for z_ring, scale_r in [(bz_k - 0.09, 0.92), (bz_k, 0.98), (bz_k + 0.10, 1.04)]:
        hx, hy = 0.125 * scale_r, 0.155 * scale_r
        rpts = [(bx_k - hx, -hy, z_ring), (bx_k + hx, -hy, z_ring), (bx_k + hx, hy, z_ring), (bx_k - hx, hy, z_ring)]
        add_curve_tube(f"{name}_BasketRing", rpts, 0.007, M["dark_metal"], col, resolution=4, bevel_res=3, cyclic=True, parent=root, spline_type="POLY")
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = (bx_k + sx * 0.115, sy * 0.142, bz_k - 0.09)
            p1 = (bx_k + sx * 0.130, sy * 0.161, bz_k + 0.10)
            add_curve_tube(f"{name}_BasketPost", [p0, p1], 0.007, M["dark_metal"], col, resolution=2, bevel_res=3, parent=root, spline_type="POLY")

    # 7) Rear cargo rack WITH proper diagonal support stays down to rear hub axle + angled kickstand!
    add_rounded_box(f"{name}_Rack", (-0.54, 0, 0.72), (0.36, 0.16, 0.022), M["chrome"], col, bevel=0.006, parent=root)
    for sy in (-0.068, 0.068):
        add_curve_tube(f"{name}_RackStayR_{sy}", [(-0.68, sy, 0.715), (wx_r, sy * 0.82, zc)], 0.007, M["chrome"], col,
                       resolution=2, bevel_res=3, parent=root, spline_type="POLY")
        add_curve_tube(f"{name}_RackStayF_{sy}", [(-0.38, sy, 0.715), (-0.21, sy * 0.55, 0.71)], 0.007, M["chrome"], col,
                       resolution=2, bevel_res=3, parent=root, spline_type="POLY")
    add_curve_tube(f"{name}_Kickstand", [(-0.52, 0.055, zc), (-0.60, 0.16, 0.015)], 0.010, M["dark_metal"], col, parent=root, spline_type="POLY")

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 7) PROP: Wooden Chalkboard A-Frame Menu Stand (With Tiny Chalk Sticks!)
# ---------------------------------------------------------------------------
def build_aframe_menu(M):
    name = "Prop_AFrame_Menu"
    col = ensure_collection(name)
    root = make_root(name, col)

    W, H = 0.56, 0.86
    tilt = 0.21  # ~12 deg symmetric A-frame splay
    # Front panel tilted cleanly backward (+tilt around X rotates +Z toward -Y? Wait: verify!
    # In right-handed Blender coords, rot_x(+a) sends (0, 0, +z) -> (0, -z*sin(a), z*cos(a)),
    # so top moves toward -Y (forward). We want FRONT leg to lean BACKWARD (top toward +Y) -> rot_x(-tilt)!
    # And REAR leg to lean FORWARD (top toward -Y) -> rot_x(+tilt)!)
    # Let's place hinge apex at (0, 0, 0.85) so front & back frames meet cleanly at the top!
    apex_z = 0.85
    half_h = 0.43
    # Front face center offset from apex along front panel vector (0, -sin(tilt), -cos(tilt))
    fy = -half_h * math.sin(tilt)
    fz = apex_z - half_h * math.cos(tilt)
    by = +half_h * math.sin(tilt)

    # Front timber easel frame (left/right legs + top/bottom rails + recessed chalkboard backing)
    front_grp = make_root(f"{name}_FrontPivot", col)
    front_grp.location = Vector((0, fy, fz))
    front_grp.rotation_euler = Euler((-tilt, 0, 0))
    front_grp.parent = root

    for sx in (-W * 0.5 + 0.026, W * 0.5 - 0.026):
        add_rounded_box(f"{name}_FLeg", (sx, 0, -0.02), (0.048, 0.036, 0.90), M["cedar"], col, bevel=0.011, parent=front_grp)
    add_rounded_box(f"{name}_FTop", (0, 0, 0.41), (W, 0.038, 0.052), M["cedar"], col, bevel=0.011, parent=front_grp)
    add_rounded_box(f"{name}_FBot", (0, 0, -0.32), (W, 0.038, 0.052), M["cedar"], col, bevel=0.011, parent=front_grp)
    add_rounded_box(f"{name}_Board", (0, 0.006, 0.045), (W - 0.08, 0.020, 0.70), M["cedar_dark"], col, bevel=0.005, parent=front_grp)
    # Crisp illustrated ramen chalkboard art sitting cleanly on front (-Y) face of board!
    add_uv_quad(f"{name}_MenuArt", (0, -0.008, 0.045), W - 0.10, 0.67, M["menu_chalk"], col, facing="-Y", parent=front_grp)
    # Cute chalk ledge + two miniature chalk sticks sitting on it!
    add_rounded_box(f"{name}_ChalkLedge", (0, -0.028, -0.30), (W - 0.10, 0.042, 0.022), M["cedar"], col, bevel=0.006, parent=front_grp)
    add_cyl(f"{name}_Chalk1", (-0.09, -0.032, -0.282), 0.007, 0.068, M["chalk_white"], col, segs=10, rot=(0, math.pi * 0.5, 0.12), parent=front_grp)
    add_cyl(f"{name}_Chalk2", (0.04, -0.032, -0.282), 0.007, 0.056, M["chalk_coral"], col, segs=10, rot=(0, math.pi * 0.5, -0.08), parent=front_grp)

    # Rear timber support easel frame
    rear_grp = make_root(f"{name}_RearPivot", col)
    rear_grp.location = Vector((0, by, fz))
    rear_grp.rotation_euler = Euler((+tilt, 0, 0))
    rear_grp.parent = root
    for sx in (-W * 0.5 + 0.026, W * 0.5 - 0.026):
        add_rounded_box(f"{name}_RLeg", (sx, 0, -0.02), (0.048, 0.036, 0.90), M["cedar"], col, bevel=0.011, parent=rear_grp)
    add_rounded_box(f"{name}_RTop", (0, 0, 0.41), (W, 0.038, 0.052), M["cedar"], col, bevel=0.011, parent=rear_grp)
    add_rounded_box(f"{name}_RBot", (0, 0, -0.24), (W - 0.04, 0.032, 0.044), M["cedar"], col, bevel=0.010, parent=rear_grp)

    # Brass apex hinge pins + gentle sagging stay chains on left & right!
    for sx in (-W * 0.5 + 0.026, W * 0.5 - 0.026):
        add_cyl(f"{name}_Hinge", (sx, 0, apex_z), 0.014, 0.065, M["brass"], col, segs=14, rot=(0, math.pi * 0.5, 0), parent=root)
        chain_pts = [(sx, -0.11, 0.34), (sx, 0.0, 0.30), (sx, 0.11, 0.34)]
        add_curve_tube(f"{name}_Chain", chain_pts, 0.005, M["brass"], col, resolution=6, bevel_res=3, parent=root)

    # Flatten nested sub-pivots safely
    for sub in (front_grp, rear_grp):
        for ch in list(sub.children):
            apply_all_modifiers(ch)
            set_smooth(ch, weighted=False)
    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# 8) PROP: Plump Ribbed Japanese Chochin Paper Lantern (Subsurface Glow!)
# ---------------------------------------------------------------------------
def build_chochin_lantern(M):
    name = "Prop_Chochin_Lantern"
    col = ensure_collection(name)
    root = make_root(name, col)

    # Origin at wall-mount back (y=0, z=0), lantern hangs cleanly at y=-0.22
    # Curved wrought-iron wall bracket
    add_rounded_box(f"{name}_WallPlate", (0, -0.012, 0.24), (0.065, 0.024, 0.16), M["lacquer_black"], col, bevel=0.008, parent=root)
    arm_pts = [(0, -0.01, 0.28), (0, -0.14, 0.30), (0, -0.22, 0.25), (0, -0.22, 0.20)]
    add_curve_tube(f"{name}_Bracket", arm_pts, 0.011, M["lacquer_black"], col, resolution=10, bevel_res=4, parent=root)

    # Sculpted ribbed oval rice-paper body (lathe profile with gentle bamboo rib ripples!)
    prof = []
    n_seg_z = 26
    for i in range(n_seg_z + 1):
        t = i / float(n_seg_z)
        z = -0.18 + t * 0.34
        # Plump oval radius + subtle horizontal bamboo rib waves
        ell = math.sin(t * math.pi)
        rib = 1.0 + 0.032 * math.sin(t * math.pi * 14.0)
        r = (0.062 + 0.066 * (ell ** 0.72)) * rib
        prof.append((r, z))
    add_lathe(f"{name}_PaperBody", prof, (0, -0.22, 0.0), M["lantern_paper"], col, segs=28, parent=root)

    # Glossy lacquered black top & bottom end-caps + gold trim rings
    add_cyl(f"{name}_CapTop", (0, -0.22, 0.172), 0.068, 0.032, M["lacquer_black"], col, segs=24, bevel=0.007, parent=root)
    add_cyl(f"{name}_CapBot", (0, -0.22, -0.192), 0.064, 0.030, M["lacquer_black"], col, segs=24, bevel=0.007, parent=root)
    add_cyl(f"{name}_BrassTop", (0, -0.22, 0.154), 0.070, 0.010, M["brass"], col, segs=24, bevel=0.002, parent=root)
    add_cyl(f"{name}_BrassBot", (0, -0.22, -0.176), 0.066, 0.010, M["brass"], col, segs=24, bevel=0.002, parent=root)
    # Cute crimson silk tassel hanging under bottom cap
    add_cyl(f"{name}_Tassel", (0, -0.22, -0.242), 0.018, 0.072, M["crate_red"], col, segs=12, bevel=0.005, parent=root, r_top=0.008)

    return join_prop_meshes(root)


# ---------------------------------------------------------------------------
# Export Individual GLBs + Save Editable Shared-Props.blend + Studio Showcase Render!
# ---------------------------------------------------------------------------
def export_single_prop(root_empty, glb_path):
    """Export one prop (root + all recursive descendants) at origin as a clean standalone GLB."""
    bpy.ops.object.select_all(action="DESELECT")
    saved_loc = root_empty.location.copy()
    root_empty.location = Vector((0, 0, 0))

    def select_tree(o):
        o.select_set(True)
        for c in o.children:
            select_tree(c)

    select_tree(root_empty)
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
    )
    root_empty.location = saved_loc
    bpy.ops.object.select_all(action="DESELECT")


def setup_cycles_metal(samples=40, res=(1440, 810)):
    """Configure Cycles CPU + OpenImageDenoise (avoids macOS Metal binary archive crash in Blender 5.2 headless)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 3
    scene.cycles.transparent_max_bounces = 3
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Punchy"
    except Exception:
        scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.15


def render_props_showcase(props_layout):
    """Render a sunny miniature-diorama Cycles inspection sheet of all shared props."""
    col = ensure_collection("_ShowcaseStage")
    # Clean warm pastel studio sweep floor
    mat_floor = make_diorama_mat("_Stage_Floor", 0xF5EFE2, roughness=0.72, bump_strength=0.015, ao_tint=0.05)
    add_rounded_box("_StageFloor", (0, 0.5, -0.05), (14.0, 10.0, 0.10), mat_floor, col, bevel=0.01)

    # Sunny coastal sky world
    world = bpy.data.worlds.new("DioramaWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = hex_rgba(0x98D2F0)
    bg.inputs["Strength"].default_value = 0.95
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Warm golden sun + soft sky bounce fill
    sun_d = bpy.data.lights.new("SunKey", type="SUN")
    sun_d.energy = 3.8
    sun_d.color = (1.0, 0.95, 0.84)
    sun_d.angle = math.radians(3.5)
    sun = bpy.data.objects.new("SunKey", sun_d)
    sun.rotation_euler = Euler((math.radians(48), math.radians(12), math.radians(-38)))
    link_obj(sun, col)

    # Arrange props neatly on turntable line for visual QA
    for obj, pos in props_layout:
        obj.location = Vector(pos)

    cam_d = bpy.data.cameras.new("ShowcaseCam")
    cam_d.lens = 48
    cam = bpy.data.objects.new("ShowcaseCam", cam_d)
    cam.location = Vector((-0.15, -6.75, 2.40))
    direction = Vector((-0.15, 0.0, 0.68)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    link_obj(cam, col)
    bpy.context.scene.camera = cam

    setup_cycles_metal(samples=28, res=(1440, 810))
    bpy.context.scene.render.filepath = str(QA_DIR / "00-shared-props-showcase.png")
    bpy.ops.render.render(write_still=True)

    # Also shoot a tight bicycle mechanical close-up (drivetrain, spoked hubs, rims, pedals!)
    cam_b_d = bpy.data.cameras.new("BikeCloseCam")
    cam_b_d.lens = 58
    cam_b = bpy.data.objects.new("BikeCloseCam", cam_b_d)
    cam_b.location = Vector((-0.18, -2.05, 0.62))
    cam_b.rotation_euler = (Vector((-0.10, -0.25, 0.48)) - cam_b.location).to_track_quat("-Z", "Y").to_euler()
    link_obj(cam_b, col)
    bpy.context.scene.camera = cam_b
    setup_cycles_metal(samples=28, res=(1280, 800))
    bpy.context.scene.render.filepath = str(QA_DIR / "00b-bicycle-closeup.png")
    bpy.ops.render.render(write_still=True)

    # Remove temporary stage before saving clean Shared-Props.blend
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(col)
    for obj, _ in props_layout:
        obj.location = Vector((0, 0, 0))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = build_prop_materials()

    p_vend_w = build_vending_machine("Prop_Vending_White", "white", M)
    p_vend_p = build_vending_machine("Prop_Vending_Pink", "pink", M)
    p_ac = build_ac_unit(M)
    p_hook = build_door_hook(M)
    p_crate_y = build_bottle_crate("Prop_Bottle_Crate_Yellow", M["crate_yellow"], M, with_bottles=True)
    p_crate_b = build_bottle_crate("Prop_Bottle_Crate_Blue", M["crate_blue"], M, with_bottles=False)
    p_crate_r = build_bottle_crate("Prop_Bottle_Crate_Red", M["crate_red"], M, with_bottles=False)
    p_crate_g = build_bottle_crate("Prop_Bottle_Crate_Green", M["crate_green"], M, with_bottles=False)
    p_plant_a = build_potted_plant("Prop_Potted_Plant_Tall", "tall", M)
    p_plant_b = build_potted_plant("Prop_Potted_Plant_Bush", "bush", M)
    p_bike = build_vintage_bicycle(M, "Prop_Vintage_Bicycle", M["bike_teal"])
    p_bike_mustard = build_vintage_bicycle(M, "Prop_Vintage_Bicycle_Mustard", M["bike_mustard"])
    p_menu = build_aframe_menu(M)
    p_lantern = build_chochin_lantern(M)
    p_bag = build_delivery_bag(M)

    # Export standalone reusable GLBs (each centered cleanly at origin)
    exports = [
        (p_vend_w, "prop_vending_white.glb"),
        (p_vend_p, "prop_vending_pink.glb"),
        (p_ac, "prop_ac_unit.glb"),
        (p_hook, "prop_door_hook.glb"),
        (p_crate_y, "prop_bottle_crate.glb"),
        (p_plant_a, "prop_potted_plant.glb"),
        (p_bike, "prop_vintage_bicycle.glb"),
        (p_menu, "prop_aframe_menu.glb"),
        (p_lantern, "prop_chochin_lantern.glb"),
        (p_bag, "prop_delivery_bag.glb"),
    ]
    for obj, fname in exports:
        export_single_prop(obj, OUT_DIR / fname)
        print(f"  [exported] {fname}")

    # Park mustard color-variant bike neatly behind-left on showcase so 1-click recolor is proven!
    showcase_layout = [
        (p_vend_w, (-2.35, 0.35, 0.0)),
        (p_vend_p, (-1.40, 0.35, 0.0)),
        (p_bike, (-0.10, -0.25, 0.0)),
        (p_bike_mustard, (-0.52, 0.62, 0.0)),
        (p_menu, (1.10, -0.35, 0.0)),
        (p_crate_y, (1.78, -0.28, 0.0)),
        (p_crate_b, (2.28, -0.28, 0.0)),
        (p_crate_r, (2.28, -0.28, 0.27)),
        (p_crate_g, (2.28, -0.28, 0.54)),
        (p_plant_a, (-2.98, -0.30, 0.0)),
        (p_plant_b, (-2.55, -0.62, 0.0)),
        (p_ac, (0.35, 0.80, 0.82)),
        (p_lantern, (1.50, 0.72, 1.08)),
        (p_hook, (2.22, 0.65, 1.12)),
        (p_bag, (2.22, 0.575, 1.04)),
    ]
    render_props_showcase(showcase_layout)

    # Save clean editable Shared-Props.blend with all props parked at origin in their own collections
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_DIR / "Shared-Props.blend"))
    print("Saved Shared-Props.blend and 00-shared-props-showcase.png")


if __name__ == "__main__":
    main()
