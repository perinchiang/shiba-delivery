# art/ 目录工作约定（Blender 与 3D 资产）

本目录存放 Blender 源文件、生成脚本、风格化贴图与导出的 `.glb` 资产。修改或新增本目录任何资产前，先对照 [`art/CATALOG.md`](CATALOG.md)、[`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/morning/README.md`](morning/README.md)。

## 硬性约束

1. **先查台账、公模复用优先**：开工前必须先读 [`art/CATALOG.md`](CATALOG.md)，并在方案中明确声明 **① 直接复用** / **② 公模换贴图或换局部配件** / **③ 确认缺失后新建**；凡通用道具或 NPC 素体，必须独立归口共享目录（`art/shared/props/` 或 `art/shared/characters/`），严禁将通用道具焊死在单栋建筑内；任何新增或结构变更须同步更新 `art/CATALOG.md`。
2. **源文件与 `.glb` 配套维护（不再强迫纯代码建模）**：支持两种合法源文件形态——① **可视化 `.blend` 源文件**（主推，适合主角、公模道具、英雄建筑、展 UV 与贴图烘焙）并规范导出 `.glb`，② **Blender Python 脚本**（适合规则批量模块或参数化套件，须可无头复现 `blender --background --factory-startup --python-exit-code 2 --python <script>.py`）；严禁只留孤立二进制 `.glb` 而丢失源文件。
3. **坐标与比例红线**：
   - Blender 源空间：米制、X 横、Z 上、车头朝 `-Y`；导出 glTF 自动转为 Y 上、车头朝 `+Z`。
   - 角色与摩托车统一 `0.84` 街景缩放基线；角色躯干与手臂采用单张连续四边面细分网格（一体无缝圆肩），不得破坏 `Seat_Contact`、`Grip_L/R`、`Footrest_L/R`、`Cargo_Floor`、`soleDepth` 等接触锚点。
4. **材质、贴图与防 Z-fighting**：
   - 鼓励使用共享风格化 2D PBR 贴图 / 图集（`art/shared/textures/`，含 Color / Roughness / Normal / Emissive）与 `CITY_PALETTE`（[`src/morning/city-palette.js`](../src/morning/city-palette.js)）协调的有限材质槽（例如哑光墙面 / 半光烤漆金属 / 釉面贴图 / 玻璃），兼容既有顶点色 AO 资产；避免为一小组道具拆出十几个冗余材质导致 Draw Calls 暴涨。
   - 严禁共面叠加（背板、牌面、地面标线、门窗框等必须留清晰厚度或法向偏移），导出前检查法线朝向与背面剔除效果。
5. **控制资产重量**：避免无意义高细分与单件独占超大贴图（共享图集遵循 2 的幂次，按需 `512`–`2048`）；重复街景套件（路灯、红绿灯、护柱、树、公模道具等）按可被 Three.js 实例化（`InstancedMesh`）的干净原点与分组导出。
6. **导出后必验**：
   - 涉及角色/摩托车/骑姿改动：必须通过 `npm test`（含 [`tools/test-morning-riding.mjs`](../tools/test-morning-riding.mjs) 接触与袖型/配饰断言）。
   - 任何可见资产改动：必须使用 [`capture-scenes.mjs`](../.agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs) 在真实游戏中拍下**近景 + 中景/骑行视角**截图并实际看图验收，确认无穿模、浮空、比例失调或 Z-fighting。
