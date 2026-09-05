// Sidebar: Typora-style Files | Outline tabs, folder file tree, and doc outline.
import './sidebar.css';
import { onUpdate, ready } from './editor';
import { t, onLocaleChange } from './i18n';
import { rememberFile, rememberFolder } from './session';
import { isTauri, parentDir, pickDirectory, readDirShallow, readText } from './tauri-bridge';
import type { TreeEntry as BridgeTreeEntry } from './tauri-bridge';

// ---- minimal File System Access API types (missing from older DOM libs) ----
interface FSAFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
interface FSADirHandle {
  kind: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, FSAFileHandle | FSADirHandle]>;
}
declare global {
  interface Window {
    showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FSADirHandle>;
  }
}

const MD_RE = /\.(md|markdown|txt)$/i;
const SKIP_RE = /^\.|^node_modules$/;

type DirNode = {
  kind: 'dir';
  name: string;
  path: string;
  handle?: FSADirHandle;
  children: TreeNode[] | null;
};
type FileNode = { kind: 'file'; name: string; path: string; handle?: FSAFileHandle };
type TreeNode = DirNode | FileNode;

type Root = { kind: 'tauri'; path: string } | { kind: 'fsa'; handle: FSADirHandle };

let currentRoot: Root | null = null;

/** Last path segment — the files header shows the folder name, not the full path. */
function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

// ---- tabs: restructure .sidebar into a Files | Outline tab bar ----
function buildTabs(): void {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const sections = sidebar.querySelectorAll<HTMLElement>('.sidebar-section');
  if (sections.length < 2) return;
  sidebar.classList.add('sidebar-tabs-root');

  const config = [
    { i18nKey: 'files' as const, key: 'files', section: sections[0] },
    { i18nKey: 'outline' as const, key: 'outline', section: sections[1] },
  ];
  const tabBar = document.createElement('div');
  tabBar.className = 'sidebar-tabs';
  const buttons = new Map<string, HTMLButtonElement>();
  for (const c of config) {
    c.section.classList.add('sidebar-panel');
    c.section.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-tab';
    btn.textContent = t(c.i18nKey);
    btn.addEventListener('click', () => activate(c.key));
    buttons.set(c.key, btn);
    tabBar.appendChild(btn);
  }
  sidebar.prepend(tabBar);
  onLocaleChange(() => {
    for (const c of config) buttons.get(c.key)!.textContent = t(c.i18nKey);
  });

  function activate(key: string): void {
    for (const c of config) {
      c.section.hidden = c.key !== key;
      buttons.get(c.key)?.classList.toggle('active', c.key === key);
    }
  }
  activate('files');
}

// ---- file tree: one-level loads with cached children ----
async function scanDirShallowFSA(dir: FSADirHandle, path: string): Promise<TreeNode[]> {
  const dirs: DirNode[] = [];
  const files: FileNode[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (SKIP_RE.test(name)) continue;
    if (handle.kind === 'directory') {
      dirs.push({ kind: 'dir', name, path: `${path}/${name}`, handle, children: null });
    } else if (MD_RE.test(name)) {
      files.push({ kind: 'file', name, path: `${path}/${name}`, handle });
    }
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...files.sort(byName)];
}

/** Adapt a bridge tree entry (Tauri, one level) to the sidebar's node shape. */
function fromBridgeShallow(entry: BridgeTreeEntry): TreeNode {
  return entry.kind === 'dir'
    ? { kind: 'dir', name: entry.name, path: entry.path, children: null }
    : { kind: 'file', name: entry.name, path: entry.path };
}

async function scanDirShallowTauri(path: string): Promise<TreeNode[]> {
  const entries = await readDirShallow(path);
  return entries.map(fromBridgeShallow);
}

async function loadChildren(node: DirNode): Promise<TreeNode[]> {
  if (node.children !== null) return node.children;
  if (!currentRoot) return [];
  try {
    node.children =
      currentRoot.kind === 'tauri'
        ? await scanDirShallowTauri(node.path)
        : await scanDirShallowFSA(node.handle!, node.path);
  } catch (err) {
    // Tolerate unreadable subfolders: keep the tree usable even if one branch fails.
    console.error('failed to read folder:', err);
    node.children = [];
  }
  return node.children;
}

function renderDirNode(node: DirNode, li: HTMLLIElement): void {
  li.textContent = '';
  li.className = 'tree-dir';
  // The clickable row is a wrapper div (not the li) so hover styles apply to
  // the row only — the li also contains the children subtree.
  const row = document.createElement('div');
  row.className = 'tree-row';
  const caret = document.createElement('span');
  caret.className = 'tree-caret';
  caret.textContent = '▸';
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.name;
  const children = document.createElement('ul');
  children.className = 'tree-children';
  children.hidden = true;
  row.append(caret, label);
  li.append(row, children);

  const toggle = async (): Promise<void> => {
    const opening = !li.classList.contains('open');
    if (opening && node.children === null) {
      const loaded = await loadChildren(node);
      renderTree(children, loaded);
    }
    const open = li.classList.toggle('open');
    children.hidden = !open;
    caret.textContent = open ? '▾' : '▸';
  };
  row.addEventListener('click', () => void toggle());
}

