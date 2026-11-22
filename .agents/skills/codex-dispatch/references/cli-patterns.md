# Codex CLI 实测调用模板（`codex-cli 0.171.0`）

> 以下命令均基于本机 `codex exec --help` 与 `codex exec review --help` 实测核验。每次调用都显式指定 `-m`、`model_reasoning_effort` 与 `--ephemeral`，避免受 `~/.codex/config.toml` 默认值影响或污染历史会话。

## 1. 常规代码实现（Sol · medium）

```sh
codex exec \
  -m gpt-6.2-sol \
  -c model_reasoning_effort="medium" \
  --ephemeral \
  -o output/qa/codex-last.md \
  "按以下 Task Brief 实现改动，只触碰 In Scope 文件，完成后运行 npm test 并汇总改动文件、测试结果与 Own Calls：<Task Brief>"
```

## 2. 复杂 3D / Blender / Shader / 渲染几何任务（Astra · high）

```sh
codex exec \
  -m gpt-6.2-astra \
  -c model_reasoning_effort="high" \
  --ephemeral \
  -o output/qa/codex-astra.md \
  "先读 docs/ART-BIBLE.md 与 art/AGENTS.md，按以下规格卡实现并验证：<规格与验收条件>"
```

## 3. 独立只读代码审查（Sol 或 Astra · read-only）

```sh
codex exec review \
  --uncommitted \
  -m gpt-6.2-sol \
  -c model_reasoning_effort="medium" \
  -c sandbox_mode="read-only" \
  --ephemeral \
  -o output/qa/review.md \
  "只读审查当前未提交改动，对照 .agents/skills/shiba-code-review/references/review-checklist.md，每条发现必须给 file:line + 代码片段 + 复现条件，区分 Blocking / Advisory，最后给出四态结论。"
```

> 复杂渲染/几何/合批改动将 `-m gpt-6.2-sol` 替换为 `-m gpt-6.2-astra`（`medium` 或 `high`）。

## 4. 只读调研 / 根因诊断（read-only）

```sh
codex exec \
  -m gpt-6.2-astra \
  -c model_reasoning_effort="high" \
  -c sandbox_mode="read-only" \
  --ephemeral \
  "只读分析，不要修改任何文件。请结合 src/morning/city-crossing.js 与截图现象，定位 Z-fighting/接缝根因并给出最小修改方案。"
```

## 5. 多模态截图交叉验收（`-i` 传图 · read-only）

```sh
codex exec \
  -m gpt-6.2-astra \
  -c model_reasoning_effort="medium" \
  -c sandbox_mode="read-only" \
  --ephemeral \
  -i output/qa/<task>/01-crossing.png \
  -i output/qa/<task>/02-cityEdge.png \
  "只读审图，不修改文件。对照以下视觉 AC 逐项核查这两张实机截图：1) 红绿灯背板有无闪烁/透穿；2) 路缘与沥青接缝是否平整；3) 整体色温是否符合 CITY_PALETTE。输出 OBSERVED 问题清单与位置描述。"
```

## 6. 隔离并行改动（`--worktree`）

当两个高价值任务需并行且可能触及共享配置时，可给其中一方加 `--worktree` 在独立 Git worktree 中运行，由 Antigravity 审校后再合入当前分支。
