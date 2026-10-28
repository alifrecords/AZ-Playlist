/* AZ MUSIC — service worker.
   Ilova qobig'i (sahifa, ikonkalar) oflayn ochilishi uchun saqlanadi.
   playlist.json har doim internetdan olinadi (bo'lmasa oxirgi nusxa).
   MP3 va videolar telefonda saqlanmaydi: ular faqat internet orqali tinglanadi. */
var VER = "az-v2";
var SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VER).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VER; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req, key) {
  return fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VER).then(function (c) { c.put(key || req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(key || req, { ignoreSearch: true }).then(function (r) { return r || caches.match("index.html"); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;               /* shriftlar, Telegram — o'z holicha */
  var p = url.pathname;
  if (/^\/(music|media)\//.test(p)) return;                  /* audio/video saqlanmaydi */
  if (/\/admin\.html$/.test(p)) return;                      /* admin sahifa doim internetdan */
  if (/^\/api\//.test(p)) return;                            /* statistika — hech qachon keshlanmaydi */
  if (/\/playlist\.json$/.test(p)) { e.respondWith(networkFirst(req, "playlist.json")); return; }
  if (req.mode === "navigate") { e.respondWith(networkFirst(req, "index.html")); return; }
  e.respondWith(caches.match(req).then(function (r) { return r || networkFirst(req); }));
});
