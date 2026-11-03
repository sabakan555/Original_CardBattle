/* ================= 対戦を直感的に: 攻撃の結果予告・答える確認の聞き方・ターン終了のひと声・ドラッグ操作 ================= */

/* ---- 攻撃の結果予告 ----
   resolveAttack と同じ順番でくらべる（先制攻撃・必殺・戦闘で破壊されない・貫通・鉄壁・筋力・脱力）。
   罠や手札の速攻魔法、「戦闘に負けたとき」の効果までは読まないので、伏せカードがあれば一言そえる */
function atkPredict(st, A, from, to){
  const D = O(A), pa = P(st, A), pd = P(st, D), am = pa.mz[from]; if (!am) return null;
  const traps = pd.sz.some(z => z && !z.face);
  if (to === "direct"){
    if (pd.shieldOn){
      const n = (pd.shields || []).length;
      if (!n) return { k: "win", t: noLoseBy(st, D) ? "直接攻撃" : "とどめ！", traps };
      if (hasAb(st, A, from, "noBreak")) return { k: "none", t: "ブレイクできない", traps };
      return { k: "win", t: `シールド${Math.min(n, breakCount(st, A, from))}枚ブレイク`, traps };
    }
    const x = battleHit(st, A, from, atkOf(am)), lethal = x >= pd.lp && !noLoseBy(st, D);
    return { k: lethal ? "win" : "dmg", t: lethal ? "とどめ！" : `−${fmtN(x)}`, s: lethal ? `−${fmtN(x)}` : "", traps };
  }
  const dm = pd.mz[to]; if (!dm) return null;
  const a = atkOf(am), d = atkOf(dm);
  const hurt = (s2, i2, x) => P(st, s2).shieldOn ? 0 : x === Infinity ? x : Math.max(0, x - abN(st, s2, i2, "dmgCut"));
  const fsA = hasAb(st, A, from, "first") && !hasAb(st, D, to, "first"), fsD = hasAb(st, D, to, "first") && !hasAb(st, A, from, "first");
  const pre = fsA && (a >= d || hasAb(st, A, from, "bane")) ? A : fsD && (d >= a || hasAb(st, D, to, "bane")) ? D : null;
  let aDie = false, dDie = false, toD = 0, toA = 0;
  if (pre === A && a <= d) dDie = true;
  else if (pre === D && d <= a) aDie = true;
  else {
    if (a > d){ dDie = true; toD = hurt(D, to, battleHit(st, A, from, hasAb(st, A, from, "pierce") ? a : a - d)); }
    else if (a < d){ aDie = true; toA = hurt(A, from, battleHit(st, D, to, hasAb(st, D, to, "pierce") ? d : d - a)); }
    else { aDie = true; dDie = true; }
    if (hasAb(st, A, from, "bane")) dDie = true;
    if (hasAb(st, D, to, "bane")) aDie = true;
    if (pre === A) aDie = false; if (pre === D) dDie = false;
  }
  if (hasAb(st, A, from, "guard")) aDie = false;
  if (hasAb(st, D, to, "guard")) dDie = false;
  const k = dDie && !aDie ? "win" : dDie && aDie ? "trade" : aDie ? "lose" : "none";
  const t = { win: "撃破", trade: "相打ち", lose: "返り討ち", none: "どちらも残る" }[k];
  const s = toD > 0 ? `相手に−${fmtN(toD)}` : toA > 0 ? `自分に−${fmtN(toA)}` : "";
  return { k, t, s, traps };
}
const atkPvHTML = (pv, extra) => `<span class="atkpv k-${pv.k}${extra ? " " + extra : ""}" aria-hidden="true"><b>${esc(pv.t)}</b>${pv.s ? `<small>${esc(pv.s)}</small>` : ""}</span>`;
// 下の文に出す「→ 撃破（相手に−100）」
function atkPvHint(st, me, from, to){
  const pv = from != null && to != null ? atkPredict(st, me, from, to) : null; if (!pv) return "";
  return ` → ${pv.t}${pv.s ? `（${pv.s}）` : ""}${pv.traps ? "・相手に伏せカードあり" : ""}`;
}
// 直接攻撃の的（スマホは相手のバー、PCは相手の名前の行・LP）
const directEl = () => visEl(["#board .mbar", "#board .table>.mstat.op", "#lp-op"]);

