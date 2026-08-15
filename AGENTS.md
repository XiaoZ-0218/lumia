# AGENTS.md — Lumia

Guidance for AI coding agents working in this repository. Assumes no prior knowledge of the project.

## Project overview

Lumia is a WYSIWYG markdown editor that looks and feels like Typora: type markdown and it renders in place — no preview panel, no floating toolbar. It ships in two forms from one codebase:

- **Web app** — plain Vite build that runs in any browser (full file access needs the File System Access API, i.e. Chrome/Edge; other browsers fall back to `<input type="file">` for open and a downloaded copy for save).
- **Desktop app** — the same frontend wrapped in a Tauri v2 shell (Rust), using native file dialogs and filesystem access. Currently built and released for macOS only.

Key features: Milkdown/ProseMirror editor (CommonMark + GFM), source-mode toggle (raw markdown textarea), in-place rendering of sanitized raw HTML, file open/save with autosave drafts (debounced 500 ms to localStorage), sidebar with Files and Outline tabs, HTML export and print/PDF, 4 themes, focus mode (F8) and typewriter mode, zoom (50–200%), live word count.

## Tech stack

- **Frontend**: TypeScript (strict mode) + Vite 8. No framework — vanilla DOM manipulation against a static `index.html` shell.
- **Editor core**: Milkdown 7 (`@milkdown/*` 7.22.0, all pinned to the same version) on top of ProseMirror, with `preset-commonmark` and `preset-gfm`.
- **Desktop shell**: Tauri v2 (Rust 1.90+, edition 2021) with only two plugins: `tauri-plugin-dialog` and `tauri-plugin-fs`.
- **Tests**: a single jsdom-based smoke test (`scripts/smoke.mjs`). There is no unit-test framework (no vitest/jest).

## Repository layout

```
├── index.html          # App shell: titlebar, sidebar, #editor, status bar. All modules
│                       # wire themselves to element IDs defined here.
├── src/
│   ├── main.ts         # Entry point: themes, source mode, zoom, shortcuts, module wiring
│   ├── editor.ts       # Milkdown wrapper; exposes window.__editor (getMarkdown/setMarkdown/
│   │                   # call/getView); custom node views; HTML sanitizer; word count/title
│   ├── sidebar.ts      # Files tree + Outline tabs
│   ├── files.ts        # Open / save / draft autosave (FS Access API, Tauri, or fallbacks)
│   ├── session.ts      # Last folder/file persistence for relaunch restore (Tauri only)
│   ├── export.ts       # Standalone HTML export + print/PDF
│   ├── format.ts       # Formatting keyboard shortcuts (⌘K, ⌘⇧K, ⌘0–6, tables, lists…)
│   ├── viewmodes.ts    # Focus mode / typewriter mode, persisted in localStorage
│   ├── tauri-bridge.ts # Thin bridge over @tauri-apps/api; inert in plain browsers
│   ├── style.css, sidebar.css, export.css, viewmodes.css
│   └── themes/         # Theme CSS (github, newsprint, night, pixyll), collected at build
│                       # time via import.meta.glob in main.ts
├── src-tauri/          # Tauri desktop shell (Rust)
│   ├── src/main.rs     # Binary: just calls lumia_lib::run()
│   ├── src/lib.rs      # Builder: registers dialog + fs plugins, no custom commands
│   ├── tauri.conf.json # Window config, bundle config (app id com.github.xiaoz0218.lumia)
│   └── capabilities/default.json  # Permissions (see Security below)
├── scripts/smoke.mjs   # jsdom end-to-end smoke test of the production build
└── .github/workflows/  # ci.yml, release.yml, ai-issue-fix.yml
```

## Build and test commands

```bash
npm install
npm run dev          # Vite dev server (browser version) on http://localhost:5173
npm run build        # tsc type-check (noEmit) + vite build into dist/
npm test             # npm i --no-save jsdom && npm run build && node scripts/smoke.mjs
npm run tauri:dev    # desktop dev mode (needs Rust toolchain)
npm run tauri:build  # bundle the desktop app
```

Notes:

- `npm test` deliberately installs jsdom with `--no-save` so package.json/package-lock.json stay clean. Do not add jsdom as a dependency.
- The smoke test runs against the **production build** in `dist/`, not the dev server — always `npm run build` (or `npm test`) before judging a change.
- TypeScript runs with `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noEmit` — the type check is part of `npm run build` and will fail the build.

## Testing strategy

