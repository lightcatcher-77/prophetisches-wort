# Ein Wort für dich

Statische Seite (GitHub Pages) + kleiner Cloudflare Worker, der Eindrücke in eine private Notion-Datenbank schreibt.

## Einrichtung
1. **Notion-Integration**: https://www.notion.so/profile/integrations → neue interne Integration → Token kopieren. Die Datenbank „Patienten – Prophetische Worte“ über „Verbindungen“ mit der Integration teilen. Eindrücke erscheinen als Absätze auf der Seite der jeweiligen Person.
2. **Worker**: `cd worker && npm i -g wrangler && wrangler login && wrangler secret put NOTION_TOKEN && wrangler deploy`
3. Worker-URL in `config.js` eintragen, `ALLOWED_ORIGIN` in `worker/wrangler.toml` auf die Pages-URL setzen.
4. GitHub → Settings → Pages → Branch `main`, Ordner `/ (root)`.
5. In Notion bei jeder Person „Geschlecht“ (Auswahl) und „Altersrange“ (Text, z. B. *55–65*) eintragen und „Aktiv“ anhaken.
