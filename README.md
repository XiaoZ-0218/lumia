# Lumia

A WYSIWYG markdown editor that looks and feels like [Typora](https://typora.io/). Type markdown and watch it render as you go — no preview panel, no floating toolbar.

English | [中文](README_CN.md)

## Features

- **WYSIWYG editing**: built on Milkdown / ProseMirror with CommonMark + GFM (tables, task lists, strikethrough)
- **Source mode**: toggle between WYSIWYG and raw markdown (`⌘/`)
- **Raw HTML rendering**: inline and block HTML in markdown renders in place in the WYSIWYG view (sanitized — scripts and event handlers are stripped); edit the original HTML in source mode (`⌘/`)
- **File management**: open / save `.md` files (`⌘O` / `⌘S`) via the File System Access API or native Tauri dialogs, with automatic fallbacks (file input / download) elsewhere
- **Sidebar**: Files and Outline tabs — browse a folder's file tree, jump to headings from the outline
- **Export**: standalone HTML download with the active theme embedded, or print / export PDF (`⌘P`)
- **Themes**: 4 built-in themes — github, newsprint, night, pixyll
- **View modes**: focus mode (F8, dims all but the active block) and typewriter mode (keeps the caret centered), persisted across sessions
- **Zoom**: editor font scaling (`⌘+` / `⌘-`, 50%–200%)
- **Autosave**: drafts are debounced to localStorage every 500 ms and restored on launch
- **Word count**: live word / character stats in the status bar

## Tech Stack

- [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/) — build and dev tooling
- [Milkdown](https://milkdown.dev/) 7 (ProseMirror) — editor core
- [Tauri](https://v2.tauri.app/) 2 — optional desktop shell (the app also runs standalone in a browser)

## Getting Started

```bash
npm install
npm run dev        # start the Vite dev server (browser version)
```

Desktop app (requires the Rust toolchain):

```bash
npm run tauri:dev      # dev mode
npm run tauri:build    # bundle the desktop app
```

## Build & Test

```bash
npm run build      # tsc type-check + vite build into dist/
npm test           # install jsdom, build, and run the scripts/smoke.mjs smoke test
```

CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` on every push / pull request.

## Keyboard Shortcuts

`⌘` maps to `Ctrl` on Windows / Linux.

### Files & View

| Shortcut | Action |
| -------- | ------ |
| `⌘O` / `⌘S` | Open / save a markdown file |
| `⌘P` | Print / export PDF |
| `⌘/` | Toggle source mode |
| `⌘+` / `⌘-` | Zoom in / out |
| `F8` | Focus mode |

### Formatting (active only inside the WYSIWYG editor)

| Shortcut | Action |
| -------- | ------ |
| `⌘0`–`⌘6` | Paragraph / heading 1–6 (press the same level again to revert) |
| `⌘K` | Insert link |
| `⌘⇧K` | Code block |
| `⌘⇧X` | Strikethrough |
| `⌘T` | Insert a 3×3 table |
| `⌘⌥Q` | Blockquote |
| `⌘⌥U` / `⌘⌥O` | Bullet / ordered list |
| `⌘⌥X` | Toggle task list item |

## Project Structure

```
├── index.html          # App shell (title bar, sidebar, editor, status bar)
├── src/
│   ├── main.ts         # Entry point: themes, source mode, zoom, module wiring
│   ├── editor.ts       # Milkdown wrapper (getMarkdown / setMarkdown / onUpdate)
│   ├── sidebar.ts      # File tree + outline tabs
│   ├── files.ts        # Open / save / draft autosave
│   ├── export.ts       # HTML export and print / PDF
│   ├── format.ts       # Formatting shortcuts
│   ├── viewmodes.ts    # Focus / typewriter modes
│   ├── tauri-bridge.ts # Unified bridge over Tauri and browser APIs
│   └── themes/         # Theme CSS (collected at build time)
├── src-tauri/          # Tauri desktop shell (Rust)
└── scripts/smoke.mjs   # jsdom smoke test (end-to-end assertions on the production build)
```

## Browser Compatibility

- Full functionality requires a browser with the File System Access API (Chrome / Edge)
- Other browsers fall back automatically: `<input type="file">` for open, a downloaded copy for save
- The desktop build uses native file dialogs and file I/O via Tauri

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to report bugs, propose features, and submit pull requests. Please also read our [Code of Conduct](CODE_OF_CONDUCT.md); security issues should be reported privately as described in the [Security Policy](SECURITY.md).

## License

[MIT](LICENSE)
