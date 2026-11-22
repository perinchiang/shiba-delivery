---
name: shiba-code-review
description: >-
  Use this skill to perform an independent code review on non-trivial changes, cross-module
  edits, Three.js rendering/geometry/performance work, or when diagnosing repeated QA
  failures in Shiba Delivery. Enforces read-only review, claim verification, hash-based
  skip of unchanged files, and root-cause analysis before rework.
---

# 阿柴快送 · 独立代码审查与根因诊断（Code Review）

本技能用于在合入或视觉验收前发现架构、Three.js 渲染/性能、几何接缝与交互隐患，同时杜绝“评审幻觉误导返工”和“反复重审未改文件”。

## 一、何时触发（避免机械走流水线）

- **建议触发**：跨 ≥ 2 个核心模块改动、3D 几何/Blender/材质/Shader/相机/阴影改动、Draw Calls 或合批结构变更、订单/骑行/步行状态机改造、或视觉/测试验收失败需要根因诊断。
- **可直接跳过**：单行文案/配置微调、纯文档编辑（Antigravity 自检 + `npm test` 即可）。

## 二、增量防重审检查（Hash 回执）

若本次任务目录下已有上轮审查/验收的 `stamp.txt`（如 `output/qa/<task>/stamp.txt`），先运行：

```sh
bash .agents/skills/shiba-visual-qa/scripts/receipt-hash.sh check output/qa/<task>/stamp.txt <files...>
```

- 仅对 `CHANGED` / `NEW` 文件执行复审；全部 `UNCHANGED` 时跳过重复审查，直接复用上轮有效结论。

## 三、执行审查（只读隔离）

1. **选择审查方式（动态自主决定）**：
   - 常规逻辑/UI/测试/订单配置：调用 `codex exec review --uncommitted -m gpt-6.2-sol -c model_reasoning_effort="medium" -c sandbox_mode="read-only"`，附上 [`references/review-checklist.md`](./references/review-checklist.md) 中的相关检查维度。
   - 复杂 3D 几何/Blender 脚本/渲染管线/合批性能/状态机疑难：调用 `gpt-6.2-astra`（`medium` 或 `high`，`-c sandbox_mode="read-only"`）。
   - 轻量快速自审：Antigravity 直接对照 [`references/review-checklist.md`](./references/review-checklist.md) 逐项核对 `git diff`。
2. **逐条核验评审发现（Verify Reviewer Claims）**：
   - 外部模型给出的每一条问题，必须包含 **`file:line` + 引用代码 + 具体触发条件**。
   - Antigravity **必须亲自打开对应文件核实**每条发现，并标注：
     - `VERIFIED`：已读码证实，纳入必改或建议；
     - `UNVERIFIED / FALSE POSITIVE`：核实不成立或仅凭猜测，直接丢弃，**绝不因流畅措辞而盲改代码**。

## 四、验收失败时的根因先行规则

若本次审查是由测试失败或视觉截图不通过触发，**禁止直接提出“试着调大/调小某参数”的补丁**：先按 [`references/root-cause-protocol.md`](./references/root-cause-protocol.md) 完成 5 类根因定性，再决定最小定点修复与是否切换模型。

## 五、输出结构与四态结论

```markdown
## Code Review: <范围>
- **审查方式**：<Antigravity 自审 | Codex Sol (effort) | Codex Astra (effort)>
- **Blocking（必改，全部已 VERIFIED）**：
  1. `file:line` — <问题与复现条件> → <建议修法>
- **Advisory（可选优化）**：...
- **Dropped（核验不成立的误报）**：<无 / 简述>
- **未核查项**：<无 / 明确写明 NOT ASSESSED 及原因>
- **Verdict**：`APPROVED` | `APPROVED WITH NOTES` | `CHANGES REQUIRED` | `NOT ASSESSED`
```

判定优先级（首个命中为准）：有 Blocking → `CHANGES REQUIRED`；有必检维度未核查 → `NOT ASSESSED`；仅有 Advisory → `APPROVED WITH NOTES`；全清 → `APPROVED`。
