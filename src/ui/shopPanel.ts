import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import {
  buyAmbience,
  getBulkCost,
  getNextAmbienceCost,
  isAmbienceMaxed,
  isAmbienceUnlocked,
  isStationUnlocked,
} from '@core/economy';
import { AMBIENCE } from '@data/ambience';
import { STATIONS } from '@data/stations';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt } from './format';
import type { PanelContent } from './panel';
import { stationName } from './stationPanel';

type Tab = 'stations' | 'ambience' | 'quality';
const TABS: Tab[] = ['stations', 'ambience', 'quality'];

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
      const cost = getBulkCost(s, locId, id, 1);
      const affordable = unlocked && cost.lte(loc.coins);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('locked', !unlocked);
      const def = STATIONS.find((d) => d.id === id);
      setText(
        status,
        unlocked
          ? `${t('station.panel.level', { level: lvl })}${affordable ? ` · ${t('ui.affordable')}` : ''}`
          : t('ui.unlockAt', { level: def?.unlockCafeLevel ?? 0 }),
      );
      setText(btn, unlocked ? `🪙 ${fmt(s, cost)}` : t('shop.open'));
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
      const label = maxed ? t('ui.maxed') : t('shop.buyOne', { cost: fmt(s, cost) });
      setText(btn, label);
      btn.setAttribute('aria-label', `${name}: ${label}`);
      setDisabled(btn, !affordable);
    },
  };
}

/** Shop-Übersicht (GAME_DESIGN § 16.3) mit Tabs Stationen / Ambiente / Qualität. */
export function createShopPanel(
  store: Store,
  openStation: (id: string) => void,
  initialTab: Tab = 'stations',
): PanelContent {
  const locId = store.getState().activeLocationId;
  const lists: Record<Tab, { el: HTMLElement; rows: Row[] }> = {
    stations: { el: h('ul', { class: 'shop-list' }), rows: [] },
    ambience: { el: h('ul', { class: 'shop-list' }), rows: [] },
    quality: { el: h('div', { class: 'muted', text: t('ui.comingSoon') }), rows: [] },
  };
  lists.stations.rows = STATIONS.map((d) => stationRow(locId, d.id, openStation));
  lists.ambience.rows = AMBIENCE.map((a) => ambienceRow(store, locId, a.id));
  for (const tab of TABS) lists[tab].el.append(...lists[tab].rows.map((r) => r.el));

  const tablist = h('div', { class: 'tabs', role: 'tablist' });
  const panels = h('div');
  let active: Tab = initialTab;
  const tabButtons = TABS.map((tab) => {
    const btn = h('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      id: `shop-tab-${tab}`,
      'aria-controls': `shop-tabpanel-${tab}`,
      'data-testid': `shop-tab-${tab}`,
      text: t(`shop.tab.${tab}`),
    });
    const panel = h(
      'div',
      { role: 'tabpanel', id: `shop-tabpanel-${tab}`, 'aria-labelledby': `shop-tab-${tab}` },
      lists[tab].el,
    );
    panels.append(panel);
    on(btn, 'click', () => select(tab));
    tablist.append(btn);
    return { tab, btn, panel };
  });
  const select = (tab: Tab): void => {
    active = tab;
    for (const b of tabButtons) {
      const sel = b.tab === tab;
      b.btn.setAttribute('aria-selected', String(sel));
      b.btn.tabIndex = sel ? 0 : -1;
      b.panel.hidden = !sel;
    }
  };
  // Pfeiltasten wechseln Tabs (WAI-ARIA Tabs-Muster).
  on(tablist, 'keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.indexOf(active);
    const next =
      TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length] ?? 'stations';
    select(next);
    tabButtons.find((b) => b.tab === next)?.btn.focus();
  });
  select(initialTab);

  const view: View = {
    el: h('div', { class: 'shop' }, tablist, panels),
    update(s) {
      for (const r of lists[active].rows) r.update(s);
    },
  };
  // Beim Tab-Wechsel sofort aktualisieren, nicht erst beim nächsten Tick.
  on(tablist, 'click', () => view.update(store.getState()));
  return { title: t('shop.title'), view };
}
