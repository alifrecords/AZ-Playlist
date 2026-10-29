// Obunachilarga xabar yuborishning umumiy qismi (admin/notify.js va tick.js ishlatadi).
// Bitta chaqiruv — bitta partiya (Cloudflare bepul tarifida so'rov ichida 50 tagacha tashqi so'rov).
import { vapidKeys, vapidAuth } from "./_db.js";

export const PUSH_BATCH = 40, TG_BATCH = 25;

export async function sendBatch(env, origin, n, kind, after, opt = {}) {
  let sent = 0, failed = 0, removed = 0;
  after = Math.max(0, parseInt(after, 10) || 0);

  if (kind === "push") {
    const rows = (await env.DB.prepare("SELECT rowid r, endpoint FROM push_subs WHERE rowid > ? ORDER BY rowid LIMIT ?").bind(after, PUSH_BATCH).all()).results;
    if (!rows.length) return { done: true, sent, failed, removed, next: after };
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
    return { done: rows.length < PUSH_BATCH, sent, failed, removed, next: rows[rows.length - 1].r };
  }

  if (kind === "channel") {
    if (!env.BOT_TOKEN) return { done: true, sent: 0, failed: 0, removed: 0, next: 0, msg: "BOT_TOKEN sozlanmagan" };
    const chat = /^@[A-Za-z0-9_]{4,32}$/.test(opt.channel || "") ? opt.channel : null;
    if (!chat) return { done: true, sent: 0, failed: 0, removed: 0, next: 0, msg: "kanal noto'g'ri" };
    const api = (env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/";
    const ba = String(opt.botApp || "").trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, "https://t.me/").replace(/\/+$/, "");
    const link = /^https:\/\/t\.me\/[\w\/]+$/.test(ba) && n.track ? ba + "?startapp=" + n.track : origin + n.url;
    const text = n.title + (n.body ? "\n" + n.body : "") + "\n\n▶ Tinglash: pastdagi tugma";
    const markup = { inline_keyboard: [[{ text: "▶ Tinglash", url: link }]] };
    const body = n.image ? { chat_id: chat, photo: n.image, caption: text, reply_markup: markup } : { chat_id: chat, text, reply_markup: markup, disable_web_page_preview: true };
    const r = await fetch(api + (n.image ? "sendPhoto" : "sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let msg = "";
    if (!r.ok) { try { const j = await r.json(); msg = /not enough rights|administrator|chat not found|member/i.test(j.description || "") ? "bot kanalda admin emas" : (j.description || "").slice(0, 80); } catch (e) {} }
    return { done: true, sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, removed: 0, next: 0, msg };
  }

  if (kind === "tg") {
    if (!env.BOT_TOKEN) return { done: true, sent, failed, removed, next: after };
    const rows = (await env.DB.prepare("SELECT uid FROM tg_subs WHERE uid > ? ORDER BY uid LIMIT ?").bind(after, TG_BATCH).all()).results;
    if (!rows.length) return { done: true, sent, failed, removed, next: after };
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
    return { done: rows.length < TG_BATCH, sent, failed, removed, next: rows[rows.length - 1].uid };
  }
  return { done: true, sent, failed, removed, next: after, msg: "bad kind" };
}
