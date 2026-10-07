# BlockFace · 事实验证记录

> huashu-design 核心原则 #0 要求：涉及具体产品/技术的事实性断言必须先验证，不靠训练语料。
> 以下全部结论来自 **2026-10-07 实测**（PowerShell 直连 + 自建 CDP 驱动真实 Chrome），非记忆。

## 1. Mojang 官方 API 实测结果

| 端点 | HTTP | 响应 | `Access-Control-Allow-Origin` |
|---|---|---|---|
| `api.mojang.com/users/profiles/minecraft/<name>` | 200 | JSON `{id,name}` | ❌ 无该响应头 |
| `api.mojang.com/minecraft/profile/lookup/name/<name>` | 200 | JSON `{id,name}` | ❌ 无 |
| `sessionserver.mojang.com/session/minecraft/profile/<uuid>` | 200 | JSON + base64 `textures` | ❌ 无 |
| `textures.minecraft.net/texture/<hash>` | 200 | `image/png` | ✅ `*` |

**结论：纯前端应用不能直接调用 Mojang 的账号/档案 API**（浏览器同源策略会拦截响应读取；这是"纯前端"这一约束下最硬的架构事实）。皮肤贴图 CDN 可以直连，且可安全绘入 canvas（不污染画布）。

## 2. CORS 友好的替代服务（实测）

| 服务 | 端点 | 返回 | CORS | 备注 |
|---|---|---|---|---|
| **playerdb.co** | `/api/player/minecraft/<name>` | JSON：`username` / `id` / `raw_id` / `avatar` / `skin_texture` / `properties[base64]` | ✅ `*` | **正版 ID 主路径**；不存在的 ID 返回 **400** |
| mc-heads.net | `/skin/<name>` | 原始皮肤 PNG | ✅ `*` | 不存在的 ID 返回 403；有速率限制 |
| minotar.net | `/skin/<name>` | 原始皮肤 PNG | ✅ `*` | 备选 |
| crafatar.com | `/skins/<uuid>`、`/renders/head/<uuid>` | 原始皮肤 PNG / 3D 头像渲染 | ✅ `*` | 需要 UUID；渲染结果可作交叉验证基准 |
| api.ashcon.app | `/mojang/v2/user/<name>` | JSON | — | 实测 **429 限流**，不作为主路径 |

实测样例（Notch）：`skin_texture = https://textures.minecraft.net/texture/292009a4925b58f02c77dadc3ecef07ea4c7472f64e0fdc32ce5522489362680`（526 bytes，`image/png`，CORS `*`）。

## 3. 皮肤贴图格式（决定"高清皮肤"怎么实现）

- 基准尺寸 **64×64**；旧版（≤1.7）为 **64×32**（仅上半部分，头部区域完整，含帽子层）。
- 高清皮肤（OptiFine 社区标准）：**128×128 / 256×256 / 512×512** —— 即 64 基准的整数倍。
- **实现要点**：所有 UV 坐标按 `scale = 宽度 / 64` 等比缩放即可同时支持全部档位，不需要为高清单独写一套代码。
- 头部区域（64 基准）：
  - 顶面 `(8,0,8,8)`、正面 `(8,8,8,8)`、左面 `(16,8,8,8)`、右面 `(0,8,8,8)`、背面 `(24,8,8,8)`
  - 帽子层（第二层）＝同区域 **x + 32**：顶 `(40,0)`、正面 `(40,8)`、左 `(48,8)`、右 `(32,8)`、背 `(56,8)`

实测已验证：256×256（scale 4）与 512×512（scale 8）填在同一 UV 区域时，渲染出的正面像素完全一致，证明折算与档位无关。

## 4. 内置皮肤的来源核实

网上流传的"Steve 灰头盔"曾一度被怀疑是坏数据，实测结论是**它就是官方原始数据**：

- 经 `sessionserver.mojang.com` 取档案 `8667ba71b85a4004af54457a9734eed7` → 贴图哈希 `60a5bd016b3c9a1b9272e4929e30827a67e4ebb219017adbbc4a4d22ebd5b1`；
- 该官方贴图与早年 crafatar 分发的 `steve.png` **逐像素完全一致（4096 个像素 0 处差异）**；
- 帽子层正面（8×8）里有 **22 个像素是不透明灰**，位置正好是额头两行加两侧鬓角：

      ########      # = 不透明灰
      ########      . = 全透明
      ##....##
      #......#
      ........

