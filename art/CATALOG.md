# 阿柴快送｜资产台账与公模复用目录（Art Catalog）

> 本文是《阿柴快送》**全仓库唯一资产索引与公模复用台账**（2026-11-25 随美术管线彻底改版同步更新：仅记录磁盘实测文件；全面定调「纯 Blender 精建 + AI 2D PBR 贴图 + 共享公模库」，旧纯代码过渡资产全部标为冻结待替换删除）。相关规范见 [`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/AGENTS.md`](AGENTS.md)。

---

## 1. 使用铁律（先查库，三选一）

任何 Agent 接到 3D 模型、场景道具、角色或贴图任务时，**开工前必须先读本文件**，并在方案或前置规格卡中明确写明以下三选一决策：

1. **直接复用**：现有公模 / 套件节点可直接满足需求，仅调整摆位、旋转、缩放或实例化调色。
2. **公模换贴图 / 换局部配件**：复用现有基础公模，通过更换 UV 贴图、贴纸图集或头/配饰部件产出变体（例如：易拉罐公模换饮料贴纸、贩卖机公模换面板图集、角色布娃娃素体换头部与服饰贴图）。
3. **确认库中缺失才新建**：仅当台账确无可用公模时才新建资产；凡具有通用性的小道具或角色素体，**必须导出为独立可复用资产**并同步登记回本表，严禁将通用道具焊死在单栋建筑脚本内部。

---

## 2. 目标复用目录结构（渐进迁移）

- `art/shared/props/` — 全游戏唯一街头与室内公模道具库（**已落地首批 10 件微缩手办级公模**，见 §3.0）。
- `art/shared/characters/` — 通用角色「布娃娃」素体公模 + 共享骨架（供后续小动物与居民 NPC 换头、换耳尾与换服饰贴图；当前待建立）。
- `art/shared/textures/` — 真实 2D 风格化 PBR 贴图与独立招牌/海报 PNG 槽位（**已落地 10 张 `gpt-image-2.6-sunburst` AI 手绘原图 + 23 张合成/衍生法线与招牌贴图，见 §3.0**；支持同名 `custom_<文件名>` 一键热覆盖）。
- `art/<zone>/` — 区域专属建筑壳体模块与少数英雄地标（如 [`art/town/haikaze-hero/`](town/haikaze-hero/haikaze-hero.glb) 与 [`art/town/coastal-town-kit.glb`](town/coastal-town-kit.glb)）。

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
  - [`shared/props/prop_chochin_lantern.glb`](shared/props/prop_chochin_lantern.glb)（`72K`）— 车削竹骨纹日式纸灯笼 + 黑漆上下盖 + 铁艺壁挂架 + 暖光次表面散射与绯红流苏
