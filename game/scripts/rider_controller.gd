class_name RiderController
extends Node

## Playable Scooter Riding + Dismount Walking (14-step exterior stairs -> 2F corridor) +
## Unified 360° Chase/Orbit Camera for Shiba Delivery (Godot 4.7 Forward+).

const COURIER_SCALE := 0.84
const MAX_RIDE_SPEED := 11.2 # ~40 km/h feel inside compact corner block
const REVERSE_SPEED := 3.2
const WALK_SPEED := 3.6

var scooter: Node3D
var shiba: Node3D
var camera: Camera3D
var scooter_headlight: SpotLight3D
var shiba_anim: AnimationPlayer = null

var is_riding := true
var speed := 0.0 # m/s
var bike_yaw := -2.35
var bike_lean := 0.0
var bike_pos := Vector3(7.4, RongwanGround.ROAD_Y, 7.6)

var shiba_pos := Vector3(5.35, RongwanGround.SIDEWALK_Y, 4.45)
var shiba_yaw := 0.52
var shiba_moving := false
var current_anim := ""

# Camera state (chase + orbit + inspect presets)
var free_inspect := false
var orbit_target := Vector3(0.6, 3.75, 0.0)
var orbit_yaw := 0.73
var orbit_pitch := 0.24
var orbit_dist := 7.2
var user_orbit_timer := 0.0
var is_orbiting := false
var is_panning := false
var dof_enabled := true


func setup(p_scooter: Node3D, p_shiba: Node3D, p_camera: Camera3D) -> void:
	scooter = p_scooter
	shiba = p_shiba
	camera = p_camera

	scooter.scale = Vector3.ONE * COURIER_SCALE
	shiba.scale = Vector3.ONE * COURIER_SCALE

	# Optimize actor sub-meshes for steady 50–60 FPS on Apple M2:
	# Keep dynamic lighting, SSAO, SSIL, and crisp body shadows without per-frame dynamic
	# VoxelGI probe re-voxelization overhead on 84 small skeletal/bolt sub-parts!
	_optimize_actor_meshes(scooter, true)
	_optimize_actor_meshes(shiba, false)

	shiba_anim = _find_animation_player(shiba)
	if shiba_anim:
		for aname in shiba_anim.get_animation_list():
			var anim := shiba_anim.get_animation(aname)
			if anim:
				anim.loop_mode = Animation.LOOP_LINEAR

	# Scooter Headlight (warm forward SpotLight3D, zero shadow pass bloat -> crisp 60 FPS!)
	scooter_headlight = SpotLight3D.new()
	scooter_headlight.name = "ScooterHeadlight"
	scooter_headlight.position = Vector3(0.0, 0.82, 0.64)
	scooter_headlight.rotation_degrees = Vector3(-9.0, 180.0, 0.0)
	scooter_headlight.light_color = Color(1.0, 0.94, 0.78)
	scooter_headlight.light_energy = 5.8
	scooter_headlight.spot_range = 18.0
	scooter_headlight.spot_angle = 40.0
	scooter_headlight.spot_angle_attenuation = 1.45
	scooter_headlight.shadow_enabled = false
	scooter.add_child(scooter_headlight)

	_setup_camera_dof()
	sync_transforms()
	_play_anim("Ride" if is_riding else "Stand")


func _optimize_actor_meshes(root_node: Node, is_bike: bool) -> void:
	var idx := 0
	for mi in _collect_meshes(root_node):
		mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		# Keep shadows on primary body/head/cargo/frame pieces, skip tiny bolts/eyelashes
		var n := mi.name.to_lower()
		var tiny := n.contains("bolt") or n.contains("screw") or n.contains("eye") or n.contains("spoke") or n.contains("cable") or n.contains("lens")
		if tiny:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		else:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		idx += 1
	print("[Rider] Optimized %d meshes on %s" % [idx, "Scooter" if is_bike else "Shiba"])


func _collect_meshes(node: Node) -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	if node is MeshInstance3D:
		out.append(node as MeshInstance3D)
	for ch in node.get_children():
		out.append_array(_collect_meshes(ch))
	return out


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for ch in node.get_children():
		var f := _find_animation_player(ch)
		if f:
			return f
	return null


func _play_anim(anim_name: String) -> void:
	if shiba_anim == null or current_anim == anim_name:
		return
	if shiba_anim.has_animation(anim_name):
		shiba_anim.play(anim_name, 0.16)
		current_anim = anim_name


func _setup_camera_dof() -> void:
	var attr := CameraAttributesPractical.new()
	attr.dof_blur_far_enabled = true
	attr.dof_blur_far_distance = 36.0
	attr.dof_blur_far_transition = 26.0
	attr.dof_blur_near_enabled = false
	attr.dof_blur_amount = 0.035
	camera.attributes = attr


func set_headlight_for_tod(tod: String) -> void:
	if scooter_headlight == null:
		return
	if tod == "night":
		scooter_headlight.visible = true
		scooter_headlight.light_energy = 5.5
	elif tod == "sunset":
		scooter_headlight.visible = true
		scooter_headlight.light_energy = 2.6
	else:
		scooter_headlight.visible = false