平铺直出时这层灰会盖住成品 **5632/16384 = 34%** 的面积，看上去像贴图坏了，而不像"头盔"。
因此应用**默认关闭**帽子层，属性面板里提供开关；打开后与 crafatar `?overlay` 的观感完全一致。
Alex 的正面第二层是全透明的，开关它不会有任何变化——这同样是官方数据。

## 5. 渲染器的正确性证据

头像就是皮肤正脸的 1:1 放大：取正面区域 (8,8,8,8)，按 scale = width / 64 换算到实际贴图，
再用最近邻放大到目标边长；帽子层取 (40,8,8,8)，按标准 source-over 合成。

三层证据：

1. **逐像素对齐**：端到端用例在 64 倍整数放大下逐一核对正面 8×8 共 64 个像素，与贴图对应像素完全一致（0/64 不一致）；
   同一轮另核对 192 个颜色通道，与 source-over 公式最大通道差为 0。
2. **与独立实现交叉验证**：crafatar 的平面头像由另一套代码渲染，与我们的输出逐像素完全相同
   （`/avatars/<uuid>?size=128` 与再加 `&overlay` 两种都测，128×128 = 16384 个像素，差异 0，最大通道差 0）。
3. **单元测试**：`npm test` 覆盖缩放/旋转/夹取数学、64×64 / 64×32 / 128 / 256 / 512 的档位判定与非法尺寸、预设文件的解析与消毒。

一个容易踩的坑：正脸 8 像素的**几何中心正好落在两个像素的交界上**，所以非整数倍放大时"正中心"取到的是左还是右取决于尺寸奇偶
（197px 时落在第 11 列，导出 2× 的 640px 落在第 12 列）。核对像素必须用 64 倍这样的整数倍，或者严格按渲染器的取整规则反算，
否则会把自己的取样误差当成渲染 bug。

## 6. 验证工具链（`tools/`）

本机装了 Chrome，因此不需要 Playwright/Puppeteer —— 直接用 Node 内置 `WebSocket` 连 Chrome DevTools Protocol：

| 文件 | 作用 |
|---|---|
| `cdp.mjs` | 驱动：`--remote-debugging-port=0` 起 Chrome，读 `DevToolsActivePort`（第 0 行端口、第 1 行浏览器路径），支持导航 / 求值 / 量 DOM / 截图 / **指定下载目录** |
| `e2e.js` | 在真实应用里跑的 28 项端到端断言（真点击、真指针事件、真导出，读 canvas 像素断言） |
| `probe-ui.js` | 界面指标：页面溢出、字号下限、emoji 数量、canvas 是否真画了东西 |
| `probe-export.js` | 走真实导出路径，验证 PNG 落盘且尺寸正确 |
| `probe-dist.js` | **纯 UI** 冒烟生产构建产物：不碰任何调试句柄，只做用户能做的事 |
| `run-e2e.mjs` | 起临时 dev server + 跑 e2e 一条龙（`npm run e2e`） |

踩过的坑：CDP 的 WebSocket 必须用浏览器级端点（`/devtools/browser/<uuid>`，来自 `DevToolsActivePort` 第 1 行）而不是页面端点；否则需要 `--remote-allow-origins=*` 才连得上。

## 7. 交付验证结果（最后一轮）

| 项目 | 结果 |
|---|---|
| 单元测试 | 37 passed / 3 files |
| 类型检查 | `vue-tsc -b --force` exit 0 |
| 生产构建 | 47 modules，`dist/assets/index-*.js` 115.63 kB（gzip 45.68 kB）、CSS 21.77 kB（gzip 4.83 kB） |
| 开发构建端到端 | **28 / 28 PASS** |
| 生产产物纯 UI 冒烟 | 4 / 4 —— 底图入文档、点卡片生成头像、150px 拖动位移与画布像素位移一致、导出落盘 |
| 真实导出文件 | `blockface-*.png`，2000×1280（1000×640 底图 × 2 倍率），78377 bytes |
| 界面指标（1440×900） | 页面零溢出、顶栏 60 / 侧栏 292 / 状态栏 32、最小字号 12px、emoji 0 个 |
