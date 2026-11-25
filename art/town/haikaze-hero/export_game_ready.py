"""
Gate 2 Game-Ready Exporter for Haikaze-so Hero Building (Blender 5.2.3 LTS)
===========================================================================
Converts the high-poly Cycles master `Haikaze-Hero.blend` (423k tris, 1764 objects,
~97 Cycles-only shader-node materials) into an ultra-fast, 100% glTF-2.0 standard PBR
game asset `art/town/haikaze-hero/haikaze-hero-game.glb`:
  1. Converts BOX-projected AI surfaces (plaster, sage concrete, cedar, deck tiles)
     into real world-scale cubic UVMap coordinates + calibrated warm WebP maps
     + real tangent-space Normal Maps wired directly to Principled BSDF.
  2. Consolidates ~65 opaque solid-color diorama materials into 4 vertex-colored PBR
     finish buckets (Matte / Satin Enamel / Metallic / Foliage) WITH fast vectorized
     BVH contact Ambient Occlusion baked into `COLOR_0` (`Col`).
  3. Preserves dedicated named Glass & Night-Emissive materials (batched cleanly to
     ~27 Draw Calls total!) so Three.js time-of-day dynamically illuminates the ramen
     shop, 2F backlit curtains, porch lamps, chochin lantern, signboard & vending LEDs.
  4. Single-pass depsgraph decimation + UV stripping on non-textured buckets ->
     ~80k-105k tris, ~3-4 MB zero-Draco WebP GLB (loads fast in Pages & single-file HTML).

Run:
  blender --background --factory-startup --python-exit-code 2 --python art/town/haikaze-hero/export_game_ready.py
"""
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
BLEND_IN = HERE / "Haikaze-Hero.blend"
GLB_OUT = HERE / "haikaze-hero-game.glb"

AI_SURFACE_SPECS = {
    "Arch_Plaster_Cream": {
        "color": "tex_plaster_cream.png", "normal": "tex_plaster_cream_normal.png",
        "scale": 0.38, "rough": 0.80, "nstr": 0.28, "sat": 1.18, "val": 0.96, "res": 512,
    },
    "Arch_Sage_Concrete": {
        "color": "tex_sage_concrete.png", "normal": "tex_sage_concrete_normal.png",
        "scale": 0.40, "rough": 0.74, "nstr": 0.30, "sat": 1.24, "val": 0.78, "res": 512,
    },
    "Arch_Cedar_Warm": {
        "color": "tex_wood_cedar.png", "normal": "tex_wood_cedar_normal.png",
        "scale": 0.82, "rough": 0.50, "nstr": 0.34, "sat": 1.18, "val": 0.76, "res": 512,
    },
    "Prop_Warm_Cedar": {
        "color": "tex_wood_cedar.png", "normal": "tex_wood_cedar_normal.png",
        "scale": 0.85, "rough": 0.50, "nstr": 0.34, "sat": 1.18, "val": 0.76, "res": 512,
    },
    "Arch_Deck_Cream": {
        "color": "tex_deck_tiles.png", "normal": "tex_deck_tiles_normal.png",
        "scale": 0.48, "rough": 0.78, "nstr": 0.32, "sat": 1.10, "val": 0.94, "res": 512,
    },
}

