import type { GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { UI_CONFIG } from '@data/ui';

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

/** Kleines `createElement` mit Attributen; `on*`-Handler werden über `on()` gesetzt, nicht hier. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('data-')) el.dataset[toCamel(k.slice(5))] = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

function toCamel(s: string): string {
  return s.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
}

export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
): void {
  el.addEventListener(type, fn);
}

/** Eine Komponente baut ihr DOM einmal und aktualisiert danach nur Texte/Zustände. */
export interface View {
  el: HTMLElement;
  update(state: GameState): void;
  destroy?(): void;
}

/**
 * Hängt `view` in `root` und hält sie per `store.subscribe` aktuell. Der Store meldet jeden
 * Tick; gerendert wird höchstens alle `renderMs`, damit das Overlay die Szene nicht bremst.
 */
export function mount(root: HTMLElement, view: View, store: Store): () => void {
  root.append(view.el);
  view.update(store.getState());
  let timer: number | undefined;
  const flush = (): void => {
    timer = undefined;
    view.update(store.getState());
  };
  const unsubscribe = store.subscribe(() => {
    timer ??= window.setTimeout(flush, UI_CONFIG.renderMs);
  });
  return () => {
    unsubscribe();
    if (timer !== undefined) window.clearTimeout(timer);
    view.destroy?.();
    view.el.remove();
  };
}

/** Setzt Text nur bei Änderung (spart Layout-Arbeit bei 5 Updates/s). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}
