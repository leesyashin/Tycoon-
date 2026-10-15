import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { needsTerrace } from '@core/economy';
import type { Unlock } from '@data/unlocks';
import type { StationArea } from '@data/stations';
import type { StageId } from '@core/customers';

export function stationName(locationId: string, stationId: string): string {
  return t(`station.${locationId}.${stationId}.name`);
}

/** Anzeigename einer Freischaltung aus `data/unlocks`. */
export function unlockLabel(locationId: string, u: Unlock): string {
  switch (u.kind) {
    case 'station':
      return stationName(locationId, u.id);
    case 'ambience':
      return t(`ambience.${u.id}.name`);
    case 'staff':
      return t(`staff.${u.id}.name`);
    case 'quality':
      return t('unlock.quality', { name: t(`quality.tier.${u.id}.name`) });
    case 'marketing':
      return t('unlock.marketing');
  }
}

/** Warum eine Station gesperrt ist: Café-Level zu niedrig oder kein Platz (Terrasse fehlt). */
export function lockedReason(s: GameState, locId: string, id: string, unlockLevel: number): string {
  if (getLocation(s, locId).level < unlockLevel) return t('ui.unlockAt', { level: unlockLevel });
  return needsTerrace(s, locId, id) ? t('ui.needsTerrace') : '';
}

/** Produktname einer Station in der aktuellen Qualitätsstufe, z. B. „Premium-Matcha-Latte“ (nur Text). */
export function productName(stationId: string, quality: number): string {
  return t('product.format', {
    quality: t(`quality.tier.${String(quality)}.prefix`),
    product: t(`product.${stationId}`),
  });
}

/** Name einer Stufe der Service-Pipeline (GAME_DESIGN § 7.2). */
export function stageName(stage: StageId): string {
  return t(`stage.${stage}`);
}

/** Name eines Theken-Bereichs (§ 4). */
export function areaName(area: StationArea): string {
  return t(`station.area.${area}`);
}

export function roleName(role: string): string {
  return t(`staff.${role}.name`);
}
