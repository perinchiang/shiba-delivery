#!/usr/bin/env /usr/local/bin/python3
"""
Studio-grade 2D texture & illustrated graphics builder for Shiba Delivery.
Outputs clean standalone PNGs into art/shared/textures/ (any custom AI-painted
PNG named `custom_<filename>` in the same folder automatically overrides).
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent

FONT_SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
FONT_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"


def load_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size=size, index=index)
    except Exception:
        return ImageFont.load_default()


def value_noise(h, w, grid=16, seed=42):
    rng = np.random.default_rng(seed)
    g = rng.random((grid, grid), dtype=np.float32)
    # Periodic smooth bicubic upsampling via PIL
    img = Image.fromarray((g * 255).astype(np.uint8), mode="L")
    # Tile 3x3 for seamless wrap, resize, crop center
    tiled = Image.new("L", (grid * 3, grid * 3))
    for iy in range(3):
        for ix in range(3):
            tiled.paste(img, (ix * grid, iy * grid))
    big = tiled.resize((w * 3, h * 3), Image.Resampling.BICUBIC)
    crop = big.crop((w, h, w * 2, h * 2))
    return np.asarray(crop, dtype=np.float32) / 255.0


def fbm_seamless(h, w, octaves=(8, 16, 32, 64), weights=(0.45, 0.30, 0.17, 0.08), seed=1):
    acc = np.zeros((h, w), dtype=np.float32)
    total = 0.0
    for idx, (g, wt) in enumerate(zip(octaves, weights)):
        acc += value_noise(h, w, grid=g, seed=seed + idx * 97) * wt
        total += wt
    return acc / max(total, 1e-6)


def height_to_normal(height, strength=3.0):
    """Convert seamless 2D height field [0..1] to OpenGL tangent-space Normal map RGB."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
    nx = -dx
    ny = dy  # OpenGL +Y up
    nz = np.ones_like(height)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    rgb = np.stack([
        (nx / norm) * 0.5 + 0.5,
        (ny / norm) * 0.5 + 0.5,
        (nz / norm) * 0.5 + 0.5,
    ], axis=-1)
    return Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), mode="RGB")


def maybe_override(name):
    custom = OUT / f"custom_{name}"
    if custom.exists():
        dst = OUT / name
        Image.open(custom).save(dst)
        print(f"  [override] {name} <- {custom.name}")
        return True
    return False


def add_paper_grain(img, amount=8.0, seed=11):
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    n1 = fbm_seamless(h, w, (16, 48, 128), (0.4, 0.35, 0.25), seed=seed) - 0.5
    rng = np.random.default_rng(seed + 7)
    fine = rng.normal(0.0, 0.35, (h, w)).astype(np.float32)
    delta = (n1 * 2.2 + fine) * amount
    arr = np.clip(arr + delta[:, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def build_mosaic_tiles():
    """Seamless Showa pastel glazed ceramic mosaic tiles (Color + Normal + Roughness)."""
    if maybe_override("tex_mosaic_tiles.png"):
        return
    S = 1024
    N = 8  # 8x8 tiles
    cell = S // N
    grout = 9

    # Curated Animal Crossing / Showa pastel glazed ceramic palette
    palette = [
        (246, 238, 222),  # warm cream
        (206, 232, 220),  # pale seafoam mint
        (244, 212, 214),  # blush sakura pink
        (204, 226, 240),  # baby coastal sky
        (246, 233, 194),  # warm butter yellow
        (242, 220, 202),  # soft peach cream
        (218, 235, 226),  # light celadon
        (239, 232, 216),  # warm porcelain
    ]
    rng = np.random.default_rng(2026)

    color = np.full((S, S, 3), [233, 227, 214], dtype=np.float32)  # warm ivory grout
    height = np.zeros((S, S), dtype=np.float32)
    rough = np.full((S, S), 0.84, dtype=np.float32)  # matte grout

    # Subtle watercolor glaze noise
    glaze_n = fbm_seamless(S, S, (12, 28, 64), (0.5, 0.35, 0.15), seed=55)

    for gy in range(N):
        for gx in range(N):
            # Harmonious non-clumping pastel selection
            base = np.array(palette[(gx * 3 + gy * 5 + int(rng.integers(0, 3))) % len(palette)], dtype=np.float32)
            base += rng.uniform(-7.0, 7.0, size=3)

            y0, y1 = gy * cell, (gy + 1) * cell
            x0, x1 = gx * cell, (gx + 1) * cell

            yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32)
            # Signed distance inside rounded square tile
            pad = grout * 0.5
            half = cell * 0.5 - pad
            rad = 14.0
            qx = np.abs(xx - (cell - 1) * 0.5) - (half - rad)
            qy = np.abs(yy - (cell - 1) * 0.5) - (half - rad)
            dist = np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) + np.minimum(np.maximum(qx, qy), 0.0) - rad

            # Smooth pillowed ceramic profile (1.0 in center, curves smoothly down at edge into grout)
            inside = np.clip(-dist / 12.0, 0.0, 1.0)
            pillow = np.sqrt(np.clip(inside * (2.0 - inside), 0.0, 1.0))
            # Slight dome crown in tile center for candy-like Animal Crossing glaze highlight
            cx = (xx - cell * 0.5) / half
            cy = (yy - cell * 0.5) / half
            dome = np.clip(1.0 - 0.18 * (cx * cx + cy * cy), 0.72, 1.0)
            h_tile = pillow * dome

            mask = np.clip(-dist / 2.2, 0.0, 1.0)
            # Subtle warm edge darkening (kiln ceramic pooling at rim!)
            rim_pool = 1.0 - 0.10 * (1.0 - pillow)
            gn = (glaze_n[y0:y1, x0:x1] - 0.5) * 14.0
            tile_col = np.clip(base[None, None, :] * rim_pool[:, :, None] + gn[:, :, None], 0, 255)

            color[y0:y1, x0:x1] = color[y0:y1, x0:x1] * (1.0 - mask[:, :, None]) + tile_col * mask[:, :, None]
            height[y0:y1, x0:x1] = np.maximum(height[y0:y1, x0:x1], h_tile)
            # Glazed ceramic tiles are delightfully glossy (roughness ~0.16), grout stays matte (0.84)
            tile_r = 0.16 + 0.06 * (glaze_n[y0:y1, x0:x1] - 0.5)
            rough[y0:y1, x0:x1] = rough[y0:y1, x0:x1] * (1.0 - mask) + tile_r * mask

    Image.fromarray(np.clip(color, 0, 255).astype(np.uint8), "RGB").save(OUT / "tex_mosaic_tiles.png")
    height_to_normal(height, strength=4.2).save(OUT / "tex_mosaic_tiles_normal.png")
    Image.fromarray(np.clip(rough * 255, 0, 255).astype(np.uint8), "L").save(OUT / "tex_mosaic_tiles_roughness.png")
    print("  [built] tex_mosaic_tiles (+ normal + roughness)")


