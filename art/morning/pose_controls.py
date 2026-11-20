"""Optional artist IK in the .blend. The exported rig remains portable FK + game IK."""

import math
import bpy
from forms import V, blender_v, empty


def install(rig, collection, bike):
    bpy.context.view_layer.update()

    def world_pt(bone):
        return rig.matrix_world @ rig.pose.bones[bone].head

    def control(name, location, kind, parent=None):
        v = location
        o = empty(name, collection, (v.x, v.z, -v.y), parent, 0.05)
        o.empty_display_type = kind
        o.show_in_front = True
        return o

    for tag in ["L", "R"]:
        for kind, upper, lower, end, anchor in [
            ("Hand", "UpperArm_", "Forearm_", "Paw_", "PalmTarget_"),
            ("Boot", "Thigh_", "Shin_", "Foot_", "Footrest_"),
        ]:
            upper += tag
            lower += tag
            end += tag
            a, b, c = [world_pt(name) for name in (upper, lower, end)]
            marker = bpy.data.objects[anchor + tag]
            pin = control("Pin_" + kind + "_" + tag, c, "SPHERE", marker)
            direction = (c - a).normalized()
            bend = (b - a) - direction * (b - a).dot(direction)
            pole = control("Pole_" + kind + "_" + tag, b + bend.normalized() * 0.30, "CIRCLE", bike)
            pole.empty_display_size = 0.032
            prop = "IK_" + kind + "_" + tag
            rig[prop] = 0.0
            rig.id_properties_ui(prop).update(
                min=0, max=1, description="0: authored FK clip. 1: follow the Pin and Pole controls."
            )
            for bone in [upper, lower]:
                rig.pose.bones[bone].ik_stretch = 0
            con = rig.pose.bones[lower].constraints.new("IK")
            con.name = "Contact · " + kind
            con.target = pin
            con.pole_target = pole
            con.chain_count = 2
            con.use_stretch = False

            # Match the displayed FK bend plane when switching on the contact pin.
            def error(angle):
                con.pole_angle = angle
                bpy.context.view_layer.update()
                return (world_pt(lower) - b).length_squared

            best = min((i * math.pi / 8 for i in range(-8, 9)), key=error)
            for step in [math.pi / 32, math.pi / 128, math.pi / 512]:
                best = min((best + i * step for i in range(-3, 4)), key=error)
            con.pole_angle = best
            con.influence = 0
            driver = con.driver_add("influence").driver
            driver.type = "AVERAGE"
            var = driver.variables.new()
            var.name = "weight"
            var.type = "SINGLE_PROP"
            var.targets[0].id = rig
            var.targets[0].data_path = '["' + prop + '"]'
            bpy.context.view_layer.update()
