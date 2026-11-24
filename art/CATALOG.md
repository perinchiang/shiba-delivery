# 阿柴快送｜资产台账与公模复用目录（Art Catalog）

> 本文是《阿柴快送》**全仓库唯一资产索引与公模复用台账**。盘点基线：2026-11-24（只记录磁盘实测存在的文件、节点与材质数；未迁移的历史资产保留原位，渐进收敛，不强制一次性推倒重做）。相关规范见 [`docs/ART-BIBLE.md`](../docs/ART-BIBLE.md) 与 [`art/AGENTS.md`](AGENTS.md)。

---

## 1. 使用铁律（先查库，三选一）

任何 Agent 接到 3D 模型、场景道具、角色或贴图任务时，**开工前必须先读本文件**，并在方案或前置规格卡中明确写明以下三选一决策：

1. **直接复用**：现有公模 / 套件节点可直接满足需求，仅调整摆位、旋转、缩放或实例化调色。
2. **公模换贴图 / 换局部配件**：复用现有基础公模，通过更换 UV 贴图、贴纸图集或头/配饰部件产出变体（例如：易拉罐公模换饮料贴纸、贩卖机公模换面板图集、角色布娃娃素体换头部与服饰贴图）。
3. **确认库中缺失才新建**：仅当台账确无可用公模时才新建资产；凡具有通用性的小道具或角色素体，**必须导出为独立可复用资产**并同步登记回本表，严禁将通用道具焊死在单栋建筑脚本内部。

---

## 2. 目标复用目录结构（渐进迁移）

- `art/shared/props/` — 全游戏唯一街头与室内公模道具库（自动贩卖机、空调外机、盆栽、饮料筐、自行车、电线杆、转角镜、易拉罐/餐盒、招牌框等；当前待抽离迁移）。
- `art/shared/characters/` — 通用角色「布娃娃」素体公模 + 共享骨架（供后续小动物与居民 NPC 换头、换耳尾与换服饰贴图；当前待建立）。
- `art/shared/textures/` — 真实 2D 风格化 PBR 贴图与共享图集 / Trim Sheet（Color / Roughness / Normal / Emissive；支持 AI 生图精修、手绘或风格化材质库）。
- `art/<zone>/` — 区域专属建筑壳体模块与少数英雄地标（如 [`art/town/`](town/coastal-town-kit.glb)）。

---

## 3. 现存资产实测台账（2026-11-24 盘点）

### 3.1 角色与车辆（`art/morning/`）

| 资产文件 | 体积 / 结构（实测） | 源文件与配套贴图 | 用途与复用说明 |
|---|---|---|---|
| [`morning/shiba-courier.glb`](morning/shiba-courier.glb) | `2.3M` · 43 nodes · 23 mats | [`morning/Rongwan-Courier.blend`](morning/Rongwan-Courier.blend) + [`shiba.py`](morning/shiba.py) / [`build.py`](morning/build.py)；贴图 [`Shiba_Urajiro.png`](morning/Shiba_Urajiro.png) (`6.0K`)、[`Plume_Coat.png`](morning/Plume_Coat.png) (`56K`)、[`Kerchief_Paisley.png`](morning/Kerchief_Paisley.png) (`16K`) | **阿柴主角**（`0.84` 缩放基线）。造型已冻结，修改须保活骑姿与接触锚点断言 |
| [`morning/monkey-delivery.glb`](morning/monkey-delivery.glb) | `2.3M` · 41 nodes · 14 mats | [`morning/Rongwan-Courier.blend`](morning/Rongwan-Courier.blend) + [`motorcycle.py`](morning/motorcycle.py) / [`motorcycle_detail.py`](morning/motorcycle_detail.py) | **现行小摩托**（含 `Seat_Contact` / `Grip_L/R` / `Footrest_L/R` / `Cargo_Floor` 等锚点）。后续按 [`docs/ROADMAP.md`](../docs/ROADMAP.md) 择机替换为明黄二手电动车 |

> **缺口标注**：仓库尚无通用 NPC 居民「布娃娃」素体公模；后续试点 NPC 时须直接建于 `art/shared/characters/`，不要为单个路人另起一套不可复用骨架。

---

### 3.2 1 号箱庭 · 榕湾海滨坡道镇（`art/town/coastal-town-kit.glb`）

- **文件规格（实测）**：`3.7M` · 13 nodes · 4 共享材质（`CoastalTown_VertexColor`、`Hero_Plaster`、`Hero_Metal`、`Hero_Atlas`）
- **源文件与配套图集**：[`town/coastal-town-kit.py`](town/coastal-town-kit.py)；配套细节图集 [`src/morning/coastal-detail-atlas.js`](../src/morning/coastal-detail-atlas.js)（当前为程序化 Canvas，后续可直接替换为 `art/shared/textures/` 真实 PNG PBR 图集而保持 UV 不变）
- **已包含节点（13 个）**：
  - 英雄地标：`Town_Hero_Haikaze`（海风庄 2.5 层商住楼 + 可步行外挂铁楼梯）
  - 区域建筑模块：`Town_Shop_Corner`、`Town_Shop_Tall`、`Town_Shop_Konbini`、`Town_House_SlopeA`、`Town_House_SlopeB`
  - 交通与街具：`Town_Tram_Car`、`Town_Crossing_Bar`、`Town_Crossing_Post`、`Town_Utility_Pole`、`Town_Bus_Stop`、`Town_Battery_Cabinet`、`Town_Vending`
- **待拆债提示**：`Town_Hero_Haikaze` 内目前直接内嵌了真叶片盆栽、镂空汽水筐、复古单车、A 字菜单牌、空调外机与双色贩卖机；后续扩展整片街区或新增店铺时，应先将这批通用小道具抽离为 `art/shared/props/` 独立公模，**严禁在相邻建筑里再写一遍**。

---

### 3.3 历史 / 参考场景资产（只读参考，勿复制造轮子）

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
