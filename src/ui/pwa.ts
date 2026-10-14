import { registerSW } from 'virtual:pwa-register';

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
 * Service Worker (vite-plugin-pwa, `registerType: 'prompt'`) und Install-Prompt (PLAN S9 „PWA fertig“).
 * Ein Update wird nie still eingespielt, sonst liefe neuer Code gegen einen alten Spielstand im Speicher.
 */
export function startPwa(hooks: PwaHooks): void {
  const update = registerSW({
    onNeedRefresh: () => hooks.onUpdate(() => void update(true)),
    onOfflineReady: () => hooks.onOfflineReady(),
  });
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
