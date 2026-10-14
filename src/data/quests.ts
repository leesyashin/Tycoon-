/** Daily Quests nach GAME_DESIGN § 13.2. Fortschritt zählt ab dem Ziehen der Quest (Basiswert). */
export type QuestKind =
  'customersServed' | 'levelsBought' | 'satisfaction' | 'campaigns' | 'events' | 'taps';

export interface QuestDef {
  id: string;
  kind: QuestKind;
  target: number;
  /** `false`, solange das System dahinter fehlt (Events kommen in S7); dann wird die Quest nie gezogen. */
  enabled: boolean;
}

export const QUEST_CONFIG = {
  perDay: 3,
  rewardEach: 3,
  bonusAll: 5,
} as const;

export const QUESTS: readonly QuestDef[] = [
  { id: 'serve500', kind: 'customersServed', target: 500, enabled: true },
  { id: 'buy20', kind: 'levelsBought', target: 20, enabled: true },
  { id: 'satisfaction80', kind: 'satisfaction', target: 80, enabled: true },
  { id: 'campaign1', kind: 'campaigns', target: 1, enabled: true },
  { id: 'event1', kind: 'events', target: 1, enabled: false },
  { id: 'tap100', kind: 'taps', target: 100, enabled: true },
];

export function getQuestDef(id: string): QuestDef {
  const def = QUESTS.find((q) => q.id === id);
  if (!def) throw new Error(`Unknown quest: ${id}`);
  return def;
}
