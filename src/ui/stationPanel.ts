import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates } from '@core/customers';
import {
  buyStation,
  collectModifiers,
  getBulkCost,
  getCheckoutThroughput,
  getStationPrice,
  isStationUnlocked,
  milestoneCounts,
  nextMilestone,
  resolveAmount,
  type BulkAmount,
} from '@core/economy';
import { CHECKOUT_ID, getStationDef } from '@data/stations';
import { h, on, setDisabled, setText } from './dom';
import { fmt } from './format';
import type { PanelContent } from './panel';
import { lockedReason, productName, stationName } from './labels';

const AMOUNTS: { amount: BulkAmount; key: string }[] = [
  { amount: 1, key: 'ui.buy.x1' },
  { amount: 10, key: 'ui.buy.x10' },
  { amount: 100, key: 'ui.buy.x100' },
  { amount: 'max', key: 'ui.buy.max' },
];

/** Stations-Panel (GAME_DESIGN § 16.2): Werte, Meilenstein-Vorschau, Kauf ×1/×10/×100/Max. */
export function createStationPanel(store: Store, stationId: string): PanelContent {
  const def = getStationDef(stationId);
  const locId = store.getState().activeLocationId;
  const isCheckout = stationId === CHECKOUT_ID;

  const level = h('p', { class: 'station-level', 'data-testid': 'station-level' });
  const stat = (label: string): [HTMLElement, HTMLElement] => {
    const value = h('dd');
    return [h('div', { class: 'stat' }, h('dt', { text: label }), value), value];
  };
  const [priceRow, price] = stat(t('station.panel.price'));
  const [incomeRow, income] = stat(
    t(isCheckout ? 'station.panel.throughput' : 'station.panel.income'),
  );
  const [customersRow, customers] = stat(t('station.panel.customers'));
  const milestone = h('p', { class: 'muted' });
  const product = h('p', { class: 'muted', 'data-testid': 'station-product' });
  const locked = h('p', { class: 'locked-hint' });

  const buttons = AMOUNTS.map(({ amount, key }) => {
    const label = h('span', { class: 'buy-amount' });
    const cost = h('span', { class: 'buy-cost' });
    const btn = h(
      'button',
      { class: 'btn btn-buy', type: 'button', 'data-testid': `buy-${String(amount)}` },
      label,
      cost,
    );
    on(btn, 'click', () => store.dispatch((s) => buyStation(s, locId, stationId, amount)));
    return { amount, key, btn, label, cost };
  });

  const el = h(
    'div',
    { class: 'station-panel' },
    h('p', { class: 'muted', text: t(`station.${locId}.${stationId}.desc`) }),
    isCheckout ? null : product,
    level,
    h(
      'dl',
      { class: 'stats' },
      isCheckout ? null : priceRow,
      incomeRow,
      isCheckout ? null : customersRow,
    ),
    milestone,
    h('p', {
      class: 'muted',
      text: t('station.panel.staff', { role: t(`staff.${def.staffRole}.name`) }),
    }),
    locked,
    h('div', { class: 'buy-row' }, ...buttons.map((b) => b.btn)),
  );

  const update = (s: GameState): void => {
    const loc = getLocation(s, locId);
    const lvl = loc.stations[stationId]?.level ?? 0;
    const unlocked = isStationUnlocked(s, locId, stationId);
    setText(level, t('station.panel.level', { level: lvl }));
    const rates = computeLocationRates(s, locId);
    if (isCheckout) {
      const mods = collectModifiers(s);
      const th = getCheckoutThroughput(lvl, loc.staff['cashier'] ?? 0, mods.speedMult);
      setText(income, t('station.panel.perSec', { amount: fmt(s, th) }));
    } else {
      const priceMult = collectModifiers(s, locId).priceMult;
      setText(price, fmt(s, getStationPrice(def, lvl, locId).mul(priceMult)));
      setText(
        product,
        t('station.panel.product', { product: productName(stationId, loc.quality) }),
      );
      setText(
        income,
        t('station.panel.perSec', { amount: fmt(s, rates.perStationIncome[stationId] ?? 0) }),
      );
      setText(
        customers,
        t('station.panel.perSec', { amount: fmt(s, rates.perStation[stationId] ?? 0) }),
      );
    }
    const next = nextMilestone(lvl);
    const isPrice = milestoneCounts(next).price > milestoneCounts(lvl).price;
    setText(
      milestone,
      t('station.panel.nextMilestone', {
        level: next,
        effect: t(isPrice ? 'station.panel.milestone.price' : 'station.panel.milestone.speed'),
      }),
    );
    setText(locked, unlocked ? '' : lockedReason(s, locId, stationId, def.unlockCafeLevel));
    locked.hidden = unlocked;
    for (const b of buttons) {
      const n = unlocked ? resolveAmount(s, locId, stationId, b.amount) : 0;
      const cost = getBulkCost(s, locId, stationId, b.amount);
      const firstBuy = lvl === 0 && b.amount === 1;
      setText(
        b.label,
        firstBuy
          ? t('station.panel.buyFirst')
          : b.amount === 'max'
            ? t('ui.buy.maxCount', { count: n })
            : t(b.key),
      );
      setText(b.cost, n > 0 ? `🪙 ${fmt(s, cost)}` : '–');
      b.btn.setAttribute('aria-label', t('ui.buy.ariaLabel', { count: n, cost: fmt(s, cost) }));
      setDisabled(b.btn, !unlocked || n <= 0 || cost.gt(loc.coins));
    }
  };
  return { title: stationName(locId, stationId), view: { el, update } };
}
