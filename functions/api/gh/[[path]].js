// GitHub API'ga Cloudflare orqali yo'l (admin uchun).
// Brauzer → Cloudflare (yaqin, tez) → GitHub. To'g'ridan-to'g'ri api.github.com'ga ulanish
// ba'zi provayderlarda sekin yoki uziladi; bu yo'l yuklashni barqaror qiladi.
// Faqat /repos/... so'rovlari va faqat token bilan o'tadi. Token hech qayerda saqlanmaydi.
const OK_PATH = /^\/repos\/[\w.-]+\/[\w.-]+(\/[\w.\-\/%]*)?$/;
const METHODS = ["GET", "POST", "PATCH"];

function bad(status, msg) {
  return new Response(JSON.stringify({ message: msg }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-az-proxy": "1" },
  });
}

export async function onRequest({ request, params, env }) {
  const url = new URL(request.url);
  const path = "/" + [].concat(params.path || []).join("/");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "x-az-proxy": "1" } });
  if (!METHODS.includes(request.method)) return bad(405, "method");
  if (!OK_PATH.test(path) || path.includes("..")) return bad(404, "path");
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer \S{20,}$/.test(auth)) return bad(401, "Bad credentials");

  const h = new Headers({ "user-agent": "az-admin-proxy", authorization: auth });
  for (const k of ["accept", "content-type", "x-github-api-version"]) {
    const v = request.headers.get(k);
    if (v) h.set(k, v);
  }
  let r;
  try {
    r = await fetch((env.GH_API || "https://api.github.com") + path + url.search, {
      method: request.method,
      headers: h,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    });
  } catch (e) {
    return bad(502, "GitHub'ga ulanib bo'lmadi");
  }
  const out = new Headers({ "cache-control": "no-store", "x-az-proxy": "1" });
  for (const k of ["content-type", "x-ratelimit-remaining", "x-ratelimit-reset", "x-github-request-id", "location"]) {
    const v = r.headers.get(k);
    if (v) out.set(k, v);
  }
  return new Response(r.body, { status: r.status, headers: out });
}
