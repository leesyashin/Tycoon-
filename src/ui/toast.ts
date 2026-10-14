import { UI_CONFIG } from '@data/ui';
import { h } from './dom';
import { icon, type IconName } from './icons';

const TOAST_ICON: Record<ToastKind, IconName> = {
  info: 'bell',
  success: 'tick',
  error: 'warning-circle',
};

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
      // Weiße Pille mit farbigem Icon (UI_STYLE § 3.12); Text bleibt ein eigener Knoten für Screenreader.
      const item = h(
        'div',
        { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
        h('span', { class: 'toast-icon' }, icon(TOAST_ICON[kind])),
        h('span', { text }),
      );
      el.append(item);
      window.setTimeout(() => item.remove(), UI_CONFIG.toastMs);
    },
  };
}
