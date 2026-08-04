// Thin bridge to the Tauri v2 native APIs. Inert in plain browsers: isTauri()
// is false there, so callers keep their existing web (FS Access API) paths.

import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

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

/** Open one markdown file via the native dialog; null when cancelled. */
export async function openMarkdownFile(): Promise<{ path: string; name: string; text: string } | null> {
  const path = await open({ multiple: false, filters: [MD_FILTER] });
  if (path === null) return null;
  return { path, name: baseName(path), text: await readTextFile(path) };
}

/** Save dialog seeded with defaultName; resolves to the path or null when cancelled. */
export async function saveMarkdownFile(defaultName: string): Promise<string | null> {
  return save({ defaultPath: defaultName, filters: [MD_FILTER] });
}

/** Directory picker; resolves to the folder path or null when cancelled. */
export async function pickDirectory(): Promise<string | null> {
  return open({ directory: true, multiple: false });
}

/** Read a UTF-8 text file at an absolute path. */
export function readText(path: string): Promise<string> {
  return readTextFile(path);
}

/** Write UTF-8 text to an absolute path (creates or overwrites). */
export function writeText(path: string, contents: string): Promise<void> {
  return writeTextFile(path, contents);
}

/** Recursive markdown-only tree below root (dirs first, then files, sorted). */
export async function readDirRecursive(root: string): Promise<TreeEntry[]> {
  async function walk(path: string): Promise<TreeEntry[]> {
    const entries = await readDir(path);
    const dirs: TreeEntry[] = [];
    const files: TreeEntry[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) {
        dirs.push({ kind: 'dir', name: entry.name, path: `${path}/${entry.name}`, children: await walk(`${path}/${entry.name}`) });
      } else if (entry.isFile && MD_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(`.${ext}`))) {
        files.push({ kind: 'file', name: entry.name, path: `${path}/${entry.name}` });
      }
    }
    const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name);
    return [...dirs.sort(byName), ...files.sort(byName)];
  }
  return walk(root);
}
