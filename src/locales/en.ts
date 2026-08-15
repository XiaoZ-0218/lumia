// English dictionary — the source of truth other locales are typed against.
export const en = {
  open: 'Open ▾',
  openPlain: 'Open',
  openPick: 'Open…',
  openFile: 'Open file',
  openFileTitle: 'Open file (⌘O)',
  openFolder: 'Open folder',
  openPickTitle: 'Open file or folder (⌘O)',
  save: 'Save',
  saveTitle: 'Save file (⌘S)',
  saveFile: 'Save file',
  export: 'Export ▾',
  exportPlain: 'Export',
  exportHtmlTitle: 'Export as HTML',
  exportPdfTitle: 'Print / export PDF (⌘P)',
  toggleSidebar: 'Toggle sidebar',
  files: 'Files',
  outline: 'Outline',
  openParent: 'Open parent folder',
  noFolder: 'No folder',
  openFolderFirst: 'Open a folder first',
  parentUnavailable: 'Parent navigation is unavailable in the browser',
  atRoot: 'Already at filesystem root',
  emptyFolder: 'Empty folder',
  couldNotReadFolder: 'Could not read folder',
  openFolderBrowser: 'Open folder — requires Chrome/Edge',
  openFolderToBrowse: 'Open a folder to browse',
  untitled: 'Untitled',
  outlineUntitled: '(untitled)',
  stats: '{words} words · {chars} chars',
  sourcePlaceholder: 'Source mode — edit the markdown directly',
  focus: 'Focus',
  focusTitle: 'Toggle focus mode (F8)',
  typewriter: 'Typewriter',
  typewriterTitle: 'Toggle typewriter mode',
  theme: 'Theme',
  lang: 'Lang',
  langTitle: 'Language',
  zoomInTitle: 'Zoom in (⌘+)',
  zoomOutTitle: 'Zoom out (⌘-)',
  source: 'Source',
  sourceTitle: 'Toggle source mode (⌘/)',
  linkUrlPrompt: 'Link URL:',
  bubbleBold: 'Bold: **text** (⌘B)',
  bubbleItalic: 'Italic: *text* (⌘I)',
  bubbleStrike: 'Strikethrough: ~~text~~ (⌘⇧X)',
  bubbleCode: 'Inline code: `text`',
  bubbleLink: 'Link: [text](url) (⌘K)',
  markdownTypes: 'Markdown',
  welcome: `# Welcome to Lumia

This is a **WYSIWYG** markdown editor that looks and feels like [Typora](https://typora.io/). Type markdown and watch it render as you go — no preview panel to distract you.

## Write inline styles

**Bold**, *italic*, ~~strikethrough~~, \`inline code\`, and [links](https://typora.io/).

## Lists

- Unordered lists
- Nested lists
  1. Ordered sub-list
  2. Second item

## Task lists

- [x] WYSIWYG editing
- [x] Source mode toggle
- [ ] Theme switcher

## Blockquote

> Markdown is not just for documentation — it's for thinking.

## Code

\`\`\`ts
const greeting = "Hello, world!";
console.log(greeting);
\`\`\`

## Table

| Feature    | Status |
| ---------- | ------ |
| WYSIWYG    | ✅     |
| Source     | ✅     |
| Themes     | 🔜     |

---

*Happy writing!*
`,
} as const;

export type Key = keyof typeof en;
/** Other locales must provide exactly the same key set (compile-time checked). */
export type Dictionary = { [K in Key]: string };