- **共享独立 2D 贴图库（`art/shared/textures/`，10 张 `gpt-image-2.6-sunburst` AI 手绘原图 `ai_*.png` + [`compose_ai_textures.py`](shared/textures/compose_ai_textures.py) 精排中字与衍生法线/粗糙度 + [`build_textures.py`](shared/textures/build_textures.py) 门牌/地垫，均支持 `custom_<文件名>` 热替换）**：
  - 建筑与材质 PBR 组（AI 原画 + 衍生 Normal/Roughness）：
    - 奶油手涂灰泥：[`tex_plaster_cream.png`](shared/textures/tex_plaster_cream.png) + [`tex_plaster_cream_normal.png`](shared/textures/tex_plaster_cream_normal.png)（原图 [`ai_plaster_cream.png`](shared/textures/ai_plaster_cream.png)）
    - 鼠尾草绿混凝土：[`tex_sage_concrete.png`](shared/textures/tex_sage_concrete.png) + [`tex_sage_concrete_normal.png`](shared/textures/tex_sage_concrete_normal.png)（原图 [`ai_sage_concrete.png`](shared/textures/ai_sage_concrete.png)）
    - 暖调雪松木板：[`tex_wood_cedar.png`](shared/textures/tex_wood_cedar.png) + [`tex_wood_cedar_normal.png`](shared/textures/tex_wood_cedar_normal.png)（原图 [`ai_wood_cedar.png`](shared/textures/ai_wood_cedar.png)）
    - 倒角石板地砖：[`tex_deck_tiles.png`](shared/textures/tex_deck_tiles.png) + [`tex_deck_tiles_normal.png`](shared/textures/tex_deck_tiles_normal.png)（原图 [`ai_deck_tiles.png`](shared/textures/ai_deck_tiles.png)）
    - 釉面粉彩马赛克瓷砖 PBR 三件套：[`tex_mosaic_tiles.png`](shared/textures/tex_mosaic_tiles.png) + [`tex_mosaic_tiles_normal.png`](shared/textures/tex_mosaic_tiles_normal.png) + [`tex_mosaic_tiles_roughness.png`](shared/textures/tex_mosaic_tiles_roughness.png)（原图 [`ai_mosaic_tiles.png`](shared/textures/ai_mosaic_tiles.png)）
    - 织物粗麻青海波暖帘与法线（统一店名「海风拉面」）：[`tex_noren_4panel.png`](shared/textures/tex_noren_4panel.png) + [`tex_noren_normal.png`](shared/textures/tex_noren_normal.png)（原图 [`ai_noren_fabric.png`](shared/textures/ai_noren_fabric.png)）
  - AI 手绘海报、菜单与木竖牌（后期压印清晰中文排版，零乱码）：[`tex_menu_chalkboard.png`](shared/textures/tex_menu_chalkboard.png)、[`tex_poster_summer.png`](shared/textures/tex_poster_summer.png)、[`tex_vending_poster_white.png`](shared/textures/tex_vending_poster_white.png)、[`tex_vending_poster_pink.png`](shared/textures/tex_vending_poster_pink.png)、[`tex_plaque_vertical.png`](shared/textures/tex_plaque_vertical.png)（AI 雪松木底板「海风面馆」）
  - 清晰门牌与地垫平面图：[`tex_plaque_haikaze.png`](shared/textures/tex_plaque_haikaze.png)、[`tex_apt_plaque_201.png`](shared/textures/tex_apt_plaque_201.png)、[`tex_apt_plaque_202.png`](shared/textures/tex_apt_plaque_202.png)、[`tex_welcome_mat.png`](shared/textures/tex_welcome_mat.png)（旧扁平招牌 [`tex_sign_ramen.png`](shared/textures/tex_sign_ramen.png) 已由 Blender 3D 立体字招牌替代）

### 3.1 独立微缩手办版地标建筑（`art/town/haikaze-hero/` — v4 Gate 1 精修完成，待进 Gate 2）

- [`town/haikaze-hero/Haikaze-Hero.blend`](town/haikaze-hero/Haikaze-Hero.blend)（`16M`，高精母版实测 `423,108` 三角面）+ [`town/haikaze-hero/haikaze-hero.glb`](town/haikaze-hero/haikaze-hero.glb)（`14M`，Draco 压缩高精母版）+ 源脚本 [`town/haikaze-hero/build_haikaze_hero.py`](town/haikaze-hero/build_haikaze_hero.py) + 验收渲染脚本 [`town/haikaze-hero/render_qa_shots.py`](town/haikaze-hero/render_qa_shots.py)
- **已定调且全部完成自查的标杆工艺（v4）**：
  - 全建筑使用 `gpt-image-2.6-sunburst` AI 手绘 PBR 贴图 + 真实厚墙 Boolean 深凹门窗与室内纵深（夜间室内/店面暖光真实透出）；
  - **1F L 型墙体 + 零缝贴墙外挂铁楼梯**：东南角留出内凹贩卖机与空调壁龛，楼梯内侧斜梁紧贴 1F 墙面零缝收口（保留外侧单扶手 + 3 处墙体螺栓支架），且完全保留既有步行碰撞坐标；
  - **3D 立体字「海风拉面」主招牌 + 全店店名统一**：深胡桃木框 + 暖奶油漆板 + 3D 立体挤出倒角「海风拉面」+ 3D 浮雕拉面碗徽章与鹅颈灯；暖帘统一为「海风拉面」、AI 木纹竖牌统一为「海风面馆」；
  - **下倾无圆弧帆布遮阳棚**：正确向外下方倾斜（`+0.46 rad`），移除违和圆弧改为利落直边日式帆布垂帘；
  - **二楼克制留白**：精简为 2 盆绿植，凸显 201/202 房门、门铃、黄铜圆形外卖挂钩与牛皮纸外卖袋挂接；天台保持外楼梯只到 2F 的清爽景观定位。
  - 全部街头道具均从 `Shared-Props.blend` 实例化引用。待 Patrick 终审 v4 渲染图后即可提交母版并进入 Gate 2（减面合批压缩接入 Three.js）。

