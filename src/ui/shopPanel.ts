import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import {
  buyAmbience,
  getBulkCost,
  getNextAmbienceCost,
  isAmbienceMaxed,
  isAmbienceUnlocked,
  isStationMaxed,
  isStationUnlocked,
} from '@core/economy';
import { AMBIENCE } from '@data/ambience';
import { STATIONS, STATION_AREAS } from '@data/stations';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmtMoney } from './format';
import type { PanelContent } from './panel';
import { createTabs } from './tabs';
import { areaName, lockedReason, productName, stationName } from './labels';

type Tab = 'stations' | 'ambience';
const TABS: Tab[] = ['stations', 'ambience'];

interface Row {
  el: HTMLElement;
  update(s: GameState): void;
}

function stationRow(locId: string, id: string, openStation: (id: string) => void): Row {
  const status = h('span', { class: 'row-status' });
  const btn = h('button', {
    class: 'btn btn-row',
    type: 'button',
    'data-testid': `shop-station-${id}`,
  });
  on(btn, 'click', () => openStation(id));
  const el = h(
    'li',
    { class: 'shop-row' },
    h('div', { class: 'row-text' }, h('strong', { text: stationName(locId, id) }), status),
    btn,
  );
  return {
    el,
    update(s) {
      const loc = getLocation(s, locId);
      const lvl = loc.stations[id]?.level ?? 0;
      const unlocked = isStationUnlocked(s, locId, id);
      const maxed = isStationMaxed(s, locId, id);
      const cost = getBulkCost(s, locId, id, 1);
      const affordable = unlocked && !maxed && cost.lte(loc.coins);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('locked', !unlocked);
      const def = STATIONS.find((d) => d.id === id);
      const product = def && def.menu.length > 0 && lvl > 0 ? ` · ${productName(id, lvl)}` : '';
      setText(
        status,
        unlocked
          ? `${t('station.panel.level', { level: lvl })}${product}${affordable ? ` · ${t('ui.affordable')}` : ''}`
          : lockedReason(s, locId, id, def?.unlockCafeLevel ?? 0),
      );
      setText(btn, !unlocked ? t('shop.open') : maxed ? t('ui.maxed') : fmtMoney(cost));
      btn.setAttribute('aria-label', `${stationName(locId, id)}: ${t('shop.open')}`);
    },
  };
}

function ambienceRow(store: Store, locId: string, id: string): Row {
  const status = h('span', { class: 'row-status' });
  const btn = h('button', {
    class: 'btn btn-row',
    type: 'button',
    'data-testid': `shop-ambience-${id}`,
  });
  on(btn, 'click', () => store.dispatch((s) => buyAmbience(s, locId, id)));
  const def = AMBIENCE.find((a) => a.id === id);
  const name = t(`ambience.${id}.name`);
  const el = h(
    'li',
    { class: 'shop-row' },
    h(
      'div',
      { class: 'row-text' },
      h('strong', { text: name }),
      h('span', { class: 'muted', text: t(`ambience.${id}.desc`) }),
      status,
    ),
    btn,
  );
  return {
    el,
    update(s) {
      const lvl = getLocation(s, locId).ambience[id] ?? 0;
      const unlocked = isAmbienceUnlocked(s, locId, id);
      const maxed = isAmbienceMaxed(s, locId, id);
      const cost = getNextAmbienceCost(s, locId, id);
      const affordable = unlocked && !maxed && cost.lte(getLocation(s, locId).coins);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('locked', !unlocked);
      setText(
        status,
        !unlocked
          ? t('ui.unlockAt', { level: def?.unlockCafeLevel ?? 0 })
          : `${t('shop.ambienceLevel', { level: lvl, max: def?.maxLevel ?? 0 })}${affordable ? ` · ${t('ui.affordable')}` : ''}`,
      );
      const label = maxed ? t('ui.maxed') : t('shop.buyOne', { cost: fmtMoney(cost) });
      setText(btn, label);
      btn.setAttribute('aria-label', `${name}: ${label}`);
      setDisabled(btn, !affordable);
    },
  };
}

/** Shop-Übersicht (GAME_DESIGN § 16.3) mit Tabs Ausstattung / Ambiente (Matcha-Sorten stehen im Einkauf). */
export function createShopPanel(
  store: Store,
  openStation: (id: string) => void,
  initialTab: Tab = 'stations',
): PanelContent {
  const locId = store.getState().activeLocationId;
  const lists: Record<Tab, { el: HTMLElement; rows: Row[] }> = {
    stations: { el: h('ul', { class: 'shop-list' }), rows: [] },
    ambience: { el: h('ul', { class: 'shop-list' }), rows: [] },
  };
  // Ausstattung nach Theken-Bereich (GAME_DESIGN § 4): Bestelltheke, Barista-Theke, Ausgabe.
  for (const area of STATION_AREAS) {
    const rows = STATIONS.filter((d) => d.area === area).map((d) =>
      stationRow(locId, d.id, openStation),
    );
    lists.stations.rows.push(...rows);
    lists.stations.el.append(
      h('li', { class: 'shop-area', 'data-testid': `shop-area-${area}` }, areaName(area)),
      ...rows.map((r) => r.el),
    );
  }
  lists.ambience.rows = AMBIENCE.map((a) => ambienceRow(store, locId, a.id));
  lists.ambience.el.append(...lists.ambience.rows.map((r) => r.el));

  let view: View | null = null;
  const tabs = createTabs(
    'shop',
    TABS.map((tab) => ({ id: tab, label: t(`shop.tab.${tab}`), content: lists[tab].el })),
    initialTab,
    () => view?.update(store.getState()),
  );
  view = {
    el: h('div', { class: 'shop' }, tabs.el),
    update(s) {
      for (const r of lists[tabs.active()].rows) r.update(s);
    },
  };
  return { title: t('shop.title'), view };
}
