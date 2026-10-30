// Admin: obunachilarga yangi qo'shiq xabari.
// GET  /api/admin/notify — obunachilar soni va oxirgi xabar
// POST {action:"start", title, body, track, image} — xabar matnini saqlaydi
// POST {action:"send", kind:"push"|"tg", after} — keyingi partiyani yuboradi (Cloudflare bepul tarifida
//       bitta so'rovda 50 tagacha tashqi so'rov mumkin, shuning uchun partiyalab)
import { guard, json, readJson, isAdmin, kvGet, kvSet, ID } from "../_db.js";
import { sendBatch, pickImage, trackImages } from "../_send.js";

const clean = (s, n) => String(s || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, n);

export const onRequestGet = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  const [p, t] = await env.DB.batch([env.DB.prepare("SELECT COUNT(*) n FROM push_subs"), env.DB.prepare("SELECT COUNT(*) n FROM tg_subs")]);
  const last = await kvGet(env.DB, "last_notif");
  return json({ push: p.results[0].n, tg: t.results[0].n, bot: !!env.BOT_TOKEN, last: last ? JSON.parse(last) : null });
});

export const onRequestPost = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  const b = await readJson(request, 4000);
  const origin = new URL(request.url).origin;
  if (b.action === "start") {
    const track = ID.test(b.track || "") ? b.track : "";
    let tr = null;
    if (track) { try { const r = await env.ASSETS.fetch(new URL("/playlist.json", origin)); if (r.ok) tr = ((await r.json()).tracks || []).find((x) => x.id === track) || null; } catch (e) {} }
    const img = await pickImage(env, origin, [b.image].concat(trackImages(tr)));
    const n = { id: Date.now(), title: clean(b.title, 80) || "AZ MUSIC", body: clean(b.body, 180), track, url: track ? "/#t-" + track : "/", image: img, ts: Date.now() };
    await kvSet(env.DB, "last_notif", JSON.stringify(n));
    const [p, t] = await env.DB.batch([env.DB.prepare("SELECT COUNT(*) n FROM push_subs"), env.DB.prepare("SELECT COUNT(*) n FROM tg_subs")]);
    return json({ ok: true, notif: n, push: p.results[0].n, tg: env.BOT_TOKEN ? t.results[0].n : 0 });
  }
  if (b.action !== "send") return json({ error: "bad" }, 400);
  const n = JSON.parse((await kvGet(env.DB, "last_notif")) || "null");
  if (!n) return json({ error: "nonotif" }, 400);
  return json(await sendBatch(env, origin, n, b.kind, b.after, { channel: b.channel, botApp: b.botApp }));
});
