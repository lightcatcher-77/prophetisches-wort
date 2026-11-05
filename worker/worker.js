// Cloudflare Worker: vermittelt zwischen der GitHub-Page und Notion.
// Der Notion-Token bleibt hier geheim (Secret NOTION_TOKEN) und ist nie im Browser sichtbar.
const NOTION = "https://api.notion.com/v1";
const MAX_LEN = 1800;

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
      fetch(NOTION + path, {
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
    const chunks = (s) => (s.match(/[\s\S]{1,2000}/g) || []).map((c) => ({ type: "text", text: { content: c } }));
    const clean = (s) => String(s || "").trim().slice(0, MAX_LEN);
    const norm = (id) => id.replace(/-/g, "");

    try {
      const url = new URL(req.url);
      const path = url.pathname;

      // Zufällige Person: bevorzugt die mit den wenigsten Eindrücken
      if (path === "/api/assign" && req.method === "GET") {
        const exclude = (url.searchParams.get("exclude") || "").split(",").filter(Boolean).map(norm);
        const persons = (await queryAll(env.PERSONS_DB, { property: "Aktiv", checkbox: { equals: true } }))
          .filter((p) => plain(p.properties.Beschreibung.rich_text).trim());
        if (!persons.length) return json({ error: "Noch keine Personen freigegeben." }, 404);
        const counts = {};
        for (const i of await queryAll(env.IMPRESSIONS_DB))
          for (const r of i.properties.Person.relation) counts[norm(r.id)] = (counts[norm(r.id)] || 0) + 1;
        let pool = persons.filter((p) => !exclude.includes(norm(p.id)));
        const allDone = pool.length === 0;
        if (allDone) pool = persons;
        const min = Math.min(...pool.map((p) => counts[norm(p.id)] || 0));
        const low = pool.filter((p) => (counts[norm(p.id)] || 0) === min);
        const p = low[Math.floor(Math.random() * low.length)];
        return json({ personId: p.id, beschreibung: plain(p.properties.Beschreibung.rich_text), allDone });
      }

      // Neuer Eindruck
      if (path === "/api/impression" && req.method === "POST") {
        const b = await req.json();
        const text = clean(b.text);
        if (!text) return json({ error: "Bitte schreibe einen Eindruck." }, 400);
        const person = await nf(`/pages/${b.personId}`);
        if (norm(person.parent.database_id || "") !== norm(env.PERSONS_DB)) return json({ error: "Ungültige Person." }, 400);
        const n = plain(person.properties.Name.title);
        const page = await nf("/pages", "POST", {
          parent: { database_id: env.IMPRESSIONS_DB },
          properties: {
            Titel: { title: [{ text: { content: `Eindruck für ${n}` } }] },
            Person: { relation: [{ id: b.personId }] },
            Eindruck: { rich_text: chunks(text) },
          },
        });
        return json({ id: page.id });
      }

      // Eindruck lesen / bearbeiten
      const m = path.match(/^\/api\/impression\/([0-9a-f-]{32,36})$/);
      if (m) {
        const page = await nf(`/pages/${m[1]}`);
        if (norm(page.parent.database_id || "") !== norm(env.IMPRESSIONS_DB)) return json({ error: "Nicht gefunden." }, 404);
        if (req.method === "PATCH") {
          const text = clean((await req.json()).text);
          if (!text) return json({ error: "Bitte schreibe einen Eindruck." }, 400);
          await nf(`/pages/${m[1]}`, "PATCH", { properties: { Eindruck: { rich_text: chunks(text) } } });
          return json({ ok: true });
        }
        const pid = page.properties.Person.relation[0]?.id;
        const person = pid ? await nf(`/pages/${pid}`) : null;
        return json({
          id: page.id,
          text: plain(page.properties.Eindruck.rich_text),
          beschreibung: person ? plain(person.properties.Beschreibung.rich_text) : "",
        });
      }
      return json({ error: "Nicht gefunden." }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
