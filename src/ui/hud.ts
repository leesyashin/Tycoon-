import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { getHypeProgress, getHypeRemaining, getIncomePerSec } from '@core/customers';
import { h, setText, type View } from './dom';
import { fmt } from './format';

/** Kopfzeile: Standort, Münzen, Einkommen/s, Goldene Blätter, Zufriedenheit, Hype. Nur lesend. */
export function createHud(): View {
  const location = h('div', { class: 'hud-location', 'data-testid': 'hud-location' });
  // Icons sind dekorativ; Screenreader bekommen den Namen als versteckten Text.
  const stat = (cls: string, testId: string, label: string, icon: string, visibleLabel = false) => {
    const value = h('span');
    const el = h(
      'div',
      { class: cls, 'data-testid': testId },
      h('span', { class: visibleLabel ? 'hud-label' : 'sr-only', text: label }),
      h('span', { 'aria-hidden': 'true', text: `${icon} ` }),
      value,
    );
    return { el, value };
  };
  const coins = stat('hud-coins', 'hud-coins', t('hud.coins'), '🪙', true);
  const income = h('div', { class: 'hud-income', 'data-testid': 'hud-income' });
  const leaves = stat('hud-stat', 'hud-leaves', t('hud.goldenLeaves'), '🍃');
  const satisfaction = stat('hud-stat', 'hud-satisfaction', t('hud.satisfaction'), '😊');
  const fill = h('div', { class: 'hud-hype-fill' });
  const hypeLabel = h('span');
  const hype = h(
    'div',
    {
      class: 'hud-hype',
      role: 'progressbar',
      'aria-label': t('hud.hype'),
      'aria-valuemin': 0,
      'aria-valuemax': 100,
    },
    fill,
    hypeLabel,
  );
  const el = h(
    'div',
    { class: 'hud', 'data-testid': 'hud' },
    h('div', { class: 'hud-row' }, location),
    h('div', { class: 'hud-row hud-main' }, coins.el, income),
    h('div', { class: 'hud-row' }, leaves.el, satisfaction.el),
    hype,
  );
  if (import.meta.env.DEV) el.append(h('div', { class: 'hud-hint', text: t('scene.debugHint') }));

  return {
    el,
    update(s: GameState) {
      const loc = getLocation(s, s.activeLocationId);
      setText(
        location,
        `${t(`location.${s.activeLocationId}.name`)} · ${t('hud.cafeLevel', { level: loc.level })}`,
      );
      setText(coins.value, fmt(s, loc.coins));
      setText(income, `+${fmt(s, getIncomePerSec(s, s.activeLocationId))} ${t('hud.income')}`);
      setText(leaves.value, fmt(s, s.meta.goldenLeaves));
      setText(satisfaction.value, `${String(Math.round(loc.satisfaction))} %`);
      const remaining = getHypeRemaining(s);
      const active = remaining > 0;
      const pct = Math.round((active ? 1 : getHypeProgress(s)) * 100);
      fill.style.width = `${String(pct)}%`;
      hype.setAttribute('aria-valuenow', String(pct));
      hype.classList.toggle('active', active);
      setText(
        hypeLabel,
        active ? t('hud.hypeActive', { sec: Math.ceil(remaining) }) : t('hud.hype'),
      );
    },
  };
}
