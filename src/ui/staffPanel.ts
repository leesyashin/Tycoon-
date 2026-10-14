import { t } from '@i18n/index';
import { getLocation, type GameState, type LocationState } from '@core/GameState';
import type { Store } from '@core/store';
import { getCheckoutThroughput, getOfflineCapMs } from '@core/economy';
import { campaignCooldownSec } from '@core/marketing';
import {
  canAutoBuy,
  cleanlinessFloor,
  cleanlinessRatePerMin,
  getNextStaffCost,
  getStaffLevel,
  hireStaff,
  isStaffMaxed,
  isStaffUnlocked,
  previewStaffHire,
  setAutoBuy,
  staffSpeedMults,
} from '@core/staff';
import { BALANCE } from '@data/balance';
import { STAFF_ROLES, type StaffRoleDef } from '@data/staff';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtBonusPct, fmtSigned, fmtSmall, fmtTime } from './format';
import type { PanelContent } from './panel';

const HOUR_MS = 3_600_000;

/** Aktueller Effekt einer Rolle in Zahlen (GAME_DESIGN § 6). */
function nowText(role: StaffRoleDef, s: GameState, loc: LocationState): string {
  const speed = staffSpeedMults(loc);
  const lvl = getStaffLevel(loc, role.id);
  switch (role.id) {
    case 'barista':
      return t('staff.now.barista', { pct: fmtBonusPct(speed['matchaBar'] ?? 1) });
    case 'cashier':
      return t('staff.now.cashier', {
        pct: fmtBonusPct(getCheckoutThroughput(1, lvl) / getCheckoutThroughput(1, 0)),
        pct2: fmtBonusPct(speed['merchShelf'] ?? 1),
      });
    case 'cleaner':
      return t('staff.now.cleaner', {
        rate: fmtSigned(cleanlinessRatePerMin(loc)),
        floor: cleanlinessFloor(loc),
      });
    case 'manager':
      return t('staff.now.manager', { hours: getOfflineCapMs(s) / HOUR_MS });
    case 'baker':
      return t('staff.now.baker', { pct: fmtBonusPct(speed['bakery'] ?? 1) });
    case 'socialMedia':
      return t('staff.now.socialMedia', {
        pct: fmtBonusPct(1 + lvl * BALANCE.spawn.perSocialMedia),
        time: fmtTime(campaignCooldownSec(loc)),
      });
    case 'teaMaster':
      return t('staff.now.teaMaster', {
        pct: fmtBonusPct(speed['ceremonyCorner'] ?? 1),
        sat: lvl * BALANCE.satisfaction.perTeaMaster,
      });
  }
}

/** Was die nächste Stufe bringt; Einkommen zuerst, sonst der rollen-typische Effekt. */
function nextText(role: StaffRoleDef, s: GameState, locId: string): string {
  const loc = getLocation(s, locId);
  if (role.id === 'manager') {
    const next = { ...s, locations: { ...s.locations, [locId]: hiredOnce(loc, role.id) } };
    return t('staff.next.offline', { hours: getOfflineCapMs(next) / HOUR_MS });
  }
  if (role.id === 'socialMedia') {
    const p = previewStaffHire(s, locId, role.id);
    return p.incomeDelta.gt(0)
      ? t('staff.next.income', { amount: fmt(s, p.incomeDelta) })
      : t('staff.next.cooldown', { time: fmtTime(campaignCooldownSec(hiredOnce(loc, role.id))) });
  }
  const p = previewStaffHire(s, locId, role.id);
  if (p.incomeDelta.gt(0)) return t('staff.next.income', { amount: fmt(s, p.incomeDelta) });
  if (Math.abs(p.satisfactionDelta) >= 0.05) {
    return t('staff.next.satisfaction', { value: fmtSigned(p.satisfactionDelta) });
  }
  return t('staff.next.none');
}

function hiredOnce(loc: LocationState, id: string): LocationState {
  return { ...loc, staff: { ...loc.staff, [id]: getStaffLevel(loc, id) + 1 } };
}

interface Row {
  el: HTMLElement;
  update(s: GameState): void;
}

function staffRow(store: Store, locId: string, role: StaffRoleDef): Row {
  const status = h('span', { class: 'row-status' });
  const now = h('span', { class: 'row-status' });
  const next = h('span', { class: 'row-status row-next' });
  const btn = h('button', {
    class: 'btn btn-row',
    type: 'button',
    'data-testid': `staff-hire-${role.id}`,
  });
  on(btn, 'click', () => store.dispatch((s) => hireStaff(s, locId, role.id)));
  const name = t(`staff.${role.id}.name`);
  const text = h(
    'div',
    { class: 'row-text' },
    h('strong', { text: name }),
    h('span', { class: 'muted', text: t(`staff.${role.id}.effect`) }),
    status,
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

  const el = h('li', { class: 'shop-row', 'data-testid': `staff-row-${role.id}` }, text, btn);
  return {
    el,
    update(s) {
      const loc = getLocation(s, locId);
      const lvl = getStaffLevel(loc, role.id);
      const unlocked = isStaffUnlocked(s, locId, role.id);
      const maxed = isStaffMaxed(s, locId, role.id);
      const cost = getNextStaffCost(s, locId, role.id);
      const affordable = unlocked && !maxed && cost.lte(loc.coins);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('locked', !unlocked);
      setText(
        status,
        unlocked
          ? `${t('staff.level', { level: lvl, max: role.maxLevel })}${affordable ? ` · ${t('ui.affordable')}` : ''}`
          : t('ui.unlockAt', { level: role.unlockCafeLevel }),
      );
      setText(now, unlocked ? nowText(role, s, loc) : '');
      now.hidden = !unlocked;
      const nextLine = unlocked && !maxed ? nextText(role, s, locId) : '';
      setText(next, nextLine);
      next.hidden = nextLine === '';
      const label = maxed ? t('ui.maxed') : t('staff.hire', { cost: fmt(s, cost) });
      setText(btn, label);
      btn.setAttribute('aria-label', `${name}: ${label}`);
      setDisabled(btn, !affordable);
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

/** Personal (GAME_DESIGN § 16.4): Liste mit Effekt-Erklärung, Stufe kaufen, Auto-Kauf beim Filialleiter. */
export function createStaffPanel(store: Store): PanelContent {
  const locId = store.getState().activeLocationId;
  const rows = STAFF_ROLES.map((r) => staffRow(store, locId, r));
  const clean = h('p', { class: 'muted', 'data-testid': 'staff-cleanliness' });
  const view: View = {
    el: h('div', {}, clean, h('ul', { class: 'shop-list' }, ...rows.map((r) => r.el))),
    update(s) {
      const loc = getLocation(s, locId);
      setText(
        clean,
        t('staff.cleanliness', {
          value: fmtSmall(loc.cleanliness, 0),
          rate: fmtSigned(cleanlinessRatePerMin(loc)),
        }),
      );
      for (const r of rows) r.update(s);
    },
  };
  return { title: t('staff.title'), view };
}
