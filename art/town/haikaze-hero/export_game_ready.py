"""
Gate 2 Cycles-Lightmapped Game-Ready Exporter for Haikaze-so Hero Building (Blender 5.2.3 LTS)
=============================================================================================
Fast single-pass Cycles CPU + OpenImageDenoise baker (~50s total for BOTH 2K Day + Night maps!):
  1. Joins all opaque hero + sculpted corner sidewalk meshes into ONE multi-material Cycles bake
     mesh so `bpy.ops.object.bake()` runs 1 unified BVH + 1 OIDN pass (7x faster, zero seams!).
  2. Weights `UVMap_LM` (TEXCOORD_1) 3.2x toward hero architecture (walls, slabs, 2F deck, stairs,
     sidewalk, doors, awning) so architectural surfaces get ~78% of the 2048x2048 atlas ->
     razor-sharp Cycles railing, awning, bicycle & eaves shadows!
  3. Bakes `haikaze-lm-day.webp` & `haikaze-lm-night.webp` using the EXACT `build_haikaze_hero.py`
     Day/Night Cycles lighting (`MAX_RANGE = 4.0`, sqrt-encoded Linear WebP -> zero banding/clipping).
  4. Exports `haikaze-hero-game.glb` (1024px WebP AI PBR + Clearcoat + dual UVs, zero Draco WASM).

Run:
  blender --background --factory-startup --python-exit-code 2 --python art/town/haikaze-hero/export_game_ready.py
"""
import math
import sys
import time
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
TEX_DIR = ROOT / "art" / "shared" / "textures"
QA_LM_DIR = ROOT / "output" / "qa" / "lightmap-preview"
BLEND_IN = HERE / "Haikaze-Hero.blend"
GLB_OUT = HERE / "haikaze-hero-game.glb"
LM_DAY_OUT = HERE / "haikaze-lm-day.webp"
LM_NIGHT_OUT = HERE / "haikaze-lm-night.webp"

sys.path.insert(0, str(HERE))
import build_haikaze_hero as BH

LM_RES = 2048
LM_MAX_RANGE = 4.0
BAKE_SAMPLES_DAY = 36
BAKE_SAMPLES_NIGHT = 48

# Hero architectural materials boosted 2.8x in UVMap_LM so walls/sidewalk/2F/stairs get ~75% of the 2K atlas!
HERO_LM_BOOST_MATS = {
    "Arch_Plaster_Cream", "Arch_Sage_Concrete", "Arch_Deck_Cream", "Arch_Cedar_Warm",
    "_Stg_Sidewalk", "_Stg_Curb", "Arch_Teal_Door", "Arch_Apt_Door", "Arch_Teal_Steel",
    "Arch_Teal_Tread", "Arch_Stair_Tread", "Arch_Mosaic_Tiles", "Arch_Noren",
    "Arch_Sign_Board_Cream", "Arch_Awning_Coral", "Arch_Awning_Cream",
    "Arch_Room_Interior", "Arch_Shop_Interior", "Arch_Curtain_Cream",
    "Arch_Curtain_Blue", "Arch_Roof_Floor", "Arch_Plinth_Stone", "Prop_Vending_White",
    "Prop_Vending_Pink", "Prop_Menu_Chalkboard", "Arch_Poster_Summer",
}
MID_LM_BOOST_MATS = {
    "Arch_Gull_White", "Arch_Gull_Grey", "Arch_Gull_Beak", "Arch_Water_Tank",
    "Arch_Pipe_White", "Arch_Cloth_Yellow", "Arch_Cloth_Sky", "Arch_Cloth_Coral",
    "Arch_Sign_Ink", "Prop_Lantern_Paper", "Arch_Porch_Lamp",
}

AI_SURFACE_SPECS = {
    "Arch_Plaster_Cream": {
        "color": "tex_plaster_cream.png", "normal": "tex_plaster_cream_normal.png",
        "scale": 0.38, "rough": 0.80, "coat": 0.0, "nstr": 0.10, "sat": 1.12, "val": 0.96, "res": 1024,
        "soft_blend": (0.955, 0.920, 0.845, 0.34),  # Silky storybook gouache stucco matching Cycles!
    },
    "Arch_Sage_Concrete": {
        "color": "tex_sage_concrete.png", "normal": "tex_sage_concrete_normal.png",
        "scale": 0.40, "rough": 0.74, "coat": 0.0, "nstr": 0.12, "sat": 1.24, "val": 0.72, "res": 1024,
        "soft_blend": (0.58, 0.68, 0.56, 0.22),
    },
    "Arch_Cedar_Warm": {
        "color": "tex_wood_cedar.png", "normal": "tex_wood_cedar_normal.png",
        "scale": 0.82, "rough": 0.48, "coat": 0.18, "nstr": 0.16, "sat": 1.20, "val": 0.70, "res": 1024,
    },
    "Prop_Warm_Cedar": {
        "color": "tex_wood_cedar.png", "normal": "tex_wood_cedar_normal.png",
        "scale": 0.85, "rough": 0.48, "coat": 0.18, "nstr": 0.16, "sat": 1.20, "val": 0.70, "res": 1024,
    },
    "Arch_Deck_Cream": {
        "color": "tex_deck_tiles.png", "normal": "tex_deck_tiles_normal.png",
        "scale": 0.48, "rough": 0.78, "coat": 0.05, "nstr": 0.14, "sat": 1.10, "val": 0.90, "res": 1024,
        "soft_blend": (0.86, 0.84, 0.78, 0.20),
    },
    "_Stg_Sidewalk": {
        "color": "tex_deck_tiles.png", "normal": "tex_deck_tiles_normal.png",
        "scale": 0.52, "rough": 0.78, "coat": 0.05, "nstr": 0.12, "sat": 1.08, "val": 0.88, "res": 1024,
        "soft_blend": (0.86, 0.85, 0.81, 0.25),
    },
}

