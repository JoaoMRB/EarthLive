const LOCALE = 'pt-PT';
const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' });

export const fmtInt = (n: number): string => intFmt.format(Math.round(n));

export const fmtNum = (n: number, digits: number): string =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'YYYY-MM-DD' → '18 nov 2026' */
export function fmtIsoDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "há 5 min", "há 2 h", "ontem"… */
export function relTime(ms: number): string {
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'agora';
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
