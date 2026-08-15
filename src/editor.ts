import { Editor, editorViewCtx, editorViewOptionsCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView, NodeView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { t, welcomeDoc } from './i18n';

// Marks the top-level block containing the caret with .focus-active, so focus
// mode can dim everything else. A decoration (not manual DOM classes), because
// ProseMirror redraws editable DOM from state and would wipe external classes.
const focusActivePlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('focus-active'),
      props: {
        decorations(state) {
          if (!document.body.classList.contains('focus-mode')) return null;
          const { $from } = state.selection;
          if ($from.depth < 1) return null;
          const deco = Decoration.node($from.before(1), $from.after(1), {
            class: 'focus-active',
          });
          return DecorationSet.create(state.doc, [deco]);
        },
      },
    }),
);

export interface EditorAPI {
  getMarkdown(): Promise<string>;
  setMarkdown(md: string): Promise<void>;
  /** Run an arbitrary action against the Milkdown ctx (e.g. callCommand). */
  call<T>(fn: (ctx: Ctx) => T): T;
  /** The ProseMirror view (for tests / advanced integrations). */
  getView(): EditorView;
}

type UpdateHandler = (markdown: string) => void;
const updateHandlers: UpdateHandler[] = [];

/** Subscribe to document changes (debounced by the listener plugin). */
export function onUpdate(fn: UpdateHandler): void {
  updateHandlers.push(fn);
}

async function notifyUpdate(): Promise<void> {
  const md = await window.__editor.getMarkdown();
  for (const fn of updateHandlers) fn(md);
}

declare global {
  interface Window {
    __editor: EditorAPI;
  }
}

type NodeLike = {
  forEach(fn: (node: { type: { name: string }; textContent: string }) => void): void;
  textBetween(from: number, to: number, blockSeparator?: string): string;
};

function countWords(text: string): number {
  const latin = text.match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g)?.length ?? 0;
  return latin + cjk;
}

function renderStats(text: string) {
  const el = document.getElementById('word-count');
  if (el) el.textContent = t('stats', { words: countWords(text), chars: text.length });
}

function renderTitle(title: string) {
  const el = document.getElementById('doc-title');
  const shown = title || t('untitled');
  if (el) el.textContent = shown;
  document.title = shown;
}

function titleFromDoc(doc: NodeLike): string {
  let title = '';
  doc.forEach((node) => {
    if (!title && node.type.name === 'heading') title = node.textContent;
  });
  return title;
}

/** Live stats from raw markdown — used while the source view is active. */
export function refreshStats(md: string) {
  renderStats(md);
  renderTitle(md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '');
}

/**
 * Node view for GFM task list items (`- [x] foo`). Milkdown's preset-gfm
 * renders task items as a plain `<li data-item-type="task" data-checked>` with
 * no checkbox, so we prepend a real togglable checkbox (Typora parity) while
 * keeping the `data-item-type` / `data-checked` attributes the themes style.
 */
class TaskItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private checkbox: HTMLInputElement;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    const li = document.createElement('li');
    // Mirror Milkdown's list_item toDOM for task items.
    li.dataset.itemType = 'task';
    li.dataset.label = String(node.attrs.label ?? '');
    li.dataset.listType = String(node.attrs.listType ?? 'bullet');
    li.dataset.spread = String(node.attrs.spread);
    li.dataset.checked = String(node.attrs.checked);
    this.dom = li;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.contentEditable = 'false';
    checkbox.checked = node.attrs.checked === true;
    checkbox.addEventListener('change', () => {
      const pos = getPos();
      if (pos == null) return;
      const item = view.state.doc.nodeAt(pos);
      if (!item || item.type.name !== 'list_item') return;
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: checkbox.checked }),
      );
    });
    this.checkbox = checkbox;
    li.appendChild(checkbox);

    const content = document.createElement('div');
    this.contentDOM = content;
    li.appendChild(content);
  }

  update(node: Node): boolean {
    // A node of another type — or a task item that became a plain item —
    // lets ProseMirror fall back to the default toDOM rendering.
    if (node.type.name !== 'list_item' || node.attrs.checked == null) return false;
    this.checkbox.checked = node.attrs.checked === true;
    this.dom.dataset.checked = String(node.attrs.checked);
    return true;
  }

  /** Leave checkbox interactions (toggle + click) to the checkbox itself. */
  stopEvent(event: Event): boolean {
    return event.target === this.checkbox;
  }
}

function createTaskItemNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  // Plain list items (checked == null) keep Milkdown's default rendering.
  if (node.attrs.checked == null) return null as unknown as NodeView;
  return new TaskItemView(node, view, getPos);
}

const DANGEROUS_HTML_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base'];
const DANGEROUS_URL_RE = /^\s*(javascript|vbscript):/i;

/**
 * Parse raw HTML and strip dangerous tags/attributes.
 *
 * - Removes script, iframe, object, embed, link, meta and base elements.
 * - Strips every attribute starting with "on" (event handlers).
 * - Strips href/src values that start with javascript: or vbscript:.
 */
function sanitizeHtml(raw: string): string {
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const body = doc.body;

  body.querySelectorAll(DANGEROUS_HTML_TAGS.join(',')).forEach((el) => el.remove());

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src') && DANGEROUS_URL_RE.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  }

  return body.innerHTML;
}

/**
 * Node view for Milkdown's inline `html` atom.
 *
 * The default toDOM renders the raw HTML string as textContent inside a span,
 * so the HTML is visible literally. We render the sanitized HTML as real DOM
 * elements while keeping the wrapper's data-type/data-value attributes so
 * copy/paste round-trips through the preset's parseDOM rule.
 */
class HtmlView implements NodeView {
  dom: HTMLElement;

  constructor(node: Node) {
    const span = document.createElement('span');
    span.className = 'html-raw';
    span.dataset.type = 'html';
    span.contentEditable = 'false';
    this.render(node, span);
    this.dom = span;
  }

  private render(node: Node, dom: HTMLElement): void {
    const value = String(node.attrs.value ?? '');
    dom.dataset.value = value;
    dom.innerHTML = sanitizeHtml(value);
  }

  update(node: Node): boolean {
    if (node.type.name !== 'html') return false;
    const value = String(node.attrs.value ?? '');
    if (this.dom.dataset.value === value) return true;
    this.render(node, this.dom);
    return true;
  }
}

function createHtmlNodeView(
  node: Node,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  return new HtmlView(node);
}

async function boot(): Promise<void> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.getElementById('editor') as HTMLElement);
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        nodeViews: {
          ...options.nodeViews,
          list_item: createTaskItemNodeView,
          html: createHtmlNodeView,
        },
      }));
      ctx.get(listenerCtx).updated((_ctx, doc) => {
        renderStats(doc.textBetween(0, doc.content.size, '\n'));
        renderTitle(titleFromDoc(doc));
        void notifyUpdate();
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(focusActivePlugin)
    .create();

  const getMarkdown = async (): Promise<string> =>
    editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));

  const setMarkdown = async (md: string): Promise<void> => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const doc = ctx.get(parserCtx)(md);
      if (!doc) return;
      const tr = view.state.tr;
      const size = tr.doc.content.size;
      if (size === 0) tr.insert(0, doc.content);
      else tr.replaceWith(0, size, doc.content);
      view.dispatch(tr);
    });
  };

  window.__editor = {
    getMarkdown,
    setMarkdown,
    call: (fn) => editor.action(fn),
    getView: () => editor.action((ctx) => ctx.get(editorViewCtx)),
  };

  const md = welcomeDoc();
  await setMarkdown(md);
  refreshStats(md);
}

export const ready = boot();
