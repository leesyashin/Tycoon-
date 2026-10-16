import { t } from '@i18n/index';
import type { GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { advanceTutorial, currentTutorialStep, skipTutorial } from '@core/tutorial';
import { TUTORIAL_STEPS } from '@data/tutorial';
import { PRESTIGE } from '@data/prestige';
import { getOfflineCapDays, getOfflineEfficiency } from '@core/economy';
import { h, on, setText, type View } from './dom';

/**
 * Onboarding-Overlay (PLAN S9): Ring um das Ziel-Element und eine Sprechblase. Blockiert nichts außer der
 * Blase selbst – der Spieler soll die Aufgabe ja gleich ausführen. Manuelle Schritte dunkeln den Rest ab.
 */
export function createTutorial(store: Store, isPanelOpen: () => boolean): View {
  const ring = h('div', { class: 'tutorial-ring', 'aria-hidden': 'true' });
  const counter = h('p', { class: 'tutorial-count', 'data-testid': 'tutorial-count' });
  const title = h('h2', { class: 'tutorial-title', id: 'tutorial-title' });
  const text = h('p', { class: 'tutorial-text', 'data-testid': 'tutorial-text' });
  const skip = h('button', { class: 'btn', type: 'button', 'data-testid': 'tutorial-skip' });
  const next = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    'data-testid': 'tutorial-next',
  });
  const bubble = h(
    'section',
    {
      class: 'tutorial-bubble',
      'aria-labelledby': 'tutorial-title',
      'aria-live': 'polite',
      'data-testid': 'tutorial',
    },
    counter,
    title,
    text,
    h('div', { class: 'tutorial-actions' }, skip, next),
  );
  const el = h('div', { class: 'tutorial' }, ring, bubble);
  on(skip, 'click', () => store.dispatch(skipTutorial));
  on(next, 'click', () => store.dispatch(advanceTutorial));

  let shownId = '';
  const place = (s: GameState): void => {
    const def = currentTutorialStep(s);
    el.hidden = !def;
    if (!def) return;
    const manual = def.check.kind === 'manual';
    if (def.id !== shownId) {
      shownId = def.id;
      const index = TUTORIAL_STEPS.indexOf(def);
      setText(counter, t('tutorial.count', { step: index + 1, total: TUTORIAL_STEPS.length }));
      setText(title, t(`tutorial.${def.id}.title`));
      setText(
        text,
        t(`tutorial.${def.id}.text`, {
          days: getOfflineCapDays(s),
          pct: Math.round(getOfflineEfficiency(s) * 100),
          level: PRESTIGE.resetMinCafeLevel,
        }),
      );
      setText(skip, t('tutorial.skip'));
      setText(next, t(index === TUTORIAL_STEPS.length - 1 ? 'tutorial.finish' : 'tutorial.next'));
    }
    next.hidden = !manual;
    // Ein offenes Panel deckt die Ziele ab: dann nur die Blase oben, ohne Ring und Abdunkeln.
    const target =
      def.target && !isPanelOpen()
        ? document.querySelector<HTMLElement>(`[data-testid="${def.target}"]`)
        : null;
    const rect = target?.getBoundingClientRect();
    const visible = !!rect && rect.width > 0 && rect.height > 0;
    el.classList.toggle('tutorial--dim', manual && !isPanelOpen());
    ring.hidden = !visible;
    if (!visible || !rect) {
      bubble.dataset['pos'] = def.target ? 'top' : 'center';
      bubble.style.removeProperty('top');
      bubble.style.removeProperty('bottom');
      return;
    }
    const pad = 6;
    ring.style.left = `${String(rect.left - pad)}px`;
    ring.style.top = `${String(rect.top - pad)}px`;
    ring.style.width = `${String(rect.width + pad * 2)}px`;
    ring.style.height = `${String(rect.height + pad * 2)}px`;
    // Ziel in der unteren Hälfte → Blase darüber, sonst darunter.
    const below = rect.top + rect.height / 2 < window.innerHeight / 2;
    bubble.dataset['pos'] = below ? 'below' : 'above';
    if (below) {
      bubble.style.top = `${String(rect.bottom + pad * 3)}px`;
      bubble.style.removeProperty('bottom');
    } else {
      bubble.style.bottom = `${String(window.innerHeight - rect.top + pad * 3)}px`;
      bubble.style.removeProperty('top');
    }
  };
  const onResize = (): void => place(store.getState());
  window.addEventListener('resize', onResize);
  return {
    el,
    update: place,
    destroy: () => window.removeEventListener('resize', onResize),
  };
}
