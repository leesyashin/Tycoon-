import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates } from '@core/customers';
import { D, type Decimal } from '@core/math/bignum';
import { STATIONS } from '@data/stations';
import { DAY_CYCLE } from '@data/ui';
import { h, setText, type View } from './dom';
import { fmt } from './format';
import { icon } from './icons';
import type { PanelContent } from './panel';
import { stationName } from './labels';
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

/**
 * Verwaltung → Statistik (UI_STYLE § 3.9): Einnahmen je Station und Trinkgeld pro Café-Tag als Balken,
 * Auslastung, Tagesbilanz als große Pille. Laufende Kosten gibt es im Design nicht (siehe STATUS „Offen“).
 */
export function createStatsPanel(store: Store): PanelContent {
  const locId = store.getState().activeLocationId;
  const sellers = STATIONS.filter((d) => d.basePrice > 0);
  const pipeline = createPipelineCard(locId, 'stats-pipeline');
  const bars = sellers.map((d) => ({
    id: d.id,
    bar: bar(stationName(locId, d.id), '', `stat-bar-${d.id}`),
  }));
  const tips = bar(t('stats.tips'), '', 'stat-bar-tips');
  const util = bar(t('stats.utilization'), 'util-bar', 'stat-bar-utilization');
  const balanceValue = h('span');
  const balance = h(
    'div',
    { class: 'balance-pill', 'data-testid': 'stats-balance' },
    h('span', { text: t('stats.dayBalance') }),
    h('span', {}, icon('caret-right'), balanceValue),
  );
  const el = h(
    'div',
    { class: 'stats-panel' },
    h('h3', { class: 'section-title', text: t('stats.incomeTitle') }),
    h('div', { class: 'stat-bars' }, ...bars.map((b) => b.bar.el), tips.el),
    h('h3', { class: 'section-title', text: t('stats.capacityTitle') }),
    h('div', { class: 'stat-bars' }, util.el),
    h('h3', { class: 'section-title', text: t('stats.pipelineTitle') }),
    pipeline.el,
    balance,
  );
  const view: View = {
    el,
    update(s: GameState) {
      const r = computeLocationRates(s, locId);
      const day = DAY_CYCLE.dayLengthSec;
      // Trinkgeld steckt als Faktor (1 + tips) im Preis; hier getrennt ausgewiesen.
      const base = (v: Decimal): Decimal => v.div(1 + r.tipRate).mul(day);
      const values = bars.map((b) => base(r.perStationIncome[b.id] ?? D(0)));
      const tipValue = r.incomePerSec.mul(day).sub(base(r.incomePerSec));
      const max = [...values, tipValue].reduce((a, b) => (b.gt(a) ? b : a), D(0));
      bars.forEach((b, i) => {
        const v = values[i] ?? D(0);
        b.bar.set(v, max, fmt(s, v));
        const unlocked = (getLocation(s, locId).stations[b.id]?.level ?? 0) > 0;
        b.bar.el.hidden = !unlocked;
      });
      tips.set(tipValue, max, fmt(s, tipValue));
      const pct = r.totalThroughput > 0 ? (r.served / r.totalThroughput) * 100 : 0;
      util.set(D(pct), D(100), `${pct.toFixed(0)} %`);
      setText(balanceValue, `+${fmt(s, r.incomePerSec.mul(day))}`);
      pipeline.update(s);
    },
  };
  return { title: t('stats.title'), view };
}
