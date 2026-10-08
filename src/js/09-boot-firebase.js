/* ================= boot ================= */
/* ================= card trading =================
   trades/<id> = { from, to, fromName, toName, give (a card "from" drew), want (a card "to" drew), status, createdAt, doneAt }
   Trading hands over copies: nobody loses a card. Accepted trades add the cards to each side's collection. */
function subscribeTrades(){
  if (!S.uid) return;
  const first = { in: true, out: true };
  const listen = (key, field) => S.db.collection("trades").where(field, "==", S.uid).onSnapshot(snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!first[key]) notifyTrades(key, list);
    first[key] = false;
    S.trades[key] = list; S.tradesReady = !first.in && !first.out;
    rebuildOwned(); renderAll();
  }, err => console.error("trades:", err && err.code));
  listen("in", "to"); listen("out", "from");
}
const cardName = id => (S.cards.get(id) || {}).name || "消されたカード";
function notifyTrades(key, list){
  const prev = new Map(S.trades[key].map(t => [t.id, t.status]));
  for (const t of list){
    if (key === "in" && t.status === "pending" && !prev.has(t.id)) toast(`${t.fromName || "だれか"}さんから交換の申し込みが届いたよ`);
    if (key === "out" && prev.get(t.id) === "pending" && t.status === "accepted") toast(`${t.toName || "相手"}さんが交換してくれた！「${cardName(t.want)}」が手に入ったよ`);
    if (key === "out" && prev.get(t.id) === "pending" && t.status === "declined") toast(`${t.toName || "相手"}さんに交換をことわられました`);
  }
}
function renderTradeBadge(){
  const n = S.trades.in.filter(t => t.status === "pending").length, b = $("#tradeBadge");
  b.hidden = !n; b.textContent = n;
}
function tradeBtnHTML(c){
  if (owns(c.id)) return `<span class="owned-tag">✓ 持ってる</span>`;
  if (!c.ownerId || !S.uid) return "";
  if (S.trades.out.some(t => t.status === "pending" && t.want === c.id)) return `<span class="note">申し込み中</span>`;
  return `<button class="small" data-trade="${esc(c.id)}">交換を申し込む</button>`;
}
const tradeCard = id => S.cards.get(id) ? cardHTML(S.cards.get(id), "sm") : `<div class="tr-gone">消された<br>カード</div>`;
const byNew = (a, b) => (b.doneAt || b.createdAt || 0) - (a.doneAt || a.createdAt || 0);
function renderTrade(){
  $("#tradeOffline").hidden = !!S.db;
  const pin = S.trades.in.filter(t => t.status === "pending").sort(byNew);
  $("#tradeIn").innerHTML = pin.length ? pin.map(t => {
    const gone = !S.cards.has(t.give) || !S.cards.has(t.want);
    return `<div class="tr-item"><div><b>${esc(t.fromName || "？")}</b> さんから</div>
      <div class="tr-pair"><div><div class="lbl">もらう</div>${tradeCard(t.give)}</div><span class="tr-arrow">⇄</span><div><div class="lbl">渡す（コピー）</div>${tradeCard(t.want)}</div></div>
      <div class="row" style="gap:6px"><button class="small primary" data-acc="${esc(t.id)}" ${gone ? "disabled" : ""}>交換する</button><button class="small ghost" data-dec="${esc(t.id)}">ことわる</button></div></div>`;
  }).join("") : `<p class="muted" style="margin:0">いまは届いていません。</p>`;
  const pout = S.trades.out.filter(t => t.status === "pending").sort(byNew);
  $("#tradeOut").innerHTML = pout.length ? pout.map(t => `<div class="tr-item"><div><b>${esc(t.toName || "？")}</b> さんへ（返事待ち）</div>
      <div class="tr-pair"><div><div class="lbl">渡す（コピー）</div>${tradeCard(t.give)}</div><span class="tr-arrow">⇄</span><div><div class="lbl">もらう</div>${tradeCard(t.want)}</div></div>
      <div class="row"><button class="small ghost" data-can="${esc(t.id)}">とりけす</button></div></div>`).join("") : `<p class="muted" style="margin:0">送った申し込みはありません。下のカードから選んでね。</p>`;
  const pool0 = S.db ? S.userCards.filter(c => c.ownerId && c.ownerId !== S.uid && !owns(c.id) && !c.token) : [];
  const pool = sortCards(pool0.filter(c => matchCard(c, S.filt.trade)), S.filt.trade.sort);
  setCount("trade", pool.length, pool0.length);
  $("#tradePool").innerHTML = pool.map(c => `<div class="g-item">${cardHTML(c, "sm")}<div class="meta">by ${esc(c.author || "？")}</div>${tradeBtnHTML(c)}</div>`).join("")
    || `<p class="muted">${pool0.length ? "条件に合うカードがありません。" : "いまは交換できるカードがありません（ほかの人のカードは全部持ってるよ）。"}</p>`;
  const hist = allTrades().filter(t => t.status !== "pending").sort(byNew).slice(0, 30);
  $("#tradeHist").innerHTML = hist.length ? `<ul class="tr-hist">${hist.map(t => {
    const d = new Date(t.doneAt || t.createdAt || 0), when = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const who = t.from === S.uid ? `${esc(t.toName || "？")}さんへ` : `${esc(t.fromName || "？")}さんから`;
    const what = t.status === "accepted" ? "交換成立" : t.status === "declined" ? "ことわられた" : "とりけし";
    return `<li><span class="muted">${when}</span>　${who}：「${esc(cardName(t.give))}」⇄「${esc(cardName(t.want))}」…<b>${what}</b></li>`;
  }).join("")}</ul>` : `<p class="muted" style="margin:0">まだ記録はありません。</p>`;
}
async function setTradeStatus(id, status){
  try{ await S.db.doc("trades/" + id).update({ status, doneAt: Date.now() }); }
  catch(e){ writeErr(e); return false; }
  return true;
}
$("#tab-trade").addEventListener("click", async e => {
  const acc = e.target.closest("[data-acc]"), dec = e.target.closest("[data-dec]"), can = e.target.closest("[data-can]"), tb = e.target.closest("[data-trade]");
  if (tb){ openTradeDlg(tb.dataset.trade); return; }
  const b = acc || dec || can; if (!b || !S.db) return;
  b.disabled = true;
  if (acc){ const t = S.trades.in.find(x => x.id === acc.dataset.acc); if (await setTradeStatus(acc.dataset.acc, "accepted")) toast(`交換成立！「${cardName(t && t.give)}」が手に入ったよ。デッキに入れられます`); }
  if (dec && await setTradeStatus(dec.dataset.dec, "declined")) toast("ことわりました");
  if (can && await setTradeStatus(can.dataset.can, "cancelled")) toast("申し込みをとりけしました");
  b.disabled = false;
});
let tradePick = null, tradeWant = null;
function openTradeDlg(wantId){
  const c = S.cards.get(wantId); if (!c || !c.ownerId || !S.db) return;
  tradeWant = wantId; tradePick = null;
  const mine = S.userCards.filter(x => x.ownerId === S.uid).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  $("#tradeDlg").innerHTML = `<div class="box" role="dialog" aria-label="交換を申し込む">
    <h2 style="margin:0">交換を申し込む</h2>
    <div class="tr-pair"><div><div class="lbl">もらう（${esc(c.author || "？")}さんのカード）</div>${cardHTML(c, "sm")}</div></div>
    ${mine.length ? `<p style="margin:0"><b>渡すカードを1枚選んでね。</b><span class="note">　コピーを渡すので、あなたの手元からは減りません</span></p>
    <div class="gallery">${mine.map(x => `<div class="g-item" data-give="${esc(x.id)}" role="button" tabindex="0" aria-pressed="false">${cardHTML(x, "sm")}</div>`).join("")}</div>
    <div class="row"><button class="primary" data-send disabled>申し込む</button><button class="ghost" data-close>やめる</button></div>`
    : `<p style="margin:0">交換に出せるのは<b>自分で描いたカード</b>だけ。まずはカード工房で1枚描いてみよう！</p>
    <div class="row"><button class="primary" data-go="make">カードを描きにいく</button><button class="ghost" data-close>やめる</button></div>`}
  </div>`;
  $("#tradeDlg").hidden = false;
}
function closeTradeDlg(){ $("#tradeDlg").hidden = true; $("#tradeDlg").innerHTML = ""; tradePick = tradeWant = null; }
$("#tradeDlg").addEventListener("click", async e => {
  if (e.target === e.currentTarget || e.target.closest("[data-close]") || e.target.closest("[data-go]")){ closeTradeDlg(); return; }
  const g = e.target.closest("[data-give]");
  if (g){ tradePick = g.dataset.give; $("#tradeDlg").querySelectorAll("[data-give]").forEach(x => x.setAttribute("aria-pressed", x === g)); $("#tradeDlg [data-send]").disabled = false; return; }
  const send = e.target.closest("[data-send]");
  if (send && tradePick && tradeWant){
    const c = S.cards.get(tradeWant);
    send.disabled = true;
    try{
      await S.db.doc("trades/" + uid("t")).set({ from: S.uid, to: c.ownerId, fromName: S.name, toName: c.author || "？", give: tradePick, want: tradeWant, status: "pending", createdAt: Date.now() });
      toast(`申し込みました！${c.author || "相手"}さんが「交換する」を押すと成立します`); closeTradeDlg();
    }catch(err){ writeErr(err); send.disabled = false; }
  }
});
$("#tradeDlg").addEventListener("keydown", e => {
  if (e.key === "Escape") closeTradeDlg();
  if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-give]")){ e.preventDefault(); e.target.click(); }
});

