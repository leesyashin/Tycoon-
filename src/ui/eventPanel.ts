import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { getEventResolveCost, isEventRunning, resolveEvent } from '@core/events';
import { getCalendarEventDef, getRandomEventDef } from '@data/events';
import { h, on, setDisabled, setText, type View } from './dom';
import { fmtMoney, fmtTime } from './format';
import type { PanelContent } from './panel';
import { icon, setIcon, type IconName } from './icons';

/** Gefüllte Glyphen je Event (UI_STYLE § 6.6); das Emoji in `data/events` bleibt Text-Fallback. */
const EVENT_GLYPH: Record<string, IconName> = {
  heatwave: 'sun',
  influencerVisit: 'sparkle',
  supplyShortage: 'package',
  foodBlogger: 'star',
  rainyDay: 'cloud-rain',
  hanami: 'flower-lotus',
  summerIced: 'ice-cream',
  newYear: 'confetti',
};

export function eventIcon(id: string): string {
  return getRandomEventDef(id)?.icon ?? getCalendarEventDef(id)?.icon ?? '✨';
}

/** Laufendes Zufalls-Event am aktiven Standort, sonst irgendeins (für die Karte). */
export function featuredEvent(s: GameState): { index: number; id: string; rest: number } | null {
  const running = s.activeEvents
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => isEventRunning(e, s.playtimeSec));
  const pick = running.find(({ e }) => e.locationId === s.activeLocationId) ?? running[0];
  if (!pick) return null;
  return { index: pick.index, id: pick.e.id, rest: pick.e.until - s.playtimeSec };
}

/** Event-Karte am rechten Rand über der Szene (UI_STYLE § 3.7): Symbol, Name, Restzeit; öffnet das Detail. */
export function createEventCard(onOpen: () => void): View {
  const glyph = icon('bell', 'event-card-icon');
  const name = h('strong');
  const time = h('span', { class: 'muted' });
  const el = h(
    'button',
    { class: 'event-card ui-interactive', type: 'button', 'data-testid': 'event-card' },
    glyph,
    name,
    time,
  );
  el.hidden = true;
  on(el, 'click', onOpen);
  return {
    el,
    update(s) {
      const ev = featuredEvent(s);
      el.hidden = !ev;
      if (!ev) return;
      setIcon(glyph, EVENT_GLYPH[ev.id] ?? 'bell');
      setText(name, t(`event.${ev.id}.name`));
      setText(time, fmtTime(Math.ceil(ev.rest)));
      el.setAttribute(
        'aria-label',
        t('event.cardLabel', { name: t(`event.${ev.id}.name`), time: fmtTime(Math.ceil(ev.rest)) }),
      );
    },
  };
}

/** Event-Detail: was wirkt, wie lange noch, Belohnung; Lieferengpass lässt sich hier beheben. */
export function createEventPanel(store: Store): PanelContent {
  const list = h('ul', { class: 'shop-list', 'data-testid': 'event-list' });
  const calendar = h('ul', { class: 'shop-list', 'data-testid': 'event-calendar' });
  const calTitle = h('h3', { class: 'section-title', text: t('event.calendarTitle') });
  const empty = h('p', { class: 'muted', text: t('event.none') });
  const hint = h('p', { class: 'muted', text: t('event.hint') });
  let key = '';
  let updaters: ((s: GameState) => void)[] = [];

  const renderRandom = (s: GameState): void => {
    list.replaceChildren();
    s.activeEvents.forEach((ev, i) => {
      const def = getRandomEventDef(ev.id);
      if (!def || !isEventRunning(ev, s.playtimeSec)) return;
      const status = h('span', { class: 'row-status', 'data-testid': `event-status-${String(i)}` });
      const reward = h('span', { class: 'muted' });
      const text = h(
        'div',
        { class: 'row-text' },
        h('strong', { text: `${def.icon} ${t(`event.${ev.id}.name`)}` }),
        h('span', { class: 'muted', text: t(`event.${ev.id}.desc`) }),
        h('span', {
          class: 'muted',
          text: t('event.where', { name: t(`location.${ev.locationId}.name`) }),
        }),
        reward,
        status,
      );
      const row = h('li', { class: 'shop-row shop-row-stack active' }, text);
      let btn: HTMLButtonElement | null = null;
      if (def.resolve) {
        btn = h('button', {
          class: 'btn btn-primary',
          type: 'button',
          'data-testid': `event-resolve-${String(i)}`,
        });
        on(btn, 'click', () => store.dispatch((x) => resolveEvent(x, i)));
        row.append(btn);
      }
      const update = (x: GameState): void => {
        const cur = x.activeEvents[i];
        if (!cur) return;
        setText(
          status,
          t('event.remaining', { time: fmtTime(Math.ceil(cur.until - x.playtimeSec)) }),
        );
        setText(
          reward,
          def.resolve
            ? t('event.rewardIfResolved', { leaves: def.reward })
            : t('event.reward', { leaves: def.reward }),
        );
        if (btn) {
          const cost = getEventResolveCost(x, i);
          const coins = x.locations[cur.locationId] ? getLocation(x, cur.locationId).coins : null;
          setText(btn, t('event.resolve', { cost: cost ? fmtMoney(cost) : '–' }));
          setDisabled(btn, !cost || !coins || coins.lt(cost));
        }
      };
      updaters.push(update);
      list.append(row);
    });
  };

  const renderCalendar = (s: GameState): void => {
    calendar.replaceChildren(
      ...s.calendarEvents.map((id) =>
        h(
          'li',
          { class: 'shop-row' },
          h(
            'div',
            { class: 'row-text' },
            h('strong', { text: `${eventIcon(id)} ${t(`event.${id}.name`)}` }),
            h('span', { class: 'muted', text: t(`event.${id}.desc`) }),
          ),
        ),
      ),
    );
  };

  const view: View = {
    el: h('div', {}, empty, list, calTitle, calendar, hint),
    update(s) {
      const running = s.activeEvents.filter((e) => isEventRunning(e, s.playtimeSec));
      const next = `${running.map((e) => `${e.id}@${e.locationId}`).join()}|${s.calendarEvents.join()}`;
      if (next !== key) {
        key = next;
        updaters = [];
        renderRandom(s);
        renderCalendar(s);
      }
      for (const u of updaters) u(s);
      empty.hidden = running.length > 0;
      calTitle.hidden = s.calendarEvents.length === 0;
    },
  };
  return { title: t('event.title'), view };
}
