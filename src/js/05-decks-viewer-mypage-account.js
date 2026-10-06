/* ================= decks ================= */
S.deckEdit = { id: null, cards: {} };
function myDecks(){ return S.decks.filter(d => isMine(d, "owner")); }
function allDeckOptions(){ return [...builtinDecks(), ...myDecks()]; }
function deckCount(){ return Object.entries(S.deckEdit.cards).reduce((a, [id, k]) => a + (isEx(S.cards.get(id)) ? 0 : k), 0); }
function deckExCount(){ return Object.entries(S.deckEdit.cards).reduce((a, [id, k]) => a + (isEx(S.cards.get(id)) ? k : 0), 0); }
function deckMonsters(){ return Object.entries(S.deckEdit.cards).reduce((a, [id, k]) => a + (cardType(S.cards.get(id)) === "monster" && !isEx(S.cards.get(id)) ? k : 0), 0); }
function renderDeck(){
  { const n = deckCount(), sp = $("#deckSpire").checked, ok = sp || (n >= MIN_DECK && deckMonsters() > 0); $("#deckFloatMeter").textContent = sp ? `${n}枚（スパイアデッキは枚数自由）` : `${n}枚（モンスター ${deckMonsters()}）${ok ? "" : "　20枚以上にしてね"}`; $("#deckFloat").classList.toggle("ng", !ok); }
  { const kc = S.deckEdit.key && S.deckEdit.cards[S.deckEdit.key] && S.cards.get(S.deckEdit.key); $("#deckKeyNote").textContent = kc ? `キーカード（サムネ）：「${kc.name}」` : "カードを押して「★ キーカードにする」でサムネを決められます"; }
  const sel = $("#deckEditSel"); const cur = S.deckEdit.id || "";
  sel.innerHTML = `<option value="">＋ 新しいデッキ</option>` + myDecks().map(d => `<option value="${esc(d.id)}">${esc(d.name)}${d.mana ? "【コスト】" : ""}（${d.cards.length}枚）</option>`).join("");
  sel.value = cur;
  const n = deckCount(), sp = $("#deckSpire").checked, ok = sp || (n >= MIN_DECK && deckMonsters() > 0);
  const m = $("#deckMeter"); m.textContent = (sp ? `${n}枚（スパイアデッキは枚数自由）` : `${n}枚（モンスター ${deckMonsters()}）`) + (deckExCount() ? `＋EX ${deckExCount()}枚` : ""); m.className = "meter " + (ok ? "ok" : "ng");
  $("#btnDeckDel").hidden = !S.deckEdit.id;
  { const ids = []; for (const [id, k] of Object.entries(S.deckEdit.cards)) for (let i = 0; i < k; i++) ids.push(id); $("#deckView").innerHTML = deckViewHTML(ids, $("#deckMana").checked); $("#deckViewNote").textContent = `${ids.length}枚・押すとくわしく見られる`; }
  const pool0 = [...S.userCards].filter(c => owns(c.id) || S.deckEdit.cards[c.id]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).concat(S.starters).filter(c => !c.token || S.deckEdit.cards[c.id]);
  const pool = sortCards(pool0.filter(c => matchCard(c, S.filt.deck) && (fitsDeck(c, $("#deckMana").checked) || S.deckEdit.cards[c.id])), S.filt.deck.sort);
  S.deckPoolIds = pool.map(c => c.id);
  setCount("deck", pool.length, pool0.length);
  $("#deckPool").innerHTML = (pool.length ? "" : `<p class="muted">条件に合うカードがありません。</p>`) + pool.map(c => {
    const k = famCount(c.id), lim = cardLimit(c), shown = k ? card(famPick(c.id)) : c;
    return `<div class="pool-item">${cardHTML(shown, "sm", "", { mana: $("#deckMana").checked })}<div class="cnt"><button class="small" data-dm="${esc(c.id)}" ${k ? "" : "disabled"} aria-label="へらす">−</button><b>${k}/${lim || "∞"}</b><button class="small" data-dp="${esc(c.id)}" ${lim && k >= lim ? "disabled" : ""} aria-label="ふやす">＋</button></div></div>`;
  }).join("");
}
$("#deckMana").addEventListener("change", renderDeck);
$("#deckView").addEventListener("click", e => stripClick(e, "deck"));
// スマホ: 下から出るシートのひらく／とじる
function deckSheet(open){ $("#deckViewBox").classList.toggle("sheet-open", !!open); $("#deckSheetBg").hidden = !open; if (open) $("#deckViewBox").open = true; }
$("#btnDeckSheet").addEventListener("click", () => deckSheet(!$("#deckViewBox").classList.contains("sheet-open")));
$("#btnDeckSheetX").addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); deckSheet(false); });
$("#deckSheetBg").addEventListener("click", () => deckSheet(false));
$("#deckViewBox").open = ls.get("cb_dkv", true) !== false;
$("#deckViewBox").addEventListener("toggle", () => ls.set("cb_dkv", $("#deckViewBox").open));
$("#deckSpire").addEventListener("change", () => { $("#deckSpcRow").hidden = !$("#deckSpire").checked; renderDeck(); });
$("#deckEditSel").addEventListener("change", e => {
  const d = S.decks.find(x => x.id === e.target.value);
  S.deckEdit = { id: d ? d.id : null, cards: {}, key: (d && d.key) || null };
  if (d) d.cards.forEach(id => S.deckEdit.cards[id] = (S.deckEdit.cards[id] || 0) + 1);
  $("#deckName").value = d ? d.name : "";
  $("#deckMana").checked = !!(d && d.mana); $("#deckSpire").checked = !!(d && d.spire); $("#deckSpc").value = d && d.spc === "silent" ? "silent" : ""; $("#deckSpcRow").hidden = !$("#deckSpire").checked;
  renderDeck();
});
// スキン違いは同じカードとして数える（枚数制限もまとめて）
const famIds = id => Object.keys(S.deckEdit.cards).filter(k => skinBase(k) === skinBase(id));
const famCount = id => famIds(id).reduce((t, k) => t + (S.deckEdit.cards[k] || 0), 0);
const famPick = id => famIds(id).sort((a, b) => (S.deckEdit.cards[b] || 0) - (S.deckEdit.cards[a] || 0))[0] || id;
function famAdd(id, d){
  const lim = cardLimit(S.cards.get(skinBase(id))), tot = famCount(id);
  if (d > 0){ if (lim && tot >= lim) return; const t = S.deckEdit.cards[id] ? id : famPick(id); S.deckEdit.cards[t] = (S.deckEdit.cards[t] || 0) + 1; return; }
  const t = S.deckEdit.cards[id] ? id : famIds(id)[0]; if (!t) return; S.deckEdit.cards[t] = Math.max(0, (S.deckEdit.cards[t] || 0) - 1); if (!S.deckEdit.cards[t]) delete S.deckEdit.cards[t];
}
// デッキの中のこのカードを、ぜんぶ同じスキンにする
function famSkin(id, to){
  const tot = famCount(id), keyIn = S.deckEdit.key && skinBase(S.deckEdit.key) === skinBase(id);
  famIds(id).forEach(k => delete S.deckEdit.cards[k]); if (tot) S.deckEdit.cards[to] = tot; if (keyIn) S.deckEdit.key = to;
}
$("#deckPool").addEventListener("click", e => {
  if (p) famAdd(p.dataset.dp, 1);
  if (m) famAdd(m.dataset.dm, -1);
  if (p || m) renderDeck();
});
$("#btnDeckSave").addEventListener("click", async () => {
  if (!$("#deckSpire").checked && deckCount() < MIN_DECK){ toast(`デッキは${MIN_DECK}枚以上にしてね`); return; }
  if (!$("#deckSpire").checked && !deckMonsters()){ toast("モンスターを1枚以上入れてね"); return; }
  const name = $("#deckName").value.trim() || "マイデッキ";
  const cards = []; for (const [id, k] of Object.entries(S.deckEdit.cards)) for (let i = 0; i < k; i++) cards.push(id);
  const id = S.deckEdit.id || uid("d");
  try{ await saveDeckDoc(id, { name, owner: S.name, ownerId: (S.decks.find(d => d.id === id) || {}).ownerId || S.uid || null, cards, mana: $("#deckMana").checked, spire: $("#deckSpire").checked, spc: $("#deckSpire").checked && $("#deckSpc").value === "silent" ? "silent" : null, key: S.deckEdit.key && S.deckEdit.cards[S.deckEdit.key] ? S.deckEdit.key : null, updatedAt: Date.now() }); S.deckEdit.id = id; ls.set("cb_deck", id); toast("デッキを保存しました"); renderDeck(); }
  catch(e){ writeErr(e); }
});
let deckDelArm = false;
$("#btnDeckDel").addEventListener("click", async () => {
  if (!deckDelArm){ deckDelArm = true; $("#btnDeckDel").textContent = "本当に消す"; setTimeout(() => { deckDelArm = false; $("#btnDeckDel").textContent = "このデッキを消す"; }, 3000); return; }
  deckDelArm = false; $("#btnDeckDel").textContent = "このデッキを消す";
  try{ await deleteDeckDoc(S.deckEdit.id); S.deckEdit = { id: null, cards: {} }; $("#deckName").value = ""; $("#deckMana").checked = false; $("#deckSpire").checked = false; $("#deckSpc").value = ""; $("#deckSpcRow").hidden = true; toast("デッキを消しました"); renderDeck(); } catch(e){ writeErr(e); }
});

