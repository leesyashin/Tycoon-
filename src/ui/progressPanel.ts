import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import {
  achievementProgress,
  claimQuest,
  countUnlockedAchievements,
  isAchievementUnlocked,
  isQuestComplete,
} from '@core/progression';
import { ACHIEVEMENTS, type AchievementDef } from '@data/achievements';
import { cafeLevelProgress } from '@core/economy/cafeLevel';
import { QUEST_CONFIG, QUESTS } from '@data/quests';
import { CAFE_LEVEL_REWARD, getNextUnlockLevel, getUnlocksAt } from '@data/unlocks';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtMoney, fmtTime } from './format';
import { unlockLabel } from './labels';
import type { PanelContent } from './panel';
import { createTabs } from './tabs';

type Tab = 'achievements' | 'quests' | 'stats';
const TABS: Tab[] = ['achievements', 'quests', 'stats'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** „Großverdiener III“: Stufe aus der Ziffer am Ende der ID. */
export function achievementName(def: AchievementDef): string {
  const n = Number(/\d+$/.exec(def.id)?.[0] ?? '1');
  return t(`achievement.${def.kind}.name`, { tier: ROMAN[n - 1] ?? String(n) });
}

function achievementTarget(state: GameState, def: AchievementDef): string {
  if (def.kind === 'playtime' || def.kind === 'highSatisfaction') return fmtTime(def.target);
  if (def.kind === 'lifetimeEarned') return fmtMoney(def.target);
  if (def.kind === 'quality') return t(`quality.tier.${String(def.target)}.name`);
  return fmt(state, def.target);
}

function progressBar(label: string): { el: HTMLElement; set(frac: number): void } {
  const fill = h('div', { class: 'progress-fill' });
  const el = h(
    'div',
    {
      class: 'progress',
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
    },
    fill,
  );
  let shown = -1;
  return {
    el,
    set(frac) {
      const pct = Math.round(Math.min(1, Math.max(0, frac)) * 100);
      if (pct === shown) return;
      shown = pct;
      fill.style.width = `${String(pct)}%`;
      el.setAttribute('aria-valuenow', String(pct));
    },
  };
}

function achievementsView(): View {
  const count = h('p', { class: 'muted', 'data-testid': 'achievements-count' });
  const rows = ACHIEVEMENTS.map((def) => {
    const name = h('strong');
    const desc = h('span', { class: 'muted' });
    const bar = progressBar(achievementName(def));
    const reward = h('span', {
      class: 'row-status',
      text: t('achievements.reward', { leaves: def.reward }),
    });
    const el = h(
      'li',
      { class: 'shop-row achievement', 'data-testid': `achievement-${def.id}` },
      h('div', { class: 'row-text' }, name, desc, bar.el),
      reward,
    );
    return { def, el, name, desc, bar, reward };
  });
  return {
    el: h('div', {}, count, h('ul', { class: 'shop-list' }, ...rows.map((r) => r.el))),
    update(s) {
      setText(
        count,
        t('achievements.count', { done: countUnlockedAchievements(s), total: ACHIEVEMENTS.length }),
      );
      for (const r of rows) {
        const done = isAchievementUnlocked(s, r.def.id);
        const hidden = r.def.secret === true && !done;
        r.el.classList.toggle('affordable', done);
        setText(r.name, hidden ? t('achievements.secret.name') : achievementName(r.def));
        setText(
          r.desc,
          hidden
            ? t('achievements.secret.desc')
            : t(`achievement.${r.def.kind}.desc`, { target: achievementTarget(s, r.def) }),
        );
        r.bar.set(hidden ? 0 : achievementProgress(s, r.def));
        setText(
          r.reward,
          done ? `✓ ${t('achievements.done')}` : t('achievements.reward', { leaves: r.def.reward }),
        );
      }
    },
  };
}

/** Sekunden bis zur nächsten lokalen Mitternacht (UI darf die Systemuhr lesen, `core` nicht). */
function secondsToMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, (next.getTime() - now.getTime()) / 1000);
}