### 3.2 角色与车辆（`art/morning/`）

| 资产文件 | 体积 / 结构（实测） | 源文件与配套贴图 | 现状工艺与后续规划 |
|---|---|---|---|
| [`morning/shiba-courier.glb`](morning/shiba-courier.glb) | `2.3M` · 43 nodes · 23 mats | [`morning/Rongwan-Courier.blend`](morning/Rongwan-Courier.blend) + [`shiba.py`](morning/shiba.py) / [`build.py`](morning/build.py)；贴图 [`Shiba_Urajiro.png`](morning/Shiba_Urajiro.png) (`6.0K`)、[`Plume_Coat.png`](morning/Plume_Coat.png) (`56K`)、[`Kerchief_Paisley.png`](morning/Kerchief_Paisley.png) (`16K`) | **阿柴主角**（`0.84` 缩放基线）。现为早期 Blender Python 数学造型 + 24 骨骨架 + 纯色/基础程序化毛色贴图；造型、无缝圆肩与骑姿动画扎实且已冻结，后续只需择机补充与新场景匹配的 PBR 材质细节 |
| [`morning/monkey-delivery.glb`](morning/monkey-delivery.glb) | `2.3M` · 41 nodes · 14 mats | [`morning/Rongwan-Courier.blend`](morning/Rongwan-Courier.blend) + [`motorcycle.py`](morning/motorcycle.py) / [`motorcycle_detail.py`](morning/motorcycle_detail.py) | **现行临时小摩托**（纯 Python 脚本生成、14 个纯色材质无贴图，含 `Seat_Contact` / `Grip_L/R` / `Footrest_L/R` / `Cargo_Floor` 等锚点）。后续直接按**新版纯 Blender + AI PBR 贴图管线**重做圆润明黄二手电动车替换 |

> **缺口标注**：仓库尚无通用 NPC 居民「布娃娃」素体公模；后续试点 NPC 时须直接建于 `art/shared/characters/` 并走新版 Blender + PBR 贴图管线，不要为单个路人另起一套不可复用骨架。

---

### 3.3 待淘汰旧过渡资产 · 1 号箱庭旧纯代码套件（`art/town/coastal-town-kit.glb` — 已冻结，待逐批替换删除）

- **状态声明（2026-11-25 冻结淘汰）**：本套资产由早期纯代码方块脚本 [`town/coastal-town-kit.py`](town/coastal-town-kit.py) 与程序化 Canvas 图集 [`src/morning/coastal-detail-atlas.js`](../src/morning/coastal-detail-atlas.js) 产出（`3.7M` · 13 nodes · 4 材质）。**禁止再向其新增建筑或打视觉补丁**，仅作当前线上原型占位，待 `art/town/haikaze-hero/` 与新版 Blender+AI 区域模块套件在 Gate 2 逐批接入后整套删除。
- **当前占位节点（13 个）**：`Town_Hero_Haikaze`（首个替换目标）、`Town_Shop_Corner`、`Town_Shop_Tall`、`Town_Shop_Konbini`、`Town_House_SlopeA`、`Town_House_SlopeB`、`Town_Tram_Car`、`Town_Crossing_Bar`、`Town_Crossing_Post`、`Town_Utility_Pole`、`Town_Bus_Stop`、`Town_Battery_Cabinet`、`Town_Vending`。

