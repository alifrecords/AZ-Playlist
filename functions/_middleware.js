// Havola oldindan ko'rinishi (Facebook, Instagram, WhatsApp, Telegram, Messenger).
// Asosiy sahifa so'ralganda og:image / og:title / og:description o'rniga mos qiymat qo'yiladi:
//  • ?ref=<qo'shiq>  → shu qo'shiqning kartochkasi (media/og-*.jpg)
//  • aks holda       → platformadagi kartochkalardan biri, ?s=<kod> bo'yicha tanlanadi
//    (har bir «Do'stga yuborish» yangi kod beradi → har safar boshqa rasm, bitta havola esa doim bitta rasm)
// Boshqa so'rovlarga (api, music, media…) tegilmaydi.

const ID = /^[a-z0-9-]{1,80}$/;
const SAFE = /^media\/[\w.\-]+\.(jpe?g|png|webp)$/i;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

class Meta {
  constructor(map) { this.map = map; }
  element(el) {
    const k = el.getAttribute("property") || el.getAttribute("name");
    if (k && this.map[k] !== undefined) { el.setAttribute("content", this.map[k]); delete this.map[k]; }
  }
}
class Head {
  constructor(map) { this.map = map; }
  element(el) {
    el.onEndTag((end) => {
      const tags = Object.entries(this.map)
        .map(([k, v]) => (k.startsWith("og:") ? '<meta property="' : '<meta name="') + k + '" content="' + attr(v) + '">')
        .join("\n");
      if (tags) end.before(tags + "\n", { html: true });
    });
  }
}

export async function onRequest(ctx) {
  const { request, next, env } = ctx;
  const url = new URL(request.url);
  const isPage = request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html");
  const res = await next();
  if (!isPage || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  try {
    const pr = await env.ASSETS.fetch(new URL("/playlist.json", url.origin));
    if (!pr.ok) return res;
    const pl = await pr.json();
    const tracks = (pl.tracks || []).filter((t) => t && t.id && SAFE.test(t.og || ""));
    const artist = (pl.settings && pl.settings.artist) || "AZIMXODJAYEV MUSIC";
    const ref = url.searchParams.get("ref") || "";
    let t = ID.test(ref) ? tracks.find((x) => x.id === ref) : null;
    let title = "AZ MUSIC — tayyor hit qo'shiqlar";
    let desc = "Xonandalar uchun mualliflik qo'shiqlari: bepul tinglang, yoqqanini sotib oling.";
    if (t) {
      title = t.title + " — " + artist;
      desc = [t.genre, t.bpm ? t.bpm + " BPM" : "", t.key].filter(Boolean).join(" · ") + " · Bepul tinglang, yoqsa — sotib oling.";
    } else if (tracks.length) {
      const seed = url.searchParams.get("s") || String(Math.random());
      t = tracks[hash(seed) % tracks.length];
    }
    const img = t ? url.origin + "/" + t.og : url.origin + "/icons/icon-512.png";
    const map = {
      "og:title": title,
      "og:description": desc,
      "og:image": img,
      "og:image:width": t ? "1200" : "512",
      "og:image:height": t ? "630" : "512",
      "og:image:alt": t ? t.title + " — " + artist : artist,
      "og:type": "music.song",
      "og:site_name": "AZ MUSIC",
      "og:url": url.origin + url.pathname + (ref ? "?ref=" + encodeURIComponent(ref) : ""),
      "twitter:card": "summary_large_image",
      "twitter:title": title,
      "twitter:description": desc,
      "twitter:image": img,
    };
    const out = new HTMLRewriter().on("meta", new Meta(map)).on("head", new Head(map)).transform(res);
    const h = new Headers(out.headers);
    h.set("Cache-Control", "no-cache");
    return new Response(out.body, { status: out.status, headers: h });
  } catch (e) {
    return res;
  }
}
