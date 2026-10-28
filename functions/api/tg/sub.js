// POST /api/tg/sub {initData, off?} — Telegram'da yangi qo'shiq xabarlariga obuna (Mini App ichidan)
import { guard, json, readJson, verifyTelegram } from "../_db.js";
export const onRequestPost = guard(async ({ request, env }) => {
  if (!env.BOT_TOKEN) return json({ error: "nobot", msg: "Telegram xabarlari hali sozlanmagan." }, 400);
  const b = await readJson(request, 5000);
  const u = await verifyTelegram(b.initData, env.BOT_TOKEN);
  if (!u || !u.id) return json({ error: "auth", msg: "Telegram tasdiqlamadi. Ilovani bot orqali qayta oching." }, 401);
  if (b.off) {
    await env.DB.prepare("DELETE FROM tg_subs WHERE uid = ?").bind(u.id).run();
    return json({ ok: true, on: false });
  }
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 60);
  await env.DB.prepare("INSERT INTO tg_subs (uid, name, ts) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET name = excluded.name").bind(u.id, name, Date.now()).run();
  return json({ ok: true, on: true });
});
export const onRequestGet = guard(async ({ request, env }) => {
  // ?uid tekshiruvi initData'siz qilinmaydi — faqat bot sozlanganini bildiradi
  return json({ bot: !!env.BOT_TOKEN });
});
