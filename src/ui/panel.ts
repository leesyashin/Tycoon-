import { t } from '@i18n/index';
import type { Store } from '@core/store';
import { h, mount, on, type View } from './dom';

export interface PanelContent {
  title: string;
  view: View;
}

/** Schlüssel, unter dem ein Panel wieder geöffnet werden kann (z. B. nach Sprachwechsel). */
export interface PanelRequest {
  key: string;
  create: () => PanelContent;
}

export interface PanelHost {
  el: HTMLElement;
  open(req: PanelRequest): void;
  close(): void;
  current(): PanelRequest | null;
  /** Baut das offene Panel neu (Texte in neuer Sprache), ohne den Fokus zu verlieren. */
  rebuild(): void;
}

/** Ein Panel zur Zeit: Bottom-Sheet im Hochformat, Seitenpanel ab Tablet-Breite (CSS). */
export function createPanelHost(store: Store): PanelHost {
  const el = h('div', { class: 'panel-host' });
  let req: PanelRequest | null = null;
  let unmount: (() => void) | null = null;
  let opener: HTMLElement | null = null;

  const teardown = (): void => {
    unmount?.();
    unmount = null;
    el.replaceChildren();
  };

  const render = (focus: boolean): void => {
    if (!req) return;
    teardown();
    const content = req.create();
    const titleId = `panel-title-${req.key.replace(/\W/g, '-')}`;
    const close = h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': t('ui.close'),
      'data-testid': 'panel-close',
      text: '✕',
    });
    on(close, 'click', () => host.close());
    // Fokussierbar, damit lange Listen auch ohne aktive Buttons per Tastatur scrollen (axe: scrollable-region-focusable).
    const body = h('div', { class: 'panel-body', tabindex: 0 });
    const section = h(
      'section',
      {
        class: 'panel ui-interactive',
        role: 'dialog',
        'aria-labelledby': titleId,
        'data-testid': `panel-${req.key.split(':')[0] ?? req.key}`,
      },
      h('header', { class: 'panel-header' }, h('h2', { id: titleId, text: content.title }), close),
      body,
    );
    on(section, 'keydown', (e) => {
      if (e.key === 'Escape') host.close();
    });
    el.append(section);
    unmount = mount(body, content.view, store);
    if (focus) close.focus();
  };

  const host: PanelHost = {
    el,
    open(next) {
      const active = document.activeElement;
      if (!req && active instanceof HTMLElement) opener = active;
      req = next;
      render(true);
    },
    close() {
      req = null;
      teardown();
      opener?.focus();
      opener = null;
    },
    current: () => req,
    rebuild() {
      render(false);
    },
  };
  return host;
}
