# Security Policy

## Supported Versions

Lumia is currently in early development (`0.x`). Only the latest code on the
`main` branch (and the most recent release, if any) receives security fixes.

| Version          | Supported |
| ---------------- | --------- |
| `main` / latest  | ✅        |
| older releases   | ❌        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use one of these channels:

- **GitHub Private Vulnerability Reporting (preferred)**: open a
  [private security advisory](../../security/advisories/new) for this
  repository.
- **Email**: contact the maintainer at **xiao.z.218@qq.com** with the subject
  line `[Lumia Security] <short description>`.

Please include as much of the following as you can:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof-of-concept
- Affected versions / environments (browser build vs. Tauri desktop build)
- Any suggested mitigation, if you have one

## What to Expect

- **Acknowledgement**: within 72 hours of your report.
- **Assessment**: we will confirm whether the report is valid and keep you
  informed of our progress.
- **Fix & disclosure**: we aim to release a fix as soon as practical, and will
  credit you in the release notes / advisory unless you prefer to remain
  anonymous.

If the report turns out not to be a security issue, we will let you know and
may ask you to file a regular issue instead.

## Scope Notes

Lumia is a local-first markdown editor:

- The **browser build** renders user-supplied markdown and exports HTML;
  issues such as cross-site scripting (XSS) through crafted markdown or theme
  files are in scope.
- The **Tauri desktop build** accesses the local file system through the
  `@tauri-apps/plugin-fs` and dialog plugins; issues that let content escape
  the configured capabilities (e.g. reading/writing files the user did not
  choose) are in scope.
- Vulnerabilities in third-party dependencies should preferably be reported
  upstream; if a dependency issue has a concrete, exploitable impact on Lumia,
  report it to us as well.
