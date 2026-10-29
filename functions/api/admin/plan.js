// Admin: kontent rejasi.
// GET  /api/admin/plan?from=<ms>&to=<ms> — reja yozuvlari (barcha holatlar)
// POST {action:"add", kind:"release"|"message", at, track, title, body, image, channel}
// POST {action:"cancel", id} · {action:"unrelease", track} · {action:"now", id}
import { guard, json, readJson, isAdmin, ID } from "../_db.js";

const clean = (s, n) => String(s || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, n);
const IMG = /^media\/[\w.\-]+\.(jpe?g|png|webp|gif)$/i;

export const onRequestGet = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  const u = new URL(request.url), now = Date.now();
  const from = +u.searchParams.get("from") || now - 45 * 864e5, to = +u.searchParams.get("to") || now + 120 * 864e5;
  const r = await env.DB.prepare("SELECT id, at, kind, track, title, body, image, channel, status, progress, result FROM plan WHERE (at BETWEEN ? AND ?) OR status IN ('pending','running') ORDER BY at LIMIT 500").bind(from, to).all();
  return json({ items: r.results, now });
});

export const onRequestPost = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  const b = await readJson(request, 4000);
  const now = Date.now();
  if (b.action === "add") {
    const at = +b.at;
    if (!at || at < now - 5 * 60000 || at > now + 400 * 864e5) return json({ error: "bad", msg: "Vaqt noto'g'ri (o'tib ketgan yoki juda uzoq)." }, 400);
    const kind = b.kind === "release" ? "release" : "message";
    const track = ID.test(b.track || "") ? b.track : null;
    if (kind === "release" && !track) return json({ error: "bad" }, 400);
    const title = clean(b.title, 80), body = clean(b.body, 180);
    if (kind === "message" && !title) return json({ error: "bad", msg: "Sarlavha yozing." }, 400);
    if (kind === "release") await env.DB.prepare("DELETE FROM plan WHERE kind = 'release' AND track = ? AND status = 'pending'").bind(track).run();
    const r = await env.DB.prepare("INSERT INTO plan (at, kind, track, title, body, image, channel, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(at, kind, track, title || null, body || null, IMG.test(b.image || "") ? b.image : null, b.channel ? 1 : 0, now).run();
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if (b.action === "cancel") {
    const r = await env.DB.prepare("DELETE FROM plan WHERE id = ? AND status IN ('pending','failed','done')").bind(parseInt(b.id, 10) || 0).run();
    return json({ ok: !!(r.meta && r.meta.changes) });
  }
  if (b.action === "unrelease") {
    if (!ID.test(b.track || "")) return json({ error: "bad" }, 400);
    await env.DB.prepare("DELETE FROM plan WHERE kind = 'release' AND track = ? AND status = 'pending'").bind(b.track).run();
    return json({ ok: true });
  }
  if (b.action === "now") {
    await env.DB.prepare("UPDATE plan SET at = ? WHERE id = ? AND status = 'pending'").bind(now, parseInt(b.id, 10) || 0).run();
    return json({ ok: true });
  }
  return json({ error: "bad" }, 400);
});
