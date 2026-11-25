# 阿柴快送 · Shiba Delivery

一款偏严肃、带黑色幽默的第三人称 3D 骑行送单独立游戏：被裁员的程序员柴犬阿柴骑着二手电动车，从滨海坡道旧镇一路送外卖，想重新住回市中心。

**发行方向：PC / Steam 优先。** 这指正式发行平台，**不意味着放弃网页版开发工具**：开发阶段持续提供可操作的浏览器试玩 UI 与可点击的调试入口。

> 当前版本为 Clean Slate 重构后的 **榕湾海风街角 + 首栋 Gate 2 标杆建筑「海风庄」**（纯 Blender 微缩手办精建 + AI 手绘 2D PBR 贴图 + 共享公模库）；早期旧老街/十字路口/乡道原型已归档于 Git 标签 `archive/early-prototype`。产品方向与范围以 [现行游戏设计](docs/GAME.md) 为准。

## 当前已实现的内容

- **榕湾海风街角 & 首栋标杆建筑「海风庄」**：北侧绿草山坡与观海下坡大道 → 街角标杆商住楼「海风庄」（1F「海风拉面」+ 贴墙外挂钢楼梯 + 可步行 2F 201/202 开放式走廊与门旁黄铜外卖挂钩 + 共享公模单车/贩卖机/灯笼/黑板）→ 海岸铁道口 → 海滨观海大道与闪光蓝海。
- **完整骑行、步行爬楼梯与试玩派单**：开局默认停在海风庄街角，可直接自由骑行下坡看海、按 `E` 下车走西侧外挂铁楼梯上二楼，也可展开骑手手机接取「海风拉面 → 201 室挂钩」「海风拉面 → 观海栈台」「海风拉面 → 202 室」3 张订单，体验门口取餐、车尾保温箱装取、爬楼梯交餐与账单结算。
- **4 时段柔和绘本风 & 夜间暖光**：支持早晨 / 中午 / 傍晚 / 夜晚实时光照切换，夜晚呈现「海风拉面」店面暖光溢出、二楼背光窗帘、纸灯笼、贩卖机微光与小摩托 4 层头灯照射效果。

## 网页试玩

[在 GitHub Pages 上试玩最新版本](https://perinchiang.github.io/shiba-delivery/)。推送到 `shiba-delivery-update` 后，GitHub Actions 自动运行测试、构建并发布。

### 本地运行

需要 Node.js 环境。在仓库根目录运行：

```sh
npm ci
npm run dev
```

打开终端提供的本地地址：
- **PC 操作**：**W/S** 加速与刹车（停稳继续按住倒车）、**A/D** 转向、**E** 上下车与互动、**V** 近看阿柴、**M** 打开榕湾海风街角地图、**Q** 展开/收起骑手手机。鼠标拖动可 360° 转视角，**[ / ]** 微调，**R** 或双击回正。
- **触屏操作**：左下虚拟摇杆控制移动，右下按钮执行互动，底部骑手手机可轻点或上划展开接单。

```sh
npm test
npm run playtest -- http://127.0.0.1:5173/
npm run build
```

- `npm test`：验证海风庄派单状态机、2F 外楼梯高度与碰撞、坡道骑行物理，以及阿柴/小摩托骨架、袖口、配件与骑姿接触约束。
- `npm run playtest -- <地址>`：使用本机 Chrome Metal 实机冒烟校验地图、360° 拖动镜头、接单与下车。
- `npm run build`：输出 `dist/index.html` 离线单文件构建。

## 开发期调试面板

本地开发服务与 GitHub Pages 试玩页左上角提供「调试面板」（普通离线单文件构建默认隐藏，可加 `?debug=1` 启用）：
- 实时查看 **FPS 与每帧 draw calls**；
- 一键切换 **渲染风格**（A 柔和绘本 / 原版）与 **4 时段光照**（早晨 / 中午 / 傍晚 / 夜晚 + 0–1 连续滑条），也支持链接参数 `?tod=night`、`?tod=dusk` 直达夜景/黄昏；
- 场景瞬移：`海风庄·全景街角`、`海风庄·立即骑行`、`海风拉面·1F 门面近景`、`海风庄·外挂铁楼梯与 2F 走廊`、`榕湾观海坡道`、`海滨观海大道`、`试玩派单`、`阿柴正面/骑姿`。

## 文档与美术资产

- [`docs/GAME.md`](docs/GAME.md)：唯一现行产品设计基线；区分已确定、待验证、当前原型及明确不做。
- [`docs/ROADMAP.md`](docs/ROADMAP.md)：开发阶段顺序、当前进度与各阶段过关标准。
- [`docs/ART-BIBLE.md`](docs/ART-BIBLE.md)：纯 Blender + AI PBR 贴图 + 两关制验收美术规范。
- [`art/CATALOG.md`](art/CATALOG.md)：全仓库共享公模库、AI 贴图库与标杆建筑实测台账。
- [`art/town/haikaze-hero/Haikaze-Hero.blend`](art/town/haikaze-hero/Haikaze-Hero.blend)：海风庄高精母版；[`export_game_ready.py`](art/town/haikaze-hero/export_game_ready.py) 一键导出运行版 `haikaze-hero-game.glb`。
- [`art/shared/props/Shared-Props.blend`](art/shared/props/Shared-Props.blend)：全游戏首批 10 件共享公模源文件。
- [`art/morning/README.md`](art/morning/README.md)：阿柴主角与临时小摩托的 Blender 骨架、动画与导出说明。
- [`AGENTS.md`](AGENTS.md)：AI 开发与文档同步规则。
