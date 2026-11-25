extends Node3D

## 阿柴快送 · Shiba Delivery — Main Orchestrator (Godot 4.7 Forward+ Desktop)
## Supports playable Steam-first gameplay + `--bake-voxelgi` + `--capture-qa <out_dir>`.

@onready var world_env_node: WorldEnvironment = $WorldEnvironment
@onready var diorama: Node3D = $HaikazeHero
@onready var voxel_gi: VoxelGI = $VoxelGI
@onready var actor_group: Node3D = $ActorGroup
@onready var scooter: Node3D = $ActorGroup/Scooter
@onready var shiba: Node3D = $ActorGroup/Shiba
@onready var camera: Camera3D = $Camera3D

var env_ctrl: WorldEnvironmentController
var rider_ctrl: RiderController
var delivery: DeliveryLoop
var hud: HudController

var smoothed_fps := 60.0
var qa_active := false

const INSPECT_PRESETS := [
	{"pos": Vector3(14.8, 7.6, 16.5),  "target": Vector3(0.6, 3.75, 0.0),   "fov": 33.0, "blur": 0.055},
	{"pos": Vector3(-0.5, 2.05, 10.8), "target": Vector3(-0.7, 1.60, 3.5),  "fov": 33.0, "blur": 0.035},
	{"pos": Vector3(7.4, 5.10, 4.6),   "target": Vector3(2.4, 4.45, -0.25), "fov": 26.4, "blur": 0.030},
	{"pos": Vector3(12.2, 10.6, -9.2), "target": Vector3(0.6, 4.80, -0.4),  "fov": 33.0, "blur": 0.035},
]


func _ready() -> void:
	env_ctrl = WorldEnvironmentController.new()
	add_child(env_ctrl)
	env_ctrl.setup(world_env_node, diorama, voxel_gi)

	rider_ctrl = RiderController.new()
	add_child(rider_ctrl)
	rider_ctrl.setup(scooter, shiba, camera)

	delivery = DeliveryLoop.new()
	add_child(delivery)
	delivery.setup(self)

	hud = HudController.new()
	add_child(hud)
	hud.setup(self)
	hud.tod_requested.connect(_on_tod_requested)
	hud.preset_requested.connect(_on_preset_requested)
	hud.teleport_requested.connect(_on_teleport_requested)
	hud.toggle_gi_requested.connect(func(): env_ctrl.set_gi_enabled(not env_ctrl.gi_enabled))
	hud.toggle_dof_requested.connect(func(): rider_ctrl.set_dof_enabled(not rider_ctrl.dof_enabled))

	var args := OS.get_cmdline_user_args()
	if args.has("--bake-voxelgi"):
		qa_active = true
		call_deferred("_run_bake_voxelgi")
		return

	var qa_idx := args.find("--capture-qa")
	if qa_idx >= 0 and qa_idx + 1 < args.size():
		qa_active = true
		call_deferred("_run_capture_qa", args[qa_idx + 1])
		return

	# Default playable start: Morning coastal corner, riding Shiba ready outside Haikaze-so!
	_on_tod_requested("morning")
	_on_teleport_requested("ride")


func _on_tod_requested(mode: String) -> void:
	env_ctrl.apply_tod(mode)
	rider_ctrl.set_headlight_for_tod(mode)


func _on_preset_requested(idx: int) -> void:
	var p: Dictionary = INSPECT_PRESETS[clampi(idx, 0, INSPECT_PRESETS.size() - 1)]
	rider_ctrl.set_inspect_camera(p["pos"], p["target"], p["fov"], p["blur"])


