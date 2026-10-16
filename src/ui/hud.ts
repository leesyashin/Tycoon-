import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { computeLocationRates, mood } from '@core/customers';
import { getBoostRemaining, isFreeBoostReady } from '@core/events';
import { getCafeClock } from '@core/time/dayCycle';
import { isOpenAt, nextOpeningAt } from '@core/time/clock';
import { gradeInUse, stockDays } from '@core/supply';
import { ledgerProfit } from '@core/economy/ledger';
import { BOOSTS } from '@data/leaves';
import { getCalendarEventDef } from '@data/events';
import { MAX_GRADE } from '@data/matcha';
import { h, on, setText, type View } from './dom';
import { icon, setIcon, type IconName } from './icons';
import { fmt, fmtClock, fmtMoney, fmtSmall, fmtTime } from './format';
import { gradeName, stageName } from './labels';

export interface HudActions {
  onSatisfaction(): void;
  /** „+“ am Blätter-Stand (UI_STYLE § 3.1). */
  openLeafShop(): void;
  /** Gratis-Boost über den `MonetizationProvider`. */
  claimFreeBoost(): void;
  /** Qualitäts-Pille und Matcha-Hinweis → Einkauf (Matcha-Sorten und Vorrat). */
  openSupply(): void;
  /** Uhr → Betrieb (Öffnungszeiten, Tagesbilanz). */
  openHours(): void;
}

/** Boosts mit eigener Pille (Hype hat seine Pille in der Bottom-Bar). */
const BOOST_PILLS = [BOOSTS.leaf, BOOSTS.free];
/** Dauer des Aufleuchtens, wenn Geld hereinkommt (wie `.hud-cash-in` in style.css). */
const CASH_IN_MS = 450;
/** Sauberkeit erscheint im HUD erst unter diesem Wert (§ 3.2). */
const CLEANLINESS_HINT_BELOW = 70;
/** Matcha-Hinweis, wenn der Vorrat für weniger Öffnungstage reicht. */
const MATCHA_HINT_BELOW_DAYS = 1;
const MOOD_ICON: Record<string, IconName> = {
  happy: 'smiley',
  neutral: 'smiley-meh',
  sad: 'smiley-sad',
};

