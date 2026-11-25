class_name HudController
extends Node

## Steam-ready Desktop HUD (rider phone card, contextual [E] prompt, toast) +
## collapsible Dev Debug Toolbar (Tab / F12) for 4-TOD, Camera Presets, Teleports & FPS.

signal tod_requested(mode: String)
signal preset_requested(idx: int)
signal teleport_requested(spot: String)
signal toggle_gi_requested()
signal toggle_dof_requested()

var layer: CanvasLayer
var root: Control
var debug_toggle_btn: Button
var debug_panel: PanelContainer
var debug_open := false

var stats_label: Label
var phone_title: Label
var phone_order: Label
var phone_meta: Label
var prompt_panel: PanelContainer
var prompt_label: Label
var toast_panel: PanelContainer
var toast_label: Label

var tod_buttons: Dictionary = {}
var toggle_buttons: Dictionary = {}


func setup(parent: Node) -> void:
	layer = CanvasLayer.new()
	parent.add_child(layer)
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	var dark_box := _make_style(Color(0.08, 0.12, 0.15, 0.84), 12)
	var warm_box := _make_style(Color(0.98, 0.95, 0.86, 0.94), 14)
	var pill_box := _make_style(Color(0.99, 0.96, 0.88, 0.95), 20)

	# 1) Top-left compact Debug Toggle Pill + collapsible Debug Panel (collapsed by default for clean Steam UI!)
	debug_toggle_btn = Button.new()
	debug_toggle_btn.position = Vector2(16, 16)
	debug_toggle_btn.text = "▶ 调试面板 (Tab) · 60 FPS"
	debug_toggle_btn.pressed.connect(toggle_debug)
	root.add_child(debug_toggle_btn)

	debug_panel = PanelContainer.new()
	debug_panel.position = Vector2(16, 54)
	debug_panel.visible = debug_open
	debug_panel.add_theme_stylebox_override("panel", dark_box)
	root.add_child(debug_panel)

	var dv := VBoxContainer.new()
	dv.add_theme_constant_override("separation", 6)
	debug_panel.add_child(dv)

	stats_label = Label.new()
	stats_label.text = "Godot 4.7 Forward+ (Metal) | 60 FPS | AgX · VoxelGI"
	stats_label.add_theme_font_size_override("font_size", 12)
	stats_label.add_theme_color_override("font_color", Color(0.97, 0.95, 0.89))
	dv.add_child(stats_label)

	var row_tod := HBoxContainer.new()
	row_tod.add_theme_constant_override("separation", 5)
	dv.add_child(row_tod)
	for pair in [["morning", "1 清晨"], ["noon", "2 中午"], ["sunset", "3 傍晚"], ["night", "4 夜晚"]]:
		var b := Button.new()
		b.text = pair[1]
		b.pressed.connect(func(): tod_requested.emit(pair[0]))
		row_tod.add_child(b)
		tod_buttons[pair[0]] = b

	var btn_gi := Button.new()
	btn_gi.text = "G GI+SSIL"
	btn_gi.pressed.connect(func(): toggle_gi_requested.emit())
	row_tod.add_child(btn_gi)
	toggle_buttons["gi"] = btn_gi

	var btn_dof := Button.new()
	btn_dof.text = "B 景深"
	btn_dof.pressed.connect(func(): toggle_dof_requested.emit())
	row_tod.add_child(btn_dof)
	toggle_buttons["dof"] = btn_dof

	var row_cam := HBoxContainer.new()
	row_cam.add_theme_constant_override("separation", 5)
	dv.add_child(row_cam)
	var presets := [
		["F1 全景", 0], ["F2 拉面店", 1], ["F3 二楼挂钩", 2], ["F4 楼梯天台", 3]
	]
	for p in presets:
		var pb := Button.new()
		pb.text = p[0]
		var idx: int = p[1]
		pb.pressed.connect(func(): preset_requested.emit(idx))
		row_cam.add_child(pb)

	var row_tp := HBoxContainer.new()
	row_tp.add_theme_constant_override("separation", 5)
	dv.add_child(row_tp)
	for tp in [["ride", "骑行出发"], ["shop", "海风拉面取餐"], ["stairs2f", "二楼 201 挂钩"]]:
		var tb := Button.new()
		tb.text = tp[1]
		var key: String = tp[0]
		tb.pressed.connect(func(): teleport_requested.emit(key))
		row_tp.add_child(tb)

	# 2) Bottom-left Rider Phone Card
	var phone := PanelContainer.new()
	phone.anchor_top = 1.0
	phone.anchor_bottom = 1.0
	phone.offset_left = 18
	phone.offset_top = -114
	phone.offset_right = 338
	phone.offset_bottom = -18
	phone.add_theme_stylebox_override("panel", warm_box)
	root.add_child(phone)

	var pv := VBoxContainer.new()
	pv.add_theme_constant_override("separation", 3)
	phone.add_child(pv)

	phone_title = Label.new()
	phone_title.text = "海风清晨 · 榕湾海风街角"
	phone_title.add_theme_font_size_override("font_size", 14)
	phone_title.add_theme_color_override("font_color", Color(0.14, 0.22, 0.22))
	pv.add_child(phone_title)

	phone_order = Label.new()
	phone_order.text = "待取餐：1F 海风拉面门口"
	phone_order.add_theme_font_size_override("font_size", 12)
	phone_order.add_theme_color_override("font_color", Color(0.76, 0.30, 0.16))
	pv.add_child(phone_order)

	phone_meta = Label.new()
	phone_meta.text = "0 km/h · 自由骑行 · 余额 ¥3000.00"
	phone_meta.add_theme_font_size_override("font_size", 12)
	phone_meta.add_theme_color_override("font_color", Color(0.32, 0.40, 0.40))
	pv.add_child(phone_meta)

	# 3) Bottom-center [E] Context Prompt
	prompt_panel = PanelContainer.new()
	prompt_panel.anchor_left = 0.5
	prompt_panel.anchor_right = 0.5
	prompt_panel.anchor_top = 1.0
	prompt_panel.anchor_bottom = 1.0
	prompt_panel.offset_left = -140
	prompt_panel.offset_right = 140
	prompt_panel.offset_top = -62
	prompt_panel.offset_bottom = -20
	prompt_panel.add_theme_stylebox_override("panel", pill_box)
	root.add_child(prompt_panel)

	prompt_label = Label.new()
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	prompt_label.text = "[E] 停车下车步行"
	prompt_label.add_theme_font_size_override("font_size", 14)
	prompt_label.add_theme_color_override("font_color", Color(0.12, 0.20, 0.20))
	prompt_panel.add_child(prompt_label)

	# 4) Bottom-right Key Guide
	var help_panel := PanelContainer.new()
	help_panel.anchor_left = 1.0
	help_panel.anchor_right = 1.0
	help_panel.anchor_top = 1.0
	help_panel.anchor_bottom = 1.0
	help_panel.offset_left = -355
	help_panel.offset_right = -16
	help_panel.offset_top = -52
	help_panel.offset_bottom = -18
	help_panel.add_theme_stylebox_override("panel", dark_box)
	root.add_child(help_panel)

	var help_lbl := Label.new()
	help_lbl.text = "WASD 骑行/爬楼梯 · E 互动/上下车 · 拖动转视角 · Tab 调试"
	help_lbl.add_theme_font_size_override("font_size", 11)
	help_lbl.add_theme_color_override("font_color", Color(0.88, 0.92, 0.92))
	help_panel.add_child(help_lbl)

	# 5) Top-center Toast Banner
	toast_panel = PanelContainer.new()
	toast_panel.anchor_left = 0.5
	toast_panel.anchor_right = 0.5
	toast_panel.offset_left = -260
	toast_panel.offset_right = 260
	toast_panel.offset_top = 18
	toast_panel.offset_bottom = 58
	toast_panel.add_theme_stylebox_override("panel", dark_box)
	toast_panel.visible = false
	root.add_child(toast_panel)

	toast_label = Label.new()
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	toast_label.add_theme_font_size_override("font_size", 13)
	toast_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.68))
	toast_panel.add_child(toast_label)