func set_dof_enabled(enabled: bool, amount: float = 0.035) -> void:
	dof_enabled = enabled
	var attr := camera.attributes as CameraAttributesPractical
	if not attr:
		return
	var focus := camera.global_position.distance_to(orbit_target)
	attr.dof_blur_far_enabled = enabled
	attr.dof_blur_near_enabled = enabled and free_inspect
	attr.dof_blur_far_distance = focus + 12.0
	attr.dof_blur_far_transition = 22.0
	attr.dof_blur_near_distance = maxf(1.2, focus - 8.0)
	attr.dof_blur_near_transition = 4.0
	attr.dof_blur_amount = amount if enabled else 0.0


func can_mount_scooter() -> bool:
	return (not is_riding) and shiba_pos.distance_to(bike_pos) <= 2.4


func toggle_mount() -> bool:
	if is_riding:
		if absf(speed) > 2.2:
			speed *= 0.3
		is_riding = false
		speed = 0.0
		bike_lean = 0.0
		# Step off to the left of the scooter cleanly
		var side := Vector3(cos(bike_yaw), 0.0, -sin(bike_yaw)) * 0.95
		shiba_pos = RongwanGround.resolve_walk_pos(bike_pos, bike_pos + side)
		shiba_yaw = bike_yaw
		free_inspect = false
		orbit_dist = 5.4
		_play_anim("Stand")
		sync_transforms()
		return true
	elif can_mount_scooter():
		is_riding = true
		speed = 0.0
		free_inspect = false
		orbit_dist = 7.4
		_play_anim("Ride")
		sync_transforms()
		return true
	return false


func teleport_to(pos: Vector3, yaw: float, riding: bool) -> void:
	free_inspect = false
	is_riding = riding
	speed = 0.0
	bike_lean = 0.0
	if riding:
		bike_pos = pos
		bike_yaw = yaw
		shiba_pos = pos
		shiba_yaw = yaw
		orbit_dist = 7.4
		orbit_yaw = yaw + PI
		orbit_pitch = 0.28
		camera.fov = 44.0
		_play_anim("Ride")
	else:
		shiba_pos = pos
		shiba_yaw = yaw
		orbit_dist = 5.2
		orbit_yaw = yaw + PI
		orbit_pitch = 0.24
		camera.fov = 42.0
		_play_anim("Stand")
	sync_transforms()
	_apply_chase_camera(1.0)


func set_inspect_camera(pos: Vector3, target: Vector3, fov_deg: float, blur_amount: float) -> void:
	free_inspect = true
	camera.fov = fov_deg
	orbit_target = target
	var diff := pos - target
	orbit_dist = diff.length()
	orbit_yaw = atan2(diff.x, diff.z)
	orbit_pitch = asin(clampf(diff.y / maxf(0.01, orbit_dist), -0.95, 0.95))
	camera.look_at_from_position(pos, target, Vector3.UP)
	set_dof_enabled(dof_enabled, blur_amount)


func handle_mouse_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			is_orbiting = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_RIGHT:
			is_panning = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			orbit_dist = clampf(orbit_dist * 0.90, 2.4, 42.0)
			_apply_orbit_now()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			orbit_dist = clampf(orbit_dist * 1.11, 2.4, 42.0)
			_apply_orbit_now()

	if event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if is_orbiting:
			orbit_yaw -= mm.relative.x * 0.006
			orbit_pitch = clampf(orbit_pitch + mm.relative.y * 0.006, -0.20, 1.25)
			user_orbit_timer = 1.8
			_apply_orbit_now()
		elif is_panning and free_inspect:
			var right := camera.global_basis.x
			var up := camera.global_basis.y
			var pan_s := orbit_dist * 0.0014
			orbit_target -= right * mm.relative.x * pan_s
			orbit_target += up * mm.relative.y * pan_s
			_apply_orbit_now()


func recenter_camera() -> void:
	free_inspect = false
	user_orbit_timer = 0.0
	orbit_yaw = (bike_yaw if is_riding else shiba_yaw) + PI
	orbit_pitch = 0.26


func step(delta: float) -> void:
	var throttle := 0.0
	var steer := 0.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): throttle += 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): throttle -= 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): steer += 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): steer -= 1.0

	# Pressing movement keys automatically exits static inspect view into playable chase!
	if free_inspect and (absf(throttle) > 0.1 or absf(steer) > 0.1):
		free_inspect = false
		camera.fov = 44.0 if is_riding else 42.0
		orbit_dist = 7.2 if is_riding else 5.2

	if is_riding:
		_step_riding(delta, throttle, steer)
	else:
		_step_walking(delta, throttle, -steer)

	sync_transforms()
	if not free_inspect:
		_apply_chase_camera(delta)


