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

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
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
const bootStats = $('#word-count').textContent;

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
// The listener re-rendered stats by now (same update cycle as the outline) —
// the numbers must not drift from boot just because syntax chars stop counting.
assert($('#word-count').textContent === bootStats,
  `stats consistent between boot and first edit (boot "${bootStats}", now "${$('#word-count').textContent}")`);

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

// ---- 1d. image rendering (node view + round-trip) ---------------------------
console.log('\n[1d] Image rendering');
await editor.setMarkdown('![pic alt](assets/v2/pic.jpg "a title")\n\n![remote](https://example.com/x.png)');
await tick(50);
// ProseMirror inserts <img class="ProseMirror-separator"> between inline
// leaves for caret placement — exclude those from the count.
const mdImgs = $$('#editor .milkdown .ProseMirror img:not(.ProseMirror-separator)');
assert(mdImgs.length === 2, `markdown images render as real <img> elements (got ${mdImgs.length})`);
// Outside Tauri the node view keeps the src verbatim; the desktop shell swaps
// in a blob URL resolved against the open file's folder.
assert(mdImgs[0].getAttribute('src') === 'assets/v2/pic.jpg', 'relative src kept verbatim in the browser build');
assert(mdImgs[0].alt === 'pic alt', 'alt text preserved');
assert(mdImgs[0].title === 'a title', 'title preserved');
assert(mdImgs[1].getAttribute('src') === 'https://example.com/x.png', 'remote src untouched');
const imgMd = await editor.getMarkdown();
assert(imgMd.includes('![pic alt](assets/v2/pic.jpg'), 'image markdown round-trips through the node view');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline restored after image tests');

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

// A `# line` inside a fenced code block is code, not a heading.
await editor.setMarkdown('# Real Heading\n\n```\n# not a heading (code fence)\n```\n\ntext');
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 1
  && $('#outline .outline-item').textContent === 'Real Heading',
  'code-fence # lines stay out of the outline');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'outline restored after code-fence test');

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

// Checkbox state is a DOM property, not an attribute — the export must bake it in.
const exportedBoxes = [...exportHtml.matchAll(/<input[^>]*>/g)].map((m) => m[0]);
assert(exportedBoxes.length === 3, `export contains the 3 task checkboxes (got ${exportedBoxes.length})`);
assert(exportedBoxes.filter((tag) => tag.includes('checked')).length === 2,
  'checked tasks keep their checked attribute in the export');

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

// ---- 9b. bubble menu (selection toolbar) -------------------------------------
console.log('\n[9b] Bubble menu');
await editor.setMarkdown('make this word bold please');
await tick(30);
const bubble = () => $('#bubble-menu');
assert(bubble() !== null, '#bubble-menu exists');
assert(bubble().hidden === true, 'bubble hidden without a selection');
assert($$('#bubble-menu .bubble-btn').length === 5, 'bubble offers 5 actions');

const view9b = editor.getView();
// The bundle ships its own ProseMirror copy — grab TextSelection from the
// live state instead of importing a second copy here.
const TS = view9b.state.selection.constructor;
let bFrom = -1;
view9b.state.doc.descendants((node, pos) => {
  if (bFrom === -1 && node.isText && node.text.includes('word')) {
    bFrom = pos + node.text.indexOf('word');
    return false;
  }
  return true;
});
assert(bFrom > -1, 'located the word "word" in the doc');
view9b.dispatch(view9b.state.tr.setSelection(TS.create(view9b.state.doc, bFrom, bFrom + 4)));
// The menu waits for the selection to settle (debounced) before popping in.
await waitFor(() => bubble().hidden === false, 'bubble appears once the selection settles');
assert(bubble().classList.contains('show'), 'bubble pops in with the show animation class');
const boldBtn = () => $('#bubble-menu [data-mark="strong"]');
assert(boldBtn() !== null, 'bold button present');
assert(boldBtn().textContent === '**', 'bold button shows the markdown syntax (light learning)');
assert(boldBtn().title === 'Bold: **text** (⌘B)', 'tooltip teaches name + syntax + shortcut');
assert(boldBtn().classList.contains('active') === false, 'bold not active on plain text');
boldBtn().dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await tick(30);
const boldMd = await editor.getMarkdown();
assert(boldMd.includes('**word**'), `bold applied via bubble (${boldMd.trim()})`);
assert(boldBtn().classList.contains('active') === true, 'bold button shows the active state');