IMAGE_GRAPHIC_SPECS = {
    "Arch_Mosaic_Tiles":    ("tex_mosaic_tiles.png", "tex_mosaic_tiles_normal.png", "tex_mosaic_tiles_roughness.png", 0.18, 0.55, 0.0, 512),
    "Arch_Noren":           ("tex_noren_4panel.png", "tex_noren_normal.png", None, 0.86, 0.0, 0.0, 768),
    "Arch_Plaque_Haikaze":  ("tex_plaque_haikaze.png", None, None, 0.26, 0.45, 0.0, 512),
    "Arch_Plaque_Vertical": ("tex_plaque_vertical.png", None, None, 0.54, 0.10, 0.0, 512),
    "Arch_Poster_Summer":   ("tex_poster_summer.png", None, None, 0.46, 0.10, 0.0, 768),
    "Arch_Plaque_201":      ("tex_apt_plaque_201.png", None, None, 0.26, 0.40, 0.0, 256),
    "Arch_Plaque_202":      ("tex_apt_plaque_202.png", None, None, 0.26, 0.40, 0.0, 256),
    "Arch_Welcome_Mat":     ("tex_welcome_mat.png", None, None, 0.92, 0.0, 0.0, 512),
    "Prop_Menu_Chalkboard": ("tex_menu_chalkboard.png", None, None, 0.82, 0.0, 0.0, 768),
    "Prop_VendingPoster_White": ("tex_vending_poster_white.png", None, None, 0.28, 0.35, 0.18, 512),
    "Prop_VendingPoster_Pink":  ("tex_vending_poster_pink.png", None, None, 0.28, 0.35, 0.18, 512),
}

SPECIAL_MATERIALS = {
    "Arch_Window_Glass":     {"rgba": (0.76, 0.90, 0.98, 0.26), "rough": 0.06, "metal": 0.08, "blend": True},
    "Arch_Room_Interior":    {"rgba": (0.97, 0.89, 0.72, 1.0), "rough": 0.85, "metal": 0.0, "emissive": (1.0, 0.84, 0.50), "estr": 0.25},
    "Arch_Shop_Interior":    {"rgba": (0.98, 0.86, 0.62, 1.0), "rough": 0.80, "metal": 0.0, "emissive": (1.0, 0.80, 0.44), "estr": 0.45},
    "Arch_Curtain_Cream":    {"rgba": (0.96, 0.93, 0.85, 1.0), "rough": 0.88, "metal": 0.0, "emissive": (1.0, 0.82, 0.50), "estr": 0.04},
    "Arch_Curtain_Blue":     {"rgba": (0.70, 0.82, 0.88, 1.0), "rough": 0.88, "metal": 0.0, "emissive": (1.0, 0.86, 0.58), "estr": 0.04},
    "Arch_Porch_Lamp":       {"rgba": (1.00, 0.95, 0.80, 1.0), "rough": 0.20, "metal": 0.0, "emissive": (1.0, 0.82, 0.46), "estr": 0.60},
    "Arch_Sign_Board_Cream": {"rgba": (0.98, 0.94, 0.85, 1.0), "rough": 0.42, "metal": 0.0, "emissive": (1.0, 0.92, 0.74), "estr": 0.08},
    "Prop_Lantern_Paper":    {"rgba": (1.00, 0.94, 0.80, 1.0), "rough": 0.65, "metal": 0.0, "emissive": (1.0, 0.76, 0.40), "estr": 0.50},
}

# Batched into 1 vertex-colored emissive material `Emissive_Vending` (saves 4 Draw Calls!)
VENDING_GLOW_COLORS = {
    "Prop_Showcase_Glow": (1.00, 0.98, 0.90),
    "Prop_LED_Cold":      (0.28, 0.74, 1.00),
    "Prop_LED_Hot":       (1.00, 0.38, 0.32),
    "Prop_LED_Button":    (0.98, 0.95, 0.86),
    "Prop_LED_Green":     (0.32, 0.96, 0.54),
}


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


