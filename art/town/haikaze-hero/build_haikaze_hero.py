"""
Shiba Delivery — Standalone Diorama-Style Hero Building: Haikaze-so (Blender 5.2.3 LTS)
========================================================================================
Built from scratch using real Blender architecture tools (NO 224-box legacy code!):
  - True 0.28m thick walls with EXACT Boolean window, door, and ramen-vestibule cutouts
  - Real 3D interior room depth behind every window (pleated cloth curtains, warm glow,
    1F ramen shop wooden counter with miniature ceramic bowls!)
  - Animal Crossing miniature-diorama chunky multi-segment bevels & tactile PBR Shader Nodes
    (gouache warm cream stucco, matte sage concrete, glossy pillowed pastel mosaic tiles,
    warm honey cedar, satin baked-enamel forest-teal steel, subsurface glowing lantern)
  - Links/appends ALL shared reusable props from art/shared/props/Shared-Props.blend
    (3D-drinks vending machines, 3D-fan AC units, circular doorstep delivery hooks beside
    doors 201 & 202, hollow bottle crates, sculpted botanical potted plants, curved-tube
    vintage bicycle, A-frame chalkboard menu, ribbed chochin lantern)
  - Lived-in diorama details: rooftop fiberglass water tank, rooftop stairwell penthouse,
    billowing colorful rooftop laundry, drooping catenary cables, paw welcome mat & tiny
    indoor slippers outside door 201!
  - Preserves EXACT walkable collision coordinates (1F/2F slabs, 14-step exterior steel
    staircase, 201/202 corridor) matching src/morning/coastal-town.js.

Outputs:
  - art/town/haikaze-hero/Haikaze-Hero.blend
  - art/town/haikaze-hero/haikaze-hero.glb
  - output/blender-qa/haikaze-hero/01..05 beauty Cycles Metal GPU inspection renders!

Run headless:
  blender --background --factory-startup --python-exit-code 2 --python art/town/haikaze-hero/build_haikaze_hero.py
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[3]
PROPS_DIR = ROOT / "art" / "shared" / "props"
TEX_DIR = ROOT / "art" / "shared" / "textures"
OUT_DIR = Path(__file__).resolve().parent
QA_DIR = ROOT / "output" / "blender-qa" / "haikaze-hero"
QA_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(PROPS_DIR))
import build_shared_props as SP


# ---------------------------------------------------------------------------
# Appending Reusable Shared Props from Shared-Props.blend (TRUE Asset Reuse!)
# ---------------------------------------------------------------------------
def load_shared_prop_collections():
    """Append all prop collections from Shared-Props.blend into a hidden template storage."""
    blend_path = str(PROPS_DIR / "Shared-Props.blend")
    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        data_to.collections = [c for c in data_from.collections if c.startswith("Prop_")]
    templates = {}
    for col in data_to.collections:
        if col is None:
            continue
        roots = [o for o in col.objects if o.parent is None]
        if roots:
            templates[col.name] = (col, roots[0])
    return templates


def place_prop(templates, prop_name, loc, rot_z=0.0, scale=1.0, col=None, parent=None, tag=""):
    """Duplicate a reusable shared prop cleanly at (loc, rot_z, scale) into target collection."""
    if prop_name not in templates:
        raise KeyError(f"Shared prop '{prop_name}' not found in Shared-Props.blend!")
    src_col, src_root = templates[prop_name]
    clone_map = {}

    def dup_tree(src_obj, new_parent):
        new_obj = src_obj.copy()
        if src_obj.data is not None:
            new_obj.data = src_obj.data  # Share mesh data for lightweight instancing!
        new_obj.name = f"{src_obj.name}_{tag}" if tag else f"{src_obj.name}_inst"
        SP.link_obj(new_obj, col)
        if new_parent is not None:
            new_obj.parent = new_parent
            new_obj.matrix_parent_inverse = src_obj.matrix_parent_inverse.copy()
        clone_map[src_obj] = new_obj
        for ch in src_obj.children:
            dup_tree(ch, new_obj)
        return new_obj

    inst_root = dup_tree(src_root, parent)
    inst_root.location = Vector(loc)
    inst_root.rotation_euler = Euler((0.0, 0.0, rot_z))
    inst_root.scale = Vector((scale, scale, scale))
    return inst_root


# ---------------------------------------------------------------------------
# Architectural Diorama Materials (Warm Gouache Plaster, Sage Concrete, Teal Steel!)
# ---------------------------------------------------------------------------
def build_arch_materials():
    M = {}
    # REAL AI hand-painted gouache Japanese cream stucco (warm sunlit butter-cream under AgX!)
    M["plaster"] = SP.make_ai_surface_mat(
        "Arch_Plaster_Cream", "tex_plaster_cream.png", "tex_plaster_cream_normal.png",
        tex_scale=0.38, roughness=0.78, coat=0.05, subsurface=0.04, normal_strength=0.14, ao_tint=0.22,
        sat_mult=1.22, val_mult=0.90
    )
    # REAL AI hand-painted muted sage-green architectural concrete slab & parapet (rich lush sage!)
    M["sage_slab"] = SP.make_ai_surface_mat(
        "Arch_Sage_Concrete", "tex_sage_concrete.png", "tex_sage_concrete_normal.png",
        tex_scale=0.40, roughness=0.72, coat=0.06, subsurface=0.03, normal_strength=0.15, ao_tint=0.25,
        sat_mult=1.28, val_mult=0.68
    )
    M["sage_dark"] = SP.make_diorama_mat(
        "Arch_Sage_Dark", 0x6F8862, roughness=0.74, bump_scale=24.0, bump_strength=0.07, ao_tint=0.24
    )
    # REAL AI hand-painted chamfered warm coastal terrace/sidewalk paving tiles!
    M["deck_cream"] = SP.make_ai_surface_mat(
        "Arch_Deck_Cream", "tex_deck_tiles.png", "tex_deck_tiles_normal.png",
        tex_scale=0.48, roughness=0.78, coat=0.06, normal_strength=0.18, ao_tint=0.22,
        sat_mult=1.12, val_mult=0.88
    )
    M["plinth"] = SP.make_diorama_mat(
        "Arch_Plinth_Stone", 0xA8A195, roughness=0.84, bump_scale=18.0, bump_strength=0.09, ao_tint=0.24
    )
    # Satin baked-enamel deep forest-teal steel (iconic stairs & railings!)
    M["teal_steel"] = SP.make_diorama_mat(
        "Arch_Teal_Steel", 0x1F5654, roughness=0.30, metallic=0.24, coat=0.42, coat_rough=0.16,
        bump_scale=42.0, bump_strength=0.028, ao_tint=0.22
    )
    M["teal_tread"] = SP.make_diorama_mat(
        "Arch_Teal_Tread", 0x296864, roughness=0.38, metallic=0.18, coat=0.30,
        bump_scale=55.0, bump_strength=0.04, ao_tint=0.20
    )
    M["tread_nose"] = SP.make_diorama_mat(
        "Arch_Tread_Nose", 0xC8D8D2, roughness=0.34, metallic=0.45, coat=0.25, bump_strength=0.02
    )
    # Seafoam-teal enameled steel apartment doors (201 & 202)
    M["apt_door"] = SP.make_diorama_mat(
        "Arch_Apt_Door", 0x4E8680, roughness=0.34, metallic=0.14, coat=0.38,
        bump_scale=36.0, bump_strength=0.025, ao_tint=0.24
    )
    M["apt_frame"] = SP.make_diorama_mat(
        "Arch_Apt_Frame", 0xD8D4C9, roughness=0.42, metallic=0.15, coat=0.22, bump_strength=0.025
    )
    # REAL AI hand-painted honey-cedar Japanese vertical wooden planks (rich warm chestnut-honey!)
    M["cedar"] = SP.make_ai_surface_mat(
        "Arch_Cedar_Warm", "tex_wood_cedar.png", "tex_wood_cedar_normal.png",
        tex_scale=0.82, roughness=0.48, coat=0.15, subsurface=0.04, normal_strength=0.18, ao_tint=0.25,
        sat_mult=1.22, val_mult=0.66
    )
    M["cedar_dark"] = SP.make_diorama_mat(
        "Arch_Cedar_Dark", 0x6B3C1E, roughness=0.52, coat=0.12,
        bump_scale=28.0, bump_strength=0.075, ao_tint=0.25
    )
    # Scalloped shop window awning canvas (warm coral + soft cream stripes!) & seagull plumage
    M["awning_coral"] = SP.make_diorama_mat("Arch_Awning_Coral", 0xD96552, roughness=0.84, subsurface=0.14, bump_scale=60.0, bump_strength=0.05)
    M["awning_cream"] = SP.make_diorama_mat("Arch_Awning_Cream", 0xFAF2DF, roughness=0.84, subsurface=0.14, bump_scale=60.0, bump_strength=0.05)
    M["gull_white"] = SP.make_diorama_mat("Arch_Gull_White", 0xFAF8F4, roughness=0.58, subsurface=0.12, bump_strength=0.02)
    M["gull_grey"] = SP.make_diorama_mat("Arch_Gull_Grey", 0x8FA2B2, roughness=0.58, bump_strength=0.02)
    M["gull_beak"] = SP.make_diorama_mat("Arch_Gull_Beak", 0xF5B63A, roughness=0.35, coat=0.3, bump_strength=0.01)
    M["cast_iron"] = SP.make_diorama_mat("Arch_Cast_Iron", 0x3D454A, roughness=0.52, metallic=0.72, bump_scale=70.0, bump_strength=0.08)
    M["bamboo"] = SP.make_diorama_mat(
        "Arch_Bamboo", 0xC8A05C, roughness=0.40, coat=0.25, bump_scale=34.0, bump_strength=0.045
    )
    M["brass"] = SP.make_diorama_mat(
        "Arch_Brass", 0xDEA94E, roughness=0.22, metallic=0.86, coat=0.25, bump_strength=0.02
    )
    M["alum"] = SP.make_diorama_mat(
        "Arch_Aluminum", 0xCDD4D6, roughness=0.28, metallic=0.72, coat=0.20, bump_strength=0.02
    )
    M["pipe_white"] = SP.make_diorama_mat(
        "Arch_Pipe_White", 0xEFECE4, roughness=0.38, coat=0.24, bump_strength=0.025
    )
    M["dark_iron"] = SP.make_diorama_mat(
        "Arch_Dark_Iron", 0x2F393C, roughness=0.40, metallic=0.60, bump_strength=0.03
    )
    M["fire_red"] = SP.make_diorama_mat(
        "Arch_Fire_Red", 0xCC3E34, roughness=0.28, coat=0.48, bump_strength=0.02
    )
    # Rooftop fiberglass water tank (plump matte-gloss cream-ivory!)
    M["water_tank"] = SP.make_diorama_mat(
        "Arch_Water_Tank", 0xEFEAE0, roughness=0.34, coat=0.36, subsurface=0.05,
        bump_scale=28.0, bump_strength=0.03, ao_tint=0.20
    )

    # Crisp thin-pane architectural window glass (glossy sky reflection + crystal-clear view inside!)
    M["win_glass"] = SP.make_diorama_mat(
        "Arch_Window_Glass", 0xD8F2FF, roughness=0.04, coat=0.95, coat_rough=0.03, bump_strength=0.0,
        ao_tint=0.0, alpha=0.22, transmission=0.0, ior=1.45
    )
    M["room_wall_warm"] = SP.make_diorama_mat(
        "Arch_Room_Interior", 0xF8E8C6, roughness=0.82, bump_strength=0.03, ao_tint=0.14,
        emissive_hex=0xFFDCA0, emissive_strength=0.55
    )
    M["shop_interior"] = SP.make_diorama_mat(
        "Arch_Shop_Interior", 0xFAE0AE, roughness=0.78, bump_strength=0.03, ao_tint=0.10,
        emissive_hex=0xFFD284, emissive_strength=1.15
    )
    M["curtain_cream"] = SP.make_diorama_mat(
        "Arch_Curtain_Cream", 0xF8F2E2, roughness=0.86, subsurface=0.28, bump_scale=60.0, bump_strength=0.04
    )
    M["curtain_blue"] = SP.make_diorama_mat(
        "Arch_Curtain_Blue", 0xB8D4E2, roughness=0.86, subsurface=0.25, bump_scale=60.0, bump_strength=0.04
    )
    M["porch_bulb"] = SP.make_diorama_mat(
        "Arch_Porch_Lamp", 0xFFF4D2, roughness=0.20, bump_strength=0.0, ao_tint=0.0,
        emissive_hex=0xFFD282, emissive_strength=3.6
    )

    # Rooftop laundry clothes & indoor slippers (adorable storytelling colors!)
    M["cloth_yellow"] = SP.make_diorama_mat("Arch_Cloth_Yellow", 0xF6CA4E, roughness=0.85, subsurface=0.18, bump_scale=65.0, bump_strength=0.05)
    M["cloth_sky"] = SP.make_diorama_mat("Arch_Cloth_Sky", 0x76BFE2, roughness=0.85, subsurface=0.18, bump_scale=65.0, bump_strength=0.05)
    M["cloth_coral"] = SP.make_diorama_mat("Arch_Cloth_Coral", 0xEC7868, roughness=0.85, subsurface=0.18, bump_scale=65.0, bump_strength=0.05)
    M["ceramic_bowl"] = SP.make_diorama_mat("Arch_Ceramic_Bowl", 0xC8463C, roughness=0.16, coat=0.75, bump_strength=0.01)
    M["ceramic_white"] = SP.make_diorama_mat("Arch_Ceramic_White", 0xFAF6EC, roughness=0.16, coat=0.75, bump_strength=0.01)

    # Image-backed hero textures (Mosaic Tiles with real Normal + Roughness! Noren, Signs, Posters!)
    mat_mosaic = bpy.data.materials.new("Arch_Mosaic_Tiles")
    mat_mosaic.use_nodes = True
    nt = mat_mosaic.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    t_col = nt.nodes.new("ShaderNodeTexImage")
    t_col.image = SP.load_image("tex_mosaic_tiles.png", "sRGB")
    t_nrm = nt.nodes.new("ShaderNodeTexImage")
    t_nrm.image = SP.load_image("tex_mosaic_tiles_normal.png", "Non-Color")
    t_rgh = nt.nodes.new("ShaderNodeTexImage")
    t_rgh.image = SP.load_image("tex_mosaic_tiles_roughness.png", "Non-Color")
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.85
    nt.links.new(t_col.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(t_rgh.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.65
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    M["mosaic"] = mat_mosaic

    M["noren"] = SP.make_image_mat("Arch_Noren", "tex_noren_4panel.png", roughness=0.84, coat=0.0, normal_file="tex_noren_normal.png")
    # Add gentle cloth subsurface translucency to noren!
    nbsdf = M["noren"].node_tree.nodes.get("Principled BSDF")
    if nbsdf and "Subsurface Weight" in nbsdf.inputs:
        nbsdf.inputs["Subsurface Weight"].default_value = 0.16

    M["sign_ramen"] = SP.make_image_mat("Arch_Sign_Ramen", "tex_sign_ramen.png", roughness=0.38, coat=0.22, emissive_strength=0.10)
    # 3D carved signboard materials (warm cream enamel board + deep satin lacquer-ink 3D extruded letters!)
    M["sign_board_cream"] = SP.make_diorama_mat(
        "Arch_Sign_Board_Cream", 0xFAF2DF, roughness=0.40, coat=0.22, bump_scale=48.0, bump_strength=0.025,
        ao_tint=0.16, emissive_hex=0xFFF0CE, emissive_strength=0.14
    )
    M["sign_ink"] = SP.make_diorama_mat(
        "Arch_Sign_Ink", 0x241E1C, roughness=0.28, metallic=0.08, coat=0.38, bump_strength=0.015, ao_tint=0.12
    )
    M["plaque_haikaze"] = SP.make_image_mat("Arch_Plaque_Haikaze", "tex_plaque_haikaze.png", roughness=0.22, coat=0.58)
    M["plaque_vert"] = SP.make_image_mat("Arch_Plaque_Vertical", "tex_plaque_vertical.png", roughness=0.52, coat=0.12)
    M["poster_summer"] = SP.make_image_mat("Arch_Poster_Summer", "tex_poster_summer.png", roughness=0.45, coat=0.14)
    M["plaque_201"] = SP.make_image_mat("Arch_Plaque_201", "tex_apt_plaque_201.png", roughness=0.24, coat=0.5)
    M["plaque_202"] = SP.make_image_mat("Arch_Plaque_202", "tex_apt_plaque_202.png", roughness=0.24, coat=0.5)
    M["welcome_mat"] = SP.make_image_mat("Arch_Welcome_Mat", "tex_welcome_mat.png", roughness=0.92, coat=0.0)
    return M


# ---------------------------------------------------------------------------
# Architectural Component Builders (True Boolean Cutouts & 3D Depth!)
# ---------------------------------------------------------------------------
def add_extruded_poly_wall(name, poly_xy, z0, z1, mat, col, bevel=0.042, segs=3, parent=None):
    """Build a clean watertight beveled extruded polygon wall (used for L-shaped flush-stair 1F footprint!)."""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in poly_xy]
    top = [bm.verts.new((x, y, z1)) for x, y in poly_xy]
    n = len(poly_xy)
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((bot[i], bot[ni], top[ni], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    if mat:
        obj.data.materials.append(mat)
    SP.link_obj(obj, col)
    if parent:
        obj.parent = parent
    if bevel > 0:
        b = obj.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = segs
        b.limit_method = "ANGLE"
        b.harden_normals = False
    SP.set_smooth(obj)
    return obj


def build_3d_ramen_signboard(name, center, M, col, parent):
    """Sculpted 3D Relief Signboard: dark cedar frame + cream enamel board + 3D bowl emblem + 3D extruded '海风拉面'!"""
    cx, cy, cz = center
    piv = SP.make_root(name, col)
    piv.location = Vector((cx, cy, cz))
    piv.parent = parent

    W, H, D = 2.66, 0.40, 0.11
    # Chunky beveled dark cedar outer frame (4 crisp non-overlapping mitered bars around recessed board!)
    ft = 0.044
    SP.add_rounded_box(f"{name}_FrmTop", (0, 0,  H * 0.5 - ft * 0.5), (W, D, ft), M["cedar_dark"], col, bevel=0.012, parent=piv)
    SP.add_rounded_box(f"{name}_FrmBot", (0, 0, -H * 0.5 + ft * 0.5), (W, D, ft), M["cedar_dark"], col, bevel=0.012, parent=piv)
    SP.add_rounded_box(f"{name}_FrmL",   (-W * 0.5 + ft * 0.5, 0, 0), (ft, D, H - ft * 1.85), M["cedar_dark"], col, bevel=0.012, parent=piv)
    SP.add_rounded_box(f"{name}_FrmR",   ( W * 0.5 - ft * 0.5, 0, 0), (ft, D, H - ft * 1.85), M["cedar_dark"], col, bevel=0.012, parent=piv)

    # Warm cream enameled backing board recessed slightly inside frame + inner teal pinstripe trim + 4 brass corner studs!
    bw, bh = W - ft * 1.9, H - ft * 1.9
    SP.add_rounded_box(f"{name}_Back", (0, 0.014, 0), (bw, 0.044, bh), M["sign_board_cream"], col, bevel=0.008, parent=piv)
    # Slim forest-teal pinstripe border proud on the cream face
    pt = 0.012
    py_face = -0.010
    SP.add_rounded_box(f"{name}_PinT", (0, py_face,  bh * 0.5 - 0.020), (bw - 0.04, 0.008, pt), M["teal_steel"], col, bevel=0.002, parent=piv)
    SP.add_rounded_box(f"{name}_PinB", (0, py_face, -bh * 0.5 + 0.020), (bw - 0.04, 0.008, pt), M["teal_steel"], col, bevel=0.002, parent=piv)
    SP.add_rounded_box(f"{name}_PinL", (-bw * 0.5 + 0.024, py_face, 0), (pt, 0.008, bh - 0.04), M["teal_steel"], col, bevel=0.002, parent=piv)
    SP.add_rounded_box(f"{name}_PinR", ( bw * 0.5 - 0.024, py_face, 0), (pt, 0.008, bh - 0.04), M["teal_steel"], col, bevel=0.002, parent=piv)
    for sx in (-W * 0.5 + 0.024, W * 0.5 - 0.024):
        for sz in (-H * 0.5 + 0.024, H * 0.5 - 0.024):
            SP.add_cyl(f"{name}_Stud_{sx:.2f}_{sz:.2f}", (sx, -D * 0.5 - 0.002, sz), 0.011, 0.008, M["brass"], col,
                       segs=12, bevel=0.002, rot=(math.pi * 0.5, 0, 0), parent=piv)

    # 3D Sculpted Miniature Ramen Bowl Relief Emblem on left of signboard!
    ex = -0.94
    ey = -0.022
    # Deep crimson carved half-bowl + foot + ivory trim band
    SP.add_cyl(f"{name}_BowlBody", (ex, ey, -0.036), 0.092, 0.024, M["fire_red"], col, segs=22, bevel=0.004,
               rot=(math.pi * 0.5, 0, 0), parent=piv)
    # Mask upper half cleanly with warm broth oval + cream bowl rim bar!
    SP.add_rounded_box(f"{name}_BowlRim", (ex, ey - 0.005, 0.002), (0.194, 0.022, 0.024), M["ceramic_white"], col, bevel=0.006, parent=piv)
    SP.add_rounded_box(f"{name}_BowlFoot", (ex, ey, -0.118), (0.095, 0.022, 0.022), M["fire_red"], col, bevel=0.005, parent=piv)
    # Sculpted golden broth dome + miniature white/coral narutomaki disc
    SP.add_rounded_box(f"{name}_Broth", (ex, ey - 0.003, 0.022), (0.155, 0.018, 0.034), M["cloth_yellow"], col, bevel=0.010, parent=piv)
    SP.add_cyl(f"{name}_Naruto", (ex - 0.022, ey - 0.010, 0.034), 0.028, 0.012, M["ceramic_white"], col, segs=18, bevel=0.003,
               rot=(math.pi * 0.5, 0, 0), parent=piv)
    SP.add_cyl(f"{name}_NarutoDot", (ex - 0.022, ey - 0.014, 0.034), 0.014, 0.008, M["cloth_coral"], col, segs=14, bevel=0.002,
               rot=(math.pi * 0.5, 0, 0), parent=piv)
    # Crossed cedar chopsticks resting cleanly across the bowl!
    SP.add_curve_tube(f"{name}_Chop1", [(ex - 0.01, ey - 0.016, 0.028), (ex + 0.125, ey - 0.016, 0.062)],
                      0.0055, M["cedar_dark"], col, resolution=3, bevel_res=3, parent=piv, spline_type="POLY")
    SP.add_curve_tube(f"{name}_Chop2", [(ex + 0.00, ey - 0.016, 0.016), (ex + 0.130, ey - 0.016, 0.038)],
                      0.0055, M["cedar_dark"], col, resolution=3, bevel_res=3, parent=piv, spline_type="POLY")
    # 3 crisp rising carved steam curls above the bowl
    for sx_st in (-0.044, 0.0, 0.044):
        st_pts = [
            (ex + sx_st, ey - 0.008, 0.056),
            (ex + sx_st - 0.012, ey - 0.008, 0.082),
            (ex + sx_st + 0.012, ey - 0.008, 0.106),
            (ex + sx_st - 0.006, ey - 0.008, 0.128),
        ]
        SP.add_curve_tube(f"{name}_Steam_{sx_st}", st_pts, 0.0055, M["fire_red"], col, resolution=6, bevel_res=3, parent=piv)

    # TRUE Blender 3D Extruded & Beveled Characters: '海 风 拉 面' (crisp at ANY distance!)
    font_path = "/System/Library/Fonts/STHeiti Medium.ttc"
    if not Path(font_path).exists():
        font_path = "/System/Library/Fonts/Hiragino Sans GB.ttc"
    bfont = bpy.data.fonts.load(font_path, check_existing=True)

    txt_curve = bpy.data.curves.new(f"{name}_Text3D", type="FONT")
    txt_curve.font = bfont
    txt_curve.body = "海风拉面"
    txt_curve.size = 0.255
    txt_curve.space_character = 1.48
    txt_curve.align_x = "CENTER"
    txt_curve.align_y = "CENTER"
    txt_curve.extrude = 0.014
    txt_curve.bevel_depth = 0.0032
    txt_curve.bevel_resolution = 2
    txt_curve.resolution_u = 4

    txt_obj = bpy.data.objects.new(f"{name}_Text3D", txt_curve)
    # Stand text upright facing -Y (local XY plane rotated +90 deg around X -> faces -Y!)
    txt_obj.location = Vector((0.24, -0.020, -0.004))
    txt_obj.rotation_euler = Euler((math.pi * 0.5, 0.0, 0.0))
    SP.link_obj(txt_obj, col)
    txt_obj.parent = piv

    # Convert FONT object cleanly to real beveled mesh so glTF export preserves crisp 3D letters!
    bpy.context.view_layer.objects.active = txt_obj
    txt_obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    txt_mesh = bpy.context.active_object
    txt_mesh.select_set(False)
    txt_mesh.data.materials.clear()
    txt_mesh.data.materials.append(M["sign_ink"])
    # Subtle brass/teal decorative accent dot or mini katakana subtitle? Keep ultra-clean bold 4 characters!
    return piv


def cut_wall_opening(wall_obj, center, width, height, facing, depth=0.65, col=None):
    """Carve a TRUE architectural window or door opening into a wall via EXACT Boolean."""
    if facing in ("-Y", "+Y"):
        size = (width, depth, height)
    else:
        size = (depth, width, height)
    cutter = SP.add_rounded_box("tmp_opening", center, size, None, col, bevel=0.012, segs=1)
    SP.boolean_cut(wall_obj, cutter)


def build_recessed_window(name, wall_obj, center, width, height, facing, M, col, parent, wood_frame=False, curtain_mat=None, is_shop=False):
    """Carve a real deep window opening into wall_obj and install 3D dual-track sliding window + interior room!"""
    cx, cy, cz = center
    # Normal vector pointing OUTWARD from wall face
    nvec = {
        "-Y": Vector((0, -1, 0)),
        "+Y": Vector((0,  1, 0)),
        "+X": Vector((1,  0, 0)),
        "-X": Vector((-1, 0, 0)),
    }[facing]
    rot_z = {"-Y": 0.0, "+Y": math.pi, "+X": math.pi * 0.5, "-X": -math.pi * 0.5}[facing]

    # 1) Carve true 0.36m deep window hole in the wall!
    cut_center = Vector(center) - nvec * 0.14
    cut_wall_opening(wall_obj, cut_center, width, height, facing, depth=0.46, col=col)

    # Local pivot at outer wall face center, oriented so local -Y points OUTWARD!
    piv = SP.make_root(name, col)
    piv.location = Vector(center)
    piv.rotation_euler = Euler((0.0, 0.0, rot_z))
    piv.parent = parent

    frame_m = M["cedar"] if wood_frame else M["alum"]
    frame_d = M["cedar_dark"] if wood_frame else M["apt_frame"]
    t_f = 0.062

    # 2) Chunky beveled outer window frame lining the recessed reveal + sloped projecting sill (clean butt-joints, ZERO coplanar overlap!)
    SP.add_rounded_box(f"{name}_FrmT", (0, 0.08,  height * 0.5 - t_f * 0.45), (width + 0.05, 0.24, t_f), frame_m, col, bevel=0.014, parent=piv)
    SP.add_rounded_box(f"{name}_FrmB", (0, 0.05, -height * 0.5 + t_f * 0.35), (width + 0.11, 0.30, t_f * 1.15), frame_d, col, bevel=0.016, parent=piv)
    side_h = max(0.10, height - t_f * 1.85)
    SP.add_rounded_box(f"{name}_FrmL", (-width * 0.5 + t_f * 0.45, 0.08, 0.004), (t_f, 0.236, side_h), frame_m, col, bevel=0.012, parent=piv)
    SP.add_rounded_box(f"{name}_FrmR", ( width * 0.5 - t_f * 0.45, 0.08, 0.004), (t_f, 0.236, side_h), frame_m, col, bevel=0.012, parent=piv)

    # 3) Dual-track offset 3D sliding sashes + reflective clear glass panes (clean non-overlapping stiles!)
    iw = width - t_f * 1.8
    ih = height - t_f * 1.8
    sash_w = iw * 0.52
    for idx, (sx, sy_off) in enumerate([(-iw * 0.24, 0.095), (iw * 0.24, 0.135)]):
        st = 0.034
        # 4 non-overlapping sash stiles
        SP.add_rounded_box(f"{name}_SashT_{idx}", (sx, sy_off,  ih * 0.5 - st * 0.5), (sash_w, 0.028, st), frame_m, col, bevel=0.005, parent=piv)
        SP.add_rounded_box(f"{name}_SashB_{idx}", (sx, sy_off, -ih * 0.5 + st * 0.5), (sash_w, 0.028, st), frame_m, col, bevel=0.005, parent=piv)
        SP.add_rounded_box(f"{name}_SashL_{idx}", (sx - sash_w * 0.5 + st * 0.5, sy_off, 0), (st, 0.026, max(0.05, ih - st * 2.02)), frame_m, col, bevel=0.005, parent=piv)
        SP.add_rounded_box(f"{name}_SashR_{idx}", (sx + sash_w * 0.5 - st * 0.5, sy_off, 0), (st, 0.026, max(0.05, ih - st * 2.02)), frame_m, col, bevel=0.005, parent=piv)
        if wood_frame:
            # Cozy timber muntin crossbars for the 1F ramen shop window!
            SP.add_rounded_box(f"{name}_MullH_{idx}", (sx, sy_off, 0), (sash_w - st, 0.022, 0.026), frame_d, col, bevel=0.005, parent=piv)
        # Clear glossy reflective glass pane!
        SP.add_rounded_box(f"{name}_Glass_{idx}", (sx, sy_off, 0), (sash_w - st * 1.4, 0.010, ih - st * 1.4), M["win_glass"], col, bevel=0.001, parent=piv)

    # 4) TRUE 3D miniature room box recessed inside behind the glass (tight margins so corner rooms NEVER poke outer walls!)
    rm_d = 0.44
    rm_mat = M["shop_interior"] if is_shop else M["room_wall_warm"]
    # Back, side, ceiling, floor inner enclosure
    SP.add_rounded_box(f"{name}_RoomBack", (0, 0.18 + rm_d, 0), (width + 0.02, 0.03, height + 0.04), rm_mat, col, bevel=0.004, parent=piv)
    SP.add_rounded_box(f"{name}_RoomCeil", (0, 0.18 + rm_d * 0.5,  height * 0.5 + 0.01), (width + 0.02, rm_d, 0.03), rm_mat, col, bevel=0.003, parent=piv)
    SP.add_rounded_box(f"{name}_RoomFlr",  (0, 0.18 + rm_d * 0.5, -height * 0.5 - 0.01), (width + 0.02, rm_d, 0.03), rm_mat, col, bevel=0.003, parent=piv)
    SP.add_rounded_box(f"{name}_RoomL", (-width * 0.5 - 0.005, 0.18 + rm_d * 0.5, 0), (0.03, rm_d, height + 0.04), rm_mat, col, bevel=0.003, parent=piv)
    SP.add_rounded_box(f"{name}_RoomR", ( width * 0.5 + 0.005, 0.18 + rm_d * 0.5, 0), (0.03, rm_d, height + 0.04), rm_mat, col, bevel=0.003, parent=piv)

    if is_shop:
        # 1F Ramen shop interior storytelling: wooden counter shelf + miniature stacked ceramic bowls + lucky cat figurine!
        SP.add_rounded_box(f"{name}_Counter", (0, 0.34, -height * 0.34), (width - 0.06, 0.28, 0.05), M["cedar"], col, bevel=0.010, parent=piv)
        for bx in (-0.30, -0.02):
            SP.add_cyl(f"{name}_Bowl_{bx}", (bx, 0.30, -height * 0.26), 0.075, 0.075, M["ceramic_bowl"] if bx < -0.1 else M["ceramic_white"], col, segs=18, r_top=0.095, parent=piv)
        # Adorable tiny glossy ceramic Maneki-Neko (lucky beckoning cat) sitting right on the counter!
        nx_c, ny_c, nz_c = 0.31, 0.26, -height * 0.29
        SP.add_cyl(f"{name}_NekoBody", (nx_c, ny_c, nz_c + 0.065), 0.056, 0.12, M["ceramic_white"], col, segs=18, bevel=0.022, r_top=0.046, parent=piv)
        SP.add_cyl(f"{name}_NekoCollar", (nx_c, ny_c, nz_c + 0.115), 0.050, 0.018, M["fire_red"], col, segs=16, bevel=0.006, parent=piv)
        SP.add_cyl(f"{name}_NekoBell", (nx_c, ny_c - 0.048, nz_c + 0.108), 0.014, 0.014, M["brass"], col, segs=12, bevel=0.005, parent=piv)
        bm_nh = bmesh.new()
        bmesh.ops.create_uvsphere(bm_nh, u_segments=16, v_segments=12, radius=0.056)
        mh = bpy.data.meshes.new(f"{name}_NekoHead")
        bm_nh.to_mesh(mh)
        bm_nh.free()
        nh = bpy.data.objects.new(f"{name}_NekoHead", mh)
        nh.location = Vector((nx_c, ny_c, nz_c + 0.165))
        nh.data.materials.append(M["ceramic_white"])
        SP.link_obj(nh, col)
        nh.parent = piv
        SP.set_smooth(nh, weighted=False)
        for ex_s in (-0.032, 0.032):
            SP.add_cyl(f"{name}_NekoEar_{ex_s}", (nx_c + ex_s, ny_c, nz_c + 0.215), 0.018, 0.036, M["ceramic_white"], col, segs=10, r_top=0.003, parent=piv)
        # Raised beckoning paw!
        SP.add_cyl(f"{name}_NekoPaw", (nx_c + 0.052, ny_c - 0.02, nz_c + 0.15), 0.018, 0.065, M["ceramic_white"], col, segs=12, bevel=0.008, rot=(0.25, -0.35, 0), parent=piv)
        # Warm glowing miniature hanging pendant lamp inside ramen shop
        SP.add_cyl(f"{name}_LampCord", (0, 0.36, height * 0.36), 0.008, 0.22, M["dark_iron"], col, segs=8, parent=piv)
        SP.add_cyl(f"{name}_LampShade", (0, 0.36, height * 0.24), 0.11, 0.07, M["porch_bulb"], col, segs=18, r_top=0.05, parent=piv)
    else:
        # 2F Apartment interior storytelling: mini curtain rod + 3D sculpted pleated curtains!
        cmat = curtain_mat or M["curtain_cream"]
        SP.add_cyl(f"{name}_CurtRod", (0, 0.22, height * 0.42), 0.012, width - 0.04, M["bamboo"], col, segs=10, rot=(0, math.pi * 0.5, 0), parent=piv)
        # Sculpted wavy pleated curtains parted softly to left & right!
        for side in (-1, 1):
            bm = bmesh.new()
            cw = width * 0.32
            ch = height * 0.90
            nx, nz = 10, 6
            grid = []
            for iz in range(nz):
                row = []
                tz = iz / float(nz - 1)
                z = -ch * 0.48 + tz * ch
                for ix in range(nx):
                    tx = ix / float(nx - 1)
                    # Gently gathered toward outer edge
                    x = side * (width * 0.46 - tx * cw * (0.85 + 0.15 * tz))
                    y = 0.23 + 0.032 * math.sin(tx * math.pi * 5.0)
                    row.append(bm.verts.new((x, y, z)))
                grid.append(row)
            for iz in range(nz - 1):
                for ix in range(nx - 1):
                    bm.faces.new((grid[iz][ix], grid[iz][ix + 1], grid[iz + 1][ix + 1], grid[iz + 1][ix]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            cmesh = bpy.data.meshes.new(f"{name}_Curt_{side}")
            bm.to_mesh(cmesh)
            bm.free()
            cobj = bpy.data.objects.new(f"{name}_Curt_{side}", cmesh)
            cobj.data.materials.append(cmat)
            SP.link_obj(cobj, col)
            cobj.parent = piv
            sol = cobj.modifiers.new("Solidify", "SOLIDIFY")
            sol.thickness = 0.014
            SP.set_smooth(cobj, weighted=False)

    return piv


def build_apartment_doorway(name, wall_obj, x_face, y_center, z_floor, plaque_mat, M, templates, col, parent, meter_side=1.0, add_slippers=False, hang_bag=False):
    """Carve a true 2F apartment door recess (+X wall), install molded steel door, lamp, meter & circular delivery hook!"""
    dw, dh = 0.96, 2.08
    # Carve 0.28m deep doorway recess into 2F +X wall!
    cut_wall_opening(wall_obj, (x_face - 0.10, y_center, z_floor + dh * 0.5), dw, dh, "+X", depth=0.42, col=col)

    piv = SP.make_root(name, col)
    piv.location = Vector((x_face, y_center, z_floor))
    piv.parent = parent

    # Chunky cream aluminum door frame surround + bottom concrete threshold (clean non-overlapping butt-joints!)
    t = 0.068
    SP.add_rounded_box(f"{name}_FrmT", (-0.06, 0, dh - t * 0.35), (0.24, dw + 0.10, t), M["apt_frame"], col, bevel=0.014, parent=piv)
    SP.add_rounded_box(f"{name}_FrmL", (-0.06, -dw * 0.5 + t * 0.35, (dh - t) * 0.5), (0.236, t, dh - t * 0.90), M["apt_frame"], col, bevel=0.012, parent=piv)
    SP.add_rounded_box(f"{name}_FrmR", (-0.06,  dw * 0.5 - t * 0.35, (dh - t) * 0.5), (0.236, t, dh - t * 0.90), M["apt_frame"], col, bevel=0.012, parent=piv)
    SP.add_rounded_box(f"{name}_Step", (0.04, 0, 0.022), (0.24, dw + 0.12, 0.044), M["deck_cream"], col, bevel=0.010, parent=piv)

    # Recessed seafoam-teal enameled steel door leaf with TRUE 3D molded recessed panels!
    dx_leaf = -0.11
    door_body = SP.add_rounded_box(f"{name}_Leaf", (dx_leaf, 0, dh * 0.5), (0.065, dw - 0.12, dh - 0.09), M["apt_door"], col, bevel=0.014, parent=piv)
    # Trim moldings framing upper & lower recessed door panels
    for pz, ph in [(1.46, 0.72), (0.58, 0.70)]:
        SP.add_rounded_box(f"{name}_MoldT_{pz}", (dx_leaf + 0.036, 0, pz + ph * 0.5), (0.016, dw - 0.30, 0.030), M["apt_door"], col, bevel=0.006, parent=piv)
        SP.add_rounded_box(f"{name}_MoldB_{pz}", (dx_leaf + 0.036, 0, pz - ph * 0.5), (0.016, dw - 0.30, 0.030), M["apt_door"], col, bevel=0.006, parent=piv)
        SP.add_rounded_box(f"{name}_MoldL_{pz}", (dx_leaf + 0.036, -(dw - 0.32) * 0.5, pz), (0.016, 0.030, ph), M["apt_door"], col, bevel=0.006, parent=piv)
        SP.add_rounded_box(f"{name}_MoldR_{pz}", (dx_leaf + 0.036,  (dw - 0.32) * 0.5, pz), (0.016, 0.030, ph), M["apt_door"], col, bevel=0.006, parent=piv)

    # Brushed-brass door lever handle + deadbolt rosette + peephole + mail slot!
    hy = -0.32
    SP.add_cyl(f"{name}_Rosette", (dx_leaf + 0.042, hy, 1.00), 0.032, 0.018, M["brass"], col, segs=16, rot=(0, math.pi * 0.5, 0), parent=piv)
    SP.add_curve_tube(f"{name}_Lever", [(dx_leaf + 0.042, hy, 1.00), (dx_leaf + 0.085, hy, 1.00), (dx_leaf + 0.088, hy + 0.11, 1.00)],
                      0.011, M["brass"], col, resolution=6, bevel_res=4, parent=piv)
    SP.add_cyl(f"{name}_Lock", (dx_leaf + 0.042, hy, 1.12), 0.020, 0.016, M["brass"], col, segs=14, rot=(0, math.pi * 0.5, 0), parent=piv)
    SP.add_cyl(f"{name}_Peep", (dx_leaf + 0.040, 0.0, 1.48), 0.016, 0.014, M["brass"], col, segs=14, rot=(0, math.pi * 0.5, 0), parent=piv)
    SP.add_rounded_box(f"{name}_MailSlot", (dx_leaf + 0.044, 0.0, 0.90), (0.022, 0.24, 0.058), M["alum"], col, bevel=0.007, parent=piv)

    # Crisp raised enamel apartment number plaque (201 / 202)!
    SP.add_rounded_box(f"{name}_NumBack", (dx_leaf + 0.038, 0.0, 1.66), (0.018, 0.21, 0.105), M["dark_iron"], col, bevel=0.005, parent=piv)
    SP.add_uv_quad(f"{name}_NumArt", (dx_leaf + 0.050, 0.0, 1.66), 0.19, 0.092, plaque_mat, col, facing="+X", parent=piv)

    # Cozy warm glowing caged marine porch bulkhead lamp right above the door!
    SP.add_rounded_box(f"{name}_LampBase", (0.03, 0.0, 2.28), (0.06, 0.24, 0.12), M["teal_steel"], col, bevel=0.016, parent=piv)
    SP.add_rounded_box(f"{name}_LampGlow", (0.065, 0.0, 2.28), (0.065, 0.19, 0.085), M["porch_bulb"], col, bevel=0.020, parent=piv)
    for gy in (-0.05, 0.05):
        SP.add_rounded_box(f"{name}_LampCage", (0.098, gy, 2.28), (0.012, 0.012, 0.10), M["teal_steel"], col, bevel=0.003, parent=piv)

    # Intercom box + electric meter + neat vertical conduit pipe on meter_side
    my = meter_side * 0.68
    SP.add_rounded_box(f"{name}_Intercom", (0.032, my, 1.38), (0.055, 0.13, 0.18), M["apt_frame"], col, bevel=0.012, parent=piv)
    SP.add_cyl(f"{name}_BellBtn", (0.064, my, 1.34), 0.016, 0.012, M["dark_iron"], col, segs=12, rot=(0, math.pi * 0.5, 0), parent=piv)
    SP.add_rounded_box(f"{name}_Meter", (0.065, my, 2.15), (0.12, 0.19, 0.24), M["apt_frame"], col, bevel=0.018, parent=piv)
    SP.add_rounded_box(f"{name}_MeterWin", (0.128, my, 2.16), (0.014, 0.11, 0.08), M["dark_iron"], col, bevel=0.004, parent=piv)
    SP.add_curve_tube(f"{name}_Conduit", [(0.03, my, 2.27), (0.03, my, 3.16)], 0.015, M["dark_iron"], col, parent=piv, spline_type="POLY")

    # PATRICK'S SIGNATURE CIRCULAR BRASS DOORSTEP DELIVERY HOOK right beside the door frame!
    # Cleanly spaced from neighboring windowsills at chest height z=1.24m!
    hook_y = -0.60 if meter_side > 0 else 0.64
    place_prop(templates, "Prop_Door_Hook", (0.01, hook_y, 1.24), rot_z=math.pi * 0.5, scale=1.18, col=col, parent=piv, tag=name)
    # Showcase a cute miniature kraft takeaway delivery bag ACTUALLY hanging on Door 202's circular brass hook!
    if hang_bag:
        place_prop(templates, "Prop_Delivery_Bag", (0.098, hook_y, 1.148), rot_z=math.pi * 0.5 + 0.08, scale=1.05, col=col, parent=piv, tag=name)

    # Cozy storytelling extras outside Door 201: woven paw welcome mat + pair of cute pastel slippers!
    if add_slippers:
        SP.add_rounded_box(f"{name}_MatBase", (0.44, 0.0, 0.010), (0.44, 0.78, 0.018), M["cedar_dark"], col, bevel=0.007, parent=piv)
        SP.add_uv_quad(f"{name}_MatTop", (0.44, 0.0, 0.021), 0.74, 0.40, M["welcome_mat"], col, facing="+Z", rot=(0, 0, math.pi * 0.5), parent=piv)
        # Adorable plump miniature Animal Crossing indoor slippers parked neatly next to mat!
        for sy, yaw in [(0.44, 0.08), (0.57, -0.06)]:
            spiv = SP.make_root(f"{name}_Slipper_{sy:.2f}", col)
            spiv.location = Vector((0.36, sy, 0.016))
            spiv.rotation_euler = Euler((0, 0, yaw))
            spiv.parent = piv
            SP.add_rounded_box(f"{name}_Sole", (0, 0, 0.012), (0.23, 0.095, 0.024), M["curtain_cream"], col, bevel=0.011, parent=spiv)
            SP.add_rounded_box(f"{name}_Strap", (0.03, 0, 0.038), (0.11, 0.092, 0.042), M["cloth_coral"], col, bevel=0.018, parent=spiv)

    return piv


def build_tubular_railing(name, p0, p1, z_base, height, M, col, parent, spacing=0.28):
    """Chunky Animal Crossing satin-teal painted steel tubular railing with rounded top bar & weld collars."""
    v0 = Vector((p0[0], p0[1], 0.0))
    v1 = Vector((p1[0], p1[1], 0.0))
    diff = v1 - v0
    length = diff.length
    if length < 0.05:
        return
    piv = SP.make_root(name, col)
    piv.parent = parent

    # Chunky tubular top handrail + lower rail
    SP.add_curve_tube(f"{name}_TopBar", [(p0[0], p0[1], z_base + height), (p1[0], p1[1], z_base + height)],
                      0.032, M["teal_steel"], col, resolution=4, bevel_res=5, parent=piv, spline_type="POLY")
    SP.add_curve_tube(f"{name}_BotBar", [(p0[0], p0[1], z_base + 0.12), (p1[0], p1[1], z_base + 0.12)],
                      0.018, M["teal_steel"], col, resolution=4, bevel_res=4, parent=piv, spline_type="POLY")

    # End corner posts with bolted foot plates + vertical pickets
    n_p = max(2, int(round(length / spacing)))
    for i in range(n_p + 1):
        t = i / float(n_p)
        px = p0[0] + diff.x * t
        py = p0[1] + diff.y * t
        is_end = (i == 0 or i == n_p)
        r = 0.026 if is_end else 0.013
        z0 = z_base if is_end else z_base + 0.12
        SP.add_cyl(f"{name}_Post_{i}", (px, py, (z0 + z_base + height) * 0.5), r, (z_base + height) - z0,
                   M["teal_steel"], col, segs=12, bevel=0.004, parent=piv)
        if is_end:
            SP.add_cyl(f"{name}_Foot_{i}", (px, py, z_base + 0.018), 0.052, 0.032, M["teal_steel"], col, segs=14, bevel=0.006, parent=piv)


def build_billowing_noren(name, x_center, y_rod, z_rod, M, col, parent):
    """Sculpted 3D gently billowing 4-panel crimson cloth noren threaded onto a bamboo rod with cord loops!"""
    piv = SP.make_root(name, col)
    piv.parent = parent

    # Rounded bamboo noren rod with end caps + wooden mounting brackets
    SP.add_cyl(f"{name}_Rod", (x_center, y_rod, z_rod), 0.024, 2.28, M["bamboo"], col, segs=16, rot=(0, math.pi * 0.5, 0), parent=piv)
    for sx in (-1.08, 1.08):
        SP.add_rounded_box(f"{name}_Brk", (x_center + sx, y_rod + 0.10, z_rod), (0.048, 0.22, 0.055), M["cedar_dark"], col, bevel=0.010, parent=piv)

    # 4 sculpted wavy panels (each mapped cleanly to its [i/4 .. (i+1)/4] UV slice of tex_noren_4panel.png!)
    panel_w = 0.455
    panel_h = 0.64
    gap = 0.032
    total_w = 4 * panel_w + 3 * gap
    x0_all = x_center - total_w * 0.5

    for idx in range(4):
        px_l = x0_all + idx * (panel_w + gap)
        px_r = px_l + panel_w
        # Two cute hanging cloth loop tabs wrapping the bamboo rod
        for frac in (0.20, 0.80):
            lx = px_l + panel_w * frac
            SP.add_cyl(f"{name}_Loop_{idx}_{frac}", (lx, y_rod, z_rod), 0.032, 0.044, M["noren"], col, segs=14, rot=(0, math.pi * 0.5, 0), parent=piv)

        bm = bmesh.new()
        nx, nz = 7, 9
        grid = []
        phase = idx * 0.95
        for iz in range(nz):
            tz = iz / float(nz - 1)  # 0 = bottom hem, 1 = top rod
            z = (z_rod - panel_h) + tz * panel_h
            # Soft sea-breeze billowing bell curve (pinned at top tz=1, waves gently outward at bottom tz=0!)
            sway = (1.0 - tz) ** 1.45
            row = []
            for ix in range(nx):
                tx = ix / float(nx - 1)
                x = px_l + tx * panel_w
                # Gentle natural breeze lift & organic cross-ripple
                y = y_rod - sway * (0.068 + 0.022 * math.sin(phase + tx * math.pi)) - 0.010 * math.sin(tz * math.pi)
                row.append(bm.verts.new((x, y, z)))
            grid.append(row)

        uv_layer = bm.loops.layers.uv.new("UVMap")
        u0 = idx * 0.25 + 0.006
        u1 = (idx + 1) * 0.25 - 0.006
        for iz in range(nz - 1):
            for ix in range(nx - 1):
                f = bm.faces.new((grid[iz][ix], grid[iz][ix + 1], grid[iz + 1][ix + 1], grid[iz + 1][ix]))
                uvs = [
                    (u0 + (u1 - u0) * (ix / (nx - 1)), iz / (nz - 1)),
                    (u0 + (u1 - u0) * ((ix + 1) / (nx - 1)), iz / (nz - 1)),
                    (u0 + (u1 - u0) * ((ix + 1) / (nx - 1)), (iz + 1) / (nz - 1)),
                    (u0 + (u1 - u0) * (ix / (nx - 1)), (iz + 1) / (nz - 1)),
                ]
                for loop, uv in zip(f.loops, uvs):
                    loop[uv_layer].uv = uv
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(f"{name}_Panel_{idx}")
        bm.to_mesh(mesh)
        bm.free()
        pobj = bpy.data.objects.new(f"{name}_Panel_{idx}", mesh)
        pobj.data.materials.append(M["noren"])
        SP.link_obj(pobj, col)
        pobj.parent = piv
        sol = pobj.modifiers.new("Solidify", "SOLIDIFY")
        sol.thickness = 0.012
        sol.offset = 0.0
        SP.set_smooth(pobj, weighted=False)


def build_rooftop_features(M, col, parent):
    """Lived-in miniature diorama rooftop: penthouse, Japanese domed water tank, billowing laundry, vents & wires!"""
    piv = SP.make_root("Haikaze_Rooftop_Features", col)
    piv.parent = parent
    z_deck = 6.96  # Recessed roof deck elevation inside chunky parapet tub

    # 1) Cozy rooftop stairwell penthouse (back-left) with chunky beveled sage roof cap & louvered door
    ph = SP.add_rounded_box("Roof_Penthouse", (-2.15, 1.45, z_deck + 0.72), (2.20, 2.05, 1.44), M["plaster"], col, bevel=0.045, segs=3, parent=piv)
    SP.add_rounded_box("Roof_PenthouseCap", (-2.15, 1.45, z_deck + 1.50), (2.46, 2.30, 0.18), M["sage_slab"], col, bevel=0.038, segs=3, parent=piv)
    # Recessed miniature steel roof access door on +X face of penthouse
    cut_wall_opening(ph, (-1.05, 1.45, z_deck + 0.62), 0.72, 1.18, "+X", depth=0.32, col=col)
    SP.add_rounded_box("Roof_Door", (-1.12, 1.45, z_deck + 0.62), (0.06, 0.66, 1.12), M["apt_door"], col, bevel=0.012, parent=piv)
    SP.add_cyl("Roof_DoorKnob", (-1.07, 1.22, z_deck + 0.58), 0.024, 0.03, M["brass"], col, segs=12, rot=(0, math.pi * 0.5, 0), parent=piv)
    # Cute round porthole vent on front (-Y) face of penthouse
    SP.add_cyl("Roof_PortholeRim", (-2.15, 0.42, z_deck + 0.92), 0.22, 0.07, M["alum"], col, segs=22, bevel=0.012, rot=(math.pi * 0.5, 0, 0), parent=piv)
    SP.add_cyl("Roof_PortholeIn", (-2.15, 0.40, z_deck + 0.92), 0.16, 0.04, M["dark_iron"], col, segs=20, rot=(math.pi * 0.5, 0, 0), parent=piv)

    # 2) Classic Japanese domed fiberglass rooftop water tank ('高架水槽') on chunky teal steel legs!
    tx, ty = 1.95, 2.05
    for lx in (-0.42, 0.42):
        for ly in (-0.42, 0.42):
            SP.add_cyl("Tank_Leg", (tx + lx, ty + ly, z_deck + 0.24), 0.042, 0.48, M["teal_steel"], col, segs=12, bevel=0.008, parent=piv)
            SP.add_rounded_box("Tank_Foot", (tx + lx, ty + ly, z_deck + 0.02), (0.14, 0.14, 0.04), M["dark_iron"], col, bevel=0.008, parent=piv)
    SP.add_rounded_box("Tank_Frame", (tx, ty, z_deck + 0.46), (1.06, 1.06, 0.08), M["teal_steel"], col, bevel=0.016, parent=piv)
    # Lathe-spun plump ribbed Japanese fiberglass water tank dome!
    tank_prof = [
        (0.56, 0.00), (0.62, 0.06), (0.64, 0.44), (0.67, 0.48), (0.64, 0.52),
        (0.64, 0.92), (0.58, 1.06), (0.42, 1.18), (0.18, 1.24), (0.001, 1.26),
    ]
    SP.add_lathe("Roof_WaterTank", tank_prof, (tx, ty, z_deck + 0.50), M["water_tank"], col, segs=28, parent=piv)
    SP.add_cyl("Tank_Hatch", (tx - 0.18, ty - 0.18, z_deck + 1.66), 0.14, 0.09, M["alum"], col, segs=18, bevel=0.014, parent=piv)
    # Curved steel supply & overflow pipes sweeping neatly into roof deck + stainless access ladder!
    SP.add_curve_tube("Tank_Pipe1", [(tx - 0.58, ty - 0.10, z_deck + 1.25), (tx - 0.78, ty - 0.10, z_deck + 1.22),
                                     (tx - 0.80, ty - 0.10, z_deck + 0.02)], 0.032, M["alum"], col, parent=piv)
    SP.add_curve_tube("Tank_Pipe2", [(tx - 0.32, ty - 0.42, z_deck + 0.52), (tx - 0.32, ty - 0.65, z_deck + 0.35),
                                     (tx - 0.32, ty - 0.65, z_deck + 0.02)], 0.026, M["pipe_white"], col, parent=piv)
    # Chunky stainless tank access ladder climbing the front (-Y) side of the water tank!
    for lx_r in (-0.16, 0.16):
        SP.add_curve_tube(f"Tank_LadRail_{lx_r}", [(tx + lx_r, ty - 0.68, z_deck + 0.02), (tx + lx_r, ty - 0.68, z_deck + 1.62), (tx + lx_r, ty - 0.46, z_deck + 1.72)],
                          0.016, M["alum"], col, resolution=6, bevel_res=4, parent=piv)
    for rung_i in range(6):
        rz = z_deck + 0.24 + rung_i * 0.25
        SP.add_cyl(f"Tank_LadRung_{rung_i}", (tx, ty - 0.68, rz), 0.012, 0.32, M["alum"], col, segs=10, rot=(0, math.pi * 0.5, 0), parent=piv)
    # Decorative painted sage trim band around water tank belly
    SP.add_cyl("Tank_Band", (tx, ty, z_deck + 0.98), 0.655, 0.065, M["teal_steel"], col, segs=28, bevel=0.008, parent=piv)

    # Adorable stylized Animal Crossing coastal seagulls perched playfully on the rooftop teal guardrail!
    for gi, (gx, gy, gyaw) in enumerate([(-2.85, -3.84, 0.45), (3.15, -3.84, -0.65)]):
        gp = SP.make_root(f"Roof_Seagull_{gi}", col)
        gp.location = Vector((gx, gy, 7.12 + 0.86 + 0.025))
        gp.rotation_euler = Euler((0, 0, gyaw))
        gp.parent = piv
        # Little orange feet gripping the railing
        for fy_s in (-0.028, 0.028):
            SP.add_cyl(f"Gull_Leg_{gi}_{fy_s}", (0, fy_s, 0.032), 0.007, 0.065, M["gull_beak"], col, segs=8, parent=gp)
        # Plump rounded white body + folded grey wings + upturned tail + cute head & yellow beak!
        b_b = SP.add_rounded_box(f"Gull_Body_{gi}", (0.0, 0.0, 0.105), (0.22, 0.125, 0.115), M["gull_white"], col, bevel=0.052, segs=3, parent=gp)
        SP.add_rounded_box(f"Gull_Wing_{gi}", (-0.02, 0.0, 0.118), (0.19, 0.136, 0.065), M["gull_grey"], col, bevel=0.028, segs=3, parent=gp)
        SP.add_rounded_box(f"Gull_Tail_{gi}", (-0.13, 0.0, 0.125), (0.09, 0.06, 0.024), M["gull_grey"], col, bevel=0.010, rot=(0, -0.32, 0), parent=gp)
        bm_gh = bmesh.new()
        bmesh.ops.create_uvsphere(bm_gh, u_segments=16, v_segments=12, radius=0.056)
        gmh = bpy.data.meshes.new(f"Gull_Head_{gi}")
        bm_gh.to_mesh(gmh)
        bm_gh.free()
        gho = bpy.data.objects.new(f"Gull_Head_{gi}", gmh)
        gho.location = Vector((0.085, 0.0, 0.185))
        gho.data.materials.append(M["gull_white"])
        SP.link_obj(gho, col)
        gho.parent = gp
        SP.set_smooth(gho, weighted=False)
        SP.add_cyl(f"Gull_Beak_{gi}", (0.155, 0.0, 0.178), 0.018, 0.068, M["gull_beak"], col, segs=12, r_top=0.004, rot=(0, math.pi * 0.54, 0), parent=gp)
        for ey_s in (-0.036, 0.036):
            SP.add_cyl(f"Gull_Eye_{gi}_{ey_s}", (0.112, ey_s, 0.198), 0.009, 0.012, M["dark_iron"], col, segs=10, rot=(math.pi * 0.5, 0, 0), parent=gp)

    # 3) Adorable Miniature Rooftop Clothesline ('物干し竿') with 3 billowing sculpted laundry items!
    cy_l = -1.65
    for sx in (-0.85, 1.75):
        # Concrete laundry base block + slender steel stand pole
        SP.add_rounded_box("Laundry_Base", (sx, cy_l, z_deck + 0.12), (0.28, 0.28, 0.24), M["plinth"], col, bevel=0.025, parent=piv)
        SP.add_cyl("Laundry_Post", (sx, cy_l, z_deck + 0.86), 0.024, 1.48, M["alum"], col, segs=12, parent=piv)
    # Horizontal bamboo laundry pole
    SP.add_cyl("Laundry_Pole", (0.45, cy_l, z_deck + 1.54), 0.020, 2.95, M["bamboo"], col, segs=14, rot=(0, math.pi * 0.5, 0), parent=piv)

    # 3 sculpted softly billowing cloth pieces (sunny yellow tee, coastal sky towel, coral apron!)
    clothes_spec = [
        (-0.25, 0.52, 0.58, M["cloth_yellow"], 0.4),
        ( 0.48, 0.42, 0.66, M["cloth_sky"],    1.2),
        ( 1.15, 0.46, 0.54, M["cloth_coral"],  2.1),
    ]
    for cx_c, cw, ch, cmat, ph_c in clothes_spec:
        # Two tiny wooden clothespins gripping the bamboo pole!
        for px_pin in (cx_c - cw * 0.32, cx_c + cw * 0.32):
            SP.add_rounded_box("Clothespin", (px_pin, cy_l, z_deck + 1.565), (0.026, 0.036, 0.068), M["cedar"], col, bevel=0.006, parent=piv)
        bm = bmesh.new()
        nx, nz = 7, 8
        grid = []
        for iz in range(nz):
            tz = iz / float(nz - 1)
            z = (z_deck + 1.53 - ch) + tz * ch
            sway = (1.0 - tz) ** 1.4
            row = []
            for ix in range(nx):
                tx = ix / float(nx - 1)
                x = cx_c - cw * 0.5 + tx * cw
                y = cy_l - sway * (0.14 + 0.035 * math.sin(ph_c + tx * math.pi * 1.6))
                row.append(bm.verts.new((x, y, z)))
            grid.append(row)
        for iz in range(nz - 1):
            for ix in range(nx - 1):
                bm.faces.new((grid[iz][ix], grid[iz][ix + 1], grid[iz + 1][ix + 1], grid[iz + 1][ix]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cm = bpy.data.meshes.new(f"Laundry_{cx_c:.2f}")
        bm.to_mesh(cm)
        bm.free()
        co = bpy.data.objects.new(f"Laundry_{cx_c:.2f}", cm)
        co.data.materials.append(cmat)
        SP.link_obj(co, col)
        co.parent = piv
        sol = co.modifiers.new("Solidify", "SOLIDIFY")
        sol.thickness = 0.014
        SP.set_smooth(co, weighted=False)

    # 4) Twin cute mushroom stainless roof vents + porcelain telecom insulator mast
    for vx, vy in [(0.15, 2.25), (0.68, 2.25)]:
        SP.add_cyl("Roof_VentStem", (vx, vy, z_deck + 0.24), 0.11, 0.48, M["alum"], col, segs=18, parent=piv)
        SP.add_cyl("Roof_VentCap", (vx, vy, z_deck + 0.52), 0.21, 0.12, M["alum"], col, segs=20, bevel=0.032, r_top=0.14, parent=piv)

    # Porcelain power/telecom mast on SE roof parapet corner (ready for drooping catenary lines!)
    SP.add_cyl("Mast_Pole", (3.95, -2.55, z_deck + 0.92), 0.028, 1.84, M["dark_iron"], col, segs=12, parent=piv)
    SP.add_rounded_box("Mast_Crossbar", (3.95, -2.55, z_deck + 1.68), (0.04, 0.58, 0.04), M["dark_iron"], col, bevel=0.008, parent=piv)
    for iy in (-2.75, -2.35):
        SP.add_cyl("Mast_Insulator", (3.95, iy, z_deck + 1.73), 0.032, 0.065, M["ceramic_white"], col, segs=14, bevel=0.010, parent=piv)


# ---------------------------------------------------------------------------
# Build Complete Standalone Haikaze-so Hero Diorama Building!
# ---------------------------------------------------------------------------
def build_haikaze_hero():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = SP.ensure_collection("Haikaze_Hero")
    root = SP.make_root("Town_Hero_Haikaze", col)

    M = build_arch_materials()
    templates = load_shared_prop_collections()

    # -----------------------------------------------------------------------
    # 1) Deep Foundation Plinth & Crisp Sidewalk Concrete Skirt
    # -----------------------------------------------------------------------
    SP.add_rounded_box("Hero_Foundation", (0.0, 0.18, -0.58), (8.72, 7.88, 1.32), M["plinth"], col, bevel=0.04, segs=3, parent=root)
    SP.add_rounded_box("Hero_SidewalkPlinth", (-0.04, 0.0, 0.045), (8.76, 8.04, 0.09), M["deck_cream"], col, bevel=0.022, segs=3, parent=root)

    # -----------------------------------------------------------------------
    # 2) 1F Solid L-Shaped Shop Mass (z in [0.08..2.94]):
    #    - Recessed SE vending alcove at x=3.80 (y in [-3.52..-2.58]) matching concept art!
    #    - Flush stair-backing East wall at x=4.26 (y in [-2.58..+3.90]) -> ZERO gap behind stairs!
    # -----------------------------------------------------------------------
    wall_1f_poly = [
        (-4.20, -3.52),
        ( 3.80, -3.52),
        ( 3.80, -2.58),
        ( 4.26, -2.58),
        ( 4.26,  3.90),
        (-4.20,  3.90),
    ]
    wall_1f = add_extruded_poly_wall("Hero_Wall_1F", wall_1f_poly, 0.08, 2.94, M["plaster"], col, bevel=0.042, segs=3, parent=root)
    # Matching L-shaped concrete baseboard water-table skirt around 1F perimeter
    skirt_1f_poly = [
        (-4.235, -3.555),
        ( 3.835, -3.555),
        ( 3.835, -2.615),
        ( 4.295, -2.615),
        ( 4.295,  3.935),
        (-4.235,  3.935),
    ]
    add_extruded_poly_wall("Hero_Skirt_1F", skirt_1f_poly, 0.05, 0.27, M["plinth"], col, bevel=0.020, segs=2, parent=root)

    # Carve TRUE deeply recessed 1F Ramen Shop Entryway vestibule (bx in [-1.84..+0.28], 0.44m deep!)
    fy = -3.52
    dx_door = -0.78
    cut_wall_opening(wall_1f, (dx_door, fy + 0.18, 1.24), 2.12, 2.34, "-Y", depth=0.52, col=col)
    # Warm timber recessed entryway portal + interior warm glow box + twin wooden-and-glass sliding doors!
    SP.add_rounded_box("Shop_PortalTop", (dx_door, fy - 0.03, 2.38), (2.28, 0.34, 0.12), M["cedar_dark"], col, bevel=0.018, parent=root)
    SP.add_rounded_box("Shop_PortalL", (dx_door - 1.10, fy - 0.02, 1.22), (0.12, 0.32, 2.34), M["cedar_dark"], col, bevel=0.016, parent=root)
    SP.add_rounded_box("Shop_PortalR", (dx_door + 1.10, fy - 0.02, 1.22), (0.12, 0.32, 2.34), M["cedar_dark"], col, bevel=0.016, parent=root)
    # Chunky wooden lintel header beam spanning shopfront (clean breathing gap below 3D signboard!)
    SP.add_rounded_box("Shop_FasciaBeam", (-1.32, fy - 0.10, 2.44), (4.86, 0.22, 0.115), M["cedar"], col, bevel=0.022, segs=3, parent=root)
    # Concrete entry threshold step
    SP.add_rounded_box("Shop_Step", (dx_door, fy - 0.14, 0.095), (2.36, 0.42, 0.13), M["deck_cream"], col, bevel=0.020, parent=root)

    # Cozy warm interior ramen shop backing visible through the sliding door glass panes!
    SP.add_rounded_box("Shop_DoorBack", (dx_door, fy + 0.62, 1.32), (2.20, 0.06, 2.26), M["shop_interior"], col, bevel=0.005, parent=root)
    # Warm hanging interior shop lanterns visible through upper door glass
    for ilx in (dx_door - 0.45, dx_door + 0.45):
        SP.add_cyl(f"Shop_InLamp_{ilx}", (ilx, fy + 0.42, 1.88), 0.12, 0.16, M["porch_bulb"], col, segs=16, bevel=0.03, parent=root)

    # Twin deeply-recessed timber & glass Japanese sliding ramen doors (offset tracks + brass pull handles!)
    for idx, (sx, sy_tr) in enumerate([(-0.48, fy + 0.06), (0.48, fy + 0.11)]):
        dpiv = SP.make_root(f"Shop_DoorLeaf_{idx}", col)
        dpiv.location = Vector((dx_door + sx, sy_tr, 0.14))
        dpiv.parent = root
        # Lower solid vertical-plank warm cedar panel (individually beveled planks!)
        SP.add_rounded_box(f"DoorBotFrm_{idx}", (0, 0, 0.48), (0.98, 0.055, 0.96), M["cedar_dark"], col, bevel=0.010, parent=dpiv)
        for pk in range(5):
            px_p = -0.36 + pk * 0.18
            SP.add_rounded_box(f"DoorPlank_{idx}_{pk}", (px_p, -0.010, 0.48), (0.165, 0.048, 0.86), M["cedar"], col, bevel=0.009, parent=dpiv)
        # Upper glazed timber lattice frame + reflective clear glass!
        SP.add_rounded_box(f"DoorTopL_{idx}", (-0.45, 0, 1.54), (0.08, 0.055, 1.20), M["cedar_dark"], col, bevel=0.009, parent=dpiv)
        SP.add_rounded_box(f"DoorTopR_{idx}", ( 0.45, 0, 1.54), (0.08, 0.055, 1.20), M["cedar_dark"], col, bevel=0.009, parent=dpiv)
        SP.add_rounded_box(f"DoorTopH_{idx}", (0, 0, 2.10), (0.98, 0.055, 0.08), M["cedar_dark"], col, bevel=0.009, parent=dpiv)
        # Classic Japanese kumiko wooden cross mullions
        SP.add_rounded_box(f"DoorMunV_{idx}", (0, 0, 1.54), (0.036, 0.042, 1.12), M["cedar"], col, bevel=0.006, parent=dpiv)
        SP.add_rounded_box(f"DoorMunH1_{idx}", (0, 0, 1.32), (0.86, 0.042, 0.036), M["cedar"], col, bevel=0.006, parent=dpiv)
        SP.add_rounded_box(f"DoorMunH2_{idx}", (0, 0, 1.72), (0.86, 0.042, 0.036), M["cedar"], col, bevel=0.006, parent=dpiv)
        SP.add_rounded_box(f"DoorGlass_{idx}", (0, 0, 1.54), (0.84, 0.012, 1.10), M["win_glass"], col, bevel=0.001, parent=dpiv)
        # Recessed brushed-brass pull bar
        SP.add_rounded_box(f"DoorPull_{idx}", (-0.36 if idx == 1 else 0.36, -0.042, 0.96), (0.036, 0.038, 0.22), M["brass"], col, bevel=0.010, parent=dpiv)

    # Sculpted 3D gently billowing 4-panel crimson noren (`潮 風 拉 麺`) on bamboo rod!
    build_billowing_noren("Shop_Noren", dx_door, fy - 0.22, 2.34, M, col, root)

    # 1F Left Ramen Shop Window (TRUE Boolean cutout + wooden interior counter, ceramic bowls & lucky cat!)
    wx_shop = -2.72
    build_recessed_window("Win_1F_Shop", wall_1f, (wx_shop, fy, 1.66), 1.24, 0.90, "-Y", M, col, root, wood_frame=True, is_shop=True)

    # Crisp Japanese Striped Canvas Window Awning ('ひさし') sloping cleanly OUTWARD & DOWNWARD (NO scallops!)
    awn_piv = SP.make_root("Shop_WindowAwning", col)
    awn_piv.location = Vector((wx_shop, fy - 0.02, 2.35))
    awn_piv.parent = root
    n_stripes = 7
    awn_w = 1.44
    sw = awn_w / n_stripes
    awn_len = 0.54
    pitch = 0.46  # +0.46 rad around X tilts -Y front edge cleanly DOWNWARD (-Z)!
    cos_p, sin_p = math.cos(pitch), math.sin(pitch)
    # Slim wall mounting ledger rail & front tension bar
    SP.add_rounded_box("Awn_WallRail", (0.0, -0.018, 0.010), (awn_w + 0.04, 0.040, 0.042), M["dark_iron"], col, bevel=0.008, parent=awn_piv)
    SP.add_cyl("Awn_FrontBar", (0.0, -awn_len * cos_p + 0.012, -awn_len * sin_p - 0.014), 0.012, awn_w + 0.02,
               M["dark_iron"], col, segs=12, rot=(0, math.pi * 0.5, 0), parent=awn_piv)
    for si in range(n_stripes):
        sx_a = -awn_w * 0.5 + (si + 0.5) * sw
        amat = M["awning_coral"] if si % 2 == 0 else M["awning_cream"]
        # Downward-sloped striped canvas roof panel
        SP.add_rounded_box(
            f"Awn_Slope_{si}",
            (sx_a, -awn_len * 0.5 * cos_p, -awn_len * 0.5 * sin_p),
            (sw - 0.002, awn_len, 0.036),
            amat, col, bevel=0.010, rot=(pitch, 0, 0), parent=awn_piv
        )
        # Clean straight Japanese canvas vertical valance lip (no decorative scallops!)
        SP.add_rounded_box(
            f"Awn_Drop_{si}",
            (sx_a, -awn_len * cos_p + 0.010, -awn_len * sin_p - 0.042),
            (sw - 0.002, 0.024, 0.088),
            amat, col, bevel=0.006, parent=awn_piv
        )
    # Clean diagonal iron side support arms anchoring front awning corners back to wall
    for bx_s in (-awn_w * 0.47, awn_w * 0.47):
        SP.add_curve_tube(f"Awn_Brk_{bx_s}", [(bx_s, 0.0, -0.34), (bx_s, -awn_len * cos_p + 0.03, -awn_len * sin_p - 0.01)],
                          0.012, M["dark_iron"], col, parent=awn_piv, spline_type="POLY")

    # Glossy Pillowed Pastel Glazed Ceramic Mosaic Tile Wainscot below shop window!
    SP.add_rounded_box("Shop_MosaicBack", (wx_shop, fy - 0.025, 0.62), (1.36, 0.055, 0.88), M["deck_cream"], col, bevel=0.012, parent=root)
    SP.add_uv_quad("Shop_MosaicFace", (wx_shop, fy - 0.056, 0.62), 1.30, 0.82, M["mosaic"], col, facing="-Y", parent=root)

    # Sculpted 3D Carved Signboard ('海风拉面' 3D extruded characters + 3D bowl emblem!) + Twin Gooseneck Sign Lamps!
    build_3d_ramen_signboard("Shop_Sign3D", (dx_door, fy - 0.065, 2.71), M, col, root)
    for glx in (dx_door - 0.78, dx_door + 0.78):
        SP.add_curve_tube(f"SignLampArm_{glx}", [(glx, fy - 0.02, 2.89), (glx, fy - 0.28, 2.94), (glx, fy - 0.34, 2.86)],
                          0.011, M["dark_iron"], col, resolution=8, bevel_res=4, parent=root)
        SP.add_cyl(f"SignLampShade_{glx}", (glx, fy - 0.34, 2.835), 0.062, 0.046, M["teal_steel"], col, segs=16, r_top=0.022, parent=root)
        SP.add_cyl(f"SignLampBulb_{glx}", (glx, fy - 0.34, 2.812), 0.026, 0.024, M["porch_bulb"], col, segs=12, parent=root)

    # Vertical cedar '潮風麺処' hanging plaque + glossy forest-green '海风庄' enamel address plaque + retro summer poster!
    SP.add_rounded_box("Shop_VertBoard", (0.56, fy - 0.035, 1.44), (0.30, 0.055, 0.84), M["cedar_dark"], col, bevel=0.012, parent=root)
    SP.add_uv_quad("Shop_VertArt", (0.56, fy - 0.066, 1.44), 0.26, 0.78, M["plaque_vert"], col, facing="-Y", parent=root)

    SP.add_rounded_box("Hero_PlaqueFrame", (2.86, fy - 0.028, 2.10), (0.76, 0.045, 0.38), M["teal_steel"], col, bevel=0.010, parent=root)
    SP.add_uv_quad("Hero_PlaqueArt", (2.86, fy - 0.054, 2.10), 0.72, 0.35, M["plaque_haikaze"], col, facing="-Y", parent=root)

    SP.add_rounded_box("Shop_PosterFrame", (2.86, fy - 0.024, 1.40), (0.94, 0.038, 0.64), M["cedar"], col, bevel=0.010, parent=root)
    SP.add_uv_quad("Shop_PosterArt", (2.86, fy - 0.046, 1.40), 0.88, 0.58, M["poster_summer"], col, facing="-Y", parent=root)

    # 1F Alley (-X) & Rear (+Y) recessed windows
    build_recessed_window("Win_1F_Alley", wall_1f, (-4.20, 1.35, 1.75), 1.42, 1.06, "-X", M, col, root, wood_frame=True, is_shop=True)
    build_recessed_window("Win_1F_Rear",  wall_1f, (-1.20, 3.90, 1.72), 1.50, 1.08, "+Y", M, col, root, curtain_mat=M["curtain_cream"])

    # -----------------------------------------------------------------------
    # 3) Iconic Chunky Sage-Green 2F Concrete Balcony Slab (exact walkable top bz = 3.25m!)
    # -----------------------------------------------------------------------
    SP.add_rounded_box("Hero_Slab_2F", (0.0, 0.0, 3.085), (8.66, 7.94, 0.33), M["sage_slab"], col, bevel=0.044, segs=3, parent=root)
    SP.add_rounded_box("Hero_Deck_2F", (0.0, 0.0, 3.245), (8.40, 7.68, 0.024), M["deck_cream"], col, bevel=0.008, parent=root)
    SP.add_rounded_box("Hero_SoffitDrip_2F", (0.0, 0.0, 2.905), (8.46, 7.74, 0.045), M["sage_dark"], col, bevel=0.012, parent=root)

    # -----------------------------------------------------------------------
    # 4) 2F Recessed Apartment Core (bx in [-4.20..+2.55], by in [-2.20..+3.90], bz in [3.25..6.42])
    #    TRUE Boolean window & door recesses + 201/202 doorways with Circular Delivery Hooks!
    # -----------------------------------------------------------------------
    wall_2f = SP.add_rounded_box("Hero_Wall_2F", (-0.825, 0.85, 4.835), (6.75, 6.10, 3.17), M["plaster"], col, bevel=0.044, segs=3, parent=root)
    SP.add_rounded_box("Hero_BaseTrim_2F", (-0.825, 0.85, 3.31), (6.82, 6.17, 0.13), M["deck_cream"], col, bevel=0.016, parent=root)

    # Doors 201 & 202 (with real recesses, brass levers, glowing porch lamps, Circular Delivery Hooks, slippers & hanging ramen bag!)
    build_apartment_doorway("Door_201", wall_2f, 2.55, -0.80, 3.25, M["plaque_201"], M, templates, col, root, meter_side=1.0, add_slippers=True, hang_bag=False)
    build_apartment_doorway("Door_202", wall_2f, 2.55,  1.35, 3.25, M["plaque_202"], M, templates, col, root, meter_side=-1.0, add_slippers=False, hang_bag=True)

    # 2F True Recessed Windows (each with 3D pleated curtains & warm miniature room interior!)
    build_recessed_window("Win_2F_Front",  wall_2f, (-1.55, -2.20, 4.95), 1.76, 1.24, "-Y", M, col, root, curtain_mat=M["curtain_cream"])
    build_recessed_window("Win_2F_East1",  wall_2f, ( 2.55, -1.82, 4.86), 0.50, 1.06, "+X", M, col, root, curtain_mat=M["curtain_blue"])
    build_recessed_window("Win_2F_East2",  wall_2f, ( 2.55,  2.75, 4.86), 0.86, 1.06, "+X", M, col, root, curtain_mat=M["curtain_cream"])
    build_recessed_window("Win_2F_Alley1", wall_2f, (-4.20, -0.35, 4.95), 1.32, 1.16, "-X", M, col, root, curtain_mat=M["curtain_blue"])
    build_recessed_window("Win_2F_Alley2", wall_2f, (-4.20,  2.15, 4.95), 1.32, 1.16, "-X", M, col, root, curtain_mat=M["curtain_cream"])
    build_recessed_window("Win_2F_Rear1",  wall_2f, (-1.60,  3.90, 4.95), 1.48, 1.20, "+Y", M, col, root, curtain_mat=M["curtain_cream"])
    build_recessed_window("Win_2F_Rear2",  wall_2f, ( 0.85,  3.90, 4.95), 1.48, 1.20, "+Y", M, col, root, curtain_mat=M["curtain_blue"])

    # Hooded stainless kitchen exhaust vent on 2F front-left wall
    SP.add_rounded_box("Vent_2F_Hood", (-3.50, -2.32, 5.65), (0.36, 0.24, 0.32), M["alum"], col, bevel=0.055, segs=3, parent=root)
    SP.add_rounded_box("Vent_2F_Mouth", (-3.50, -2.37, 5.53), (0.28, 0.14, 0.10), M["dark_iron"], col, bevel=0.012, parent=root)

    # -----------------------------------------------------------------------
    # 5) Bold Flat Rooftop Sage-Green Parapet Tub (Real Recessed Roof Deck!) + Guardrail + Features
    # -----------------------------------------------------------------------
    roof_mass = SP.add_rounded_box("Hero_RoofParapet", (0.0, 0.0, 6.76), (8.82, 8.12, 0.76), M["sage_slab"], col, bevel=0.050, segs=3, parent=root)
    # Carve true recessed rooftop floor basin inside the parapet rim!
    c_roof = SP.add_rounded_box("tmp_roof_tub", (0.0, 0.0, 7.12), (8.22, 7.52, 0.38), None, col, bevel=0.025, segs=2)
    SP.boolean_cut(roof_mass, c_roof)
    SP.add_rounded_box("Hero_RoofDeck", (0.0, 0.0, 6.945), (8.20, 7.50, 0.03), M["deck_cream"], col, bevel=0.008, parent=root)
    SP.add_rounded_box("Hero_RoofSoffitDrip", (0.0, 0.0, 6.375), (8.60, 7.90, 0.045), M["sage_dark"], col, bevel=0.012, parent=root)

    # Rounded satin-teal rooftop guardrails
    build_tubular_railing("Rail_Roof_F", (-4.18, -3.84), ( 4.18, -3.84), 7.12, 0.86, M, col, root, spacing=0.34)
    build_tubular_railing("Rail_Roof_R", ( 4.18, -3.84), ( 4.18,  3.84), 7.12, 0.86, M, col, root, spacing=0.34)
    build_tubular_railing("Rail_Roof_B", ( 4.18,  3.84), (-4.18,  3.84), 7.12, 0.86, M, col, root, spacing=0.34)
    build_tubular_railing("Rail_Roof_L", (-4.18,  3.84), (-4.18, -3.84), 7.12, 0.86, M, col, root, spacing=0.34)

    # Lived-in rooftop water tank, penthouse, laundry clothesline & vents!
    build_rooftop_features(M, col, root)

    # -----------------------------------------------------------------------
    # 6) 2F Open-Air L-Shaped Corridor Balustrade (Exact Opening at Top Stair Landing!)
    # -----------------------------------------------------------------------
    build_tubular_railing("Rail_2F_L",    (-4.18, -2.20), (-4.18, -3.84), 3.25, 1.00, M, col, root, spacing=0.28)
    build_tubular_railing("Rail_2F_F",    (-4.18, -3.84), ( 4.18, -3.84), 3.25, 1.00, M, col, root, spacing=0.28)
    build_tubular_railing("Rail_2F_East", ( 4.18, -3.84), ( 4.18,  2.35), 3.25, 1.00, M, col, root, spacing=0.28)
    build_tubular_railing("Rail_2F_Back", ( 2.55,  3.84), ( 4.22,  3.84), 3.25, 1.00, M, col, root, spacing=0.28)

    # -----------------------------------------------------------------------
    # 7) HERO WALKABLE EXTERIOR SATIN-TEAL STEEL STAIRCASE (Exact Collision Contract!)
    #    bx in [4.25..5.60], 14 steps y in [-1.95..2.35], z in [0.12..3.25]
    # -----------------------------------------------------------------------
    SP.add_rounded_box("Stair_PadBot", (4.94, -2.34, 0.06), (1.48, 0.82, 0.12), M["deck_cream"], col, bevel=0.024, segs=3, parent=root)
    n_steps = 14
    y_s0, y_s1 = -1.95, 2.35
    z_s0, z_s1 = 0.12, 3.25
    dy_s = (y_s1 - y_s0) / n_steps
    dz_s = (z_s1 - z_s0) / n_steps
    for i in range(n_steps):
        sy = y_s0 + (i + 0.5) * dy_s
        sz_top = z_s0 + (i + 1) * dz_s
        SP.add_rounded_box(f"Stair_Tread_{i}", (4.925, sy, sz_top - 0.030), (1.24, dy_s + 0.035, 0.060), M["teal_tread"], col, bevel=0.014, parent=root)
        SP.add_rounded_box(f"Stair_Nose_{i}",  (4.925, y_s0 + i * dy_s + 0.022, sz_top - 0.004), (1.18, 0.034, 0.018), M["tread_nose"], col, bevel=0.006, parent=root)
        SP.add_rounded_box(f"Stair_Riser_{i}", (4.925, y_s0 + i * dy_s + 0.025, sz_top - dz_s * 0.5 - 0.015), (1.18, 0.048, dz_s + 0.03), M["teal_steel"], col, bevel=0.008, parent=root)

    # Chunky beveled dual C-channel stringers + continuous smooth tubular handrail!
    flight_len = math.hypot(y_s1 - y_s0, z_s1 - z_s0)
    flight_ang = math.atan2(z_s1 - z_s0, y_s1 - y_s0)
    mid_y, mid_z = (y_s0 + y_s1) * 0.5, (z_s0 + z_s1) * 0.5 - 0.06
    for sx in (4.30, 5.55):
        SP.add_rounded_box(f"Stair_Stringer_{sx}", (sx, mid_y, mid_z), (0.095, flight_len + 0.28, 0.34),
                           M["teal_steel"], col, bevel=0.020, rot=(flight_ang, 0, 0), parent=root)
    # Continuous curved steel outer handrail sweeping smoothly into top landing rail!
    hr_pts = [
        (5.55, y_s0 - 0.14, z_s0 + 0.94),
        (5.55, y_s0,        z_s0 + 1.00),
        (5.55, y_s1,        z_s1 + 1.00),
        (5.55, 3.78,        z_s1 + 1.00),
        (4.22, 3.78,        z_s1 + 1.00),
    ]
    SP.add_curve_tube("Stair_HandrailTop", hr_pts, 0.034, M["teal_steel"], col, resolution=6, bevel_res=5, parent=root, spline_type="POLY")
    SP.add_curve_tube("Stair_HandrailMid", [(5.55, y_s0, z_s0 + 0.52), (5.55, y_s1, z_s1 + 0.52)],
                      0.020, M["teal_steel"], col, resolution=4, bevel_res=4, parent=root, spline_type="POLY")
    for k in range(11):
        t = k / 10.0
        py = y_s0 + (y_s1 - y_s0) * t
        pz = z_s0 + (z_s1 - z_s0) * t
        r_p = 0.028 if (k == 0 or k == 10) else 0.015
        SP.add_cyl(f"Stair_Bal_{k}", (5.55, py, pz + 0.50), r_p, 1.00, M["teal_steel"], col, segs=12, parent=root)

    # Top steel landing bridge + structural support columns + bolted steel footplates + knee braces!
    SP.add_rounded_box("Stair_Landing", (4.925, 3.075, 3.16), (1.40, 1.50, 0.18), M["teal_steel"], col, bevel=0.026, segs=3, parent=root)
    SP.add_rounded_box("Stair_LandDeck", (4.925, 3.075, 3.246), (1.28, 1.38, 0.024), M["deck_cream"], col, bevel=0.008, parent=root)
    build_tubular_railing("Rail_Land_R", (5.55, 2.35), (5.55, 3.78), 3.25, 1.00, M, col, root, spacing=0.28)
    build_tubular_railing("Rail_Land_B", (4.22, 3.78), (5.55, 3.78), 3.25, 1.00, M, col, root, spacing=0.28)
    for py_c in (2.42, 3.74):
        SP.add_rounded_box(f"Stair_Col_{py_c}", (5.52, py_c, 1.58), (0.12, 0.12, 3.16), M["teal_steel"], col, bevel=0.020, parent=root)
        SP.add_rounded_box(f"Stair_Plate_{py_c}", (5.52, py_c, 0.045), (0.28, 0.28, 0.07), M["dark_iron"], col, bevel=0.014, parent=root)
    SP.add_rounded_box("Stair_BeamB", (4.92, 3.74, 2.98), (1.30, 0.10, 0.15), M["teal_steel"], col, bevel=0.016, parent=root)
    SP.add_rounded_box("Stair_BeamS", (5.52, 3.08, 2.86), (0.10, 1.34, 0.13), M["teal_steel"], col, bevel=0.016, parent=root)
    SP.add_rounded_box("Stair_Brace", (5.20, 3.74, 2.74), (0.58, 0.075, 0.085), M["teal_steel"], col, bevel=0.012, rot=(0, 0.72, 0), parent=root)

    # -----------------------------------------------------------------------
    # 8) Smooth Bezier Curved White PVC Rain Drainpipe + Rooftop Rain Hopper + Clamps!
    # -----------------------------------------------------------------------
    SP.add_rounded_box("Drain_Hopper", (2.15, -2.30, 6.46), (0.26, 0.26, 0.26), M["pipe_white"], col, bevel=0.028, segs=3, parent=root)
    drain_pts = [
        (2.15, -2.30, 6.38),
        (2.15, -2.30, 6.18),
        (2.15, -2.42, 6.18),
        (2.15, -3.76, 6.18),
        (2.15, -3.90, 6.16),
        (2.15, -3.90, 5.95),
        (2.15, -3.90, 3.10),
        (2.15, -3.88, 2.94),
        (2.15, -3.60, 2.92),
        (2.15, -3.58, 2.74),
        (2.15, -3.58, 0.22),
        (2.15, -3.64, 0.14),
        (2.15, -3.76, 0.12),
    ]
    SP.add_curve_tube("Drain_MainPipe", drain_pts, 0.056, M["pipe_white"], col, resolution=10, bevel_res=6, parent=root)
    for pz, py_c in [(0.65, -3.58), (1.85, -3.58), (3.85, -3.90), (5.35, -3.90)]:
        SP.add_cyl(f"Drain_Clamp_{pz}", (2.15, py_c, pz), 0.074, 0.054, M["dark_iron"], col, segs=14, bevel=0.008, parent=root)
    # Secondary inner-corner 2F drainpipe
    SP.add_rounded_box("Drain_Hopper2", (2.64, -2.14, 6.46), (0.20, 0.20, 0.22), M["pipe_white"], col, bevel=0.022, parent=root)
    SP.add_curve_tube("Drain_Pipe2", [(2.64, -2.14, 6.38), (2.64, -2.14, 3.25)], 0.044, M["pipe_white"], col, parent=root, spline_type="POLY")

    # Compact red Japanese fire-extinguisher cabinet + cute retro twin apartment mailbox ('POST 201·202')!
    # Mounted cleanly on the flush East stair-backing wall (x = 4.26)!
    SP.add_rounded_box("Hero_FireBox", (4.37, 0.35, 0.56), (0.22, 0.30, 0.64), M["fire_red"], col, bevel=0.024, segs=3, parent=root)
    SP.add_rounded_box("Hero_FireWin", (4.485, 0.35, 0.64), (0.015, 0.16, 0.22), M["win_glass"], col, bevel=0.005, parent=root)

    # Adorable miniature cream-and-coral twin apartment mailbox mounted right beside stair entry (y = -2.36 / -2.10)!
    for mi, my_m in enumerate([-2.38, -2.12]):
        SP.add_rounded_box(f"Hero_Mailbox_{mi}", (4.35, my_m, 1.38), (0.18, 0.23, 0.32), M["awning_cream"], col, bevel=0.022, segs=3, parent=root)
        SP.add_rounded_box(f"Hero_MailFlap_{mi}", (4.445, my_m, 1.47), (0.024, 0.18, 0.055), M["fire_red"] if mi == 0 else M["teal_steel"], col, bevel=0.008, parent=root)
        SP.add_rounded_box(f"Hero_MailSlot_{mi}", (4.445, my_m, 1.32), (0.016, 0.11, 0.045), M["alum"], col, bevel=0.004, parent=root)

    # 3 heavy bolted steel wall-anchor brackets securing inner stair stringer flush to the 1F plaster wall!
    for t_anc in (0.18, 0.52, 0.84):
        ay = y_s0 + (y_s1 - y_s0) * t_anc
        az = z_s0 + (z_s1 - z_s0) * t_anc - 0.18
        SP.add_rounded_box(f"Stair_WallBolt_{t_anc:.2f}", (4.28, ay, az), (0.10, 0.14, 0.16), M["dark_iron"], col, bevel=0.010, parent=root)

    # -----------------------------------------------------------------------
    # 9) PLACE ALL SHARED REUSABLE PROPS (Linked from art/shared/props/Shared-Props.blend!)
    # -----------------------------------------------------------------------
    # 1F Shopfront props
    place_prop(templates, "Prop_Chochin_Lantern", (0.56, fy, 2.20), rot_z=0.0, scale=1.02, col=col, parent=root, tag="shop")
    place_prop(templates, "Prop_Vintage_Bicycle", (-3.32, fy - 0.34, 0.085), rot_z=0.07, scale=1.0, col=col, parent=root, tag="shop")
    place_prop(templates, "Prop_AFrame_Menu",     (2.86, fy - 0.32, 0.085), rot_z=-0.09, scale=1.02, col=col, parent=root, tag="shop")

    # Stacked hollow bottle crates beside ramen door (with real lathe-spun bottles on top!)
    place_prop(templates, "Prop_Bottle_Crate_Red",    (1.12, fy - 0.24, 0.085), rot_z=0.03, scale=1.0, col=col, parent=root, tag="s1")
    place_prop(templates, "Prop_Bottle_Crate_Blue",   (1.12, fy - 0.24, 0.355), rot_z=-0.02, scale=1.0, col=col, parent=root, tag="s2")
    place_prop(templates, "Prop_Bottle_Crate_Yellow", (1.12, fy - 0.24, 0.625), rot_z=0.04, scale=1.0, col=col, parent=root, tag="s3")
    place_prop(templates, "Prop_Bottle_Crate_Green",  (1.58, fy - 0.24, 0.085), rot_z=-0.03, scale=1.0, col=col, parent=root, tag="s4")
    place_prop(templates, "Prop_Bottle_Crate_Blue",   (1.58, fy - 0.24, 0.355), rot_z=0.02, scale=1.0, col=col, parent=root, tag="s5")
    place_prop(templates, "Prop_Bottle_Crate_Yellow", (1.58, fy - 0.24, 0.625), rot_z=-0.02, scale=1.0, col=col, parent=root, tag="s6")

    # Iconic 3D-drinks Japanese vending machines (White tucked in recessed SE alcove + Pink under stair landing!)
    place_prop(templates, "Prop_Vending_White", (4.06, -3.14, 0.085), rot_z=math.pi * 0.5, scale=1.0, col=col, parent=root, tag="corner")
    place_prop(templates, "Prop_Vending_Pink",  (4.52,  2.95, 0.085), rot_z=math.pi * 0.5, scale=0.96, col=col, parent=root, tag="stairs")

    # Under-stair lived-in bottle crates (tucked cleanly against flush East wall at x = 4.26!)
    place_prop(templates, "Prop_Bottle_Crate_Blue",   (4.62, 1.05, 0.085), rot_z=0.03, scale=0.98, col=col, parent=root, tag="u1")
    place_prop(templates, "Prop_Bottle_Crate_Red",    (4.62, 1.05, 0.350), rot_z=-0.03, scale=0.98, col=col, parent=root, tag="u2")
    place_prop(templates, "Prop_Bottle_Crate_Yellow", (4.62, 1.05, 0.615), rot_z=0.04, scale=0.98, col=col, parent=root, tag="u3")
    place_prop(templates, "Prop_Bottle_Crate_Green",  (4.62, 1.52, 0.085), rot_z=-0.02, scale=0.98, col=col, parent=root, tag="u4")
    place_prop(templates, "Prop_Bottle_Crate_Yellow", (4.62, 1.52, 0.350), rot_z=0.02, scale=0.98, col=col, parent=root, tag="u5")

    # 3 Reusable Outdoor AC Units (with 3D fan blades, curved grilles & refrigerant pipes!)
    place_prop(templates, "Prop_AC_Unit", (3.80, -3.14, 2.06), rot_z=math.pi * 0.5, scale=1.0, col=col, parent=root, tag="ac1f")
    place_prop(templates, "Prop_AC_Unit", (0.28, -2.20, 5.20), rot_z=0.0, scale=1.0, col=col, parent=root, tag="ac2f_f")
    place_prop(templates, "Prop_AC_Unit", (2.55,  2.85, 5.74), rot_z=math.pi * 0.5, scale=1.0, col=col, parent=root, tag="ac2f_e")

    # Streamlined 2F Terracotta Potted Plants (just 2 clean accents -> uncluttered corridor & breathing room!)
    place_prop(templates, "Prop_Potted_Plant_Tall", (-3.68, -3.40, 3.255), rot_z=0.25, scale=1.02, col=col, parent=root, tag="p1")
    place_prop(templates, "Prop_Potted_Plant_Bush", ( 2.84,  0.28, 3.255), rot_z=1.80, scale=0.86, col=col, parent=root, tag="p2")

    # Apply architectural modifiers cleanly & fix planar Boolean-wall shading (ZERO diagonal streaks!)
    boolean_walls = {"Hero_Wall_1F", "Hero_Wall_2F", "Hero_RoofParapet", "Roof_Penthouse"}
    for o in list(col.objects):
        if o.type == "MESH" and not o.name.startswith("Prop_"):
            SP.apply_all_modifiers(o)
            if o.name in boolean_walls:
                # Keep planar Boolean wall faces razor-flat while keeping bevel corners silky smooth!
                bm = bmesh.new()
                bm.from_mesh(o.data)
                bm.faces.ensure_lookup_table()
                bm.edges.ensure_lookup_table()
                for f in bm.faces:
                    f.smooth = (f.calc_area() < 0.35)
                bm.to_mesh(o.data)
                bm.free()
                o.data.update()
            elif "Text3D" in o.name:
                # Keep 3D extruded signboard letter faces crisp & flat, while smoothing side bevels!
                bm = bmesh.new()
                bm.from_mesh(o.data)
                for f in bm.faces:
                    f.smooth = (abs(f.normal.z) < 0.85)
                bm.to_mesh(o.data)
                bm.free()
                o.data.update()
            else:
                SP.set_smooth(o, weighted=False)

    # Remove hidden template collections so the saved .blend stays spotless
    for cname, (tcol, _) in templates.items():
        if tcol.name in bpy.data.collections:
            bpy.data.collections.remove(tcol)

    return col, root, M


# ---------------------------------------------------------------------------
# Export Clean Game-Ready GLB + Save Editable Haikaze-Hero.blend
# ---------------------------------------------------------------------------
def export_hero_assets(col):
    # Count total triangles for performance budget transparency!
    tri_count = 0
    for o in col.objects:
        if o.type == "MESH":
            me = o.data
            me.calc_loop_triangles()
            tri_count += len(me.loop_triangles)
    print(f"  [stats] Haikaze-Hero total triangles: {tri_count:,} across {len(col.objects)} objects")

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_DIR / "Haikaze-Hero.blend"))
    print(f"  [saved] {OUT_DIR / 'Haikaze-Hero.blend'}")

    bpy.ops.object.select_all(action="DESELECT")
    for o in col.objects:
        o.select_set(True)
    glb_path = OUT_DIR / "haikaze-hero.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    print(f"  [exported] {glb_path} ({glb_path.stat().st_size / 1024:.1f} KB)")
    bpy.ops.object.select_all(action="DESELECT")


# ---------------------------------------------------------------------------
# Studio Diorama Cycles Metal GPU Beauty Renders (Daylight + Night!)
# ---------------------------------------------------------------------------
def build_diorama_stage(M):
    """Charming collector's miniature-diorama coastal street corner base with AI stone paving & Japanese manhole!"""
    stage = SP.ensure_collection("_DioramaStage")
    m_sw = SP.make_ai_surface_mat("_Stg_Sidewalk", "tex_deck_tiles.png", "tex_deck_tiles_normal.png", tex_scale=0.52, roughness=0.78, coat=0.06, normal_strength=0.18, ao_tint=0.15, sat_mult=1.10, val_mult=0.88)
    m_curb = SP.make_diorama_mat("_Stg_Curb", 0xD2CBB9, roughness=0.82, bump_scale=28.0, bump_strength=0.06, ao_tint=0.18)
    m_asph = SP.make_diorama_mat("_Stg_Asphalt", 0x4E5760, roughness=0.86, bump_scale=45.0, bump_strength=0.08, ao_tint=0.15)
    m_stripe = SP.make_diorama_mat("_Stg_Stripe", 0xF5F1E6, roughness=0.72, bump_strength=0.02, ao_tint=0.08)
    m_base = SP.make_ai_surface_mat("_Stg_BaseWood", "tex_wood_cedar.png", "tex_wood_cedar_normal.png", tex_scale=0.35, roughness=0.45, coat=0.28, normal_strength=0.12, ao_tint=0.16, sat_mult=1.18, val_mult=0.62)
    m_iron = M.get("cast_iron") or SP.make_diorama_mat("_Stg_CastIron", 0x3D454A, roughness=0.52, metallic=0.72, bump_scale=70.0, bump_strength=0.08)

    # Rounded collector's oak-trimmed diorama plinth + paved coastal sidewalk + asphalt corner!
    SP.add_rounded_box("_Stg_Asphalt", (0.6, -0.4, -0.26), (17.5, 16.0, 0.44), m_asph, stage, bevel=0.22, segs=3)
    SP.add_rounded_box("_Stg_WoodTrim", (0.6, -0.4, -0.58), (18.0, 16.5, 0.28), m_base, stage, bevel=0.12, segs=3)
    SP.add_rounded_box("_Stg_Sidewalk", (0.55, 0.10, -0.02), (11.8, 10.6, 0.16), m_sw, stage, bevel=0.08, segs=3)
    SP.add_rounded_box("_Stg_CurbFront", (0.55, -5.22, -0.02), (11.8, 0.18, 0.17), m_curb, stage, bevel=0.04, segs=2)
    SP.add_rounded_box("_Stg_CurbRight", (6.46, 0.10, -0.02), (0.18, 10.6, 0.17), m_curb, stage, bevel=0.04, segs=2)

    # Sculpted round Japanese patterned cast-iron manhole cover ('マンホール') embedded cleanly in street corner!
    mx, my = 5.45, -6.55
    SP.add_cyl("_Stg_ManholeRim", (mx, my, -0.036), 0.44, 0.024, m_iron, stage, segs=28, bevel=0.006)
    SP.add_cyl("_Stg_ManholeRing1", (mx, my, -0.026), 0.34, 0.012, m_iron, stage, segs=24, bevel=0.004)
    SP.add_cyl("_Stg_ManholeRing2", (mx, my, -0.024), 0.18, 0.014, m_iron, stage, segs=20, bevel=0.004)
    # Crisp curb storm drain grate beside the front curb
    gx_d, gy_d = 2.35, -5.58
    SP.add_rounded_box("_Stg_GrateRim", (gx_d, gy_d, -0.036), (0.76, 0.34, 0.020), m_iron, stage, bevel=0.005)
    for gi in range(6):
        SP.add_rounded_box(f"_Stg_GrateBar_{gi}", (gx_d - 0.28 + gi * 0.112, gy_d, -0.026), (0.04, 0.28, 0.012), m_iron, stage, bevel=0.003)

    # Crisp white crosswalk stripes on corner road for scale & Japanese street charm
    for i in range(4):
        SP.add_rounded_box(f"_Stg_Cross_{i}", (7.65, -4.2 + i * 1.15, -0.036), (1.85, 0.56, 0.015), m_stripe, stage, bevel=0.006)
    # Soft drooping power wires extending off rooftop porcelain insulator mast
    for iy, sag in [(-2.75, 0.55), (-2.35, 0.68)]:
        SP.add_curve_tube(f"_Stg_Wire_{iy}", [(3.95, iy, 8.68), (6.4, iy - 0.6, 8.68 - sag), (9.2, iy - 1.2, 8.85)],
                          0.018, M["dark_iron"], stage, resolution=12, bevel_res=3)

    # Soft glossy coastal sea plane far behind + puffy Ghibli/Animal Crossing clouds for vibrant summer sky!
    m_sea = SP.make_diorama_mat("_Stg_Sea", 0x45B2E6, roughness=0.14, coat=0.75, bump_scale=2.5, bump_strength=0.05, ao_tint=0.0)
    SP.add_rounded_box("_Stg_BackdropFloor", (0.0, 12.0, -0.82), (110.0, 110.0, 0.10), m_sea, stage, bevel=0.01)

    m_cloud = SP.make_diorama_mat("_Stg_Cloud", 0xFFFDF8, roughness=0.92, subsurface=0.35, bump_strength=0.0, ao_tint=0.06,
                                  emissive_hex=0xFFFBF2, emissive_strength=0.38)
    clouds = [
        ((-12.5, 16.5, 12.2), [(0, 0, 0, 2.2), (-2.0, 0.2, -0.3, 1.6), (2.1, -0.1, -0.4, 1.7), (0.8, 0.2, 0.9, 1.5)]),
        ((  6.5, 18.5, 13.6), [(0, 0, 0, 2.0), (-1.9, 0.0, -0.3, 1.5), (1.8, 0.1, -0.2, 1.4)]),
        ((-20.0, 10.0, 10.5), [(0, 0, 0, 1.8), (1.7, 0.1, -0.2, 1.3), (-1.6, 0.0, -0.3, 1.4)]),
    ]
    for ci, (c_orig, puffs) in enumerate(clouds):
        for pi, (ox, oy, oz, rad) in enumerate(puffs):
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=rad)
            cm = bpy.data.meshes.new(f"_Stg_Cloud_{ci}_{pi}")
            bm.to_mesh(cm)
            bm.free()
            co = bpy.data.objects.new(f"_Stg_Cloud_{ci}_{pi}", cm)
            co.location = Vector(c_orig) + Vector((ox, oy, oz))
            co.scale = Vector((1.25, 0.85, 0.78))
            co.data.materials.append(m_cloud)
            SP.link_obj(co, stage)
            SP.set_smooth(co, weighted=False)

    for o in list(stage.objects):
        if o.type == "MESH":
            SP.apply_all_modifiers(o)
            SP.set_smooth(o, weighted=False)
    return stage


