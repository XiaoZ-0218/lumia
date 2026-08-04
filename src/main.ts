import './style.css';
import { ready, refreshStats } from './editor';
import { isTauri } from './tauri-bridge';
import { initSidebar } from './sidebar';
import { initExport } from './export';
import { initFiles } from './files';
import { initFormat } from './format';
import { initViewModes } from './viewmodes';

// Tauri shell: real macOS traffic lights float over the overlay titlebar —
// style.css hides the fake dots and insets the titlebar under this class.
if (isTauri()) document.body.classList.add('tauri');

// ---- themes ----
// import.meta.glob picks up every src/themes/*.css at build time.
const themeModules = import.meta.glob('./themes/*.css', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const THEME_LINK_ID = 'theme-link';

function themeName(path: string): string {
  return path.slice('./themes/'.length, -'.css'.length);
}

function applyTheme(name: string) {
  document.getElementById(THEME_LINK_ID)?.remove();
  const url = themeModules[`./themes/${name}.css`];
  if (url) {
    const link = document.createElement('link');
    link.id = THEME_LINK_ID;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }
  document.body.classList.forEach((c) => {
    if (c.startsWith('theme-')) document.body.classList.remove(c);
  });
  document.body.classList.add(`theme-${name}`);
}

const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const themeNames = Object.keys(themeModules).map(themeName);
if (themeNames.length > 0) {
  for (const name of themeNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    themeSelect.appendChild(opt);
  }
  themeSelect.value = themeNames.includes('github') ? 'github' : themeNames[0];
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  applyTheme(themeSelect.value);
} else {
  themeSelect.style.display = 'none';
}

// ---- source mode (Typora-style WYSIWYG <-> markdown toggle) ----
const sourceToggle = document.getElementById('source-toggle') as HTMLButtonElement;
const textarea = document.getElementById('source') as HTMLTextAreaElement;

let sourceMode = false;
sourceToggle.addEventListener('click', async () => {
  await ready;
  sourceMode = !sourceMode;
  if (sourceMode) {
    textarea.value = await window.__editor.getMarkdown();
    textarea.focus();
  } else {
    await window.__editor.setMarkdown(textarea.value);
  }
  document.body.classList.toggle('source-mode', sourceMode);
  sourceToggle.classList.toggle('active', sourceMode);
});

textarea.addEventListener('input', () => {
  if (sourceMode) refreshStats(textarea.value);
});

// ---- zoom (editor font scale, like Typora's Ctrl+wheel zoom) ----
let zoom = 100;
function applyZoom() {
  const pm = document.querySelector<HTMLElement>('#editor .ProseMirror');
  if (pm) pm.style.setProperty('zoom', String(zoom / 100));
}
document.getElementById('zoom-in')?.addEventListener('click', () => {
  zoom = Math.min(200, zoom + 10);
  applyZoom();
});
document.getElementById('zoom-out')?.addEventListener('click', () => {
  zoom = Math.max(50, zoom - 10);
  applyZoom();
});

// ---- sidebar toggle ----
document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.body.classList.toggle('no-sidebar');
});

// ---- keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key === '/') {
    e.preventDefault();
    sourceToggle.click();
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault();
    zoom = Math.min(200, zoom + 10);
    applyZoom();
  } else if (e.key === '-') {
    e.preventDefault();
    zoom = Math.max(50, zoom - 10);
    applyZoom();
  }
});

// ---- feature modules ----
initSidebar();
initExport();
initFiles();
initFormat();
initViewModes();
