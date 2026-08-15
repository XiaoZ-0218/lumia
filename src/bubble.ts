// Bubble menu: a small floating toolbar that appears above the current text
// selection, offering the common inline marks (bold / italic / strike / code /
// link). Driven by a ProseMirror plugin registered on the live view, so it
// tracks selection changes from mouse, keyboard, and commands alike.
import './bubble.css';
import type { CmdKey } from '@milkdown/core';
import type { MarkType } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState, Selection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import {
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { ready } from './editor';
import { insertLink, runCommand } from './format';
import { onLocaleChange, t } from './i18n';
import type { Key } from './locales/en';

type Item = {
  /** i18n key for the tooltip / aria-label. */
  key: Key;
  /** Visible label markup (tiny, trusted constants — not user content). */
  html: string;
  /** Schema mark-name candidates used for the active highlight. */
  marks: string[];
  /** Command to run on click; absent means a custom action. */
  command?: CmdKey<any>;
  /** Custom click behavior (link prompt). */
  action?: () => void;
};

const LINK_ICON =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 1 0-4.2-4.2l-1 1"/>' +
  '<path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 1 0 4.2 4.2l1-1"/>' +
  '</svg>';

// Buttons show the markdown syntax itself (Effie-style "light learning"):
// the toolbar doubles as a cheat sheet, and the tooltip spells the syntax out.
const ITEMS: Item[] = [
  { key: 'bubbleBold', html: '<b>**</b>', marks: ['strong'], command: toggleStrongCommand.key },
  { key: 'bubbleItalic', html: '<i>*</i>', marks: ['emphasis', 'em'], command: toggleEmphasisCommand.key },
  { key: 'bubbleStrike', html: '<s>~~</s>', marks: ['strike_through'], command: toggleStrikethroughCommand.key },
  { key: 'bubbleCode', html: '<code>`</code>', marks: ['inlineCode', 'code_inline'], command: toggleInlineCodeCommand.key },
  { key: 'bubbleLink', html: LINK_ICON, marks: ['link'], action: insertLink },
];

function markType(state: EditorState, candidates: string[]): MarkType | null {
  for (const name of candidates) {
    const type = state.schema.marks[name];
    if (type) return type;
  }
  return null;
}

/** Standard "is this mark active at the selection" check. */
function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return type.isInSet(state.storedMarks ?? $from.marks()) != null;
  return state.doc.rangeHasMark(from, to, type);
}

/** Selections we can format: a non-empty range inside the WYSIWYG editor. */
function formattable(sel: Selection): boolean {
  return !sel.empty;
}

export function initBubble(): void {
  const menu = document.createElement('div');
  menu.id = 'bubble-menu';
  menu.setAttribute('role', 'toolbar');
  menu.hidden = true;

  const buttons = ITEMS.map((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bubble-btn';
    btn.dataset.mark = item.marks[0];
    btn.innerHTML = item.html;
    // Keep the editor selection/focus: run on mousedown, swallow the default.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (item.action) item.action();
      else if (item.command) runCommand(item.command);
    });
    menu.appendChild(btn);
    return btn;
  });

  function refreshLabels(): void {
    buttons.forEach((btn, i) => {
      btn.title = t(ITEMS[i].key);
      btn.setAttribute('aria-label', t(ITEMS[i].key));
    });
  }
  refreshLabels();
  onLocaleChange(refreshLabels);

  document.body.appendChild(menu);

  let currentView: EditorView | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let selecting = false;

  function cancelShow(): void {
    clearTimeout(showTimer);
    showTimer = undefined;
  }

  function hide(): void {
    cancelShow();
    menu.classList.remove('show');
    menu.hidden = true;
  }

  function show(view: EditorView): void {
    cancelShow();
    menu.hidden = false;
    // Force a reflow so the opacity/transform transition actually plays.
    void menu.offsetWidth;
    menu.classList.add('show');
    place(view);
    buttons.forEach((btn, i) => {
      const type = markType(view.state, ITEMS[i].marks);
      btn.classList.toggle('active', type != null && markActive(view.state, type));
    });
  }

  function refresh(view: EditorView): void {
    const { selection } = view.state;
    if (document.body.classList.contains('source-mode') || !formattable(selection)) {
      hide();
      return;
    }
    // Mouse still down means the user is mid-selection — wait for mouseup.
    if (selecting) return;
    // Already visible: follow the selection immediately.
    if (!menu.hidden) {
      show(view);
      return;
    }
    // Keyboard selection (shift+arrows) fires many updates — pop once it settles.
    cancelShow();
    showTimer = setTimeout(() => show(view), 180);
  }

  void ready.then(() => {
    const view = window.__editor.getView();
    currentView = view;
    const plugin = new Plugin({
      key: new PluginKey('bubble-menu'),
      view() {
        return {
          update(v: EditorView) {
            refresh(v);
          },
          destroy() {
            hide();
          },
        };
      },
    });
    // The view already exists (boot completed), so attach by reconfiguring.
    view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));

    view.dom.addEventListener('mousedown', () => {
      selecting = true;
      hide();
    });
    document.addEventListener('mouseup', () => {
      if (!selecting) return;
      selecting = false;
      refresh(view);
    });
  });

  function place(view: EditorView): void {
    const { from, to } = view.state.selection;
    try {
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to, -1);
      const top = Math.min(start.top, end.top);
      const center = (start.left + end.right) / 2;
      const half = menu.offsetWidth / 2;
      const left = Math.max(8 + half, Math.min(window.innerWidth - 8 - half, center));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    } catch {
      // jsdom and friends have no layout — keep the last position.
    }
  }

  // Reposition while the page scrolls/resizes; hide when the selection is
  // abandoned for a click outside the editor and the menu.
  window.addEventListener('resize', () => {
    if (!menu.hidden && currentView) refresh(currentView);
  });
  document.addEventListener(
    'scroll',
    () => {
      if (!menu.hidden && currentView) refresh(currentView);
    },
    true,
  );
  document.addEventListener('mousedown', (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;
    if (menu.hidden || menu.contains(target)) return;
    if (target.closest('#editor .ProseMirror')) return;
    hide();
  });

  // Source mode is a body class flipped by main.ts — watch it to hide.
  new MutationObserver(() => {
    if (document.body.classList.contains('source-mode')) hide();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
