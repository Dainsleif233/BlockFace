<!-- BlockFace · Copyright 2026 Dainsleif · Apache License 2.0 -->
# BlockFace

> 纯前端 Minecraft 头像贴图与头图合成工具 —— 在浏览器中为图片自由拼贴 Minecraft 像素头像与通用头像图片，零服务端上传，开箱即用。

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

![BlockFace 界面预览](docs/screenshot.png)

## ✨ 核心特性

- 🔒 **纯本地计算**：无服务端、无账户体系。底图与皮肤解析、图层合成全部在浏览器端本地完成，保护用户隐私。
- 🧩 **多源素材与通用图片支持**：
  - 内置经典 Steve / Alex 皮肤，开箱即选；
  - 支持正版 Minecraft 玩家 ID 单个或批量检索；
  - 本地皮肤 PNG 文件拖放或多选上传（标准 64×64、64×32 与高清皮肤）；
  - 外部图片 URL 直链快速载入；
  - **支持通用头像图片**（PNG / JPG / WebP 等），自适应等比居中渲染并自动优化帽子层语义。
- 📐 **像素完美与抗锯齿混合渲染**：
  - 自动适配 64×64、64×32 及 128/256/512 等高清（HD）皮肤贴图，正向采用**最近邻像素采样（Nearest-Neighbor）**保持复古硬边；
  - 通用头像图片与非正交旋转图层自动启用**双线性平滑插值**，消除旋转马赛克与走样锯齿；
  - 支持正版第二层（帽子层 / Overlay）一键开关与水平镜像翻转（预览与缩略图实时联动）。
- 🖱️ **直观的手势与画布控制**：
  - 画布视口平移与基于光标锚点的连续平滑缩放（视口平移缩放不污染撤销历史）；
  - 图层等比缩放、定轴旋转、拖拽定位、透明度滑杆、微调输入框与键盘像素级微调；
  - 点击画布任意区域自动聚焦，支持方向键微调与 `[` / `]` 调整图层堆叠顺序。
- 📋 **智能剪贴板与拖放体验**：
  - 任意区域拖放图片即可设为底图；
  - 支持直接粘贴系统剪贴板图片（`Ctrl+V`），画布已有底图时智能识别为贴纸头像载入；
  - 支持一键导出原尺寸高清 PNG，或直接将合成图片拷贝至系统剪贴板。
- 🧹 **内存安全与素材生命周期管理**：
  - 素材库支持单张删除与一键清理闲置素材；
  - **撤销栈保护机制**：历史记录中被引用的素材受到完整保护，防止用户清理素材后撤销导致图层变隐形；
  - 离屏 Canvas 采用 48 张容量的 LRU 缓存与定点淘汰（`evictSkin`），大图自动内存回收（GC）。
- 💾 **全功能图层预设系统**：
  - 预设面板常驻右侧属性栏底部，支持随时将画布上的头像排版一键保存为预设；
  - 预设大图自动等比采样（限制 512px 内）防 LocalStorage 超限，且套用预设具备皮肤缺失自动回退兜底；
  - 支持预设配置（JSON）导出与导入，包含完整内嵌素材，跨设备离线即开即用。

---

## 🚀 快速上手

### 环境要求
- Node.js 18.0 或更高版本
- 包管理器：`npm` / `pnpm`

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/jsucraft/BlockFace.git
cd BlockFace

# 安装依赖
npm install

# 启动本地开发服务
npm run dev
```

启动后用浏览器访问 `http://localhost:5173/` 即可使用。

### 构建生产

```bash
# 检查类型并构建生产产物
npm run build

# 本地预览生产构建产物
npm run preview
```

### 测试验证

```bash
# 运行单元测试 (Vitest) —— 涵盖数学变换、预设序列化、LRU缓存与素材历史保护
npm test

# 运行真实浏览器端到端冒烟测试 (基于本机 Chrome DevTools Protocol)
npm run e2e
```

---

## ⌨️ 快捷键与操作指南

| 操作 | 交互方式 | 说明 |
| :--- | :--- | :--- |
| **画布平移** | 空白处拖拽鼠标 / 中键拖拽 | 拖动画布视口，不影响图层坐标与历史记录 |
| **画布缩放** | 空白处滚动滚轮 / 触控板捏合 | 以当前光标位置为锚点连续缩放 |
| **头像缩放** | 光标停在头像上 + 滚动滚轮 | 等比放大或缩小头像 |
| **头像旋转** | 光标停在头像上 + `Shift` + 滚动滚轮 | 每次旋转 5° |
| **精确移动** | 方向键 `↑` `↓` `←` `→` | 每次移动 1 像素，按住 `Shift` 加速为 10 像素 |
| **调整图层层级** | 选中图层时按 `[` 或 `]` | `[` 向下一层，`]` 向上一层（属性栏中亦支持 `Alt+↑/↓`） |
| **取消选中** | `Escape` | 取消当前选中的图层 |
| **删除图层** | `Delete` / `Backspace` | 删除当前选中的头像图层 |
| **撤销 / 重做** | `Ctrl+Z` / `Ctrl+Shift+Z` (Mac: `⌘+Z` / `⌘+Shift+Z`) | 完整的操作历史记录（素材受历史栈保护） |
| **适应屏幕** | `Ctrl+0` (Mac: `⌘+0`) | 画布视口缩放并居中自适应窗口 |
| **导入底图/贴纸**| 拖拽图片至窗口任意区域 / `Ctrl+V` 粘贴 | 无底图时设为底图；已有底图时自动转为头像贴纸 |

---

## 🎨 设计语言：8px Blockgrid

BlockFace 界面采用严格的 **8px 积木网格（Blockgrid）** 体系：
- **纯 CSS 像素手搓图标**：零 emoji、零位图字体，使用纯 CSS 方块拼装，保持纯粹的像素复古美感。
- **全平涂硬边**：零圆角、零渐变、零模糊阴影，依托 1px 细线、4px 语义色条与清晰的层次划分。
- **高对比度标准**：全界面文字与核心控件均经过 WCAG AA / AAA 级别对比度审计。

详细设计规范请参阅 [设计规范文档](docs/brand-spec.md)。

---

## 📚 更多文档

- [品牌与界面设计规范 (Brand & Design Spec)](docs/brand-spec.md)：色彩令牌、排版阶梯、组件语法与交互细则。
- [技术设计与实现要点 (Product & Technical Facts)](docs/product-facts.md)：Mojang API 限制、皮肤 UV 贴图算法、画布坐标系与视口变换数学、LRU 显存缓存与历史保护。
- [界面需求规格说明 (Design Spec)](docs/design-spec.md)：产品定位、信息架构与交互规格。

---

## 📄 开源许可与声明

- 采用 [Apache License 2.0](LICENSE) 开源协议。
- 第三方资产与依赖致谢请见 [NOTICE](NOTICE)。
- **免责声明**：BlockFace 是一个兼容 Minecraft 皮肤格式的独立第三方工具，与 Mojang Studios / Microsoft 没有任何官方隶属关系。Minecraft 是 Mojang Studios 的注册商标。
