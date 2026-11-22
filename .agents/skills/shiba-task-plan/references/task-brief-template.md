# Task Brief：<一句话任务名>

- **任务分型**：`Logic` | `Visual-3D` | `Asset-Blender` | `UI` | `Integration` | `Data`（混合取最高门槛）
- **关联基线**：`GAME.md` §X / `ROADMAP.md` MX / `ART-BIBLE.md` §X

## 1. 目标与边界
- **目标**：<1–2 句说清玩家或开发可见的最终变化>
- **In Scope（拟改动文件）**：
  - `path/to/file` — <职责>
- **Out of Scope（明确不碰）**：
  - <相邻系统或暂缓功能>

## 2. 验收条件（AC）
- [ ] **AC-1**：<具体可测/可看的结果> → 验证方式：`npm test` / `?scene=<id>` 截图
- [ ] **AC-2**：<具体可测/可看的结果> → 验证方式：...
- [ ] **AC-3（若新增场景/资产）**：`src/morning/scene-debug.js` 已登记可点击入口，普通构建默认隐藏
- [ ] **AC-4（若涉渲染/3D）**：Console/PageError = 0，目标机位 60 FPS 且 Draw Calls 无异常暴涨

## 3. 必拍机位与视口（视觉/UI 任务必填）
- **机位列表**：`<scene1>,<scene2>,...`（标明新增还是复用 `scene-debug.js`）
- **视口**：`desktop` (1280×800) / `mobile` (844×390) / `both`
- **静态图不覆盖项（DEFERRED）**：<例如：骑行手感/音效节奏，待人工试玩确认>

## 4. 动态执行与调度初稿（可随时按反馈调整）
- **拆分与并行**：<顺序 or 互斥子任务并行>
- **拟派工**：<Antigravity / Codex Sol (low|medium|high) / Codex Astra (medium|high)>
- **交叉审查**：<需要（原因） / 跳过（小改自查即可）>

## 5. 待决冲突 / Own Calls 预登记
- **需 Patrick 先拍板**：<无，或列出撞及 `GAME.md` §7 的选项>
- **AI 默认假定（交付时显式披露）**：<未写死的细节默认值>
