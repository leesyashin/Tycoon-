import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { LOCATIONS } from '@data/locations';
import { STAFF_ROLES } from '@data/staff';
import { h, setText } from './dom';
import type { PanelContent } from './panel';

/** Personal-Übersicht; Einstellen und Effekte folgen mit S4, bis dahin nur Vorschau. */
export function createStaffPanel(): PanelContent {
  const rows = STAFF_ROLES.map((r) => {
    const status = h('span', { class: 'row-status' });
    const el = h(
      'li',
      { class: 'shop-row' },
      h(
        'div',
        { class: 'row-text' },
        h('strong', { text: t(`staff.${r.id}.name`) }),
        h('span', { class: 'muted', text: t(`staff.${r.id}.effect`) }),
        status,
      ),
    );
    return { r, el, status };
  });
  return {
    title: t('staff.title'),
    view: {
      el: h(
        'div',
        {},
        h('p', { class: 'muted', text: t('ui.comingSoon') }),
        h('ul', { class: 'shop-list' }, ...rows.map((x) => x.el)),
      ),
      update(s: GameState) {
        const level = getLocation(s, s.activeLocationId).level;
        for (const x of rows) {
          setText(
            x.status,
            level >= x.r.unlockCafeLevel ? '' : t('ui.unlockAt', { level: x.r.unlockCafeLevel }),
          );
        }
      },
    },
  };
}

/** Standort-Liste mit Freischalt-Bedingungen; Wechseln und Reset kommen in S6. */
export function createLocationsPanel(): PanelContent {
  const rows = LOCATIONS.map((l) => {
    const status = h('span', { class: 'row-status' });
    const el = h(
      'li',
      { class: 'shop-row' },
      h('div', { class: 'row-text' }, h('strong', { text: t(`location.${l.id}.name`) }), status),
    );
    return { l, el, status };
  });
  return {
    title: t('locations.title'),
    view: {
      el: h('ul', { class: 'shop-list' }, ...rows.map((x) => x.el)),
      update(s: GameState) {
        for (const x of rows) {
          const active = s.activeLocationId === x.l.id;
          x.el.classList.toggle('affordable', active);
          const u = x.l.unlock;
          setText(
            x.status,
            active
              ? t('locations.active')
              : u
                ? t('locations.unlock', {
                    prev: t(`location.${u.prevLocationId}.name`),
                    level: u.cafeLevel,
                    zen: u.zen,
                  })
                : '',
          );
        }
      },
    },
  };
}

export function createAchievementsPanel(): PanelContent {
  return {
    title: t('achievements.title'),
    view: { el: h('p', { class: 'muted', text: t('ui.comingSoon') }), update: () => undefined },
  };
}
