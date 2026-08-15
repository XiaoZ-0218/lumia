// i18n: locale resolution, static-text application, and the statusbar switcher.
// Static markup carries data-i18n / data-i18n-title / data-i18n-aria-label /
// data-i18n-placeholder attributes; applyStaticTexts() rewrites them in one
// pass. Dynamic strings call t() at render time; modules that render state
// once subscribe to onLocaleChange() (same pattern as editor.ts onUpdate).
import { en } from './locales/en';
import type { Key } from './locales/en';
import { zh } from './locales/zh';
import { ja } from './locales/ja';

export type Locale = 'en' | 'zh' | 'ja';

const DICTS: Record<Locale, Record<Key, string>> = { en, zh, ja };
const LANG_KEY = 'lumia:lang';

/** Saved choice wins; otherwise the first navigator.languages tag we know. */
function detect(): Locale {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'zh' || saved === 'ja') return saved;
  } catch {
    /* storage disabled — fall through to detection */
  }
  for (const tag of navigator.languages ?? []) {
    const prefix = tag.toLowerCase();
    if (prefix.startsWith('zh')) return 'zh';
    if (prefix.startsWith('ja')) return 'ja';
    if (prefix.startsWith('en')) return 'en';
  }
  return 'en';
}

let current: Locale = detect();

export function locale(): Locale {
  return current;
}

/** Translate a key, replacing {token} placeholders with params. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = DICTS[current][key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** Localized first-boot document (draft restore overwrites it in files.ts). */
export function welcomeDoc(): string {
  return t('welcome');
}

type LocaleChangeHandler = (locale: Locale) => void;
const handlers: LocaleChangeHandler[] = [];

export function onLocaleChange(fn: LocaleChangeHandler): void {
  handlers.push(fn);
}

/** Rewrite every [data-i18n*] element in one pass (init + locale switches). */
export function applyStaticTexts(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle as Key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel as Key));
  });
  document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
    '[data-i18n-placeholder]',
  ).forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as Key);
  });
}

function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    /* storage disabled — keep the choice for this session only */
  }
  document.documentElement.lang = next;
  applyStaticTexts();
  for (const fn of handlers) fn(next);
}

export function initI18n(): void {
  document.documentElement.lang = current;
  applyStaticTexts();
  const select = document.getElementById('lang-select') as HTMLSelectElement | null;
  if (!select) return;
  // Option labels are static markup (each shown in its own language).
  select.value = current;
  select.addEventListener('change', () => setLocale(select.value as Locale));
}
