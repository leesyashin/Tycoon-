import type { CustomerTypeId } from './customerTypes';

/**
 * Stammgäste (GAME_DESIGN § 7.5 „Stammgast = wiederkehrende Figur“, kosmetisch): je Standort vier feste Figuren mit
 * Namen (`regular.<standort>.<id>` in i18n), Aussehen (`CUSTOMER_LOOKS`) und Uhrzeit. Kommt zu ihrer Stunde ein
 * neuer Gast, ist es der Stammgast – höchstens einmal am Spieltag und nur, wenn das Café dann geöffnet hat; an der
 * Tür winkt er, die Kasse grüßt zurück, sein Name steht kurz über ihm. Gerechnet wird wie immer nur in `core`.
 */
export interface RegularDef {
  id: string;
  type: CustomerTypeId;
  look: string;
  /** Stunde, ab der er kommt (bis `REGULAR_FX.windowMin` Spielminuten danach). */
  hour: number;
}

export const REGULARS: Readonly<Record<string, readonly RegularDef[]>> = {
  berlin: [
    { id: 'lena', type: 'regular', look: 'pilates', hour: 8 },
    { id: 'jonas', type: 'student', look: 'softboy', hour: 11 },
    { id: 'ali', type: 'regular', look: 'startup', hour: 13 },
    { id: 'mila', type: 'regular', look: 'raver', hour: 16 },
  ],
  kyoto: [
    { id: 'haruka', type: 'regular', look: 'pilates', hour: 9 },
    { id: 'kenji', type: 'regular', look: 'startup', hour: 12 },
    { id: 'yui', type: 'student', look: 'clawclip', hour: 14 },
    { id: 'sora', type: 'student', look: 'mullet', hour: 17 },
  ],
  tokyo: [
    { id: 'ren', type: 'regular', look: 'startup', hour: 8 },
    { id: 'aoi', type: 'influencer', look: 'selfie', hour: 12 },
    { id: 'mei', type: 'regular', look: 'raver', hour: 15 },
    { id: 'daichi', type: 'student', look: 'gorpcore', hour: 17 },
  ],
  seoul: [
    { id: 'minji', type: 'student', look: 'clawclip', hour: 9 },
    { id: 'jisoo', type: 'regular', look: 'pilates', hour: 12 },
    { id: 'hyun', type: 'student', look: 'mullet', hour: 15 },
    { id: 'seoyeon', type: 'influencer', look: 'selfie', hour: 17 },
  ],
  newyork: [
    { id: 'maya', type: 'regular', look: 'startup', hour: 8 },
    { id: 'jordan', type: 'student', look: 'gorpcore', hour: 11 },
    { id: 'priya', type: 'regular', look: 'pilates', hour: 14 },
    { id: 'sam', type: 'critic', look: 'beret', hour: 17 },
  ],
  bali: [
    { id: 'putu', type: 'tourist', look: 'sandals', hour: 9 },
    { id: 'kadek', type: 'regular', look: 'raver', hour: 12 },
    { id: 'wayan', type: 'tourist', look: 'sunhat', hour: 15 },
    { id: 'nyoman', type: 'tourist', look: 'backpacker', hour: 17 },
  ],
};

export const REGULAR_FX = {
  /** So lange nach ihrer vollen Stunde kann ein Stammgast noch kommen (Spielminuten). */
  windowMin: 50,
  /** Name über dem Kopf (Sekunden) und Pause, bis die Kasse zurückgrüßt. */
  labelSec: 3.2,
  replySec: 0.7,
} as const;

export function regularsOf(locationId: string): readonly RegularDef[] {
  return REGULARS[locationId] ?? [];
}
