// Admin: Telegram xabarnomalari.
// GET  /api/admin/telegram — holat {bot: BOT_TOKEN bormi, linked: chat bog'langanmi, botName}
// POST /api/admin/telegram {action:"link"} — botga oxirgi /start yozgan chatni admin chati qilib saqlaydi
// POST /api/admin/telegram {action:"test"|"unlink"}
import { guard, json, readJson, isAdmin, tgSend, kvGet, kvSet } from "../_db.js";

async function tg(env, method, body) {
  const r = await fetch((env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  return r.json();
}

export const onRequestGet = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  if (!env.BOT_TOKEN) return json({ bot: false, linked: false });
  const me = await tg(env, "getMe").catch(() => null);
  const chat = await kvGet(env.DB, "admin_chat");
  return json({ bot: !!(me && me.ok), botName: me && me.ok ? me.result.username : null, linked: !!chat, chatName: await kvGet(env.DB, "admin_chat_name") });
});

export const onRequestPost = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  if (!env.BOT_TOKEN) return json({ error: "nobot" }, 400);
  const b = await readJson(request, 500);
  if (b.action === "unlink") { await kvSet(env.DB, "admin_chat", ""); return json({ ok: true }); }
  if (b.action === "test") {
    const ok = await tgSend(env, await kvGet(env.DB, "admin_chat"), "✅ AZ MUSIC: xabarnomalar ishlayapti. Yangi izohlar shu yerga keladi.");
    return json({ ok });
  }
  if (b.action === "link") {
    const up = await tg(env, "getUpdates", { limit: 50, timeout: 0, allowed_updates: ["message"] });
    if (!up.ok) return json({ error: "tg", msg: up.description || "Telegram javob bermadi" }, 400);
    const m = (up.result || []).map((u) => u.message).filter((m) => m && m.chat && m.chat.type === "private" && /^\/start\b/.test(m.text || "")).pop();
    if (!m) return json({ error: "nostart", msg: "Botga /start yuborilmagan. Telegram'da botni oching, /start yozing va qayta bosing." }, 400);
    const name = [m.chat.first_name, m.chat.last_name].filter(Boolean).join(" ") || (m.chat.username ? "@" + m.chat.username : String(m.chat.id));
    await kvSet(env.DB, "admin_chat", String(m.chat.id));
    await kvSet(env.DB, "admin_chat_name", name);
    await tgSend(env, m.chat.id, "✅ Bog'landi! Endi AZ MUSIC'dagi yangi izohlar shu yerga keladi.");
    return json({ ok: true, chatName: name });
  }
  return json({ error: "bad" }, 400);
});
