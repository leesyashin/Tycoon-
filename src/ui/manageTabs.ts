import { t } from '@i18n/index';
import { h, on } from './dom';
import { icon, type IconName } from './icons';

export type ManageTab = 'shop' | 'supply' | 'staff' | 'social' | 'stats';

const TABS: { id: ManageTab; icon: IconName }[] = [
  { id: 'shop', icon: 'storefront' },
  { id: 'supply', icon: 'package' },
  { id: 'staff', icon: 'users' },
  { id: 'social', icon: 'video-camera' },
  { id: 'stats', icon: 'chart-bar' },
];

/**
 * Karten-Tabs des Verwaltungs-Screens (UI_STYLE § 3.9/3.11). Jeder Reiter ist ein eigenes Panel
 * (eigene `data-testid`), der Screen wechselt nur den Inhalt; aktiver Reiter = `aria-current`.
 */
export function createManageTabs(active: ManageTab, open: (tab: ManageTab) => void): HTMLElement {
  const el = h('nav', {
    class: 'tabs screen-tabs panel-tabs manage-tabs',
    'aria-label': t('manage.title'),
  });
  for (const tab of TABS) {
    const btn = h(
      'button',
      {
        class: 'tab',
        type: 'button',
        'aria-current': tab.id === active ? 'page' : undefined,
        'data-testid': `manage-tab-${tab.id}`,
      },
      icon(tab.icon),
      h('span', { text: t(`manage.tab.${tab.id}`) }),
    );
    if (tab.id !== active) on(btn, 'click', () => open(tab.id));
    el.append(btn);
  }
  return el;
}
