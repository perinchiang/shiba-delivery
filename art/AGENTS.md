# art/ 目录工作约定（Blender 与 3D 资产）

本目录存放可编辑 Blender 源文件（`.blend`）、构造脚本、AI 手绘 PBR 贴图与角色/载具导出资产。修改或新增本目录任何资产前，先对照 [`art/CATALOG.md`](CATALOG.md)、[`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/morning/README.md`](morning/README.md)。

## 硬性约束

1. **纯 Blender 精建 + AI 2D PBR 贴图（全面淘汰纯代码假建筑）**：
   - 所有新建与重做的建筑、道具、载具一律使用真实 Blender 建模能力（真实墙厚、Boolean 挖深门窗洞、真实室内纵深、厚实圆润 Bevel、Curve/Lathe/Subsurf 真实结构、规范 UV），配合 `art/shared/textures/` 中的 **AI 手绘 2D PBR 贴图（Color + Normal + Roughness + Emissive）**。
   - **严禁**再写 `BoxBuilder` 式百块方块堆砌建筑脚本，严禁纯顶点色充当建筑表面材质，严禁把程序化 Canvas/简笔画当作核心店招或海报贴图。
2. **先查台账、公模复用与一键变体优先**：
   - 开工前必须先读 [`art/CATALOG.md`](CATALOG.md)，明确声明 **① 直接复用** / **② 公模换色、换贴图或换局部配件** / **③ 确认缺失后新建**。
   - 凡通用街头/室内道具或 NPC 素体，必须独立归口共享目录（`art/shared/props/` 或 `art/shared/characters/`），并在建模时分离「主漆面/瓶身材质槽」与「海报/贴纸 UV 槽」，方便一键换色（单车、瓶子/饮料筐、花盆）或一键换图（贩卖机、菜单、招牌）。**严禁将通用道具焊死在单栋建筑内**；新增或变更须同步更新 `art/CATALOG.md`。
3. **母版 `.blend` 与 Godot 4.7 原生直导流水线（两关制）**：
   - 每套资产必须保留可直接双击打开编辑的 `.blend` 母版源文件；若由 Blender Python 构造脚本驱动生成，须可无头复现（`blender --background --factory-startup --python-exit-code 2 --python <script>.py`）且输出干净可编辑的 `.blend`。
   - **Gate 1（Blender Cycles 审图）**：先在 Blender Cycles 输出日景多角度 + 暖光夜景 5 张审图（`output/blender-qa/<asset>/`），精修过关（90+ 分）再进 Gate 2。
   - **Gate 2（Godot 4.7 原生 `.blend` 直导实机）**：通过 [`tools/sync_blender_to_godot.py`](../tools/sync_blender_to_godot.py) 将 Cycles 专属 `AmbientOcclusion`/`BOX` 节点规范转为标准 UV `Principled BSDF` 并合批静态多材质网格，输出至 `game/assets/` 由 Godot 4.7 原生直导（零暴损减面、零 2K 光图花斑），重烘 `VoxelGI` 后实机抓图核验。
4. **坐标、比例与结构细节红线**：
   - Blender 源空间：米制、X 横、Z 上、朝前 `-Y`；Godot 原生导入自动转为 Y 上、朝前 `+Z`，原点贴地。
   - 角色与载具统一 `0.84` 街景缩放基线，改动须保活 `Seat_Contact`、`Grip_L/R`、`Footrest_L/R`、`Cargo_Floor`、`soleDepth` 等接触锚点。
   - 结构细节硬检查：单车等机械道具做真传动与轮毂/花鼓；遮阳棚向外下方倾斜、不做违和圆弧；外挂楼梯紧贴墙体收口或双侧配齐扶手；主招牌文字清晰且同店名统一；可通行走廊摆件克制留白。
5. **材质、贴图与防坑**：
   - 材质围绕 [`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) §3 暖海滨色板拉开哑光灰泥 / 半光烤漆铁件 / 高光釉面瓷砖 / 木纹 / 暖光自发光反差；AI 原图放 `art/shared/textures/ai_*.png`（纯无字），中文/日文排版由后期合成或 3D 立体字制作。
   - 严禁共面叠加导致 Z-fighting；大面积水平路面/人行道顶面保持平直法线（`f.smooth = False`），避免平滑着色在斜面产生条纹。
6. **导入后必验**：
   - **Gate 1**：用 `read_file` 逐张检查 `output/blender-qa/<asset>/` Cycles 渲染图。
   - **Gate 2**：运行 `./game/run.sh -- --capture-qa output/qa/<slug>`，用 `read_file` 逐张检查 Godot 4.7 Metal 实机图（含白天、傍晚、夜晚与近景），核对 0 报错与稳态帧率，并将对比图收进 `reports/` 发布 GitHub HTML 报告。
