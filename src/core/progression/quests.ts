import { QUESTS, QUEST_CONFIG, type QuestDef, type QuestKind } from '@data/quests';
import { getLocation, grantLeaves, type GameState, type QuestItem } from '../GameState';
import { hashString, rng } from '../math/random';

const MS_PER_MIN = 60_000;

/**
 * Lokaler Kalendertag `YYYY-MM-DD`. `tzOffsetMin` wie `Date#getTimezoneOffset()` (UTC − lokal, Minuten),
 * damit `core` keine Systemzeitzone liest und Tests jede Zone durchspielen können.
 */
export function localDateKey(now: number, tzOffsetMin: number): string {
  return new Date(now - tzOffsetMin * MS_PER_MIN).toISOString().slice(0, 10);
}

export function localHour(now: number, tzOffsetMin: number): number {
  return new Date(now - tzOffsetMin * MS_PER_MIN).getUTCHours();
}

/** Zieht `perDay` verschiedene aktive Quests, Seed = Datum (GAME_DESIGN § 13.2). */
export function pickDailyQuests(dateKey: string): QuestDef[] {
  const pool = QUESTS.filter((q) => q.enabled);
  const rand = rng(hashString(dateKey));
  const out: QuestDef[] = [];
  while (out.length < Math.min(QUEST_CONFIG.perDay, pool.length)) {
    const i = Math.floor(rand() * pool.length);
    const [q] = pool.splice(i, 1);
    if (q) out.push(q);
  }
  return out;
}

/** Zählerstand für Zähler-Quests; Zufriedenheit ist ein Zustand (aktiver Standort, gerundet). */
export function questStat(state: GameState, kind: QuestKind): number {
  const st = state.stats;
  switch (kind) {
    case 'customersServed':
      return st.customersServed;
    case 'levelsBought':
      return st.levelsBought;
    case 'campaigns':
      return st.campaigns;
    case 'events':
      return st.events;
    case 'taps':
      return st.taps;
    case 'satisfaction':
      return Math.round(getLocation(state, state.activeLocationId).satisfaction);
  }
}

function questDef(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

/** Neuer Tag → neue Quests (unerledigte verfallen, nicht nachholbar). Sonst unverändert. */
export function refreshQuests(state: GameState, now: number, tzOffsetMin: number): GameState {
  const date = localDateKey(now, tzOffsetMin);
  // Nur vorwärts: Zurückstellen der Uhr würfelt keine neuen Tagesaufgaben (`YYYY-MM-DD` sortiert als Text).
  if (state.quests.date >= date) return state;
  const items: QuestItem[] = pickDailyQuests(date).map((q) => ({
    id: q.id,
    base: q.kind === 'satisfaction' ? 0 : questStat(state, q.kind),
    progress: 0,
    claimed: false,
  }));
  return { ...state, quests: { date, items, bonusClaimed: false } };
}

/** Fortschritt nachziehen; gibt dieselbe Referenz zurück, wenn sich nichts ändert. */
export function updateQuestProgress(state: GameState): GameState {
  let changed = false;
  const items = state.quests.items.map((it) => {
    const def = questDef(it.id);
    if (!def || it.claimed) return it;
    const value = questStat(state, def.kind);
    // Zustands-Quests zählen den Bestwert des Tages, Zähler-Quests die Differenz zum Basiswert.
    const raw = def.kind === 'satisfaction' ? Math.max(it.progress, value) : value - it.base;
    const progress = Math.min(def.target, Math.max(0, Math.floor(raw)));
    if (progress === it.progress) return it;
    changed = true;
    return { ...it, progress };
  });
  return changed ? { ...state, quests: { ...state.quests, items } } : state;
}

export function isQuestComplete(item: QuestItem): boolean {
  const def = questDef(item.id);
  return def !== undefined && item.progress >= def.target;
}

/** Holt die Belohnung einer erledigten Quest ab; die letzte der drei bringt den Bonus mit. */
export function claimQuest(state: GameState, index: number): GameState {
  const item = state.quests.items[index];
  if (!item || item.claimed || !isQuestComplete(item)) return state;
  const items = state.quests.items.map((it, i) => (i === index ? { ...it, claimed: true } : it));
  const allDone = items.length > 0 && items.every((it) => it.claimed);
  const bonus = allDone && !state.quests.bonusClaimed;
  const next: GameState = {
    ...state,
    quests: { ...state.quests, items, bonusClaimed: state.quests.bonusClaimed || bonus },
    stats: { ...state.stats, questsCompleted: state.stats.questsCompleted + 1 },
  };
  return grantLeaves(next, QUEST_CONFIG.rewardEach + (bonus ? QUEST_CONFIG.bonusAll : 0));
}