def build_noren_4panel():
    """Rich woven crimson ramen shop noren with cream seigaiha wave hem and crisp '潮 風 拉 麺' crests."""
    if maybe_override("tex_noren_4panel.png"):
        return
    W, H = 1024, 512
    # Woven heavy crimson linen fabric base
    arr = np.zeros((H, W, 3), dtype=np.float32)
    arr[:, :] = [176, 40, 35]

    # Warp and weft linen slub weave
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    weft = np.sin(yy * 1.45) * 3.5 + np.sin(yy * 0.37 + 1.2) * 2.2
    warp = np.sin(xx * 1.38) * 3.2 + np.sin(xx * 0.29) * 2.0
    dye = (fbm_seamless(H, W, (8, 20, 48), (0.5, 0.35, 0.15), seed=91) - 0.5) * 18.0
    # Slight deeper crimson along bottom dye edge and subtle top rod shadow
    v_grad = 1.0 - 0.14 * np.clip(1.0 - yy / 95.0, 0.0, 1.0) - 0.08 * np.clip((yy - 400.0) / 112.0, 0.0, 1.0)
    for c in range(3):
        arr[:, :, c] = np.clip(arr[:, :, c] * v_grad + (weft + warp + dye) * (0.9 if c == 0 else 0.55), 0, 255)

    img = Image.fromarray(arr.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)

    cream = (250, 241, 224)
    cream_soft = (238, 223, 198)
    crimson_deep = (138, 26, 22)

    chars = ["海", "风", "拉", "面"]
    font_crest = load_font(FONT_SERIF, 110, index=6)  # Bold Songti
    pw = W // 4

    for i, ch in enumerate(chars):
        ox = i * pw
        cx = ox + pw // 2
        cy = 195

        # Subtle vertical panel seam border
        draw.rectangle([ox + 8, 12, ox + pw - 9, H - 12], outline=(146, 30, 26), width=3)

        # Traditional hand-dyed double circle crest (Kamon)
        r_out = 86
        r_in = 76
        draw.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], outline=cream, width=6)
        draw.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], outline=cream_soft, width=2)

        # Crisp centered serif kanji
        bbox = draw.textbbox((0, 0), ch, font=font_crest)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - 2), ch, font=font_crest, fill=cream)

        # Charming cream seigaiha / scalloped sea-wave decorative hem band along bottom
        y_band = 398
        draw.line([(ox + 18, y_band), (ox + pw - 18, y_band)], fill=cream_soft, width=3)
        for row, ry in enumerate([442, 476]):
            step = 56
            shift = (step // 2) if row == 1 else 0
            for wx in range(ox - 20 + shift, ox + pw + 40, step):
                for rad, col in [(26, cream), (18, crimson_deep), (12, cream_soft), (6, crimson_deep)]:
                    box = [wx - rad, ry - rad, wx + rad, ry + rad]
                    # Clip within panel horizontally
                    if wx + rad >= ox + 12 and wx - rad <= ox + pw - 12:
                        draw.pieslice(box, 180, 360, fill=col)
        # Re-mask crisp panel margin over wave edges (cleanly inside each panel)
        draw.rectangle([ox, 398, ox + 16, H], fill=(166, 36, 32))
        draw.rectangle([ox + pw - 16, 398, ox + pw, H], fill=(166, 36, 32))
        # Also trim any stray slice spilling from right side of previous panel
        if i < 3:
            draw.rectangle([ox + pw - 16, 398, ox + pw + 16, H], fill=(166, 36, 32))

    # Overlay fine linen thread bump & save normal
    img = add_paper_grain(img, amount=5.5, seed=93)
    img.save(OUT / "tex_noren_4panel.png")
    weave_h = (np.sin(yy * 1.45) * 0.5 + np.sin(xx * 1.38) * 0.5) * 0.25 + 0.5
    height_to_normal(weave_h, strength=1.4).save(OUT / "tex_noren_normal.png")
    print("  [built] tex_noren_4panel (+ normal)")


def build_sign_ramen():
    """Warm cream-painted wooden ramen shop main signboard: '海风拉面 · ラーメン'."""
    if maybe_override("tex_sign_ramen.png"):
        return
    W, H = 1024, 256
    img = Image.new("RGB", (W, H), (249, 242, 224))
    draw = ImageDraw.Draw(img)

    # Outer warm timber-colored decorative frame & vintage teal double pin-stripe
    draw.rectangle([10, 10, W - 11, H - 11], outline=(42, 82, 78), width=7)
    draw.rectangle([22, 22, W - 23, H - 23], outline=(194, 72, 56), width=3)

    # Cute miniature hand-drawn crimson ramen bowl emblem on left
    cx, cy = 112, 134
    # Rising steam curls
    for sx in (-20, 0, 20):
        draw.arc([cx + sx - 8, cy - 82, cx + sx + 8, cy - 52], 90, 270, fill=(198, 72, 56), width=4)
        draw.arc([cx + sx - 8, cy - 62, cx + sx + 8, cy - 34], 270, 90, fill=(198, 72, 56), width=4)
    # Broth & narutomaki nestled right inside rim
    draw.ellipse([cx - 42, cy - 22, cx + 42, cy + 4], fill=(232, 174, 82), outline=(74, 34, 28), width=3)
    draw.ellipse([cx - 18, cy - 24, cx + 10, cy + 2], fill=(252, 248, 238), outline=(218, 96, 112), width=3)
    draw.arc([cx - 10, cy - 16, cx + 2, cy - 6], 0, 280, fill=(218, 96, 112), width=3)
    draw.line([(cx + 6, cy - 20), (cx + 52, cy - 38)], fill=(96, 56, 34), width=5)
    draw.line([(cx + 10, cy - 12), (cx + 56, cy - 24)], fill=(96, 56, 34), width=5)
    # Bowl body hugging rim cleanly
    draw.chord([cx - 46, cy - 42, cx + 46, cy + 44], 0, 180, fill=(194, 58, 48), outline=(74, 34, 28), width=4)
    draw.rectangle([cx - 22, cy + 38, cx + 22, cy + 52], fill=(194, 58, 48), outline=(74, 34, 28), width=4)
    draw.line([(cx - 42, cy + 12), (cx + 42, cy + 12)], fill=(250, 238, 214), width=5)

    # Bold readable shop title
    font_main = load_font(FONT_SANS, 82, index=2)
    title = "海风拉面 · ラーメン"
    bbox = draw.textbbox((0, 0), title, font=font_main)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = 190 + ((W - 220) - tw) / 2 - bbox[0]
    ty = (H - th) / 2 - bbox[1] - 6
    # Subtle warm ink drop shadow
    draw.text((tx + 2, ty + 3), title, font=font_main, fill=(215, 202, 178))
    draw.text((tx, ty), title, font=font_main, fill=(44, 36, 32))

    img = add_paper_grain(img, amount=7.5, seed=101)
    img.save(OUT / "tex_sign_ramen.png")
    print("  [built] tex_sign_ramen.png")


def build_plaque_haikaze():
    """Glossy retro forest-teal enamel Japanese apartment plaque: '海风庄'."""
    if maybe_override("tex_plaque_haikaze.png"):
        return
    W, H = 512, 256
    img = Image.new("RGB", (W, H), (31, 95, 86))
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([12, 12, W - 13, H - 13], radius=16, outline=(246, 238, 218), width=7)
    draw.rounded_rectangle([24, 24, W - 25, H - 25], radius=10, outline=(140, 192, 176), width=2)

    # Corner brass screw heads
    for sx, sy in [(34, 34), (W - 35, 34), (34, H - 35), (W - 35, H - 35)]:
        draw.ellipse([sx - 8, sy - 8, sx + 8, sy + 8], fill=(216, 188, 118), outline=(105, 84, 42), width=2)

    font_big = load_font(FONT_SANS, 108, index=2)
    font_sub = load_font(FONT_SANS, 26, index=0)
    txt = "海风庄"
    bb = draw.textbbox((0, 0), txt, font=font_big)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text(((W - tw) / 2 - bb[0], 42 - bb[1]), txt, font=font_big, fill=(250, 245, 230))

    sub = "HAIKAZE-SO"
    bb2 = draw.textbbox((0, 0), sub, font=font_sub)
    tw2 = bb2[2] - bb2[0]
    draw.text(((W - tw2) / 2 - bb2[0], 186 - bb2[1]), sub, font=font_sub, fill=(198, 224, 212))

    img = add_paper_grain(img, amount=4.0, seed=109)
    img.save(OUT / "tex_plaque_haikaze.png")
    print("  [built] tex_plaque_haikaze.png")


def build_plaque_vertical():
    """Warm honey-cedar vertical wood hanging plaque: '潮 風 麺 処'."""
    if maybe_override("tex_plaque_vertical.png"):
        return
    W, H = 256, 768
    arr = np.zeros((H, W, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    grain = np.sin(xx * 0.28 + np.sin(yy * 0.025) * 3.0) * 8.0
    n = (fbm_seamless(H, W, (6, 18, 40), (0.5, 0.35, 0.15), seed=121) - 0.5) * 18.0
    base = np.array([186, 128, 72], dtype=np.float32)
    for c in range(3):
        arr[:, :, c] = np.clip(base[c] + grain * 0.9 + n * 0.8, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)

    draw.rectangle([14, 14, W - 15, H - 15], outline=(98, 56, 26), width=8)
    font_v = load_font(FONT_SERIF, 118, index=6)
    chars = ["海", "风", "面", "馆"]
    for idx, ch in enumerate(chars):
        cy = 128 + idx * 170
        bb = draw.textbbox((0, 0), ch, font=font_v)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text(((W - tw) / 2 - bb[0] + 2, cy - th / 2 - bb[1] + 2), ch, font=font_v, fill=(138, 86, 44))
        draw.text(((W - tw) / 2 - bb[0], cy - th / 2 - bb[1]), ch, font=font_v, fill=(46, 26, 16))

    img.save(OUT / "tex_plaque_vertical.png")
    print("  [built] tex_plaque_vertical.png")


def build_menu_chalkboard():
    """High-resolution illustrated Japanese ramen chalkboard menu (2x supersampled)."""
    if maybe_override("tex_menu_chalkboard.png"):
        return
    S_W, S_H = 1024, 1536  # 2x supersample -> resize to 512x768
    img = Image.new("RGB", (S_W, S_H), (37, 45, 42))
    # Chalkboard dusty matte smudges
    arr = np.asarray(img, dtype=np.float32)
    dust = fbm_seamless(S_H, S_W, (6, 16, 40), (0.5, 0.35, 0.15), seed=211)
    arr = np.clip(arr + (dust[:, :, None] - 0.5) * 20.0, 22, 74).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    draw = ImageDraw.Draw(img)

    cream = (248, 240, 220)
    peach = (244, 178, 122)
    coral = (232, 108, 92)
    mint = (158, 214, 186)
    gold = (248, 214, 116)

    # Charming double-line chalk border
    draw.rounded_rectangle([38, 38, S_W - 39, S_H - 39], radius=24, outline=cream, width=6)
    draw.rounded_rectangle([54, 54, S_W - 55, S_H - 55], radius=16, outline=(182, 194, 182), width=3)

    # Header banner ribbon
    draw.rounded_rectangle([200, 92, S_W - 200, 184], radius=18, fill=coral, outline=cream, width=4)
    f_head = load_font(FONT_SANS, 56, index=2)
    hdr = "本日のおすすめ"
    bb = draw.textbbox((0, 0), hdr, font=f_head)
    draw.text(((S_W - (bb[2] - bb[0])) / 2 - bb[0], 112 - bb[1]), hdr, font=f_head, fill=cream)

    # ---- Adorable Gouache/Chalk Illustrated Steaming Ramen Bowl ----
    cx, cy = S_W // 2, 520
    # Soft warm steam wisps
    for sx, h_off in [(-115, 0), (0, -28), (115, 10)]:
        pts = []
        for k in range(30):
            t = k / 29.0
            px = cx + sx + math.sin(t * math.pi * 2.2) * 22
            py = cy - 175 + h_off - t * 135
            pts.append((px, py))
        draw.line(pts, fill=(235, 232, 220), width=10, joint="curve")

    # Dark roasted nori sheets tucked behind bowl rim
    draw.polygon([(cx + 95, cy - 150), (cx + 215, cy - 175), (cx + 235, cy - 35), (cx + 115, cy - 18)],
                 fill=(38, 54, 44), outline=(92, 126, 98), width=5)
    draw.polygon([(cx + 150, cy - 130), (cx + 258, cy - 140), (cx + 260, cy - 10), (cx + 145, cy - 4)],
                 fill=(48, 68, 54), outline=(108, 144, 112), width=5)

    # Golden broth surface ellipse
    draw.ellipse([cx - 250, cy - 95, cx + 250, cy + 55], fill=(214, 152, 68), outline=cream, width=7)
    draw.ellipse([cx - 224, cy - 78, cx + 224, cy + 40], fill=(234, 178, 86))

    # Wavy ramen noodle ribbons
    for ny in (-32, -12, 8):
        pts = [(cx - 170 + k * 14, cy + ny + math.sin(k * 0.9) * 10) for k in range(24)]
        draw.line(pts, fill=(248, 224, 148), width=9, joint="curve")

    # Chashu pork slices (left)
    for ox_p, oy_p in [(-118, -32), (-68, -50)]:
        draw.ellipse([cx + ox_p - 68, cy + oy_p - 42, cx + ox_p + 68, cy + oy_p + 42],
                     fill=(218, 142, 108), outline=(146, 78, 52), width=6)
        draw.ellipse([cx + ox_p - 46, cy + oy_p - 26, cx + ox_p + 46, cy + oy_p + 26],
                     fill=(238, 178, 142))

    # Soft-boiled jammy ajitama egg half (right-front)
    ex, ey = cx + 102, cy - 18
    draw.ellipse([ex - 58, ey - 42, ex + 58, ey + 42], fill=(252, 246, 232), outline=(218, 198, 166), width=5)
    draw.ellipse([ex - 30, ey - 24, ex + 30, ey + 24], fill=(242, 158, 46))
    draw.ellipse([ex - 14, ey - 14, ex - 2, ey - 2], fill=(255, 228, 158))

    # Iconic pink-and-white narutomaki fishcake slice (center-front)
    nx, ny = cx - 4, cy + 2
    draw.ellipse([nx - 42, ny - 32, nx + 42, ny + 32], fill=(252, 248, 240), outline=(238, 126, 142), width=6)
    draw.arc([nx - 24, ny - 18, nx + 24, ny + 18], 0, 290, fill=(238, 108, 128), width=6)
    draw.arc([nx - 12, ny - 9, nx + 12, ny + 9], 90, 360, fill=(238, 108, 128), width=5)

    # Fresh green scallion rings scattered on top
    for gx, gy in [(-24, -46), (12, -52), (34, -34), (-6, -24), (24, -14), (-44, -22)]:
        draw.ellipse([cx + gx - 12, cy + gy - 9, cx + gx + 12, cy + gy + 9],
                     fill=(108, 186, 104), outline=(62, 122, 62), width=3)
        draw.ellipse([cx + gx - 5, cy + gy - 4, cx + gx + 5, cy + gy + 4], fill=(214, 240, 178))

    # Classic deep crimson & cream Japanese ceramic bowl body (hugging broth rim cleanly!)
    draw.chord([cx - 255, cy - 255, cx + 255, cy + 235], 0, 180, fill=(186, 54, 46), outline=cream, width=7)
    draw.rounded_rectangle([cx - 102, cy + 224, cx + 102, cy + 276], radius=12, fill=(158, 42, 36), outline=cream, width=6)
    # Decorative cream wave stripe across bowl belly
    wave_pts = [(cx - 210 + k * 21, cy + 92 + math.sin(k * 1.1) * 14) for k in range(21)]
    draw.line(wave_pts, fill=gold, width=8, joint="curve")
    # Re-draw golden broth & toppings cleanly over top edge of bowl rim so bowl cradles broth!
    draw.ellipse([cx - 250, cy - 95, cx + 250, cy + 55], fill=(214, 152, 68), outline=cream, width=7)
    draw.ellipse([cx - 224, cy - 78, cx + 224, cy + 40], fill=(234, 178, 86))
    for ny in (-32, -12, 8):
        pts = [(cx - 170 + k * 14, cy + ny + math.sin(k * 0.9) * 10) for k in range(24)]
        draw.line(pts, fill=(248, 224, 148), width=9, joint="curve")
    for ox_p, oy_p in [(-118, -32), (-68, -50)]:
        draw.ellipse([cx + ox_p - 68, cy + oy_p - 42, cx + ox_p + 68, cy + oy_p + 42],
                     fill=(218, 142, 108), outline=(146, 78, 52), width=6)
        draw.ellipse([cx + ox_p - 46, cy + oy_p - 26, cx + ox_p + 46, cy + oy_p + 26],
                     fill=(238, 178, 142))
    draw.ellipse([ex - 58, ey - 42, ex + 58, ey + 42], fill=(252, 246, 232), outline=(218, 198, 166), width=5)
    draw.ellipse([ex - 30, ey - 24, ex + 30, ey + 24], fill=(242, 158, 46))
    draw.ellipse([ex - 14, ey - 14, ex - 2, ey - 2], fill=(255, 228, 158))
    draw.ellipse([nx - 42, ny - 32, nx + 42, ny + 32], fill=(252, 248, 240), outline=(238, 126, 142), width=6)
    draw.arc([nx - 24, ny - 18, nx + 24, ny + 18], 0, 290, fill=(238, 108, 128), width=6)
    draw.arc([nx - 12, ny - 9, nx + 12, ny + 9], 90, 360, fill=(238, 108, 128), width=5)
    for gx, gy in [(-24, -46), (12, -52), (34, -34), (-6, -24), (24, -14), (-44, -22)]:
        draw.ellipse([cx + gx - 12, cy + gy - 9, cx + gx + 12, cy + gy + 9],
                     fill=(108, 186, 104), outline=(62, 122, 62), width=3)
        draw.ellipse([cx + gx - 5, cy + gy - 4, cx + gx + 5, cy + gy + 4], fill=(214, 240, 178))

    # Pair of wooden chopsticks resting diagonally
    draw.line([(cx - 270, cy - 110), (cx + 150, cy - 168)], fill=(218, 168, 104), width=14)
    draw.line([(cx - 268, cy - 86), (cx + 154, cy - 134)], fill=(202, 148, 86), width=14)

    # Divider flourish
    draw.line([(120, 864), (S_W - 120, 864)], fill=peach, width=4)
    draw.ellipse([cx - 10, 854, cx + 10, 874], fill=gold)

    # Crisp chalk menu lines
    f_item = load_font(FONT_SANS, 54, index=1)
    f_price = load_font(FONT_SANS, 54, index=2)
    f_foot = load_font(FONT_SANS, 38, index=0)
    items = [
        ("海风盐味拉面", "¥780", cream),
        ("特制叉烧拉面", "¥920", gold),
        ("手作酥脆煎饺", "¥420", cream),
        ("冰镇海风汽水", "¥280", mint),
    ]
    for idx, (name, price, col) in enumerate(items):
        y = 928 + idx * 116
        draw.text((104, y), name, font=f_item, fill=col)
        # Dotted leader
        draw.text((530, y + 6), "· · ·", font=f_item, fill=(138, 152, 144))
        bbp = draw.textbbox((0, 0), price, font=f_price)
        draw.text((S_W - 108 - (bbp[2] - bbp[0]), y), price, font=f_price, fill=peach)

    foot = "営業時間 11:00 - 22:00"
    bbf = draw.textbbox((0, 0), foot, font=f_foot)
    draw.text(((S_W - (bbf[2] - bbf[0])) / 2 - bbf[0], 1412 - bbf[1]), foot, font=f_foot, fill=(182, 204, 194))

    out = img.resize((512, 768), Image.Resampling.LANCZOS)
    out = add_paper_grain(out, amount=6.0, seed=219)
    out.save(OUT / "tex_menu_chalkboard.png")
    print("  [built] tex_menu_chalkboard.png")


def build_summer_poster():
    """Retro Showa Japanese seaside summer poster: '冷やし中華 はじめました！' (2x supersampled)."""
    if maybe_override("tex_poster_summer.png"):
        return
    S_W, S_H = 1536, 1024  # -> 768x512
    img = Image.new("RGB", (S_W, S_H), (250, 244, 228))
    draw = ImageDraw.Draw(img)

    sky = (76, 168, 206)
    sky_lite = (164, 218, 236)
    coral = (218, 72, 62)
    navy = (34, 72, 104)

    # Outer frame + retro wave ribbons top & bottom
    draw.rectangle([28, 28, S_W - 29, S_H - 29], outline=sky, width=14)
    draw.rectangle([48, 48, S_W - 49, S_H - 49], outline=coral, width=5)

    # Scalloped summer ocean waves at top and bottom
    for wx in range(60, S_W - 40, 88):
        draw.pieslice([wx - 44, 52, wx + 44, 140], 0, 180, fill=sky_lite)
        draw.pieslice([wx - 44, S_H - 140, wx + 44, S_H - 52], 180, 360, fill=sky_lite)

    # Top ribbon subtitle
    draw.rounded_rectangle([110, 84, 780, 160], radius=34, fill=sky)
    f_sub = load_font(FONT_SANS, 40, index=2)
    s_txt = "— 榕湾・海风庄 夏日限定 —"
    bb = draw.textbbox((0, 0), s_txt, font=f_sub)
    draw.text((445 - (bb[2] - bb[0]) / 2 - bb[0], 102 - bb[1]), s_txt, font=f_sub, fill=(252, 248, 238))

    # Big bold retro headline on left
    f_big = load_font(FONT_SANS, 128, index=2)
    f_mid = load_font(FONT_SANS, 78, index=2)
    draw.text((92, 246), "冷やし", font=f_big, fill=coral)
    draw.text((130, 402), "中華", font=f_big, fill=navy)
    draw.text((96, 598), "はじめました！", font=f_mid, fill=sky)

    # Cute red stamp seal (wide enough for crisp padding around all 6 characters)
    draw.rounded_rectangle([108, 744, 456, 836], radius=20, outline=coral, width=6, fill=(252, 238, 232))
    f_tag = load_font(FONT_SANS, 44, index=2)
    t_tag = "特製ゴマダレ"
    bbt = draw.textbbox((0, 0), t_tag, font=f_tag)
    draw.text((282 - (bbt[2] - bbt[0]) / 2 - bbt[0], 790 - (bbt[3] - bbt[1]) / 2 - bbt[1]), t_tag, font=f_tag, fill=coral)

    # ---- Right-side Hand-Painted Cold Summer Noodle Plate + Blue Ramune Bottle ----
    px, py = 1130, 560
    # Frosted pale-blue glass plate
    draw.ellipse([px - 290, py - 210, px + 290, py + 210], fill=(184, 224, 238), outline=sky, width=10)
    draw.ellipse([px - 245, py - 172, px + 245, py + 172], fill=(224, 244, 250))

    # Chilled wavy noodles mound
    draw.ellipse([px - 190, py - 118, px + 190, py + 128], fill=(246, 214, 124), outline=(198, 152, 62), width=6)
    # Colorful summer toppings radiating cleanly:
    # 1) Green cucumber strips (left)
    for k in range(5):
        draw.rounded_rectangle([px - 175 + k * 16, py - 88 + k * 14, px - 55 + k * 12, py - 58 + k * 14],
                               radius=10, fill=(88, 178, 94), outline=(48, 118, 56), width=4)
    # 2) Golden shredded egg ribbons (top)
    for k in range(6):
        draw.rounded_rectangle([px - 45 + k * 24, py - 130 + (k % 2) * 10, px - 18 + k * 24, py - 20],
                               radius=8, fill=(252, 216, 76), outline=(212, 162, 34), width=3)
    # 3) Pink ham strips (right)
    for k in range(4):
        draw.rounded_rectangle([px + 42 + k * 14, py - 50 + k * 22, px + 165 + k * 10, py - 20 + k * 22],
                               radius=10, fill=(242, 146, 154), outline=(194, 86, 98), width=4)
    # 4) Vibrant cherry tomato halves (front)
    for tx, ty in [(px - 40, py + 58), (px + 48, py + 62)]:
        draw.ellipse([tx - 46, ty - 36, tx + 46, ty + 36], fill=(226, 62, 52), outline=(156, 32, 26), width=5)
        draw.ellipse([tx - 24, ty - 18, tx - 6, ty - 4], fill=(250, 156, 146))
    # 5) Sparkling translucent ice cubes
    for ix, iy in [(px - 190, py + 95), (px + 175, py - 115), (px + 195, py + 88)]:
        draw.rounded_rectangle([ix - 28, iy - 28, ix + 28, iy + 28], radius=10,
                               fill=(218, 245, 255), outline=(112, 194, 224), width=4)

    # Tiny fizzy coastal soda glass bottle peeking top-right
    bx, by = 1320, 220
    draw.rounded_rectangle([bx - 36, by - 40, bx + 36, by + 110], radius=22, fill=(78, 192, 228), outline=navy, width=6)
    draw.rounded_rectangle([bx - 16, by - 92, bx + 16, by - 32], radius=8, fill=(142, 222, 246), outline=navy, width=5)
    draw.rectangle([bx - 32, by + 12, bx + 32, by + 64], fill=(252, 248, 236), outline=coral, width=4)

    out = img.resize((768, 512), Image.Resampling.LANCZOS)
    out = add_paper_grain(out, amount=8.0, seed=303)
    out.save(OUT / "tex_poster_summer.png")
    print("  [built] tex_poster_summer.png")


def build_vending_posters():
    """Lower showcase art posters for White ('海風サイダー') & Pink ('ももサイダー') vending machines."""
    configs = [
        ("tex_vending_poster_white.png", (72, 178, 222), (222, 246, 254), (36, 98, 142), (250, 214, 88), "海風サイダー", "SHIOKAZE CIDER"),
        ("tex_vending_poster_pink.png", (236, 138, 162), (254, 236, 242), (168, 58, 92), (252, 224, 138), "ももサイダー", "MOMO PEACH"),
    ]
    for fname, c_main, c_bg, c_dark, c_acc, jp, en in configs:
        if maybe_override(fname):
            continue
        S = 512
        img = Image.new("RGB", (S, S), c_bg)
        draw = ImageDraw.Draw(img)

        # Cheerful diagonal seaside rays & wave base
        draw.rectangle([14, 14, S - 15, S - 15], outline=c_main, width=10)
        draw.pieslice([40, 120, S - 40, S + 40], 180, 360, fill=c_main)
        for wx in range(30, S, 76):
            draw.pieslice([wx - 38, 355, wx + 38, 435], 180, 360, fill=c_bg)
            draw.pieslice([wx - 38, 395, wx + 38, 475], 180, 360, fill=c_dark)

        # Sparkling fizzy bubbles
        for bx, by, br in [(108, 196, 18), (144, 148, 11), (392, 178, 20), (368, 248, 12), (124, 286, 14)]:
            draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(255, 255, 255), outline=c_main, width=4)

        # Cute illustrated glass soda bottle right in the center
        cx, cy = S // 2, 265
        draw.rounded_rectangle([cx - 56, cy - 60, cx + 56, cy + 128], radius=34, fill=c_bg, outline=c_dark, width=7)
        draw.rounded_rectangle([cx - 24, cy - 122, cx + 24, cy - 48], radius=12, fill=c_bg, outline=c_dark, width=6)
        draw.rounded_rectangle([cx - 28, cy - 134, cx + 28, cy - 114], radius=6, fill=c_acc, outline=c_dark, width=4)
        # Liquid fill inside bottle
        draw.rounded_rectangle([cx - 46, cy - 28, cx + 46, cy + 118], radius=24, fill=c_main)
        # Bottle label + lemon/peach slice icon
        draw.rounded_rectangle([cx - 50, cy + 6, cx + 50, cy + 74], radius=10, fill=(255, 252, 244), outline=c_dark, width=4)
        draw.ellipse([cx - 22, cy + 18, cx + 22, cy + 62], fill=c_acc, outline=c_dark, width=3)

        # Solid coastal footer band behind English brand text for razor-sharp contrast
        draw.rectangle([19, 424, S - 20, S - 20], fill=c_dark)
        # Crisp top title + bottom brand strip
        f_jp = load_font(FONT_SANS, 54, index=2)
        f_en = load_font(FONT_SANS, 30, index=2)
        bb = draw.textbbox((0, 0), jp, font=f_jp)
        draw.text(((S - (bb[2] - bb[0])) / 2 - bb[0], 40 - bb[1]), jp, font=f_jp, fill=c_dark)
        bb2 = draw.textbbox((0, 0), en, font=f_en)
        draw.text(((S - (bb2[2] - bb2[0])) / 2 - bb2[0], 456 - (bb2[3] - bb2[1]) / 2 - bb2[1]), en, font=f_en, fill=(255, 252, 244))

        img = add_paper_grain(img, amount=5.0, seed=401)
        img.save(OUT / fname)
        print(f"  [built] {fname}")


def build_apt_plaques():
    """Crisp enamel apartment door plaques '201' and '202'."""
    for num in ("201", "202"):
        fname = f"tex_apt_plaque_{num}.png"
        if maybe_override(fname):
            continue
        W, H = 256, 128
        img = Image.new("RGB", (W, H), (28, 62, 62))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([8, 8, W - 9, H - 9], radius=14, outline=(228, 206, 146), width=5)
        f = load_font(FONT_SANS, 72, index=2)
        bb = draw.textbbox((0, 0), num, font=f)
        draw.text(((W - (bb[2] - bb[0])) / 2 - bb[0], (H - (bb[3] - bb[1])) / 2 - bb[1] - 2),
                  num, font=f, fill=(250, 244, 224))
        img.save(OUT / fname)
        print(f"  [built] {fname}")


def build_welcome_mat():
    """Cozy woven coir doormat with cute paw print for door 201."""
    if maybe_override("tex_welcome_mat.png"):
        return
    W, H = 512, 256
    arr = np.zeros((H, W, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    coir = (fbm_seamless(H, W, (16, 48, 128), (0.35, 0.35, 0.30), seed=505) - 0.5) * 32.0
    base = np.array([188, 142, 88], dtype=np.float32)
    for c in range(3):
        arr[:, :, c] = np.clip(base[c] + coir + np.sin(xx * 0.9) * 5.0, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([16, 16, W - 17, H - 17], radius=18, outline=(74, 98, 84), width=12)
    # Cute dark-espresso paw emblem in center
    cx, cy = W // 2, H // 2 + 16
    draw.ellipse([cx - 38, cy - 22, cx + 38, cy + 32], fill=(78, 52, 34))
    for px, py in [(-44, -36), (-16, -54), (16, -54), (44, -36)]:
        draw.ellipse([cx + px - 14, cy + py - 18, cx + px + 14, cy + py + 18], fill=(78, 52, 34))
    img.save(OUT / "tex_welcome_mat.png")
    print("  [built] tex_welcome_mat.png")


if __name__ == "__main__":
    print("Building shared 2D stylized textures in", OUT)
    build_mosaic_tiles()
    build_noren_4panel()
    build_sign_ramen()
    build_plaque_haikaze()
    build_plaque_vertical()
    build_menu_chalkboard()
    build_summer_poster()
    build_vending_posters()
    build_apt_plaques()
    build_welcome_mat()
    print("Done.")
