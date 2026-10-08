<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
# BlockFace · 技术设计与实现要点

本文档汇总了 BlockFace 在纯前端架构下关于数据源通信、皮肤贴图渲染、画布几何变换以及预设数据格式的核心技术事实与实现设计。

---

## 1. 皮肤数据源与网络架构

### 1.1 Mojang 官方 API 的 CORS 限制
BlockFace 为零后端的纯前端应用，受浏览器同源策略（SOP）约束：
- Mojang 官方用户档案接口（如 `api.mojang.com/users/profiles/minecraft/<name>` 和 `sessionserver.mojang.com`）未配置 `Access-Control-Allow-Origin` 响应头，纯前端无法直接通过 `fetch` 获取响应。
- 官方皮肤材质 CDN（`textures.minecraft.net/texture/<hash>`）支持跨域请求（`Access-Control-Allow-Origin: *`），可直接通过 `Image` 跨域安全绘入 Canvas。

### 1.2 客户端代理与多源解析策略
为在无自建后端的前提下支持正版玩家 ID 查询，应用采用具备公共 CORS 头的第三方开放接口，并设置自动回退：
1. **主路径**：`playerdb.co/api/player/minecraft/<name>`，返回包含 UUID 及皮肤贴图直链的 JSON 结构。
2. **备选路径**：`mc-heads.net/skin/<name>` 等直接返回皮肤 PNG 二进制流的服务。
3. **本地与直链**：支持用户直接拖拽上传本地 `.png` 文件，或直接提供任意支持跨域的图片直链。

---

## 2. 皮肤贴图规格与 UV 渲染算法

### 2.1 贴图规格与高清适配
Minecraft 皮肤采用标准化 UV 贴图排版：
- **基准规格**：`64×64` 像素（现代皮肤标准，含完整头、身、四肢及双层材质）。
- **旧版规格**：`64×32` 像素（Minecraft ≤ 1.7 旧版贴图，仅包含单层身体部位，但头部区域仍包含外层帽子）。
- **高清皮肤**：`128×128`、`256×256`、`512×512` 等（通常为 64 的整数倍）。
- **等比换算**：渲染引擎通过计算 `scale = image.width / 64` 计算缩放基准，所有像素坐标严格乘以 `scale` 进行映射，原生兼容所有规格。

### 2.2 头部 UV 映射与层级合成
正脸渲染的核心像素区间（以 64×64 为例）：
- **底层正脸 (Head Front)**：UV 区域 `(x: 8, y: 8, w: 8, h: 8)`。
- **帽子层 (Hat/Overlay)**：UV 区域 `(x: 40, y: 8, w: 8, h: 8)`（即底层 X 坐标 + 32）。

**渲染流程**：
1. 提取贴图中的正脸区域，使用 Canvas 离屏缓冲以**最近邻采样（Nearest-Neighbor）**放大至目标尺寸，避免像素模糊；
2. 若开启帽子层，将帽子层区域使用标准的 `source-over` 模式叠加在底层上方；
3. *注：关于官方 Steve 贴图帽子层中的灰色像素，系 Mojang 官方原始素材本身自带的不透明发际线像素，本应用忠实还原正版渲染，同时提供一键关闭开关。*

### 2.3 通用头像图片支持与混合插值决策
除 Minecraft 格式皮肤贴图外，应用支持用户上传任意常用格式（PNG / JPG / WebP 等）的普通头像图片作为图层贴图：
- **自适应居中适配**：图片等比缩放至图层包围盒内（contain 模式）居中绘制，自动适应横向或纵向比例。
- **双通道缩放与旋转插值算法**：
  - *Minecraft 像素皮肤*：正向正交渲染时严格采用**最近邻采样（Nearest-Neighbor）**（`imageSmoothingEnabled = false`），确保复古像素边缘锐利；
  - *通用头像图片与非正交旋转*：当素材为通用头像图片（`isCustomImage === true`）或发生非 90° 整倍数旋转（`rotation % 90 !== 0`）时，启用**高质量平滑插值（`imageSmoothingEnabled = true`）**，彻底消除旋转导致的阶梯锯齿与画面走样。
