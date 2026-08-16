// Files: open/save single .md + autosave/restore (Typora-style).

import { onUpdate, ready } from './editor';
import { openFolder, revealFile } from './sidebar';
import { t } from './i18n';
import { forgetFile, lastSession, rememberFile } from './session';
import { isTauri, openMarkdownFile, pickFileOrFolder, readText, saveMarkdownFile, writeText } from './tauri-bridge';

// lib.dom ships FileSystemFileHandle but not the picker methods — declare them.
type FilePickerAcceptType = { description?: string; accept: Record<string, string[]> };
type OpenFilePickerOptions = { types?: FilePickerAcceptType[]; excludeAcceptAllOption?: boolean };
type SaveFilePickerOptions = OpenFilePickerOptions & { suggestedName?: string };

declare global {
  interface Window {
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }
}

// Picker description resolves at call time so it follows a locale switch.
function mdTypes(): FilePickerAcceptType {
  return {
    description: t('markdownTypes'),
    accept: { 'text/markdown': ['.md', '.markdown'] },
  };
}
const DRAFT_KEY = 'lumia:draft';

/** File name when there is no FS handle (input-file fallback open). */
let fallbackName: string | null = null;

function setDocTitle(name: string): void {
  const el = document.getElementById('doc-title');
  if (el) el.textContent = name;
  document.title = name;
}

/** Last path segment of a Tauri absolute path. */
function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

/** Directory portion of a Tauri absolute path. */
function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(0, i);
}

/** Current file name, from the shared handle (the sidebar sets it too). */
function currentName(): string | null {
  const handle = (window as any).__currentFileHandle as FileSystemFileHandle | string | undefined;
  if (!handle) return fallbackName;
  return typeof handle === 'string' ? baseName(handle) : handle.name;
}

// ---- open ----
async function applyOpened(text: string, name: string, handle: FileSystemFileHandle | string | null): Promise<void> {
  // The handle must be set before rendering: the image node view resolves
  // relative srcs against the current file's directory at render time.
  (window as any).__currentFileHandle = handle;
  fallbackName = handle ? null : name;
  await window.__editor.setMarkdown(text); // editor.ts renders the heading — re-set below
  setDocTitle(name);
  // A string handle is a Tauri path — remember it for the next launch. Browser
  // handles can't be re-opened without a permission prompt, so forget instead.
  if (typeof handle === 'string') rememberFile(handle);
  else forgetFile();
}

async function openFile(): Promise<void> {
  if (isTauri()) {
    const picked = await pickFileOrFolder();
    if (!picked) return;
    if (picked.kind === 'dir') {
      void openFolder(picked.path);
      return;
    }
    const file = await openMarkdownFile(picked.path);
    if (file) {
      await applyOpened(file.text, file.name, file.path);
      // Browser file handles cannot reveal their containing folder, but Tauri
      // gives us a real path, so load the folder and highlight the file.
      void revealFile(dirName(file.path), file.name);
    }
    return;
  }
  if (typeof window.showOpenFilePicker !== 'function') return fileInput.click();
  try {
    const [handle] = await window.showOpenFilePicker({ types: [mdTypes()] });
    const file = await handle.getFile();
    await applyOpened(await file.text(), handle.name, handle);
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') console.error('open failed:', err);
  }
}

// Fallback open for browsers without the FS Access API.
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.md,.markdown,text/markdown';
fileInput.style.display = 'none';
// Must be attached for the picker to open on synthetic click in all browsers.
document.body.appendChild(fileInput);
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  void file.text().then((text) => applyOpened(text, file.name, null));
});

// ---- save ----
function suggestedName(): string {
  const title = (document.getElementById('doc-title')?.textContent ?? '').trim() || t('untitled');
  return /\.(md|markdown)$/i.test(title) ? title : `${title}.md`;
}

