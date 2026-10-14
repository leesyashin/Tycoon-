import { getLang, t } from '@i18n/index';

export function mountHud(root: HTMLElement): void {
  root.innerHTML = '';
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.dataset.testid = 'hud';
  hud.textContent = `${t('hud.coins')}: 0 · ${t('hud.language')}: ${getLang().toUpperCase()}`;
  root.append(hud);
}
