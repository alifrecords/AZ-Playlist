// AZ MUSIC statistika — umumiy yordamchilar (Cloudflare Pages Functions + D1).
// D1 bazasi Cloudflare'da "DB" nomi bilan ulanishi kerak (Settings → Bindings).
export const EVENTS = ["open", "play", "share", "order", "install", "app_open"];
export const SOURCES = ["telegram", "ilova", "brauzer"];

let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS ev (ts INTEGER NOT NULL, day TEXT NOT NULL, e TEXT NOT NULL, track TEXT, vid TEXT, src TEXT, ref TEXT, cc TEXT, m TEXT)"
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_day ON ev(day)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_e_day ON ev(e, day)"),
  ]);
  ready = true;
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
