import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { getHypeProgress, getHypeRemaining, getIncomePerSec } from '@core/customers';
import { getBoostRemaining, isFreeBoostReady } from '@core/events';
import { BOOSTS } from '@data/leaves';
import { getCalendarEventDef } from '@data/events';
import { h, on, setText, type View } from './dom';
import { fmtTime } from './format';
import { fmt } from './format';
import { moodIcon } from './mood';

export interface HudActions {
  onSatisfaction(): void;
  /** „+“ am Blätter-Stand (UI_STYLE § 3.1). */
  openLeafShop(): void;
  /** Gratis-Boost über den `MonetizationProvider`. */
  claimFreeBoost(): void;
}

/** Boosts mit eigener Pille (Hype hat seinen Balken). */
const BOOST_PILLS = [BOOSTS.leaf, BOOSTS.free];

/** Kopfzeile: Standort, Münzen, Einkommen/s, Goldene Blätter, Zufriedenheit, Boosts, Hype. Nur lesend. */
export function createHud(actions: HudActions): View {
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
  // Zufriedenheit ist antippbar und öffnet das Detail (was drückt, was hebt).
  const satValue = h('span');
  const satIcon = h('span', { 'aria-hidden': 'true', text: '😊 ' });
  const satisfaction = {
    el: h(
      'button',
      {
        class: 'hud-stat hud-stat-btn ui-interactive',
        type: 'button',
        'data-testid': 'hud-satisfaction',
        'aria-label': t('hud.satisfactionOpen'),
      },
      satIcon,
      satValue,
      h('span', { 'aria-hidden': 'true', class: 'hud-more', text: ' ›' }),
    ),
    value: satValue,
  };
  on(satisfaction.el, 'click', () => actions.onSatisfaction());
  const leafShop = h('button', {
    class: 'hud-plus ui-interactive',
    type: 'button',
    'data-testid': 'hud-leaf-shop',
    'aria-label': t('hud.leafShop'),
    text: '+',
  });
  on(leafShop, 'click', () => actions.openLeafShop());
  leaves.el.append(leafShop);

  // Boost-Pillen mit Restzeit (UI_STYLE § 3.2/3.5); der Gratis-Boost erscheint als Knopf, wenn er bereit ist.
  const pills = BOOST_PILLS.map((def) => {
    const text = h('span');
    const el = h(
      'span',
      { class: 'boost-pill', 'data-testid': `hud-boost-${def.id}` },
      h('span', { 'aria-hidden': 'true', text: '💰 ' }),
      text,
    );
    el.hidden = true;
    return { def, el, text };
  });
  const freeBoost = h('button', {
    class: 'boost-pill boost-pill-ready ui-interactive',
    type: 'button',
    'data-testid': 'hud-free-boost',
  });
  on(freeBoost, 'click', () => actions.claimFreeBoost());
  const calendar = h('span', {
    class: 'boost-pill boost-pill-calendar',
    'data-testid': 'hud-calendar',
  });
  const boosts = h(
    'div',
    { class: 'hud-row hud-boosts', 'data-testid': 'hud-boosts' },
    ...pills.map((p) => p.el),
    calendar,
    freeBoost,
  );
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
    boosts,
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
      setText(satIcon, `${moodIcon(loc.satisfaction)} `);
      for (const p of pills) {
        const rest = getBoostRemaining(s, p.def.id);
        p.el.hidden = rest <= 0;
        if (rest > 0) {
          setText(
            p.text,
            t(`hud.boost.${p.def.id}`, { mult: p.def.incomeMult, time: fmtTime(Math.ceil(rest)) }),
          );
        }
      }
      const ready = isFreeBoostReady(s);
      freeBoost.hidden = !ready;
      setText(freeBoost, t('hud.freeBoost', { mult: BOOSTS.free.incomeMult }));
      const cal = s.calendarEvents
        .map((id) => `${getCalendarEventDef(id)?.icon ?? ''} ${t(`event.${id}.name`)}`)
        .join(' · ');
      setText(calendar, cal);
      calendar.hidden = cal === '';
      boosts.hidden = pills.every((p) => p.el.hidden) && !ready && cal === '';
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
