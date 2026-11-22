# art/ 目录工作约定（Blender 与 3D 资产）

本目录存放 Blender 源文件、Python 生成脚本、贴图与导出的 `.glb` 资产。修改本目录任何文件前，先对照 [`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/morning/README.md`](morning/README.md)。

## 硬性约束

1. **脚本可复现优先**：优先通过 Blender Python 脚本（无头执行 `blender --background --factory-startup --python-exit-code 2 --python <script>.py`）生成与导出 `.glb`，不要只手改二进制 `.glb` 导致源脚本脱节。
2. **坐标与比例红线**：
   - Blender 源空间：米制、X 横、Z 上、车头朝 `-Y`；导出 glTF 自动转为 Y 上、车头朝 `+Z`。
   - 角色与摩托车统一 `0.84` 街景缩放基线；角色躯干与手臂采用单张连续四边面细分网格（一体无缝圆肩），不得破坏 `Seat_Contact`、`Grip_L/R`、`Footrest_L/R`、`Cargo_Floor`、`soleDepth` 等接触锚点。
3. **材质与防 Z-fighting**：
   - 优先使用顶点色与 `CITY_PALETTE`（[`src/morning/city-palette.js`](../src/morning/city-palette.js)）协调的有限材质槽，避免为一小组道具拆出十几个冗余材质导致 Draw Calls 暴涨。
   - 严禁共面叠加（背板、牌面、地面标线、门窗框等必须留清晰厚度或法向偏移），导出前检查法线朝向与背面剔除效果。
4. **控制资产重量**：避免无意义高细分与超大贴图；重复街景套件（路灯、红绿灯、护柱、树等）按可被 Three.js 实例化（`InstancedMesh`）的干净原点与分组导出。
5. **导出后必验**：
   - 涉及角色/摩托车/骑姿改动：必须通过 `npm test`（含 `tools/test-morning-riding.mjs` 接触与袖型/配饰断言）。
   - 任何可见资产改动：必须使用 `.agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs` 在真实游戏中拍下**近景 + 中景/骑行视角**截图并实际看图验收，确认无穿模、浮空、比例失调或 Z-fighting。
