---
name: codex-dispatch
description: >-
  Use this skill when Antigravity (as primary orchestrator) decides to delegate research,
  implementation, Blender 3D modeling, code review, or multimodal screenshot inspection
  to the local Codex CLI (gpt-6.2-sol or gpt-6.2-astra). Provides dynamic model and
  reasoning-effort heuristics, read-only safety flags, anti-loop caps, and CLI patterns.
---

# Codex 自主调度与模型路由指南（Codex Dispatch）

Antigravity 保持**主调度器与最终调度权**，继续通过本机可用的 `codex exec` / `codex exec review`（`codex-cli 0.171.0`）执行子任务。**严禁把模型调用固化成机械流水线**——所有路由均为动态启发式，按任务难度、上下文消耗、实测质量与返工风险灵活调整。

## 一、可用模型与思考档位（实测本机目录）

本机已接入且推荐使用的主力模型为 **`gpt-6.2-sol`** 与 **`gpt-6.2-astra`**（无独立 `gpt-6.2-ultra` 模型；两者均原生支持 `text` + `image` 输入与 `low / medium / high / xhigh / max / ultra` 思考档位）。

| 模型 Slug | 动态分工参考（非硬规） | 常用思考档位 | 升/降档与接力时机 |
|---|---|---|---|
| `gpt-6.2-sol` | 日常调研、需求拆解辅助、常规 JS/React/CSS 改动、订单/数据配置、单测补全、常规代码审查与基础验收 | `low`（小改/简单检索）<br>`medium`（常规功能/审校）<br>`high`（跨多模块复杂逻辑） | 常规改动一次过不升级；若 1 轮未解且根因涉 3D/渲染/几何，接力转交 Astra |
| `gpt-6.2-astra` | 复杂 Blender Python 3D 建模（`art/**/*.py`）、3D 空间几何/IK/贴合、Shader/材质/光照/Z-fighting、Draw Calls 合批优化、复杂架构与疑难根因定位 | `medium`（标准 3D/渲染）<br>`high`（复杂几何/架构） | 极端疑难卡壳时可按需升至 `xhigh` / `max` / `ultra`，但绝不对简单任务过度思考 |

> 备选参考：若遇大批量纯 UI/截图多模态查错且需轻量视觉交叉复核，本机亦可用 `gpt-6.1-terra`（`-i <png>`）；多数情况下 Antigravity 自己用 `read_file` 审图已足够，不要为了多模型协作而增加无意义调用。

## 二、动态调度 5 条铁律

1. **必须显式指定模型、档位与权限模式**：
   - `~/.codex/config.toml` 默认开启 `danger-full-access` 且默认 `gpt-6.2-astra` + `low`。
   - 调用时**始终显式传** `-m <model> -c model_reasoning_effort="<effort>" --ephemeral`。
   - 凡**只读调研、代码审查、视觉复核**任务，**必须加 `-c sandbox_mode="read-only"`** 并在 prompt 声明“只读不改文件”。
2. **轻量传参、精准喂上下文**：
   - 给 Codex 的 prompt 只放精炼 Task Brief、目标文件路径、精确约束与验收命令，让 Codex 按需自读文件；不把整段长聊天记录灌进去。
3. **Trigger 0 产物存在性校验**：
   - Codex 返回后，先用 `git status` / `git diff` / 文件检查确认其承诺修改的文件与产物真实落盘，不轻信口头总结。
4. **安全并行与串行接力**：
   - 仅当两个子任务写入的文件集完全互斥（如 `art/city-kit/` vs `src/morning/hud.js`）时才并行；存在共享文件风险时串行或使用 `--worktree`。
5. **反循环熔断**：
   - 同一缺陷最多 2 轮自动修复（第 1 轮失败后必须先做根因定性再决定换模型或改方案）；2 轮仍未过即停止并向 Patrick 汇报。

## 三、标准 CLI 命令模板

具体可直接复用的 `codex exec`、`codex exec review`、`-i` 多模态传图与 `-o` 落盘命令，见 [`references/cli-patterns.md`](./references/cli-patterns.md)。
