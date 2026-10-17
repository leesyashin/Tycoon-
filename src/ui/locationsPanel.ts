import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { peakIncomePerHour } from '@core/customers';
import {
  buyMetaUpgrade,
  canReset,
  computeZenGain,
  getMetaEffects,
  getMetaLevel,
  getNextMetaCost,
} from '@core/prestige';
import {
  canUnlockLocation,
  getLocationRequirement,
  isLocationUnlocked,
  switchLocation,
  unlockLocation,
} from '@core/progression';
import { LOCATIONS } from '@data/locations';
import { BALANCE } from '@data/balance';
import { META_UPGRADES, PRESTIGE, type MetaUpgradeDef } from '@data/prestige';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtMoney, fmtSmall } from './format';
import type { PanelContent } from './panel';
import { createTabs } from './tabs';

type Tab = 'locations' | 'zen';
const TABS: Tab[] = ['locations', 'zen'];

interface Row {
  el: HTMLElement;
  update(s: GameState): void;
}

const locName = (id: string): string => t(`location.${id}.name`);

function locationRow(store: Store, id: string, onReset: (id: string) => void): Row {
  const status = h('span', { class: 'row-status', 'data-testid': `location-status-${id}` });
  const detail = h('span', { class: 'muted' });
  const mainBtn = h('button', {
    class: 'btn btn-row',
    type: 'button',
    'data-testid': `location-action-${id}`,
  });
  on(mainBtn, 'click', () => {
    const s = store.getState();
    if (isLocationUnlocked(s, id)) store.dispatch((x) => switchLocation(x, id));
    else store.dispatch((x) => unlockLocation(x, id));
  });
  const resetBtn = h('button', {
    class: 'btn btn-danger',
    type: 'button',
    'data-testid': `location-reset-${id}`,
  });
  on(resetBtn, 'click', () => onReset(id));
  const el = h(
    'li',
    { class: 'shop-row shop-row-stack', 'data-testid': `location-${id}` },
    h(
      'div',
      { class: 'row-text' },
      h('strong', { text: locName(id) }),
      h('span', { class: 'muted', text: t(`location.${id}.theme`) }),
      detail,
      status,
    ),
    h('div', { class: 'btn-row-group' }, mainBtn, resetBtn),
  );
  return {
    el,
    update(s) {
      const unlocked = isLocationUnlocked(s, id);
      const active = s.activeLocationId === id;
      el.classList.toggle('affordable', active);
      el.classList.toggle('locked', !unlocked);
      resetBtn.hidden = !unlocked;
      if (unlocked) {
        const loc = getLocation(s, id);
        setText(
          detail,
          t('locations.detail', {
            level: loc.level,
            income: fmtMoney(peakIncomePerHour(s, id)),
            coins: fmtMoney(loc.coins),
          }),
        );
        setText(
          status,
          active
            ? t('locations.active')
            : loc.prestigeCount > 0
              ? t('locations.resets', { count: loc.prestigeCount })
              : '',
        );
        setText(mainBtn, active ? t('locations.here') : t('locations.switch'));
        setDisabled(mainBtn, active);
        const ok = canReset(s, id);
        const label = ok
          ? t('locations.reset', { zen: fmt(s, computeZenGain(s, id)) })
          : t('locations.resetLocked', { level: PRESTIGE.resetMinCafeLevel });
        setText(resetBtn, label);
        resetBtn.setAttribute('aria-label', `${locName(id)}: ${label}`);
        setDisabled(resetBtn, !ok);
        return;
      }
      const r = getLocationRequirement(s, id);
      // Die erste Filiale kostet kein Zen: dann steht es weder in der Bedingung noch auf dem Knopf.
      const zenFree = !r || r.zen.lte(0);
      setText(
        detail,
        r
          ? t(zenFree ? 'locations.unlockNoZen' : 'locations.unlock', {
              prev: locName(r.prevLocationId),
              level: r.cafeLevel,
              best: r.prevBestLevel,
              zen: fmt(s, r.zen),
              cost: fmtMoney(r.cost),
            })
          : '',
      );
      const can = canUnlockLocation(s, id);
      setText(status, can ? t('ui.affordable') : '');
      const label = zenFree
        ? t('locations.openCost', { cost: fmtMoney(r?.cost ?? 0) })
        : t('locations.open', { zen: fmt(s, r.zen) });
      setText(mainBtn, label);
      mainBtn.setAttribute('aria-label', `${locName(id)}: ${label}`);
      setDisabled(mainBtn, !can);
    },
  };
}

