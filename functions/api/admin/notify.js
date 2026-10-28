// Admin: obunachilarga yangi qo'shiq xabari.
// GET  /api/admin/notify — obunachilar soni va oxirgi xabar
// POST {action:"start", title, body, track, image} — xabar matnini saqlaydi
// POST {action:"send", kind:"push"|"tg", after} — keyingi partiyani yuboradi (Cloudflare bepul tarifida
//       bitta so'rovda 50 tagacha tashqi so'rov mumkin, shuning uchun partiyalab)
import { guard, json, readJson, isAdmin, kvGet, kvSet, vapidKeys, vapidAuth, ID } from "../_db.js";

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
    const img = /^media\/[\w.\-]+\.(jpe?g|png|webp|gif)$/i.test(b.image || "") ? origin + "/" + b.image : null;
    const n = { id: Date.now(), title: clean(b.title, 80) || "AZ MUSIC", body: clean(b.body, 180), track, url: track ? "/#t-" + track : "/", image: img, ts: Date.now() };
    await kvSet(env.DB, "last_notif", JSON.stringify(n));
    const [p, t] = await env.DB.batch([env.DB.prepare("SELECT COUNT(*) n FROM push_subs"), env.DB.prepare("SELECT COUNT(*) n FROM tg_subs")]);
    return json({ ok: true, notif: n, push: p.results[0].n, tg: env.BOT_TOKEN ? t.results[0].n : 0 });
  }
  if (b.action !== "send") return json({ error: "bad" }, 400);
  const after = Math.max(0, parseInt(b.after, 10) || 0);
  const n = JSON.parse((await kvGet(env.DB, "last_notif")) || "null");
  if (!n) return json({ error: "nonotif" }, 400);
  let sent = 0, failed = 0, removed = 0;

  if (b.kind === "push") {
    const rows = (await env.DB.prepare("SELECT rowid r, endpoint FROM push_subs WHERE rowid > ? ORDER BY rowid LIMIT 40").bind(after).all()).results;
    if (!rows.length) return json({ done: true, sent, failed, removed, next: after });
    const keys = await vapidKeys(env.DB), auths = {};
    const subject = env.VAPID_SUBJECT || origin;
    await Promise.all(rows.map(async (row) => {
      try {
        const aud = new URL(row.endpoint).origin;
        auths[aud] = auths[aud] || (await vapidAuth(keys, row.endpoint, subject));
        const r = await fetch(row.endpoint, { method: "POST", headers: { Authorization: auths[aud], TTL: "86400", Urgency: "normal", "Content-Length": "0" } });
        if (r.status === 404 || r.status === 410) { removed++; await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(row.endpoint).run(); }
        else if (r.ok) sent++;
        else failed++;
      } catch (e) { failed++; }
    }));
    const next = rows[rows.length - 1].r;
    return json({ done: rows.length < 40, sent, failed, removed, next });
  }

  if (b.kind === "channel") {
    if (!env.BOT_TOKEN) return json({ done: true, sent: 0, msg: "BOT_TOKEN sozlanmagan" });
    const chat = /^@[A-Za-z0-9_]{4,32}$/.test(b.channel || "") ? b.channel : null;
    if (!chat) return json({ done: true, sent: 0, msg: "kanal noto'g'ri" });
    const api = (env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/";
    const ba = String(b.botApp || "").trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, "https://t.me/").replace(/\/+$/, "");
    const link = /^https:\/\/t\.me\/[\w\/]+$/.test(ba) && n.track ? ba + "?startapp=" + n.track : origin + n.url;
    const text = n.title + (n.body ? "\n" + n.body : "") + "\n\n▶ Tinglash: pastdagi tugma";
    const markup = { inline_keyboard: [[{ text: "▶ Tinglash", url: link }]] };
    const body = n.image ? { chat_id: chat, photo: n.image, caption: text, reply_markup: markup } : { chat_id: chat, text, reply_markup: markup, disable_web_page_preview: true };
    const r = await fetch(api + (n.image ? "sendPhoto" : "sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let msg = "";
    if (!r.ok) { try { const j = await r.json(); msg = /not enough rights|administrator|chat not found|member/i.test(j.description || "") ? "bot kanalda admin emas" : (j.description || "").slice(0, 80); } catch (e) {} }
    return json({ done: true, sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, removed: 0, next: 0, msg });
  }

  if (b.kind === "tg") {
    if (!env.BOT_TOKEN) return json({ done: true, sent, failed, removed, next: after });
    const rows = (await env.DB.prepare("SELECT uid FROM tg_subs WHERE uid > ? ORDER BY uid LIMIT 25").bind(after).all()).results;
    if (!rows.length) return json({ done: true, sent, failed, removed, next: after });
    const api = (env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/";
    const text = n.title + (n.body ? "\n" + n.body : "") + "\n\nTinglash uchun pastdagi tugmani bosing 👇";
    const markup = { inline_keyboard: [[{ text: "▶ Tinglash", web_app: { url: origin + n.url } }]] };
    await Promise.all(rows.map(async (row) => {
      try {
        const body = n.image ? { chat_id: row.uid, photo: n.image, caption: text, reply_markup: markup } : { chat_id: row.uid, text, reply_markup: markup, disable_web_page_preview: true };
        const r = await fetch(api + (n.image ? "sendPhoto" : "sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) sent++;
        else if (r.status === 403 || r.status === 400) { removed++; await env.DB.prepare("DELETE FROM tg_subs WHERE uid = ?").bind(row.uid).run(); }
        else failed++;
      } catch (e) { failed++; }
    }));
    return json({ done: rows.length < 25, sent, failed, removed, next: rows[rows.length - 1].uid });
  }
  return json({ error: "bad" }, 400);
});