def setup_world_lighting(stage, mode="day"):
    """Vibrant Animal Crossing / Ghibli summer sky (day) or cozy warm twilight (night)."""
    world = bpy.data.worlds.new(f"World_{mode}")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Clean sky gradient (vibrant summer coastal azure overhead -> bright creamy aqua horizon!)
    tex_c = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tex_c.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])

    if mode == "day":
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = SP.hex_rgba(0xA4E0FC)
        e_mid = ramp.color_ramp.elements.new(0.25)
        e_mid.color = SP.hex_rgba(0x4AB8F5)
        ramp.color_ramp.elements[-1].position = 0.65
        ramp.color_ramp.elements[-1].color = SP.hex_rgba(0x1678E2)
        bg.inputs["Strength"].default_value = 1.05
    else:
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = SP.hex_rgba(0x2B4468)
        e_mid = ramp.color_ramp.elements.new(0.32)
        e_mid.color = SP.hex_rgba(0x1B2D4E)
        ramp.color_ramp.elements[-1].position = 0.75
        ramp.color_ramp.elements[-1].color = SP.hex_rgba(0x0E1830)
        bg.inputs["Strength"].default_value = 0.45
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])

    # Clear old stage lights
    for o in list(stage.objects):
        if o.type == "LIGHT":
            bpy.data.objects.remove(o, do_unlink=True)

    if mode == "day":
        # Bright golden summer sun shining directly FROM front-right-above (+X, -Y, +Z) onto BOTH the
        # ramen shopfront (-Y) AND the exterior stairs / 201-202 corridor (+X) — matching concept art!
        sun_d = bpy.data.lights.new("SummerSun", type="SUN")
        sun_d.energy = 5.2
        sun_d.color = (1.0, 0.93, 0.76)
        sun_d.angle = math.radians(2.2)
        sun = bpy.data.objects.new("SummerSun", sun_d)
        sun.location = Vector((14.0, -16.0, 15.0))
        sun.rotation_euler = (Vector((0.0, 0.0, 2.5)) - sun.location).to_track_quat("-Z", "Y").to_euler()
        SP.link_obj(sun, stage)

        # Crisp warm rim/bounce fill from front-left so Ramen Shopfront & bicycle glow with cheerful life!
        fill_d = bpy.data.lights.new("SkyFill", type="AREA")
        fill_d.energy = 240.0
        fill_d.size = 12.0
        fill_d.color = (0.82, 0.92, 1.0)
        fill = bpy.data.objects.new("SkyFill", fill_d)
        fill.location = Vector((-10.5, -11.0, 7.5))
        fill.rotation_euler = (Vector((0, 0, 2.5)) - fill.location).to_track_quat("-Z", "Y").to_euler()
        SP.link_obj(fill, stage)
    else:
        # Cool indigo moonlight + warm practical pool lights at ramen shop, vending & 2F corridor!
        moon_d = bpy.data.lights.new("MoonLight", type="SUN")
        moon_d.energy = 0.72
        moon_d.color = (0.58, 0.74, 1.0)
        moon_d.angle = math.radians(4.0)
        moon = bpy.data.objects.new("MoonLight", moon_d)
        moon.location = Vector((12.0, -14.0, 15.0))
        moon.rotation_euler = (Vector((0.0, 0.0, 2.5)) - moon.location).to_track_quat("-Z", "Y").to_euler()
        SP.link_obj(moon, stage)

        pools = [
            ("ShopWarmLight",  (-0.5, -4.1, 2.25), 75.0, (1.0, 0.76, 0.42), 0.45),
            ("VendWhiteGlow",  ( 4.65, -3.22, 1.25), 28.0, (0.85, 0.95, 1.0), 0.35),
            ("VendPinkGlow",   ( 4.65,  2.95, 1.25), 24.0, (1.0, 0.84, 0.90), 0.35),
            ("Porch201Glow",   ( 2.95, -0.80, 5.42), 26.0, (1.0, 0.80, 0.48), 0.25),
            ("Porch202Glow",   ( 2.95,  1.35, 5.42), 26.0, (1.0, 0.80, 0.48), 0.25),
        ]
        for lname, lpos, lener, lcol, lrad in pools:
            ld = bpy.data.lights.new(lname, type="POINT")
            ld.energy = lener
            ld.color = lcol
            ld.shadow_soft_size = lrad
            lo = bpy.data.objects.new(lname, ld)
            lo.location = Vector(lpos)
            SP.link_obj(lo, stage)


