// Admin: GET /api/admin/comments?t=&limit= — barcha izohlar (yashirinlari ham)
//        POST /api/admin/comments {id, action: "delete"|"hide"|"show"|"reply", reply}
import { guard, json, readJson, isAdmin, ID } from "../_db.js";

export const onRequestGet = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  const u = new URL(request.url), t = u.searchParams.get("t") || "";
  const lim = Math.min(500, Math.max(1, +u.searchParams.get("limit") || 200));
  const q = ID.test(t)
    ? env.DB.prepare("SELECT id, track, ts, name, text, tg, hidden, reply, reply_ts FROM comments WHERE track = ? ORDER BY ts DESC LIMIT ?").bind(t, lim)
    : env.DB.prepare("SELECT id, track, ts, name, text, tg, hidden, reply, reply_ts FROM comments ORDER BY ts DESC LIMIT ?").bind(lim);
  const r = await q.all();
  const tot = await env.DB.prepare("SELECT COUNT(*) n, SUM(ts > ?) day FROM comments").bind(Date.now() - 86400000).first();
  return json({ comments: r.results.map((c) => ({ ...c, tg: !!c.tg, hidden: !!c.hidden })), total: tot.n || 0, today: tot.day || 0 });
});

export const onRequestPost = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  const b = await readJson(request, 3000);
  const id = parseInt(b.id, 10);
  if (!id) return json({ error: "bad" }, 400);
  const st = {
    delete: () => env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id),
    hide: () => env.DB.prepare("UPDATE comments SET hidden = 1 WHERE id = ?").bind(id),
    show: () => env.DB.prepare("UPDATE comments SET hidden = 0 WHERE id = ?").bind(id),
    reply: () => {
      const r = String(b.reply || "").trim().slice(0, 500);
      return r ? env.DB.prepare("UPDATE comments SET reply = ?, reply_ts = ? WHERE id = ?").bind(r, Date.now(), id) : env.DB.prepare("UPDATE comments SET reply = NULL, reply_ts = NULL WHERE id = ?").bind(id);
    },
  }[b.action];
  if (!st) return json({ error: "bad" }, 400);
  await st().run();
  return json({ ok: true });
});
