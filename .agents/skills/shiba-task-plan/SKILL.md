---
name: shiba-task-plan
description: >-
  Use this skill before implementing any multi-file feature, gameplay change, visual/3D
  update, UI rework, or ROADMAP milestone item in Shiba Delivery. Breaks ambiguous requests
  into a concise Task Brief with explicit acceptance criteria, scope boundaries, required
  debug camera views, and dynamic Codex dispatch plan. Skip for trivial one-line fixes.
---

# 阿柴快送 · 需求拆解与验收契约（Task Plan）

本技能解决 AI 开发中“未想清楚就改代码、验收条件模糊、范围飘移、漏配 Debug 入口”的问题。产出**单页轻量 Task Brief**，绝不制造重型 GDD / Epic / Sprint 官僚文档。

## 一、触发边界

- **必须使用**：涉及 ≥ 2 个文件、新增/调整 3D 场景或资产、修改骑行/步行/订单状态机、新增或改版 UI、推进 `docs/ROADMAP.md` 阶段项。
- **直接跳过**：单行文案错别字、显而易见的单一 bug 修复（直接修并跑 `npm test` 即可）。

## 二、拆解步骤

1. **对齐现行真相（只读与本次任务直接相关的章节）**：
   - 检查 [`docs/GAME.md`](../../../docs/GAME.md) §7「待决产品问题」与 §8「明确不做」：若本次需求撞上未决产品决策，**停下来给 Patrick 2–3 个选项与推荐方案**，不擅自拍板。
   - 检查 [`docs/ROADMAP.md`](../../../docs/ROADMAP.md) 当前阶段目标，防止过度扩张到后续阶段。
   - 若涉视觉/3D/UI，对照 [`docs/ART-BIBLE.md`](../../../docs/ART-BIBLE.md)。
2. **给任务定型（决定最低验收门槛）**：
   - `Logic / Data`：`npm test`（含新增边界断言）必须全绿。
   - `Visual-3D / Asset-Blender`：`npm test` + 固定机位真实截图 `OBSERVED` + Draw Calls 核对。
   - `UI / Controls`：PC `1280×800` + 移动横屏 `844×390` 双视口截图 `OBSERVED` + 交互走查。
   - `Integration / Flow`：`npm test` + `npm run playtest`（或对应完整交互走查）+ 关键帧截图。
   - 混合任务取最高门槛。
3. **写清可核验验收条件（AC）与必拍机位**：
   - 每条 AC 必须能被**测试断言**或**指定机位截图画面**证实，拒绝“更好看/更流畅”等不可判定的描述。
   - 若当前 `src/morning/scene-debug.js` 没有能直接观测本次改动的机位，把**“在 `scene-debug.js` 注册可点击 Debug 瞬移/检查机位”**列为 AC-1。
4. **划定范围与动态调度初稿**：
   - 明确 `In Scope`（拟改文件）与 `Out of Scope`（明确不碰的模块）。
   - 若可拆为文件写入完全互斥的子任务，标注可并行项；标注初步建议的模型（Antigravity / `gpt-6.2-sol` / `gpt-6.2-astra`）与思考档位，执行中允许按实际反馈动态调整。
5. **预登记 Own Calls**：
   - 记录“需求没写死、将采用合理默认值”的细节，待任务交付时单独列出给 Patrick 确认。

## 三、输出模板

按 [`references/task-brief-template.md`](./references/task-brief-template.md) 输出简明任务卡（直接写在回复或临时 artifact 中即可，不往仓库里堆砌临时规划文档）。
