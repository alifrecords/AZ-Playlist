// Obunachilarga xabar yuborishning umumiy qismi (admin/notify.js va tick.js ishlatadi).
// Bitta chaqiruv — bitta partiya (Cloudflare bepul tarifida so'rov ichida 50 tagacha tashqi so'rov).
import { vapidKeys, vapidAuth } from "./_db.js";

export const PUSH_BATCH = 40, TG_BATCH = 25;

// Rasmni Telegram'ga FAYL qilib yuklaydi (Telegram saytimizdan o'zi yuklab olishiga bog'liq emas).
// photo: Blob (fayl) yoki satr (file_id / URL). Rasm o'tmasa — matn bilan yuboradi (obunachi o'chirilmaydi).
export async function tgPhoto(api, chat, photo, text, markup) {
  if (photo) {
    let r;
    if (typeof photo === "string") {
      r = await fetch(api + "sendPhoto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, photo, caption: text, reply_markup: markup }) });
    } else {
      const fd = new FormData();
      fd.append("chat_id", String(chat)); fd.append("caption", text); fd.append("reply_markup", JSON.stringify(markup));
      fd.append("photo", photo, "card.jpg");
      r = await fetch(api + "sendPhoto", { method: "POST", body: fd });
    }
    if (r.ok) return r;
    let d = "";
    try { d = (await r.clone().json()).description || ""; } catch (e) {}
    if (!(r.status === 400 && /photo|file|url|image|wrong type|webpage|IMAGE_PROCESS|dimensions/i.test(d))) return r;
  }
  return fetch(api + "sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, reply_markup: markup, disable_web_page_preview: true }) });
}
// Saytdagi rasmni baytlari bilan oladi (Telegram'ga fayl qilib yuklash uchun)
export async function loadPhoto(env, origin, url) {
  if (!url || typeof url !== "string" || !url.startsWith(origin + "/media/")) return null;
  try {
    const r = await env.ASSETS.fetch(new URL(url));
    if (r.ok && /^image\//i.test(r.headers.get("content-type") || "")) return new Blob([await r.arrayBuffer()], { type: r.headers.get("content-type") });
  } catch (e) {}
  return null;
}
export function channelLink(origin, botApp, n) {
  const ba = String(botApp || "").trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, "https://t.me/").replace(/\/+$/, "");
  return /^https:\/\/t\.me\/[\w\/]+$/.test(ba) && n.track ? ba + "?startapp=" + n.track : origin + n.url;
}
export function tgErr(d) {
  return /not enough rights|administrator|chat not found|member/i.test(d || "") ? "bot kanalda admin emas" : String(d || "").slice(0, 120);
}

// Saytda haqiqatan bor rasmni tanlaydi (bo'laklab yuklangan fayl hali yig'ilmagan bo'lishi mumkin).
// Pages yo'q faylga index.html qaytaradi, shuning uchun turi image/* bo'lishi shart.
const IMG = /^media\/[\w.\-]+\.(jpe?g|png|webp|gif)$/i;
export function trackImages(t) {
  if (!t) return [];
  return [].concat(t.og || [], (t.media || []).filter((m) => m.type === "image").map((m) => m.src)).filter((x) => IMG.test(x || "")); // avval kartochka
}
export async function pickImage(env, origin, paths) {
  for (const p of paths) {
    if (!IMG.test(p || "")) continue;
    try {
      const r = await env.ASSETS.fetch(new URL("/" + p, origin));
      if (r.ok && /^image\//i.test(r.headers.get("content-type") || "")) return origin + "/" + p;
    } catch (e) {}
  }
  return null;
}

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
    const link = channelLink(origin, opt.botApp, n);
    const text = n.title + (n.body ? "\n" + n.body : "") + "\n\n▶ Tinglash: pastdagi tugma";
    const markup = { inline_keyboard: [[{ text: "▶ Tinglash", url: link }]] };
    const photo = (await loadPhoto(env, origin, n.image)) || n.image || null;
    const r = await tgPhoto(api, chat, photo, text, markup);
    let msg = "";
    if (!r.ok) { try { msg = tgErr((await r.json()).description); } catch (e) {} }
    else { try { const j = await r.clone().json(); if (photo && !(j.result && j.result.photo)) msg = "rasm o'tmadi — matn bilan joylandi"; } catch (e) {} }
    return { done: true, sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, removed: 0, next: 0, msg };
  }

  if (kind === "tg") {
    if (!env.BOT_TOKEN) return { done: true, sent, failed, removed, next: after };
    const rows = (await env.DB.prepare("SELECT uid FROM tg_subs WHERE uid > ? ORDER BY uid LIMIT ?").bind(after, TG_BATCH).all()).results;
    if (!rows.length) return { done: true, sent, failed, removed, next: after };
    const api = (env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/";
    const text = n.title + (n.body ? "\n" + n.body : "") + "\n\nTinglash uchun pastdagi tugmani bosing 👇";
    const markup = { inline_keyboard: [[{ text: "▶ Tinglash", web_app: { url: origin + n.url } }]] };
    let photo = (await loadPhoto(env, origin, n.image)) || n.image || null;
    const one = async (row) => {
      try {
        const r = await tgPhoto(api, row.uid, photo, text, markup);
        if (r.ok) {
          sent++;
          if (photo && typeof photo !== "string") { try { const j = await r.clone().json(); const ph = j.result && j.result.photo; if (ph && ph.length) photo = ph[ph.length - 1].file_id; } catch (e) {} }
        }
        else if (r.status === 403 || r.status === 400) { removed++; await env.DB.prepare("DELETE FROM tg_subs WHERE uid = ?").bind(row.uid).run(); }
        else failed++;
      } catch (e) { failed++; }
    };
    await one(rows[0]); // birinchisida rasm yuklanadi, qolganlariga uning file_id si ketadi
    await Promise.all(rows.slice(1).map(one));
    return { done: rows.length < TG_BATCH, sent, failed, removed, next: rows[rows.length - 1].uid };
  }
  return { done: true, sent, failed, removed, next: after, msg: "bad kind" };
}