function questsView(store: Store): View {
  const rows = Array.from({ length: QUEST_CONFIG.perDay }, (_, i) => {
    const name = h('strong');
    const progress = h('span', { class: 'muted' });
    const bar = progressBar(t('progress.tab.quests'));
    const btn = h('button', {
      class: 'btn btn-row',
      type: 'button',
      'data-testid': `quest-claim-${String(i)}`,
    });
    on(btn, 'click', () => store.dispatch((s) => claimQuest(s, i)));
    const el = h(
      'li',
      { class: 'shop-row', 'data-testid': `quest-${String(i)}` },
      h('div', { class: 'row-text' }, name, progress, bar.el),
      btn,
    );
    return { el, name, progress, bar, btn };
  });
  const bonus = h('p', { class: 'muted', 'data-testid': 'quest-bonus' });
  const reset = h('p', { class: 'muted' });
  return {
    el: h('div', {}, h('ul', { class: 'shop-list' }, ...rows.map((r) => r.el)), bonus, reset),
    update(s) {
      rows.forEach((r, i) => {
        const item = s.quests.items[i];
        const def = item && QUESTS.find((q) => q.id === item.id);
        r.el.hidden = !item || !def;
        if (!item || !def) return;
        setText(r.name, t(`quest.${def.kind}`, { target: def.target }));
        setText(r.progress, t('quests.progress', { progress: item.progress, target: def.target }));
        r.bar.set(item.progress / def.target);
        const complete = isQuestComplete(item);
        r.el.classList.toggle('affordable', complete && !item.claimed);
        const label = item.claimed
          ? t('quests.claimed')
          : t('quests.claim', { leaves: QUEST_CONFIG.rewardEach });
        setText(r.btn, label);
        setDisabled(r.btn, item.claimed || !complete);
      });
      setText(
        bonus,
        s.quests.bonusClaimed
          ? t('quests.bonusDone')
          : t('quests.bonus', { leaves: QUEST_CONFIG.bonusAll }),
      );
      setText(reset, t('quests.reset', { time: fmtTime(secondsToMidnight()) }));
    },
  };
}

function statsView(): View {
  const stat = (label: string): [HTMLElement, HTMLElement] => {
    const value = h('dd');
    return [h('div', { class: 'stat' }, h('dt', { text: label }), value), value];
  };
  const [earnedRow, earned] = stat(t('stats.lifetimeEarned'));
  const [servedRow, served] = stat(t('stats.customersServed'));
  const [playRow, play] = stat(t('stats.playtime'));
  const [levelsRow, levels] = stat(t('stats.levelsBought'));
  const [tapsRow, taps] = stat(t('stats.taps'));
  const [leavesRow, leaves] = stat(t('stats.leavesEarned'));
  const [achRow, ach] = stat(t('stats.achievements'));
  const cafe = h('p', { 'data-testid': 'stats-cafe-level' });
  const cafeBar = progressBar(t('stats.cafeLevel'));
  const next = h('p', { class: 'muted' });
  const reward = h('p', {
    class: 'muted',
    text: t('stats.cafeLevelReward', {
      hours: CAFE_LEVEL_REWARD.incomeHours,
      from: CAFE_LEVEL_REWARD.leavesFromLevel,
    }),
  });
  return {
    el: h(
      'div',
      {},
      h('h3', { class: 'section-title', text: t('stats.cafeLevel') }),
      cafe,
      cafeBar.el,
      next,
      reward,
      h(
        'dl',
        { class: 'stats', 'data-testid': 'stats-list' },
        earnedRow,
        servedRow,
        playRow,
        levelsRow,
        tapsRow,
        leavesRow,
        achRow,
      ),
    ),
    update(s) {
      const loc = getLocation(s, s.activeLocationId);
      const { done, need } = cafeLevelProgress(loc);
      setText(cafe, t('stats.cafeLevelProgress', { level: loc.level, done, total: need }));
      cafeBar.set(done / need);
      const nextLevel = getNextUnlockLevel(loc.level);
      setText(
        next,
        nextLevel === null
          ? ''
          : t('stats.nextUnlocks', {
              level: nextLevel,
              list: getUnlocksAt(nextLevel)
                .map((u) => unlockLabel(s.activeLocationId, u))
                .join(', '),
            }),
      );
      setText(earned, fmtMoney(s.meta.lifetimeEarned));
      setText(served, fmt(s, Math.floor(s.stats.customersServed)));
      setText(play, fmtTime(s.playtimeSec));
      setText(levels, fmt(s, s.stats.levelsBought));
      setText(taps, fmt(s, s.stats.taps));
      setText(leaves, fmt(s, s.stats.leavesEarned));
      setText(ach, `${String(countUnlockedAchievements(s))}/${String(ACHIEVEMENTS.length)}`);
    },
  };
}

/** Erfolge / Tagesaufgaben / Statistik (GAME_DESIGN § 16.9): ein Screen, drei Tabs. */
export function createProgressPanel(store: Store, initialTab: Tab = 'achievements'): PanelContent {
  const views: Record<Tab, View> = {
    achievements: achievementsView(),
    quests: questsView(store),
    stats: statsView(),
  };
  let view: View | null = null;
  const tabs = createTabs(
    'progress',
    TABS.map((tab) => ({ id: tab, label: t(`progress.tab.${tab}`), content: views[tab].el })),
    initialTab,
    () => view?.update(store.getState()),
  );
  view = {
    el: h('div', { class: 'progress-panel' }, tabs.el),
    update(s) {
      views[tabs.active()].update(s);
    },
  };
  return { title: t('progress.title'), view };
}

/** Anzahl abholbarer Quests (für das Abzeichen in der Navigation). */
export function claimableQuests(s: GameState): number {
  return s.quests.items.filter((it) => !it.claimed && isQuestComplete(it)).length;
}
