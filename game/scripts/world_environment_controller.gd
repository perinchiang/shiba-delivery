class_name WorldEnvironmentController
extends Node

## Manages 4-Time-of-Day lighting (Morning / Noon / Sunset / Night), native .blend PBR
## refinements, VoxelGI / SDFGI global illumination, AgX tonemapping, and shadow-casting
## practical night lights with zero wall light bleed.

const VOXELGI_CACHE_PATH := "res://assets/gi/haikaze_voxelgi.res"

var world_env: WorldEnvironment
var diorama: Node3D
var voxel_gi: VoxelGI

var sun_light: DirectionalLight3D
var sky_fill_light: DirectionalLight3D
var night_lights: Array[SpotLight3D] = []
var night_light_base_energy: Array[float] = []

var mat_map: Dictionary = {} # base_name -> Array[BaseMaterial3D]
var current_tod := "morning"
var gi_enabled := true


func setup(p_world_env: WorldEnvironment, p_diorama: Node3D, p_voxel_gi: VoxelGI) -> void:
	world_env = p_world_env
	diorama = p_diorama
	voxel_gi = p_voxel_gi
	_setup_materials_and_gi_flags()
	_setup_lights()
	_load_voxelgi_if_present()


func _load_voxelgi_if_present() -> void:
	if ResourceLoader.exists(VOXELGI_CACHE_PATH):
		var cached := load(VOXELGI_CACHE_PATH)
		if cached is VoxelGIData:
			voxel_gi.data = cached
			voxel_gi.data.dynamic_range = 4.0
			voxel_gi.data.energy = 1.05
			voxel_gi.data.bias = 1.4
			voxel_gi.data.normal_bias = 0.85
			voxel_gi.data.propagation = 0.55
			voxel_gi.data.use_two_bounces = true
			world_env.environment.sdfgi_enabled = false
			print("[WorldEnv] Loaded cached VoxelGI: ", VOXELGI_CACHE_PATH)
			return
	# Fallback to zero-bake SDFGI when running from a clean checkout before VoxelGI bake
	world_env.environment.sdfgi_enabled = true
	print("[WorldEnv] No cached VoxelGI found; using SDFGI fallback.")


func bake_voxelgi_now() -> int:
	apply_tod("morning")
	voxel_gi.bake(diorama, false)
	if voxel_gi.data == null:
		push_error("[WorldEnv] VoxelGI bake produced null data!")
		return ERR_CANT_CREATE
	voxel_gi.data.dynamic_range = 4.0
	voxel_gi.data.energy = 1.05
	voxel_gi.data.bias = 1.4
	voxel_gi.data.normal_bias = 0.85
	voxel_gi.data.propagation = 0.55
	voxel_gi.data.use_two_bounces = true
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://assets/gi"))
	var err := ResourceSaver.save(voxel_gi.data, VOXELGI_CACHE_PATH)
	world_env.environment.sdfgi_enabled = false
	print("[WorldEnv] VoxelGI baked & saved to %s (err=%d)" % [VOXELGI_CACHE_PATH, err])
	return err


func _setup_materials_and_gi_flags() -> void:
	mat_map.clear()
	_walk_diorama(diorama)
	print("[WorldEnv] Indexed %d native .blend material groups" % mat_map.size())


