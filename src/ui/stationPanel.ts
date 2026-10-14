import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates } from '@core/customers';
import {
  buyAmbience,
  buyStation,
  collectModifiers,
  getBulkCost,
  getCheckoutThroughput,
  getNextAmbienceCost,
  getStationPrice,
  isAmbienceMaxed,
  isAmbienceUnlocked,
  isStationUnlocked,
  milestoneCounts,
  nextMilestone,
  resolveAmount,
  type BulkAmount,
} from '@core/economy';
import { CHECKOUT_ID, STATIONS, getStationDef } from '@data/stations';
import { AMBIENCE, getAmbienceDef } from '@data/ambience';
import { stationLookTier } from '@data/art';
import { h, on, setDisabled, setText } from './dom';
import { fmt } from './format';
import { icon } from './icons';
import type { PanelContent } from './panel';
import { lockedReason, productName, stationName } from './labels';
import { spriteIconUrl } from './sprites';

const AMOUNTS: { amount: BulkAmount; key: string }[] = [
  { amount: 1, key: 'ui.buy.x1' },
  { amount: 10, key: 'ui.buy.x10' },
  { amount: 100, key: 'ui.buy.x100' },
  { amount: 'max', key: 'ui.buy.max' },
];

/** Objekt im Icon-Grid: eine Station oder ein Ambiente-Element (UI_STYLE § 3.8). */
export interface ObjectRef {
  kind: 'station' | 'ambience';
  id: string;
}

export const OBJECTS: readonly ObjectRef[] = [
  ...STATIONS.map((d) => ({ kind: 'station' as const, id: d.id })),
  ...AMBIENCE.map((a) => ({ kind: 'ambience' as const, id: a.id })),
];

export function objectKey(o: ObjectRef): string {
  return o.kind === 'station' ? o.id : `ambience-${o.id}`;
}

function objectIcon(o: ObjectRef, level: number): string {
  return o.kind === 'station'
    ? `station-${o.id}-${String(stationLookTier(level))}`
    : `ambience-${o.id}`;
}

function objectName(locId: string, o: ObjectRef): string {
  return o.kind === 'station' ? stationName(locId, o.id) : t(`ambience.${o.id}.name`);
}

function objectLevel(s: GameState, locId: string, o: ObjectRef): number {
  const loc = getLocation(s, locId);
  return o.kind === 'station' ? (loc.stations[o.id]?.level ?? 0) : (loc.ambience[o.id] ?? 0);
}

function objectUnlocked(s: GameState, locId: string, o: ObjectRef): boolean {
  return o.kind === 'station'
    ? isStationUnlocked(s, locId, o.id)
    : isAmbienceUnlocked(s, locId, o.id);
}

function objectAffordable(s: GameState, locId: string, o: ObjectRef): boolean {
  if (!objectUnlocked(s, locId, o)) return false;
  const coins = getLocation(s, locId).coins;
  if (o.kind === 'station') return getBulkCost(s, locId, o.id, 1).lte(coins);
  return !isAmbienceMaxed(s, locId, o.id) && getNextAmbienceCost(s, locId, o.id).lte(coins);
}

interface Grid {
  el: HTMLElement;
  update(s: GameState): void;
}