---

### 3.4 历史 / 参考场景资产（只读参考，勿复制造轮子）

| 资产文件 | 体积 / 结构（实测） | 包含节点 / 贴图 | 当前状态 |
|---|---|---|---|
| [`town/coastal-houses.glb`](town/coastal-houses.glb) | `923K` · 11 nodes · 11 mats（源：[`coastal-houses.py`](town/coastal-houses.py)） | `House_A/B/C`、`Lot_Wall_Brick/Cream/Timber`、`Prop_ACUnit`、`Prop_CitrusTree`、`Prop_CornerMirror`、`Prop_UtilityPole`、`Prop_VendingMachine` | 早期海滨住宅样角；若要复用其中道具应收敛到 `art/shared/props/` |
| [`town/hillside-village.glb`](town/hillside-village.glb) | `740K` · 8 nodes · 1 mat `Ghibli_Village_Shared_Mat`（源：[`hillside-village.py`](town/hillside-village.py)） | `Ghibli_Cottage_A/B/C`、`Ghibli_Fence_Seg`、`Ghibli_Rock_Cluster`、`Ghibli_Signpost`、`Ghibli_Windmill_Blades/Tower` | 已归档的远郊村落参考 |
| [`countryside/countryside-kit.glb`](countryside/countryside-kit.glb) | `705K` · 12 nodes · 12 mats（源：[`kit.py`](countryside/kit.py)） | `Bollard`、`ReedClump`、`RiceLow`、`RiceTall_A/B`、`RoadFlowers`、`RoadMirror`、`RoadTuft`、`Tree_Bank`、`Tree_Round`、`UtilityPole`、`UtilityPole_Lamp`；贴图 `broadleaf.png` (`375K`)、`harvest-rice.png` (`182K`)、`harvest-sky.jpg` (`59K`) | 已冻结的乡道样段，不再扩建 |
| [`countryside/bridge-buffalo.glb`](countryside/bridge-buffalo.glb) | `159K` · 1 node · 1 mat `Morning granite`（源：[`bridge-buffalo.py`](countryside/bridge-buffalo.py)） | `Rongwan bridge · reclining water buffalo` | 已冻结乡道河桥石水牛 |
| [`bun-shop/steamers.glb`](bun-shop/steamers.glb) | `807K` · 1 node · 0 mats（源：[`steamers.py`](bun-shop/steamers.py)） | `Morning steamers` | 旧老街包子铺蒸笼道具 |

---

## 4. 已知重复资产警示（严禁继续新增同名重复件）

盘点中已发现以下通用街头道具在多个旧/新资产中重复出现：

1. **自动贩卖机（3 处重复）**：`Town_Vending`（`coastal-town-kit.glb`）、`Prop_VendingMachine`（`coastal-houses.glb`）、`Town_Hero_Haikaze` 内嵌双色贩卖机。
2. **空调外机（2 处重复）**：`Prop_ACUnit`（`coastal-houses.glb`）、`Town_Hero_Haikaze` 内嵌空调外机。
3. **电线杆（3 处重复）**：`Town_Utility_Pole`（`coastal-town-kit.glb`）、`Prop_UtilityPole`（`coastal-houses.glb`）、`UtilityPole` / `UtilityPole_Lamp`（`countryside-kit.glb`）。
4. **转角反光镜（2 处重复）**：`Prop_CornerMirror`（`coastal-houses.glb`）、`RoadMirror`（`countryside-kit.glb`）。

**后续硬要求**：只要再次涉及以上任意道具（或盆栽、饮料筐、自行车、易拉罐、餐盒、招牌框等新通用道具），**一律先抽离/收敛到 `art/shared/props/` 成为全游戏唯一公模**，再靠实例化与换贴图复用，绝不继续在各模块里另建一套。
