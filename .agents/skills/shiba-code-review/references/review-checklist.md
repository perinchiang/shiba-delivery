# 《阿柴快送》代码审查清单（Three.js r187 + 游戏循环）

## 1. 架构与数据驱动边界
- [ ] 新增订单、地点、室内模板是否走数据驱动配置（`src/morning/orders.js` 等），而非往 `main.js` 写死分支？
- [ ] 新增场景/机位是否注册进 `src/morning/scene-debug.js`，且仅在 dev / `VITE_SCENE_DEBUG=1` / `?debug=1` 下显示？
- [ ] UI/HUD/React 对白组件是否保持无核心游戏状态归属（仅消费 state / 触发回调）？
- [ ] 无新增模块间循环依赖；改动严格落在 Task Brief 的 `In Scope` 内。

## 2. Three.js r187 与渲染性能红线
- [ ] **热路径零分配**：`setAnimationLoop` / 每帧更新函数中是否避免反复 `new THREE.Vector3`、`new THREE.Matrix4`、`new THREE.Quaternion`、`new THREE.Color`？
- [ ] **合批与实例化**：静态建筑/路面是否维持按材质合批；重复道具（树、灯、电杆、稻穗、护柱）是否使用 `InstancedMesh` 而非逐个 `Mesh`？
- [ ] **Three.js r177–r187+ 兼容避坑**（当前依赖 `three ^0.187.0`）：
  - 不使用已废弃的 `THREE.PCFSoftShadowMap`（改 `THREE.PCFShadowMap` 或 `VSMShadowMap`）；
  - 不使用已废弃的 `THREE.Clock`（改 `THREE.Timer` 或现有帧时间步进）；
  - 若手动关闭 `matrixAutoUpdate = false` 并手设矩阵，必须同步 `matrixWorldNeedsUpdate = true`；
  - r181+ PBR 粗糙材质反射能量略有提高，调材质时需在实机截图中确认未发灰过曝；
  - 动态创建并移除的几何体、材质、贴图（如临时 Canvas 贴图）有清理 `dispose()`，防止泄漏。
- [ ] **帧率无关性**：运动、相机插值、动画过渡均基于 clamped `dt`，不假设固定 60 Hz。

## 3. 3D 几何、物理与相机防坑
- [ ] **防 Z-fighting**：背板、招牌、门窗框、地面标线无共面贴合；双面薄片检查背面深度冲突。
- [ ] **高度与边界一致**：角色、车辆、阴影、步行/骑行切换在老街、十字路口、桥面和村道上采样同一高度与边界函数，下车不会掉地或被吸回老街。
- [ ] **防遮挡**：第三人称追车/步行镜头在路口建筑、红绿灯、树冠旁不穿墙、不完全遮住阿柴。

## 4. 双端输入与健壮性
- [ ] PC 键盘（W/S/A/D/E/V/M/Esc）与移动触屏（双指摇杆 + 动作键 + 手机/地图弹窗）行为一致，无焦点卡死或事件穿透。
- [ ] `npm test` 与 `npm run build`（单文件 `dist/index.html`）均能干净通过，无新增运行时控制台报错。
