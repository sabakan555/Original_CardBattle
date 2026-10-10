/* ================= crystal background & title screen ================= */
// low-poly "crystal" texture: a Voronoi pattern drawn once at low resolution
function crystal(w, h, cell, pick){
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1, pts = [];
  const r = rng(4242 + w);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push({ x: (i + r()) * cell, y: (j + r()) * cell, col: pick((i * cell) / w, (j * cell) / h, r()) });
  const img = x.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++){
    const gi = Math.floor(X / cell), gj = Math.floor(y / cell); let best = 1e9, bp = null;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++){
      const ii = gi + di, jj = gj + dj; if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
      const p = pts[jj * cols + ii], dd = (p.x - X) ** 2 + (p.y - y) ** 2; if (dd < best){ best = dd; bp = p; }
    }
    const k = (y * w + X) * 4; d[k] = bp.col[0]; d[k + 1] = bp.col[1]; d[k + 2] = bp.col[2]; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL("image/jpeg", .88);
}
const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function buildTheme(){
  try{
    // Figma: gradient #232842 → #2f3659 (65.9%) → #5967a8 (135.7%), with a crystal texture burned in at 40%
    const grad = fx => fx < .659 ? mixc([35, 40, 66], [47, 54, 89], fx / .659) : mixc([47, 54, 89], [89, 103, 168], (fx - .659) / (1.357 - .659));
    const bg = crystal(900, 640, 46, (fx, fy, r) => grad(fx).map(v => Math.round(v * (.72 + r * .34))));
    document.body.style.setProperty("--bgimg", `url(${bg})`);
    const tex = crystal(420, 120, 30, (fx, fy, r) => mixc([55, 118, 196], [84, 196, 198], Math.min(1, r * .9 + fx * .15)));
    document.documentElement.style.setProperty("--tex", `url(${tex})`);
  }catch(e){}
}
let showIdx = 0, showTimer = null;
function showcasePool(){ const mine = S.userCards.filter(c => c.img); return mine.length ? mine : S.starters.filter(c => c.type === "monster" && c.img); }
function renderShowcase(anim){
  const pool = showcasePool(); if (!pool.length) return;
  const c = pool[showIdx % pool.length];
  const box = $("#showcase");
  const draw = () => { box.innerHTML = `${cardHTML(c, "")}<div class="cap">${c.starter ? esc(c.author) : "by " + esc(c.author || "？")}</div>`; };
  if (anim && box.firstChild){ box.firstChild.classList.add("fade"); setTimeout(draw, 450); } else draw();
}
function renderHome(){
  $("#meName").textContent = S.name || "Player";
  $("#meAv").innerHTML = myIcon() ? `<img alt="" src="${esc(myIcon())}">` : `<svg width="60%" height="60%" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="none" stroke="#3b4166" stroke-width="2"/><path d="M3.8 21c.8-4.4 4.2-6.6 8.2-6.6s7.4 2.2 8.2 6.6" fill="none" stroke="#3b4166" stroke-width="2" stroke-linecap="round"/></svg>`;
  if (!$("#showcase").firstChild) renderShowcase(false);
  if (!showTimer) showTimer = setInterval(() => { if (S.tab !== "home") return; const n = showcasePool().length; if (n > 1){ showIdx = (showIdx + 1) % n; renderShowcase(true); } }, 6000);
}

