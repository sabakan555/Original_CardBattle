/* ターン通知（Web Push）: オンライン対戦で相手がターンを終えたら、この端末に「あなたのターンです」と通知する。
   送るのはパック用のWorker（pack-config.js の packApiUrl）。鍵（pushPublicKey）が空のあいだは何も出さない。 */
S.push = { key: typeof pushPublicKey === "string" ? pushPublicKey.trim() : "", on: false, busy: false, err: "", checked: false };
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const pushReady = () => !!(S.push.key && S.pack && S.pack.url && pushSupported());
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushKeyBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function pushReq(path, body){
  const u = typeof firebase !== "undefined" && firebase.auth().currentUser; if (!u || u.isAnonymous) throw Error("通知を使うにはIDを登録してログインしてね");
  const r = await fetch(S.pack.url + path, { method: "POST", headers: { Authorization: "Bearer " + await u.getIdToken(), "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Error(d.error || "通信できませんでした。もう一度ためしてね"); return d;
}
async function pushSync(){
  if (!pushReady()) return;
  try{ const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); S.push.on = !!sub && Notification.permission === "granted"; } catch(e){ S.push.on = false; }
  S.push.checked = true; renderPushBox();
}
async function pushSet(on){
  if (S.push.busy) return; S.push.busy = true; S.push.err = ""; renderPushBox();
  try{
    const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
    if (on){
      if (await Notification.requestPermission() !== "granted") throw Error("通知が許可されませんでした。端末やブラウザの設定で、このサイトの通知を許可してね");
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyBytes(S.push.key) });
      await pushReq("/push/sub", { endpoint: sub.endpoint }); S.push.on = true; toast("ターン通知をオンにしました");
    } else {
      if (sub){ await pushReq("/push/unsub", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
      S.push.on = false; toast("ターン通知をオフにしました");
    }
  } catch(e){ S.push.err = e.message || "うまくいきませんでした"; }
  finally{ S.push.busy = false; renderPushBox(); }
}
function renderPushBox(){
  const el = $("#mpPush"); if (!el) return;
  if (!S.push.key || !(S.pack && S.pack.url)){ el.hidden = true; return; }
  el.hidden = false;
  const login = typeof firebase !== "undefined" && firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous;
  let body;
  if (!pushSupported()) body = isIOS() && !isStandalone() ? `<p class="note" style="margin:0">iPhone・iPadでは、Safariの共有ボタンから「ホーム画面に追加」して、そこから開くと使えます。</p>` : `<p class="note" style="margin:0">このブラウザは通知に対応していません。</p>`;
  else if (!login) body = `<p class="note" style="margin:0">IDを登録してログインすると使えます。</p>`;
  else body = `<div class="row"><button class="${S.push.on ? "" : "primary"}" data-push="${S.push.on ? "off" : "on"}" ${S.push.busy ? "disabled" : ""}>${S.push.busy ? "設定中…" : S.push.on ? "オフにする" : "オンにする"}</button><span class="note">${S.push.on ? "この端末に届きます" : "オフ"}</span></div>`;
  el.innerHTML = `<h2 style="margin:0 0 6px">ターン通知</h2><p class="note" style="margin:0 0 8px">オンライン対戦で相手がターンを終えたら、この端末に「あなたのターンです」と通知します（画面を見ているときは出ません）。</p>${body}${S.push.err ? `<p class="warn" style="margin:6px 0 0">${esc(S.push.err)}</p>` : ""}`;
  if (pushSupported() && login && !S.push.checked){ S.push.checked = true; pushSync(); }
}
$("#mpPush").addEventListener("click", e => { const b = e.target.closest("[data-push]"); if (b) pushSet(b.dataset.push === "on"); });
// 相手のターンになったことを、Workerに知らせる（相手が通知をオンにしていれば届く）
function pushTurn(code){
  if (!S.pack || !S.pack.url || !S.push.key) return Promise.resolve();
  const u = typeof firebase !== "undefined" && firebase.auth().currentUser; if (!u || u.isAnonymous) return Promise.resolve();
  return pushReq("/push/turn", { room: code }).catch(() => {});
}
