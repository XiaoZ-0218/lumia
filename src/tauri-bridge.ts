// Thin bridge to the Tauri v2 native APIs. Inert in plain browsers: isTauri()
// is false there, so callers keep their existing web (FS Access API) paths.

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, readTextFile, stat, writeTextFile } from '@tauri-apps/plugin-fs';

/** True when running inside the Tauri v2 shell (WKWebView injects this global). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** One node of the recursive folder tree built by readDirRecursive. */
export type TreeEntry =
  | { kind: 'dir'; name: string; path: string; children: TreeEntry[] }
  | { kind: 'file'; name: string; path: string };

const MD_EXTENSIONS = ['md', 'markdown', 'txt'];
const MD_FILTER = { name: 'Markdown', extensions: MD_EXTENSIONS };

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

/** Names of directories that should never appear in the file tree. */
function skipDirName(name: string): boolean {
  // Hidden directories and dependency caches are never useful in a markdown tree.
  return name.startsWith('.') || name === 'node_modules';
}

/** Open one markdown file via the native dialog, or read it directly when a
 *  path is supplied (used after the unified file-or-folder picker). */
export async function openMarkdownFile(path?: string): Promise<{ path: string; name: string; text: string } | null> {
  const resolved = path ?? (await open({ multiple: false, filters: [MD_FILTER] }));
  if (resolved === null) return null;
  return { path: resolved, name: baseName(resolved), text: await readTextFile(resolved) };
}

/** Save dialog seeded with defaultName; resolves to the path or null when cancelled. */
export async function saveMarkdownFile(defaultName: string): Promise<string | null> {
  return save({ defaultPath: defaultName, filters: [MD_FILTER] });
}

/** Directory picker; resolves to the folder path or null when cancelled. */
export async function pickDirectory(): Promise<string | null> {
  return open({ directory: true, multiple: false });
}

/** Unified file-or-folder picker (macOS only). Resolves to the chosen path
 *  and whether it is a file or directory, or null when cancelled. */
export async function pickFileOrFolder(): Promise<{ kind: 'file' | 'dir'; path: string } | null> {
  const path = await invoke<string | null>('pick_file_or_folder');
  if (!path) return null;
  const info = await stat(path);
  if (info.isDirectory) return { kind: 'dir', path };
  if (info.isFile) return { kind: 'file', path };
  // Fallback: treat unrecognized results as files (shouldn't happen).
  return { kind: 'file', path };
}

/** Read a UTF-8 text file at an absolute path. */
export function readText(path: string): Promise<string> {
  return readTextFile(path);
}

/** Read raw bytes at an absolute path (used to load images next to a markdown file). */
export async function readBinary(path: string): Promise<Uint8Array> {
  return readFile(path);
}

/** Write UTF-8 text to an absolute path (creates or overwrites). */
export function writeText(path: string, contents: string): Promise<void> {
  return writeTextFile(path, contents);
}

/** Parent directory of an absolute path, or null if already at the filesystem root. */
export function parentDir(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, '');
  if (trimmed === '') return null;

  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (i === -1) return null;
  if (i === 0) return '/';

  const parent = trimmed.slice(0, i);
  // Preserve the Windows drive-letter root form when relevant.
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent;
}

/** Read a single directory level for the sidebar file tree. Errors resolve to an empty list. */
export async function readDirShallow(path: string): Promise<TreeEntry[]> {
  let entries;
  try {
    entries = await readDir(path);
  } catch {
    // A permission or IO error for one folder should not break the UI.
    return [];
  }

  const dirs: TreeEntry[] = [];
  const files: TreeEntry[] = [];
  for (const entry of entries) {
    if (skipDirName(entry.name)) continue;
    const childPath = `${path}/${entry.name}`;
    if (entry.isDirectory) {
      dirs.push({ kind: 'dir', name: entry.name, path: childPath, children: [] });
    } else if (entry.isFile && MD_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(`.${ext}`))) {
      files.push({ kind: 'file', name: entry.name, path: childPath });
    }
  }

  const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...files.sort(byName)];
}

/** Recursive markdown-only tree below root (dirs first, then files, sorted). */
export async function readDirRecursive(root: string): Promise<TreeEntry[]> {
  async function walk(path: string): Promise<TreeEntry[]> {
    const entries = await readDir(path);
    const dirs: TreeEntry[] = [];
    const files: TreeEntry[] = [];

    // Walk subdirectories in parallel; an unreadable subdir is dropped entirely.
    const childPromises: Promise<{ path: string; children: TreeEntry[] } | null>[] = [];
    for (const entry of entries) {
      if (skipDirName(entry.name)) continue;
      const childPath = `${path}/${entry.name}`;
      if (entry.isDirectory) {
        childPromises.push(
          walk(childPath)
            .then((children) => ({ path: childPath, children }))
            .catch(() => null)
        );
      } else if (entry.isFile && MD_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(`.${ext}`))) {
        files.push({ kind: 'file', name: entry.name, path: childPath });
      }
    }

    const settled = await Promise.all(childPromises);
    for (const result of settled) {
      if (result === null) continue;
      dirs.push({ kind: 'dir', name: baseName(result.path), path: result.path, children: result.children });
    }

    const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name);
    return [...dirs.sort(byName), ...files.sort(byName)];
  }
  return walk(root);
}
