/* ================= game engine (pure-ish over st) ================= */
const O = s => s === "a" ? "b" : "a";
const P = (st, s) => st.players[s];
const card = id => S.cards.get(id) || modCardOf(id) || { id, name: "？", type: "monster", atk: 0 };
const hasCard = id => S.cards.has(id) || !!modCardOf(id);
// 書きかえたカード: 対戦データ st.mods["mod:N"] = { b: もとのカード, add, rep, clear, name } から、その場で作る
function modCardOf(id){
  if (typeof id !== "string" || !id.startsWith("mod:")) return null;
  const m = typeof G !== "undefined" && G && G.st && G.st.mods && G.st.mods[id]; if (!m) return null;
  const cache = modCardOf.cache || (modCardOf.cache = new Map()), key = JSON.stringify(m), hit = cache.get(id);
  if (hit && hit.k === key) return hit.c;
  const base = S.cards.get(m.b); if (!base) return null;
  const t = cardType(base), trig = t === "monster" ? "summon" : t === "equip" ? "attach" : "use";
  const bs = m.clear || m.rep ? [] : blocksOf(base).map(b => ({ ...b }));
  if (m.rep && m.rep.length) bs.push({ trig, join: "and", conds: [], then: m.rep, else: [] });
  if (m.add && m.add.length) bs.push({ trig, join: "and", conds: [], then: m.add, else: [] });
  const c = { ...base, id, name: m.name || base.name, nameRuby: m.name ? null : base.nameRuby, fx: null, combo: null, blocks: bs, effect: m.clear || m.rep || (m.add && m.add.length) ? "" : base.effect, modded: true, modOf: base.id };
  cache.set(id, { k: key, c }); return c;
}
// カードを書きかえる（new id を返す。書きかえ済みのカードはもとのカードから作りなおす）
function modId(st, id, ch){
  st.mods = st.mods || {};
  const old = typeof id === "string" && id.startsWith("mod:") && st.mods[id];
  const m = old ? JSON.parse(JSON.stringify(old)) : { b: id };
  if (ch.clear){ m.clear = true; m.add = []; m.rep = null; }
  if (ch.rep){ m.rep = ch.rep; m.clear = false; m.add = []; }
  if (ch.add) m.add = (m.add || []).concat(ch.add);
  if (ch.name) m.name = ch.name;
  st.modn = (st.modn || 0) + 1; const nid = "mod:" + st.modn; st.mods[nid] = m; return nid;
}
function modApply(st, s, c, fx, target, src){
  const T = modT(fx), pl = P(st, T.side === "op" ? O(s) : s), k = Math.max(1, fx.mn || 1), out = [];
  const arrs = T.place === "hand" ? [pl.hand] : T.place === "deck" ? [pl.deck] : [pl.hand, pl.deck];
  if (T.scope === "pick"){ if (pl.hand[target] != null) out.push([pl.hand, target]); }
  else if (T.scope === "all") arrs.forEach(arr => arr.forEach((_, i) => out.push([arr, i])));
  else if (T.scope === "rand") shuffle(arrs.flatMap(arr => arr.map((_, i) => [arr, i]))).slice(0, k).forEach(x => out.push(x));
  else arrs.forEach(arr => arr.forEach((id, i) => { const x = card(id); if (x.name === fx.into || plainRuby(x.nameRuby || "") === fx.into) out.push([arr, i]); }));
  if (!out.length){ log(st, s, `${src}：書きかえるカードがない`); return; }
  const gk = fx.gk && KINDS[fx.gk] && !KINDS[fx.gk].mod ? fx.gk : "draw", g = [fx.ge && KINDS[fx.ge.kind] && !KINDS[fx.ge.kind].mod ? cleanEff(fx.ge) : cleanEff({ kind: gk, n: fx.gn || (smallN(gk) ? 1 : 100) })].filter(Boolean);
  const ch = fx.kind === "modAdd" ? { add: g } : fx.kind === "modRep" ? { rep: g } : fx.kind === "modClear" ? { clear: true } : { name: String(fx.nm || "").slice(0, 20) || null };
  if (fx.kind === "modName" && !ch.name){ log(st, s, `${src}：新しい名前がない`); return; }
  out.forEach(([arr, i]) => { arr[i] = modId(st, arr[i], ch); });
  log(st, s, `${src}で${modTargetText(fx)}を書きかえた（${out.length}枚）`);
}
// 場にいる間: 場のモンスターと表の永続カードの「場にいる間」の効果（ATKの増減・○倍）を、そのつど計算する
const STATIC_KINDS = ["selfAtk", "atkUp", "atkAll", "atkDown", "atkDownAll", "atkMul"];
function staticAtk(m){
  const out = { add: 0, mul: 1 }; if (typeof G === "undefined" || !G || !G.st || !G.st.players || staticAtk.busy) return out;
  const st = G.st; let ms = null;
  for (const o of ["a", "b"]){ const i = P(st, o).mz.indexOf(m); if (i >= 0) ms = o; }
  if (!ms) return out;
  staticAtk.busy = true;
  try{
    const srcs = [];
    for (const o of ["a", "b"]){ const p = P(st, o); p.mz.forEach((x, i) => { if (x) srcs.push({ o, c: card(x.c), mon: x, ctx: { zone: i, mon: { s: o, i, u: x.u } } }); }); p.sz.forEach((z, i) => { if (z && z.face && isPersist(card(z.c))) srcs.push({ o, c: card(z.c), mon: null, ctx: { pz: i } }); }); if (st.field) srcs.push({ o, c: card(st.field.c), mon: null, ctx: { field: true } }); }
    srcs.forEach(src => blocksOf(src.c).forEach(b => {
      if (b.trig !== "while") return;
      const plain = b.conds.filter(x => x.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(x => condMet(st, src.o, src.c, x, src.ctx)) : plain.every(x => condMet(st, src.o, src.c, x, src.ctx)));
      (ok ? b.then : b.else).forEach(e => {
        const n = +e.n || 0, mine = ms === src.o, self = src.mon === m, all = e.to === "all";
        if (e.kind === "selfAtk" && self) out.add += n;
        else if (e.kind === "atkMul" && self) out.mul *= Math.max(0, n || 1);
        else if ((e.kind === "atkAll" || (e.kind === "atkUp" && all)) && mine) out.add += n;
        else if (e.kind === "atkUp" && !all && self) out.add += n;
        else if ((e.kind === "atkDownAll" || (e.kind === "atkDown" && all)) && ((e.side === "me") === mine)) out.add -= n;
      });
    }));
  } finally { staticAtk.busy = false; }
  return out;
}
function atkOf(m){
  if (!m) return 0;
  const c = card(m.c), es = eqsOf(m), sa = staticAtk(m); let v = baseAtk(c) + (m.mod || 0) + (m.tmp || 0) + sa.add;
  es.forEach((e, k) => { v += (card(e.c).eqN || 0) * eqMult(es, k); });
  absOf(c).forEach(a => { if (a.k === "eqBonus" && a.name){ const w = normQ(a.name); if (es.some(e => normQ(card(e.c).name).includes(w))) v += a.n || 0; } });
  const mul = (m.mul || 1) * sa.mul; if (mul !== 1 && isFinite(v)) v = Math.floor(v * mul);
  return Math.max(0, v);
}
// ATK change to show on the card face
const modOf = m => { const b = baseAtk(card(m.c)); return isFinite(b) ? atkOf(m) - b : 0; };
// ∞ damage just brings LP to 0 (LP never holds Infinity, so the room state stays plain JSON)
// damage to a player: 弱体 makes it ×1.5, then ブロック soaks it up first
// damage to a monster piles up as a damage counter (ATK stays the same); once the counter reaches its ATK it's destroyed
// 弱体 on the opponent ("p") or one of their monsters ("m:i"): damage it takes is ×1.5; goes down by 1 at the start of its owner's turn
function addVuln(st, s, target, n, src, ts){ addVuln0(st, s, target, n, src, ts); if (!st.winner && (ts == null || ts !== s)) persistFire(st, s, "vulnApply", {}); }
function addVuln0(st, s, target, n, src, ts){
  const op = P(st, ts == null ? O(s) : ts);
  if (typeof target === "string" && target.startsWith("m:")){ const m = op.mz[+target.slice(2)]; if (!m) return; m.vuln = (m.vuln || 0) + n; log(st, s, `${src}で「${card(m.c).name}」が弱体${m.vuln}になった`); return; }
  op.vuln = (op.vuln || 0) + n; log(st, s, `${src}で${op.name}が弱体${op.vuln}になった`);
}
// 筋力 / 脱力: what a damage effect of player s really deals per hit (ポーション aren't changed)
function hitPower(st, s, n, ctx){
  if (ctx && ctx.potion) return n;
  const p = P(st, s); let x = n + (p.str || 0); if (x < 0) x = 0;
  if (p.weak > 0) x = Math.floor(x * .75);
  return x;
}
// battle: the winning monster's owner's 筋力 adds, a 脱力 monster deals 0.75×
function battleHit(st, s, i, x){
  if (!(x > 0) || x === Infinity) return x;
  const m = P(st, s).mz[i]; x = Math.max(0, x + (P(st, s).str || 0));
  if (m && m.weak > 0) x = Math.floor(x * .75);
  return x;
}
function addWeak(st, s, target, n, src, ts){
  const op = P(st, ts == null ? O(s) : ts);
  if (typeof target === "string" && target.startsWith("m:")){ const m = op.mz[+target.slice(2)]; if (!m) return; m.weak = (m.weak || 0) + n; log(st, s, `${src}で「${card(m.c).name}」が脱力${m.weak}になった`); return; }
  op.weak = (op.weak || 0) + n; log(st, s, `${src}で${op.name}が脱力${op.weak}になった`);
}
// ランダムなアタック / スキル / パワー (スパイア風, not the basic ones)
// 廃棄: the card leaves the game (廃棄札); counts for 「このターン廃棄した」 and fires 「カードが廃棄されたとき」
// LP went down (damage that got through, 「LPを失う」, LP cost): counters, プレート, and 「自分のターンにLPを失うたび」
function lostLp(st, s){
  const p = P(st, s); p.lostNow = (p.lostNow || 0) + 1; p.lostTotal = (p.lostTotal || 0) + 1;
  if (p.plate > 0){ p.plate = Math.max(0, p.plate - 20); log(st, s, `プレートが${p.plate}に減った`); }
  if (st.turn === s && !st.winner) persistFire(st, s, "myLoseLp", {});
}
function exileCard(st, s, id, src){
  const p = P(st, s); (p.exile = p.exile || []).push(id); p.exhaustedNow = (p.exhaustedNow || 0) + 1;
  log(st, s, `${src}で「${card(id).name}」を廃棄した`);
  persistFire(st, s, "exhaust", {});
}
function countPlay(st, s, c){
  const p = P(st, s); if (!c || !c.id) return;
  p.usedCount = { ...(p.usedCount || {}), [c.id]: ((p.usedCount || {})[c.id] || 0) + 1 };
  if (!isAttackCard(c) || cardType(c) === "monster") return;
  p.atkNow = (p.atkNow || 0) + 1; p.lastAtk = c.id;
  if (p.rage > 0){ p.block = (p.block || 0) + p.rage; log(st, s, `激怒の効果でブロックを${p.rage}得た（ブロック ${p.block}）`); persistFire(st, s, "blockGain", {}); }
  persistFire(st, s, "atkPlay", {});
}
const isAttackCard = c => c && (c.frame === "spire" ? spireKind(c) === "attack" : cardType(c) === "monster");
// play the top card of the deck for free (山札の一番上をプレイ)
function playTopCard(st, s, src, ex, then, extra){
  const p = P(st, s); if (!p.deck.length) refill(st, s);
  const id = p.deck.shift();
  if (!id){ log(st, s, `${src}：山札にカードがない`); then && then(st); return; }
  const c = card(id), t = cardType(c);
  // モンスターは召喚扱いで場に出る（召喚権を使わない・残っていなくても出せる）
  if (t === "monster"){
    const z = freeZone(p.mz);
    if (z < 0){ p.grave.push(id); log(st, s, `${src}で山札の一番上の「${c.name}」をめくった（場がいっぱいなので墓地へ）`); then && then(st); return; }
    p.mz[z] = mkMon(st, id); ev(st, { type: "summon", s, z }); log(st, s, `${src}で山札の一番上の「${c.name}」をプレイ！（召喚扱いで場に出た）`);
    runCard(st, s, c, "summon", { zone: z, mon: { s, i: z, u: p.mz[z].u } }, st2 => persistFire(st2, s, "mySummon", {}, then));
    return;
  }
  if (t !== "magic" && t !== "trap"){ p.grave.push(id); log(st, s, `${src}で山札の一番上の「${c.name}」をめくった（プレイできないので墓地へ）`); then && then(st); return; }
  log(st, s, `${src}で山札の一番上の「${c.name}」をプレイ！`); ev(st, { type: "spell", s, c: id }); countPlay(st, s, c);
  const pz = isPersist(c) && !ex ? freeZone(p.sz) : -1;
  if (isField(c) && !ex) placeField(st, s, id);
  else if (pz >= 0){ st.un = (st.un || 0) + 1; p.sz[pz] = { c: id, turn: st.turnNo, face: true, u: st.un }; }
  else if (ex || exhausts(c)) exileCard(st, s, id, src);
  else p.grave.push(id);
  runCard(st, s, c, "use", { x: 0, fromTop: true, ...(extra || {}) }, st2 => onCardUsed(st2, s, c, then));
}
// 変化: a card in hand turns into another one (a card named `into`, or a random スパイア風 card)
// 名前でカードをさがす: 同じ名前のカードが何枚かあるときは
// ① その効果のカードを作った人のカード → ② はじめからあるカード → ③ トークン → ④ ほかの人のカード の順にえらぶ
// 効果で指定するカード: カード工房でえらんだ1枚（intoId）があればそれ、なければ名前でさがす
const PICK_OK = { oppSummon: c => cardType(c) === "monster", oppSetNamed: c => cardType(c) === "magic" || cardType(c) === "trap" };
function pickCardKind(k){ return !!(KINDS[k] && KINDS[k].name && !KINDS[k].tag && k !== "autoPlay"); }
function nameCands(name, kind){ const ok = PICK_OK[kind]; return name ? [...S.cards.values()].filter(c => c && (c.name === name || plainRuby(c.nameRuby || "") === name) && (!ok || ok(c))) : []; }
function fxCardId(fx, srcCard){ const ok = PICK_OK[fx.kind]; if (fx.intoId && S.cards.has(fx.intoId) && (!ok || ok(card(fx.intoId)))) return fx.intoId; return intoId(fx.into, srcCard, ok); }
function intoId(into, srcCard, okFn){
  if (!into) return null;
  const L = [...S.cards.values()].filter(c => c && (c.name === into || plainRuby(c.nameRuby || "") === into) && (!okFn || okFn(c)));
  if (!L.length) return null;
  const owner = srcCard && srcCard.ownerId;
  const pick = (owner && L.find(c => c.ownerId === owner)) || L.find(c => c.starter || !c.ownerId) || L.find(c => c.token) || L[0];
  return pick.id;
}
// このカード自身を変化: 場のモンスター（場所・装備はそのまま、ATKの増減はリセット）／装備／永続／フィールド／手札／墓地・廃棄 の順に探す
function transformSelf(st, s, c, ctx, fx, src){
  const isMon = x => cardType(x) === "monster";
  const m = ctx.mon && monAt(st, ctx.mon);
  let eq = null; if (ctx.eqU) ["a", "b"].forEach(o => P(st, o).mz.forEach(x => { if (x) eqsOf(x).forEach(e => { if (e.u === ctx.eqU) eq = e; }); }));
  const ok = m ? isMon : null;
  const id = fx.into ? fxCardId({ kind: m ? "oppSummon" : "transformHand", into: fx.into, intoId: fx.intoId }, c)
    : (() => { const f = x => x && x.id !== c.id && !x.token && (!ok || ok(x)); let L = draftPool().filter(f); if (!L.length) L = [...S.cards.values()].filter(f); return L.length ? L[Math.floor(Math.random() * L.length)].id : null; })();
  if (!id){ log(st, s, `${src}：${fx.into ? `「${fx.into}」という${m ? "モンスター" : "カード"}が見つからない` : "変化先のカードがない"}`); return; }
  const done = (old, where) => log(st, s, `${src}で${where}の「${card(old).name}」が「${card(id).name}」に変化した`);
  if (m){ const old = m.c; m.c = id; m.mod = 0; delete m.mul; ev(st, { type: "summon", s: ctx.mon.s, z: ctx.mon.i }); done(old, "場"); return; }
  if (eq){ const old = eq.c; eq.c = id; done(old, "装備"); return; }
  const p = P(st, s);
  if (ctx.pz != null && p.sz[ctx.pz] && p.sz[ctx.pz].c === c.id){ p.sz[ctx.pz].c = id; done(c.id, "場"); return; }
  if (ctx.field && st.field && st.field.c === c.id){ st.field.c = id; done(c.id, "フィールド"); return; }
  if (ctx.inHand){ const k = p.hand.indexOf(ctx.inHand); if (k >= 0){ p.hand[k] = id; done(ctx.inHand, "手札"); return; } }
  const zi = p.sz.findIndex(z => z && z.c === c.id); if (zi >= 0){ p.sz[zi].c = id; done(c.id, "場"); return; }
  if (st.field && st.field.c === c.id && st.field.o === s){ st.field.c = id; done(c.id, "フィールド"); return; }
  for (const [pile, where] of [[p.grave, "墓地"], [p.exile = p.exile || [], "廃棄"], [p.hand, "手札"]]){ const k = pile.lastIndexOf(c.id); if (k >= 0){ pile[k] = id; done(c.id, where); return; } }
  log(st, s, `${src}：このカードが見つからない`);
}
function isFusion(c){ return !!(c && cardType(c) === "monster" && Array.isArray(c.fusion) && c.fusion.length); }
function fusionMatOk(id, x){
  const c = card(id); if (cardType(c) !== "monster") return false;
  if (x.m === "any") return true;
  const w = String(x.v || "").trim(); if (!w) return false;
  if (x.m === "tag") return hasTag(id, w);
  return normQ(c.name).trim() === normQ(w).trim() || plainRuby(c.nameRuby || "") === w;
}
// which hand cards / field monsters become the materials (hand first, then the weakest monsters); null = can't fuse
function fusionPlan(st, s, fc){
  const p = P(st, s), pool = [...p.hand.map((id, i) => ({ from: "hand", i, id })), ...p.mz.map((m, i) => m ? { from: "mz", i, id: m.c, a: atkOf(m) } : null).filter(Boolean).sort((x, y) => x.a - y.a)];
  const rank = { name: 0, tag: 1, any: 2 }, mats = [...fc.fusion].sort((a, b) => (rank[a.m] ?? 0) - (rank[b.m] ?? 0)), used = new Set(), out = [];
  const rec = k => { if (k >= mats.length) return true; for (let j = 0; j < pool.length; j++){ if (used.has(j) || !fusionMatOk(pool[j].id, mats[k])) continue; used.add(j); out.push(pool[j]); if (rec(k + 1)) return true; used.delete(j); out.pop(); } return false; };
  if (!rec(0)) return null;
  if (freeZone(p.mz) < 0 && !out.some(x => x.from === "mz")) return null;
  return out;
}
function transformAt(st, s, k, into, src, srcCard, fxo){
  const p = P(st, s), old = p.hand[k]; if (old == null) return;
  const id = into ? fxCardId({ kind: "transformHand", into, intoId: fxo && fxo.intoId }, srcCard) : randSpire(false);
  if (!id){ log(st, s, `${src}：${into ? `「${into}」というカードが見つからない` : "変化先のカードがない"}`); return; }
  p.hand[k] = id; log(st, s, `${src}で「${card(old).name}」が「${card(id).name}」に変化した`);
}
// 自動で使う: the drawn card is played for free (targets at random), then goes to the graveyard (or 廃棄 / stays if 永続)
function autoPlayCard(st, s, id){
  const p = P(st, s), c = card(id);
  log(st, s, `「${c.name}」を自動で使った！`); ev(st, { type: "spell", s, c: id }); countPlay(st, s, c);
  const pz = isPersist(c) ? freeZone(p.sz) : -1;
  if (isField(c)) placeField(st, s, id);
  else if (pz >= 0){ st.un = (st.un || 0) + 1; p.sz[pz] = { c: id, turn: st.turnNo, face: true, u: st.un }; }
  else if (exhausts(c) || corrupted(st, s, c)) exileCard(st, s, id, `「${c.name}」`);
  else p.grave.push(id);
  runCard(st, s, c, "use", { x: 0, autoRand: true }, st2 => onCardUsed(st2, s, c, null));
}
function genCards(st, s, sk, n, src, free){
  const p = P(st, s), pool = draftPool().filter(c => spireKind(c) === sk), got = [];
  for (let k = 0; k < n && pool.length; k++){ const c = pool[Math.floor(Math.random() * pool.length)]; p.hand.push(c.id); got.push(c); if (free) (p.freeIds = p.freeIds || []).push(c.id); }
  log(st, s, got.length ? `${src}で${got.map(c => `「${c.name}」`).join("")}を手札に加えた${free ? "（このターンはコスト0）" : ""}` : `${src}：加えられる${SPIRE_LABEL[sk]}がない`);
}
function monDmg(st, s, i, n, src){
  const m = P(st, s).mz[i]; if (!m) return;
  const a = atkOf(m), nm = card(m.c).name;
  if (n > 0 && m.vuln > 0){ n = Math.floor(n * (1.5 + (P(st, O(s)).vulnBonus || 0) / 100)); log(st, O(s), `「${nm}」は弱体で${n}ダメージに！`); }
  log(st, O(s), `${src}で「${nm}」に${n}ダメージ`);
  m.dmg = (m.dmg || 0) + n;
  if (n > 0) ev(st, { type: "hit", s, z: i, d: n });
  if (m.dmg >= a){ log(st, O(s), `「${nm}」のダメージカウンター${m.dmg}がATK${fmtN(a)}に届いた！`); destroyMonster(st, s, i, "ルールによる破壊", { rule: true }); }
  else log(st, O(s), `「${nm}」にダメージカウンターが${n}乗った（合計 ${m.dmg} / ATK ${fmtN(a)}）`);
}
const potionChips = (p, mine) => (p.potions || []).map((k, i) => [k, i, potionDef(k)]).filter(x => x[2]).map(([k, i, d]) => mine ? `<button class="bst pot" data-potion="${i}" title="${esc(d.text)}" ${G && G.st && canAct(G.st, G.slot) ? "" : "disabled"}>${d.img ? `<img alt="" src="${d.img}">` : "🧪"}${esc(d.name)}</button>` : `<span class="bst pot" title="${esc(d.text)}">${d.img ? `<img alt="" src="${d.img}">` : "🧪"}${esc(d.name)}</span>`).join("");
// the row under each player: relics, 筋力 / 脱力 / ブロック…, and ポーション (full width, so the name and LP keep their room)
const potRow = (p, mine, noPots) => { const h = statChips(p) + (noPots ? "" : potionChips(p, mine)); return h ? `<div class="pots">${h}</div>` : ""; };
const lockChips = p => { const tn = typeof G !== "undefined" && G && G.st ? G.st.turnNo : null; if (tn == null) return ""; return ((p.noAtkUntil || 0) >= tn ? `<span class="bst wk" title="効果で、このターンはモンスターが攻撃できない">攻撃できない</span>` : "") + ((p.noUseUntil || 0) >= tn ? `<span class="bst wk" title="相手の効果で、魔法・罠を発動できない">発動できない</span>` : ""); };
const timerChips = p => (p.timers || []).map(t => { const c = t.c && hasCard(t.c) ? card(t.c) : null, tx = c ? blockText(c, { ...t.b, delay: 0 }) : ""; return `<span class="bst tmrc" title="${esc(`「${t.name}」：あと${t.left}回の自分のターンのはじめで効果が出る${tx ? "（" + tx + "）" : ""}`)}">${clockSVG(t.left)}${esc(t.name)}</span>`; }).join("");
const statChips = p => lockChips(p) + timerChips(p) + Object.entries(p.free || {}).filter(([, v]) => v > 0).map(([k, v]) => `<span class="bst free" title="次に使うこの種類のカードはコスト0">次の${SPIRE_LABEL[k]}0コスト${v > 1 ? "×" + v : ""}</span>`).join("") + (p.relics || []).map(k => relicDef(k)).filter(Boolean).map(d => `<span class="bst rel" title="${esc(d.text)}">${d.img ? `<img alt="" src="${d.img}">` : ""}${esc(d.name)}</span>`).join("") + (p.block ? `<span class="bst blk" title="次の自分のターンのはじめまで、受けるダメージを先に引き受ける">ブロック ${p.block}</span>` : "") + (p.vuln > 0 ? `<span class="bst vul" title="受けるダメージが1.5倍">弱体 ${p.vuln}</span>` : "") + (p.str ? `<span class="bst str" title="カードで与えるダメージ（1回ごと）と、自分のモンスターがプレイヤーに与える戦闘ダメージが${p.str > 0 ? "+" : "−"}${Math.abs(p.str)}">筋力 ${p.str}</span>` : "") + (p.weak > 0 ? `<span class="bst wk" title="カードで与えるダメージが0.75倍">脱力 ${p.weak}</span>` : "")
  + [[p.barricade, "バリケード", "ブロックがターンのはじめに消えない"], [p.plate > 0, `プレート ${p.plate}`, "自分のターンのおわりにこの分ブロックを得る。LPを失うたび20減る"], [p.corrupt, "堕落", "スキルのコストが0。使うと廃棄"], [p.vulnBonus > 0, `無慈悲 +${p.vulnBonus}%`, "弱体の相手へのダメージがさらにふえる"], [p.firstBlock2, "盤石", "毎ターン最初のブロックが2倍"], [p.rage > 0, `激怒 ${p.rage}`, "このターン、アタックを使うたびブロックを得る"], [p.thorns > 0, `反撃 ${p.thorns}`, "攻撃してきたモンスターにダメージ"], [p.dblAtk > 0, `次のアタック×2`, "次に使うアタックをもう1回プレイ"], [(p.autoPlay || []).length, `自動：${(p.autoPlay || []).join("・")}`, "名前にこの文字が入ったカードを引くと自動で使う"]].filter(x => x[0]).map(x => `<span class="bst pw" title="${x[2]}">${x[1]}</span>`).join("");
