#!/usr/bin/env node
// Runtime smoke test for Lumia.
// Boots the production bundle (dist/assets/index-*.js) inside jsdom and asserts
// end-to-end behavior: editor boot, module init, outline, tabs, source mode,
// HTML export, focus/typewriter modes, and format shortcut guards.
//
// Usage:
//   npm i --no-save jsdom
//   npm run build
//   node scripts/smoke.mjs
//
// jsdom is intentionally not a package.json dependency — it is a dev-only test
// tool, so `npm i --no-save jsdom` keeps package.json / package-lock.json clean.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- tiny test harness -----------------------------------------------------
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ok - ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL - ${msg}`);
  }
}
async function waitFor(fn, label, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (fn()) return;
    } catch {
      /* retry */
    }
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// ---- locate the built entry chunk ------------------------------------------
const distIndex = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const chunkMatch = distIndex.match(/src="\.?\/?(assets\/index-[^"]+\.js)"/);
if (!chunkMatch) throw new Error('no built entry chunk found in dist/index.html');
const chunkPath = join(root, 'dist', chunkMatch[1]);

// ---- boot jsdom -------------------------------------------------------------
const html = readFileSync(join(root, 'index.html'), 'utf8');
const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', (e) => jsdomErrors.push(e.message));
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole: vc,
});
const { window } = dom;
const { document } = window;

// Expose the browser globals the bundle (and Milkdown/ProseMirror) rely on.
// Deliberately NOT overwritten: URL, Blob, fetch, timers, console (Node's own
// implementations are used / stubbed below where jsdom lacks them).
// Note: @milkdown/ctx's Timer uses BARE addEventListener/removeEventListener/
// dispatchEvent, which only resolve in a browser global scope — shim them here.
const globalsToCopy = [
  'window', 'document', 'navigator', 'getComputedStyle', 'localStorage',
  'sessionStorage', 'history', 'location', 'requestAnimationFrame',
  'cancelAnimationFrame', 'Element', 'HTMLElement', 'HTMLAnchorElement',
  'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement',
  'HTMLTextAreaElement', 'HTMLLinkElement', 'HTMLUListElement', 'HTMLLIElement',
  'Node', 'Text', 'DocumentFragment', 'Document', 'Comment', 'Range', 'DOMRect',
  'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent',
  'DOMParser', 'NodeFilter',
  'File', 'FormData', 'Headers', 'XMLHttpRequest', 'addEventListener',
  'removeEventListener', 'dispatchEvent',
];
for (const key of globalsToCopy) {
  Object.defineProperty(globalThis, key, {
    value: window[key],
    configurable: true,
    writable: true,
  });
}
if (typeof document.getSelection !== 'function') {
  document.getSelection = () => window.getSelection();
}

// jsdom layout gaps — stub, don't delete features.
window.HTMLElement.prototype.scrollIntoView = function () {};
window.print = () => {};
window.prompt = () => 'https://example.com';
// jsdom's Range lacks the rect APIs ProseMirror calls while measuring the
// caret — return empty rects (jsdom's geometry is all zeros anyway).
for (const [proto, method] of [
  [window.Range.prototype, 'getBoundingClientRect'],
  [window.Range.prototype, 'getClientRects'],
]) {
  if (typeof proto[method] !== 'function') {
    proto[method] =
      method === 'getClientRects'
        ? () => []
        : () => ({ top: 0, left: 0, height: 0, width: 0, right: 0, bottom: 0, x: 0, y: 0 });
  }
}

// Blob URL + anchor-click interception so export/save downloads are observable.
const createdBlobs = new Map();
let urlSeq = 0;
globalThis.URL.createObjectURL = (b) => {
  const u = `blob:mock-${urlSeq++}`;
  createdBlobs.set(u, b);
  return u;
};
globalThis.URL.revokeObjectURL = () => {};
const downloads = [];
window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ href: this.href, download: this.download });
};

// Theme CSS served for the export test (read the real built asset when found).
const assetFiles = readdirSync(join(root, 'dist', 'assets'));
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  const base = url.split('/').pop();
  const file = assetFiles.find((f) => f === base && f.endsWith('.css'));
  const css = file
    ? readFileSync(join(root, 'dist', 'assets', file), 'utf8')
    : '/* no css */ body.theme-github #editor .ProseMirror { color: #000; }';
  return { ok: true, text: async () => css };
};

// ---- boot the bundle ---------------------------------------------------------
console.log('Booting bundle:', chunkMatch[1]);
await import(pathToFileURL(chunkPath).href);

await waitFor(
  () => {
    const pm = document.querySelector('#editor .milkdown .ProseMirror');
    return (
      pm && pm.textContent.includes('Welcome to Lumia') &&
      typeof window.__editor?.getMarkdown === 'function'
    );
  },
  'editor boot',
);
await tick(150); // let onUpdate / outline / export wiring settle

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const editor = window.__editor;
const pm = () => document.querySelector('#editor .milkdown .ProseMirror');

// ---- 1. editor boots + getMarkdown round-trip -------------------------------
console.log('\n[1] Editor boot & markdown round-trip');
assert($('#editor .milkdown .ProseMirror') !== null, '#editor .milkdown .ProseMirror exists');
assert($('#editor .milkdown .ProseMirror').getAttribute('contenteditable') === 'true',
  'ProseMirror is contenteditable');
const welcomeMd = await editor.getMarkdown();
assert(welcomeMd.includes('# Welcome to Lumia'), 'getMarkdown returns the welcome doc');
assert(welcomeMd.includes('## Table'), 'getMarkdown contains all sections');

await editor.setMarkdown('# Hello\n\nWorld of **smoke**');
const roundMd = await editor.getMarkdown();
assert(roundMd.includes('# Hello') && roundMd.includes('**smoke**'), 'setMarkdown round-trips');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline re-render after restore');

// ---- 1b. task list checkboxes (node view + toggle) ---------------------------
console.log('\n[1b] Task list checkboxes');
const taskItems = $$('#editor .milkdown .ProseMirror li[data-item-type="task"]');
assert(taskItems.length === 3, `task items render as li[data-item-type="task"] (got ${taskItems.length})`);
assert(taskItems.every((li) => li.querySelector('input[type="checkbox"]') !== null),
  'each task item contains a checkbox input');
assert(taskItems.filter((li) => li.querySelector('input[type="checkbox"]').checked).length === 2,
  'welcome doc: two of three task items start checked');
const taskBox = taskItems[0].querySelector('input[type="checkbox"]');
taskBox.checked = false;
taskBox.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick(30);
const toggledMd = await editor.getMarkdown();
assert(/^[-*] \[ \] WYSIWYG editing$/m.test(toggledMd), 'checkbox change toggles the task item state');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline restored after task toggle');

// ---- 1c. Raw HTML rendering (node view + sanitizer + round-trip) ------------
console.log('\n[1c] Raw HTML rendering');
await editor.setMarkdown('<p align="center"><a href="https://example.com"><img src="https://example.com/x.png" alt="x"></a></p>\n\nplain text');
await tick(50);
const htmlRaw = $('#editor span.html-raw[data-type="html"]');
assert(htmlRaw !== null, 'raw html node renders as span.html-raw[data-type="html"]');
assert(htmlRaw.querySelector('img') !== null, 'raw html node contains a real <img> element');
assert(
  htmlRaw.querySelector('a[href="https://example.com"]') !== null,
  'raw html node contains a real <a href="..."> element',
);
assert(
  htmlRaw.dataset.value === '<p align="center"><a href="https://example.com"><img src="https://example.com/x.png" alt="x"></a></p>',
  'data-value holds the raw html string for round-trip',
);

// Sanitizer: dangerous tags/attributes are stripped inside the rendered DOM.
await editor.setMarkdown('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>');
await tick(50);
const rawSpans = $$('#editor span.html-raw[data-type="html"]');
// 4 nodes: script block, img block, and the <a> tag split into open/close inline html nodes.
assert(rawSpans.length === 4, `sanitizer case produces 4 html nodes (got ${rawSpans.length})`);
assert(rawSpans.every((s) => s.querySelector('script') === null), 'script element removed by sanitizer');
assert(rawSpans.some((s) => s.querySelector('img') !== null), 'img element still rendered');
assert(rawSpans.every((s) => s.querySelector('img[onerror]') === null), 'img onerror attribute stripped by sanitizer');
assert(rawSpans.some((s) => s.querySelector('a') !== null), 'link element still rendered');
assert(
  rawSpans.every((s) => s.querySelector('a[href^="javascript:"]') === null),
  'javascript: href stripped by sanitizer',
);

// Markdown round-trip: the html node serializes back to raw markup.
const rawRoundMd = await editor.getMarkdown();
assert(rawRoundMd.includes('<img'), 'getMarkdown still contains raw <img> markup after round-trip');

// Restore the welcome doc so later sections keep their known state.
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline restored after raw html tests');

// ---- 2. all feature modules init without throwing ---------------------------
console.log('\n[2] Feature module init (sidebar / export / files / format / viewmodes)');
assert($('.sidebar-tabs') !== null, 'sidebar tabs built');
assert($$('.sidebar-tab').length === 2, 'two sidebar tabs exist');
assert($('#file-tree .tree-empty')?.textContent.includes('Open a folder to browse'),
  'file tree shows the empty state (sidebar init ran)');
// Empty state is a clickable affordance that triggers the titlebar Open action.
// In jsdom (browser path) it targets #open-folder, which is disabled (no
// showDirectoryPicker), so the click is inert and must not throw or clear the tree.
const emptyTreeLi = $('#file-tree .tree-empty');
assert(emptyTreeLi !== null && emptyTreeLi.classList.contains('tree-empty-action'),
  'empty file-tree state carries the clickable affordance class');
emptyTreeLi.click();
assert($('#file-tree .tree-empty') !== null, 'empty state persists after an inert click');
assert($('#open-menu') !== null, '#open-menu button exists');
assert($('#open-dropdown') !== null, '#open-dropdown exists');
assert($('#open-dropdown').contains($('#open-folder')), '#open-folder lives inside the dropdown');
assert($('#open-folder').disabled === true, '#open-folder disabled without showDirectoryPicker');
assert($('#export-menu') !== null, '#export-menu button exists');
assert($('#export-dropdown') !== null, '#export-dropdown exists');
assert($('#export-dropdown').contains($('#export-html')), '#export-html lives inside the export dropdown');
assert($('#export-dropdown').contains($('#export-pdf')), '#export-pdf lives inside the export dropdown');
assert($('#up-dir') !== null, '#up-dir button exists');
assert($('#up-dir').disabled === true, '#up-dir disabled when no folder is open');
assert($('#root-name') !== null, '#root-name label exists');
assert($('#root-name').textContent === 'No folder', '#root-name shows empty state');
assert($$('#theme-select option').length === 4, 'theme select populated with 4 themes');
assert(document.body.classList.contains('theme-github'), 'default theme applied');
assert($('#theme-link') !== null, 'theme stylesheet link injected');
assert($$('.statusbar-btn').length >= 5, 'statusbar controls present');
assert(window.localStorage.length >= 0, 'localStorage available');

// ---- 2b. merged Open menu dropdown wiring -----------------------------------
console.log('\n[2b] Open menu dropdown');
const openMenu = $('#open-menu');
const openDropdown = $('#open-dropdown');
assert(openDropdown.hidden === true, 'dropdown is hidden by default');
openMenu.click();
assert(openDropdown.hidden === false, 'dropdown opens on #open-menu click');
assert(openMenu.getAttribute('aria-expanded') === 'true', 'aria-expanded updates to true');
// Clicking an item should close the menu.
$('#open-file').click();
assert(openDropdown.hidden === true, 'dropdown closes after clicking an item');
openMenu.click();
assert(openDropdown.hidden === false, 'dropdown reopens');
// Outside click closes the menu.
document.body.click();
assert(openDropdown.hidden === true, 'dropdown closes on outside click');
openMenu.click();
// Escape closes the menu.
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
assert(openDropdown.hidden === true, 'dropdown closes on Escape');

// ---- 2c. Export menu dropdown wiring ----------------------------------------
console.log('\n[2c] Export menu dropdown');
const exportMenu = $('#export-menu');
const exportDropdown = $('#export-dropdown');
assert(exportDropdown.hidden === true, 'export dropdown is hidden by default');
exportMenu.click();
assert(exportDropdown.hidden === false, 'export dropdown opens on #export-menu click');
assert(exportMenu.getAttribute('aria-expanded') === 'true', 'export aria-expanded updates to true');
// Clicking an item should close the menu.
$('#export-pdf').click();
assert(exportDropdown.hidden === true, 'export dropdown closes after clicking an item');
exportMenu.click();
assert(exportDropdown.hidden === false, 'export dropdown reopens');
// Outside click closes the menu.
document.body.click();
assert(exportDropdown.hidden === true, 'export dropdown closes on outside click');
exportMenu.click();
// Escape closes the menu.
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
assert(exportDropdown.hidden === true, 'export dropdown closes on Escape');

// ---- 3. outline renders items from the welcome doc --------------------------
console.log('\n[3] Outline');
// Force a real re-render through the (200ms-debounced) updated listener.
await editor.setMarkdown('# Only One Heading\n\nSome text');
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 1,
  'outline re-renders after setMarkdown');
assert($('#outline .outline-item').textContent === 'Only One Heading',
  'outline reflects the new doc after update');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline has 7 items from welcome doc');
const items = $$('#outline .outline-item');
assert(items[0].textContent === 'Welcome to Lumia', 'first outline item is the H1');
assert(items[0].className.includes('lvl-1') && items[1].className.includes('lvl-2'),
  'heading levels reflected in classes');
assert($$('#outline .outline-item.active').length === 1, 'one outline item is active');

// ---- 4. sidebar tabs switch --------------------------------------------------
console.log('\n[4] Sidebar tabs');
const sections = $$('.sidebar .sidebar-panel');
const tabFiles = $$('.sidebar-tab')[0];
const tabOutline = $$('.sidebar-tab')[1];
assert(sections[0].hidden === false && sections[1].hidden === true, 'Files panel visible initially');
tabOutline.click();
assert(sections[0].hidden === true && sections[1].hidden === false, 'Outline panel shown after click');
assert(tabOutline.className.includes('active') && !tabFiles.className.includes('active'),
  'Outline tab marked active');
tabFiles.click();
assert(sections[0].hidden === false && sections[1].hidden === true, 'Files panel restored');

// ---- 5. source-mode toggle round-trips markdown ------------------------------
console.log('\n[5] Source mode toggle');
$('#source-toggle').click();
await tick();
assert(document.body.classList.contains('source-mode'), 'source mode class applied');
const ta = $('#source');
assert(ta.value.includes('# Welcome to Lumia'), 'textarea populated with markdown');
const edited = '# Edited in source\n\n- item one\n- item two';
ta.value = edited;
ta.dispatchEvent(new Event('input', { bubbles: true }));
$('#source-toggle').click();
await tick();
assert(!document.body.classList.contains('source-mode'), 'WYSIWYG restored after second toggle');
const after = await editor.getMarkdown();
assert(after.includes('# Edited in source') && /^[-*] item one$/m.test(after) && after.includes('item two'),
  'markdown round-trips through the textarea');

// Title follows the doc through the (200ms-debounced) updated listener.
// Use a fresh heading so the wait is not vacuous.
await editor.setMarkdown('# Post Toggle Title\n\nBody text');
await waitFor(() => $('#doc-title')?.textContent === 'Post Toggle Title',
  'title follows doc through the listener');
await editor.setMarkdown(welcomeMd);
await waitFor(() => $('#doc-title')?.textContent === 'Welcome to Lumia',
  'title restored from doc');
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline restored after source round-trip');

// ---- 6. export HTML -----------------------------------------------------------
console.log('\n[6] HTML export');
$('#export-html').click();
await waitFor(() => downloads.length > 0, 'export download initiated');
const dl = downloads[downloads.length - 1];
assert(dl.download === 'Welcome to Lumia.html', `export filename (got "${dl.download}")`);
const blob = createdBlobs.get(dl.href);
assert(blob !== undefined, 'download Blob captured');
const exportHtml = await blob.text();
assert(exportHtml.includes('<!doctype html>'), 'standalone doctype');
assert(exportHtml.includes('<body class="theme-github">'), 'body carries theme class');
assert(exportHtml.includes('<main id="editor"><div class="ProseMirror">'),
  'editor structure reproduced for theme CSS');
assert(exportHtml.includes('body.theme-github'), 'theme CSS embedded');
assert(exportHtml.includes('<title>Welcome to Lumia</title>'), 'export title set');

// ---- 7. files fallback save (no FS Access API → download) --------------------
console.log('\n[7] Files fallback save');
const dlCount = downloads.length;
$('#save-file').click();
await waitFor(() => downloads.length === dlCount + 1, 'save fallback download initiated');
const saveDl = downloads[downloads.length - 1];
assert(saveDl.download === 'Welcome to Lumia.md', `save filename (got "${saveDl.download}")`);
const saveBlob = createdBlobs.get(saveDl.href);
const savedText = await saveBlob.text();
assert(savedText.includes('# Welcome to Lumia'), 'saved markdown matches the doc');

// ---- 8. focus mode / typewriter ----------------------------------------------
console.log('\n[8] View modes');
$('#focus-toggle').click();
assert(document.body.classList.contains('focus-mode'), 'focus mode class toggled on');
assert(localStorage.getItem('lumia:focus') === '1', 'focus state persisted');
// Move the caret into the first paragraph via a real ProseMirror transaction;
// the focusActivePlugin decoration should mark that block .focus-active.
// Note: use the bundle's own view + Selection classes (imported copies would
// be different module instances).
const view = window.__editor.getView();
let paraPos = 0;
view.state.doc.forEach((node, offset) => {
  if (!paraPos && node.type.name === 'paragraph') paraPos = offset + 1;
});
assert(paraPos > 0, 'found a paragraph position in the doc');
const Selection = view.state.selection.constructor;
view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(paraPos))));
await waitFor(() => pm().querySelector('.focus-active') !== null, 'active block marked .focus-active');
assert(
  pm().querySelector('.focus-active')?.textContent.includes('WYSIWYG'),
  'paragraph marked as focus-active via decoration',
);
$('#focus-toggle').click();
assert(!document.body.classList.contains('focus-mode'), 'focus mode toggled off');
await waitFor(() => pm().querySelector('.focus-active') === null, 'focus-active cleared');

$('#typewriter-toggle').click();
assert(document.body.classList.contains('typewriter-mode'), 'typewriter mode toggled on');
document.dispatchEvent(new Event('selectionchange'));
await tick(60); // let rAF fire
assert(document.body.classList.contains('typewriter-mode'), 'typewriter scroll ran without throwing');
$('#typewriter-toggle').click();
assert(!document.body.classList.contains('typewriter-mode'), 'typewriter mode toggled off');
localStorage.removeItem('lumia:focus');
localStorage.removeItem('lumia:typewriter');

// ---- 9. format shortcuts + guards ---------------------------------------------
console.log('\n[9] Format shortcuts & guards');
const dispatchKey = (target, init) => {
  const ev = new window.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(ev);
  return ev;
};

// ⌘⇧K → code block, prevented, no crash
const ev1 = dispatchKey(pm(), { key: 'K', code: 'KeyK', metaKey: true, shiftKey: true });
assert(ev1.defaultPrevented === true, '⌘⇧K preventDefault called');

// ⌘K → link prompt path, prevented, no crash
const ev2 = dispatchKey(pm(), { key: 'k', code: 'KeyK', metaKey: true });
assert(ev2.defaultPrevented === true, '⌘K preventDefault called');

// ⌘1 → heading command, prevented
const ev3 = dispatchKey(pm(), { key: '1', code: 'Digit1', metaKey: true });
assert(ev3.defaultPrevented === true, '⌘1 preventDefault called');

// Guard: source mode disables all format shortcuts
$('#source-toggle').click();
await tick();
assert(document.body.classList.contains('source-mode'), 'source mode active for guard test');
const ev4 = dispatchKey(pm(), { key: 'K', code: 'KeyK', metaKey: true, shiftKey: true });
assert(ev4.defaultPrevented === false, '⌘⇧K ignored in source mode');
$('#source-toggle').click();
await tick();
assert(!document.body.classList.contains('source-mode'), 'back to WYSIWYG');

// Guard: keydown in the source textarea / form fields is ignored
const ev5 = dispatchKey($('#source'), { key: 'K', code: 'KeyK', metaKey: true, shiftKey: true });
assert(ev5.defaultPrevented === false, '⌘⇧K ignored when typing in textarea');
const ev6 = dispatchKey($('#zoom-in'), { key: 'k', code: 'KeyK', metaKey: true });
assert(ev6.defaultPrevented === false, '⌘K ignored when button focused');

// main.ts ⌘/ source toggle
const ev7 = dispatchKey(document, { key: '/', code: 'Slash', metaKey: true });
assert(ev7.defaultPrevented === true, '⌘/ preventDefault called');
await tick();
assert(document.body.classList.contains('source-mode'), '⌘/ toggles source mode');
const ev8 = dispatchKey(document, { key: '/', code: 'Slash', metaKey: true });
await tick();
assert(!document.body.classList.contains('source-mode'), '⌘/ toggles back');

// ---- editor still alive after all the poking --------------------------------
const finalMd = await editor.getMarkdown();
assert(finalMd.includes('# Welcome to Lumia'), 'editor healthy at end (getMarkdown works)');

// ---- zoom quick check --------------------------------------------------------
const z0 = pm().style.zoom;
$('#zoom-in').click();
assert(pm().style.zoom === '1.1', `zoom applied (${z0} → ${pm().style.zoom})`);
$('#zoom-out').click();
assert(pm().style.zoom === '1', `zoom back to 100% (${pm().style.zoom})`);

// ---- 10. language switcher (i18n) ------------------------------------------
console.log('\n[10] Language switcher');
const langSelect = $('#lang-select');
assert(langSelect !== null, '#lang-select exists in the statusbar');
assert(langSelect !== null && langSelect.querySelectorAll('option').length === 3,
  'lang select offers en/zh/ja');
assert(langSelect.value === 'en', 'lang select starts at en (system fallback)');
assert($('#root-name').textContent === 'No folder', 'English chrome before switch');

langSelect.value = 'zh';
langSelect.dispatchEvent(new Event('change', { bubbles: true }));
assert($('#root-name').textContent === '无文件夹', 'static texts flip to Chinese');
assert($('#save-file').textContent === '保存', 'Save button flips to Chinese');
assert($('#save-file').title === '保存文件 (⌘S)', 'titles flip to Chinese');
assert(localStorage.getItem('lumia:lang') === 'zh', 'manual choice persists to localStorage');
assert(document.documentElement.lang === 'zh', '<html lang> follows the locale');
assert($$('.sidebar-tab')[0].textContent === '文件', 'Files tab label flips (built in JS)');
assert($$('.sidebar-tab')[1].textContent === '大纲', 'Outline tab label flips');
assert($('#file-tree .tree-empty-action').textContent === '打开文件夹以浏览',
  'empty-tree call-to-action flips');
assert($('#up-dir').title === '请先打开文件夹', 'up-dir tooltip flips via updateFilesHeader');

langSelect.value = 'ja';
langSelect.dispatchEvent(new Event('change', { bubbles: true }));
assert($('#root-name').textContent === 'フォルダなし', 'static texts flip to Japanese');

langSelect.value = 'en';
langSelect.dispatchEvent(new Event('change', { bubbles: true }));
assert($('#root-name').textContent === 'No folder', 'switching back to English restores texts');
localStorage.removeItem('lumia:lang');

// ---- summary ------------------------------------------------------------------
console.log('\njsdom "not implemented" notices (expected):');
for (const e of jsdomErrors) console.log('  -', e);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('SMOKE TEST PASSED');
