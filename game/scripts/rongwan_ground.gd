class_name RongwanGround
extends RefCounted

## Walkable elevation & strict railing-safe collision bounds for Haikaze-so & Rongwan Corner.
## Coordinate convention: Godot Y-up (Blender X, Y, Z -> Godot X, Z, -Y).
## Every 2F balcony railing and exterior stair handrail is inset by Shiba's body radius (0.36m)
## so the player can NEVER walk or clip through any railing!

const ROAD_Y := -0.04
const SIDEWALK_Y := 0.06
const FLOOR_2F_Y := 3.25

const WORLD_MIN_X := -14.0
const WORLD_MAX_X := 16.5
const WORLD_MIN_Z := -12.2
const WORLD_MAX_Z := 14.2


static func _in_2f_corridor(x: float, z: float) -> bool:
	return x >= 2.86 and x <= 3.82 and z >= -3.46 and z <= 3.46


static func _in_2f_front_balcony(x: float, z: float) -> bool:
	return x >= -3.82 and x <= 3.82 and z >= 2.52 and z <= 3.46


static func _in_stair_top_landing(x: float, z: float) -> bool:
	return x >= 3.78 and x <= 5.18 and z >= -3.46 and z <= -2.38


static func _in_stair_flight(x: float, z: float) -> bool:
	return x >= 4.60 and x <= 5.18 and z >= -2.42 and z <= 2.58


static func _is_valid_upper_pos(x: float, z: float) -> bool:
	return _in_2f_corridor(x, z) or _in_2f_front_balcony(x, z) or _in_stair_top_landing(x, z) or _in_stair_flight(x, z)


static func _stair_height_at_z(z: float) -> float:
	# z = +1.95 (bottom step) -> z = -2.35 (top landing at 3.25m)
	if z >= 1.95:
		return 0.12
	if z <= -2.35:
		return FLOOR_2F_Y
	var t := (1.95 - z) / (1.95 - (-2.35))
	return lerpf(0.12, FLOOR_2F_Y, t)


static func _ground_height(x: float, z: float) -> float:
	var by := -z
	if x >= -5.35 and x <= 6.50 and by >= -5.25 and by <= 5.45:
		return SIDEWALK_Y
	return ROAD_Y


static func _is_blocked_ground(x: float, z: float) -> bool:
	# 1F L-shaped building core + flush stair-backing wall (with 0.34m body clearance)
	if x >= -4.54 and x <= 4.56 and z >= -4.22 and z <= 3.84:
		return true
	# Under-stair steel frame & pink vending area (only allow entering stairs from front z >= 1.85!)
	if x >= 4.20 and x <= 5.78 and z >= -3.98 and z <= 1.85:
		return true
	# 1F white vending machine + A-frame + crates tight footprint
	if x >= 3.55 and x <= 4.62 and z >= 2.25 and z <= 3.95:
		return true
	return false


static func walkable_height(x: float, z: float) -> float:
	if _in_stair_flight(x, z):
		return _stair_height_at_z(z)
	if _in_2f_corridor(x, z) or _in_2f_front_balcony(x, z) or _in_stair_top_landing(x, z):
		return FLOOR_2F_Y
	return _ground_height(x, z)


static func resolve_walk_pos(prev: Vector3, desired: Vector3) -> Vector3:
	var p := desired
	p.x = clampf(p.x, WORLD_MIN_X, WORLD_MAX_X)
	p.z = clampf(p.z, WORLD_MIN_Z, WORLD_MAX_Z)

	var on_upper := prev.y > 0.35

	if on_upper:
		# Allow walking smoothly off the bottom of the staircase onto the 1F sidewalk
		if _in_stair_flight(prev.x, prev.z) and prev.z > 1.70 and p.z > 2.35:
			if not _is_blocked_ground(p.x, p.z):
				p.y = _ground_height(p.x, p.z)
				return p

		# Otherwise strictly stay inside the inset 2F railings & stair handrails!
		# Also prevent crossing the 2F east railing (x=4.18) except through the real top landing (z <= -2.38)!
		var legal := _is_valid_upper_pos(p.x, p.z) and not (
			(prev.x <= 3.84 and p.x > 3.84 and p.z > -2.38) or
			(prev.x >= 4.58 and p.x < 4.58 and p.z > -2.38)
		)
		if not legal:
			var try_x := _is_valid_upper_pos(p.x, prev.z) and not (
				(prev.x <= 3.84 and p.x > 3.84 and prev.z > -2.38) or
				(prev.x >= 4.58 and p.x < 4.58 and prev.z > -2.38)
			)
			var try_z := _is_valid_upper_pos(prev.x, p.z) and not (
				(prev.x <= 3.84 and prev.x > 3.84 and p.z > -2.38) or
				(prev.x >= 4.58 and prev.x < 4.58 and p.z > -2.38)
			)
			if try_x:
				p.z = prev.z
			elif try_z:
				p.x = prev.x
			else:
				p.x = prev.x
				p.z = prev.z

		p.y = _stair_height_at_z(p.z) if _in_stair_flight(p.x, p.z) else FLOOR_2F_Y
		return p

	# Ground-level walking: allow stepping onto bottom of stairs cleanly when entering from front
	if _in_stair_flight(p.x, p.z) and prev.z >= 1.80:
		p.y = _stair_height_at_z(p.z)
		return p

	if _is_blocked_ground(p.x, p.z):
		if not _is_blocked_ground(p.x, prev.z):
			p.z = prev.z
		elif not _is_blocked_ground(prev.x, p.z):
			p.x = prev.x
		else:
			p.x = prev.x
			p.z = prev.z

	p.y = _ground_height(p.x, p.z)
	return p


static func resolve_ride_pos(prev: Vector3, desired: Vector3) -> Vector3:
	var p := desired
	p.x = clampf(p.x, WORLD_MIN_X + 0.6, WORLD_MAX_X - 0.6)
	p.z = clampf(p.z, WORLD_MIN_Z + 0.6, WORLD_MAX_Z - 0.6)

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
