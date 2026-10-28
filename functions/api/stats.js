// GET /api/stats?days=30 — faqat admin uchun. Kirish: admin sahifadagi GitHub token
// (Authorization: Bearer ...). Server tokenni GitHub'da tekshiradi: shu repoga yozish huquqi bo'lsa — ruxsat.
import { ensureSchema, json, isAdmin } from "./_db.js";

export async function onRequestGet(ctx) {
  try {
    return await handle(ctx);
  } catch (e) {
    return json({ error: "server", detail: String((e && e.message) || e).slice(0, 200) }, 500);
  }
}

async function handle({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  if (!env.DB) return json({ error: "nodb" }, 503);
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const since = new Date(Date.now() + 5 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [tot, uniq, daily, tracks, refs, srcs, ccs, allTime] = await env.DB.batch([
    q("SELECT e, COUNT(*) n FROM ev WHERE day >= ? GROUP BY e", since),
    q(
      "SELECT COUNT(DISTINCT vid) visitors, COUNT(DISTINCT CASE WHEN e IN ('install') THEN vid END) installs, COUNT(DISTINCT CASE WHEN e='install' AND ref IS NOT NULL THEN vid END) installs_ref, COUNT(DISTINCT CASE WHEN e='install' AND m='tg' THEN vid END) installs_tg, COUNT(DISTINCT CASE WHEN e='tg_install' THEN vid END) tg_clicks, COUNT(DISTINCT CASE WHEN e='channel' THEN vid END) channel_clicks, COUNT(DISTINCT CASE WHEN e='social' AND m='instagram' THEN vid END) ig_clicks, COUNT(DISTINCT CASE WHEN e='social' AND m='youtube' THEN vid END) yt_clicks, COUNT(DISTINCT CASE WHEN ref IS NOT NULL AND e='open' THEN vid END) via_link FROM ev WHERE day >= ?",
      since
    ),
    q(
      "SELECT day, COUNT(DISTINCT CASE WHEN e='open' THEN vid END) visitors, SUM(e='play') plays, COUNT(DISTINCT CASE WHEN e='install' THEN vid END) installs FROM ev WHERE day >= ? GROUP BY day ORDER BY day",
      since
    ),
    q(
      "SELECT track, SUM(e='play') plays, SUM(e='play' AND m='full') full_plays, COUNT(DISTINCT CASE WHEN e='play' THEN vid END) listeners, SUM(e='share') shares, SUM(e='order') orders FROM ev WHERE day >= ? AND track IS NOT NULL GROUP BY track ORDER BY plays DESC",
      since
    ),
    q(
      "SELECT ref track, COUNT(DISTINCT CASE WHEN e='open' THEN vid END) opened, COUNT(DISTINCT CASE WHEN e='install' THEN vid END) installed FROM ev WHERE day >= ? AND ref IS NOT NULL GROUP BY ref ORDER BY opened DESC",
      since
    ),
    q("SELECT src, COUNT(DISTINCT vid) visitors FROM ev WHERE day >= ? AND e='open' GROUP BY src ORDER BY visitors DESC", since),
    q("SELECT cc, COUNT(DISTINCT vid) visitors FROM ev WHERE day >= ? AND e='open' AND cc != '' GROUP BY cc ORDER BY visitors DESC LIMIT 8", since),
    q("SELECT COUNT(DISTINCT CASE WHEN e='install' THEN vid END) installs, COUNT(DISTINCT vid) visitors, MIN(day) first_day FROM ev"),
  ]);
  let likes = {}, cmts = {};
  try {
    const [lk, cm] = await env.DB.batch([
      env.DB.prepare("SELECT track, COUNT(*) n FROM likes GROUP BY track"),
      env.DB.prepare("SELECT track, COUNT(*) n FROM comments WHERE hidden = 0 GROUP BY track"),
    ]);
    for (const r of lk.results) likes[r.track] = r.n;
    for (const r of cm.results) cmts[r.track] = r.n;
  } catch (e) {}
  const counts = {};
  for (const r of tot.results) counts[r.e] = r.n;
  return json({
    days,
    since,
    counts,
    unique: uniq.results[0] || {},
    daily: daily.results,
    tracks: tracks.results,
    refs: refs.results,
    sources: srcs.results,
    countries: ccs.results,
    allTime: allTime.results[0] || {},
    likes,
    commentCounts: cmts,
  });
}
