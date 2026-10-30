// POST /api/admin/chpost {track, title, body, photo:"<base64 jpeg>"} — qo'shiqni Telegram kanalga
// admin brauzerida yasalgan kartochka bilan joylaydi. Rasm to'g'ridan-to'g'ri fayl qilib yuklanadi,
// shuning uchun sayt yangilanishini yoki bo'laklar yig'ilishini kutish shart emas.
import { guard, json, isAdmin, ID } from "../_db.js";
import { tgPhoto, channelLink, tgErr } from "../_send.js";

const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

export const onRequestPost = guard(async ({ request, env }) => {
  if (!(await isAdmin(request, env))) return json({ error: "auth" }, 401);
  if (!env.BOT_TOKEN) return json({ error: "nobot", msg: "BOT_TOKEN sozlanmagan" }, 400);
  const raw = await request.text();
  if (raw.length > 4_000_000) return json({ error: "big", msg: "Rasm juda katta" }, 413);
  let b;
  try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad" }, 400); }
  const origin = new URL(request.url).origin;
  let st = {};
  try { const r = await env.ASSETS.fetch(new URL("/playlist.json", origin)); if (r.ok) st = (await r.json()).settings || {}; } catch (e) {}
  const ch = st.channel || {};
  const m = String(ch.url || "").match(/(?:t|telegram)\.me\/([A-Za-z0-9_]{4,32})/i) || String(ch.url || "").match(/^@([A-Za-z0-9_]{4,32})$/);
  if (!m) return json({ error: "nochannel", msg: "Sozlamalarda Telegram kanal manzili yo'q" }, 400);
  const track = ID.test(b.track || "") ? b.track : "";
  const n = { track, url: track ? "/#t-" + track : "/" };
  const text = (clean(b.title, 90) || "AZ MUSIC") + (b.body ? "\n" + clean(b.body, 200) : "") + "\n\n▶ Tinglash: pastdagi tugma";
  const markup = { inline_keyboard: [[{ text: "▶ Tinglash", url: channelLink(origin, st.botApp, n) }]] };
  let photo = null;
  if (b.photo) {
    try {
      const bin = atob(String(b.photo).replace(/^data:[^,]+,/, ""));
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      photo = new Blob([u8], { type: "image/jpeg" });
    } catch (e) {}
  }
  const api = (env.TG_API || "https://api.telegram.org") + "/bot" + env.BOT_TOKEN + "/";
  const r = await tgPhoto(api, "@" + m[1], photo, text, markup);
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) return json({ error: "tg", msg: tgErr(j.description) || "Telegram xatosi " + r.status }, 502);
  const withPhoto = !!(j.result && j.result.photo);
  return json({ ok: true, photo: withPhoto, channel: "@" + m[1] });
});
