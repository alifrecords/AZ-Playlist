// POST /api/push/sub {sub:{endpoint,keys:{p256dh,auth}}, vid, off?} — telefon bildirishnomasiga obuna / bekor qilish
import { guard, json, readJson, VID } from "../_db.js";
const OK_HOST = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com|push\.services\.mozilla\.com)(:\d+)?\//i;
export const onRequestPost = guard(async ({ request, env }) => {
  const b = await readJson(request, 3000);
  const ep = String((b.sub && b.sub.endpoint) || b.endpoint || "");
  if (!ep || ep.length > 1000 || !(OK_HOST.test(ep) || (env.PUSH_TEST_HOST && ep.startsWith(env.PUSH_TEST_HOST)))) return json({ error: "bad" }, 400);
  if (b.off) {
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(ep).run();
    return json({ ok: true, on: false });
  }
  const k = (b.sub && b.sub.keys) || {};
  await env.DB.prepare("INSERT INTO push_subs (endpoint, p256dh, auth, vid, ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET vid = excluded.vid, ts = excluded.ts")
    .bind(ep, String(k.p256dh || "").slice(0, 200), String(k.auth || "").slice(0, 100), VID.test(b.vid || "") ? b.vid : null, Date.now()).run();
  return json({ ok: true, on: true });
});