func _on_teleport_requested(spot: String) -> void:
	if spot == "ride":
		rider_ctrl.teleport_to(Vector3(7.6, RongwanGround.ROAD_Y, 8.8), -2.45, true)
	elif spot == "shop":
		rider_ctrl.bike_pos = Vector3(4.6, RongwanGround.ROAD_Y, 7.6)
		rider_ctrl.bike_yaw = -2.2
		rider_ctrl.teleport_to(Vector3(-0.35, RongwanGround.SIDEWALK_Y, 4.70), PI, false)
	elif spot == "stairs2f":
		rider_ctrl.bike_pos = Vector3(6.8, RongwanGround.ROAD_Y, 5.2)
		rider_ctrl.bike_yaw = -2.2
		rider_ctrl.teleport_to(Vector3(3.25, RongwanGround.FLOOR_2F_Y, -0.15), 1.05, false)


func _unhandled_input(event: InputEvent) -> void:
	if qa_active:
		return
	rider_ctrl.handle_mouse_input(event)
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_1: _on_tod_requested("morning")
			KEY_2: _on_tod_requested("noon")
			KEY_3: _on_tod_requested("sunset")
			KEY_4: _on_tod_requested("night")
			KEY_F1: _on_preset_requested(0)
			KEY_F2: _on_preset_requested(1)
			KEY_F3: _on_preset_requested(2)
			KEY_F4: _on_preset_requested(3)
			KEY_E:
				if not delivery.try_interact(rider_ctrl.get_active_pos()):
					rider_ctrl.toggle_mount()
			KEY_R:
				rider_ctrl.recenter_camera()
			KEY_G:
				env_ctrl.set_gi_enabled(not env_ctrl.gi_enabled)
			KEY_B:
				rider_ctrl.set_dof_enabled(not rider_ctrl.dof_enabled)
			KEY_TAB, KEY_F12:
				hud.toggle_debug()
			KEY_H:
				hud.set_hud_visible(not hud.root.visible)
			KEY_ESCAPE:
				get_tree().quit()


func _process(delta: float) -> void:
	if delta > 0.0001:
		smoothed_fps = lerpf(smoothed_fps, clampf(1.0 / delta, 1.0, 120.0), 0.15)
	if not qa_active:
		rider_ctrl.step(delta)
		delivery.step(delta)
	_refresh_hud()


func _refresh_hud() -> void:
	var calls := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var gi_tag := "VoxelGI+SSIL+SSAO+SSR" if (env_ctrl.gi_enabled and voxel_gi.data != null) else ("SDFGI" if env_ctrl.gi_enabled else "GI OFF")
	var prompt := delivery.get_context_prompt(rider_ctrl.get_active_pos(), rider_ctrl.is_riding, rider_ctrl.can_mount_scooter())
	hud.update_state(
		int(round(smoothed_fps)), calls, prims / 1000.0, gi_tag,
		env_ctrl.current_tod, env_ctrl.get_tod_label(), rider_ctrl.get_location_name(),
		delivery.get_objective_summary(), rider_ctrl.get_speed_kmh(), rider_ctrl.is_riding,
		delivery.wallet, delivery.completed_count, prompt, delivery.toast_text,
		env_ctrl.gi_enabled, rider_ctrl.dof_enabled
	)


func _run_bake_voxelgi() -> void:
	actor_group.visible = false
	delivery.set_beacon_visible(false)
	hud.set_hud_visible(false)
	await get_tree().process_frame
	await get_tree().process_frame
	env_ctrl.bake_voxelgi_now()
	await get_tree().process_frame
	get_tree().quit(0)