def boost_night_emissives(is_night):
    """Boost interior room glow, backlit pleated curtains & signage subtly for cozy twilight/night beauty shot."""
    boosts = {
        "Arch_Room_Interior": (0xFFCC78, 3.8 if is_night else 0.55),
        "Arch_Shop_Interior": (0xFFC86E, 4.2 if is_night else 1.15),
        "Arch_Curtain_Cream": (0xFFD082, 1.55 if is_night else 0.0),
        "Arch_Curtain_Blue":  (0xFFE0A4, 1.35 if is_night else 0.0),
        "Arch_Sign_Ramen":    (None,     1.10 if is_night else 0.12),
        "Arch_Sign_Board_Cream": (0xFFEAC0, 1.35 if is_night else 0.14),
        "Arch_Porch_Lamp":    (0xFFD282, 9.0 if is_night else 3.6),
        "Prop_Lantern_Paper": (0xFFCB74, 6.5 if is_night else 2.2),
        "Prop_Showcase_Glow": (0xFFF6DF, 3.6 if is_night else 1.45),
        "_Stg_Cloud":         (0x44628C if is_night else 0xFFFBF2, 0.05 if is_night else 0.38),
    }
    for mname, (ecol, val) in boosts.items():
        mat = bpy.data.materials.get(mname)
        if not mat or not mat.node_tree:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Emission Strength" in bsdf.inputs:
            if ecol is not None:
                bsdf.inputs["Emission Color"].default_value = SP.hex_rgba(ecol)
            bsdf.inputs["Emission Strength"].default_value = val


