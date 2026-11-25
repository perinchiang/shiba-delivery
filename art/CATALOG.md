# 阿柴快送｜资产台账与公模复用目录（Art Catalog）

> 本文是《阿柴快送》**全仓库唯一资产索引与公模复用台账**（2026-11-25 随迁移至 **Godot 4.7 桌面端 Steam 路线** 同步更新：仅记录磁盘实测文件；全面定调「纯 Blender 精建 + AI 2D PBR 贴图 + 共享公模库 → Godot 4.7 原生 `.blend` 直导」；早期纯代码原型与 Three.js 网页版已分别归档至 Git 标签 `archive/early-prototype` 与 `archive/threejs-web-final`）。相关规范见 [`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/AGENTS.md`](AGENTS.md)。

---

## 1. 使用铁律（先查库，三选一）

任何 Agent 接到 3D 模型、场景道具、角色或贴图任务时，**开工前必须先读本文件**，并在方案或前置规格卡中明确写明以下三选一决策：

1. **直接复用**：现有公模 / 套件节点可直接满足需求，仅调整摆位、旋转、缩放或实例化调色。
2. **公模换贴图 / 换局部配件**：复用现有基础公模，通过更换 UV 贴图、贴纸图集或头/配饰部件产出变体（例如：易拉罐公模换饮料贴纸、贩卖机公模换面板图集、单车换漆面材质槽、角色布娃娃素体换头部与服饰贴图）。
3. **确认库中缺失才新建**：仅当台账确无可用公模时才新建资产；凡具有通用性的小道具或角色素体，**必须导出为独立可复用资产**并同步登记回本表，严禁将通用道具焊死在单栋建筑脚本内部。

---

## 2. 目标复用目录结构

- `art/shared/props/` — 全游戏唯一街头与室内公模道具库（**已落地首批 10 件微缩手办级公模**，见 §3.0）。
- `art/shared/characters/` — 通用角色「布娃娃」素体公模与主角母版（**已落地胖萌 2.0 头身糯米手办级主角 [`art/shared/characters/shiba/Shiba-Hero.blend`](shared/characters/shiba/Shiba-Hero.blend)**，后续小动物居民 NPC 复用该骨架与比例换头/换耳尾/换装）。
- `art/shared/textures/` — 真实 2D 风格化 PBR 贴图与独立招牌/海报 PNG 槽位（**已落地 12 张 `gpt-image-2.6-sunburst` AI 手绘原图 + 合成/衍生法线与招牌贴图**，含新增的柴犬毛绒与外卖冲锋衣面料 PBR，见 §3.0；支持同名 `custom_<文件名>` 一键热覆盖；复用流程见 [`.agents/skills/shiba-blender-pipeline/SKILL.md`](../.agents/skills/shiba-blender-pipeline/SKILL.md)）。
- `art/<zone>/` — 区域专属建筑壳体模块与少数英雄地标（当前已实装首栋 Gate 2 标杆建筑 [`art/town/haikaze-hero/Haikaze-Hero.blend`](town/haikaze-hero/Haikaze-Hero.blend)，经 [`tools/sync_blender_to_godot.py`](../tools/sync_blender_to_godot.py) 原生直导入 [`game/assets/buildings/Haikaze-Hero.blend`](../game/assets/buildings/Haikaze-Hero.blend)）。

---

## 3. 现存资产实测台账（2026-11-25 更新）

### 3.0 全游戏共享公模库与独立贴图库（`art/shared/` — 优先直接复用！）

