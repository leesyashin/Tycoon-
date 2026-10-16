import { t } from '@i18n/index';
import { getLocation, type GameState, type LocationState } from '@core/GameState';
import type { Store } from '@core/store';
import { roleWagePerHour, wagesPerOpenHour, type LocationRates } from '@core/customers';
import { getOfflineCapDays } from '@core/economy';
import {
  canAutoBuy,
  canFireStaff,
  cleanlinessEquilibrium,
  cleanlinessRatePerHour,
  fireStaff,
  getNextStaffCost,
  getStaffLevel,
  hireStaff,
  isStaffMaxed,
  isStaffUnlocked,
  minStaff,
  peakRates,
  previewStaffHire,
  setAutoBuy,
} from '@core/staff';
import { openHoursPerDay } from '@core/time/clock';
import { SOCIAL } from '@data/social';
import { STAFF_ROLES, type StaffRoleDef } from '@data/staff';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmtMoney, fmtSigned, fmtSmall } from './format';
import { stageName } from './labels';
import type { PanelContent } from './panel';
import { createPipelineCard } from './pipeline';

/** Aktueller Effekt einer Rolle in Zahlen (GAME_DESIGN § 6), zur Hauptzeit gerechnet. */
function nowText(role: StaffRoleDef, s: GameState, loc: LocationState, r: LocationRates): string {
  const count = getStaffLevel(loc, role.id);
  switch (role.id) {
    case 'cashier':
      return t('staff.now.cashier', { count, amount: fmtSmall(r.stages.order, 0) });
    case 'barista':
      return t('staff.now.barista', { count, amount: fmtSmall(r.stages.production, 0) });
    case 'waiter':
      return t('staff.now.waiter', {
        count,
        amount: fmtSmall(r.stages.service, 0),
        pct: fmtSmall(r.tableServiceShare * 100, 0),
      });
    case 'cleaner':
      return t('staff.now.cleaner', {
        count,
        eq: fmtSmall(cleanlinessEquilibrium(loc, r.served), 0),
      });
    case 'manager':
      return t('staff.now.manager', { days: getOfflineCapDays(s) });
    case 'socialMedia':
      return t('staff.now.socialMedia', {
        posts: Math.min(count, SOCIAL.managerPostHours.length),
      });
  }
}

/** Was die nächste Kraft bringt; Umsatz zuerst, sonst der rollen-typische Effekt. */
function nextText(role: StaffRoleDef, s: GameState, locId: string, r: LocationRates): string {
  const loc = getLocation(s, locId);
  if (role.id === 'manager') {
    const next = { ...s, locations: { ...s.locations, [locId]: hiredOnce(loc, role.id) } };
    return t('staff.next.offline', { days: getOfflineCapDays(next) });
  }
  if (role.id === 'socialMedia') {
    return t('staff.next.socialMedia', {
      posts: Math.min(getStaffLevel(loc, role.id) + 1, SOCIAL.managerPostHours.length),
    });
  }
  const p = previewStaffHire(s, locId, role.id);
  if (p.incomeDelta.gt(0)) return t('staff.next.income', { amount: fmtMoney(p.incomeDelta) });
  if (role.id === 'cleaner') {
    if (Math.abs(p.satisfactionDelta) >= 0.05) {
      return t('staff.next.satisfaction', { value: fmtSigned(p.satisfactionDelta) });
    }
    return t('staff.next.cleanEq', {
      eq: fmtSmall(cleanlinessEquilibrium(hiredOnce(loc, role.id), r.served), 0),
    });
  }
  if (role.id === 'waiter' && Math.abs(p.satisfactionDelta) >= 0.05) {
    return t('staff.next.satisfaction', { value: fmtSigned(p.satisfactionDelta) });
  }
  return t('staff.next.none', { stage: stageName(r.bottleneck) });
}

function hiredOnce(loc: LocationState, id: string): LocationState {
  return { ...loc, staff: { ...loc.staff, [id]: getStaffLevel(loc, id) + 1 } };
}

interface Row {
  el: HTMLElement;
  update(s: GameState, r: LocationRates): void;
}

