// アプリ（PWA）用のサービスワーカー
// - ページ本体（index.html・config）はネット優先: つながっていれば、いつも最新を取りに行く。オフラインのときだけ保存しておいた分を出す
// - フォント・画像・アイコンは保存したものを先に出して、うしろで新しくする
// - Firebase のデータやパックの抽選サーバーへの通信にはさわらない（Google Fonts と Firebase のスクリプトだけ保存する）
const CACHE = "ocb-v1";
const CORE = ["./", "./index.html", "./config.js", "./pack-config.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-48.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const FRESH = /\/(index\.html|config\.js|pack-config\.js|manifest\.webmanifest)?$/;
async function networkFirst(req){
  const c = await caches.open(CACHE);
  try{
    const r = await fetch(req);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  }catch(err){
    return (await c.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? c.match("./index.html") : Response.error());
  }
}
async function staleWhileRevalidate(req, e){
  const c = await caches.open(CACHE), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
  if (hit){ e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin){
    if (req.mode === "navigate" || FRESH.test(u.pathname)) e.respondWith(networkFirst(req));
    else if (/\.(woff2?|png|jpe?g|webp|gif|svg)$/.test(u.pathname)) e.respondWith(staleWhileRevalidate(req, e));
    return;
  }
  // Google Fonts と Firebase の読みこみ（スクリプト）は保存しておく: オフラインで起動しても、電波が戻ったらすぐつなげるように
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com" || (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/"))) e.respondWith(staleWhileRevalidate(req, e));
});

// ターン通知（Web Push）: 中身なしのプッシュが来たら「あなたのターンです」。画面を見ているときは出さない
self.addEventListener("push", e => {
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    if (cs.some(c => c.visibilityState === "visible" && c.focused)) return;
    return self.registration.showNotification("カードバトルしようぜ", { body: "あなたのターンです", icon: "icons/icon-192.png", badge: "icons/favicon-48.png", tag: "ocb-turn", renotify: true });
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    return c ? c.focus() : self.clients.openWindow("./");
  }));
});
