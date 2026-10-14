import { t } from '@i18n/index';
import { h, on } from './dom';

export interface DialogOptions {
  title: string;
  body: string[];
  confirm: string;
  /** Ohne `cancel` ist es ein reiner Hinweis-Dialog. */
  cancel?: string;
  danger?: boolean;
  testId?: string;
}

/** Modaler Dialog über das native `<dialog>` (Fokusfalle und Esc gibt es dann gratis). */
export function showDialog(host: HTMLElement, o: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const titleId = `dlg-${String(Date.now())}-${String(Math.random()).slice(2, 7)}`;
    const ok = h('button', {
      class: o.danger ? 'btn btn-danger' : 'btn btn-primary',
      type: 'button',
      text: o.confirm,
      'data-testid': 'dialog-confirm',
    });
    const cancel = o.cancel
      ? h('button', {
          class: 'btn',
          type: 'button',
          text: o.cancel,
          'data-testid': 'dialog-cancel',
        })
      : null;
    const dlg = h(
      'dialog',
      {
        class: 'dialog ui-interactive',
        'aria-labelledby': titleId,
        'data-testid': o.testId ?? 'dialog',
      },
      h('h2', { id: titleId, text: o.title }),
      ...o.body.map((p) => h('p', { text: p })),
      h('div', { class: 'dialog-actions' }, cancel, ok),
    );
    let result = false;
    on(ok, 'click', () => {
      result = true;
      dlg.close();
    });
    if (cancel) on(cancel, 'click', () => dlg.close());
    dlg.addEventListener('cancel', (e) => {
      // Reine Hinweise lassen sich auch mit Esc schließen, zählen dann aber als bestätigt.
      if (!o.cancel) {
        e.preventDefault();
        result = true;
        dlg.close();
      }
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    host.append(dlg);
    dlg.showModal();
    ok.focus();
  });
}

export function confirmTwice(
  host: HTMLElement,
  first: Omit<DialogOptions, 'cancel'>,
  second: Omit<DialogOptions, 'cancel'>,
): Promise<boolean> {
  const cancel = t('ui.cancel');
  return showDialog(host, { ...first, cancel }).then((yes) =>
    yes ? showDialog(host, { ...second, cancel }) : false,
  );
}
