// POST /api/like {t, vid} — layk bosish / olib tashlash (bitta qurilma — bitta layk).
import { guard, json, readJson, ID, VID } from "./_db.js";

export const onRequestPost = guard(async ({ request, env }) => {
  const b = await readJson(request, 500);
  if (!ID.test(b.t || "") || !VID.test(b.vid || "")) return json({ error: "bad" }, 400);
  const want = b.on === undefined ? null : !!b.on;
  const had = await env.DB.prepare("SELECT 1 FROM likes WHERE track = ? AND vid = ?").bind(b.t, b.vid).first();
  const on = want === null ? !had : want;
  if (on && !had) await env.DB.prepare("INSERT OR IGNORE INTO likes (track, vid, ts) VALUES (?, ?, ?)").bind(b.t, b.vid, Date.now()).run();
  if (!on && had) await env.DB.prepare("DELETE FROM likes WHERE track = ? AND vid = ?").bind(b.t, b.vid).run();
  const c = await env.DB.prepare("SELECT COUNT(*) n FROM likes WHERE track = ?").bind(b.t).first();
  return json({ liked: on, count: c.n });
});
