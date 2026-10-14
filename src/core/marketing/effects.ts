import { BALANCE } from '@data/balance';
import type { LocationState } from '../GameState';
import { getStaffLevel } from '../staff/effects';

export type CampaignPhase = 'ready' | 'active' | 'cooldown';

export interface CampaignStatus {
  phase: CampaignPhase;
  /** Restsekunden der aktuellen Phase (0 bei `ready`). */
  remainingSec: number;
}

export function campaignStatus(loc: LocationState, playtimeSec: number): CampaignStatus {
  const { campaignUntil, cooldownUntil } = loc.marketing;
  if (campaignUntil !== undefined && campaignUntil > playtimeSec) {
    return { phase: 'active', remainingSec: campaignUntil - playtimeSec };
  }
  if (cooldownUntil !== undefined && cooldownUntil > playtimeSec) {
    return { phase: 'cooldown', remainingSec: cooldownUntil - playtimeSec };
  }
  return { phase: 'ready', remainingSec: 0 };
}

export function campaignSpawnMult(loc: LocationState, playtimeSec: number): number {
  return campaignStatus(loc, playtimeSec).phase === 'active'
    ? BALANCE.marketing.campaignSpawnMult
    : 1;
}

/** Abklingzeit nach einer Kampagne; jede Social-Media-Stufe kürzt sie um 10 % (multiplikativ). */
export function campaignCooldownSec(loc: LocationState): number {
  const m = BALANCE.marketing;
  return (
    m.cooldownSec * (1 - m.cooldownReductionPerSocialMedia) ** getStaffLevel(loc, 'socialMedia')
  );
}
