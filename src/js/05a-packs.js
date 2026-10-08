/* Daily packs: authoritative draw/ownership live in the Worker, never localStorage. */
S.pack = { url: typeof packApiUrl === "string" ? packApiUrl.replace(/\/$/, "") : "", owned: new Set(), ready: false, busy: false, error: "", day: null, result: null, shown: false, offset: 0, loadedAt: 0 };
function packAccount(){ return typeof firebase !== "undefined" && firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous; }
async function packRequest(path){
  const u = firebase.auth().currentUser; if (!u || u.isAnonymous) throw Error("パックを開くにはIDを登録してログインしてね");
  const token = await u.getIdToken();
  const r = await fetch(S.pack.url + path, { method: "POST", headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(25000) });
  const d = await r.json(); if (!r.ok) throw Error(d.error || "通信できませんでした。もう一度ためしてね"); return d;
}
function applyPackStatus(d){
  S.pack.owned = new Set(d.owned || []); S.pack.day = d.day; S.pack.result = d.result || null; S.pack.offset = d.now - Date.now(); S.pack.nextReset = d.nextReset; S.pack.ready = true; S.pack.loadedAt = Date.now();
  rebuildOwned();
}
async function refreshPack(){
  if (!S.pack.url || !S.db || !packAccount() || S.pack.busy) return;
  S.pack.busy = true; S.pack.error = ""; if (S.tab === "pack") renderPack();
  try { applyPackStatus(await packRequest("/status")); }
  catch(e){ S.pack.error = e.name === "TimeoutError" ? "通信がタイムアウトしました。再読み込みしてね" : e.message; }
  finally { S.pack.busy = false; renderAll(); }
}
async function openDailyPack(){
  if (S.pack.busy) return;
  S.pack.busy = true; S.pack.error = ""; S.pack.shown = false; renderPack();
  try { const d = await packRequest("/open"); applyPackStatus(d); S.pack.shown = true; }
  catch(e){ S.pack.error = "結果を確認できませんでした。再読み込みすると、配布済みの結果も確認できます。" + (e.message ? "（" + e.message + "）" : ""); }
  finally { S.pack.busy = false; renderAll(); }
}
function renderPack(){
  const p = S.pack, box = $("#packContent"); if (!box) return;
  let note = "", disabled = p.busy, label = "タップして開ける", action = "open";
  if (!p.url){ note = "パックの公開準備中です。"; disabled = true; label = "準備中"; }
  else if (!S.db){ note = "サーバーに接続してね。"; disabled = true; label = "接続待ち"; }
  else if (!packAccount()){ note = 'パックを受け取るには、<button class="ghost" data-go="me">マイページでIDを登録・ログイン</button>してね。'; disabled = true; label = "ログインが必要です"; }
  else if (!p.ready){ label = p.busy ? "所持カードを確認中…" : "再読み込み"; action = "refresh"; }
  else if (p.result && p.result.day === p.day){ label = "今日の3枚をもう一度見る"; action = "show"; note = "今日のパックは受け取り済み。次は日本時間0:00に開けられます。"; }
  else if (p.busy){ label = "パックを開封中…"; }
  box.innerHTML = `<div class="pack-stage${p.busy ? " is-opening" : ""}"><button type="button" class="pack-pouch" data-pack="${action}" ${disabled ? "disabled" : ""} aria-label="${esc(label)}"><img src="assets/community-pack.png" alt="銀色の、みんなのカードパック。3枚入り" width="887" height="1774"></button></div><button class="primary pack-open" data-pack="${action}" ${disabled ? "disabled" : ""}>${esc(label)}</button><p class="pack-status" role="status">${note}</p>${p.error ? `<p class="pack-error" role="alert">${esc(p.error)}</p>` : ""}${p.url && packAccount() ? `<button class="small ghost" data-pack="refresh" ${p.busy ? "disabled" : ""}>再読み込み</button>` : ""}`;
  if (p.shown && p.result){
    box.innerHTML += `<div class="pack-results"><h3>${p.result.day === p.day ? "今日の" : esc(p.result.day) + "の"}パック</h3><div class="pack-cards">${p.result.cards.map((id,i) => { const c = S.cards.get(id); return `<figure style="--pack-i:${i}">${c ? `<button class="pack-card" data-pack-card="${esc(id)}" aria-label="${esc(c.name)}の詳細">${cardHTML(c)}</button><figcaption><b>${esc(c.name)}</b><span>作者：${esc(c.author || "？")}</span></figcaption>` : `<div class="pack-missing">このカードは削除されました</div>`}</figure>`; }).join("")}</div><p class="note">所持カードに追加しました。すでに持っているカードの所持数は増えません。</p><button class="primary" data-go="deck">デッキを作る</button></div>`;
  }
  if (p.url && S.db && packAccount() && !p.busy && !p.error && (!p.ready || Date.now() - p.loadedAt > 60000)) refreshPack();
}
$("#packContent").addEventListener("click", e => {
  const c = e.target.closest("[data-pack-card]"); if(c){ const ids = S.pack.result.cards.filter(id => S.cards.has(id)); openCardView("list", ids, ids.indexOf(c.dataset.packCard)); return; }
  const b = e.target.closest("[data-pack]"); if (!b || S.pack.busy) return;
  if (b.dataset.pack === "refresh") refreshPack();
  if (b.dataset.pack === "open") openDailyPack();
  if (b.dataset.pack === "show"){ S.pack.shown = true; renderPack(); $(".pack-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.pack.url && Date.now() - S.pack.loadedAt > 60000) refreshPack(); });
setInterval(() => { if (!document.hidden && S.tab === "pack" && S.pack.ready && Date.now() + S.pack.offset >= S.pack.nextReset && !S.pack.error) refreshPack(); }, 30000);
// Deleted originals disappear from saved decks once the full server snapshot is known.
const pruningDecks = new Set();
function pruneDeletedDeckCards(){
  if (!S.cardsReady || !S.decksReady) return;
  Object.keys(S.deckEdit?.cards || {}).forEach(id => { if (!S.cards.has(id)) delete S.deckEdit.cards[id]; });
  myDecks().forEach(d => {
    if (pruningDecks.has(d.id) || !Array.isArray(d.cards)) return;
    const cards = d.cards.filter(id => S.cards.has(id)); if (cards.length === d.cards.length) return;
    const { id } = d;
    pruningDecks.add(id);
    S.db.runTransaction(async tx => {
      const ref = S.db.doc("decks/" + id), snap = await tx.get(ref); if (!snap.exists) return;
      const current = snap.data(), kept = current.cards.filter(k => S.cards.has(k));
      if (kept.length !== current.cards.length) tx.update(ref, { cards: kept, key: current.key && kept.includes(current.key) ? current.key : null });
    }).then(() => toast("削除されたカードをデッキから外しました。対戦前に枚数を確認してね")).catch(writeErr).finally(() => pruningDecks.delete(id));
  });
}
function deckLimitIssue(ids){
  const counts = new Map(); ids.forEach(id => { const base = skinBase(id); counts.set(base, (counts.get(base) || 0) + 1); });
  for (const [id,n] of counts){ const c = S.cards.get(id), limit = cardLimit(c); if(c && limit > 0 && n > limit) return `「${c.name}」は${limit}枚までです（今は${n}枚）。デッキを編集してね`; }
  return "";
}
