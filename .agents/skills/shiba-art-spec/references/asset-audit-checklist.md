# 资产合规审计清单（Shiba Delivery）

> **反虚假绿灯铁律**：每项必须基于实际命令或代码核查。缺失输入或无法测量时填 `NOT ASSESSED — <原因>`，严禁猜测填“通过”。

## 1. 复用查库、台账与来源
- [ ] 是否已先查阅 `art/CATALOG.md` 且未重复造轮子（复用 / 换贴图 / 确有缺失才新建）？新增或结构变更是否已同步登记回 `art/CATALOG.md`？
- [ ] 每个 `.glb` 是否有配套维护的 `.blend` 源文件 **或** 可无头复现的 `.py` 源脚本（如 `art/morning/build.py`、`art/countryside/kit.py`、`art/bun-shop/steamers.py`）？
- [ ] 若为脚本源，是否能通过无头命令行复现导出：
  `blender --background --factory-startup --python-exit-code 2 --python <script>.py`

## 2. 坐标、比例与锚点
- [ ] 米制尺度与阿柴/摩托（0.84 缩放）视觉协调，无巨人/微缩穿帮。
- [ ] Blender `-Y` 朝前导出为 glTF `+Z` 朝前，底部贴地（无悬空或半截埋地）。
- [ ] 角色/车辆改动后 `npm test`（含 `tools/test-morning-riding.mjs`）全过。

## 3. 体积、贴图与引用完整性
- [ ] 用 `du -h` / `ls -lh` 检查新增 `.glb` 与贴图体积是否异常膨胀（对比现有资产量级）。
- [ ] 贴图尺寸是否为 2 的幂次，遵循合理的风格化贴图预算（共享图集 `512`–`2048` 按需压缩；透明用 PNG，不透明背景可用 JPG/WebP，避免单个小道具独占 2K/4K）。
- [ ] **孤儿资产**：新增资产是否在 `src/` 中被真实引用？
- [ ] **缺失引用**：`src/` 中引用的所有 `.glb` / `.png` / `.jpg` / `.svg` 路径是否真实存在于磁盘？

## 4. 渲染质量与性能预算
- [ ] 材质槽克制，可复用的街景/植被资产支持 Three.js `InstancedMesh` 实例化。
- [ ] 检查背板、招牌、门窗、地面标线无共面 Z-fighting，背面剔除无破洞。
- [ ] 在真实 Chrome Metal 1280×800 截图中核对 `#scene-perf`：目标 60 FPS，新增区域全帧含阴影 ≤ 250 draw calls（且不得显著抬高已有基线）。

## 5. 审计结论枚举（按首个命中项裁定）
- `NON-COMPLIANT`：存在缺失引用、破坏骑姿断言、严重穿模/Z-fighting 或明显越过性能预算。
- `WARNINGS`：存在可优化的体积、材质槽冗余或孤儿文件。
- `NOT ASSESSED`：有必检维度因缺工具/缺运行未能实测（必须列出具体哪项）。
- `COMPLIANT`：全部维度均已实测且无问题。