/* ================= card viewer ================= */
// big card + details, opened by clicking a card in the deck editor or the card list; ‹ › moves through that list
const CV = { ctx: null, ids: [], i: 0 };
function openCardView(ctx, ids, i){ if (!ids || !ids.length || i < 0 || i >= ids.length) return; Object.assign(CV, { ctx, ids: ids.slice(), i }); renderCardView(); }
function closeCardView(){ const v = $("#cardView"); v.hidden = true; v.innerHTML = ""; CV.ctx = null; }
function renderCardView(){
  const c = S.cards.get(CV.ids[CV.i]); if (!c){ closeCardView(); return; }
  const t = cardType(c), mana = CV.ctx === "deck" ? $("#deckMana").checked : undefined, ft = fxText(c, true), lim = cardLimit(c), rows = [];
  rows.push(["種類", typeLabel(c)]);
  if (t === "monster") rows.push(["ATK", fmtN(baseAtk(c))]);
  if (t === "equip") rows.push(["ATK", `${(c.eqN || 0) >= 0 ? "+" : "−"}${Math.abs(c.eqN || 0)}`], ["装備コスト", String(eqCostOf(c))]);
  if (t === "monster") rows.push(["装備キャパ", String(eqCapOf(c)) + (hasEqCap(c) ? "" : "（ATK÷100）")]);
  if (hasCost(c) && mana !== false) rows.push(["コスト", String(costLabel(c))]);
  if (!c.starter) rows.push(["使えるデッキ", DECK_LABEL[deckModeOf(c)]]);
  rows.push(["デッキ上限", lim ? `${lim}枚まで` : "制限なし"]);
  if (tagsOf(c).length) rows.push(["タグ", tagsOf(c).map(t => "#" + t).join(" ")]);
  rows.push(["作った人", c.author || "？"]);
  let text = "", auto = "";
  { const et = t === "equip" ? eqText(c) : monAbsText(c); if (et) auto += `<p class="cv-fx">${kwLink(esc(et))}</p>`; }
  if (ft) auto += `<p class="cv-fx">${tkLink(esc(ft))}</p>`;
  if (exhausts(c)) auto += `<p class="cv-fx">廃棄</p>`;
  if (freeText(c)) text = `<p>${rubyHTML(c.effect)}</p>` + (auto ? `<p class="cv-cap">本来の効果</p>${auto}` : "");
  else text = auto;
  if (!text) text = `<p class="muted">効果なし</p>`;
  if (c.flavor) text += `<p class="cv-flv">${rubyHTML(c.flavor)}</p>`;
  let foot = "";
  if (CV.ctx === "deck"){
    const k = famCount(c.id), sk = skinsOf(c.id), bid = skinBase(c.id);
    const skinRow = sk.length ? `<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px"><span class="note">スキン</span>${[{ id: bid, name: "もとの見た目" }, ...sk.map(s => ({ id: bid + "~" + s.key, name: s.name || "スキン" }))].map(x => `<button class="small${x.id === c.id ? " primary" : ""}" data-cv="skin" data-cvskin="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div>` : "";
    foot = `${skinRow}<div class="cv-foot"><span>デッキに入っている枚数　<b>${k}</b> / ${lim || "∞"}</span><div class="row">${k ? (S.deckEdit.key === c.id ? `<span class="note">★ キーカード</span>` : `<button class="small" data-cv="key">★ キーカードにする</button>`) : ""}<button class="danger" data-cv="minus" ${k ? "" : "disabled"}>− へらす</button><button class="primary" data-cv="plus" ${lim && k >= lim ? "disabled" : ""}>＋ ふやす</button></div></div>`;
  }
  $("#cardView").innerHTML = `<div class="cv-box" role="dialog" aria-label="カード詳細">
    <button class="cv-x ghost" data-cv="close" aria-label="とじる">×</button>
    <button class="cv-nav prev" data-cv="prev" ${CV.i ? "" : "disabled"} aria-label="前のカード">‹</button>
    <div class="cv-card">${cardHTML(c, "", "", mana === undefined ? {} : { mana })}</div>
    <div class="cv-info"><div class="row" style="justify-content:space-between;align-items:center;gap:8px"><h2>${rubyHTML(c.nameRuby || c.name)}</h2><button class="small" data-cv="shot" title="このカードを画像（PNG）で保存">📷 画像で保存</button></div><dl class="cv-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${tkLink(esc(v))}</dd>`).join("")}</dl><h3>テキスト</h3><div class="cv-text">${text}</div>${foot}</div>
    <button class="cv-nav next" data-cv="next" ${CV.i < CV.ids.length - 1 ? "" : "disabled"} aria-label="次のカード">›</button>
    <div class="cv-pos">${CV.i + 1} / ${CV.ids.length}</div></div>`;
  $("#cardView").hidden = false;
}
$("#cardView").addEventListener("click", e => {
  if (e.target === e.currentTarget){ closeCardView(); return; }
  const b = e.target.closest("[data-cv]"); if (!b) return;
  const k = b.dataset.cv, id = CV.ids[CV.i];
  if (k === "skin"){ const to = b.dataset.cvskin; famSkin(id, to); CV.ids[CV.i] = to; renderDeck(); renderCardView(); return; }
  if (k === "close"){ closeCardView(); return; }
  if (k === "shot"){ saveCardImage(card(id)); return; }
  if (k === "prev" && CV.i > 0){ CV.i--; renderCardView(); }
  if (k === "next" && CV.i < CV.ids.length - 1){ CV.i++; renderCardView(); }
  if (k === "key"){ S.deckEdit.key = id; renderDeck(); renderCardView(); toast("キーカードにしました（デッキを保存すると反映）"); return; }
  if (k === "plus" || k === "minus"){
    famAdd(id, k === "plus" ? 1 : -1);
    renderDeck(); renderCardView();
  }
});
document.addEventListener("keydown", e => {
  if ($("#cardView").hidden) return;
  if (e.key === "Escape") closeCardView();
  if (e.key === "ArrowLeft") $("#cardView [data-cv=prev]")?.click();
  if (e.key === "ArrowRight") $("#cardView [data-cv=next]")?.click();
});
$("#deckPool").addEventListener("click", e => {
  if (e.target.closest("button")) return;
  const it = e.target.closest(".pool-item"); if (!it) return;
  openCardView("deck", S.deckPoolIds, [...$("#deckPool").querySelectorAll(".pool-item")].indexOf(it));
});
$("#gallery").addEventListener("click", e => {
  if (e.target.closest("button")) return;
  const it = e.target.closest(".g-item"); if (!it || !e.target.closest(".card")) return;
  openCardView("list", S.galIds, [...$("#gallery").querySelectorAll(".g-item")].indexOf(it));
});

/* ================= my page ================= */
const DEFAULT_AV = `<svg width="60%" height="60%" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="none" stroke="#3b4166" stroke-width="2"/><path d="M3.8 21c.8-4.4 4.2-6.6 8.2-6.6s7.4 2.2 8.2 6.6" fill="none" stroke="#3b4166" stroke-width="2" stroke-linecap="round"/></svg>`;
// icon: the art of one of your own cards (kept in this browser), else the account picture
function myIcon(){ const c = S.cards && S.cards.get(ls.get("cb_icon", "")); return (c && c.img) || S.avatar || ""; }
// wins / losses are kept in this browser; an online game is counted once even if you come back to the room
function recordResult(){
  if (!G || !G.st || !G.st.winner || G.recorded || G.spectate) return;
  G.recorded = true;
  const r = ls.get("cb_record", null) || { cpu: { w: 0, l: 0, d: 0 }, online: { w: 0, l: 0, d: 0 }, seen: [] };
  const key = G.mode === "online" ? `on:${G.code}:${(G.st.log[0] || {}).t || ""}` : null;
  if (key && r.seen.includes(key)) return;
  const res = G.st.winner === "draw" ? "d" : G.st.winner === G.slot ? "w" : "l";
  r[G.mode === "online" ? "online" : "cpu"][res]++;
  if (key){ r.seen.push(key); r.seen = r.seen.slice(-60); }
  ls.set("cb_record", r); saveProfile();
}
/* ---- sleeve editor (My page): background colour + movable photo + pen layer ---- */
const SL = { color: "#1e2328", size: 10, erase: false, undo: [], ready: false, bg: "#07328a", photo: null, mode: "draw" };
const slCv = $("#slCv"), slX = slCv.getContext("2d");
const slInk = document.createElement("canvas"); slInk.width = slCv.width; slInk.height = slCv.height;
const slIk = slInk.getContext("2d");
function slDraw(){
  slX.setTransform(1, 0, 0, 1, 0, 0);
  slX.fillStyle = SL.bg || "#fff"; slX.fillRect(0, 0, slCv.width, slCv.height);
  const ph = SL.photo;
  if (ph){ slX.save(); slX.translate(ph.x, ph.y); slX.rotate(ph.r); slX.scale(ph.s, ph.s); slX.drawImage(ph.img, -ph.img.width / 2, -ph.img.height / 2); slX.restore(); }
  slX.drawImage(slInk, 0, 0);
  if (SL.mode === "photo"){ slX.strokeStyle = "rgba(224,83,58,.95)"; slX.lineWidth = 6; slX.setLineDash([14, 10]); slX.strokeRect(3, 3, slCv.width - 6, slCv.height - 6); slX.setLineDash([]); }
}
function slUI(){
  $("#slPhotoPanel").hidden = SL.mode !== "photo" || !SL.photo;
  $("#slPhEdit").hidden = SL.mode === "photo" || !SL.photo;
  if (SL.photo){ $("#slPhScale").value = Math.round(SL.photo.s / SL.photo.base * 100); $("#slPhRot").value = Math.round(SL.photo.r * 180 / Math.PI); }
  slCv.style.cursor = SL.mode === "photo" ? "move" : "crosshair";
}
function slSetPhoto(im, fit){
  const base = Math.max(slCv.width / im.width, slCv.height / im.height);
  SL.photo = { img: im, x: slCv.width / 2, y: slCv.height / 2, s: base, base, r: 0 };
  SL.mode = fit ? "draw" : "photo"; slUI(); slDraw();
}
function slDefault(){ // the usual blue back with a "?"
  SL.bg = "#07328a"; SL.photo = null; SL.mode = "draw";
  slIk.clearRect(0, 0, slInk.width, slInk.height);
  slIk.fillStyle = "rgba(255,255,255,.9)"; slIk.font = `${slInk.width * .3}px "Dela Gothic One",sans-serif`; slIk.textAlign = "center"; slIk.textBaseline = "middle"; slIk.fillText("?", slInk.width / 2, slInk.height / 2);
  slUI(); slDraw();
}
// a saved sleeve comes back as the photo layer (so it can still be moved), with an empty pen layer
function slLoad(){
  const src = mySleeve();
  if (!src){ slDefault(); return; }
  SL.bg = "#fff"; slIk.clearRect(0, 0, slInk.width, slInk.height);
  const im = new Image(); im.onload = () => slSetPhoto(im, true); im.src = src;
}
function slPush(){ try{ SL.undo.push({ ink: slIk.getImageData(0, 0, slInk.width, slInk.height), photo: SL.photo ? { ...SL.photo } : null, bg: SL.bg }); if (SL.undo.length > 20) SL.undo.shift(); }catch(e){} }
function slTools(){
  document.querySelectorAll("#slSw .sw").forEach(b => b.setAttribute("aria-pressed", !SL.erase && b.dataset.c === SL.color));
  document.querySelectorAll("#slSize button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.s === SL.size));
  $("#slErase").setAttribute("aria-pressed", SL.erase); $("#slErase").classList.toggle("primary", SL.erase);
}
$("#slSw").innerHTML = COLORS.map(c => `<button class="sw" style="background:${c}" data-c="${c}" aria-label="色 ${c}"></button>`).join("");
$("#slSize").innerHTML = [["細", 5], ["中", 10], ["太", 22]].map(([l, s]) => `<button data-s="${s}">${l}</button>`).join("");
$("#slSw").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SL.color = b.dataset.c; SL.erase = false; if (SL.mode === "photo"){ SL.mode = "draw"; slUI(); slDraw(); } slTools(); });
$("#slSize").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SL.size = +b.dataset.s; slTools(); });
$("#slErase").addEventListener("click", () => { SL.erase = !SL.erase; slTools(); });
$("#slUndo").addEventListener("click", () => { const d = SL.undo.pop(); if (!d) return; slIk.putImageData(d.ink, 0, 0); SL.photo = d.photo; SL.bg = d.bg; if (!SL.photo) SL.mode = "draw"; slUI(); slDraw(); });
$("#slFill").addEventListener("click", () => { slPush(); SL.bg = SL.color; slDraw(); });
$("#slClear").addEventListener("click", () => { slPush(); slIk.clearRect(0, 0, slInk.width, slInk.height); SL.photo = null; SL.bg = "#fff"; SL.mode = "draw"; slUI(); slDraw(); });
$("#slFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { slPush(); slSetPhoto(im, false); }; im.src = rd.result; }; rd.readAsDataURL(f);
});
$("#slPhScale").addEventListener("input", e => { if (!SL.photo) return; SL.photo.s = SL.photo.base * (+e.target.value / 100); slDraw(); });
$("#slPhRot").addEventListener("input", e => { if (!SL.photo) return; SL.photo.r = (+e.target.value) * Math.PI / 180; slDraw(); });
$("#slPhScale").addEventListener("pointerdown", () => slPush()); $("#slPhRot").addEventListener("pointerdown", () => slPush());
$("#slPhFit").addEventListener("click", () => { if (!SL.photo) return; slPush(); Object.assign(SL.photo, { x: slCv.width / 2, y: slCv.height / 2, r: 0, s: SL.photo.base }); slUI(); slDraw(); });
$("#slPhDel").addEventListener("click", () => { slPush(); SL.photo = null; SL.mode = "draw"; slUI(); slDraw(); });
$("#slPhDone").addEventListener("click", () => { SL.mode = "draw"; slUI(); slDraw(); });
$("#slPhEdit").addEventListener("click", () => { SL.mode = "photo"; slUI(); slDraw(); });
const slPt = e => { const r = slCv.getBoundingClientRect(); return { x: (e.clientX - r.left) * slCv.width / r.width, y: (e.clientY - r.top) * slCv.height / r.height }; };
function slLine(a, b){
  slIk.save(); slIk.lineCap = slIk.lineJoin = "round";
  slIk.globalCompositeOperation = SL.erase ? "destination-out" : "source-over";
  slIk.strokeStyle = slIk.fillStyle = SL.erase ? "#000" : SL.color; slIk.lineWidth = SL.erase ? SL.size * 2 : SL.size;
  if (a.x === b.x && a.y === b.y){ slIk.beginPath(); slIk.arc(a.x, a.y, slIk.lineWidth / 2, 0, 7); slIk.fill(); }
  else { slIk.beginPath(); slIk.moveTo(a.x, a.y); slIk.lineTo(b.x, b.y); slIk.stroke(); }
  slIk.restore();
}
// photo mode: drag to move, two fingers (or the wheel) to zoom
const slPtrs = new Map(); let slLast = null, slDrag = null, slPinch = null;
slCv.addEventListener("pointerdown", e => {
  e.preventDefault(); slCv.setPointerCapture(e.pointerId);
  if (SL.mode === "photo" && SL.photo){
    slPtrs.set(e.pointerId, slPt(e));
    if (slPtrs.size === 1){ slPush(); const p = slPt(e); slDrag = { p, x: SL.photo.x, y: SL.photo.y }; }
    if (slPtrs.size === 2){ const [a, b] = [...slPtrs.values()]; slPinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), s: SL.photo.s, r: SL.photo.r }; slDrag = null; }
    return;
  }
  slPush(); slLast = slPt(e); slLine(slLast, slLast); slDraw();
});
slCv.addEventListener("pointermove", e => {
  if (SL.mode === "photo" && SL.photo){
    if (!slPtrs.has(e.pointerId)) return;
    slPtrs.set(e.pointerId, slPt(e));
    if (slPinch && slPtrs.size >= 2){ const [a, b] = [...slPtrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); SL.photo.s = Math.min(SL.photo.base * 4, Math.max(SL.photo.base * .1, slPinch.s * d / slPinch.d)); SL.photo.r = slPinch.r + Math.atan2(b.y - a.y, b.x - a.x) - slPinch.a; slUI(); slDraw(); return; }
    if (slDrag){ const p = slPt(e); SL.photo.x = slDrag.x + p.x - slDrag.p.x; SL.photo.y = slDrag.y + p.y - slDrag.p.y; slDraw(); }
    return;
  }
  if (!slLast) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])){ const p = slPt(ev); slLine(slLast, p); slLast = p; }
  slDraw();
});
["pointerup", "pointercancel"].forEach(t => slCv.addEventListener(t, e => { slLast = null; slPtrs.delete(e.pointerId); if (slPtrs.size < 2) slPinch = null; if (!slPtrs.size) slDrag = null; }));
slCv.addEventListener("wheel", e => {
  if (SL.mode !== "photo" || !SL.photo) return;
  e.preventDefault();
  SL.photo.s = Math.min(SL.photo.base * 4, Math.max(SL.photo.base * .1, SL.photo.s * Math.exp(-e.deltaY * .0015)));
  slUI(); slDraw();
}, { passive: false });
// saved small (it travels inside every online game), stepping the quality down until it fits
function slEncode(){
  const was = SL.mode; SL.mode = "draw"; slDraw();
  const c = document.createElement("canvas"); c.width = 195; c.height = 267; c.getContext("2d").drawImage(slCv, 0, 0, c.width, c.height);
  SL.mode = was; slDraw();
  let url = ""; for (const q of [.85, .75, .65, .55, .45]){ url = c.toDataURL("image/jpeg", q); if (url.length < 40000) break; }
  return url;
}
$("#slSave").addEventListener("click", () => { ls.set("cb_sleeve", slEncode()); if (typeof saveProfile === "function") saveProfile(); renderMe(); toast("スリーブを保存しました（次の対戦から使われます）"); });
$("#slReset").addEventListener("click", () => { ls.set("cb_sleeve", ""); if (typeof saveProfile === "function") saveProfile(); SL.undo = []; slDefault(); renderMe(); toast("いつものスリーブに戻しました"); });
function renderMe(){
  if (!SL.ready){ SL.ready = true; slTools(); slLoad(); }
  $("#slNow").innerHTML = backHTML("", "", mySleeve());
  renderAcct();
  if (document.activeElement !== $("#mpName")) $("#mpName").value = S.name;
  const mine = S.userCards.filter(c => isMine(c)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const icon = ls.get("cb_icon", "");
  $("#mpIcon").innerHTML = `<option value="">${S.avatar ? "アカウントの画像" : "なし"}</option>` + mine.filter(c => c.img).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  $("#mpIcon").value = mine.some(c => c.id === icon) ? icon : "";
  const src = myIcon(); $("#mpAv").innerHTML = src ? `<img alt="" src="${esc(src)}">` : DEFAULT_AV;
  const r = ls.get("cb_record", null) || { cpu: { w: 0, l: 0, d: 0 }, online: { w: 0, l: 0, d: 0 } };
  const w = r.cpu.w + r.online.w, l = r.cpu.l + r.online.l, d = r.cpu.d + r.online.d, n = w + l + d;
  const tiles = [
    ["勝ち", w, n ? `勝率 ${Math.round(w / n * 100)}%` : "まだ対戦していません"],
    ["負け", l, d ? `引き分け ${d}` : ""],
    ["オンライン", `${r.online.w}勝`, `${r.online.l}敗${r.online.d ? ` ${r.online.d}分` : ""}`],
    ["CPU", `${r.cpu.w}勝`, `${r.cpu.l}敗${r.cpu.d ? ` ${r.cpu.d}分` : ""}`],
    ["描いたカード", mine.length, ""],
    ["デッキ", myDecks().length, ""]
  ];
  if (S.owned && S.db) tiles.push(["持ってるカード", S.owned.size, "スターター込み"]);
  if (typeof allTrades === "function" && S.db) tiles.push(["交換", allTrades().filter(t => t.status === "accepted").length, "成立した回数"]);
  $("#mpStats").innerHTML = tiles.map(([k, v, s]) => `<div class="me-stat"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join("");
  const decks = myDecks();
  $("#mpDecks").innerHTML = decks.map(dk => {
    const face = dk.cards.map(id => S.cards.get(id)).find(c => c && cardType(c) === "monster" && c.img) || S.cards.get(dk.cards[0]);
    return `<div class="me-deck">${face ? cardHTML(face, "", "", { mana: !!dk.mana }) : ""}<div style="flex:1;min-width:0"><div class="nm">${esc(dk.name)}</div><div class="meta">${dk.cards.length}枚${dk.mana ? "・コストデッキ" : ""}${dk.spire ? "・スパイア" : ""}</div><div class="row" style="gap:6px;margin-top:6px"><button class="small" data-medit="${esc(dk.id)}">編集</button><button class="small primary" data-muse="${esc(dk.id)}">対戦で使う</button></div></div></div>`;
  }).join("") || `<p class="muted">まだデッキがありません。</p>`;
  S.meIds = mine.map(c => c.id);
  $("#mpCards").innerHTML = mine.map(c => `<div class="g-item">${cardHTML(c, "sm")}</div>`).join("") || `<p class="muted">まだカードがありません。</p>`;
}
$("#mpName").addEventListener("change", e => { S.name = e.target.value.trim() || "プレイヤー"; e.target.value = S.name; ls.set("cb_name", S.name); saveProfile(); renderAll(); });
$("#mpIcon").addEventListener("change", e => { ls.set("cb_icon", e.target.value); saveProfile(); renderMe(); });
$("#mpDecks").addEventListener("click", e => {
  const ed = e.target.closest("[data-medit]"), use = e.target.closest("[data-muse]");
  if (ed){ openDeckEditor(ed.dataset.medit); }
  if (use){ ls.set("cb_deck", use.dataset.muse); S.tab = "play"; ls.set("cb_tab", "play"); renderAll(); window.scrollTo(0, 0); toast("このデッキで対戦できます"); }
});
$("#mpCards").addEventListener("click", e => {
  const it = e.target.closest(".g-item"); if (!it) return;
  openCardView("list", S.meIds, [...$("#mpCards").querySelectorAll(".g-item")].indexOf(it));
});

