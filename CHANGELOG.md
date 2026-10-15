# Changelog

Alle nennenswerten Änderungen an Matcha Café Empire. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionen nach [SemVer](https://semver.org/lang/de/).

## [1.0.0] – 2026-10-15

Erste vollständige Version: ein Idle-/Tycoon-Spiel im Browser, zweisprachig (DE/EN), mobil zuerst, mit lokalem Spielstand und ohne Werbung oder Käufe. Entstanden in zehn Sessions (S0–S9, siehe `docs/PLAN.md`).

### S9 – Balancing, Tutorial, Release

- Balancing-Pass: Die Balance-Sim (`pnpm sim`) trifft alle Richtwerte aus GAME_DESIGN § 15 innerhalb ±20 % (Tabelle in `docs/STATUS.md`). Café-Level folgt einer Stufen-Tabelle.
- Kundentypen wirken jetzt im Rate-Modell: Touristen kaufen eher Merch, Stammgäste geben mehr Trinkgeld, Kritiker gewichten die Zufriedenheit doppelt, Influencer lösen kurzen Hype aus.
- Tutorial mit 8 Schritten (Highlight und Sprechblase), überspringbar, wiederholbar in den Einstellungen.
- PWA: installierbar, Offline-Start, Update-Hinweis statt stillem Austausch, Splash.
- Robustheit: Sicherungen aus IndexedDB wiederherstellen, Fehler-Dialog mit Spielstand-Export, Schutz gegen Zurückstellen der Uhr, gesperrte Service Worker bremsen das Spiel nicht mehr.
- Performance: schlanker Phaser-Build (nur genutzte Module, ohne ungenutzte Shader), Szene lädt im Leerlauf nach, Autosave im Leerlauf. Lighthouse Performance (Mobile) ≥ 80.
- Spielstand-Schema v8 mit Migration.

### S8 – Grafik und Audio

- Flat-Shaded-Iso-Grafik als Code gezeichnet (Stationen in 3 Ausbaustufen, Kundentypen, Personal, Ambiente, Böden/Wände je Standort), Texture-Atlas mit Lazy-Loading je Standort.
- UI-Skin nach `docs/UI_STYLE.md`: HUD-Pillen, Bottom-Bar, Stations-Bottom-Sheet, Verwaltungs-Screen mit Statistik.
- Tag/Nacht, Fortschrittsringe, Münz-Flug, Dampf, Emotes; alles aus bei „Bewegung reduzieren“.
- Synthetisierte Klänge und Lo-fi-Loop (Web Audio, keine Dateien), Lautstärke-Regler.

### S7 – Events, Boosts, Premium-Währung

- Zufalls-Events (Hitzewelle, Influencer-Besuch, Lieferengpass, Food-Blogger, Regentag) und Kalender-Events (Hanami, Sommer, Neujahr).
- Goldene Blätter: Zeitsprung, Boosts, Quest-Sofortabschluss, Skins; Gratis-Boost alle 20 min.
- Monetarisierung nur als ausgeschaltetes Interface (`MONETIZATION_ENABLED = false`).

### S6 – Standorte und Prestige

- Sechs Standorte von Berlin bis Bali mit eigener Skalierung, Franchise-Reset gegen Zen, Zen-Shop mit Meta-Upgrades.

### S5 – Progression

- Café-Level mit Freischaltungen, Matcha-Qualitätsstufen, Erfolge und Tagesaufgaben.

### S4 – Personal, Zufriedenheit, Marketing

- Sieben Personal-Rollen, Sauberkeit und Zufriedenheit mit erklärten Einzelbeiträgen, Marketing-Level und Kampagnen, Auto-Kauf durch den Filialleiter.

### S3 – UI/HUD und Shop

- DOM-Overlay mit HUD, Shop, Panels, Einstellungen (Sprache, Zahlenformat, Export/Import, Löschen), Offline-Dialog, Tastatur- und Screenreader-Bedienung.

### S2 – Iso-Szene und Kunden

- Isometrisches Café in Phaser, kosmetische Kunden-Figuren, Tap-Bonus mit Hype.

### S1 – Core-Ökonomie

- Rate-Modell, Spiel-Schleife, Offline-Einnahmen, Spielstand mit Migrationen, Zahlenformat, Balance-Simulation – alles pur und getestet in `src/core`.

### S0 – Projekt-Setup

- Vite + TypeScript + Phaser 3, ESLint/Prettier, Vitest, Playwright, CI auf jedem Pull Request.
