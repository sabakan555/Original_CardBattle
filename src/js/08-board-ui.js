/* ================= glue: act / persist / cpu ================= */
function persist(){
  if (G.mode !== "online") return;
  const body = clone(G.st), code = G.code; body.updatedAt = Date.now(); G.st.updatedAt = body.updatedAt;
  G.q = G.q.then(() => S.db.doc("rooms/" + code).set(body)).catch(writeErr);
}
// オンライン対戦の放置対策: 動く番の人が TURN_IDLE 秒なにもしないと、相手が「進める」を押せる（3回で負け）
const TURN_IDLE = 180;
function idleInfo(){
  if (!G || G.mode !== "online" || !G.st || !G.st.started || G.st.winner || !G.st.updatedAt) return null;
  const st = G.st, w = st.askQ && st.askQ.ans == null ? st.askQ.to : st.pending ? (st.pending.wait ? O(st.pending.by) : null) : st.turn; if (!w) return null;
  return { w, left: TURN_IDLE - Math.max(0, Math.floor((Date.now() - st.updatedAt) / 1000)) };
}
function timerHTML(){
  const i = idleInfo(); if (!i || i.left > 60) return "";
  if (G.spectate) return `<span class="tmr">${esc(P(G.st, i.w).name)} の操作待ち（${Math.max(0, i.left)}秒）</span>`;
  if (i.w === G.slot) return `<span class="tmr warn">あと${Math.max(0, i.left)}秒動かないと、相手が進められるようになります</span>`;
  return i.left <= 0 ? `<button class="small" data-act="skipIdle">相手が${TURN_IDLE / 60}分動かないので進める</button>` : `<span class="tmr">相手の操作待ち…あと${i.left}秒で進められるようになります</span>`;
}
setInterval(() => { const el = document.getElementById("turnTimer"); if (el){ const h = timerHTML(); if (el.innerHTML !== h) el.innerHTML = h; } }, 2000);
function act(fn){
  if (!G || G.spectate) return;
  const ok = fn(G.st);
  if (ok === false) return;
  checkEnd(G.st);
  persist();
  after(true);
}
function after(){
  if (!G) return;
  G.respSel = null; G.ovHide = false;
  // 相手に聞いた質問: 答えが届いたら止まっていた効果の続きを出す（ページを開きなおして続きがわからないときは取り消し）
  const aq = G.st && G.st.askQ;
  if (aq && G.mode === "online" && !G.spectate && aq.by === G.slot){
    const w = G.askWait;
    if (w && w.n === aq.n && aq.ans != null){ G.askWait = null; act(st => { const y = !!st.askQ.ans; st.askQ = null; log(st, w.s, `「${w.name}」：相手に「${w.text}」→ ${y ? "はい" : "いいえ"}`); w.resume(st, y); }); return; }
    if (!w || w.n !== aq.n){ G.askWait = null; act(st => { st.askQ = null; log(st, G.slot, `「${aq.name}」の質問は取り消された`); }); return; }
  }
  renderAll();
  if (G.mode === "cpu") scheduleCpu();
}
// CPUの速さ（ゆっくりだと何が起きたか追いやすい）
const CPU_SPD = { fast: [.5, "はやい"], normal: [1, "ふつう"], slow: [2, "ゆっくり"] };
function cpuSpd(){ const v = ls.get("cb_cpuspd", "normal"); return CPU_SPD[v] ? v : "normal"; }
function cpuDelay(){ return Math.round(900 * CPU_SPD[cpuSpd()][0]); }
const manualOn = () => !!ls.get("cb_manual", false);
function scheduleCpu(){
  if (!G || G.mode !== "cpu" || G.cpuT || G.st.winner || G.chooseQ.length) return;
  const st = G.st, c = "b";
  // CPU as defender
  if (st.pending && st.pending.wait && st.pending.by !== c) {
    G.cpuT = setTimeout(() => { G.cpuT = null; act(st => { const win = chainWindow(st); const o = G.test && G.test.cpu === "idle" ? [] : responseOptions(st, c, win); const top = st.chain && st.chain[st.chain.length - 1]; const pick = o.length && Math.random() < (win === "attack" ? .75 : top && top.summon ? .6 : .5) ? o[Math.floor(Math.random() * o.length)] : null; respond(st, c, pick && { from: pick.from, i: pick.i }); }); }, 900);
    return;
  }
  if (st.turn !== c || st.pending) return;
  G.cpuT = setTimeout(() => { if (!G) return; G.cpuT = null; act(st => G.tut ? tutCpu(st) : G.test && G.test.cpu === "idle" ? endTurn(st, c) : cpuStep(st, c)); }, G.tut ? Math.max(900, cpuDelay()) : cpuDelay());
}
function cpuStep(st, s){
  const p = P(st, s), op = P(st, O(s));
  if (p.spire && cpuPotion(st, s, "main")) return;
  // 1. magic from hand (only if it has a useful target / effect)
  for (let i = 0; i < p.hand.length; i++){
    const c = card(p.hand[i]); if (cardType(c) !== "magic" || !canPay(st, s, c) || useBlockedWhy(st, s, c)) continue;
    const fx = normFx(c); const opts = fx ? targetOptions(st, s, fx.kind, { tagName: fx.into || "" }) : null;
    if (fx && opts !== null && !opts.length) continue;
    if (fx && fx.kind === "atkUp" && !p.mz.some(Boolean)) continue;
    if (Math.random() < .7){ activate(st, s, "hand", i); return; }
  }
  // 1b. equip (bad ones go on the opponent)
  for (let ei = 0; ei < p.hand.length; ei++){
    const id = p.hand[ei], c = card(id); if (cardType(c) !== "equip" || !canPay(st, s, c) || Math.random() > .75) continue;
    const bad = (c.eqN || 0) < 0 || absOf(c).some(a => a.k === "noAttack"), side = bad ? O(s) : s;
    const ms = P(st, side).mz.map((m, j) => m && canEquipOn(st, id, side, j) ? j : -1).filter(j => j >= 0).sort((a, b) => atkOf(P(st, side).mz[b]) - atkOf(P(st, side).mz[a]));
    if (ms.length){ equip(st, s, ei, side, ms[0]); return; }
  }
  // 1c. special summon (only when it's worth what it costs)
  for (let i = 0; i < p.hand.length; i++){
    if (!canSpecial(st, s, i) || Math.random() > .8) continue;
    const c = card(p.hand[i]), ss = ssOf(c); let picks = [];
    if (ss.cost === "tribute"){
      picks = p.mz.map((m, j) => m ? j : -1).filter(j => j >= 0).sort((a, b) => atkOf(p.mz[a]) - atkOf(p.mz[b])).slice(0, ss.cn);
      if (picks.some(j => cmpNum(atkOf(p.mz[j]), baseAtk(c)) >= 0)) continue;
    }
    if (ss.cost === "discard") picks = p.hand.map((id, j) => j).filter(j => j !== i).sort((a, b) => cmpNum(cardType(card(p.hand[a])) === "monster" ? baseAtk(card(p.hand[a])) : 0, cardType(card(p.hand[b])) === "monster" ? baseAtk(card(p.hand[b])) : 0)).slice(0, ss.cn);
    if (specialSummon(st, s, i, picks)) return;
  }
  // 2. summon strongest
  if (canSummonNow(st, s)){
    const mons = p.hand.map((id, i) => [i, card(id)]).filter(([, c]) => cardType(c) === "monster" && canPay(st, s, c) && !(ssOf(c) || {}).only && massOf(c) <= p.grave.length).sort((a, b) => cmpNum(baseAtk(b[1]), baseAtk(a[1])));
    for (const [i, c] of mons){
      const need = tribOf(c, st, s);
      if (!need){ if (freeZone(p.mz) >= 0){ summon(st, s, i); return; } continue; }
      // 生贄召喚: only when the weakest ones it gives up are all weaker than it
      const mine = p.mz.map((m, j) => m && (!c.tribTag || hasTag(m.c, c.tribTag)) ? j : -1).filter(j => j >= 0).sort((a, b) => cmpNum(atkOf(p.mz[a]), atkOf(p.mz[b])));
      if (mine.length < need) continue;
      const picks = mine.slice(0, need); if (picks.some(j => cmpNum(atkOf(p.mz[j]), baseAtk(c)) >= 0)) continue;
      if (summon(st, s, i, null, null, picks)) return;
    }
  }
  // 2b. 起動効果（使えるときはだいたい使う）
  for (let i = 0; i < ZONES; i++){ if (p.mz[i] && !actWhy(st, s, i) && Math.random() < .7){ activateMon(st, s, i); return; } }
  // 3. set traps
  const ti = p.hand.findIndex(id => cardType(card(id)) === "trap");
  if (ti >= 0 && freeZone(p.sz) >= 0){ setCard(st, s, ti); return; }
  // 4. attack
  if (st.turnNo > 1){
    for (let i = 0; i < ZONES; i++){
      const m = p.mz[i]; if (!m || !canAttack(st, s, i)) continue;
      const T = atkTargets(st, s, i), opMons = T.L;
      if (T.direct){ declareAttack(st, s, i, "direct"); return; }
      const beat = opMons.filter(j => atkOf(op.mz[j]) < atkOf(m)).sort((a, b) => atkOf(op.mz[b]) - atkOf(op.mz[a]));
      if (beat.length){ declareAttack(st, s, i, beat[0]); return; }
    }
  }
  if (p.spire && cpuPotion(st, s, "end")) return;
  endTurn(st, s);
}