function renderTree(container: HTMLUListElement, nodes: TreeNode[]): void {
  container.textContent = '';
  if (nodes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tree-empty';
    empty.textContent = t('emptyFolder');
    container.appendChild(empty);
    return;
  }
  for (const node of nodes) {
    const li = document.createElement('li');
    if (node.kind === 'dir') {
      renderDirNode(node, li);
    } else {
      li.className = 'tree-file';
      li.textContent = node.name;
      li.title = node.path;
      li.dataset.path = node.path;
      li.addEventListener('click', () => void openFile(node, li));
    }
    container.appendChild(li);
  }
}

async function openFile(node: FileNode, li: HTMLElement): Promise<void> {
  await ready;
  const text = node.handle ? await (await node.handle.getFile()).text() : await readText(node.path);
  // Set the handle before rendering so relative image srcs resolve against
  // the file's directory.
  (window as any).__currentFileHandle = node.handle ?? node.path;
  await window.__editor.setMarkdown(text);
  // Tauri tree nodes carry a real path — remember it for the next launch.
  if (!node.handle) rememberFile(node.path);
  document.querySelectorAll('#file-tree li.active').forEach((el) => el.classList.remove('active'));
  li.classList.add('active');
}

// ---- files header: current root + parent-folder button ----
function updateFilesHeader(): void {
  const upBtn = document.getElementById('up-dir') as HTMLButtonElement | null;
  const rootName = document.getElementById('root-name') as HTMLSpanElement | null;
  if (!upBtn || !rootName) return;

  if (!currentRoot) {
    rootName.textContent = t('noFolder');
    upBtn.disabled = true;
    upBtn.title = t('openFolderFirst');
    return;
  }

  rootName.textContent = currentRoot.kind === 'tauri' ? baseName(currentRoot.path) : currentRoot.handle.name;
  rootName.title = currentRoot.kind === 'tauri' ? currentRoot.path : currentRoot.handle.name;

  if (currentRoot.kind === 'fsa') {
    // FS Access API directory handles do not expose their parent directory, so
    // upward navigation is impossible in the browser version.
    upBtn.disabled = true;
    upBtn.title = t('parentUnavailable');
    return;
  }

  const parent = parentDir(currentRoot.path);
  upBtn.disabled = parent === null;
  upBtn.title = parent === null ? t('atRoot') : t('openParent');
}

function wireUpDir(): void {
  const upBtn = document.getElementById('up-dir') as HTMLButtonElement | null;
  if (!upBtn) return;
  upBtn.addEventListener('click', () => {
    if (!currentRoot || currentRoot.kind !== 'tauri') return;
    const parent = parentDir(currentRoot.path);
    if (!parent) return;
    void loadRootTauri(parent);
  });
}

/** Load a folder into the Files tree (used by both folder picker and unified open). */
export async function openFolder(path: string): Promise<void> {
  await loadRootTauri(path);
}

async function loadRootTauri(path: string): Promise<void> {
  currentRoot = { kind: 'tauri', path };
  rememberFolder(path);
  updateFilesHeader();
  const tree = document.getElementById('file-tree') as HTMLUListElement | null;
  if (!tree) return;
  try {
    const nodes = await scanDirShallowTauri(path);
    renderTree(tree, nodes);
  } catch (err) {
    console.error('failed to load folder:', err);
    tree.textContent = '';
    const li = document.createElement('li');
    li.className = 'tree-empty';
    li.textContent = t('couldNotReadFolder');
    tree.appendChild(li);
  }
}

async function loadRootFSA(handle: FSADirHandle): Promise<void> {
  currentRoot = { kind: 'fsa', handle };
  updateFilesHeader();
  const tree = document.getElementById('file-tree') as HTMLUListElement | null;
  if (!tree) return;
  try {
    const nodes = await scanDirShallowFSA(handle, handle.name);
    renderTree(tree, nodes);
  } catch (err) {
    console.error('failed to load folder:', err);
    tree.textContent = '';
    const li = document.createElement('li');
    li.className = 'tree-empty';
    li.textContent = t('couldNotReadFolder');
    tree.appendChild(li);
  }
}

async function pickFolder(): Promise<void> {
  if (isTauri()) {
    const root = await pickDirectory();
    if (!root) return;
    await loadRootTauri(root);
  } else {
    const pick = window.showDirectoryPicker;
    if (!pick) return;
    const root = await pick({ mode: 'read' });
    await loadRootFSA(root);
  }
}

function wireOpenFolder(): void {
  const btn = document.getElementById('open-folder') as HTMLButtonElement | null;
  if (!btn) return;
  if (!isTauri() && typeof window.showDirectoryPicker !== 'function') {
    btn.disabled = true;
    btn.title = t('openFolderBrowser');
    return;
  }
  btn.addEventListener('click', () => void pickFolder());
}

/** Tauri uses a single "Open…" action (file-or-folder picker); browsers keep
 *  separate "Open file" / "Open folder" items because FS Access API has no
 *  mixed picker. */
