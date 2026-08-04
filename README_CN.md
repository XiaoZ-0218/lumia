# Lumia

一个外观和手感都类似 [Typora](https://typora.io/) 的所见即所得（WYSIWYG）Markdown 编辑器。输入 Markdown 即时渲染 —— 没有预览面板，没有悬浮工具栏。

[English](README.md) | 中文

## 功能特性

- **所见即所得编辑**：基于 Milkdown / ProseMirror，支持 CommonMark 与 GFM（表格、任务列表、删除线）
- **源码模式**：一键在所见即所得与 Markdown 源码之间切换（`⌘/`）
- **文件管理**：打开 / 保存 `.md` 文件（`⌘O` / `⌘S`），支持浏览器 File System Access API 与 Tauri 原生文件对话框；不支持时自动降级为文件选择 / 下载
- **侧边栏**：文件树（打开文件夹浏览）与文档大纲两个标签页，大纲点击可跳转
- **导出**：导出独立 HTML 文件（内嵌当前主题样式），或打印 / 导出 PDF（`⌘P`）
- **主题**：内置 4 套主题 —— github、newsprint、night、pixyll
- **视图模式**：专注模式（F8，淡出非当前段落）与打字机模式（光标保持居中），状态持久化
- **缩放**：编辑器字号缩放（`⌘+` / `⌘-`，50%–200%）
- **自动保存**：草稿每 500ms 防抖写入 localStorage，重启后自动恢复
- **字数统计**：状态栏实时显示字数与字符数

## 技术栈

- [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/) —— 构建与开发
- [Milkdown](https://milkdown.dev/) 7（ProseMirror）—— 编辑器内核
- [Tauri](https://v2.tauri.app/) 2 —— 桌面端外壳（可选，纯浏览器亦可运行）

## 快速开始

```bash
npm install
npm run dev        # 启动 Vite 开发服务器（浏览器版）
```

桌面版（需要 Rust 工具链）：

```bash
npm run tauri:dev      # 开发模式
npm run tauri:build    # 打包桌面应用
```

## 构建与测试

```bash
npm run build      # tsc 类型检查 + vite 构建到 dist/
npm test           # 安装 jsdom、构建并运行 scripts/smoke.mjs 冒烟测试
```

CI（`.github/workflows/ci.yml`）在每次 push / PR 时运行 `npm ci && npm test`。

## 快捷键

`⌘` 在 Windows / Linux 上对应 `Ctrl`。

### 文件与视图

| 快捷键 | 功能 |
| ------ | ---- |
| `⌘O` / `⌘S` | 打开 / 保存 Markdown 文件 |
| `⌘P` | 打印 / 导出 PDF |
| `⌘/` | 切换源码模式 |
| `⌘+` / `⌘-` | 放大 / 缩小 |
| `F8` | 专注模式 |

### 格式（仅在所见即所得编辑器内生效）

| 快捷键 | 功能 |
| ------ | ---- |
| `⌘0`–`⌘6` | 正文 / 标题 1–6（同级再按一次还原为正文） |
| `⌘K` | 插入链接 |
| `⌘⇧K` | 代码块 |
| `⌘⇧X` | 删除线 |
| `⌘T` | 插入 3×3 表格 |
| `⌘⌥Q` | 引用块 |
| `⌘⌥U` / `⌘⌥O` | 无序 / 有序列表 |
| `⌘⌥X` | 任务列表项切换 |

## 项目结构

```
├── index.html          # 应用骨架（标题栏、侧边栏、编辑器、状态栏）
├── src/
│   ├── main.ts         # 入口：主题、源码模式、缩放、模块装配
│   ├── editor.ts       # Milkdown 编辑器封装（getMarkdown / setMarkdown / onUpdate）
│   ├── sidebar.ts      # 文件树 + 大纲标签页
│   ├── files.ts        # 打开 / 保存 / 自动保存草稿
│   ├── export.ts       # HTML 导出与打印 / PDF
│   ├── format.ts       # 格式快捷键
│   ├── viewmodes.ts    # 专注 / 打字机模式
│   ├── tauri-bridge.ts # Tauri 与浏览器 API 的统一桥接
│   └── themes/         # 主题 CSS（构建时自动收集）
├── src-tauri/          # Tauri 桌面端（Rust）
└── scripts/smoke.mjs   # jsdom 冒烟测试（对生产构建做端到端断言）
```

## 浏览器兼容性

- 完整功能需要支持 File System Access API 的浏览器（Chrome / Edge）
- 其他浏览器自动降级：打开用 `<input type="file">`，保存用下载副本
- 桌面端通过 Tauri 获得原生文件对话框与文件读写

## 贡献

欢迎贡献 —— 如何报告 bug、提出功能建议、提交 pull request，请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