const strikeBtn = $('#bubble-menu [data-mark="strike_through"]');
strikeBtn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await tick(30);
assert((await editor.getMarkdown()).includes('~~word~~'), 'strikethrough applied via bubble');

// Collapse the selection -> the bubble hides again.
view9b.dispatch(view9b.state.tr.setSelection(TS.near(view9b.state.doc.resolve(0))));
await tick(30);
assert(bubble().hidden === true, 'bubble hides when the selection collapses');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'welcome doc restored after bubble menu');

// ---- editor still alive after all the poking --------------------------------
const finalMd = await editor.getMarkdown();
assert(finalMd.includes('# Welcome to Lumia'), 'editor healthy at end (getMarkdown works)');

// ---- zoom quick check --------------------------------------------------------
const z0 = pm().style.zoom;
$('#zoom-in').click();
assert(pm().style.zoom === '1.1', `zoom applied (${z0} → ${pm().style.zoom})`);
// Zoom reflows via CSS `zoom`, which fires neither resize nor scroll — the app
// nudges a resize event so caret-anchored UI (bubble menu) re-positions.
let resizeNudges = 0;
window.addEventListener('resize', () => resizeNudges++);
$('#zoom-out').click();
assert(pm().style.zoom === '1', `zoom back to 100% (${pm().style.zoom})`);
assert(resizeNudges > 0, 'zoom dispatches a resize nudge for caret-anchored UI');

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
// No edit needed: the stats line re-renders in the new locale on its own.
assert(/^\d+ 词 · \d+ 字符$/.test($('#word-count').textContent),
  `stats re-render on locale switch (got "${$('#word-count').textContent}")`);

// Stats format and the untitled fallback follow the locale.
await editor.setMarkdown('# 本地化检查\n\n你好世界');
await waitFor(() => $('#doc-title').textContent === '本地化检查', 'title still follows the doc');
assert($('#word-count').textContent.includes('词'), 'stats render in Chinese format');
await editor.setMarkdown('no heading here');
await waitFor(() => $('#doc-title').textContent === '无标题', 'untitled fallback localizes');

// Exported standalone HTML carries the active locale.
const zhExportCount = downloads.length;
$('#export-html').click();
await waitFor(() => downloads.length === zhExportCount + 1, 'zh export download initiated');
{
  const blob = createdBlobs.get(downloads[downloads.length - 1].href);
  const html = await blob.text();
  assert(html.includes('<html lang="zh">'), 'exported HTML lang follows the locale');
}

langSelect.value = 'ja';
langSelect.dispatchEvent(new Event('change', { bubbles: true }));
assert($('#root-name').textContent === 'フォルダなし', 'static texts flip to Japanese');

langSelect.value = 'en';
langSelect.dispatchEvent(new Event('change', { bubbles: true }));
assert($('#root-name').textContent === 'No folder', 'switching back to English restores texts');
localStorage.removeItem('lumia:lang');
await editor.setMarkdown(welcomeMd);
await waitFor(() => document.querySelectorAll('#outline .outline-item').length === 7,
  'welcome doc restored after i18n section');

// ---- 10b. second boot with a persisted zh locale ----------------------------
console.log('\n[10b] Second boot (persisted zh)');
const html2 = readFileSync(join(root, 'index.html'), 'utf8');
const dom2 = new JSDOM(html2, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole: vc,
});
const w2 = dom2.window;
w2.localStorage.setItem('lumia:lang', 'zh'); // saved choice wins over detection
// Stale session keys from a desktop run must be ignored by the browser build
// (folder/file restore is Tauri-only; browsers can't re-open handles).
w2.localStorage.setItem('lumia:lastFolder', '/nonexistent');
w2.localStorage.setItem('lumia:lastFile', '/nonexistent/note.md');
for (const key of globalsToCopy) {
  Object.defineProperty(globalThis, key, {
    value: w2[key],
    configurable: true,
    writable: true,
  });
}
if (typeof w2.document.getSelection !== 'function') {
  w2.document.getSelection = () => w2.getSelection();
}
w2.HTMLElement.prototype.scrollIntoView = function () {};
for (const [proto, method] of [
  [w2.Range.prototype, 'getBoundingClientRect'],
  [w2.Range.prototype, 'getClientRects'],
]) {
  if (typeof proto[method] !== 'function') {
    proto[method] =
      method === 'getClientRects'
        ? () => []
        : () => ({ top: 0, left: 0, height: 0, width: 0, right: 0, bottom: 0, x: 0, y: 0 });
  }
}
const downloads2 = [];
w2.HTMLAnchorElement.prototype.click = function () {
  downloads2.push({ href: this.href, download: this.download });
};
// The bundle is a single chunk: re-import with a cache-busting query so the
// module graph re-executes against the fresh window.
await import(pathToFileURL(chunkPath).href + '?boot-zh');
await waitFor(
  () => w2.document.querySelector('#editor .milkdown .ProseMirror')?.textContent.includes('欢迎使用 Lumia'),
  'zh welcome doc boots on second run',
);
assert(w2.document.querySelector('#root-name').textContent === '无文件夹', 'zh chrome on second boot');
assert(w2.document.querySelector('.sidebar-tab').textContent === '文件', 'zh Files tab on second boot');
assert(w2.localStorage.getItem('lumia:lang') === 'zh', 'saved locale untouched by boot');
assert(w2.document.querySelector('#file-tree .tree-empty-action'), 'browser boot ignores stale session keys');
assert(w2.localStorage.getItem('lumia:lastFolder') === '/nonexistent', 'stale session keys left untouched by browser boot');

