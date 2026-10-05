/* ================= カウンター（みんなで作る「○○カウンター」） ================= */
// 定義: counters/{id} = { name, color, icon(小さい画像), author, ownerId, createdAt, updatedAt }。直せるのは作った人と管理者だけ
// ダメージカウンターも、はじめから入っているカウンターのひとつ（モンスターの m.dmg をそのまま使う）
// カードを保存するとき、使っているカウンターの名前・色・アイコンをカードの中（c.ctrs）にもコピーする → 交換したカードや、カウンターが消されたあとでも表示できる
// 場での数: モンスターは m.ctr = { id: 個数 }、プレイヤーは p.ctr = { id: 個数 }
// 場のカードを指定して除去: どちらの場の・どうする
// 天賦: ゲーム開始時と自分のターンのはじめ、山札にあれば一番上へ（順番はそのまま）
function innateTop(deck){ const a = [], b = []; (deck || []).forEach(id => (card(id) && card(id).innate ? a : b).push(id)); return a.length ? [...a, ...b] : deck; }
// 「このターン使ったカード1枚につき」の絞り込み
const USED_PF = { any: "カード", attack: "アタック", skill: "スキル", power: "パワー", monster: "モンスター", magic: "魔法", trap: "罠", equip: "装備", name: "名前がぴったりのカード", part: "名前に○が入ったカード", tag: "タグ○のカード" };
function usedMatch(c, pf, nm){
  if (!c) return false; pf = USED_PF[pf] ? pf : "any"; nm = String(nm || "");
  if (pf === "any") return true;
  if (pf === "attack" || pf === "skill" || pf === "power") return spireKind(c) === pf;
  if (pf === "monster" || pf === "magic" || pf === "trap" || pf === "equip") return cardType(c) === pf;
  if (!nm) return false;
  return pf === "name" ? c.name === nm : pf === "part" ? (c.name || "").includes(nm) : hasTag(c.id, nm);
}
const usedPfText = m => { const pf = USED_PF[m.pf] ? m.pf : "any", nm = m.pfn || "？"; return pf === "name" ? `「${nm}」` : pf === "part" ? `名前に「${nm}」が入ったカード` : pf === "tag" ? `タグ「${nm}」のカード` : USED_PF[pf]; };
// 能力を付与する（効果）: だれに・どの能力・いつまで
const GAB_W = { self: "このモンスター", mine: "自分のモンスター1体", mineAll: "自分のモンスターすべて", opp: "相手のモンスター1体", oppAll: "相手のモンスターすべて" };
const GAB_D = { "": "ずっと", turn: "このターンだけ", next: "次の自分のターンの終わりまで" };
const GAB_NG = new Set(["sympathy", "sbAtk"]);
const gabList = () => Object.keys(ABS).filter(k => ABS[k].only !== "eq" && !GAB_NG.has(k));
const gabKey = e => e && ABS[e.ab] && gabList().includes(e.ab) ? e.ab : "evoTurn";
function gabAbility(e){ const k = gabKey(e), d = ABS[k]; return { k, ...(d.n ? { n: Math.max(0, Math.round(e && e.n != null ? +e.n : d.n)) } : {}), ...(d.name ? { name: String(e && e.into || "") } : {}) }; }
function gabText(e){ const a = gabAbility(e), w = GAB_W[e && e.gw] ? e.gw : "self", d = GAB_D[e && e.gd] != null && e.gd ? GAB_D[e.gd] + "、" : ""; return `${d}${GAB_W[w]}は${ABS[a.k].kw ? kwStr(a) : abPhrase(a)}を得る`; }
const RB_SIDE = { op: "相手", me: "自分", both: "お互い" }, RB_MODE = { destroy: "破壊する", bounce: "持ち主の手札に戻す", banish: "除外する" };
const CTR_DMG = "dmg";
const CTR_BUILTIN = { dmg: { id: "dmg", name: "ダメージ", color: "#c0392b", icon: "", builtin: true } };
let CTR_EMB = {};
const ctrList = () => [...Object.values(CTR_BUILTIN), ...(S.counters || [])];
const ctrDef = id => CTR_BUILTIN[id] || (S.counters || []).find(x => x.id === id) || CTR_EMB[id] || null;
const ctrNm = id => { const d = ctrDef(id); return d ? d.name : "？"; };
const ctrName = id => ctrNm(id) + "カウンター";
const ctrDefault = () => ((S.counters || [])[0] || CTR_BUILTIN.dmg).id;
// 効果「乗せる・取り除く」のどこに
const CTR_CW = { self: "このモンスター", pick: "モンスター1体をえらぶ", all: "モンスターすべて", player: "プレイヤー" };
function ctrWhereText(m){ const sd = m && m.side === "me" ? "自分" : "相手", cw = m && CTR_CW[m.cw] ? m.cw : "pick"; return cw === "self" ? "このモンスター" : cw === "pick" ? `${sd}のモンスター1体` : cw === "all" ? `${sd}のモンスターすべて` : sd; }
// もし・「1個につき」のどこの
const CTR_AT = { self: "このモンスター", me: "自分", op: "相手", myAll: "自分のモンスター全部", opAll: "相手のモンスター全部" };
const ctrAtText = w => CTR_AT[w] || CTR_AT.self;
// コスト「○○カウンターをN個取り除く」
const CTR_PAY = { me: "自分", field: "自分のモンスター", self: "このモンスター" };
const ctrCostText = x => x && x.id && x.n > 0 ? `${CTR_PAY[x.w] || "自分"}の${ctrName(x.id)}を${x.n}個取り除く` : "";
const payCtrOf = c => c && c.payCtr && c.payCtr.id && +c.payCtr.n > 0 ? { id: String(c.payCtr.id), n: Math.min(99, Math.round(+c.payCtr.n)), w: c.payCtr.w === "field" ? "field" : "me" } : null;
// 「○○カウンターがN個以上になったとき」
const ctrReachHead = b => `${b.rw === "me" ? "自分" : "このモンスター"}の${ctrName(b.rc)}が${b.rn || 1}個以上になったとき`;
const perLab = m => m.per === "handF" ? `手札の${usedPfText(m)}1枚` : m.per === "usedNow" ? `このターン使った${usedPfText(m)}1枚` : m.per === "ctr" ? `${ctrAtText(m.pcw)}の${ctrName(m.pctr)}1個` : PER_DEFS[m.per].label + PER_DEFS[m.per].u;

