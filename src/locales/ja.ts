// 日本語 — key set must match en exactly (enforced by the Dictionary type).
import type { Dictionary } from './en';

export const ja: Dictionary = {
  open: '開く ▾',
  openPlain: '開く',
  openPick: '開く…',
  openFile: 'ファイルを開く',
  openFileTitle: 'ファイルを開く (⌘O)',
  openFolder: 'フォルダを開く',
  openPickTitle: 'ファイルまたはフォルダを開く (⌘O)',
  save: '保存',
  saveTitle: 'ファイルを保存 (⌘S)',
  saveFile: 'ファイルを保存',
  export: 'エクスポート ▾',
  exportPlain: 'エクスポート',
  exportHtmlTitle: 'HTML としてエクスポート',
  exportPdfTitle: '印刷 / PDF エクスポート (⌘P)',
  toggleSidebar: 'サイドバー切替',
  files: 'ファイル',
  outline: 'アウトライン',
  openParent: '親フォルダを開く',
  noFolder: 'フォルダなし',
  openFolderFirst: 'まずフォルダを開いてください',
  parentUnavailable: 'ブラウザでは親フォルダへ移動できません',
  atRoot: 'ファイルシステムのルートです',
  emptyFolder: '空のフォルダ',
  couldNotReadFolder: 'フォルダを読み込めません',
  openFolderBrowser: 'フォルダを開く — Chrome/Edge が必要です',
  openFolderToBrowse: 'フォルダを開いて閲覧',
  untitled: '無題',
  outlineUntitled: '（無題）',
  stats: '{words} 語 · {chars} 文字',
  sourcePlaceholder: 'ソースモード — Markdown を直接編集',
  focus: 'フォーカス',
  focusTitle: 'フォーカスモード切替 (F8)',
  typewriter: 'タイプライター',
  typewriterTitle: 'タイプライターモード切替',
  theme: 'テーマ',
  lang: '言語',
  langTitle: '表示言語',
  zoomInTitle: '拡大 (⌘+)',
  zoomOutTitle: '縮小 (⌘-)',
  source: 'ソース',
  sourceTitle: 'ソースモード切替 (⌘/)',
  linkUrlPrompt: 'リンク URL：',
  bubbleBold: '太字：**テキスト** (⌘B)',
  bubbleItalic: '斜体：*テキスト* (⌘I)',
  bubbleStrike: '取り消し線：~~テキスト~~ (⌘⇧X)',
  bubbleCode: 'インラインコード：`テキスト`',
  bubbleLink: 'リンク：[テキスト](url) (⌘K)',
  markdownTypes: 'Markdown',
  welcome: `# Lumia へようこそ

これは [Typora](https://typora.io/) のような見た目と操作感の **WYSIWYG** Markdown エディタです。Markdown を入力するとその場でレンダリングされます —— プレビューペインはありません。

## インラインスタイル

**太字**、*斜体*、~~取り消し線~~、\`インラインコード\`、そして[リンク](https://typora.io/)。

## リスト

- 順序なしリスト
- ネストされたリスト
  1. 順序付きサブリスト
  2. 2 番目の項目

## タスクリスト

- [x] WYSIWYG 編集
- [x] ソースモード切替
- [ ] テーマ切替

## 引用

> Markdown はドキュメントのためだけのものではありません —— 考えるためのものです。

## コード

\`\`\`ts
const greeting = "Hello, world!";
console.log(greeting);
\`\`\`

## 表

| 機能    | 状態 |
| ------- | ---- |
| WYSIWYG | ✅   |
| ソース  | ✅   |
| テーマ  | 🔜   |

---

*良い執筆を！*
`,
};
