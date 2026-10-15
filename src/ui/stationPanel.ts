import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates } from '@core/customers';
import {
  buyAmbience,
  buyStation,
  collectModifiers,
  getBulkCost,
  getNextAmbienceCost,
  getStationPrice,
  getStationSpeed,
  getStationWorkSeconds,
  isAmbienceMaxed,
  isAmbienceUnlocked,
  isStationUnlocked,
  milestoneCounts,
  nextMilestone,
  resolveAmount,
  type BulkAmount,
} from '@core/economy';
import { attachRate, customerTypeShares, type StageId } from '@core/customers';
import { getStaffLevel } from '@core/staff';
import { STATIONS, getStationDef, type StationArea } from '@data/stations';
import { AMBIENCE, getAmbienceDef } from '@data/ambience';
import {
  nextStationLookLevel,
  nextTableLookLevel,
  stationLookTier,
  tableLookTier,
} from '@data/art';
import { BALANCE } from '@data/balance';
import { h, on, setDisabled, setText } from './dom';
import { fmt, fmtSmall } from './format';
import { icon, setIcon } from './icons';
import type { PanelContent } from './panel';
import { areaName, lockedReason, productName, roleName, stageName, stationName } from './labels';
import { stageLoadPct } from './pipeline';
import { spriteIconUrl } from './sprites';

/** Stufe der Pipeline, an der ein Theken-Bereich arbeitet. */
const AREA_STAGE: Record<StationArea, StageId> = {
  order: 'order',
  bar: 'production',
  service: 'service',
};

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

/** Icon in der Optik-Stufe des Levels: Geräte (5 Stufen) und Tische (4 Stufen) werden edler. */
function objectIcon(o: ObjectRef, level: number): string {
  if (o.kind === 'station') return `station-${o.id}-${String(stationLookTier(level))}`;
  return o.id === 'seats' ? `ambience-seats-${String(tableLookTier(level))}` : `ambience-${o.id}`;
}

/**
 * Zeile „Neues Design ab Lv X“ mit Vorschau der nächsten Optik; auf der letzten Stufe „Edelste Ausführung“.
 * Zeigt, dass Geräte mit dem Level schöner werden (UI_STYLE § 4).
 */
