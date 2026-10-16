import { t } from '@i18n/index';
import { getLocation, type GameState } from '@core/GameState';
import { needsTerrace } from '@core/economy';
import type { Unlock } from '@data/unlocks';
import { menuTierIndex, type StationArea } from '@data/stations';
import type { StageId } from '@core/customers';

export function stationName(locationId: string, stationId: string): string {
  return t(`station.${locationId}.${stationId}.name`);
}

/** Name einer Matcha-Sorte. */
export function gradeName(grade: number): string {
  return t(`quality.tier.${String(Math.max(0, grade))}.name`);
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
    case 'grade':
      return t('unlock.grade', { name: gradeName(Number(u.id)) });
    case 'video':
      return t('unlock.video', { name: t(`social.format.${u.id}.name`) });
  }
}

/** Warum ein Gerät gesperrt ist: Café-Level zu niedrig oder kein Platz (Terrasse fehlt). */
export function lockedReason(s: GameState, locId: string, id: string, unlockLevel: number): string {
  if (getLocation(s, locId).level < unlockLevel) return t('ui.unlockAt', { level: unlockLevel });
  return needsTerrace(s, locId, id) ? t('ui.needsTerrace') : '';
}

/** Neuestes Produkt einer Linie auf der Karte bei diesem Level (Speisekarte, GAME_DESIGN § 4). */
export function productName(stationId: string, level: number): string {
  return t(`menu.${stationId}.${String(menuTierIndex(Math.max(1, level)))}`);
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
