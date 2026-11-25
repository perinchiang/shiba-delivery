# 阿柴快送 · Shiba Delivery

一款偏严肃、带黑色幽默的第三人称 3D 骑行送单独立游戏：被裁员的程序员柴犬阿柴骑着二手电动车，从滨海坡道旧镇一路送外卖，想重新住回市中心。

**引擎与发行路线：Godot 4.7 Desktop（Forward+ · Steam 优先）。** 采用「Blender 5.2 高精 `.blend` 原生直导 → Godot 4.7 Forward+（Metal / Vulkan）AgX + VoxelGI + SSIL + SSAO + SSR 实时渲染」工作流，彻底告别 WebGL 降级妥协。早期 Three.js 网页原型完整归档于 Git 标签 `archive/threejs-web-final`（更早旧街区原型归档于 `archive/early-prototype`）。

👉 **在线进度与实机截图报告（手机/外网直达）**：https://perinchiang.github.io/shiba-delivery/  
（每次推送到 `shiba-delivery-update` 后由 GitHub Actions 自动生成最新一期图文进度报告并归档历史版本。）

## 当前已实现的内容（Godot 4.7 · 里程碑 G0）

- **原生 Blender `.blend` 标杆建筑「海风庄」与可骑行榕湾街角**：通过 [`tools/sync_blender_to_godot.py`](tools/sync_blender_to_godot.py) 保留全部 **43.6 万面** 柔和倒角几何与 **106 个原始 PBR 材质**，由 Godot 4.7 内置 Blender 导入器直接加载，配合 AgX 色调映射、烘焙 `VoxelGI`、实时 `SSIL / SSAO / SSR` 与零穿墙软阴影实用灯，实机画质与 Blender Cycles 离线渲染图高度一致。
- **4 时段实时光照（清晨 / 中午 / 傍晚 / 夜晚）**：支持实时切换天空渐变、太阳角、13 组夜间自发光材质（拉面店暖光、背光窗帘、门廊灯、灯笼、双色贩卖机）与小摩托夜间头灯。
- **可玩骑行、下车步行爬外楼梯与首版送单闭环**：
  - `W/S` 油门/刹车倒车、`A/D` 转向压弯、鼠标拖动 360° 环视、`R` 回正镜头；
  - 按 `E` 停车下车步行，可沿 14 级贴墙外挂铁楼梯走上 2F 201/202 开放式走廊；
  - 完整送单闭环：在 1F「海风拉面」门口按 `E` 取餐 → 爬上二楼将外卖挂到 201/202 室门口黄铜挂钩完成结算（余额由初始 `¥3000.00` 累计增长）。
- **可折叠开发调试面板（`Tab` / `F12`）**：默认收起保持清爽桌面画面，展开可查看实时 FPS / Draw Calls / 面数，一键切换 4 时段、Cycles 同款 4 组审图机位（`F1–F4`）、瞬移到骑行/拉面店/二楼挂钩，以及开关 GI 与微缩景深。

## 本地运行（macOS / Desktop）

需要本机已安装 **Godot 4.7+** 与 **Blender 5.2+**（用于原生 `.blend` 导入）：

```sh
# 1) 如修改了 art/ 下的 Blender 母版，同步生成 Godot 原生 .blend
blender --background --factory-startup --python-exit-code 2 --python tools/sync_blender_to_godot.py

# 2) 导入资源并烘焙 VoxelGI（首次或改动建筑后执行，约 3 秒）
./game/run.sh --headless --import --quit
./game/run.sh -- --bake-voxelgi

# 3) 启动桌面可玩版本（或在 Godot 4.7 编辑器中打开 game/project.godot）
./game/run.sh

# 4) 自动抓拍全套实机 QA 截图 + 生成本地 HTML 报告预览
./game/run.sh -- --capture-qa "$(pwd)/output/qa/latest"
python3 tools/build_report_site.py --out dist
```

## 文档与资产索引

- [`docs/GAME.md`](docs/GAME.md)：唯一现行产品设计基线。
- [`docs/ROADMAP.md`](docs/ROADMAP.md)：开发阶段顺序、当前进度与过关标准。
- [`docs/ART-BIBLE.md`](docs/ART-BIBLE.md)：纯 Blender + AI PBR 贴图 + Godot 4.7 Forward+ 美术规范。
- [`art/CATALOG.md`](art/CATALOG.md)：全仓库共享公模库、AI 贴图库与标杆建筑实测台账。
- [`game/`](game/)：Godot 4.7 正式桌面工程（场景、脚本与同步后的原生 `.blend` 资产）。
- [`reports/`](reports/)：各里程碑 GitHub Pages HTML 图文进度报告源文件。
- [`AGENTS.md`](AGENTS.md)：AI 开发协作与外网报告交付约定。