/**
 * HUD oben (UI_STYLE § 3.1–3.3): Währungs-Pille, Status-Pille (Spieltag und Uhr, geöffnet/geschlossen, Umsatz pro
 * Stunde, Standort), Zustands-Chips (Zufriedenheit, Sauberkeit, Engpass, Matcha-Vorrat, Konto im Minus), Boosts,
 * Matcha-Sorte rechts. Nur lesend; Handlungen laufen über `actions`.
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
  const coins = currency('hud-coins', t('hud.coins'), 'banknote', 'icon-cash');
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

  // Uhr antippbar → Betrieb (Öffnungszeiten).
  const clockIcon = icon('clock');
  const clock = h('span', { 'data-testid': 'hud-clock' });
  const openState = h('span', { class: 'hud-open', 'data-testid': 'hud-open' });
  const clockBtn = h(
    'button',
    {
      class: 'hud-clock-btn ui-interactive',
      type: 'button',
      'aria-label': t('hud.hoursOpen'),
      title: t('hud.hoursOpen'),
    },
    clockIcon,
    clock,
    openState,
  );
  on(clockBtn, 'click', () => actions.openHours());
  const income = h('span', { class: 'hud-income', 'data-testid': 'hud-income' });
  const location = h('span', { class: 'hud-location', 'data-testid': 'hud-location' });
  const status = h(
    'div',
    { class: 'status-pill' },
    clockBtn,
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
  // Engpass der Service-Pipeline (GAME_DESIGN § 7.2), nur wenn Gäste warten.
  const bottleneckValue = h('span');
  const bottleneck = h(
    'span',
    { class: 'chip chip-warn', 'data-testid': 'hud-bottleneck' },
    icon('warning-circle'),
    bottleneckValue,
  );
  // Matcha wird knapp oder ist aus → zum Einkauf.
  const matchaValue = h('span');
  const matcha = h(
    'button',
    { class: 'chip chip-warn ui-interactive', type: 'button', 'data-testid': 'hud-matcha' },
    icon('package'),
    matchaValue,
  );
  on(matcha, 'click', () => actions.openSupply());
  const debtValue = h('span');
  const debt = h(
    'span',
    { class: 'chip chip-danger', 'data-testid': 'hud-debt' },
    icon('warning-circle'),
    debtValue,
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

  // Matcha-Sorte im Ausschank als Blätter (Sorte 1 … beste); Antippen öffnet den Einkauf.
  const qualityIcons = Array.from({ length: MAX_GRADE }, () => icon('leaf'));
  const quality = h(
    'button',
    { class: 'quality-pill ui-interactive', type: 'button', 'data-testid': 'hud-quality' },
    ...qualityIcons,
  );
  on(quality, 'click', () => actions.openSupply());

  const el = h(
    'div',
    { class: 'hud', 'data-testid': 'hud' },
    pill,
    status,
    h('div', { class: 'status-row' }, satisfaction, cleanliness, bottleneck, matcha, debt),
    boosts,
  );
  if (import.meta.env.DEV) el.append(h('div', { class: 'hud-hint', text: t('scene.debugHint') }));
  const root = h('div', { class: 'hud-root' }, el, quality);
  // Geld kommt erst, wenn ein Gast bezahlt hat (GAME_DESIGN § 7.2): dann leuchtet der Betrag kurz auf – bei
  // vielen Gästen nicht öfter, als die Animation dauert.
  let paidSeen = { location: '', paid: 0 };
  let cashInAt = -Infinity;
  const cashIn = (): void => {
    const now = performance.now();
    if (now - cashInAt < CASH_IN_MS) return;
    cashInAt = now;
    coins.el.classList.remove('hud-cash-in');
    void coins.el.offsetWidth;
    coins.el.classList.add('hud-cash-in');
  };
  // Vorrats-Reichweite rechnet über alle Stunden des Tages: nur jede Sekunde neu.
  let daysAt = -Infinity;
  let days = Infinity;

  return {
    el: root,
    update(s: GameState) {
      const locId = s.activeLocationId;
      const loc = getLocation(s, locId);
      if (paidSeen.location === locId && loc.till.paid > paidSeen.paid) cashIn();
      paidSeen = { location: locId, paid: loc.till.paid };
      setText(
        location,
        `${t(`location.${locId}.name`)} · ${t('hud.cafeLevel', { level: loc.level })}`,
      );
      const c = getCafeClock(s.clock);
      setText(clock, t('hud.clock', { day: c.day + 1, time: fmtClock(c.hour, c.minute) }));
      const open = isOpenAt(loc, s.clock);
      setIcon(clockIcon, c.night > 0.5 ? 'moon' : 'clock');
      setText(
        openState,
        open
          ? t('hud.open')
          : t('hud.closedUntil', {
              time: fmtClock(getCafeClock(nextOpeningAt(loc, s.clock)).hour, 0),
            }),
      );
      openState.classList.toggle('is-closed', !open);
      setText(coins.value, fmtMoney(loc.coins));
      coins.el.classList.toggle('is-negative', loc.coins.lt(0));
      const rates = computeLocationRates(s, locId);
      setText(
        income,
        open
          ? t('hud.incomePerHour', { amount: fmtMoney(rates.incomePerHour) })
          : t('hud.today', { amount: fmtMoney(ledgerProfit(loc.ledger.today)) }),
      );
      bottleneck.hidden = rates.waitPressure <= 0;
      setText(bottleneckValue, t('hud.bottleneck', { stage: stageName(rates.bottleneck) }));
      setText(leaves.value, fmt(s, s.meta.goldenLeaves));
      setText(satValue, `${String(Math.round(loc.satisfaction))} %`);
      setIcon(satIcon, MOOD_ICON[mood(loc.satisfaction)] ?? 'smiley');
      cleanliness.hidden = loc.cleanliness >= CLEANLINESS_HINT_BELOW;
      setText(cleanValue, `${String(Math.round(loc.cleanliness))} %`);
      const now = performance.now();
      if (now - daysAt > 1000) {
        daysAt = now;
        days = stockDays(s, locId);
      }
      const grade = gradeInUse(loc.supply);
      matcha.hidden = grade >= 0 && days >= MATCHA_HINT_BELOW_DAYS;
      setText(
        matchaValue,
        grade < 0 ? t('hud.matchaOut') : t('hud.matchaLow', { days: fmtSmall(days, 1) }),
      );
      matcha.setAttribute(
        'aria-label',
        `${matchaValue.textContent ?? ''} – ${t('hud.supplyOpen')}`,
      );
      debt.hidden = !loc.coins.lt(0);
      setText(debtValue, t('hud.debt'));
      qualityIcons.forEach((ic, i) => ic.classList.toggle('on', i < Math.max(0, grade)));
      const qName = grade < 0 ? t('hud.matchaOut') : gradeName(grade);
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
