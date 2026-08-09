# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-09

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

### Documentation

- README in English and 中文, CONTRIBUTING guide, MIT license
- Code of Conduct (Contributor Covenant 2.1) and Security Policy

### CI/CD

- CI: `npm ci && npm test` (build + jsdom smoke test) on every push / pull request
- CD: pushing a `v*` tag runs the test suite, builds the macOS bundle, and publishes a GitHub Release with `.dmg` / `.app` assets

[Unreleased]: https://github.com/XiaoZ-0218/lumia/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/XiaoZ-0218/lumia/releases/tag/v0.1.0