function lookRow(testId: string): {
  el: HTMLElement;
  set(next: number | null, preview: string): void;
} {
  const sym = icon('sparkle', 'look-next-sym');
  const text = h('span', { class: 'look-next-text' });
  const img = h('img', { class: 'look-next-icon', alt: '', width: 36, height: 36 });
  const el = h('p', { class: 'look-next', 'data-testid': testId }, sym, text, img);
  let shown = '';
  return {
    el,
    set(next, preview) {
      const key = `${String(next)}:${preview}`;
      if (key === shown) return;
      shown = key;
      setIcon(sym, next === null ? 'crown' : 'sparkle');
      setText(
        text,
        next === null
          ? t('station.panel.finestLook')
          : t('station.panel.nextLook', { level: next }),
      );
      img.hidden = next === null;
      if (next !== null) img.src = spriteIconUrl(preview);
    },
  };
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

/**
 * Stations-Panel (GAME_DESIGN § 16.2, UI_STYLE § 3.8): Detailkarte der Ausstattung (Bereich, Produkt, Preis,
 * Arbeitszeit, Einkommen, Auslastung der Stufe), Kauf ×1/×10/×100/Max, Icon-Grid.
 */
export function createStationPanel(
  store: Store,
  stationId: string,
  open: (o: ObjectRef) => void,
): PanelContent {
  const def = getStationDef(stationId);
  const locId = store.getState().activeLocationId;
  const isLine = def.area === 'bar';
  const stage = AREA_STAGE[def.area];
  const ref: ObjectRef = { kind: 'station', id: stationId };

  const level = h('span', { class: 'station-level', 'data-testid': 'station-level' });
  const stat = (label: string, testId?: string): [HTMLElement, HTMLElement] => {
    const value = h('dd', testId ? { 'data-testid': testId } : {});
    return [h('div', { class: 'stat' }, h('dt', { text: label }), value), value];
  };
  const [priceRow, price] = stat(t('station.panel.price'));
  const [incomeRow, income] = stat(t('station.panel.income'));
  const [workRow, work] = stat(
    t(def.area === 'order' ? 'station.panel.orderTime' : 'station.panel.workTime'),
    'station-work',
  );
  const [speedRow, speed] = stat(t('station.panel.speed'));
  const [capRow, cap] = stat(t('station.panel.capacity'), 'station-capacity');
  const load = h('p', { class: 'muted', 'data-testid': 'station-load' });
  const milestone = h('p', { class: 'muted' });
  const product = h('p', { class: 'muted', 'data-testid': 'station-product' });
  const attach = h('p', { class: 'muted', 'data-testid': 'station-attach' });
  const staff = h('p', { class: 'muted', 'data-testid': 'station-staff' });
  const locked = h('p', { class: 'locked-hint' });
  const img = h('img', { class: 'station-card-icon', alt: '', width: 64, height: 64 });
  const look = lookRow('station-look');

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
    h(
      'div',
      {},
      h('h3', { text: stationName(locId, stationId) }),
      h('span', { class: 'station-area', text: areaName(def.area) }),
      level,
    ),
    h(
      'div',
      { class: 'station-extra' },
      h('p', { class: 'muted', text: t(`station.${locId}.${stationId}.desc`) }),
      isLine ? product : null,
      isLine ? attach : null,
      h(
        'dl',
        { class: 'stats' },
        isLine ? priceRow : null,
        isLine ? incomeRow : null,
        isLine || def.area === 'order' ? workRow : null,
        def.area === 'service' ? speedRow : null,
        capRow,
      ),
      load,
      milestone,
      look.el,
      staff,
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
    const mods = collectModifiers(s, locId);
    const stageCap = t('pipeline.capacity', { amount: fmtSmall(rates.stages[stage], 2) });
    setText(cap, stageCap);
    setText(
      load,
      t('station.panel.stageLoad', {
        stage: stageName(stage),
        pct: fmtSmall(stageLoadPct(rates, stage), 0),
      }),
    );
    if (isLine) {
      setText(price, fmt(s, getStationPrice(def, lvl, locId).mul(mods.priceMult)));
      setText(
        product,
        t('station.panel.product', { product: productName(stationId, loc.quality) }),
      );
      setText(
        attach,
        t('station.panel.attach', {
          pct: fmtSmall(100 * attachRate(def, customerTypeShares(locId).tourist), 0),
        }),
      );
      const inc = t('station.panel.perSec', {
        amount: fmt(s, rates.perStationIncome[stationId] ?? 0),
      });
      setText(income, inc);
      const sec = getStationWorkSeconds(def, lvl);
      setText(
        work,
        Number.isFinite(sec) ? t('station.panel.seconds', { sec: fmtSmall(sec, 1) }) : '–',
      );
      chips.set(inc, stageCap);
    } else if (def.area === 'order') {
      const sec = BALANCE.order.orderTime / getStationSpeed(def, lvl);
      setText(work, t('station.panel.seconds', { sec: fmtSmall(sec, 1) }));
      chips.set(stageCap, '');
    } else {
      setText(
        speed,
        t('station.panel.speedValue', { mult: fmtSmall(getStationSpeed(def, lvl), 2) }),
      );
      chips.set(stageCap, '');
    }
    const nextLook = nextStationLookLevel(lvl);
    look.el.hidden = lvl <= 0;
    look.set(nextLook, objectIcon(ref, nextLook ?? lvl));
    const next = nextMilestone(lvl);
    const isPrice = milestoneCounts(next).price > milestoneCounts(lvl).price;
    setText(
      milestone,
      t('station.panel.nextMilestone', {
        level: next,
        effect: t(
          isPrice && isLine ? 'station.panel.milestone.price' : 'station.panel.milestone.speed',
        ),
      }),
    );
    setText(
      staff,
      t('station.panel.staffCount', {
        count: getStaffLevel(loc, def.staffRole),
        role: roleName(def.staffRole),
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
  const img = h('img', { class: 'station-card-icon', alt: '', width: 64, height: 64 });
  // Nur Tische haben Optik-Stufen.
  const look = ambienceId === 'seats' ? lookRow('ambience-look') : null;
  const el = h(
    'div',
    { class: 'station-panel' },
    h(
      'div',
      { class: 'card station-card' },
      img,
      h('div', {}, h('h3', { text: name }), level),
      h(
        'div',
        { class: 'station-extra' },
        h('p', { class: 'muted', text: t(`ambience.${ambienceId}.desc`) }),
        look?.el ?? null,
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
        const src = spriteIconUrl(objectIcon(ref, lvl));
        if (img.getAttribute('src') !== src) img.src = src;
        if (look) {
          const nextLook = nextTableLookLevel(lvl);
          look.el.hidden = lvl <= 0;
          look.set(nextLook, objectIcon(ref, nextLook ?? lvl));
        }
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