IMAGE_GRAPHIC_SPECS = {
    "Arch_Mosaic_Tiles":    ("tex_mosaic_tiles.png", "tex_mosaic_tiles_normal.png", "tex_mosaic_tiles_roughness.png", 0.16, 0.55, 0.72, 0.0, 1024),
    "Arch_Noren":           ("tex_noren_4panel.png", "tex_noren_normal.png", None, 0.86, 0.20, 0.0, 0.0, 1024),
    "Arch_Plaque_Haikaze":  ("tex_plaque_haikaze.png", None, None, 0.24, 0.45, 0.40, 0.0, 512),
    "Arch_Plaque_Vertical": ("tex_plaque_vertical.png", None, None, 0.50, 0.12, 0.12, 0.0, 512),
    "Arch_Poster_Summer":   ("tex_poster_summer.png", None, None, 0.44, 0.10, 0.10, 0.0, 768),
    "Arch_Plaque_201":      ("tex_apt_plaque_201.png", None, None, 0.24, 0.40, 0.35, 0.0, 256),
    "Arch_Plaque_202":      ("tex_apt_plaque_202.png", None, None, 0.24, 0.40, 0.35, 0.0, 256),
    "Arch_Welcome_Mat":     ("tex_welcome_mat.png", None, None, 0.92, 0.0, 0.0, 0.0, 512),
    "Prop_Menu_Chalkboard": ("tex_menu_chalkboard.png", None, None, 0.82, 0.0, 0.0, 0.0, 768),
    "Prop_VendingPoster_White": ("tex_vending_poster_white.png", None, None, 0.26, 0.35, 0.25, 0.18, 512),
    "Prop_VendingPoster_Pink":  ("tex_vending_poster_pink.png", None, None, 0.26, 0.35, 0.25, 0.18, 512),
}

SPECIAL_MATERIALS = {
    "Arch_Window_Glass":     {"rgba": (0.76, 0.90, 0.98, 0.24), "rough": 0.05, "metal": 0.08, "coat": 0.80, "blend": True},
    "Arch_Room_Interior":    {"rgba": (0.97, 0.89, 0.72, 1.0), "rough": 0.85, "metal": 0.0, "emissive": (1.0, 0.84, 0.50), "estr": 0.22},
    "Arch_Shop_Interior":    {"rgba": (0.98, 0.86, 0.62, 1.0), "rough": 0.80, "metal": 0.0, "emissive": (1.0, 0.80, 0.44), "estr": 0.45},
    "Arch_Curtain_Cream":    {"rgba": (0.96, 0.93, 0.85, 1.0), "rough": 0.88, "metal": 0.0, "emissive": (1.0, 0.82, 0.50), "estr": 0.0},
    "Arch_Curtain_Blue":     {"rgba": (0.70, 0.82, 0.88, 1.0), "rough": 0.88, "metal": 0.0, "emissive": (1.0, 0.86, 0.58), "estr": 0.0},
    "Arch_Porch_Lamp":       {"rgba": (1.00, 0.95, 0.80, 1.0), "rough": 0.20, "metal": 0.0, "emissive": (1.0, 0.82, 0.46), "estr": 0.55},
    "Arch_Sign_Board_Cream": {"rgba": (0.98, 0.94, 0.85, 1.0), "rough": 0.42, "metal": 0.0, "emissive": (1.0, 0.92, 0.74), "estr": 0.06},
    "Prop_Lantern_Paper":    {"rgba": (1.00, 0.94, 0.80, 1.0), "rough": 0.65, "metal": 0.0, "emissive": (1.0, 0.76, 0.40), "estr": 0.45},
}

VENDING_GLOW_COLORS = {
    "Prop_Showcase_Glow": (1.00, 0.98, 0.90),
    "Prop_LED_Cold":      (0.28, 0.74, 1.00),
    "Prop_LED_Hot":       (1.00, 0.38, 0.32),
    "Prop_LED_Button":    (0.98, 0.95, 0.86),
    "Prop_LED_Green":     (0.32, 0.96, 0.54),
}