/* ================= board rendering ================= */
// which of my empty zones a click would place the selected hand card into
// equip mode: a selected equip card (hand, or activating a set one) waits for a monster click
function equipMode(st, me){
  if (!canAct(st, me)) return null;
  if (G.sel && G.sel.z === "hand" && cardType(card(P(st, me).hand[G.sel.i])) === "equip" && canPay(st, me, card(P(st, me).hand[G.sel.i]))) return { from: "hand", i: G.sel.i, id: P(st, me).hand[G.sel.i] };
  return null;
}
function dropTarget(st, me){
  if (!G.sel || G.sel.z !== "hand" || !canAct(st, me)) return null;
  const t = cardType(card(P(st, me).hand[G.sel.i]));
  if (t === "monster") return canSummonNow(st, me) && canPay(st, me, card(P(st, me).hand[G.sel.i])) && !(ssOf(card(P(st, me).hand[G.sel.i])) || {}).only ? "mz" : null;
  return t === "equip" || card(P(st, me).hand[G.sel.i]).frame === "spire" ? null : "sz";
}
// ブロック under the mana bar (always for スパイアデッキ, otherwise only while there is some)
const blockBox = (p, who) => p.spire || p.block > 0 ? `<div class="blockbar ${p.block > 0 ? "on" : ""}" title="ダメージを先に引き受ける${p.barricade ? "（ターンのはじめに消えない）" : "（次の自分のターンのはじめに消える）"}"><span class="lbl">${who}のブロック</span><b>🛡 ${p.block || 0}</b>${p.plate > 0 ? `<small>プレート ${p.plate}</small>` : ""}${p.barricade ? "<small>消えない</small>" : ""}</div>` : "";
const mOpt = s => ({ mana: !!(G && G.st && G.st.players[s] && G.st.players[s].mana) });
// EXデッキ: a card taken out to use sits at the end of the hand; when it's no longer being used it goes back
// (kept in the game state as p.exTemp, so a reload or the end of the turn still puts it back)
const exTempOk = p => !!(p && p.exTemp && p.hand[p.exTemp.i] === p.exTemp.id);
function exReturnP(st, s){
  const p = P(st, s), t = p.exTemp; if (!t) return; p.exTemp = null;
  if (p.hand[t.i] === t.id){ p.hand.splice(t.i, 1); (p.ex = p.ex || []).push(t.id); if (typeof G !== "undefined" && G && G.slot === s && G.sel && G.sel.z === "hand" && G.sel.i === t.i) G.sel = null; }
}
function exReturn(st){ if (G) exReturnP(st, G.slot); }
function exAutoReturn(){
  if (!G || G.spectate || !G.st || !G.st.players) return;
  const p = P(G.st, G.slot), t = p && p.exTemp; if (!t) return;
  if (!exTempOk(p)){ setTimeout(() => { if (G && P(G.st, G.slot).exTemp === t) act(st => { P(st, G.slot).exTemp = null; }); }, 0); return; }
  const busy = G.ssPick || G.costPick || G.eqPlace || G.equipFrom != null || (G.sel && G.sel.z === "hand" && G.sel.i === t.i) || (G.chooseQ || []).length;
  if (!busy) setTimeout(() => { if (G && P(G.st, G.slot).exTemp === t) act(st => { exReturnP(st, G.slot); }); }, 0);
}
// short reason why card c can't be activated on your own turn ("" = it can)
function useWhyShort(st, s, c){
  const w = whenOf(c); if (w) return `${WHEN_LABEL[w]}に使える`;
  const why = useBlockedWhy(st, s, c); if (why) return why.replace(/^このカードは|いまは/g, "").replace(/ません.*$/, "ない");
  const fx = normFx(c);
  if (fx && (fx.kind === "negate" || fx.kind === "killAtk" || fx.kind === "atkDownAtk")) return "攻撃されたときに使える";
  const opts = fx ? targetOptions(st, s, fx.kind, { tagName: fx.into || "" }) : null;
  if (opts && !opts.length) return "効果の対象がいない";
  return "";
}
// 「カード名」 in log lines → tap to read that card
const logLinks = h => h.replace(/「([^「」<]{1,40})」/g, (m, n) => `「<button type="button" class="lname" data-cname="${n}">${n}</button>」`);
function findCardIdByName(name){
  const st = G && G.st, L = [];
  if (st){ (st.recent || []).forEach(r => L.push(r.c)); if (st.field) L.push(st.field.c); for (const o of ["a", "b"]){ const p = P(st, o); p.mz.forEach(m => m && L.push(m.c, ...eqsOf(m).map(e => e.c))); p.sz.forEach(z => z && (z.face || o === G.slot) && L.push(z.c)); L.push(...p.grave, ...(p.exile || [])); if (o === G.slot) L.push(...p.hand, ...(p.ex || []), ...p.deck); } }
  const hit = L.find(id => card(id) && card(id).name === name); if (hit) return hit;
  const c = [...S.cards.values()].find(x => x && x.name === name); return c ? c.id : null;
}
// テストモード: 好きなカードを手札・場に出したり、マナやLPを戻したりできる（相手はふだん動かない）
function testBoxHTML(st, pm){
  const T = G.test, dis = st.winner ? "disabled" : "";
  return `<div class="box test-box"><h3>🧪 テストモード</h3>
    <label class="f">カード名<input type="text" list="cardNames" data-testname value="${esc(T.name || "")}" placeholder="カード名を入れて…"></label>
    <div class="row test-row"><button class="small" data-test="hand" ${dis}>手札に加える</button><button class="small" data-test="meField" ${dis}>自分の場に置く</button><button class="small" data-test="opField" ${dis}>相手の場に置く</button><button class="small" data-test="opSet" ${dis}>相手の場にセット</button></div>
    ${T.id ? `<div class="row test-row"><button class="small" data-test="again" ${dis}>テスト中のカードをもう1枚手札に</button></div>` : ""}
    <div class="row test-row">${pm.mana ? `<button class="small" data-test="mana" ${dis}>マナを満タン（10）</button>` : ""}<button class="small" data-test="lp" ${dis}>お互いのLPを1000に</button><button class="small" data-test="refresh" ${dis}>召喚・攻撃・起動をもう一度できるように</button></div>
    <label class="row" style="gap:8px">相手の動き<select data-testcpu><option value="idle"${T.cpu === "idle" ? " selected" : ""}>動かない（ターン終了だけ）</option><option value="play"${T.cpu === "play" ? " selected" : ""}>ふつうに動く</option></select></label>
    <div class="row test-row"><button class="small" data-test="reset">最初からやり直す</button>${T.src ? `<button class="small ghost" data-test="back">カード工房にもどる</button>` : ""}</div>
    <p class="note" style="margin:0">場に置いたカードは「召喚したとき」の効果は出ません。勝敗の記録にも残りません。</p>
  </div>`;
}
function startTest(src){
  leaveGame(); { const a = document.getElementById("tutAsk"); if (a) a.remove(); }
  let tid = null;
  if (src){ tid = "test-" + (src.id || "new"); S.cards.set(tid, { ...src, id: tid, test: true, tut: true }); }
  const mana = !!(src && hasCost(src) && deckModeOf(src) !== "normal");
  const ids = (mana ? sampleManaDeck() : starterDeck()).cards.filter(id => S.cards.has(id));
  const pa = newPlayer(ids, null, mana, false), pb = newPlayer(ids, "テスト相手", mana, false);
  if (tid) pa.hand.unshift(tid);
  const st = startState(pa, pb); st.first = "a"; st.turn = "a"; st.turnNo = 2;
  if (mana){ pa.mana = { max: 10, cur: 10 }; pb.mana = { max: 10, cur: 10 }; }
  st.log = [{ t: Date.now(), m: src ? `テストモード：「${src.name}」を手札に入れてスタート` : "テストモード スタート" }];
  G = { mode: "cpu", test: { id: tid, src: src || null, cpu: "idle", name: "" }, slot: "a", st, sel: null, atkFrom: null, chooseQ: [], evSeen: 0, recorded: true };
  S.tab = "play"; ls.set("cb_tab", "play"); renderAll(); after(false); window.scrollTo(0, 0);
}
function testAct(k){
  const T = G.test, me = G.slot;
  if (k === "reset"){ startTest(T.src); return; }
  if (k === "back"){ leaveGame(); S.tab = "make"; ls.set("cb_tab", "make"); renderAll(); window.scrollTo(0, 0); return; }
  const named = ["hand", "meField", "opField", "opSet"].includes(k);
  const id = k === "again" ? T.id : named ? (findCardIdByName((T.name || "").trim()) || null) : null;
  if (named && !id){ toast(T.name ? `「${T.name}」というカードが見つかりません` : "カード名を入れてね"); return; }
  const c = id ? card(id) : null, t = c ? cardType(c) : "";
  if ((k === "meField" || k === "opField") && t !== "monster"){ toast("場に置けるのはモンスターだけです（魔法・罠は「相手の場にセット」）"); return; }
  if (k === "opSet" && t !== "magic" && t !== "trap"){ toast("セットできるのは魔法・罠だけです"); return; }
  act(st => {
    const pm = P(st, me), po = P(st, O(me));
    if (k === "hand" || k === "again"){ pm.hand.push(id); log(st, me, `（テスト）「${c.name}」を手札に加えた`); return; }
    if (k === "meField" || k === "opField"){ const s = k === "meField" ? me : O(me), p = P(st, s), z = freeZone(p.mz); if (z < 0){ toast("モンスターゾーンがいっぱいです"); return false; } const m = mkMon(st, id); m.born = 0; p.mz[z] = m; log(st, me, `（テスト）「${c.name}」を${s === me ? "自分" : "相手"}の場に置いた`); return; }
    if (k === "opSet"){ const z = freeZone(po.sz); if (z < 0){ toast("魔法・罠ゾーンがいっぱいです"); return false; } st.un = (st.un || 0) + 1; po.sz[z] = { c: id, turn: st.turnNo - 1, face: false, u: st.un }; log(st, me, `（テスト）相手の場に「${c.name}」をセットした`); return; }
    if (k === "mana"){ if (pm.mana){ pm.mana.max = Math.max(pm.mana.max, 10); pm.mana.cur = Math.max(pm.mana.cur, 10); log(st, me, "（テスト）マナを満タンにした"); } return; }
    if (k === "lp"){ pm.lp = po.lp = START_LP; log(st, me, "（テスト）お互いのLPを1000にもどした"); return; }
    if (k === "refresh"){ st.summoned = false; pm.mz.forEach(m => { if (m){ m.attacked = false; m.atkCount = 0; m.actT = null; m.born = Math.min(m.born, st.turnNo - 1); } }); log(st, me, "（テスト）召喚・攻撃・起動効果をもう一度できるようにした"); return; }
    return false;
  });
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-testmode]")) startTest(null); });
const ACT_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3l3.6 9.2 9.4-3.3-4.3 9 8.3 5.6-9.7 1.6.6 9.9L20 30.4 12.1 35l.6-9.9-9.7-1.6 8.3-5.6-4.3-9 9.4 3.3z" fill="#fde7c9" stroke="#e08a00" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
function renderBoard(){
  recordResult();
  exAutoReturn();
  const st = G.st, me = G.slot, op = O(me), pm = P(st, me), po = P(st, op);
  const myTurn = st.turn === me, free = canAct(st, me);
  const sel = G.sel, atkFrom = G.atkFrom;
  const dropKind = dropTarget(st, me);
  const eqMode = equipMode(st, me);
  // the attack in progress (also while a chain answers it), for the 攻撃中 / 狙われている marks
  const atkNow = st.pending && (st.pending.type === "attack" ? st.pending : st.pending.type === "chain" && st.pending.resume && st.pending.resume.type === "attack" ? st.pending.resume : null);
  const WHEN_SHORT = { attacked: "攻撃時", oppSummon: "召喚時", oppUse: "発動時", oppEnd: "相手の終わり" };
  // phones: name (+ATK) under each field card, since the cards are tiny
  const zcap = (html, c, m) => html.replace(/<\/div>$/, `<span class="zcap">${esc(c.name)}${m ? ` <b>${fmtN(atkOf(m))}</b>` : ""}</span></div>`);
  const zoneHTML = (s, kind) => P(st, s)[kind].map((z, i) => {
    const mine = s === me;
    const attrs = `data-z="${kind}" data-s="${s === me ? "me" : "op"}" data-i="${i}"`;
    const tl = atkFrom != null ? atkTargets(st, me, atkFrom).L : [];
    const isTarget = (atkFrom != null && !mine && kind === "mz" && z && tl.includes(i)) || (eqMode && kind === "mz" && z && canEquipOn(st, eqMode.id, s, i));
    const pendSummon = !z && kind === "mz" && st.chain && st.chain.find(l => l.summon && l.s === s && l.z === i);
    if (pendSummon) return cardHTML(card(pendSummon.c), "dim", attrs.replace('data-z="mz"', 'data-z="pending"'), { done: "召喚中…", ...mOpt(s) });
    if (!z) return `<div class="slot ${mine && dropKind === kind ? "drop" : ""}" ${attrs}></div>`;
    const selected = sel && sel.z === kind && sel.s === (mine ? "me" : "op") && sel.i === i;
    const aimed = atkFrom != null && G.atkTo === i && !mine && kind === "mz";
    const cls = `pick ${selected ? "sel" : ""} ${isTarget ? "target" : ""} ${aimed ? "aim" : ""}`;
    if (kind === "sz"){
      if (z.face) return zcap(cardHTML(card(z.c), cls, attrs, { ...mOpt(s), ...(z.fcp ? { done: `ストック×${z.stack || 1}` } : {}) }), card(z.c));
      if (!mine || G.spectate) return backHTML(cls, attrs, P(st, s).sleeve);
      const sc = card(z.c), w = whenOf(sc), late = (cardType(sc) === "trap" || isQuick(sc)) && z.turn >= st.turnNo;
      return zcap(cardHTML(sc, `${cls} isset`, attrs, { ...mOpt(s), done: late ? "次ターン〜" : w ? WHEN_SHORT[w] : "" }), sc);
    }
    const es = eqsOf(z), cap = eqCapOf(card(z.c));
    const eqB = [es.length ? `装備${es.length} ${eqUsed(z)}/${cap}` : "", (z.mats || []).length ? `質量${z.mats.length}` : ""].filter(Boolean).join(" ");
    const ttl = es.length ? ` title="${esc("装備（左から）：" + es.map(e => card(e.c).name).join("→"))}"` : "";
    const atkr = atkNow && atkNow.by === s && atkNow.from === i, atkd = atkNow && atkNow.by !== s && atkNow.to === i;
    const stt0 = atkr ? "攻撃中！" : atkd ? "狙われている" : "";
    const stt = stt0 || z.attacked && s === st.turn ? stt0 || "攻撃済" : (z.atkCount && s === st.turn ? "あと1回" : "") || (charmActive(st, z) ? "魅了" : "") || ((z.noAtkTurn || 0) >= st.turnNo ? "攻撃できない" : "");
    const zz = sick(st, s, i) ? " sick" : "", zx = (!z.shieldGone && hasAb(st, s, i, "shield") ? " shielded" : "") + (hiddenMon(st, s, i) ? " stealthy" : "");
    const actH = mine && !G.spectate && hasTrig(monCard(z), "act"), actNo = actH ? actWhy(st, s, i) : "";
    return (h => actH ? h.replace(/<\/div>$/, `<button type="button" class="actbtn" data-actmon="${i}" ${actNo ? "disabled" : ""} title="${actNo ? esc(actNo) : "能力を発動する"}" aria-label="「${esc(card(z.c).name)}」の能力を発動する">${ACT_ICON}</button></div>`) : h)(zcap(cardHTML(card(z.c), cls + zz + zx + (actH ? (actNo ? " actable actused" : " actable") : "") + (atkr ? " attacking" : "") + (atkd ? " atk-tgt" : ""), attrs + (zz ? ` title="召喚酔い：次の自分のターンから攻撃できる"` : ttl), { mod: modOf(z), done: stt, eq: eqB, dmg: z.dmg || 0, ctr: z.ctr, vuln: z.vuln || 0, weak: z.weak || 0, ...mOpt(s) }), card(z.c), z));
  }).join("");

  // action bar
  let acts = "", hint = "", handActs = "";
  // フラッシュバック: 自分のターンに、墓地の魔法をもう1回使えるボタン
  const fbActs = !G.spectate && canAct(st, me) ? [...new Set(pm.grave)].filter(id => { const c = card(id); return cardType(c) === "magic" && c.flashback; }).map(id => { const c = card(id), gi = pm.grave.lastIndexOf(id), why = useWhyShort(st, me, c), ok = canPay(st, me, c) && !(isPersist(c) && freeZone(pm.sz) < 0) && !why; return `<button class="mg" data-fb="${gi}" ${ok ? "" : "disabled"}>墓地から発動「${esc(c.name)}」${why ? `（${esc(why)}）` : ok ? "" : "（使えない）"}</button>`; }).join("") : "";
  if (st.winner){
    hint = `<span class="big">${st.winner === "draw" ? "引き分け" : G.spectate ? `${esc(nm(st, st.winner))} の勝ち！` : st.winner === me ? "あなたの勝ち！" : "あなたの負け…"}</span><br>${esc(st.why)}`;
    const rm = st.rematch || {};
    if (G.spectate) acts = `<button class="primary" data-act="leave">観戦をやめる</button>`;
    else if (G.mode !== "online") acts = `<button class="primary" data-act="rematch">再戦する</button><button data-act="leave">ロビーにもどる</button>`;
    else {
      acts = `<button class="primary" data-act="rematch" ${rm[me] ? "disabled" : ""}>${rm[me] ? "相手の返事を待っています…" : rm[op] ? "再戦を受ける！" : "再戦をもうしこむ"}</button><button data-act="leave">ロビーにもどる</button>`;
      if (rm[op] && !rm[me]) hint += `<br><b>${esc(po.name)} が再戦をもうしこんでいます！</b>`;
    }
  } else if (st.askQ){
    hint = st.askQ.to === me ? "相手のカードから質問がきています" : "相手の答えを待っています…";
  } else if (st.pending){
    hint = st.pending.type === "chain" ? (st.pending.by === me ? "相手がチェーンするか考えています…" : "チェーンするか選んでね") : st.pending.by === me ? (st.pending.type === "end" ? "ターン終了前に、相手が速攻魔法・罠を使うか考えています…" : "相手が罠・速攻魔法を使うか考えています…") : (st.pending.type === "end" ? "相手のターン終了前です" : st.pending.type === "summoned" ? "相手がモンスターを出しました" : "攻撃されています！");
  } else if (!myTurn){
    hint = `${esc(po.name)} のターンです`;
  } else if (atkFrom != null){
    const noMons = !po.mz.some(Boolean), AT = atkTargets(st, me, atkFrom), tt = AT.taunt ? [1] : [], canDirect = AT.direct;
    if (G.atkTo != null && !AT.L.includes(G.atkTo)) G.atkTo = null;
    if (G.atkTo != null){ const am = pm.mz[atkFrom], tm = po.mz[G.atkTo]; hint = `「${esc(card(am.c).name)}」（ATK ${fmtN(atkOf(am))}）で「${esc(card(tm.c).name)}」（ATK ${fmtN(atkOf(tm))}）に攻撃する？`; acts = `<button class="primary" data-act="atkGo">攻撃する！</button><button class="ghost" data-act="cancelAtk">やめる</button>`; }
    else hint = noMons ? "相手の場にモンスターがいない！" : AT.top ? "一番ATKが高いモンスターにしか攻撃できない！（光っているモンスター）" : tt.length ? "このモンスターにしか攻撃できない！（光っているモンスター）" : canDirect ? "攻撃する相手モンスターをえらぶか、直接攻撃！" : "攻撃する相手モンスターをえらんでね";
    if (G.atkTo == null) acts = (canDirect ? `<button class="primary" data-act="direct">直接攻撃！</button>` : "") + `<button class="ghost" data-act="cancelAtk">やめる</button>`;
  } else {
    hint = st.turnNo === 1 ? "先攻の1ターン目は攻撃できません" : "カードをえらんで行動しよう";
    if (sel && sel.z === "hand"){
      const a0 = acts.length;
      const c = card(pm.hand[sel.i]), t = cardType(c);
      const afford = canPay(st, me, c), short = afford ? "" : costWhy(st, me, c) ? `（${costWhy(st, me, c)}）` : (effCost(st, me, c) === Infinity ? "（コスト∞：ふつうには使えない）" : `（マナが${effCost(st, me, c) - pm.mana.cur}足りない）`);
      if (t === "monster"){
        const ss = ssOf(c);
        const tn = tribOf(c, st, me), mineN = pm.mz.filter(m => m && (!c.tribTag || hasTag(m.c, c.tribTag))).length;
        if (!(ss && ss.only)){ const ms = massOf(c), msOk = pm.grave.length >= ms, ok = canSummonNow(st, me) && afford && msOk && (tn ? mineN >= tn : freeZone(pm.mz) >= 0); acts += `<button class="primary" data-act="summon" ${ok ? "" : "disabled"}>${tn ? "生贄召喚する" : ms ? `召喚する（質量${ms}）` : "召喚する"}${!canSummonNow(st, me) ? "（このターンは召喚ずみ）" : !msOk ? `（墓地のカードが${ms}枚いる）` : tn && mineN < tn ? `（生贄が${tn}体いる）` : short}</button>`; if (ok) hint = tn ? `自分のモンスター${tn}体を生贄にして召喚します` : "光っているモンスターゾーンをクリックしても召喚できます"; }
        else hint = "このカードは特殊召喚でしか出せません";
        if (ss){ const why = ssBlock(st, me, sel.i); acts += `<button class="mg" data-act="ssummon" ${why ? "disabled" : ""}>特殊召喚する${why ? `（${why}）` : ""}</button>`; }
      }
      if (!afford && t !== "monster") hint = `今は使えません${short}${c.frame === "spire" ? "" : "。セットはできます"}`;
      else if (t !== "equip") hint = "光っている魔法・罠ゾーンをクリックしてもセットできます";
      if (t === "magic"){ const full = isPersist(c) && freeZone(pm.sz) < 0, why = useWhyShort(st, me, c); acts += `<button class="mg" data-act="activateHand" ${afford && !full && !why ? "" : "disabled"}>発動する${full ? "（魔法・罠ゾーンがいっぱい）" : why ? `（${why}）` : short}</button>`; if (+c.kick > 0 && pm.mana) acts += `<button class="mg" data-act="activateHandKick" ${afford && !full && !why && pm.mana.cur >= effCost(st, me, c) + +c.kick ? "" : "disabled"}>キッカー${+c.kick}も払って発動</button>`; }
      if (t === "equip" && afford){ const any = ["a", "b"].some(o => P(st, o).mz.some((m, j) => m && canEquipOn(st, pm.hand[sel.i], o, j))); hint = any ? `光っているモンスターをクリックして装備（相手のでもOK）。装備コスト ${eqCostOf(c)}` : "装備できるモンスターがいません（キャパが足りない）"; }
      if (t !== "monster" && t !== "equip" && c.frame !== "spire") acts += `<button class="${t === "trap" ? "tr" : ""}" data-act="set" ${freeZone(pm.sz) < 0 ? "disabled" : ""}>セットする</button>`;
      // the same buttons right under the hand, so you don't have to look back up to the battle zone
      handActs = acts.slice(a0);
    }
    if (sel && sel.z === "mz" && sel.s === "me"){
      const m = pm.mz[sel.i];
      if (m){ const why = st.turnNo === 1 ? "" : sick(st, me, sel.i) ? "（出たターンは攻撃できない）" : !atkCondOk(st, me, sel.i) ? "（攻撃の条件を満たしていない）" : hasAb(st, me, sel.i, "noAttack") ? "（攻撃できない）" : charmActive(st, m) ? "（魅了されている）" : ""; acts += `<button class="primary" data-act="attack" ${canAttack(st, me, sel.i) ? "" : "disabled"}>攻撃する${why}</button>`; }
    }
    if (sel && sel.z === "sz" && sel.s === "me"){
      const z = pm.sz[sel.i];
      if (z && !z.face){
        const t = cardType(card(z.c));
        { const ok = t === "magic" || z.turn < st.turnNo, af = canPay(st, me, card(z.c)), why = ok ? useWhyShort(st, me, card(z.c)) : ""; acts += `<button class="${t === "trap" ? "tr" : "mg"}" data-act="activateSet" ${ok && af && !why ? "" : "disabled"}>発動する${!ok ? "（次のターンから）" : why ? `（${why}）` : !af ? "（マナが足りない）" : ""}</button>`; const kc = card(z.c); if (+kc.kick > 0 && pm.mana) acts += `<button class="${t === "trap" ? "tr" : "mg"}" data-act="activateSetKick" ${ok && af && !why && pm.mana.cur >= effCost(st, me, kc) + +kc.kick ? "" : "disabled"}>キッカー${+kc.kick}も払って発動</button>`; }
      }
    }
    acts += `<button data-act="endTurn">ターン終了</button>`;
  }
  // manual tools for the selected field monster
  let manual = "";
  if (!st.winner && manualOn() && sel && (sel.z === "mz" || sel.z === "sz")){
    const X = sel.s === "me" ? pm : po, z = X[sel.z][sel.i];
    if (z && (sel.s === "me" || sel.z === "mz" || z.face)){
      manual = `<div class="row" style="justify-content:center;gap:6px"><span class="note">手動：「${esc(card(z.c).name)}」</span>${sel.z === "mz" ? `<button class="small" data-man="atk" data-d="-50">ATK−50</button><button class="small" data-man="atk" data-d="50">ATK+50</button>${eqsOf(z).map((e, k) => `<button class="small" data-man="uneq" data-k="${k}">「${esc(card(e.c).name)}」を外す</button>`).join("")}` : ""}<button class="small danger" data-man="grave">墓地へ送る</button>${sel.s === "me" ? `<button class="small" data-man="hand">手札に戻す</button>` : ""}</div>`;
    }
  }
  if (G.spectate && !st.winner){ hint = `観戦中：${esc(pm.name)} vs ${esc(po.name)}`; acts = `<button class="ghost" data-act="leave">観戦をやめる</button>`; manual = ""; }
  const last = st.log[st.log.length - 1];
  const handHTML = G.spectate ? (pm.hand.map(() => backHTML("", "", pm.sleeve)).join("") || `<p class="muted">手札なし</p>`) : pm.hand.map((id, i) => cardHTML(symView(st, me, card(id)), `pick ${sel && sel.z === "hand" && sel.i === i ? "sel" : ""} ${pm.exTemp && pm.exTemp.i === i && pm.exTemp.id === id ? "ex-temp" : ""} ${pm.mana && !canPay(st, me, card(id)) && cardType(card(id)) !== "trap" ? "dim" : ""}`, `data-z="hand" data-s="me" data-i="${i}" tabindex="0" role="button"`, mOpt(me))).join("") || `<p class="muted">手札なし</p>`;
  const logHTML = st.log.slice(-60).reverse().map(l => `<li>${l.s ? `<b>${esc(nm(st, l.s))}</b>：` : ""}${logLinks(esc(l.m))}</li>`).join("");
  const prev = G.prevLp || {}; G.prevLp = { me: pm.lp, op: po.lp };
  const manaBox = (p, who) => p.mana ? `<div class="manabar" title="${who}のマナ"><span class="lbl">${who}のマナ</span><b>${p.mana.cur}<small>/${p.mana.max}</small></b><span class="gems">${Array.from({ length: Math.max(p.mana.max, p.mana.cur) }, (_, k) => `<i class="${k < p.mana.cur ? "" : "off"}"></i>`).join("")}${Array.from({ length: Math.max(0, MAX_MANA - Math.max(p.mana.max, p.mana.cur)) }, () => `<i class="lock"></i>`).join("")}</span></div>` : "";
  const lpBox = (p, key) => `<div id="lp-${key}" data-lp="${key}" class="lp ${p.lp <= 300 ? "low" : ""} ${prev[key] != null && p.lp < prev[key] ? "hurt" : ""}"><small>LP</small><b>${p.lp}</b></div>`;

  $("#board").innerHTML = `
  <div class="board">
    <div class="table">
      ${manaBox(po, esc(po.name))}${blockBox(po, esc(po.name))}
      <div class="mstat"><span class="who">${esc(po.name)}</span><span>山札 ${po.deck.length}</span>${(po.ex || []).length ? `<span>EX ${po.ex.length}</span>` : ""}<button class="chip" data-grave="op:grave">墓地 ${po.grave.length}</button>${(po.exile || []).length ? `<button class="chip" data-grave="op:exile">廃棄 ${po.exile.length}</button>` : ""}<span class="lpv ${po.lp <= 300 ? "low" : ""}" data-lp="op"><small>LP</small>${po.lp}</span></div>
      <div class="ohand">${backHTML("xs", "", po.sleeve)}<span class="cnt-x">×${po.hand.length - (exTempOk(po) ? 1 : 0)}</span><span class="lbl">手札（${esc(po.name)}）</span></div>
      <span class="zlabel">相手の魔法・罠ゾーン</span>
      <div class="zones">${zoneHTML(op, "sz")}</div>
      <span class="zlabel">相手のモンスターゾーン</span>
      <div class="zones">${zoneHTML(op, "mz")}</div>
      <div class="bz">
        ${st.field ? `<div class="fieldz" data-field title="フィールド（${fieldMine(card(st.field.c)) ? "出した人にだけ効く" : "お互いに効く"}）"><span class="flbl">フィールド</span>${cardHTML(card(st.field.c), "xs pick", `data-field tabindex="0" role="button"`)}<span class="note">${esc(P(st, st.field.o).name)} が出した${(st.field.mats || []).length ? `・質量${st.field.mats.length}` : ""}</span></div>` : ""}
        <h2>バトルゾーン</h2>
        <div class="turnline">ターン${st.turnNo}・${G.spectate ? `<span class="me">${esc(P(st, st.turn).name)} のターン</span>` : myTurn ? `<span class="me">あなたのターン</span>` : `<span class="op">${esc(po.name)} のターン</span>`}${myTurn && !pm.mana && !st.summoned ? "（召喚できる）" : ""}</div>
        ${st.chain && st.chain.length ? `<div class="chainrow onboard"><span class="note">チェーン中：</span>${st.chain.map((l, k) => `<button type="button" class="link ${l.s === me ? "mine" : ""}" data-cid="${esc(l.c)}" data-where="チェーン${k + 1}">${k + 1}. ${l.summon ? (l.special ? "特殊召喚：" : "召喚：") : ""}${esc(card(l.c).name)}<small>${l.s === me ? "あなた" : esc(P(st, l.s).name)}</small></button>`).join('<span class="arr">→</span>')}</div>` : ""}
        <div class="lastlog">${st.log.slice(-3).reverse().map((l, k) => `<div class="${k ? "older" : ""}">${logLinks(esc((l.s ? nm(st, l.s) + "：" : "") + l.m))}</div>`).join("")}</div>
        ${(st.recent || []).length ? `<div class="recent"><span class="note">最近使われたカード</span><div class="rc-list">${st.recent.slice().reverse().map(r => `<div class="rc ${r.s === me ? "mine" : "theirs"}">${cardHTML(card(r.c), "xs pick", `data-cid="${esc(r.c)}" data-where="${r.s === me ? "あなた" : esc(P(st, r.s).name)}が使った" tabindex="0" role="button"`, mOpt(r.s))}<small>${r.s === me ? "あなた" : esc(P(st, r.s).name)}</small></div>`).join("")}</div></div>` : ""}
        <div id="turnTimer" class="turn-timer">${timerHTML()}</div>
        <div class="msg">${hint}</div>
        <div class="actions">${acts}</div>
        ${manual}
      </div>
      <span class="zlabel">自分のモンスターゾーン</span>
      <div class="zones">${zoneHTML(me, "mz")}</div>
      <span class="zlabel">自分の魔法・罠ゾーン</span>
      <div class="zones">${zoneHTML(me, "sz")}</div>
      <div class="mstat"><span class="who">${esc(pm.name)}${G.spectate ? "" : "（あなた）"}</span><button class="chip" data-grave="me:deck">山札 ${pm.deck.length}</button>${(pm.ex || []).length ? `<button class="chip exchip" data-exopen>EX ${pm.ex.length}</button>` : ""}<button class="chip" data-grave="me:grave">墓地 ${pm.grave.length}</button>${(pm.exile || []).length ? `<button class="chip" data-grave="me:exile">廃棄 ${pm.exile.length}</button>` : ""}<span class="lpv ${pm.lp <= 300 ? "low" : ""}" data-lp="me"><small>LP</small>${pm.lp}</span></div>
      <span class="zlabel">手札</span>
      <div class="hand">${handHTML}</div>
      ${handActs ? `<div class="actions hand-acts">${handActs}</div>` : ""}
      ${fbActs ? `<div class="actions hand-acts fb-acts">${fbActs}</div>` : ""}
      ${manaBox(pm, "あなた")}${blockBox(pm, "あなた")}
    </div>
    <aside class="side">
      <div class="box" style="display:flex;flex-direction:column;gap:12px">
        <div class="pl"><div><div class="nm">${esc(po.name)}</div><div class="pile">山札 ${po.deck.length}${(po.ex || []).length ? ` EX ${po.ex.length}` : ""}<button class="chip" data-grave="op:grave">墓地 ${po.grave.length}</button>${(po.exile || []).length ? `<button class="chip" data-grave="op:exile">廃棄 ${po.exile.length}</button>` : ""}</div></div>${lpBox(po, "op")}</div>${potRow(po, false)}
        <div class="pl"><div><div class="nm">${esc(pm.name)}${G.spectate ? "" : "（あなた）"}</div><div class="pile"><button class="chip" data-grave="me:deck">山札 ${pm.deck.length}</button>${(pm.ex || []).length ? `<button class="chip exchip" data-exopen>EX ${pm.ex.length}</button>` : ""}<button class="chip" data-grave="me:grave">墓地 ${pm.grave.length}</button>${(pm.exile || []).length ? `<button class="chip" data-grave="me:exile">廃棄 ${pm.exile.length}</button>` : ""}</div></div>${lpBox(pm, "me")}</div>${potRow(pm, !G.spectate, !G.spectate)}
        ${G.mode === "online" ? `<div class="note">部屋 ${esc(G.code)}</div>` : ""}
        ${G.mode === "cpu" ? `<label class="row cpuspd" style="gap:8px">CPUの速さ<select data-cpuspd aria-label="CPUの速さ">${Object.entries(CPU_SPD).map(([k, v]) => `<option value="${k}"${cpuSpd() === k ? " selected" : ""}>${v[1]}</option>`).join("")}</select></label>` : ""}
      </div>
      ${G.test ? testBoxHTML(st, pm) : ""}
      <div class="box">
        <h3>手動で効果を処理</h3>
        <div class="adj">
          <span>自分のLP</span><div class="seg">${[-100, -50, 50, 100].map(d => `<button data-adj="me" data-d="${d}" ${st.winner ? "disabled" : ""}>${d > 0 ? "+" : "−"}${Math.abs(d)}</button>`).join("")}</div>
          <span>相手のLP</span><div class="seg">${[-100, -50, 50, 100].map(d => `<button data-adj="op" data-d="${d}" ${st.winner ? "disabled" : ""}>${d > 0 ? "+" : "−"}${Math.abs(d)}</button>`).join("")}</div>
        </div>
        <div class="row" style="margin-top:10px"><button class="small" data-act="draw" ${st.winner ? "disabled" : ""}>1枚引く</button><button class="small" data-act="graveHand" ${st.winner ? "disabled" : ""}>墓地から手札へ</button></div>
        <label class="row" style="gap:6px;margin-top:8px;cursor:pointer;flex-wrap:nowrap;align-items:center"><input type="checkbox" style="flex:none;width:auto" data-manualtog ${manualOn() ? "checked" : ""}> 場のカードに手動ボタン（ATK±・墓地へ送る）を出す</label>
        <div class="row" style="margin-top:8px"><button class="small danger" data-act="surrender" ${st.winner ? "disabled" : ""}>${G.surArm ? "本当に投了" : "投了"}</button><button class="small ghost" data-act="leave">ぬける</button></div>
      </div>
      <div class="box"><h3>ログ</h3><ul class="log">${logHTML}</ul></div>
    </aside>
  </div>`;
  renderDetail(currentDetail());
  playEvents(prev, { me: pm.lp, op: po.lp });
}