func _walk_diorama(node: Node) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var nname := mi.name
		var is_sky_or_sea := nname.begins_with("_Stg_Cloud") or nname.begins_with("_Stg_BackdropFloor") or nname == "Diorama_Backdrop"
		var is_glass := (nname == "Haikaze_Glass")

		var mesh := mi.mesh
		if mesh:
			for si in range(mesh.get_surface_count()):
				var mat := mi.get_active_material(si)
				if mat == null:
					continue
				var dup := mat.duplicate() as BaseMaterial3D
				if dup == null:
					continue
				mi.set_surface_override_material(si, dup)
				var base_name := mat.resource_name.split(".")[0]
				if not mat_map.has(base_name):
					mat_map[base_name] = []
				mat_map[base_name].append(dup)

				if base_name == "Arch_Window_Glass" or base_name == "Prop_Clear_Glass":
					is_glass = true
					dup.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
					dup.albedo_color = Color(0.84, 0.94, 1.0, 0.20)
					dup.roughness = 0.05
					dup.metallic = 0.04
					dup.clearcoat_enabled = true
					dup.clearcoat = 0.85
					dup.clearcoat_roughness = 0.04
					dup.cull_mode = BaseMaterial3D.CULL_DISABLED
				elif base_name == "_Stg_Sea":
					dup.albedo_color = Color(0.24, 0.68, 0.88, 1.0)
					dup.roughness = 0.14
					dup.clearcoat_enabled = true
					dup.clearcoat = 0.72
				elif base_name == "Arch_Plaster_Cream":
					dup.normal_scale = 0.14
					dup.roughness = 0.82
				elif base_name == "Arch_Sage_Concrete":
					dup.normal_scale = 0.18
					dup.roughness = 0.76
				elif base_name == "Arch_Deck_Cream" or base_name == "_Stg_Sidewalk":
					dup.normal_scale = 0.20
					dup.roughness = 0.80
				elif base_name == "Arch_Teal_Steel":
					dup.roughness = 0.30
					dup.metallic = 0.26
					dup.clearcoat_enabled = true
					dup.clearcoat = 0.45
				elif base_name == "Arch_Apt_Door":
					dup.roughness = 0.36
					dup.metallic = 0.14
					dup.clearcoat_enabled = true
					dup.clearcoat = 0.36
				elif base_name == "Arch_Brass" or base_name == "Prop_Brushed_Brass":
					dup.roughness = 0.22
					dup.metallic = 0.88
				elif base_name == "Arch_Mosaic_Tiles":
					dup.roughness = 0.22
					dup.clearcoat_enabled = true
					dup.clearcoat = 0.75
				elif base_name == "Arch_Sign_Ink":
					dup.albedo_color = Color(0.08, 0.10, 0.11, 1.0)
					dup.roughness = 0.26

		if is_glass or is_sky_or_sea:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		else:
			mi.gi_mode = GeometryInstance3D.GI_MODE_STATIC

	for ch in node.get_children():
		_walk_diorama(ch)


func _setup_lights() -> void:
	sun_light = DirectionalLight3D.new()
	sun_light.name = "SunLight"
	sun_light.shadow_enabled = true
	sun_light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun_light.directional_shadow_max_distance = 46.0
	sun_light.directional_shadow_split_1 = 0.28
	sun_light.directional_shadow_blend_splits = true
	sun_light.shadow_bias = 0.016
	sun_light.shadow_normal_bias = 0.9
	sun_light.shadow_blur = 1.6
	sun_light.light_angular_distance = 1.8
	add_child(sun_light)

	sky_fill_light = DirectionalLight3D.new()
	sky_fill_light.name = "SkyFillLight"
	sky_fill_light.shadow_enabled = false
	sky_fill_light.light_color = Color(0.80, 0.91, 1.0)
	sky_fill_light.light_energy = 0.26
	add_child(sky_fill_light)
	sky_fill_light.look_at_from_position(Vector3(-10.5, 7.5, 11.0), Vector3(0.0, 2.5, 0.0), Vector3.UP)

	var spot_defs := [
		["ShopWarmLight",     Vector3(-0.50, 2.38, 4.35), Vector3(-0.50, 0.0, 5.20),  3.6,  8.5, 74.0, Color(1.00, 0.75, 0.42), 0.22, 1.45, true ],
		["ShopInteriorLight", Vector3(-0.55, 2.15, 2.25), Vector3(-0.55, 0.4, 2.80),  2.5,  5.5, 78.0, Color(1.00, 0.72, 0.36), 0.12, 1.45, false],
		["VendWhiteGlow",     Vector3( 4.85, 1.45, 3.35), Vector3( 5.80, 0.0, 3.65),  1.35, 4.6, 72.0, Color(0.85, 0.95, 1.00), 0.12, 1.55, false],
		["VendPinkGlow",      Vector3( 4.85, 1.45, -2.95),Vector3( 5.80, 0.0, -2.95), 1.25, 4.6, 72.0, Color(1.00, 0.84, 0.91), 0.12, 1.55, false],
		["Porch201Glow",      Vector3( 3.12, 5.46, 0.80), Vector3( 3.25, 3.2, 0.80),  1.75, 4.8, 76.0, Color(1.00, 0.78, 0.44), 0.20, 1.55, true ],
		["Porch202Glow",      Vector3( 3.12, 5.46, -1.35),Vector3( 3.25, 3.2, -1.35), 1.75, 4.8, 76.0, Color(1.00, 0.78, 0.44), 0.20, 1.55, true ],
	]
	for sd in spot_defs:
		var spot := SpotLight3D.new()
		spot.name = sd[0]
		spot.light_energy = sd[3]
		spot.spot_range = sd[4]
		spot.spot_angle = sd[5]
		spot.spot_angle_attenuation = 1.45
		spot.spot_attenuation = sd[8]
		spot.light_color = sd[6]
		spot.light_size = 0.0
		spot.light_specular = sd[7]
		spot.shadow_enabled = sd[9]
		spot.shadow_bias = 0.025
		spot.shadow_normal_bias = 0.85
		spot.shadow_blur = 2.4
		spot.light_indirect_energy = 1.35
		add_child(spot)
		spot.look_at_from_position(sd[1], sd[2], Vector3.UP)
		night_lights.append(spot)
		night_light_base_energy.append(sd[3])


