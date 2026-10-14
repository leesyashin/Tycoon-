import { getLang, t } from '@i18n/index';
import type { Store } from '@core/store';
import { getLocation } from '@core/GameState';
import { getHypeProgress, getHypeRemaining, getIncomePerSec } from '@core/customers';
import { formatNumber } from '@core/math/format';

const REFRESH_MS = 250;

/** Minimal-HUD bis S3: Münzen, Einkommen/s, Hype-Balken. Liest nur aus dem Store. */
export function mountHud(root: HTMLElement, store: Store): () => void {
  root.innerHTML = '';
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.dataset.testid = 'hud';
  const coins = document.createElement('div');
  coins.dataset.testid = 'hud-coins';
  const hype = document.createElement('div');
  hype.className = 'hud-hype';
  const bar = document.createElement('div');
  bar.className = 'hud-hype-fill';
  const hypeLabel = document.createElement('span');
  hype.append(bar, hypeLabel);
  hud.append(coins, hype);
  if (import.meta.env.DEV) {
    const hint = document.createElement('div');
    hint.className = 'hud-hint';
    hint.textContent = t('scene.debugHint');
    hud.append(hint);
  }
  root.append(hud);

  const render = (): void => {
    const s = store.getState();
    const lang = getLang();
    const loc = getLocation(s, s.activeLocationId);
    const fmt = (v: Parameters<typeof formatNumber>[0]) =>
      formatNumber(v, lang, s.settings.numberFormat);
    coins.textContent = `${t('hud.coins')}: ${fmt(loc.coins)} · ${fmt(getIncomePerSec(s, s.activeLocationId))} ${t('hud.income')}`;
    const remaining = getHypeRemaining(s);
    const active = remaining > 0;
    bar.style.width = `${String(Math.round((active ? 1 : getHypeProgress(s)) * 100))}%`;
    hype.classList.toggle('active', active);
    hypeLabel.textContent = active
      ? t('hud.hypeActive', { sec: Math.ceil(remaining) })
      : t('hud.hype');
  };
  render();
  const timer = window.setInterval(render, REFRESH_MS);
  return () => window.clearInterval(timer);
}
