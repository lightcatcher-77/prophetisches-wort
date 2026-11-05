# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


---

# Projekt-spezifisch: Prophetische Worte für Daniels Mitpatienten

Anonyme Eindrücke von Freunden für 22 Mitpatienten (Abschied Dienstag nächster Woche). Antworten und Texte auf Deutsch.

## Aufbau
- `index.html` + `config.js`: statische Seite auf GitHub Pages (https://lightcatcher-77.github.io/prophetisches-wort/).
- `worker/worker.js`: Cloudflare Worker (https://prophetisches-wort.daker1.workers.dev), hält den Notion-Token und schreibt in Notion.
- Notion: eine Datenbank „Patienten – Prophetische Worte“ (22 Seiten, eine pro Person mit Namen und Nr 1–22, Felder Geschlecht, Altersrange, Aktiv, Anzahl Eindrücke). Eindrücke stehen als Absätze im Seitenkörper der jeweiligen Person. Keine zweite Datenbank.
- `TEXTE.md`: alle sichtbaren Texte. Daniel bearbeitet sie dort und gibt sie zurück, dann in `index.html` übernehmen (beide synchron halten).

## Festlegungen von Daniel
- Titel: „Prophetische Ermutigungen für Daniels Mitpatienten“. Die Freunde wissen nur: Daniel ist in einer Klinik und macht das für seine Mitpatienten. Erklärung kurz halten.
- Wortwahl-Hinweis: Einige Patienten sind Christen, andere nicht. Sprache soll für alle passen (ohne Kirchensprache, keine Diagnosen/Vorhersagen).
- Eindrücke anonym; Besucher sehen nur Geschlecht und Altersrange (z. B. „Frau, 40-50 Jahre“). Maximal 400 Zeichen (Zettel).
- Faire Verteilung: Keine Person bekommt ein zweites Wort, bevor alle aktiven Personen mindestens eins haben. Danach sind mehrere Worte pro Person erlaubt, Daniel wählt am Ende das passendste aus. Umgesetzt über „Anzahl Eindrücke“ (Worker zählt nach jedem Abschicken neu).
- Nach dem Abschicken: weiterer Eindruck für eine andere Person oder eigenen Eindruck bearbeiten (Browser merkt sich die IDs).
- Eigene Notizen nicht in den Seitenkörper der Personen schreiben (Absätze zählen als Eindrücke).

## Betrieb
- Deploy Worker: `cd worker && npx wrangler@4 deploy`, Secret `NOTION_TOKEN` per `wrangler secret put`. Tokens (Notion, Cloudflare) nie ins Repo schreiben.
- `ALLOWED_ORIGIN` in `worker/wrangler.toml` = GitHub-Pages-Origin.
- Repo ist für Pages öffentlich; nach der Aktion wieder privat stellen.
- Tests gegen Notion: Testdaten (Aktiv, Geschlecht, Altersrange, Absätze, Zähler) danach immer wieder zurücksetzen.
