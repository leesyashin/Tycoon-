import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { getIncomePerSec, mood } from '@core/customers';
import { getBoostRemaining, isFreeBoostReady } from '@core/events';
import { getCafeClock } from '@core/time/dayCycle';
import { BOOSTS } from '@data/leaves';
import { getCalendarEventDef } from '@data/events';
import { QUALITY_TIERS } from '@data/quality';
import { h, on, setText, type View } from './dom';
import { icon, setIcon, type IconName } from './icons';
import { fmt, fmtClock, fmtTime } from './format';

export interface HudActions {
  onSatisfaction(): void;
  /** „+“ am Blätter-Stand (UI_STYLE § 3.1). */
  openLeafShop(): void;
  /** Gratis-Boost über den `MonetizationProvider`. */
  claimFreeBoost(): void;
  /** Qualitäts-Pille → Shop-Tab „Qualität“ (§ 3.3). */
  openQuality(): void;
}

/** Boosts mit eigener Pille (Hype hat seine Pille in der Bottom-Bar). */
const BOOST_PILLS = [BOOSTS.leaf, BOOSTS.free];
/** Sauberkeit erscheint im HUD erst unter diesem Wert (§ 3.2). */
const CLEANLINESS_HINT_BELOW = 70;
const MOOD_ICON: Record<string, IconName> = {
  happy: 'smiley',
  neutral: 'smiley-meh',
  sad: 'smiley-sad',
};

/**
 * HUD oben (UI_STYLE § 3.1–3.3): Währungs-Pille, Status-Pille (Uhr, Einkommen, Standort, Zufriedenheit,
 * Boosts), Qualitäts-Pille rechts. Nur lesend; Handlungen laufen über `actions`.
 */
export function createHud(actions: HudActions): View {
  // Icons sind dekorativ; Screenreader bekommen den Namen als versteckten Text.
  const currency = (testId: string, label: string, name: IconName, cls: string) => {
    const value = h('span');
    const el = h(
      'span',
      { class: 'hud-currency', 'data-testid': testId },
      h('span', { class: 'sr-only', text: label }),
      icon(name, cls),
      value,
    );
    return { el, value };
  };
  const coins = currency('hud-coins', t('hud.coins'), 'coffee', 'icon-coin');
  const leaves = currency('hud-leaves', t('hud.goldenLeaves'), 'leaf', 'icon-leaf');
  const leafShop = h(
    'button',
    {
      class: 'hud-plus ui-interactive',
      type: 'button',
      'data-testid': 'hud-leaf-shop',
      'aria-label': t('hud.leafShop'),
      title: t('hud.leafShop'),
    },
    icon('plus'),
  );
  on(leafShop, 'click', () => actions.openLeafShop());
  const pill = h('div', { class: 'hud-pill' }, coins.el, leaves.el, leafShop);

  const clock = h('span', { 'data-testid': 'hud-clock' });
  const income = h('span', { class: 'hud-income', 'data-testid': 'hud-income' });
  const location = h('span', { class: 'hud-location', 'data-testid': 'hud-location' });
  const status = h(
    'div',
    { class: 'status-pill' },
    icon('clock'),
    clock,
    h('span', { 'aria-hidden': 'true', class: 'muted', text: '·' }),
    income,
    location,
  );

  // Zufriedenheit ist antippbar und öffnet das Detail (was drückt, was hebt).
  const satValue = h('span');
  const satIcon = icon('smiley');
  const satisfaction = h(
    'button',
    {
      class: 'chip ui-interactive',
      type: 'button',
      'data-testid': 'hud-satisfaction',
      'aria-label': t('hud.satisfactionOpen'),
      title: t('hud.satisfaction'),
    },
    satIcon,
    satValue,
  );
  on(satisfaction, 'click', () => actions.onSatisfaction());
  const cleanValue = h('span');
  const cleanliness = h(
    'span',
    { class: 'chip chip-warn', 'data-testid': 'hud-cleanliness', title: t('hud.cleanliness') },
    h('span', { class: 'sr-only', text: t('hud.cleanliness') }),
    icon('broom'),
    cleanValue,
  );

  // Boost-Pillen mit Restzeit (§ 3.2/3.5); der Gratis-Boost erscheint als Knopf, wenn er bereit ist.
  const pills = BOOST_PILLS.map((def) => {
    const text = h('span');
    const el = h(
      'span',
      { class: 'boost-pill', 'data-testid': `hud-boost-${def.id}` },
      icon('lightning'),
      text,
    );
    el.hidden = true;
    return { def, el, text };
  });
  const freeText = h('span');
  const freeBoost = h(
    'button',
    {
      class: 'boost-pill boost-pill-ready ui-interactive',
      type: 'button',
      'data-testid': 'hud-free-boost',
    },
    icon('gift'),
    freeText,
  );
  on(freeBoost, 'click', () => actions.claimFreeBoost());
  const calendar = h('span', {
    class: 'boost-pill boost-pill-calendar',
    'data-testid': 'hud-calendar',
  });
  const boosts = h(
    'div',
    { class: 'hud-boosts', 'data-testid': 'hud-boosts' },
    ...pills.map((p) => p.el),
    calendar,
    freeBoost,
  );

  const qualityIcons = QUALITY_TIERS.map(() => icon('leaf'));
  const quality = h(
    'button',
    { class: 'quality-pill ui-interactive', type: 'button', 'data-testid': 'hud-quality' },
    ...qualityIcons,
  );
  on(quality, 'click', () => actions.openQuality());

  const el = h(
    'div',
    { class: 'hud', 'data-testid': 'hud' },
    pill,
    status,
    h('div', { class: 'status-row' }, satisfaction, cleanliness),
    boosts,
  );
  if (import.meta.env.DEV) el.append(h('div', { class: 'hud-hint', text: t('scene.debugHint') }));
  const root = h('div', { class: 'hud-root' }, el, quality);

  return {
    el: root,
    update(s: GameState) {
      const loc = getLocation(s, s.activeLocationId);
      setText(
        location,
        `${t(`location.${s.activeLocationId}.name`)} · ${t('hud.cafeLevel', { level: loc.level })}`,
      );
      const c = getCafeClock(s.playtimeSec);
      setText(clock, fmtClock(c.hour, c.minute));
      setText(coins.value, fmt(s, loc.coins));
      setText(income, `+${fmt(s, getIncomePerSec(s, s.activeLocationId))} ${t('hud.income')}`);
      setText(leaves.value, fmt(s, s.meta.goldenLeaves));
      setText(satValue, `${String(Math.round(loc.satisfaction))} %`);
      setIcon(satIcon, MOOD_ICON[mood(loc.satisfaction)] ?? 'smiley');
      cleanliness.hidden = loc.cleanliness >= CLEANLINESS_HINT_BELOW;
      setText(cleanValue, `${String(Math.round(loc.cleanliness))} %`);
      qualityIcons.forEach((ic, i) => ic.classList.toggle('on', i < loc.quality));
      const qName = t(`quality.tier.${String(loc.quality)}.name`);
      quality.setAttribute('aria-label', t('hud.qualityOpen', { name: qName }));
      quality.title = qName;
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
      setText(freeText, t('hud.freeBoost', { mult: BOOSTS.free.incomeMult }));
      const cal = s.calendarEvents
        .map((id) => `${getCalendarEventDef(id)?.icon ?? ''} ${t(`event.${id}.name`)}`)
        .join(' · ');
      setText(calendar, cal);
      calendar.hidden = cal === '';
      boosts.hidden = pills.every((p) => p.el.hidden) && !ready && cal === '';
    },
  };
}
