import { getLang, setLang, t, type Lang } from '@i18n/index';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { clearSave, exportFilename, exportSave, importSave, type StorageLike } from '@core/save';
import { getAchievementDef } from '@data/achievements';
import { getQuestDef } from '@data/quests';
import { getUnlocksAt } from '@data/unlocks';
import { isQuestComplete } from '@core/progression';
import { affordableMetaLevels, canReset, computeZenGain, franchiseReset } from '@core/prestige';
import { getMetaUpgradeDef } from '@data/prestige';
import { h, mount } from './dom';
import { confirmTwice, showDialog } from './dialog';
import { createHud } from './hud';
import { createEventCard, createEventPanel } from './eventPanel';
import { createLeafShopPanel } from './leafShopPanel';
import { claimFreeBoost, isFreeBoostReady } from '@core/events';
import { createMonetizationProvider } from '@core/monetization';
import { getRandomEventDef } from '@data/events';
import { createLocationsPanel } from './locationsPanel';
import { achievementName, claimableQuests, createProgressPanel } from './progressPanel';
import { createMarketingPanel } from './marketingPanel';
import { createSatisfactionPanel } from './satisfactionPanel';
import { createStaffPanel } from './staffPanel';
import { createNav, type Nav, type NavTarget } from './nav';
import { createManageTabs, type ManageTab } from './manageTabs';
import { createStatsPanel } from './statsPanel';
import { createAmbienceObjectPanel, type ObjectRef } from './stationPanel';
import { createPanelHost, type PanelContent, type PanelRequest } from './panel';
import { clearIndexedDbBackups, startPersistence } from './persistence';
import { createSettingsPanel } from './settingsPanel';
import { createShopPanel } from './shopPanel';
import { createStationPanel } from './stationPanel';
import { unlockLabel } from './labels';
import { createToaster } from './toast';
import { fmt, fmtTime } from './format';
import type { OfflineResult } from '@core/economy';
import { UI_CONFIG } from '@data/ui';
import type { SfxId } from '@data/audio';

export interface AppOptions {
  root: HTMLElement;
  store: Store;
  storage: StorageLike | null;
  version: string;
  /** Spielt einen Klang (Audio-Schicht); Auslöser sind Zustandswechsel, nicht einzelne Buttons. */
  sfx?(id: SfxId): void;
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
  const eventSlot = h('div', { class: 'event-slot' });
  const navSlot = h('div', { class: 'nav-host' });
  const panels = createPanelHost(store);
  const toaster = createToaster();
  root.append(hudSlot, eventSlot, panels.el, navSlot, toaster.el);
  // Einziger Weg zu Werbung/Käufen; mit `MONETIZATION_ENABLED = false` immer der No-op-Provider.
  const monetization = createMonetizationProvider();

  const persistence = startPersistence(store, o.storage, () =>
    toaster.show(t('toast.saveFailed'), 'error'),
  );

  const openObject = (obj: ObjectRef): void => {
    panels.open(obj.kind === 'station' ? stationReq(obj.id) : ambienceReq(obj.id));
  };
  const stationReq = (id: string): PanelRequest => ({
    key: `station:${id}`,
    create: () => createStationPanel(store, id, openObject),
  });
  const ambienceReq = (id: string): PanelRequest => ({
    key: `station:ambience-${id}`,
    create: () => createAmbienceObjectPanel(store, id, openObject),
  });
  /** Verwaltungs-Screen (UI_STYLE § 3.9): Shop, Marketing, Personal, Statistik als Karten-Tabs. */
  const manage = (tab: ManageTab, key: string, create: () => PanelContent): PanelRequest => ({
    key,
    create: () => ({
      ...create(),
      title: t('manage.title'),
      variant: 'screen',
      tabs: createManageTabs(tab, (next) => panels.open(manageReqs[next])),
    }),
  });
  const screen = (key: string, create: () => PanelContent): PanelRequest => ({
    key,
    create: () => ({ ...create(), variant: 'screen' }),
  });
  const shopTabReq = (tab: 'stations' | 'ambience' | 'quality'): PanelRequest =>
    manage('shop', 'shop', () => createShopPanel(store, (id) => panels.open(stationReq(id)), tab));
  const manageReqs: Record<ManageTab, PanelRequest> = {
    shop: shopTabReq('stations'),
    marketing: manage('marketing', 'marketing', () =>
      createMarketingPanel(store, () => toaster.show(t('toast.campaignStarted'), 'success')),
    ),
    staff: manage('staff', 'staff', () => createStaffPanel(store)),
    stats: manage('stats', 'stats', () => createStatsPanel(store)),
  };
  const settingsReq = screen('settings', () =>
    createSettingsPanel(
      store,
      { exportSave: doExport, importSave: doImport, deleteSave: () => void doDelete() },
      o.version,
    ),
  );
  const requests: Record<NavTarget, PanelRequest> = {
    ...manageReqs,
    build: shopTabReq('ambience'),
    locations: screen('locations', () => createLocationsPanel(store, (id) => void doReset(id))),
    achievements: screen('achievements', () => createProgressPanel(store)),
    settings: settingsReq,
  };

