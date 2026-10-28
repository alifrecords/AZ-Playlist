/* AZ MUSIC — service worker.
   Ilova qobig'i (sahifa, ikonkalar) oflayn ochilishi uchun saqlanadi.
   playlist.json har doim internetdan olinadi (bo'lmasa oxirgi nusxa).
   MP3 va videolar telefonda saqlanmaydi: ular faqat internet orqali tinglanadi. */
var VER = "az-v3";
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

/* ---- yangi qo'shiq bildirishnomasi ----
   Server bo'sh push yuboradi; matn /api/push/latest dan olinadi. */
self.addEventListener("push", function (e) {
  var fromPayload = null;
  try { if (e.data) fromPayload = e.data.json(); } catch (x) {}
  e.waitUntil(
    (fromPayload ? Promise.resolve(fromPayload) : fetch("/api/push/latest", { cache: "no-store" }).then(function (r) { return r.json(); }))
      .catch(function () { return null; })
      .then(function (n) {
        n = n && n.title ? n : { title: "AZ MUSIC", body: "Yangi qo'shiq joylandi — tinglash uchun bosing", url: "/" };
        var opt = { body: n.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "az-new-" + (n.id || ""), renotify: true, data: { url: n.url || "/" } };
        if (n.image) opt.image = n.image;
        return self.registration.showNotification(n.title, opt);
      })
  );
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (new URL(c.url).origin === self.location.origin && !/admin\.html/.test(c.url)) { return c.navigate(url).then(function (w) { return (w || c).focus(); }).catch(function () { return c.focus(); }); }
      }
      return self.clients.openWindow(url);
    })
  );
});
