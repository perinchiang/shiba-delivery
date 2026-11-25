---
name: shiba-visual-qa
description: >-
  Use this skill whenever any player-visible change is made to Shiba Delivery (Godot 4.7 scenes,
  Blender .blend assets, lighting, materials, camera, animations, HUD/UI, or GitHub Pages HTML
  progress reports). Runs the real Godot 4.7 Forward+ Metal app via --capture-qa, inspects actual
  screenshots with read_file, records steady-state FPS/draw calls, and publishes the mobile-friendly
  GitHub HTML report.
---

# 阿柴快送 · Godot 4.7 实机视觉验收与外网报告（Visual QA）

**铁律**：脚本无报错或导入成功**绝不能证明画面没错**。凡涉及玩家可见改动，未在本机跑起真实 Godot 4.7（Metal Forward+）并亲自用 `read_file` 逐张核对实机截图前，任务不得关闭。

## 一、统一 Godot 4.7 Metal 抓图命令

```sh
# 1) 如改动了 Blender 母版，先同步 .blend 并重导 + 重烘 VoxelGI
blender --background --factory-startup --python-exit-code 2 --python tools/sync_blender_to_godot.py
./game/run.sh --headless --import --quit
./game/run.sh -- --bake-voxelgi

# 2) 运行真实 Metal 4.0 GPU 抓取全部标准机位（输出 PNG + metrics.json 稳态 FPS / draw calls）
./game/run.sh -- --capture-qa "$(pwd)/output/qa/<task-slug>"
```

## 二、验收执行闭环

1. **检查 `metrics.json` 与 Godot 控制台输出**：
   - 无 `ERROR:` / 脚本崩溃；
   - 核对各机位稳态 `fps`、`draw_calls`、`primitives` 与 `voxel_gi: true`。
2. **必须亲自逐张看图**：
   - 用 `read_file` 打开 `output/qa/<task-slug>/*.png` 逐张核对：
     - 奶油灰泥与微缩手办表面是否干净顺滑（无噪点花斑、无平滑法线条纹、无玻璃球形高光斑）；
     - 比例与接触（阿柴/车辆 0.84 基线、外楼梯贴墙收口、无穿模浮空与 Z-fighting）；
     - 4 时段光影与夜景氛围（零穿墙泛光、二楼暖灯与店面暖光层次）；
     - 桌面 HUD 可读性（默认收起调试面板、无重叠裁切）。
3. **验收不通过 → 先根因再修复（最多 2 轮熔断）**：
   - 禁止猜数值盲改！先按 [`../shiba-code-review/references/root-cause-protocol.md`](../shiba-code-review/references/root-cause-protocol.md) 归因再定点修复；连续 2 轮未通过即停下汇报对比图给 Patrick。
4. **打包发布外网 GitHub Pages HTML 报告**：
   - 用 `cwebp -q 85` 将本轮核心截图与对比图压缩写入 `reports/YYYY-MM-DD-<slug>/imgs/` 并编写 `report.json`；
   - 运行 `python3 tools/build_report_site.py --out dist` 验证 0 断图；
   - 推送 `shiba-delivery-update` 等待 GitHub Actions 部署完毕后核验 `https://perinchiang.github.io/shiba-delivery/`。

## 三、标准输出口径（交付必填）

- `Run result: OBSERVED — <逐机位所见摘要与稳态 FPS / draw calls>（线上报告：https://perinchiang.github.io/shiba-delivery/）`
- `Run result: NOT VERIFIED — <阻塞原因>`（视觉/UI 任务处于此状态**禁止关闭**）
- `Deferred to playtest`：<静态图无法验证的手感、按键响应、音频同步等项>