def render_shot(stage, filename, cam_pos, target, lens=46.0, dof_fstop=None, res=(1280, 800), samples=32):
    cam_d = bpy.data.cameras.new(f"Cam_{filename}")
    cam_d.lens = lens
    if dof_fstop is not None:
        cam_d.dof.use_dof = True
        cam_d.dof.focus_distance = (Vector(target) - Vector(cam_pos)).length
        cam_d.dof.aperture_fstop = dof_fstop
    cam = bpy.data.objects.new(f"Cam_{filename}", cam_d)
    cam.location = Vector(cam_pos)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    SP.link_obj(cam, stage)
    bpy.context.scene.camera = cam

    SP.setup_cycles_metal(samples=samples, res=res)
    bpy.context.scene.render.filepath = str(QA_DIR / filename)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print(f"  [rendered] {QA_DIR / filename}")


def main():
    col, root, M = build_haikaze_hero()
    # Export clean standalone GLB + editable .blend BEFORE adding temporary Cycles preview stage!
    export_hero_assets(col)
    if "--export-only" in sys.argv:
        print("Export-only complete.")
        return

    # Set up miniature-diorama Cycles studio stage & shoot 5 comprehensive inspection angles!
    stage = build_diorama_stage(M)
    setup_world_lighting(stage, mode="day")
    boost_night_emissives(False)

    # 1) Iconic 3/4 miniature diorama hero shot (FULL building + rooftop water tank/laundry + street corner plinth!)
    render_shot(stage, "01-diorama-hero-34.png",     (14.8, -16.5, 7.6), (0.6, 0.0, 3.75), lens=38, dof_fstop=5.0, samples=36)
    # 2) Tight 1F Ramen shopfront close-up: billowing noren, glossy mosaic tiles, interior ramen bowls, bike, crates, A-frame menu, vending!
    render_shot(stage, "02-shopfront-closeup.png",   (0.2,  -10.2, 2.05), (0.1, -3.5, 1.50), lens=40, dof_fstop=5.6, samples=36)
    # 3) Tight 2F corridor close-up: 201/202 doors, circular brass delivery hooks, welcome mat & slippers, recessed curtain windows, AC unit, plants!
    render_shot(stage, "03-corridor-doors-hook.png", (7.4,  -4.6, 5.10), (2.4, 0.25, 4.45), lens=48, dof_fstop=5.6, samples=36)
    # 4) Elevated 3/4 stairs & rooftop close-up: teal staircase, under-stair pink vending & crates, water tank, penthouse & billowing laundry!
    render_shot(stage, "04-stairs-rooftop-detail.png", (12.2, 9.2, 10.6), (0.6, 0.4, 4.8), lens=38, dof_fstop=5.6, samples=32)

    # 5) Cozy twilight/night diorama hero shot (warm windows, glowing ramen shop, lit lantern & 3D vending showcase!)
    setup_world_lighting(stage, mode="night")
    boost_night_emissives(True)
    render_shot(stage, "05-diorama-night.png",       (14.8, -16.5, 7.6), (0.6, 0.0, 3.75), lens=38, dof_fstop=5.0, samples=36)

    print("All Gate 1 Cycles beauty renders completed!")


if __name__ == "__main__":
    main()
