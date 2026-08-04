// Files: open/save single .md + autosave/restore (Typora-style).

import { onUpdate, ready } from './editor';

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

const MD_TYPES: FilePickerAcceptType = {
  description: 'Markdown',
  accept: { 'text/markdown': ['.md', '.markdown'] },
};
const DRAFT_KEY = 'typora-clone:draft';

/** File name when there is no FS handle (input-file fallback open). */
let fallbackName: string | null = null;

function setDocTitle(name: string): void {
  const el = document.getElementById('doc-title');
  if (el) el.textContent = name;
  document.title = name;
}

/** Current file name, from the shared handle (the sidebar sets it too). */
function currentName(): string | null {
  const handle = (window as any).__currentFileHandle as FileSystemFileHandle | undefined;
  return handle ? handle.name : fallbackName;
}

// ---- open ----
async function applyOpened(text: string, name: string, handle: FileSystemFileHandle | null): Promise<void> {
  await window.__editor.setMarkdown(text); // editor.ts renders the heading — re-set below
  (window as any).__currentFileHandle = handle;
  fallbackName = handle ? null : name;
  setDocTitle(name);
}

async function openFile(): Promise<void> {
  if (typeof window.showOpenFilePicker !== 'function') return fileInput.click();
  try {
    const [handle] = await window.showOpenFilePicker({ types: [MD_TYPES] });
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
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  void file.text().then((text) => applyOpened(text, file.name, null));
});

// ---- save ----
function suggestedName(): string {
  const title = (document.getElementById('doc-title')?.textContent ?? '').trim() || 'Untitled';
  return /\.(md|markdown)$/i.test(title) ? title : `${title}.md`;
}

async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveFile(): Promise<void> {
  const text = await window.__editor.getMarkdown();
  const existing = (window as any).__currentFileHandle as FileSystemFileHandle | undefined;
  if (existing) {
    try {
      await writeHandle(existing, text);
      return;
    } catch (err) {
      console.error('save failed, retrying as Save As:', err);
    }
  }
  if (typeof window.showSaveFilePicker !== 'function') return download(text);
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: suggestedName(), types: [MD_TYPES] });
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
  a.click();
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

export function initFiles(): void {
  document.getElementById('open-file')?.addEventListener('click', () => void openFile());
  document.getElementById('save-file')?.addEventListener('click', () => void saveFile());
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
}
