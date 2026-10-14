import { t } from '@i18n/index';
import type { GameState, Settings } from '@core/GameState';
import type { Store } from '@core/store';
import { updateSettings } from '@core/settings';
import { UI_CONFIG } from '@data/ui';
import { h, on, type View } from './dom';
import type { PanelContent } from './panel';

export interface SaveActions {
  exportSave(): void;
  importSave(text: string): void;
  deleteSave(): void;
}

/** Settings (GAME_DESIGN § 16.10). Sprache wirkt sofort; `app.ts` reagiert auf `settings.lang`. */
export function createSettingsPanel(
  store: Store,
  actions: SaveActions,
  version: string,
): PanelContent {
  const set = (patch: Partial<Settings>): void => {
    store.dispatch((s) => updateSettings(s, patch));
  };

  const select = <V extends string>(
    id: string,
    label: string,
    options: { value: V; text: string }[],
    onChange: (v: V) => void,
  ): { row: HTMLElement; el: HTMLSelectElement } => {
    const el = h('select', { id, 'data-testid': id });
    for (const o of options) el.append(h('option', { value: o.value, text: o.text }));
    on(el, 'change', () => onChange(el.value as V));
    return { row: h('div', { class: 'field' }, h('label', { for: id, text: label }), el), el };
  };
  const toggle = (id: string, label: string, onChange: (v: boolean) => void) => {
    const el = h('input', { type: 'checkbox', id, 'data-testid': id });
    on(el, 'change', () => onChange(el.checked));
    return {
      row: h('div', { class: 'field field-check' }, el, h('label', { for: id, text: label })),
      el,
    };
  };

  const lang = select(
    'settings-lang',
    t('settings.language'),
    [
      { value: 'de', text: t('settings.lang.de') },
      { value: 'en', text: t('settings.lang.en') },
    ],
    (v) => set({ lang: v }),
  );
  const numberFormat = select(
    'settings-number-format',
    t('settings.numberFormat'),
    [
      { value: 'short', text: t('settings.numberFormat.short') },
      { value: 'scientific', text: t('settings.numberFormat.scientific') },
    ],
    (v) => set({ numberFormat: v }),
  );
  const sfx = toggle('settings-sfx', t('settings.sfx'), (v) => set({ sfx: v }));
  const music = toggle('settings-music', t('settings.music'), (v) => set({ music: v }));
  const range = (id: string, label: string, onChange: (v: number) => void) => {
    const el = h('input', { type: 'range', id, min: 0, max: 100, step: 5, 'data-testid': id });
    on(el, 'input', () => onChange(Number(el.value) / 100));
    return {
      row: h('div', { class: 'field field-range' }, h('label', { for: id, text: label }), el),
      el,
    };
  };
  const sfxVolume = range('settings-sfx-volume', t('settings.sfxVolume'), (v) =>
    set({ sfxVolume: v }),
  );
  const musicVolume = range('settings-music-volume', t('settings.musicVolume'), (v) =>
    set({ musicVolume: v }),
  );

  const exportBtn = h('button', {
    class: 'btn',
    type: 'button',
    text: t('settings.export'),
    'data-testid': 'settings-export',
  });
  on(exportBtn, 'click', () => actions.exportSave());
  const file = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    'data-testid': 'settings-import-file',
  });
  on(file, 'change', () => {
    const f = file.files?.[0];
    if (!f) return;
    void f.text().then((text) => actions.importSave(text));
    file.value = '';
  });
  const importBtn = h('button', {
    class: 'btn',
    type: 'button',
    text: t('settings.import'),
    'data-testid': 'settings-import',
  });
  on(importBtn, 'click', () => file.click());
  const deleteBtn = h('button', {
    class: 'btn btn-danger',
    type: 'button',
    text: t('settings.delete'),
    'data-testid': 'settings-delete',
  });
  on(deleteBtn, 'click', () => actions.deleteSave());

  const el = h(
    'div',
    { class: 'settings' },
    lang.row,
    numberFormat.row,
    h(
      'fieldset',
      {},
      h('legend', { text: t('settings.audio') }),
      sfx.row,
      sfxVolume.row,
      music.row,
      musicVolume.row,
    ),
    h(
      'fieldset',
      {},
      h('legend', { text: t('settings.save') }),
      h('div', { class: 'btn-row' }, exportBtn, importBtn, file),
      deleteBtn,
    ),
    h(
      'p',
      { class: 'muted' },
      h('a', {
        href: UI_CONFIG.licensesUrl,
        target: '_blank',
        rel: 'noopener',
        text: t('settings.licenses'),
      }),
      ` · ${t('settings.version', { version })}`,
    ),
  );

  const view: View = {
    el,
    update(s: GameState) {
      // Nur setzen, wenn abweichend, sonst springt ein offenes Select zurück.
      if (lang.el.value !== s.settings.lang) lang.el.value = s.settings.lang;
      if (numberFormat.el.value !== s.settings.numberFormat)
        numberFormat.el.value = s.settings.numberFormat;
      if (sfx.el.checked !== s.settings.sfx) sfx.el.checked = s.settings.sfx;
      if (music.el.checked !== s.settings.music) music.el.checked = s.settings.music;
      // Während des Ziehens nicht zurücksetzen (Fokus = Spieler bedient den Regler).
      for (const [r, v] of [
        [sfxVolume.el, s.settings.sfxVolume],
        [musicVolume.el, s.settings.musicVolume],
      ] as const) {
        const want = String(Math.round(v * 100));
        if (document.activeElement !== r && r.value !== want) r.value = want;
        r.setAttribute('aria-valuetext', `${want} %`);
      }
    },
  };
  return { title: t('settings.title'), view };
}