/* ================= deck list (front page of the Deck tab) ================= */
S.deckView = "list"; S.deckPick = null; S.thumbPick = false;
// thumbnail / key card: the one you picked, else the first monster with a picture
function deckKey(d){
  if (!d) return null;
  const ok = id => d.cards.includes(id) && S.cards.has(id);
  if (d.key && ok(d.key)) return S.cards.get(d.key);
  const cs = d.cards.map(id => S.cards.get(id)).filter(Boolean);
  return cs.find(c => cardType(c) === "monster" && c.img) || cs.find(c => c.img) || cs[0] || null;
}
const bgUrl = c => c && c.img ? `background-image:url('${c.img}')` : "";
function renderDeckTab(){
  $("#deckList").hidden = S.deckView === "edit"; $("#deckEditWrap").hidden = S.deckView !== "edit";
  if (S.deckView === "edit") renderDeck(); else renderDeckList();
}
function renderDeckList(){
  const mine = myDecks(), built = [...builtinDecks()], all = [...mine, ...built];
  if (!all.some(d => d.id === S.deckPick)) S.deckPick = (all.find(d => d.id === ls.get("cb_deck", "")) || all[0]).id;
  const d = all.find(x => x.id === S.deckPick), own = !d.builtin;
  const tile = x => { const k = deckKey(x); return `<button class="dk-tile${x.id === S.deckPick ? " on" : ""}" data-dpick="${esc(x.id)}"><span class="dk-thumb" style="${bgUrl(k)}"></span><span class="dk-name">${esc(x.name)}</span>${x.mana ? `<span class="dk-tag">コスト</span>` : ""}</button>`; };
  const cs = d.cards.map(id => S.cards.get(id)).filter(Boolean), key = deckKey(d);
  const cnt = { monster: 0, magic: 0, equip: 0, trap: 0 }; cs.forEach(c => cnt[cardType(c)]++);
  let buckets, cap;
  if (d.mana){ cap = "コストの分布"; buckets = Array.from({ length: 8 }, (_, i) => [i === 7 ? "7+" : String(i), cs.filter(c => i === 7 ? costOf(c) >= 7 : costOf(c) === i).length]); }
  else { cap = "モンスターのATK分布"; const mons = cs.filter(c => cardType(c) === "monster"), lo = [0, 100, 200, 300, 400, 500]; buckets = lo.map((v, i) => [i === 5 ? "500〜" : `${v}〜`, mons.filter(c => { const a = baseAtk(c); return i === 5 ? a >= 500 : a >= v && a < lo[i + 1]; }).length]); }
  const mx = Math.max(1, ...buckets.map(b => b[1]));
  const picker = own && S.thumbPick ? `<div class="box" style="display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between"><b>サムネにするカードをえらんでね</b><button class="small ghost" data-dthumb>やめる</button></div><div class="dk-picker">${[...new Set(d.cards)].filter(id => S.cards.has(id)).map(id => `<div data-dkey="${esc(id)}">${cardHTML(S.cards.get(id), "", "", { mana: !!d.mana })}</div>`).join("")}</div></div>` : "";
  $("#deckList").innerHTML = `<div class="dk-wrap">
    <div class="box dk-left">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">デッキ一覧</h2><button class="small primary" data-dnew>＋ 新しいデッキ</button></div>
      <h3 class="dk-h">自分のデッキ　<span class="note">${mine.length}</span></h3>
      <div class="dk-grid">${mine.map(tile).join("") || `<p class="muted" style="margin:0">まだデッキがありません。「＋ 新しいデッキ」から作ろう</p>`}</div>
      <h3 class="dk-h">はじめからあるデッキ</h3>
      <div class="dk-grid">${built.map(tile).join("")}</div>
    </div>
    <div class="dk-right">
      <div class="dk-key" style="${bgUrl(key)}"><span class="dk-keylbl">キーカード</span>${key ? `<span class="dk-keyname">${esc(key.name)}</span>` : ""}</div>
      <div class="box" style="display:flex;flex-direction:column;gap:12px">
        <div class="dk-title"><h2>${esc(d.name)}${d.mana ? `<span class="note">　コストデッキ</span>` : ""}</h2><span class="dk-total">${cs.length}<small> 枚</small></span></div>
        <div class="dk-stats">
          <div><div class="dk-cap">${cap}</div><div class="dk-bars">${buckets.map(([l, n]) => `<div class="dk-bar"><b>${n}</b><i style="height:${Math.round(n / mx * 82)}%"></i><span>${l}</span></div>`).join("")}</div></div>
          <dl class="dk-types"><dt>モンスター</dt><dd>${cnt.monster}</dd><dt>魔法</dt><dd>${cnt.magic}</dd><dt>装備</dt><dd>${cnt.equip}</dd><dt>罠</dt><dd>${cnt.trap}</dd></dl>
        </div>
      </div>
      ${picker}
      <div class="dk-actions"><button class="primary dk-play" data-dplay>このデッキで対戦</button></div>
      <div class="dk-actions">${own ? `<button data-dedit>デッキ編集</button><button data-dthumb>${S.thumbPick ? "サムネ選びをやめる" : "サムネを変える"}</button><button class="danger small" data-ddel>${S.dkDelArm === d.id ? "本当に消す" : "デッキ削除"}</button>` : `<button data-dcopy>これをもとに作る</button>`}</div>
    </div>
  </div>`;
  $("#deckList").insertAdjacentHTML("beforeend", `<div class="box dk-strips-wrap"><h3 style="margin:0">デッキの中身 <span class="note">押すとくわしく見られる</span></h3>${deckViewHTML(d.cards, !!d.mana, true)}</div>`);
}
// デッキの中身: one strip per card copy (like the deck screen of card apps), sorted by cost / type
function deckSortIds(ids, mana){
  const TYPE_ORD = { monster: 0, magic: 1, equip: 2, trap: 3 };
  return ids.filter(id => S.cards.get(id)).sort((a, b) => { const x = card(a), y = card(b); return (mana ? costOf(x) - costOf(y) : 0) || TYPE_ORD[cardType(x)] - TYPE_ORD[cardType(y)] || (cardType(x) === "monster" && cardType(y) === "monster" ? baseAtk(x) - baseAtk(y) : 0) || String(x.name).localeCompare(String(y.name), "ja") || (a < b ? -1 : a > b ? 1 : 0); });
}
function deckViewHTML(ids, mana, noHead){
  const TYPE_SHORT = { monster: "モ", magic: "魔", equip: "装", trap: "罠" };
  const L = deckSortIds(ids, mana), cs = L.map(id => card(id)), uniq = [...new Set(L)];
  if (!L.length) return `<p class="muted" style="margin:8px 0 0">まだカードが入っていません。下のカードの「＋」で入れよう</p>`;
  const cnt = { monster: 0, magic: 0, equip: 0, trap: 0 }; cs.forEach(c => cnt[cardType(c)]++);
  let curve = "";
  if (mana){ const b = Array.from({ length: 8 }, (_, i) => [i === 7 ? "7+" : String(i), cs.filter(c => i === 7 ? costOf(c) >= 7 : costOf(c) === i).length]), mx = Math.max(1, ...b.map(x => x[1])); curve = `<div class="dkv-curve" title="コストの分布">${b.map(([l, n]) => `<div><b>${n || ""}</b><i style="height:${Math.round(n / mx * 70)}%"></i>${l}</div>`).join("")}</div>`; }
  const types = `<div class="dkv-types">${["monster", "magic", "equip", "trap"].map(t => `<span>${TYPE_LABEL[t]}<b>${cnt[t]}</b></span>`).join("")}<span>合計<b>${L.length}</b>枚</span></div>`;
  const strip = id => { const c = card(id), t = cardType(c), cost = mana && hasCost(c) ? costLabel(c) : TYPE_SHORT[t]; return `<button type="button" class="dk-strip t-${t}${c.token ? " token" : ""}${c.ex ? " ex" : ""}" data-cvid="${esc(id)}" data-cvi="${uniq.indexOf(id)}" title="${esc(c.name)}"><span class="ds-art" style="${bgUrl(c)}"></span><span class="ds-cost${mana && hasCost(c) ? "" : " sm"}">${esc(String(cost))}</span>${t === "monster" ? `<span class="ds-atk">${fmtN(baseAtk(c))}</span>` : ""}<span class="ds-name">${esc(c.name)}</span></button>`; };
  const main = L.filter(id => !isEx(card(id))), exL = L.filter(id => isEx(card(id)));
  const grid = (ids, h) => ids.length ? `${h}<div class="dkv-grid" data-uniq="${esc(JSON.stringify(uniq))}">${ids.map(strip).join("")}</div>` : "";
  return `${noHead ? "" : `<div class="dkv-head">${curve}${types}</div>`}${grid(main, "")}${grid(exL, `<div class="dkv-exh">EXデッキ <b>${exL.length}</b>枚</div>`)}`;
}
function stripClick(e, ctx){
  const b = e.target.closest("[data-cvid]"); if (!b) return false;
  const g = b.closest(".dkv-grid"); let uniq = []; try{ uniq = JSON.parse(g.dataset.uniq || "[]"); }catch(err){}
  openCardView(ctx, uniq, +b.dataset.cvi || 0); return true;
}
function openDeckEditor(id){
  S.deckView = "edit"; S.tab = "deck"; ls.set("cb_tab", "deck"); S.thumbPick = false; renderAll();
  const sel = $("#deckEditSel"); sel.value = id || ""; sel.dispatchEvent(new Event("change")); window.scrollTo(0, 0);
}
$("#deckList").addEventListener("click", async e => {
  if (stripClick(e, "gal")) return;
  const g = s => e.target.closest(s), d = [...myDecks(), ...builtinDecks()].find(x => x.id === S.deckPick);
  if (g("[data-dpick]")){ S.deckPick = g("[data-dpick]").dataset.dpick; S.thumbPick = false; S.dkDelArm = null; renderDeckList(); if (matchMedia("(max-width:860px)").matches) $(".dk-right").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (g("[data-dnew]")){ openDeckEditor(""); return; }
  if (!d) return;
  if (g("[data-dplay]")){ ls.set("cb_deck", d.id); S.tab = "play"; ls.set("cb_tab", "play"); renderAll(); window.scrollTo(0, 0); toast(`「${d.name}」で対戦できます`); return; }
  if (g("[data-dedit]")){ openDeckEditor(d.id); return; }
  if (g("[data-dcopy]")){
    openDeckEditor("");
    S.deckEdit = { id: null, cards: {}, key: d.key || null }; d.cards.forEach(id => S.deckEdit.cards[id] = (S.deckEdit.cards[id] || 0) + 1);
    $("#deckName").value = d.name.replace(/【コスト】/, "") + "のコピー"; $("#deckMana").checked = !!d.mana; $("#deckSpire").checked = !!d.spire; $("#deckSpc").value = d.spc === "silent" ? "silent" : ""; $("#deckSpcRow").hidden = !d.spire; renderDeck(); return;
  }
  if (g("[data-dthumb]")){ S.thumbPick = !S.thumbPick; renderDeckList(); return; }
  if (g("[data-dkey]")){
    const key = g("[data-dkey]").dataset.dkey;
    try{ await saveDeckDoc(d.id, { name: d.name, owner: d.owner || S.name, ownerId: d.ownerId || S.uid || null, cards: d.cards, mana: !!d.mana, key, updatedAt: Date.now() }); S.thumbPick = false; toast("サムネを変えました"); renderDeckList(); }
    catch(err){ writeErr(err); }
    return;
  }
  if (g("[data-ddel]")){
    if (S.dkDelArm !== d.id){ S.dkDelArm = d.id; renderDeckList(); setTimeout(() => { if (S.dkDelArm === d.id){ S.dkDelArm = null; if (S.tab === "deck" && S.deckView !== "edit") renderDeckList(); } }, 3000); return; }
    S.dkDelArm = null;
    try{ await deleteDeckDoc(d.id); S.deckPick = null; toast("デッキを消しました"); renderDeckList(); } catch(err){ writeErr(err); }
  }
});
$("#btnDeckBack").addEventListener("click", () => { S.deckView = "list"; if (S.deckEdit.id) S.deckPick = S.deckEdit.id; renderAll(); window.scrollTo(0, 0); });

/* ================= account (ID + password, optional) ================= */
// Guests play with an anonymous account in this browser. Making an ID links a password to that same
// account (same uid), so everything made so far carries over; logging in elsewhere uses that account.
// Firebase needs an e-mail address, so the ID becomes <id>@players.cardbattle.invalid (never mailed).
S.loginId = null; S.acctMode = "register"; S.acctArm = false;
const acctEmail = id => `${id.toLowerCase()}@players.cardbattle.invalid`;
const mineCount = () => S.userCards.filter(c => isMine(c)).length;
const acctErr = e => ({
  "auth/email-already-in-use": "そのIDはもう使われています。別のIDにしてね", "auth/credential-already-in-use": "そのIDはもう使われています。別のIDにしてね",
  "auth/weak-password": "パスワードは6文字以上にしてね", "auth/invalid-email": "IDに使えない文字があります",
  "auth/wrong-password": "IDかパスワードがちがいます", "auth/user-not-found": "IDかパスワードがちがいます", "auth/invalid-credential": "IDかパスワードがちがいます", "auth/invalid-login-credentials": "IDかパスワードがちがいます",
  "auth/too-many-requests": "何回も失敗したので、少し待ってからためしてね", "auth/operation-not-allowed": "ID登録がまだ有効になっていません（管理している人に伝えてね）",
  "auth/network-request-failed": "通信できませんでした。もう一度ためしてね"
})[e && e.code] || `うまくいきませんでした［${e && (e.code || e.message)}］`;
// name / icon / record follow the ID to other devices
function saveProfile(){
  if (!S.loginId || !S.db) return Promise.resolve();
  return S.db.doc("users/" + S.uid).set({ id: S.loginId, name: S.name, icon: ls.get("cb_icon", ""), record: ls.get("cb_record", null), sleeve: ls.get("cb_sleeve", ""), updatedAt: Date.now() }).catch(() => {});
}
async function loadProfile(){
  if (!S.loginId || !S.db) return;
  try{
    const d = await S.db.doc("users/" + S.uid).get();
    if (!d.exists){ saveProfile(); return; }
    const pr = d.data();
    if (pr.name){ S.name = pr.name; ls.set("cb_name", pr.name); }
    if (pr.icon != null) ls.set("cb_icon", pr.icon);
    if (pr.sleeve != null){ ls.set("cb_sleeve", pr.sleeve); SL.ready = false; }
    if (pr.record) ls.set("cb_record", pr.record);
    renderAll();
  }catch(e){}
}
function renderAcct(){
  const box = $("#mpAcct"); if (!box) return;
  if (!S.db){ box.innerHTML = `<h2 style="margin:0">アカウント</h2><p class="muted" style="margin:6px 0 0">サーバーにつながっていないので、いまはIDを使えません。</p>`; return; }
  if (S.loginId){
    box.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-start"><div style="flex:1;min-width:220px"><h2 style="margin:0">アカウント</h2><p style="margin:6px 0 0">ID <b class="acct-id">${esc(S.loginId)}</b> でログイン中。ほかのスマホやPCでもこのIDでログインすると、同じカード・デッキ・戦績で遊べます。</p></div><button class="small danger" data-acct="logout">${S.acctArm ? "本当にログアウトする" : "ログアウト"}</button></div>`;
    return;
  }
  const reg = S.acctMode !== "login", n = mineCount();
  box.innerHTML = `<h2 style="margin:0 0 6px">アカウント</h2>
    <p class="note" style="margin:0 0 10px">いまはこのブラウザだけの「ゲスト」です。IDを作ると、ほかのスマホやPCからも同じカード・デッキ・交換したカードで遊べます。</p>
    <div class="seg" style="margin-bottom:10px"><button data-amode="register" aria-pressed="${reg}">IDを作る</button><button data-amode="login" aria-pressed="${!reg}">IDでログイン</button></div>
    <form id="acctForm" class="row" style="align-items:flex-end">
      <label class="f">ID（半角英数字と _、3〜16文字）<input type="text" id="acctId" autocomplete="username" maxlength="16" autocapitalize="off" spellcheck="false"></label>
      <label class="f">パスワード（6文字以上）<input type="password" id="acctPw" autocomplete="${reg ? "new-password" : "current-password"}"></label>
      <button class="primary" type="submit" id="acctGo">${reg ? "IDを作る" : "ログイン"}</button>
    </form>
    <p class="note" id="acctMsg" style="margin:8px 0 0">${reg ? "このブラウザで作ったカードやデッキは、そのまま新しいIDに引き継がれます。パスワードを忘れると元に戻せないので、メモしておいてね。" : n ? `⚠ このブラウザのゲストで作ったカード（${n}枚）やデッキは、ほかのIDでログインするとそのIDのものにはならず、編集できなくなります。先に「IDを作る」でIDにしておくのがおすすめ。` : "パスワードを忘れると元に戻せないので注意してね。"}</p>`;
}
$("#mpAcct").addEventListener("click", async e => {
  const m = e.target.closest("[data-amode]");
  if (m){ S.acctMode = m.dataset.amode; renderAcct(); return; }
  if (e.target.closest("[data-acct=logout]")){
    if (!S.acctArm){ S.acctArm = true; renderAcct(); setTimeout(() => { S.acctArm = false; renderAcct(); }, 3000); return; }
    try{ await firebase.auth().signOut(); }catch(err){}
    ls.set("cb_icon", ""); ls.set("cb_record", null);
    location.reload();
  }
});
$("#mpAcct").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("#acctId").value.trim(), pw = $("#acctPw").value, msg = $("#acctMsg"), go = $("#acctGo");
  if (!/^[A-Za-z0-9_]{3,16}$/.test(id)){ msg.textContent = "IDは半角英数字と _ で、3〜16文字にしてね"; return; }
  if (pw.length < 6){ msg.textContent = "パスワードは6文字以上にしてね"; return; }
  go.disabled = true; msg.textContent = "確認中…";
  try{
    if (S.acctMode !== "login"){
      await firebase.auth().currentUser.linkWithCredential(firebase.auth.EmailAuthProvider.credential(acctEmail(id), pw));
      S.loginId = id.toLowerCase(); await saveProfile();
      toast(`ID「${S.loginId}」を作りました！`); renderMe();
    } else {
      await firebase.auth().signInWithEmailAndPassword(acctEmail(id), pw);
      msg.textContent = "ログインしました。読みこみなおします…";
      setTimeout(() => location.reload(), 500);
    }
  }catch(err){ msg.textContent = acctErr(err); go.disabled = false; }
});

$("#btnDeckSave2").addEventListener("click", () => $("#btnDeckSave").click());

