// POST /api/track — saytdan anonim hodisa yozadi. Shaxsiy ma'lumot (IP, ism, telefon) saqlanmaydi:
// faqat tasodifiy qurilma raqami, hodisa turi, qo'shiq, manba va mamlakat kodi.
import { EVENTS, SOURCES, ensureSchema, json } from "./_db.js";

const ID = /^[a-z0-9-]{1,80}$/;
const VID = /^[a-z0-9]{8,32}$/;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return new Response(null, { status: 204 });
  let b;
  try {
    const t = await request.text();
    if (t.length > 2000) return new Response(null, { status: 413 });
    b = JSON.parse(t);
  } catch {
    return new Response(null, { status: 400 });
  }
  const list = Array.isArray(b) ? b.slice(0, 10) : [b];
  const cc = (request.cf && request.cf.country) || "";
  const now = Date.now();
  const day = new Date(now + 5 * 3600 * 1000).toISOString().slice(0, 10); // Toshkent vaqti (UTC+5)
  const rows = [];
  for (const x of list) {
    if (!x || !EVENTS.includes(x.e) || !VID.test(x.vid || "")) continue;
    const track = ID.test(x.t || "") ? x.t : null;
    const ref = ID.test(x.ref || "") ? x.ref : null;
    const src = SOURCES.includes(x.src) ? x.src : "brauzer";
    const m = x.m === "intro" || x.m === "full" ? x.m : null;
    rows.push([now, day, x.e, track, x.vid, src, ref, cc, m]);
  }
  if (!rows.length) return new Response(null, { status: 204 });
  try {
    await ensureSchema(env.DB);
    const st = env.DB.prepare("INSERT INTO ev (ts, day, e, track, vid, src, ref, cc, m) VALUES (?,?,?,?,?,?,?,?,?)");
    await env.DB.batch(rows.map((r) => st.bind(...r)));
  } catch (e) {
    return json({ error: "db" }, 500);
  }
  return new Response(null, { status: 204 });
}

export const onRequestGet = () => json({ ok: true, db: "POST only" });