def make_vc_bucket_mat(name, rough, metal, emissive_str=0.0):
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
    if spec.get("blend"):
        bsdf.inputs["Alpha"].default_value = a
        mat.blend_method = "BLEND"
    if "emissive" in spec:
        er, eg, eb = spec["emissive"]
        bsdf.inputs["Emission Color"].default_value = (srgb_to_lin(er), srgb_to_lin(eg), srgb_to_lin(eb), 1.0)
        bsdf.inputs["Emission Strength"].default_value = spec.get("estr", 1.0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def prepare_calibrated_image(src_name, max_dim=512, sat=1.0, val=1.0, colorspace="sRGB"):
    src = TEX_DIR / src_name
    key = f"cal_{max_dim}_{int(sat*100)}_{int(val*100)}_{src_name}"
    if key in bpy.data.images:
        return bpy.data.images[key]
    bimg = bpy.data.images.load(str(src), check_existing=False)
    bimg.name = key
    w, h = bimg.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        bimg.scale(max(16, int(round(w * scale))), max(16, int(round(h * scale))))
        w, h = bimg.size
    if colorspace == "sRGB" and (abs(sat - 1.0) > 1e-3 or abs(val - 1.0) > 1e-3):
        arr = np.empty(w * h * 4, dtype=np.float32)
        bimg.pixels.foreach_get(arr)
        rgba = arr.reshape((-1, 4))
        rgb = rgba[:, :3]
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


def make_gltf_image_mat(name, color_file, normal_file, rough_file, rough, nstr, estr, max_dim, sat=1.0, val=1.0, use_vc_ao=False):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    t_col = nt.nodes.new("ShaderNodeTexImage")
    t_col.image = prepare_calibrated_image(color_file, max_dim=max_dim, sat=sat, val=val, colorspace="sRGB")
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
    uv_layer = bm.loops.layers.uv.verify()
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
    verts = []
    polys = []
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


def bake_vertex_color_and_ao(obj, base_lin_rgb, bvh, ao_strength=0.22, ao_dist=0.45):
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
            origin = wp + wn * 0.014
            for d in AO_DIRS:
                wdir = (t1 * d.x + t2 * d.y + wn * d.z).normalized()
                loc, _n, _idx, dist = bvh.ray_cast(origin, wdir, ao_dist)
                if loc is not None and dist is not None:
                    hits += 1.0 - (dist / ao_dist) * 0.55
            occ = hits * inv_rays
            v_ao[i] = max(min_ao, 1.0 - occ * ao_strength)

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
    rgba[:, 2] = np.clip(bb * np.minimum(1.0, f + (1.0 - f) * 0.22), 0.0, 1.0)
    rgba[:, 3] = 1.0
    col_attr.data.foreach_set("color", rgba.ravel())


def add_smart_decimate_modifiers(mesh_objs):
    """Trim over-beveled micro-prop geometry cleanly while preserving hero architecture & 3D signage."""
    protected_prefixes = (
        "Hero_Wall_", "Hero_Slab_", "Hero_Roof", "Hero_Deck_",
        "Shop_Sign3D_Text", "Shop_Sign3D_Bowl", "Win_", "Door_",
        "Prop_Vintage_Bicycle_Chainring", "Prop_Vintage_Bicycle_RearCog",
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


def main():
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=str(BLEND_IN))
    mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"Loaded {len(mesh_objs)} mesh objects from {BLEND_IN.name} ({time.time()-t0:.1f}s)", flush=True)

    # 1) Single-pass depsgraph decimation BEFORE BVH
    n_dec = add_smart_decimate_modifiers(mesh_objs)
    print(f"Decimated {n_dec} dense prop meshes in single depsgraph pass ({time.time()-t0:.1f}s)", flush=True)

    for o in mesh_objs:
        if o.data.users > 1:
            o.data = o.data.copy()

    # 2) Build BVH on decimated opaque geometry
    bvh = build_scene_bvh(mesh_objs)
    print(f"Built world-space BVH ({time.time()-t0:.1f}s)", flush=True)

    # 3) Prepare clean glTF-2.0 standard PBR materials (28 total!)
    new_mats = {
        "Game_Solid_Matte":   make_vc_bucket_mat("Game_Solid_Matte",   rough=0.80, metal=0.00),
        "Game_Solid_Satin":   make_vc_bucket_mat("Game_Solid_Satin",   rough=0.34, metal=0.16),
        "Game_Solid_Metal":   make_vc_bucket_mat("Game_Solid_Metal",   rough=0.25, metal=0.82),
        "Game_Solid_Foliage": make_vc_bucket_mat("Game_Solid_Foliage", rough=0.44, metal=0.00),
        "Emissive_Vending":   make_vc_bucket_mat("Emissive_Vending",   rough=0.24, metal=0.00, emissive_str=0.65),
    }
    for sname, sspec in SPECIAL_MATERIALS.items():
        new_mats[sname] = make_special_gltf_mat(sname, sspec)

    for aname, aspec in AI_SURFACE_SPECS.items():
        key = "Arch_Cedar_Warm" if aname == "Prop_Warm_Cedar" else aname
        if key not in new_mats:
            new_mats[key] = make_gltf_image_mat(
                key, aspec["color"], aspec["normal"], None,
                rough=aspec["rough"], nstr=aspec["nstr"], estr=0.0,
                max_dim=aspec["res"], sat=aspec["sat"], val=aspec["val"], use_vc_ao=True,
            )

    for gname, (cf, nf, rf, rgh, nstr, estr, mdim) in IMAGE_GRAPHIC_SPECS.items():
        new_mats[gname] = make_gltf_image_mat(
            gname, cf, nf, rf, rough=rgh, nstr=nstr, estr=estr,
            max_dim=mdim, use_vc_ao=False,
        )
    print(f"Prepared {len(new_mats)} clean glTF-2.0 materials ({time.time()-t0:.1f}s)", flush=True)

    # 4) Write cubic UVs, vectorized vertex color + BVH contact AO, group by target material
    needs_uv = set(AI_SURFACE_SPECS.keys()) | set(IMAGE_GRAPHIC_SPECS.keys())
    groups = {}
    for o in mesh_objs:
        orig_mat = o.data.materials[0] if (o.data.materials and o.data.materials[0]) else None
        clean_name = orig_mat.name.split(".")[0] if orig_mat else ""

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
            target_key = "Arch_Cedar_Warm" if clean_name == "Prop_Warm_Cedar" else clean_name
            write_world_cubic_uvs(o, AI_SURFACE_SPECS[clean_name]["scale"])
            bake_vertex_color_and_ao(o, (1.0, 1.0, 1.0), bvh, ao_strength=0.22, ao_dist=0.50)
        else:
            rgba, rough, metal = extract_solid_props(orig_mat)
            target_key = pick_solid_bucket(clean_name, rough, metal)
            ao_str = 0.16 if "Ink" in clean_name else 0.24
            bake_vertex_color_and_ao(o, rgba[:3], bvh, ao_strength=ao_str, ao_dist=0.38)

        # Strip redundant UV layers on non-textured buckets to cut GLB binary size!
        if target_key not in needs_uv:
            while len(o.data.uv_layers) > 0:
                o.data.uv_layers.remove(o.data.uv_layers[0])

        o.data.materials.clear()
        o.data.materials.append(new_mats[target_key])
        groups.setdefault(target_key, []).append(o)

    print(f"Baked cubic UVs & BVH contact AO across {len(mesh_objs)} objects ({time.time()-t0:.1f}s)", flush=True)

    # 5) Flatten hierarchy & join per material bucket -> 1 Draw Call per material
    export_col = bpy.data.collections.new("Haikaze_GameReady")
    bpy.context.scene.collection.children.link(export_col)
    root_empty = bpy.data.objects.new("Town_Hero_Haikaze", None)
    export_col.objects.link(root_empty)

    total_tris = 0
    final_objs = [root_empty]
    for mkey, objs in sorted(groups.items()):
        for o in objs:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
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
        joined.parent = root_empty
        joined.data.calc_loop_triangles()
        tris = len(joined.data.loop_triangles)
        total_tris += tris
        final_objs.append(joined)
        print(f"  [batch] {joined.name:34s}  {tris:6,d} tris  (from {len(objs):3d} objs)", flush=True)

    print(f"TOTAL Game-Ready Haikaze-Hero: {total_tris:,} tris across {len(groups)} draw-call batches ({time.time()-t0:.1f}s)", flush=True)

    # 6) Export zero-Draco WebP-compressed GLB
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
        export_image_quality=84,
        export_draco_mesh_compression_enable=False,
    )
    kb = GLB_OUT.stat().st_size / 1024.0
    print(f"EXPORTED: {GLB_OUT} ({kb:.1f} KB / {kb/1024:.2f} MB) in {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