function dealDmg(st, s, n){
  const p = P(st, s); if (n === Infinity){ p.lp = Math.min(0, p.lp); return; }
  if (n > 0 && p.vuln > 0){ n = Math.floor(n * (1.5 + (P(st, O(s)).vulnBonus || 0) / 100)); log(st, s, `弱体で${n}ダメージに！`); }
  let blk = 0;
  if (n > 0 && p.block > 0){ const b = Math.min(p.block, n); p.block -= b; n -= b; blk = b; log(st, s, `ブロックで${b}ダメージを防いだ（残りブロック ${p.block}）`); }
  p.lp -= n;
  if (n > 0 || blk) ev(st, { type: "hit", s, d: n, blk });
  if (n > 0) lostLp(st, s);
}
function log(st, s, m){ st.log.push({ t: Date.now(), s: s || "", m }); if (st.log.length > 80) st.log.splice(0, st.log.length - 80); }
const nm = (st, s) => P(st, s).name;
const isHumanHere = s => G && s === G.slot;

function checkEnd(st){
  if (st.winner) return;
  const la = st.players.a.lp, lb = st.players.b.lp;
  if (la <= 0 && lb <= 0){ st.winner = "draw"; st.why = "両者LP0"; }
  else if (la <= 0){ st.winner = "b"; st.why = `${nm(st, "a")} のLPが0になった`; }
  else if (lb <= 0){ st.winner = "a"; st.why = `${nm(st, "b")} のLPが0になった`; }
}
function drawN(st, s, n, why){
  const p = P(st, s); let got = 0;
  if (p.noDraw && n > 0){ log(st, s, `${why || ""}：このターンはもうカードを引けない`); return; }
  for (let i = 0; i < n; i++){ if (!p.deck.length) refill(st, s); if (p.deck.length){ p.hand.push(p.deck.shift()); got++; } }
  if (why) log(st, s, `${why}でカードを${got}枚引いた`);
  // 「名前に○が入ったカードを引くたび自動で使う」
  if (got && (p.autoPlay || []).length && !st.winner){
    p.hand.slice(-got).forEach(id => {
      const c = card(id); if (cardType(c) !== "magic" || !p.autoPlay.some(w => (c.name || "").includes(w))) return;
      const k = p.hand.lastIndexOf(id); if (k < 0) return;
      p.hand.splice(k, 1); autoPlayCard(st, s, id);
    });
  }
  if (got < n) log(st, s, "山札がなくて引けなかった");
}
function freeZone(arr){ return arr.findIndex(x => !x); }
const tauntIdx = (st, s) => P(st, s).mz.map((m, i) => m && hasAb(st, s, i, "taunt") ? i : -1).filter(i => i >= 0);
function targetOptions(st, s, kind, ctx = {}){
  // スパイア attack: the opponent ("p") or one of their monsters ("m:i"); only asks when there is a monster to hit
  // 1体/2体 aim at the opponent's monsters first; the player only when there is none (ランダム can hit either)
  const TS = ctx.side === "me" ? s : O(s);
  if (ctx.spireAtk && (kind === "dmg" || kind === "bash" || kind === "vuln" || kind === "weak")){ const tt = TS === s ? [] : tauntIdx(st, TS), ms = (tt.length ? tt : P(st, TS).mz.map((m, i) => m ? i : -1).filter(i => i >= 0)).map(i => "m:" + i); if (ctx.anyEnemy) return ms.length ? ["p", ...ms] : null; const left = ms.filter(o => !(ctx.hit && (ctx.hit.picked || []).includes(o))); return left.length ? ms : ["p"]; }
  const t = KINDS[kind] && KINDS[kind].target;
  if (t === "opp"){ const tt = TS === s ? [] : tauntIdx(st, TS); return tt.length ? tt : P(st, TS).mz.map((m, i) => m ? i : -1).filter(i => i >= 0); }
  if (t === "any"){
    const src = ctx.mon && monAt(st, ctx.mon);
    if (kind === "moveEquips" && (!src || !eqsOf(src).some(e => e.u !== ctx.eqU))) return [];
    const out = [];
    for (const o of [s, O(s)]) P(st, o).mz.forEach((m, i) => { if (m && m !== src) out.push(`${o}:${i}`); });
    return out;
  }
  if (t === "mine") return P(st, s).mz.map((m, i) => m ? i : -1).filter(i => i >= 0);
  if (t === "draft") return (ctx.draft || []).filter(id => S.cards.has(id));
  if (KINDS[kind] && KINDS[kind].mod && !ctx.modPick) return null;
  if (t === "hand") return P(st, s).hand.map((_, i) => i);
  if (t === "tagPick" && kind === "fusion"){ const p = P(st, s); return [...new Set(p.ex || [])].filter(id => isFusion(card(id)) && fusionPlan(st, s, card(id))); }
  if (t === "tagPick"){
    const p = P(st, s), tag = ctx.tagName || "", fromEx = kind === "exSummon" || kind === "tagSummonEx", src = fromEx ? (p.ex || []) : /Hand$/.test(kind) && kind !== "tagGraveHand" ? p.hand : /Deck$|tagSearch/.test(kind) ? p.deck : p.grave;
    const summ = /^tagSummon/.test(kind) || kind === "exSummon";
    if (summ && freeZone(p.mz) < 0) return [];
    return [...new Set(src.filter(id => (kind === "exSummon" || hasTag(id, tag)) && (!summ || cardType(card(id)) === "monster") && !(fromEx && isFusion(card(id)))))];
  }
  if (t === "graveAny") return [...new Set(P(st, s).grave)].filter(id => S.cards.has(id));
  if (t === "grave"){
    if (kind === "reborn" && freeZone(P(st, s).mz) < 0) return [];
    return [...new Set(P(st, s).grave.filter(id => cardType(card(id)) === "monster"))];
  }
  return null;
}
function autoTarget(st, s, kind, opts, fx){
  if (fx && fx.side === "me"){ const own = P(st, s), v = o => o === "p" ? 1e9 : (m => m ? atkOf(m) : 0)(own.mz[typeof o === "string" ? +o.slice(2) : o]); return opts.slice().sort((a, b) => v(a) - v(b))[0]; }
  // CPU スパイア attack: finish the strongest monster it can destroy now, otherwise the one closest to dying
  if (opts.length && opts.every(o => typeof o === "string" && o.startsWith("m:"))){
    const op = P(st, O(s)), n = fx && kind !== "vuln" ? fx.n || 0 : 0, m = o => op.mz[+o.slice(2)], left = o => (atkOf(m(o)) - (m(o).dmg || 0)) / (m(o).vuln > 0 ? 1.5 : 1);
    if (kind === "vuln" || kind === "weak") return opts.slice().sort((x, y) => atkOf(m(y)) - atkOf(m(x)))[0];
    const kill = opts.filter(o => left(o) <= n).sort((x, y) => atkOf(m(y)) - atkOf(m(x)));
    return kill.length ? kill[0] : opts.slice().sort((x, y) => left(x) - left(y))[0];
  }
  if (opts[0] === "p"){ const ms = opts.slice(1).sort((x, y) => atkOf(P(st, O(s)).mz[+y.slice(2)]) - atkOf(P(st, O(s)).mz[+x.slice(2)])); return ms.length && P(st, O(s)).lp > 300 ? ms[0] : "p"; }
  const t = KINDS[kind].target;
  if (t === "opp") return opts.slice().sort((a, b) => atkOf(P(st, O(s)).mz[b]) - atkOf(P(st, O(s)).mz[a]))[0];
  if (t === "mine") return opts.slice().sort((a, b) => (kind === "destroyOwn" ? -1 : 1) * (atkOf(P(st, s).mz[b]) - atkOf(P(st, s).mz[a])))[0];
  if (t === "grave") return opts.slice().sort((a, b) => cmpNum(baseAtk(card(b)), baseAtk(card(a))))[0];
  // CPU: throws away the cheapest (basic ones first), brings back the most expensive
  if (t === "hand"){ const h = P(st, s).hand, v = i => (SPIRE_BASIC.some(b => b.id === h[i]) ? 0 : 10) + costOf(card(h[i])); return opts.slice().sort((a, b) => v(a) - v(b))[0]; }
  if (t === "graveAny") return opts.slice().sort((a, b) => costOf(card(b)) - costOf(card(a)))[0];
  if (t === "tagPick") return opts.slice().sort((a, b) => cmpNum(cardType(card(b)) === "monster" ? baseAtk(card(b)) : costOf(card(b)) * 100, cardType(card(a)) === "monster" ? baseAtk(card(a)) : costOf(card(a)) * 100))[0];
  if (t === "any") return opts.find(o => o.startsWith(s + ":")) || opts[0];
  if (t === "draft") return opts[0];
}
/* ---- equips stick to a monster: m.eqs = [{ c, o (owner), u }] from left to right ---- */
// born: the turn it came out — 召喚酔い: it can attack from its owner's next turn (unless it has 速攻)
function mkMon(st, id){ st.un = (st.un || 0) + 1; return { c: id, mod: 0, attacked: false, eqs: [], u: st.un, born: st.turnNo }; }
const sick = (st, s, i) => { const m = P(st, s).mz[i]; return !!m && m.born === st.turnNo && !hasAb(st, s, i, "haste"); };
const monAt = (st, ref) => { const m = ref && P(st, ref.s).mz[ref.i]; return m && m.u === ref.u ? m : null; };
function findEq(st, u){ for (const s of ["a", "b"]){ const mz = P(st, s).mz; for (let i = 0; i < mz.length; i++){ const k = eqsOf(mz[i]).findIndex(e => e.u === u); if (k >= 0) return { s, i, k, e: mz[i].eqs[k] }; } } return null; }
// all equips on monster (s,i) go to their owners' graveyards
function detachEquips(st, s, i){
  const m = P(st, s).mz[i]; if (!m) return;
  eqsOf(m).forEach(e => { P(st, e.o).grave.push(e.c); log(st, e.o, `装備していた「${card(e.c).name}」も墓地へ`); });
  m.eqs = [];
}
function unequip(){}
// abilities of monster (s,i): its own + the ones its equips give (a 化身 doubles numbers)
function monAbs(st, s, i){
  const m = P(st, s).mz[i]; if (!m) return [];
  const out = absOf(card(m.c)).map(a => ({ ...a, mult: 1 }));
  const es = eqsOf(m);
  es.forEach((e, k) => absOf(card(e.c)).forEach(a => { if (a.k !== "double") out.push({ ...a, mult: eqMult(es, k), eqU: e.u }); }));
  return out;
}
function hasAb(st, s, i, ab){ return monAbs(st, s, i).some(a => a.k === ab); }
const abN = (st, s, i, ab) => monAbs(st, s, i).filter(a => a.k === ab).reduce((t, a) => t + (a.n || 0) * a.mult, 0);
const maxAttacks = (st, s, i) => hasAb(st, s, i, "twice") ? 2 : 1;
function equipsOn(st, s, i){ return eqsOf(P(st, s).mz[i]).map(e => e.c); }
function charmActive(st, m){
  const ch = m && m.charm; if (!ch) return false;
  if (ch.eu) return !!findEq(st, ch.eu);
  return ["a", "b"].some(s => P(st, s).mz.some(x => x && x.u === ch.mu));
}
// 発動できない: the card itself (このカードは発動できない) or a lock put on the player (相手は魔法・罠を発動できない)
// is window `win` the right moment for timing w?
function whenWinOk(st, w, win){
  const preSummon = win === "summon" || (win === "chain" && st.chain && st.chain.length === 1 && st.chain[0].summon);
  if (w === "attacked") return win === "attack" || win === "chainAttack";
  if (w === "oppSummon") return win === "summoned";
  if (w === "oppUse") return (win === "chain" || win === "chainAttack") && !preSummon;
  if (w === "oppEnd") return win === "end";
  return true;
}
function useBlockedWhy(st, s, c, win){
  if (c && c.noUse && (cardType(c) === "magic" || cardType(c) === "trap")) return "このカードは発動できません";
  { const w = whenOf(c); if (w && st && !whenWinOk(st, w, win !== undefined ? win : chainWindow(st))) return `このカードは「${WHEN_LABEL[w]}」にしか発動できません`; }
  if (st && s && (P(st, s).noUseUntil || 0) >= st.turnNo) return "いまは魔法・罠を発動できません（相手の効果）";
  return "";
}
const atkLocked = (st, s) => (P(st, s).noAtkUntil || 0) >= st.turnNo;
function canAttack(st, s, i){
  const m = P(st, s).mz[i];
  return !!m && !atkLocked(st, s) && !((m.noAtkTurn || 0) >= st.turnNo) && !m.attacked && st.turnNo > 1 && !sick(st, s, i) && !hasAb(st, s, i, "noAttack") && !charmActive(st, m) && atkCondOk(st, s, i);
}
// 攻撃の条件: this monster can only attack while these hold
function useCostVar(c, st, s){ return !!(c && st && s && P(st, s).mana && Array.isArray(c.atkCondsCost)); }
function atkCondsOf(c, st, s){ const L = useCostVar(c, st, s) ? c.atkCondsCost : c && c.atkConds; return c && cardType(c) === "monster" && Array.isArray(L) ? L.filter(x => x && COND_DEFS[x.k] && x.k !== "ask") : []; }
function atkJoinOf(c, st, s){ return (useCostVar(c, st, s) ? c.atkJoinCost : c.atkJoin) === "or" ? "or" : "and"; }
function atkCondOk(st, s, i){
  const m = P(st, s).mz[i], c = m && card(m.c), L = atkCondsOf(c, st, s); if (!L.length) return true;
  const ok = x => condMet(st, s, c, x, { zone: i, mon: { s, i, u: m.u } });
  return atkJoinOf(c, st, s) === "or" ? L.some(ok) : L.every(ok);
}
function atkCondText(c){
  if (!c || cardType(c) !== "monster") return "";
  const ph = (L, j) => L.length ? `${L.map(condPhrase).join(j === "or" ? "か、" : "、かつ")}なら攻撃できる` : "いつでも攻撃できる";
  const L = atkCondsOf(c), hasCost = Array.isArray(c.atkCondsCost);
  if (!hasCost) return L.length ? `【攻撃の条件】${ph(L, c.atkJoin)}（それ以外は攻撃できない）` : "";
  const K = c.atkCondsCost.filter(x => x && COND_DEFS[x.k] && x.k !== "ask");
  if (!L.length && !K.length) return "";
  return `【攻撃の条件】コストなしデッキ：${ph(L, c.atkJoin)}／コストデッキ：${ph(K, c.atkJoinCost)}`;
}
function canEquipOn(st, id, ts, ti){
  const m = P(st, ts).mz[ti]; if (!m || cardType(card(id)) !== "equip") return false;
  return eqUsed(m) + eqCostOf(card(id)) <= eqCapOf(card(m.c));
}
// trigger list for monster (s,i): the monster itself, then each equip (doubled by a 化身) — equip effects belong to the equip's owner
function monTrigList(st, s, i, trig, m, extra = {}){
  m = m || P(st, s).mz[i]; if (!m) return [];
  const base = { zone: i, mon: { s, i, u: m.u }, ...extra };
  const L = [{ s, c: card(m.c), trig, ctx: base }];
  const es = eqsOf(m);
  es.forEach((e, k) => { const n = eqMult(es, k); for (let r = 0; r < n; r++) L.push({ s: e.o, c: card(e.c), trig, ctx: { ...base, zone: e.o === s ? i : null, eqU: e.u } }); });
  return L;
}
function runList(st, L, then){
  const step = (st2, k) => { if (k >= L.length){ then && then(st2); return; } const x = L[k]; runCard(st2, x.s, x.c, x.trig, x.ctx, st3 => step(st3, k + 1)); };
  step(st, 0);
}
// turn start / end: every monster of `who`, and every equip `who` owns (wherever it's stuck)
// 時計: 自分のターンのはじめに1へって、0になったら効果が出る
function runTimers(st, who, then){
  const p = P(st, who), due = [];
  if (!(p.timers || []).length){ then && then(st); return; }
  p.timers = p.timers.filter(t => { t.left--; if (t.left <= 0){ due.push(t); return false; } return true; });
  const step = (st2, k) => {
    if (k >= due.length || st2.winner){ then && then(st2); return; }
    const t = due[k], c = (t.c && hasCard(t.c) ? card(t.c) : null) || { id: t.c, name: t.name, type: "magic" };
    log(st2, who, `時計が0に！「${t.name}」の効果`); ev(st2, { type: "spell", s: who, c: t.c });
    runBlock(st2, who, c, t.b, { ...(t.ctx || {}), hit: {}, delayed: true }, st3 => step(st3, k + 1));
  };
  step(st, 0);
}
function fireTurn(st, who, trig, then, timersDone){
  if (trig === "turnStart" && !timersDone && (P(st, who).timers || []).length) return runTimers(st, who, st2 => fireTurn(st2, who, trig, then, true));
  altarTurn(st, who, trig);
  const L = [];
  for (const o of ["a", "b"]) P(st, o).mz.forEach((m, i) => { if (m) monTrigList(st, o, i, trig).forEach(x => { if (x.s === who && hasTrig(x.c, trig)) L.push(x); }); });
  const PL = persistList(st, who, trig, {}); PL.forEach(x => log(st, who, `${x.c.relicView ? "レリック" : "永続"}「${x.c.name}」の効果！`));
  const fc = fieldCard(st), FL = fc && (trig === "turnStart" || trig === "turnEnd") && hasTrig(fc, trig) ? [{ s: who, c: fc, trig, ctx: { field: true } }] : [];
  FL.forEach(x => log(st, who, `フィールド「${x.c.name}」の効果！`));
  runList(st, L.concat(PL, FL), then);
}
// face-up 永続 cards of player s whose effect fires on `trig`
function persistList(st, s, trig, ctx){
  const L = [];
  P(st, s).sz.forEach((z, i) => { if (!z || !z.face) return; const c = card(z.c); if (isPersist(c) && hasTrig(c, trig)) L.push({ s, c, trig, ctx: { ...ctx, pz: i } }); });
  (P(st, s).relics || []).forEach(k => { const rc = relicCard(k); if (rc && trig !== "gain" && hasTrig(rc, trig)) L.push({ s, c: rc, trig, ctx: { ...ctx } }); });
  return L;
}
function persistFire(st, s, trig, ctx, then){
  const L = persistList(st, s, trig, ctx);
  if (L.length) L.forEach(x => log(st, s, `${x.c.relicView ? "レリック" : "永続"}「${x.c.name}」の効果！`));
  runList(st, L, then);
}
// stick equip hand[hi] of player s onto monster (ts,ti) at position pos (default: rightmost)
function equip(st, s, hi, ts, ti, pos, disc){
  const p = P(st, s), id = p.hand[hi], c = card(id);
  if (!id || cardType(c) !== "equip") return false;
  const m = P(st, ts).mz[ti]; if (!m) return false;
  if (!canEquipOn(st, id, ts, ti) || !pay(st, s, c)) return false;
  p.hand.splice(hi, 1);
  discardCost(st, s, c, shiftPicks(disc, hi));
  if (!m.eqs) m.eqs = [];
  const k = pos == null ? m.eqs.length : Math.max(0, Math.min(+pos, m.eqs.length));
  st.un = (st.un || 0) + 1;
  const e = { c: id, o: s, u: st.un };
  m.eqs.splice(k, 0, e);
  ev(st, { type: "equip", s: ts, z: ti });
  const n = c.eqN || 0, ab = absOf(c).map(a => ABS[a.k].label).join("・");
  log(st, s, `「${c.name}」を${ts === s ? "" : "相手の"}「${card(m.c).name}」に装備${n ? `（ATK${n > 0 ? "+" : "−"}${Math.abs(n)}）` : ""}${ab ? `：${ab}` : ""}（キャパ ${eqUsed(m)}/${eqCapOf(card(m.c))}）`);
  const mult = eqMult(m.eqs, k), L = [];
  for (let r = 0; r < mult; r++) L.push({ s, c, trig: "attach", ctx: { zone: ts === s ? ti : null, mon: { s: ts, i: ti, u: m.u }, eqU: e.u } });
  runList(st, L, null);
  return true;
}
// visual events, stored in the game state so both players see the same animations
function ev(st, e){ st.evn = (st.evn || 0) + 1; (st.ev || (st.ev = [])).push({ ...e, n: st.evn }); if (st.ev.length > 30) st.ev.splice(0, st.ev.length - 30); }
// returns true if the monster actually left the field. opt.battle: destroyed by battle; opt.force: manual (no protection)
function destroyMonster(st, s, i, why, opt = {}){
  const p = P(st, s), m = p.mz[i]; if (!m) return false;
  const name = card(m.c).name;
  // opt.rule: ダメージカウンターがATKに届いた → ルールによる破壊 (効果での破壊ではないので、耐性も身代わりも効かない)
  if (!opt.force && !opt.rule){
    if (!opt.battle && hasAb(st, s, i, "noEffect")){ log(st, s, `「${name}」は効果では破壊されない！`); return false; }
    const es = eqsOf(m);
    if (es.some(e => absOf(card(e.c)).some(a => a.k === "substitute"))){
      let k = es.findIndex(e => !absOf(card(e.c)).some(a => a.k === "substitute"));
      if (k < 0) k = es.findIndex(e => absOf(card(e.c)).some(a => a.k === "substitute"));
      const [e] = es.splice(k, 1); P(st, e.o).grave.push(e.c);
      log(st, s, `「${name}」は「${card(e.c).name}」を身代わりにして破壊をまぬがれた！`);
      return false;
    }
  }
  const es = eqsOf(m);
  p.mz[i] = null; p.grave.push(m.c); ev(st, { type: "destroy", s, z: i });
  log(st, s, `「${name}」が破壊された${why ? "（" + why + "）" : ""}`);
  es.forEach(e => P(st, e.o).grave.push(e.c));
  if (es.length) log(st, s, `付いていた装備${es.map(e => `「${card(e.c).name}」`).join("")}も墓地へ`);
  // スパイアデッキ: beating an opponent's monster → カード報酬 + maybe a ポーション
  // 選択の祭壇: beating an opponent's monster → カード報酬, 40% ポーション, 10% レリック
  if (!opt.force && hasAltar(P(st, O(s)))) offerReward(st, O(s), { pot: Math.random() < POTION_DROP ? randPotionKey() : null, rel: Math.random() < RELIC_DROP ? dropRelicId(st, O(s)) : null });
  runList(st, monTrigList(st, s, i, "destroyed", m, { eqs: es.map(e => ({ c: e.c, o: e.o, u: e.u })), eqCount: es.length }), st2 => persistFire(st2, s, "monDestroyed", {}, st3 => persistFire(st3, O(s), "monDestroyed", {}, opt.then)));
  return true;
}
// apply effect of card c for player s. target resolved already (or undefined for untargeted)
function applyEffect(st, s, c, target, ctx = {}, fx = normFx(c)){
  if (!fx) return;
  if (ctx.hit && ctx.spireAtk && typeof target === "string") ctx.hit.t = target;
  if (ctx.hit && target != null) (ctx.hit.picked = ctx.hit.picked || []).push(String(target));
  const me = P(st, s), op = P(st, O(s)), src = `「${c.name}」`, OS = fx.side === "me" && SIDED_KINDS.has(fx.kind) ? s : O(s), opT = P(st, OS);
  let n = fx.n || 0;
  if (fx.per && !fx.hits) n += (fx.pm ?? 1) * perVal(st, s, c, fx, target, ctx);
  if (["dmg", "dmgAll", "dmgRand", "bash"].includes(fx.kind)) n = hitPower(st, s, n, ctx);
  switch (fx.kind){
    case "heal": me.lp += n; log(st, s, `${src}でLPを${n}回復`); break;
    case "dmgRand": { const L = ["p", ...opT.mz.map((m, i) => m ? "m:" + i : null).filter(Boolean)], t = L[Math.floor(Math.random() * L.length)]; if (t === "p"){ log(st, s, `${src}で${opT.name}に${n}ダメージ（ランダム）`); dealDmg(st, OS, n); } else monDmg(st, OS, +t.slice(2), n, src + "（ランダム）"); break; }
    case "dmgAll": { opT.mz.map((m, i) => m ? i : -1).filter(i => i >= 0).forEach(i => monDmg(st, OS, i, n, src)); log(st, s, `${src}で${opT.name}に${n}ダメージ`); dealDmg(st, OS, n); break; }
    case "copyGrave": if (c && hasCard(c.id)){ me.grave.push(c.id); log(st, s, `${src}のコピーを墓地に加えた`); } break;
    case "freeAttack": case "freeSkill": case "freePower": { const k = fx.kind.slice(4).toLowerCase(); me.free = { ...(me.free || {}), [k]: ((me.free || {})[k] || 0) + 1 }; log(st, s, `${src}：次に使う${SPIRE_LABEL[k]}のコストが0になる`); break; }
    case "draft": if (target && hasCard(target)){ me.grave.push(target); log(st, s, `${src}で「${card(target).name}」を墓地に加えた`); } break;
    case "atkAll": { let k = 0; me.mz.forEach(m => { if (m){ m.mod = (m.mod || 0) + n; k++; } }); log(st, s, `${src}で自分のモンスター${k}体のATK+${n}`); break; }
    case "dmg": if (typeof target === "string" && target.startsWith("m:")){ monDmg(st, OS, +target.slice(2), n, src); break; } log(st, s, `${src}で${opT.name}に${n}ダメージ`); dealDmg(st, OS, n); break;
    case "block": { if (me.firstBlock2 && !me.blockedNow && !ctx.potion){ n *= 2; log(st, s, `最初のブロックなので2倍！`); } me.blockedNow = true; me.block = (me.block || 0) + n; log(st, s, `${src}でブロックを${n}得た（ブロック ${me.block}）`); if (n > 0) persistFire(st, s, "blockGain", {}); break; }
    case "barricade": me.barricade = true; log(st, s, `${src}：ブロックがターンのはじめに消えなくなった`); break;
    case "plate": me.plate = (me.plate || 0) + n; log(st, s, `${src}でプレート${n}を得た（プレート ${me.plate}）`); break;
    case "corrupt": me.corrupt = true; log(st, s, `${src}：スキルのコストが0になり、使うと廃棄されるようになった`); break;
    case "vulnBonus": me.vulnBonus = (me.vulnBonus || 0) + n; log(st, s, `${src}：弱体の相手へのダメージが+${me.vulnBonus}%`); break;
    case "firstBlock2": me.firstBlock2 = true; log(st, s, `${src}：毎ターン最初のブロックが2倍になった`); break;
    case "rageNow": me.rage = (me.rage || 0) + n; log(st, s, `${src}：このターン、アタックを使うたびブロック${me.rage}`); break;
    case "thornsNow": me.thorns = (me.thorns || 0) + n; log(st, s, `${src}：次の自分のターンまで、攻撃してきたモンスターに${me.thorns}ダメージ`); break;
    case "dblAtk": me.dblAtk = (me.dblAtk || 0) + (n || 1); log(st, s, `${src}：次に使うアタックをもう1回プレイする`); break;
    case "copyLastAtk": if (me.lastAtk && hasCard(me.lastAtk)){ me.hand.push(me.lastAtk); log(st, s, `${src}で「${card(me.lastAtk).name}」のコピーを手札に加えた`); } else log(st, s, `${src}：コピーするアタックがない`); break;
    case "graveAtkToHand": { let k = 0; for (let r = 0; r < (n || 1); r++){ const L = me.grave.map((id, j) => j).filter(j => isAttackCard(card(me.grave[j]))); if (!L.length) break; const j = L[Math.floor(Math.random() * L.length)], id = me.grave.splice(j, 1)[0]; me.hand.push(id); k++; log(st, s, `${src}で墓地の「${card(id).name}」を手札に加えた`); } if (!k) log(st, s, `${src}：墓地にアタックがない`); break; }
    case "vuln": addVuln(st, s, target, n, src, OS); break;
    case "bash": if (typeof target === "string" && target.startsWith("m:")){ const i = +target.slice(2), u = opT.mz[i] && opT.mz[i].u; monDmg(st, OS, i, n, src); if (opT.mz[i] && opT.mz[i].u === u) addVuln(st, s, target, 2, src, OS); } else { log(st, s, `${src}で${opT.name}に${n}ダメージ`); dealDmg(st, OS, n); addVuln(st, s, "p", 2, src, OS); } break;
    case "draw": drawN(st, s, n, src); break;
    case "discard": {
      let k = 0; for (let j = 0; j < n && op.hand.length; j++){ op.grave.push(op.hand.splice(Math.floor(Math.random() * op.hand.length), 1)[0]); k++; }
      log(st, s, `${src}で${op.name}の手札を${k}枚捨てさせた`); break;
    }
    case "destroy": if (opT.mz[target]) destroyMonster(st, OS, target, src); break;
    case "destroyOwn": if (me.mz[target]) destroyMonster(st, s, target, src); break;
    // 「このターン」: 自分のターンならこのターン、相手のターンに出たら次の自分のターン
    case "atkMul": { const m = ctx.mon && monAt(st, ctx.mon); if (!m){ log(st, s, `${src}：そのモンスターはもう場にいない`); break; } m.mul = (m.mul || 1) * Math.max(0, n || 1); log(st, s, `${src}：「${card(m.c).name}」のATKが${n}倍に（ATK ${fmtN(atkOf(m))}）`); break; }
    case "summonSelf": {
      const id = ctx.inHand || c.id, k = me.hand.indexOf(id), z = freeZone(me.mz);
      if (k < 0){ log(st, s, `${src}：手札にこのカードがない`); break; } if (z < 0){ log(st, s, `${src}：場がいっぱいで出せない`); break; }
      me.hand.splice(k, 1); me.mz[z] = mkMon(st, id); ev(st, { type: "summon", s, z }); log(st, s, `「${card(id).name}」が手札から特殊召喚された`);
      trigger(st, s, card(id), "ssummon", { zone: z, mon: { s, i: z, u: me.mz[z].u } }); persistFire(st, s, "mySummon", {});
      break;
    }
    case "thisTopOnly": { const m = ctx.mon && monAt(st, ctx.mon); if (!m){ log(st, s, `${src}：そのモンスターはもう場にいない`); break; } m.topOnly = true; log(st, s, `${src}：「${card(m.c).name}」は相手の一番ATKが高いモンスターにしか攻撃できなくなった`); break; }
    case "thisNoAtk": { const m = ctx.mon && monAt(st, ctx.mon); if (!m){ log(st, s, `${src}：そのモンスターはもう場にいない`); break; } m.noAtkTurn = Math.max(m.noAtkTurn || 0, st.turn === ctx.mon.s ? st.turnNo : st.turnNo + 1); log(st, s, `${src}：「${card(m.c).name}」はこのターン攻撃できない`); break; }
    case "selfNoAtk": me.noAtkUntil = Math.max(me.noAtkUntil || 0, st.turn === s ? st.turnNo : st.turnNo + 1); log(st, s, `${src}：このターン、${me.name}のモンスターは攻撃できない`); break;
    case "modAdd": case "modRep": case "modClear": case "modName": modApply(st, s, c, fx, target, src); break;
    case "destroyThis": { const m = ctx.mon && monAt(st, ctx.mon); if (m) destroyMonster(st, ctx.mon.s, ctx.mon.i, src); else log(st, s, `${src}：破壊するモンスターがもう場にいない`); break; }
    case "destroyOwnAll": { const L = me.mz.map((m, i) => m ? i : -1).filter(i => i >= 0); if (!L.length) log(st, s, `${src}：自分のモンスターがいない`); L.forEach(i => { if (me.mz[i]) destroyMonster(st, s, i, src); }); break; }
    case "destroyAll": { const idx = opT.mz.map((m, i) => m ? i : -1).filter(i => i >= 0); log(st, s, `${src}で${OS === s ? "自分" : "相手"}のモンスターをすべて破壊！`); idx.forEach(i => destroyMonster(st, OS, i, src)); break; }
    case "selfAtk": {
      const m = ctx.mon ? monAt(st, ctx.mon) : ctx.zone != null ? me.mz[ctx.zone] : null;
      if (m && (ctx.mon || m.c === c.id)){ m.mod = (m.mod || 0) + n; log(st, s, `${src}で「${card(m.c).name}」のATK+${n}`); } else log(st, s, `${src}：場にいないのでATKは上がらない`);
      break;
    }
    case "moveEquips": {
      const srcM = ctx.mon && monAt(st, ctx.mon), [ts, ti] = String(target).split(":"), tm = (ts === "a" || ts === "b") ? P(st, ts).mz[+ti] : null;
      if (!srcM || !tm){ log(st, s, `${src}：付けかえる先がいない`); break; }
      const mv = eqsOf(srcM).filter(e => e.u !== ctx.eqU);
      srcM.eqs = eqsOf(srcM).filter(e => e.u === ctx.eqU);
      tm.eqs = eqsOf(tm).concat(mv);
      ev(st, { type: "equip", s: ts, z: +ti });
      log(st, s, `${src}で装備${mv.map(e => `「${card(e.c).name}」`).join("")}を${ts === s ? "" : "相手の"}「${card(tm.c).name}」に付けかえた`);
      break;
    }
    case "equipsToHand": {
      const back = [];
      (ctx.eqs || []).forEach(e => { if (e.u === ctx.eqU) return; const g = P(st, e.o).grave, k = g.lastIndexOf(e.c); if (k >= 0){ g.splice(k, 1); P(st, e.o).hand.push(e.c); back.push(e.c); } });
      log(st, s, back.length ? `${src}で装備${back.map(id => `「${card(id).name}」`).join("")}が手札に戻った` : `${src}：手札に戻す装備がない`);
      break;
    }
    case "blast": {
      const X = (ctx.eqCount || 0) * n, hit = [];
      for (const o of [s, O(s)]) P(st, o).mz.forEach((m, i) => { if (m && atkOf(m) <= X) hit.push([o, i, atkOf(m)]); });
      log(st, s, `${src}が自爆！ ATK${X}以下のモンスターをすべて破壊`); ev(st, { type: "blast", s, x: X });
      const dead = hit.filter(([o, i]) => destroyMonster(st, o, i, src)).map(h => h[2]);
      if (dead.length){ const d = Math.min(...dead); dealDmg(st, O(s), d); log(st, s, `${src}：${op.name}に${fmtN(d)}ダメージ（破壊したうち一番低いATK）`); }
      else log(st, s, `${src}：破壊されたモンスターはいなかった`);
      break;
    }
    case "charm": {
      const m = opT.mz[target];
      if (m){ m.charm = { eu: ctx.eqU || null, mu: ctx.mon ? ctx.mon.u : null, c: c.id }; log(st, s, `${src}で「${card(m.c).name}」を魅了した（攻撃できない）`); }
      break;
    }
    case "atkUp": if (me.mz[target]){ me.mz[target].mod = (me.mz[target].mod || 0) + n; log(st, s, `${src}で「${card(me.mz[target].c).name}」のATK+${n}`); } break;
    case "charmAll": opT.mz.forEach(m => { if (m) m.charm = { eu: ctx.eqU || null, mu: ctx.mon ? ctx.mon.u : null, c: c.id }; }); log(st, s, `${src}で${OS === s ? "自分" : "相手"}のモンスターをすべて魅了した（攻撃できない）`); break;
    case "vulnAll": addVuln(st, s, "p", n, src, OS); opT.mz.forEach((m, i) => { if (m) addVuln(st, s, "m:" + i, n, src, OS); }); break;
    case "weak": addWeak(st, s, target, n, src, OS); break;
    case "weakAll": addWeak(st, s, "p", n, src, OS); opT.mz.forEach((m, i) => { if (m) addWeak(st, s, "m:" + i, n, src, OS); }); break;
    case "str": me.str = (me.str || 0) + n; log(st, s, `${src}で筋力${n}を得た（筋力 ${me.str}）`); break;
    case "strTemp": me.str = (me.str || 0) + n; me.strTemp = (me.strTemp || 0) + n; log(st, s, `${src}でこのターン筋力${n}を得た（筋力 ${me.str}）`); break;
    case "oppStr": op.str = (op.str || 0) + n; log(st, s, `${src}で${op.name}が筋力${n}を得た（筋力 ${op.str}）`); break;
    case "oppStrDown": op.str = (op.str || 0) - n; op.strTemp = (op.strTemp || 0) - n; log(st, s, `${src}で${op.name}の筋力が${n}下がった（筋力 ${op.str}・${op.name}のターンの終わりまで）`); break;
    case "loseLp": me.lp -= n; ev(st, { type: "hit", s, d: n, blk: 0 }); log(st, s, `${src}でLPを${n}失った`); lostLp(st, s); break;
    case "copyHand": if (c && hasCard(c.id)){ me.hand.push(c.id); log(st, s, `${src}のコピーを手札に加えた`); } break;
    case "copyDeck": if (c && hasCard(c.id)){ me.deck.splice(Math.floor(Math.random() * (me.deck.length + 1)), 0, c.id); log(st, s, `${src}のコピーを山札に混ぜた`); } break;
    case "exhaustHand": if (me.hand[target] != null) exileCard(st, s, me.hand.splice(target, 1)[0], src); break;
    case "exhaustRand": { let k = 0; for (let r = 0; r < (n || 1) && me.hand.length; r++){ exileCard(st, s, me.hand.splice(Math.floor(Math.random() * me.hand.length), 1)[0], src); k++; } if (!k) log(st, s, `${src}：廃棄する手札がない`); ctx.exN = k; break; }
    case "exhaustAll": { const L = me.hand.splice(0); L.forEach(id => exileCard(st, s, id, src)); ctx.exN = L.length; if (!L.length) log(st, s, `${src}：廃棄する手札がない`); break; }
    case "exhaustNonAtk": { const L = me.hand.filter(id => !isAttackCard(card(id))); me.hand = me.hand.filter(id => isAttackCard(card(id))); L.forEach(id => exileCard(st, s, id, src)); ctx.exN = L.length; if (!L.length) log(st, s, `${src}：アタック以外の手札がない`); break; }
    case "graveToTop": { const k = me.grave.indexOf(target); if (k >= 0){ me.grave.splice(k, 1); me.deck.unshift(target); log(st, s, `${src}で墓地の「${card(target).name}」を山札の一番上に置いた`); } break; }
    case "noDraw": me.noDraw = true; log(st, s, `${src}：このターンはもうカードを引けない`); break;
    case "drawUntil": { let k = 0, last = null; while (k < 12 && !me.noDraw){ if (!me.deck.length) refill(st, s); if (!me.deck.length) break; last = me.deck.shift(); me.hand.push(last); k++; if (!isAttackCard(card(last))) break; } log(st, s, `${src}でカードを${k}枚引いた${last && !isAttackCard(card(last)) ? `（「${card(last).name}」で止まった）` : ""}`); break; }
    case "tagSearch": case "tagGraveHand": { const src = fx.kind === "tagSearch" ? me.deck : me.grave, k = src.indexOf(target); if (k >= 0){ src.splice(k, 1); me.hand.push(target); log(st, s, `${src === me.deck ? "山札" : "墓地"}から「${card(target).name}」を手札に加えた`); if (fx.kind === "tagSearch") me.deck = shuffle(me.deck); } break; }
    case "fusion": {
      const fc = card(target), ex = (me.ex = me.ex || []), k = ex.indexOf(target), plan = k >= 0 && isFusion(fc) ? fusionPlan(st, s, fc) : null;
      if (!plan){ log(st, s, `${src}：融合できない（素材が足りない）`); break; }
      const names = plan.map(x => `「${card(x.id).name}」`).join("");
      plan.filter(x => x.from === "hand").map(x => x.i).sort((a, b) => b - a).forEach(i => me.grave.push(me.hand.splice(i, 1)[0]));
      plan.filter(x => x.from === "mz").forEach(x => sendToGrave(st, s, x.i));
      ex.splice(k, 1); const z = freeZone(me.mz); me.mz[z] = mkMon(st, target); ev(st, { type: "summon", s, z });
      log(st, s, `${src}：${names}を融合！「${fc.name}」を融合召喚した`);
      trigger(st, s, fc, "ssummon", { zone: z, mon: { s, i: z, u: me.mz[z].u } }); persistFire(st, s, "mySummon", {});
      break;
    }
    case "tagSummonHand": case "tagSummonDeck": case "tagSummonGrave": case "tagSummonEx": case "exSummon": {
      const src = fx.kind === "tagSummonHand" ? me.hand : fx.kind === "tagSummonDeck" ? me.deck : fx.kind === "tagSummonGrave" ? me.grave : (me.ex = me.ex || []), k = src.indexOf(target), z = freeZone(me.mz);
      if (k < 0 || z < 0){ log(st, s, `「${c.name}」：出せるモンスターがいない`); break; }
      src.splice(k, 1); me.mz[z] = mkMon(st, target); ev(st, { type: "summon", s, z });
      log(st, s, `${src === me.hand ? "手札" : src === me.deck ? "山札" : src === me.grave ? "墓地" : "EXデッキ"}から「${card(target).name}」を場に出した`);
      trigger(st, s, card(target), "ssummon", { zone: z, mon: { s, i: z, u: me.mz[z].u } }); persistFire(st, s, "mySummon", {});
      break;
    }
    case "tagGen": { const pool = [...S.cards.values()].filter(x => x && hasTag(x.id, fx.into) && !x.token), got = []; for (let r = 0; r < (n || 1) && pool.length; r++){ const x = pool[Math.floor(Math.random() * pool.length)]; me.hand.push(x.id); got.push(x); } log(st, s, got.length ? `${src}で${got.map(x => `「${x.name}」`).join("")}を手札に加えた` : `${src}：タグ「${fx.into || "？"}」のカードがない`); break; }
    case "transformHand": transformAt(st, s, target, fx.into, src, c, fx); break;
    case "transformRand": { const L = shuffle(me.hand.map((_, k) => k)).slice(0, n || 1); if (!L.length) log(st, s, `${src}：手札がない`); L.forEach(k => transformAt(st, s, k, fx.into, src, c, fx)); break; }
    case "transformAtk": { const L = me.hand.map((id, k) => isAttackCard(card(id)) ? k : -1).filter(k => k >= 0); if (!L.length) log(st, s, `${src}：手札にアタックがない`); L.forEach(k => transformAt(st, s, k, fx.into, src, c, fx)); break; }
    case "transformSelf": transformSelf(st, s, c, ctx, fx, src); break;
    case "transformAll": { if (!me.hand.length) log(st, s, `${src}：手札がない`); me.hand.forEach((_, k) => transformAt(st, s, k, fx.into, src, c, fx)); break; }
    case "oppNoAtk": case "oppNoUse": { const until = st.turn === s ? st.turnNo + 1 : st.turnNo, k = fx.kind === "oppNoAtk" ? "noAtkUntil" : "noUseUntil"; op[k] = Math.max(op[k] || 0, until); log(st, s, `${src}：${op.name}は次のターンの終わりまで${fx.kind === "oppNoAtk" ? "攻撃" : "魔法・罠を発動"}できない`); break; }
    case "oppSetNamed": {
      const id = fxCardId(fx, c);
      if (!id){ log(st, s, `${src}：「${fx.into || "？"}」という魔法・罠が見つからない`); break; }
      let k = 0; for (let r = 0; r < (n || 1); r++){ const z = freeZone(op.sz); if (z < 0) break; op.sz[z] = { c: id, turn: st.turnNo }; k++; }
      log(st, s, k ? `${src}で${op.name}の魔法・罠ゾーンにカードを${k}枚セットした` : `${src}：${op.name}の魔法・罠ゾーンがいっぱいでセットできない`);
      break;
    }
    case "oppDraw": { let k = 0; for (let r = 0; r < (n || 1); r++){ if (!op.deck.length) refill(st, O(s)); if (!op.deck.length) break; op.hand.push(op.deck.shift()); k++; } log(st, s, `${src}で${op.name}はカードを${k}枚引いた${k < (n || 1) ? "（山札がなくてそれ以上引けなかった）" : ""}`); break; }
    case "oppGenHand": case "oppGenDeck": { const id = fxCardId(fx, c); if (!id){ log(st, s, `${src}：「${fx.into || "？"}」というカードが見つからない`); break; } for (let r = 0; r < (n || 1); r++){ if (fx.kind === "oppGenHand") op.hand.push(id); else op.deck.splice(Math.floor(Math.random() * (op.deck.length + 1)), 0, id); } log(st, s, `${src}で「${card(id).name}」を${n || 1}枚${op.name}の${fx.kind === "oppGenHand" ? "手札に加えた" : "山札に混ぜた"}`); break; }
    case "oppSummon": {
      const id = fxCardId(fx, c);
      if (!id){ log(st, s, `${src}：「${fx.into || "？"}」というモンスターが見つからない`); break; }
      let k = 0; for (let r = 0; r < (n || 1); r++){ const z = freeZone(op.mz); if (z < 0) break; op.mz[z] = mkMon(st, id); ev(st, { type: "summon", s: O(s), z }); k++; }
      log(st, s, k ? `${src}で「${card(id).name}」を${k}体${op.name}の場に出した` : `${src}：${op.name}の場がいっぱいで出せない`);
      break;
    }
    case "genNamed": { const id = fxCardId(fx, c); if (!id){ log(st, s, `${src}：「${fx.into || "？"}」というカードが見つからない`); break; } for (let r = 0; r < (n || 1); r++) me.hand.push(id); log(st, s, `${src}で「${card(id).name}」を${n || 1}枚手札に加えた`); break; }
    case "autoPlay": if (fx.into){ me.autoPlay = [...new Set([...(me.autoPlay || []), fx.into])]; log(st, s, `${src}：これから名前に「${fx.into}」が入ったカードは引いたら自動で使う`); } break;
    case "genAttack": genCards(st, s, "attack", n || 1, src); break;
    case "genAttack0": genCards(st, s, "attack", n || 1, src, true); break;
    case "genSkill": genCards(st, s, "skill", n || 1, src); break;
    case "genPower": genCards(st, s, "power", n || 1, src); break;
    case "atkDownAll": opT.mz.forEach(m => { if (m) m.mod = (m.mod || 0) - n; }); log(st, s, `${src}で${OS === s ? "自分" : "相手"}のモンスターすべてのATK−${n}`); break;
    case "atkDown": if (opT.mz[target]){ opT.mz[target].mod = (opT.mz[target].mod || 0) - n; log(st, s, `${src}で「${card(opT.mz[target].c).name}」のATK−${n}`); } break;
    case "revive": { const gi = me.grave.indexOf(target); if (gi >= 0){ me.grave.splice(gi, 1); me.hand.push(target); log(st, s, `${src}で墓地の「${card(target).name}」を手札に戻した`); } break; }
    case "reborn": { const gi = me.grave.indexOf(target), z = freeZone(me.mz); if (gi >= 0 && z >= 0){ me.grave.splice(gi, 1); me.mz[z] = mkMon(st, target); ev(st, { type: "summon", s, z }); log(st, s, `${src}で墓地の「${card(target).name}」を場に出した（特殊召喚）`); trigger(st, s, card(target), "ssummon", { zone: z, mon: { s, i: z, u: me.mz[z].u } }); } break; }
    case "manaNow": if (me.mana){ me.mana.cur += n; log(st, s, `${src}でマナを${n}回復（${me.mana.cur}/${me.mana.max}）`); } else log(st, s, `${src}：マナを使わないデッキなので効果なし`); break;
    case "manaMax": if (me.mana){ const add = Math.min(n, MAX_MANA - me.mana.max); me.mana.max += add; me.mana.cur += n; if (me.spire) me.maxAdj = (me.maxAdj || 0) + add; log(st, s, `${src}で最大マナ+${add}、マナ+${n}（${me.mana.cur}/${me.mana.max}）`); } else log(st, s, `${src}：マナを使わないデッキなので効果なし`); break;
    case "manaDrain": if (op.mana){ const k = Math.min(n, op.mana.cur); op.mana.cur -= k; log(st, s, `${src}で${op.name}のマナを${k}減らした`); } else log(st, s, `${src}：相手はマナを使わないデッキなので効果なし`); break;
    case "negate": if (ctx.attack){ st.pending.negated = true; log(st, s, `${src}で攻撃を無効にした`); } else log(st, s, `${src}：無効にする攻撃がない`); break;
    case "atkDownAtk": { const am = ctx.attack && P(st, ctx.attack.by).mz[ctx.attack.from]; if (am){ am.mod = (am.mod || 0) - n; log(st, s, `${src}で攻撃してきた「${card(am.c).name}」のATK−${n}`); } else log(st, s, `${src}：攻撃してきたモンスターがいない`); break; }
    case "killAtk": if (ctx.attack){ destroyMonster(st, ctx.attack.by, ctx.attack.from, src); } else log(st, s, `${src}：攻撃してきたモンスターがいない`); break;
    case "win": {
      let ok = true;
      if (fx.cond === "lp") ok = me.lp <= fx.cn;
      if (fx.cond === "grave") ok = me.grave.length >= fx.cn;
      if (fx.cond === "hand") ok = me.hand.filter(id => id === c.id).length + (ctx.fromHand ? 1 : 0) >= fx.cn;
      if (ok){ st.winner = s; st.why = `${src}の効果で勝利`; log(st, s, `${src}の効果でゲームに勝利！`); }
      else log(st, s, `${src}：勝利の条件がそろっていない`);
      break;
    }
  }
}
// resolve an effect that may need a target; `then` runs after (for attack responses)
function runEffect(st, s, c, ctx = {}, then, fx = normFx(c)){
  if (!fx){ then && then(st); return; }
  if (fx.ask){
    if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c, fx, ctx, then }); return; }
    const yes = Math.random() < .5;
    log(st, s, `「${c.name}」：「${fx.ask}」→ ${yes ? "はい" : "いいえ"}`);
    if (!yes){ then && then(st); return; }
    fx = { ...fx, ask: "" };
  }
  if (fx.kind === "draft" && !ctx.draft) ctx = { ...ctx, draft: draftPick(fx.n) };
  if (KINDS[fx.kind] && KINDS[fx.kind].tag) ctx = { ...ctx, tagName: fx.into || "" };
  if (SIDED_KINDS.has(fx.kind)) ctx = { ...ctx, side: fx.side === "me" ? "me" : null };
  if (KINDS[fx.kind] && KINDS[fx.kind].mod) ctx = { ...ctx, modPick: modT(fx).scope === "pick" };
  // 「○1つにつき、もう1回」: the hit is repeated (each one is a normal hit)
  if (fx.hits && fx.per){ const k = 1 + Math.max(0, perVal(st, s, c, fx, null, ctx)), one = { ...fx, per: null, hits: false }, go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } runEffect(st2, s, c, ctx, st3 => go(st3, r - 1), one); }; go(st, Math.min(k, 30)); return; }
  if (fx.kind === "playHandAtk"){ const go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } const p = P(st2, s), L = p.hand.map((id, j) => j).filter(j => isAttackCard(card(p.hand[j])) && cardType(card(p.hand[j])) === "magic"); if (!L.length){ log(st2, s, `「${c.name}」：手札にアタックがない`); then && then(st2); return; } const id = p.hand.splice(L[Math.floor(Math.random() * L.length)], 1)[0]; p.deck.unshift(id); playTopCard(st2, s, `「${c.name}」`, false, st3 => go(st3, r - 1)); }; go(st, Math.max(1, fx.n || 1)); return; }
  if (fx.kind === "playTop" || fx.kind === "playTopEx"){ const ex = fx.kind === "playTopEx", go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } playTopCard(st2, s, `「${c.name}」`, ex, st3 => go(st3, r - 1)); }; go(st, Math.max(1, fx.n || 1)); return; }
  if ((c && c.frame === "spire" || fx.rand || fx.distinct) && (fx.kind === "dmg" || fx.kind === "bash" || fx.kind === "vuln" || fx.kind === "weak")) ctx = { ...ctx, spireAtk: true };
  let opts = targetOptions(st, s, fx.kind, ctx);
  if (opts && fx.distinct && ctx.hit && ctx.hit.picked) opts = opts.filter(o => !ctx.hit.picked.includes(String(o)));
  if (fx.rand && ctx.spireAtk) ctx = { ...ctx, anyEnemy: true }, opts = targetOptions(st, s, fx.kind, ctx);
  if (opts && opts.length === 1 && opts[0] === "p" && ctx.spireAtk){ applyEffect(st, s, c, "p", ctx, fx); then && then(st); return; }
  if (opts && opts.length && (fx.rand || ctx.autoRand)){ applyEffect(st, s, c, opts[Math.floor(Math.random() * opts.length)], ctx, fx); then && then(st); return; }
  if (opts && !fx.distinct && ctx.spireAtk && ctx.hit && ctx.hit.t && opts.includes(ctx.hit.t)){ applyEffect(st, s, c, ctx.hit.t, ctx, fx); then && then(st); return; }
  if (opts === null){ applyEffect(st, s, c, undefined, ctx, fx); then && then(st); return; }
  if (!opts.length){ log(st, s, `「${c.name}」：対象がいない`); then && then(st); return; }
  if (isHumanHere(s)){
    G.chooseQ.push({ s, c, fx, ctx, then });
  } else { applyEffect(st, s, c, autoTarget(st, s, fx.kind, opts, fx), ctx, fx); then && then(st); }
}
// is a card with this name in player s's field / graveyard / hand? (the triggering monster itself doesn't count)
function comboMet(st, s, cb, ctx = {}){ return comboCount(st, s, cb, ctx) >= 1; }
// how many cards with that name player s has there (場 counts monsters, magic/trap zone and the equips they own)
function comboCount(st, s, cb, ctx = {}){
  const p = P(st, s), want = normQ(cb.name).trim();
  const is = cb.match === "tag" ? (id => hasTag(id, String(cb.name || "").trim())) : cb.match === "part" ? (id => normQ(card(id).name).includes(want)) : (id => normQ(card(id).name).trim() === want);
  const field = () => p.mz.filter((m, i) => m && !(ctx.zone != null && i === ctx.zone) && is(m.c)).length + p.sz.filter(z => z && is(z.c)).length + ["a", "b"].reduce((a, o) => a + P(st, o).mz.reduce((b, m) => b + eqsOf(m).filter(e => e.o === s && e.u !== ctx.eqU && is(e.c)).length, 0), 0);
  const grave = () => p.grave.filter(is).length, hand = () => p.hand.filter(is).length, deck = () => p.deck.filter(is).length;
  if (cb.where === "field") return field();
  if (cb.where === "grave") return grave();
  if (cb.where === "hand") return hand();
  if (cb.where === "deck") return deck();
  if (cb.where === "all") return field() + grave() + hand() + deck();
  return field() + grave();
}
// run a card's main effect and (if its condition holds) its extra effect, in order
function runCard(st, s, c, trig, ctx = {}, then){
  ctx = { ...ctx, hit: {} };
  const bs = blocksOf(c).filter(b => b.trig === trig || ((trig === "summon" || trig === "ssummon") && b.trig === "enter" && cardType(c) === "monster"));
  const step = (st2, k) => { if (k >= bs.length){ then && then(st2); return; } runBlock(st2, s, c, bs[k], ctx, st3 => step(st3, k + 1)); };
  step(st, 0);
}
// one block: check もし (a 質問 is asked last, only when it can still change the result), then なにを or ちがったら
// サイコロ／コイン: 結果は ctx.roll に入り、その効果ブロックの条件・「出た目1につき」・「出た目の回数」で使える
function doRoll(st, s, c, b){
  const die = b.roll === "die", faces = Math.max(2, Math.min(20, Math.round(+b.faces || 6))), v = die ? 1 + Math.floor(Math.random() * faces) : (Math.random() < .5 ? 1 : 0);
  log(st, s, `「${c ? c.name : "？"}」：${die ? `サイコロを振った → ${v}` : `コインを投げた → ${v ? "表" : "裏"}`}`);
  ev(st, { type: "roll", s, kind: die ? "die" : "coin", v, faces });
  return { kind: die ? "die" : "coin", v };
}
function runBlock(st, s, c, b, ctx, then){
  if (b.delay > 0 && !ctx.delayed){
    st.un = (st.un || 0) + 1; const p = P(st, s);
    (p.timers = p.timers || []).push({ u: st.un, c: c && c.id || null, name: c && c.name || "？", b: { trig: b.trig, join: b.join, conds: b.conds, then: b.then, else: b.else }, left: b.delay, ctx: { zone: ctx.zone ?? null, mon: ctx.mon || null } });
    log(st, s, `「${c ? c.name : "？"}」：${b.delay === 1 ? "次の自分のターンのはじめ" : b.delay + "ターン後の自分のターンのはじめ"}に効果が出る（時計 ${b.delay}）`);
    then && then(st); return;
  }
  if (b.roll === "die" || b.roll === "coin") ctx = { ...ctx, roll: doRoll(st, s, c, b) };
  const plain = b.conds.filter(x => x.k !== "ask"), ask = b.conds.find(x => x.k === "ask"), or = b.join === "or";
  const base = plain.length ? (or ? plain.some(x => condMet(st, s, c, x, ctx)) : plain.every(x => condMet(st, s, c, x, ctx))) : !or;
  const go = (st2, ok) => {
    if (b.conds.length && !ok) log(st2, s, `「${c.name}」：条件に合わなかった${b.else.length ? "" : "（効果なし）"}`);
    runEffects(st2, s, c, ok ? b.then : b.else, ctx, then);
  };
  if (!ask || (!or && !base) || (or && base)) return go(st, b.conds.length ? base : true);
  const fin = yes => or ? (base || yes) : (base && yes);
  // 「相手に聞く」: the opponent answers (online: through st.askQ, the effect waits on the asker's device)
  const who = ask.who === "op" ? O(s) : s, toOp = who !== s;
  if (isHumanHere(who)){ G.chooseQ.push({ ask: true, s, to: toOp ? who : null, c, fx: { kind: "__block", ask: ask.text }, ctx, then, block: { b, fin, go } }); return; }
  if (toOp && G && G.mode === "online" && !G.spectate){
    st.un = (st.un || 0) + 1; st.askQ = { n: st.un, by: s, to: who, text: ask.text, name: c.name, ans: null };
    G.askWait = { n: st.un, s, name: c.name, text: ask.text, resume: (st2, y) => go(st2, fin(y)) };
    log(st, s, `「${c.name}」：相手に質問「${ask.text}」`); return;
  }
  const yes = Math.random() < .5;
  log(st, s, `「${c.name}」：${toOp ? "相手に" : ""}「${ask.text}」→ ${yes ? "はい" : "いいえ"}`);
  go(st, fin(yes));
}
function runEffects(st, s, c, effs, ctx, then){
  const list = [];
  (effs || []).forEach(e => {
    const one = [];
    if (KINDS[e.kind] && KINDS[e.kind].each && e.n > 1){ for (let r = 0; r < e.n; r++) one.push({ kind: e.kind, n: 1, ...(e.into ? { into: e.into } : {}) }); }
    else one.push(...expandFx({ kind: e.kind, n: e.n, to: e.to, ...(e.into ? { into: e.into } : {}), ...(e.intoId ? { intoId: e.intoId } : {}), ...(e.per ? { per: e.per, pm: e.pm, hits: e.hits } : {}), ...(KINDS[e.kind] && KINDS[e.kind].mod ? { mt: e.mt, ms: e.ms, mpl: e.mpl, mc: e.mc, mn: e.mn, gk: e.gk, gn: e.gn, nm: e.nm, ge: e.ge } : {}), ...(e.side ? { side: e.side } : {}), ...(e.tn ? { tn: e.tn } : {}) }));
    // 「×○回」: the same effect again and again
    const reps = e.timesDie ? (ctx && ctx.roll && ctx.roll.kind === "die" ? ctx.roll.v : 0) : Math.max(1, Math.min(20, e.times || 1));
    for (let r = 0; r < reps; r++) list.push(...one);
  });
  if (c && c.costX && ctx.x != null && list.length){ const one = list.splice(0); for (let r = 0; r < ctx.x; r++) list.push(...one); if (!ctx.x) log(st, s, `「${c.name}」：X が0なので効果なし`); }
  const step = (st2, k) => { if (k >= list.length){ then && then(st2); return; } runEffect(st2, s, c, ctx, st3 => step(st3, k + 1), list[k]); };
  step(st, 0);
}
function trigger(st, s, c, trig, ctx){ if (cardType(c) === "monster") runCard(st, s, c, trig, ctx); }