There is exactly one test artifact: `scripts/smoke.mjs`. It boots `dist/assets/index-*.js` inside jsdom and asserts end-to-end behavior: editor boot, markdown round-trips, task-list checkboxes, raw-HTML rendering and sanitization, sidebar tabs, outline, source mode, HTML export, save fallback, focus/typewriter modes, format-shortcut guards, and zoom.

Conventions when changing behavior:

- If you change a user-visible behavior covered by the smoke test, update the matching assertions in `scripts/smoke.mjs` in the same change.
- If you add a feature, add a smoke-test section for it (numbered sections with a tiny `assert`/`waitFor` harness already in the file).
- The smoke test relies on jsdom stubs (empty Range rects, mocked `URL.createObjectURL`, intercepted anchor clicks, a mocked `fetch` that serves the built theme CSS). Work with those stubs rather than deleting features to make the test pass.
- `window.__editor` is the supported programmatic handle on the editor (also used by the test).

CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` on every push/PR to `main` (Node 22, ubuntu-latest).

## Code style guidelines

- Language: all code, comments, and docs are in **English** (README has a Chinese translation in `README_CN.md`; keep both in sync when user-facing docs change).
- Vanilla TypeScript, no framework. Feature modules follow one pattern: an exported `initX()` called from `main.ts` that queries DOM elements by ID from `index.html` and attaches listeners.
- Communication between modules goes through `window.__editor` (the `EditorAPI` in `src/editor.ts`) and the `onUpdate()` subscription — not through shared mutable state.
- ProseMirror DOM is managed by ProseMirror: never patch editable DOM classes from outside — use decorations/node views (see `focusActivePlugin`, `TaskItemView`, `HtmlView` in `src/editor.ts`).
- State that should survive restarts goes to localStorage with the `lumia:` prefix (e.g. `lumia:focus`, `lumia:typewriter`, draft autosave).
- Environment branching (Tauri vs browser) is centralized in `src/tauri-bridge.ts` via `isTauri()`; feature modules call the bridge and keep web fallbacks. Don't sprinkle `__TAURI_INTERNALS__` checks elsewhere.
- Rust side is intentionally minimal (7-line `lib.rs`); application logic lives in TypeScript. Keep it that way unless a native command is genuinely required.
- Comments explain *why* (e.g. why a decoration instead of DOM classes), not what the code does. Match the existing density.
- Adding a theme = drop a new CSS file in `src/themes/`; `import.meta.glob` picks it up automatically (the smoke test asserts 4 themes — update it if you add one).

## Security considerations

- **HTML sanitization**: raw HTML embedded in markdown is rendered in place via `HtmlView` after `sanitizeHtml()` strips `script/iframe/object/embed/link/meta/base` tags, all `on*` attributes, and `javascript:`/`vbscript:` URLs (`src/editor.ts`). Any change to raw-HTML rendering must preserve this sanitizer and its smoke-test coverage.
- **Tauri capabilities** (`src-tauri/capabilities/default.json`): fs permissions are scoped to `$HOME/**`; the desktop shell exists specifically to replace the browser File System Access API. Keep the scope tight — don't widen to `$HOME` root writes or add permissions without need.
- **CSP** is explicitly `null` in `tauri.conf.json` — be aware the webview has no CSP; the sanitizer above is the line of defense.
- Secrets handling: the repo has SECURITY.md (report vulnerabilities privately); never commit credentials.

## CI / CD and release process

- **CI**: `npm ci && npm test` on push/PR to `main`.
- **Release** (order matters — changelog and version bumps must land on `main` *before* tagging):
  1. Move `CHANGELOG.md`'s `[Unreleased]` entries into a new `## [x.y.z] - YYYY-MM-DD` section and update the link anchors at the bottom; the heading must correspond to the tag (`[0.2.0]` ↔ `v0.2.0`, heading without the `v`).
  2. Bump versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` together.
  3. Push `main`, then `git tag -a vx.y.z -m "Lumia vx.y.z" && git push origin vx.y.z`.
  4. Pushing a `v*` tag triggers `.github/workflows/release.yml` — re-runs `npm test` as a gate, then builds the macOS bundle with `tauri-action` and publishes a GitHub Release (`Lumia vx.y.z`) with the `.dmg` / `.app.tar.gz` assets and auto-generated notes.
- **AI issue fix** (`.github/workflows/ai-issue-fix.yml`): labeling an issue `ai-fix:kimi` or `ai-fix:deepseek` (repo owner only) runs an automated agent that fixes the issue on a branch and opens a PR.

## Definition of done for changes

1. `npm run build` passes (type check included).
2. `npm test` passes, with smoke-test assertions updated/added for the changed behavior.
3. If the README's feature list, shortcuts, or structure sections become stale, update them (and `README_CN.md`).
