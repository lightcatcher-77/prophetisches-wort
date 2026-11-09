// Reserve-Worker: Daniel trägt Worte für Personen ein, die noch kein Wort von Freunden haben.
// Gespeichert wird in der Eigenschaft „Reserve-Wort“ der Personen-Seite, nicht im Seitenkörper,
// daher werden Reserve-Worte nicht in „Anzahl Eindrücke“ gezählt.
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
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

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

    const plain = (rt) => (rt || []).map((t) => t.plain_text).join("");
    const clean = (s) => String(s || "").trim().slice(0, MAX_LEN);
    const norm = (id) => id.replace(/-/g, "");
    const title = (p) => plain(Object.values(p.properties).find((x) => x.type === "title")?.title).trim();
    const isExcluded = (p) => title(p).toLowerCase() === (env.EXCLUDE_NAME || "").toLowerCase();
    // Nur das Geschlecht, nie die Altersrange
    const beschr = (p) => p.properties.Geschlecht?.select?.name || "";
    const count = (p) => p.properties["Anzahl Eindrücke"]?.number || 0;
    const reserve = (p) => plain(p.properties["Reserve-Wort"]?.rich_text).trim();

    const queryAll = async () => {
      let out = [], cursor;
      do {
        const d = await nf(`/databases/${env.PERSONS_DB}/query`, "POST", {
          page_size: 100, start_cursor: cursor,
          filter: { property: "Aktiv", checkbox: { equals: true } },
        });
        out = out.concat(d.results);
        cursor = d.has_more ? d.next_cursor : undefined;
      } while (cursor);
      return out.filter((p) => p.properties.Geschlecht?.select && !isExcluded(p));
    };
    const loadPerson = async (id) => {
      if (!/^[0-9a-f-]{32,36}$/.test(id)) throw new Error("Ungültige Person.");
      const p = await nf(`/pages/${id}`);
      if (norm(p.parent.database_id || "") !== norm(env.PERSONS_DB) || isExcluded(p)) throw new Error("Ungültige Person.");
      return p;
    };

    try {
      const url = new URL(req.url);
      const path = url.pathname;
      if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);

      // Person ohne Wort von Freunden und ohne Reserve-Wort, zufällig
      if (path === "/api/assign" && req.method === "GET") {
        const exclude = (url.searchParams.get("exclude") || "").split(",").filter(Boolean).map(norm);
        const open = (await queryAll()).filter((p) => count(p) === 0 && !reserve(p) && !exclude.includes(norm(p.id)));
        if (!open.length) return json({ allDone: true });
        const p = open[Math.floor(Math.random() * open.length)];
        return json({ personId: p.id, beschreibung: beschr(p) });
      }

      // Übersicht: wie viele Personen noch kein Wort von Freunden haben, davon schon mit Reserve
      if (path === "/api/progress" && req.method === "GET") {
        const without = (await queryAll()).filter((p) => count(p) === 0);
        return json({ ohneWort: without.length, mitReserve: without.filter((p) => reserve(p)).length });
      }

      // Reserve-Wort lesen / speichern (neu und bearbeiten sind dasselbe)
      const m = path.match(/^\/api\/reserve\/([0-9a-f-]{32,36})$/);
      if (m) {
        const p = await loadPerson(m[1]);
        if (req.method === "PUT") {
          const text = clean((await req.json()).text);
          if (!text) return json({ error: "Bitte schreibe ein Wort." }, 400);
          await nf(`/pages/${m[1]}`, "PATCH", { properties: { "Reserve-Wort": { rich_text: [{ type: "text", text: { content: text } }] } } });
          return json({ ok: true });
        }
        return json({ text: reserve(p), beschreibung: beschr(p) });
      }
      return json({ error: "Nicht gefunden." }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
