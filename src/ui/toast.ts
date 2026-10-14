import { UI_CONFIG } from '@data/ui';
import { h } from './dom';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toaster {
  el: HTMLElement;
  show(text: string, kind?: ToastKind): void;
}

/** Live-Region: Screenreader lesen Toasts vor, Fehler mit Vorrang. */
export function createToaster(): Toaster {
  const el = h('div', {
    class: 'toasts ui-interactive',
    'aria-live': 'polite',
    'data-testid': 'toasts',
  });
  return {
    el,
    show(text, kind = 'info') {
      const item = h('div', {
        class: `toast toast-${kind}`,
        role: kind === 'error' ? 'alert' : 'status',
        text,
      });
      el.append(item);
      window.setTimeout(() => item.remove(), UI_CONFIG.toastMs);
    },
  };
}
