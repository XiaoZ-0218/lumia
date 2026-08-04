import { Editor, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/core';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';

const WELCOME = `# Welcome to Typora Clone

This is a **WYSIWYG** markdown editor that looks and feels like [Typora](https://typora.io/). Type markdown and watch it render as you go — no preview panel, no floating toolbar.

## Write inline styles

**Bold**, *italic*, ~~strikethrough~~, \`inline code\`, and [links](https://typora.io/).

## Lists

- Unordered lists
- Nested lists
  1. Ordered sub-list
  2. Second item

## Task lists

- [x] WYSIWYG editing
- [x] Source mode toggle
- [ ] Theme switcher

## Blockquote

> Markdown is not just for documentation — it's for thinking.

## Code

\`\`\`ts
const greeting = "Hello, world!";
console.log(greeting);
\`\`\`

## Table

| Feature    | Status |
| ---------- | ------ |
| WYSIWYG    | ✅     |
| Source     | ✅     |
| Themes     | 🔜     |

---

*Happy writing!*
`;

export interface EditorAPI {
  getMarkdown(): Promise<string>;
  setMarkdown(md: string): Promise<void>;
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
  if (el) el.textContent = `${countWords(text)} words · ${text.length} chars`;
}

function renderTitle(title: string) {
  const el = document.getElementById('doc-title');
  if (el) el.textContent = title || 'Untitled';
  document.title = title || 'Untitled';
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

async function boot(): Promise<void> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.getElementById('editor') as HTMLElement);
      ctx.get(listenerCtx).updated((_ctx, doc) => {
        renderStats(doc.textBetween(0, doc.content.size, '\n'));
        renderTitle(titleFromDoc(doc));
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
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

  window.__editor = { getMarkdown, setMarkdown };

  await setMarkdown(WELCOME);
  refreshStats(WELCOME);
}

export const ready = boot();