/* ---- 描き終わったあとに足すもの（renderBoard から） ---- */
function boardPost(){
  if (!G || !G.st || !G.st.started) return;
  const st = G.st, me = G.slot;
  // 攻撃の結果予告: 攻撃するモンスターをえらんでいる間、攻撃できる相手に出す
  if (G.atkFrom != null && st.turn === me && !st.winner && P(st, me).mz[G.atkFrom]){
    const AT = atkTargets(st, me, G.atkFrom);
    AT.L.forEach(i => { const el = zoneEl(O(me), "mz", i), pv = atkPredict(st, me, G.atkFrom, i); if (el && pv) el.insertAdjacentHTML("beforeend", atkPvHTML(pv)); });
    if (AT.direct){ const el = directEl(), pv = atkPredict(st, me, G.atkFrom, "direct"); if (el && pv) el.insertAdjacentHTML("beforeend", atkPvHTML(pv, "dir")); }
  }
  // ターン終了のひと声: もう一度押せば終わる
  if (G.endArm && Date.now() - G.endArm < 4000) document.querySelectorAll('#board [data-act="endTurn"]').forEach(b => { b.classList.add("armed"); b.innerHTML = "もう一度<br>押すと終了"; });
  // ドラッグ中のカード
  if (DRAG.on && DRAG.on.started){ const d = DRAG.on, el = d.kind === "hand" ? document.querySelector(`#board .mhand [data-z="hand"][data-i="${d.i}"], #board .hand [data-z="hand"][data-i="${d.i}"]`) : zoneEl(me, "mz", d.i); if (el) el.classList.add("drag-src"); }
}

/* ---- ターン終了のひと声: 攻撃できるモンスターが残っているときだけ、1回目は止めて知らせる ---- */
function endTurnHold(st, me){
  if (!G || G.tut || G.test || !atkReady(st, me).length) return false;
  if (G.endArm && Date.now() - G.endArm < 4000) return false;
  G.endArm = Date.now(); renderAll(); toast("まだ攻撃できるモンスターがいます。もう一度押すとターン終了");
  setTimeout(() => { if (G && G.endArm && Date.now() - G.endArm >= 3900){ G.endArm = 0; if (G.st) renderAll(); } }, 4000);
  return true;
}

/* ---- 相手の行動に答えるかの確認 ----
   all: いつも聞く（これまでどおり）／ atk: 攻撃されたときだけ聞く（相手の魔法・召喚・ターン終了では止めずに進める）。この端末だけの設定 */
