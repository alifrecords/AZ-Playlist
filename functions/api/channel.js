// GET /api/channel?c=@kanal — kanal obunachilari soni (bot orqali, 6 soat keshlanadi)
import { guard, json, kvGet, kvSet } from "./_db.js";
export const onRequestGet = guard(async ({ request, env }) => {
  const c = new URL(request.url).searchParams.get("c") || "";
  if (!/^@[A-Za-z0-9_]{4,32}$/.test(c) || !env.BOT_TOKEN) return json({ count: null });
  const key = "chcount:" + c.toLowerCase(), cached = await kvGet(env.DB, key);
  if (cached) { const o = JSON.parse(cached); if (Date.now() - o.ts < 6 * 3600 * 1000) return json({ count: o.n }); }
  try {
    const r = await fetch((env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/getChatMemberCount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: c }) });
    const j = await r.json();
    if (j.ok) { await kvSet(env.DB, key, JSON.stringify({ n: j.result, ts: Date.now() })); return json({ count: j.result }); }
  } catch (e) {}
  return json({ count: null });
});
