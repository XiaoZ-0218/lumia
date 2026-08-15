// 简体中文 — key set must match en exactly (enforced by the Dictionary type).
import type { Dictionary } from './en';

export const zh: Dictionary = {
  open: '打开 ▾',
  openPlain: '打开',
  openPick: '打开…',
  openFile: '打开文件',
  openFileTitle: '打开文件 (⌘O)',
  openFolder: '打开文件夹',
  openPickTitle: '打开文件或文件夹 (⌘O)',
  save: '保存',
  saveTitle: '保存文件 (⌘S)',
  saveFile: '保存文件',
  export: '导出 ▾',
  exportPlain: '导出',
  exportHtmlTitle: '导出 HTML',
  exportPdfTitle: '打印 / 导出 PDF (⌘P)',
  toggleSidebar: '切换侧边栏',
  files: '文件',
  outline: '大纲',
  openParent: '打开上级文件夹',
  noFolder: '无文件夹',
  openFolderFirst: '请先打开文件夹',
  parentUnavailable: '浏览器中无法向上级导航',
  atRoot: '已位于文件系统根目录',
  emptyFolder: '空文件夹',
  couldNotReadFolder: '无法读取文件夹',
  openFolderBrowser: '打开文件夹 — 需要 Chrome/Edge',
  openFolderToBrowse: '打开文件夹以浏览',
  untitled: '无标题',
  outlineUntitled: '（无标题）',
  stats: '{words} 词 · {chars} 字符',
  sourcePlaceholder: '源码模式 — 直接编辑 Markdown',
  focus: '专注',
  focusTitle: '切换专注模式 (F8)',
  typewriter: '打字机',
  typewriterTitle: '切换打字机模式',
  theme: '主题',
  lang: '语言',
  langTitle: '界面语言',
  zoomInTitle: '放大 (⌘+)',
  zoomOutTitle: '缩小 (⌘-)',
  source: '源码',
  sourceTitle: '切换源码模式 (⌘/)',
  linkUrlPrompt: '链接地址：',
  bubbleBold: '加粗：**文字** (⌘B)',
  bubbleItalic: '斜体：*文字* (⌘I)',
  bubbleStrike: '删除线：~~文字~~ (⌘⇧X)',
  bubbleCode: '行内代码：`文字`',
  bubbleLink: '链接：[文字](网址) (⌘K)',
  markdownTypes: 'Markdown',
  welcome: `# 欢迎使用 Lumia

这是一款外观与手感都接近 [Typora](https://typora.io/) 的 **所见即所得** Markdown 编辑器。直接输入 Markdown，内容即时渲染 —— 没有预览面板打扰你。

## 行内样式

**加粗**、*斜体*、~~删除线~~、\`行内代码\`，以及[链接](https://typora.io/)。

## 列表

- 无序列表
- 嵌套列表
  1. 有序子列表
  2. 第二项

## 任务列表

- [x] 所见即所得编辑
- [x] 源码模式切换
- [ ] 主题切换器

## 引用

> Markdown 不只是用来写文档 —— 它是用来思考的。

## 代码

\`\`\`ts
const greeting = "Hello, world!";
console.log(greeting);
\`\`\`

## 表格

| 特性       | 状态 |
| ---------- | ---- |
| 所见即所得 | ✅   |
| 源码模式   | ✅   |
| 主题       | 🔜   |

---

*祝你写作愉快！*
`,
};