/* ================= animations ================= */
const reduceMotion = (() => { try{ return matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return false; } })();
const sideOf = s => s === G.slot ? "me" : "op";
const zoneEl = (s, kind, i) => document.querySelector(`#board [data-z="${kind}"][data-s="${sideOf(s)}"][data-i="${i}"]`);
const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
function fxEl(cls, html, x, y){
  const d = document.createElement("div"); d.className = "fxa " + cls; d.innerHTML = html;
  if (x != null){ d.style.left = x + "px"; d.style.top = y + "px"; }
  document.body.appendChild(d);
  d.addEventListener("animationend", () => d.remove());
  setTimeout(() => d.remove(), 2500);
  return d;
}
function burst(el, text){ if (!el) return; const c = center(el); fxEl("fxburst", `<span>${text}</span>`, c.x, c.y); }
function spark(x, y){ fxEl("fxspark", "", x, y); }
function playEvents(prevLp, nowLp){
  if (!G || !G.st) return;
  const st = G.st, seen = G.evSeen == null ? (st.evn || 0) : G.evSeen;
  const list = (st.ev || []).filter(e => e.n > seen);
  G.evSeen = st.evn || 0;
  for (const k of ["me", "op"]){
    if (prevLp && prevLp[k] != null && nowLp[k] !== prevLp[k]){
      const el = [...document.querySelectorAll(`[data-lp="${k}"]`)].find(x => x.offsetParent) || document.getElementById("lp-" + k); if (!el) continue;
      const c = center(el), d = nowLp[k] - prevLp[k];
      setTimeout(() => fxEl("fxfloat " + (d < 0 ? "neg" : "pos"), (d > 0 ? "+" : "−") + Math.abs(d), c.x, c.r.top), reduceMotion ? 0 : list.length * 200);
    }
  }
  if (reduceMotion) return;
  // one after another: a spell banner gets time to show before its hits, each hit gets its own beat (ツインストライク → 2 hits)
  const GAP = { spell: 900, attack: 560, hit: 420, fusion: 2800 };
  let t = 0;
  list.forEach(e => { setTimeout(() => { try{ animateEvent(e); }catch(err){} }, t); t += GAP[e.type] || 320; });
}
// 融合召喚の演出: 素材がうずを巻いて中心に吸いこまれ、光って、融合モンスターが現れる
function fusionFx(e){
  document.querySelectorAll(".fxa.fxspell").forEach(x => x.remove());
  const mats = (e.mats || []).slice(0, 6), small = innerWidth < 640, w = small ? 78 : 112, R = small ? 120 : 220;
  const box = document.createElement("div"); box.className = "fxfusion"; box.setAttribute("aria-hidden", "true");
  box.innerHTML = `<div class="ff-bg"></div><div class="ff-swirl"></div>${mats.map(id => `<div class="ff-mat">${cardHTML(card(id), "", "", mOpt(e.s))}</div>`).join("")}<div class="ff-flash"></div><div class="ff-res"><div class="ff-lbl">融合召喚！</div>${cardHTML(card(e.c), "", "", mOpt(e.s))}</div>`;
  document.body.appendChild(box);
  box.querySelectorAll(".ff-mat .card").forEach(c => c.style.setProperty("--w", w + "px"));
  const T = 2700, bg = box.querySelector(".ff-bg"), sw = box.querySelector(".ff-swirl"), fl = box.querySelector(".ff-flash"), res = box.querySelector(".ff-res");
  bg.animate([{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: T, fill: "forwards" });
  sw.animate([{ opacity: 0, transform: "translate(-50%,-50%) rotate(0) scale(.6)" }, { opacity: .9, offset: .2 }, { opacity: .9, transform: "translate(-50%,-50%) rotate(540deg) scale(1)", offset: .42 }, { opacity: 0, transform: "translate(-50%,-50%) rotate(720deg) scale(.2)", offset: .5 }, { opacity: 0 }], { duration: T, fill: "forwards" });
  box.querySelectorAll(".ff-mat").forEach((m, k) => {
    const a0 = (Math.PI * 2 * k) / mats.length - Math.PI / 2, x0 = Math.cos(a0) * R, y0 = Math.sin(a0) * R * .7, a1 = a0 + Math.PI * 1.2, x1 = Math.cos(a1) * R * .45, y1 = Math.sin(a1) * R * .3;
    m.animate([
      { opacity: 0, transform: `translate(-50%,-50%) translate(${x0 * 1.3}px,${y0 * 1.3}px) scale(.8)` },
      { opacity: 1, transform: `translate(-50%,-50%) translate(${x0}px,${y0}px) scale(1)`, offset: .12 },
      { opacity: 1, transform: `translate(-50%,-50%) translate(${x0}px,${y0}px) scale(1)`, offset: .2 },
      { opacity: 1, transform: `translate(-50%,-50%) translate(${x1}px,${y1}px) rotate(200deg) scale(.7)`, offset: .34 },
      { opacity: 0, transform: `translate(-50%,-50%) rotate(420deg) scale(.1)`, offset: .44 },
      { opacity: 0 }
    ], { duration: T, easing: "ease-in", fill: "forwards" });
  });
  fl.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.1)" }, { opacity: 0, offset: .4 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .47 }, { opacity: 0, transform: "translate(-50%,-50%) scale(2.6)", offset: .62 }, { opacity: 0 }], { duration: T, fill: "forwards" });
  res.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 0, offset: .46 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.12)", offset: .56 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .64 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .88 }, { opacity: 0, transform: "translate(-50%,-50%) scale(1.05)" }], { duration: T, easing: "ease-out", fill: "forwards" });
  setTimeout(() => box.remove(), T + 80);
}
function animateEvent(e){
  if (!G) return;
  if (e.type === "summon" || e.type === "equip"){
    const el = zoneEl(e.s, "mz", e.z); if (!el) return;
    if (e.type === "summon") el.animate([{ transform: "translateY(-46px) scale(1.3) rotate(-4deg)", opacity: 0 }, { transform: "translateY(4px) scale(.96)", opacity: 1, offset: .65 }, { transform: "none", opacity: 1 }], { duration: 480, easing: "ease-out" });
    else el.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.6) drop-shadow(0 0 10px #57d1b6)" }, { filter: "brightness(1)" }], { duration: 600 });
    const c = center(el); fxEl(e.type === "summon" ? "fxring" : "fxring eq", "", c.x, c.y);
  }
  if (e.type === "attack"){
    const a = zoneEl(e.s, "mz", e.from);
    const t = e.to === "direct" ? (sideOf(e.s) === "me" ? document.querySelector("#board .ohand") : document.querySelector("#board .hand")) : zoneEl(e.s === "a" ? "b" : "a", "mz", e.to);
    if (!a || !t) return;
    const ca = center(a), ct = center(t), dx = (ct.x - ca.x) * .78, dy = (ct.y - ca.y) * .78;
    // a ghost copy flies, so the lunge still shows even if the attacker is already destroyed
    const g = fxEl("fxghost", cardHTML(card(e.c), "", "", mOpt(e.s)), ca.r.left, ca.r.top);
    g.firstChild.style.setProperty("--w", ca.r.width + "px");
    g.animate([{ transform: "none" }, { transform: `translate(${dx * .15}px,${dy * .15 - 14}px) scale(1.12) rotate(-6deg)`, offset: .25 }, { transform: `translate(${dx}px,${dy}px) scale(1.08)`, offset: .55 }, { transform: "none" }], { duration: 640, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => g.remove();
    setTimeout(() => { spark(ct.x, ct.y); t.animate([{ transform: "none" }, { transform: "translateX(-6px) rotate(-2deg)" }, { transform: "translateX(6px) rotate(2deg)" }, { transform: "none" }], { duration: 260 }); }, 340);
  }
  if (e.type === "destroy") burst(zoneEl(e.s, e.k || "mz", e.z), e.k === "sz" ? "破壊！" : "撃破！");
  if (e.type === "hit"){
    const el = e.z != null ? zoneEl(e.s, "mz", e.z) : document.querySelector(sideOf(e.s) === "me" ? "#board .hand" : "#board .ohand");
    if (!el) return;
    const c = center(el), y = e.z != null ? c.y : c.y - 10;
    if (e.d > 0){ spark(c.x + (Math.random() * 30 - 15), y); el.animate([{ transform: "none" }, { transform: "translateX(-7px) rotate(-1.5deg)" }, { transform: "translateX(7px) rotate(1.5deg)" }, { transform: "none" }], { duration: 240 }); }
    fxEl("fxhit" + (e.d > 0 ? "" : " blk"), `${e.d > 0 ? "−" + e.d : "0"}${e.blk ? `<small>ブロック −${e.blk}</small>` : ""}`, c.x, y - 20);
  }
  if (e.type === "spell"){
    const c = card(e.c), t = cardType(c);
    const label = t === "trap" ? "罠発動！" : isQuick(c) ? "速攻魔法！" : t === "equip" ? "装備！" : "魔法発動！";
    fxEl("fxspell " + (sideOf(e.s) === "me" ? "mine" : "theirs"), `<div class="lbl">${label}</div>${cardHTML(c, "lg", "", mOpt(e.s))}`);
  }
  if (e.type === "fusion") fusionFx(e);
  if (e.type === "counter") fxEl("fxstamp", "打ち消し！");
  if (e.type === "roll") fxEl("fxstamp roll", e.kind === "die" ? `<span class="die-face">${e.v}</span><small>サイコロ${e.faces && e.faces !== 6 ? `（${e.faces}面）` : ""}</small>` : `<span class="coin-face ${e.v ? "h" : "t"}">${e.v ? "表" : "裏"}</span><small>コイントス</small>`);
  if (e.type === "gain"){
    const mine = sideOf(e.s) === "me", who = mine ? "" : "相手が";
    if (e.what === "card"){ const c = card(e.c); fxEl("fxspell " + (mine ? "mine" : "theirs"), `<div class="lbl">${who}カード獲得！</div>${cardHTML(c, "", "", mOpt(e.s))}`); return; }
    const d = e.what === "potion" ? potionDef(e.k) : relicDef(e.k); if (!d) return;
    fxEl("fxgain " + (mine ? "mine" : "theirs"), `<div class="lbl">${who}${e.what === "potion" ? "ポーション" : "レリック"}獲得！</div>${d.img ? `<img alt="" src="${d.img}">` : `<span class="gi">${e.what === "potion" ? "🧪" : "🏺"}</span>`}<b>${esc(d.name)}</b>`);
  }
  if (e.type === "blast") fxEl("fxstamp blast", `自爆！<small>ATK${fmtN(e.x)}以下を破壊</small>`);
}

/* ================= card detail panel ================= */
function detailInfo(z, s, i){
  if (!G || !G.st || !G.st.started) return null;
  const owner = s === "me" ? G.slot : O(G.slot), X = P(G.st, owner);
  if (z === "hand" && G.spectate) return null;
  if (z === "hand") return X.hand[i] ? { id: X.hand[i], where: "手札", mana: !!X.mana } : null;
  const slot = X[z] && X[z][i]; if (!slot) return null;
  if (z === "sz" && (s === "op" || G.spectate) && !slot.face) return { hidden: true, sleeve: X.sleeve };
  const info = { mana: !!X.mana, id: slot.c, mod: z === "mz" ? modOf(slot) : 0, attacked: slot.attacked, where: z === "mz" ? (s === "me" ? "自分の場" : "相手の場") : (slot.face ? "魔法・罠ゾーン" : "セット中"), setTurn: z === "sz" ? slot.turn : null };
  if (z === "mz"){
    const es = eqsOf(slot);
    info.equips = es.map((e, k) => `「${card(e.c).name}」${eqMult(es, k) > 1 ? "（×2）" : ""}${e.o !== owner ? "（相手の）" : ""}${e.used ? "（使用ずみ）" : ""}`);
    info.cap = `${eqUsed(slot)} / ${eqCapOf(card(slot.c))}`;
    info.mats = (slot.mats || []).map(id => card(id).name); info.xbFx = (slot.xb || []).filter(b => b.xfr); info.xbNo = (slot.xb || []).filter(b => !b.xfr);
    info.abs = [...new Set(monAbs(G.st, owner, i).filter(a => a.eqU).map(a => ABS[a.k].text && ABS[a.k].n ? ABS[a.k].text((a.n || 0) * a.mult, a.name || "") : ABS[a.k].label))];
    info.eqList = es.map((e, k) => ({ c: e.c, mult: eqMult(es, k), used: !!e.used, opp: e.o !== owner, mana: !!P(G.st, e.o).mana }));
    if (charmActive(G.st, slot)) info.charm = `魅了されている（「${card(slot.charm.c).name}」）`;
  }
  return info;
}
function currentDetail(){
  if (!G || !G.lastDetail) return null;
  if (G.lastDetail[0] === "id") return { id: G.lastDetail[1], where: G.lastDetail[2] || "墓地" };
  return detailInfo(...G.lastDetail);
}
const CLOSE = `<button class="x ghost" data-popclose aria-label="とじる">×</button>`;
function openDetail(key, keepBack){ if (!G) return; const was = G.detailOpen; if (!keepBack) G.detailBack = null; G.lastDetail = key; G.detailOpen = true; renderDetail(currentDetail(), !was); }
{
  const host = t => t && t.closest && t.closest(".detailcard, .cv-card");
  const tilt = (el, x, y) => { const card = el.querySelector(".card"); if (!card) return; const r = el.getBoundingClientRect(), px = Math.max(0, Math.min(1, (x - r.left) / r.width)), py = Math.max(0, Math.min(1, (y - r.top) / r.height));
    card.style.transform = `perspective(700px) rotateY(${(px - .5) * 22}deg) rotateX(${(.5 - py) * 22}deg) scale(1.03)`; card.style.setProperty("--hx", (px * 100).toFixed(1) + "%"); card.style.setProperty("--hy", (py * 100).toFixed(1) + "%"); card.style.setProperty("--ha", (.35 + Math.hypot(px - .5, py - .5)).toFixed(2)); card.classList.add("tilting"); };
  const reset = el => { const card = el && el.querySelector(".card"); if (!card) return; card.style.transform = ""; card.classList.remove("tilting"); ["--hx", "--hy", "--ha"].forEach(k => card.style.removeProperty(k)); };
  let cur = null;
  const reduce = (() => { try{ return matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return false; } })();
  document.addEventListener("pointermove", e => { if (reduce) return; const h = host(e.target); if (cur && cur !== h) reset(cur); cur = h; if (h) tilt(h, e.clientX, e.clientY); }, { passive: true });
  document.addEventListener("pointerleave", () => { reset(cur); cur = null; });
  document.addEventListener("pointerup", e => { if (e.pointerType !== "mouse"){ reset(cur); cur = null; } });
}
function renderDetail(info, anim){
  const box = $("#detailPop"); if (!box) return;
  if (!G || !G.detailOpen || !info){ box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false; box.classList.toggle("anim", !!anim); box.classList.toggle("at-bottom", !!G.detailBottom);
  if (info.hidden){ box.innerHTML = `${CLOSE}<h3>カード詳細</h3><div class="detailcard">${backHTML("detail", "", info.sleeve)}</div><p class="note" style="margin:0">相手がセットしたカード。中身はひみつ。</p>`; return; }
  const c = card(info.id), t = cardType(c), ft = fxText(c), lim = cardLimit(c);
  const rows = [["種類", isQuick(c) ? "速攻魔法（相手のターンにも使える）" : typeLabel(c)]];
  if (hasCost(c) && info.mana !== false) rows.push(["コスト", String(costLabel(c))]);
  if (!c.starter) rows.push(["使えるデッキ", DECK_LABEL[deckModeOf(c)]]);
  if (t === "monster"){
    const base = baseAtk(c), now = Math.max(0, base + (info.mod || 0));
    rows.push(["ATK", info.mod ? `${fmtN(now)}（もとは ${fmtN(base)}、${info.mod > 0 ? "+" : ""}${info.mod}）` : fmtN(base)]);
  }
  if (t === "equip"){ const et = eqText(c); if (et) rows.push(["装備の効果", et]); rows.push(["装備コスト", String(eqCostOf(c))]); }
  if (info.eqTo) rows.push(["装備先", info.eqTo]);
  if (info.cap) rows.push(["装備キャパ", info.cap]);

  if (info.charm) rows.push(["状態", info.charm]);
  if (info.mats && info.mats.length) rows.push(["質量", `${info.mats.length}枚：${info.mats.map(n => `「${n}」`).join("")}`]);
  if (info.abs && info.abs.length) rows.push(["装備でついた能力", info.abs.join("／")]);
  if (ft) rows.push([freeText(c) ? "本来の効果" : "自動の効果", ft]);
  if (c.effect) rows.push([ft || monAbsText(c) || (t === "equip" && eqText(c)) ? "カードの文" : "効果", plainRuby(c.effect)]);
  if (c.flavor) rows.push(["フレーバー", plainRuby(c.flavor)]);
  if (t === "monster" && monAbsText(c)) rows.push(["能力（もとから）", monAbsText(c)]);
  if (!ft && !c.effect && t !== "equip" && !absOf(c).length) rows.push(["効果", "なし"]);
  if (c.modded && c.modOf) rows.push(["書きかえ", `もとのカードは「${card(c.modOf).name}」`]);
  rows.push(["場所", info.where || "—"]);
  if (info.attacked) rows.push(["状態", "このターンは攻撃ずみ"]);
  if (t === "trap" && info.setTurn != null) rows.push(["発動", info.setTurn < G.st.turnNo ? "いま発動できる" : "次のターンから発動できる"]);
  rows.push(["デッキ上限", lim ? `${lim}枚まで` : "制限なし"]);
  if (tagsOf(c).length) rows.push(["タグ", tagsOf(c).map(t => "#" + t).join(" ")]);
  rows.push(["作った人", c.author || "？"]);
  // 合成でついた効果: カードの効果の下に、同じ枠の行で（アイコンがないカードからついた効果はアイコンなしの行）
  const xbIn = (info.xbFx && info.xbFx.length ? fxRowsHTML({ ...c, blocks: info.xbFx }, true) : "") + (info.xbNo && info.xbNo.length ? fxRowsHTML({ ...c, blocks: info.xbNo }, true, true) : "");
  const xbFx = xbIn ? `<div class="fxr-big fxr-xb"><div class="fxr-ttl">合成でついた効果</div>${xbIn}</div>` : "";
  const ownFx = c.fxRows && !freeText(c) ? `<div class="fxr-big">${fxRowsHTML(c)}</div>` : "";
  // equips stuck on this monster, shown as cards from left to right (tap one to read it)
  const eqRow = info.eqList && info.eqList.length ? `<div class="eqrow"><div class="eqlbl">装備（左から順）　${esc(info.cap || "")}</div><div class="eqlist">${info.eqList.map((e, k) => `${k ? `<span class="eqarr">→</span>` : ""}<button class="eqi" data-eqcid="${esc(e.c)}" aria-label="「${esc(card(e.c).name)}」の詳細">${cardHTML(card(e.c), "xs", "", { mana: e.mana })}${e.mult > 1 || e.used || e.opp ? `<span class="eqtag">${[e.mult > 1 ? "×2" : "", e.used ? "使用ずみ" : "", e.opp ? "相手の" : ""].filter(Boolean).join("・")}</span>` : ""}</button>`).join("")}</div></div>` : "";
  const back = G.detailBack ? `<button class="small ghost eqback" data-detailback>← もどる</button>` : "";
  box.innerHTML = `${CLOSE}<h3>カード詳細</h3>${back}<div class="detailcard">${cardHTML(c, "detail", "", { mod: info.mod, mana: info.mana })}</div>${eqRow}${ownFx}${xbFx}<dl class="dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${tkLink(esc(v))}</dd>`).join("")}</dl>${actDetail(c)}`;
}
// 詳細: 起動効果を持つ自分の場のモンスターなら「発動する」
function actDetail(c){
  const k = G.lastDetail, fm = k && k[0] === "mz" ? P(G.st, k[1] === "me" ? G.slot : O(G.slot)).mz[+k[2]] : null; if (fm) c = monCard(fm); if (!hasTrig(c, "act")) return "";
  const tx = blocksOf(c).filter(b => b.trig === "act").map(b => blockText(c, b)).join("。");
  const mineF = k && k[0] === "mz" && k[1] === "me" && !G.spectate, why = mineF ? actWhy(G.st, G.slot, +k[2]) : "", mm = mineF ? P(G.st, G.slot).mz[+k[2]] : null;
  return `<div class="act-detail"><div class="act-h">${ACT_ICON}<b>起動効果</b></div><p>${tkLink(esc(tx))}</p>${mineF ? `${mm ? `<p class="muted">${esc(actLeftText(G.st, G.slot, mm))}</p>` : ""}<button class="primary" data-actmon="${+k[2]}" ${why ? "disabled" : ""}>発動する${why ? `（${esc(why)}）` : ""}</button>` : `<p class="muted">場に出ているとき、自分のターンに使える</p>`}</div>`;
}
$("#overlay").addEventListener("click", e => {
  if (!G || G.actAsk == null) return;
  if (e.target.closest("[data-actno]")){ G.actAsk = null; renderAll(); return; }
  const go = e.target.closest("[data-actgo]"); if (go && !go.disabled){ const i = G.actAsk, bi = go.dataset.actgo; G.actAsk = null; act(st => activateMon(st, G.slot, i, bi === "" ? null : +bi)); }
});
$("#detailPop").addEventListener("click", e => {
  if (!G) return;
  { const am = e.target.closest("[data-actmon]"); if (am){ e.stopPropagation(); G.actAsk = +am.dataset.actmon; G.detailOpen = false; renderDetail(null); renderAll(); return; } }
  if (e.target.closest("[data-popclose]")){ G.detailOpen = false; G.detailBack = null; renderDetail(null); return; }
  const q = e.target.closest("[data-eqcid]");
  if (q){ e.stopPropagation(); const prev = G.lastDetail; G.detailBack = prev; openDetail(["id", q.dataset.eqcid, "装備中（" + card(prev && prev[0] !== "id" ? (detailInfo(...prev) || {}).id : "").name + "に付いている）"], true); return; }
  if (e.target.closest("[data-detailback]") && G.detailBack){ e.stopPropagation(); const b = G.detailBack; G.detailBack = null; openDetail(b, true); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && G && G.detailOpen){ G.detailOpen = false; renderDetail(null); } });
// close the popup when clicking anywhere except the popup itself or another card
document.addEventListener("click", e => {
  if (!G || !G.detailOpen) return;
  const t = e.target;
  if (t.closest && (t.closest("#detailPop") || t.closest(".card[data-z]") || t.closest("[data-cid]") || t.closest("[data-cname]"))) return;
  G.detailOpen = false; renderDetail(null);
});

// floating buttons for the battle screen: 「選択にもどる」 (after 盤面を見る) and the menu toggle on phones
function battleChrome(peekOn){
  let pb = $("#ovBack"); if (!pb){ pb = document.createElement("button"); pb.id = "ovBack"; pb.className = "primary"; pb.textContent = "◀ 選択にもどる"; pb.hidden = true; pb.addEventListener("click", () => { if (G) G.ovHide = false; renderAll(); }); document.body.appendChild(pb); }
  pb.hidden = !peekOn;
  const inB = !!(G && G.st && G.st.started && S.tab === "play");
  document.body.classList.toggle("in-battle", inB);
  let nb = $("#navTog"); if (!nb){ nb = document.createElement("button"); nb.id = "navTog"; nb.className = "ghost"; nb.textContent = "≡ メニュー"; nb.addEventListener("click", () => document.body.classList.toggle("navopen")); document.body.appendChild(nb); }
  nb.hidden = !inB; if (!inB) document.body.classList.remove("navopen");
}
function renderOverlay(){
  const ov = $("#overlay");
  if (!G || !G.st || !G.st.started || S.tab !== "play"){ ov.hidden = true; ov.innerHTML = ""; battleChrome(false); return; }
  const st = G.st, me = G.slot;
  let html = "", peek = false;
  const myP = !G.spectate && st.players && st.players[me], rp = myP && !st.winner ? myP.relicPick : null;
  if (G.actAsk != null && (st.winner || G.spectate || actWhy(st, me, G.actAsk))) G.actAsk = null;
  if (G.actAsk != null){
    const m = P(st, me).mz[G.actAsk], c = card(m.c), L = actBlocks(st, me, m);
    const rowsH = L.map(([b, bi]) => { const ok = actFree(st, me, m, c, bi, b); return `<div class="act-opt"><p>${tkLink(esc(blockText(c, b)))}</p><button class="primary" data-actgo="${bi}" ${ok ? "" : "disabled"}>${ok ? "発動する" : "もう使えない"}</button></div>`; }).join("");
    html = `<div class="box act-ask"><h2 style="margin:0">「${esc(c.name)}」の能力を発動しますか？</h2><div class="act-prev">${cardHTML(c, "sm", "", { mod: modOf(m), ...mOpt(me) })}<div class="act-opts">${rowsH}</div></div><p class="muted" style="margin:0">${esc(actLeftText(st, me, m))}</p><div class="row"><button class="ghost" data-actno>やめる</button></div></div>`;
  } else if (rp === "sprout"){
    const L = [...myP.deck.map((id, i) => ["deck:" + i, id]), ...myP.hand.map((id, i) => ["hand:" + i, id])].sort((a, b) => card(a[1]).name.localeCompare(card(b[1]).name, "ja"));
    const list = L.map(([k, id]) => cardHTML(card(id), "sm pick", `data-sprout="${k}" tabindex="0" role="button"`, mOpt(me))).join("");
    html = `<div class="box"><h2 style="margin:0">若葉：変えるカードをえらぶ</h2><p class="muted" style="margin:0">デッキの${L.length}枚からえらんだ1枚が、ランダムなスパイア風カードに変わります（手札はこのあと引きます）</p><div class="gallery">${list || '<p class="muted">カードがありません</p>'}</div></div>`;
  } else if (Array.isArray(rp)){
    html = `<div class="box"><h2 style="margin:0">ネオーの祝福：レリックを1つえらぶ</h2><p class="muted" style="margin:0">スパイアデッキのはじまりに、どれか1つだけ手に入る</p><div class="relic-pick">${rp.map(k => [k, relicDef(k)]).filter(x => x[1]).map(([k, d]) => `<button data-relic="${esc(k)}">${d.img ? `<img class="rl-img" alt="" src="${d.img}">` : ""}<b>${esc(d.name)}</b>${esc(d.text)}</button>`).join("")}</div></div>`;
  } else if (st.askQ && st.askQ.ans == null && st.askQ.to === me && !G.spectate && !st.winner){
    const aq = st.askQ;
    html = `<div class="box"><h2 style="margin:0">${esc(P(st, aq.by).name)} の「${esc(aq.name)}」からの質問</h2><p style="margin:0;font-size:18px;font-weight:700">${esc(aq.text)}</p><p class="muted" style="margin:0">あなたの答えで相手のカードの効果が変わります</p><div class="row"><button class="primary" data-askq="yes">はい</button><button data-askq="no">いいえ</button><button class="ghost" data-peek>盤面を見る</button></div></div>`; peek = true;
  } else if (G.fusPick && !st.winner){
    const f = G.fusPick, fc = card(f.target), X = P(st, f.q.s);
    const cand = [...X.hand.map((id, i) => ({ k: "hand:" + i, id, where: "手札" })), ...X.mz.map((m, i) => m ? { k: "mz:" + i, id: m.c, where: "場", m } : null).filter(Boolean)].filter(x => fc.fusion.some(y => fusionMatOk(x.id, y)));
    const picks = f.picked.map(k => { const [from, i] = k.split(":"); return { from, i: +i }; }), ok = picks.length === f.need && !!fusionPlanFrom(st, f.q.s, fc, picks);
    const item = x => `<div class="g-item">${cardHTML(card(x.id), "sm pick" + (f.picked.includes(x.k) ? " sel" : ""), `data-fpick="${x.k}" tabindex="0" role="button" aria-pressed="${f.picked.includes(x.k)}"`, x.m ? { mod: modOf(x.m), ...mOpt(f.q.s) } : mOpt(f.q.s))}<div class="meta">${x.where}</div></div>`;
    const hd = cand.filter(x => x.where === "手札"), fd = cand.filter(x => x.where === "場");
    html = `<div class="box"><h2 style="margin:0">「${esc(fc.name)}」の素材をえらぶ</h2><div class="fus-need"><span class="note">必要な素材：</span>${fc.fusion.map(x => `<span class="chip">${esc(fusionMatText(x))}</span>`).join("<span>＋</span>")}</div>${hd.length ? `<h3 style="margin:0">手札</h3><div class="gallery">${hd.map(item).join("")}</div>` : ""}${fd.length ? `<h3 style="margin:0">自分の場</h3><div class="gallery">${fd.map(item).join("")}</div>` : ""}<p class="${ok || f.picked.length < f.need ? "muted" : "warn"}" style="margin:0">${f.picked.length} / ${f.need} 枚えらんだ${f.picked.length === f.need && !ok ? "（この組み合わせでは素材がそろわない）" : ""}</p><div class="row acts-sticky"><button class="primary" data-fgo ${ok ? "" : "disabled"}>融合する！</button><button class="ghost" data-fback>融合モンスターをえらびなおす</button><button class="ghost" data-peek>盤面を見る</button></div></div>`;
    peek = true;
  } else if (G.chooseQ.length && G.chooseQ[0].ask){
    const q = G.chooseQ[0];
    const yesTxt = q.yesTxt || (q.pick1 ? "" : q.block ? effsText(q.c, q.block.b.then) + (q.block.b.else.length ? `／「いいえ」なら：${effsText(q.c, q.block.b.else)}` : "") : KINDS[q.fx.kind].text(q.fx.n));
    html = `<div class="box"><h2 style="margin:0">${q.to ? `${esc(P(st, q.s).name)} の「${esc(q.c.name)}」からの質問` : `「${esc(q.c.name)}」`}</h2><p style="margin:0;font-size:18px;font-weight:700">${esc(q.fx.ask)}</p>${q.pick1 ? `<div class="p1list">${q.pick1.map((o, k) => `<button type="button" class="p1" data-p1="${k}"><b>【${esc(o.name)}】</b><span>${esc(o.text)}</span></button>`).join("")}</div><div class="row">` : `<p class="muted" style="margin:0">${q.to ? "相手のカードの効果" : ""}「はい」なら：${esc(yesTxt)}</p><div class="row"><button class="primary" data-ask="yes">はい</button><button data-ask="no">いいえ</button>`}<button class="ghost" data-peek>盤面を見る</button></div></div>`; peek = true;
  } else if (G.chooseQ.length){
    const q = G.chooseQ[0], TS = q.ctx && q.ctx.side === "me" ? q.s : O(q.s), opts = (targetOptions(st, q.s, q.fx.kind, q.ctx) || []).filter(o => !(q.fx.distinct && q.ctx.hit && (q.ctx.hit.picked || []).includes(String(o))));
    const t = KINDS[q.fx.kind].target;
    const list = opts.map(o => {
      if (t === "deckTop") return cardHTML(card(P(st, q.s).deck[o]), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, mOpt(q.s));
      if (t === "grave" || t === "draft" || t === "graveAny" || t === "tagPick" || t === "deckType" || t === "oppGrave") return cardHTML(card(o), "sm pick", `data-opt="${esc(o)}" tabindex="0" role="button"`, mOpt(q.s));
      if (t === "hand") return cardHTML(card(P(st, q.s).hand[o]), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, mOpt(q.s));
      if (t === "oppHand") return cardHTML(card(P(st, O(q.s)).hand[o]), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, mOpt(O(q.s)));
      if (t === "szOpp"){ const X = P(st, O(q.s)), z = X.sz[o]; return `<div class="g-item">${z.face ? cardHTML(card(z.c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, mOpt(O(q.s))) : backHTML("sm pick", `data-opt="${o}" tabindex="0" role="button"`, X.sleeve)}<div class="meta">${z.face ? "表向き" : "セット中"}</div></div>`; }
      if (t === "any"){ const [os, oi] = o.split(":"), m = P(st, os).mz[+oi]; return `<div class="g-item">${cardHTML(card(m.c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, { mod: modOf(m), ...mOpt(os) })}<div class="meta">${os === me ? "自分" : "相手"}</div></div>`; }
      if (o === "p"){ const X = P(st, TS); return `<button class="pick-player" data-opt="p">${esc(X.name)}<br><small>LP ${X.lp}${X.block ? `・ブロック ${X.block}` : ""}</small></button>`; }
      if (typeof o === "string" && o.startsWith("m:")){ const i = +o.slice(2), m = P(st, TS).mz[i]; return cardHTML(card(m.c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, { mod: modOf(m), ...mOpt(TS) }); }
      const X = t === "opp" ? P(st, TS) : P(st, q.s);
      return cardHTML(card(X.mz[o].c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, { mod: modOf(X.mz[o]), ...mOpt(t === "opp" ? TS : q.s) });
    }).join("");
    html = `<div class="box"><h2 style="margin:0">「${esc(q.c.name)}」${q.fx.kind === "discardPeek" ? "：相手の手札から捨てさせるカードをえらぶ" : q.fx.kind === "scry" ? "：山札の一番上に置くカードをえらぶ（のこりは一番下へ）" : /^search/.test(q.fx.kind) ? "：山札から手札に加えるカードをえらぶ" : "の対象をえらぶ"}</h2><p class="muted" style="margin:0">${esc(q.ctx.spireAtk ? fxText0(q.c) : KINDS[q.fx.kind].text(q.fx.n))}</p><div class="gallery">${list || '<p class="muted">対象がいません</p>'}</div><div class="row"><button class="ghost" data-close="choose">使わない</button><button class="ghost" data-peek>盤面を見る</button></div></div>`; peek = true;
  } else if (G.costPick && !st.winner){
    const cp = G.costPick, pm = P(st, me), L = pm.hand.map((id, j) => j).filter(j => j !== cp.hi && (!cp.tag || hasTag(pm.hand[j], cp.tag)));
    const list = L.map(j => { const on = cp.picked.includes(j); return cardHTML(card(pm.hand[j]), `sm pick ${on ? "sel" : ""}`, `data-cpick="${j}" tabindex="0" role="button" aria-pressed="${on}"`, mOpt(me)); }).join("");
    html = `<div class="box"><h2 style="margin:0">「${esc(cp.name)}」のコスト</h2><p class="muted" style="margin:0">捨てる手札を${cp.need}枚えらんでね（${cp.picked.length} / ${cp.need}）</p><div class="gallery">${list}</div><div class="row"><button class="primary" data-cpgo ${cp.picked.length === cp.need ? "" : "disabled"}>捨てて使う</button><button class="ghost" data-close="costpick">やめる</button></div></div>`;
  } else if (st.pending && st.pending.wait && st.pending.by !== me && !st.winner && !G.spectate){
    const pd = st.pending, A = P(st, pd.by);
    const win = chainWindow(st);
    const opts = responseOptions(st, me, win);
    const rs = G.respSel ? opts.find(o => `${o.from}:${o.i}` === G.respSel) : null; if (G.respSel && !rs) G.respSel = null;
    const list = opts.map(o => { const k = `${o.from}:${o.i}`; return `<div class="g-item">${cardHTML(o.c, "sm pick" + (G.respSel === k ? " sel" : ""), `data-resp="${k}" tabindex="0" role="button"`, mOpt(me))}<div class="meta">${o.from === "hand" ? "手札から" : o.from === "eq" ? "装備の力" : "セット中"}</div></div>`; }).join("");
    let head, msg, focus = null;
    if (win === "attack"){
      const am = A.mz[pd.from];
      const tgt = pd.to === "direct" ? "あなたに直接攻撃" : `「${card(P(st, me).mz[pd.to]?.c).name}」に攻撃`;
      head = "攻撃されています！"; msg = `${A.name} の「${am ? card(am.c).name : "？"}」（ATK ${am ? fmtN(atkOf(am)) : 0}）が${tgt}してきた。罠か速攻魔法を使う？`;
      if (am) focus = { id: am.c, mod: modOf(am), s: pd.by, lbl: `攻撃してきたモンスター（ATK ${fmtN(atkOf(am))}）` };
    } else if (win === "end"){ head = `${A.name} がターンを終えようとしています`; msg = "ターンが変わる前に、速攻魔法か罠を使う？"; }
    else if (win === "summoned"){ const sm = A.mz[pd.z]; head = `「${sm ? card(sm.c).name : "？"}」が${pd.special ? "特殊召喚" : "召喚"}された！`; msg = "「相手がモンスターを召喚・特殊召喚したとき」のカードを使う？"; if (sm) focus = { id: sm.c, mod: modOf(sm), s: pd.by, lbl: "出てきたモンスター" }; }
    else {
      const top = st.chain[st.chain.length - 1];
      head = top.summon ? `「${card(top.c).name}」が${top.special ? "特殊召喚" : "召喚"}されようとしている！` : `「${card(top.c).name}」が発動された！`;
      msg = "罠か速攻魔法でチェーンする？（あとから発動したものから順に処理されます）";
      focus = { id: top.c, s: top.s, lbl: top.summon ? "召喚しようとしているモンスター" : `${top.s === me ? "あなた" : esc(P(st, top.s).name)} が発動したカード` };
    }
    const fHTML = focus ? `<div class="resp-focus">${cardHTML(card(focus.id), "sm pick", `data-cid="${esc(focus.id)}" tabindex="0" role="button"`, { mod: focus.mod || 0, ...mOpt(focus.s) })}<div class="rf-txt"><span class="rf-lbl">${focus.lbl}</span><b>「${esc(card(focus.id).name)}」</b><p>${tkLink(esc(fxText(card(focus.id)) || plainRuby(card(focus.id).effect || "") || "効果なし"))}</p><span class="note">カードを押すとくわしく見られます</span></div></div>` : "";
    const chainHTML = st.chain && st.chain.length ? `<div class="chainrow">${st.chain.map((l, k) => `<button type="button" class="link ${l.s === me ? "mine" : ""}" data-cid="${esc(l.c)}" data-where="チェーン${k + 1}">${k + 1}. ${l.summon ? (l.special ? "特殊召喚：" : "召喚：") : ""}${esc(card(l.c).name)}<small>${l.s === me ? "あなた" : esc(P(st, l.s).name)}</small></button>`).join('<span class="arr">→</span>')}</div>` : "";
    const prevHTML = rs ? `<div class="resp-prev">${cardHTML(rs.c, "sm", "", mOpt(me))}<div class="rf-txt"><b>「${esc(rs.c.name)}」を使う？</b><p>${tkLink(esc(fxText(rs.c) || plainRuby(rs.c.effect || "") || "効果なし"))}</p><div class="row"><button class="primary" data-respgo>発動する</button><button class="ghost" data-respcancel>やめる</button></div></div></div>` : opts.length ? `<p class="note" style="margin:0">使うカードを押すと効果が出ます（押しただけでは発動しません）</p>` : "";
    html = `<div class="box"><h2 style="margin:0">${esc(head)}</h2>${chainHTML}${fHTML}<p style="margin:0">${esc(msg)}</p><div class="gallery">${list}</div>${prevHTML}<div class="row"><button data-close="notrap">${win === "chain" || win === "chainAttack" ? "チェーンしない" : "使わない"}</button><button class="ghost" data-peek>盤面を見る</button></div></div>`;
    peek = true;
  } else if (G.potPick != null && myP && potionDef((myP.potions || [])[G.potPick]) && canAct(st, me)){
    const k = myP.potions[G.potPick], d = potionDef(k);
    html = `<div class="box"><h2 style="margin:0">${esc(d.name)}</h2><div class="pi-big">${d.img ? `<img alt="" src="${d.img}">` : "🧪"}</div><p style="margin:0;font-size:17px">${esc(d.text)}</p><p class="muted" style="margin:0">マナはいらない。使うとなくなる</p><div class="row"><button class="primary" data-potuse="${G.potPick}">使う</button><button class="ghost" data-close="potion">やめる</button></div></div>`;
  } else if (myP && !st.winner && (myP.rewards || []).length){
    const r = myP.rewards[0], pd = r.pot && potionDef(r.pot), rd = r.rel && relicDef(r.rel), full = (myP.potions || []).length >= POTION_MAX;
    const icon = (d, e) => d && d.img ? `<img class="rw-ic" alt="" src="${d.img}">` : `<span class="rw-ic">${e}</span>`;
    html = `<div class="box"><h2 style="margin:0">報酬${myP.rewards.length > 1 ? `（のこり${myP.rewards.length}回）` : ""}</h2>`
      + (pd && !r.pd ? `<div class="rw-item">${icon(pd, "🧪")}<div class="rw-txt"><b>ポーション「${esc(pd.name)}」</b><span>${esc(pd.text)}</span></div><button class="primary" data-rw="pot:1" ${full ? "disabled" : ""}>${full ? "いっぱい（3つまで）" : "受け取る"}</button><button class="ghost" data-rw="pot:0">いらない</button></div>` : "")
      + (rd && !r.rd ? `<div class="rw-item">${icon(rd, "🏺")}<div class="rw-txt"><b>レリック「${esc(rd.name)}」</b><span>${esc(rd.text)}</span></div><button class="primary" data-rw="rel:1">受け取る</button><button class="ghost" data-rw="rel:0">いらない</button></div>` : "")
      + (r.cd ? "" : `<h3 style="margin:6px 0 0">カードを1枚えらぶ</h3><p class="muted" style="margin:0">えらんだカードは墓地に入り、山札がなくなったときデッキにまざります</p><div class="gallery reward-pick">${r.ids.filter(id => S.cards.has(id)).map(id => cardHTML(card(id), "sm pick", `data-rw="card:${esc(id)}" tabindex="0" role="button"`, mOpt(me))).join("")}</div>`)
      + `<div class="row">${r.cd ? "" : `<button class="ghost" data-rw="card:">カードはいらない</button>`}<button class="ghost" data-rw="done">報酬をおわる${r.cd && r.pd && r.rd ? "" : "（のこりはスキップ）"}</button></div></div>`;
  } else if (G.ssPick && canAct(st, me)){
    const sp = G.ssPick, pm = P(st, me), c = card(pm.hand[sp.hi]);
    const opts = sp.kind === "tribute" ? pm.mz.map((m, i) => m && (!sp.tag || hasTag(m.c, sp.tag)) ? i : -1).filter(i => i >= 0) : sp.kind === "mass" ? pm.grave.map((id, i) => i) : pm.hand.map((id, i) => i).filter(i => i !== sp.hi);
    const list = opts.map(i => { const on = sp.picked.includes(i), cc = sp.kind === "tribute" ? card(pm.mz[i].c) : sp.kind === "mass" ? card(pm.grave[i]) : card(pm.hand[i]); return cardHTML(cc, `sm pick ${on ? "sel" : ""}`, `data-sspick="${i}" tabindex="0" role="button" aria-pressed="${on}"`, sp.kind === "tribute" ? { mod: modOf(pm.mz[i]), ...mOpt(me) } : mOpt(me)); }).join("");
    html = `<div class="box"><h2 style="margin:0">「${esc(c.name)}」を${sp.kind === "mass" ? "召喚（質量）" : sp.normal ? "生贄召喚" : "特殊召喚"}</h2><p class="muted" style="margin:0">${sp.kind === "mass" ? `質量としてモンスターの下に重ねる墓地のカードを${sp.need}枚えらんでね` : sp.kind === "tribute" ? `墓地へ送るモンスターを${sp.need}体えらんでね` : `捨てる手札を${sp.need}枚えらんでね`}（${sp.picked.length} / ${sp.need}）</p><div class="gallery">${list}</div><div class="row"><button class="primary" data-ssgo ${sp.picked.length === sp.need ? "" : "disabled"}>${sp.kind === "mass" ? "質量にして召喚する" : sp.normal ? "生贄召喚する" : "特殊召喚する"}</button><button class="ghost" data-close="sspick">やめる</button></div></div>`;
  } else if (G.eqPlace){
    const ep = G.eqPlace, m = P(st, ep.s).mz[ep.i], id = P(st, me).hand[ep.hi];
    if (m && id){
      const es = eqsOf(m), ins = k => `<button class="ins" data-eqpos="${k}">ここ</button>`;
      html = `<div class="box"><h2 style="margin:0">「${esc(card(id).name)}」をどこに付ける？</h2><p class="muted" style="margin:0">「${esc(card(m.c).name)}」の装備の並び（左から）。「化身」のように左どなりに効く装備があるときは、並びが大事です</p><div class="eqplace">${ins(0)}${es.map((e, k) => cardHTML(card(e.c), "xs", "", mOpt(e.o)) + ins(k + 1)).join("")}</div><div class="row"><button class="ghost" data-close="eqplace">やめる</button></div></div>`;
    } else G.eqPlace = null;
  } else if (G.exView && myP){
    const L = myP.ex || [], can = canAct(st, me) && !st.winner;
    html = `<div class="box"><div class="row" style="justify-content:space-between"><h2 style="margin:0">EXデッキ（${L.length}枚）</h2></div><p class="note" style="margin:0">${can ? "使うカードを押すと手札に来て、いつもの「召喚・発動・セット・装備」ができます（使わなかったらEXデッキに戻ります）" : "自分のターンに使えます"}</p><div class="gallery">${L.map((id, k) => cardHTML(card(id), "sm pick" + (can ? "" : " dim"), `${can ? `data-exuse="${k}"` : `data-cid="${esc(id)}"`} tabindex="0" role="button"`, { mana: !!myP.mana })).join("") || '<p class="muted">EXデッキは空っぽ</p>'}</div><div class="row"><button data-close="exview">とじる</button></div></div>`;
  } else if (G.view){
    // 山札・墓地・廃棄札を見る（相手は墓地と廃棄札だけ。山札は並び順がわからないようにコスト順に並べ替える）
    const [who, pile0] = String(G.view).split(":"), mine = who === "me", X = mine ? P(st, me) : P(st, O(me));
    const piles = mine ? ["deck", "grave", "exile"] : ["grave", "exile"], pile = piles.includes(pile0) ? pile0 : "grave";
    const LBL = { deck: "山札", grave: "墓地", exile: "廃棄札" }, list = pile === "deck" ? deckSortIds(X.deck.slice(), !!X.mana) : pile === "exile" ? (X.exile || []).slice() : X.grave.slice();
    const tabs = `<div class="seg pile-tabs">${piles.map(k => `<button type="button" data-grave="${who}:${k}" aria-pressed="${k === pile}">${LBL[k]} ${k === "deck" ? X.deck.length : k === "exile" ? (X.exile || []).length : X.grave.length}</button>`).join("")}</div>`;
    const note = pile === "deck" ? "並び順はひみつ（コスト順に並べ替えて表示）" : pile === "exile" ? "廃棄されたカード（このゲームではもう使えない）" : "上から古い順";
    html = `<div class="box"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(X.name)} の${LBL[pile]}（${list.length}枚）</h2>${tabs}</div><p class="note" style="margin:0">${note}</p><div class="gallery">${list.map(id => cardHTML(card(id), "sm pick", `data-cid="${esc(id)}" tabindex="0" role="button"`, { mana: !!X.mana })).join("") || '<p class="muted">まだ空っぽ</p>'}</div><div class="row"><button data-close="view">とじる</button></div></div>`;
  } else if (G.graveHand){
    const ids = [...new Set(P(st, me).grave)];
    html = `<div class="box"><h2 style="margin:0">墓地から手札に戻すカードをえらぶ（手動）</h2><div class="gallery">${ids.map(id => cardHTML(card(id), "sm pick", `data-gh="${esc(id)}" tabindex="0" role="button"`, mOpt(me))).join("") || '<p class="muted">墓地は空っぽ</p>'}</div><div class="row"><button class="ghost" data-close="gh">やめる</button></div></div>`;
  }
  const hideIt = !!(html && peek && G.ovHide);
  ov.hidden = !html || hideIt; ov.innerHTML = hideIt ? "" : html;
  battleChrome(hideIt);
  if (!hideIt && G.respSel) requestAnimationFrame(() => { const pv = ov.querySelector(".resp-prev"); if (pv) pv.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
}
$("#overlay").addEventListener("click", e => {
  { const gv = e.target.closest("[data-grave]"); if (gv && G){ G.view = gv.dataset.grave; renderAll(); return; } }
  { const xu = e.target.closest("[data-exuse]"); if (xu && G && !G.spectate){ const k = +xu.dataset.exuse, me = G.slot; let hi = -1, id = null; if (isFusion(card(P(G.st, me).ex[k]))){ toast("融合モンスターは「融合召喚」の効果でだけ出せます"); return; } G.exView = false; act(st => { const p = P(st, me); if (!canAct(st, me) || p.ex[k] == null) return false; exReturnP(st, me); id = p.ex.splice(k, 1)[0]; p.hand.push(id); hi = p.hand.length - 1; p.exTemp = { id, i: hi }; G.sel = { z: "hand", s: "me", i: hi }; G.atkFrom = null; }); if (hi < 0) renderAll(); return; } }
  if (!G) return;
  { const aq = e.target.closest("[data-askq]"); if (aq){ const yes = aq.dataset.askq === "yes"; act(st => { if (!st.askQ || st.askQ.to !== G.slot || st.askQ.ans != null) return false; st.askQ.ans = yes; log(st, G.slot, `「${st.askQ.name}」の質問「${st.askQ.text}」に「${yes ? "はい" : "いいえ"}」と答えた`); }); return; } }
  { const p1 = e.target.closest("[data-p1]"); if (p1 && G.chooseQ.length && G.chooseQ[0].pick1){ const q = G.chooseQ.shift(), k = +p1.dataset.p1; act(st => { q.p1go(st, k); }); return; } }
  const ak = e.target.closest("[data-ask]");
  if (ak && G.chooseQ.length && G.chooseQ[0].ask){
    const q = G.chooseQ.shift(), yes = ak.dataset.ask === "yes";
    if (q.block){ act(st => { log(st, q.s, `「${q.c.name}」：${q.to ? "相手に" : ""}「${q.fx.ask}」→ ${yes ? "はい" : "いいえ"}`); q.block.go(st, q.block.fin(yes)); }); return; }
    act(st => { log(st, q.s, `「${q.c.name}」：「${q.fx.ask}」→ ${yes ? "はい" : "いいえ"}`); if (yes) runEffect(st, q.s, q.c, q.ctx, q.then, { ...q.fx, ask: "" }); else q.then && q.then(st); });
    return;
  }
  const cpk = e.target.closest("[data-cpick]");
  if (cpk && G.costPick){ const j = +cpk.dataset.cpick, cp = G.costPick; if (cp.picked.includes(j)) cp.picked = cp.picked.filter(x => x !== j); else if (cp.picked.length < cp.need) cp.picked.push(j); renderAll(); return; }
  if (e.target.closest("[data-cpgo]") && G.costPick){ const cp = G.costPick; G.costPick = null; cp.go(cp.picked.slice()); return; }
  const spk = e.target.closest("[data-sspick]");
  if (spk && G.ssPick){ const i = +spk.dataset.sspick, sp = G.ssPick; if (sp.picked.includes(i)) sp.picked = sp.picked.filter(x => x !== i); else if (sp.picked.length < sp.need) sp.picked.push(i); renderAll(); return; }
  if (e.target.closest("[data-ssgo]") && G.ssPick){ const sp = G.ssPick; G.ssPick = null; if (sp.kind === "mass") withDiscard(card(P(st0(), G.slot).hand[sp.hi]), sp.hi, d => act(st => summon(st, G.slot, sp.hi, sp.zi ?? null, d, null, sp.picked))); else if (sp.normal) withDiscard(card(P(st0(), G.slot).hand[sp.hi]), sp.hi, d => act(st => summon(st, G.slot, sp.hi, null, d, sp.picked))); else act(st => specialSummon(st, G.slot, sp.hi, sp.picked)); return; }
  const ep = e.target.closest("[data-eqpos]");
  if (ep && G.eqPlace){ const x = G.eqPlace; G.eqPlace = null; G.sel = null; const pos = +ep.dataset.eqpos; withDiscard(card(P(st0(), G.slot).hand[x.hi]), x.hi, d => act(st => equip(st, G.slot, x.hi, x.s, x.i, pos, d))); return; }
  const rw = e.target.closest("[data-rw]");
  if (rw && !rw.disabled){ const [w, ...v] = rw.dataset.rw.split(":"); act(st => rewardAct(st, G.slot, w, v.join(":"))); return; }
  const pu = e.target.closest("[data-potuse]");
  if (pu){ const i = +pu.dataset.potuse; G.potPick = null; act(st => usePotion(st, G.slot, i, () => {})); return; }
  const rl = e.target.closest("[data-relic]");
  if (rl){ const k = rl.dataset.relic; act(st => chooseRelic(st, G.slot, k)); return; }
  const sw = e.target.closest("[data-sprout]");
  if (sw){ const k = sw.dataset.sprout; act(st => chooseRelic(st, G.slot, "sprout", k)); return; }
  { const fp = e.target.closest("[data-fpick]"); if (fp && G.fusPick){ const k = fp.dataset.fpick, P0 = G.fusPick.picked, at = P0.indexOf(k); if (at >= 0) P0.splice(at, 1); else if (P0.length < G.fusPick.need) P0.push(k); renderAll(); return; } }
  if (e.target.closest("[data-fgo]") && G.fusPick){ const f = G.fusPick, picks = f.picked.map(k => { const [from, i] = k.split(":"); return { from, i: +i }; }); G.fusPick = null; act(st => { applyEffect(st, f.q.s, f.q.c, f.target, { ...f.q.ctx, fusMats: picks }, f.q.fx); f.q.then && f.q.then(st); }); return; }
  if (e.target.closest("[data-fback]") && G.fusPick){ G.chooseQ.unshift(G.fusPick.q); G.fusPick = null; renderAll(); return; }
  const opt = e.target.closest("[data-opt]");
  if (opt && G.chooseQ.length && G.chooseQ[0].fx.kind === "fusion"){
    const q = G.chooseQ[0], target = opt.dataset.opt, fc = card(target), X = P(st0(), q.s);
    const pool = [...X.hand.map((id, i) => ["hand:" + i, id]), ...X.mz.map((m, i) => m ? ["mz:" + i, m.c] : null).filter(Boolean)].filter(([, id]) => fc.fusion.some(x => fusionMatOk(id, x)));
    G.chooseQ.shift();
    // only one way to do it → no need to ask
    if (pool.length === fc.fusion.length){ act(st => { applyEffect(st, q.s, q.c, target, q.ctx, q.fx); q.then && q.then(st); }); return; }
    G.fusPick = { q, target, need: fc.fusion.length, picked: [] }; renderAll(); return;
  }
  if (opt && G.chooseQ.length){
    const q = G.chooseQ.shift(); const t = KINDS[q.fx.kind].target;
    const target = t === "grave" || t === "any" || t === "draft" || t === "graveAny" || t === "tagPick" || q.ctx.spireAtk ? opt.dataset.opt : +opt.dataset.opt;
    act(st => { applyEffect(st, q.s, q.c, target, q.ctx, q.fx); q.then && q.then(st); });
    return;
  }
  if (e.target.closest("[data-peek]")){ G.ovHide = true; renderAll(); return; }
  const tr = e.target.closest("[data-resp]");
  if (tr){ G.respSel = G.respSel === tr.dataset.resp ? null : tr.dataset.resp; renderAll(); return; }
  if (e.target.closest("[data-respcancel]")){ G.respSel = null; renderAll(); return; }
  if (e.target.closest("[data-respgo]") && G.respSel){ const [from, i] = G.respSel.split(":"), X = P(st0(), G.slot), rc = card(from === "hand" ? X.hand[+i] : from === "sz" && X.sz[+i] ? X.sz[+i].c : null); G.respSel = null; withDiscard(rc, from === "hand" ? +i : -1, d => act(st => respond(st, G.slot, { from, i: +i, disc: d }))); return; }
  const gh = e.target.closest("[data-gh]");
  if (gh){ const id = gh.dataset.gh; G.graveHand = false; act(st => { const p = P(st, G.slot), k = p.grave.indexOf(id); if (k < 0) return false; p.grave.splice(k, 1); p.hand.push(id); log(st, G.slot, `（手動）墓地の「${card(id).name}」を手札に戻した`); }); return; }
  const ci = e.target.closest("[data-cid]");
  if (ci){ G.detailBottom = false; openDetail(["id", ci.dataset.cid, ci.dataset.where || undefined]); return; }
  const cl = e.target.closest("[data-close]"); if (!cl) return;
  const k = cl.dataset.close;
  if (k === "choose"){ const q = G.chooseQ.shift(); act(st => { if (q.ctx && q.ctx.potion && potionCard(q.ctx.potion)){ const p = P(st, q.s); (p.potions = p.potions || []).push(q.ctx.potion); log(st, q.s, `「${q.c.name}」を使うのをやめた`); } else log(st, q.s, `「${q.c.name}」：効果を使わなかった`); q.then && q.then(st); }); }
  if (k === "notrap") act(st => respond(st, G.slot, null));
  if (k === "view"){ G.view = null; renderAll(); }
  if (k === "exview"){ G.exView = false; renderAll(); }
  if (k === "gh"){ G.graveHand = false; renderAll(); }
  if (k === "eqplace"){ G.eqPlace = null; renderAll(); }
  if (k === "sspick"){ G.ssPick = null; renderAll(); }
  if (k === "potion"){ G.potPick = null; renderAll(); }
  if (k === "costpick"){ G.costPick = null; renderAll(); }
});
$("#overlay").addEventListener("keydown", e => { const h = e.target.closest("[role=button]"); if (h && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); h.click(); } });

$("#board").addEventListener("click", e => {
  if (e.target.closest("[data-field]") && G && G.st && G.st.field){ openCardView("field", [G.st.field.c], 0); return; }
  if (!G) return;
  const st = G.st, me = G.slot;
  { const tb = e.target.closest("[data-test]"); if (tb){ if (G.test && !tb.disabled) testAct(tb.dataset.test); return; } }
  { const fb = e.target.closest("[data-fb]"); if (fb){ if (canAct(st, me)){ const gi = +fb.dataset.fb, id = P(st, me).grave[gi]; if (!id) return; G.sel = null; withDiscard(card(id), -1, d => act(st => activate(st, me, "grave", gi, d.length ? { disc: d } : {}))); } return; } }
  const pb = e.target.closest("[data-potion]");
  if (pb){ if (canAct(st, me)){ G.potPick = +pb.dataset.potion; renderAll(); } return; }
  { const ci = e.target.closest("[data-cid]"); if (ci){ G.detailBottom = ci.getBoundingClientRect().top < innerHeight / 2; openDetail(["id", ci.dataset.cid, ci.dataset.where || undefined]); return; } }
  { const cn = e.target.closest("[data-cname]"); if (cn){ const id = findCardIdByName(cn.dataset.cname); if (!id){ toast("そのカードが見つかりません"); return; } G.detailBottom = cn.getBoundingClientRect().top < innerHeight / 2; openDetail(["id", id, "ログに出たカード"]); return; } }
  { const ab = e.target.closest("[data-actmon]"); if (ab){ if (!ab.disabled){ G.actAsk = +ab.dataset.actmon; renderAll(); } return; } }
  const zc = e.target.closest("[data-z]");
  if (zc){
    const z = zc.dataset.z, s = zc.dataset.s, i = +zc.dataset.i;
    G.detailBottom = zc.getBoundingClientRect().top < innerHeight / 2;
    const em = equipMode(st, me);
    if (em && z === "mz" && P(st, s === "me" ? me : O(me)).mz[i]){
      const ts = s === "me" ? me : O(me);
      if (!canEquipOn(st, em.id, ts, i)){ toast("装備キャパが足りないので付けられません"); return; }
      if (eqsOf(P(st, ts).mz[i]).length){ G.eqPlace = { hi: em.i, s: ts, i }; renderAll(); return; }
      G.sel = null; withDiscard(card(em.id), em.i, d => act(st => equip(st, me, em.i, ts, i, null, d))); return;
    }
    if (G.atkFrom != null && s === "op" && z === "mz" && P(st, O(me)).mz[i]){ const AT = atkTargets(st, me, G.atkFrom); if (!AT.L.includes(i)){ toast(AT.top && !AT.taunt ? "このモンスターは、相手の一番ATKが高いモンスターにしか攻撃できない" : "このモンスターには攻撃できない（ほかに狙わなきゃいけないモンスターがいる）"); return; } if (G.atkTo !== i){ G.atkTo = i; renderAll(); return; } const from = G.atkFrom; G.atkFrom = null; G.atkTo = null; G.sel = null; act(st => declareAttack(st, me, from, i)); return; }
    const occupied = z === "hand" || P(st, s === "me" ? me : O(me))[z][i];
    if (!occupied){
      const dk = s === "me" ? dropTarget(st, me) : null;
      if (dk && dk === z){ const hi = G.sel.i; G.sel = null; if (dk === "mz" && massOf(card(P(st, me).hand[hi]))){ G.ssPick = { hi, zi: i, kind: "mass", need: massOf(card(P(st, me).hand[hi])), picked: [], normal: true }; renderAll(); } else if (dk === "mz"){ const tn = tribOf(card(P(st, me).hand[hi]), st, me); if (tn){ G.ssPick = { hi, kind: "tribute", need: tn, picked: [], normal: true, tag: card(P(st, me).hand[hi]).tribTag || "" }; renderAll(); } else withDiscard(card(P(st, me).hand[hi]), hi, d => act(st => summon(st, me, hi, i, d))); } else act(st => setCard(st, me, hi, i)); }
      return;
    }
    const same = G.sel && G.sel.z === z && G.sel.s === s && G.sel.i === i;
    G.sel = same ? null : { z, s, i }; G.atkFrom = null; openDetail([z, s, i]); renderAll(); return;
  }
  if (e.target.closest("[data-exopen]")){ G.exView = true; renderAll(); return; }
  const gv = e.target.closest("[data-grave]");
  if (gv){ G.view = gv.dataset.grave; renderAll(); return; }
  const adj = e.target.closest("[data-adj]");
  if (adj){ const d = +adj.dataset.d, who = adj.dataset.adj === "me" ? me : O(me); act(st => { P(st, who).lp += d; log(st, me, `（手動）${nm(st, who)}のLPを${d > 0 ? "+" : ""}${d}`); }); return; }
  const man = e.target.closest("[data-man]");
  if (man && G.sel){
    const sel = G.sel, owner = sel.s === "me" ? me : O(me), kind = man.dataset.man;
    G.sel = null;
    act(st => {
      const X = P(st, owner), z = X[sel.z][sel.i]; if (!z) return false;
      if (kind === "atk"){ const d = +man.dataset.d; z.mod = (z.mod || 0) + d; log(st, me, `（手動）「${card(z.c).name}」のATKを${d > 0 ? "+" : ""}${d}`); G.sel = sel; }
      if (kind === "grave"){ if (sel.z === "mz") destroyMonster(st, owner, sel.i, "手動", { force: true }); else { X.sz[sel.i] = null; X.grave.push(z.c); log(st, me, `（手動）「${card(z.c).name}」を墓地へ`); } }
      if (kind === "hand"){ if (sel.z === "mz") detachEquips(st, owner, sel.i); X[sel.z][sel.i] = null; X.hand.push(z.c); log(st, me, `（手動）「${card(z.c).name}」を手札に戻した`); }
      if (kind === "uneq"){ const k = +man.dataset.k, e = eqsOf(z)[k]; if (!e) return false; z.eqs.splice(k, 1); P(st, e.o).grave.push(e.c); log(st, me, `（手動）「${card(e.c).name}」を外して墓地へ`); G.sel = sel; }
    });
    return;
  }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const k = a.dataset.act, sel = G.sel;
  if (k === "leave"){ leaveGame(); renderAll(); return; }
  if (k === "rematch"){ rematch(); return; }
  if (k === "skipIdle"){
    const i = idleInfo(); if (!i || i.w === G.slot || i.left > 0) return;
    act(st => {
      const w = i.w, nmW = P(st, w).name; st.idleSkips = st.idleSkips || {}; st.idleSkips[w] = (st.idleSkips[w] || 0) + 1;
      log(st, G.slot, `${nmW} が${TURN_IDLE / 60}分動かなかったので進めた（${st.idleSkips[w]}回目）`);
      if (st.idleSkips[w] >= 3){ st.winner = O(w); st.why = `${nmW} が3回時間切れになった`; return; }
      if (st.askQ && st.askQ.ans == null && st.askQ.to === w){ st.askQ.ans = false; log(st, G.slot, "質問は「いいえ」あつかいになった"); return; }
      st.askQ = null;
      if (st.pending && st.pending.wait) respond(st, w, null); else { exReturnP(st, w); endTurn(st, w); }
    });
    return;
  }
  if (k === "surrender"){ if (!G.surArm){ G.surArm = true; renderAll(); setTimeout(() => { if (G){ G.surArm = false; renderAll(); } }, 3000); return; } act(st => { st.winner = O(me); st.why = `${nm(st, me)} が投了`; log(st, me, "投了した"); }); return; }
  if (k === "draw"){ act(st => drawN(st, me, 1, "（手動）")); return; }
  if (k === "graveHand"){ G.graveHand = true; renderAll(); return; }
  if (!canAct(st, me)) return;
  if (k === "endTurn"){ G.sel = null; G.atkFrom = null; G.eqPlace = null; act(st => { exReturn(st); return endTurn(st, me); }); return; }
  if (k === "cancelAtk"){ G.atkFrom = null; G.atkTo = null; renderAll(); return; }
  if (k === "atkGo"){ const from = G.atkFrom, to = G.atkTo; G.atkFrom = null; G.atkTo = null; G.sel = null; if (from == null || to == null) return; act(st => declareAttack(st, me, from, to)); return; }
  if (k === "cancelEq"){ G.equipFrom = null; renderAll(); return; }
  if (k === "direct"){ const from = G.atkFrom; G.atkFrom = null; G.sel = null; act(st => declareAttack(st, me, from, "direct")); return; }
  if (!sel) return;
  if (k === "summon" && massOf(card(P(st, me).hand[sel.i]))){ G.sel = null; G.ssPick = { hi: sel.i, kind: "mass", need: massOf(card(P(st, me).hand[sel.i])), picked: [], normal: true }; renderAll(); return; }
  if (k === "summon"){ G.sel = null; const tn = tribOf(card(P(st, me).hand[sel.i]), st, me); if (tn){ G.ssPick = { hi: sel.i, kind: "tribute", need: tn, picked: [], normal: true, tag: card(P(st, me).hand[sel.i]).tribTag || "" }; renderAll(); } else withDiscard(card(P(st, me).hand[sel.i]), sel.i, d => act(st => summon(st, me, sel.i, null, d))); }
  if (k === "ssummon"){
    const ss = ssOf(card(P(st, me).hand[sel.i])); G.sel = null;
    if (ss && (ss.cost === "tribute" || ss.cost === "discard")){ G.ssPick = { hi: sel.i, kind: ss.cost, need: ss.cn, picked: [] }; renderAll(); }
    else act(st => specialSummon(st, me, sel.i, []));
  }
  if (k === "set"){ G.sel = null; act(st => setCard(st, me, sel.i)); }
  if (/^activate(Hand|Set)(Kick)?$/.test(k)){
    const from = k.startsWith("activateHand") ? "hand" : "sz", kick = k.endsWith("Kick");
    const id = from === "hand" ? P(st, me).hand[sel.i] : P(st, me).sz[sel.i]?.c;
    const why = useBlockedWhy(st, me, card(id)); if (why){ toast(why); return; }
    const fx = normFx(card(id));
    if (fx && (fx.kind === "negate" || fx.kind === "killAtk" || fx.kind === "atkDownAtk")){ toast("このカードは相手に攻撃されたときに使えます"); return; }
    const opts = fx ? targetOptions(st, me, fx.kind, { tagName: fx.into || "" }) : null;
    if (opts && !opts.length){ toast("効果の対象がいないので発動できません"); return; }
    G.sel = null; withDiscard(card(id), from === "hand" ? sel.i : -1, d => act(st => activate(st, me, from, sel.i, { ...(d.length ? { disc: d } : {}), kick })));
  }
  if (k === "attack"){ G.atkFrom = sel.i; G.atkTo = null; renderAll(); }

});
$("#board").addEventListener("change", e => {
  const sp = e.target.closest("[data-cpuspd]"); if (sp){ ls.set("cb_cpuspd", sp.value); return; }
  const tc = e.target.closest("[data-testcpu]"); if (tc && G && G.test){ G.test.cpu = tc.value; scheduleCpu(); return; }
  const mt = e.target.closest("[data-manualtog]"); if (mt){ ls.set("cb_manual", mt.checked); renderAll(); }
});
$("#board").addEventListener("input", e => { const n = e.target.closest("[data-testname]"); if (n && G && G.test) G.test.name = n.value; });
$("#board").addEventListener("keydown", e => { const h = e.target.closest("[role=button]"); if (h && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); h.click(); } });

/* ================= チュートリアル（練習バトル・カード工房の案内） =================
   画面を暗くして、押してほしいところだけ光らせる。吹き出しで説明。
   練習バトルは手札・山札が決まっていて、相手は台本どおりに動く（G.tut）。 */
const TUT = { on: false, kind: "", i: 0, steps: [], ack: -1, scrolled: -1, timer: null };
const tutVis = q => [...document.querySelectorAll(q)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null; }) || null;
const tutPm = () => P(G.st, G.slot), tutPo = () => P(G.st, O(G.slot));
const tutZone = id => G && G.st ? tutPm().mz.findIndex(m => m && m.c === id) : -1;
const tutMon = id => { const k = tutZone(id); return k >= 0 ? tutPm().mz[k] : null; };
const tutHandEl = id => { const k = tutPm().hand.indexOf(id); return k >= 0 ? tutVis(`#board .hand [data-z="hand"][data-i="${k}"]`) : null; };
const tutZoneEl = (k, s = "me") => tutVis(`#board [data-z="mz"][data-s="${s}"][data-i="${k}"]`);
const tutBtn = a => tutVis(`.hand-acts [data-act="${a}"]`) || tutVis(`[data-act="${a}"]`);
const tutSelHand = id => !!(G.sel && G.sel.z === "hand" && tutPm().hand[G.sel.i] === id);
// 手札のカードを選んで、ボタン（召喚・セット・発動）を押す
const tutPlay = (id, a) => () => tutSelHand(id) ? tutBtn(a) : tutHandEl(id);
// 場のモンスターで直接攻撃: モンスター → 「攻撃」 → 「直接攻撃！」
const tutAtk = id => () => { const k = tutZone(id); if (k < 0) return null; if (G.atkFrom === k) return tutBtn("direct"); if (G.sel && G.sel.z === "mz" && G.sel.s === "me" && G.sel.i === k) return tutBtn("attack"); return tutZoneEl(k); };
const tutAtked = id => { const m = tutMon(id); return !m || (m.atkCount || 0) > 0 || !!G.st.winner; };
const TUT_ME = "starter-6", TUT_HAYATE = "tut-hayate", TUT_TRAP = "starter-17", TUT_BOOM = "starter-13", TUT_HAT = "starter-14", TUT_ORC = "tut-orc", TUT_BOSS = "tut-boss";
function tutCards(){
  const cp = (id, from, ch) => { const b = card(from); S.cards.set(id, { ...b, id, starter: true, token: false, tut: true, ...ch }); };
  cp(TUT_HAYATE, "starter-5", { name: "はやてどすこい", atk: 400, abs: [{ k: "haste" }], effect: "", limit: 3 });
  cp(TUT_ORC, "starter-5", { name: "あばれどすこい", atk: 600, abs: [{ k: "haste" }], effect: "" });
  cp(TUT_BOSS, "starter-6", { name: "ヒトツメ大魔王", atk: 900, effect: "とにかく、もっとつよい。" });
}
const TUT_BATTLE = [
  { t: "ようこそ！ここでは<b>練習バトル</b>で遊び方を覚えるよ。5分くらいで終わるので、光っているところを順番に押してね。", next: "はじめる" },
  { t: "上が<b>相手の場</b>、下が<b>あなたの場</b>。一番下があなたの<b>手札</b>。<br>相手のLP（ライフ）を0にしたら勝ち！", next: "わかった" },
  { t: "まずはモンスターを出そう。手札の<b>「ヒトツメ大王」</b>を押してね。", el: tutPlay(TUT_ME, "summon"), done: () => tutSelHand(TUT_ME) || tutZone(TUT_ME) >= 0 },
  { t: "<b>「召喚する」</b>を押すと、モンスターが場に出るよ。召喚は1ターンに1回まで。", el: tutPlay(TUT_ME, "summon"), done: () => tutZone(TUT_ME) >= 0 },
  { t: "出せた！ 出したばかりのモンスターは、そのターンは攻撃できない（召喚酔い）。それに先攻の1ターン目は、だれも攻撃できないよ。", next: "次へ" },
  { t: "次は罠カードの<b>「おとしあな」</b>を押してね。", el: tutPlay(TUT_TRAP, "set"), done: () => tutSelHand(TUT_TRAP) || tutPm().sz.some(z => z && z.c === TUT_TRAP) },
  { t: "<b>「セットする」</b>を押そう。罠はふせて置いておき、相手のターンに条件がそろったら使えるよ。", el: tutPlay(TUT_TRAP, "set"), done: () => tutPm().sz.some(z => z && z.c === TUT_TRAP) },
  { t: "おとしあなは「相手が攻撃してきたとき、そのモンスターを破壊する」罠。相手の攻撃を待とう。<br><b>「ターン終了」</b>を押してね。", el: () => tutBtn("endTurn"), done: () => G.st.turn !== G.slot || G.st.turnNo > 1 },
  { t: "相手のターン…", wait: true, done: () => !!(G.st.pending && G.st.pending.wait && G.st.pending.type === "attack" && G.st.pending.by !== G.slot) || G.st.turnNo >= 3 },
  { t: "攻撃された！ 相手はATK600、こっちは500。このままだと負けちゃう…<br>セットしておいた<b>「おとしあな」</b>を押そう！", el: () => G.respSel ? tutVis("[data-respgo]") : tutVis('#overlay [data-resp]'), done: () => !tutPm().sz.some(z => z && z.c === TUT_TRAP) || G.st.turnNo >= 3 },
  { t: "罠が発動！ 攻撃してきたモンスターを破壊した。相手のターンが終わるのを待とう…", wait: true, done: () => G.st.turn === G.slot && G.st.turnNo >= 3 && !G.st.pending },
  { t: "あなたのターン。ターンのはじめに、カードを1枚引いたよ。<br>引いた<b>「はやてどすこい」</b>には《速攻》の能力がある。出たターンからすぐ攻撃できるんだ。", next: "次へ" },
  { t: "<b>「はやてどすこい」</b>を押して、召喚しよう。", el: tutPlay(TUT_HAYATE, "summon"), done: () => tutZone(TUT_HAYATE) >= 0 },
  { t: "相手の場にモンスターがいないので、相手に<b>直接攻撃</b>できる！<br>場の「ヒトツメ大王」→「攻撃」→「直接攻撃！」の順に押そう。", el: tutAtk(TUT_ME), done: () => tutAtked(TUT_ME) },
  { t: "ATKのぶんダメージが入った！ 《速攻》の「はやてどすこい」でも攻撃しよう。", el: tutAtk(TUT_HAYATE), done: () => tutAtked(TUT_HAYATE) },
  { t: "いい感じ！ <b>「ターン終了」</b>を押そう。", el: () => tutBtn("endTurn"), done: () => G.st.turnNo >= 4 },
  { t: "相手のターン…", wait: true, done: () => G.st.turn === G.slot && G.st.turnNo >= 5 && !G.st.pending },
  { t: "相手が<b>ATK900の「ヒトツメ大魔王」</b>を出してきた！ ATKでは勝てない…<br>そんなときは<b>魔法カード</b>の出番。", next: "次へ" },
  { t: "<b>「ドカーン」</b>は相手のモンスター1体を破壊する魔法。押して「発動する」→ 破壊するモンスターを選ぼう。", el: () => G.chooseQ.length ? tutVis("#overlay [data-opt]") : tutPlay(TUT_BOOM, "activateHand")(), done: () => !tutPo().mz.some(m => m && m.c === TUT_BOSS) },
  { t: "やった！ 次は<b>装備カード</b>。「ぼうし」を付けるとATKが+150されるよ。<br>手札の「ぼうし」→ 光っている「ヒトツメ大王」の順に押そう。", el: () => tutSelHand(TUT_HAT) ? tutZoneEl(tutZone(TUT_ME)) : tutHandEl(TUT_HAT), done: () => { const m = tutMon(TUT_ME); return !m || eqsOf(m).length > 0; } },
  { t: "ATKが650になった！ さあ、とどめだ。「ヒトツメ大王」で直接攻撃！", el: tutAtk(TUT_ME), done: () => tutAtked(TUT_ME) },
  { t: "最後に「はやてどすこい」でも攻撃！", el: tutAtk(TUT_HAYATE), done: () => !!G.st.winner },
  { t: "🎉 <b>クリア！</b> おつかれさま！<br>これで基本はばっちり。カードの文の下線つきの言葉（《速攻》など）は、カードの詳細で押すと説明が出るよ。<br>次は<b>自分のカードを描いて</b>、デッキを作ってみよう！", end: true }
];
const TUT_MAKER = [
  { t: "ここは<b>カード工房</b>。自分だけのカードを描いて、対戦で使えるよ。かんたんに案内するね。", next: "次へ" },
  { t: "ここが絵を描くところ。指やマウスで自由に描いてね。色や太さは「絵」のタブで変えられるよ。", el: () => tutVis("#cv"), next: "次へ" },
  { t: "カードの<b>名前</b>はここに書く。", el: () => tutVis("#mkName"), next: "次へ" },
  { t: "カードの<b>種類</b>を選ぼう。モンスター・魔法・装備・罠があるよ。", el: () => tutVis("#mkType"), next: "次へ" },
  { t: "<b>「効果・能力」</b>のタブで、カードの効果を選べる。文を選ぶだけで、対戦のときに自動で動くよ。", el: () => tutVis('#mkTabs [data-pane="fx"]'), next: "次へ" },
  { t: "できたら<b>保存</b>！ 保存したカードは「Deck」でデッキに入れて、対戦で使えるよ。", el: () => tutVis("#btnSave"), next: "おわる", fin: true }
];
function tutEls(){
  let root = document.getElementById("tutLayer");
  if (!root){
    root = document.createElement("div"); root.id = "tutLayer";
    root.innerHTML = `<div class="tut-sh" data-k="t"></div><div class="tut-sh" data-k="b"></div><div class="tut-sh" data-k="l"></div><div class="tut-sh" data-k="r"></div><div class="tut-hole"></div><div class="tut-bub" role="dialog" aria-live="polite"></div>`;
    document.body.appendChild(root);
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-tutb]"); if (!b) return;
      const k = b.dataset.tutb;
      if (k === "next"){ const s = TUT.steps[TUT.i]; TUT.ack = TUT.i; if (s && s.fin){ tutEnd(); return; } tutTick(); }
      else if (k === "quit") tutQuit();
      else if (k === "maker"){ tutEnd(); leaveGame(); tutStart("maker"); }
      else if (k === "done"){ tutEnd(); leaveGame(); S.tab = "play"; ls.set("cb_tab", "play"); renderAll(); }
    });
  }
  return root;
}
function tutStart(kind){
  ls.set("cb_tutSeen", true);
  const ask = document.getElementById("tutAsk"); if (ask) ask.remove();
  TUT.on = true; TUT.kind = kind; TUT.i = 0; TUT.ack = -1; TUT.scrolled = -1;
  TUT.steps = kind === "maker" ? TUT_MAKER : TUT_BATTLE;
  if (kind === "battle") tutBattle();
  else { if (G) leaveGame(); S.tab = "make"; ls.set("cb_tab", "make"); renderAll(); if (typeof setMkPane === "function") setMkPane("draw"); window.scrollTo(0, 0); }
  document.body.classList.add("tut-on"); tutEls().hidden = false;
  clearInterval(TUT.timer); TUT.timer = setInterval(tutTick, 200); tutTick();
}
function tutEnd(){ TUT.on = false; clearInterval(TUT.timer); document.body.classList.remove("tut-on"); const r = document.getElementById("tutLayer"); if (r) r.hidden = true; }
function tutQuit(){ const battle = TUT.kind === "battle"; tutEnd(); if (battle){ leaveGame(); S.tab = "play"; renderAll(); } }
function tutBattle(){
  leaveGame(); tutCards();
  const filler = ["starter-0", "starter-1", "starter-2", "starter-3", "starter-7"];
  const pa = newPlayer([TUT_ME, TUT_TRAP, TUT_BOOM, TUT_HAT, TUT_HAYATE, ...filler, ...filler], null, false, false);
  pa.hand = [TUT_ME, TUT_TRAP, TUT_BOOM, TUT_HAT, "starter-1"]; pa.deck = [TUT_HAYATE, "starter-0", ...filler, ...filler];
  const pb = newPlayer([TUT_ORC, TUT_BOSS, ...filler, ...filler], "練習あいて", false, false);
  pb.hand = [TUT_ORC, TUT_BOSS, "starter-0", "starter-1", "starter-2"]; pb.deck = [...filler, ...filler]; pb.lp = 1900;
  const st = startState(pa, pb); st.first = "a"; st.turn = "a"; st.turnNo = 1; st.log = [{ t: Date.now(), m: "練習バトル スタート！ あなたの先攻" }];
  G = { mode: "cpu", tut: true, slot: "a", st, sel: null, atkFrom: null, chooseQ: [], evSeen: 0, recorded: true };
  S.tab = "play"; renderAll(); after(false); window.scrollTo(0, 0);
}
// 練習あいての台本: 2ターン目は速攻モンスターで攻撃、4ターン目は大きいモンスターを出すだけ
function tutCpu(st){
  const s = "b", p = P(st, s), me = P(st, O(s));
  if (st.turnNo === 2){
    if (!st.tutA){ st.tutA = 1; const i = p.hand.indexOf(TUT_ORC); if (i >= 0 && summon(st, s, i)) return; }
    if (st.tutA === 1){ st.tutA = 2; const z = p.mz.findIndex(m => m && m.c === TUT_ORC), t = me.mz.findIndex(Boolean); if (z >= 0 && t >= 0 && canAttack(st, s, z) && declareAttack(st, s, z, t)) return; }
  }
  if (st.turnNo === 4 && !st.tutB){ st.tutB = 1; const i = p.hand.indexOf(TUT_BOSS); if (i >= 0 && summon(st, s, i)) return; }
  endTurn(st, s);
}
function tutTick(){
  if (!TUT.on) return;
  if (TUT.kind === "battle" && (!G || !G.tut)){ tutEnd(); return; }
  let s = TUT.steps[TUT.i];
  // 終わったステップは飛ばす（「次へ」のステップは押されたら）
  for (let guard = 0; s && guard < 30; guard++){
    const passed = s.next ? TUT.ack === TUT.i : s.done ? s.done() : false;
    if (!passed) break;
    TUT.i++; s = TUT.steps[TUT.i];
  }
  if (!s){ tutEnd(); return; }
  if (TUT.kind === "battle" && G.st.winner && !s.end){ TUT.i = TUT.steps.findIndex(x => x.end); s = TUT.steps[TUT.i]; }
  const root = tutEls(), el = s.el ? s.el() : null, bub = root.querySelector(".tut-bub"), hole = root.querySelector(".tut-hole");
  // 押すところが変わったら、画面の外なら真ん中までスクロール
  if (el && TUT.lastEl !== el){ TUT.lastEl = el; const r0 = el.getBoundingClientRect(); if (r0.top < 70 || r0.bottom > innerHeight - 70) el.scrollIntoView({ block: "center" }); }
  const r = el ? el.getBoundingClientRect() : null, pad = 6, W = innerWidth, H = innerHeight;
  const box = r ? { l: Math.max(0, r.left - pad), t: Math.max(0, r.top - pad), r: Math.min(W, r.right + pad), b: Math.min(H, r.bottom + pad) } : null;
  const set = (k, x, y, w, h) => { const d = root.querySelector(`.tut-sh[data-k="${k}"]`); d.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`; };
  if (box){ set("t", 0, 0, W, box.t); set("b", 0, box.b, W, H - box.b); set("l", 0, box.t, box.l, box.b - box.t); set("r", box.r, box.t, W - box.r, box.b - box.t); hole.hidden = false; hole.style.cssText = `left:${box.l}px;top:${box.t}px;width:${box.r - box.l}px;height:${box.b - box.t}px`; }
  else { set("t", 0, 0, W, H); set("b", 0, 0, 0, 0); set("l", 0, 0, 0, 0); set("r", 0, 0, 0, 0); hole.hidden = true; }
  const btns = s.end ? `<button class="primary" data-tutb="maker">カードを描きに行く</button><button data-tutb="done">おわる</button>` : `${s.next ? `<button class="primary" data-tutb="next">${s.next}</button>` : ""}<button class="ghost small" data-tutb="quit">やめる</button>`;
  const html = `<div class="tut-txt">${s.t}</div>${s.wait ? `<div class="tut-wait"><span></span><span></span><span></span></div>` : ""}<div class="row tut-btns">${btns}</div>`;
  if (bub.dataset.step !== TUT.kind + TUT.i){ bub.dataset.step = TUT.kind + TUT.i; bub.innerHTML = html; }
  const bw = Math.min(360, W - 24); bub.style.width = bw + "px";
  const bh = bub.offsetHeight;
  let top, left;
  if (box){ left = Math.max(12, Math.min(W - bw - 12, (box.l + box.r) / 2 - bw / 2)); top = box.b + 12 + bh < H ? box.b + 12 : box.t - 12 - bh >= 0 ? box.t - 12 - bh : (box.t > H / 2 ? 12 : Math.max(12, H - bh - 12)); }
  else { left = (W - bw) / 2; top = Math.max(12, (H - bh) / 2); }
  bub.style.left = left + "px"; bub.style.top = top + "px";
}
// はじめて来た人に「練習バトルをやる？」と聞く（1回だけ）
function tutAskFirst(){
  if (ls.get("cb_tutSeen", false) || document.getElementById("tutAsk") || G) return;
  const d = document.createElement("div"); d.id = "tutAsk"; d.className = "tut-ask";
  d.innerHTML = `<b>はじめての人へ</b><p>5分くらいの練習バトルで、遊び方を覚えよう！</p><div class="row"><button class="primary" data-tut="battle">練習バトルをやる</button><button class="ghost" data-tutno>あとで</button></div><p class="note">あとからでも「Guide」から始められます</p>`;
  document.body.appendChild(d);
}
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-tut]"); if (t){ tutStart(t.dataset.tut); return; }
  if (e.target.closest && e.target.closest("[data-tutno]")){ ls.set("cb_tutSeen", true); const a = document.getElementById("tutAsk"); if (a) a.remove(); }
});
addEventListener("resize", () => { if (TUT.on) tutTick(); });
addEventListener("scroll", () => { if (TUT.on) tutTick(); }, { passive: true });
setTimeout(tutAskFirst, 1800);


