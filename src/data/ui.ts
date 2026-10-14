/** Zeit- und Anzeige-Konstanten der DOM-UI (keine Spielbalance, aber ebenfalls nicht im Code verstreut). */
export const UI_CONFIG = {
  autosaveMs: 10_000,
  /** Takt für Quest-Tageswechsel und Achievement-Prüfung (Wanduhr-abhängig). */
  progressionMs: 1_000,
  /** Wie oft das Overlay höchstens neu rendert. */
  renderMs: 200,
  toastMs: 3_500,
  /** Kürzere Abwesenheit zeigt keinen Offline-Dialog. */
  offlineDialogMinSec: 60,
  /** Anzahl IndexedDB-Backups (PLAN § 2.3). */
  backupCount: 3,
  /** Schwellen für Stimmungs-Symbole (HUD und Smileys über den Kunden). */
  mood: { happyFrom: 60, neutralFrom: 40 },
  licensesUrl: 'https://github.com/leesyashin/Tycoon-/blob/main/docs/ASSETS.md',
} as const;
