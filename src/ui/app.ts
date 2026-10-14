import { getLang, setLang, t, type Lang } from '@i18n/index';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { clearSave, exportFilename, exportSave, importSave, type StorageLike } from '@core/save';
import { STATIONS } from '@data/stations';
import { h, mount } from './dom';
import { confirmTwice, showDialog } from './dialog';
import { createHud } from './hud';
import { createAchievementsPanel, createLocationsPanel, createStaffPanel } from './infoPanels';
import { createNav, type NavTarget } from './nav';
import { createPanelHost, type PanelRequest } from './panel';
import { clearIndexedDbBackups, startPersistence } from './persistence';
import { createSettingsPanel } from './settingsPanel';
import { createShopPanel } from './shopPanel';
import { createStationPanel, stationName } from './stationPanel';
import { createToaster } from './toast';
import { fmt, fmtTime } from './format';
import type { OfflineResult } from '@core/economy';
import { UI_CONFIG } from '@data/ui';

export interface AppOptions {
  root: HTMLElement;
  store: Store;
  storage: StorageLike | null;
  version: string;
  /** Wird nach einem Sprachwechsel aufgerufen, damit die Szene ihre Texte neu setzt. */
  onLangChange(lang: Lang): void;
}

export interface App {
  openStation(id: string): void;
  showOffline(result: OfflineResult): void;
  toastError(text: string): void;
}

export function applyDocumentLang(lang: Lang): void {
  setLang(lang);
  document.documentElement.lang = lang;
  document.title = t('app.title');
}

/** Baut das DOM-Overlay und verbindet es mit Store und Speicher. Einzige Stelle mit Seiteneffekten der UI. */
export function startApp(o: AppOptions): App {
  const { root, store } = o;
  root.replaceChildren();
  const hudSlot = h('div', { class: 'hud-slot' });
  const navSlot = h('div', { class: 'nav-slot' });
  const panels = createPanelHost(store);
  const toaster = createToaster();
  root.append(hudSlot, panels.el, navSlot, toaster.el);

  const persistence = startPersistence(store, o.storage, () =>
    toaster.show(t('toast.saveFailed'), 'error'),
  );

  const stationReq = (id: string): PanelRequest => ({
    key: `station:${id}`,
    create: () => createStationPanel(store, id),
  });
  const shopReq: PanelRequest = {
    key: 'shop',
    create: () => createShopPanel(store, (id) => panels.open(stationReq(id))),
  };
  const settingsReq: PanelRequest = {
    key: 'settings',
    create: () =>
      createSettingsPanel(
        store,
        { exportSave: doExport, importSave: doImport, deleteSave: () => void doDelete() },
        o.version,
      ),
  };
  const requests: Record<NavTarget, PanelRequest> = {
    shop: shopReq,
    staff: { key: 'staff', create: createStaffPanel },
    locations: { key: 'locations', create: createLocationsPanel },
    achievements: { key: 'achievements', create: createAchievementsPanel },
    settings: settingsReq,
  };

  let unmountHud: (() => void) | null = null;
  const build = (): void => {
    unmountHud?.();
    unmountHud = mount(hudSlot, createHud(), store);
    navSlot.replaceChildren(
      createNav((id) => {
        if (panels.current()?.key === requests[id].key) panels.close();
        else panels.open(requests[id]);
      }),
    );
  };
  build();

  function doExport(): void {
    const s = store.getState();
    const blob = new Blob([exportSave(s)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: exportFilename(Date.now()) });
    document.body.append(a);
    a.click();
    a.remove();
    // Sofortiges Freigeben bricht den Download in manchen Browsern ab.
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toaster.show(t('toast.exported'), 'success');
  }

  function doImport(text: string): void {
    let imported: GameState;
    try {
      imported = importSave(text);
    } catch {
      toaster.show(t('toast.importFailed'), 'error');
      return;
    }
    store.dispatch(() => imported);
    persistence.save();
    toaster.show(t('toast.imported'), 'success');
  }

  async function doDelete(): Promise<void> {
    const yes = await confirmTwice(
      root,
      {
        title: t('dialog.delete.title'),
        body: [t('dialog.delete.body')],
        confirm: t('dialog.delete.confirm'),
        danger: true,
      },
      {
        title: t('dialog.delete2.title'),
        body: [t('dialog.delete2.body')],
        confirm: t('dialog.delete2.confirm'),
        danger: true,
      },
    );
    if (!yes) return;
    persistence.pause();
    if (o.storage) clearSave(o.storage);
    await clearIndexedDbBackups().catch(() => undefined);
    store.dispatch((s) => createInitialState(Date.now(), s.settings.lang));
    persistence.resume();
    persistence.save();
    panels.close();
    toaster.show(t('toast.deleted'), 'success');
  }

  // Reaktionen auf Zustandswechsel, die nicht zu einer einzelnen Komponente gehören.
  let prev = store.getState();
  store.subscribe((s) => {
    const before = prev;
    prev = s;
    if (s.settings.lang !== getLang()) {
      applyDocumentLang(s.settings.lang);
      build();
      panels.rebuild();
      o.onLangChange(s.settings.lang);
    }
    if (s.createdAt !== before.createdAt || s.activeLocationId !== before.activeLocationId) return;
    const was = getLocation(before, before.activeLocationId).level;
    const now = getLocation(s, s.activeLocationId).level;
    if (now > was) {
      toaster.show(t('toast.cafeLevel', { level: now }), 'success');
      for (const d of STATIONS) {
        if (d.unlockCafeLevel > was && d.unlockCafeLevel <= now) {
          toaster.show(
            t('toast.unlocked', { name: stationName(s.activeLocationId, d.id) }),
            'success',
          );
        }
      }
    }
  });

  return {
    openStation: (id) => panels.open(stationReq(id)),
    showOffline(result) {
      const elapsedSec = result.elapsedMs / 1000;
      if (elapsedSec < UI_CONFIG.offlineDialogMinSec || result.earned.lte(0)) return;
      const s = store.getState();
      const body = [
        t('dialog.offline.body', { time: fmtTime(elapsedSec), amount: fmt(s, result.earned) }),
      ];
      if (result.creditedMs < result.elapsedMs) {
        body.push(t('dialog.offline.capped', { time: fmtTime(result.creditedMs / 1000) }));
      }
      void showDialog(root, {
        title: t('dialog.offline.title'),
        body,
        confirm: t('dialog.offline.collect'),
        testId: 'dialog-offline',
      });
    },
    toastError: (text) => toaster.show(text, 'error'),
  };
}