/** Icon-Grid (5 Spalten) mit Pfeilen: alle Stationen und Ambiente-Elemente des Standorts. */
function objectGrid(locId: string, current: ObjectRef, open: (o: ObjectRef) => void): Grid {
  const index = OBJECTS.findIndex((o) => o.kind === current.kind && o.id === current.id);
  const step = (d: number): ObjectRef =>
    OBJECTS[(index + d + OBJECTS.length) % OBJECTS.length] ?? current;
  const arrow = (d: number, name: 'caret-left' | 'caret-right', testId: string, label: string) => {
    const b = h(
      'button',
      {
        class: 'btn-round btn-round--glass',
        type: 'button',
        'aria-label': label,
        'data-testid': testId,
      },
      icon(name),
    );
    on(b, 'click', () => open(step(d)));
    return b;
  };
  const tiles = OBJECTS.map((o) => {
    const img = h('img', { alt: '', width: 48, height: 48, src: spriteIconUrl(objectIcon(o, 1)) });
    const lock = icon('lock', 'tile-lock');
    const badge = h('span', { class: 'badge badge--count', 'aria-hidden': 'true' });
    const isCurrent = o.kind === current.kind && o.id === current.id;
    const btn = h(
      'button',
      {
        class: 'tile',
        type: 'button',
        'aria-current': isCurrent ? 'true' : undefined,
        'data-testid': `tile-${objectKey(o)}`,
      },
      img,
      lock,
      badge,
    );
    on(btn, 'click', () => open(o));
    return { o, btn, img, lock, badge, shown: '' };
  });
  const el = h(
    'div',
    { class: 'object-grid' },
    h(
      'div',
      { class: 'station-nav' },
      arrow(-1, 'caret-left', 'station-prev', t('station.panel.prev')),
      h('h3', { class: 'section-title', text: t('station.panel.allObjects') }),
      arrow(1, 'caret-right', 'station-next', t('station.panel.next')),
    ),
    h('ul', { class: 'icon-grid' }, ...tiles.map((x) => h('li', {}, x.btn))),
  );
  return {
    el,
    update(s) {
      for (const x of tiles) {
        const lvl = objectLevel(s, locId, x.o);
        const unlocked = objectUnlocked(s, locId, x.o);
        const affordable = objectAffordable(s, locId, x.o);
        const key = `${String(lvl)}:${String(unlocked)}:${String(affordable)}`;
        if (key === x.shown) continue;
        x.shown = key;
        const src = spriteIconUrl(objectIcon(x.o, lvl));
        if (x.img.getAttribute('src') !== src) x.img.src = src;
        x.btn.classList.toggle('locked', !unlocked);
        x.btn.classList.toggle('affordable', affordable);
        x.lock.style.display = unlocked ? 'none' : '';
        x.badge.hidden = lvl <= 0;
        setText(x.badge, String(lvl));
        const state = !unlocked
          ? t('station.panel.tileLocked')
          : t('station.panel.level', { level: lvl });
        x.btn.setAttribute('aria-label', `${objectName(locId, x.o)}: ${state}`);
      }
    },
  };
}

/** Kopf-Chips: Einkommen/s und Kunden/s der Station bzw. Zufriedenheit. */
function chipsFor(): { el: HTMLElement; set(a: string, b: string): void } {
  const a = h('span', { class: 'chip', 'data-testid': 'station-chip-income' });
  const b = h('span', { class: 'chip', 'data-testid': 'station-chip-customers' });
  return {
    el: h('span', { class: 'chip-group' }, a, b),
    set(x, y) {
      setText(a, x);
      setText(b, y);
      a.hidden = x === '';
      b.hidden = y === '';
    },
  };
}

