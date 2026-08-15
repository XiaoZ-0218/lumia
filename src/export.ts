// Export: standalone HTML download + print/PDF. Owns only this file (+ export.css).
import './export.css';
import { ready } from './editor';
import { t, locale } from './i18n';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeFilename(s: string): string {
  const clean = s.replace(/[\\/:*?"<>|]/g, '-').trim();
  return clean || t('untitled');
}

function themeClass(): string {
  return Array.from(document.body.classList).find((c) => c.startsWith('theme-')) ?? 'theme-github';
}

/** Fetch the active theme stylesheet's text; '' if unavailable (base reset still applies). */
async function getThemeCss(): Promise<string> {
  const link = document.getElementById('theme-link') as HTMLLinkElement | null;
  if (!link?.href) return '';
  try {
    const res = await fetch(link.href);
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

function buildExportHtml(content: string, themeCss: string, bodyClass: string, title: string): string {
  // Tiny base reset; themes scope to `body.theme-<name> #editor .ProseMirror`, so
  // the exported body must reproduce that structure for the embedded CSS to apply.
  const reset = [
    '* { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; }',
    'body {',
    '  background: var(--bg, #fff);',
    '  color: var(--fg, #222);',
    '  -webkit-font-smoothing: antialiased;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;',
    '}',
  ].join('\n');
  return `<!doctype html>
<html lang="${locale()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>${reset}
${themeCss}</style>
</head>
<body class="${esc(bodyClass)}">
<main id="editor"><div class="ProseMirror">${content}</div></main>
</body>
</html>`;
}

function download(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportHtml(): Promise<void> {
  const pm = document.querySelector<HTMLElement>('#editor .ProseMirror');
  const content = pm?.innerHTML ?? '';
  const [themeCss] = await Promise.all([getThemeCss(), ready]);
  const title = (document.getElementById('doc-title')?.textContent ?? t('untitled')).trim() || t('untitled');
  download(`${sanitizeFilename(title)}.html`, buildExportHtml(content, themeCss, themeClass(), title));
}

function wireDropdown(menuId: string, dropdownId: string): void {
  const menu = document.getElementById(menuId) as HTMLButtonElement | null;
  const dropdown = document.getElementById(dropdownId) as HTMLDivElement | null;
  if (!menu || !dropdown) return;

  const setOpen = (open: boolean): void => {
    dropdown.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
  };

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(Boolean(dropdown.hidden));
  });
  dropdown.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setOpen(false));
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target as Node) && e.target !== menu) {
      setOpen(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dropdown.hidden) setOpen(false);
  });
}

function wireExport(): void {
  wireDropdown('export-menu', 'export-dropdown');
  document.getElementById('export-html')?.addEventListener('click', () => {
    void exportHtml();
  });
  document.getElementById('export-pdf')?.addEventListener('click', () => window.print());
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      window.print();
    }
  });
}

export function initExport(): void {
  void ready.then(wireExport);
}