func _make_style(col: Color, radius: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.corner_radius_top_left = radius
	sb.corner_radius_top_right = radius
	sb.corner_radius_bottom_left = radius
	sb.corner_radius_bottom_right = radius
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb


func set_hud_visible(vis: bool) -> void:
	if root:
		root.visible = vis


func toggle_debug() -> void:
	debug_open = not debug_open
	if debug_panel:
		debug_panel.visible = debug_open


func update_state(
	fps: int, calls: int, tris_k: float, gi_tag: String,
	tod_key: String, tod_label: String, loc_name: String,
	order_text: String, speed_kmh: int, is_riding: bool,
	wallet: float, completed: int, prompt_text: String, toast: String,
	gi_on: bool, dof_on: bool
) -> void:
	var arrow := "▼" if debug_open else "▶"
	if debug_toggle_btn:
		debug_toggle_btn.text = "%s 调试面板 (Tab) · %d FPS · %d calls" % [arrow, fps, calls]
	stats_label.text = "Godot 4.7 Forward+ (Metal) | %d FPS | %d calls | %.0fk tris | AgX · %s" % [
		fps, calls, tris_k, gi_tag
	]
	phone_title.text = "%s · %s" % [tod_label, loc_name]
	phone_order.text = order_text
	var mode_str := "骑行" if is_riding else "步行"
	phone_meta.text = "%d km/h · %s · 余额 ¥%.2f · 已完成 %d 单" % [speed_kmh, mode_str, wallet, completed]

	prompt_panel.visible = not prompt_text.is_empty()
	prompt_label.text = prompt_text

	toast_panel.visible = not toast.is_empty()
	toast_label.text = toast

	for k in tod_buttons.keys():
		tod_buttons[k].modulate = Color(1.0, 0.90, 0.56) if k == tod_key else Color(0.84, 0.88, 0.90)
	if toggle_buttons.has("gi"):
		toggle_buttons["gi"].modulate = Color(0.66, 0.96, 0.84) if gi_on else Color(0.95, 0.65, 0.65)
	if toggle_buttons.has("dof"):
		toggle_buttons["dof"].modulate = Color(0.66, 0.96, 0.84) if dof_on else Color(0.70, 0.72, 0.74)
