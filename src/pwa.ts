/**
 * Installable app (PWA): service worker registration and a discreet
 * "Install app" button that adapts to each browser.
 *
 * - Chromium browsers (Chrome, Edge, Brave, Opera, Samsung Internet) fire
 *   `beforeinstallprompt`: the button opens the native install dialog.
 * - Safari on iPhone/iPad has no install API: the button explains
 *   Share → Add to Home Screen.
 * - Already installed (standalone window) or unsupported: no button.
 */
import { t } from './i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

const standalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: minimal-ui)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac

const buttons = () => document.querySelectorAll<HTMLButtonElement>('[data-install]');

function showButtons(show: boolean): void {
  buttons().forEach((b) => (b.hidden = !show));
}

let toastTimer = 0;
function toast(text: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 7000);
}

export function initPwa(): void {
  // Service worker only in production builds: in dev it would cache Vite's modules.
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('[sw]', err));
    });
  }

  if (standalone()) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the browser's mini-infobar away; we offer our own button
    deferred = e as BeforeInstallPromptEvent;
    showButtons(true);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    showButtons(false);
  });

  // Safari iOS never fires beforeinstallprompt: offer instructions instead.
  if (isIos()) showButtons(true);

  buttons().forEach((b) =>
    b.addEventListener('click', async () => {
      if (deferred) {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') showButtons(false);
        deferred = null;
      } else if (isIos()) {
        toast(t().pwa.iosHint);
      }
    }),
  );
}

/** Title-bar / status-bar colour of the installed app follows the theme. */
export function setThemeColor(dark: boolean): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0C0E' : '#F2F1EE');
}