- **共享公模总源文件**：[`shared/props/Shared-Props.blend`](shared/props/Shared-Props.blend)（`6.0M`）+ 生成脚本 [`shared/props/build_shared_props.py`](shared/props/build_shared_props.py)
- **独立公模 `.glb` 清单（10 件，微缩手办圆润倒角 + 真结构建模 + AI 贴图，支持一键换色/换图变体）**：
  - [`shared/props/prop_vending_white.glb`](shared/props/prop_vending_white.glb)（`1.2M`）& [`shared/props/prop_vending_pink.glb`](shared/props/prop_vending_pink.glb)（`1.2M`）— 真实 Boolean 凹陷透明展示窗 + 18 个车削 3D 饮料瓶罐 + 发光按键 + AI 海浪灯塔 / 樱花白桃海报槽（换 `tex_vending_poster_*.png` 即可衍生新机）
  - [`shared/props/prop_ac_unit.glb`](shared/props/prop_ac_unit.glb)（`328K`）— 真凹陷风扇腔 + 3 叶螺旋桨 + 3D 同心圆铁丝网罩 + 曲线白包扎冷媒管与 L 型支架
  - [`shared/props/prop_door_hook.glb`](shared/props/prop_door_hook.glb)（`192K`）— **门框圆形黄铜外卖挂钩**（鼠尾草绿圆润底座 + 黄铜圆环挂钩 + 预埋空物体锚点 `Hook_Hang_Point`）
  - [`shared/props/prop_delivery_bag.glb`](shared/props/prop_delivery_bag.glb)（`69K`）— **牛皮纸拉面外卖袋**（皱褶牛皮纸袋身 + 双提手绳圈 + 绯红店铺封口贴纸，原点对齐提手拱顶，可直接挂接 `Hook_Hang_Point`）
  - [`shared/props/prop_bottle_crate.glb`](shared/props/prop_bottle_crate.glb)（`137K`）— 真镂空网格塑料饮料筐 + 6 个车削透明玻璃汽水瓶（`Shared-Props.blend` 内含黄/蓝/红/绿 4 色筐体与翠绿/波子蓝/琥珀玻璃瓶可换色槽）
  - [`shared/props/prop_potted_plant.glb`](shared/props/prop_potted_plant.glb)（`249K`）— 车削厚润红陶花盆 + 托盘 + 曲面立体阔叶 + 矮丛变体盛开黄/珊瑚小花
  - [`shared/props/prop_vintage_bicycle.glb`](shared/props/prop_vintage_bicycle.glb)（`1.8M`）— 复古女式单车：**真 24 齿 5 爪镂空大牙盘 + 12 齿后飞轮 + 真实上下链条 + 镀铬曲柄/双脚踏（含琥珀反光片）+ 车削箱型轮圈/双法兰花鼓/24 根交叉辐条与黄铜辐条帽 + 后货架斜撑与挡泥板撑杆** + AI 雪松木底铁丝前筐；单车漆面独立归入单材质槽（`Prop_Bike_Paint_Teal/Mustard/Coral/Cream`，`Shared-Props.blend` 内含芥末黄实装换色变体 `Prop_Vintage_Bicycle_Mustard`）
  - [`shared/props/prop_aframe_menu.glb`](shared/props/prop_aframe_menu.glb)（`2.5M`）— AI 雪松木 A 字黑板架 + 黄铜铰链拉链 + 粉笔槽与双色粉笔 + AI 粉彩手绘拉面黑板菜单
  - [`shared/props/prop_chochin_lantern.glb`](shared/props/prop_chochin_lantern.glb)（`72K`）— 车削竹骨纹日式纸灯笼 + 黑漆上下盖 + 铁艺壁挂架 + 暖光发光与绯红流苏
