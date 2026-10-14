import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import {
  buyMarketingLevel,
  campaignCooldownSec,
  campaignStatus,
  getCampaignCost,
  getMarketingLevelCost,
  isMarketingMaxed,
  isMarketingUnlocked,
  skipCampaignCooldown,
  startCampaign,
} from '@core/marketing';
import { BALANCE } from '@data/balance';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtSmall, fmtTime } from './format';
import type { PanelContent } from './panel';

/** Marketing (GAME_DESIGN § 9, § 16.5): Kampagnen-Level, aktive Kampagne, Abklingzeit. */
export function createMarketingPanel(store: Store, onStarted: () => void): PanelContent {
  const locId = store.getState().activeLocationId;
  const m = BALANCE.marketing;

  const levelStatus = h('span', { class: 'row-status', 'data-testid': 'marketing-level-status' });
  const levelBtn = h('button', {
    class: 'btn btn-row',
    type: 'button',
    'data-testid': 'marketing-level-buy',
  });
  on(levelBtn, 'click', () => store.dispatch((s) => buyMarketingLevel(s, locId)));
  const levelRow = h(
    'li',
    { class: 'shop-row' },
    h(
      'div',
      { class: 'row-text' },
      h('strong', { text: t('marketing.level.name') }),
      h('span', { class: 'muted', text: t('marketing.level.desc') }),
      levelStatus,
    ),
    levelBtn,
  );

  const campDesc = h('span', { class: 'muted' });
  const campStatus = h('span', { class: 'row-status', 'data-testid': 'marketing-campaign-status' });
  const startBtn = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    'data-testid': 'marketing-campaign-start',
  });
  on(startBtn, 'click', () => {
    const before = store.getState();
    if (store.dispatch((s) => startCampaign(s, locId)) !== before) onStarted();
  });
  const skipBtn = h('button', {
    class: 'btn',
    type: 'button',
    'data-testid': 'marketing-campaign-skip',
  });
  on(skipBtn, 'click', () => store.dispatch((s) => skipCampaignCooldown(s, locId)));
  const campRow = h(
    'li',
    { class: 'shop-row shop-row-stack' },
    h(
      'div',
      { class: 'row-text' },
      h('strong', { text: t('marketing.campaign.name') }),
      campDesc,
      campStatus,
    ),
    h('div', { class: 'btn-row-group' }, startBtn, skipBtn),
  );
  const locked = h('p', { class: 'locked-hint' });

  const update = (s: GameState): void => {
    const loc = getLocation(s, locId);
    const unlocked = isMarketingUnlocked(s, locId);
    setText(locked, unlocked ? '' : t('ui.unlockAt', { level: m.unlockCafeLevel }));
    locked.hidden = unlocked;

    const lvl = loc.marketing.level;
    const maxed = isMarketingMaxed(s, locId);
    const lvlCost = getMarketingLevelCost(s, locId);
    const lvlAffordable = unlocked && !maxed && lvlCost.lte(loc.coins);
    levelRow.classList.toggle('affordable', lvlAffordable);
    setText(
      levelStatus,
      t('marketing.level.status', {
        level: lvl,
        max: m.maxLevel,
        pct: fmtSmall(lvl * BALANCE.spawn.perMarketing * 100, 0),
      }),
    );
    const lvlLabel = maxed ? t('ui.maxed') : t('shop.buyOne', { cost: fmt(s, lvlCost) });
    setText(levelBtn, lvlLabel);
    levelBtn.setAttribute('aria-label', `${t('marketing.level.name')}: ${lvlLabel}`);
    setDisabled(levelBtn, !lvlAffordable);

    setText(
      campDesc,
      t('marketing.campaign.desc', {
        duration: fmtTime(m.campaignDurationSec),
        cooldown: fmtTime(campaignCooldownSec(loc)),
      }),
    );
    const status = campaignStatus(loc, s.playtimeSec);
    const time = fmtTime(Math.ceil(status.remainingSec));
    setText(
      campStatus,
      status.phase === 'ready'
        ? t('marketing.campaign.ready')
        : t(`marketing.campaign.${status.phase}`, { time }),
    );
    campRow.classList.toggle('active', status.phase === 'active');
    const cost = getCampaignCost(s, locId);
    setText(startBtn, t('marketing.campaign.start', { cost: fmt(s, cost) }));
    setDisabled(startBtn, !unlocked || status.phase !== 'ready' || cost.gt(loc.coins));
    setText(skipBtn, t('marketing.campaign.skip', { leaves: m.skipCooldownLeaves }));
    skipBtn.hidden = status.phase !== 'cooldown';
    setDisabled(skipBtn, s.meta.goldenLeaves.lt(m.skipCooldownLeaves));
  };
  const view: View = {
    el: h('div', {}, locked, h('ul', { class: 'shop-list' }, levelRow, campRow)),
    update,
  };
  return { title: t('marketing.title'), view };
}
