---
name: shiba-visual-qa
description: >-
  Use this skill whenever any player-visible change is made to Shiba Delivery (3D models,
  scenes, lighting, materials, camera, animations, HUD/UI, or GitHub Pages release verification).
  Runs the real game in Chrome Metal via capture-scenes.mjs, inspects actual screenshots with
  read_file, records FPS/draw calls and file content hashes, and enforces root-cause diagnosis
  before any rework.
---

# 阿柴快送 · 实际游戏截图验收（Visual QA / Run & Observe）

**铁律**：编译通过与 `npm test` 全绿只证明逻辑未炸，**绝不能证明画面没错**。凡涉及玩家可见改动，未运行真实游戏并亲自打开截图核对前，任务不得关闭。

## 一、统一截屏命令（零临时脚本）

直接使用本技能内置的 Chrome Metal 截屏器 [`scripts/capture-scenes.mjs`](./scripts/capture-scenes.mjs)（复用仓库 `playwright-core`、`?scene=<id>&debug=1` 与 `#scene-perf`，无需临时在 `tools/out/` 写一次性脚本）：

```sh
# 1) 本地自动起 Vite 服务并抓取指定机位（默认 1280x800，自动采样 FPS/draw calls 并关闭调试面板再拍净图）
node .agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs \
  --scenes street,crossing,cityEdge \
  --out output/qa/<task-slug> \
  --stamp src/morning/city-crossing.js,src/morning/town.js

# 2) UI/HUD 改动：同时抓 PC 1280x800 与移动横屏 844x390
node .agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs \
  --scenes street,bunCounter \
  --viewport both \
  --out output/qa/<task-slug>

# 3) 线上 GitHub Pages 交付核验（AGENTS.md 要求）
node .agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs \
  --url https://perinchiang.github.io/shiba-delivery/ \
  --scenes street,crossing,riceBend \
  --out output/qa/pages-verify
```

可用预设组（`--preset`）：`smoke`、`street`、`city`、`country`、`buns`、`all`；也可用 `--hold-ms <ms>` 定格动画帧（如骑行/上下车/开箱）。

## 二、验收执行闭环

1. **先过自动化基线**：先跑 `npm test`（涉及核心配送流程或触控时加跑 `npm run playtest`）。
2. **跑截屏并检查 `manifest.json`**：
   - `totalErrors` 必须为 `0`（无 `pageerror`、`console.error`、HTTP ≥ 400）；
   - 核对各机位 `FPS` 与 `drawCalls`（对照 `docs/ART-BIBLE.md` §5 预算，不出现异常激增）。
3. **必须亲自看图**：
   - Antigravity 用 `read_file` 打开 `output/qa/<task-slug>/*.png` 逐张核对 Task Brief 中的每条视觉 AC：
     - 比例与轮廓（阿柴/摩托 0.84 基线、建筑与街具协调度）；
     - 几何接触与渲染质量（无穿模、浮空、地面裂隙、共面 Z-fighting、背面破洞）；
     - 色彩与光影（契合 `CITY_PALETTE` 与清晨暖侧光）；
     - UI 可读性（双视口下无裁切、重叠、遮挡核心交互区）。
   - 仅当画面存在细微 3D 空间/透视疑点时，才通过 `codex exec -m gpt-6.2-astra -c sandbox_mode="read-only" -i <shot.png> ...` 做交叉审图，不搞形式主义。
4. **新鲜度核验（防过期截图）**：
   - 截图后若又改了代码，用 `bash .agents/skills/shiba-visual-qa/scripts/receipt-hash.sh check output/qa/<task-slug>/stamp.txt` 检查；凡标 `CHANGED` 的改动，必须重拍受影响机位。
5. **验收不通过 → 先根因再修复（最多 2 轮熔断）**：
   - 严禁猜数值盲改！先按 [`../shiba-code-review/references/root-cause-protocol.md`](../shiba-code-review/references/root-cause-protocol.md) 归因，再决定修法或切换模型；连续 2 轮未通过即停下汇报对比图给 Patrick。

## 三、标准输出口径（交付必填）

每轮视觉验收结束输出 1 行明确结果，并诚实区分静态图已验项与需人工试玩项：

- `Run result: OBSERVED — <逐机位所见摘要与 FPS/draw calls>（截图：output/qa/<task-slug>/）`
- `Run result: NOT VERIFIED — <阻塞原因，如浏览器/渲染失败>`（视觉/UI 任务处于此状态**禁止关闭**）
- `Run result: N/A — <为何完全无玩家可见面，不能仅写“逻辑改动”>`
- `Deferred to playtest`：<静态图无法验证的手感、权重、音频同步等项>
