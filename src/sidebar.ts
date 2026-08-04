// Sidebar: Typora-style Files | Outline tabs, folder file tree, and doc outline.
import './sidebar.css';
import { onUpdate, ready } from './editor';

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

type DirNode = { kind: 'dir'; name: string; path: string; children: TreeNode[] };
type FileNode = { kind: 'file'; name: string; path: string; handle: FSAFileHandle };
type TreeNode = DirNode | FileNode;

// ---- tabs: restructure .sidebar into a Files | Outline tab bar ----
function buildTabs(): void {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const sections = sidebar.querySelectorAll<HTMLElement>('.sidebar-section');
  if (sections.length < 2) return;
  sidebar.classList.add('sidebar-tabs-root');

  const config = [
    { label: 'Files', key: 'files', section: sections[0] },
    { label: 'Outline', key: 'outline', section: sections[1] },
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
    btn.textContent = c.label;
    btn.addEventListener('click', () => activate(c.key));
    buttons.set(c.key, btn);
    tabBar.appendChild(btn);
  }
  sidebar.prepend(tabBar);

  function activate(key: string): void {
    for (const c of config) {
      c.section.hidden = c.key !== key;
      buttons.get(c.key)?.classList.toggle('active', c.key === key);
    }
  }
  activate('files');
}

// ---- file tree ----
async function scanDir(dir: FSADirHandle, path: string): Promise<TreeNode[]> {
  const dirs: DirNode[] = [];
  const files: FileNode[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') {
      dirs.push({
        kind: 'dir',
        name,
        path: `${path}/${name}`,
        children: await scanDir(handle, `${path}/${name}`),
      });
    } else if (MD_RE.test(name)) {
      files.push({ kind: 'file', name, path: `${path}/${name}`, handle });
    }
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...files.sort(byName)];
}

function renderTree(container: HTMLUListElement, nodes: TreeNode[]): void {
  for (const node of nodes) {
    const li = document.createElement('li');
    if (node.kind === 'dir') {
      li.className = 'tree-dir open';
      const caret = document.createElement('span');
      caret.className = 'tree-caret';
      caret.textContent = '▾';
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = node.name;
      const children = document.createElement('ul');
      children.className = 'tree-children';
      renderTree(children, node.children);
      li.append(caret, label, children);
      const toggle = (): void => {
        const open = li.classList.toggle('open');
        children.hidden = !open;
        caret.textContent = open ? '▾' : '▸';
      };
      caret.addEventListener('click', toggle);
      label.addEventListener('click', toggle);
    } else {
      li.className = 'tree-file';
      li.textContent = node.name;
      li.title = node.path;
      li.addEventListener('click', () => void openFile(node, li));
    }
    container.appendChild(li);
  }
}

async function openFile(node: FileNode, li: HTMLElement): Promise<void> {
  await ready;
  const text = await (await node.handle.getFile()).text();
  await window.__editor.setMarkdown(text);
  (window as any).__currentFileHandle = node.handle;
  document.querySelectorAll('#file-tree li.active').forEach((el) => el.classList.remove('active'));
  li.classList.add('active');
}

async function pickFolder(): Promise<void> {
  const pick = window.showDirectoryPicker;
  if (!pick) return;
  const root = await pick({ mode: 'read' });
  const nodes = await scanDir(root, root.name);
  const tree = document.getElementById('file-tree') as HTMLUListElement | null;
  if (!tree) return;
  tree.textContent = '';
  if (nodes.length === 0) {
    const li = document.createElement('li');
    li.className = 'tree-empty';
    li.textContent = 'No markdown files found';
    tree.appendChild(li);
    return;
  }
  renderTree(tree, nodes);
}

function wireOpenFolder(): void {
  const btn = document.getElementById('open-folder') as HTMLButtonElement;
  if (!btn) return;
  if (typeof window.showDirectoryPicker !== 'function') {
    btn.disabled = true;
    btn.title = 'Open folder — requires Chrome/Edge';
    return;
  }
  btn.addEventListener('click', () => void pickFolder());
}

// ---- outline ----
type Heading = { level: number; text: string };

function parseHeadings(md: string): Heading[] {
  const heads: Heading[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) heads.push({ level: m[1].length, text: m[2].trim() });
  }
  return heads;
}

function renderOutline(heads: Heading[]): void {
  const ul = document.getElementById('outline') as HTMLUListElement | null;
  if (!ul) return;
  ul.textContent = '';
  heads.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = `outline-item lvl-${h.level}`;
    li.textContent = h.text || '(untitled)';
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
  wireOpenFolder();

  const tree = document.getElementById('file-tree');
  if (tree) {
    tree.textContent = '';
    const li = document.createElement('li');
    li.className = 'tree-empty';
    li.textContent = 'Open a folder to browse';
    tree.appendChild(li);
  }

  void (async () => {
    await ready;
    onUpdate((md) => {
      renderOutline(parseHeadings(md));
      updateActiveOutline();
    });
    const md = await window.__editor.getMarkdown();
    renderOutline(parseHeadings(md));
    document.getElementById('editor')?.addEventListener('scroll', updateActiveOutline, { passive: true });
    updateActiveOutline();
  })();
}
