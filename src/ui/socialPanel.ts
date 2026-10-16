import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { followerDemandMult } from '@core/customers';
import {
  getVideoCost,
  isFormatUnlocked,
  postBlock,
  postBonusVideo,
  postVideo,
  postsLeftToday,
  previewVideo,
} from '@core/social';
import { getCafeClock } from '@core/time/dayCycle';
import { BALANCE } from '@data/balance';
import { SOCIAL, VIDEO_FORMATS, getVideoFormat } from '@data/social';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmt, fmtBonusPct, fmtClock, fmtMoney } from './format';
import { icon } from './icons';
import type { PanelContent } from './panel';

/**
 * Social Media statt Kampagnen (Vorgabe Vincent 2026-10-16, GAME_DESIGN § 9): Account des Cafés mit Followern, bis
 * zu drei Videos pro Spieltag in verschiedenen Formaten (Kosten, erwartete Views und neue Follower), Bonus-Video
 * gegen Blätter, die letzten Videos mit ihren Zahlen.
 */
export function createSocialPanel(
  store: Store,
  onPosted: (views: number, viral: boolean) => void,
): PanelContent {
  const locId = store.getState().activeLocationId;

  const followers = h('strong', { class: 'social-followers', 'data-testid': 'social-followers' });
  const effect = h('span', { class: 'muted', 'data-testid': 'social-effect' });
  const posts = h('span', { class: 'chip social-posts', 'data-testid': 'social-posts' });
  const buzz = h('span', { class: 'muted', 'data-testid': 'social-buzz' });

  const post = (formatId: string, bonus: boolean): void => {
    const before = store.getState();
    const after = store.dispatch((s) =>
      bonus ? postBonusVideo(s, locId, formatId) : postVideo(s, locId, formatId),
    );
    if (after === before) return;
    const last = getLocation(after, locId).social.recent[0];
    if (last) onPosted(last.views, last.viral);
  };

  const formats = VIDEO_FORMATS.map((def) => {
    const desc = h('span', { class: 'muted' });
    const expect = h('span', { class: 'row-status' });
    const btn = h('button', {
      class: 'btn btn-row',
      type: 'button',
      'data-testid': `social-post-${def.id}`,
    });
    on(btn, 'click', () => post(def.id, false));
    const name = t(`social.format.${def.id}.name`);
    const el = h(
      'li',
      { class: 'shop-row shop-row-stack', 'data-testid': `social-format-${def.id}` },
      h('div', { class: 'row-text' }, h('strong', { text: name }), desc, expect),
      h('div', { class: 'btn-row-group' }, btn),
    );
    return { def, el, desc, expect, btn, name };
  });

  const bonusSelect = h('select', {
    'data-testid': 'social-bonus-format',
    'aria-label': t('social.bonusFormat'),
  });
  for (const def of VIDEO_FORMATS)
    bonusSelect.append(h('option', { value: def.id, text: t(`social.format.${def.id}.name`) }));
  const bonusBtn = h('button', {
    class: 'btn btn-row premium',
    type: 'button',
    'data-testid': 'social-bonus',
  });
  on(bonusBtn, 'click', () => post(bonusSelect.value, true));
  const bonusHint = h('p', { class: 'muted' });

  const recent = h('ul', { class: 'social-recent', 'data-testid': 'social-recent' });
  const recentEmpty = h('p', { class: 'muted', text: t('social.recentNone') });

  const el = h(
    'div',
    { class: 'social-panel' },
    h(
      'div',
      { class: 'card social-account' },
      h('div', { class: 'social-head' }, icon('video-camera', 'social-icon'), followers, posts),
      effect,
      buzz,
    ),
    h('h3', { class: 'section-title', text: t('social.formats') }),
    h('ul', { class: 'shop-list' }, ...formats.map((f) => f.el)),
    h('h3', { class: 'section-title', text: t('social.bonusTitle') }),
    h('div', { class: 'card social-bonus' }, bonusSelect, bonusBtn, bonusHint),
    h('h3', { class: 'section-title', text: t('social.recent') }),
    recent,
    recentEmpty,
  );

  let recentKey = '';
  const view: View = {
    el,
    update(s: GameState) {
      const loc = getLocation(s, locId);
      const soc = loc.social;
      setText(followers, t('social.followers', { count: fmt(s, Math.round(soc.followers)) }));
      setText(effect, t('social.effect', { pct: fmtBonusPct(followerDemandMult(soc.followers)) }));
      setText(posts, t('social.postsToday', { done: soc.postsToday, max: SOCIAL.postsPerDay }));
      const buzzPct = Math.min(BALANCE.demand.buzzMax, soc.buzz) * 100;
      setText(buzz, buzzPct >= 1 ? t('social.buzz', { pct: Math.round(buzzPct) }) : '');
      buzz.hidden = buzzPct < 1;
      const left = postsLeftToday(loc);
      for (const f of formats) {
        const unlocked = isFormatUnlocked(loc, f.def);
        const p = previewVideo(loc, f.def);
        const cost = getVideoCost(f.def, locId);
        f.el.classList.toggle('locked', !unlocked);
        setText(
          f.desc,
          unlocked
            ? t(`social.format.${f.def.id}.desc`)
            : f.def.needs === 'barista' && loc.level >= f.def.unlockCafeLevel
              ? t('social.needsBarista')
              : t('ui.unlockAt', { level: f.def.unlockCafeLevel }),
        );
        setText(
          f.expect,
          t('social.expect', {
            views: fmt(s, Math.round(p.views)),
            followers: fmt(s, Math.round(p.followers)),
            viral: Math.round(f.def.viralChance * 100),
          }),
        );
        f.expect.hidden = !unlocked;
        const block = postBlock(s, locId, f.def.id);
        const label =
          block === 'limit'
            ? t('social.limit')
            : cost.gt(0)
              ? t('social.post', { cost: fmtMoney(cost) })
              : t('social.postFree');
        setText(f.btn, label);
        f.btn.setAttribute('aria-label', `${f.name}: ${label}`);
        setDisabled(f.btn, block !== null);
        f.el.classList.toggle('affordable', block === null);
      }
      const bonusDef = getVideoFormat(bonusSelect.value);
      const bonusBlock = bonusDef ? postBlock(s, locId, bonusDef.id, true) : 'locked';
      setText(bonusBtn, t('social.bonus', { leaves: SOCIAL.bonusVideoLeaves }));
      setDisabled(bonusBtn, bonusBlock !== null);
      setText(
        bonusHint,
        left > 0
          ? t('social.bonusHintFree', { left })
          : t('social.bonusHint', {
              done: soc.bonusToday,
              max: SOCIAL.maxBonusPerDay,
            }),
      );
      const key = soc.recent.map((r) => `${String(r.minute)}:${String(r.views)}`).join('|');
      if (key !== recentKey) {
        recentKey = key;
        recent.replaceChildren(
          ...soc.recent.map((r) => {
            const c = getCafeClock(r.minute);
            return h(
              'li',
              { class: `social-post${r.viral ? ' is-viral' : ''}` },
              h('strong', { text: t(`social.format.${r.format}.name`) }),
              h('span', {
                class: 'muted',
                text: t('social.postLine', {
                  day: c.day + 1,
                  time: fmtClock(c.hour, c.minute),
                  views: fmt(s, r.views),
                  followers: fmt(s, r.followers),
                }),
              }),
              r.viral ? h('span', { class: 'chip chip-viral', text: t('social.viral') }) : null,
            );
          }),
        );
      }
      recentEmpty.hidden = soc.recent.length > 0;
    },
  };
  return { title: t('social.title'), view };
}