function renderOpenDropdownItems(): void {
  const dropdown = document.getElementById('open-dropdown') as HTMLDivElement | null;
  const openFile = document.getElementById('open-file') as HTMLButtonElement | null;
  const openFolder = document.getElementById('open-folder') as HTMLButtonElement | null;
  const openMenu = document.getElementById('open-menu') as HTMLButtonElement | null;
  if (!dropdown || !openFile) return;

  if (isTauri()) {
    openFile.textContent = t('openPick');
    openFile.title = t('openPickTitle');
    openFile.setAttribute('aria-label', t('openPickTitle'));
    openFolder?.remove();
    // A one-item dropdown is just an extra click: collapse the menu into a
    // direct trigger so one click opens the picker (wired in initFiles).
    if (openMenu) {
      openMenu.textContent = t('openPlain');
      openMenu.title = t('openPickTitle');
      openMenu.setAttribute('aria-label', t('openPickTitle'));
      openMenu.removeAttribute('aria-haspopup');
      openMenu.removeAttribute('aria-expanded');
      dropdown.hidden = true;
    }
  }
  // In browsers the static two-item markup is left untouched.
}

/** Load a folder into the Files tree and highlight the named file as active. */
export async function revealFile(dirPath: string, fileName: string): Promise<void> {
  await loadRootTauri(dirPath);
  const tree = document.getElementById('file-tree') as HTMLUListElement | null;
  if (!tree) return;
  const targetPath = `${dirPath}/${fileName}`;
  for (const li of tree.querySelectorAll<HTMLLIElement>('li.tree-file')) {
    if (li.dataset.path === targetPath) {
      document.querySelectorAll('#file-tree li.active').forEach((el) => el.classList.remove('active'));
      li.classList.add('active');
      break;
    }
  }
}

// ---- outline ----
type Heading = { level: number; text: string };

// Headings come from the ProseMirror doc, not a line regex over the markdown —
// a regex would also pick up `# lines` inside fenced code blocks.
function readHeadings(): Heading[] {
  const heads: Heading[] = [];
  const view = window.__editor.getView();
  view.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      heads.push({ level: node.attrs.level as number, text: node.textContent });
      return false;
    }
    return true;
  });
  return heads;
}

function renderOutline(heads: Heading[]): void {
  const ul = document.getElementById('outline') as HTMLUListElement | null;
  if (!ul) return;
  ul.textContent = '';
  heads.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = `outline-item lvl-${h.level}`;
    li.textContent = h.text || t('outlineUntitled');
    li.addEventListener('click', () => scrollToHeading(i));
    ul.appendChild(li);
  });
}

function scrollToHeading(index: number): void {
  const pm = document.querySelector('#editor .ProseMirror');
  if (!pm) return;
  const h = pm.querySelectorAll('h1, h2, h3, h4, h5, h6')[index];
  if (h) h.scrollIntoView({ block: 'start' });
}

function updateActiveOutline(): void {
  const ul = document.getElementById('outline');
  const pm = document.querySelector('#editor .ProseMirror');
  const editor = document.getElementById('editor');
  if (!ul || !pm || !editor) return;
  const items = ul.querySelectorAll<HTMLElement>('.outline-item');
  const heads = pm.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (!heads.length) return;
  const top = editor.getBoundingClientRect().top;
  let active = 0;
  heads.forEach((h, i) => {
    if (h.getBoundingClientRect().top - top <= 60) active = i;
  });
  items.forEach((li, i) => li.classList.toggle('active', i === active));
}

export function initSidebar(): void {
  buildTabs();
  renderOpenDropdownItems();
  wireOpenFolder();
  wireUpDir();
  updateFilesHeader();

  const tree = document.getElementById('file-tree');
  if (tree) {
    tree.textContent = '';
    const li = document.createElement('li');
    li.className = 'tree-empty tree-empty-action';
    li.textContent = t('openFolderToBrowse');
    li.title = t('openFolder');
    // No folder open yet: clicking the empty state mirrors the titlebar's Open
    // button — the unified picker in Tauri, the folder picker in browsers.
    li.addEventListener('click', () => {
      const target = isTauri() ? 'open-file' : 'open-folder';
      document.getElementById(target)?.click();
    });
    tree.appendChild(li);
  }

  // Locale switch: re-assert the strings this module renders outside of
  // t() call sites (files header, Tauri open-button rewrite, empty state).
  onLocaleChange(() => {
    updateFilesHeader();
    renderOpenDropdownItems();
    const empty = document.querySelector('#file-tree .tree-empty-action');
    if (empty) {
      empty.textContent = t('openFolderToBrowse');
      (empty as HTMLElement).title = t('openFolder');
    }
  });

  void (async () => {
    await ready;
    onUpdate(() => {
      renderOutline(readHeadings());
      updateActiveOutline();
    });
    renderOutline(readHeadings());
    document.getElementById('editor')?.addEventListener('scroll', updateActiveOutline, { passive: true });
    updateActiveOutline();
  })();
}