func apply_tod(mode: String) -> void:
	current_tod = mode
	var env := world_env.environment
	var sky_mat := env.sky.sky_material as ProceduralSkyMaterial

	if mode == "morning":
		sky_mat.sky_top_color = Color.from_string("#1678E2", Color.BLUE)
		sky_mat.sky_horizon_color = Color.from_string("#A4E0FC", Color.LIGHT_BLUE)
		sky_mat.ground_horizon_color = Color.from_string("#74C7EE", Color.LIGHT_BLUE)
		sky_mat.ground_bottom_color = Color.from_string("#399AD4", Color.BLUE)
		sky_mat.sky_energy_multiplier = 1.05
		env.ambient_light_sky_contribution = 0.85
		env.ambient_light_energy = 0.78
		env.tonemap_exposure = 1.02
		env.glow_intensity = 0.24
		env.glow_bloom = 0.04
		sun_light.look_at_from_position(Vector3(14.0, 15.0, 16.0), Vector3(0.0, 2.5, 0.0), Vector3.UP)
		sun_light.light_color = Color(1.0, 0.94, 0.80)
		sun_light.light_energy = 2.65
		sky_fill_light.light_color = Color(0.80, 0.91, 1.0)
		sky_fill_light.light_energy = 0.28
		for i in range(night_lights.size()):
			night_lights[i].light_energy = 0.55 if i == 1 else 0.0
			night_lights[i].visible = (i == 1)

	elif mode == "noon":
		sky_mat.sky_top_color = Color.from_string("#126CD8", Color.BLUE)
		sky_mat.sky_horizon_color = Color.from_string("#B8EAFF", Color.LIGHT_BLUE)
		sky_mat.ground_horizon_color = Color.from_string("#7CD0F4", Color.LIGHT_BLUE)
		sky_mat.ground_bottom_color = Color.from_string("#3496D2", Color.BLUE)
		sky_mat.sky_energy_multiplier = 1.12
		env.ambient_light_sky_contribution = 0.88
		env.ambient_light_energy = 0.86
		env.tonemap_exposure = 1.00
		env.glow_intensity = 0.18
		env.glow_bloom = 0.03
		sun_light.look_at_from_position(Vector3(7.0, 22.0, 10.0), Vector3(0.0, 2.5, 0.0), Vector3.UP)
		sun_light.light_color = Color(1.0, 0.98, 0.92)
		sun_light.light_energy = 2.95
		sky_fill_light.light_color = Color(0.84, 0.94, 1.0)
		sky_fill_light.light_energy = 0.30
		for i in range(night_lights.size()):
			night_lights[i].light_energy = 0.35 if i == 1 else 0.0
			night_lights[i].visible = (i == 1)

	elif mode == "sunset":
		sky_mat.sky_top_color = Color.from_string("#2E4F86", Color.NAVY_BLUE)
		sky_mat.sky_horizon_color = Color.from_string("#FFAE72", Color.ORANGE)
		sky_mat.ground_horizon_color = Color.from_string("#C97D5E", Color.ORANGE)
		sky_mat.ground_bottom_color = Color.from_string("#243A5C", Color.DARK_BLUE)
		sky_mat.sky_energy_multiplier = 0.82
		env.ambient_light_sky_contribution = 0.78
		env.ambient_light_energy = 0.62
		env.tonemap_exposure = 1.04
		env.glow_intensity = 0.36
		env.glow_bloom = 0.07
		sun_light.look_at_from_position(Vector3(18.0, 7.2, 14.0), Vector3(0.0, 2.5, 0.0), Vector3.UP)
		sun_light.light_color = Color(1.0, 0.74, 0.46)
		sun_light.light_energy = 2.25
		sky_fill_light.light_color = Color(0.62, 0.76, 1.0)
		sky_fill_light.light_energy = 0.20
		for i in range(night_lights.size()):
			night_lights[i].visible = true
			night_lights[i].light_energy = night_light_base_energy[i] * 0.62

	else: # "night"
		sky_mat.sky_top_color = Color.from_string("#060F22", Color.BLACK)
		sky_mat.sky_horizon_color = Color.from_string("#1A3054", Color.DARK_BLUE)
		sky_mat.ground_horizon_color = Color.from_string("#0B1A30", Color.DARK_BLUE)
		sky_mat.ground_bottom_color = Color.from_string("#040B18", Color.BLACK)
		sky_mat.sky_energy_multiplier = 0.32
		env.ambient_light_sky_contribution = 0.72
		env.ambient_light_energy = 0.28
		env.tonemap_exposure = 1.04
		env.glow_intensity = 0.24
		env.glow_bloom = 0.05
		sun_light.look_at_from_position(Vector3(12.0, 15.0, 14.0), Vector3(0.0, 2.5, 0.0), Vector3.UP)
		sun_light.light_color = Color(0.56, 0.74, 1.0)
		sun_light.light_energy = 0.24
		sky_fill_light.light_energy = 0.0
		for i in range(night_lights.size()):
			night_lights[i].visible = true
			night_lights[i].light_energy = night_light_base_energy[i]

	_apply_emissives(mode)
	_tint_sea(mode)


