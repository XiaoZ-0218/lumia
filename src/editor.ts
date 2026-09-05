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
import { t, welcomeDoc, onLocaleChange } from './i18n';
import { isTauri, parentDir, readBinary } from './tauri-bridge';

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

// Last rendered values, cached so a locale switch can re-render the localized
// format ("N words" / "Untitled") without waiting for the next document edit.
let lastStatsText = '';
let lastTitle = '';

function renderStats(text: string) {
  lastStatsText = text;
  const el = document.getElementById('word-count');
  if (el) el.textContent = t('stats', { words: countWords(text), chars: text.length });
}

function renderTitle(title: string) {
  lastTitle = title;
  const el = document.getElementById('doc-title');
  const shown = title || t('untitled');
  if (el) el.textContent = shown;
  document.title = shown;
}

onLocaleChange(() => {
  renderStats(lastStatsText);
  // A heading-derived title is locale-independent; only the "Untitled"
  // fallback needs re-rendering. If a file name owns the titlebar, files.ts
  // re-asserts it in its own (later-registered) locale handler.
  if (!lastTitle) renderTitle('');
});

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

// ---- local image resolution ----

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** Session-lifetime cache: absolute image path → blob URL. */
const imageBlobCache = new Map<string, string>();

/** Absolute URLs and web-absolute paths load as-is; anything else is file-relative. */
function isFileRelativeSrc(src: string): boolean {
  return src !== '' && !/^(https?:|data:|blob:|asset:|file:|\/)/i.test(src);
}

/** Directory of the currently open markdown file (Tauri string handle only). */
function currentFileDir(): string | null {
  const handle = (window as unknown as { __currentFileHandle?: unknown }).__currentFileHandle;
  return typeof handle === 'string' ? parentDir(handle) : null;
}

/** Join dir + relative src and normalize `.`/`..` segments (keeping the leading slash). */
function resolveRelativePath(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '.' || (part === '' && out.length > 0)) continue;
    if (part === '..' && out.length > 1) out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * Node view for images. Milkdown's default renderer emits `<img src>` verbatim,
 * so relative paths resolve against the app origin (tauri://localhost) instead
 * of the markdown file's folder and every local image breaks. We resolve file-
 * relative srcs against the open file's directory and load bytes through the
 * Tauri fs bridge into a blob URL. Clipboard serialization uses the schema's
 * toDOM (not node views), so copy/paste still round-trips the original src.
 */
class ImageView implements NodeView {
  dom: HTMLImageElement;

  constructor(node: Node) {
    const img = document.createElement('img');
    this.dom = img;
    this.render(node);
  }

  private render(node: Node): void {
    const src = String(node.attrs.src ?? '');
    this.dom.dataset.originalSrc = src;
    this.dom.alt = String(node.attrs.alt ?? '');
    const title = String(node.attrs.title ?? '');
    if (title) this.dom.title = title;
    else this.dom.removeAttribute('title');
    this.dom.src = src;
    void this.resolveLocal(src);
  }

  private async resolveLocal(src: string): Promise<void> {
    if (!isTauri() || !isFileRelativeSrc(src)) return;
    const dir = currentFileDir();
    if (!dir) return;
    let abs = resolveRelativePath(dir, src);
    try {
      abs = decodeURIComponent(abs);
    } catch {
      /* malformed escape — try the raw path */
    }
    try {
      let url = imageBlobCache.get(abs);
      if (!url) {
        const bytes = await readBinary(abs);
        const ext = abs.split('.').pop()?.toLowerCase() ?? '';
        const blob = new Blob([bytes as BlobPart], { type: IMAGE_MIME[ext] ?? 'application/octet-stream' });
        url = URL.createObjectURL(blob);
        imageBlobCache.set(abs, url);
      }
      // Guard against the node having been re-rendered while the read was in flight.
      if (this.dom.dataset.originalSrc === src) this.dom.src = url;
    } catch {
      /* unreadable file keeps the raw src + alt text, like a broken web image */
    }
  }

  update(node: Node): boolean {
    if (node.type.name !== 'image') return false;
    if (String(node.attrs.src ?? '') !== this.dom.dataset.originalSrc) this.render(node);
    return true;
  }
}

function createImageNodeView(node: Node): NodeView {
  return new ImageView(node);
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
          image: createImageNodeView,
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
  // Count from the parsed doc, not the raw markdown: markdown syntax (**, [ ],
  // link URLs) inflates the numbers, so boot stats used to disagree with what
  // the listener reports after the first edit.
  editor.action((ctx) => {
    const doc = ctx.get(editorViewCtx).state.doc;
    renderStats(doc.textBetween(0, doc.content.size, '\n'));
    renderTitle(titleFromDoc(doc));
  });
}

export const ready = boot();
