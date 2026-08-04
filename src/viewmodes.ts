// View modes: focus mode + typewriter mode (Typora-style). Both are no-ops in
// source mode. State persists in localStorage and restores on load.
import './viewmodes.css';
import { ready } from './editor';

const FOCUS_KEY = 'lumia:focus';
const TYPEWRITER_KEY = 'lumia:typewriter';
/** Keep the caret at this fraction of the editor's visible height. */
const CARET_POS = 0.4;

const focusToggle = document.getElementById('focus-toggle') as HTMLButtonElement;
const typewriterToggle = document.getElementById('typewriter-toggle') as HTMLButtonElement;

function inSourceMode(): boolean {
  return document.body.classList.contains('source-mode');
}

/** The top-level block in .ProseMirror that contains the selection anchor. */
function activeBlock(): HTMLElement | null {
  const pm = document.querySelector<HTMLElement>('#editor .ProseMirror');
  if (!pm) return null;
  let node: Node | null = document.getSelection()?.anchorNode ?? null;
  if (node && !(node instanceof Element)) node = node.parentElement;
  for (let el = node as Element | null; el && el !== pm; el = el.parentElement) {
    if (el.parentElement === pm) return el as HTMLElement;
  }
  return null;
}

/** Caret rect for a collapsed selection, or null if there is none. */
function caretRect(): DOMRect | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.top === 0 && rect.left === 0 && rect.height === 0 && rect.width === 0) return null;
  return rect;
}

// ---- focus mode ----
// The active block is marked by the focusActivePlugin decoration in editor.ts
// (ProseMirror-managed); here we only toggle the body class and force a
// redraw so decorations recompute.

function redrawEditor(): void {
  void ready
    .then(() => {
      const view = window.__editor.getView();
      view.dispatch(view.state.tr.setMeta('focus-mode', true));
    })
    .catch(() => {});
}

function setFocus(on: boolean): void {
  document.body.classList.toggle('focus-mode', on);
  focusToggle.classList.toggle('active', on);
  localStorage.setItem(FOCUS_KEY, on ? '1' : '0');
  redrawEditor();
}

// ---- typewriter mode ----

let scrollFrame = 0;

/** Scroll the caret's line to CARET_POS, throttled to at most once per frame. */
function scrollToCaret(): void {
  if (inSourceMode() || !document.body.classList.contains('typewriter-mode')) return;
  const editor = document.getElementById('editor');
  if (!editor) return;
  const rect = caretRect() ?? activeBlock()?.getBoundingClientRect() ?? null;
  if (!rect) return;
  const targetY = editor.getBoundingClientRect().top + editor.clientHeight * CARET_POS;
  const max = editor.scrollHeight - editor.clientHeight;
  editor.scrollTop = Math.min(Math.max(editor.scrollTop + rect.top - targetY, 0), Math.max(max, 0));
}

function scheduleScroll(): void {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    scrollToCaret();
  });
}

function setTypewriter(on: boolean): void {
  document.body.classList.toggle('typewriter-mode', on);
  typewriterToggle.classList.toggle('active', on);
  localStorage.setItem(TYPEWRITER_KEY, on ? '1' : '0');
  if (on) scheduleScroll();
}

// ---- shared tracking (selectionchange / keyup / click) ----

function track(): void {
  if (inSourceMode()) return;
  if (document.body.classList.contains('typewriter-mode')) scheduleScroll();
}

// Clicks reach us before ProseMirror has settled the DOM selection, so defer
// tracking to the next frame to read the caret's final position.
let trackFrame = 0;

function scheduleTrack(): void {
  if (trackFrame) return;
  trackFrame = requestAnimationFrame(() => {
    trackFrame = 0;
    track();
  });
}

export function initViewModes(): void {
  focusToggle.addEventListener('click', () =>
    setFocus(!document.body.classList.contains('focus-mode')),
  );
  typewriterToggle.addEventListener('click', () =>
    setTypewriter(!document.body.classList.contains('typewriter-mode')),
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F8') {
      e.preventDefault();
      setFocus(!document.body.classList.contains('focus-mode'));
    }
  });
  document.addEventListener('selectionchange', scheduleTrack);
  document.addEventListener('keyup', scheduleTrack);
  document.addEventListener('mouseup', scheduleTrack);
  document.addEventListener('click', scheduleTrack);

  const focusOn = localStorage.getItem(FOCUS_KEY) === '1';
  const typewriterOn = localStorage.getItem(TYPEWRITER_KEY) === '1';
  if (focusOn) setFocus(true);
  if (typewriterOn) setTypewriter(true);
  // Mark the active block / first scroll only after the editor has mounted.
  if (focusOn || typewriterOn) void ready.then(track).catch(() => {});
}
