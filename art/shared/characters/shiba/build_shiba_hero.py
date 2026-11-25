"""
Shiba Delivery — Hero Collectible Chubby Mochi Shiba Courier v2 (Blender 5.2.3 LTS)
===================================================================================
Re-proportioned to TRUE 2.0-head chubby plush mascot / Party Animals / direction-a
storybook silhouette (100% adorable animal, ZERO human-child legs/neck!):
  - Total height: ~1.24m (ear tips) / ~1.09m (snug helmet crown)
  - Wide squishy horizontal mochi-bun Shiba head (W=0.55m, H=0.44m -> 1.25:1 chubby cheeks!)
  - Fitted smooth open-face helmet width: ~0.58m (40% narrower than legacy 0.96m bucket ->
    still leaves ~29cm clearance on BOTH sides of Haikaze-so's 1.15m steel staircase!)
  - ZERO visible human neck & NO dangling human chinstrap: fluffy cream mochi cheeks nestle
    directly onto the cozy rounded plush jacket shoulders!
  - Distinct plump sculpted cream snout puff, glossy bean nose, crisp 3D 'ω' smile,
    wider-set sparkling dark eyes, soft rosy blush, '豆豆眉' oval eyebrow dots,
    and large perky rounded triangular Shiba ears.
  - Plump pear/bean plush torso, seamless rounded Party-Animals soft arms & cream mitten paws,
    SHORT CHUBBY STUBBY mascot legs (0.20m plush drumsticks!) + chunky rounded sneakers,
    and a big silky plush 24-ring curled cream-tip Shiba donut tail!
  - Clean 25-bone `ShibaRig` with 6 expressive bouncy NLA animations for Godot 4.7:
      Stand | Walk | StairClimb | Ride | Mount | Dismount
  - Optimized into 2 skinned meshes (`Shiba_Hero_Skinned` + `Shiba_Goggle_Glass`) -> 60-70 FPS!

Run:
  blender --background --factory-startup --python-exit-code 2 --python art/shared/characters/shiba/build_shiba_hero.py
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = Path(__file__).resolve().parent
TEX_DIR = ROOT / "art" / "shared" / "textures"
HERO_BLEND = ROOT / "art" / "town" / "haikaze-hero" / "Haikaze-Hero.blend"
QA_DIR = ROOT / "output" / "blender-qa" / "shiba-hero"
QA_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEAD_CZ = 0.840


def srgb_to_lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h: int, a: float = 1.0):
    r = ((h >> 16) & 255) / 255.0
    g = ((h >> 8) & 255) / 255.0
    b = (h & 255) / 255.0
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), a)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_smooth(obj):
    if obj.type != "MESH" or not obj.data:
        return
    for p in obj.data.polygons:
        p.use_smooth = True


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            pass
    obj.select_set(False)


# ---------------------------------------------------------------------------
# 1) Paint Seamless 1024x1024 AI-Blended Shiba Urajiro Face & Coat Texture
# ---------------------------------------------------------------------------
def build_face_urajiro_texture() -> Path:
    """Blend AI velvety plush fur texture with clean airbrushed Shiba Urajiro cream cheeks,
    warm honey-orange back nape, plump oval '豆豆眉' eyebrow dots, and rosy peach blush."""
    out_path = OUT_DIR / "tex_shiba_face_urajiro.png"
    res = 1024

    fur_src = TEX_DIR / "ai_shiba_fur.png"
    grain = np.ones((res, res, 3), dtype=np.float32)
    if fur_src.exists():
        bimg = bpy.data.images.load(str(fur_src), check_existing=False)
        if bimg.size[0] != res or bimg.size[1] != res:
            bimg.scale(res, res)
        arr = np.empty(res * res * 4, dtype=np.float32)
        bimg.pixels.foreach_get(arr)
        rgb = arr.reshape((res, res, 4))[:, :, :3]
        mean_c = np.maximum(0.05, rgb.mean(axis=(0, 1), keepdims=True))
        grain = np.clip(1.0 + (rgb / mean_c - 1.0) * 0.34, 0.90, 1.10)
        bpy.data.images.remove(bimg)

    us = np.linspace(0.0, 1.0, res, dtype=np.float32)[None, :]
    vs = np.linspace(0.0, 1.0, res, dtype=np.float32)[:, None]
    az = (us - 0.5) * (2.0 * math.pi)
    el = (vs - 0.5) * math.pi

    def smoothstep(edge0, edge1, x):
        t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    # Cheerful warm honey-caramel Shiba orange + creamy marshmallow Urajiro
    coat_orange = np.array([0.90, 0.53, 0.22], dtype=np.float32)
    coat_warm_crown = np.array([0.85, 0.47, 0.18], dtype=np.float32)
    urajiro_cream = np.array([0.995, 0.955, 0.875], dtype=np.float32)
    blush_pink = np.array([0.97, 0.58, 0.50], dtype=np.float32)

    crown_t = smoothstep(0.08, 0.65, el)
    base = coat_orange * (1.0 - crown_t[..., None]) + coat_warm_crown * crown_t[..., None]

    # Classic wide Shiba Urajiro mask across plump mochi cheeks + warm orange nape in back!
    abs_az = np.abs(az)
    cheek_arch = 0.075 * np.exp(-((abs_az - 0.78) / 0.38) ** 2)
    snout_arch = 0.155 * np.exp(-(abs_az / 0.28) ** 2)
    eye_dip = -0.090 * np.exp(-((abs_az - 0.38) / 0.16) ** 2)
    front_side = smoothstep(1.62, 1.02, abs_az)
    urajiro_top = -0.58 + (0.60 + cheek_arch + snout_arch + eye_dip) * front_side

    cream_mask = smoothstep(urajiro_top + 0.075, urajiro_top - 0.055, el) * smoothstep(1.78, 1.18, abs_az)
    throat_mask = smoothstep(-0.36, -0.62, el) * smoothstep(1.70, 1.05, abs_az)
    cream_mask = np.maximum(cream_mask, throat_mask)

    # Plumper, expressive oval cream Shiba eyebrow dots ('豆豆眉') cleanly above wide-set eyes!
    brow_mask = np.zeros_like(cream_mask)
    for sign in (-1.0, 1.0):
        dx = az - sign * 0.315
        dy = el - 0.285
        ca, sa = math.cos(sign * 0.24), math.sin(sign * 0.24)
        rx_b = (dx * ca + dy * sa) / 0.105
        ry_b = (-dx * sa + dy * ca) / 0.062
        d2 = rx_b * rx_b + ry_b * ry_b
        brow_mask = np.maximum(brow_mask, smoothstep(1.22, 0.52, d2))

    cream_total = np.clip(np.maximum(cream_mask, brow_mask * 0.96), 0.0, 1.0)
    col = base * (1.0 - cream_total[..., None]) + urajiro_cream * cream_total[..., None]

    # Cute rosy oval peach cheek blush puffs right below outer corners of eyes!
    blush = np.zeros_like(cream_mask)
    for sign in (-1.0, 1.0):
        dx = (az - sign * 0.62) / 0.165
        dy = (el - (-0.075)) / 0.088
        blush = np.maximum(blush, np.exp(-(dx * dx + dy * dy) * 1.35))
    blush_f = (blush * 0.42)[..., None]
    col = col * (1.0 - blush_f) + blush_pink * blush_f

    col = np.clip(col * grain, 0.0, 1.0)

    rgba = np.ones((res, res, 4), dtype=np.float32)
    rgba[:, :, :3] = col

    img = bpy.data.images.new("tex_shiba_face_urajiro", width=res, height=res, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(out_path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print(f"  [texture] Painted seamless Shiba Urajiro face texture -> {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# 2) Clean Standard Godot-Compatible PBR Materials
# ---------------------------------------------------------------------------
def load_packed_img(path: Path, colorspace: str = "sRGB"):
    img = bpy.data.images.load(str(path), check_existing=True)
    img.colorspace_settings.name = colorspace
    img.pack()
    return img


def make_pbr_mat(
    name: str,
    hex_col: int = 0xFFFFFF,
    roughness: float = 0.65,
    metallic: float = 0.0,
    coat: float = 0.0,
    coat_rough: float = 0.15,
    alpha: float = 1.0,
    emissive_hex=None,
    emissive_str: float = 0.0,
    color_path: Path = None,
    normal_path: Path = None,
    normal_str: float = 0.15,
    uv_scale: float = 1.0,
):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    if color_path and color_path.exists():
        t_col = nt.nodes.new("ShaderNodeTexImage")
        t_col.image = load_packed_img(color_path, "sRGB")
        if abs(uv_scale - 1.0) > 1e-3:
            tc = nt.nodes.new("ShaderNodeTexCoord")
            mp = nt.nodes.new("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (uv_scale, uv_scale, 1.0)
            nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], t_col.inputs["Vector"])
        nt.links.new(t_col.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = hex_rgba(hex_col)

    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if coat > 0.0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if alpha < 0.99:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    if emissive_hex is not None and emissive_str > 0.0:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emissive_hex)
        bsdf.inputs["Emission Strength"].default_value = emissive_str

    if normal_path and normal_path.exists():
        t_nrm = nt.nodes.new("ShaderNodeTexImage")
        t_nrm.image = load_packed_img(normal_path, "Non-Color")
        if abs(uv_scale - 1.0) > 1e-3:
            tc2 = nt.nodes.new("ShaderNodeTexCoord")
            mp2 = nt.nodes.new("ShaderNodeMapping")
            mp2.inputs["Scale"].default_value = (uv_scale, uv_scale, 1.0)
            nt.links.new(tc2.outputs["UV"], mp2.inputs["Vector"])
            nt.links.new(mp2.outputs["Vector"], t_nrm.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_str
        nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def build_materials(face_tex: Path):
    fur_norm = TEX_DIR / "tex_shiba_fur_normal.png"
    jac_col = TEX_DIR / "ai_jacket_fabric.png"
    jac_norm = TEX_DIR / "tex_jacket_fabric_normal.png"

    return {
        "face_fur": make_pbr_mat(
            "Shiba_Face_Fur", roughness=0.86, color_path=face_tex,
            normal_path=fur_norm if fur_norm.exists() else None, normal_str=0.06,
        ),
        "orange_fur": make_pbr_mat(
            "Shiba_Orange_Fur", hex_col=0xE58738, roughness=0.86,
            normal_path=fur_norm if fur_norm.exists() else None, normal_str=0.07,
        ),
        "cream_fur": make_pbr_mat(
            "Shiba_Cream_Fur", hex_col=0xFDF4E1, roughness=0.86,
            normal_path=fur_norm if fur_norm.exists() else None, normal_str=0.06,
        ),
        "inner_ear": make_pbr_mat("Shiba_Inner_Ear", hex_col=0xF6BFA0, roughness=0.86),
        "eye_dark": make_pbr_mat("Shiba_Eye_Dark", hex_col=0x16110F, roughness=0.05, coat=0.95, coat_rough=0.02),
        "eye_catch": make_pbr_mat("Shiba_Eye_Catch", hex_col=0xFFFFFF, roughness=0.08, emissive_hex=0xFFFFFF, emissive_str=0.90),
        "nose_dark": make_pbr_mat("Shiba_Nose_Dark", hex_col=0x261B16, roughness=0.20, coat=0.68, coat_rough=0.08),
        "helmet_yellow": make_pbr_mat("Shiba_Helmet_Yellow", hex_col=0xF5C23B, roughness=0.25, coat=0.55, coat_rough=0.12),
        "helmet_stripe": make_pbr_mat("Shiba_Helmet_Stripe", hex_col=0xFFF8E8, roughness=0.28, coat=0.45),
        "leather_dark": make_pbr_mat("Shiba_Leather_Dark", hex_col=0x523624, roughness=0.52, coat=0.12),
        "scarf_coral": make_pbr_mat("Shiba_Scarf_Coral", hex_col=0xE66448, roughness=0.80),
        "metal_steel": make_pbr_mat("Shiba_Metal_Steel", hex_col=0xD2D8DB, roughness=0.22, metallic=0.82),
        "metal_brass": make_pbr_mat("Shiba_Metal_Brass", hex_col=0xDFA948, roughness=0.24, metallic=0.86),
        "goggle_glass": make_pbr_mat("Shiba_Goggle_Glass", hex_col=0x5B4736, roughness=0.05, metallic=0.08, coat=0.95, coat_rough=0.03, alpha=0.42),
        "jacket_yellow": make_pbr_mat(
            "Shiba_Jacket_Yellow", hex_col=0xF4C038, roughness=0.74,
            color_path=jac_col if jac_col.exists() else None,
            normal_path=jac_norm if jac_norm.exists() else None, normal_str=0.08,
        ),
        "jacket_dark": make_pbr_mat(
            "Shiba_Jacket_Dark", hex_col=0x2C363E, roughness=0.76,
            normal_path=jac_norm if jac_norm.exists() else None, normal_str=0.07,
        ),
        "reflect_strip": make_pbr_mat("Shiba_Reflect_Strip", hex_col=0xEAF0F2, roughness=0.22, metallic=0.52, emissive_hex=0xDCE8EE, emissive_str=0.10),
        "pants_dark": make_pbr_mat("Shiba_Pants_Dark", hex_col=0x303B44, roughness=0.84),
        "shoe_brown": make_pbr_mat("Shiba_Shoe_Brown", hex_col=0xA66234, roughness=0.62, coat=0.08),
        "shoe_sole": make_pbr_mat("Shiba_Shoe_Sole", hex_col=0xF8F2E4, roughness=0.78),
    }


# ---------------------------------------------------------------------------
# 3) Geometry Builders
# ---------------------------------------------------------------------------
def new_mesh_obj(name: str, bm: bmesh.types.BMesh, mat, col):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.data.materials.append(mat)
    col.objects.link(obj)
    set_smooth(obj)
    return obj


def write_planar_box_uv(bm: bmesh.types.BMesh, scale: float = 2.0):
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for lp in f.loops:
            co = lp.vert.co
            if az >= ax and az >= ay:
                u, v = co.x * scale, co.y * scale
            elif ay >= ax:
                u, v = co.x * scale, co.z * scale
            else:
                u, v = co.y * scale, co.z * scale
            lp[uv_layer].uv = (u, v)


def build_loft_tube(name: str, rings_pts, mat, col, cap_start=True, cap_end=True, uv_scale=2.2):
    bm = bmesh.new()
    n_rings = len(rings_pts)
    n_seg = len(rings_pts[0])
    vrings = [[bm.verts.new(p) for p in ring] for ring in rings_pts]

    for ir in range(n_rings - 1):
        r0, r1 = vrings[ir], vrings[ir + 1]
        for iseg in range(n_seg):
            jn = (iseg + 1) % n_seg
            bm.faces.new((r0[iseg], r0[jn], r1[jn], r1[iseg]))

    if cap_start:
        c0 = sum(rings_pts[0], Vector()) / float(n_seg)
        vc0 = bm.verts.new(c0)
        for iseg in range(n_seg):
            jn = (iseg + 1) % n_seg
            bm.faces.new((vrings[0][jn], vrings[0][iseg], vc0))
    if cap_end:
        c1 = sum(rings_pts[-1], Vector()) / float(n_seg)
        vc1 = bm.verts.new(c1)
        for iseg in range(n_seg):
            jn = (iseg + 1) % n_seg
            bm.faces.new((vrings[-1][iseg], vrings[-1][jn], vc1))

    write_planar_box_uv(bm, scale=uv_scale)
    return new_mesh_obj(name, bm, mat, col)


def add_ellipsoid(name: str, center, radii, mat, col, u_seg=24, v_seg=16, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=1.0)
    rmat = Euler(rot).to_matrix()
    c = Vector(center)
    rx, ry, rz = radii
    for v in bm.verts:
        p = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
        v.co = c + rmat @ p
    write_planar_box_uv(bm, scale=2.4)
    return new_mesh_obj(name, bm, mat, col)


def add_curve_tube(name: str, pts, radius: float, mat, col, res: int = 10, bev_res: int = 4, cyclic: bool = False):
    cd = bpy.data.curves.new(name + "_Crv", "CURVE")
    cd.dimensions = "3D"
    cd.bevel_depth = radius
    cd.bevel_resolution = bev_res
    cd.resolution_u = res
    cd.use_fill_caps = not cyclic
    sp = cd.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p[0], p[1], p[2], 1.0)
    sp.use_cyclic_u = cyclic
    sp.use_endpoint_u = not cyclic
    obj = bpy.data.objects.new(name, cd)
    col.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    obj.select_set(False)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    write_planar_box_uv(bm, scale=3.0)
    bm.to_mesh(obj.data)
    bm.free()
    set_smooth(obj)
    return obj


# ---------------------------------------------------------------------------
# 4) Sculpted Wide Squishy Mochi-Bun Shiba Head + Plush Snout & Big Ears!
# ---------------------------------------------------------------------------
def build_shiba_head(M, col):
    """Wide horizontal mochi-bun Shiba head (0.55m wide x 0.44m tall -> 1.25:1 squishy cheeks!)
    with plush sculpted snout puff, big sparkling dark eyes, bean nose, 'ω' smile & big ears!"""
    bm = bmesh.new()
    nu, nv = 52, 34
    verts = []
    for iv in range(nv + 1):
        v_frac = iv / float(nv)
        el = -0.5 * math.pi + v_frac * math.pi
        cel, sel = math.cos(el), math.sin(el)
        row = []
        for iu in range(nu + 1):
            u_frac = iu / float(nu)
            az = (u_frac - 0.5) * 2.0 * math.pi  # az=0 -> -Y front, az=+-pi -> +Y back seam
            saz, caz = math.sin(az), math.cos(az)

            # Adorable wide horizontal mochi bun: rx=0.264, ry=0.226, rz=0.218!
            rx, ry, rz = 0.264, 0.226, 0.218
            x = rx * cel * saz
            y = -ry * cel * caz
            z = rz * sel

            # Extra squishy outward marshmallow lower cheeks (classic cute Shiba puff!)
            cheek_band = math.exp(-((el + 0.16) / 0.28) ** 2) * (math.sin(az) ** 2)
            x *= (1.0 + 0.085 * cheek_band)

            # Slight soft dome taper on upper crown so snug helmet looks sleek, NOT bulbous
            if el > 0.22:
                t_top = (el - 0.22) / (0.5 * math.pi - 0.22)
                shrink = 1.0 - 0.05 * (t_top ** 2)
                x *= shrink
                y *= shrink

            # Soft gentle forward cheek contour merging into sculpted cream muzzle puff
            front_w = math.exp(-(az / 0.50) ** 2) * math.exp(-((el + 0.18) / 0.30) ** 2)
            y -= 0.028 * front_w

            row.append(bm.verts.new((x, y, HEAD_CZ + z)))
        verts.append(row)

    uv_layer = bm.loops.layers.uv.verify()
    for iv in range(nv):
        for iu in range(nu):
            v00 = verts[iv][iu]
            v10 = verts[iv][iu + 1]
            v11 = verts[iv + 1][iu + 1]
            v01 = verts[iv + 1][iu]
            if iv == 0:
                f = bm.faces.new((v00, v11, v01))
                uvs = [(iu / nu, iv / nv), ((iu + 1) / nu, (iv + 1) / nv), (iu / nu, (iv + 1) / nv)]
            elif iv == nv - 1:
                f = bm.faces.new((v00, v10, v01))
                uvs = [(iu / nu, iv / nv), ((iu + 1) / nu, iv / nv), (iu / nu, (iv + 1) / nv)]
            else:
                f = bm.faces.new((v00, v10, v11, v01))
                uvs = [
                    (iu / nu, iv / nv), ((iu + 1) / nu, iv / nv),
                    ((iu + 1) / nu, (iv + 1) / nv), (iu / nu, (iv + 1) / nv),
                ]
            for lp, uv in zip(f.loops, uvs):
                lp[uv_layer].uv = uv

    head = new_mesh_obj("Shiba_Head", bm, M["face_fur"], col)
    parts = [(head, "Head")]

    # Sculpted plump cream Shiba muzzle pillow puff (instantly reads ANIMAL puppy, not human!)
    muzzle = add_ellipsoid(
        "Shiba_Muzzle_Puff",
        (0.0, -0.224, HEAD_CZ - 0.056), (0.098, 0.068, 0.062),
        M["cream_fur"], col, u_seg=24, v_seg=16, rot=(0.08, 0.0, 0.0),
    )
    parts.append((muzzle, "Head"))

    # Wide-set big expressive glossy puppy eyes + bright double sparkle catchlights!
    for s_idx, sign in enumerate((-1.0, 1.0)):
        ex = sign * 0.110
        ey = -0.208
        ez = HEAD_CZ + 0.004
        eye = add_ellipsoid(
            f"Shiba_Eye_{s_idx}", (ex, ey, ez), (0.028, 0.020, 0.032),
            M["eye_dark"], col, u_seg=20, v_seg=16, rot=(0.04, 0.0, sign * 0.30),
        )
        c1 = add_ellipsoid(f"Shiba_Catch1_{s_idx}", (ex - 0.008, ey - 0.018, ez + 0.010), (0.0085, 0.0055, 0.0095), M["eye_catch"], col, u_seg=10, v_seg=8)
        c2 = add_ellipsoid(f"Shiba_Catch2_{s_idx}", (ex + 0.009, ey - 0.017, ez - 0.009), (0.0040, 0.0035, 0.0045), M["eye_catch"], col, u_seg=8, v_seg=6)
        parts.extend([(eye, "Head"), (c1, "Head"), (c2, "Head")])

    # Plump glossy dark-espresso Shiba bean nose sitting right atop the cream muzzle puff!
    nose = add_ellipsoid("Shiba_Nose", (0.0, -0.292, HEAD_CZ - 0.032), (0.036, 0.024, 0.022), M["nose_dark"], col, u_seg=20, v_seg=14, rot=(0.14, 0.0, 0.0))
    parts.append((nose, "Head"))

    # Cheerful plump 3D 'ω' puppy smile hugging the outer front surface of the cream muzzle puff (y ~ -0.293)!
    mouth_l = add_curve_tube(
        "Shiba_Mouth_L",
        [(0.0, -0.291, HEAD_CZ - 0.045), (0.002, -0.295, HEAD_CZ - 0.062), (0.025, -0.291, HEAD_CZ - 0.072), (0.050, -0.278, HEAD_CZ - 0.060)],
        0.0052, M["nose_dark"], col, res=8, bev_res=3,
    )
    mouth_r = add_curve_tube(
        "Shiba_Mouth_R",
        [(0.0, -0.291, HEAD_CZ - 0.045), (-0.002, -0.295, HEAD_CZ - 0.062), (-0.025, -0.291, HEAD_CZ - 0.072), (-0.050, -0.278, HEAD_CZ - 0.060)],
        0.0052, M["nose_dark"], col, res=8, bev_res=3,
    )
    parts.extend([(mouth_l, "Head"), (mouth_r, "Head")])

    # Big fluffy perky triangular Shiba ears tilted warmly outward (super readable silhouette!)
    for bone_name, sign in [("Ear_L", 1.0), ("Ear_R", -1.0)]:
        base_c = Vector((sign * 0.162, -0.008, HEAD_CZ + 0.148))
        ear_rot = Euler((0.14, -sign * 0.34, sign * 0.14)).to_matrix()

        ear_rings = []
        n_seg = 18
        for rx_e, ry_e, z_loc in [
            (0.078, 0.046, 0.000),
            (0.074, 0.044, 0.052),
            (0.056, 0.034, 0.120),
            (0.036, 0.024, 0.172),
            (0.018, 0.014, 0.205),
            (0.007, 0.006, 0.218),
        ]:
            ring = []
            for i in range(n_seg):
                a = 2.0 * math.pi * i / n_seg
                px = rx_e * math.cos(a)
                py = ry_e * math.sin(a)
                if math.sin(a) < 0:
                    py *= 0.62
                ring.append(base_c + ear_rot @ Vector((px, py, z_loc)))
            ear_rings.append(ring)
        outer_ear = build_loft_tube(f"Shiba_{bone_name}", ear_rings, M["orange_fur"], col, cap_start=True, cap_end=True)

        in_rings = []
        for rx_e, ry_e, z_loc in [
            (0.046, 0.018, 0.034),
            (0.042, 0.016, 0.086),
            (0.028, 0.013, 0.140),
            (0.012, 0.007, 0.176),
        ]:
            ring = []
            for i in range(14):
                a = 2.0 * math.pi * i / 14
                px = rx_e * math.cos(a)
                py = -0.028 + ry_e * math.sin(a)
                ring.append(base_c + ear_rot @ Vector((px, py, z_loc)))
            in_rings.append(ring)
        inner_ear = build_loft_tube(f"Shiba_{bone_name}_Inner", in_rings, M["inner_ear"], col, cap_start=True, cap_end=True)
        parts.extend([(outer_ear, bone_name), (inner_ear, bone_name)])

    return parts


def build_helmet_and_goggles(M, col):
    """Cozy fitted retro open-face mustard helmet hugging the wide mochi head (~0.58m wide,
    NO dangling human chinstrap so the soft fluffy Shiba cheeks shine!) + hinged goggles!"""
    parts = []

    bm = bmesh.new()
    nu, nv = 52, 24
    verts = []

    def rim_el(az: float) -> float:
        aa = abs(az)
        if aa < 0.85:
            t = aa / 0.85
            return 0.44 - 0.12 * (t * t)
        elif aa < 1.62:
            t = (aa - 0.85) / (1.62 - 0.85)
            st = t * t * (3.0 - 2.0 * t)
            return 0.32 * (1.0 - st) + (-0.12) * st
        else:
            t = (aa - 1.62) / (math.pi - 1.62)
            st = t * t * (3.0 - 2.0 * t)
            return -0.12 * (1.0 - st) + (-0.34) * st

    rim_pts = []
    for iv in range(nv + 1):
        vf = iv / float(nv)
        row = []
        for iu in range(nu):
            az = -math.pi + (iu / float(nu)) * 2.0 * math.pi
            el_lo = rim_el(az)
            el = el_lo + vf * (0.495 * math.pi - el_lo)
            cel, sel = math.cos(el), math.sin(el)
            saz, caz = math.sin(az), math.cos(az)
            # Hugs the wide mochi skull snugly (rx=0.278 + 0.014 solidify -> 0.58m total width!)
            rx, ry, rz = 0.276, 0.240, 0.232
            flare = 1.0 + 0.020 * ((1.0 - vf) ** 3)
            p = Vector((rx * flare * cel * saz, -ry * flare * cel * caz, HEAD_CZ + 0.010 + rz * sel))
            row.append(bm.verts.new(p))
            if iv == 0:
                rim_pts.append(p)
        verts.append(row)

    for iv in range(nv):
        for iu in range(nu):
            jn = (iu + 1) % nu
            bm.faces.new((verts[iv][iu], verts[iv][jn], verts[iv + 1][jn], verts[iv + 1][iu]))
    top_c = sum((v.co for v in verts[-1]), Vector()) / float(nu)
    vtop = bm.verts.new(top_c)
    for iu in range(nu):
        jn = (iu + 1) % nu
        bm.faces.new((verts[-1][iu], verts[-1][jn], vtop))

    write_planar_box_uv(bm, scale=2.0)
    helmet = new_mesh_obj("Shiba_Helmet", bm, M["helmet_yellow"], col)
    sol = helmet.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.014
    sol.offset = 1.0
    apply_mods(helmet)

    # Flush neat dark leather grommets around the ear openings
    for sign in (-1.0, 1.0):
        base_c = Vector((sign * 0.172, -0.006, HEAD_CZ + 0.184))
        ear_rot = Euler((0.14, -sign * 0.34, sign * 0.14)).to_matrix()
        grom_pts = []
        for i in range(18):
            a = 2.0 * math.pi * i / 18
            p = base_c + ear_rot @ Vector((0.072 * math.cos(a), 0.044 * math.sin(a), 0.0))
            rel = Vector((p.x / 0.290, p.y / 0.254, (p.z - (HEAD_CZ + 0.010)) / 0.246)).normalized()
            grom_pts.append(Vector((rel.x * 0.289, rel.y * 0.253, HEAD_CZ + 0.010 + rel.z * 0.245)))
        grom = add_curve_tube(f"Shiba_EarGrommet_{sign}", grom_pts, 0.0058, M["leather_dark"], col, res=6, bev_res=3, cyclic=True)
        parts.append((grom, "Head"))

    # Crisp dark espresso rubber trim along helmet rim + cute brass side buttons (NO hanging chinstrap!)
    rim_trim = add_curve_tube("Shiba_Helmet_Rim", rim_pts[::2], 0.0105, M["leather_dark"], col, res=4, bev_res=3, cyclic=True)
    parts.extend([(helmet, "Head"), (rim_trim, "Head")])

    for sign in (-1.0, 1.0):
        riv = add_ellipsoid(f"Shiba_Helmet_Rivet_{sign}", (sign * 0.292, -0.020, HEAD_CZ - 0.005), (0.011, 0.014, 0.014), M["metal_brass"], col, u_seg=12, v_seg=8)
        parts.append((riv, "Head"))

    # Twin cream racing stripes over helmet crown
    for sx in (-0.022, 0.022):
        s_pts = []
        for i in range(18):
            t = i / 17.0
            ang = 0.46 + t * (math.pi - 0.80)
            y = -0.255 * math.cos(ang)
            z = HEAD_CZ + 0.010 + 0.247 * math.sin(ang)
            s_pts.append((sx, y, z))
        stripe = add_curve_tube(f"Shiba_Helmet_Stripe_{sx}", s_pts, 0.0085, M["helmet_stripe"], col, res=8, bev_res=3)
        parts.append((stripe, "Head"))

    # Hinged Retro Aviation Goggles (0 deg = over eyes in Ride; -38 deg = UP on helmet forehead in Stand/Walk!)
    gog_z = HEAD_CZ + 0.004
    gog_y = -0.278
    glass_objs = []
    for sign in (-1.0, 1.0):
        gx = sign * 0.106
        rot_g = Euler((0.0, 0.0, sign * 0.24)).to_matrix()
        rim_g_pts = []
        for i in range(20):
            a = 2.0 * math.pi * i / 20
            local = Vector((0.066 * math.cos(a), 0.0, 0.048 * math.sin(a)))
            rim_g_pts.append(Vector((gx, gog_y, gog_z)) + rot_g @ local)
        bezel = add_curve_tube(f"Shiba_Goggle_Rim_{sign}", rim_g_pts, 0.011, M["metal_steel"], col, res=4, bev_res=3, cyclic=True)
        cush_pts = [p + rot_g @ Vector((0, 0.011, 0)) for p in rim_g_pts]
        cush = add_curve_tube(f"Shiba_Goggle_Cush_{sign}", cush_pts, 0.0095, M["leather_dark"], col, res=4, bev_res=3, cyclic=True)
        parts.extend([(bezel, "GoggleHinge"), (cush, "GoggleHinge")])

        lens = add_ellipsoid(f"Shiba_Goggle_Lens_{sign}", (gx, gog_y - 0.003, gog_z), (0.059, 0.009, 0.041), M["goggle_glass"], col, u_seg=18, v_seg=12, rot=(0.0, 0.0, sign * 0.24))
        glass_objs.append((lens, "GoggleHinge"))

    bridge = add_curve_tube("Shiba_Goggle_Bridge", [(-0.040, gog_y, gog_z + 0.004), (0.0, gog_y - 0.010, gog_z + 0.012), (0.040, gog_y, gog_z + 0.004)], 0.008, M["leather_dark"], col, res=6, bev_res=3)
    strap_pts = []
    for i in range(25):
        t = i / 24.0
        az = -0.64 - t * (2.0 * math.pi - 1.28)
        back_t = max(0.0, math.cos(az - math.pi))
        rx_s = 0.295 - 0.014 * back_t
        ry_s = 0.256 - 0.022 * back_t
        z_s = gog_z + 0.006 + 0.055 * back_t
        strap_pts.append(Vector((rx_s * math.sin(az), -ry_s * math.cos(az), z_s)))
    strap = add_curve_tube("Shiba_Goggle_Strap", strap_pts, 0.0082, M["leather_dark"], col, res=6, bev_res=3)
    parts.extend([(bridge, "GoggleHinge"), (strap, "GoggleHinge")])

    return parts, glass_objs


# ---------------------------------------------------------------------------
# 5) Chubby Pear Plush Body, Seamless Soft Arms, Short Stubby Legs & Big Tail!
# ---------------------------------------------------------------------------
def build_body_outfit_and_tail(M, col):
    """True 2.0-head plush mascot proportions:
      - ZERO visible human neck (cozy coral-red delivery bandana hugs chin directly!)
      - Plump pear/bean-shaped yellow courier jacket (Z = 0.28 .. 0.64)
      - Seamless rounded Party-Animals soft plush arms & cream mitten paws
      - SHORT CHUBBY STUBBY legs (Z = 0.08 .. 0.29 -> only 20cm tall, adorable plush drumsticks!)
      - Oversized chunky rounded walnut/cream mascot sneakers (flat soles at Z = 0.000!)
      - Big silky 24-ring fluffy curled Shiba donut tail!"""
    parts = []

    def make_torso_band(name, profile, mat):
        rings = []
        n_seg = 28
        for z_p, rx_p, ry_p, y_off in profile:
            ring = []
            for i in range(n_seg):
                a = 2.0 * math.pi * i / n_seg
                ring.append(Vector((rx_p * math.cos(a), y_off + ry_p * math.sin(a), z_p)))
            rings.append(ring)
        return build_loft_tube(name, rings, mat, col, cap_start=True, cap_end=True, uv_scale=2.0)

    # Plump pear-shaped lower charcoal hem & round plush belly!
    hem = make_torso_band("Shiba_Jacket_Hem", [
        (0.285, 0.188, 0.168, 0.006),
        (0.312, 0.206, 0.184, 0.005),
        (0.342, 0.210, 0.186, 0.004),
    ], M["jacket_dark"])

    # Main chubby pear-shaped mustard-yellow windbreaker (wide round belly tapering into cozy shoulders!)
    torso_y = make_torso_band("Shiba_Jacket_Main", [
        (0.338, 0.210, 0.186, 0.004),
        (0.395, 0.204, 0.182, 0.002),
        (0.455, 0.194, 0.172, 0.000),
        (0.515, 0.182, 0.160, 0.000),
        (0.562, 0.166, 0.146, 0.000),
    ], M["jacket_yellow"])

    # Smooth rounded charcoal shoulder yoke tucked directly under the fluffy mochi cheeks (NO tall human neck!)
    yoke = make_torso_band("Shiba_Jacket_Yoke", [
        (0.558, 0.167, 0.147, 0.000),
        (0.595, 0.152, 0.134, 0.000),
        (0.628, 0.128, 0.114, 0.000),
        (0.652, 0.116, 0.104, 0.000),
    ], M["jacket_dark"])

    # Adorable cozy coral-red Shiba neckerchief/collar ring nestled snugly right under the mochi chin!
    scarf_pts = []
    for i in range(24):
        a = 2.0 * math.pi * i / 24
        # Slightly thicker dipped triangle fold in front (-Y)!
        front_dip = max(0.0, -math.sin(a)) ** 2
        sx = 0.138 * math.cos(a)
        sy = 0.128 * math.sin(a) - 0.022 * front_dip
        sz = 0.630 - 0.028 * front_dip
        scarf_pts.append((sx, sy, sz))
    scarf = add_curve_tube("Shiba_Scarf", scarf_pts, 0.026, M["scarf_coral"], col, res=6, bev_res=4, cyclic=True)
    # Tiny fluttering neckerchief knot at side-front!
    knot = add_ellipsoid("Shiba_Scarf_Knot", (0.048, -0.154, 0.598), (0.026, 0.018, 0.024), M["scarf_coral"], col, u_seg=12, v_seg=10, rot=(0.2, 0.0, -0.3))

    # Crisp reflective safety belly stripe
    refl = make_torso_band("Shiba_Jacket_Refl", [
        (0.422, 0.203, 0.180, 0.001),
        (0.450, 0.199, 0.176, 0.001),
    ], M["reflect_strip"])

    # Zipper + brushed brass pull + cute paw-print courier emblem!
    zip_pts = [(0.0, -0.184, 0.305), (0.0, -0.178, 0.435), (0.0, -0.158, 0.560), (0.0, -0.135, 0.618)]
    zipper = add_curve_tube("Shiba_Zipper", zip_pts, 0.0068, M["jacket_dark"], col, res=6, bev_res=2)
    zpull = add_ellipsoid("Shiba_ZipPull", (0.0, -0.166, 0.555), (0.0085, 0.007, 0.015), M["metal_brass"], col, u_seg=10, v_seg=8)
    badge_rot = (0.0, 0.0, -0.34)
    badge_bg = add_ellipsoid("Shiba_Badge_Bg", (0.088, -0.156, 0.505), (0.030, 0.008, 0.030), M["helmet_stripe"], col, u_seg=16, v_seg=8, rot=badge_rot)
    badge_pad = add_ellipsoid("Shiba_Badge_Pad", (0.090, -0.162, 0.500), (0.012, 0.005, 0.010), M["orange_fur"], col, u_seg=10, v_seg=6, rot=badge_rot)
    badge_t1 = add_ellipsoid("Shiba_Badge_T1", (0.080, -0.165, 0.514), (0.005, 0.004, 0.006), M["orange_fur"], col, u_seg=8, v_seg=6)
    badge_t2 = add_ellipsoid("Shiba_Badge_T2", (0.092, -0.163, 0.518), (0.005, 0.004, 0.006), M["orange_fur"], col, u_seg=8, v_seg=6)
    badge_t3 = add_ellipsoid("Shiba_Badge_T3", (0.103, -0.158, 0.513), (0.005, 0.004, 0.006), M["orange_fur"], col, u_seg=8, v_seg=6)

    parts.extend([
        (hem, "torso"), (torso_y, "torso"), (yoke, "torso"),
        (scarf, "torso"), (knot, "torso"), (refl, "torso"),
        (zipper, "torso"), (zpull, "torso"),
        (badge_bg, "torso"), (badge_pad, "torso"),
        (badge_t1, "torso"), (badge_t2, "torso"), (badge_t3, "torso"),
    ])

    # Seamless Rounded Party-Animals Plush Arms + Big Chubby Cream Paws!
    for side_tag, sign in [("L", 1.0), ("R", -1.0)]:
        # Smooth teardrop shoulder bulge blended right into the yellow torso (NO blocky shoulder pads!)
        arm_stations = [
            (Vector((sign * 0.122, 0.000, 0.562)), 0.066),
            (Vector((sign * 0.174, -0.002, 0.545)), 0.066),
            (Vector((sign * 0.214, -0.006, 0.492)), 0.060),
            (Vector((sign * 0.236, -0.012, 0.435)), 0.056),
            (Vector((sign * 0.248, -0.020, 0.382)), 0.052),
            (Vector((sign * 0.254, -0.030, 0.335)), 0.048),
        ]
        rings = []
        n_seg = 20
        for idx, (pt, rad) in enumerate(arm_stations):
            t_dir = (arm_stations[min(len(arm_stations) - 1, idx + 1)][0] - arm_stations[max(0, idx - 1)][0]).normalized()
            ref = Vector((0, 1, 0)) if abs(t_dir.y) < 0.9 else Vector((1, 0, 0))
            b1 = t_dir.cross(ref).normalized()
            b2 = t_dir.cross(b1).normalized()
            rings.append([pt + (b1 * math.cos(2 * math.pi * i / n_seg) + b2 * math.sin(2 * math.pi * i / n_seg)) * rad for i in range(n_seg)])
        sleeve = build_loft_tube(f"Shiba_Sleeve_{side_tag}", rings, M["jacket_yellow"], col, uv_scale=2.2)
        cuff = add_ellipsoid(f"Shiba_Cuff_{side_tag}", (sign * 0.254, -0.030, 0.336), (0.052, 0.052, 0.020), M["jacket_dark"], col, u_seg=16, v_seg=10)
        # Cute plump marshmallow cream puppy paw!
        paw = add_ellipsoid(f"Shiba_Paw_{side_tag}", (sign * 0.256, -0.038, 0.288), (0.050, 0.052, 0.054), M["cream_fur"], col, u_seg=18, v_seg=12)
        thumb = add_ellipsoid(f"Shiba_Thumb_{side_tag}", (sign * 0.222, -0.064, 0.300), (0.022, 0.025, 0.024), M["cream_fur"], col, u_seg=10, v_seg=8)
        parts.extend([
            (sleeve, f"arm_{side_tag}"),
            (cuff, f"Forearm_{side_tag}"),
            (paw, f"Paw_{side_tag}"),
            (thumb, f"Paw_{side_tag}"),
        ])

    # Plump plush diaper/shorts pelvis + SHORT CHUBBY STUBBY MASCOT LEGS (Z = 0.08 .. 0.29!)
    pelvis_mesh = add_ellipsoid("Shiba_Pelvis_Pants", (0.0, 0.006, 0.292), (0.194, 0.172, 0.105), M["pants_dark"], col, u_seg=24, v_seg=16)
    parts.append((pelvis_mesh, "Pelvis"))

    for side_tag, sign in [("L", 1.0), ("R", -1.0)]:
        # Short, chubby plush stubby legs (ONLY 0.20m tall — pure cute plush toy, ZERO long human pants!)
        leg_stations = [
            (Vector((sign * 0.106, 0.002, 0.282)), 0.088, 0.086),
            (Vector((sign * 0.110, -0.004, 0.220)), 0.080, 0.080),
            (Vector((sign * 0.112, -0.004, 0.162)), 0.072, 0.074),
            (Vector((sign * 0.112,  0.004, 0.112)), 0.062, 0.064),
            (Vector((sign * 0.112,  0.006, 0.088)), 0.056, 0.058),
        ]
        rings = []
        n_seg = 20
        for pt, rx_l, ry_l in leg_stations:
            rings.append([Vector((pt.x + rx_l * math.cos(2 * math.pi * i / n_seg), pt.y + ry_l * math.sin(2 * math.pi * i / n_seg), pt.z)) for i in range(n_seg)])
        leg = build_loft_tube(f"Shiba_Leg_{side_tag}", rings, M["pants_dark"], col)
        ankle = add_ellipsoid(f"Shiba_AnkleCuff_{side_tag}", (sign * 0.112, 0.006, 0.094), (0.064, 0.066, 0.018), M["jacket_dark"], col, u_seg=16, v_seg=8)

        # Oversized chunky rounded collectible paw-sneaker (flat sole strictly at Z = 0.000!)
        sole = add_ellipsoid(f"Shiba_Sole_{side_tag}", (sign * 0.112, -0.034, 0.025), (0.072, 0.108, 0.025), M["shoe_sole"], col, u_seg=18, v_seg=10)
        for v in sole.data.vertices:
            if v.co.z < 0.009:
                v.co.z = 0.000
        upper = add_ellipsoid(f"Shiba_ShoeUpper_{side_tag}", (sign * 0.112, -0.026, 0.062), (0.068, 0.098, 0.048), M["shoe_brown"], col, u_seg=18, v_seg=12)
        toecap = add_ellipsoid(f"Shiba_ShoeToe_{side_tag}", (sign * 0.112, -0.108, 0.044), (0.058, 0.036, 0.028), M["shoe_sole"], col, u_seg=14, v_seg=10)
        parts.extend([
            (leg, f"leg_{side_tag}"),
            (ankle, f"Shin_{side_tag}"),
            (sole, f"Foot_{side_tag}"),
            (upper, f"Foot_{side_tag}"),
            (toecap, f"Foot_{side_tag}"),
        ])

    # Big Silky Plush Curled Shiba Donut Tail (24 smooth rings, honey-orange base + fluffy cream tip!)
    tail_stations = []
    n_t = 24
    for i in range(n_t):
        u = i / float(n_t - 1)
        ang = -0.35 + u * (1.30 * math.pi)
        cy, cz = 0.232, 0.422
        rc_y, rc_z = 0.098, 0.118
        ty = cy + rc_y * math.sin(ang)
        tz = cz - rc_z * math.cos(ang)
        tx = 0.014 * math.sin(u * math.pi)
        rad = 0.044 + 0.036 * math.sin(u * math.pi) - 0.020 * (u ** 3)
        rad = max(0.018, rad)
        tail_stations.append((Vector((tx, ty, tz)), rad))

    t_rings = []
    n_seg = 20
    for idx, (pt, rad) in enumerate(tail_stations):
        t_dir = (tail_stations[min(len(tail_stations) - 1, idx + 1)][0] - tail_stations[max(0, idx - 1)][0]).normalized()
        ref = Vector((1, 0, 0))
        b1 = t_dir.cross(ref).normalized()
        b2 = t_dir.cross(b1).normalized()
        t_rings.append([pt + (b1 * math.cos(2 * math.pi * i / n_seg) + b2 * math.sin(2 * math.pi * i / n_seg)) * rad for i in range(n_seg)])
    split_i = 16
    tail_base = build_loft_tube("Shiba_Tail_Base", t_rings[:split_i + 1], M["orange_fur"], col, cap_start=True, cap_end=False)
    tail_tip = build_loft_tube("Shiba_Tail_Tip", t_rings[split_i:], M["cream_fur"], col, cap_start=False, cap_end=True)
    parts.extend([(tail_base, "tail"), (tail_tip, "tail")])

    return parts


# ---------------------------------------------------------------------------
# 6) Clean 25-Bone Armature + Smooth Analytical Vertex Weights
# ---------------------------------------------------------------------------
def build_armature(col):
    arm_data = bpy.data.armatures.new("ShibaRigData")
    arm_obj = bpy.data.objects.new("ShibaRig", arm_data)
    col.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_bone(name, head, tail, parent_name=None, connect=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent_name:
            b.parent = eb[parent_name]
            b.use_connect = connect
        return b

    add_bone("Root",       (0, 0, 0.00),     (0, 0, 0.14))
    add_bone("Pelvis",     (0, 0, 0.29),     (0, 0, 0.41),  "Root")
    add_bone("Spine",      (0, 0, 0.41),     (0, 0, 0.53),  "Pelvis", True)
    add_bone("Chest",      (0, 0, 0.53),     (0, 0, 0.62),  "Spine",  True)
    add_bone("Neck",       (0, 0, 0.62),     (0, 0, 0.66),  "Chest",  True)
    add_bone("Head",       (0, 0, 0.66),     (0, 0, 1.06),  "Neck",   True)
    add_bone("Ear_L",      ( 0.162, -0.008, HEAD_CZ + 0.148), ( 0.230, -0.020, HEAD_CZ + 0.350), "Head")
    add_bone("Ear_R",      (-0.162, -0.008, HEAD_CZ + 0.148), (-0.230, -0.020, HEAD_CZ + 0.350), "Head")
    add_bone("GoggleHinge",(0.0, 0.0, HEAD_CZ + 0.008), (0.0, -0.28, HEAD_CZ + 0.008), "Head")

    for side_tag, s in [("L", 1.0), ("R", -1.0)]:
        add_bone(f"Shoulder_{side_tag}", (s * 0.110, 0.0, 0.562),    (s * 0.178, -0.002, 0.545), "Chest")
        add_bone(f"UpperArm_{side_tag}", (s * 0.178, -0.002, 0.545), (s * 0.236, -0.012, 0.435), f"Shoulder_{side_tag}", True)
        add_bone(f"Forearm_{side_tag}",  (s * 0.236, -0.012, 0.435), (s * 0.254, -0.030, 0.335), f"UpperArm_{side_tag}", True)
        add_bone(f"Paw_{side_tag}",      (s * 0.254, -0.030, 0.335), (s * 0.256, -0.048, 0.265), f"Forearm_{side_tag}", True)

        add_bone(f"Thigh_{side_tag}",    (s * 0.106, 0.0, 0.282),    (s * 0.112, -0.004, 0.180), "Pelvis")
        add_bone(f"Shin_{side_tag}",     (s * 0.112, -0.004, 0.180), (s * 0.112,  0.006, 0.088), f"Thigh_{side_tag}", True)
        add_bone(f"Foot_{side_tag}",     (s * 0.112,  0.006, 0.088), (s * 0.112, -0.105, 0.045), f"Shin_{side_tag}", True)

    add_bone("Tail_1", (0.0, 0.160, 0.315), (0.008, 0.280, 0.380), "Pelvis")
    add_bone("Tail_2", (0.008, 0.280, 0.380), (0.014, 0.305, 0.495), "Tail_1", True)
    add_bone("Tail_3", (0.014, 0.305, 0.495), (0.014, 0.205, 0.525), "Tail_2", True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def assign_smooth_weights(obj, mode: str):
    vg_cache = {}

    def add_w(bone_name: str, v_idx: int, w: float):
        if w <= 1e-4:
            return
        vg = vg_cache.get(bone_name)
        if vg is None:
            vg = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
            vg_cache[bone_name] = vg
        vg.add([v_idx], w, "REPLACE")

    def sm(e0, e1, x):
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3.0 - 2.0 * t)

    verts = obj.data.vertices
    if mode == "torso":
        for v in verts:
            z = v.co.z
            w_pel = 1.0 - sm(0.32, 0.42, z)
            w_ch = sm(0.46, 0.56, z) * (1.0 - sm(0.60, 0.65, z))
            w_nk = sm(0.60, 0.66, z)
            w_sp = max(0.0, 1.0 - w_pel - w_ch - w_nk)
            tot = w_pel + w_sp + w_ch + w_nk + 1e-6
            add_w("Pelvis", v.index, w_pel / tot)
            add_w("Spine",  v.index, w_sp / tot)
            add_w("Chest",  v.index, w_ch / tot)
            add_w("Neck",   v.index, w_nk / tot)
    elif mode in ("arm_L", "arm_R"):
        s = mode[-1]
        for v in verts:
            z = v.co.z
            x_abs = abs(v.co.x)
            w_ch = 1.0 - sm(0.140, 0.188, x_abs)
            w_fa = sm(0.468, 0.402, z)
            w_ua = max(0.0, 1.0 - w_ch - w_fa)
            tot = w_ch + w_ua + w_fa + 1e-6
            add_w(f"Shoulder_{s}", v.index, w_ch / tot)
            add_w(f"UpperArm_{s}", v.index, w_ua / tot)
            add_w(f"Forearm_{s}",  v.index, w_fa / tot)
    elif mode in ("leg_L", "leg_R"):
        s = mode[-1]
        for v in verts:
            z = v.co.z
            w_pel = sm(0.250, 0.295, z)
            w_sh = sm(0.205, 0.155, z)
            w_th = max(0.0, 1.0 - w_pel - w_sh)
            tot = w_pel + w_th + w_sh + 1e-6
            add_w("Pelvis",     v.index, w_pel / tot)
            add_w(f"Thigh_{s}", v.index, w_th / tot)
            add_w(f"Shin_{s}",  v.index, w_sh / tot)
    elif mode == "tail":
        for v in verts:
            z = v.co.z
            y = v.co.y
            w1 = 1.0 - sm(0.350, 0.420, z)
            w3 = sm(0.460, 0.515, z) * sm(0.290, 0.235, y)
            w2 = max(0.0, 1.0 - w1 - w3)
            tot = w1 + w2 + w3 + 1e-6
            add_w("Tail_1", v.index, w1 / tot)
            add_w("Tail_2", v.index, w2 / tot)
            add_w("Tail_3", v.index, w3 / tot)
    else:
        vg = obj.vertex_groups.new(name=mode)
        vg.add([v.index for v in verts], 1.0, "REPLACE")


def join_and_bind(parts, arm_obj, name: str):
    for obj, wmode in parts:
        assign_smooth_weights(obj, wmode)
    bpy.ops.object.select_all(action="DESELECT")
    for obj, _ in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0][0]
    if len(parts) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = name
    merged.parent = arm_obj
    mod = merged.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    bpy.ops.object.select_all(action="DESELECT")
    return merged


# ---------------------------------------------------------------------------
# 7) Author 6 Bouncy Adorable Plush-Toy Animations!
# ---------------------------------------------------------------------------
def author_animations(arm_obj):
    bpy.context.scene.render.fps = 30
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()

    def clear_pose():
        for pb in arm_obj.pose.bones:
            pb.rotation_mode = "XYZ"
            pb.location = (0.0, 0.0, 0.0)
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)

    def key_all(frame: int):
        for pb in arm_obj.pose.bones:
            pb.keyframe_insert("location", frame=frame)
            pb.keyframe_insert("rotation_euler", frame=frame)

    def build_action(act_name: str, n_frames: int, pose_fn, push_nla=True):
        act = bpy.data.actions.new(act_name)
        arm_obj.animation_data.action = act
        for f in range(0, n_frames + 1, 2):
            t = f / float(n_frames)
            clear_pose()
            pose_fn(t)
            key_all(f + 1)
        clear_pose()
        pose_fn(1.0)
        key_all(n_frames + 1)
        if push_nla:
            track = arm_obj.animation_data.nla_tracks.new()
            track.name = act_name
            strip = track.strips.new(act_name, 1, act)
            strip.action_frame_start = 1
            strip.action_frame_end = n_frames + 1
            track.mute = True
        return act

    def set_world_rot(bname: str, rx_deg=0.0, ry_deg=0.0, rz_deg=0.0):
        pb = arm_obj.pose.bones.get(bname)
        if not pb:
            return
        wrot = Euler((math.radians(rx_deg), math.radians(ry_deg), math.radians(rz_deg)), "XYZ").to_matrix()
        bm = pb.bone.matrix_local.to_3x3()
        lrot = bm.transposed() @ wrot @ bm
        pb.rotation_euler = lrot.to_euler("XYZ")

    def set_world_loc(bname: str, dx=0.0, dy=0.0, dz=0.0):
        pb = arm_obj.pose.bones.get(bname)
        if not pb:
            return
        bm = pb.bone.matrix_local.to_3x3()
        pb.location = bm.transposed() @ Vector((dx, dy, dz))

    # 1) STAND: Bouncy plush breathing + playful puppy head tilt + lively wagging donut tail, goggles UP!
    def pose_stand(t):
        ph = 2.0 * math.pi * t
        breath = math.sin(ph)
        wag = math.sin(ph * 2.0)
        set_world_loc("Pelvis", 0.0, 0.0, 0.006 * breath)
        set_world_rot("Spine", 1.5 + 1.5 * breath, 0.0, 0.0)
        set_world_rot("Chest", 1.0 - 1.5 * breath, 0.0, 2.0 * math.sin(ph))
        set_world_rot("Head", -2.0 + 2.5 * math.sin(ph + 0.5), 4.5 * math.sin(ph), 5.0 * math.sin(ph))
        set_world_rot("Ear_L", 0.0, -5.0 * math.sin(ph * 2.0), 0.0)
        set_world_rot("Ear_R", 0.0,  5.0 * math.sin(ph * 2.0), 0.0)
        set_world_rot("GoggleHinge", -38.0, 0.0, 0.0)  # UP on helmet forehead!
        # Cute slightly splayed Party-Animals plush arm hang!
        set_world_rot("UpperArm_L", -2.0, -9.0, 0.0)
        set_world_rot("UpperArm_R", -2.0,  9.0, 0.0)
        set_world_rot("Forearm_L", -12.0, 0.0, 0.0)
        set_world_rot("Forearm_R", -12.0, 0.0, 0.0)
        set_world_rot("Tail_1", 0.0, 14.0 * wag, 12.0 * wag)
        set_world_rot("Tail_2", 0.0, 12.0 * math.sin(ph * 2.0 - 0.5), 8.0 * wag)
        set_world_rot("Tail_3", 0.0, 10.0 * math.sin(ph * 2.0 - 1.0), 0.0)

    # 2) WALK: Adorable waddling bouncy Animal Crossing / Party Animals puppy trot!
    def pose_walk(t):
        ph = 2.0 * math.pi * t
        s = math.sin(ph)
        bounce = abs(math.sin(ph))

        set_world_loc("Pelvis", 0.014 * s, 0.0, -0.012 + 0.026 * bounce)
        set_world_rot("Pelvis", 4.0, 7.5 * s, -8.0 * s)
        set_world_rot("Spine", 3.0, -3.5 * s, 5.0 * s)
        set_world_rot("Chest", 2.0, -3.5 * s, 8.0 * s)
        set_world_rot("Head", -4.5 + 3.5 * bounce, -4.0 * s, -4.0 * s)
        set_world_rot("Ear_L", -8.0 * bounce, -6.0 * bounce, 0.0)
        set_world_rot("Ear_R", -8.0 * bounce,  6.0 * bounce, 0.0)
        set_world_rot("GoggleHinge", -38.0, 0.0, 0.0)

        for tag, phase_l in [("L", ph), ("R", ph + math.pi)]:
            sw = math.sin(phase_l)
            lift = max(0.0, math.cos(phase_l))
            thigh_rx = -34.0 * sw - 16.0 * lift
            shin_rx  =  42.0 * lift + max(0.0, -sw) * 16.0
            foot_rx  = -thigh_rx * 0.45 - shin_rx * 0.55
            set_world_rot(f"Thigh_{tag}", thigh_rx, 0.0, 0.0)
            set_world_rot(f"Shin_{tag}",  shin_rx,  0.0, 0.0)
            set_world_rot(f"Foot_{tag}",  foot_rx,  0.0, 0.0)

        set_world_rot("UpperArm_L",  30.0 * s, -10.0, 0.0)
        set_world_rot("UpperArm_R", -30.0 * s,  10.0, 0.0)
        set_world_rot("Forearm_L", -18.0 - 16.0 * max(0.0, -s), 0.0, 0.0)
        set_world_rot("Forearm_R", -18.0 - 16.0 * max(0.0,  s), 0.0, 0.0)

        set_world_rot("Tail_1", 6.0 * bounce, 18.0 * s, 14.0 * s)
        set_world_rot("Tail_2", 0.0, 14.0 * math.sin(ph - 0.6), 0.0)
        set_world_rot("Tail_3", 0.0, 10.0 * math.sin(ph - 1.1), 0.0)

    # 3) STAIR CLIMB: Plucky bouncy little stubby-leg stair scramble!
    def pose_stair(t):
        ph = 2.0 * math.pi * t
        s = math.sin(ph)
        bounce = abs(math.sin(ph))

        set_world_loc("Pelvis", 0.014 * s, -0.008, -0.016 + 0.032 * bounce)
        set_world_rot("Pelvis", 8.0, 8.0 * s, -9.0 * s)
        set_world_rot("Spine", 5.0, -3.5 * s, 5.0 * s)
        set_world_rot("Chest", 4.0, -4.0 * s, 9.0 * s)
        set_world_rot("Head", -10.0 + 4.0 * bounce, -4.0 * s, -4.0 * s)
        set_world_rot("Ear_L", -10.0 * bounce, -7.0 * bounce, 0.0)
        set_world_rot("Ear_R", -10.0 * bounce,  7.0 * bounce, 0.0)
        set_world_rot("GoggleHinge", -38.0, 0.0, 0.0)

        for tag, phase_l in [("L", ph), ("R", ph + math.pi)]:
            sw = math.sin(phase_l)
            lift = max(0.0, math.cos(phase_l))
            thigh_rx = -36.0 * sw - 38.0 * lift - 6.0
            shin_rx  =  64.0 * lift + max(0.0, sw) * 28.0 + max(0.0, -sw) * 14.0
            foot_rx  = -(thigh_rx + shin_rx) * 0.70
            set_world_rot(f"Thigh_{tag}", thigh_rx, 0.0, 0.0)
            set_world_rot(f"Shin_{tag}",  shin_rx,  0.0, 0.0)
            set_world_rot(f"Foot_{tag}",  foot_rx,  0.0, 0.0)

        set_world_rot("UpperArm_L",  36.0 * s, -11.0, 0.0)
        set_world_rot("UpperArm_R", -36.0 * s,  11.0, 0.0)
        set_world_rot("Forearm_L", -28.0 - 18.0 * max(0.0, -s), 0.0, 0.0)
        set_world_rot("Forearm_R", -28.0 - 18.0 * max(0.0,  s), 0.0, 0.0)
        set_world_rot("Tail_1", 9.0 * bounce, 20.0 * s, 14.0 * s)
        set_world_rot("Tail_2", 0.0, 14.0 * math.sin(ph - 0.5), 0.0)

    # 4) RIDE: Cozy seated puppy courier leaning forward on handlebars, goggles DOWN!
    def pose_ride(t):
        ph = 2.0 * math.pi * t
        vib = math.sin(ph * 2.0) * 0.004
        set_world_loc("Pelvis", 0.0, 0.02, -0.036 + vib)
        set_world_rot("Pelvis", 6.0, 0.0, 0.0)
        set_world_rot("Spine", 6.0, 0.0, 0.0)
        set_world_rot("Chest", 5.0 + 1.2 * math.sin(ph), 0.0, 0.0)
        set_world_rot("Head", -12.0 - 1.5 * math.sin(ph), 0.0, 0.0)
        set_world_rot("Ear_L", -12.0 - 3.5 * math.sin(ph * 2.0), -5.0, 0.0)
        set_world_rot("Ear_R", -12.0 - 3.5 * math.sin(ph * 2.0),  5.0, 0.0)
        set_world_rot("GoggleHinge", 0.0, 0.0, 0.0)  # Goggles DOWN over eyes!

        for tag, sgn in [("L", 1.0), ("R", -1.0)]:
            set_world_rot(f"Thigh_{tag}", -72.0, -sgn * 12.0, sgn * 10.0)
            set_world_rot(f"Shin_{tag}",   68.0, 0.0, 0.0)
            set_world_rot(f"Foot_{tag}",    8.0, 0.0, 0.0)

        for tag, sgn in [("L", 1.0), ("R", -1.0)]:
            set_world_rot(f"UpperArm_{tag}", -72.0, -sgn * 14.0, -sgn * 10.0)
            set_world_rot(f"Forearm_{tag}",  -18.0, 0.0, -sgn * 8.0)
            set_world_rot(f"Paw_{tag}",       12.0, 0.0, 0.0)

        set_world_rot("Tail_1", -6.0, 7.0 * math.sin(ph), 0.0)
        set_world_rot("Tail_2", -4.0, 5.0 * math.sin(ph - 0.4), 0.0)

    # 5) MOUNT & 6) DISMOUNT
    def pose_mount(t):
        u = t * t * (3.0 - 2.0 * t)
        hop = math.sin(t * math.pi)
        set_world_loc("Pelvis", 0.0, 0.02 * u, -0.036 * u + 0.08 * hop)
        set_world_rot("Pelvis", 6.0 * u, 9.0 * hop, 0.0)
        set_world_rot("Spine", 6.0 * u + 5.0 * hop, 0.0, 0.0)
        set_world_rot("Chest", 5.0 * u, 0.0, 0.0)
        set_world_rot("Head", -12.0 * u, 0.0, 0.0)
        set_world_rot("GoggleHinge", -38.0 * (1.0 - u), 0.0, 0.0)
        set_world_rot("Thigh_R", -72.0 * u - 24.0 * hop, 14.0 * hop, -10.0 * u)
        set_world_rot("Shin_R",   68.0 * u + 30.0 * hop, 0.0, 0.0)
        set_world_rot("Thigh_L", -72.0 * u, -12.0 * u, 10.0 * u)
        set_world_rot("Shin_L",   68.0 * u, 0.0, 0.0)
        for tag, sgn in [("L", 1.0), ("R", -1.0)]:
            set_world_rot(f"UpperArm_{tag}", -72.0 * u - 10.0 * hop, -sgn * (9.0 + 5.0 * u), -sgn * 10.0 * u)
            set_world_rot(f"Forearm_{tag}",  -12.0 - 6.0 * u, 0.0, -sgn * 8.0 * u)
        set_world_rot("Tail_1", -6.0 * u + 12.0 * hop, 10.0 * hop, 0.0)

    def pose_dismount(t):
        pose_mount(1.0 - t)

    build_action("Stand",      60, pose_stand)
    build_action("Walk",       24, pose_walk)
    build_action("StairClimb", 24, pose_stair)
    build_action("Ride",       30, pose_ride)
    build_action("Mount",      18, pose_mount)
    build_action("Dismount",   16, pose_dismount)

    arm_obj.animation_data.action = bpy.data.actions["Stand"]
    bpy.context.scene.frame_set(1)


# ---------------------------------------------------------------------------
# 8) Gate 1 Cycles Studio Beauty + Real Haikaze-so Scale Check Renders!
# ---------------------------------------------------------------------------
def setup_cycles_cpu(samples=24, res=(1280, 800)):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = res[0]
    sc.render.resolution_y = res[1]
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Punchy"
    except Exception:
        pass
    sc.view_settings.exposure = 0.1


def render_studio_qa(arm_obj, col):
    stage = bpy.data.collections.new("_StudioQA")
    bpy.context.scene.collection.children.link(stage)

    world = bpy.data.worlds.new("StudioWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = hex_rgba(0xBFE6FA)
    bg.inputs["Strength"].default_value = 0.85

    sun_d = bpy.data.lights.new("KeySun", "SUN")
    sun_d.energy = 3.8
    sun_d.color = (1.0, 0.95, 0.84)
    sun_d.angle = math.radians(4.0)
    sun = bpy.data.objects.new("KeySun", sun_d)
    sun.location = Vector((4.0, -5.0, 5.5))
    sun.rotation_euler = (Vector((0, 0, 0.6)) - sun.location).to_track_quat("-Z", "Y").to_euler()
    stage.objects.link(sun)

    fill_d = bpy.data.lights.new("FillArea", "AREA")
    fill_d.energy = 85.0
    fill_d.size = 4.0
    fill_d.color = (0.85, 0.93, 1.0)
    fill = bpy.data.objects.new("FillArea", fill_d)
    fill.location = Vector((-3.5, -3.0, 2.5))
    fill.rotation_euler = (Vector((0, 0, 0.6)) - fill.location).to_track_quat("-Z", "Y").to_euler()
    stage.objects.link(fill)

    flr_mat = make_pbr_mat("_QA_Floor", hex_col=0xEDE6D8, roughness=0.82)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=14.0)
    new_mesh_obj("_QA_Floor", bm, flr_mat, stage)

    def shoot(fname, cpos, tgt, lens=50.0, samples=24):
        cd = bpy.data.cameras.new("Cam")
        cd.lens = lens
        cam = bpy.data.objects.new("Cam", cd)
        cam.location = Vector(cpos)
        cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat("-Z", "Y").to_euler()
        stage.objects.link(cam)
        bpy.context.scene.camera = cam
        setup_cycles_cpu(samples=samples)
        bpy.context.scene.render.filepath = str(QA_DIR / fname)
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
        print(f"  [rendered] {QA_DIR / fname}")

    arm_obj.animation_data.action = bpy.data.actions["Stand"]
    bpy.context.scene.frame_set(1)
    shoot("01-shiba-front-34.png", (1.20, -2.80, 0.94), (0.0, 0.0, 0.62), lens=50.0, samples=18)
    shoot("02-shiba-side-back.png", (2.10, 1.90, 0.98), (0.0, 0.0, 0.60), lens=50.0, samples=16)

    arm_obj.animation_data.action = bpy.data.actions["StairClimb"]
    bpy.context.scene.frame_set(7)
    shoot("03-shiba-stair-pose.png", (2.05, -2.20, 0.90), (0.0, 0.0, 0.60), lens=50.0, samples=16)

    arm_obj.animation_data.action = bpy.data.actions["Ride"]
    bpy.context.scene.frame_set(5)
    shoot("04-shiba-ride-goggles.png", (1.80, -2.40, 0.90), (0.0, 0.0, 0.56), lens=50.0, samples=16)

    for o in list(stage.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(stage)


def render_haikaze_scale_check():
    if not HERO_BLEND.exists():
        return
    bpy.ops.wm.open_mainfile(filepath=str(HERO_BLEND))
    with bpy.data.libraries.load(str(OUT_DIR / "Shiba-Hero.blend"), link=False) as (df, dt):
        dt.collections = ["ShibaHero"]
    shiba_col = dt.collections[0]
    bpy.context.scene.collection.children.link(shiba_col)
    rig = next(o for o in shiba_col.objects if o.type == "ARMATURE")

    rig.location = Vector((4.90, -0.10, 1.46))
    rig.rotation_euler = Euler((0.0, 0.0, math.pi))
    rig.animation_data.action = bpy.data.actions["StairClimb"]
    bpy.context.scene.frame_set(7)

    rig2 = rig.copy()
    rig2.data = rig.data
    rig2.location = Vector((3.32, -0.55, 3.255))
    rig2.rotation_euler = Euler((0.0, 0.0, math.radians(-55.0)))
    shiba_col.objects.link(rig2)
    rig2.animation_data_create()
    rig2.animation_data.action = bpy.data.actions["Stand"]
    for ch in rig.children:
        ch2 = ch.copy()
        ch2.data = ch.data
        ch2.parent = rig2
        for m in ch2.modifiers:
            if m.type == "ARMATURE":
                m.object = rig2
        shiba_col.objects.link(ch2)

    sys.path.insert(0, str(HERO_BLEND.parent))
    import build_haikaze_hero as BH
    M = {"dark_iron": bpy.data.materials.get("Arch_Dark_Iron")}
    stage = BH.build_diorama_stage(M)
    BH.setup_world_lighting(stage, mode="day")
    BH.boost_night_emissives(False)

    cd = bpy.data.cameras.new("ScaleCam")
    cd.lens = 42.0
    cam = bpy.data.objects.new("ScaleCam", cd)
    cam.location = Vector((10.6, -7.8, 4.4))
    cam.rotation_euler = (Vector((3.7, -0.2, 2.75)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    stage.objects.link(cam)
    bpy.context.scene.camera = cam

    setup_cycles_cpu(samples=24)
    bpy.context.scene.render.filepath = str(QA_DIR / "05-shiba-haikaze-stairs-scale.png")
    bpy.ops.render.render(write_still=True)
    print(f"  [rendered] {QA_DIR / '05-shiba-haikaze-stairs-scale.png'}")


def main():
    clear_scene()
    face_tex = build_face_urajiro_texture()
    M = build_materials(face_tex)

    col = bpy.data.collections.new("ShibaHero")
    bpy.context.scene.collection.children.link(col)

    arm_obj = build_armature(col)

    head_parts = build_shiba_head(M, col)
    helmet_parts, glass_parts = build_helmet_and_goggles(M, col)
    body_parts = build_body_outfit_and_tail(M, col)

    opaque_mesh = join_and_bind(head_parts + helmet_parts + body_parts, arm_obj, "Shiba_Hero_Skinned")
    glass_mesh = join_and_bind(glass_parts, arm_obj, "Shiba_Goggle_Glass")

    author_animations(arm_obj)
    bpy.ops.file.pack_all()

    bb_min = Vector((1e9, 1e9, 1e9))
    bb_max = Vector((-1e9, -1e9, -1e9))
    tris = 0
    for mobj in (opaque_mesh, glass_mesh):
        mobj.data.calc_loop_triangles()
        tris += len(mobj.data.loop_triangles)
        for v in mobj.data.vertices:
            for i in range(3):
                bb_min[i] = min(bb_min[i], v.co[i])
                bb_max[i] = max(bb_max[i], v.co[i])
    sz = bb_max - bb_min
    print(f"  [stats] Shiba-Hero v2 (Chubby 2-Head Mochi): {tris:,} tris, 2 skinned meshes, 25 bones, 6 NLA actions")
    print(f"  [bounds] W={sz.x:.3f}m D={sz.y:.3f}m H={sz.z:.3f}m (Z=[{bb_min.z:.3f}..{bb_max.z:.3f}])")

    out_blend = OUT_DIR / "Shiba-Hero.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), compress=True)
    print(f"  [saved] {out_blend} ({out_blend.stat().st_size / 1024:.0f} KB)")

    if "--no-render" not in sys.argv:
        render_studio_qa(arm_obj, col)
        if "--studio-only" not in sys.argv:
            render_haikaze_scale_check()


if __name__ == "__main__":
    main()
