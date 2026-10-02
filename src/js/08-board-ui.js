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
  const st = G.st, w = st.pending ? (st.pending.wait ? O(st.pending.by) : null) : st.turn; if (!w) return null;
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
  renderAll();
  if (G.mode === "cpu") scheduleCpu();
}
function scheduleCpu(){
  if (!G || G.mode !== "cpu" || G.cpuT || G.st.winner || G.chooseQ.length) return;
  const st = G.st, c = "b";
  // CPU as defender
  if (st.pending && st.pending.wait && st.pending.by !== c) {
    G.cpuT = setTimeout(() => { G.cpuT = null; act(st => { const win = chainWindow(st); const o = responseOptions(st, c, win); const top = st.chain && st.chain[st.chain.length - 1]; const pick = o.length && Math.random() < (win === "attack" ? .75 : top && top.summon ? .6 : .5) ? o[Math.floor(Math.random() * o.length)] : null; respond(st, c, pick && { from: pick.from, i: pick.i }); }); }, 900);
    return;
  }
  if (st.turn !== c || st.pending) return;
  G.cpuT = setTimeout(() => { if (!G) return; G.cpuT = null; act(st => cpuStep(st, c)); }, 900);
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
    const mons = p.hand.map((id, i) => [i, card(id)]).filter(([, c]) => cardType(c) === "monster" && canPay(st, s, c) && !(ssOf(c) || {}).only).sort((a, b) => cmpNum(baseAtk(b[1]), baseAtk(a[1])));
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
  // 3. set traps
  const ti = p.hand.findIndex(id => cardType(card(id)) === "trap");
  if (ti >= 0 && freeZone(p.sz) >= 0){ setCard(st, s, ti); return; }
  // 4. attack
  if (st.turnNo > 1){
    for (let i = 0; i < ZONES; i++){
      const m = p.mz[i]; if (!m || !canAttack(st, s, i)) continue;
      const tt = tauntIdx(st, O(s));
      const opMons = tt.length ? tt : op.mz.map((x, j) => x ? j : -1).filter(j => j >= 0);
      if (!tt.length && (!opMons.length || hasAb(st, s, i, "direct"))){ declareAttack(st, s, i, "direct"); return; }
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
function renderBoard(){
  recordResult();
  exAutoReturn();
  const st = G.st, me = G.slot, op = O(me), pm = P(st, me), po = P(st, op);
  const myTurn = st.turn === me, free = canAct(st, me);
  const sel = G.sel, atkFrom = G.atkFrom;
  const dropKind = dropTarget(st, me);
  const eqMode = equipMode(st, me);
  const zoneHTML = (s, kind) => P(st, s)[kind].map((z, i) => {
    const mine = s === me;
    const attrs = `data-z="${kind}" data-s="${s === me ? "me" : "op"}" data-i="${i}"`;
    const tt = atkFrom != null ? tauntIdx(st, op) : [];
    const isTarget = (atkFrom != null && !mine && kind === "mz" && z && (!tt.length || tt.includes(i))) || (eqMode && kind === "mz" && z && canEquipOn(st, eqMode.id, s, i));
    const pendSummon = !z && kind === "mz" && st.chain && st.chain.find(l => l.summon && l.s === s && l.z === i);
    if (pendSummon) return cardHTML(card(pendSummon.c), "dim", attrs.replace('data-z="mz"', 'data-z="pending"'), { done: "召喚中…", ...mOpt(s) });
    if (!z) return `<div class="slot ${mine && dropKind === kind ? "drop" : ""}" ${attrs}></div>`;
    const selected = sel && sel.z === kind && sel.s === (mine ? "me" : "op") && sel.i === i;
    const cls = `pick ${selected ? "sel" : ""} ${isTarget ? "target" : ""}`;
    if (kind === "sz"){
      if (z.face) return cardHTML(card(z.c), cls, attrs, mOpt(s));
      if (!mine || G.spectate) return backHTML(cls, attrs, P(st, s).sleeve);
      return cardHTML(card(z.c), `${cls} isset`, attrs, mOpt(s));
    }
    const es = eqsOf(z), cap = eqCapOf(card(z.c));
    const eqB = es.length ? `装備${es.length} ${eqUsed(z)}/${cap}` : "";
    const ttl = es.length ? ` title="${esc("装備（左から）：" + es.map(e => card(e.c).name).join("→"))}"` : "";
    const stt = z.attacked && s === st.turn ? "攻撃済" : (z.atkCount && s === st.turn ? "あと1回" : "") || (charmActive(st, z) ? "魅了" : "") || ((z.noAtkTurn || 0) >= st.turnNo ? "攻撃できない" : "");
    const zz = sick(st, s, i) ? " sick" : "";
    return cardHTML(card(z.c), cls + zz, attrs + (zz ? ` title="召喚酔い：次の自分のターンから攻撃できる"` : ttl), { mod: modOf(z), done: stt, eq: eqB, dmg: z.dmg || 0, vuln: z.vuln || 0, weak: z.weak || 0, ...mOpt(s) });
  }).join("");

  // action bar
  let acts = "", hint = "", handActs = "";
  if (st.winner){
    hint = `<span class="big">${st.winner === "draw" ? "引き分け" : G.spectate ? `${esc(nm(st, st.winner))} の勝ち！` : st.winner === me ? "あなたの勝ち！" : "あなたの負け…"}</span><br>${esc(st.why)}`;
    const rm = st.rematch || {};
    if (G.spectate) acts = `<button class="primary" data-act="leave">観戦をやめる</button>`;
    else if (G.mode !== "online") acts = `<button class="primary" data-act="rematch">再戦する</button><button data-act="leave">ロビーにもどる</button>`;
    else {
      acts = `<button class="primary" data-act="rematch" ${rm[me] ? "disabled" : ""}>${rm[me] ? "相手の返事を待っています…" : rm[op] ? "再戦を受ける！" : "再戦をもうしこむ"}</button><button data-act="leave">ロビーにもどる</button>`;
      if (rm[op] && !rm[me]) hint += `<br><b>${esc(po.name)} が再戦をもうしこんでいます！</b>`;
    }
  } else if (st.pending){
    hint = st.pending.type === "chain" ? (st.pending.by === me ? "相手がチェーンするか考えています…" : "チェーンするか選んでね") : st.pending.by === me ? (st.pending.type === "end" ? "ターン終了前に、相手が速攻魔法・罠を使うか考えています…" : "相手が罠・速攻魔法を使うか考えています…") : (st.pending.type === "end" ? "相手のターン終了前です" : "攻撃されています！");
  } else if (!myTurn){
    hint = `${esc(po.name)} のターンです`;
  } else if (atkFrom != null){
    const noMons = !po.mz.some(Boolean), tt = tauntIdx(st, op), canDirect = !tt.length && (noMons || hasAb(st, me, atkFrom, "direct"));
    hint = noMons ? "相手の場にモンスターがいない！" : tt.length ? "このモンスターにしか攻撃できない！（光っているモンスター）" : canDirect ? "攻撃する相手モンスターをえらぶか、直接攻撃！" : "攻撃する相手モンスターをえらんでね";
    acts = (canDirect ? `<button class="primary" data-act="direct">直接攻撃！</button>` : "") + `<button class="ghost" data-act="cancelAtk">やめる</button>`;
  } else {
    hint = st.turnNo === 1 ? "先攻の1ターン目は攻撃できません" : "カードをえらんで行動しよう";
    if (sel && sel.z === "hand"){
      const a0 = acts.length;
      const c = card(pm.hand[sel.i]), t = cardType(c);
      const afford = canPay(st, me, c), short = afford ? "" : costWhy(st, me, c) ? `（${costWhy(st, me, c)}）` : `（マナが${effCost(st, me, c) - pm.mana.cur}足りない）`;
      if (t === "monster"){
        const ss = ssOf(c);
        const tn = tribOf(c, st, me), mineN = pm.mz.filter(m => m && (!c.tribTag || hasTag(m.c, c.tribTag))).length;
        if (!(ss && ss.only)){ const ok = canSummonNow(st, me) && afford && (tn ? mineN >= tn : freeZone(pm.mz) >= 0); acts += `<button class="primary" data-act="summon" ${ok ? "" : "disabled"}>${tn ? "生贄召喚する" : "召喚する"}${!canSummonNow(st, me) ? "（このターンは召喚ずみ）" : tn && mineN < tn ? `（生贄が${tn}体いる）` : short}</button>`; if (ok) hint = tn ? `自分のモンスター${tn}体を生贄にして召喚します` : "光っているモンスターゾーンをクリックしても召喚できます"; }
        else hint = "このカードは特殊召喚でしか出せません";
        if (ss){ const why = ssBlock(st, me, sel.i); acts += `<button class="mg" data-act="ssummon" ${why ? "disabled" : ""}>特殊召喚する${why ? `（${why}）` : ""}</button>`; }
      }
      if (!afford && t !== "monster") hint = `今は使えません${short}${c.frame === "spire" ? "" : "。セットはできます"}`;
      else if (t !== "equip") hint = "光っている魔法・罠ゾーンをクリックしてもセットできます";
      if (t === "magic"){ const full = isPersist(c) && freeZone(pm.sz) < 0; acts += `<button class="mg" data-act="activateHand" ${afford && !full ? "" : "disabled"}>発動する${full ? "（魔法・罠ゾーンがいっぱい）" : short}</button>`; }
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
        { const ok = t === "magic" || z.turn < st.turnNo, af = canPay(st, me, card(z.c)); acts += `<button class="${t === "trap" ? "tr" : "mg"}" data-act="activateSet" ${ok && af ? "" : "disabled"}>発動する${!ok ? "（次のターンから）" : !af ? "（マナが足りない）" : ""}</button>`; }
      }
    }
    acts += `<button data-act="endTurn">ターン終了</button>`;
  }
  // manual tools for the selected field monster
  let manual = "";
  if (!st.winner && sel && (sel.z === "mz" || sel.z === "sz")){
    const X = sel.s === "me" ? pm : po, z = X[sel.z][sel.i];
    if (z && (sel.s === "me" || sel.z === "mz" || z.face)){
      manual = `<div class="row" style="justify-content:center;gap:6px"><span class="note">手動：「${esc(card(z.c).name)}」</span>${sel.z === "mz" ? `<button class="small" data-man="atk" data-d="-50">ATK−50</button><button class="small" data-man="atk" data-d="50">ATK+50</button>${eqsOf(z).map((e, k) => `<button class="small" data-man="uneq" data-k="${k}">「${esc(card(e.c).name)}」を外す</button>`).join("")}` : ""}<button class="small danger" data-man="grave">墓地へ送る</button>${sel.s === "me" ? `<button class="small" data-man="hand">手札に戻す</button>` : ""}</div>`;
    }
  }
  if (G.spectate && !st.winner){ hint = `観戦中：${esc(pm.name)} vs ${esc(po.name)}`; acts = `<button class="ghost" data-act="leave">観戦をやめる</button>`; manual = ""; }
  const last = st.log[st.log.length - 1];
  const handHTML = G.spectate ? (pm.hand.map(() => backHTML("", "", pm.sleeve)).join("") || `<p class="muted">手札なし</p>`) : pm.hand.map((id, i) => cardHTML(card(id), `pick ${sel && sel.z === "hand" && sel.i === i ? "sel" : ""} ${pm.exTemp && pm.exTemp.i === i && pm.exTemp.id === id ? "ex-temp" : ""} ${pm.mana && !canPay(st, me, card(id)) && cardType(card(id)) !== "trap" ? "dim" : ""}`, `data-z="hand" data-s="me" data-i="${i}" tabindex="0" role="button"`, mOpt(me))).join("") || `<p class="muted">手札なし</p>`;
  const logHTML = st.log.slice(-60).reverse().map(l => `<li>${l.s ? `<b>${esc(nm(st, l.s))}</b>：` : ""}${esc(l.m)}</li>`).join("");
  const prev = G.prevLp || {}; G.prevLp = { me: pm.lp, op: po.lp };
  const manaBox = (p, who) => p.mana ? `<div class="manabar" title="${who}のマナ"><span class="lbl">${who}のマナ</span><b>${p.mana.cur}<small>/${p.mana.max}</small></b><span class="gems">${Array.from({ length: Math.max(p.mana.max, p.mana.cur) }, (_, k) => `<i class="${k < p.mana.cur ? "" : "off"}"></i>`).join("")}${Array.from({ length: Math.max(0, MAX_MANA - Math.max(p.mana.max, p.mana.cur)) }, () => `<i class="lock"></i>`).join("")}</span></div>` : "";
  const lpBox = (p, key) => `<div id="lp-${key}" class="lp ${p.lp <= 300 ? "low" : ""} ${prev[key] != null && p.lp < prev[key] ? "hurt" : ""}"><small>LP</small><b>${p.lp}</b></div>`;

  $("#board").innerHTML = `
  <div class="board">
    <div class="table">
      ${manaBox(po, esc(po.name))}${blockBox(po, esc(po.name))}
      <div class="mstat"><span class="who">${esc(po.name)}</span><span>山札 ${po.deck.length}</span>${(po.ex || []).length ? `<span>EX ${po.ex.length}</span>` : ""}<button class="chip" data-grave="op:grave">墓地 ${po.grave.length}</button>${(po.exile || []).length ? `<button class="chip" data-grave="op:exile">廃棄 ${po.exile.length}</button>` : ""}<span class="lpv ${po.lp <= 300 ? "low" : ""}"><small>LP</small>${po.lp}</span></div>
      <div class="ohand">${backHTML("xs", "", po.sleeve)}<span class="cnt-x">×${po.hand.length - (exTempOk(po) ? 1 : 0)}</span><span class="lbl">手札（${esc(po.name)}）</span></div>
      <span class="zlabel">相手の魔法・罠ゾーン</span>
      <div class="zones">${zoneHTML(op, "sz")}</div>
      <span class="zlabel">相手のモンスターゾーン</span>
      <div class="zones">${zoneHTML(op, "mz")}</div>
      <div class="bz">
        ${st.field ? `<div class="fieldz" data-field title="フィールド（お互いに効く）"><span class="flbl">フィールド</span>${cardHTML(card(st.field.c), "xs pick", `data-field tabindex="0" role="button"`)}<span class="note">${esc(P(st, st.field.o).name)} が出した</span></div>` : ""}
        <h2>バトルゾーン</h2>
        <div class="turnline">ターン${st.turnNo}・${G.spectate ? `<span class="me">${esc(P(st, st.turn).name)} のターン</span>` : myTurn ? `<span class="me">あなたのターン</span>` : `<span class="op">${esc(po.name)} のターン</span>`}${myTurn && !pm.mana && !st.summoned ? "（召喚できる）" : ""}</div>
        <div class="lastlog">${last ? esc((last.s ? nm(st, last.s) + "：" : "") + last.m) : ""}</div>
        <div id="turnTimer" class="turn-timer">${timerHTML()}</div>
        <div class="msg">${hint}</div>
        <div class="actions">${acts}</div>
        ${manual}
      </div>
      <span class="zlabel">自分のモンスターゾーン</span>
      <div class="zones">${zoneHTML(me, "mz")}</div>
      <span class="zlabel">自分の魔法・罠ゾーン</span>
      <div class="zones">${zoneHTML(me, "sz")}</div>
      <div class="mstat"><span class="who">${esc(pm.name)}${G.spectate ? "" : "（あなた）"}</span><button class="chip" data-grave="me:deck">山札 ${pm.deck.length}</button>${(pm.ex || []).length ? `<button class="chip exchip" data-exopen>EX ${pm.ex.length}</button>` : ""}<button class="chip" data-grave="me:grave">墓地 ${pm.grave.length}</button>${(pm.exile || []).length ? `<button class="chip" data-grave="me:exile">廃棄 ${pm.exile.length}</button>` : ""}<span class="lpv ${pm.lp <= 300 ? "low" : ""}"><small>LP</small>${pm.lp}</span></div>
      <span class="zlabel">手札</span>
      <div class="hand">${handHTML}</div>
      ${handActs ? `<div class="actions hand-acts">${handActs}</div>` : ""}
      ${manaBox(pm, "あなた")}${blockBox(pm, "あなた")}
    </div>
    <aside class="side">
      <div class="box" style="display:flex;flex-direction:column;gap:12px">
        <div class="pl"><div><div class="nm">${esc(po.name)}</div><div class="pile">山札 ${po.deck.length}${(po.ex || []).length ? ` EX ${po.ex.length}` : ""}<button class="chip" data-grave="op:grave">墓地 ${po.grave.length}</button>${(po.exile || []).length ? `<button class="chip" data-grave="op:exile">廃棄 ${po.exile.length}</button>` : ""}</div></div>${lpBox(po, "op")}</div>${potRow(po, false)}
        <div class="pl"><div><div class="nm">${esc(pm.name)}${G.spectate ? "" : "（あなた）"}</div><div class="pile"><button class="chip" data-grave="me:deck">山札 ${pm.deck.length}</button>${(pm.ex || []).length ? `<button class="chip exchip" data-exopen>EX ${pm.ex.length}</button>` : ""}<button class="chip" data-grave="me:grave">墓地 ${pm.grave.length}</button>${(pm.exile || []).length ? `<button class="chip" data-grave="me:exile">廃棄 ${pm.exile.length}</button>` : ""}</div></div>${lpBox(pm, "me")}</div>${potRow(pm, !G.spectate, !G.spectate)}
        ${G.mode === "online" ? `<div class="note">部屋 ${esc(G.code)}</div>` : ""}
      </div>
      <div class="box">
        <h3>手動で効果を処理</h3>
        <div class="adj">
          <span>自分のLP</span><div class="seg">${[-100, -50, 50, 100].map(d => `<button data-adj="me" data-d="${d}" ${st.winner ? "disabled" : ""}>${d > 0 ? "+" : "−"}${Math.abs(d)}</button>`).join("")}</div>
          <span>相手のLP</span><div class="seg">${[-100, -50, 50, 100].map(d => `<button data-adj="op" data-d="${d}" ${st.winner ? "disabled" : ""}>${d > 0 ? "+" : "−"}${Math.abs(d)}</button>`).join("")}</div>
        </div>
        <div class="row" style="margin-top:10px"><button class="small" data-act="draw" ${st.winner ? "disabled" : ""}>1枚引く</button><button class="small" data-act="graveHand" ${st.winner ? "disabled" : ""}>墓地から手札へ</button></div>
        <p class="note" style="margin:6px 0 0">場のカードをえらぶと、ATK±・墓地へ送るボタンが出ます</p>
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
      const el = document.getElementById("lp-" + k); if (!el) continue;
      const c = center(el), d = nowLp[k] - prevLp[k];
      setTimeout(() => fxEl("fxfloat " + (d < 0 ? "neg" : "pos"), (d > 0 ? "+" : "−") + Math.abs(d), c.x, c.r.top), reduceMotion ? 0 : list.length * 200);
    }
  }
  if (reduceMotion) return;
  // one after another: a spell banner gets time to show before its hits, each hit gets its own beat (ツインストライク → 2 hits)
  const GAP = { spell: 900, attack: 560, hit: 420 };
  let t = 0;
  list.forEach(e => { setTimeout(() => { try{ animateEvent(e); }catch(err){} }, t); t += GAP[e.type] || 320; });
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
  if (e.type === "destroy") burst(zoneEl(e.s, "mz", e.z), "撃破！");
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
function renderDetail(info, anim){
  const box = $("#detailPop"); if (!box) return;
  if (!G || !G.detailOpen || !info){ box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false; box.classList.toggle("anim", !!anim);
  if (info.hidden){ box.innerHTML = `${CLOSE}<h3>カード詳細</h3><div class="detailcard">${backHTML("detail", "", info.sleeve)}</div><p class="note" style="margin:0">相手がセットしたカード。中身はひみつ。</p>`; return; }
  const c = card(info.id), t = cardType(c), ft = fxText(c), lim = cardLimit(c);
  const rows = [["種類", isQuick(c) ? "速攻魔法（相手のターンにも使える）" : TYPE_LABEL[t]]];
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
  // equips stuck on this monster, shown as cards from left to right (tap one to read it)
  const eqRow = info.eqList && info.eqList.length ? `<div class="eqrow"><div class="eqlbl">装備（左から順）　${esc(info.cap || "")}</div><div class="eqlist">${info.eqList.map((e, k) => `${k ? `<span class="eqarr">→</span>` : ""}<button class="eqi" data-eqcid="${esc(e.c)}" aria-label="「${esc(card(e.c).name)}」の詳細">${cardHTML(card(e.c), "xs", "", { mana: e.mana })}${e.mult > 1 || e.used || e.opp ? `<span class="eqtag">${[e.mult > 1 ? "×2" : "", e.used ? "使用ずみ" : "", e.opp ? "相手の" : ""].filter(Boolean).join("・")}</span>` : ""}</button>`).join("")}</div></div>` : "";
  const back = G.detailBack ? `<button class="small ghost eqback" data-detailback>← もどる</button>` : "";
  box.innerHTML = `${CLOSE}<h3>カード詳細</h3>${back}<div class="detailcard">${cardHTML(c, "detail", "", { mod: info.mod, mana: info.mana })}</div>${eqRow}<dl class="dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${tkLink(esc(v))}</dd>`).join("")}</dl>`;
}
$("#detailPop").addEventListener("click", e => {
  if (!G) return;
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
  if (t.closest && (t.closest("#detailPop") || t.closest(".card[data-z]") || t.closest(".card[data-cid]"))) return;
  G.detailOpen = false; renderDetail(null);
});

function renderOverlay(){
  const ov = $("#overlay");
  if (!G || !G.st || !G.st.started || S.tab !== "play"){ ov.hidden = true; ov.innerHTML = ""; return; }
  const st = G.st, me = G.slot;
  let html = "";
  const myP = !G.spectate && st.players && st.players[me], rp = myP && !st.winner ? myP.relicPick : null;
  if (rp === "sprout"){
    const L = [...myP.deck.map((id, i) => ["deck:" + i, id]), ...myP.hand.map((id, i) => ["hand:" + i, id])].sort((a, b) => card(a[1]).name.localeCompare(card(b[1]).name, "ja"));
    const list = L.map(([k, id]) => cardHTML(card(id), "sm pick", `data-sprout="${k}" tabindex="0" role="button"`, mOpt(me))).join("");
    html = `<div class="box"><h2 style="margin:0">若葉：変えるカードをえらぶ</h2><p class="muted" style="margin:0">デッキの${L.length}枚からえらんだ1枚が、ランダムなスパイア風カードに変わります（手札はこのあと引きます）</p><div class="gallery">${list || '<p class="muted">カードがありません</p>'}</div></div>`;
  } else if (Array.isArray(rp)){
    html = `<div class="box"><h2 style="margin:0">ネオーの祝福：レリックを1つえらぶ</h2><p class="muted" style="margin:0">スパイアデッキのはじまりに、どれか1つだけ手に入る</p><div class="relic-pick">${rp.map(k => [k, relicDef(k)]).filter(x => x[1]).map(([k, d]) => `<button data-relic="${esc(k)}">${d.img ? `<img class="rl-img" alt="" src="${d.img}">` : ""}<b>${esc(d.name)}</b>${esc(d.text)}</button>`).join("")}</div></div>`;
  } else if (G.chooseQ.length && G.chooseQ[0].ask){
    const q = G.chooseQ[0];
    const yesTxt = q.block ? effsText(q.c, q.block.b.then) + (q.block.b.else.length ? `／「いいえ」なら：${effsText(q.c, q.block.b.else)}` : "") : KINDS[q.fx.kind].text(q.fx.n);
    html = `<div class="box"><h2 style="margin:0">「${esc(q.c.name)}」</h2><p style="margin:0;font-size:18px;font-weight:700">${esc(q.fx.ask)}</p><p class="muted" style="margin:0">「はい」なら：${esc(yesTxt)}</p><div class="row"><button class="primary" data-ask="yes">はい</button><button data-ask="no">いいえ</button></div></div>`;
  } else if (G.chooseQ.length){
    const q = G.chooseQ[0], TS = q.ctx && q.ctx.side === "me" ? q.s : O(q.s), opts = (targetOptions(st, q.s, q.fx.kind, q.ctx) || []).filter(o => !(q.fx.distinct && q.ctx.hit && (q.ctx.hit.picked || []).includes(String(o))));
    const t = KINDS[q.fx.kind].target;
    const list = opts.map(o => {
      if (t === "grave" || t === "draft" || t === "graveAny" || t === "tagPick") return cardHTML(card(o), "sm pick", `data-opt="${esc(o)}" tabindex="0" role="button"`, mOpt(q.s));
      if (t === "hand") return cardHTML(card(P(st, q.s).hand[o]), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, mOpt(q.s));
      if (t === "any"){ const [os, oi] = o.split(":"), m = P(st, os).mz[+oi]; return `<div class="g-item">${cardHTML(card(m.c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, { mod: modOf(m), ...mOpt(os) })}<div class="meta">${os === me ? "自分" : "相手"}</div></div>`; }
      if (o === "p"){ const X = P(st, TS); return `<button class="pick-player" data-opt="p">${esc(X.name)}<br><small>LP ${X.lp}${X.block ? `・ブロック ${X.block}` : ""}</small></button>`; }
      if (typeof o === "string" && o.startsWith("m:")){ const i = +o.slice(2), m = P(st, TS).mz[i]; return cardHTML(card(m.c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, { mod: modOf(m), ...mOpt(TS) }); }
      const X = t === "opp" ? P(st, TS) : P(st, q.s);
      return cardHTML(card(X.mz[o].c), "sm pick", `data-opt="${o}" tabindex="0" role="button"`, { mod: modOf(X.mz[o]), ...mOpt(t === "opp" ? TS : q.s) });
    }).join("");
    html = `<div class="box"><h2 style="margin:0">「${esc(q.c.name)}」の対象をえらぶ</h2><p class="muted" style="margin:0">${esc(q.ctx.spireAtk ? fxText0(q.c) : KINDS[q.fx.kind].text(q.fx.n))}</p><div class="gallery">${list || '<p class="muted">対象がいません</p>'}</div><div class="row"><button class="ghost" data-close="choose">使わない</button></div></div>`;
  } else if (G.costPick && !st.winner){
    const cp = G.costPick, pm = P(st, me), L = pm.hand.map((id, j) => j).filter(j => j !== cp.hi && (!cp.tag || hasTag(pm.hand[j], cp.tag)));
    const list = L.map(j => { const on = cp.picked.includes(j); return cardHTML(card(pm.hand[j]), `sm pick ${on ? "sel" : ""}`, `data-cpick="${j}" tabindex="0" role="button" aria-pressed="${on}"`, mOpt(me)); }).join("");
    html = `<div class="box"><h2 style="margin:0">「${esc(cp.name)}」のコスト</h2><p class="muted" style="margin:0">捨てる手札を${cp.need}枚えらんでね（${cp.picked.length} / ${cp.need}）</p><div class="gallery">${list}</div><div class="row"><button class="primary" data-cpgo ${cp.picked.length === cp.need ? "" : "disabled"}>捨てて使う</button><button class="ghost" data-close="costpick">やめる</button></div></div>`;
  } else if (st.pending && st.pending.wait && st.pending.by !== me && !st.winner && !G.spectate){
    const pd = st.pending, A = P(st, pd.by);
    const win = chainWindow(st);
    const opts = responseOptions(st, me, win);
    const list = opts.map(o => `<div class="g-item">${cardHTML(o.c, "sm pick", `data-resp="${o.from}:${o.i}" tabindex="0" role="button"`, mOpt(me))}<div class="meta">${o.from === "hand" ? "手札から" : o.from === "eq" ? "装備の力" : "セット中"}</div></div>`).join("");
    let head, msg;
    if (win === "attack"){
      const am = A.mz[pd.from];
      const tgt = pd.to === "direct" ? "あなたに直接攻撃" : `「${card(P(st, me).mz[pd.to]?.c).name}」に攻撃`;
      head = "攻撃されています！"; msg = `${A.name} の「${am ? card(am.c).name : "？"}」（ATK ${am ? fmtN(atkOf(am)) : 0}）が${tgt}してきた。罠か速攻魔法を使う？`;
    } else if (win === "end"){ head = `${A.name} がターンを終えようとしています`; msg = "ターンが変わる前に、速攻魔法か罠を使う？"; }
    else {
      const top = st.chain[st.chain.length - 1];
      head = top.summon ? `「${card(top.c).name}」が${top.special ? "特殊召喚" : "召喚"}されようとしている！` : `「${card(top.c).name}」が発動された！`;
      msg = "罠か速攻魔法でチェーンする？（あとから発動したものから順に処理されます）";
    }
    const chainHTML = st.chain && st.chain.length ? `<div class="chainrow">${st.chain.map((l, k) => `<span class="link ${l.s === me ? "mine" : ""}">${k + 1}. ${l.summon ? (l.special ? "特殊召喚：" : "召喚：") : ""}${esc(card(l.c).name)}<small>${l.s === me ? "あなた" : esc(P(st, l.s).name)}</small></span>`).join('<span class="arr">→</span>')}</div>` : "";
    html = `<div class="box"><h2 style="margin:0">${esc(head)}</h2>${chainHTML}<p style="margin:0">${esc(msg)}</p><div class="gallery">${list}</div><div class="row"><button data-close="notrap">${win === "chain" || win === "chainAttack" ? "チェーンしない" : "使わない"}</button></div></div>`;
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
    const opts = sp.kind === "tribute" ? pm.mz.map((m, i) => m && (!sp.tag || hasTag(m.c, sp.tag)) ? i : -1).filter(i => i >= 0) : pm.hand.map((id, i) => i).filter(i => i !== sp.hi);
    const list = opts.map(i => { const on = sp.picked.includes(i), cc = sp.kind === "tribute" ? card(pm.mz[i].c) : card(pm.hand[i]); return cardHTML(cc, `sm pick ${on ? "sel" : ""}`, `data-sspick="${i}" tabindex="0" role="button" aria-pressed="${on}"`, sp.kind === "tribute" ? { mod: modOf(pm.mz[i]), ...mOpt(me) } : mOpt(me)); }).join("");
    html = `<div class="box"><h2 style="margin:0">「${esc(c.name)}」を${sp.normal ? "生贄召喚" : "特殊召喚"}</h2><p class="muted" style="margin:0">${sp.kind === "tribute" ? `墓地へ送るモンスターを${sp.need}体えらんでね` : `捨てる手札を${sp.need}枚えらんでね`}（${sp.picked.length} / ${sp.need}）</p><div class="gallery">${list}</div><div class="row"><button class="primary" data-ssgo ${sp.picked.length === sp.need ? "" : "disabled"}>${sp.normal ? "生贄召喚する" : "特殊召喚する"}</button><button class="ghost" data-close="sspick">やめる</button></div></div>`;
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
  ov.hidden = !html; ov.innerHTML = html;
}
$("#overlay").addEventListener("click", e => {
  { const gv = e.target.closest("[data-grave]"); if (gv && G){ G.view = gv.dataset.grave; renderAll(); return; } }
  { const xu = e.target.closest("[data-exuse]"); if (xu && G && !G.spectate){ const k = +xu.dataset.exuse, me = G.slot; let hi = -1, id = null; G.exView = false; act(st => { const p = P(st, me); if (!canAct(st, me) || p.ex[k] == null) return false; exReturnP(st, me); id = p.ex.splice(k, 1)[0]; p.hand.push(id); hi = p.hand.length - 1; p.exTemp = { id, i: hi }; G.sel = { z: "hand", s: "me", i: hi }; G.atkFrom = null; }); if (hi < 0) renderAll(); return; } }
  if (!G) return;
  const ak = e.target.closest("[data-ask]");
  if (ak && G.chooseQ.length && G.chooseQ[0].ask){
    const q = G.chooseQ.shift(), yes = ak.dataset.ask === "yes";
    if (q.block){ act(st => { log(st, q.s, `「${q.c.name}」：「${q.fx.ask}」→ ${yes ? "はい" : "いいえ"}`); q.block.go(st, q.block.fin(yes)); }); return; }
    act(st => { log(st, q.s, `「${q.c.name}」：「${q.fx.ask}」→ ${yes ? "はい" : "いいえ"}`); if (yes) runEffect(st, q.s, q.c, q.ctx, q.then, { ...q.fx, ask: "" }); else q.then && q.then(st); });
    return;
  }
  const cpk = e.target.closest("[data-cpick]");
  if (cpk && G.costPick){ const j = +cpk.dataset.cpick, cp = G.costPick; if (cp.picked.includes(j)) cp.picked = cp.picked.filter(x => x !== j); else if (cp.picked.length < cp.need) cp.picked.push(j); renderAll(); return; }
  if (e.target.closest("[data-cpgo]") && G.costPick){ const cp = G.costPick; G.costPick = null; cp.go(cp.picked.slice()); return; }
  const spk = e.target.closest("[data-sspick]");
  if (spk && G.ssPick){ const i = +spk.dataset.sspick, sp = G.ssPick; if (sp.picked.includes(i)) sp.picked = sp.picked.filter(x => x !== i); else if (sp.picked.length < sp.need) sp.picked.push(i); renderAll(); return; }
  if (e.target.closest("[data-ssgo]") && G.ssPick){ const sp = G.ssPick; G.ssPick = null; if (sp.normal) withDiscard(card(P(st0(), G.slot).hand[sp.hi]), sp.hi, d => act(st => summon(st, G.slot, sp.hi, null, d, sp.picked))); else act(st => specialSummon(st, G.slot, sp.hi, sp.picked)); return; }
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
  const opt = e.target.closest("[data-opt]");
  if (opt && G.chooseQ.length){
    const q = G.chooseQ.shift(); const t = KINDS[q.fx.kind].target;
    const target = t === "grave" || t === "any" || t === "draft" || t === "graveAny" || t === "tagPick" || q.ctx.spireAtk ? opt.dataset.opt : +opt.dataset.opt;
    act(st => { applyEffect(st, q.s, q.c, target, q.ctx, q.fx); q.then && q.then(st); });
    return;
  }
  const tr = e.target.closest("[data-resp]");
  if (tr){ const [from, i] = tr.dataset.resp.split(":"), X = P(st0(), G.slot), rc = card(from === "hand" ? X.hand[+i] : from === "sz" && X.sz[+i] ? X.sz[+i].c : null); withDiscard(rc, from === "hand" ? +i : -1, d => act(st => respond(st, G.slot, { from, i: +i, disc: d }))); return; }
  const gh = e.target.closest("[data-gh]");
  if (gh){ const id = gh.dataset.gh; G.graveHand = false; act(st => { const p = P(st, G.slot), k = p.grave.indexOf(id); if (k < 0) return false; p.grave.splice(k, 1); p.hand.push(id); log(st, G.slot, `（手動）墓地の「${card(id).name}」を手札に戻した`); }); return; }
  const ci = e.target.closest("[data-cid]");
  if (ci){ openDetail(["id", ci.dataset.cid]); return; }
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
  const pb = e.target.closest("[data-potion]");
  if (pb){ if (canAct(st, me)){ G.potPick = +pb.dataset.potion; renderAll(); } return; }
  const zc = e.target.closest("[data-z]");
  if (zc){
    const z = zc.dataset.z, s = zc.dataset.s, i = +zc.dataset.i;
    const em = equipMode(st, me);
    if (em && z === "mz" && P(st, s === "me" ? me : O(me)).mz[i]){
      const ts = s === "me" ? me : O(me);
      if (!canEquipOn(st, em.id, ts, i)){ toast("装備キャパが足りないので付けられません"); return; }
      if (eqsOf(P(st, ts).mz[i]).length){ G.eqPlace = { hi: em.i, s: ts, i }; renderAll(); return; }
      G.sel = null; withDiscard(card(em.id), em.i, d => act(st => equip(st, me, em.i, ts, i, null, d))); return;
    }
    if (G.atkFrom != null && s === "op" && z === "mz" && P(st, O(me)).mz[i]){ const tt = tauntIdx(st, O(me)); if (tt.length && !tt.includes(i)){ toast("このモンスターには攻撃できない（ほかに狙わなきゃいけないモンスターがいる）"); return; } const from = G.atkFrom; G.atkFrom = null; G.sel = null; act(st => declareAttack(st, me, from, i)); return; }
    const occupied = z === "hand" || P(st, s === "me" ? me : O(me))[z][i];
    if (!occupied){
      const dk = s === "me" ? dropTarget(st, me) : null;
      if (dk && dk === z){ const hi = G.sel.i; G.sel = null; if (dk === "mz"){ const tn = tribOf(card(P(st, me).hand[hi]), st, me); if (tn){ G.ssPick = { hi, kind: "tribute", need: tn, picked: [], normal: true, tag: card(P(st, me).hand[hi]).tribTag || "" }; renderAll(); } else withDiscard(card(P(st, me).hand[hi]), hi, d => act(st => summon(st, me, hi, i, d))); } else act(st => setCard(st, me, hi, i)); }
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
      if (st.pending && st.pending.wait) respond(st, w, null); else { exReturnP(st, w); endTurn(st, w); }
    });
    return;
  }
  if (k === "surrender"){ if (!G.surArm){ G.surArm = true; renderAll(); setTimeout(() => { if (G){ G.surArm = false; renderAll(); } }, 3000); return; } act(st => { st.winner = O(me); st.why = `${nm(st, me)} が投了`; log(st, me, "投了した"); }); return; }
  if (k === "draw"){ act(st => drawN(st, me, 1, "（手動）")); return; }
  if (k === "graveHand"){ G.graveHand = true; renderAll(); return; }
  if (!canAct(st, me)) return;
  if (k === "endTurn"){ G.sel = null; G.atkFrom = null; G.eqPlace = null; act(st => { exReturn(st); return endTurn(st, me); }); return; }
  if (k === "cancelAtk"){ G.atkFrom = null; renderAll(); return; }
  if (k === "cancelEq"){ G.equipFrom = null; renderAll(); return; }
  if (k === "direct"){ const from = G.atkFrom; G.atkFrom = null; G.sel = null; act(st => declareAttack(st, me, from, "direct")); return; }
  if (!sel) return;
  if (k === "summon"){ G.sel = null; const tn = tribOf(card(P(st, me).hand[sel.i]), st, me); if (tn){ G.ssPick = { hi: sel.i, kind: "tribute", need: tn, picked: [], normal: true, tag: card(P(st, me).hand[sel.i]).tribTag || "" }; renderAll(); } else withDiscard(card(P(st, me).hand[sel.i]), sel.i, d => act(st => summon(st, me, sel.i, null, d))); }
  if (k === "ssummon"){
    const ss = ssOf(card(P(st, me).hand[sel.i])); G.sel = null;
    if (ss && (ss.cost === "tribute" || ss.cost === "discard")){ G.ssPick = { hi: sel.i, kind: ss.cost, need: ss.cn, picked: [] }; renderAll(); }
    else act(st => specialSummon(st, me, sel.i, []));
  }
  if (k === "set"){ G.sel = null; act(st => setCard(st, me, sel.i)); }
  if (k === "activateHand" || k === "activateSet"){
    const from = k === "activateHand" ? "hand" : "sz";
    const id = from === "hand" ? P(st, me).hand[sel.i] : P(st, me).sz[sel.i]?.c;
    const why = useBlockedWhy(st, me, card(id)); if (why){ toast(why); return; }
    const fx = normFx(card(id));
    if (fx && (fx.kind === "negate" || fx.kind === "killAtk")){ toast("この罠は相手に攻撃されたときに使えます"); return; }
    const opts = fx ? targetOptions(st, me, fx.kind, { tagName: fx.into || "" }) : null;
    if (opts && !opts.length){ toast("効果の対象がいないので発動できません"); return; }
    G.sel = null; withDiscard(card(id), from === "hand" ? sel.i : -1, d => act(st => activate(st, me, from, sel.i, d.length ? { disc: d } : {})));
  }
  if (k === "attack"){ G.atkFrom = sel.i; renderAll(); }

});
$("#board").addEventListener("keydown", e => { const h = e.target.closest("[role=button]"); if (h && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); h.click(); } });

