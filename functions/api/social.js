// GET /api/social?vid=... — barcha qo'shiqlar bo'yicha layk va izohlar soni, shu qurilma layk bosganlari.
import { guard, json, VID } from "./_db.js";

export const onRequestGet = guard(async ({ request, env }) => {
  const vid = new URL(request.url).searchParams.get("vid") || "";
  const [lk, cm, mine] = await env.DB.batch([
    env.DB.prepare("SELECT track, COUNT(*) n FROM likes GROUP BY track"),
    env.DB.prepare("SELECT track, COUNT(*) n FROM comments WHERE hidden = 0 GROUP BY track"),
    env.DB.prepare("SELECT track FROM likes WHERE vid = ?").bind(VID.test(vid) ? vid : "-"),
  ]);
  const likes = {}, comments = {};
  for (const r of lk.results) likes[r.track] = r.n;
  for (const r of cm.results) comments[r.track] = r.n;
  return json({ likes, comments, mine: mine.results.map((r) => r.track) }, 200, { "Cache-Control": "no-store" });
});