/* ================= tabs ================= */
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; ls.set("cb_tab", S.tab); renderAll(); }));
document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (!g) return; S.tab = g.dataset.go; if (S.tab !== "home") ls.set("cb_tab", S.tab); renderAll(); window.scrollTo(0, 0); });
/* ---- room list (lobby): open rooms to join, running games to watch ---- */
function watchRooms(on){
  if (on && !S.roomsUnsub && S.db){
    const col = S.db.collection("rooms"), since = Date.now() - 3 * 3600e3;
    const q = typeof col.where === "function" ? col.where("updatedAt", ">", since) : col;
    S.roomsUnsub = q.onSnapshot(snap => { S.rooms = snap.docs.map(d => ({ code: d.id, ...d.data() })); if (S.tab === "play" && !G) renderRoomList(); }, () => {});
  }
  if (!on && S.roomsUnsub){ S.roomsUnsub(); S.roomsUnsub = null; }
}
function renderRoomList(){
  const box = $("#roomList"); if (!box) return;
  if (!S.db){ box.innerHTML = ""; return; }
  const now = Date.now(), ago = t => { const m = Math.max(0, Math.round((now - (t || 0)) / 60000)); return m < 1 ? "いま" : m < 60 ? `${m}分前` : `${Math.floor(m / 60)}時間前`; };
  const list = (S.rooms || []).filter(r => !r.hidden && r.players && r.players.a);
  const mine = code => ls.get("cb_slot3_" + code, null);
  const waiting = list.filter(r => !r.started && !r.players.b && now - (r.updatedAt || 0) < 30 * 60e3).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const playing = list.filter(r => r.started && !r.winner && r.players.b && now - (r.updatedAt || 0) < 2 * 3600e3).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  box.innerHTML = `<h3 style="margin:0">対戦相手を募集中の部屋</h3>`
    + (waiting.map(r => `<div class="room"><div><b>${esc(r.players.a.name)}</b> の部屋<span class="note">${r.players.a.mana ? "コストデッキ・" : ""}${ago(r.updatedAt)}</span></div>${mine(r.code) ? `<button class="small" data-room="${esc(r.code)}">もどる</button>` : `<button class="small primary" data-room="${esc(r.code)}">入る</button>`}</div>`).join("") || `<p class="note" style="margin:0">いまは募集中の部屋はありません。「部屋を作る」で作ってみよう</p>`)
    + (playing.length ? `<h3 style="margin:6px 0 0">対戦中</h3>` + playing.map(r => `<div class="room"><div><b>${esc(r.players.a.name)}</b> vs <b>${esc(r.players.b.name)}</b><span class="note">ターン${r.turnNo || 1}</span></div>${mine(r.code) ? `<button class="small" data-room="${esc(r.code)}">もどる</button>` : `<button class="small" data-watch="${esc(r.code)}">観戦する</button>`}</div>`).join("") : "");
}
$("#roomList").addEventListener("click", e => {
  const j = e.target.closest("[data-room]"); if (j){ joinRoom(j.dataset.room); return; }
  const w = e.target.closest("[data-watch]"); if (w) watchRoom(w.dataset.watch);
});
// watch someone's game: read-only, hands and set cards stay hidden
function watchRoom(code){
  leaveGame();
  G = { mode: "online", code, slot: "a", spectate: true, st: null, sel: null, atkFrom: null, chooseQ: [], q: Promise.resolve(), evSeen: 0 };
  G.unsub = S.db.doc("rooms/" + code).onSnapshot(snap => {
    if (!G || G.code !== code || !snap.exists) return;
    const first = !G.st; G.st = clone(snap.data()); if (first) G.evSeen = G.st.evn || 0;
    after(false);
  }, () => toast("通信が切れました"));
  S.tab = "play"; renderAll();
}
function renderAll(){
  watchRooms(S.tab === "play" && !G && !!S.db);
  $("#home").hidden = S.tab !== "home"; $("#sheet").hidden = S.tab === "home";
  if (S.tab === "home"){ renderHome(); renderOverlay(); return; }
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === S.tab));
  for (const t of ["play", "make", "deck", "pack", "trade", "me", "rules"]) $("#tab-" + t).hidden = S.tab !== t;
  if (S.tab === "me") renderMe();
  if (S.tab === "play") renderPlay();
  if (S.tab === "make"){ renderGallery(); if (typeof fitCanvas === "function") setTimeout(fitCanvas); }
  if (S.tab === "deck") renderDeckTab();
  if (S.tab === "trade") renderTrade();
  if (S.tab === "pack") renderPack();
  renderTradeBadge();
  renderOverlay();
  renderPotTray();
}
// my ポーション, always in the bottom-left corner during a game (3 slots for スパイアデッキ)
function renderPotTray(){
  const t = $("#potTray"); if (!t) return;
  const st = G && G.st, p = st && st.started && !G.spectate && S.tab === "play" ? st.players[G.slot] : null;
  const L = p ? (p.potions || []) : [];
  if (!p || (!p.spire && !L.length)){ t.hidden = true; t.innerHTML = ""; return; }
  const can = canAct(st, G.slot);
  t.hidden = false;
  t.innerHTML = `<span class="pt-lbl">ポーション</span>` + Array.from({ length: Math.max(POTION_MAX, L.length) }, (_, i) => { const k = L[i], d = k && potionDef(k); return d ? `<button class="pt-slot" data-potion="${i}" title="${esc(d.name)}：${esc(d.text)}" ${can ? "" : "disabled"}>${d.img ? `<img alt="" src="${d.img}">` : "<span>🧪</span>"}</button>` : `<span class="pt-slot"></span>`; }).join("");
}
$("#potTray").addEventListener("click", e => { const b = e.target.closest("[data-potion]"); if (!b || !G || !G.st || !canAct(G.st, G.slot)) return; G.potPick = +b.dataset.potion; renderAll(); });

