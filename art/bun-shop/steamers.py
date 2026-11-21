"""Blender --background --python steamers.py. Build the removable bamboo counter display."""
import math
from pathlib import Path
import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
verts, faces, colors, smooth = [], [], [], []
TAU = 2 * math.pi


def surface(rings, color, soften=False):
    """Rings follow each silhouette from bottom to top in Blender's Z-up space."""
    start = len(verts)
    count = len(rings[0])
    for ring in rings:
        verts.extend(ring)
    for row in range(len(rings) - 1):
        for i in range(1 if count == 2 else count):
            a = start + row * count + i
            b = start + row * count + (i + 1) % count
            faces.append((a, b, b + count, a + count))
            colors.append(color)
            smooth.append(soften)


def turn(x, y, z, profile, color, sides=48, tilt=0):
    rings = []
    for radius, height in profile:
        ring = []
        for i in range(sides):
            angle = TAU * i / sides
            dy = radius * math.sin(angle)
            ring.append((x + radius * math.cos(angle), y + dy * math.cos(tilt) - height * math.sin(tilt),
                         z + dy * math.sin(tilt) + height * math.cos(tilt)))
        rings.append(ring)
    surface(rings, color, True)


def bao(x, y, z, size, twist):
    rings = []
    for radius, h, pinch in [(0.06, 0, 0), (.82, .04, 0), (1, .37, .018),
                              (.94, .68, .045), (.73, .94, .08), (.43, 1.09, .095),
                              (.20, 1.14, .065), (.07, 1.03, .016), (.001, 1.01, 0)]:
        ring = []
        for i in range(88):
            a = TAU * i / 88
            pleat = math.cos(11 * (a + h * .28 + twist))
            r = size * (radius + pinch * pleat) * (1 + .022 * math.cos(3 * a + twist))
            ring.append((x + r * math.cos(a), y + .97 * r * math.sin(a),
                         z + size * (h + pinch * .37 * pleat)))
        rings.append(ring)
    surface(rings, 0xffe8bc, True)


def basket(x, y, z, r):
    turn(x, y, z, [(r*.95,0),(r,.024),(r,.178),(r*.94,.178),(r*.94,.09),(.001,.09)], 0xb77b40)
    for h in [.018,.052,.146,.178]:
        turn(x, y, z, [(r,h-.008),(r+.009,h),(r,h+.008)], 0xe7b777)
    # Individual cane bindings fasten the rolled lip.
    for i in range(20):
        a = TAU*i/20
        ring = []
        for h, d in [(.135,0),(.174,.025),(.181,.02)]:
            ring.append([(x+(r+.011)*math.cos(a+k+d),y+(r+.011)*math.sin(a+k+d),z+h)
                         for k in [-.012,.012]])
        surface(ring, 0x8b562e)


def filled(x, y, z, r):
    basket(x,y,z,r)
    for i in range(6):
        a = TAU*i/6 + .14
        bao(x+math.cos(a)*r*.60,y+math.sin(a)*r*.60,z+.093,r*.267,i*.73)
    bao(x,y,z+.101,r*.29,.4)


for layer in range(2):
    basket(-.78,.12,.17*layer,.48)
filled(-.78,.12,.34,.48)
filled(.25,-.05,0,.50)
# A domed woven cover rests on the back stack. Crossing strips follow the crown.
for layer in range(3):
    basket(1.14,.20,.17*layer,.375)
turn(1.14,.20,.51,[(.38,0),(.38,.045),(.34,.067),(.22,.112),(.001,.14)],0xc59150)
for cross in [False,True]:
    for line in range(-5,6):
        v=line*.06
        end=math.sqrt(.34**2-v*v)
        strip=[]
        for j in range(17):
            u=end*(j/8-1)
            strip.append([(1.14+(v+d if cross else u),.20+(u if cross else v+d),
                           .663-.64*(u*u+(v+d)**2)+.003*math.cos(j+line))
                          for d in ([-.008,.008] if cross else [.008,-.008])])
        surface(strip,0xe7b775 if cross else 0xac7541)
turn(1.14,.20,.65,[(.05,0),(.055,.025),(.04,.045),(.001,.045)],0x805335)

mesh=bpy.data.meshes.new("Bamboo and pleated dough")
mesh.from_pydata(verts,[],faces)
mesh.update()
obj=bpy.data.objects.new("Morning steamers",mesh)
bpy.context.collection.objects.link(obj)
attr=mesh.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
for poly, color, shaded in zip(mesh.polygons, colors, smooth):
    rgb=tuple(((color>>shift)&255)/255 for shift in [16,8,0])+(1,)
    poly.use_smooth=shaded
    for idx in poly.loop_indices:
        attr.data[idx].color_srgb=rgb
bpy.ops.export_scene.gltf(filepath=str(Path(__file__).with_name('steamers.glb')),
                          export_materials='NONE',export_vertex_color='ACTIVE')
