/** Zeit- und Anzeige-Konstanten der DOM-UI (keine Spielbalance, aber ebenfalls nicht im Code verstreut). */
export const UI_CONFIG = {
  /** Bildrate der Szene, wenn der Browser ohne GPU rendert (siehe `isSoftwareRenderer` in game.ts). */
  softwareFpsLimit: 30,
  autosaveMs: 10_000,
  /** Autosave wartet auf Leerlauf, aber höchstens so lange. */
  autosaveIdleTimeoutMs: 2_000,
  /** Takt für Quest-Tageswechsel und Achievement-Prüfung (Wanduhr-abhängig). */
  progressionMs: 1_000,
  /** Splash (S9): Ausblenden dauert so lange; spätestens nach splashMaxMs ist er weg. */
  splashFadeMs: 300,
  splashMaxMs: 8_000,
  /** Phaser startet im ersten Leerlauf, spätestens nach dieser Zeit. */
  gameStartMaxWaitMs: 1_500,
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

/** Licht im Tag/Nacht-Wechsel der Spieluhr (UI_STYLE § 4, Uhr in `data/time.ts`). Stunden 0..24. */
export const DAY_CYCLE = {
  duskFrom: 18,
  nightFrom: 21,
  nightTo: 5,
  dawnTo: 7,
  /** Deckkraft des Nacht-Overlays bei voller Nacht (Multiply, § 2.1 `--c-night`). */
  nightAlpha: 0.35,
} as const;

/**
 * Spiegel der CSS-Tokens aus `src/ui/style.css` (UI_STYLE § 2.1) für die Phaser-Szene.
 * Einzige Stelle neben `style.css`, an der Hex-Werte der UI stehen.
 */
export const UI_THEME = {
  primary: 0x4e64fb,
  primaryDeep: 0x1d457b,
  navy: 0x011747,
  navy900: 0x0e182b,
  success: 0x51c267,
  successDeep: 0x27d436,
  gold: 0xffb929,
  danger: 0xf33838,
  /** Tieferes Rot für weiße Schrift (`--c-danger-ink`, 5,7:1). */
  dangerInk: 0xc42727,
  cash: 0x3fb950,
  gem: 0xffd23f,
  surface: 0xffffff,
  ink: 0x1b2340,
  night: 0x3a3f8f,
  /** Graue Tönung bei Wolken und Regen (§ 2.1 `--c-overcast`, Multiply). */
  overcast: 0x8a96ad,
  /** Regentropfen (§ 2.1 `--c-rain`): hell genug für Asphalt, dunkel genug für helle Böden. */
  rain: 0x9db8dc,
  /** Warmes Fenster-/Lampenlicht nachts (§ 4 „Tag/Nacht“). */
  lampGlow: 0xffd27a,
  /** Als CSS-String für Phaser-Texte. */
  textCss: '#ffffff',
  inkCss: '#1b2340',
  goldCss: '#ffb929',
  /** Rote 7-Segment-Ziffern der Warteschlangen-Tafel (§ 3.10). */
  ledCss: '#f33838',
  /** Kosten und Warnungen in der Szene (`--c-danger`). */
  dangerCss: '#f33838',
  fontUi: 'Poppins, system-ui, sans-serif',
} as const;