func _apply_emissives(mode: String) -> void:
	var factor := 1.0 if mode == "night" else (0.55 if mode == "sunset" else 0.0)
	var specs := {
		"Arch_Room_Interior":    ["#FFCC78", 0.35, 3.0],
		"Arch_Shop_Interior":    ["#FFC86E", 0.85, 3.5],
		"Arch_Curtain_Cream":    ["#FFD082", 0.00, 1.25],
		"Arch_Curtain_Blue":     ["#FFE0A4", 0.00, 1.10],
		"Arch_Sign_Board_Cream": ["#FFEAC0", 0.06, 0.85],
		"Arch_Porch_Lamp":       ["#FFD282", 1.80, 4.8],
		"Prop_Lantern_Paper":    ["#FFCB74", 1.10, 4.0],
		"Prop_Showcase_Glow":    ["#FFF6DF", 0.70, 1.95],
		"Prop_LED_Cold":         ["#48BCFF", 0.60, 1.6],
		"Prop_LED_Hot":          ["#FF6252", 0.60, 1.6],
		"Prop_LED_Button":       ["#FAF2DC", 0.50, 1.4],
		"Prop_LED_Green":        ["#52F58A", 0.80, 2.2],
		"_Stg_Cloud":            ["#FFFBF2" if (mode == "morning" or mode == "noon") else ("#FFCAA0" if mode == "sunset" else "#223A5E"), 0.32, 0.08],
	}
	for mname in specs.keys():
		if not mat_map.has(mname):
			continue
		var s: Array = specs[mname]
		var col := Color.from_string(s[0], Color.WHITE)
		var energy: float = lerpf(s[1], s[2], factor)
		for mat in mat_map[mname]:
			var bm := mat as BaseMaterial3D
			bm.emission_enabled = (energy > 0.001)
			bm.emission = col
			bm.emission_energy_multiplier = energy


func _tint_sea(mode: String) -> void:
	if not mat_map.has("_Stg_Sea"):
		return
	var c := Color.from_string("#3FB0E4", Color.CYAN) if (mode == "morning" or mode == "noon") else (
		Color.from_string("#3F78A8", Color.BLUE) if mode == "sunset" else Color.from_string("#0C2642", Color.DARK_BLUE)
	)
	for mat in mat_map["_Stg_Sea"]:
		(mat as BaseMaterial3D).albedo_color = c


func set_gi_enabled(enabled: bool) -> void:
	gi_enabled = enabled
	voxel_gi.visible = enabled
	var env := world_env.environment
	env.ssao_enabled = enabled
	env.ssil_enabled = enabled
	env.ssr_enabled = enabled
	if voxel_gi.data == null:
		env.sdfgi_enabled = enabled


func get_tod_label() -> String:
	match current_tod:
		"morning": return "海风清晨"
		"noon": return "海风正午"
		"sunset": return "海风傍晚"
		_: return "海风夜晚"
