import { t } from '@i18n/index';
import type { GameState } from '@core/GameState';
import type { Store } from '@core/store';
import {
  buyLeafBoost,
  buySkin,
  buyTimeSkip,
  canCompleteQuestWithLeaves,
  completeQuestWithLeaves,
  isSkinEquipped,
  isSkinOwned,
  previewTimeSkip,
  toggleSkin,
} from '@core/leaves';
import { getBoostRemaining, getFreeBoostWait, isFreeBoostReady } from '@core/events';
import { BOOSTS, LEAF_PRICES, SKINS, TIME_SKIPS } from '@data/leaves';
import { QUEST_CONFIG, QUESTS } from '@data/quests';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtMoney, fmtTime } from './format';
import type { PanelContent } from './panel';

interface Row {
  el: HTMLElement;
  update(s: GameState): void;
}

/** Zeile mit Titel, Beschreibung, Status und einem Kauf-Knopf; `price` in Blättern (0 = gratis). */
function row(
  testId: string,
  title: string,
  onClick: () => void,
  render: (s: GameState) => {
    desc: string;
    status?: string;
    label: string;
    enabled: boolean;
    hidden?: boolean;
  },
): Row {
  const desc = h('span', { class: 'muted' });
  const status = h('span', { class: 'row-status' });
  const btn = h('button', { class: 'btn btn-row', type: 'button', 'data-testid': testId });
  on(btn, 'click', onClick);
  const el = h(
    'li',
    { class: 'shop-row premium' },
    h('div', { class: 'row-text' }, h('strong', { text: title }), desc, status),
    btn,
  );
  return {
    el,
    update(s) {
      const r = render(s);
      el.hidden = r.hidden === true;
      if (el.hidden) return;
      setText(desc, r.desc);
      setText(status, r.status ?? '');
      status.hidden = !r.status;
      setText(btn, r.label);
      btn.setAttribute('aria-label', `${title}: ${r.label}`);
      setDisabled(btn, !r.enabled);
      el.classList.toggle('affordable', r.enabled);
    },
  };
}

const price = (leaves: number): string => t('leafShop.price', { leaves });

/**
 * Blätter-Shop (GAME_DESIGN § 10, § 16.8): Zeitsprung, Boosts, Quests, Skins (Bonus-Videos gibt es im
 * Social-Media-Panel). Gratis-Boost läuft über den `MonetizationProvider` (`onFreeBoost`), nie direkt.
 */
export function createLeafShopPanel(store: Store, onFreeBoost: () => void): PanelContent {
  const has = (s: GameState, n: number): boolean => s.meta.goldenLeaves.gte(n);
  const balance = h('p', { class: 'zen-balance', 'data-testid': 'leafshop-balance' });

  const skips = TIME_SKIPS.map((def) =>
    row(
      `leaf-${def.id}`,
      t('leafShop.skip.name', { hours: def.hours }),
      () => store.dispatch((s) => buyTimeSkip(s, def.id)),
      (s) => ({
        desc: t('leafShop.skip.desc', { coins: fmtMoney(previewTimeSkip(s, def.id)) }),
        label: price(def.cost),
        enabled: has(s, def.cost),
      }),
    ),
  );

  const boost = row(
    'leaf-boost',
    t('leafShop.boost.name', { mult: BOOSTS.leaf.incomeMult }),
    () => store.dispatch(buyLeafBoost),
    (s) => {
      const rest = getBoostRemaining(s, BOOSTS.leaf.id);
      return {
        desc: t('leafShop.boost.desc', { time: fmtTime(BOOSTS.leaf.durationSec) }),
        status: rest > 0 ? t('leafShop.boost.active', { time: fmtTime(Math.ceil(rest)) }) : '',
        label: price(LEAF_PRICES.boost),
        enabled: has(s, LEAF_PRICES.boost),
      };
    },
  );
  const free = row(
    'leaf-free-boost',
    t('leafShop.free.name', { mult: BOOSTS.free.incomeMult }),
    onFreeBoost,
    (s) => {
      const ready = isFreeBoostReady(s);
      return {
        desc: t('leafShop.free.desc', { time: fmtTime(BOOSTS.free.durationSec) }),
        status: ready
          ? ''
          : t('leafShop.free.wait', { time: fmtTime(Math.ceil(getFreeBoostWait(s))) }),
        label: t('leafShop.free.watch'),
        enabled: ready,
      };
    },
  );

  const quests = Array.from({ length: QUEST_CONFIG.perDay }, (_, i) =>
    row(
      `leaf-quest-${String(i)}`,
      t('leafShop.quest.name'),
      () => store.dispatch((s) => completeQuestWithLeaves(s, i)),
      (s) => {
        const item = s.quests.items[i];
        const def = item && QUESTS.find((q) => q.id === item.id);
        const open = canCompleteQuestWithLeaves(s, i);
        return {
          desc: def ? t(`quest.${def.kind}`, { target: def.target }) : '',
          label: price(LEAF_PRICES.questComplete),
          enabled: open && has(s, LEAF_PRICES.questComplete),
          hidden: !open,
        };
      },
    ),
  );
  const questsNone = h('p', { class: 'muted', text: t('leafShop.quest.none') });

  const skins = SKINS.map((def) =>
    row(
      `leaf-skin-${def.id}`,
      t(`skin.${def.id}.name`),
      () =>
        store.dispatch((s) =>
          isSkinOwned(s, def.id) ? toggleSkin(s, def.id) : buySkin(s, def.id),
        ),
      (s) => {
        const owned = isSkinOwned(s, def.id);
        const on = isSkinEquipped(s, def.id);
        return {
          desc: t(`skin.${def.id}.desc`),
          status: owned ? (on ? t('leafShop.skin.on') : t('leafShop.skin.off')) : '',
          label: owned
            ? on
              ? t('leafShop.skin.unequip')
              : t('leafShop.skin.equip')
            : price(def.cost),
          enabled: owned || has(s, def.cost),
        };
      },
    ),
  );

  const section = (title: string, rows: Row[], ...extra: HTMLElement[]): HTMLElement =>
    h(
      'section',
      {},
      h('h3', { class: 'section-title', text: title }),
      h('ul', { class: 'shop-list' }, ...rows.map((r) => r.el)),
      ...extra,
    );
  const all = [...skips, boost, free, ...quests, ...skins];
  const view: View = {
    el: h(
      'div',
      { class: 'leaf-shop' },
      balance,
      section(t('leafShop.section.skip'), skips),
      section(t('leafShop.section.boost'), [boost, free]),
      section(t('leafShop.section.shortcuts'), quests, questsNone),
      section(t('leafShop.section.skins'), skins),
      h('p', { class: 'muted', text: t('leafShop.note') }),
    ),
    update(s) {
      setText(balance, t('leafShop.balance', { leaves: fmt(s, s.meta.goldenLeaves) }));
      for (const r of all) r.update(s);
      questsNone.hidden = quests.some((q) => !q.el.hidden);
    },
  };
  return { title: t('leafShop.title'), view };
}
