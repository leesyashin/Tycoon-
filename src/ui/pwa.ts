/** Chromium-Ereignis vor dem Installieren (nicht in den DOM-Typen). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaHooks {
  /** Neue Version liegt bereit; `apply` lädt sie (Seite lädt neu). */
  onUpdate(apply: () => void): void;
  /** Alle Dateien sind im Cache, das Spiel startet ab jetzt auch offline. */
  onOfflineReady(): void;
  /** Installieren ist möglich (`null`: nicht mehr/noch nicht). */
  onInstallable(install: (() => Promise<boolean>) | null): void;
}

/**
 * Service Worker (von vite-plugin-pwa/Workbox erzeugt, `registerType: 'prompt'`) und Install-Prompt
 * (PLAN S9 „PWA fertig“). Ein Update wird nie still eingespielt, sonst liefe neuer Code gegen einen alten
 * Spielstand im Speicher. Registrierung von Hand statt über `workbox-window` (keine neue Abhängigkeit).
 */
export function startPwa(hooks: PwaHooks): void {
  if ('serviceWorker' in navigator) void registerServiceWorker(hooks);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const evt = e as InstallPromptEvent;
    hooks.onInstallable(async () => {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      hooks.onInstallable(null);
      return outcome === 'accepted';
    });
  });
  window.addEventListener('appinstalled', () => hooks.onInstallable(null));
}

async function registerServiceWorker(hooks: PwaHooks): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  // Erste Installation: Spiel ist danach offline startbar. Spätere: neue Version wartet auf „Jetzt“.
  const firstInstall = !navigator.serviceWorker.controller;
  const offer = (worker: ServiceWorker): void => {
    if (firstInstall) {
      hooks.onOfflineReady();
      return;
    }
    hooks.onUpdate(() => {
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
      // Workbox (generateSW ohne skipWaiting) wartet auf genau diese Nachricht.
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
    });
  });
}
