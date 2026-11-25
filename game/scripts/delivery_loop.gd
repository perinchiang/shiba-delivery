class_name DeliveryLoop
extends Node

## Minimal End-to-End First Playable Delivery Loop in Godot 4.7:
## Pickup hot ramen at 1F「海风拉面」-> climb exterior steel stairs -> hang on 2F 201/202 brass hook!

const ORDERS := [
	{
		"id": "ramen_201",
		"title": "海风拉面 → 201 室门口黄铜挂钩",
		"pickup_name": "1F 海风拉面门口",
		"pickup_pos": Vector3(-0.50, 0.08, 4.45),
		"drop_name": "2F 201 室门口黄铜挂钩（请爬东侧外楼梯）",
		"drop_pos": Vector3(3.25, 3.27, 0.90),
		"pay": 12.50,
		"note": "放门口黄铜挂钩上就行，别敲门，猫胆小。",
	},
	{
		"id": "ramen_202",
		"title": "海风拉面 → 202 室门口挂钩",
		"pickup_name": "1F 海风拉面门口",
		"pickup_pos": Vector3(-0.50, 0.08, 4.45),
		"drop_name": "2F 202 室门口黄铜挂钩",
		"drop_pos": Vector3(3.25, 3.27, -1.20),
		"pay": 14.00,
		"note": "加面加蛋，挂在 202 门旁挂钩。",
	},
	{
		"id": "ramen_corner",
		"title": "海风拉面 → 海滨街角观海护栏",
		"pickup_name": "1F 海风拉面门口",
		"pickup_pos": Vector3(-0.50, 0.08, 4.45),
		"drop_name": "海滨观海护栏旁（可骑车前往）",
		"drop_pos": Vector3(7.40, -0.02, 13.40),
		"pay": 11.00,
		"note": "在海边吹风等面，汤别洒了！",
	},
]

var wallet := 3000.00
var completed_count := 0
var order_idx := 0
var phase := "pickup" # "pickup" | "deliver"
var toast_text := ""
var toast_timer := 0.0

var beacon_mesh: MeshInstance3D
var beacon_visible := true


func setup(parent: Node3D) -> void:
	beacon_mesh = MeshInstance3D.new()
	beacon_mesh.name = "OrderBeacon"
	var torus := TorusMesh.new()
	torus.inner_radius = 0.44
	torus.outer_radius = 0.54
	torus.rings = 32
	torus.ring_segments = 12
	beacon_mesh.mesh = torus
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.85, 0.35, 0.90)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.82, 0.34)
	mat.emission_energy_multiplier = 2.2
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	beacon_mesh.material_override = mat
	beacon_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beacon_mesh.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	parent.add_child(beacon_mesh)
	_sync_beacon()


func current_order() -> Dictionary:
	return ORDERS[order_idx % ORDERS.size()]


func current_target_pos() -> Vector3:
	var o := current_order()
	return o["pickup_pos"] if phase == "pickup" else o["drop_pos"]


func set_beacon_visible(vis: bool) -> void:
	beacon_visible = vis
	if beacon_mesh:
		beacon_mesh.visible = vis


func _sync_beacon() -> void:
	if beacon_mesh == null:
		return
	beacon_mesh.position = current_target_pos() + Vector3(0.0, 0.05, 0.0)
	beacon_mesh.visible = beacon_visible


func step(delta: float) -> void:
	if toast_timer > 0.0:
		toast_timer = maxf(0.0, toast_timer - delta)
		if toast_timer <= 0.0:
			toast_text = ""
	if beacon_mesh and beacon_mesh.visible:
		var pulse := 1.0 + 0.08 * sin(Time.get_ticks_msec() * 0.005)
		beacon_mesh.scale = Vector3(pulse, 1.0, pulse)


func get_context_prompt(player_pos: Vector3, is_riding: bool, can_mount: bool) -> String:
	var dist := player_pos.distance_to(current_target_pos())
	if dist <= 2.3:
		if phase == "pickup":
			return "[E] 在海风拉面取餐"
		else:
			return "[E] 挂到指定点完成送达 (+¥%.2f)" % current_order()["pay"]
	if is_riding:
		return "[E] 停车下车步行"
	if can_mount:
		return "[E] 骑上小摩托"
	return ""


func try_interact(player_pos: Vector3) -> bool:
	var dist := player_pos.distance_to(current_target_pos())
	if dist > 2.3:
		return false
	var o := current_order()
	if phase == "pickup":
		phase = "deliver"
		toast_text = "已取餐！%s —「%s」" % [o["drop_name"], o["note"]]
		toast_timer = 4.5
	else:
		wallet += o["pay"]
		completed_count += 1
		toast_text = "送达完成！收入 +¥%.2f（余额 ¥%.2f）" % [o["pay"], wallet]
		toast_timer = 4.5
		order_idx = (order_idx + 1) % ORDERS.size()
		phase = "pickup"
	_sync_beacon()
	return true


func get_objective_summary() -> String:
	var o := current_order()
	if phase == "pickup":
		return "待取餐：%s" % o["pickup_name"]
	return "配送中：%s" % o["drop_name"]
