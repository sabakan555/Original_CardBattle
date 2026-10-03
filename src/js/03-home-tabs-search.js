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
  for (const t of ["play", "make", "deck", "trade", "me", "rules"]) $("#tab-" + t).hidden = S.tab !== t;
  if (S.tab === "me") renderMe();
  if (S.tab === "play") renderPlay();
  if (S.tab === "make"){ renderGallery(); if (typeof fitCanvas === "function") setTimeout(fitCanvas); }
  if (S.tab === "deck") renderDeckTab();
  if (S.tab === "trade") renderTrade();
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
S.filt = { gal: { q: "", type: "all", fx: "", sort: "new", dm: "", tag: "" }, deck: { q: "", type: "all", fx: "", sort: "new", dm: "", tag: "" }, trade: { q: "", type: "all", fx: "", sort: "new", dm: "", tag: "" } };
// タグの絞り込み: 今あるカードのタグ（開くたびに作りなおす）
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
function fxOptionsHTML(){
  const kinds = Object.entries(KINDS).filter(([k]) => k !== "none").map(([k, v]) => `<option value="k:${k}">${v.label.replace("（罠）", "")}</option>`).join("");
  const trigs = MON_TRIGS.map(k => `<option value="t:${k}">${TRIGS[k]}</option>`).join("");
  const abs = Object.entries(ABS).map(([k, v]) => `<option value="a:${k}">${v.label}</option>`).join("");
  return `<option value="">効果：指定なし</option><option value="any">自動の効果・装備の効果あり</option><option value="none">効果なし</option><option value="combo">追加効果（特定のカードがあるとき）あり</option><optgroup label="効果の中身">${kinds}</optgroup><optgroup label="モンスターの発動タイミング">${trigs}</optgroup><optgroup label="能力">${abs}</optgroup>`;
}
function initFilters(key, onChange){
  const box = $("#" + key + "Filters");
  box.innerHTML = `<input type="search" id="${key}Q" placeholder="カード名・効果でさがす" aria-label="カード検索">
    <div class="seg" id="${key}Type">${[["all", "すべて"], ["monster", "モンスター"], ["magic", "魔法"], ["quick", "速攻魔法"], ["equip", "装備"], ["trap", "罠"], ...(key === "gal" ? [["potion", "ポーション"], ["relic", "レリック"]] : [])].map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === "all"}">${l}</button>`).join("")}</div>
    <select id="${key}Fx" aria-label="効果で絞り込み">${fxOptionsHTML()}</select>
    <select id="${key}Dm" aria-label="使えるデッキで絞り込み"><option value="">デッキ：指定なし</option><option value="cost">コストデッキ専用</option><option value="normal">コスト以外（ふつうのデッキ専用）</option><option value="both">どちらでも</option></select>
    <select id="${key}Tag" aria-label="タグで絞り込み">${tagOptionsHTML("")}</select>
    <select id="${key}Sort" aria-label="並べ替え">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    <span class="count" id="${key}Count"></span>`;
  const f = S.filt[key];
  $("#" + key + "Q").addEventListener("input", e => { f.q = e.target.value; onChange(); });
  $("#" + key + "Fx").addEventListener("change", e => { f.fx = e.target.value; onChange(); });
  $("#" + key + "Sort").addEventListener("change", e => { f.sort = e.target.value; onChange(); });
  $("#" + key + "Dm").addEventListener("change", e => { f.dm = e.target.value; onChange(); });
  { const tg = $("#" + key + "Tag"); const fill = () => { tg.innerHTML = tagOptionsHTML(f.tag); }; tg.addEventListener("focus", fill); tg.addEventListener("mousedown", fill); tg.addEventListener("change", e => { f.tag = e.target.value; onChange(); }); }
  $("#" + key + "Type").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; f.type = b.dataset.v; box.querySelectorAll("#" + key + "Type button").forEach(x => x.setAttribute("aria-pressed", x === b)); onChange(); });
}
function matchCard(c, f){
  const t = cardType(c), nf = normFx(c);
  if (f.type === "quick" ? !isQuick(c) : (f.type !== "all" && t !== f.type)) return false;
  if (f.dm && deckModeOf(c) !== f.dm) return false;
  if (f.tag && !tagsOf(c).includes(f.tag)) return false;
  if (f.q){
    const hay = normQ([c.name, plainRuby(c.effect), plainRuby(c.flavor), fxText(c), tagsOf(c).join(" "), c.frame === "spire" ? "スパイア" : "", t === "equip" ? eqText(c) : monAbsText(c), TYPE_LABEL[t], c.author].join(" "));
    if (!normQ(f.q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
  }
  if (f.fx){
    const hasEq = t === "equip" || absOf(c).length > 0;
    const nc = normCombo(c);
    if (f.fx === "any" && !nf && !nc && !hasEq) return false;
    if (f.fx === "none" && (nf || nc || hasEq || c.effect)) return false;
    if (f.fx === "combo" && !nc) return false;
    if (f.fx.startsWith("k:") && !((nf && nf.kind === f.fx.slice(2)) || (nc && nc.kind === f.fx.slice(2)))) return false;
    if (f.fx.startsWith("t:") && (!nf || t !== "monster" || nf.trig !== f.fx.slice(2))) return false;
    if (f.fx.startsWith("a:") && !absOf(c).some(a => a.k === f.fx.slice(2))) return false;
  }
  return true;
}
function setCount(key, shown, total){ const el = $("#" + key + "Count"); if (el) el.textContent = shown === total ? `${total}枚` : `${shown} / ${total}枚`; }