- **帽子层自动禁用**：通用头像图片非双层 UV 贴图，在属性检查器中自动禁用帽子层开关并标识为「无」。

### 2.4 离屏缓存与资源生命周期治理
- **HeadCache 离屏渲染缓存**：
  - 采用定长（48 张）的 LRU 缓存策略，键值结合 `skinId`、帽子层开关、尺寸与缩放系数；
  - 支持 `evictSkin(skinId)` 定点淘汰指定素材的所有离屏缓存，在素材删除时即时回收 Canvas 实例显存。
- **底图垃圾回收 (GC)**：`sweepUnusedBaseImages` 遍历当前状态及 `past`、`future` 撤销/重做栈中引用的底图 ID，自动销毁未被引用的历史大图。
- **素材撤销栈保护**：在单张删除 (`removeSkin`) 与闲置清理 (`clearUnusedSkins`) 中通过 `getReferencedSkinIds()` 递归检索所有历史快照图层，确保历史引用的素材不被意外销毁，杜绝撤销后图层变隐形的 Bug。

---

## 3. 画布坐标系与视口变换

### 3.1 坐标分层
BlockFace 采用双层画布设计：
- **文档层 (Document Canvas)**：物理分辨率等于底图真实像素（无底图时为默认尺寸如 1280×800）。所有图层的 `x, y, size` 均基于文档坐标系。
- **覆盖层 (Overlay Canvas)**：绘制选中外框、8个控制柄（缩放/边柄）与旋转旋钮。

### 3.2 基于光标锚点的视口缩放算法
为提供流畅的画布缩放体验，在视口中以光标为中心进行缩放时，必须同时补偿视口中心偏移量：
```ts
// 视图缩放系数 k (nextZoom / currentZoom)
// 补偿光标相对偏移与 Flex 居中布局带来的原点位移
viewport.x = cursor.x - (cursor.x - viewport.x) * k + (document.width * (k - 1)) / 2;
viewport.y = cursor.y - (cursor.y - viewport.y) * k + (document.height * (k - 1)) / 2;
```
- 视口平移与缩放仅作用于渲染视口，**不计入**撤销/重做操作历史（Undo/Redo History）。
- 图层的位置移动、尺寸缩放与旋转角度变更则作为文档操作进入历史记录栈。

---

## 4. 预设数据架构

预设（Preset）记录当前画板上所有头像图层的排版与材质数据，用于跨图片快速套用。

### 4.1 数据结构
预设以 JSON 格式存储或导出：
- **不包含底图与底图尺寸**：预设独立于图片，可应用于任何长宽比的底图。
- **内联 Base64 皮肤位图**：预设文件中直接嵌入皮肤图像的 Data URL，实现脱机自包含，导入即用。
- **相对/绝对坐标保护**：套用预设至不同尺寸的底图时，自动通过 `clampLayerToDocument` 将图层坐标限制在有效可视范围内。

### 4.2 存储配额与安全兜底
- **大图等比降采样**：预设保存与序列化时，对内嵌的通用头像图片强制等比限制在 512px 内，防止超出浏览器 LocalStorage 的 5MB 配额。
- **预设缺失兜底**：套用历史或外部预设时若遇材质加载失败，自动回退使用内置 Steve 皮肤兜底，确保图层位置、旋转与缩放参数不丢失。

---

## 5. 测试与工程质量保证

- **单元测试 (Vitest)**：7 个测试套件、88 个单测用例，全面覆盖：
  - 几何变换与手势数学 (`transform.spec.ts`, `gesture.spec.ts`)
  - 皮肤 UV 贴图与规格解析 (`texture.spec.ts`)
  - 预设导入导出、归一化与安全防注入 (`preset.spec.ts`)
  - 离屏缓存 LRU 淘汰与定点清除 (`headCache.spec.ts`)
  - 多数据源回退与超时控制 (`providers.spec.ts`)
  - 素材管理与撤销/重做历史引用保护 (`editor.spec.ts`)
- **端到端测试 (CDP-driven)**：通过 Node.js 原生 DevTools Protocol 驱动真实 Chrome，自动化测试全套用户交互路径（文件选择、鼠标手势、Canvas 像素校验与图片导出）。
