import { t } from '@i18n/index';
import { getLocation, type DayLedger, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates } from '@core/customers';
import { ledgerCosts, ledgerIncome, ledgerProfit } from '@core/economy/ledger';
import { D, type Decimal } from '@core/math/bignum';
import { setOpeningHours } from '@core/time/actions';
import { clampHours, dayOf, openHoursPerDay } from '@core/time/clock';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmtClock, fmtMoney, fmtSmall } from './format';
import { icon } from './icons';
import type { PanelContent } from './panel';
import { createPipelineCard } from './pipeline';

interface Bar {
  el: HTMLElement;
  set(value: Decimal, max: Decimal, text: string): void;
}

function bar(label: string, cls: string, testId: string): Bar {
  const fill = h('div', { class: 'stat-bar-fill' });
  const value = h('span', { class: 'stat-bar-value' });
  const el = h(
    'div',
    { class: `stat-bar ${cls}`, 'data-testid': testId },
    h('span', { text: label }),
    h('div', { class: 'stat-bar-track', 'aria-hidden': 'true' }, fill),
    value,
  );
  return {
    el,
    set(v, max, text) {
      const pct = max.gt(0) ? Math.min(100, v.div(max).toNumber() * 100) : 0;
      fill.style.width = `${pct.toFixed(1)}%`;
      setText(value, text);
    },
  };
}

type LedgerRow = keyof Omit<DayLedger, 'guests'>;
const INCOME_ROWS: LedgerRow[] = ['revenue', 'tips', 'bonus'];
const COST_ROWS: LedgerRow[] = ['wages', 'goods', 'matcha', 'rent', 'marketing', 'hiring'];

/** Tagesbilanz als Balken (Einnahmen periwinkle, Kosten blau) und große Pille (UI_STYLE § 3.9). */
function ledgerView(prefix: string): { el: HTMLElement; set(d: DayLedger | null): void } {
  const rows = [...INCOME_ROWS, ...COST_ROWS].map((k) => ({
    k,
    bar: bar(t(`ledger.${k}`), COST_ROWS.includes(k) ? 'stat-bar--cost' : '', `${prefix}-${k}`),
  }));
  const guests = h('p', { class: 'muted', 'data-testid': `${prefix}-guests` });
  const value = h('span');
  const pill = h(
    'div',
    { class: 'balance-pill', 'data-testid': `${prefix}-balance` },
    h('span', { text: t('stats.dayBalance') }),
    h('span', {}, icon('caret-right'), value),
  );
  const empty = h('p', { class: 'muted', text: t('ledger.none') });
  const el = h(
    'div',
    { class: 'ledger' },
    guests,
    h('div', { class: 'stat-bars' }, ...rows.map((r) => r.bar.el)),
    pill,
    empty,
  );
  return {
    el,
    set(d) {
      empty.hidden = d !== null;
      for (const c of [guests, pill, ...rows.map((r) => r.bar.el)]) c.hidden = d === null;
      if (!d) return;
      const max = [...INCOME_ROWS, ...COST_ROWS].reduce<Decimal>(
        (m, k) => (d[k].gt(m) ? d[k] : m),
        D(0),
      );
      for (const r of rows) {
        const v = d[r.k];
        r.bar.set(v, max, COST_ROWS.includes(r.k) ? `−${fmtMoney(v)}` : fmtMoney(v));
        r.bar.el.hidden = (COST_ROWS.includes(r.k) || r.k === 'bonus') && !v.gt(0.005);
      }
      setText(
        guests,
        t('ledger.guests', {
          count: Math.round(d.guests),
          income: fmtMoney(ledgerIncome(d)),
          costs: fmtMoney(ledgerCosts(d)),
          ticket: fmtMoney(d.guests > 0 ? d.revenue.div(d.guests) : 0),
        }),
      );
      const profit = ledgerProfit(d);
      const neg = profit.lt(0);
      setText(value, `${neg ? '' : '+'}${fmtMoney(profit)}`);
      pill.classList.toggle('neg', neg);
    },
  };
}