- **共享独立 2D 贴图库（`art/shared/textures/`，10 张 `gpt-image-2.6-sunburst` AI 手绘原图 `ai_*.png` + [`compose_ai_textures.py`](shared/textures/compose_ai_textures.py) 精排中字与衍生法线/粗糙度 + [`build_textures.py`](shared/textures/build_textures.py) 门牌/地垫，均支持 `custom_<文件名>` 热替换）**：
  - 建筑与材质 PBR 组（AI 原画 + 衍生 Normal/Roughness）：
    - 奶油手涂灰泥：[`tex_plaster_cream.png`](shared/textures/tex_plaster_cream.png) + [`tex_plaster_cream_normal.png`](shared/textures/tex_plaster_cream_normal.png)（原图 [`ai_plaster_cream.png`](shared/textures/ai_plaster_cream.png)）
    - 鼠尾草绿混凝土：[`tex_sage_concrete.png`](shared/textures/tex_sage_concrete.png) + [`tex_sage_concrete_normal.png`](shared/textures/tex_sage_concrete_normal.png)（原图 [`ai_sage_concrete.png`](shared/textures/ai_sage_concrete.png)）
    - 暖调雪松木板：[`tex_wood_cedar.png`](shared/textures/tex_wood_cedar.png) + [`tex_wood_cedar_normal.png`](shared/textures/tex_wood_cedar_normal.png)（原图 [`ai_wood_cedar.png`](shared/textures/ai_wood_cedar.png)）
    - 倒角石板地砖：[`tex_deck_tiles.png`](shared/textures/tex_deck_tiles.png) + [`tex_deck_tiles_normal.png`](shared/textures/tex_deck_tiles_normal.png)（原图 [`ai_deck_tiles.png`](shared/textures/ai_deck_tiles.png)）
    - 釉面粉彩马赛克瓷砖 PBR 三件套：[`tex_mosaic_tiles.png`](shared/textures/tex_mosaic_tiles.png) + [`tex_mosaic_tiles_normal.png`](shared/textures/tex_mosaic_tiles_normal.png) + [`tex_mosaic_tiles_roughness.png`](shared/textures/tex_mosaic_tiles_roughness.png)（原图 [`ai_mosaic_tiles.png`](shared/textures/ai_mosaic_tiles.png)）
    - 织物粗麻青海波暖帘与法线（统一店名「海风拉面」）：[`tex_noren_4panel.png`](shared/textures/tex_noren_4panel.png) + [`tex_noren_normal.png`](shared/textures/tex_noren_normal.png)（原图 [`ai_noren_fabric.png`](shared/textures/ai_noren_fabric.png)）
    - 柴犬暖橘短绒毛发 PBR：[`ai_shiba_fur.png`](shared/textures/ai_shiba_fur.png) + [`tex_shiba_fur_normal.png`](shared/textures/tex_shiba_fur_normal.png)
    - 明黄外卖防风衣织物 PBR：[`ai_jacket_fabric.png`](shared/textures/ai_jacket_fabric.png) + [`tex_jacket_fabric_normal.png`](shared/textures/tex_jacket_fabric_normal.png)
  - AI 手绘海报、菜单与木竖牌（后期压印清晰中文排版，零乱码）：[`tex_menu_chalkboard.png`](shared/textures/tex_menu_chalkboard.png)、[`tex_poster_summer.png`](shared/textures/tex_poster_summer.png)、[`tex_vending_poster_white.png`](shared/textures/tex_vending_poster_white.png)、[`tex_vending_poster_pink.png`](shared/textures/tex_vending_poster_pink.png)、[`tex_plaque_vertical.png`](shared/textures/tex_plaque_vertical.png)（AI 雪松木底板「海风面馆」）
  - 清晰门牌与地垫平面图：[`tex_plaque_haikaze.png`](shared/textures/tex_plaque_haikaze.png)、[`tex_apt_plaque_201.png`](shared/textures/tex_apt_plaque_201.png)、[`tex_apt_plaque_202.png`](shared/textures/tex_apt_plaque_202.png)、[`tex_welcome_mat.png`](shared/textures/tex_welcome_mat.png)

### 3.1 首栋标杆建筑 · 海风庄（`art/town/haikaze-hero/` → Godot 4.7 原生 `.blend` 已实装！）

| 文件 | 角色与规格（实测） | 用途 |
|---|---|---|
| [`town/haikaze-hero/Haikaze-Hero.blend`](town/haikaze-hero/Haikaze-Hero.blend) | `16M` · `423,108 tris` · 1,764 对象（源：[`build_haikaze_hero.py`](town/haikaze-hero/build_haikaze_hero.py)） | **Gate 1 Cycles 审图高精母版**（已通过终审，含 1F L 型贴墙楼梯、3D 立体字「海风拉面」、下倾直边遮阳棚、真牙盘链条单车、二楼精简绿植与全部共享公模引用） |
| [`../game/assets/buildings/Haikaze-Hero.blend`](../game/assets/buildings/Haikaze-Hero.blend) | **`23.4M` · `436,648 tris` · `3 multi-material meshes` · `106 PBR materials`**（源：[`tools/sync_blender_to_godot.py`](../tools/sync_blender_to_godot.py)） | **Gate 2 Godot 4.7 原生直导资产**（已实装于 [`game/scenes/RongwanCorner.tscn`](../game/scenes/RongwanCorner.tscn)，零减面、零光图花斑，在 Forward+ Metal 下配合 AgX + VoxelGI + SSIL + SSAO + SSR 实现 95%+ Cycles 实机画质） |