  const satisfactionReq: PanelRequest = {
    key: 'satisfaction',
    create: () => createSatisfactionPanel(store),
  };
  const toggle = (req: PanelRequest): void => {
    if (panels.current()?.key === req.key) panels.close();
    else panels.open(req);
  };
  const leafShopReq: PanelRequest = {
    key: 'leafShop',
    create: () => createLeafShopPanel(store, () => void doFreeBoost()),
  };
  const eventsReq: PanelRequest = { key: 'events', create: () => createEventPanel(store) };

  /** „Boost ansehen“: Provider zeigt (No-op: sofort) die Belohnung, `core` bucht den Boost. */
  async function doFreeBoost(): Promise<void> {
    if (!isFreeBoostReady(store.getState()) || !monetization.isAvailable()) return;
    const result = await monetization.showRewarded('freeBoost');
    if (!result.rewarded) return;
    const before = store.getState();
    if (store.dispatch(claimFreeBoost) !== before) toaster.show(t('toast.freeBoost'), 'success');
  }

  let unmountHud: (() => void) | null = null;
  let unmountCard: (() => void) | null = null;
  let unmountNav: (() => void) | null = null;
  let nav: Nav | null = null;
  const build = (): void => {
    unmountHud?.();
    unmountHud = mount(
      hudSlot,
      createHud({
        onSatisfaction: () => toggle(satisfactionReq),
        openLeafShop: () => toggle(leafShopReq),
        claimFreeBoost: () => void doFreeBoost(),
        openQuality: () => panels.open(shopTabReq('quality')),
      }),
      store,
    );
    unmountCard?.();
    unmountCard = mount(
      eventSlot,
      createEventCard(() => toggle(eventsReq)),
      store,
    );
    unmountNav?.();
    nav = createNav((id) => toggle(requests[id]));
    nav.setBadge('achievements', claimableQuests(store.getState()));
    unmountNav = mount(navSlot, nav, store);
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
      o.sfx?.('error');
      toaster.show(t('toast.importFailed'), 'error');
      return;
    }
    store.dispatch(() => imported);
    persistence.save();
    toaster.show(t('toast.imported'), 'success');
  }

  /** Franchise-Reset mit Vorschau (GAME_DESIGN § 11): was verloren geht, wie viel Zen, was es bringt. */
  async function doReset(locId: string): Promise<void> {
    const s = store.getState();
    if (!canReset(s, locId)) return;
    const gain = computeZenGain(s, locId);
    const total = s.meta.zen.add(gain);
    const levels = affordableMetaLevels(s, 'globalIncome', total);
    const pct = levels * getMetaUpgradeDef('globalIncome').perLevel * 100;
    const name = t(`location.${locId}.name`);
    const yes = await showDialog(root, {
      title: t('dialog.reset.title', { name }),
      body: [
        t('dialog.reset.lose', { name }),
        t('dialog.reset.gain', { zen: fmt(s, gain), total: fmt(s, total) }),
        pct > 0 ? t('dialog.reset.worth', { pct: fmt(s, pct) }) : t('dialog.reset.worthNone'),
        t('dialog.reset.keep'),
      ],
      confirm: t('dialog.reset.confirm', { zen: fmt(s, gain) }),
      cancel: t('ui.cancel'),
      danger: true,
      testId: 'dialog-reset',
    });
    if (!yes) return;
    const before = store.getState();
    const after = store.dispatch((x) => franchiseReset(x, locId));
    if (after === before) return;
    persistence.save();
    toaster.show(t('toast.reset', { name, zen: fmt(after, gain) }), 'success');
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
    nav?.setBadge('achievements', claimableQuests(s));
    playSounds(before, s);
    notifyLocations(before, s);
    if (s.createdAt !== before.createdAt) return;
    notifyEvents(before, s);
    if (s.activeLocationId !== before.activeLocationId) return;
    notifyProgress(before, s);
  });

  const levelSum = (s: GameState): number => {
    const loc = getLocation(s, s.activeLocationId);
    let n = 0;
    for (const st of Object.values(loc.stations)) n += st.level;
    for (const a of Object.values(loc.ambience)) n += a;
    for (const r of Object.values(loc.staff)) n += r;
    return n + loc.quality + loc.marketing.level;
  };

  /** Klänge aus dem Zustandsvergleich (S8): Kauf, Freischaltung, Events, Blätter, Boosts. */
  function playSounds(before: GameState, s: GameState): void {
    const play = o.sfx;
    if (!play || s.createdAt !== before.createdAt || s.activeLocationId !== before.activeLocationId)
      return;
    if (getLocation(s, s.activeLocationId).level > getLocation(before, s.activeLocationId).level)
      play('unlock');
    else if (levelSum(s) > levelSum(before)) play('buy');
    if (s.eventSchedule.count > before.eventSchedule.count) play('eventStart');
    if (s.stats.events > before.stats.events) play('eventEnd');
    if (s.leafDrops.count > before.leafDrops.count) play('leaf');
    if (s.boosts.length > before.boosts.length && s.boosts.some((b) => b.id !== 'hype'))
      play('boost');
  }

  /** Standort eröffnet oder gewechselt: Toast, und Panels mit festem Standort schließen. */
  function notifyLocations(before: GameState, s: GameState): void {
    if (s.createdAt !== before.createdAt) return;
    for (const id of s.meta.unlockedLocations) {
      if (before.meta.unlockedLocations.includes(id)) continue;
      toaster.show(t('toast.locationOpened', { name: t(`location.${id}.name`) }), 'success');
    }
    if (s.activeLocationId === before.activeLocationId) return;
    // Alle anderen Panels haben ihren Standort beim Öffnen festgehalten.
    if (panels.current()?.key !== requests.locations.key) panels.close();
    toaster.show(
      t('toast.locationSwitched', { name: t(`location.${s.activeLocationId}.name`) }),
      'success',
    );
  }

  /** Event-Start (Ankündigung), Event-Ende mit Belohnung, Blätter von Influencern. */
  function notifyEvents(before: GameState, s: GameState): void {
    if (s.activeEvents !== before.activeEvents) {
      const known = (list: GameState['activeEvents'], e: GameState['activeEvents'][number]) =>
        list.some(
          (x) => x.id === e.id && x.startedAt === e.startedAt && x.locationId === e.locationId,
        );
      for (const e of s.activeEvents) {
        if (known(before.activeEvents, e)) continue;
        // Offline verkürzte Events tauchen mit verschobenem Start erneut auf – das ist kein neues Event.
        if (s.eventSchedule.count === before.eventSchedule.count) continue;
        toaster.show(
          t('toast.eventStarted', {
            name: t(`event.${e.id}.name`),
            where: t(`location.${e.locationId}.name`),
            desc: t(`event.${e.id}.desc`),
          }),
          'info',
        );
      }
      if (s.stats.events > before.stats.events) {
        const gained = s.stats.leavesEarned - before.stats.leavesEarned;
        for (const e of before.activeEvents) {
          if (s.activeEvents.some((x) => x.id === e.id && x.locationId === e.locationId)) continue;
          const def = getRandomEventDef(e.id);
          const name = t(`event.${e.id}.name`);
          toaster.show(
            def && gained >= def.reward
              ? t('toast.eventEndedReward', { name, leaves: def.reward })
              : t('toast.eventEnded', { name }),
            'success',
          );
        }
      }
    }
    const drops = s.leafDrops.count - before.leafDrops.count;
    if (drops > 0 && s.leafDrops.date === before.leafDrops.date) {
      toaster.show(t('toast.leafDrop', { leaves: drops }), 'success');
    }
  }

  /** Toasts für Café-Level, Freischaltungen, Erfolge, Tagesaufgaben – aus dem Zustandsvergleich. */
  function notifyProgress(before: GameState, s: GameState): void {
    const locId = s.activeLocationId;
    const was = getLocation(before, locId).level;
    const now = getLocation(s, locId).level;
    if (now > was) {
      toaster.show(t('toast.cafeLevel', { level: now }), 'success');
      const gainedLeaves = s.stats.leavesEarned - before.stats.leavesEarned;
      const coins = s.meta.lifetimeEarned.sub(before.meta.lifetimeEarned);
      toaster.show(
        t('toast.cafeLevelReward', {
          coins: fmt(s, coins),
          leaves: gainedLeaves > 0 ? t('toast.cafeLevelLeaves', { leaves: gainedLeaves }) : '',
        }),
        'success',
      );
      for (let l = was + 1; l <= now; l++) {
        for (const u of getUnlocksAt(l)) {
          toaster.show(t('toast.unlocked', { name: unlockLabel(locId, u) }), 'success');
        }
      }
    }
    const quality = getLocation(s, locId).quality;
    if (quality > getLocation(before, locId).quality) {
      toaster.show(
        t('toast.quality', { name: t(`quality.tier.${String(quality)}.name`) }),
        'success',
      );
    }
    for (const id of Object.keys(s.meta.achievements)) {
      if (before.meta.achievements[id]) continue;
      const def = getAchievementDef(id);
      toaster.show(
        t('toast.achievement', { name: achievementName(def), leaves: def.reward }),
        'success',
      );
    }
    if (s.quests.date === before.quests.date) {
      s.quests.items.forEach((it, i) => {
        const prevItem = before.quests.items[i];
        if (!prevItem || isQuestComplete(prevItem) || !isQuestComplete(it)) return;
        const def = getQuestDef(it.id);
        toaster.show(
          t('toast.questDone', { name: t(`quest.${def.kind}`, { target: def.target }) }),
          'success',
        );
      });
    }
  }

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
    toastError: (text) => {
      o.sfx?.('error');
      toaster.show(text, 'error');
    },
  };
}
