import { t } from './i18n';

// Formatters follow the current language and are rebuilt when it changes.
const fmts = new Map<string, Intl.NumberFormat>();
function numFmt(digits: number): Intl.NumberFormat {
  const key = `${t().locale}:${digits}`;
  let f = fmts.get(key);
  if (!f) fmts.set(key, (f = new Intl.NumberFormat(t().locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return f;
}

export const fmtInt = (n: number): string => numFmt(0).format(Math.round(n));

export const fmtNum = (n: number, digits: number): string => numFmt(digits).format(n);

/** 'YYYY-MM-DD' → '18 nov 2026' / '18 Nov 2026' */
export function fmtIsoDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${t().months[m - 1]} ${y}`;
}

/** "há 5 min" / "5 min ago", "ontem" / "yesterday"… */
export function relTime(ms: number): string {
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return t().now;
  const rtf = new Intl.RelativeTimeFormat(t().locale, { numeric: 'auto', style: 'short' });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/**
 * Tiny DOM builder. Children are appended as text nodes (never parsed as HTML),
 * so data coming from external APIs cannot inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** localStorage wrapper that never throws (private mode, blocked storage…). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`earthlive:${key}`);
      if (raw == null) return fallback;
      // theme is stored as a bare string by the inline boot script
      return (raw.startsWith('{') || raw.startsWith('"') ? JSON.parse(raw) : raw) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`earthlive:${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    } catch {
      /* storage unavailable: preferences just won't persist */
    }
  },
};
