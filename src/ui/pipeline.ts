import { t } from '@i18n/index';
import type { GameState } from '@core/GameState';
import { STAGES, computeLocationRates, type LocationRates, type StageId } from '@core/customers';
import { peakRates } from '@core/staff';
import { h, setText, type View } from './dom';
import { fmtSmall } from './format';
import { stageName } from './labels';

/**
 * Pipeline-Karte (GAME_DESIGN § 7.2, UI_STYLE § 3.9): vier Balken – Nachfrage, Bestellung, Zubereitung,
 * Tischservice – als Gäste pro Spielstunde; Bestellung oder Zubereitung können der Engpass sein und werden
 * markiert (ohne Bedienung holen Gäste an der Theke ab). Darunter ein Hinweis, was hilft. Mit `peak` zur Hauptzeit
 * gerechnet (Personal-Panel), sonst zur aktuellen Stunde.
 */
export function createPipelineCard(locId: string, testId = 'pipeline', peak = false): View {
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
    h(
      'div',
      { class: 'pipeline-head' },
      h('h3', { text: t(peak ? 'pipeline.titlePeak' : 'pipeline.title') }),
      bottleneck,
    ),
    h('div', { class: 'stat-bars' }, ...rows.map((r) => r.el)),
    served,
    hint,
  );
  let shown = '';
  const apply = (r: LocationRates): void => {
    const max = Math.max(1e-9, ...STAGES.map((s) => r.stages[s]));
    const key = `${r.bottleneck}:${String(r.open)}:${STAGES.map((s) => r.stages[s].toFixed(2)).join(',')}:${r.served.toFixed(2)}`;
    if (key === shown) return;
    shown = key;
    for (const row of rows) {
      const cap = r.stages[row.stage];
      row.fill.style.width = `${((100 * cap) / max).toFixed(1)}%`;
      setText(row.value, t('pipeline.capacity', { amount: fmtSmall(cap, 0) }));
      // Nachfrage als „Engpass“ heißt: alles läuft – kein roter Balken, sondern grün.
      row.el.classList.toggle(
        'is-bottleneck',
        row.stage === r.bottleneck && r.bottleneck !== 'demand',
      );
      row.el.classList.toggle('is-ok', row.stage === 'demand' && r.bottleneck === 'demand');
    }
    setText(
      served,
      r.open
        ? t('pipeline.served', {
            amount: fmtSmall(r.served, 0),
            pct: fmtSmall(r.tableServiceShare * 100, 0),
          })
        : t('pipeline.closed'),
    );
    setText(bottleneck, t('pipeline.bottleneck', { stage: stageName(r.bottleneck) }));
    bottleneck.classList.toggle('pipeline-chip--ok', r.bottleneck === 'demand');
    setText(hint, t(`pipeline.hint.${r.bottleneck}`));
  };
  return {
    el,
    update(s: GameState) {
      apply(peak ? peakRates(s, locId) : computeLocationRates(s, locId));
    },
  };
}

/** Prozentuale Auslastung einer Stufe (bedient ÷ Kapazität), 0 ohne Kapazität. */
export function stageLoadPct(r: LocationRates, stage: StageId): number {
  const cap = r.stages[stage];
  return cap > 0 ? Math.min(100, (100 * r.served) / cap) : 0;
}
