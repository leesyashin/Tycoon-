import { t } from '@i18n/index';
import { exportFilename } from '@core/save';
import { h, on } from './dom';

/** Meldungen, die keine Spielfehler sind (Browser-Eigenheiten, Erweiterungen). */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/];

function text(key: string, fallback: string): string {
  try {
    const v = t(key);
    return v === key ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Fehler-Boundary (PLAN S9): Ein unerwarteter Fehler zeigt einen Hinweis mit „Spielstand exportieren“ und
 * „Neu laden“, statt das Spiel still einfrieren zu lassen. Baut nur auf dem DOM und dem übergebenen
 * Rohtext auf, damit sie auch funktioniert, wenn der Fehler im Spiel selbst steckt.
 */
export function installErrorBoundary(getSaveText: () => string | null): void {
  let shown = false;
  const show = (message: string): void => {
    if (shown || IGNORED.some((re) => re.test(message))) return;
    shown = true;
    const exportBtn = h('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: text('error.export', 'Export save'),
      'data-testid': 'error-export',
    });
    const reloadBtn = h('button', {
      class: 'btn',
      type: 'button',
      text: text('error.reload', 'Reload'),
      'data-testid': 'error-reload',
    });
    on(exportBtn, 'click', () => {
      let save: string | null;
      try {
        save = getSaveText();
      } catch {
        save = null;
      }
      if (!save) return;
      const a = h('a', {
        href: URL.createObjectURL(new Blob([save], { type: 'application/json' })),
        download: exportFilename(Date.now()),
      });
      document.body.append(a);
      a.click();
      a.remove();
    });
    on(reloadBtn, 'click', () => window.location.reload());
    const box = h(
      'div',
      {
        class: 'error-boundary',
        role: 'alertdialog',
        'aria-labelledby': 'error-title',
        'data-testid': 'error-boundary',
      },
      h(
        'div',
        { class: 'dialog error-card' },
        h('h2', { id: 'error-title', text: text('error.title', 'Something went wrong') }),
        h('p', {
          text: text('error.body', 'Export your save to be safe, then reload the game.'),
        }),
        h('p', { class: 'muted error-detail', text: message }),
        h('div', { class: 'dialog-actions' }, reloadBtn, exportBtn),
      ),
    );
    document.body.append(box);
    exportBtn.focus();
  };
  window.addEventListener('error', (e) => show(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => {
    const r: unknown = e.reason;
    show(r instanceof Error ? r.message : String(r));
  });
}
