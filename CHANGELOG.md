# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Outline** no longer lists `# lines` inside fenced code blocks as headings, and clicking an outline entry now moves the caret into that heading (typewriter mode no longer yanks the view back)
- **Word count** re-renders immediately when the UI language changes, and the boot numbers now match post-edit numbers (rendered text is counted, not markdown syntax)
- **Bubble menu** re-anchors to the selection after zooming instead of floating at the old position
- **HTML export** keeps task-list checked states and inlines local images as data URLs, so the exported file is self-contained

## [0.2.1] - 2026-08-16

### Added

- **Selection toolbar**: selecting text pops up a small bubble menu with bold, italic, strikethrough, inline code, and link actions
- **Local images** (desktop): image paths relative to the markdown file render in place, Typora-style

### Changed

- **Sidebar toggle** moved to the top-left corner with a sidebar icon

### Fixed

- **Relative image paths** (desktop): images referenced relative to the markdown file (e.g. `![shot](assets/pic.jpg)`) previously resolved against the app origin and rendered broken; they now resolve against the open file's folder

## [0.2.0] - 2026-08-15

### Added

- **UI language switcher** (English / 简体中文 / 日本語) in the statusbar: first
  launch follows the OS language, the manual choice persists in
  `lumia:lang`, and the welcome document is localized. Switching never
  touches the open document.
- **Session restore** (desktop app): the last opened folder and file are
  remembered (`lumia:lastFolder` / `lumia:lastFile`) and reopen automatically
  on the next launch. An autosaved draft with unsaved edits still wins over
  the on-disk file content.

## [0.1.0] - 2026-08-10

Initial release.

### Added

- **WYSIWYG markdown editing** built on Milkdown / ProseMirror, with CommonMark + GFM support (tables, task lists, strikethrough)
- **Source mode**: toggle between WYSIWYG and raw markdown (`⌘/`)
- **File management**: open / save `.md` files (`⌘O` / `⌘S`) via the File System Access API or native Tauri dialogs, with automatic fallbacks
- **Sidebar**: Files tab (folder file tree) and Outline tab (heading navigation)
- **Export**: standalone HTML download with the active theme embedded, or print / export PDF (`⌘P`)
- **Themes**: 4 built-in themes — github, newsprint, night, pixyll
- **View modes**: focus mode (dims all but the active block) and typewriter mode (keeps the caret centered), persisted across sessions
- **Zoom**: editor font scaling (`⌘+` / `⌘-`, 50%–200%)
- **Autosave**: drafts debounced to localStorage and restored on launch; live word / character count in the status bar
- **Raw HTML rendering**: inline and block HTML in markdown renders in place, sanitized (scripts, event handlers, and `javascript:` URLs stripped); editable via source mode
- **Task list checkboxes**: clickable checkboxes for GFM task list items
- **Desktop shell**: Tauri v2 app for macOS (overlay titlebar, native file dialogs and file I/O)

### Changed

- Bundle identifier is now `com.github.xiaoz0218.lumia` (was `com.lumia.app`, whose `.app` suffix conflicts with the macOS application bundle extension)

### Documentation

- README in English and 中文, CONTRIBUTING guide, MIT license
- Code of Conduct (Contributor Covenant 2.1) and Security Policy

### CI/CD

- CI: `npm ci && npm test` (build + jsdom smoke test) on every push / pull request
- CD: pushing a `v*` tag runs the test suite, builds the macOS bundle, and publishes a GitHub Release with `.dmg` / `.app` assets

[Unreleased]: https://github.com/XiaoZ-0218/lumia/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/XiaoZ-0218/lumia/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/XiaoZ-0218/lumia/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/XiaoZ-0218/lumia/releases/tag/v0.1.0