/** Aktueller Effekt eines Meta-Upgrades in Zahlen. */
function metaEffectText(s: GameState, def: MetaUpgradeDef): string {
  const fx = getMetaEffects(s);
  const lvl = getMetaLevel(s, def.id);
  switch (def.id) {
    case 'globalIncome':
      return t('zen.effect.income', { pct: fmtSmall((fx.incomeMult - 1) * 100, 0) });
    case 'startCapital':
      return t('zen.effect.startCapital', { hours: fx.startCapitalHours });
    case 'offlineEfficiency':
      return t('zen.effect.offline', {
        pct: fmtSmall(
          Math.min(
            BALANCE.offline.maxEfficiency,
            BALANCE.offline.baseEfficiency + lvl * def.perLevel,
          ) * 100,
          0,
        ),
      });
    case 'discount':
      return t('zen.effect.discount', { pct: fmtSmall(fx.discount * 100, 0) });
    case 'tapPower':
      return t('zen.effect.tap', { pct: fmtSmall(lvl * def.perLevel * 100, 0) });
    case 'fastStart':
      return t('zen.effect.fastStart', { count: lvl, level: def.perLevel });
    case 'satisfactionBase':
      return t('zen.effect.satisfaction', { value: fmtSmall(fx.satisfactionBonus, 0) });
  }
}

function metaRow(store: Store, def: MetaUpgradeDef): Row {
  const name = t(`zen.${def.id}.name`);
  const status = h('span', { class: 'row-status' });
  const effect = h('span', { class: 'muted', 'data-testid': `zen-effect-${def.id}` });
  const btn = h('button', { class: 'btn btn-row', type: 'button', 'data-testid': `zen-${def.id}` });
  on(btn, 'click', () => store.dispatch((s) => buyMetaUpgrade(s, def.id)));
  const el = h(
    'li',
    { class: 'shop-row' },
    h(
      'div',
      { class: 'row-text' },
      h('strong', { text: name }),
      h('span', { class: 'muted', text: t(`zen.${def.id}.desc`) }),
      effect,
      status,
    ),
    btn,
  );
  return {
    el,
    update(s) {
      const cost = getNextMetaCost(s, def.id);
      const affordable = !!cost && s.meta.zen.gte(cost);
      el.classList.toggle('affordable', affordable);
      setText(effect, metaEffectText(s, def));
      setText(
        status,
        `${t('zen.level', { level: getMetaLevel(s, def.id), max: def.maxLevel })}${affordable ? ` · ${t('ui.affordable')}` : ''}`,
      );
      const label = cost ? t('zen.buy', { cost: fmt(s, cost) }) : t('ui.maxed');
      setText(btn, label);
      btn.setAttribute('aria-label', `${name}: ${label}`);
      setDisabled(btn, !affordable);
    },
  };
}

/**
 * Standorte (GAME_DESIGN § 16.6) und Zen-Shop (§ 16.7) in einem Panel: Liste mit Fortschritt,
 * Freischalt-Bedingungen, Wechseln und Franchise-Reset; Meta-Upgrades im zweiten Tab.
 */
export function createLocationsPanel(
  store: Store,
  onReset: (id: string) => void,
  initialTab: Tab = 'locations',
): PanelContent {
  const zenLine = h('p', { class: 'zen-balance', 'data-testid': 'zen-balance' });
  const lists: Record<Tab, { el: HTMLElement; rows: Row[] }> = {
    locations: { el: h('ul', { class: 'shop-list' }), rows: [] },
    zen: { el: h('ul', { class: 'shop-list' }), rows: [] },
  };
  lists.locations.rows = LOCATIONS.map((l) => locationRow(store, l.id, onReset));
  lists.zen.rows = META_UPGRADES.map((m) => metaRow(store, m));
  for (const tab of TABS) lists[tab].el.append(...lists[tab].rows.map((r) => r.el));
  const content: Record<Tab, HTMLElement> = {
    locations: lists.locations.el,
    zen: h('div', {}, h('p', { class: 'muted', text: t('zen.hint') }), lists.zen.el),
  };

  let view: View | null = null;
  const tabs = createTabs(
    'locations',
    TABS.map((tab) => ({ id: tab, label: t(`locations.tab.${tab}`), content: content[tab] })),
    initialTab,
    () => view?.update(store.getState()),
  );
  view = {
    el: h('div', { class: 'locations' }, zenLine, tabs.el),
    update(s) {
      setText(zenLine, t('zen.balance', { zen: fmt(s, s.meta.zen) }));
      for (const r of lists[tabs.active()].rows) r.update(s);
    },
  };
  return { title: t('locations.title'), view };
}
