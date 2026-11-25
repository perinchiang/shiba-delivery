---
name: shiba-blender-pipeline
description: >-
  End-to-end 3D asset production pipeline for Shiba Delivery: Catalog check,
  AI hand-painted 2D PBR texture generation (via local .env.local + gpt-image-2.6-sunburst),
  Blender 5.2 micro-diorama modeling, Gate 1 Cycles day/night beauty review (with single-file
  mobile HTML gallery), and Gate 2 game-ready decimation/material-batching/UV conversion into
  Three.js. Use whenever building new buildings, shared props, vehicles, or AI PBR textures.
---

# 阿柴快送 · 纯 Blender + AI 贴图资产生产流水线（Blender Pipeline）

本技能固化《阿柴快送》已验证的 **95 分商业级微缩手办资产生产全流程**，与规范校验技能 [`shiba-art-spec`](../shiba-art-spec/SKILL.md) 配套使用：前者负责「怎么审」，本技能负责「怎么一步步做出来」。

---

## 一、开工前 30 秒必检

1. **查全库台账 [`art/CATALOG.md`](../../../art/CATALOG.md)**：决定 ① 直接复用 / ② 公模换色或换贴图 / ③ 确认缺失才新建；通用道具必须归口 `art/shared/props/` 并独立命名主漆面槽（方便一键换色）与海报/贴纸 UV 槽。
2. **确认本机私有凭据 `.env.local`**：
   - 本机仓库根目录的 `.env.local`（已被 `.gitignore` 忽略，**严禁提交到 Git**）存放：
     - `SHIBA_IMAGE_API_BASE`（默认 `https://jp.nikoapi.xyz/v1`）
     - `SHIBA_IMAGE_API_MODEL`（首选 `gpt-image-2.6-sunburst`）
     - `SHIBA_IMAGE_API_KEY`（本机密钥）
   - 模板见 [`.env.example`](../../../.env.example)。

---

## 二、Step 1 · AI 手绘 2D PBR 贴图生成与排版合成

使用内置复用脚本 [`scripts/gen_ai_texture.py`](scripts/gen_ai_texture.py) 调用 `gpt-image-2.6-sunburst` 生成**纯无字手绘原图**（杜绝 AI 错字乱码）：

```sh
# 单张生成（内置 surface / poster / chalkboard / fabric 风格前缀预设，可自动派生法线）
/usr/local/bin/python3 .agents/skills/shiba-blender-pipeline/scripts/gen_ai_texture.py \
  --preset surface \
  --size 1024x1024 \
  --out art/shared/textures/ai_terracotta_roof.png \
  --normal \
  --prompt "warm terracotta curved coastal roof tiles (#C86A48 to #B25638), subtle gouache variation"

# 批量生成（读取 JSON 清单）
/usr/local/bin/python3 .agents/skills/shiba-blender-pipeline/scripts/gen_ai_texture.py --batch specs.json
```

**排版与招牌铁律**：
- 海报 / 黑板菜单 / 暖帘 / 竖牌文字：用无字 `ai_*.png` 底图 + [`art/shared/textures/compose_ai_textures.py`](../../../art/shared/textures/compose_ai_textures.py)（Pillow + `Hiragino Sans GB.ttc` / `Songti.ttc`）叠加清晰中日文排版并按底图明度轻融合；
- **主招牌大字**：直接用 Blender `FONT` 对象（`STHeiti Medium.ttc`）挤出倒角转 3D 立体网格，远中近距零模糊；同一店铺的横招、暖帘、竖牌必须统一店名。

---

## 三、Step 2 · Blender 5.2 微缩手办级真实建模

遵循 [`references/blender-pitfalls.md`](references/blender-pitfalls.md) 防坑清单，保持：
- **真结构**：真墙厚（`0.26–0.30m`）+ Boolean 挖深窗洞/门洞/内凹玄关 + 真实 3D 室内盒（折皱窗帘/柜台/灯具）；
- **圆润微缩倒角**：Bevel + Boolean 平面法线修平（大平面 `f.smooth = False` 消除斜向阴影条纹）；
- **机械与建筑合理性**：单车等机械件做真牙盘/链条/曲柄脚踏/双法兰花鼓；遮阳棚向外**下方**倾斜（`rot_x > 0`）无违和圆弧；外楼梯紧贴墙体收口（如 L 型 1F 墙）或双侧扶手；走廊摆件克制留白；
- **可编辑母版**：必须同时落盘 `.blend` 母版（含复用 `Shared-Props.blend` 实例化道具）与构造脚本 `.py`。

---

## 四、Step 3 · Gate 1 审图与手机端单文件图册

1. **Blender 5.2 Headless Cycles 规范**：使用 `CPU + OPENIMAGEDENOISE`（避开 macOS headless Metal 二进制缓存崩溃）+ `AgX - Punchy`，分单张调用渲染 5–6 张（日景 3/4 全景、门面近景、关键交互特写、楼梯/结构特写、俯视天台、**暖光夜景 3/4 全景**）到 `output/blender-qa/<asset>/`。
2. **亲自逐张 `read_file` 看图核验**所有结构细节与夜晚暖光溢出。
3. **一键打包单文件自包含手机审图页**：

```sh
/usr/local/bin/python3 .agents/skills/shiba-blender-pipeline/scripts/build_review_html.py \
  --dir output/blender-qa/<asset> \
  --title "<资产名> Gate 1 审图图册" \
  --summary "<本轮修改摘要>" \
  --out output/blender-qa/<asset>/review.html
```

---

## 五、Step 4 · Gate 2 游戏运行版导出与 Three.js 实机验收

**严禁直接把未转换的十几 MB Cycles `.blend` 母版裸导进游戏！** 必须运行运行版导出器完成以下 4 项转化（参考 [`art/town/haikaze-hero/export_game_ready.py`](../../../art/town/haikaze-hero/export_game_ready.py)）：

1. **Box 投射转真实 UV + HSV 暖色预烘焙**：glTF 2.0 不支持 Blender `BOX` 投射、`HueSaturation` 与 `AmbientOcclusion` 节点；导出脚本必须为建筑大面写入世界尺度 Box-UV、将 AgX 校准色预烘焙进压缩 WebP/PNG 贴图、并把法线贴图规范接到 `Normal Map → Principled BSDF.Normal`。
2. **合理减面与按材质合批**：合并同材质静态网格（将千级小物体压至 ~20–30 个共享材质网格），压低超高细分小件面数（单栋英雄楼运行版目标 ~5–9 万面、无 Draco 压缩即可压在 ~2–4 MB，100% 兼容离线单文件构建 `dist/index.html` 与 GitHub Pages）。
3. **暖光夜景联动命名**：保留 `Arch_Room_Interior`、`Arch_Shop_Interior`、`Arch_Curtain_*`、`Arch_Porch_Lamp`、`Arch_Sign_Board_Cream`、`Prop_Lantern_Paper`、`Prop_Showcase_Glow` 等标准自发光材质名，由 Three.js `time-of-day.js` 按时段动态调节自发光强度并搭配少量关键暖光池与 PMREM 环境反射。
4. **实机 QA**：运行 `npm test`、`npm run build` 与 [`shiba-visual-qa`](../shiba-visual-qa/SKILL.md) 核验晨/昏/夜全时段实机截图、零报错、Draw Calls ≤ 250 与 60 FPS，推送 `shiba-delivery-update` 后在 GitHub Pages 复检。
