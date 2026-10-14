# Autonomer Session-Loop (Routine)

Ziel: Opus 5.5 arbeitet die Sessions S0–S9 aus `docs/PLAN.md` nacheinander ab. Jede Session läuft in einem
**eigenen, frischen Chat** (eigenes Kontextfenster). Gesteuert wird das über eine **Routine** (geplante Aufgabe)
in Claude Code, die alle 2 Stunden feuert und dabei jedes Mal eine neue Session startet. Die Übergabe zwischen
den Sessions läuft ausschließlich über `docs/STATUS.md` im Repo.

Ablauf pro Feuern:

```
Routine feuert (alle 2 h)
  └─ neue Session, frisches Kontextfenster
       ├─ liest docs/STATUS.md
       ├─ läuft schon eine Session?  → sofort beenden
       ├─ Loop blockiert oder fertig? → sofort beenden (fertig: Routine deaktivieren)
       └─ sonst: nächste Session S<N> umsetzen
            ├─ Branch, Code, pnpm check grün
            ├─ PR, CI abwarten, selbst mergen
            ├─ STATUS.md: Nächste Session = S<N+1>
            └─ kurze Zusammenfassung + Benachrichtigung
```

Es gibt zwei Prompts. **Prompt A** fügst du einmal von Hand in eine Opus-5.5-Session auf diesem Repo ein.
**Prompt B** ist der Text, den Opus in die Routine schreibt; er steht hier nur, damit er versioniert ist und du
ihn prüfen oder anpassen kannst.

---

## Prompt A – Einrichtung (einmal von dir in Opus 5.5 einfügen)

```
Du richtest für mich einen autonomen Entwicklungs-Loop für dieses Repo (leesyashin/Tycoon-) ein.
Lies zuerst docs/ROUTINE.md vollständig, dann CLAUDE.md und docs/PLAN.md § 3 und § 4.

Mach genau Folgendes, in dieser Reihenfolge:

1. Prüfe, ob der Pull Request mit dem Plan (Titel beginnt mit „docs: Umsetzungsplan“) schon gemergt ist.
   Falls nicht: merge ihn (Squash) nach main, damit docs/PLAN.md, docs/GAME_DESIGN.md, docs/ROUTINE.md
   und CLAUDE.md auf main liegen.

2. Lege auf main die Datei docs/STATUS.md an, exakt mit dieser Struktur (siehe auch PLAN.md § 4):

   # STATUS
   ## Loop
   state: idle
   current: -
   branch: -
   started: -
   next: S0
   ## Letzte Session
   keine
   ## Fertig
   -
   ## Offen / bekannte Bugs
   -
   ## Entscheidungen, die vom Plan abweichen
   -
   ## Nächste Session: S0
   Startpunkt: PLAN.md § 3, Abschnitt S0.
   ## Balancing-Snapshot
   noch keiner

   Committe und pushe sie direkt auf main (Commit: „docs: initialize STATUS.md for session loop“).

3. Erstelle eine geplante Aufgabe (Routine) mit dem Tool create_trigger und diesen Einstellungen:
   - name: „Matcha Café Empire – Session-Loop“
   - cron_expression: 0 */2 * * *   (alle 2 Stunden)
   - create_new_session_on_fire: true   (jede Session ist ein neuer Chat mit frischem Kontext)
   - notifications: { push: true, email: true }
   - initiation: human_request
   - prompt: der vollständige Text von „Prompt B“ aus docs/ROUTINE.md, Wort für Wort, ohne die
     umschließenden Code-Zeichen.
   Wenn das Ergebnis warnt, dass die Routine keine Connectors speichert, sag mir das wörtlich und nenne
   die Abhilfe aus der Warnung.

4. Feuere die Routine einmal sofort mit fire_trigger, damit Session S0 ohne Wartezeit startet.

5. Melde mir am Ende in wenigen Zeilen: Trigger-ID, Zeitplan, nächster Lauf, und ob der Sofort-Start
   ausgelöst wurde. Erkläre, dass ich den Loop jederzeit unter „Routinen“ pausieren kann und dass ich
   ihn mit einem einzigen Wort stoppe, indem ich in docs/STATUS.md unter ## Loop „state: blocked“ setze.
```

---

