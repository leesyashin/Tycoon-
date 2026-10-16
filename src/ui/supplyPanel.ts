import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import {
  canOrderMatcha,
  dailyMatchaNeed,
  getOrderCost,
  gradeInUse,
  isGradeUnlocked,
  orderMatcha,
  setAutoReorder,
  setServedGrade,
  totalStock,
} from '@core/supply';
import { getCafeClock } from '@core/time/dayCycle';
import { DELIVERY, MATCHA_GRADES, MATCHA_PACKAGES, getGradeDef } from '@data/matcha';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmtClock, fmtGrams, fmtMoney, fmtSmall } from './format';
import { gradeName } from './labels';
import type { PanelContent } from './panel';

/** Wirkung einer Sorte in einer Zeile: Preis, Nachfrage, Zufriedenheit. */
function gradeEffect(grade: number): string {
  const g = getGradeDef(grade);
  return t('supply.gradeEffect', {
    price: fmtSmall(g.priceMult, 2),
    demand: fmtSmall(g.demandMult, 2),
    sat: g.satisfaction,
  });
}

/**
 * Einkauf (GAME_DESIGN § 8, Phase 3): Matcha-Lager mit Vorrat je Sorte und Reichweite, Sorte im Ausschank wählen,
 * beim Lieferanten bestellen (Sorte, Packung, Express), Lieferungen unterwegs, automatische Nachbestellung.
 */