/** Stations-Panel (GAME_DESIGN § 16.2, UI_STYLE § 3.8): Detailkarte, Kauf ×1/×10/×100/Max, Icon-Grid. */
export function createStationPanel(
  store: Store,
  stationId: string,
  open: (o: ObjectRef) => void,
): PanelContent {
  const def = getStationDef(stationId);
  const locId = store.getState().activeLocationId;
  const isCheckout = stationId === CHECKOUT_ID;
  const ref: ObjectRef = { kind: 'station', id: stationId };

  const level = h('span', { class: 'station-level', 'data-testid': 'station-level' });
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
  const img = h('img', { class: 'station-card-icon', alt: '', width: 64, height: 64 });

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

  const grid = objectGrid(locId, ref, open);
  const chips = chipsFor();
  const card = h(
    'div',
    { class: 'card station-card' },
    img,
    h('div', {}, h('h3', { text: stationName(locId, stationId) }), level),
    h(
      'div',
      { class: 'station-extra' },
      h('p', { class: 'muted', text: t(`station.${locId}.${stationId}.desc`) }),
      isCheckout ? null : product,
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
    ),
  );
  const el = h(
    'div',
    { class: 'station-panel' },
    card,
    h('div', { class: 'buy-row' }, ...buttons.map((b) => b.btn)),
    grid.el,
  );

  const update = (s: GameState): void => {
    const loc = getLocation(s, locId);
    const lvl = loc.stations[stationId]?.level ?? 0;
    const unlocked = isStationUnlocked(s, locId, stationId);
    const src = spriteIconUrl(objectIcon(ref, lvl));
    if (img.getAttribute('src') !== src) img.src = src;
    setText(level, t('station.panel.level', { level: lvl }));
    const rates = computeLocationRates(s, locId);
    if (isCheckout) {
      const mods = collectModifiers(s);
      const th = getCheckoutThroughput(lvl, loc.staff['cashier'] ?? 0, mods.speedMult);
      const perSec = t('station.panel.perSec', { amount: fmt(s, th) });
      setText(income, perSec);
      chips.set(perSec, '');
    } else {
      const priceMult = collectModifiers(s, locId).priceMult;
      setText(price, fmt(s, getStationPrice(def, lvl, locId).mul(priceMult)));
      setText(
        product,
        t('station.panel.product', { product: productName(stationId, loc.quality) }),
      );
      const inc = t('station.panel.perSec', {
        amount: fmt(s, rates.perStationIncome[stationId] ?? 0),
      });
      const cust = t('station.panel.perSec', { amount: fmt(s, rates.perStation[stationId] ?? 0) });
      setText(income, inc);
      setText(customers, cust);
      chips.set(inc, '');
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
      setText(b.cost, n > 0 ? fmt(s, cost) : '–');
      b.btn.setAttribute('aria-label', t('ui.buy.ariaLabel', { count: n, cost: fmt(s, cost) }));
      setDisabled(b.btn, !unlocked || n <= 0 || cost.gt(loc.coins));
    }
    grid.update(s);
  };
  return {
    title: stationName(locId, stationId),
    view: { el, update },
    chips: chips.el,
  };
}

/** Ambiente-Element im selben Bottom-Sheet: Detailkarte mit Kauf, darunter dasselbe Icon-Grid. */
export function createAmbienceObjectPanel(
  store: Store,
  ambienceId: string,
  open: (o: ObjectRef) => void,
): PanelContent {
  const def = getAmbienceDef(ambienceId);
  const locId = store.getState().activeLocationId;
  const ref: ObjectRef = { kind: 'ambience', id: ambienceId };
  const name = t(`ambience.${ambienceId}.name`);
  const level = h('span', { class: 'station-level', 'data-testid': 'ambience-level' });
  const locked = h('p', { class: 'locked-hint' });
  const btn = h('button', {
    class: 'btn btn-buy',
    type: 'button',
    'data-testid': `ambience-buy-${ambienceId}`,
  });
  on(btn, 'click', () => store.dispatch((s) => buyAmbience(s, locId, ambienceId)));
  const grid = objectGrid(locId, ref, open);
  const el = h(
    'div',
    { class: 'station-panel' },
    h(
      'div',
      { class: 'card station-card' },
      h('img', {
        class: 'station-card-icon',
        alt: '',
        width: 64,
        height: 64,
        src: spriteIconUrl(objectIcon(ref, 1)),
      }),
      h('div', {}, h('h3', { text: name }), level),
      h(
        'div',
        { class: 'station-extra' },
        h('p', { class: 'muted', text: t(`ambience.${ambienceId}.desc`) }),
        locked,
      ),
    ),
    h('div', { class: 'buy-row buy-row--single' }, btn),
    grid.el,
  );
  return {
    title: name,
    view: {
      el,
      update(s) {
        const lvl = getLocation(s, locId).ambience[ambienceId] ?? 0;
        const unlocked = isAmbienceUnlocked(s, locId, ambienceId);
        const maxed = isAmbienceMaxed(s, locId, ambienceId);
        const cost = getNextAmbienceCost(s, locId, ambienceId);
        setText(level, t('shop.ambienceLevel', { level: lvl, max: def.maxLevel }));
        setText(locked, unlocked ? '' : t('ui.unlockAt', { level: def.unlockCafeLevel }));
        locked.hidden = unlocked;
        const label = maxed ? t('ui.maxed') : t('shop.buyOne', { cost: fmt(s, cost) });
        setText(btn, label);
        btn.setAttribute('aria-label', `${name}: ${label}`);
        setDisabled(btn, !unlocked || maxed || cost.gt(getLocation(s, locId).coins));
        grid.update(s);
      },
    },
  };
}
