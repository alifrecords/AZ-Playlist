// GET  /api/comments?t=<qo'shiq> — ko'rinadigan izohlar (eng yangisi birinchi, 100 tagacha)
// POST /api/comments {t, vid, name, text, initData?} — yangi izoh. Izoh darhol chiqadi; admin o'chira oladi.
import { guard, json, readJson, ID, VID, verifyTelegram, tgSend, kvGet } from "./_db.js";

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ru|uz|net|org|me|io|xyz|info|link|top)\b|t\.me\/)/i;
const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/g, "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);

export const onRequestGet = guard(async ({ request, env }) => {
  const t = new URL(request.url).searchParams.get("t") || "";
  if (!ID.test(t)) return json({ error: "bad" }, 400);
  const r = await env.DB.prepare("SELECT id, ts, name, text, tg, reply, reply_ts FROM comments WHERE track = ? AND hidden = 0 ORDER BY ts DESC LIMIT 100").bind(t).all();
  return json({ comments: r.results.map((c) => ({ ...c, tg: !!c.tg })) });
});

export const onRequestPost = guard(async ({ request, env, waitUntil }) => {
  const b = await readJson(request, 6000);
  if (!ID.test(b.t || "") || !VID.test(b.vid || "")) return json({ error: "bad" }, 400);
  const text = clean(b.text, 500);
  let name = clean(b.name, 40).replace(/\n/g, " ");
  if (text.length < 2) return json({ error: "short", msg: "Izoh juda qisqa." }, 400);
  if (LINK.test(text) || LINK.test(name)) return json({ error: "link", msg: "Izohda havola bo'lishi mumkin emas." }, 400);
  let tg = null;
  const u = await verifyTelegram(b.initData, env.BOT_TOKEN);
  if (u) {
    tg = u.id;
    name = clean([u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? "@" + u.username : ""), 40) || name;
  }
  if (!name) return json({ error: "name", msg: "Ismingizni yozing." }, 400);
  const now = Date.now();
  const last = await env.DB.prepare("SELECT MAX(ts) ts, SUM(ts > ?) day FROM comments WHERE vid = ?").bind(now - 86400000, b.vid).first();
  if (last && last.ts && now - last.ts < 60000) return json({ error: "rate", msg: "Biroz kuting: daqiqasiga bitta izoh." }, 429);
  if (last && last.day >= 30) return json({ error: "rate", msg: "Bugun uchun izohlar chegarasiga yetdingiz." }, 429);
  const r = await env.DB.prepare("INSERT INTO comments (track, ts, name, text, vid, tg) VALUES (?, ?, ?, ?, ?, ?)").bind(b.t, now, name, text, b.vid, tg).run();
  const id = r.meta && r.meta.last_row_id;
  // adminga Telegram xabari (bot ulangan bo'lsa)
  const notify = async () => {
    const chat = await kvGet(env.DB, "admin_chat");
    if (chat) await tgSend(env, chat, "💬 Yangi izoh\n🎵 " + clean(b.title || b.t, 80) + "\n👤 " + name + (tg ? " (Telegram)" : "") + "\n\n" + text + "\n\nO'chirish: admin → Izohlar");
  };
  if (waitUntil) waitUntil(notify().catch(() => {}));
  return json({ ok: true, comment: { id, ts: now, name, text, tg: !!tg, reply: null, reply_ts: null } });
});