export function createSupplyPanel(store: Store): PanelContent {
  const locId = store.getState().activeLocationId;
  let picked = getLocation(store.getState(), locId).supply.grade;
  let express = false;

  const inUse = h('strong', { 'data-testid': 'supply-in-use' });
  const stock = h('p', { class: 'supply-stock', 'data-testid': 'supply-stock' });
  const reach = h('p', { class: 'muted', 'data-testid': 'supply-days' });
  const outHint = h('p', { class: 'locked-hint', 'data-testid': 'supply-out' });

  // Sorten: Vorrat, Wirkung, „Ausschenken“ und Auswahl für die Bestellung.
  const gradeRows = MATCHA_GRADES.map((g) => {
    const name = h('strong', { text: gradeName(g.grade) });
    const info = h('span', { class: 'muted' });
    const have = h('span', { class: 'row-status' });
    const pick = h('button', {
      class: 'btn btn-row',
      type: 'button',
      'data-testid': `supply-grade-${String(g.grade)}`,
    });
    on(pick, 'click', () => {
      picked = g.grade;
      view.update(store.getState());
    });
    const serve = h('button', {
      class: 'btn btn-row',
      type: 'button',
      'data-testid': `supply-serve-${String(g.grade)}`,
    });
    on(serve, 'click', () => store.dispatch((s) => setServedGrade(s, locId, g.grade)));
    const el = h(
      'li',
      { class: 'shop-row shop-row-stack grade-row' },
      h('div', { class: 'row-text' }, name, info, have),
      h('div', { class: 'btn-row-group' }, pick, serve),
    );
    return { g, el, info, have, pick, serve };
  });

  const orderTitle = h('h3', { class: 'section-title' });
  const packages = MATCHA_PACKAGES.map((p, i) => {
    const label = h('span', { class: 'buy-amount', text: fmtGrams(p.grams) });
    const cost = h('span', { class: 'buy-cost' });
    const btn = h(
      'button',
      { class: 'btn btn-buy', type: 'button', 'data-testid': `supply-order-${String(i)}` },
      label,
      cost,
    );
    on(btn, 'click', () => store.dispatch((s) => orderMatcha(s, locId, picked, i, express)));
    return { i, btn, cost };
  });
  const expressInput = h('input', {
    type: 'checkbox',
    id: 'supply-express',
    'data-testid': 'supply-express',
  });
  on(expressInput, 'change', () => {
    express = expressInput.checked;
    view.update(store.getState());
  });
  const expressLabel = h('label', { for: 'supply-express' });
  const delivery = h('p', { class: 'muted', 'data-testid': 'supply-delivery' });
  const ordersList = h('ul', { class: 'part-list', 'data-testid': 'supply-orders' });
  const ordersEmpty = h('p', { class: 'muted', text: t('supply.ordersNone') });

  const autoInput = h('input', {
    type: 'checkbox',
    id: 'supply-auto',
    'data-testid': 'supply-auto',
  });
  on(autoInput, 'change', () => store.dispatch((s) => setAutoReorder(s, locId, autoInput.checked)));
  const autoSelect = h('select', {
    'data-testid': 'supply-auto-package',
    'aria-label': t('supply.autoPackage'),
  });
  for (const [i, p] of MATCHA_PACKAGES.entries())
    autoSelect.append(h('option', { value: String(i), text: fmtGrams(p.grams) }));
  on(autoSelect, 'change', () =>
    store.dispatch((s) =>
      setAutoReorder(s, locId, getLocation(s, locId).supply.autoReorder, Number(autoSelect.value)),
    ),
  );
  const autoHint = h('p', { class: 'muted' });
  const autoFail = h('p', { class: 'locked-hint', 'data-testid': 'supply-auto-failed' });

  const el = h(
    'div',
    { class: 'supply-panel' },
    h('div', { class: 'card supply-card' }, h('p', {}, inUse), stock, reach, outHint),
    h('h3', { class: 'section-title', text: t('supply.grades') }),
    h('ul', { class: 'shop-list' }, ...gradeRows.map((r) => r.el)),
    orderTitle,
    h(
      'div',
      { class: 'card supply-order' },
      h('div', { class: 'buy-row' }, ...packages.map((p) => p.btn)),
      h('div', { class: 'field field-check' }, expressInput, expressLabel),
      delivery,
    ),
    h('h3', { class: 'section-title', text: t('supply.orders') }),
    ordersList,
    ordersEmpty,
    h('h3', { class: 'section-title', text: t('supply.autoTitle') }),
    h(
      'div',
      { class: 'card supply-auto' },
      h(
        'div',
        { class: 'field field-check' },
        autoInput,
        h('label', { for: 'supply-auto', text: t('supply.auto') }),
      ),
      h('div', { class: 'field' }, h('span', { text: t('supply.autoPackage') }), autoSelect),
      autoHint,
      autoFail,
    ),
  );

  // Verbrauch je Tag rechnet über alle Stunden: nicht bei jedem Update.
  let needAt = -Infinity;
  let need = 0;
  let ordersKey = '';

  const view: View = {
    el,
    update(s: GameState) {
      const loc = getLocation(s, locId);
      const sup = loc.supply;
      const now = performance.now();
      if (now - needAt > 1000) {
        needAt = now;
        need = dailyMatchaNeed(s, locId);
      }
      const g = gradeInUse(sup);
      setText(inUse, g < 0 ? t('supply.inUseNone') : t('supply.inUse', { name: gradeName(g) }));
      const total = totalStock(sup);
      setText(stock, t('supply.stockTotal', { amount: fmtGrams(total) }));
      setText(
        reach,
        need > 0
          ? t('supply.reach', { days: fmtSmall(total / need, 1), need: fmtGrams(need) })
          : t('supply.reachNone'),
      );
      setText(outHint, g < 0 ? t('supply.outHint') : '');
      outHint.hidden = g >= 0;

      if (!isGradeUnlocked(loc, picked)) picked = sup.grade;
      for (const r of gradeRows) {
        const unlocked = isGradeUnlocked(loc, r.g.grade);
        const grams = sup.stock[r.g.grade] ?? 0;
        r.el.classList.toggle('locked', !unlocked);
        r.el.classList.toggle('affordable', r.g.grade === picked);
        r.el.classList.toggle('is-serving', r.g.grade === g);
        setText(
          r.info,
          unlocked
            ? `${gradeEffect(r.g.grade)} · ${t('supply.perKg', { cost: fmtMoney(getOrderCost(s, locId, r.g.grade, 1, false)) })}`
            : t('ui.unlockAt', { level: r.g.unlockCafeLevel }),
        );
        setText(
          r.have,
          r.g.grade === g
            ? t('supply.haveServing', { amount: fmtGrams(grams) })
            : t('supply.have', { amount: fmtGrams(grams) }),
        );
        r.have.hidden = !unlocked && grams <= 0;
        setText(r.pick, r.g.grade === picked ? t('supply.picked') : t('supply.pick'));
        setDisabled(r.pick, !unlocked || r.g.grade === picked);
        setText(r.serve, sup.grade === r.g.grade ? t('supply.serving') : t('supply.serve'));
        setDisabled(r.serve, !unlocked || sup.grade === r.g.grade);
        r.serve.setAttribute('aria-label', `${gradeName(r.g.grade)}: ${r.serve.textContent ?? ''}`);
        r.pick.setAttribute('aria-label', `${gradeName(r.g.grade)}: ${r.pick.textContent ?? ''}`);
      }

      setText(orderTitle, t('supply.orderTitle', { name: gradeName(picked) }));
      for (const p of packages) {
        const cost = getOrderCost(s, locId, picked, p.i, express);
        setText(p.cost, fmtMoney(cost));
        setDisabled(p.btn, !canOrderMatcha(s, locId, picked, p.i, express));
        p.btn.setAttribute(
          'aria-label',
          t('supply.orderAria', {
            amount: fmtGrams(MATCHA_PACKAGES[p.i]?.grams ?? 0),
            name: gradeName(picked),
            cost: fmtMoney(cost),
          }),
        );
      }
      if (expressInput.checked !== express) expressInput.checked = express;
      setText(expressLabel, t('supply.express', { hours: DELIVERY.expressHours }));
      setText(
        delivery,
        sup.orders.length >= DELIVERY.maxOrders
          ? t('supply.tooMany', { max: DELIVERY.maxOrders })
          : express
            ? t('supply.deliveryExpress', { hours: DELIVERY.expressHours })
            : t('supply.deliveryStandard', { time: fmtClock(DELIVERY.standardHour, 0) }),
      );

      const key = sup.orders
        .map((o) => `${String(o.grade)}:${String(o.grams)}:${String(o.arriveAt)}`)
        .join('|');
      if (key !== ordersKey) {
        ordersKey = key;
        ordersList.replaceChildren(
          ...sup.orders.map((o) => {
            const c = getCafeClock(o.arriveAt);
            return h('li', {
              class: 'part-row',
              text: t('supply.orderLine', {
                amount: fmtGrams(o.grams),
                name: gradeName(o.grade),
                day: c.day + 1,
                time: fmtClock(c.hour, c.minute),
              }),
            });
          }),
        );
      }
      ordersEmpty.hidden = sup.orders.length > 0;

      if (autoInput.checked !== sup.autoReorder) autoInput.checked = sup.autoReorder;
      if (autoSelect.value !== String(sup.autoPackage)) autoSelect.value = String(sup.autoPackage);
      setText(
        autoHint,
        t('supply.autoHint', {
          name: gradeName(sup.grade),
          days: fmtSmall(DELIVERY.reorderDays, 1),
        }),
      );
      setText(autoFail, sup.reorderFailed ? t('supply.autoFailed') : '');
      autoFail.hidden = !sup.reorderFailed;
    },
  };
  return { title: t('supply.title'), view };
}
