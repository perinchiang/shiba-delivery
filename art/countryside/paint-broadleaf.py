"""Paint an opaque leaf atlas for the Rongwan crowns. Run with Python, NumPy and Pillow."""
import math
import random
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw

W, H = 1536, 768
rng = random.Random(1427)
atlas = Image.new('RGB', (W, H), 'white')
paint = ImageDraw.Draw(atlas)


def mix(a, b, t):
    return tuple(round(lo + (hi - lo)*t) for lo, hi in zip(a, b))


def curve(start, controls):
    points = [start]
    for c1, c2, end in controls:
        for i in range(1, 10):
            t = i / 9
            points.append(tuple((1-t)**3*s + 3*t*(1-t)**2*a + 3*t*t*(1-t)*b + t**3*e
                                for s, a, b, e in zip(start, c1, c2, end)))
        start = end
    return points


# A slightly notched camphor leaf. Two broad painted planes meet at a bent midrib.
base, tip = (0, 0), (.16, 1)
left = curve(base, [((-.22, .06), (-.57, .22), (-.49, .48)),
                    ((-.48, .55), (-.45, .59), (-.40, .57)),
                    ((-.39, .79), (-.18, .93), tip)])
right = curve(base, [((.31, .08), (.52, .30), (.48, .54)),
                     ((.47, .60), (.46, .65), (.40, .64)),
                     ((.40, .80), (.23, .94), tip)])

for y in range(round(.945*H)):
    paint.line((0, y, W, y), fill=mix((116, 153, 93), (54, 106, 82), y/H))

for row, (y, count, length) in enumerate([
        (.80, 13, .126), (.69, 15, .152), (.57, 14, .169), (.44, 13, .18),
        (.30, 12, .185), (.16, 10, .19), (.04, 9, .16), (-.07, 7, .18)]):
    for j in range(count):
        x = (j + .43*(row % 2) + rng.uniform(-.15, .15)) / count
        anchor = y + rng.uniform(-.033, .033) + .032*math.sin(3*j/count*math.tau + row*.54)
        # Pairs fan out from a common twig. Alternating tips break horizontal rows.
        for side in [-1, 1]:
            height = length * rng.uniform(.88, 1.16) * H
            width = W/count * rng.uniform(.60, .78)
            tilt = side*rng.uniform(.22, .76) + .24*math.sin(j+row)
            warmth = max(0, min(1, .69 - .46*y + rng.uniform(-.25, .26)))
            leaf = mix((67, 119, 86), (140, 179, 105), warmth)
            lit = mix(leaf, (174, 199, 125), rng.uniform(.10, .23))
            shade = mix(leaf, (48, 102, 78), .16)
            def points(path, wrap):
                return [(round((x+wrap)*W + px*width*math.cos(tilt) + py*height*math.sin(tilt)),
                         round(anchor*H - px*width*math.sin(tilt) + py*height*math.cos(tilt))) for px, py in path]
            for wrap in [-1, 0, 1]:
                outline = points(left + right[::-1], wrap)
                x0 = max(0, min(p[0] for p in outline))
                y0 = max(0, min(p[1] for p in outline))
                x1 = min(W, 1 + max(p[0] for p in outline))
                y1 = min(H, 1 + max(p[1] for p in outline))
                if x1 <= x0 or y1 <= y0:
                    continue
                mask = Image.new('L', (x1-x0, y1-y0))
                ImageDraw.Draw(mask).polygon([(x-x0, y-y0) for x,y in outline], fill=255)
                yy, xx = np.mgrid[y0:y1, x0:x1]
                dx, dy = xx - (x+wrap)*W, yy - anchor*H
                across = (dx*math.cos(tilt) - dy*math.sin(tilt))/width
                down = (dx*math.sin(tilt) + dy*math.cos(tilt))/height
                fold = across - .14*down
                # Pigment gets warmer towards the tip, with a narrow, broken
                # stroke where the midrib catches light. Keep the outer leaf flat.
                light = (.20 + .48*down + .21*np.tanh(8*fold)*side
                         + .24*np.exp(-(fold/.034)**2)*np.sin(np.pi*np.clip(down, 0, 1))**2)
                shadow = np.array(shade) - [13, 16, 9]
                light_col = np.array(lit) + [8, 8, 3]
                pixels = shadow + (light_col-shadow)*np.clip(light,0,1)[:,:,None]
                # A narrow cast edge under the leaf, coloured like the deep canopy.
                atlas.paste(tuple(int(c*.86) for c in shade), (x0+1,y0+4), mask)
                atlas.paste(Image.fromarray(pixels.astype('uint8')), (x0,y0), mask)


# Unwrap a small overhead spray onto the polar cap. A full leaf can cross
# the summit without having its tip stretched into a radial pinwheel.
source = np.array(atlas)
yy, xx = np.mgrid[:round(.25*H), :W]
theta = xx*math.tau/W
radius = 350*np.sin(yy*math.pi/(H*.91))
px = np.rint(.39*W + radius*np.cos(theta)).astype(int) % W
py = np.clip(np.rint(.32*H + radius*np.sin(theta)).astype(int), 0, H-1)
alpha = np.clip((.24*H-yy)/(.09*H), 0, 1)[:,:,None]
alpha = alpha*alpha*(3-2*alpha)
cap = source[py,px].astype(float) + [5, 7, 1]
atlas.paste(Image.fromarray(np.uint8(alpha*cap + (1-alpha)*source[:yy.shape[0]])), (0,0))
# Neutral swatch used by wood in the same draw call. Leave room for mipmaps.
paint.rectangle((0, round(H*.945), W, H), fill='white')
atlas.resize((1024, 512), Image.Resampling.LANCZOS).save(Path(__file__).with_name('broadleaf.png'), optimize=True)
