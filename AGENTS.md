# 阿柴快送｜Agent 工作约定

本文件只定义协作与维护规则，不重复完整游戏设计或技术说明。

## 先确认范围与事实来源

1. 开始前确认当前工作分支、用户本次要求，并**只读取与任务直接相关**的代码、测试和现行文档；未经要求不要直接修改 `main`。
2. **用户最新且明确的决定**优先于既有文档；`docs/GAME.md` 是持续维护的**现行产品意图**，不是待办清单；`docs/ROADMAP.md` 记录阶段顺序、当前进度与过关标准，阶段完成或调整时同步更新。若新要求与其中内容冲突，应以新决定为准，并同步修正文档。
3. **代码、资产和可运行验证**说明当前实际实现；`art/morning/README.md` 记录相关资产制作技术；根目录 `README.md` 只介绍入口、运行方式与已实现功能。不要把产品愿景当成已交付功能，也不要把现有实现当成不可改变的未来设计。
4. 历史 Commit、旧 PR、Issue、旧版本文档和归档标签（`archive/early-prototype`、`archive/threejs-web-final`）仅用于追溯背景；**不得自动恢复**用户已取消、替换或明确不做的功能。多个来源冲突且用户意图不明确时，指出冲突，不要拼接成“全都要”。

## 保持文档为当前真相

- 修改已经确定的产品行为、技术约束或操作流程时，在**同一次变更**中更新相关现行文档，**替换或删除**失效描述，不能仅追加一份 `v1.1`、`v1.2` 文档。
- 不因纯内部修复机械地修改文档。避免 README、GAME 与技术文档互相复制；每类信息只有一个主要归属。
- 将「已确定」「待验证」「当前已实现」「明确不做」严格区分；头脑风暴、长期愿景和任务建议都不能直接升级为当前必须实现的功能。
- 不为了让旧文档成立而回滚正确的新实现。若无法确认是否应废弃旧需求，保留现状并在交付报告中列出待决冲突。

## 开发边界（Godot 4.7 Steam 桌面优先路线）

- **正式引擎与发行路线**：主工程位于 [`game/`](game/)，采用 **Godot 4.7（Forward+ · macOS Metal / Windows & Steam Deck Vulkan）** 直走 **PC / Steam 桌面路线**（早期 Three.js 网页原型已完整归档至 Git 标签 `archive/threejs-web-final`，不再维护 WebGL 降级版）。开发期在桌面端维护可折叠 Debug 面板（`Tab`/`F12`，支持 4 时段切换、机位瞬移与实时 FPS/Draw Calls），正式发行时默认隐藏。
- **美术管线定调**：保持**微缩手办感 × 柔和绘本风（风格化 PBR）**与角色/载具 `0.84` 缩放基线；全面采用 **「纯 Blender 5.2 精建（真墙厚/真凹洞/真室内纵深/柔和倒角）+ AI 手绘 2D PBR 贴图 + 共享公模库（开工前必查 [`art/CATALOG.md`](art/CATALOG.md)）→ Godot 4.7 原生 `.blend` 直导 + AgX + VoxelGI + SSIL + SSAO + SSR 实时渲染」**。彻底淘汰纯代码方块建筑、纯顶点色假材质、程序化 Canvas 糊字招牌与 WebGL 低采样光图烘培。
- 以小而完整的玩家体验验证新系统，避免将长期设想一次性铺开；未经要求不擅自更换引擎、添加大系统或扩大功能范围。

## 轻量研发工作流

本仓库在 `.agents/skills/` 中维护轻量游戏开发工作流（按需触发，不常驻污染上下文），并遵循以下工程红线：

- **验收先行**：跨文件或涉及玩法/美术/UI 的任务，先明确任务分型、可核验验收条件（AC）、改动边界与必拍机位（见 `.agents/skills/shiba-task-plan/`），再动手实现。
- **美术规范、生产流水线与资产台账索引**：视觉与 3D 资产改动遵守 [`docs/ART-BIBLE.md`](docs/ART-BIBLE.md)、目录级 [`art/AGENTS.md`](art/AGENTS.md) 与全库复用台账 [`art/CATALOG.md`](art/CATALOG.md)，实操生产遵循 [`.agents/skills/shiba-blender-pipeline/`](.agents/skills/shiba-blender-pipeline/SKILL.md)（含 AI 贴图脚本与 Blender → Godot `.blend` 同步器 [`tools/sync_blender_to_godot.py`](tools/sync_blender_to_godot.py)），严禁跳过查库重复建模。
- **视觉改动必看实机图**：凡涉及玩家可见改动，必须在本机运行 Godot 4.7（Metal Forward+）并执行 `--capture-qa` 抓图，用 `read_file` 亲自逐张核验截图、稳态 FPS/Draw Calls 与 0 报错（见 `.agents/skills/shiba-visual-qa/`）；无法核验的项必须标明 `NOT ASSESSED` 或 `DEFERRED`。
- **失败先根因、2 轮熔断**：验收不通过时，禁止猜数值盲改——必须先定位根因类别再改；同一缺陷连续 2 轮自动修复仍未过关，立即停止并向 Patrick 汇报对比图与备选方案。
- **显式披露 Own Calls**：需求未写死、由 AI 自主拍板的数值、颜色或交互细节，交付时单独列出供 Patrick 确认保留或调整。

## 交付与外网 HTML 进度报告（核心协作方式）

Patrick 平时在外面跑外卖常使用手机查看进展，**每次完成阶段改动交付时，必须生成一份外网手机可直接访问的 GitHub Pages HTML 进度报告**：

1. 将本轮 Godot 实机截图（转轻量 WebP）与结构化报告写入 `reports/YYYY-MM-DD-<slug>/`（含 `report.json` 与 `imgs/*.webp`），运行 `python3 tools/build_report_site.py --out dist` 本地自检零断图。
2. 报告内容必须清晰明了，让 Patrick 打开手机一眼看懂：**本次做了什么、实机性能读数、同机位对比/实机截图（有图必放，点图可放大）、Own Calls、待拍板与下一步**。
3. 将代码、资产与新报告推送到 `shiba-delivery-update`，等待 GitHub Actions 发布成功，实测核验固定外网报告首页 **https://perinchiang.github.io/shiba-delivery/**（默认直达最新一期报告，底部保留历史归档）返回 200 且图片完整，并把该链接交给 Patrick。
4. 在对话回复中简要说明：**改了什么、验证了什么、现行文档是否同步、有无未决设计冲突**。
