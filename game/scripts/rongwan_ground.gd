class_name RongwanGround
extends RefCounted

## Walkable elevation & collision bounds for the Rongwan Coastal Corner & Haikaze-so.
## Coordinate convention: Godot Y-up (Blender X, Y, Z -> Godot X, Z, -Y).

const ROAD_Y := -0.04
const SIDEWALK_Y := 0.06
const FLOOR_2F_Y := 3.25

const WORLD_MIN_X := -14.2
const WORLD_MAX_X := 16.8
const WORLD_MIN_Z := -12.6
const WORLD_MAX_Z := 14.8


static func walkable_height(x: float, z: float) -> float:
	var by := -z
	# 14-step exterior steel staircase (bottom pad -> 14 steps -> top 2F landing)
	if x >= 4.18 and x <= 5.66 and by >= -2.78 and by <= 3.88:
		if by <= -1.95:
			return 0.12
		if by >= 2.35:
			return FLOOR_2F_Y
		var t := (by - (-1.95)) / (2.35 - (-1.95))
		return lerpf(0.12, FLOOR_2F_Y, t)

	# 2F open-air L-shaped concrete corridor & front balcony
	if x >= -4.28 and x <= 4.30 and by >= -3.96 and by <= 3.96:
		if x >= 2.48 or by <= -2.14:
			return FLOOR_2F_Y

	# Sculpted corner sidewalk surrounding Haikaze-so
	if x >= -5.35 and x <= 6.50 and by >= -5.25 and by <= 5.45:
		return SIDEWALK_Y

	return ROAD_Y


static func is_on_2f_or_stairs(x: float, z: float) -> bool:
	var by := -z
	if x >= 4.18 and x <= 5.66 and by >= -2.78 and by <= 3.88:
		return true
	if x >= -4.28 and x <= 4.30 and by >= -3.96 and by <= 3.96:
		if x >= 2.48 or by <= -2.14:
			return true
	return false


static func _inside_1f_core(x: float, z: float, pad: float) -> bool:
	# 1F building footprint (L-shaped flush wall + vending/stairs under-space)
	var by := -z
	return x >= -4.45 - pad and x <= 4.35 + pad and by >= -3.85 - pad and by <= 4.05 + pad


static func _inside_2f_core(x: float, z: float, pad: float) -> bool:
	# 2F recessed apartment core (leaves east corridor x>=2.55 & front balcony by<=-2.20 walkable)
	var by := -z
	return x >= -4.35 - pad and x <= 2.52 + pad and by >= -2.16 - pad and by <= 3.95 + pad


static func resolve_walk_pos(prev: Vector3, desired: Vector3) -> Vector3:
	var p := desired
	p.x = clampf(p.x, WORLD_MIN_X, WORLD_MAX_X)
	p.z = clampf(p.z, WORLD_MIN_Z, WORLD_MAX_Z)

	var was_high := prev.y > 1.2
	var next_y := walkable_height(p.x, p.z)

	# Prevent walking straight off the 2F balcony railing (must exit via stairs!)
	if was_high and next_y < 0.25:
		var try_x := Vector3(p.x, prev.y, prev.z)
		var try_z := Vector3(prev.x, prev.y, p.z)
		if walkable_height(try_x.x, try_x.z) > 0.25:
			p.z = prev.z
		elif walkable_height(try_z.x, try_z.z) > 0.25:
			p.x = prev.x
		else:
			p.x = prev.x
			p.z = prev.z
		next_y = walkable_height(p.x, p.z)

	# Prevent stepping up onto 2F straight through the air from ground level (must use bottom stair entry!)
	if prev.y < 0.65 and next_y > 1.2:
		p.x = prev.x
		p.z = prev.z
		next_y = prev.y

	# Wall core collisions
	var blocked := _inside_2f_core(p.x, p.z, 0.28) if next_y > 1.8 else _inside_1f_core(p.x, p.z, 0.30)
	if blocked:
		var slide_x_ok := not (_inside_2f_core(p.x, prev.z, 0.28) if next_y > 1.8 else _inside_1f_core(p.x, prev.z, 0.30))
		var slide_z_ok := not (_inside_2f_core(prev.x, p.z, 0.28) if next_y > 1.8 else _inside_1f_core(prev.x, p.z, 0.30))
		if slide_x_ok:
			p.z = prev.z
		elif slide_z_ok:
			p.x = prev.x
		else:
			p.x = prev.x
			p.z = prev.z
		next_y = walkable_height(p.x, p.z)

	p.y = next_y
	return p


static func resolve_ride_pos(prev: Vector3, desired: Vector3) -> Vector3:
	var p := desired
	p.x = clampf(p.x, WORLD_MIN_X + 0.6, WORLD_MAX_X - 0.6)
	p.z = clampf(p.z, WORLD_MIN_Z + 0.6, WORLD_MAX_Z - 0.6)

	# Keep scooter cleanly outside Haikaze-so building + stairs + tight sidewalk props
	var by := -p.z
	var hits_building := (p.x >= -5.65 and p.x <= 6.75 and by >= -5.50 and by <= 5.65)
	if hits_building:
		var by_prev := -prev.z
		var ok_x := not (p.x >= -5.65 and p.x <= 6.75 and by_prev >= -5.50 and by_prev <= 5.65)
		var ok_z := not (prev.x >= -5.65 and prev.x <= 6.75 and by >= -5.50 and by <= 5.65)
		if ok_x:
			p.z = prev.z
		elif ok_z:
			p.x = prev.x
		else:
			p.x = prev.x
			p.z = prev.z

	p.y = ROAD_Y
	return p