/* ================= Firebase: anonymous sign-in + members-only passcode ================= */
// The passcode itself lives only in firestore.rules (server side). A browser becomes a member by
// creating members/<uid> with the right passcode; every other read/write requires membership.
async function connectFirebase(){
  S.connecting = true; renderAll();
  try{ await connectFirebase2(); } finally{ S.connecting = false; }
}
async function connectFirebase2(){
  // accepts either window.FIREBASE_CONFIG or the "const firebaseConfig = {...}" block pasted as-is from the Firebase console
  const cfg = window.FIREBASE_CONFIG || (typeof firebaseConfig !== "undefined" ? firebaseConfig : null);
  if (!cfg){ S.connErr = "config.js に Firebase の設定が見つかりません"; return; }
  if (!window.firebase){ S.connErr = "Firebase の読みこみに失敗しました（広告ブロッカーなどの拡張機能を止めて再読み込みしてね）"; return; }
  try{
    firebase.initializeApp(cfg);
    const fs = firebase.firestore();
    try{ fs.settings({ ignoreUndefinedProperties: true, merge: true }); }catch(e){}
    // keep a copy of the cards in this browser, so reopening the page shows them right away
    try{ fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); }catch(e){}
    // wait for the saved session first (a logged-in ID must not be replaced by a new guest)
    const cred = await new Promise(res => {
      const off = firebase.auth().onAuthStateChanged(u => {
        off();
        if (u) res({ user: u });
        else firebase.auth().signInAnonymously().then(c => res({ user: c.user }), err => { S.authErr = err && err.code; res({ user: null }); });
      });
      setTimeout(() => { S.authErr = S.authErr || "timeout"; res({ user: null }); }, 12000);
    });
    if (!cred.user && S.authErr === "timeout"){ S.connErr = "匿名ログインが終わりません（Firebase の Authentication →「設定」→「承認済みドメイン」に sabakan555.github.io を追加してみてね）"; return; }
    if (!cred.user){ S.connErr = "匿名ログインに失敗しました（Firebase の Authentication で「匿名」が有効になっているか確認してね）" + (S.authErr ? "［" + S.authErr + "］" : ""); return; }
    S.uid = cred.user.uid;
    S.loginId = cred.user.isAnonymous ? null : ((cred.user.email || "").split("@")[0] || null);
    // no passcode: anyone who has the URL can join (signed in anonymously)
    // Firestore waits forever when it can't reach the database, so probe once with a timeout
    const probe = fs.collection("cards").limit(1).get({ source: "server" });
    const ok = await Promise.race([probe.then(() => "ok", e => "err:" + (e && e.code)), new Promise(r => setTimeout(() => r("timeout"), 10000))]);
    if (ok !== "ok"){
      console.error("Firestore probe:", ok);
      S.connErr = ok === "timeout" ? "データベースにつながりません（Firestore Database が作成されているか、データベースIDが (default) になっているか確認してね）" : ok.includes("permission") ? "データベースの権限エラー（Firestore のルールに firestore.rules の中身を貼って「公開」したか確認してね）［" + ok + "］" : "データベースにつながりません［" + ok + "］";
      return;
    }
    S.db = fs;
    loadProfile();
  }catch(e){ console.error(e); S.connErr = "サーバーにつながりませんでした［" + (e && (e.code || e.message)) + "］"; }
}
function passGate(fs){
  return new Promise(resolve => {
    const gate = $("#gate"), form = $("#gateForm"), msg = $("#gateMsg");
    gate.hidden = false; setTimeout(() => $("#gateKey").focus(), 50);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const key = $("#gateKey").value.trim(); if (!key){ msg.textContent = "合言葉を入れてね"; return; }
      $("#gateBtn").disabled = true; msg.textContent = "確認中…";
      try{
        await fs.doc("members/" + S.uid).set({ key, name: S.name, at: Date.now() });
        gate.hidden = true; toast("ようこそ！"); resolve();
      }catch(err){ msg.textContent = "合言葉がちがうみたい。もう一度ためしてね"; }
      finally{ $("#gateBtn").disabled = false; }
    });
  });
}

async function boot(){
  buildStarters(); rebuildCards();
  initFilters("gal", () => renderGallery());
  initFilters("deck", () => renderDeck());
  initFilters("trade", () => renderTrade());
  S.name = ls.get("cb_name", "") || "プレイヤー";
  S.tab = "home";
  buildTheme();
  showIdx = Math.floor(Math.random() * 1000);
  renderAll();
  await connectFirebase();
  subscribeData(); refreshPack(); renderAll();
}
boot();
