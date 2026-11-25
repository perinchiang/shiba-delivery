# Blender 5.2 + AI PBR + Three.js 实战防坑手册

本清单总结自《阿柴快送》海风庄与首批 10 件共享公模的实测踩坑经验，新建任何建筑、道具或载具前必读：

## 1. Blender 5.2 Headless Cycles 渲染防崩溃
- macOS headless 下启用 Metal Cycles 容易触发二进制缓存崩溃；统一配置 **`scene.cycles.device = "CPU"` + `OPENIMAGEDENOISE` + `RGB_ALBEDO_NORMAL` + `AgX - Punchy`**，并将材质里的 `AmbientOcclusion` 节点采样压至 `2`（单张 1280×800 约 30–50 秒出片）。
- 批量多机位渲染时采用**单进程单图**（如 `for s in 01 02 ...; do blender ... render_qa_shots.py -- $s; done`），彻底杜绝内存叠加。

## 2. 常见几何与法线坑
- **Boolean 墙面斜向阴影拉黑**：Boolean 挖洞后直接全物体 `use_smooth = True` 会在大平面产生三角折痕黑条。修法：对 Boolean 墙体执行 `f.smooth = (f.calc_area() < 0.35)`，大平面保持锐平、倒角圆边保持平滑。
- **3D 立体字面发暗/糊边**：`FONT` 转 `MESH` 后切勿全平滑，按 `f.smooth = (abs(f.normal.z) < 0.85)` 保持正面平直锐利、侧面倒角柔润；中文字体优先 `/System/Library/Fonts/STHeiti Medium.ttc` 或 `Hiragino Sans GB.ttc`。
- **遮阳棚绕 X 轴旋转方向**：Blender 右手系下，面向 `-Y` 伸出的遮阳棚必须传 **`rot_x > 0`（如 `+0.46 rad`）** 才向外下方倾斜；负角度会往天上翘！
- **机械与建筑合理性**：
  - 单车/载具不得用实心白板遮挡传动；必须做出牙盘、链条、曲柄脚踏、双法兰花鼓与箱型车圈；
  - 外挂楼梯优先通过 L 型 1F 墙体紧贴墙面收口（零缝隙），若留缝则两侧必须配齐扶手；
  - 走廊与门口绿植/杂物克制留白（1–2 盆点缀），不阻挡视线与步行通道。

## 3. Gate 1 → Gate 2 进 Three.js 的最大隐形坑（必看！）
- **glTF 2.0 不会导出 Blender 程序节点**：`ShaderNodeTexCoord.Object`、`BOX` 贴图投射、`HueSaturation`、`ShaderNodeAmbientOcclusion` 在 glTF 导出时会直接丢失，进 Three.js 变成纯灰！
- **Gate 2 导出器硬步骤**：
  1. 对使用 BOX 投射 AI 贴图的网格，按世界法线主轴写入真实立方体 UV（`UVMap`）；
  2. 将 AgX 暖色标定（`sat_mult`/`val_mult`）预烘焙到压缩游戏贴图（`512`–`768` WebP/PNG），再按标准 glTF 拓扑直连 `Image Texture → Principled BSDF (Base Color / Normal Map / Roughness / Emission)`；
  3. 固色 `make_diorama_mat` 材质断开 `AmbientOcclusion` 节点，将校准基色直连 `Base Color`；
  4. 按材质合批静态网格、合理减面至单栋 ~5–9 万面，导出时**关闭 Draco**（配合 WebP 贴图，单栋仅 ~2–4 MB，100% 兼容离线 `dist/index.html` 单文件构建与 GitHub Pages）。
- **Three.js 夜景质感还原**：
  - 挂载 `PMREMGenerator` + `RoomEnvironment`（或轻天空环境贴图）让釉面瓷砖、烤漆铁件、黄铜挂钩与玻璃窗真实反光；
  - 夜晚按材质名动态拉高室内墙、窗帘、店面、门廊灯、提灯、贩卖机展示窗与招牌底板的 `emissiveIntensity`，并在拉面店门口、贩卖机前和 2F 走廊布 3–4 盏轻量 `PointLight`（不投阴影，零卡顿）营造“有人居住”的暖光外溢。