## Prompt B – Routine-Prompt (steht in der geplanten Aufgabe, jede Session bekommt ihn frisch)

```
Du bist eine autonome Entwicklungs-Session für das Projekt „Matcha Café Empire“ (Repo leesyashin/Tycoon-).
Du hast keinen Kontext aus früheren Sessions. Alles, was du wissen musst, steht im Repo. Niemand liest
während deiner Arbeit mit; du stellst keine Fragen, sondern entscheidest selbst und dokumentierst.

SCHRITT 0 – Lesen
- Lies CLAUDE.md, dann docs/STATUS.md vollständig.
- Lies in docs/PLAN.md § 2 (Architektur) und § 4 (Übergabe-Protokoll).

SCHRITT 1 – Loop-Zustand prüfen (Block „## Loop“ in docs/STATUS.md)
- state = running UND started liegt weniger als 3 Stunden zurück:
  Eine andere Session arbeitet noch. Beende dich sofort ohne Änderung, eine Zeile als Begründung.
- state = running UND started liegt 3 Stunden oder länger zurück:
  Die Session ist abgebrochen. Prüfe, ob der Branch aus „branch:“ auf origin existiert. Wenn ja, arbeite
  auf ihm weiter (Schritt 3), sonst starte die Session neu. Vermerke den Abbruch unter „## Offen“.
- state = blocked: Ein Mensch oder eine frühere Session hat den Loop angehalten. Beende dich sofort
  ohne Änderung.
- state = done: Alle Sessions sind fertig. Deaktiviere die Routine, die dich gestartet hat, mit
  update_trigger (enabled: false; die Trigger-ID findest du mit list_triggers über den Namen
  „Matcha Café Empire – Session-Loop“). Dann beende dich.
- state = idle: weiter mit Schritt 2.

SCHRITT 2 – Lock setzen
- Lies „next:“ (z. B. S3). Das ist deine Session N.
- Setze im Loop-Block: state: running, current: S<N>, branch: session/s<N>-<kurzname aus PLAN.md>,
  started: <jetzt, ISO 8601 UTC>.
- Committe nur diese Änderung direkt auf main und pushe („chore: lock session S<N>“). Wenn der Push
  fehlschlägt, weil main sich geändert hat: pull, erneut prüfen (Schritt 1), erneut pushen.

SCHRITT 3 – Session umsetzen
- Branch session/s<N>-<kurzname> von main anlegen (oder auschecken, falls er schon existiert: dann
  weiterarbeiten, nicht neu beginnen; lies dazu den Abschnitt „Nächste Session“ in STATUS.md).
- Setze den Abschnitt S<N> aus docs/PLAN.md § 3 vollständig um. Lies dafür die dort referenzierten
  Paragraphen von docs/GAME_DESIGN.md. Halte alle Regeln aus CLAUDE.md ein.
- Für S0: Richte zusätzlich package.json-Skripte check, test, e2e, sim, build so ein, wie CLAUDE.md
  sie nennt, und eine GitHub-Actions-CI, die „pnpm check“ auf jedem PR ausführt.
- Arbeite in kleinen Commits (Conventional Commits). Pushe den Branch regelmäßig, mindestens alle
  30 Minuten, damit bei einem Abbruch nichts verloren geht.
- Vor dem Abschluss muss „pnpm check“ (lint, typecheck, test) lokal grün sein. Ab S3 zusätzlich
  „pnpm e2e“, ab S1 zusätzlich „pnpm sim --hours 1“ ohne Fehler.
- Scope-Ideen außerhalb der Session-Aufgaben kommen nach STATUS.md „## Offen“, nicht in den Code.

SCHRITT 4 – Abschluss der Session
Fall A: Alle Abnahmekriterien von S<N> erfüllt
- Aktualisiere docs/STATUS.md auf dem Session-Branch nach PLAN.md § 4: „Letzte Session: S<N> …“,
  Fertig, Offen, Entscheidungen, „Nächste Session: S<N+1>“ mit konkretem Startpunkt und Fallen,
  Balancing-Snapshot (ab S1 die Ausgabe von pnpm sim).
- Pushe. Erstelle einen Pull Request (kein Draft) nach main. Titel: „S<N>: <Name der Session>“.
  Body: die Abnahme-Checkliste aus PLAN.md mit [x], was erfüllt ist.
- Warte auf die CI des PRs. Prüfe alle 2 Minuten den Check-Status (höchstens 15 Minuten).
  - CI grün: merge den PR selbst (Squash). Lösche den Branch.
  - CI rot: analysiere das Log, fixe, pushe, warte erneut. Höchstens 3 Fix-Runden. Danach weiter mit Fall C.
- Nach dem Merge: Setze auf main im Loop-Block state: idle, current: -, branch: -, started: -,
  next: S<N+1>. Wenn N = 9 war: state: done, next: -. Committe und pushe („chore: unlock after S<N>“).

Fall B: Session ist zu groß für einen Durchlauf (du merkst, dass dein Kontext knapp wird oder mehr als
etwa 90 Minuten gearbeitet wurde und noch viel fehlt)
- Bring den Code in einen Zustand, in dem „pnpm check“ grün ist (unfertige Teile hinter einem
  Feature-Flag oder TODO-Test mit .skip und Kommentar WARUM).
- Aktualisiere docs/STATUS.md auf dem Branch: „Nächste Session: S<N> (Fortsetzung)“ mit einer genauen
  Liste, was fertig ist und wo weitergemacht wird. Pushe den Branch. Keinen PR erstellen.
- Setze auf main im Loop-Block state: idle, next: S<N> (gleiche Nummer), current: -, started: -,
  branch: session/s<N>-<kurzname> (damit die nächste Session den Branch findet). Committe, pushe.

Fall C: Du kommst nicht weiter (CI nach 3 Runden rot, Tool fehlt, Netzwerk gesperrt, Entscheidung
nötig, die nur Vincent treffen kann)
- Pushe alles, was du hast, auf den Session-Branch.
- Setze auf main im Loop-Block state: blocked und schreibe unter STATUS.md „## Offen“ ganz oben
  „BLOCKIERT: <was genau fehlt und was Vincent tun muss>“. Committe, pushe.
- Melde das Problem in deiner Abschlussnachricht als erstes.

SCHRITT 5 – Abschlussnachricht (immer, auch bei sofortigem Beenden)
Höchstens 10 Zeilen: Welche Session, Fall A/B/C, PR-Link, was fertig ist, was die nächste Session
tut, Link zum GitHub-Pages-Deploy (ab S0). Keine Codeblöcke, keine Dateidumps.

REGELN
- Du mergst nur deinen eigenen Session-PR und nur bei grüner CI. Nichts anderes auf main anfassen
  außer docs/STATUS.md.
- Nie Tests löschen, skippen oder abschwächen, um grün zu werden (Ausnahme: der dokumentierte
  .skip in Fall B für noch nicht gebaute Teile).
- Nie Force-Push. Nie History umschreiben.
- Keine Modellnamen in Commits, PRs oder Code.
- Wenn du dir bei einer Spieldesign-Frage unsicher bist, entscheide im Sinne von GAME_DESIGN.md und
  halte die Entscheidung in STATUS.md unter „Entscheidungen“ fest. Nicht fragen.
```

---

## Hinweise für Vincent

- **Pausieren:** Unter „Routinen“ in Claude Code die Aufgabe deaktivieren. Eine laufende Session läuft zu Ende, es startet nur keine neue.
- **Stoppen per Datei:** In `docs/STATUS.md` unter `## Loop` den Eintrag `state: blocked` setzen und auf main pushen. Die nächste Session beendet sich sofort.
- **Weiterlaufen lassen nach Blocker:** Problem beheben, `state: idle` setzen, pushen. Beim nächsten Feuern geht es weiter.
- **Verbrauch:** Alle 2 Stunden ein Start. Sessions, die nichts zu tun haben, beenden sich nach wenigen Sekunden und kosten fast nichts. Eine echte Session dauert typischerweise 30–90 Minuten.
- **Umgebung:** Die Cloud-Umgebung der Routine braucht Netzwerkzugang für `pnpm install` (npm-Registry) und Push-Rechte auf das Repo. Falls S0 unter Fall C mit „Netzwerk gesperrt“ blockiert, in den Umgebungs-Einstellungen die Netzwerk-Policy lockern.
- **Die Routine stoppt sich selbst** nach S9 (state: done) und deaktiviert die geplante Aufgabe.
