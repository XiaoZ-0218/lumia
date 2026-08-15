// Session memory: last opened folder/file, restored on the next launch.
// Tauri-only — browser FS Access handles can't be re-opened without a fresh
// permission prompt, so the web version keeps draft-only restore.

const FOLDER_KEY = 'lumia:lastFolder';
const FILE_KEY = 'lumia:lastFile';

export function rememberFolder(path: string): void {
  try {
    localStorage.setItem(FOLDER_KEY, path);
  } catch {
    /* best-effort — storage may be unavailable */
  }
}

export function rememberFile(path: string): void {
  try {
    localStorage.setItem(FILE_KEY, path);
  } catch {
    /* best-effort */
  }
}

export function forgetFile(): void {
  try {
    localStorage.removeItem(FILE_KEY);
  } catch {
    /* best-effort */
  }
}

export function lastSession(): { folder: string | null; file: string | null } {
  try {
    return { folder: localStorage.getItem(FOLDER_KEY), file: localStorage.getItem(FILE_KEY) };
  } catch {
    return { folder: null, file: null };
  }
}
