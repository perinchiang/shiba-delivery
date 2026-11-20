"""Repaint the packed tail UV map: python3 paint_plume.py (Pillow)."""

import math
import random
from pathlib import Path
from PIL import Image, ImageDraw


def mix(a, b, t):
    return tuple(round(x + t * (y - x)) for x, y in zip(a, b))


def color_at(u, v):
    a = math.tau * v
    nap = 0.5 + 0.5 * math.cos(a + 3.1 * u)
    russet = mix((185, 92, 41), (230, 148, 75), 0.20 + 0.66 * nap)
    cream = mix((241, 199, 142), (255, 237, 201), 0.30 + 0.68 * nap)
    edge = 0.793 + 0.075 * math.sin(a + 0.5) + 0.021 * math.cos(4 * a + 0.3) + 0.010 * math.sin(11 * a)
    blend = min(1, max(0, (u - edge + 0.052) / 0.104))
    return mix(russet, cream, blend * blend * (3 - 2 * blend))


def paint():
    w, h = 512, 256
    im = Image.new("RGB", (w, h))
    im.putdata([color_at(x / (w - 1), 1 - y / h) for y in range(h) for x in range(w)])
    brush = ImageDraw.Draw(im)
    rng = random.Random(411)
    for count, min_len, max_len, spread in [(310, 10, 42, 2.7), (2000, 3, 22, 0.95)]:
        for _ in range(count):
            x, y = rng.uniform(0, w + 6), rng.uniform(0, h)
            length = rng.uniform(min_len, max_len)
            thick = spread * rng.uniform(0.55, 1.35)
            curve = rng.uniform(-2, 2) + math.sin(y / h * math.tau * 3 + 7 * x / w) * length * 0.105
            shade = color_at(max(0, (x - length * 0.75) / w), 1 - y / h)
            tint = (255, 231, 181) if rng.random() < 0.64 else (121, 69, 40)
            shade = mix(shade, tint, rng.uniform(0.10, 0.26))
            for y0 in (y - h, y, y + h):
                brush.polygon(
                    [
                        (x - length, y0 + curve),
                        (x - 0.59 * length, y0 + 0.26 * curve - thick * 0.5),
                        (x - 0.22 * length, y0 - 0.10 * curve - thick * 0.7),
                        (x, y0),
                        (x - 0.30 * length, y0 + 0.36 * thick),
                        (x - 0.66 * length, y0 + 0.41 * curve),
                    ],
                    fill=shade,
                )
    im.save(Path(__file__).with_name("Plume_Coat.png"), optimize=True)


if __name__ == "__main__":
    paint()
