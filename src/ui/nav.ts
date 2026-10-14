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

/** Untere Leiste; Icon ist dekorativ, der Name steht sichtbar darunter. */
export function createNav(onSelect: (id: NavTarget) => void): HTMLElement {
  const nav = h('nav', { class: 'nav ui-interactive', 'aria-label': t('nav.label') });
  for (const item of ITEMS) {
    const btn = h(
      'button',
      { class: 'nav-btn', type: 'button', 'data-testid': `nav-${item.id}` },
      h('span', { class: 'nav-icon', 'aria-hidden': 'true', text: item.icon }),
      h('span', { class: 'nav-label', text: t(`nav.${item.id}`) }),
    );
    on(btn, 'click', () => onSelect(item.id));
    nav.append(btn);
  }
  return nav;
}
