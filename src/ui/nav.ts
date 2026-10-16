import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { getHypeProgress, getHypeRemaining } from '@core/customers';
import { getBulkCost, isStationMaxed, isStationUnlocked } from '@core/economy';
import { STATIONS } from '@data/stations';
import { h, on, setText, type View } from './dom';
import { icon, type IconName } from './icons';
import { spriteIconUrl } from './sprites';

export type NavTarget =
  | 'shop'
  | 'build'
  | 'staff'
  | 'supply'
  | 'stats'
  | 'social'
  | 'locations'
  | 'achievements'
  | 'settings';

interface Item {
  id: NavTarget;
  icon: IconName;
  variant: string;
}

/** Rechte Spalte: Verwaltung/Info (UI_STYLE § 3.4). */
const SIDE: Item[] = [
  { id: 'staff', icon: 'users', variant: 'btn-round--white' },
  { id: 'supply', icon: 'package', variant: 'btn-round--white' },
  { id: 'stats', icon: 'chart-bar', variant: 'btn-round--white' },
  { id: 'achievements', icon: 'trophy', variant: 'btn-round--white' },
];
/** Untere Leiste rechts: Handeln (§ 3.5). */
const BAR: Item[] = [
  { id: 'social', icon: 'video-camera', variant: 'btn-round--white' },
  { id: 'locations', icon: 'map-trifold', variant: 'btn-round--white' },
  { id: 'build', icon: 'hammer', variant: 'btn-round--white' },
];

export interface Nav extends View {
  /** Zahl am Button (z. B. abholbare Tagesaufgaben); 0 blendet sie aus. */
  setBadge(id: NavTarget, count: number): void;
}

/** Gibt es am aktiven Standort ein Stations-Upgrade, das man sich leisten kann? */
export function hasAffordableUpgrade(s: GameState): boolean {
  const locId = s.activeLocationId;
  const coins = getLocation(s, locId).coins;
  return STATIONS.some(
    (d) =>
      isStationUnlocked(s, locId, d.id) &&
      !isStationMaxed(s, locId, d.id) &&
      getBulkCost(s, locId, d.id, 1).lte(coins),
  );
}

/**
 * Bedienelemente am Rand: rechte Spalte, Bottom-Bar mit Shop-Kreis und Hype-Pille, Zahnrad, Filialleiter-Avatar.
 * Labels sind unsichtbar (Vorbild ohne Beschriftung): `aria-label` + `title` als Tooltip.
 */
export function createNav(onSelect: (id: NavTarget) => void): Nav {
  const badges = new Map<NavTarget, { el: HTMLElement; count: number }>();
  const button = (item: Item, extra = ''): HTMLButtonElement => {
    const label = t(`nav.${item.id}`);
    const badge = h('span', { class: 'badge', 'data-testid': `nav-badge-${item.id}` });
    badge.hidden = true;
    badges.set(item.id, { el: badge, count: 0 });
    const btn = h(
      'button',
      {
        class: `btn-round ${item.variant} ${extra} ui-interactive`.trim(),
        type: 'button',
        'aria-label': label,
        title: label,
        'data-testid': `nav-${item.id}`,
      },
      icon(item.icon),
      badge,
    );
    on(btn, 'click', () => onSelect(item.id));
    return btn;
  };

  const side = h(
    'nav',
    { class: 'side-slot', 'aria-label': t('nav.side') },
    ...SIDE.map((i) => button(i)),
  );
  const shop = button(
    { id: 'shop', icon: 'shopping-cart', variant: 'btn-round--primary' },
    'btn-round--lg',
  );
  const shopBadge = badges.get('shop')?.el;

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
      'data-testid': 'hud-hype',
    },
    fill,
    hypeLabel,
  );
  const bar = h(
    'nav',
    { class: 'actionbar', 'aria-label': t('nav.label'), 'data-testid': 'actionbar' },
    shop,
    h('div', { class: 'actionbar-right' }, hype, ...BAR.map((i) => button(i))),
  );
  const gear = button(
    { id: 'settings', icon: 'gear', variant: 'btn-round--glass' },
    'actionbar-gear',
  );

  // Filialleiter-Portrait (§ 3.6): nur mit eingestelltem Filialleiter, Pille zeigt den Auto-Kauf.
  const avatarPill = h('span', { class: 'avatar-pill' });
  const avatar = h(
    'button',
    {
      class: 'avatar icon-btn ui-interactive',
      type: 'button',
      'data-testid': 'hud-avatar',
    },
    h(
      'span',
      { class: 'avatar-face' },
      h('img', { src: spriteIconUrl('staff-manager'), alt: '', width: 52, height: 52 }),
    ),
    avatarPill,
  );
  avatar.hidden = true;
  on(avatar, 'click', () => onSelect('staff'));

  const el = h('div', { class: 'nav-slot' }, avatar, gear, bar);
  const root = h('div', { class: 'nav-root' }, side, el);

  return {
    el: root,
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
    update(s) {
      const affordable = hasAffordableUpgrade(s);
      if (shopBadge && shopBadge.hidden === affordable) {
        shopBadge.hidden = !affordable;
        shopBadge.replaceChildren(
          h('span', { 'aria-hidden': 'true', text: '!' }),
          h('span', { class: 'sr-only', text: t('ui.affordable') }),
        );
      }
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
      const loc = getLocation(s, s.activeLocationId);
      const manager = (loc.staff['manager'] ?? 0) > 0;
      avatar.hidden = !manager;
      if (manager) {
        const text = loc.autoBuy ? t('hud.autoBuyOn') : t('hud.autoBuyOff');
        setText(avatarPill, text);
        avatar.setAttribute('aria-label', `${t('staff.manager.name')}: ${text}`);
      }
    },
  };
}
