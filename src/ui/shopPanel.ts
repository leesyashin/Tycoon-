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
import {
  buyQuality,
  getNextQualityCost,
  isNextQualityUnlocked,
  qualityPriceMult,
} from '@core/progression';
import { BALANCE } from '@data/balance';
import { QUALITY_PRICE_MULT_PER_TIER, getNextQualityTier } from '@data/quality';
import { AMBIENCE } from '@data/ambience';
import { STATIONS, STATION_AREAS } from '@data/stations';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtSmall } from './format';
import type { PanelContent } from './panel';
import { createTabs } from './tabs';
import { areaName, lockedReason, productName, stationName } from './labels';

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
          : lockedReason(s, locId, id, def?.unlockCafeLevel ?? 0),
      );
      setText(btn, unlocked ? fmt(s, cost) : t('shop.open'));
      btn.setAttribute('aria-label', `${stationName(locId, id)}: ${t('shop.open')}`);
    },
  };
}

/** Qualitäts-Tab (GAME_DESIGN § 8): aktuelle Stufe, Angebot, nächste Stufe kaufen. */
function qualityView(store: Store, locId: string): Row {
  const current = h('strong', { 'data-testid': 'quality-current' });
  const effect = h('span', { class: 'muted' });
  const menu = h('ul', { class: 'product-list', 'aria-label': t('quality.menu') });
  const next = h('strong');
  const nextEffect = h('span', { class: 'muted' });
  const status = h('span', { class: 'row-status' });
  const btn = h('button', { class: 'btn btn-row', type: 'button', 'data-testid': 'quality-buy' });
  on(btn, 'click', () => store.dispatch((s) => buyQuality(s, locId)));
  const nextRow = h(
    'li',
    { class: 'shop-row' },
    h('div', { class: 'row-text' }, next, nextEffect, status),
    btn,
  );
  const el = h(
    'div',
    { class: 'quality' },
    h('p', { class: 'row-text' }, current, effect),
    h('p', { class: 'muted', text: t('quality.menu') }),
    menu,
    h('ul', { class: 'shop-list' }, nextRow),
  );
  let shownQuality = -1;
  return {
    el,
    update(s) {
      const loc = getLocation(s, locId);
      const q = loc.quality;
      if (q !== shownQuality) {
        shownQuality = q;
        setText(current, t('quality.current', { name: t(`quality.tier.${String(q)}.name`) }));
        menu.replaceChildren(
          ...STATIONS.filter((d) => d.basePrice > 0).map((d) =>
            h('li', { text: `${stationName(locId, d.id)}: ${productName(d.id, q)}` }),
          ),
        );
      }
      setText(
        effect,
        t('quality.effectNow', {
          mult: fmtSmall(qualityPriceMult(loc)),
          sat: q * BALANCE.satisfaction.perQuality,
        }),
      );
      const tier = getNextQualityTier(q);
      const cost = getNextQualityCost(s, locId);
      if (!tier || !cost) {
        setText(next, t('quality.maxed'));
        setText(nextEffect, '');
        setText(status, '');
        btn.hidden = true;
        nextRow.classList.remove('affordable', 'locked');
        return;
      }
      btn.hidden = false;
      const unlocked = isNextQualityUnlocked(s, locId);
      const affordable = unlocked && cost.lte(loc.coins);
      nextRow.classList.toggle('affordable', affordable);
      nextRow.classList.toggle('locked', !unlocked);
      setText(next, t('quality.next', { name: t(`quality.tier.${String(tier.tier)}.name`) }));
      setText(
        nextEffect,
        t('quality.nextEffect', {
          mult: fmtSmall(QUALITY_PRICE_MULT_PER_TIER),
          sat: BALANCE.satisfaction.perQuality,
        }),
      );
      setText(
        status,
        unlocked
          ? affordable
            ? t('ui.affordable')
            : ''
          : t('ui.unlockAt', { level: tier.unlockCafeLevel }),
      );
      const label = t('quality.buy', { cost: fmt(s, cost) });
      setText(btn, label);
      btn.setAttribute('aria-label', `${t(`quality.tier.${String(tier.tier)}.name`)}: ${label}`);
      setDisabled(btn, !affordable);
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
    quality: { el: h('div'), rows: [] },
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
  lists.quality.rows = [qualityView(store, locId)];
  for (const tab of ['ambience', 'quality'] as const)
    lists[tab].el.append(...lists[tab].rows.map((r) => r.el));

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
