# art/ 目录工作约定（Blender 与 3D 资产）

本目录存放可编辑 Blender 源文件（`.blend`）、构造脚本、AI 手绘 PBR 贴图与导出的 `.glb` 资产。修改或新增本目录任何资产前，先对照 [`art/CATALOG.md`](CATALOG.md)、[`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/morning/README.md`](morning/README.md)。

## 硬性约束

1. **纯 Blender 精建 + AI 2D PBR 贴图（全面淘汰纯代码假建筑）**：
   - 所有新建与重做的建筑、道具、载具一律使用真实 Blender 建模能力（真实墙厚、Boolean 挖深门窗洞、真实室内纵深、厚实圆润 Bevel、Curve/Lathe/Subsurf 真实结构、规范 UV），配合 `art/shared/textures/` 中的 **AI 手绘 2D PBR 贴图（Color + Normal + Roughness + Emissive）**。
   - **严禁**再写 `BoxBuilder` 式百块方块堆砌建筑脚本，严禁纯顶点色充当建筑表面材质，严禁把程序化 Canvas/简笔画当作核心店招或海报贴图；旧的 `coastal-town-kit.py` 等历史过渡资产已冻结，后续随新套件逐批下线。
2. **先查台账、公模复用与一键变体优先**：
   - 开工前必须先读 [`art/CATALOG.md`](CATALOG.md)，明确声明 **① 直接复用** / **② 公模换色、换贴图或换局部配件** / **③ 确认缺失后新建**。
   - 凡通用街头/室内道具或 NPC 素体，必须独立归口共享目录（`art/shared/props/` 或 `art/shared/characters/`），并在建模时分离「主漆面/瓶身材质槽」与「海报/贴纸 UV 槽」，方便一键换色（如单车、瓶子/饮料筐、花盆）或一键换图（贩卖机、菜单、招牌）。**严禁将通用道具焊死在单栋建筑内**；新增或变更须同步更新 `art/CATALOG.md`。
3. **源文件（`.blend`）与运行版 `.glb` 配套维护**：
   - 每套资产必须保留可直接双击打开编辑的 `.blend` 母版源文件；若由 Blender Python 构造脚本驱动生成，须可无头复现（`blender --background --factory-startup --python-exit-code 2 --python <script>.py`）且输出干净可编辑的 `.blend`。严禁只留孤立二进制 `.glb`。
   - 生产采用**两关制**：**Gate 1** 先在 Blender Cycles 输出日景多角度 + 暖光夜景 5 张审图（`output/blender-qa/<asset>/`），精修过关后进入 **Gate 2** 导出减面合批 + 贴图压缩的**游戏运行版 `.glb`** 接入 Three.js。
4. **坐标、比例与结构细节红线**：
   - Blender 源空间：米制、X 横、Z 上、朝前 `-Y`；导出 glTF 自动转为 Y 上、朝前 `+Z`，原点贴地。
   - 角色与载具统一 `0.84` 街景缩放基线，改动须保活 `Seat_Contact`、`Grip_L/R`、`Footrest_L/R`、`Cargo_Floor`、`soleDepth` 等接触锚点并通过 `npm test`。
   - 结构细节硬检查：单车等机械道具做真传动与轮毂/花鼓（不用白板遮挡）；遮阳棚向外下方倾斜、不做违和圆弧；外挂楼梯要么紧贴墙体收口、要么双侧配齐扶手；主招牌文字清晰且同店名统一；可通行走廊摆件克制留白。
5. **材质、贴图、防 Z-fighting 与资产重量**：
   - 材质围绕 [`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) §3 暖海滨色板拉开哑光灰泥 / 半光烤漆铁件 / 高光釉面瓷砖 / 木纹 / 暖光自发光反差；AI 原图放 `art/shared/textures/ai_*.png`（纯无字），中文/日文排版由后期合成或 3D 立体字制作，禁止 AI 错字与模糊糊字。
   - 严禁共面叠加（背板、牌面、门窗框留明确厚度或法向偏移），导出前检查法线与背面剔除。
   - 游戏运行版严格控制面数、材质槽数与贴图体积（共享贴图 `512`–`1024`，大海报上限 `2048`，支持 Draco / WebP 压缩与 `InstancedMesh` 实例化）。
6. **导出后必验**：
   - **Gate 1（Blender 阶段）**：必须用 `read_file` 亲自检查 `output/blender-qa/<asset>/` 全部日景特写与暖光夜景 Cycles 渲染图。
   - **Gate 2（进游戏阶段）**：必须用 [`capture-scenes.mjs`](../.agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs) 拍下真实游戏近景 + 中景/骑行视角（含夜晚时段）并核对零报错、Draw Calls ≤ 250 与 60 FPS；涉及角色/载具同时跑 `npm test`。
