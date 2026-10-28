// GET /api/stats?days=30 — faqat admin uchun. Kirish: admin sahifadagi GitHub token
// (Authorization: Bearer ...). Server tokenni GitHub'da tekshiradi: shu repoga yozish huquqi bo'lsa — ruxsat.
import { ensureSchema, json } from "./_db.js";

const REPO = "alifrecords/AZ-Playlist";
const okTokens = new Map(); // token xeshi -> amal qilish muddati (shu server nusxasi ichida)

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(request, env) {
  const h = request.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length > 300) return false;
  const key = await sha256(token);
  const exp = okTokens.get(key);
  if (exp && exp > Date.now()) return true;
  const repo = env.STATS_REPO || REPO;
  const r = await fetch((env.GH_API || "https://api.github.com") + "/repos/" + repo, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "az-music-stats" },
  });
  if (!r.ok) return false;
  const j = await r.json();
  if (!j.permissions || !j.permissions.push) return false;
  okTokens.set(key, Date.now() + 10 * 60 * 1000);
  return true;
}

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
      "SELECT COUNT(DISTINCT vid) visitors, COUNT(DISTINCT CASE WHEN e IN ('install') THEN vid END) installs, COUNT(DISTINCT CASE WHEN e='install' AND ref IS NOT NULL THEN vid END) installs_ref, COUNT(DISTINCT CASE WHEN ref IS NOT NULL AND e='open' THEN vid END) via_link FROM ev WHERE day >= ?",
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
  });
}