// ---- 10c. third boot with Tauri IPC mocked: relative image resolution -------
console.log('\n[10c] Tauri relative image resolution');
// Temp fixture: a doc referencing an image relative to its own folder, inside a
// non-ASCII directory (the real-world case this feature was built for).
const fixtureRoot = mkdtempSync(join(tmpdir(), 'lumia-图片-'));
mkdirSync(join(fixtureRoot, 'assets'), { recursive: true });
const pngBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
writeFileSync(join(fixtureRoot, 'assets', 'pic.jpg'), pngBytes);
writeFileSync(join(fixtureRoot, 'doc.md'), '# Fixture\n\n![shot](assets/pic.jpg)\n');

const dom3 = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole: vc,
});
const w3 = dom3.window;
// Stub the Tauri IPC bridge BEFORE the bundle boots: isTauri() keys off this
// global, and readText/readBinary route through __TAURI_INTERNALS__.invoke.
const ipcCalls = [];
w3.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    ipcCalls.push(cmd);
    if (cmd === 'plugin:fs|read_file') return Array.from(readFileSync(args.path));
    if (cmd === 'plugin:fs|read_text_file') {
      return Array.from(new TextEncoder().encode(readFileSync(args.path, 'utf8')));
    }
    return null;
  },
  transformCallback: () => 0,
};
for (const key of globalsToCopy) {
  Object.defineProperty(globalThis, key, {
    value: w3[key],
    configurable: true,
    writable: true,
  });
}
if (typeof w3.document.getSelection !== 'function') {
  w3.document.getSelection = () => w3.getSelection();
}
w3.HTMLElement.prototype.scrollIntoView = function () {};
for (const [proto, method] of [
  [w3.Range.prototype, 'getBoundingClientRect'],
  [w3.Range.prototype, 'getClientRects'],
]) {
  if (typeof proto[method] !== 'function') {
    proto[method] =
      method === 'getClientRects'
        ? () => []
        : () => ({ top: 0, left: 0, height: 0, width: 0, right: 0, bottom: 0, x: 0, y: 0 });
  }
}
await import(pathToFileURL(chunkPath).href + '?boot-tauri');
await waitFor(() => typeof w3.__editor?.setMarkdown === 'function', 'tauri-mode boot');

// A string handle marks the Tauri path; images must resolve relative to it.
w3.__currentFileHandle = join(fixtureRoot, 'doc.md');
await w3.__editor.setMarkdown('![shot](assets/pic.jpg)');
const tauriImg = () => w3.document.querySelector('#editor .milkdown .ProseMirror img:not(.ProseMirror-separator)');
await waitFor(() => tauriImg()?.src.startsWith('blob:mock-'), 'relative image swapped to a blob URL');
const imgBlob = createdBlobs.get(tauriImg().src);
assert(imgBlob !== undefined && imgBlob.size === pngBytes.length,
  'blob URL holds the bytes of the image next to the doc');
assert(ipcCalls.includes('plugin:fs|read_file'), 'image bytes read through the Tauri fs bridge');

// Remote URLs must bypass the bridge entirely.
await w3.__editor.setMarkdown('![r](https://example.com/r.png)');
await tick(50);
assert(tauriImg()?.getAttribute('src') === 'https://example.com/r.png', 'remote image untouched in Tauri mode');

// ---- summary ------------------------------------------------------------------
console.log('\njsdom "not implemented" notices (expected):');
for (const e of jsdomErrors) console.log('  -', e);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('SMOKE TEST PASSED');