function respMode(){ return ls.get("cb_respMode", "all") === "atk" ? "atk" : "all"; }
const respAsks = win => win === "attack" || win === "chainAttack";
// 聞かない窓なら、自分の番の「使わない」をすぐ送る（同じ窓では1回だけ）。true なら確認は出さない
function respAuto(st){
  if (respMode() !== "atk") return false;
  const win = chainWindow(st); if (respAsks(win)) return false;
  const key = `${st.turnNo}:${(st.log || []).length}:${win}:${(st.chain || []).length}`;
  if (G.autoPassKey !== key){
    G.autoPassKey = key;
    setTimeout(() => {
      if (!G || !G.st || G.spectate) return; const s2 = G.st, p = s2.pending;
      if (!p || !p.wait || p.by === G.slot || s2.winner || respMode() !== "atk" || respAsks(chainWindow(s2))) return;
      act(x => respond(x, G.slot, null));
    }, 0);
  }
  return true;
}
function respModeHTML(win){
  return `<label class="resp-mode"><input type="checkbox" data-respmode ${respMode() === "atk" ? "checked" : ""}> 相手の魔法・召喚・ターン終了では聞かない（攻撃されたときだけ聞く）</label>`;
}
// 対戦の設定（スマホではたたむ）。CPUの速さ・つよさもこの中
function boptOpenHTML(){
  const open = G.boptOpen != null ? G.boptOpen : !mobUI(), m = respMode();
  return `<details class="bopt"${open ? " open" : ""}><summary>対戦の設定</summary><div class="bopt-in"><label class="row cpuspd" style="gap:8px">相手の行動への確認<select data-respmode aria-label="相手の行動への確認"><option value="all"${m === "all" ? " selected" : ""}>いつも聞く</option><option value="atk"${m === "atk" ? " selected" : ""}>攻撃されたときだけ聞く</option></select></label>`;
}
function boptCloseHTML(){ return `</div></details>`; }
document.addEventListener("change", e => {
  const el = e.target.closest && e.target.closest("[data-respmode]"); if (!el) return;
  const v = el.type === "checkbox" ? (el.checked ? "atk" : "all") : el.value === "atk" ? "atk" : "all";
  ls.set("cb_respMode", v); toast(v === "atk" ? "攻撃されたときだけ聞きます（相手の魔法・召喚・ターン終了では止めません）" : "相手が何かするたびに、使えるカードがあれば聞きます");
  if (G && G.st) renderAll();
});
document.addEventListener("toggle", e => { if (e.target && e.target.matches && e.target.matches("#board details.bopt") && G) G.boptOpen = e.target.open; }, true);

/* ---- ドラッグ操作 ----
   手札: 光っている場所へ引っぱると召喚・セット（装備は光っているモンスターへ）。場のほうへ引っぱってはなすと、いつもの使い方（召喚・発動・セット）
   モンスター: 攻撃できるモンスターを相手のモンスター・相手（直接攻撃）へ引っぱると攻撃。
   少し動かしたらドラッグ。動かさなければ今までどおりのタップ（クリック） */
