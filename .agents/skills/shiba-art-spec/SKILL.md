---
name: shiba-art-spec
description: >-
  Use this skill when creating or revising 3D art assets, Blender generation scripts,
  storefronts, street furniture kits, palettes, lighting, or UI visual direction for
  Shiba Delivery, or when auditing existing assets against art and performance budgets.
---

# 阿柴快送 · 美术规范与资产校验（Art Spec & Audit）

本技能将 `docs/ART-BIBLE.md` 的约束转化为可执行的前置资产规格卡与后置合规审计，防止视觉漂移、比例失真、Z-fighting 与 Draw Calls 超标。

## 一、先读唯一事实源（按需只读相关文件）

1. [`docs/ART-BIBLE.md`](../../../docs/ART-BIBLE.md) — 视觉定位、裁决测试、比例/坐标红线与性能预算。
2. [`src/morning/city-palette.js`](../../../src/morning/city-palette.js) — 城区与街道唯一色板 `CITY_PALETTE`。
3. 若涉及角色/摩托/Blender 导出：读 [`art/AGENTS.md`](../../../art/AGENTS.md) 与 [`art/morning/README.md`](../../../art/morning/README.md)。
4. 若涉及树木/村道/特色店面风格基线：按需读 [`docs/GAME.md`](../../../docs/GAME.md) §3 与 §6。

## 二、模式 A：新资产前置规格卡（制作前）

新增 Blender 套件（如 `city-street-kit.glb`）、特色店面、NPC 或重要环境道具前，先输出精简规格卡（可嵌入 Task Brief，不必另建繁琐文档）：

- **资产名与路径**：源脚本（`art/<dir>/<name>.py`）与导出产物（`art/<dir>/<name>.glb`）。
- **视觉定位与裁决锚点**：引用的 `CITY_PALETTE` 色值、造型语言（圆润/微缩/清晰大轮廓）、与阿柴（0.84 缩放）的米制尺寸对照。
- **技术与性能上限**：
  - 坐标：Blender `-Y` 车头 → glTF `+Z` 车头，原点贴地，便于 Three.js `InstancedMesh` 实例化；
  - 材质槽数（优先顶点色 + 最少共享材质，避免每件道具独立材质抬高 Draw Calls）；
  - 三角面数与贴图尺寸上限（无必要不上 2K/4K，贴图 2 的幂次）；
  - 防 Z-fighting 要求（背板、标牌、门框留明确厚度或法向偏移）。
- **接触锚点 / 交互位**（若可交互）：列出空物体命名与站位空间。
- **验收机位**：指定现有 `?scene=` 机位或要求在 `src/morning/scene-debug.js` 新增固定近景 + 中景机位。

## 三、模式 B：资产合规审计（交付前或定期排查）

按 [`references/asset-audit-checklist.md`](./references/asset-audit-checklist.md) 逐项实测检查：

- **禁止脑补数据**：能用 `stat` / `du` / `file` / Blender / Three.js 脚本实测的才填数字；无法测量的指标一律写 **`NOT ASSESSED`** 并说明原因，严禁输出虚假绿灯。
- **必须关联视觉验收**：资产结构与大小合规后，仍须通过 `shiba-visual-qa` 在真实游戏画面中目视确认比例、色温、接缝、遮挡与 Draw Calls。

## 四、模型路由建议（按需动态选择）

- 编写规格卡、核对色板/引用/命名：Antigravity 直接完成或用 `gpt-6.2-sol`（`low`/`medium`）。
- 编写/精修 Blender Python 3D 建模脚本、复杂空间几何、材质/光照/Z-fighting 排查：优先交给 `gpt-6.2-astra`（`medium`/`high`）。
