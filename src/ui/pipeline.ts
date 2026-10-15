import { t } from '@i18n/index';
import type { GameState } from '@core/GameState';
import { STAGES, computeLocationRates, type LocationRates, type StageId } from '@core/customers';
import { h, setText, type View } from './dom';
import { fmtSmall } from './format';
import { stageName } from './labels';

/**
 * Pipeline-Karte (GAME_DESIGN § 7.2, UI_STYLE § 3.9): vier Balken – Nachfrage, Bestellung, Zubereitung,
 * Ausgabe – als Kapazität in Gästen/s, die kleinste Stufe ist der Engpass und wird markiert. Darunter ein
 * Hinweis, was gegen den Engpass hilft. Wird im Personal-Panel und in der Statistik gezeigt.
 */
export function createPipelineCard(locId: string, testId = 'pipeline'): View {
  const rows = STAGES.map((stage) => {
    const fill = h('div', { class: 'stat-bar-fill' });
    const value = h('span', { class: 'stat-bar-value' });
    const label = h('span', { text: stageName(stage) });
    const el = h(
      'div',
      { class: 'stat-bar pipeline-row', 'data-testid': `${testId}-${stage}` },
      label,
      h('div', { class: 'stat-bar-track', 'aria-hidden': 'true' }, fill),
      value,
    );
    return { stage, el, fill, value };
  });
  const served = h('p', { class: 'pipeline-served', 'data-testid': `${testId}-served` });
  const bottleneck = h('span', {
    class: 'chip pipeline-chip',
    'data-testid': `${testId}-bottleneck`,
  });
  const hint = h('p', { class: 'muted pipeline-hint', 'data-testid': `${testId}-hint` });
  const el = h(
    'div',
    { class: 'card pipeline', 'data-testid': testId },
    h('div', { class: 'pipeline-head' }, h('h3', { text: t('pipeline.title') }), bottleneck),
    h('div', { class: 'stat-bars' }, ...rows.map((r) => r.el)),
    served,
    hint,
  );
  let shown = '';
  const apply = (r: LocationRates): void => {
    const max = Math.max(1e-9, ...STAGES.map((s) => r.stages[s]));
    const key = `${r.bottleneck}:${STAGES.map((s) => r.stages[s].toFixed(3)).join(',')}:${r.served.toFixed(3)}`;
    if (key === shown) return;
    shown = key;
    for (const row of rows) {
      const cap = r.stages[row.stage];
      row.fill.style.width = `${((100 * cap) / max).toFixed(1)}%`;
      setText(row.value, t('pipeline.capacity', { amount: fmtSmall(cap, 2) }));
      row.el.classList.toggle('is-bottleneck', row.stage === r.bottleneck);
    }
    setText(served, t('pipeline.served', { amount: fmtSmall(r.served, 2) }));
    setText(bottleneck, t('pipeline.bottleneck', { stage: stageName(r.bottleneck) }));
    bottleneck.classList.toggle('pipeline-chip--ok', r.bottleneck === 'demand');
    setText(hint, t(`pipeline.hint.${r.bottleneck}`));
  };
  return {
    el,
    update(s: GameState) {
      apply(computeLocationRates(s, locId));
    },
  };
}

/** Prozentuale Auslastung einer Stufe (bedient ÷ Kapazität), 0 ohne Kapazität. */
export function stageLoadPct(r: LocationRates, stage: StageId): number {
  const cap = r.stages[stage];
  return cap > 0 ? Math.min(100, (100 * r.served) / cap) : 0;
}