func _step_riding(delta: float, throttle: float, steer: float) -> void:
	if throttle > 0.0:
		var accel := lerpf(9.5, 3.8, clampf(absf(speed) / MAX_RIDE_SPEED, 0.0, 1.0))
		speed = minf(MAX_RIDE_SPEED, speed + accel * throttle * delta)
	elif throttle < 0.0:
		if speed > 0.35:
			speed = maxf(0.0, speed - 15.0 * delta)
		else:
			speed = maxf(-REVERSE_SPEED, speed + 5.5 * throttle * delta)
	else:
		speed = move_toward(speed, 0.0, 5.2 * delta)

	var speed_ratio := clampf(absf(speed) / 4.5, 0.0, 1.0)
	var turn_rate := lerpf(2.35, 1.35, clampf(absf(speed) / MAX_RIDE_SPEED, 0.0, 1.0))
	var dir_sign := 1.0 if speed >= 0.0 else -1.0
	bike_yaw += steer * turn_rate * speed_ratio * dir_sign * delta

	var target_lean := -steer * 0.24 * speed_ratio
	bike_lean = lerpf(bike_lean, target_lean, clampf(delta * 9.0, 0.0, 1.0))

	var fwd := Vector3(sin(bike_yaw), 0.0, cos(bike_yaw))
	var next_pos := bike_pos + fwd * speed * delta
	var resolved := RongwanGround.resolve_ride_pos(bike_pos, next_pos)
	if resolved.distance_to(next_pos) > 0.05:
		speed *= 0.45
	bike_pos = resolved
	shiba_pos = bike_pos
	shiba_yaw = bike_yaw
	_play_anim("Ride")


func _step_walking(delta: float, move_fwd: float, move_right: float) -> void:
	var inp := Vector2(move_right, move_fwd)
	shiba_moving = inp.length() > 0.05
	if shiba_moving:
		inp = inp.normalized()
		var fwd := Vector3(-sin(orbit_yaw), 0.0, -cos(orbit_yaw)).normalized()
		var right := Vector3(cos(orbit_yaw), 0.0, -sin(orbit_yaw)).normalized()
		var dir := (fwd * inp.y + right * inp.x).normalized()
		var next_pos := shiba_pos + dir * WALK_SPEED * delta
		shiba_pos = RongwanGround.resolve_walk_pos(shiba_pos, next_pos)
		shiba_yaw = lerp_angle(shiba_yaw, atan2(dir.x, dir.z), clampf(delta * 11.0, 0.0, 1.0))
		_play_anim("Walk")
	else:
		_play_anim("Stand")


func sync_transforms() -> void:
	scooter.position = bike_pos
	scooter.rotation = Vector3(0.0, bike_yaw, bike_lean)

	if is_riding:
		# Seat Shiba cleanly on the scooter saddle (aligned with monkey-delivery.glb)
		var seat_local := Vector3(0.0, 0.22, -0.06)
		var basis := Basis.from_euler(Vector3(0.0, bike_yaw, bike_lean))
		shiba.position = bike_pos + basis * seat_local
		shiba.rotation = Vector3(0.0, bike_yaw, bike_lean * 0.85)
	else:
		shiba.position = shiba_pos
		shiba.rotation = Vector3(0.0, shiba_yaw, 0.0)


func _apply_chase_camera(delta: float) -> void:
	var anchor := (bike_pos + Vector3(0.0, 1.20, 0.0)) if is_riding else (shiba_pos + Vector3(0.0, 1.02, 0.0))
	orbit_target = orbit_target.lerp(anchor, clampf(delta * 9.0, 0.0, 1.0))

	if user_orbit_timer > 0.0:
		user_orbit_timer = maxf(0.0, user_orbit_timer - delta)
	elif is_riding and absf(speed) > 0.4:
		var behind_yaw := bike_yaw + PI
		orbit_yaw = lerp_angle(orbit_yaw, behind_yaw, clampf(delta * 2.8, 0.0, 1.0))
		orbit_pitch = lerpf(orbit_pitch, 0.26, clampf(delta * 3.0, 0.0, 1.0))

	var speed_fov := (44.0 + 5.0 * clampf(absf(speed) / MAX_RIDE_SPEED, 0.0, 1.0)) if is_riding else 42.0
	camera.fov = lerpf(camera.fov, speed_fov, clampf(delta * 6.0, 0.0, 1.0))
	_apply_orbit_now()


func _apply_orbit_now() -> void:
	var offset := Vector3(
		sin(orbit_yaw) * cos(orbit_pitch),
		sin(orbit_pitch),
		cos(orbit_yaw) * cos(orbit_pitch)
	) * orbit_dist
	camera.look_at_from_position(orbit_target + offset, orbit_target, Vector3.UP)
	set_dof_enabled(dof_enabled, 0.05 if free_inspect else 0.022)


func get_active_pos() -> Vector3:
	return bike_pos if is_riding else shiba_pos


func get_speed_kmh() -> int:
	return int(round(absf(speed) * 3.6))


func get_location_name() -> String:
	var p := get_active_pos()
	if p.y > 2.2:
		return "海风庄 · 二楼走廊 (201/202)"
	if p.y > 0.4:
		return "海风庄 · 外挂铁楼梯"
	if p.x >= -3.5 and p.x <= 2.5 and p.z >= 3.2 and p.z <= 6.2:
		return "海风拉面 · 店门前"
	return "榕湾海风街角"