async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveFile(): Promise<void> {
  const text = await window.__editor.getMarkdown();
  const existing = (window as any).__currentFileHandle as FileSystemFileHandle | string | undefined;
  if (existing) {
    try {
      if (typeof existing === 'string') {
        await writeText(existing, text); // tauri: write to the remembered path
      } else {
        await writeHandle(existing, text);
      }
      return;
    } catch (err) {
      console.error('save failed, retrying as Save As:', err);
    }
  }
  if (isTauri()) {
    const path = await saveMarkdownFile(suggestedName());
    if (!path) return; // cancelled
    try {
      await writeText(path, text);
    } catch (err) {
      console.error('save failed:', err);
      return;
    }
    (window as any).__currentFileHandle = path;
    setDocTitle(baseName(path));
    rememberFile(path);
    return;
  }
  if (typeof window.showSaveFilePicker !== 'function') return download(text);
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: suggestedName(), types: [mdTypes()] });
    await writeHandle(handle, text);
    (window as any).__currentFileHandle = handle;
    setDocTitle(handle.name);
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') console.error('save failed:', err);
  }
}

// Fallback save for browsers without the FS Access API: download a copy.
function download(text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = suggestedName();
  // Attach before clicking so the download fires in every browser (cf. export.ts).
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- autosave / restore ----
let draftTimer: number | undefined;
function scheduleDraftSave(md: string): void {
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, md);
    } catch {
      /* quota / disabled storage — autosave is best-effort */
    }
  }, 500);
}

// ---- session restore (Tauri only): reopen the last folder and file ----
async function restoreSession(): Promise<void> {
  await ready;
  const { folder, file } = lastSession();
  if (file) {
    try {
      const text = await readText(file);
      // The path must be attached before rendering so relative image srcs
      // resolve against the file's directory.
      (window as any).__currentFileHandle = file;
      fallbackName = null;
      // The autosaved draft is newer than the disk file when edits were
      // unsaved — keep the draft, just re-attach the path, title, and tree.
      const draft = localStorage.getItem(DRAFT_KEY);
      if (!draft || !draft.trim()) await window.__editor.setMarkdown(text);
      setDocTitle(baseName(file));
      await revealFile(dirName(file), baseName(file));
      return;
    } catch (err) {
      console.error('failed to restore last file:', err);
      forgetFile();
    }
  }
  if (folder) {
    // loadRootTauri already renders a "could not read" state on failure.
    await openFolder(folder);
  }
}

export function initFiles(): void {
  document.getElementById('open-file')?.addEventListener('click', () => void openFile());
  document.getElementById('save-file')?.addEventListener('click', () => void saveFile());

  // ---- open dropdown: merged Open file / Open folder menu ----
  const openMenu = document.getElementById('open-menu') as HTMLButtonElement | null;
  const openDropdown = document.getElementById('open-dropdown') as HTMLDivElement | null;
  const openItems = openDropdown
    ? Array.from(openDropdown.querySelectorAll<HTMLButtonElement>('button'))
    : [];

  if (openMenu && openDropdown && openItems.length === 1) {
    // Tauri: one open action — the button triggers it directly, no dropdown.
    const only = openItems[0];
    openMenu.addEventListener('click', () => only?.click());
  } else if (openMenu && openDropdown) {
    // Browser: two actions — toggle the dropdown.
    function setDropdownOpen(open: boolean): void {
      if (!openDropdown || !openMenu) return;
      openDropdown.hidden = !open;
      openMenu.setAttribute('aria-expanded', String(open));
    }
    openMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      setDropdownOpen(Boolean(openDropdown.hidden));
    });
    openDropdown.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => setDropdownOpen(false));
    });
    document.addEventListener('click', (e) => {
      if (!openDropdown.hidden && !openDropdown.contains(e.target as Node) && e.target !== openMenu) {
        setDropdownOpen(false);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !openDropdown.hidden) setDropdownOpen(false);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'o' || key === 's') {
      e.preventDefault();
      void (key === 'o' ? openFile() : saveFile());
    }
  });

  onUpdate((md) => {
    scheduleDraftSave(md);
    const name = currentName(); // editor.ts renders the heading — re-assert the file name
    if (name) setDocTitle(name);
  });

  // Source-mode edits bypass the editor's listener — autosave those too.
  document.getElementById('source')?.addEventListener('input', (e) => {
    scheduleDraftSave((e.target as HTMLTextAreaElement).value);
  });

  void ready.then(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft && draft.trim()) void window.__editor.setMarkdown(draft);
    } catch {
      /* no localStorage — skip restore */
    }
  });

  // Queued after the draft restore above so the draft content wins on boot.
  if (isTauri()) void restoreSession();
}