const DRAG = { on: null, synth: false };
function dragging(){ return !!(DRAG.on && DRAG.on.started); }
let dragEndAt = 0;
function dragFrom(e){
  if (!G || !G.st || !G.st.started || G.spectate || G.st.winner || S.tab !== "play") return null;
  if (e.button != null && e.button !== 0) return null;
  const st = G.st, me = G.slot; if (st.turn !== me || !canAct(st, me)) return null;
  if (e.target.closest("button, select, input, [data-grpx]")) return null;
  const el = e.target.closest('#board .card[data-z][data-s="me"]'); if (!el) return null;
  const z = el.dataset.z, i = +el.dataset.i;
  if (z === "hand" && P(st, me).hand[i] != null) return { kind: "hand", i, el };
  if (z === "mz" && atkReady(st, me).includes(i)) return { kind: "mon", i, el };
  return null;
}
const dragTip = () => { let t = document.getElementById("dragTip"); if (!t){ t = document.createElement("div"); t.id = "dragTip"; t.className = "drag-tip"; t.setAttribute("aria-hidden", "true"); document.body.appendChild(t); } return t; };
const handTop = () => { const h = visEl(["#board .mhand", "#board .hand"]); return h ? h.getBoundingClientRect().top : innerHeight; };
const defaultUse = () => ["summon", "activateHand", "ssummon", "set"].map(k => document.querySelector(`#board [data-act="${k}"]:not([disabled])`)).find(Boolean) || null;
// いまの指（カーソル）の下で、はなしたら何が起きるか
function dragAim(x, y){
  const d = DRAG.on, st = G.st, me = G.slot, el = document.elementFromPoint(x, y);
  if (d.kind === "hand"){
    const slot = el && el.closest("#board .slot.drop"), tgt = el && el.closest('#board .card.target[data-z="mz"]');
    if (slot) return { el: slot, t: slot.dataset.z === "mz" ? "ここに召喚" : "ここに置く" };
    if (tgt) return { el: tgt, t: "このモンスターに装備" };
    const tb = el && el.closest("#board .table");
    if (tb && y < handTop() - 8){ const b = defaultUse(); return b ? { use: b, t: `はなすと${b.textContent.trim().replace(/\s+/g, "")}` } : { t: "いまは使えない", no: true }; }
    return { t: "もどす", no: true };
  }
  const AT = atkTargets(st, me, d.i);
  const mc = el && el.closest('#board .card[data-z="mz"][data-s="op"]'), di = mc ? +mc.dataset.i : null;
  if (mc && AT.L.includes(di)){ const pv = atkPredict(st, me, d.i, di); return { to: di, el: mc, t: pv ? `${pv.t}${pv.s ? "・" + pv.s : ""}` : "攻撃" }; }
  if (mc) return { t: "このモンスターには攻撃できない", no: true };
  const dz = el && el.closest("#board .mbar, #board .table>.mstat.op, #lp-op, #board .ohand, #board [data-lp=op]");
  if (dz && AT.direct){ const pv = atkPredict(st, me, d.i, "direct"); return { to: "direct", el: dz, t: pv ? `直接攻撃・${pv.t}` : "直接攻撃" }; }
  return { t: "もどす", no: true };
}
function dragStart(e){
  const d = DRAG.on; d.started = true;
  if (typeof mSwipe !== "undefined" && mSwipe){ mSwipe.el.style.transform = ""; mSwipe = null; }
  document.body.classList.add("dragging");
  if (d.kind === "hand"){
    const r = d.el.getBoundingClientRect(), g = d.el.cloneNode(true);
    [g, ...g.querySelectorAll("[data-z],[data-i],[data-s],[id]")].forEach(x => { x.removeAttribute("data-z"); x.removeAttribute("data-i"); x.removeAttribute("data-s"); x.removeAttribute("id"); });
    // 手札の扇の角度はつけない大きさ（offsetWidth）で写す。カードの中身は --w で決まる
    const w = d.el.offsetWidth || r.width, h = d.el.offsetHeight || r.height;
    g.classList.add("drag-ghost"); g.style.setProperty("--w", w + "px"); g.style.width = w + "px"; d.gw = w; d.gh = h; document.body.appendChild(g); d.ghost = g;
    G.sel = { z: "hand", s: "me", i: d.i }; G.atkFrom = null; G.atkTo = null; G.atkMode = false;
  } else { G.sel = { z: "mz", s: "me", i: d.i }; G.atkFrom = d.i; G.atkTo = null; G.atkMode = false; }
  renderAll();
}
// 画面のはしまで引っぱると、そのまま上下にスクロールする（PCは盤面が画面より高いので、相手まで届くように）
function dragEdgeLoop(){
  const d = DRAG.on; if (!d || !d.started){ return; }
  const m = 70, y = d.py, v = y < m ? -Math.ceil((m - y) / 4) : y > innerHeight - m ? Math.ceil((y - (innerHeight - m)) / 4) : 0;
  if (v){ const before = scrollY; scrollBy(0, v); if (scrollY !== before) dragMove(d.px, d.py, d.touch); }
  d.raf = requestAnimationFrame(dragEdgeLoop);
}
function dragMove(x, y, touch){
  const d = DRAG.on; d.px = x; d.py = y; if (!d.raf) d.raf = requestAnimationFrame(dragEdgeLoop);
  if (d.ghost){ const oy = touch ? d.gh * .75 : d.gh / 2; d.ghost.style.transform = `translate(${Math.round(x - d.gw / 2)}px, ${Math.round(y - oy)}px) rotate(-3deg)`; }
  const aim = dragAim(x, y), tip = dragTip();
  tip.textContent = aim.t; tip.classList.toggle("no", !!aim.no); tip.hidden = false; tip.style.left = x + "px"; tip.style.top = (y - (touch && d.ghost ? d.gh * .75 : 6)) + "px";
  document.querySelectorAll("#board .drop-hover").forEach(n => n.classList.remove("drop-hover")); if (aim.el) aim.el.classList.add("drop-hover");
  document.querySelector("#board .table")?.classList.toggle("drop-field", !!aim.use);
  if (d.kind === "mon"){
    const to = typeof aim.to === "number" ? aim.to : null;
    G.atkPtr = { x, y };
    if (G.atkTo !== to){ G.atkTo = to; renderAll(); document.querySelectorAll("#board .drop-hover").forEach(n => n.classList.remove("drop-hover")); const a2 = dragAim(x, y); if (a2.el) a2.el.classList.add("drop-hover"); }
    else atkArrowSoon();
  }
}
function dragClean(){
  const d = DRAG.on; DRAG.on = null; if (d && d.raf) cancelAnimationFrame(d.raf); if (!d || !d.started) return d;
  dragEndAt = Date.now(); document.body.classList.remove("dragging");
  if (d.ghost) d.ghost.remove(); const t = document.getElementById("dragTip"); if (t) t.hidden = true;
  document.querySelectorAll(".drop-hover").forEach(n => n.classList.remove("drop-hover")); document.querySelector("#board .table")?.classList.remove("drop-field");
  G && (G.atkPtr = null);
  return d;
}
const synthClick = el => { DRAG.synth = true; try{ el.click(); } finally { DRAG.synth = false; } };
function dragDrop(x, y){
  const aim = DRAG.on && DRAG.on.started ? dragAim(x, y) : null, d = dragClean(); if (!d || !d.started || !G || !G.st) return;
  const st = G.st, me = G.slot;
  if (d.kind === "mon"){
    G.sel = null; G.atkFrom = null; G.atkTo = null;
    if (aim && aim.to != null){ const to = aim.to; act(s2 => declareAttack(s2, me, d.i, to)); return; }
    renderAll(); return;
  }
  if (aim && aim.el && !aim.no){
    // えらんだままで描きなおし、同じ場所を押したことにする（生贄・質量・装備の続きは、いつものタップと同じ流れ）
    const q = aim.el.classList.contains("slot") ? `#board .slot.drop[data-z="${aim.el.dataset.z}"][data-s="me"][data-i="${aim.el.dataset.i}"]` : `#board .card.target[data-z="mz"][data-s="${aim.el.dataset.s}"][data-i="${aim.el.dataset.i}"]`;
    renderAll(); const el = document.querySelector(q); if (el){ synthClick(el); return; }
  }
  if (aim && aim.use){ renderAll(); const b = defaultUse(); if (b){ synthClick(b); return; } }
  if (aim && !aim.no) toast("このカードはいま使えない");
  G.sel = null; renderAll();
}
document.addEventListener("pointerdown", e => { DRAG.on = null; const f = dragFrom(e); if (f) DRAG.on = { ...f, x: e.clientX, y: e.clientY, pid: e.pointerId, started: false, touch: e.pointerType !== "mouse" }; });
document.addEventListener("pointermove", e => {
  const d = DRAG.on; if (!d || e.pointerId !== d.pid) return;
  if (!d.started){ if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < (d.touch ? 12 : 8)) return; if (!G || !G.st || !canAct(G.st, G.slot)){ DRAG.on = null; return; } dragStart(e); }
  e.preventDefault(); dragMove(e.clientX, e.clientY, d.touch);
}, { passive: false });
document.addEventListener("pointerup", e => { const d = DRAG.on; if (!d || e.pointerId !== d.pid) return; if (!d.started){ DRAG.on = null; return; } dragDrop(e.clientX, e.clientY); });
document.addEventListener("pointercancel", e => { const d = DRAG.on; if (!d || e.pointerId !== d.pid) return; const was = dragClean(); if (was && was.started && G && G.st){ G.sel = null; G.atkFrom = null; G.atkTo = null; renderAll(); } });
// PCでカードの絵をつかむと、ブラウザの画像ドラッグが始まってこちらのドラッグが止まるので、盤面のカードでは出さない
document.addEventListener("dragstart", e => { if (e.target && e.target.closest && e.target.closest("#board .card, #board .slot")) e.preventDefault(); });
// ドラッグのあとの「はなした」は、カードを選ぶクリックにしない
document.addEventListener("click", e => { if (!DRAG.synth && Date.now() - dragEndAt < 400){ e.stopPropagation(); e.preventDefault(); } }, true);