// mana: can player s pay for card c right now? (players without a cost deck always can)
// what card c costs player s right now: コストX costs nothing up front (it takes all mana when paid); a スパイア card may be free after 「次に使う○○のコストを0」
function freeKey(st, s, c){ const f = P(st, s).free, k = c && c.frame === "spire" ? spireKind(c) : null; return k && f && f[k] > 0 ? k : null; }
const freeId = (st, s, c) => !!(c && (P(st, s).freeIds || []).includes(c.id));
const corrupted = (st, s, c) => !!(c && P(st, s).corrupt && c.frame === "spire" && spireKind(c) === "skill");
function effCost(st, s, c){ return c && c.costX ? 0 : freeKey(st, s, c) || freeId(st, s, c) || corrupted(st, s, c) ? 0 : costOf(c); }
// 追加コスト「LPを○払う」: LPがそれより多くないと使えない（払ってLP0にはならない）
function canPay(st, s, c){ const p = P(st, s), m = p.mana; return (!m || m.cur >= effCost(st, s, c)) && costWhy(st, s, c) === ""; }
// why the 追加コスト can't be paid right now ("" = it can)
function costWhy(st, s, c){
  const p = P(st, s), m = p.mana;
  if (payLpOf(c) && p.lp <= payLpOf(c)) return `LPが${payLpOf(c)}より多くないと使えない`;
  if (payDiscOf(c)){ const pool = c.payDiscTag ? p.hand.filter(id => hasTag(id, c.payDiscTag)).length - (p.hand.includes(c.id) && hasTag(c.id, c.payDiscTag) ? 1 : 0) : p.hand.length - (c && p.hand.includes(c.id) ? 1 : 0); if (pool < payDiscOf(c)) return c.payDiscTag ? `捨てるタグ「${c.payDiscTag}」の手札が${payDiscOf(c)}枚いる` : `捨てる手札が${payDiscOf(c)}枚いる`; }
  if (payMaxOf(c) && !(m && m.max >= payMaxOf(c))) return m ? `最大マナが${payMaxOf(c)}いる` : "マナを使うデッキ専用";
  return "";
}
// 追加コスト「手札を捨てる」: picks = indices in the hand (after the used card has left it); missing / wrong picks → random
function discardCost(st, s, c, picks){
  if (payDiscAll(c)){ const p = P(st, s), gone = p.hand.splice(0); p.grave.push(...gone); log(st, s, gone.length ? `「${c.name}」のコストで手札をすべて（${gone.length}枚）捨てた` : `「${c.name}」のコスト：捨てる手札はなかった`); return; }
  const n = payDiscOf(c); if (!n) return;
  const p = P(st, s), okJ = j => p.hand[j] != null && (!c.payDiscTag || hasTag(p.hand[j], c.payDiscTag));
  let L = [...new Set((picks || []).map(Number))].filter(okJ);
  if (L.length !== n){ const all = shuffle(p.hand.map((_, j) => j).filter(okJ)); L = all.slice(0, n); }
  const gone = L.sort((a, b) => b - a).map(j => p.hand.splice(j, 1)[0]);
  p.grave.push(...gone); log(st, s, `「${c.name}」のコストで手札の${gone.map(id => `「${card(id).name}」`).join("")}を捨てた`);
}
const shiftPicks = (picks, hi) => (picks || []).map(Number).map(j => hi != null && hi >= 0 && j > hi ? j - 1 : j);
function pay(st, s, c){
  const p = P(st, s), m = p.mana, fk = freeKey(st, s, c);
  const k = !m ? 0 : c && c.costX ? (fk ? 0 : m.cur) : effCost(st, s, c);
  if (m && m.cur < k) return false;
  if (costWhy(st, s, c)) return false;
  const lpc = payLpOf(c), mx = payMaxOf(c);
  if (lpc){ p.lp -= lpc; log(st, s, `「${c.name}」のコストでLPを${lpc}払った`); lostLp(st, s); }
  if (mx && m){ m.max -= mx; if (p.spire) p.maxAdj = (p.maxAdj || 0) - mx; log(st, s, `「${c.name}」のコストで最大マナが${mx}減った（${m.cur}/${m.max}）`); }
  if (fk){ p.free[fk]--; log(st, s, `「${c.name}」はコスト0で使える！`); }
  else if (freeId(st, s, c) && !(c && c.costX)){ p.freeIds.splice(p.freeIds.indexOf(c.id), 1); }
  if (m) m.cur -= k; p.lastPaid = k; return true;
}
// a card with 「手札を捨てる」 cost: the human picks which ones first (hi = the used card's hand index, -1 if it isn't in the hand)
const st0 = () => G.st;
function withDiscard(c, hi, go){
  const n = payDiscOf(c);
  if (!n || !G || G.mode === "spectate"){ go([]); return; }
  G.costPick = { name: c.name, hi, need: n, picked: [], go, tag: c.payDiscTag || "" }; renderAll();
}
function canSummonNow(st, s){ return P(st, s).mana ? true : !st.summoned; }
function canAct(st, s){ return !(G && G.spectate) && st.turn === s && !st.pending && !st.askQ && !st.winner && !(G && G.chooseQ.length); }
function summon(st, s, hi, zi, disc, trib){
  const p = P(st, s), id = p.hand[hi], need = tribOf(card(id), st, s);
  let z = (zi != null && !p.mz[zi]) ? zi : freeZone(p.mz);
  if (need){ const tt = card(id).tribTag; trib = [...new Set((trib || []).map(Number))].filter(i => p.mz[i] && (!tt || hasTag(p.mz[i].c, tt))); if (trib.length !== need) return false; }
  if (!canSummonNow(st, s) || (z < 0 && !need) || cardType(card(id)) !== "monster" || !canPay(st, s, card(id)) || (ssOf(card(id)) || {}).only || isFusion(card(id))) return false;
  if (!pay(st, s, card(id))) return false;
  p.hand.splice(hi, 1); if (!p.mana) st.summoned = true;
  discardCost(st, s, card(id), shiftPicks(disc, hi));
  if (need){ log(st, s, `${trib.map(i => `「${card(p.mz[i].c).name}」`).join("")}を生贄にした`); trib.forEach(i => sendToGrave(st, s, i)); z = (zi != null && !p.mz[zi]) ? zi : trib.includes(z) || z < 0 ? trib[0] : z; }
  const label = `「${card(id).name}」（ATK ${fmtN(baseAtk(card(id)))}）を召喚${p.mana ? `（コスト${costOf(card(id))}）` : ""}`;
  // the opponent gets a window only if they hold something that can counter it
  if (responseOptions(st, O(s), "summon").length){
    st.chain = [{ s, c: id, summon: true, z, ctx: { zone: z } }];
    log(st, s, `${label}しようとしている…`);
    st.pending = { type: "chain", by: s, wait: true, resume: null };
    return true;
  }
  p.mz[z] = mkMon(st, id);
  log(st, s, label); ev(st, { type: "summon", s, z });
  trigger(st, s, card(id), "summon", { zone: z, mon: { s, i: z, u: p.mz[z].u } });
  persistFire(st, s, "mySummon", {});
  summonedWindow(st, s, z, false);
  return true;
}
// why special summon of hand[hi] isn't possible right now ("" = it is)
function ssBlock(st, s, hi){
  const p = P(st, s), op = P(st, O(s)), c = card(p.hand[hi]), ss = ssOf(c);
  if (isFusion(c)) return "融合召喚でしか出せないカード";
  if (!ss) return "特殊召喚できないカード";
  if (!canPay(st, s, c)) return "マナが足りない";
  const mine = p.mz.filter(Boolean).length;
  let ok = true;
  if (ss.cond === "oppHas") ok = op.mz.some(Boolean);
  if (ss.cond === "myEmpty") ok = !mine;
  if (ss.cond === "oppMore") ok = op.mz.filter(Boolean).length > mine;
  if (ss.cond === "lp") ok = p.lp <= ss.n;
  if (ss.cond === "grave") ok = p.grave.length >= ss.n;
  if (ss.cond === "name"){ const w = normQ(ss.name).trim(); ok = !!w && p.mz.some(m => m && normQ(card(m.c).name).includes(w)); }
  if (!ok) return "条件がそろっていない";
  if (ss.cost === "tribute" && mine < ss.cn) return "墓地へ送るモンスターが足りない";
  if (ss.cost === "discard" && p.hand.length - 1 < ss.cn) return "捨てる手札が足りない";
  if (ss.cost === "lp" && p.lp <= ss.cn) return "LPが足りない";
  if (ss.cost !== "tribute" && freeZone(p.mz) < 0) return "場がいっぱい";
  return "";
}
const canSpecial = (st, s, hi) => st.turn === s && !st.pending && !st.winner && !ssBlock(st, s, hi);
// a monster (and whatever is stuck on it) goes to the graveyard without being "destroyed"
function sendToGrave(st, s, i){
  const p = P(st, s), m = p.mz[i]; if (!m) return;
  eqsOf(m).forEach(e => P(st, e.o).grave.push(e.c));
  p.mz[i] = null; p.grave.push(m.c); ev(st, { type: "destroy", s, z: i });
}
// picks: my monster zones (tribute) or other hand indexes (discard)
function specialSummon(st, s, hi, picks = []){
  if (!canSpecial(st, s, hi)) return false;
  const p = P(st, s), id = p.hand[hi], c = card(id), ss = ssOf(c);
  const need = ss.cost === "tribute" || ss.cost === "discard" ? ss.cn : 0;
  picks = [...new Set(picks.map(Number))];
  if (picks.length !== need) return false;
  if (ss.cost === "tribute" && !picks.every(i => p.mz[i])) return false;
  if (ss.cost === "discard" && !picks.every(i => i !== hi && p.hand[i] != null)) return false;
  pay(st, s, c);
  let paid = "";
  if (ss.cost === "tribute"){ paid = picks.map(i => `「${card(p.mz[i].c).name}」`).join(""); picks.forEach(i => sendToGrave(st, s, i)); paid += "を墓地へ送って"; }
  if (ss.cost === "lp"){ p.lp -= ss.cn; paid = `LPを${ss.cn}払って`; }
  const gone = ss.cost === "discard" ? picks.map(i => p.hand[i]) : [];
  [hi, ...(ss.cost === "discard" ? picks : [])].sort((a, b) => b - a).forEach(i => p.hand.splice(i, 1));
  if (gone.length){ p.grave.push(...gone); paid = `手札を${gone.length}枚捨てて`; }
  const z = freeZone(p.mz);
  if (z < 0){ p.grave.push(id); log(st, s, `場がいっぱいで「${c.name}」は出られなかった`); return true; }
  // the opponent may answer with a cancel, just like a normal summon (the cost stays paid)
  if (responseOptions(st, O(s), "summon").length){
    st.chain = [{ s, c: id, summon: true, special: true, z, ctx: { zone: z } }];
    log(st, s, `${paid ? paid + "、" : ""}「${c.name}」（ATK ${fmtN(baseAtk(c))}）を特殊召喚しようとしている…`);
    st.pending = { type: "chain", by: s, wait: true, resume: null };
    return true;
  }
  p.mz[z] = mkMon(st, id);
  ev(st, { type: "summon", s, z });
  log(st, s, `${paid ? paid + "、" : ""}「${c.name}」（ATK ${fmtN(baseAtk(c))}）を特殊召喚！`);
  trigger(st, s, c, "ssummon", { zone: z, mon: { s, i: z, u: p.mz[z].u } });
  persistFire(st, s, "mySummon", {});
  summonedWindow(st, s, z, true);
  return true;
}
function setCard(st, s, hi, zi){
  const p = P(st, s), id = p.hand[hi], z = (zi != null && !p.sz[zi]) ? zi : freeZone(p.sz);
  // スパイア風 cards can't be set (no keeping cards past the end of the turn)
  if (z < 0 || cardType(card(id)) === "monster" || cardType(card(id)) === "equip" || card(id).frame === "spire") return false;
  p.hand.splice(hi, 1); p.sz[z] = { c: id, turn: st.turnNo };
  log(st, s, `魔法・罠ゾーンにカードをセット`);
  return true;
}
// activate magic/trap from hand (magic only) or from set zone
function activate(st, s, from, i, ctx = {}){
  const p = P(st, s);
  if (from === "eq"){
    const f = findEq(st, i); if (!f || f.e.o !== s || f.e.used || !absOf(card(f.e.c)).some(a => a.k === "negateOnce")) return false;
    f.e.used = true;
    ev(st, { type: "spell", s, c: f.e.c });
    pushChain(st, s, f.e.c, ctx, `装備「${card(f.e.c).name}」の打ち消し`, { cancel: true });
    return true;
  }
  const id = from === "hand" ? p.hand[i] : p.sz[i] && p.sz[i].c; if (!id) return false;
  const c = card(id), t = cardType(c);
  if (t === "monster" || t === "equip") return false;
  if (from === "hand" && t !== "magic") return false;
  if (useBlockedWhy(st, s, c)) return false;
  const keep = isPersist(c), pz = keep ? (from === "hand" ? freeZone(p.sz) : i) : -1;
  if (keep && pz < 0) return false;
  if (!pay(st, s, c)) return false;
  if (c.costX){ ctx = { ...ctx, x: p.lastPaid || 0 }; log(st, s, `「${c.name}」：X = ${p.lastPaid || 0}`); }
  if (from === "hand") p.hand.splice(i, 1);
  else p.sz[i] = null;
  countPlay(st, s, c);
  discardCost(st, s, c, shiftPicks(ctx.disc, from === "hand" ? i : null));
  // 永続: stays face-up in the magic/trap zone
  if (isField(c)) placeField(st, s, id);
  else if (keep){ st.un = (st.un || 0) + 1; p.sz[pz] = { c: id, turn: st.turnNo, face: true, u: st.un }; }
  else if (exhausts(c) || corrupted(st, s, c)) (p.exile = p.exile || []).push(id);
  else p.grave.push(id);
  ev(st, { type: "spell", s, c: id });
  // ワン・ツーパンチ: this attack is played twice
  if (isAttackCard(c) && cardType(c) === "magic" && p.dblAtk > 0){ p.dblAtk--; ctx = { ...ctx, dbl: true }; log(st, s, `「${c.name}」をもう1回プレイする！`); }
  pushChain(st, s, id, { ...ctx, fromHand: from === "hand" }, `${keep ? "永続" : ""}${t === "trap" ? "罠" : isQuick(c) ? "速攻魔法" : isField(c) ? "フィールド魔法" : "魔法"}「${c.name}」`, keep ? { pz, pu: p.sz[pz].u } : isField(c) && st.field ? { fu: st.field.u } : null);
  if (!keep && (exhausts(c) || corrupted(st, s, c))){ p.exhaustedNow = (p.exhaustedNow || 0) + 1; log(st, s, `「${c.name}」は廃棄された（このゲームではもう使えない）`); persistFire(st, s, "exhaust", {}); }
  return true;
}
/* ---- chain: activations stack up; the other side may respond; resolve newest first ---- */
function chainWindow(st){
  const pd = st.pending; if (!pd) return null;
  if (pd.type === "chain") return pd.resume && pd.resume.type === "attack" ? "chainAttack" : "chain";
  return pd.type;
}
function pushChain(st, s, id, ctx, label, extra){
  const resume = st.pending ? (st.pending.type === "chain" ? st.pending.resume : st.pending) : null;
  if (!st.chain) st.chain = [];
  const link = { s, c: id, ctx: ctx || {}, ...(extra || {}) };
  if (link.cancel || (normFx(card(id)) || {}).kind === "cancel") link.target = st.chain.length - 1;
  st.chain.push(link);
  log(st, s, st.chain.length > 1 ? `チェーン${st.chain.length}：${label}を発動！` : `${label}を発動！`);
  const other = O(s);
  const win = resume && resume.type === "attack" ? "chainAttack" : "chain";
  if (responseOptions(st, other, win).length) st.pending = { type: "chain", by: s, wait: true, resume: resume ? { ...resume, wait: false } : null };
  else resolveChain(st, resume);
}
// 魔法・罠が発動したとき: 両方の場のモンスター・表の永続カード・レリック、そして手札のモンスターが反応する（もし「発動したカードが…」で絞れる）
function placeField(st, s, id){
  const old = st.field;
  if (old){ P(st, old.o).grave.push(old.c); log(st, s, `フィールド「${card(old.c).name}」は墓地へ（新しいフィールドが出た）`); }
  st.un = (st.un || 0) + 1; st.field = { c: id, o: s, u: st.un };
  log(st, s, `フィールド「${card(id).name}」が出た`);
}
const fieldCard = st => st && st.field ? card(st.field.c) : null;
function onCardUsed(st, user, c, then){
  const t = cardType(c); if ((t !== "magic" && t !== "trap") || (st._usedDepth || 0) > 2 || st.winner){ then && then(st); return; }
  const used = { c: c.id, s: user }, L = [];
  for (const o of ["a", "b"]){
    const p = P(st, o);
    p.mz.forEach((m, i) => { if (m && hasTrig(card(m.c), "anyUse")) L.push({ s: o, c: card(m.c), trig: "anyUse", ctx: { used, zone: i, mon: { s: o, i, u: m.u } } }); });
    persistList(st, o, "anyUse", { used }).forEach(x => L.push(x));
    if (o === user && fieldCard(st) && hasTrig(fieldCard(st), "anyUse")) L.push({ s: user, c: fieldCard(st), trig: "anyUse", ctx: { used, field: true } });
    [...new Set(p.hand)].forEach(id => { const hc = card(id); if (cardType(hc) === "monster" && hasTrig(hc, "anyUse")) L.push({ s: o, c: hc, trig: "anyUse", ctx: { used, inHand: id } }); });
  }
  if (!L.length){ then && then(st); return; }
  st._usedDepth = (st._usedDepth || 0) + 1;
  runList(st, L, st2 => { st2._usedDepth = Math.max(0, (st2._usedDepth || 1) - 1); then && then(st2); });
}
function resolveChain(st, resume){
  st.pending = resume ? { ...resume, wait: false } : null;
  const step = st2 => {
    const chain = st2.chain || [];
    if (!chain.length){ st2.chain = null; afterChain(st2); return; }
    const link = chain.pop(), c = card(link.c);
    if (link.summon){
      const p = P(st2, link.s);
      if (link.negated){ p.grave.push(link.c); log(st2, link.s, `「${c.name}」の${link.special ? "特殊召喚" : "召喚"}は打ち消された！`); step(st2); return; }
      let z = p.mz[link.z] ? freeZone(p.mz) : link.z;
      if (z < 0){ p.grave.push(link.c); log(st2, link.s, `場がいっぱいで「${c.name}」は出られなかった`); step(st2); return; }
      p.mz[z] = mkMon(st2, link.c);
      log(st2, link.s, `「${c.name}」の${link.special ? "特殊召喚" : "召喚"}に成功！`); ev(st2, { type: "summon", s: link.s, z });
      runCard(st2, link.s, c, link.special ? "ssummon" : "summon", { zone: z, mon: { s: link.s, i: z, u: p.mz[z].u } }, st3 => persistFire(st3, link.s, "mySummon", {}, step));
      return;
    }
    if (link.negated){
      log(st2, link.s, `「${c.name}」の発動は無効になった`);
      if (link.pz != null){ const p = P(st2, link.s), z = p.sz[link.pz]; if (z && z.u === link.pu){ p.sz[link.pz] = null; p.grave.push(z.c); } }
      if (st2.field && st2.field.c === link.c && st2.field.o === link.s){ P(st2, link.s).grave.push(st2.field.c); st2.field = null; }
      step(st2); return;
    }
    if (link.cancel || (normFx(c) || {}).kind === "cancel"){
      const t = chain[link.target];
      if (t){ t.negated = true; ev(st2, { type: "counter", s: link.s }); log(st2, link.s, `「${c.name}」で「${card(t.c).name}」の${t.summon ? (t.special ? "特殊召喚" : "召喚") : "発動"}を打ち消す！`); }
      else log(st2, link.s, `「${c.name}」：無効にするカードがない`);
      step(st2); return;
    }
    const done = st3 => onCardUsed(st3, link.s, c, step);
    if (link.ctx && link.ctx.dbl){ runCard(st2, link.s, c, "use", link.ctx, st3 => runCard(st3, link.s, c, "use", link.ctx, done)); return; }
    runCard(st2, link.s, c, "use", link.ctx, done);
  };
  step(st);
}
function afterChain(st){
  checkEnd(st);
  const pd = st.pending; if (!pd || st.winner) return;
  if (pd.type === "attack") resolveAttack(st);
  else if (pd.type === "end") finishEndTurn(st);
  else if (pd.type === "summoned") st.pending = null;
}
// after a summon succeeds, the opponent may answer with cards whose timing is 「相手がモンスターを召喚・特殊召喚したとき」
function summonedWindow(st, s, z, special){
  if (st.pending || st.winner || !responseOptions(st, O(s), "summoned").length) return;
  st.pending = { type: "summoned", by: s, z, special: !!special, wait: true };
}
const isQuick = c => cardType(c) === "magic" && !!c.quick;
// can this card's effect do anything in this window? (attack-only traps can't be used at end of turn; targets must exist)
function usableIn(st, s, c, win){
  if (useBlockedWhy(st, s, c, win)) return false;
  const fx = normFx(c);
  if (win === "summoned" && whenOf(c) !== "oppSummon") return false;
  if (fx && (fx.kind === "negate" || fx.kind === "killAtk" || fx.kind === "atkDownAtk") && win !== "attack" && win !== "chainAttack") return false;
  if (fx && fx.kind === "cancel" && win !== "chain" && win !== "chainAttack" && win !== "summon") return false;
  if (win === "summon" && (!fx || fx.kind !== "cancel")) return false;
  const opts = fx ? targetOptions(st, s, fx.kind, { tagName: fx.into || "" }) : null;
  return !(opts && !opts.length);
}
// equips with the "cancel once" ability that player s owns
function eqCancelOptions(st, s, win){
  if (win !== "chain" && win !== "chainAttack" && win !== "summon") return [];
  const out = [];
  for (const o of ["a", "b"]) P(st, o).mz.forEach(m => eqsOf(m).forEach(e => { if (e.o === s && !e.used && absOf(card(e.c)).some(a => a.k === "negateOnce")) out.push({ from: "eq", i: e.u, c: card(e.c) }); }));
  return out;
}
// everything player s may activate in a response window: set traps, set quick spells, quick spells in hand
function responseOptions(st, s, win){
  const p = P(st, s), out = [];
  p.sz.forEach((z, i) => { if (!z || z.face) return; const c = card(z.c); if ((cardType(c) === "trap" || isQuick(c)) && z.turn < st.turnNo && canPay(st, s, c) && usableIn(st, s, c, win)) out.push({ from: "sz", i, c }); });
  p.hand.forEach((id, i) => { const c = card(id); if (isQuick(c) && canPay(st, s, c) && usableIn(st, s, c, win)) out.push({ from: "hand", i, c }); });
  return out.concat(eqCancelOptions(st, s, win));
}
function usableTraps(st, s){ return responseOptions(st, s, "attack").filter(o => o.from === "sz").map(o => o.i); }
// where monster `from` may attack: L = opponent zones, direct = may attack directly
const topOnlyMon = (st, s, i) => !!(P(st, s).mz[i] && (P(st, s).mz[i].topOnly || hasAb(st, s, i, "topOnly")));
function atkTargets(st, s, from){
  const op = P(st, O(s)), tt = tauntIdx(st, O(s)), all = op.mz.map((x, j) => x ? j : -1).filter(j => j >= 0), top = topOnlyMon(st, s, from);
  let L = tt.length ? tt : all;
  if (top && L.length){ const mx = Math.max(...L.map(j => atkOf(op.mz[j]))); L = L.filter(j => atkOf(op.mz[j]) === mx); }
  return { L, direct: !tt.length && (!all.length || (!top && hasAb(st, s, from, "direct"))), top, taunt: tt.length > 0 };
}
function declareAttack(st, s, from, to){
  const m = P(st, s).mz[from]; if (!m || !canAttack(st, s, from)) return false;
  const T = atkTargets(st, s, from);
  if (to === "direct" ? !T.direct : !T.L.includes(to)) return false;
  m.atkCount = (m.atkCount || 0) + 1;
  m.attacked = m.atkCount >= maxAttacks(st, s, from);
  ev(st, { type: "attack", s, from, to, c: m.c });
  const target = to === "direct" ? "直接攻撃" : `「${card(P(st, O(s)).mz[to].c).name}」に攻撃`;
  log(st, s, `「${card(m.c).name}」で${target}！`);
  // 「攻撃するとき」 effects (the monster and its equips) come first, then the defender may answer
  st.pending = { type: "attack", by: s, from, to, wait: false };
  const go = st2 => { const pd = st2.pending; if (!pd || pd.type !== "attack" || pd.by !== s || st2.winner) return; pd.wait = responseOptions(st2, O(s), "attack").length > 0; if (!pd.wait) resolveAttack(st2); };
  const L = monTrigList(st, s, from, "attack").filter(x => hasTrig(x.c, "attack"));
  if (L.length) runList(st, L, go); else go(st);
  return true;
}
// choice: null (pass) or { from: "sz"|"hand", i }
function respond(st, s, choice){
  const pend = st.pending; if (!pend) return;
  pend.wait = false;
  if (choice == null){
    if (pend.type === "chain"){ log(st, s, "チェーンしなかった"); resolveChain(st, pend.resume); }
    else { log(st, s, pend.type === "end" ? "なにも使わなかった" : "罠・速攻魔法は使わなかった"); afterChain(st); }
    return;
  }
  const atk = pend.type === "attack" ? pend : (pend.type === "chain" && pend.resume && pend.resume.type === "attack" ? pend.resume : null);
  const ok = activate(st, s, choice.from, choice.i, { ...(atk ? { attack: { by: atk.by, from: atk.from } } : {}), ...(choice.disc ? { disc: choice.disc } : {}) });
  if (!ok){ if (pend.type === "chain") resolveChain(st, pend.resume); else afterChain(st); }
}
function resolveAttack(st){
  const pd = st.pending; st.pending = null; if (!pd) return;
  const A = pd.by, D = O(A), am = P(st, A).mz[pd.from];
  if (pd.negated){ checkEnd(st); return; }
  if (!am){ log(st, A, "攻撃モンスターがいなくなった"); checkEnd(st); return; }
  if (P(st, D).thorns > 0){ monDmg(st, A, pd.from, P(st, D).thorns, "炎の障壁（反撃）"); if (!P(st, A).mz[pd.from]){ checkEnd(st); return; } }
  if (pd.to === "direct"){
    const a = battleHit(st, A, pd.from, atkOf(am)); dealDmg(st, D, a); log(st, A, `${nm(st, D)} に直接 ${fmtN(a)} ダメージ！`);
  } else {
    const dm = P(st, D).mz[pd.to];
    if (!dm){ log(st, A, "攻撃対象がいなくなった"); checkEnd(st); return; }
    const a = atkOf(am), d = atkOf(dm);
    // damage to a player is cut by the losing monster's 鉄壁-type ability
    const hurt = (s2, i2, x) => { const cut = abN(st, s2, i2, "dmgCut"), y = x === Infinity ? x : Math.max(0, x - cut); dealDmg(st, s2, y); return [y, cut]; };
    const losers = [];
    if (a > d){ const [y, cut] = hurt(D, pd.to, battleHit(st, A, pd.from, a - d)); log(st, A, `バトル ${fmtN(a)} vs ${fmtN(d)}：${nm(st, D)} に ${fmtN(y)} ダメージ${cut ? `（${cut}へった）` : ""}`); losers.push([D, pd.to, dm.u]); }
    else if (a < d){ const [y, cut] = hurt(A, pd.from, battleHit(st, D, pd.to, d - a)); log(st, A, `バトル ${fmtN(a)} vs ${fmtN(d)}：${nm(st, A)} に ${fmtN(y)} ダメージ${cut ? `（${cut}へった）` : ""}`); losers.push([A, pd.from, am.u]); }
    else { log(st, A, `バトル ${fmtN(a)} vs ${fmtN(d)}：相打ち！`); losers.push([A, pd.from, am.u], [D, pd.to, dm.u]); }
    const W = a > d ? [A, pd.from, am.u] : a < d ? [D, pd.to, dm.u] : null;
    // "when it loses a battle" effects first, then the losers are destroyed
    const L = [].concat(...losers.map(([s2, i2]) => monTrigList(st, s2, i2, "battleLose")));
    runList(st, L, st2 => {
      let killed = false;
      losers.forEach(([s2, i2, u]) => {
        const m2 = P(st2, s2).mz[i2]; if (!m2 || m2.u !== u) return;
        if (hasAb(st2, s2, i2, "guard")){ log(st2, s2, `「${card(m2.c).name}」は戦闘では破壊されない！`); return; }
        if (destroyMonster(st2, s2, i2, "戦闘", { battle: true })) killed = true;
      });
      if (W && killed){ const wm = P(st2, W[0]).mz[W[1]]; if (wm && wm.u === W[2]) runList(st2, monTrigList(st2, W[0], W[1], "kill"), null); }
      checkEnd(st2);
    });
    return;
  }
  checkEnd(st);
}
// ending the turn first gives the other player a chance to use quick spells / traps
function endTurn(st, s){
  exReturnP(st, s);
  if (responseOptions(st, O(s), "end").length){ st.pending = { type: "end", by: s, wait: true }; log(st, s, "ターン終了…"); return; }
  passTurn(st, s);
}
function finishEndTurn(st){ const pd = st.pending; st.pending = null; checkEnd(st); if (!st.winner && pd) passTurn(st, pd.by); }
function passTurn(st, s){
  fireTurn(st, s, "turnEnd", st => {
    checkEnd(st); if (st.winner) return;
    P(st, s).mz.forEach(m => { if (m){ m.attacked = false; m.atkCount = 0; } });
    { const ep = P(st, s); if (ep.strTemp){ ep.str = (ep.str || 0) - ep.strTemp; log(st, s, `一時的な筋力がもどった（筋力 ${ep.str}）`); ep.strTemp = 0; } ep.freeIds = []; ep.noDraw = false; ep.rage = 0; ep.dblAtk = 0;
      if (ep.plate > 0){ ep.block = (ep.block || 0) + ep.plate; log(st, s, `プレートでブロックを${ep.plate}得た（ブロック ${ep.block}）`); }
      for (const o of ["a", "b"]){ const q = P(st, o); q.lostNow = 0; q.exhaustedNow = 0; q.atkNow = 0; }
      // 脱力 wears off at the end of its owner's own turn (it weakens what they deal on that turn)
      if (ep.weak > 0){ ep.weak--; if (!ep.weak) log(st, s, `${ep.name}の脱力がとけた`); }
      ep.mz.forEach(m => { if (m && m.weak > 0){ m.weak--; if (!m.weak) log(st, s, `「${card(m.c).name}」の脱力がとけた`); } }); }
    for (const o of ["a", "b"]) P(st, o).mz.forEach(m => { if (m && m.tmpBy === s){ m.tmp = 0; m.tmpBy = null; } });
    st.turn = O(s); st.turnNo++; st.summoned = false;
    const np = P(st, st.turn);
    if (np.vuln > 0){ np.vuln--; if (!np.vuln) log(st, st.turn, `${np.name}の弱体がとけた`); }
    np.mz.forEach(m => { if (m && m.vuln > 0){ m.vuln--; if (!m.vuln) log(st, st.turn, `「${card(m.c).name}」の弱体がとけた`); } });
    if (np.block && !np.barricade){ log(st, st.turn, `ブロック${np.block}が消えた`); np.block = 0; }
    np.thorns = 0; np.blockedNow = false;
    if (np.mana){ np.mana.max = np.sz.some(z => z && z.face && z.c === "spire-altar") ? 3 : Math.min(MAX_MANA, np.mana.max + 1); np.mana.cur = np.mana.max; }
    log(st, st.turn, `ターン${st.turnNo}：${np.name} のターン${np.mana ? `（マナ ${np.mana.max}）` : ""}`);
    refill(st, st.turn);
    if (!np.deck.length && !np.spire){ st.winner = s; st.why = `${np.name} の山札がなくなった`; log(st, st.turn, "引くカードがない！"); return; }
    if (np.deck.length) np.hand.push(np.deck.shift());
    // online: the new player's own screen runs their turn-start effects (so they can choose targets)
    if (G && G.mode === "online" && st.turn !== G.slot) st.tsPending = st.turnNo;
    else fireTurn(st, st.turn, "turnStart", null);
  });
}
function maybeTurnStart(){
  const st = G && G.st;
  if (!st || G.mode !== "online" || G.spectate || !st.tsPending || st.tsPending !== st.turnNo || st.turn !== G.slot || st.winner) return false;
  act(st => { st.tsPending = 0; fireTurn(st, st.turn, "turnStart", null); });
  return true;
}