/* ================= search & filters ================= */
const kata2hira = t => t.replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const normQ = t => kata2hira(String(t || "").toLowerCase().normalize("NFKC"));
S.filt = { gal: { q: "", type: "all", fx: "", sort: "new", dm: "", tag: "", ctr: "" }, deck: { q: "", type: "all", fx: "", sort: "new", dm: "", tag: "", ctr: "" }, trade: { q: "", type: "all", fx: "", sort: "new", dm: "", tag: "", ctr: "" } };
// カウンターでさがす: カードが使っているカウンター（乗せる・取り除く・もし・1個につき・○個になったとき・コスト）を、使っている枚数つきで
function ctrFilterHTML(cur){
  const cnt = {}; [...S.cards.values()].forEach(c => { if (!c || c.tut || c.skinOf) return; cardCtrIds(c).forEach(id => { cnt[id] = (cnt[id] || 0) + 1; }); });
  const ids = [...new Set([...ctrList().map(d => d.id), ...Object.keys(cnt)])].filter(id => cnt[id] || id === cur);
  return `<option value="">カウンター：指定なし</option>` + ids.map(id => `<option value="${esc(id)}"${id === cur ? " selected" : ""}>${esc(ctrName(id))}（${cnt[id] || 0}）</option>`).join("");
}
// タグの絞り込み: 今あるカードのタグ（開くたびに作りなおす）
// 作者でしぼる: カードを作った人の一覧（多い順）
const authorOf = c => String(c && c.author || "").trim();
function authorOptionsHTML(cur){ const cnt = new Map(); [...S.cards.values()].forEach(c => { if (!c || c.tut || c.skinOf) return; const a = authorOf(c); if (a) cnt.set(a, (cnt.get(a) || 0) + 1); }); const L = [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a) || a.localeCompare(b, "ja")); if (cur && !L.includes(cur)) L.unshift(cur); return `<option value="">作者：指定なし</option>` + L.map(a => `<option value="${esc(a)}"${a === cur ? " selected" : ""}>${esc(a)}（${cnt.get(a) || 0}）</option>`).join(""); }
function tagOptionsHTML(cur){ const L = [...new Set([...S.cards.values()].filter(c => c && !c.tut).flatMap(c => tagsOf(c)))].sort((a, b) => a.localeCompare(b, "ja")); if (cur && !L.includes(cur)) L.unshift(cur); return `<option value="">タグ：指定なし</option>` + L.map(t => `<option value="${esc(t)}"${t === cur ? " selected" : ""}>#${esc(t)}</option>`).join(""); }
const SORTS = { new: "新しい順", atkDesc: "ATKが高い順", atkAsc: "ATKが低い順", costAsc: "コストが低い順", costDesc: "コストが高い順", name: "名前順" };
// list is already in "new" order (user cards newest first, then starters)
function sortCards(list, how){
  if (how === "new") return list;
  const a = list.map((c, i) => [c, i]);
  const isMon = c => cardType(c) === "monster";
  a.sort(([x, i], [y, j]) => {
    if (how === "name") return String(x.name).localeCompare(String(y.name), "ja") || i - j;
    if (how === "costAsc" || how === "costDesc"){ const d = costOf(x) - costOf(y); return (how === "costDesc" ? -d : d) || i - j; }
    if (isMon(x) !== isMon(y)) return isMon(x) ? -1 : 1; // spells/traps go last
    const d = cmpNum(baseAtk(x), baseAtk(y));
    return (how === "atkDesc" ? -d : d) || i - j;
  });
  return a.map(([c]) => c);
}
// 効果でさがす: カードが持っている効果を、メーカーと同じグループ分けで一覧にする（使われているものだけ・枚数つき）
// 「全体」「ランダム」などの版は、元の効果にまとめる（例: 相手モンスターを全部破壊 → 破壊）
const fxBaseKind = k => (TO_LEGACY[k] || [k])[0];
const FX_HIDE = new Set(["none", "synthHand", "synthTo"]);
function cardFxKeys(c){
  if (!c) return new Set();
  if (c.__fxk && c.__fxk.v === c.updatedAt) return c.__fxk.s;
  const out = new Set(), t = cardType(c);
  const add = e => { if (!e || !KINDS[e.kind]) return; out.add("k:" + fxBaseKind(e.kind)); if (e.ge) add(e.ge); };
  blocksOf(c).forEach(b => { if (t === "monster") out.add("t:" + b.trig); [...(b.then || []), ...(b.else || []), ...(b.dieBr || []).flatMap(x => x.then || [])].forEach(add); if (b.one) out.add("x:one"); if (b.grant) out.add("x:grant"); if (b.roll) out.add("x:roll"); if (b.delay > 0) out.add("x:delay"); });
  if (normCombo(c)) out.add("x:combo");
  absOf(c).forEach(a => out.add("a:" + a.k));
  if (cardCtrIds(c).length) out.add("x:ctr"); if (massOf(c)) out.add("x:mass"); if (Array.isArray(c.fusion) && c.fusion.length) out.add("x:fusion"); if (c.ex) out.add("x:ex"); if (c.token) out.add("x:token");
  try { Object.defineProperty(c, "__fxk", { value: { v: c.updatedAt, s: out }, configurable: true, writable: true, enumerable: false }); } catch (e) {}
  return out;
}
const FX_EXTRA = { ctr: "カウンターを使う", combo: "追加効果（特定のカードがあるとき）", one: "効果を1つえらんで発動", grant: "プレイヤーに効果を付与", roll: "サイコロ・コイン", delay: "時計（○ターン後に出る）", mass: "要求質量（ナナシ系）", fusion: "融合モンスター", ex: "EXデッキのカード", token: "トークン" };
function fxOptionsHTML(cur){
  const cnt = {}; let any = 0, none = 0, free = 0;
  [...S.cards.values()].forEach(c => { if (!c || c.tut || c.skinOf) return; const K = cardFxKeys(c); K.forEach(k => { cnt[k] = (cnt[k] || 0) + 1; });
    const has = blocksOf(c).length || absOf(c).length || cardType(c) === "equip"; if (has) any++; else if (!c.effect) none++; if (freeText(c)) free++; });
  const o = (v, l) => (cnt[v] || v === cur) ? `<option value="${v}"${v === cur ? " selected" : ""}>${esc(l)}（${cnt[v] || 0}）</option>` : "";
  const grp = (label, body) => body ? `<optgroup label="${esc(label)}">${body}</optgroup>` : "";
  const seen = new Set();
  const groups = (typeof KIND_GROUPS !== "undefined" ? KIND_GROUPS : []).filter(g => g.g !== "none").map(g => grp(g.label, g.v.map(([k, l]) => { const b = fxBaseKind(k); if (seen.has(b) || FX_HIDE.has(b)) return ""; seen.add(b); return o("k:" + b, l || KINDS[b].label); }).join(""))).join("");
  const rest = Object.keys(KINDS).map(fxBaseKind).filter((k, i, a) => a.indexOf(k) === i && !seen.has(k) && !FX_HIDE.has(k)).map(k => o("k:" + k, KINDS[k].label.replace("（罠）", ""))).join("");
  const trigs = MON_TRIGS.map(k => o("t:" + k, TRIGS[k] || k)).join("");
  const kw = Object.entries(ABS).filter(([, v]) => v.kw).map(([k, v]) => o("a:" + k, `《${v.kw}》` + v.label.replace(/^[^（]*（?/, "").replace(/）$/, ""))).join("");
  const abs = Object.entries(ABS).filter(([, v]) => !v.kw).map(([k, v]) => o("a:" + k, v.label)).join("");
  const ex = Object.entries(FX_EXTRA).map(([k, l]) => o("x:" + k, l)).join("");
  return `<option value="">効果：指定なし</option><optgroup label="おおまかに"><option value="any"${cur === "any" ? " selected" : ""}>自動の効果がある（${any}）</option><option value="free"${cur === "free" ? " selected" : ""}>自分で書いた効果の文がある（${free}）</option><option value="none"${cur === "none" ? " selected" : ""}>効果なし（${none}）</option></optgroup>${groups}${grp("そのほかの効果", rest)}${grp("しくみ", ex)}${grp("キーワード能力", kw)}${grp("モンスターの能力", abs)}${grp("モンスターの効果が出るタイミング", trigs)}`;
}
function initFilters(key, onChange){
  const box = $("#" + key + "Filters");
  box.innerHTML = `<input type="search" id="${key}Q" placeholder="カード名・効果でさがす" aria-label="カード検索">
    <div class="seg" id="${key}Type">${[["all", "すべて"], ["monster", "モンスター"], ["magic", "魔法"], ["quick", "速攻魔法"], ["equip", "装備"], ["trap", "罠"], ...(key === "gal" ? [["potion", "ポーション"], ["relic", "レリック"], ["counter", "カウンター"]] : [])].map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === "all"}">${l}</button>`).join("")}</div>
    <select id="${key}Fx" aria-label="効果で絞り込み">${fxOptionsHTML("")}</select>
    <select id="${key}Dm" aria-label="使えるデッキで絞り込み"><option value="">デッキ：指定なし</option><option value="cost">コストデッキ専用</option><option value="normal">コストデッキ以外（ふつうのデッキで使える・コストなしで表示）</option><option value="both">どちらでも</option></select>
    <select id="${key}Tag" aria-label="タグで絞り込み">${tagOptionsHTML("")}</select>
    <select id="${key}Author" aria-label="作者で絞り込み">${authorOptionsHTML("")}</select>
    ${key === "gal" ? "" : `<select id="${key}Ctr" aria-label="カウンターで絞り込み">${ctrFilterHTML("")}</select>`}
    <select id="${key}Sort" aria-label="並べ替え">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    <span class="count" id="${key}Count"></span>`;
  const f = S.filt[key];
  $("#" + key + "Q").addEventListener("input", e => { f.q = e.target.value; onChange(); });
  { const fs = $("#" + key + "Fx"), fill = () => { fs.innerHTML = fxOptionsHTML(f.fx || ""); }; fs.addEventListener("focus", fill); fs.addEventListener("mousedown", fill); fs.addEventListener("change", e => { f.fx = e.target.value; onChange(); }); }
  $("#" + key + "Sort").addEventListener("change", e => { f.sort = e.target.value; onChange(); });
  $("#" + key + "Dm").addEventListener("change", e => { f.dm = e.target.value; onChange(); });
  { const au = $("#" + key + "Author"), fill = () => { au.innerHTML = authorOptionsHTML(f.author || ""); }; au.addEventListener("focus", fill); au.addEventListener("mousedown", fill); au.addEventListener("change", e => { f.author = e.target.value; onChange(); }); }
  { const tg = $("#" + key + "Tag"); const fill = () => { tg.innerHTML = tagOptionsHTML(f.tag); }; tg.addEventListener("focus", fill); tg.addEventListener("mousedown", fill); tg.addEventListener("change", e => { f.tag = e.target.value; onChange(); }); }
  { const cs = $("#" + key + "Ctr"), fill = () => { cs.innerHTML = ctrFilterHTML(f.ctr || ""); }; if (cs) cs.addEventListener("focus", fill); if (cs) cs.addEventListener("mousedown", fill); if (cs) cs.addEventListener("change", e => { f.ctr = e.target.value; onChange(); }); }
  $("#" + key + "Type").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; f.type = b.dataset.v; box.querySelectorAll("#" + key + "Type button").forEach(x => x.setAttribute("aria-pressed", x === b)); onChange(); });
}
function matchCard(c, f){
  const t = cardType(c), nf = normFx(c);
  if (f.type === "quick" ? !isQuick(c) : (f.type !== "all" && t !== f.type)) return false;
  // 「コストデッキ以外」: ふつうのデッキ専用＋どちらでも入るカード（どちらでものカードはコストなしの見た目で出す）
  if (f.dm === "normal" ? deckModeOf(c) === "cost" : f.dm && deckModeOf(c) !== f.dm) return false;
  if (f.tag && !tagsOf(c).includes(f.tag)) return false;
  if (f.author && authorOf(c) !== f.author) return false;
  if (f.ctr && !cardCtrIds(c).includes(f.ctr)) return false;
  if (f.q){
    const hay = normQ([c.name, plainRuby(c.effect), plainRuby(c.flavor), fxText(c), tagsOf(c).join(" "), c.frame === "spire" ? "スパイア" : "", t === "equip" ? eqText(c) : monAbsText(c), TYPE_LABEL[t], c.author].join(" "));
    if (!normQ(f.q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
  }
  if (f.fx){
    const has = blocksOf(c).length > 0 || absOf(c).length > 0 || t === "equip";
    if (f.fx === "any" && !has) return false;
    if (f.fx === "none" && (has || c.effect)) return false;
    if (f.fx === "free" && !freeText(c)) return false;
    if (f.fx === "combo" && !normCombo(c)) return false;
    if (/^[ktax]:/.test(f.fx) && !cardFxKeys(c).has(f.fx)) return false;
  }
  return true;
}
function setCount(key, shown, total){ const el = $("#" + key + "Count"); if (el) el.textContent = shown === total ? `${total}枚` : `${shown} / ${total}枚`; }