func _run_capture_qa(out_dir: String) -> void:
	DirAccess.make_dir_recursive_absolute(out_dir)

	var shots := [
		# Pure Cycles benchmark angles (actors & HUD hidden)
		{"file": "01-day-hero.png",          "tod": "morning", "mode": "preset", "preset": 0, "actors": false, "hud": false, "beacon": false},
		{"file": "02-day-shopfront.png",     "tod": "morning", "mode": "preset", "preset": 1, "actors": false, "hud": false, "beacon": false},
		{"file": "03-day-corridor.png",      "tod": "morning", "mode": "preset", "preset": 2, "actors": false, "hud": false, "beacon": false},
		{"file": "04-night-hero.png",        "tod": "night",   "mode": "preset", "preset": 0, "actors": false, "hud": false, "beacon": false},
		# Playable Godot Steam-first gameplay angles (Shiba + Scooter + HUD + Delivery Loop!)
		{"file": "05-play-ride-day.png",     "tod": "morning", "mode": "ride",   "actors": true,  "hud": true,  "beacon": true },
		{"file": "06-play-ride-night.png",   "tod": "night",   "mode": "ride",   "actors": true,  "hud": true,  "beacon": true },
		{"file": "07-play-shop-pickup.png",  "tod": "sunset",  "mode": "shop",   "actors": true,  "hud": true,  "beacon": true },
		{"file": "08-play-2f-deliver.png",   "tod": "night",   "mode": "2f",     "actors": true,  "hud": true,  "beacon": true },
	]

	var results := []
	for s in shots:
		actor_group.visible = s["actors"]
		hud.set_hud_visible(s["hud"])
		delivery.set_beacon_visible(s["beacon"])
		_on_tod_requested(s["tod"])

		match s["mode"]:
			"preset":
				_on_preset_requested(s["preset"])
			"ride":
				delivery.phase = "pickup"
				delivery._sync_beacon()
				rider_ctrl.teleport_to(Vector3(7.8, RongwanGround.ROAD_Y, 8.9), -2.42, true)
				rider_ctrl.orbit_yaw = 0.68
				rider_ctrl.orbit_pitch = 0.27
				rider_ctrl.orbit_dist = 8.4
				rider_ctrl._apply_chase_camera(1.0)
			"shop":
				delivery.phase = "pickup"
				delivery._sync_beacon()
				rider_ctrl.bike_pos = Vector3(5.6, RongwanGround.ROAD_Y, 7.6)
				rider_ctrl.bike_yaw = -2.35
				rider_ctrl.teleport_to(Vector3(-0.35, RongwanGround.SIDEWALK_Y, 4.75), PI, false)
				rider_ctrl.orbit_yaw = 0.08
				rider_ctrl.orbit_pitch = 0.16
				rider_ctrl.orbit_dist = 5.0
				rider_ctrl._apply_chase_camera(1.0)
			"2f":
				delivery.phase = "deliver"
				delivery._sync_beacon()
				rider_ctrl.bike_pos = Vector3(6.8, RongwanGround.ROAD_Y, 5.2)
				rider_ctrl.bike_yaw = -2.2
				rider_ctrl.teleport_to(Vector3(3.22, RongwanGround.FLOOR_2F_Y, -0.22), 1.05, false)
				rider_ctrl.set_inspect_camera(Vector3(7.4, 5.10, 4.6), Vector3(2.4, 4.45, -0.25), 26.4, 0.025)

		for _w in range(12):
			await get_tree().process_frame
		var t0 := Time.get_ticks_usec()
		const MF := 24
		for _m in range(MF):
			await get_tree().process_frame
		var elapsed := maxf(0.001, (Time.get_ticks_usec() - t0) / 1_000_000.0)
		var steady_fps := int(round(MF / elapsed))
		smoothed_fps = float(steady_fps)
		_refresh_hud()
		await get_tree().process_frame

		var calls := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)

		var img := get_viewport().get_texture().get_image()
		img.save_png(out_dir.path_join(s["file"]))
		print("[QA] %s -> %dx%d | %d FPS | %d calls | %.0fk tris" % [
			s["file"], img.get_width(), img.get_height(), steady_fps, calls, prims / 1000.0
		])
		results.append({
			"file": s["file"], "tod": s["tod"], "fps": steady_fps,
			"draw_calls": calls, "primitives": prims,
			"width": img.get_width(), "height": img.get_height(),
			"voxel_gi": voxel_gi.data != null,
		})

	var mf := FileAccess.open(out_dir.path_join("metrics.json"), FileAccess.WRITE)
	if mf:
		mf.store_string(JSON.stringify(results, "  "))
		mf.close()
	print("[QA] Completed %d Godot 4.7 Forward+ Metal captures." % results.size())
	get_tree().quit(0)
