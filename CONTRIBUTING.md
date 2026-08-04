# Contributing

Thanks for your interest in contributing to Typora Clone! This document explains how to report bugs, propose features, and submit changes.

## Reporting Bugs

- Search [existing issues](../../issues) first to avoid duplicates.
- Include a clear title, steps to reproduce, expected vs. actual behavior, and your environment (OS, browser or Tauri version).
- Attach screenshots or minimal sample markdown files when they help.

## Proposing Features

- Open an issue describing the problem you want to solve before writing code — it saves everyone time if the direction is discussed first.
- Keep proposals small and focused; one feature per issue / pull request.

## Development Setup

```bash
npm install
npm run dev        # start the Vite dev server (browser version)
```

For the desktop app you also need the [Rust toolchain](https://www.rust-lang.org/tools/install):

```bash
npm run tauri:dev
```

## Making Changes

1. Fork the repository and create a branch from `main`.
2. Keep changes minimal and scoped to the issue at hand — please avoid unrelated refactors or reformatting.
3. Match the existing code style (TypeScript, the module layout under `src/`).
4. If you change editor behavior covered by `scripts/smoke.mjs`, extend the smoke test so the behavior stays asserted.

## Verifying Your Changes

Before opening a pull request, make sure the build and smoke test pass:

```bash
npm test       # installs jsdom, runs tsc + vite build, then scripts/smoke.mjs
```

CI runs the same command on every pull request; red CI must be fixed before merging.

## Pull Requests

- Reference the issue your PR addresses (e.g. `Fixes #123`).
- Describe what changed and why in the PR description.
- Update `README.md` / `README_CN.md` when you change documented behavior, shortcuts, or project structure.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
