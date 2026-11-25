---
name: shiba-art-spec
description: >-
  Use this skill when creating or revising 3D art assets, Blender models/scripts,
  AI PBR textures, storefronts, street furniture kits, palettes, lighting, or UI
  visual direction for Shiba Delivery, or when auditing existing assets against art
  and performance budgets.
---

# 阿柴快送 · 美术规范与资产校验（Art Spec & Audit）

本技能将 [`docs/ART-BIBLE.md`](../../../docs/ART-BIBLE.md) 的最新定调（**纯 Blender 微缩手办级建模 + AI 手绘 2D PBR 贴图 + 共享公模库 + 两关制验收**）转化为可执行的前置规格卡与后置合规审计，防止回退到纯代码方块、结构穿帮、糊字招牌或 Draw Calls 超标。

## 一、先读唯一事实源（按需只读相关文件）

1. [`docs/ART-BIBLE.md`](../../../docs/ART-BIBLE.md) — 视觉定位、纯 Blender + AI 贴图管线、两关制流程、结构细节红线与性能预算。
2. [`art/CATALOG.md`](../../../art/CATALOG.md) — **全仓库现存共享公模、AI 贴图库与待淘汰旧资产清单，制作前必查**。
3. [`art/AGENTS.md`](../../../art/AGENTS.md) — `art/` 目录 Blender 源与运行版导出硬约束。
4. [`src/morning/city-palette.js`](../../../src/morning/city-palette.js) — 城区与街道唯一色板 `CITY_PALETTE`。
5. 若涉及主角/载具/骑姿：读 [`art/morning/README.md`](../../../art/morning/README.md)。

## 二、模式 A：新资产前置规格卡（制作前）

新增建筑模块、地标、共享公模道具、载具、NPC 或 AI 贴图前，先输出精简规格卡（可嵌入 Task Brief，不必另建繁琐文档）：

- **查库与复用决策**：查阅 [`art/CATALOG.md`](../../../art/CATALOG.md) 后明确三选一——**直接复用** / **公模换色、换贴图或换局部配件** / **确认缺失新建**；凡新建通用道具或角色素体，必须归口 `art/shared/props/` 或 `art/shared/characters/` 并预留换色/换图材质槽，同步登记回 `art/CATALOG.md`。
- **资产路径与两关产物**：
  - 母版源：`.blend`（及对应构造脚本 `.py`）+ AI 无字原图 `art/shared/textures/ai_*.png` + 合成 PBR 图；
  - Gate 1 审图：`output/blender-qa/<asset>/`（日景全景、门面/结构近景、交互特写、俯视结构、暖光夜景）；
  - Gate 2 游戏运行版：减面合批压缩 `.glb` + 接入点。
- **视觉定位与结构自检锚点**：
  - 引用的 `CITY_PALETTE` 色值与微缩手办质感反差（哑光灰泥 / 半光烤漆金属 / 高光釉面瓷砖 / 木纹 / 暖光室内透光）；
  - 严禁纯代码方块建筑、纯顶点色假材质或程序化 Canvas 糊字招牌；
  - 结构细节核对：真墙厚/真凹洞/真室内深度、机械件真结构（不拿板子挡）、遮阳棚向下倾斜无违和圆弧、外楼梯贴墙或双扶手、同店名统一与主招牌清晰立体、走廊摆件克制留白。
- **技术与性能上限**：
  - 坐标：Blender `-Y` 朝前 → glTF `+Z` 朝前，原点贴地，米制对齐阿柴 `0.84` 基线；
  - 运行版面数、共享材质槽数、贴图尺寸（`512`–`1024`，海报上限 `2048`）与 `InstancedMesh` 实例化规划；
  - 防 Z-fighting 要求（厚度或明确法向偏移）。
- **接触锚点 / 碰撞契约**（若可交互/可行走）：列出空物体命名或碰撞区间。

## 三、模式 B：资产合规审计（Gate 1 / Gate 2 交付前）

按 [`references/asset-audit-checklist.md`](./references/asset-audit-checklist.md) 逐项实测检查：

- **禁止脑补数据**：能用 `stat` / `du` / `file` / Blender / Three.js 脚本实测的才填数字；无法测量的指标一律写 **`NOT ASSESSED`** 并说明原因，严禁输出虚假绿灯。
- **必须亲自看图验收**：Gate 1 必看 Cycles 日/夜多角度渲染图；Gate 2 必通过 `shiba-visual-qa` 在真实游戏画面中目视确认 4 时段光影、比例、接缝、暖光氛围与 Draw Calls。
