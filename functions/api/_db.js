// AZ MUSIC — umumiy yordamchilar (Cloudflare Pages Functions + D1).
// D1 bazasi Cloudflare'da "DB" nomi bilan ulanishi kerak (Settings → Bindings).
// Ixtiyoriy maxfiy o'zgaruvchi: BOT_TOKEN (Settings → Variables and secrets) —
// Telegram ismlarini tasdiqlash va yangi izoh haqida adminga xabar yuborish uchun.
export const EVENTS = ["open", "play", "share", "order", "install", "app_open", "tg_install", "channel", "social"];
export const SOURCES = ["telegram", "ilova", "brauzer"];
export const ID = /^[a-z0-9-]{1,80}$/;
export const VID = /^[a-z0-9]{8,32}$/;
const REPO = "alifrecords/AZ-Playlist";

let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ev (ts INTEGER NOT NULL, day TEXT NOT NULL, e TEXT NOT NULL, track TEXT, vid TEXT, src TEXT, ref TEXT, cc TEXT, m TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_day ON ev(day)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_e_day ON ev(e, day)"),
    db.prepare("CREATE TABLE IF NOT EXISTS likes (track TEXT NOT NULL, vid TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (track, vid))"),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, track TEXT NOT NULL, ts INTEGER NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, vid TEXT, tg INTEGER, hidden INTEGER NOT NULL DEFAULT 0, reply TEXT, reply_ts INTEGER)"
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS comments_track ON comments(track, ts)"),
    db.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT, auth TEXT, vid TEXT, ts INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS tg_subs (uid INTEGER PRIMARY KEY, name TEXT, ts INTEGER NOT NULL)"),
  ]);
  ready = true;
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

export async function readJson(request, max = 4000) {
  const t = await request.text();
  if (t.length > max) throw Object.assign(new Error("big"), { status: 413 });
  try {
    return JSON.parse(t);
  } catch {
    throw Object.assign(new Error("bad"), { status: 400 });
  }
}

export function guard(fn) {
  return async (ctx) => {
    try {
      if (!ctx.env.DB) return json({ error: "nodb" }, 503);
      await ensureSchema(ctx.env.DB);
      return await fn(ctx);
    } catch (e) {
      return json({ error: e.status ? "bad" : "server", detail: String((e && e.message) || e).slice(0, 200) }, e.status || 500);
    }
  };
}

/* ---- admin: GitHub token bilan kirish (admin sahifadagi token) ---- */
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const okTokens = new Map();
export async function isAdmin(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length > 300) return false;
  const key = await sha256(token);
  const exp = okTokens.get(key);
  if (exp && exp > Date.now()) return true;
  const r = await fetch((env.GH_API || "https://api.github.com") + "/repos/" + (env.STATS_REPO || REPO), {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "az-music" },
  });
  if (!r.ok) return false;
  const j = await r.json();
  if (!j.permissions || !j.permissions.push) return false;
  okTokens.set(key, Date.now() + 10 * 60 * 1000);
  return true;
}

/* ---- Telegram ----
   Mini App ichidan kelgan initData'ni bot tokeni bilan tekshiradi (soxta ismni oldini oladi). */
async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
export async function verifyTelegram(initData, botToken) {
  if (!initData || !botToken || initData.length > 4000) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const dcs = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + "=" + v).join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const sig = [...(await hmac(secret, dcs))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (sig !== hash) return null;
  const auth = +p.get("auth_date") || 0;
  if (Date.now() / 1000 - auth > 7 * 86400) return null;
  try {
    return JSON.parse(p.get("user") || "null");
  } catch {
    return null;
  }
}
export async function tgSend(env, chatId, text) {
  if (!env.BOT_TOKEN || !chatId) return false;
  const r = await fetch((env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return r.ok;
}
export async function kvGet(db, k) {
  const r = await db.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first();
  return r ? r.v : null;
}
export async function kvSet(db, k, v) {
  await db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
}

/* ---- Web Push (VAPID, RFC 8292) ----
   Kalitlar birinchi chaqiruvda yaratiladi va D1 (kv) da saqlanadi — qo'shimcha sozlash kerak emas.
   Xabarlar "bo'sh" yuboriladi: telefon xabarni oladi va matnni /api/push/latest dan o'qiydi
   (shifrlash kerak bo'lmaydi, server tez ishlaydi). */
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uText = (s) => b64u(new TextEncoder().encode(s));
export async function vapidKeys(db) {
  let jwk = await kvGet(db, "vapid_private"), pub = await kvGet(db, "vapid_public");
  if (!jwk || !pub) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.privateKey));
    pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    await kvSet(db, "vapid_private", jwk);
    await kvSet(db, "vapid_public", pub);
  }
  const key = await crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { key, pub };
}
export async function vapidAuth(keys, endpoint, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64uText(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64uText(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.key, new TextEncoder().encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + keys.pub;
}
