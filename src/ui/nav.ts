import { t } from '@i18n/index';
import { h, on } from './dom';

export type NavTarget = 'shop' | 'staff' | 'marketing' | 'locations' | 'achievements' | 'settings';

const ITEMS: { id: NavTarget; icon: string }[] = [
  { id: 'shop', icon: '🛒' },
  { id: 'staff', icon: '🧑‍🍳' },
  { id: 'marketing', icon: '📣' },
  { id: 'locations', icon: '🗺️' },
  { id: 'achievements', icon: '🏆' },
  { id: 'settings', icon: '⚙️' },
];

export interface Nav {
  el: HTMLElement;
  /** Zahl am Nav-Punkt (z. B. abholbare Tagesaufgaben); 0 blendet sie aus. */
  setBadge(id: NavTarget, count: number): void;
}

/** Untere Leiste; Icon ist dekorativ, der Name steht sichtbar darunter. */
export function createNav(onSelect: (id: NavTarget) => void): Nav {
  const nav = h('nav', { class: 'nav ui-interactive', 'aria-label': t('nav.label') });
  const badges = new Map<NavTarget, { el: HTMLElement; count: number }>();
  for (const item of ITEMS) {
    const badge = h('span', { class: 'nav-badge', 'data-testid': `nav-badge-${item.id}` });
    badge.hidden = true;
    const btn = h(
      'button',
      { class: 'nav-btn', type: 'button', 'data-testid': `nav-${item.id}` },
      h('span', { class: 'nav-icon', 'aria-hidden': 'true', text: item.icon }),
      h('span', { class: 'nav-label', text: t(`nav.${item.id}`) }),
      badge,
    );
    badges.set(item.id, { el: badge, count: 0 });
    on(btn, 'click', () => onSelect(item.id));
    nav.append(btn);
  }
  return {
    el: nav,
    setBadge(id, count) {
      const b = badges.get(id);
      if (!b || b.count === count) return;
      b.count = count;
      b.el.hidden = count <= 0;
      // Sichtbar nur die Zahl, Screenreader hören „2 abholbar“.
      b.el.replaceChildren(
        h('span', { 'aria-hidden': 'true', text: String(count) }),
        h('span', { class: 'sr-only', text: t('ui.claimable', { count }) }),
      );
    },
  };
}
