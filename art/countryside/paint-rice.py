"""Paint one sheaf for the bridge-bend sample. Run with Python and Pillow."""
from pathlib import Path
import math
import random
from PIL import Image, ImageDraw

rng = random.Random(314)
scale = 3
im = Image.new('RGBA', (512 * scale, 352 * scale))
pen = ImageDraw.Draw(im)

def point(a, b, c, t):
    s = 1 - t
    return (s*s*a[0] + 2*t*s*b[0] + t*t*c[0], s*s*a[1] + 2*t*s*b[1] + t*t*c[1])

def stroke(a, b, c, width, colour, leaf=False):
    left, right = [], []
    for i in range(17):
        t = i / 16
        x, y = point(a, b, c, t)
        dx = (1-t)*(b[0]-a[0]) + t*(c[0]-b[0])
        dy = (1-t)*(b[1]-a[1]) + t*(c[1]-b[1])
        r = width * ((.15 + .85*math.sin(math.pi*t)**.7) * (1-t)**.45 if leaf else 1-.70*t)
        k = r / max(.1, math.hypot(dx,dy))
        left.append(((64+x-dy*k)*scale,(y+dx*k)*scale))
        right.append(((64+x+dy*k)*scale,(y-dx*k)*scale))
    pen.polygon(left + right[::-1], fill=colour)

for layer in range(3):
    for i in range(13):
        root = rng.uniform(50, 300)
        height = rng.uniform(165, 288)
        direction = rng.uniform(-.75, 1.)
        tip = (root+direction*66, 352-height)
        bend = (root+direction*24, 352-height*.84)
        stroke((root,356), bend, tip, rng.uniform(1.2,2.1), ['#938848','#ae994e','#c4a556'][layer])
        for j in range(3):
            t = rng.uniform(.05,.63)
            x,y = point((root,356),bend,tip,t)
            reach = rng.uniform(30,83)*rng.choice([-1,1])
            lift = rng.uniform(45,100)
            stroke((x,y),(x+reach*.56,y-lift),(x+reach,y-lift*.65),rng.uniform(3.1,5.4),
                   rng.choice(['#78894e','#899650','#9aa051','#b8ac61']),True)
        reach = rng.uniform(19,52) * (-1 if direction < -.25 else 1)
        a = tip
        b = (a[0]+reach*.78,a[1]-rng.uniform(14,35))
        c = (a[0]+reach,a[1]+rng.uniform(12,38))
        stroke(a,b,c,1.2,'#c9ad60')
        for j in range(9):
            t = (j+1)/10
            x,y = point(a,b,c,t)
            dx = rng.uniform(3,7) * (1 if reach>0 else -1)
            dy = rng.uniform(6,13)
            stroke((x,y),(x+dx,y+dy*.4),(x+dx*1.22,y+dy),2.35,
                   rng.choice(['#ccaa60','#d7b56b','#e2c57e','#efd498']),True)

im.resize((512,352),Image.Resampling.LANCZOS).save(Path(__file__).with_name('harvest-rice.png'))
