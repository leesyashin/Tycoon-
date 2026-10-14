import { h, on } from './dom';

export interface Tabs<T extends string> {
  el: HTMLElement;
  active(): T;
  select(tab: T): void;
}

/**
 * Tab-Leiste nach WAI-ARIA-Tabs-Muster (Pfeiltasten wechseln). `idPrefix` muss je Panel eindeutig sein,
 * `onSelect` läuft nach jedem Wechsel (z. B. sofort neu rendern statt auf den nächsten Tick zu warten).
 */
export function createTabs<T extends string>(
  idPrefix: string,
  tabs: readonly { id: T; label: string; content: HTMLElement }[],
  initial: T,
  onSelect: (tab: T) => void = () => undefined,
): Tabs<T> {
  const tablist = h('div', { class: 'tabs', role: 'tablist' });
  const panels = h('div');
  let current = initial;
  const items = tabs.map((tab) => {
    const btn = h('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      id: `${idPrefix}-tab-${tab.id}`,
      'aria-controls': `${idPrefix}-tabpanel-${tab.id}`,
      'data-testid': `${idPrefix}-tab-${tab.id}`,
      text: tab.label,
    });
    const panel = h(
      'div',
      {
        role: 'tabpanel',
        id: `${idPrefix}-tabpanel-${tab.id}`,
        'aria-labelledby': `${idPrefix}-tab-${tab.id}`,
      },
      tab.content,
    );
    panels.append(panel);
    on(btn, 'click', () => select(tab.id));
    tablist.append(btn);
    return { id: tab.id, btn, panel };
  });
  const select = (id: T): void => {
    current = id;
    for (const it of items) {
      const sel = it.id === id;
      it.btn.setAttribute('aria-selected', String(sel));
      it.btn.tabIndex = sel ? 0 : -1;
      it.panel.hidden = !sel;
    }
    onSelect(id);
  };
  on(tablist, 'keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = items.findIndex((it) => it.id === current);
    const step = e.key === 'ArrowRight' ? 1 : items.length - 1;
    const next = items[(i + step) % items.length];
    if (!next) return;
    select(next.id);
    next.btn.focus();
  });
  select(initial);
  return { el: h('div', {}, tablist, panels), active: () => current, select };
}
