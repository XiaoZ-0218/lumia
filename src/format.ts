// Format: Typora-style keyboard shortcuts wired to Milkdown commands.
import { editorViewCtx } from '@milkdown/core';
import type { CmdKey } from '@milkdown/core';
import {
  createCodeBlockCommand,
  toggleLinkCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark';
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { callCommand } from '@milkdown/utils';

/** Run a Milkdown command by its key, with an optional payload. */
function run(key: CmdKey<any>, payload?: any): void {
  window.__editor?.call(callCommand(key, payload));
}

/** Shortcuts only apply to the WYSIWYG editor, not source mode or form fields. */
function isEditorTarget(e: KeyboardEvent): boolean {
  if (document.body.classList.contains('source-mode')) return false;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target) return false;
  if (target.closest('#source')) return false;
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName)) return false;
  return target.closest('#editor') !== null;
}

/** ⌘1–⌘6: set the heading level; pressing the same level again goes back to paragraph. */
function toggleHeading(level: number): void {
  window.__editor?.call((ctx) => {
    const view = ctx.get(editorViewCtx);
    const node = view.state.selection.$from.node();
    const sameLevel = node.type.name === 'heading' && node.attrs.level === level;
    return sameLevel
      ? callCommand(turnIntoTextCommand.key)(ctx)
      : callCommand(wrapInHeadingCommand.key, level)(ctx);
  });
}

/** ⌘⌥X: toggle the current list item between plain and task. */
function toggleTaskList(): void {
  window.__editor?.call((ctx) => {
    const view = ctx.get(editorViewCtx);
    let $from = view.state.selection.$from;
    let depth = $from.depth;
    let item = $from.node(depth);
    while (depth > 0 && item.type.name !== 'list_item') {
      depth--;
      item = $from.node(depth);
    }
    if (item.type.name !== 'list_item') {
      // Not in a list yet — wrap into a bullet list first, then re-locate the item.
      callCommand(wrapInBulletListCommand.key)(ctx);
      $from = view.state.selection.$from;
      depth = $from.depth;
      item = $from.node(depth);
      while (depth > 0 && item.type.name !== 'list_item') {
        depth--;
        item = $from.node(depth);
      }
      if (item.type.name !== 'list_item') return;
    }
    const checked = item.attrs.checked == null ? false : null;
    view.dispatch(view.state.tr.setNodeMarkup($from.before(depth), undefined, { ...item.attrs, checked }));
  });
}

/** ⌘K: prompt for a URL and wrap the selection in a link. */
function insertLink(): void {
  const href = window.prompt('Link URL:', 'https://');
  if (href) run(toggleLinkCommand.key, { href });
}

export function initFormat(): void {
  document.addEventListener('keydown', (e) => {
    if (!isEditorTarget(e)) return;
    const { metaKey, ctrlKey, altKey, shiftKey, code } = e;
    if (!metaKey || ctrlKey) return;

    if (!altKey && !shiftKey) {
      const digit = /^Digit([0-6])$/.exec(code);
      if (digit) {
        e.preventDefault();
        const level = Number(digit[1]);
        if (level) toggleHeading(level);
        else run(turnIntoTextCommand.key);
        return;
      }
      if (code === 'KeyT') {
        e.preventDefault();
        run(insertTableCommand.key, { row: 3, col: 3 });
        return;
      }
      if (code === 'KeyK') {
        e.preventDefault();
        insertLink();
        return;
      }
    }
    if (altKey && !shiftKey) {
      if (code === 'KeyQ') {
        e.preventDefault();
        run(wrapInBlockquoteCommand.key);
      } else if (code === 'KeyU') {
        e.preventDefault();
        run(wrapInBulletListCommand.key);
      } else if (code === 'KeyO') {
        e.preventDefault();
        run(wrapInOrderedListCommand.key);
      } else if (code === 'KeyX') {
        e.preventDefault();
        toggleTaskList();
      }
      return;
    }
    if (shiftKey && !altKey) {
      if (code === 'KeyX') {
        e.preventDefault();
        run(toggleStrikethroughCommand.key);
      } else if (code === 'KeyK') {
        e.preventDefault();
        run(createCodeBlockCommand.key);
      }
    }
  });
}
