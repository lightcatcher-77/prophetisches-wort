// Cloudflare Worker: vermittelt zwischen der GitHub-Page und Notion.
// Der Notion-Token bleibt hier geheim (Secret NOTION_TOKEN) und ist nie im Browser sichtbar.
const NOTION = "https://api.notion.com/v1";
const MAX_LEN = 400;

async function fetchRetry(url, opts, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, opts);
    if (r.status !== 429 || i >= tries) return r;
    await new Promise((res) => setTimeout(res, 600 * (i + 1)));
  }
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

    const nf = (path, method = "GET", body) =>
      fetchRetry(NOTION + path, {
        method,
        headers: {
          Authorization: `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || "Notion-Fehler");
        return d;
      });

    const queryAll = async (db, filter) => {
      let out = [], cursor;
      do {
        const d = await nf(`/databases/${db}/query`, "POST", { page_size: 100, start_cursor: cursor, ...(filter ? { filter } : {}) });
        out = out.concat(d.results);
        cursor = d.has_more ? d.next_cursor : undefined;
      } while (cursor);
      return out;
    };
    const plain = (rt) => (rt || []).map((t) => t.plain_text).join("");
    const clean = (s) => String(s || "").trim().slice(0, MAX_LEN);
    // Anzeigetext aus „Geschlecht“ (Auswahl) und „Altersrange“ (Text), z. B. „Frau, 55–65 Jahre“
    const beschr = (pr) => [pr.Geschlecht?.select?.name, plain(pr.Altersrange?.rich_text).trim() && plain(pr.Altersrange.rich_text).trim() + " Jahre"].filter(Boolean).join(", ");
    // Aktive Personen mit Geschlecht und Altersrange
    const freigegeben = async () =>
      (await queryAll(env.PERSONS_DB, { property: "Aktiv", checkbox: { equals: true } }))
        .filter((p) => p.properties.Geschlecht?.select && plain(p.properties.Altersrange?.rich_text).trim());
    const norm = (id) => id.replace(/-/g, "");

    try {
      const url = new URL(req.url);
      const path = url.pathname;

      // Zufällige Person: bevorzugt die mit den wenigsten Eindrücken
      if (path === "/api/assign" && req.method === "GET") {
        const exclude = (url.searchParams.get("exclude") || "").split(",").filter(Boolean).map(norm);
        const persons = await freigegeben();
        if (!persons.length) return json({ error: "Noch keine Personen freigegeben." }, 404);
        const counts = {};
        for (const p of persons) counts[norm(p.id)] = p.properties["Anzahl Eindrücke"]?.number || 0;
        let pool = persons.filter((p) => !exclude.includes(norm(p.id)));
        const allDone = pool.length === 0;
        if (allDone) pool = persons;
        const min = Math.min(...pool.map((p) => counts[norm(p.id)]));
        const low = pool.filter((p) => counts[norm(p.id)] === min);
        const p = low[Math.floor(Math.random() * low.length)];
        return json({ personId: p.id, beschreibung: beschr(p.properties), allDone });
      }

      // Fortschritt: bei wie vielen Personen ist schon mindestens ein Eindruck da
      if (path === "/api/progress" && req.method === "GET") {
        const nums = (await freigegeben()).map((p) => p.properties["Anzahl Eindrücke"]?.number || 0);
        return json({ covered: nums.filter((n) => n > 0).length, persons: nums.length });
      }

      // Neuer Eindruck: wird als Absatz an die Personen-Seite angehängt
      if (path === "/api/impression" && req.method === "POST") {
        const b = await req.json();
        const text = clean(b.text);
        if (!text) return json({ error: "Bitte schreibe einen Eindruck." }, 400);
        if (!/^[0-9a-f-]{32,36}$/.test(b.personId)) return json({ error: "Ungültige Person." }, 400);
        const person = await nf(`/pages/${b.personId}`);
        if (norm(person.parent.database_id || "") !== norm(env.PERSONS_DB)) return json({ error: "Ungültige Person." }, 400);
        const d = await nf(`/blocks/${b.personId}/children`, "PATCH", {
          children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } }],
        });
        // Anzahl der Eindrücke neu zählen und an der Person speichern (für faire Verteilung)
        const kids = await nf(`/blocks/${b.personId}/children?page_size=100`);
        const n2 = kids.results.filter((x) => x.type === "paragraph" && plain(x.paragraph.rich_text)).length;
        await nf(`/pages/${b.personId}`, "PATCH", { properties: { "Anzahl Eindrücke": { number: n2 } } });
        return json({ id: d.results[0].id });
      }

      // Eindruck lesen / bearbeiten
      const m = path.match(/^\/api\/impression\/([0-9a-f-]{32,36})$/);
      if (m) {
        const block = await nf(`/blocks/${m[1]}`);
        const pageId = block.parent.page_id;
        if (block.type !== "paragraph" || !pageId) return json({ error: "Nicht gefunden." }, 404);
        const person = await nf(`/pages/${pageId}`);
        if (norm(person.parent.database_id || "") !== norm(env.PERSONS_DB)) return json({ error: "Nicht gefunden." }, 404);
        if (req.method === "PATCH") {
          const text = clean((await req.json()).text);
          if (!text) return json({ error: "Bitte schreibe einen Eindruck." }, 400);
          await nf(`/blocks/${m[1]}`, "PATCH", { paragraph: { rich_text: [{ type: "text", text: { content: text } }] } });
          return json({ ok: true });
        }
        return json({ id: block.id, text: plain(block.paragraph.rich_text), beschreibung: beschr(person.properties) });
      }
      return json({ error: "Nicht gefunden." }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
