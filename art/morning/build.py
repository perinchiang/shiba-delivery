"""Run: blender --background --factory-startup --python art/morning/build.py
Optional: -- --output <directory> [--blockout] . Open Rongwan-Courier.blend in Pose Mode.
"""

import argparse
import sys
import tempfile
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
from forms import blender_v
from shiba import create_rig, make_character, author_actions, write_default_coat
from motorcycle import equipment, detail

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, default=HERE)
parser.add_argument("--coat", type=Path, default=HERE / "Shiba_Urajiro.png")
parser.add_argument("--blockout", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 24


def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


character = collection("01 · A-Chai | skinned character")
bike = collection("02 · Postbike | articulated motorcycle")
rig = create_rig(character)
with tempfile.TemporaryDirectory() as staging:
    coat_path = args.coat.resolve()
    if not coat_path.exists():
        if coat_path != HERE / "Shiba_Urajiro.png":
            raise FileNotFoundError(coat_path)
        coat_path = Path(staging) / "Shiba_Urajiro.png"
        write_default_coat(coat_path)
    make_character(character, rig, coat_path)
    if not args.blockout and coat_path != out / "Shiba_Urajiro.png":
        (out / "Shiba_Urajiro.png").write_bytes(coat_path.read_bytes())
anim = author_actions(rig)
assembly = equipment(bike)
if not args.blockout:
    detail(bike, assembly)


def set_action(name):
    action = bpy.data.actions[name]
    anim.action = action
    anim.action_slot = action.slots[0]
    scene.frame_set(1)
    bpy.context.view_layer.update()


def export(col, name, actions):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig if actions else assembly[0]
    bpy.ops.export_scene.gltf(
        filepath=str(out / name),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_skins=True,
        export_extras=True,
        export_animations=actions,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=False,
        export_anim_slide_to_zero=True,
        export_force_sampling=True,
        export_rest_position_armature=True,
        export_frame_range=False,
        export_optimize_animation_size=True,
        export_def_bones=False,
    )


if not args.blockout:
    anim.action = None
    for pb in rig.pose.bones:
        pb.scale = (1, 1, 1)
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    scene.frame_set(1)
    export(character, "shiba-courier.glb", True)
    export(bike, "monkey-delivery.glb", False)
set_action("Ride")
# The shared edit scene opens on the one-up fit, with both assets at their real origins.
views = collection("03 · Fit cameras")


def camera(name, position, target, width):
    d = bpy.data.cameras.new(name)
    o = bpy.data.objects.new(name, d)
    views.objects.link(o)
    o.location = blender_v(position)
    q = (blender_v(target) - o.location).to_track_quat("-Z", "Y")
    o.rotation_euler = q.to_euler()
    d.type = "ORTHO"
    d.ortho_scale = width
    return o


cams = [
    camera("Side", (-4.7, 1.47, -0.05), (0, 1.26, -0.05), 3.35),
    camera("Rear", (0, 1.66, -5), (0, 1.26, -0.05), 3.35),
    camera("Front quarter", (-3.5, 2.11, 3.05), (0, 1.26, -0.02), 3.35),
]
scene.camera = cams[-1]
scene.render.engine = "BLENDER_WORKBENCH" if args.blockout else "CYCLES"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = False
scene.render.resolution_x = 760
scene.render.resolution_y = 680
scene.render.resolution_percentage = 100
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            sp = area.spaces.active
            sp.region_3d.view_rotation = cams[-1].rotation_euler.to_quaternion()
            sp.region_3d.view_distance = 3.85
            sp.region_3d.view_location = blender_v((0, 1.12, -0.05))
            sp.region_3d.view_perspective = "ORTHO"
            sp.shading.color_type = "TEXTURE"
            if not args.blockout:
                sp.shading.type = "MATERIAL"
            sp.overlay.show_extras = False
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
guide = bpy.data.texts.new("Read me · 拆装与调姿")
guide.write(
    "阿柴快送 · 阿柴与单人送餐摩托\n\n"
    "选中 CourierRig，在动作编辑器切换 Stand、Walk 或 Ride。文件打开时是骑姿。\n"
    "肩和肘用 UpperArm、Forearm，髋和膝用 Thigh、Shin；Paw 和 Foot 可单独转动。\n"
    "Tail、TailMid、TailTip 依次控制尾根、中段和尾尖。Stand 的呼吸循环为 72 帧，Walk 与 Ride 各 24 帧。\n"
    "尾骨在后衣摆与裤腰的交界，骑乘时会稍微侧收。冲锋衣立领固定在 Chest，袖口与反光条随手臂骨骼运动。\n"
    "GoggleHinge 是两侧铰轴。Stand 和 Walk 将同一副护目镜抬至额前，Ride 放到双眼前。\n"
    "尾毛贴图已内嵌。头部、耳朵、口鼻、尾巴、头盔和冲锋衣是独立网格。Head_Coat 使用内嵌的 Shiba_Urajiro.png，也可换用同 UV 的毛色图。\n"
    "两个资产共用地面原点和米制单位。Blender 的 Z 轴向上、朝 −Y，GLB 的 Y 轴向上、朝 +Z。\n"
    "查看 Seat_Contact、Grip_L/R、PalmTarget_L/R 和 Footrest_L/R 可核对接触。"
    "箱底和箱盖占用后座空间，Frame、Steering、两只车轮和箱盖可独立选择。\n"
)
scene["fit"] = "Single rider; passenger station converted to a low box platform"
bpy.context.preferences.filepaths.save_version = 0
if args.blockout:
    for cam in cams[:2]:
        scene.camera = cam
        scene.render.filepath = str(out / ("fit-" + cam.name.lower() + ".png"))
        bpy.ops.render.render(write_still=True)
else:
    from pose_controls import install

    controls = collection("04 · Optional IK pins and poles")
    install(rig, controls, assembly[0])
    guide.write(
        "在 CourierRig 自定义属性中逐只调高 IK_Hand 或 IK_Boot，即可移动对应的 Pin 和 Pole 来调手脚，归零后恢复动作。"
        "需要在视图里看到控制器时，打开叠加层中的 Extras。\n"
        "Steering 使用后倾轴，可编辑轴角的 Angle；车轮绕本地 X 轴滚动，箱盖绕 Blender 的 Y 轴开合。\n"
    )
    steering = assembly[2]
    axis = (
        steering.matrix_world.translation - bpy.data.objects["SteerAxisLower"].matrix_world.translation
    ).normalized()
    steering.rotation_mode = "AXIS_ANGLE"
    steering.rotation_axis_angle = (0, *axis)
    stand = bpy.data.objects["Side_Stand"]
    stand_axis = (
        bpy.data.objects["Stand_Axis"].matrix_world.translation - stand.matrix_world.translation
    ).normalized()
    stand.rotation_mode = "AXIS_ANGLE"
    stand.rotation_axis_angle = (stand["stowAngle"], *stand_axis)
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    world = bpy.data.worlds.new("Warm studio")
    scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.67, 0.66, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.70
    for name, pos, energy, size in [("Softbox", (-3, 4.2, 3), 280, 4), ("Rim", (2, 3, -2.6), 160, 3)]:
        light = bpy.data.lights.new(name, "AREA")
        lamp = bpy.data.objects.new(name, light)
        views.objects.link(lamp)
        lamp.location = blender_v(pos)
        lamp.rotation_euler = (blender_v((0, 1, 0)) - lamp.location).to_track_quat("-Z", "Y").to_euler()
        light.energy = energy
        light.shape = "DISK"
        light.size = size
    scene.camera = cams[-1]
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "Rongwan-Courier.blend"), compress=True)