function staffRow(store: Store, locId: string, role: StaffRoleDef): Row {
  const status = h('span', { class: 'row-status' });
  const wage = h('span', { class: 'row-status row-wage', 'data-testid': `staff-wage-${role.id}` });
  const now = h('span', { class: 'row-status' });
  const next = h('span', { class: 'row-status row-next' });
  const hire = h('button', {
    class: 'btn btn-row',
    type: 'button',
    'data-testid': `staff-hire-${role.id}`,
  });
  on(hire, 'click', () => store.dispatch((s) => hireStaff(s, locId, role.id)));
  const fire = h('button', {
    class: 'btn btn-row btn-fire',
    type: 'button',
    'data-testid': `staff-fire-${role.id}`,
  });
  on(fire, 'click', () => store.dispatch((s) => fireStaff(s, locId, role.id)));
  const name = t(`staff.${role.id}.name`);
  const text = h(
    'div',
    { class: 'row-text' },
    h('strong', { text: name }),
    h('span', { class: 'muted', text: t(`staff.${role.id}.effect`) }),
    status,
    wage,
    now,
    next,
  );

  let auto: { input: HTMLInputElement; hint: HTMLElement } | null = null;
  if (role.id === 'manager') {
    const id = 'staff-autobuy';
    const input = h('input', { type: 'checkbox', id, 'data-testid': id });
    on(input, 'change', () => store.dispatch((s) => setAutoBuy(s, locId, input.checked)));
    const hint = h('span', { class: 'row-status' });
    text.append(
      h(
        'div',
        { class: 'field field-check' },
        input,
        h('label', { for: id, text: t('staff.autoBuy') }),
      ),
      hint,
    );
    auto = { input, hint };
  }

  const el = h(
    'li',
    { class: 'shop-row shop-row-stack', 'data-testid': `staff-row-${role.id}` },
    text,
    h('div', { class: 'btn-row-group' }, hire, fire),
  );
  return {
    el,
    update(s, r) {
      const loc = getLocation(s, locId);
      const lvl = getStaffLevel(loc, role.id);
      const unlocked = isStaffUnlocked(s, locId, role.id);
      const maxed = isStaffMaxed(s, locId, role.id);
      const fee = getNextStaffCost(s, locId, role.id);
      const affordable = unlocked && !maxed && fee.lte(loc.coins);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('is-bottleneck', !!role.stage && role.stage === r.bottleneck);
      const countText = role.headcount
        ? t('staff.count', { count: lvl, max: role.maxLevel })
        : t('staff.level', { level: lvl, max: role.maxLevel });
      const owner = role.owner > 0 ? ` · ${t('staff.ownerIncluded')}` : '';
      setText(
        status,
        unlocked ? `${countText}${owner}` : t('ui.unlockAt', { level: role.unlockCafeLevel }),
      );
      // Was die Rolle kostet: Lohn je Stunde und je Öffnungstag (nur geöffnet bezahlt).
      const perHour = roleWagePerHour(loc, role.id, locId);
      const hours = openHoursPerDay(loc.hours);
      const nextWage = roleWagePerHour(hiredOnce(loc, role.id), role.id, locId) - perHour;
      setText(
        wage,
        perHour > 0
          ? t('staff.wageNow', {
              hour: fmtMoney(perHour),
              day: fmtMoney(perHour * hours),
              next: fmtMoney(nextWage),
            })
          : t('staff.wageNext', { next: fmtMoney(nextWage) }),
      );
      wage.hidden = !unlocked || (maxed && perHour <= 0);
      setText(now, unlocked ? nowText(role, s, loc, r) : '');
      now.hidden = !unlocked;
      const nextLine = unlocked && !maxed ? nextText(role, s, locId, r) : '';
      setText(next, nextLine);
      next.hidden = nextLine === '';
      const label = maxed ? t('ui.maxed') : t('staff.hire', { cost: fmtMoney(fee) });
      setText(hire, label);
      hire.setAttribute('aria-label', `${t(`staff.${role.id}.name`)}: ${label}`);
      setDisabled(hire, !affordable);
      const canFire = canFireStaff(s, locId, role.id);
      setText(fire, role.headcount ? t('staff.fire') : t('staff.demote'));
      fire.setAttribute(
        'aria-label',
        `${t(`staff.${role.id}.name`)}: ${role.headcount ? t('staff.fire') : t('staff.demote')}`,
      );
      fire.hidden = !unlocked || lvl <= role.owner;
      setDisabled(fire, !canFire);
      // Am Minimum (ohne Barista bereitet niemand zu) sagt der Tooltip, warum nicht entlassen werden kann.
      const min = minStaff(role.id);
      fire.title = !canFire && lvl <= min ? t('staff.fireMin', { count: min, name }) : '';
      if (auto) {
        const allowed = canAutoBuy(loc);
        auto.input.disabled = !allowed;
        if (auto.input.checked !== loc.autoBuy) auto.input.checked = loc.autoBuy;
        setText(auto.hint, allowed ? '' : t('staff.autoBuyLocked'));
        auto.hint.hidden = allowed;
      }
    },
  };
}

/**
 * Personal (GAME_DESIGN § 16.4): Teamkosten, Pipeline-Karte mit Engpass, dann die Rollen mit Köpfen/Stufen, Lohn,
 * Effekt in Zahlen, Einstellen und Entlassen; Auto-Kauf beim Filialleiter. Kapazitäten zur Hauptzeit, damit das
 * Panel auch nachts zeigt, was das Team schafft.
 */
export function createStaffPanel(store: Store): PanelContent {
  const locId = store.getState().activeLocationId;
  const pipeline = createPipelineCard(locId, 'pipeline', true);
  const rows = STAFF_ROLES.map((r) => staffRow(store, locId, r));
  const team = h('p', { class: 'team-cost', 'data-testid': 'staff-team-cost' });
  const clean = h('p', { class: 'muted', 'data-testid': 'staff-cleanliness' });
  const view: View = {
    el: h(
      'div',
      {},
      team,
      pipeline.el,
      clean,
      h('ul', { class: 'shop-list' }, ...rows.map((r) => r.el)),
    ),
    update(s) {
      const loc = getLocation(s, locId);
      const r = peakRates(s, locId);
      const perHour = wagesPerOpenHour(loc, locId);
      const heads = Object.values(loc.staff).reduce((a, b) => a + b, 0);
      setText(
        team,
        t('staff.teamCost', {
          count: heads,
          hour: fmtMoney(perHour),
          day: fmtMoney(perHour * openHoursPerDay(loc.hours)),
          open: loc.hours.open,
          close: loc.hours.close,
        }),
      );
      pipeline.update(s);
      setText(
        clean,
        t('staff.cleanliness', {
          value: fmtSmall(loc.cleanliness, 0),
          rate: fmtSigned(cleanlinessRatePerHour(loc, r.served)),
        }),
      );
      for (const row of rows) row.update(s, r);
    },
  };
  return { title: t('staff.title'), view };
}