KEEP_STAGE_PREFIXES = ("_Stg_Sidewalk", "_Stg_CurbFront", "_Stg_CurbRight", "_Stg_Grate")


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def extract_solid_props(mat):
    rgba = (0.75, 0.75, 0.75, 1.0)
    rough, metal = 0.55, 0.0
    if not mat or not mat.node_tree:
        return rgba, rough, metal
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        rough = float(bsdf.inputs["Roughness"].default_value)
        metal = float(bsdf.inputs["Metallic"].default_value)
        bc = bsdf.inputs["Base Color"].default_value
        rgba = (float(bc[0]), float(bc[1]), float(bc[2]), 1.0)
    ao = next((n for n in nt.nodes if n.type == "AMBIENT_OCCLUSION"), None)
    if ao:
        c = ao.inputs["Color"].default_value
        rgba = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    return rgba, rough, metal


def pick_solid_bucket(mname, rough, metal):
    if "Leaf" in mname:
        return "Game_Solid_Foliage"
    if metal >= 0.45:
        return "Game_Solid_Metal"
    if rough <= 0.46:
        return "Game_Solid_Satin"
    return "Game_Solid_Matte"


def make_vc_bucket_mat(name, rough, metal, coat=0.0, emissive_str=0.0):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat > 0.0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.14
    if emissive_str > 0.0:
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.96, 0.88, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emissive_str
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_special_gltf_mat(name, spec):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    r, g, b, a = spec["rgba"]
    bsdf.inputs["Base Color"].default_value = (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1.0)
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    bsdf.inputs["Metallic"].default_value = spec["metal"]
    if spec.get("coat", 0.0) > 0.0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = spec["coat"]
        bsdf.inputs["Coat Roughness"].default_value = 0.06
    if spec.get("blend"):
        bsdf.inputs["Alpha"].default_value = a
        mat.blend_method = "BLEND"
    if "emissive" in spec:
        er, eg, eb = spec["emissive"]
        bsdf.inputs["Emission Color"].default_value = (srgb_to_lin(er), srgb_to_lin(eg), srgb_to_lin(eb), 1.0)
        bsdf.inputs["Emission Strength"].default_value = spec.get("estr", 1.0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def prepare_calibrated_image(src_name, max_dim=1024, sat=1.0, val=1.0, colorspace="sRGB", soft_blend=None):
    src = TEX_DIR / src_name
    sb_tag = f"_sb{int(soft_blend[3]*100)}" if soft_blend else ""
    key = f"cal_{max_dim}_{int(sat*100)}_{int(val*100)}{sb_tag}_{src_name}"
    if key in bpy.data.images:
        return bpy.data.images[key]
    bimg = bpy.data.images.load(str(src), check_existing=False)
    bimg.name = key
    w, h = bimg.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        bimg.scale(max(16, int(round(w * scale))), max(16, int(round(h * scale))))
        w, h = bimg.size
    if colorspace == "sRGB" and (abs(sat - 1.0) > 1e-3 or abs(val - 1.0) > 1e-3 or soft_blend):
        arr = np.empty(w * h * 4, dtype=np.float32)
        bimg.pixels.foreach_get(arr)
        rgba = arr.reshape((-1, 4))
        rgb = rgba[:, :3]
        if soft_blend:
            sr, sg, sb, sf = soft_blend
            target = np.array([sr, sg, sb], dtype=np.float32)
            rgb = rgb * (1.0 - sf) + target * sf
        if abs(sat - 1.0) > 1e-3:
            luma = rgb[:, 0:1] * 0.2126 + rgb[:, 1:2] * 0.7152 + rgb[:, 2:3] * 0.0722
            rgb = np.clip(luma + (rgb - luma) * sat, 0.0, 1.0)
        if abs(val - 1.0) > 1e-3:
            rgb = np.clip(rgb * val, 0.0, 1.0)
        rgba[:, :3] = rgb
        bimg.pixels.foreach_set(rgba.ravel())
        bimg.update()
    bimg.colorspace_settings.name = colorspace
    bimg.pack()
    return bimg


def make_gltf_image_mat(name, color_file, normal_file, rough_file, rough, nstr, coat, estr, max_dim, sat=1.0, val=1.0, use_vc_ao=False, soft_blend=None):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    t_col = nt.nodes.new("ShaderNodeTexImage")
    t_col.image = prepare_calibrated_image(color_file, max_dim=max_dim, sat=sat, val=val, colorspace="sRGB", soft_blend=soft_blend)
    if use_vc_ao:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(t_col.outputs["Color"], mix.inputs["A"])
        nt.links.new(vc.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        nt.links.new(t_col.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_file and (TEX_DIR / rough_file).exists():
        t_rgh = nt.nodes.new("ShaderNodeTexImage")
        t_rgh.image = prepare_calibrated_image(rough_file, max_dim=max_dim, colorspace="Non-Color")
        nt.links.new(t_rgh.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = rough

    if coat > 0.0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.14

    if normal_file and (TEX_DIR / normal_file).exists():
        t_nrm = nt.nodes.new("ShaderNodeTexImage")
        t_nrm.image = prepare_calibrated_image(normal_file, max_dim=max_dim, colorspace="Non-Color")
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = nstr
        nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    if estr > 0:
        nt.links.new(t_col.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = estr
    return mat


def write_world_cubic_uvs(obj, tex_scale):
    mesh = obj.data
    mw = obj.matrix_world
    nmat = mw.to_3x3().inverted_safe().transposed()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        wn = (nmat @ f.normal).normalized()
        ax, ay, az = abs(wn.x), abs(wn.y), abs(wn.z)
        for loop in f.loops:
            wp = mw @ loop.vert.co
            if az >= ax and az >= ay:
                u, v = wp.x * tex_scale, wp.y * tex_scale
            elif ay >= ax:
                u, v = wp.x * tex_scale, wp.z * tex_scale
            else:
                u, v = wp.y * tex_scale, wp.z * tex_scale
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def build_scene_bvh(mesh_objs):
    verts, polys = [], []
    offset = 0
    for obj in mesh_objs:
        if obj.data.materials and obj.data.materials[0] and "Glass" in obj.data.materials[0].name:
            continue
        me = obj.data
        mw = obj.matrix_world
        for v in me.vertices:
            verts.append(mw @ v.co)
        me.calc_loop_triangles()
        for tri in me.loop_triangles:
            polys.append((offset + tri.vertices[0], offset + tri.vertices[1], offset + tri.vertices[2]))
        offset += len(me.vertices)
    return BVHTree.FromPolygons(verts, polys)


AO_DIRS = [
    Vector((0.0, 0.0, 1.0)),
    Vector((0.70, 0.0, 0.71)).normalized(),
    Vector((-0.70, 0.0, 0.71)).normalized(),
    Vector((0.0, 0.70, 0.71)).normalized(),
    Vector((0.0, -0.70, 0.71)).normalized(),
]


def bake_vertex_color_and_ao(obj, base_lin_rgb, bvh, ao_strength=0.10, ao_dist=0.26):
    me = obj.data
    n_verts = len(me.vertices)
    n_loops = len(me.loops)
    if n_loops == 0:
        return
    mw = obj.matrix_world
    nmat = mw.to_3x3().inverted_safe().transposed()
    v_ao = np.ones(n_verts, dtype=np.float32)

    if bvh is not None and ao_strength > 0.0:
        inv_rays = 1.0 / float(len(AO_DIRS))
        min_ao = 1.0 - ao_strength
        for i, v in enumerate(me.vertices):
            wp = mw @ v.co
            wn = (nmat @ v.normal).normalized()
            if wn.length_squared < 1e-6:
                continue
            ref = Vector((0, 0, 1)) if abs(wn.z) < 0.9 else Vector((1, 0, 0))
            t1 = wn.cross(ref).normalized()
            t2 = wn.cross(t1).normalized()
            hits = 0.0
            origin = wp + wn * 0.012
            for d in AO_DIRS:
                wdir = (t1 * d.x + t2 * d.y + wn * d.z).normalized()
                loc, _n, _idx, dist = bvh.ray_cast(origin, wdir, ao_dist)
                if loc is not None and dist is not None:
                    hits += 1.0 - (dist / ao_dist) * 0.55
            v_ao[i] = max(min_ao, 1.0 - hits * inv_rays * ao_strength)

    col_attr = me.color_attributes.get("Col")
    if col_attr is None:
        col_attr = me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    me.color_attributes.active_color = col_attr

    loop_vi = np.empty(n_loops, dtype=np.int32)
    me.loops.foreach_get("vertex_index", loop_vi)
    f = v_ao[loop_vi]
    br, bg, bb = base_lin_rgb
    rgba = np.empty((n_loops, 4), dtype=np.float32)
    rgba[:, 0] = np.clip(br * f * 0.99, 0.0, 1.0)
    rgba[:, 1] = np.clip(bg * f, 0.0, 1.0)
    rgba[:, 2] = np.clip(bb * np.minimum(1.0, f + (1.0 - f) * 0.20), 0.0, 1.0)
    rgba[:, 3] = 1.0
    col_attr.data.foreach_set("color", rgba.ravel())


def add_smart_decimate_modifiers(mesh_objs):
    protected_prefixes = (
        "Hero_Wall_", "Hero_Slab_", "Hero_Roof", "Hero_Deck_",
        "Shop_Sign3D_Text", "Shop_Sign3D_Bowl", "Win_", "Door_",
        "Prop_Vintage_Bicycle_Chainring", "Prop_Vintage_Bicycle_RearCog",
        "_Stg_",
    )
    modified = []
    for obj in mesh_objs:
        orig_mat = obj.data.materials[0] if (obj.data.materials and obj.data.materials[0]) else None
        clean_name = orig_mat.name.split(".")[0] if orig_mat else ""
        me = obj.data
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        if obj.name.startswith(protected_prefixes):
            continue
        if clean_name in IMAGE_GRAPHIC_SPECS:
            if tris < 600:
                continue
            ratio = 0.55
        elif clean_name in AI_SURFACE_SPECS:
            if tris < 160:
                continue
            ratio = 0.35 if tris > 400 else 0.50
        elif tris > 1200:
            ratio = 0.18
        elif tris > 400:
            ratio = 0.24
        elif tris > 140:
            ratio = 0.30
        elif tris >= 64:
            ratio = 0.38
        else:
            continue
        mod = obj.modifiers.new("GameDecimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        modified.append(obj)

    if modified:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for obj in modified:
            eval_obj = obj.evaluated_get(depsgraph)
            new_me = bpy.data.meshes.new_from_object(eval_obj)
            obj.modifiers.clear()
            obj.data = new_me
    return len(modified)


def ensure_dual_uvs(obj):
    me = obj.data
    if len(me.uv_layers) == 0:
        me.uv_layers.new(name="UVMap")
    else:
        me.uv_layers[0].name = "UVMap"
    for uv in list(me.uv_layers)[1:]:
        if uv.name != "UVMap_LM":
            me.uv_layers.remove(uv)
    if "UVMap_LM" not in me.uv_layers:
        me.uv_layers.new(name="UVMap_LM")


def pin_existing_uv_nodes(mat):
    if not mat or not mat.node_tree:
        return
    nt = mat.node_tree
    uv_node = None
    for node in list(nt.nodes):
        if node.type == "TEX_IMAGE" and node.projection == "FLAT" and not node.inputs["Vector"].is_linked:
            if uv_node is None:
                uv_node = nt.nodes.new("ShaderNodeUVMap")
                uv_node.uv_map = "UVMap"
            nt.links.new(uv_node.outputs["UV"], node.inputs["Vector"])
        elif node.type == "TEX_COORD":
            for link in list(node.outputs["UV"].links):
                if uv_node is None:
                    uv_node = nt.nodes.new("ShaderNodeUVMap")
                    uv_node.uv_map = "UVMap"
                to_sock = link.to_socket
                nt.links.remove(link)
                nt.links.new(uv_node.outputs["UV"], to_sock)


def build_weighted_lightmap_uvs(combined_obj):
    """Project clean world-area-weighted UVs into UVMap_LM, giving hero architecture 3.2x texel priority!"""
    me = combined_obj.data
    lm_uv = me.uv_layers["UVMap_LM"]
    me.uv_layers.active = lm_uv
    lm_uv.active_render = True

    bpy.ops.object.select_all(action="DESELECT")
    combined_obj.select_set(True)
    bpy.context.view_layer.objects.active = combined_obj

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0),
        island_margin=0.0005,
        area_weight=1.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")

    # Boost hero architecture 2.8x and rooftop focal props (seagulls/tank/laundry) 1.5x so walls get
    # razor-sharp Cycles shadows AND small bright props never get crushed to 2px mipmap dots!
    hero_slot_indices = set()
    mid_slot_indices = set()
    for idx, slot in enumerate(combined_obj.material_slots):
        if not slot.material:
            continue
        base = slot.material.name.split(".")[0]
        if base in HERO_LM_BOOST_MATS:
            hero_slot_indices.add(idx)
        elif base in MID_LM_BOOST_MATS:
            mid_slot_indices.add(idx)

    bm = bmesh.new()
    bm.from_mesh(me)
    uv_lay = bm.loops.layers.uv["UVMap_LM"]
    for f in bm.faces:
        if f.material_index in hero_slot_indices:
            scale = 2.8
        elif f.material_index in mid_slot_indices:
            scale = 1.55
        else:
            scale = 0.92
        for loop in f.loops:
            u, v = loop[uv_lay].uv
            loop[uv_lay].uv = (u * scale, v * scale)
    bm.to_mesh(me)
    bm.free()

    # Final tight single-atlas non-overlapping pack!
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.0014, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")


def save_encoded_lightmap(float_img, out_webp, preview_png, max_range=LM_MAX_RANGE):
    w, h = float_img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    float_img.pixels.foreach_get(arr)
    rgba = arr.reshape((h, w, 4))
    rgb = np.maximum(rgba[:, :, :3], 0.0)

    nz = rgb[rgb.max(axis=2) > 1e-4]
    p50 = float(np.percentile(nz, 50)) if len(nz) else 0.0
    p95 = float(np.percentile(nz, 95)) if len(nz) else 0.0
    p99 = float(np.percentile(nz, 99.5)) if len(nz) else 0.0
    fill_pct = 100.0 * len(nz) / float(w * h)
    print(f"    [LM stats {out_webp.name}] coverage={fill_pct:.1f}%, median={p50:.3f}, p95={p95:.3f}, p99.5={p99:.3f} (range=0..{max_range})", flush=True)

    enc = np.sqrt(np.clip(rgb / float(max_range), 0.0, 1.0))
    out_rgba = np.ones((h, w, 4), dtype=np.float32)
    out_rgba[:, :, :3] = enc

    tmp_img = bpy.data.images.new(f"_save_{out_webp.stem}", w, h, alpha=False, float_buffer=False)
    tmp_img.colorspace_settings.name = "Non-Color"
    tmp_img.pixels.foreach_set(out_rgba.ravel())
    tmp_img.update()

    scene = bpy.context.scene
    prev_cm = scene.view_settings.view_transform
    prev_fmt = scene.render.image_settings.file_format
    prev_qual = scene.render.image_settings.quality
    prev_col = scene.render.image_settings.color_mode

    scene.view_settings.view_transform = "Raw"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 94
    tmp_img.save_render(str(out_webp), scene=scene)

    QA_LM_DIR.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    tmp_img.save_render(str(preview_png), scene=scene)

    scene.view_settings.view_transform = prev_cm
    scene.render.image_settings.file_format = prev_fmt
    scene.render.image_settings.quality = prev_qual
    scene.render.image_settings.color_mode = prev_col
    bpy.data.images.remove(tmp_img)


def run_cycles_bake(combined_obj, stage, mode, samples, t0):
    BH.setup_world_lighting(stage, mode=mode)
    BH.boost_night_emissives(mode == "night")

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.025
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 4
    scene.cycles.transparent_max_bounces = 6
    # Clamp indirect fireflies so dark night walls stay velvety smooth with ZERO red/color speckles!
    scene.cycles.sample_clamp_direct = 6.0
    scene.cycles.sample_clamp_indirect = 2.2

    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    scene.render.bake.margin = 16
    scene.render.bake.margin_type = "EXTEND"
    scene.render.bake.use_clear = True

    bpy.ops.object.select_all(action="DESELECT")
    combined_obj.select_set(True)
    bpy.context.view_layer.objects.active = combined_obj

    print(f"  Baking SINGLE-PASS Cycles {mode.upper()} lightmap ({LM_RES}x{LM_RES}, {samples} smp + OIDN)...", flush=True)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=16)
    print(f"  Finished Cycles {mode.upper()} bake ({time.time()-t0:.1f}s)", flush=True)


def main():
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=str(BLEND_IN))
    hero_objs_raw = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"Loaded {len(hero_objs_raw)} hero mesh objects from {BLEND_IN.name} ({time.time()-t0:.1f}s)", flush=True)

    # 1) Build exact Cycles diorama stage & keep sculpted corner sidewalk/curb/grate meshes
    stage = BH.build_diorama_stage({"dark_iron": bpy.data.materials.get("Arch_Dark_Iron")})
    keep_stage_objs = [o for o in stage.objects if o.type == "MESH" and o.name.startswith(KEEP_STAGE_PREFIXES)]
    hero_all = hero_objs_raw + keep_stage_objs

    # 2) Decimate dense props once
    n_dec = add_smart_decimate_modifiers(hero_objs_raw)
    print(f"Decimated {n_dec} dense prop meshes ({time.time()-t0:.1f}s)", flush=True)

    work_col = bpy.data.collections.new("Haikaze_BakeWork")
    bpy.context.scene.collection.children.link(work_col)

    opaque_objs = []
    glass_objs = []
    for o in hero_all:
        if o.data.users > 1:
            o.data = o.data.copy()
        ensure_dual_uvs(o)
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        for c in list(o.users_collection):
            c.objects.unlink(o)
        work_col.objects.link(o)

        orig_mat = o.data.materials[0] if (o.data.materials and o.data.materials[0]) else None
        clean = orig_mat.name.split(".")[0] if orig_mat else ""
        if clean in ("Arch_Window_Glass", "Prop_Clear_Glass"):
            glass_objs.append(o)
        else:
            opaque_objs.append(o)

    # 3) Join ALL opaque objects into ONE multi-material Cycles bake object (7x faster bake + zero seams!)
    # Strip any empty None material slots left over from boolean cuts so Cycles never skips a slot!
    for o in opaque_objs:
        if any(s.material is None for s in o.material_slots):
            valid = next((s.material for s in o.material_slots if s.material is not None), None)
            if valid is not None:
                for i, s in enumerate(o.material_slots):
                    if s.material is None:
                        o.data.materials[i] = valid

    bpy.ops.object.select_all(action="DESELECT")
    for o in opaque_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = opaque_objs[0]
    bpy.ops.object.join()
    combined = bpy.context.active_object
    combined.name = "Haikaze_BakeCombined"
    bpy.ops.object.material_slot_remove_unused()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    print(f"Joined {len(opaque_objs)} opaque meshes into 1 multi-material Cycles object ({len(combined.material_slots)} slots, {time.time()-t0:.1f}s)", flush=True)

    # 4) Pin Cycles image textures to UVMap & pack weighted UVMap_LM
    used_mats = [s.material for s in combined.material_slots if s.material]
    for m in used_mats:
        pin_existing_uv_nodes(m)
    build_weighted_lightmap_uvs(combined)
    print(f"Packed architecture-weighted UVMap_LM atlas ({time.time()-t0:.1f}s)", flush=True)

    # 5) Temporarily set Metallic=0 (so brass/chrome/iron capture diffuse irradiance) and Subsurface=0
    # (so Blender's default red skin SSS radius (1.0,0.2,0.1) never bleeds red dots through 2F stucco corners!)
    saved_metallic = {}
    lm_img = bpy.data.images.new("Cycles_LM_Float", LM_RES, LM_RES, alpha=False, float_buffer=True)
    lm_img.colorspace_settings.name = "Linear Rec.709"

    for m in used_mats:
        if not m.node_tree:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            saved_metallic[m] = float(bsdf.inputs["Metallic"].default_value)
            bsdf.inputs["Metallic"].default_value = 0.0
            if "Subsurface Weight" in bsdf.inputs:
                bsdf.inputs["Subsurface Weight"].default_value = 0.0
        for n in nt.nodes:
            n.select = False
        bnode = nt.nodes.new("ShaderNodeTexImage")
        bnode.name = "__LM_BAKE_TARGET__"
        bnode.image = lm_img
        bnode.select = True
        nt.nodes.active = bnode

    # 6) BAKE BOTH DAY & NIGHT IN TWO FAST SINGLE-PASS CYCLES+OIDN BAKES!
    run_cycles_bake(combined, stage, mode="day", samples=BAKE_SAMPLES_DAY, t0=t0)
    save_encoded_lightmap(lm_img, LM_DAY_OUT, QA_LM_DIR / "lm-day-preview.png")

    run_cycles_bake(combined, stage, mode="night", samples=BAKE_SAMPLES_NIGHT, t0=t0)
    save_encoded_lightmap(lm_img, LM_NIGHT_OUT, QA_LM_DIR / "lm-night-preview.png")

    # Restore metallic & remove temp bake nodes
    for m, orig_met in saved_metallic.items():
        if m.node_tree:
            bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf:
                bsdf.inputs["Metallic"].default_value = orig_met
            bnode = m.node_tree.nodes.get("__LM_BAKE_TARGET__")
            if bnode:
                m.node_tree.nodes.remove(bnode)

    # 7) Remove temporary non-exported diorama backdrop objects (asphalt/sea/clouds/lights)
    for o in list(stage.objects):
        if o != combined and o not in glass_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    # 8) Separate combined object cleanly back by material (100% preserves UVMap & UVMap_LM!)
    bpy.ops.object.select_all(action="DESELECT")
    combined.select_set(True)
    bpy.context.view_layer.objects.active = combined
    bpy.ops.mesh.separate(type="MATERIAL")
    split_opaque = [o for o in work_col.objects if o.type == "MESH" and o not in glass_objs]
    # Trim unused material slots on each separated mesh so o.data.materials[0] is its exact material
    for o in split_opaque:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.material_slot_remove_unused()

    # 9) Convert to final clean glTF-2.0 PBR materials + dual UV + subtle tight-crevice AO
    all_export_work = split_opaque + glass_objs
    bvh = build_scene_bvh(all_export_work)

    # Snapshot original material info BEFORE renaming old Cycles materials so new glTF materials
    # keep exact clean names (no Blender ".001" suffix breaking runtime emissive/glass matching!).
    orig_mat_info = {}
    for o in all_export_work:
        orig_mat = o.data.materials[0] if (o.data.materials and o.data.materials[0]) else None
        clean_name = orig_mat.name.split(".")[0] if orig_mat else ""
        orig_mat_info[o] = (clean_name, orig_mat)

    for old_m in list(bpy.data.materials):
        old_m.name = f"__cycles_{old_m.name}"

    new_mats = {
        "Game_Solid_Matte":   make_vc_bucket_mat("Game_Solid_Matte",   rough=0.80, metal=0.00, coat=0.0),
        "Game_Solid_Satin":   make_vc_bucket_mat("Game_Solid_Satin",   rough=0.34, metal=0.14, coat=0.22),
        "Game_Solid_Metal":   make_vc_bucket_mat("Game_Solid_Metal",   rough=0.24, metal=0.82, coat=0.12),
        "Game_Solid_Foliage": make_vc_bucket_mat("Game_Solid_Foliage", rough=0.44, metal=0.00, coat=0.08),
        "Emissive_Vending":   make_vc_bucket_mat("Emissive_Vending",   rough=0.24, metal=0.00, coat=0.30, emissive_str=0.65),
    }
    for sname, sspec in SPECIAL_MATERIALS.items():
        new_mats[sname] = make_special_gltf_mat(sname, sspec)

    for aname, aspec in AI_SURFACE_SPECS.items():
        key = "Arch_Cedar_Warm" if aname == "Prop_Warm_Cedar" else ("Arch_Deck_Cream" if aname == "_Stg_Sidewalk" else aname)
        if key not in new_mats:
            new_mats[key] = make_gltf_image_mat(
                key, aspec["color"], aspec["normal"], None,
                rough=aspec["rough"], nstr=aspec["nstr"], coat=aspec["coat"], estr=0.0,
                max_dim=aspec["res"], sat=aspec["sat"], val=aspec["val"], use_vc_ao=True,
                soft_blend=aspec.get("soft_blend"),
            )

    for gname, (cf, nf, rf, rgh, nstr, coat, estr, mdim) in IMAGE_GRAPHIC_SPECS.items():
        new_mats[gname] = make_gltf_image_mat(
            gname, cf, nf, rf, rough=rgh, nstr=nstr, coat=coat, estr=estr,
            max_dim=mdim, use_vc_ao=False,
        )

    groups = {}
    for o in all_export_work:
        clean_name, orig_mat = orig_mat_info[o]

        if clean_name == "Prop_Clear_Glass":
            target_key = "Arch_Window_Glass"
        elif clean_name in VENDING_GLOW_COLORS:
            target_key = "Emissive_Vending"
            r, g, b = VENDING_GLOW_COLORS[clean_name]
            bake_vertex_color_and_ao(o, (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b)), None, ao_strength=0.0)
        elif clean_name in SPECIAL_MATERIALS:
            target_key = clean_name
        elif clean_name in IMAGE_GRAPHIC_SPECS:
            target_key = clean_name
        elif clean_name in AI_SURFACE_SPECS:
            target_key = "Arch_Cedar_Warm" if clean_name == "Prop_Warm_Cedar" else ("Arch_Deck_Cream" if clean_name == "_Stg_Sidewalk" else clean_name)
            write_world_cubic_uvs(o, AI_SURFACE_SPECS[clean_name]["scale"])
            bake_vertex_color_and_ao(o, (1.0, 1.0, 1.0), bvh, ao_strength=0.08, ao_dist=0.24)
        else:
            rgba, rough, metal = extract_solid_props(orig_mat)
            target_key = pick_solid_bucket(clean_name, rough, metal)
            bake_vertex_color_and_ao(o, rgba[:3], bvh, ao_strength=0.10, ao_dist=0.22)

        ensure_dual_uvs(o)
        o.data.uv_layers.active_index = 0
        o.data.uv_layers[0].active_render = True
        o.data.materials.clear()
        o.data.materials.append(new_mats[target_key])
        groups.setdefault(target_key, []).append(o)

    # 10) Join into final glTF-2.0 draw-call batches & export
    export_col = bpy.data.collections.new("Haikaze_GameReady")
    bpy.context.scene.collection.children.link(export_col)
    root_empty = bpy.data.objects.new("Town_Hero_Haikaze", None)
    export_col.objects.link(root_empty)

    total_tris = 0
    final_objs = [root_empty]
    for mkey, objs in sorted(groups.items()):
        for o in objs:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            export_col.objects.link(o)

        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        joined = bpy.context.active_object
        joined.name = f"Haikaze_{mkey}"
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        joined.data.uv_layers.active_index = 0
        joined.data.uv_layers[0].active_render = True
        joined.parent = root_empty
        joined.data.calc_loop_triangles()
        tris = len(joined.data.loop_triangles)
        total_tris += tris
        final_objs.append(joined)
        print(f"  [batch] {joined.name:34s}  {tris:6,d} tris  UVs={[u.name for u in joined.data.uv_layers]}", flush=True)

    print(f"TOTAL Cycles-Lightmapped Haikaze-Hero: {total_tris:,} tris across {len(groups)} batches ({time.time()-t0:.1f}s)", flush=True)

    bpy.ops.object.select_all(action="DESELECT")
    for o in final_objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_OUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_attributes=True,
        export_image_format="WEBP",
        export_image_quality=86,
        export_meshopt_compression_enable=True,
        export_draco_mesh_compression_enable=False,
    )
    glb_kb = GLB_OUT.stat().st_size / 1024.0
    day_kb = LM_DAY_OUT.stat().st_size / 1024.0
    night_kb = LM_NIGHT_OUT.stat().st_size / 1024.0
    print(f"EXPORTED GLB: {GLB_OUT.name} ({glb_kb/1024:.2f} MB) + Day LM ({day_kb:.1f} KB) + Night LM ({night_kb:.1f} KB) in {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