/* ---- 数える・ふやす・へらす ---- */
const ctrOfM = (m, id) => !m || !id ? 0 : id === CTR_DMG ? m.dmg || 0 : (m.ctr && m.ctr[id]) || 0;
const ctrOfP = (p, id) => (p && p.ctr && p.ctr[id]) || 0;
function ctrCount(st, s, ctx, id, w){
  if (!id) return 0;
  if (w === "me" || w === "op") return ctrOfP(P(st, w === "me" ? s : O(s)), id);
  if (w === "myAll" || w === "opAll") return P(st, w === "myAll" ? s : O(s)).mz.reduce((t, m) => t + ctrOfM(m, id), 0);
  const m = ctx && ctx.mon ? monAt(st, ctx.mon) : ctx && ctx.zone != null ? P(st, s).mz[ctx.zone] : null;
  return ctrOfM(m, id);
}
const ctrReachHit = (b, ctx) => { const e = ctx && ctx.ctrEv; if (!e) return false; const n = Math.max(1, b.rn || 1); return b.rc === e.id && (b.rw === "me" ? "me" : "self") === e.w && e.before < n && e.after >= n; };
function ctrReachFire(st, L){ const L2 = L.filter(x => blocksOf(x.c).some(b => b.trig === "ctrReach" && ctrReachHit(b, x.ctx))); if (L2.length) runList(st, L2); }
// モンスター (o,i) のカウンターを d 個ふやす（マイナスなら取り除く）。by = ログを出すプレイヤー
function ctrMon(st, o, i, id, d, src, by){
  const m = P(st, o).mz[i]; if (!m || !d || !id) return 0;
  const nm = card(m.c).name, before = ctrOfM(m, id), after = Math.max(0, before + d);
  if (after === before){ log(st, by, `${src}：「${nm}」に${ctrName(id)}が乗っていない`); return 0; }
  if (id === CTR_DMG) m.dmg = after; else { m.ctr = { ...(m.ctr || {}) }; if (after) m.ctr[id] = after; else delete m.ctr[id]; }
  log(st, by, `${src}で「${nm}」${d > 0 ? "に" : "から"}${ctrName(id)}を${Math.abs(after - before)}個${d > 0 ? "乗せた" : "取り除いた"}（${after}個）`);
  ev(st, { type: "ctr", s: o, z: i, id, d: after - before });
  if (id === CTR_DMG && after >= atkOf(m)){ log(st, by, `「${nm}」のダメージカウンター${after}がATK${fmtN(atkOf(m))}に届いた！`); destroyMonster(st, o, i, "ルールによる破壊", { rule: true }); return after - before; }
  if (after > before) ctrReachFire(st, monTrigList(st, o, i, "ctrReach", m, { ctrEv: { id, before, after, w: "self" } }));
  return after - before;
}
// プレイヤー o のカウンター（ダメージカウンターはモンスターだけ）
function ctrPl(st, o, id, d, src, by){
  if (!id || !d) return 0;
  const p = P(st, o);
  if (id === CTR_DMG){ log(st, by, `${src}：ダメージカウンターはプレイヤーには乗らない`); return 0; }
  const before = ctrOfP(p, id), after = Math.max(0, before + d);
  if (after === before){ log(st, by, `${src}：${p.name}に${ctrName(id)}が乗っていない`); return 0; }
  p.ctr = { ...(p.ctr || {}) }; if (after) p.ctr[id] = after; else delete p.ctr[id];
  log(st, by, `${src}で${p.name}${d > 0 ? "に" : "から"}${ctrName(id)}を${Math.abs(after - before)}個${d > 0 ? "乗せた" : "取り除いた"}（${after}個）`);
  if (after > before){ const L = []; p.mz.forEach((m, i) => { if (m) L.push(...monTrigList(st, o, i, "ctrReach", m, { ctrEv: { id, before, after, w: "me" } })); }); ctrReachFire(st, L); }
  return after - before;
}
// コストが払えない理由（"" = 払える）
function ctrPayWhy(st, s, x, ctx){
  if (!x || !x.id || !(x.n > 0)) return "";
  const have = ctrCount(st, s, ctx, x.id, x.w === "field" ? "myAll" : x.w === "self" ? "self" : "me");
  return have >= x.n ? "" : `${CTR_PAY[x.w] || "自分"}の${ctrName(x.id)}が${x.n}個いる`;
}
function ctrPay(st, s, x, src, ctx){
  if (!x || !x.id || !(x.n > 0)) return;
  const why = `${src}のコスト`;
  if (x.w === "field"){ let left = x.n; const p = P(st, s); p.mz.map((m, i) => [i, ctrOfM(m, x.id)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).forEach(([i, v]) => { if (left <= 0) return; const k = Math.min(v, left); left -= k; ctrMon(st, s, i, x.id, -k, why, s); }); return; }
  if (x.w === "self"){ const r = ctx && ctx.mon; if (r && monAt(st, r)) ctrMon(st, r.s, r.i, x.id, -x.n, why, s); return; }
  ctrPl(st, s, x.id, -x.n, why, s);
}

/* ---- カウンター自体の効果（毒など）: 乗っている側のターンのはじめ／終わりに、乗っているもの（プレイヤーかモンスター）に起きる ---- */
const CTR_FX_AT = { start: "乗っている側のターンのはじめ", end: "乗っている側のターンの終わり" };
const CTR_FX_K = { dmg: "ダメージを与える（ブロックで防げる）", lose: "LPを失わせる（ブロック無視）", heal: "回復する", dec: "このカウンターを減らす", inc: "このカウンターを増やす" };
const ctrFxOf = d => d && Array.isArray(d.fx) ? d.fx.filter(f => f && CTR_FX_AT[f.at] && CTR_FX_K[f.k]) : [];
function ctrFxText(d){
  const L = ctrFxOf(d); if (!L.length) return "";
  const one = f => { const n = Math.max(0, Math.round(+f.n || 0)), x = f.per ? `このカウンター1個につき${n}` : String(n);
    return f.k === "dec" ? `このカウンターを${Math.max(1, n)}個取り除く` : f.k === "inc" ? `このカウンターを${Math.max(1, n)}個乗せる` : f.k === "heal" ? `${x}回復する` : f.k === "lose" ? `${x}LPを失う（ブロック無視）` : `${x}ダメージを受ける`; };
  return Object.keys(CTR_FX_AT).map(at => { const fs = L.filter(f => f.at === at); return fs.length ? `${CTR_FX_AT[at]}：${fs.map(one).join("、")}` : ""; }).filter(Boolean).join("。");
}
function ctrTick(st, s, at){
  if (st.winner) return;
  const p = P(st, s);
  const run = (bag, id, mi, ref) => {
    const fs = ctrFxOf(ctrDef(id)).filter(f => f.at === at), nm = ctrName(id);
    for (const f of fs){
      if (st.winner) return; if (mi != null && p.mz[mi] !== ref) return;
      const cnt = bag[id] || 0; if (cnt <= 0) return;
      const amt = Math.max(0, Math.round((+f.n || 0) * (f.per ? cnt : 1)));
      if (f.k === "dec" || f.k === "inc"){ const k = Math.max(1, Math.round(+f.n || 1)); bag[id] = Math.max(0, cnt + (f.k === "inc" ? k : -k)); log(st, s, `${nm}が${bag[id]}個になった`); if (!bag[id]) delete bag[id]; continue; }
      if (mi == null){
        if (f.k === "heal"){ p.lp += amt; log(st, s, `${nm}で${p.name}のLPが${amt}回復`); }
        else if (f.k === "lose"){ p.lp -= amt; log(st, s, `${nm}で${p.name}は${amt}LPを失った`); if (amt > 0){ ev(st, { type: "hit", s, d: amt, blk: 0 }); lostLp(st, s); } }
        else { log(st, s, `${nm}で${p.name}に${amt}ダメージ`); dealDmg(st, s, amt); }
      } else {
        const m = p.mz[mi]; if (!m) return;
        if (f.k === "heal"){ m.dmg = Math.max(0, (m.dmg || 0) - amt); log(st, s, `${nm}で「${card(m.c).name}」のダメージが${amt}回復`); }
        else monDmg(st, s, mi, amt, nm);
      }
      checkEnd(st);
    }
  };
  Object.keys(p.ctr || {}).forEach(id => run(p.ctr, id, null, null));
  p.mz.forEach((m, i) => { if (m && m.ctr) Object.keys(m.ctr).forEach(id => { if (p.mz[i] === m && m.ctr) run(m.ctr, id, i, m); }); });
}
/* ---- 表示 ---- */
function ctrChip(id, n, named){
  const d = ctrDef(id) || { name: "？", color: "#666" }, col = HEX6.test(d.color || "") ? d.color : "#666";
  return `<span class="ctrc" style="--cc:${col}" title="${esc(d.name)}カウンター${n !== "" ? ` ${n}個` : ""}${ctrFxText(d) ? "：" + esc(ctrFxText(d)) : ""}">${d.icon ? `<img alt="" src="${esc(d.icon)}">` : `<i>${esc([...(d.name || "？")][0])}</i>`}${named ? esc(d.name) + " " : ""}${n !== "" ? esc(n) : ""}</span>`;
}
function ctrBadges(opts){
  const L = [];
  if (opts.dmg) L.push(`<span class="dmgc" title="ダメージカウンター（ATK以上になると破壊）">ダメージ ${opts.dmg}</span>`);
  Object.entries(opts.ctr || {}).forEach(([id, n]) => { if (n > 0 && id !== CTR_DMG) L.push(ctrChip(id, n)); });
  return L.length ? `<span class="ctrs">${L.join("")}</span>` : "";
}
const ctrChipsP = p => Object.entries((p && p.ctr) || {}).filter(([, n]) => n > 0).map(([id, n]) => ctrChip(id, n, true)).join("");
function ctrOptsHTML(cur){
  const L = ctrList(), o = (v, l) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`;
  return L.map(d => o(d.id, d.name + "カウンター")).join("") + (cur && !L.some(d => d.id === cur) ? o(cur, ctrName(cur)) : "");
}
const ctrSel = (f, cur) => `<select data-f="${f}" aria-label="カウンター">${ctrOptsHTML(cur || ctrDefault())}</select>`;

/* ---- カードが使っているカウンター ---- */
function cardCtrIds(c){
  const out = new Set(), eff = e => { if (!e) return; if (KINDS[e.kind] && KINDS[e.kind].ctr && e.ctr) out.add(e.ctr); if (e.per === "ctr" && e.pctr) out.add(e.pctr); if (e.ge) eff(e.ge); };
  blocksOf(c).forEach(b => {
    [...b.then, ...b.else, ...(b.dieBr || []).flatMap(x => x.then)].forEach(eff);
    b.conds.forEach(x => { if (x.k === "ctr" && x.ctr) out.add(x.ctr); });
    if (b.trig === "ctrReach" && b.rc) out.add(b.rc);
    if (b.cost && b.cost.id) out.add(b.cost.id);
  });
  (Array.isArray(c && c.atkConds) ? c.atkConds : []).forEach(x => { if (x && x.k === "ctr" && x.ctr) out.add(x.ctr); });
  const pc = payCtrOf(c); if (pc) out.add(pc.id);
  return [...out];
}
function ctrSnap(c){
  const o = {};
  cardCtrIds(c).forEach(id => { if (CTR_BUILTIN[id]) return; const d = ctrDef(id); if (d) o[id] = { name: d.name, color: d.color || "", icon: d.icon || "", ...(ctrFxOf(d).length ? { fx: ctrFxOf(d) } : {}) }; });
  return Object.keys(o).length ? o : null;
}
function rebuildCtrEmb(){
  CTR_EMB = {};
  S.cards.forEach(c => { if (c && c.ctrs && typeof c.ctrs === "object") Object.entries(c.ctrs).forEach(([k, v]) => { if (v && v.name && !CTR_EMB[k]) CTR_EMB[k] = { id: k, name: String(v.name), color: v.color || "", icon: v.icon || "", ...(Array.isArray(v.fx) ? { fx: v.fx } : {}) }; }); });
}

/* ---- 保存（Firestore の counters／ログインしていないときはこの端末だけ） ---- */
function subscribeCounters(){
  if (S.db){
    try{ S.db.collection("counters").onSnapshot(snap => { S.ctrErr = false; S.counters = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x && x.name).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); ctrRefresh(); }, () => { S.ctrErr = true; ctrRefresh(); }); }catch(e){ S.ctrErr = true; }
  } else { S.counters = ls.get("cb_ctrs", []); ctrRefresh(); }
}
async function saveCounterDoc(id, doc){
  if (S.db){ await S.db.doc("counters/" + id).set(doc); return; }
  const a = ls.get("cb_ctrs", []).filter(x => x.id !== id); a.push({ id, ...doc }); ls.set("cb_ctrs", a); S.counters = a; ctrRefresh();
}
async function deleteCounterDoc(id){
  if (S.db){ await S.db.doc("counters/" + id).delete(); return; }
  const a = ls.get("cb_ctrs", []).filter(x => x.id !== id); ls.set("cb_ctrs", a); S.counters = a; ctrRefresh();
}
const ctrCanEdit = d => !d.builtin && (!S.db || !d.ownerId || (!!S.uid && d.ownerId === S.uid) || (typeof isAdmin === "function" && isAdmin()));
function ctrRefresh(){ renderCtrBox(); if (typeof bkSync === "function") bkSync(); if (typeof renderAll === "function") renderAll(); }

/* ---- カード工房の「カウンター」 ---- */
function renderCtrBox(){
  const ps = document.getElementById("mkPayCtr"); if (ps){ const cur = ps.dataset.want || ""; ps.innerHTML = ctrOptsHTML(cur || ctrDefault()); }
  const box = document.getElementById("ctrList"); if (!box) return;
  const ed = S.ctrEdit;
  box.innerHTML = `<p class="note" style="margin:4px 0">ここで作ったカウンターは、みんなのカードの効果で使えます（乗せる・取り除く・もし・○1個につき・○個になったとき・コスト）。直せるのは作った人だけ。</p>`
    + `<div class="ctr-grid">${ctrList().map(d => `<div class="ctr-item">${ctrChip(d.id, "")}<b>${esc(d.name)}カウンター</b><span class="note">${d.builtin ? "はじめから" : "by " + esc(d.author || "？")}</span>${ctrCanEdit(d) && !ed ? `<button type="button" class="small ghost" data-ctred="${esc(d.id)}">直す</button>` : ""}</div>`).join("")}</div>`
    + (S.ctrErr ? `<p class="note" style="color:#c0392b">カウンターを読みこめませんでした（Firestoreのルールに counters がまだ無いかも）</p>` : "")
    + (ed ? `<div class="ctr-form">
        <label class="row" style="gap:4px">名前<input type="text" id="ctrName" maxlength="12" value="${esc(ed.name)}" placeholder="例: 毒" style="width:120px">カウンター</label>
        <label class="row" style="gap:4px">色<input type="color" id="ctrColor" value="${esc(HEX6.test(ed.color || "") ? ed.color : "#7a4fd0")}"></label>
        <span class="row" style="gap:6px;align-items:center">アイコン${ed.icon ? `<img class="ctr-ico" alt="" src="${esc(ed.icon)}">` : `<span class="ctr-ico ctr-ico0">${esc([...(ed.name || "？")][0])}</span>`}<label class="small btnlike"><input type="file" id="ctrIcon" accept="image/*" hidden>画像をえらぶ</label>${ed.icon ? `<button type="button" class="small ghost" data-ctrnoicon>アイコンを消す</button>` : ""}</span>
        ${ctrFxForm(ed)}<div class="row" style="gap:6px;width:100%"><button type="button" class="small primary" data-ctrsave>${ed.id ? "保存する" : "作る"}</button><button type="button" class="small ghost" data-ctrcancel>やめる</button>${ed.id ? `<span style="flex:1"></span><button type="button" class="small ghost danger" data-ctrdel>${ed.delAsk ? "本当に消す（もう一度押す）" : "このカウンターを消す"}</button>` : ""}</div>
        ${ed.id ? `<p class="note" style="margin:0;width:100%">消しても、このカウンターを使っているカードはそのまま動きます（カードの中に名前とアイコンが入っているため）</p>` : ""}
      </div>` : `<button type="button" class="small" data-ctrnew>＋ 新しいカウンターを作る</button>`);
}
// カウンターの効果の入力（毒なら「乗っている側のターンの終わり：1個につき20ダメージ、1個取り除く」など）
function ctrFxForm(ed){
  const L = ed.fx || [], o = (v, l, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`;
  return `<div class="ctr-fx" style="width:100%"><b style="font-size:13px">カウンターの効果（なくてもOK）</b>${L.map((f, i) => `<div class="row" style="gap:4px;flex-wrap:wrap;margin:4px 0" data-cfi="${i}"><select data-cf="at">${Object.entries(CTR_FX_AT).map(([k, l]) => o(k, l, f.at)).join("")}</select><select data-cf="k">${Object.entries(CTR_FX_K).map(([k, l]) => o(k, l, f.k)).join("")}</select><input type="number" data-cf="n" min="0" max="9999" value="${esc(f.n ?? 20)}" style="width:72px" aria-label="数">${f.k === "dec" || f.k === "inc" ? `<span class="note">個</span>` : `<label class="row" style="gap:3px;cursor:pointer"><input type="checkbox" data-cf="per"${f.per ? " checked" : ""}>このカウンター1個につき</label>`}<button type="button" class="small ghost" data-cfdel="${i}" aria-label="消す">×</button></div>`).join("")}<button type="button" class="small" data-cfadd>＋ 効果を足す</button>${L.length ? `<p class="note" style="margin:2px 0">上から順に起きます。いまの文：${esc(ctrFxText({ fx: L }) || "—")}</p>` : `<p class="note" style="margin:2px 0">例：毒カウンター＝「乗っている側のターンの終わり・ダメージを与える・20・1個につき」＋「このカウンターを減らす・1」</p>`}</div>`;
}
// 画像 → 64×64 の丸アイコン用（真ん中を切り取る）
function ctrIconFrom(file){
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onerror = rej;
    r.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), k = Math.min(im.width, im.height); x.drawImage(im, (im.width - k) / 2, (im.height - k) / 2, k, k, 0, 0, 64, 64); let u = c.toDataURL("image/webp", .85); if (!/^data:image\/webp/.test(u)) u = c.toDataURL("image/png"); res(u); }; im.src = r.result; };
    r.readAsDataURL(file);
  });
}
(() => {
  const box = document.getElementById("ctrList"); if (!box) return;
  box.addEventListener("click", async e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.matches("[data-ctrnew]")){ S.ctrEdit = { id: null, name: "", color: "#7a4fd0", icon: "" }; renderCtrBox(); const n = document.getElementById("ctrName"); if (n) n.focus(); return; }
    if (t.matches("[data-ctred]")){ const d = ctrDef(t.dataset.ctred); if (!d || !ctrCanEdit(d)) return; S.ctrEdit = { id: d.id, name: d.name, color: d.color || "#7a4fd0", icon: d.icon || "", fx: ctrFxOf(d).map(f => ({ ...f })) }; renderCtrBox(); return; }
    const ed = S.ctrEdit; if (!ed) return;
    if (t.matches("[data-cfadd]")){ (ed.fx = ed.fx || []).push({ at: "end", k: "dmg", n: 20, per: true }); renderCtrBox(); return; }
    if (t.matches("[data-cfdel]")){ (ed.fx || []).splice(+t.dataset.cfdel, 1); renderCtrBox(); return; }
    if (t.matches("[data-ctrcancel]")){ S.ctrEdit = null; renderCtrBox(); return; }
    if (t.matches("[data-ctrnoicon]")){ ed.icon = ""; renderCtrBox(); return; }
    if (t.matches("[data-ctrdel]")){
      if (!ed.delAsk){ ed.delAsk = true; renderCtrBox(); return; }
      try{ await deleteCounterDoc(ed.id); S.ctrEdit = null; renderCtrBox(); toast("カウンターを消しました"); }catch(err){ toast("消せませんでした（権限がないかも）"); }
      return;
    }
    if (t.matches("[data-ctrsave]")){
      const name = String(ed.name || "").trim().replace(/カウンター$/, "").trim().slice(0, 12);
      if (!name){ toast("カウンターの名前を書いてね"); return; }
      if (ctrList().some(d => d.id !== ed.id && d.name === name)){ toast(`「${name}カウンター」はもうあるよ`); return; }
      const prev = ed.id ? ctrDef(ed.id) : null, id = ed.id || uid("ct");
      const doc = { name, color: HEX6.test(ed.color || "") ? ed.color : "#7a4fd0", icon: ed.icon || "", fx: ctrFxOf(ed).map(f => ({ at: f.at, k: f.k, n: Math.max(0, Math.round(+f.n || 0)), per: !!f.per && f.k !== "dec" && f.k !== "inc" })), author: prev ? prev.author || S.name : S.name, ownerId: prev ? prev.ownerId || null : S.uid || null, createdAt: prev ? prev.createdAt || Date.now() : Date.now(), updatedAt: Date.now() };
      t.disabled = true;
      try{ await saveCounterDoc(id, doc); if (S.db){ S.counters = [...(S.counters || []).filter(x => x.id !== id), { id, ...doc }]; } S.ctrEdit = null; ctrRefresh(); toast(`「${name}カウンター」を${prev ? "保存" : "作り"}ました`); }
      catch(err){ t.disabled = false; toast(err && err.code === "permission-denied" ? "保存できませんでした（Firestoreのルールに counters を足してね）" : "保存できませんでした"); }
    }
  });
  const cfSet = e => { const ed = S.ctrEdit, el = e.target.closest("[data-cf]"), row = el && el.closest("[data-cfi]"); if (!ed || !row) return false; const f = (ed.fx || [])[+row.dataset.cfi]; if (!f) return true; const k = el.dataset.cf; f[k] = k === "per" ? el.checked : k === "n" ? el.value : el.value; if (e.type === "change") renderCtrBox(); return true; };
  box.addEventListener("change", e => { cfSet(e); });
  box.addEventListener("input", e => { if (e.target.dataset && e.target.dataset.cf === "n") cfSet(e); });
  box.addEventListener("input", e => { const ed = S.ctrEdit; if (!ed) return; if (e.target.id === "ctrName") ed.name = e.target.value; if (e.target.id === "ctrColor") ed.color = e.target.value; });
  box.addEventListener("change", async e => {
    const ed = S.ctrEdit; if (!ed || e.target.id !== "ctrIcon") return;
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try{ ed.icon = await ctrIconFrom(f); renderCtrBox(); }catch(err){ toast("画像を読みこめませんでした"); }
  });
})();
/* ---- カード工房の効果ブロック用の入力 ---- */
function ctrEffUI(e, opt){
  const mon = typeof MK !== "undefined" && (MK.type === "monster" || MK.type === "equip"), cw = CTR_CW[e.cw] ? e.cw : "pick";
  return ctrSel("ctr", e.ctr) + `<select data-f="cw" aria-label="どこに">${Object.entries(CTR_CW).filter(([k]) => k !== "self" || mon || cw === "self").map(([k, l]) => opt(k, l, cw)).join("")}</select>`
    + (cw === "self" ? "" : `<select data-f="side" aria-label="自分か相手か">${opt("op", "相手", e.side === "me" ? "me" : "op")}${opt("me", "自分", e.side === "me" ? "me" : "op")}</select>`);
}
const ctrAtSel = (f, cur, opt) => `<select data-f="${f}" aria-label="どこの">${Object.entries(CTR_AT).map(([k, l]) => opt(k, l + "の", cur || "self")).join("")}</select>`;
const ctrPerUI = (e, opt) => ctrAtSel("pcw", e.pcw, opt) + ctrSel("pctr", e.pctr);
const ctrCondUI = (x, opt) => ctrAtSel("cw", x.cw, opt) + ctrSel("ctr", x.ctr);
function ctrReachUI(b, opt){
  if (!b.rc) b.rc = ctrDefault(); if (!b.rn) b.rn = 1;
  return `<span class="bk-tag t-when">カウンター</span><div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><select data-f="rw" aria-label="だれの">${opt("self", "このモンスターの", b.rw === "me" ? "me" : "self")}${opt("me", "自分（プレイヤー）の", b.rw === "me" ? "me" : "self")}</select>${ctrSel("rc", b.rc)}<span class="note">が</span><input type="number" data-f="rn" min="1" max="99" value="${esc(b.rn)}" aria-label="個数" style="width:64px"><span class="note">個以上になったとき</span></div>`;
}
function ctrActCostUI(b, opt){
  const c = b.cost && b.cost.id ? b.cost : null;
  return `<span class="bk-tag t-when">コスト</span><div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><select data-f="cpw" aria-label="起動効果のコスト">${opt("", "なし", c ? c.w : "")}${opt("self", "このモンスターの", c ? c.w : "")}${opt("me", "自分（プレイヤー）の", c ? c.w : "")}${opt("field", "自分のモンスターの", c ? c.w : "")}</select>${c ? `${ctrSel("cpc", c.id)}<span class="note">を</span><input type="number" data-f="cpn" min="1" max="99" value="${esc(c.n || 1)}" aria-label="個数" style="width:64px"><span class="note">個取り除いて発動</span>` : ""}</div>`;
}
function mkPayCtrVal(){ const nEl = document.getElementById("mkPayCtrN"); if (!nEl) return null; const n = Math.max(0, Math.min(99, Math.round(+nEl.value || 0))); return n ? { id: $("#mkPayCtr").value || ctrDefault(), n, w: $("#mkPayCtrW").value === "field" ? "field" : "me" } : null; }
function setPayCtr(x){ const p = payCtrOf({ payCtr: x }), sel = document.getElementById("mkPayCtr"); if (!sel) return; sel.dataset.want = p ? p.id : ""; sel.innerHTML = ctrOptsHTML(p ? p.id : ctrDefault()); $("#mkPayCtrN").value = p ? String(p.n) : "0"; $("#mkPayCtrW").value = p ? p.w : "me"; }
["mkPayCtr", "mkPayCtrN", "mkPayCtrW"].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("input", () => { if (id === "mkPayCtr") el.dataset.want = el.value; if (typeof updateBkText === "function") updateBkText(); }); });
renderCtrBox();
/* ---- カード図鑑の「カウンター」 ---- */
function ctrUseCount(){ const cnt = {}; S.cards.forEach(c => { if (!c || c.tut || c.skinOf) return; cardCtrIds(c).forEach(id => { cnt[id] = (cnt[id] || 0) + 1; }); }); return cnt; }
function ctrGalList(){ const cnt = ctrUseCount(), ids = [...new Set([...ctrList().map(d => d.id), ...Object.keys(cnt)])]; return ids.map(id => ({ ...(ctrDef(id) || { id, name: "？" }), id, uses: cnt[id] || 0 })); }
function ctrTileHTML(d){
  const col = HEX6.test(d.color || "") ? d.color : "#666", by = d.builtin ? "はじめから" : (S.counters || []).some(x => x.id === d.id) ? "by " + (d.author || "？") : "（消されたカウンター。カードの中にだけ残っている）";
  return `<div class="ctr-tile" style="--cc:${col}">${d.icon ? `<img class="ctr-big" alt="" src="${esc(d.icon)}">` : `<span class="ctr-big ctr-big0">${esc([...(d.name || "？")][0])}</span>`}<b>${esc(d.name)}カウンター</b><span class="note">${esc(by)}</span><div class="row" style="gap:6px;justify-content:center"><button type="button" class="small" data-ctrcards="${esc(d.id)}"${d.uses ? "" : " disabled"}>使っているカード（${d.uses}）</button>${ctrCanEdit(d) && (S.counters || []).some(x => x.id === d.id) ? `<button type="button" class="small ghost" data-ctreditg="${esc(d.id)}">直す</button>` : ""}</div></div>`;
}
const ctrBanner = f => f && f.ctr ? `<div class="ctr-on">${ctrChip(f.ctr, "")}<b>${esc(ctrName(f.ctr))}</b>を使うカード<button type="button" class="small ghost" data-ctrclear aria-label="カウンターの絞り込みをやめる">× やめる</button></div>` : "";
/* ---- カード工房: スペルブースト（コスト）・G・ゼロ・探査・革命チェンジ ---- */
function mkCostMech(save){
  const g = id => document.getElementById(id); if (!g("mkSbCost")) return {};
  const sb = Math.max(0, Math.min(20, Math.round(+g("mkSbCost").value || 0))), gzName = g("mkGzName").value.trim(), rvName = g("mkRevoName").value.trim();
  return { sbCost: sb || null, gz: g("mkGz").checked && g("mkGzWhere").value === "none" ? { where: "none" } : g("mkGz").checked && gzName ? { where: g("mkGzWhere").value, match: g("mkGzMatch").value, name: gzName.slice(0, 40), cnt: Math.max(1, Math.min(20, Math.round(+g("mkGzCnt").value || 1))) } : null, delve: g("mkDelve").checked || null, revG: g("mkRevG") && g("mkRevG").checked && (typeof MK === "undefined" || MK.type === "magic") ? Math.max(0, Math.min(20, Math.round(+g("mkRevGN").value || 0))) : null, revo: g("mkRevo").checked && rvName && (typeof MK === "undefined" || MK.type === "monster") ? { match: g("mkRevoMatch").value, name: rvName.slice(0, 40) } : null };
}
// G・ゼロ: 条件なしなら名前の欄はかくす／カード名のときは名前の候補を出す
// コストの欄: チェックを入れたときだけ細かい設定を出す・カードの種類で使えない行はかくす
function syncCostUI(){
  document.querySelectorAll(".cost-sub[data-sub]").forEach(el => { const cb = document.getElementById(el.dataset.sub); el.hidden = !!cb && !cb.checked; });
  const t = typeof MK !== "undefined" ? MK.type : "", r1 = document.getElementById("revGLine"), r2 = document.getElementById("revoLine"), g = document.getElementById("costSpGrp");
  if (r1) r1.hidden = t !== "magic"; if (r2) r2.hidden = t !== "monster"; if (g) g.hidden = !!(r1 && r1.hidden && r2 && r2.hidden);
}
["mkGz", "mkRevG", "mkRevo"].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("change", syncCostUI); });
function syncGz(){ const g = id => document.getElementById(id); if (!g("mkGzWhere")) return; const none = g("mkGzWhere").value === "none"; document.querySelectorAll(".gz-c").forEach(el => { el.hidden = none; }); const m = g("mkGzMatch").value; g("mkGzName").setAttribute("list", m === "tag" ? "tagNames" : "cardNames"); g("mkGzName").placeholder = m === "tag" ? "例: 竜" : m === "exact" ? "カード名" : "名前に入る文字"; }
["mkGzWhere", "mkGzMatch"].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("change", syncGz); });
function setCostMech(c){
  const g = id => document.getElementById(id); if (!g("mkSbCost")) return;
  g("mkSbCost").value = String(c && +c.sbCost > 0 ? +c.sbCost : 0);
  const gz = c && c.gz; g("mkGz").checked = !!(gz && (gz.name || gz.where === "none")); g("mkGzWhere").value = gz && ["field", "grave", "hand", "none"].includes(gz.where) ? gz.where : "field"; g("mkGzMatch").value = gz && ["tag", "part", "exact"].includes(gz.match) ? gz.match : "tag"; g("mkGzName").value = gz ? gz.name || "" : ""; g("mkGzCnt").value = String(gz ? Math.max(1, +gz.cnt || 1) : 1); syncGz(); setTimeout(syncCostUI);
  g("mkDelve").checked = !!(c && c.delve); if (g("mkRevG")){ g("mkRevG").checked = !!(c && c.revG != null); g("mkRevGN").value = String(c && c.revG != null ? Math.max(0, +c.revG || 0) : 3); }
  const rv = c && c.revo; g("mkRevo").checked = !!(rv && rv.name); g("mkRevoMatch").value = rv && ["tag", "part", "exact"].includes(rv.match) ? rv.match : "tag"; g("mkRevoName").value = rv ? rv.name || "" : "";
}
["mkSbCost", "mkGz", "mkGzWhere", "mkGzMatch", "mkGzName", "mkGzCnt", "mkDelve", "mkRevG", "mkRevGN", "mkRevo", "mkRevoMatch", "mkRevoName"].forEach(id => { const el = document.getElementById(id); if (el){ el.addEventListener("input", () => { if (typeof updateBkText === "function") updateBkText(); }); el.addEventListener("change", () => { if (typeof updateBkText === "function") updateBkText(); }); } });
