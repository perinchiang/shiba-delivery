"""Low morning cloud banks, painted into a seamless cylindrical sky strip."""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

rng = random.Random(88)
w, h = 2048, 320
sky = Image.new('RGB', (w,h))
draw = ImageDraw.Draw(sky)
for y in range(h):
    k = (1-y/(h-1))**.70
    draw.line((0,y,w,y),fill=tuple(round(a+(b-a)*k) for a,b in zip((192,225,235),(38,143,213))))

for layer in range(3):
    mask = Image.new('L',(w,h))
    pen = ImageDraw.Draw(mask)
    for i in range([25,17,9][layer]):
        x = rng.uniform(0,w)
        y = rng.uniform(*[(250,293),(160,250),(47,195)][layer])
        rx = rng.uniform(26,62)*(1+layer*.40)
        height = rng.uniform(.27,.50)*rx
        for j in range(40):
            u = rng.uniform(-1,1)
            profile = (1-u*u)**.55
            r = rng.uniform(.14,.39)*height*(.25+.75*profile)
            cx = x+u*rx
            cy = y-profile*height*rng.uniform(.12,.95)
            for shift in [-w,0,w]:
                pen.ellipse((cx+shift-r*2.1,cy-r,cx+shift+r*2.1,cy+r*.8),fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur([1.0,1.25,1.55][layer]))
    sky.paste((230,231,230),mask=mask.point(lambda p:p*[.58,.71,.79][layer]))
    # The overlapping lit tops leave a cool lower rim and a broad ivory core.
    top = ImageChops.offset(mask, -2, -4-layer*2).filter(ImageFilter.GaussianBlur(2.1))
    sky.paste((255,251,242), mask=ImageChops.multiply(mask,top).point(lambda p:p*.87))
    high = Image.new('L',(w,h))
    high.paste(mask,(0,3+layer))
    rim = ImageChops.subtract(mask,high).filter(ImageFilter.GaussianBlur(1.4))
    sky.paste((255,249,231),mask=rim)
sky.save(Path(__file__).with_name('harvest-sky.jpg'),quality=91)