/**
 * Verwaltung → Betrieb (UI_STYLE § 3.9, Phase 3): Öffnungszeiten mit Nachfrage über den Tag (was eine Stunde länger
 * bringt und kostet), Tagesbilanz heute und gestern (Einnahmen, Löhne, Wareneinsatz, Matcha, Miete …) und die
 * Service-Pipeline der aktuellen Stunde.
 */
export function createStatsPanel(store: Store): PanelContent {
  const locId = store.getState().activeLocationId;

  // Öffnungszeiten: −/+ für Öffnen und Schließen.
  const hoursText = h('strong', { 'data-testid': 'hours-text' });
  const stepper = (testId: string, label: string, delta: { open?: number; close?: number }) => {
    const btn = h(
      'button',
      {
        class: 'btn-step',
        type: 'button',
        'data-testid': testId,
        'aria-label': label,
        title: label,
      },
      delta.open !== undefined ? (delta.open < 0 ? '−' : '+') : (delta.close ?? 0) < 0 ? '−' : '+',
    );
    on(btn, 'click', () =>
      store.dispatch((s) => {
        const hrs = getLocation(s, locId).hours;
        return setOpeningHours(s, locId, {
          open: hrs.open + (delta.open ?? 0),
          close: hrs.close + (delta.close ?? 0),
        });
      }),
    );
    return btn;
  };
  const openDec = stepper('hours-open-dec', t('hours.openEarlier'), { open: -1 });
  const openInc = stepper('hours-open-inc', t('hours.openLater'), { open: 1 });
  const closeDec = stepper('hours-close-dec', t('hours.closeEarlier'), { close: -1 });
  const closeInc = stepper('hours-close-inc', t('hours.closeLater'), { close: 1 });
  const openLabel = h('span', { class: 'hours-value', 'data-testid': 'hours-open' });
  const closeLabel = h('span', { class: 'hours-value', 'data-testid': 'hours-close' });
  const chart = h('div', { class: 'hour-chart', 'data-testid': 'hour-chart', role: 'img' });
  const columns = Array.from({ length: 24 }, (_, hour) => {
    const fill = h('span', { class: 'hour-bar-fill' });
    const col = h('span', { class: 'hour-bar' }, fill);
    chart.append(col);
    return { hour, col, fill };
  });
  const axis = h(
    'div',
    { class: 'hour-axis', 'aria-hidden': 'true' },
    ...[0, 6, 12, 18].map((hr) => h('span', { text: fmtClock(hr, 0) })),
  );
  const extend = h('p', { class: 'muted', 'data-testid': 'hours-extend' });
  const shorten = h('p', { class: 'muted', 'data-testid': 'hours-shorten' });

  const today = ledgerView('ledger-today');
  const todayTitle = h('h3', { class: 'section-title' });
  const yesterday = ledgerView('ledger-yesterday');
  const pipeline = createPipelineCard(locId, 'stats-pipeline');

  const el = h(
    'div',
    { class: 'stats-panel' },
    h('h3', { class: 'section-title', text: t('hours.title') }),
    h(
      'div',
      { class: 'card hours-card' },
      hoursText,
      h(
        'div',
        { class: 'hours-row' },
        h('span', { class: 'hours-label', text: t('hours.open') }),
        openDec,
        openLabel,
        openInc,
      ),
      h(
        'div',
        { class: 'hours-row' },
        h('span', { class: 'hours-label', text: t('hours.close') }),
        closeDec,
        closeLabel,
        closeInc,
      ),
      chart,
      axis,
      extend,
      shorten,
    ),
    todayTitle,
    today.el,
    h('h3', { class: 'section-title', text: t('ledger.yesterday') }),
    yesterday.el,
    pipeline.el,
  );

  // Die Tageskurve rechnet 24 Stunden: nur jede Sekunde neu.
  let chartAt = -Infinity;
  let chartKey = '';

  /** Was eine Stunde zusätzlich (oder weniger) bringt: Gäste, Umsatz, Kosten dieser Stunde. */
  const hourValue = (s: GameState, hour: number): { guests: number; profit: Decimal } => {
    const r = computeLocationRates(s, locId, { hour, forceOpen: true, influencerHype: false });
    const loc = getLocation(s, locId);
    const wages = computeLocationRates(s, locId, {
      hour: loc.hours.open,
      influencerHype: false,
    }).wagesPerHour;
    return { guests: r.served, profit: r.incomePerHour.sub(r.goodsPerHour).sub(wages) };
  };

  const view: View = {
    el,
    update(s: GameState) {
      const loc = getLocation(s, locId);
      const hrs = loc.hours;
      setText(
        hoursText,
        t('hours.now', {
          open: fmtClock(hrs.open, 0),
          close: fmtClock(hrs.close % 24, 0),
          hours: openHoursPerDay(hrs),
        }),
      );
      setText(openLabel, fmtClock(hrs.open, 0));
      setText(closeLabel, fmtClock(hrs.close % 24, 0));
      const same = (x: { open: number; close: number }): boolean =>
        x.open === hrs.open && x.close === hrs.close;
      setDisabled(openDec, same(clampHours({ ...hrs, open: hrs.open - 1 })));
      setDisabled(openInc, same(clampHours({ ...hrs, open: hrs.open + 1 })));
      setDisabled(closeDec, same(clampHours({ ...hrs, close: hrs.close - 1 })));
      setDisabled(closeInc, same(clampHours({ ...hrs, close: hrs.close + 1 })));

      const now = performance.now();
      const key = `${String(hrs.open)}-${String(hrs.close)}`;
      if (now - chartAt > 1000 || key !== chartKey) {
        chartAt = now;
        chartKey = key;
        const values = columns.map(
          (c) =>
            computeLocationRates(s, locId, { hour: c.hour, forceOpen: true, influencerHype: false })
              .spawnRate,
        );
        const max = Math.max(1e-9, ...values);
        columns.forEach((c, i) => {
          const v = values[i] ?? 0;
          c.fill.style.height = `${((100 * v) / max).toFixed(0)}%`;
          const isOpen = c.hour >= hrs.open && c.hour < hrs.close;
          c.col.classList.toggle('is-open', isOpen);
          c.col.title = t('hours.barLabel', { time: fmtClock(c.hour, 0), guests: fmtSmall(v, 0) });
        });
        chart.setAttribute(
          'aria-label',
          t('hours.chartLabel', {
            open: fmtClock(hrs.open, 0),
            close: fmtClock(hrs.close % 24, 0),
          }),
        );
        const later = hrs.close < 24 ? hourValue(s, hrs.close) : null;
        setText(
          extend,
          later
            ? t('hours.extend', {
                time: fmtClock((hrs.close + 1) % 24, 0),
                guests: fmtSmall(later.guests, 0),
                profit: `${later.profit.lt(0) ? '' : '+'}${fmtMoney(later.profit)}`,
              })
            : '',
        );
        extend.hidden = !later;
        const last = hourValue(s, hrs.close - 1);
        setText(
          shorten,
          t('hours.shorten', {
            time: fmtClock(hrs.close - 1, 0),
            guests: fmtSmall(last.guests, 0),
            profit: `${last.profit.lt(0) ? '' : '+'}${fmtMoney(last.profit)}`,
          }),
        );
      }

      setText(todayTitle, t('ledger.today', { day: dayOf(s.clock) + 1 }));
      today.set(loc.ledger.today);
      yesterday.set(loc.ledger.yesterday);
      pipeline.update(s);
    },
  };
  return { title: t('stats.title'), view };
}
