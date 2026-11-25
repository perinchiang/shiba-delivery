#!/usr/bin/env /usr/local/bin/python3
"""
Post-process & composite the gpt-image-2.6-sunburst AI paintings in art/shared/textures/
into production PBR game textures (clean CJK typography integrated into paper/chalk/fabric
grain + derived tangent-space Normal & Roughness maps).
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

TEX_DIR = Path(__file__).resolve().parent
FONT_SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"


def load_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size=size, index=index)
    except Exception:
        return ImageFont.load_default()


def derive_normal_map(img_rgb, strength=2.2, blur_radius=0.8):
    """Derive a clean OpenGL tangent-space Normal map from an RGB texture's luminance."""
    gray = np.asarray(img_rgb.convert("L").filter(ImageFilter.GaussianBlur(blur_radius)), dtype=np.float32) / 255.0
    dx = (np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0)) * 0.5 * strength
    nx = -dx
    ny = dy
    nz = np.ones_like(gray)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    rgb = np.stack([(nx / norm) * 0.5 + 0.5, (ny / norm) * 0.5 + 0.5, (nz / norm) * 0.5 + 0.5], axis=-1)
    return Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), "RGB")


def make_seamless_crossblend(img, margin_frac=0.12):
    """Ensure subtle edge-to-edge seamlessness via soft mirror-free toroidal cross-fade along borders."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    # Shift by half, blend center seams smoothly
    shifted = np.roll(np.roll(arr, h // 2, axis=0), w // 2, axis=1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # Distance from border [0..1]
    fx = np.minimum(xx / (w * margin_frac), (w - 1 - xx) / (w * margin_frac))
    fy = np.minimum(yy / (h * margin_frac), (h - 1 - yy) / (h * margin_frac))
    mask = np.clip(np.minimum(fx, fy), 0.0, 1.0)
    mask = mask * mask * (3.0 - 2.0 * mask)
    blended = arr * mask[:, :, None] + shifted * (1.0 - mask[:, :, None])
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), "RGB")


def compose_menu_chalkboard():
    src = TEX_DIR / "ai_menu_chalkboard.png"
    if not src.exists():
        return
    base = Image.open(src).convert("RGB")
    W, H = base.size  # 1024x1536
    # Draw crisp chalk menu items onto an RGBA overlay, then modulate gently with chalkboard dust!
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    cream = (244, 236, 214, 236)
    gold = (248, 216, 128, 240)
    peach = (244, 182, 126, 240)
    mint = (164, 218, 192, 238)
    dots_col = (164, 174, 164, 170)

    f_item = load_font(FONT_SANS, 48, index=1)
    f_price = load_font(FONT_SANS, 48, index=2)
    f_foot = load_font(FONT_SANS, 32, index=0)

    items = [
        ("海风盐味拉面", "¥780", cream),
        ("特制叉烧拉面", "¥920", gold),
        ("手作酥脆煎饺", "¥420", cream),
        ("冰镇海风汽水", "¥280", mint),
    ]
    y0 = int(H * 0.722)
    step = int(H * 0.052)
    for idx, (name, price, col) in enumerate(items):
        y = y0 + idx * step
        draw.text((112, y), name, font=f_item, fill=col)
        draw.text((535, y + 6), "· · ·", font=f_item, fill=dots_col)
        bb = draw.textbbox((0, 0), price, font=f_price)
        draw.text((W - 114 - (bb[2] - bb[0]), y), price, font=f_price, fill=peach)

    foot = "営業時間 11:00 - 22:00"
    bbf = draw.textbbox((0, 0), foot, font=f_foot)
    draw.text(((W - (bbf[2] - bbf[0])) / 2 - bbf[0], int(H * 0.935)), foot, font=f_foot, fill=(196, 212, 202, 215))

    # Subtle dusty chalk texture modulation so typography looks hand-lettered on slate!
    ov_arr = np.asarray(overlay, dtype=np.float32)
    rng = np.random.default_rng(77)
    chalk_grain = rng.uniform(0.84, 1.0, (H, W)).astype(np.float32)
    ov_arr[:, :, 3] *= chalk_grain
    comp = Image.alpha_composite(base.convert("RGBA"), Image.fromarray(ov_arr.astype(np.uint8), "RGBA")).convert("RGB")
    comp.resize((768, 1152), Image.Resampling.LANCZOS).save(TEX_DIR / "tex_menu_chalkboard.png")
    print("  [composed] tex_menu_chalkboard.png (AI chalk art + Japanese menu)")


def compose_poster_summer():
    src = TEX_DIR / "ai_poster_summer.png"
    if not src.exists():
        return
    base = Image.open(src).convert("RGB")
    W, H = base.size  # 1536x1024
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    sky = (56, 148, 194, 240)
    coral = (212, 64, 54, 245)
    navy = (32, 68, 102, 245)

    # Top coastal ribbon badge inside clean left paper area
    draw.rounded_rectangle([84, 134, 690, 204], radius=34, fill=sky)
    f_sub = load_font(FONT_SANS, 36, index=2)
    s_txt = "— 榕湾・海风庄 夏日限定 —"
    bb = draw.textbbox((0, 0), s_txt, font=f_sub)
    draw.text((387 - (bb[2] - bb[0]) / 2 - bb[0], 169 - (bb[3] - bb[1]) / 2 - bb[1]), s_txt, font=f_sub, fill=(252, 248, 236, 250))

    # Bold retro Showa headline on clean left paper
    f_big = load_font(FONT_SANS, 138, index=2)
    f_mid = load_font(FONT_SANS, 78, index=2)
    # Soft warm paper shadow behind headline
    draw.text((92, 250), "冷やし", font=f_big, fill=(224, 212, 186, 170))
    draw.text((88, 246), "冷やし", font=f_big, fill=coral)
    draw.text((134, 412), "中華", font=f_big, fill=(224, 212, 186, 170))
    draw.text((130, 408), "中華", font=f_big, fill=navy)
    draw.text((92, 594), "はじめました！", font=f_mid, fill=sky)

    # Retro red stamp seal
    draw.rounded_rectangle([104, 718, 434, 804], radius=18, outline=coral, width=6, fill=(252, 240, 232, 220))
    f_tag = load_font(FONT_SANS, 42, index=2)
    tag = "特製ゴマダレ"
    bbt = draw.textbbox((0, 0), tag, font=f_tag)
    draw.text((269 - (bbt[2] - bbt[0]) / 2 - bbt[0], 761 - (bbt[3] - bbt[1]) / 2 - bbt[1]), tag, font=f_tag, fill=coral)

    comp = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    comp.resize((1024, 682), Image.Resampling.LANCZOS).save(TEX_DIR / "tex_poster_summer.png")
    print("  [composed] tex_poster_summer.png (AI gouache hiyashi chuka + Showa headline)")


def compose_vending_posters():
    configs = [
        ("ai_vending_poster_white.png", "tex_vending_poster_white.png", "海風サイダー", "SHIOKAZE CIDER", (26, 98, 146)),
        ("ai_vending_poster_pink.png",  "tex_vending_poster_pink.png",  "ももサイダー", "MOMO PEACH",     (184, 62, 96)),
    ]
    for src_name, dst_name, jp, en, c_dark in configs:
        src = TEX_DIR / src_name
        if not src.exists():
            continue
        base = Image.open(src).convert("RGB").resize((768, 768), Image.Resampling.LANCZOS)
        W, H = base.size
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(ov)

        # Clean crisp semi-translucent retro header banner & footer bar
        draw.rounded_rectangle([90, 26, W - 90, 114], radius=24, fill=(255, 252, 245, 224), outline=(*c_dark, 235), width=5)
        f_jp = load_font(FONT_SANS, 54, index=2)
        bb = draw.textbbox((0, 0), jp, font=f_jp)
        draw.text(((W - (bb[2] - bb[0])) / 2 - bb[0], 70 - (bb[3] - bb[1]) / 2 - bb[1]), jp, font=f_jp, fill=(*c_dark, 250))

        draw.rounded_rectangle([140, H - 86, W - 140, H - 24], radius=18, fill=(*c_dark, 235))
        f_en = load_font(FONT_SANS, 32, index=2)
        bb2 = draw.textbbox((0, 0), en, font=f_en)
        draw.text(((W - (bb2[2] - bb2[0])) / 2 - bb2[0], (H - 55) - (bb2[3] - bb2[1]) / 2 - bb2[1]), en, font=f_en, fill=(255, 252, 244, 250))

        comp = Image.alpha_composite(base.convert("RGBA"), ov).convert("RGB")
        comp.save(TEX_DIR / dst_name)
        print(f"  [composed] {dst_name} (AI beverage art + clean badge)")


def compose_noren_4panel():
    src = TEX_DIR / "ai_noren_fabric.png"
    if not src.exists():
        return
    # Tile the authentic AI woven crimson linen + hand-block-printed cream seigaiha waves into 4 panels (1024x512)!
    fabric = Image.open(src).convert("RGB")
    pw, ph = 256, 512
    # Crop/resize clean panel from the 1024x1024 fabric so the wave motif scales gracefully at the bottom
    panel_base = fabric.resize((512, 512), Image.Resampling.LANCZOS)

    out = Image.new("RGB", (pw * 4, ph))
    for i in range(4):
        # Slightly varied horizontal slice from the 512-wide woven cloth so each panel has authentic linen variety!
        x0 = (i * 80) % 256
        tile = panel_base.crop((x0, 0, x0 + pw, ph))
        out.paste(tile, (i * pw, 0))

    # Stamp hand-dyed cream double-circle crests ('海 风 拉 面') modulated gently by the woven cloth grain!
    ov = Image.new("RGBA", (pw * 4, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    cream = (248, 238, 218, 245)
    cream_soft = (236, 222, 198, 215)
    font_crest = load_font(FONT_SERIF, 112, index=6)

    for i, ch in enumerate(["海", "风", "拉", "面"]):
        ox = i * pw
        cx, cy = ox + pw // 2, 190
        draw.ellipse([cx - 86, cy - 86, cx + 86, cy + 86], outline=cream, width=6)
        draw.ellipse([cx - 75, cy - 75, cx + 75, cy + 75], outline=cream_soft, width=2)
        bb = draw.textbbox((0, 0), ch, font=font_crest)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text((cx - tw / 2 - bb[0], cy - th / 2 - bb[1] - 2), ch, font=font_crest, fill=cream)

    # Blend cloth texture micro-luminance slightly into the printed ink so it looks dyed into linen fibers!
    base_arr = np.asarray(out, dtype=np.float32)
    cloth_lum = base_arr.mean(axis=2)
    cloth_mod = np.clip(0.88 + 0.24 * (cloth_lum / (cloth_lum.mean() + 1e-5) - 0.85), 0.78, 1.0)
    ov_arr = np.asarray(ov, dtype=np.float32)
    ov_arr[:, :, 3] *= cloth_mod
    comp = Image.alpha_composite(out.convert("RGBA"), Image.fromarray(ov_arr.astype(np.uint8), "RGBA")).convert("RGB")
    comp.save(TEX_DIR / "tex_noren_4panel.png")
    derive_normal_map(out, strength=2.6, blur_radius=0.5).save(TEX_DIR / "tex_noren_normal.png")
    print("  [composed] tex_noren_4panel.png + normal (AI woven slub linen + seigaiha waves + '海风拉面')")


def compose_vertical_plaque():
    """Vertical warm cedar hanging wooden plaque ('海 风 面 馆') backed by real AI cedar wood texture!"""
    src = TEX_DIR / "ai_wood_cedar.png"
    if not src.exists():
        return
    wood = Image.open(src).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    # Crop rich vertical plank strip & scale gently to 256x768 warm honey-cedar board
    W, H = 256, 768
    strip = wood.crop((96, 0, 352, 512)).resize((W, H), Image.Resampling.LANCZOS)
    # Slightly lighten & warm up wood board so dark carved ink pops clearly
    arr = np.asarray(strip, dtype=np.float32)
    arr = np.clip(arr * np.array([1.14, 1.12, 1.04]) + 18.0, 0, 255).astype(np.uint8)
    base = Image.fromarray(arr, "RGB")

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    draw.rectangle([14, 14, W - 15, H - 15], outline=(82, 46, 22, 235), width=8)
    draw.rectangle([26, 26, W - 27, H - 27], outline=(148, 92, 48, 180), width=2)
    font_v = load_font(FONT_SERIF, 122, index=6)
    for idx, ch in enumerate(["海", "风", "面", "馆"]):
        cy = 132 + idx * 168
        bb = draw.textbbox((0, 0), ch, font=font_v)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text(((W - tw) / 2 - bb[0] + 2, cy - th / 2 - bb[1] + 3), ch, font=font_v, fill=(132, 82, 40, 140))
        draw.text(((W - tw) / 2 - bb[0], cy - th / 2 - bb[1]), ch, font=font_v, fill=(38, 22, 14, 248))

    comp = Image.alpha_composite(base.convert("RGBA"), ov).convert("RGB")
    comp.save(TEX_DIR / "tex_plaque_vertical.png")
    print("  [composed] tex_plaque_vertical.png (AI cedar wood + carved '海风面馆')")


def process_seamless_surfaces():
    surfaces = [
        ("ai_plaster_cream.png",  "tex_plaster_cream.png",  2.4, 1.0, True),
        ("ai_sage_concrete.png",  "tex_sage_concrete.png",  2.6, 1.0, True),
        ("ai_wood_cedar.png",     "tex_wood_cedar.png",     3.2, 0.8, False),  # vertical planks already structured
        ("ai_deck_tiles.png",     "tex_deck_tiles.png",     3.4, 0.9, False),  # 4x4 grid already aligned
    ]
    for src_name, dst_name, n_str, blur_r, do_cross in surfaces:
        src = TEX_DIR / src_name
        if not src.exists():
            continue
        im = Image.open(src).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
        if do_cross:
            im = make_seamless_crossblend(im, margin_frac=0.14)
        im.save(TEX_DIR / dst_name)
        n_path = TEX_DIR / dst_name.replace(".png", "_normal.png")
        derive_normal_map(im, strength=n_str, blur_radius=blur_r).save(n_path)
        print(f"  [processed] {dst_name} + {n_path.name}")

    # Pastel ceramic mosaic tiles: use AI hand-painted pastel tiles if present + derive crisp ceramic glaze roughness & normal!
    m_src = TEX_DIR / "ai_mosaic_tiles.png"
    if m_src.exists():
        mim = Image.open(m_src).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
        mim.save(TEX_DIR / "tex_mosaic_tiles.png")
        derive_normal_map(mim, strength=4.0, blur_radius=1.0).save(TEX_DIR / "tex_mosaic_tiles_normal.png")
        # Tiles are glossy (~0.16 roughness); pale grout lines stay slightly higher roughness (~0.62)
        arr = np.asarray(mim, dtype=np.float32)
        sat = arr.max(axis=2) - arr.min(axis=2)
        # Grout has very low saturation & sits along thin grooves
        rough = np.where(sat < 10.0, 0.58, 0.16).astype(np.float32)
        Image.fromarray(np.clip(rough * 255, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.8)).save(TEX_DIR / "tex_mosaic_tiles_roughness.png")
        print("  [processed] tex_mosaic_tiles.png + normal + roughness (AI glazed ceramic!)")


if __name__ == "__main__":
    print("Composing AI textures in", TEX_DIR)
    compose_menu_chalkboard()
    compose_poster_summer()
    compose_vending_posters()
    compose_noren_4panel()
    compose_vertical_plaque()
    process_seamless_surfaces()
    print("Done.")
