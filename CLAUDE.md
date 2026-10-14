# CLAUDE.md – Matcha Café Empire

Idle-/Tycoon-Browserspiel (Matcha-Cafés statt Hotels). Web-App mit Vite + TypeScript + Phaser 3, DOM-Overlay für UI, i18n DE/EN, lokale Saves, Monetarisierung nur als No-op-Interface.

## Pflichtlektüre zu Session-Beginn

1. `docs/STATUS.md` – was die letzte Session hinterlassen hat
2. `docs/PLAN.md` – Architektur (§ 2) und der Abschnitt der aktuellen Session (§ 3)
3. `docs/GAME_DESIGN.md` – nur die dort referenzierten Paragraphen
4. `docs/UI_STYLE.md` – sobald die Session UI oder Szene-Optik baut oder ändert (§ 2 Tokens, § 3 Komponenten, § 4 Szene)

## Befehle

```
pnpm install        Abhängigkeiten
pnpm dev            Dev-Server
pnpm check          lint + typecheck + test  (muss vor jedem Push grün sein)
pnpm test           Vitest
pnpm e2e            Playwright
pnpm sim --hours 2  Headless-Balancing-Simulation
pnpm build          Produktions-Build (base: /Tycoon-/)
```

## Harte Regeln

- `src/core` importiert **nie** aus `phaser` oder dem DOM. Alles dort ist pur und getestet.
- Einzige Quelle der Wahrheit ist `GameState`. Szene und UI lesen, schreiben nur über Actions in `core`.
- Währungen sind immer `Decimal` (break_infinity.js), nie `number`.
- Kein Balancing-Wert hart im Code. Alles in `src/data/*`.
- Jeder sichtbare String kommt aus `t()`; `de.json` und `en.json` haben identische Keys.
- UI-Stil ist `docs/UI_STYLE.md` (Hotel-Empire-Look, Flat-Shaded). Neue UI-Elemente folgen den Komponenten in § 3; Farben, Radien und Schriften nur über die Tokens aus § 2, nie als Hex-Wert im Code. Grafikstil der Szene ist Flat-Shaded-Iso, kein Pixel-Art.
- Kunden-Figuren in der Szene sind kosmetisch. Einnahmen entstehen nur aus dem Rate-Modell in `core`.
- Save-Schema-Änderung = `schemaVersion` hochzählen + Migration + Test.
- Assets nur mit dokumentierter Lizenz in `docs/ASSETS.md`. Nichts aus kommerziellen Spielen.
- `MONETIZATION_ENABLED` bleibt `false`; kein Ad-/Payment-SDK im Bundle.
- Keine neuen Abhängigkeiten ohne Eintrag unter „Entscheidungen“ in `docs/STATUS.md`.

## Arbeitsweise

- Branch pro Session: `session/sN-kurzname`, Draft-PR mit Abnahme-Checkliste aus `docs/PLAN.md`.
- Conventional Commits, kleine Commits.
- `docs/STATUS.md` am Ende jeder Session aktualisieren (Struktur in PLAN.md § 4). Ohne aktualisierte STATUS.md ist die Session nicht fertig.
- Scope-Ideen außerhalb der Session-Aufgaben kommen in STATUS.md „Offen“, nicht in den Branch.
- Mobile zuerst (Portrait), Desktop danach. 60 fps auf Mittelklasse-Handy ist das Ziel.

## Code-Stil

- TypeScript strict, ESLint (typescript-eslint strict) + Prettier.
- Funktionen in `core` sind pure Funktionen `(state, …) → newState` oder mutieren einen klar übergebenen Draft; keine globalen Singletons außer dem Store.
- Dateinamen: `camelCase.ts` für Module, `PascalCase.ts` für Klassen/Szenen.
- Kommentare erklären das Warum, nicht das Was. Code-Bezeichner englisch, Spieltexte über i18n.
