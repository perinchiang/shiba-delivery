"""Paint opaque leaf clusters for the Rongwan hardwoods with Pillow and NumPy."""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W, H = 1536, 768
rng = random.Random(421)
atlas = Image.new('RGB', (W, H))
paint = ImageDraw.Draw(atlas)


def mix(a, b, t):
    return tuple(round(lo + (hi-lo)*t) for lo, hi in zip(a, b))


# Warm celadon on the sunlit crown falls away to blue jade under the branches.
for y in range(H):
    t = min(1, max(0, y/H))
    paint.line((0, y, W, y), fill=mix((104, 164, 92), (45, 104, 84), t))


def leaf(x, y, length, width, tilt, bend, color):
    # A rounded shoulder tapers into a short hooked tip. Draw one quieter plane
    # on the folded side and a short vein that dies out before reaching the tip.
    def transform(u, v):
        u = width*u + bend*v*v
        v *= length
        return (round(x + u*math.cos(tilt) + v*math.sin(tilt)),
                round(y - u*math.sin(tilt) + v*math.cos(tilt)))

    left, right, rib = [], [], []
    for k in range(25):
        t = k/24
        w = math.sin(math.pi*t)**.69 * (1.20-.46*t)
        w *= 1 - .14*math.exp(-((t-.68)/.05)**2)
        left.append(transform(-w, t))
        right.append(transform(w*(1-.10*math.sin(2*math.pi*t)), t))
        rib.append(transform(.09*math.sin(math.pi*t), t))
    edge = left + right[::-1]
    paint.polygon([(px+1,py+3) for px,py in edge], fill=mix(color, (33,90,76), .48))
    paint.polygon(edge, fill=color)
    paint.polygon(left+rib[::-1], fill=mix(color, (48, 111, 89), .32))
    paint.line(rib[4:17], fill=mix(color,(207,217,147),.44), width=2)


# A large-scale underpainting remains visible between clusters. Draw from the
# underside upwards so a spray can overlap the previous one across a row.
for row, (v, count) in enumerate([(.88, 23), (.76, 24), (.64, 22), (.53, 22),
                                  (.41, 21), (.29, 19), (.16, 17), (.04, 14), (-.08, 12)]):
    for j in range(count):
        x = W*(j + .43*(row%2) + rng.uniform(-.23,.23))/count
        y = H*(v + .027*math.sin(3*j*math.tau/count+.8*row) + rng.uniform(-.028,.028))
        length = H*rng.uniform(.135,.183)
        warmth = max(0, min(1, .88 - .66*v + rng.uniform(-.39,.31)))
        mid = mix((55,133,105), (158,198,109), warmth)
        angle = .33*math.sin(3*j/count*math.tau+row) + rng.uniform(-.40,.40)
        for tilt, scale, pigment in [(angle-.90,.67,-.09), (angle+.74,.79,.04), (angle,.98,.11)]:
            extent = length*scale*rng.uniform(.9,1.08)
            width = extent*rng.uniform(.20,.26)
            bend = rng.uniform(-.19,.19)*extent
            color = mix(mid, (191,210,131) if pigment>0 else (40,105,84), abs(pigment))
            for wrap in (-W,0,W):
                leaf(x+wrap, y, extent, width, tilt, bend, color)

# Project a small overhead patch onto the pole to avoid radial streaks.
pixels = np.asarray(atlas)
yy, xx = np.mgrid[:round(.24*H), :W]
a = xx*math.tau/W
r = 320*np.sin(yy*math.pi/H)
px = np.rint(.46*W + r*np.cos(a)).astype(int)%W
py = np.rint(.26*H + r*np.sin(a)).astype(int).clip(0,H-1)
weight = np.clip((.22*H-yy)/(.08*H),0,1)[:,:,None]
cap = pixels[py,px]*weight + pixels[:yy.shape[0]]*(1-weight)
atlas.paste(Image.fromarray(cap.astype('uint8')), (0,0))
# Project the underside around the fork as well. Its centre lies at v=.08.
bottom = round(.92*H)
yy, xx = np.mgrid[round(.65*H):bottom+1, :W]
a = xx*math.tau/W
r = (bottom-yy)*1.8
px = np.rint(.70*W + r*np.cos(a)).astype(int)%W
py = np.rint(.68*H + r*np.sin(a)*.45).astype(int).clip(0,H-1)
weight = np.clip((yy-.65*H)/(.11*H),0,1)[:,:,None]
under = pixels[py,px]*weight + pixels[yy,xx]*(1-weight)
atlas.paste(Image.fromarray(under.astype('uint8')), (0,round(.65*H)))
# The trunk shares the draw call and samples this neutral swatch.
paint.rectangle((0, round(H*.945), W, H), fill='white')
atlas.resize((1024,512), Image.Resampling.LANCZOS).save(Path(__file__).with_name('broadleaf.png'), optimize=True)