### 3.2 角色与车辆（`art/shared/characters/` & `art/morning/`）

| 资产文件 | 体积 / 结构（实测） | 源文件与配套贴图 | 现状工艺与后续规划 |
|---|---|---|---|
| [`shared/characters/shiba/Shiba-Hero.blend`](shared/characters/shiba/Shiba-Hero.blend) → [`../game/assets/characters/Shiba-Hero.blend`](../game/assets/characters/Shiba-Hero.blend) | **`6.0M` · `47,636 tris` · 2 蒙皮网格 · 25 骨 · 6 组 NLA 动画**（`1.0` 真世界比例：总高 `1.19m`、贴头半盔宽 `0.61m`） | 生成脚本 [`shared/characters/shiba/build_shiba_hero.py`](shared/characters/shiba/build_shiba_hero.py)；无缝里白面贴图 [`tex_shiba_face_urajiro.png`](shared/characters/shiba/tex_shiba_face_urajiro.png) + AI PBR [`ai_shiba_fur.png`](shared/textures/ai_shiba_fur.png) / [`ai_jacket_fabric.png`](shared/textures/ai_jacket_fabric.png) | **现行正式 2.0 头身胖萌糯米柴犬主角**（已原生直导入 Godot 4.7 Forward+）：宽糯米团子脸 + 立体奶油鼓嘴筒 + 零人脖子/珊瑚红领巾 + 梨形小肚子与超短胖萌小短腿 + 贴头半盔（比旧版 0.96m 窄 36%，走 1.15m 外楼梯两侧充裕）+ 可翻转复古护目镜 + 豆豆眉/腮红/3D `ω` 微笑/爪印胸章/大卷尾 + 6 组流畅骨骼动画，实机 62–70 FPS |
| [`morning/monkey-delivery.glb`](morning/monkey-delivery.glb) | `2.3M` · 41 nodes · 14 mats | [`morning/Rongwan-Courier.blend`](morning/Rongwan-Courier.blend) + [`motorcycle.py`](morning/motorcycle.py) / [`motorcycle_detail.py`](morning/motorcycle_detail.py) | **现行临时小摩托**（`0.84` 缩放过渡）。下一步按已敲定**方案 A**用纯 Blender + AI PBR 新建「圆润复古明黄平踏板外卖电动车（可掀座垫换电仓 + 后箱 + 手机支架 + 前挂钩）」直接替换 |
| [`morning/shiba-courier.glb`](morning/shiba-courier.glb) | `2.3M` · 43 nodes（已退役归档保留参考） | [`morning/Rongwan-Courier.blend`](morning/Rongwan-Courier.blend) | 早期大头盔过渡版（0.96m 头宽、43 拆件），已由新版 [`Shiba-Hero.blend`](shared/characters/shiba/Shiba-Hero.blend) 正式替换 |

> **缺口标注**：仓库尚无通用 NPC 居民换皮变体；后续试点 NPC 时直接复用 [`Shiba-Hero.blend`](shared/characters/shiba/Shiba-Hero.blend) 的 25 骨 2.5 头身骨架与 PBR 管线，归口 `art/shared/characters/`。

---

## 4. 已归档淘汰的早期过渡资产

以下早期纯代码/原型过渡资产已于 2026-11-25 Clean Slate 重构中**从活跃工作树彻底移除**，完整历史安全归档于 Git 标签 **`archive/early-prototype` (`3fe7028`)**：
- `art/town/coastal-town-kit.{py,glb}`、`art/town/coastal-houses.{py,glb}`、`art/town/hillside-village.{py,glb}`
- `art/countryside/`（乡道套件与石牛桥）、`art/bun-shop/`（旧老街蒸笼）
- `src/morning/coastal-detail-atlas.js`、`sign-kit.js`、`sign-paint.js` 及旧老街/十字路口/乡道/风车村场景代码

**硬要求**：后续新增任何通用街头/室内道具（电线杆、转角反光镜、垃圾桶、信箱、遮阳伞、桌椅、盆栽、车辆配件等），**一律先收录至 `art/shared/props/` 成为全游戏唯一公模**，严禁退回纯代码拼接或重复造轮子。
