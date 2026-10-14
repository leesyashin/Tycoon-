import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates, type SatisfactionBreakdown } from '@core/customers';
import { cleanlinessRatePerMin } from '@core/staff';
import { h, setText, type View } from './dom';
import { fmtSigned, fmtSmall } from './format';
import type { PanelContent } from './panel';

type Part = keyof Omit<SatisfactionBreakdown, 'target'>;
const PARTS: Part[] = ['base', 'decor', 'quality', 'teaMaster', 'waitPressure', 'cleanliness'];

/** Zufriedenheits-Detail (GAME_DESIGN § 7.3): Einzelbeiträge zum Ziel, damit klar ist, was drückt und was hebt. */
export function createSatisfactionPanel(store: Store): PanelContent {
  const locId = store.getState().activeLocationId;
  const stat = (label: string, testId: string): [HTMLElement, HTMLElement] => {
    const value = h('dd', { 'data-testid': testId });
    return [h('div', { class: 'stat' }, h('dt', { text: label }), value), value];
  };
  const [curRow, cur] = stat(t('satisfaction.current'), 'sat-current');
  const [targetRow, target] = stat(t('satisfaction.target'), 'sat-target');
  const parts = PARTS.map((p) => {
    const value = h('span', { class: 'part-value', 'data-testid': `sat-part-${p}` });
    const label = h('span', {});
    const el = h('li', { class: 'part-row' }, label, value);
    return { p, el, label, value };
  });
  const spawn = h('li', { class: 'part-row' });
  const tips = h('li', { class: 'part-row' });
  const hint = h('p', { class: 'locked-hint', 'data-testid': 'sat-hint' });

  const el = h(
    'div',
    { class: 'satisfaction-panel' },
    h('dl', { class: 'stats' }, curRow, targetRow),
    h('p', { class: 'muted', text: t('satisfaction.moving') }),
    h('h3', { class: 'section-title', text: t('satisfaction.parts') }),
    h('ul', { class: 'part-list' }, ...parts.map((x) => x.el)),
    h('h3', { class: 'section-title', text: t('satisfaction.effects') }),
    h('ul', { class: 'part-list' }, spawn, tips),
    hint,
  );

  const update = (s: GameState): void => {
    const loc = getLocation(s, locId);
    const rates = computeLocationRates(s, locId);
    const b = rates.satisfaction;
    setText(cur, `${fmtSmall(loc.satisfaction, 0)} %`);
    setText(target, `${fmtSmall(b.target, 0)} %`);
    for (const x of parts) {
      const v = b[x.p];
      const extra =
        x.p === 'cleanliness'
          ? ` (${fmtSmall(loc.cleanliness, 0)} %, ${fmtSigned(cleanlinessRatePerMin(loc))}/min)`
          : '';
      setText(x.label, `${t(`satisfaction.part.${x.p}`)}${extra}`);
      setText(x.value, fmtSigned(v));
      x.el.classList.toggle('neg', v < 0);
      x.el.classList.toggle('pos', v > 0 && x.p !== 'base');
    }
    setText(spawn, t('satisfaction.effect.spawn', { value: fmtSmall(rates.satisfactionFactor) }));
    setText(tips, t('satisfaction.effect.tips', { value: fmtSmall(rates.tipRate * 100, 1) }));
    // Hinweis auf den stärksten negativen Beitrag.
    const worst = b.waitPressure <= b.cleanliness ? 'waitPressure' : 'cleanliness';
    setText(hint, b[worst] < 0 ? t(`satisfaction.hint.${worst}`) : t('satisfaction.hint.ok'));
  };
  const view: View = { el, update };
  return { title: t('satisfaction.title'), view };
}
