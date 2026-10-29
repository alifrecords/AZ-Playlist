// /api/tick — vaqti kelgan rejalarni bajaradi (GitHub Action har 10 daqiqada chaqiradi, sayt ochilganda ham).
// Ochiq manzil: faqat oldindan rejalashtirilgan, vaqti kelgan ishlarni bajaradi, boshqa hech narsa qilmaydi.
// Har chaqiruvda bitta partiya; {more:true} — ish qolgan, yana chaqirish kerak.
import { guard, json, kvSet } from "./_db.js";
import { sendBatch } from "./_send.js";

const STAGES = ["push", "tg", "channel"];

async function handle({ request, env }) {
  const now = Date.now(), origin = new URL(request.url).origin;
  const row = await env.DB.prepare("SELECT * FROM plan WHERE (status = 'pending' AND at <= ?) OR (status = 'running' AND lock < ?) ORDER BY at LIMIT 1").bind(now, now - 90000).first();
  if (!row) return json({ more: false });
  const lk = await env.DB.prepare("UPDATE plan SET status = 'running', lock = ? WHERE id = ? AND (status = 'pending' OR (status = 'running' AND lock < ?))").bind(now, row.id, now - 90000).run();
  if (!lk.meta || !lk.meta.changes) return json({ more: true });

  let pl = { settings: {}, tracks: [] };
  try { const r = await env.ASSETS.fetch(new URL("/playlist.json", origin)); if (r.ok) pl = await r.json(); } catch (e) {}
  const st = pl.settings || {};
  let n;
  if (row.kind === "release") {
    const t = (pl.tracks || []).find((x) => x.id === row.track);
    if (!t) {
      // sayt hali yangilanmagan bo'lishi mumkin: 3 soatgacha kutamiz
      if (now - row.at > 3 * 3600 * 1000) { await env.DB.prepare("UPDATE plan SET status = 'failed', result = ?, lock = 0 WHERE id = ?").bind("Qo'shiq saytda topilmadi", row.id).run(); return json({ more: true }); }
      await env.DB.prepare("UPDATE plan SET status = 'pending', lock = 0 WHERE id = ?").bind(row.id).run();
      return json({ more: false, waiting: row.id });
    }
    const img = t.og || ((t.media || []).find((m) => m.type === "image") || {}).src || null;
    n = { id: row.id, title: "🎵 Yangi qo'shiq: " + t.title, body: [t.genre, t.bpm ? t.bpm + " BPM" : "", t.key].filter(Boolean).join(" · "), track: t.id, url: "/#t-" + t.id, image: img ? origin + "/" + img : null, ts: now };
  } else {
    n = { id: row.id, title: row.title || "AZ MUSIC", body: row.body || "", track: row.track || "", url: row.track ? "/#t-" + row.track : "/", image: row.image ? origin + "/" + row.image : null, ts: now };
  }
  const ch = st.channel || {};
  const chm = String(ch.url || "").match(/(?:t|telegram)\.me\/([A-Za-z0-9_]{4,32})/i) || String(ch.url || "").match(/^@([A-Za-z0-9_]{4,32})$/);
  const opt = { channel: chm ? "@" + chm[1] : null, botApp: st.botApp || "" };

  let p = {};
  try { p = JSON.parse(row.progress || "{}"); } catch (e) {}
  if (!p.stage) { p = { stage: "push", after: 0, sent: 0, failed: 0, removed: 0 }; await kvSet(env.DB, "last_notif", JSON.stringify(n)); }
  if (p.stage === "channel" && !(row.channel && opt.channel)) p.stage = "done";
  if (p.stage !== "done") {
    const r = await sendBatch(env, origin, n, p.stage, p.after, opt);
    p.sent += r.sent || 0; p.failed += r.failed || 0; p.removed += r.removed || 0; p.after = r.next || 0;
    if (p.stage === "channel") p.channel = r.sent ? "ok" : r.msg || "xato";
    if (r.done) { const i = STAGES.indexOf(p.stage); p.stage = STAGES[i + 1] || "done"; p.after = 0; if (p.stage === "channel" && !(row.channel && opt.channel)) p.stage = "done"; }
  }
  if (p.stage === "done") {
    const res = p.sent + " ta obunachiga yetkazildi" + (p.channel ? (p.channel === "ok" ? " · kanalga joylandi" : " · kanal: " + p.channel) : "") + (p.removed ? " · " + p.removed + " ta eskirgan obuna o'chirildi" : "");
    await env.DB.prepare("UPDATE plan SET status = 'done', progress = ?, result = ?, lock = 0 WHERE id = ?").bind(JSON.stringify(p), res, row.id).run();
  } else {
    await env.DB.prepare("UPDATE plan SET progress = ?, lock = 0 WHERE id = ?").bind(JSON.stringify(p), row.id).run();
  }
  const left = await env.DB.prepare("SELECT COUNT(*) n FROM plan WHERE (status = 'pending' AND at <= ?) OR status = 'running'").bind(Date.now()).first();
  return json({ more: left.n > 0, id: row.id, stage: p.stage });
}
export const onRequestGet = guard(handle);
export const onRequestPost = guard(handle);
