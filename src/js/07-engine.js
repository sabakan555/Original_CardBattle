/* ================= game engine (pure-ish over st) ================= */
const O = s => s === "a" ? "b" : "a";
const P = (st, s) => st.players[s];
const card = id => S.cards.get(id) || modCardOf(id) || twCardOf(id) || { id, name: "？", type: "monster", atk: 0 };
// ツインパクト: モンスターの c.tw = { name, cost, blocks } が魔法側。魔法側は「id~tw」の魔法カードとして扱う
function twOf(c){ return c && c.tw && typeof c.tw === "object" && !c.twOf && cardType(c) === "monster" ? c.tw : null; }
function twBase(id){ return String(id || "").endsWith("~tw") ? String(id).slice(0, -3) : id; }
// 魔法側のカードを作る（作りかけのカードのプレビューでも使う）
function twBuild(b, k){ const t = twOf(b); if (!t) return null; return { ...b, id: k, type: "magic", name: t.name || (b.name ? `${b.name}（魔法）` : "？"), nameRuby: null, cost: t.cost != null && t.cost !== "" ? t.cost : b.cost, blocks: Array.isArray(t.blocks) ? t.blocks : [], fx: null, combo: null, abs: [], atk: 0, atkInf: false, effect: t.effect || "", tw: null, twOf: b.id, sx: null, fusion: null, fusFree: null, ex: null, mass: 0, trib: 0, lvTrib: false, ss: null, cascade: b.cascade || null }; }
function twCardOf(id){
  const TW_CACHE = twCardOf.cache || (twCardOf.cache = new Map());
  const k = String(id || ""); if (!k.endsWith("~tw")) return null;
  const b = S.cards.get(k.slice(0, -3)), t = b && twOf(b); if (!t) return null;
  const hit = TW_CACHE.get(k); if (hit && hit.b === b) return hit.v;
  const v = twBuild(b, k);
  TW_CACHE.set(k, { b, v }); return v;
}
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
  const c = { ...base, id, name: m.name || base.name, nameRuby: m.name ? null : base.nameRuby, fx: null, combo: null, blocks: bs, effect: m.clear || m.rep || (m.add && m.add.length) ? "" : base.effect, modded: !!(m.clear || m.rep || (m.add && m.add.length) || m.name), modOf: base.id };
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
// 「直前に発動したカード」: チェーン中なら、このカードがチェーンした1つ前のカード（まだ処理されていないので、書きかえた効果で処理される）。
// チェーンがなければ、最後に使われたカード（場・墓地にあるそのカード）を書きかえる
function modChange(fx){
  const gk = fx.gk && KINDS[fx.gk] && !KINDS[fx.gk].mod ? fx.gk : "draw", g = [fx.ge && KINDS[fx.ge.kind] && !KINDS[fx.ge.kind].mod ? cleanEff(fx.ge) : cleanEff({ kind: gk, n: fx.gn || (smallN(gk) ? 1 : 100) })].filter(Boolean);
  return fx.kind === "modAdd" ? { add: g } : fx.kind === "modRep" ? { rep: g } : fx.kind === "modClear" ? { clear: true } : { name: String(fx.nm || "").slice(0, 20) || null };
}
function modLast(st, s, c, fx, src){
  const ch = modChange(fx); if (fx.kind === "modName" && !ch.name){ log(st, s, `${src}：新しい名前がない`); return; }
  const what = fx.kind === "modClear" ? "の効果をなくした" : fx.kind === "modRep" ? "の効果を上書きした" : fx.kind === "modAdd" ? "に効果を追加した" : "の名前を変えた";
  const link = st.chain && st.chain.length ? st.chain[st.chain.length - 1] : null;
  if (link && !link.negated){
    const old = link.c; link.c = modId(st, old, ch);
    if (link.pz != null){ const z = P(st, link.s).sz[link.pz]; if (z && z.u === link.pu) z.c = link.c; }
    if (st.field && st.field.c === old && link.fu && st.field.u === link.fu) st.field.c = link.c;
    log(st, s, `${src}で、チェーン中の「${card(old).name}」${what}`); return;
  }
  const r = [...(st.recent || [])].reverse().find(x => x.c !== (c && c.id));
  if (!r){ log(st, s, `${src}：直前に発動したカードがない`); return; }
  const owner = P(st, r.s), swap = arr => { const i = arr.lastIndexOf(r.c); if (i < 0) return false; arr[i] = modId(st, r.c, ch); return true; };
  let done = false;
  const zi = owner.sz.findIndex(z => z && z.c === r.c); if (zi >= 0){ owner.sz[zi].c = modId(st, r.c, ch); done = true; }
  else if (st.field && st.field.c === r.c){ st.field.c = modId(st, r.c, ch); done = true; }
  else { const mi = owner.mz.findIndex(m => m && m.c === r.c); if (mi >= 0){ owner.mz[mi].c = modId(st, r.c, ch); done = true; } else done = swap(owner.grave) || swap(owner.exile || []); }
  log(st, s, done ? `${src}で「${card(r.c).name}」${what}` : `${src}：直前に発動したカードが見つからない`);
}
function modApply(st, s, c, fx, target, src){
  const T = modT(fx), pl = P(st, T.side === "op" ? O(s) : s), k = Math.max(1, fx.mn || 1), out = [];
  if (T.scope === "last") return modLast(st, s, c, fx, src);
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
// 「場にいる間」の「属性を付与する」: 出しているカードが場にいる間だけ、モンスターの属性が変わる
function staticAttrs(m){
  if (typeof G === "undefined" || !G || !G.st || !G.st.players || staticAttrs.busy) return null;
  const st = G.st; let ms = null; for (const o of ["a", "b"]) if (P(st, o).mz.indexOf(m) >= 0) ms = o; if (!ms) return null;
  staticAttrs.busy = true; const out = { add: [], set: null };
  try{
    const srcs = [];
    for (const o of ["a", "b"]){ const p = P(st, o); p.mz.forEach((x, i) => { if (x) srcs.push({ o, c: monCard(x), mon: x, ctx: { zone: i, mon: { s: o, i, u: x.u } } }); }); p.sz.forEach((z, i) => { if (z && z.face && (isPersist(card(z.c)) || z.fcp)) srcs.push({ o, c: card(z.c), mon: null, ctx: { pz: i } }); }); }
    if (st.field) srcs.push({ o: st.field.o, c: card(st.field.c), mon: null, ctx: { field: true } });
    srcs.forEach(src => blocksOf(src.c).forEach(b => {
      if (b.trig !== "while") return;
      const plain = (b.conds || []).filter(x => x.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(x => condMet(st, src.o, src.c, x, src.ctx)) : plain.every(x => condMet(st, src.o, src.c, x, src.ctx)));
      ((ok ? b.then : b.else) || []).forEach(e => {
        if (!e || e.kind !== "giveAttr") return;
        const w = e.aw || "opp1", a = String(e.ga || "火"), mine = ms === src.o, self = src.mon === m;
        const hit = w === "self" ? self : w === "oppAll" || w === "opp1" ? !mine : w === "mineAll" || w === "mine1" ? mine : false;
        if (!hit || (w !== "self" && !mfOk(st, src.o, e, m))) return;
        if (e.gm === "set") out.set = [a]; else out.add.push(a);
      });
    }));
  } finally { staticAttrs.busy = false; }
  return out.add.length || out.set ? out : null;
}
// サイコロの当たりの目を増やす（自分の場のカードの「場にいる間」）: 当たりになったら、その効果を出したカードの名前
function dieWinBy(st, s, c, v){
  const p = P(st, s), srcs = [];
  p.mz.forEach((x, i) => { if (x) srcs.push({ c: monCard(x), ctx: { zone: i, mon: { s, i, u: x.u } } }); });
  p.sz.forEach((z, i) => { if (z && z.face && (isPersist(card(z.c)) || z.fcp)) srcs.push({ c: card(z.c), ctx: { pz: i } }); });
  if (st.field && (st.field.o === s || !card(st.field.c).fieldMine)) srcs.push({ c: card(st.field.c), ctx: { field: true } });
  const nm = normQ(c && c.name || "").trim();
  for (const x of srcs) for (const b of blocksOf(x.c)){
    if (b.trig !== "while") continue;
    const plain = (b.conds || []).filter(y => y.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(y => condMet(st, s, x.c, y, x.ctx)) : plain.every(y => condMet(st, s, x.c, y, x.ctx)));
    for (const e of (ok ? b.then : b.else) || []){
      if (!e || e.kind !== "dieWin") continue; const w = normQ(e.into || "").trim();
      if (w && !(nm === w || nm.includes(w))) continue;
      if (v >= (e.wl || 1) && v <= (e.wh || e.wl || 1)) return x.c.name;
    }
  }
  return "";
}
const STATIC_KINDS = [...Object.keys(FX_FORMS).filter(k => FX_FORMS[k].staticOk), "dieWin", "giveAttr", "selfAtkDown", "myAtkDownAll", "selfAtk", "atkUp", "atkAll", "atkDown", "atkDownAll", "atkMul", "giveAb", "ctrAdd"];
/* 「場にいる間、カウンターを乗せる」: 出ている間は乗せておいて、いなくなったり条件に合わなくなったら、その分を取り除く。
   乗せた数は乗っている側に m.ctrA / p.ctrA = { "出し手のu|カウンターid": 個数 } で覚えておく（ほかの効果で取り除かれた分は、もう一度は乗せない） */
function ctrAuraSync(st){
  if (!st || !st.players || st.winner || ctrAuraSync.busy) return;
  ctrAuraSync.busy = true;
  try{
    const want = new Map(), add = (tk, sk, id, n, nm) => { const k = tk + "#" + sk + "|" + id, v = want.get(k); want.set(k, { n: (v ? v.n : 0) + n, nm }); };
    for (const o of ["a", "b"]){
      const p = P(st, o), srcs = [];
      p.mz.forEach((x, i) => { if (x) srcs.push({ c: monCard(x), u: x.u, mon: x, ctx: { zone: i, mon: { s: o, i, u: x.u } } }); });
      p.sz.forEach((z, i) => { if (z && z.face && (isPersist(card(z.c)) || z.fcp)) srcs.push({ c: card(z.c), u: z.u, mon: null, ctx: { pz: i } }); });
      if (st.field && st.field.o === o) srcs.push({ c: card(st.field.c), u: "f" + st.field.u, mon: null, ctx: { field: true } });
      srcs.forEach(src => { if (src.mon && sealedM(src.mon)) return; blocksOf(src.c).forEach((b, bi) => {
        if (b.trig !== "while") return;
        const plain = b.conds.filter(x => x.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(x => condMet(st, o, src.c, x, src.ctx)) : plain.every(x => condMet(st, o, src.c, x, src.ctx)));
        (ok ? b.then : b.else).forEach((e, ei) => {
          if (e.kind !== "ctrAdd" || !e.ctr) return;
          const n = Math.max(0, Math.round(+e.n || 0)); if (!n) return;
          const cw = CTR_CW[e.cw] ? e.cw : "all", side = e.side === "me" ? o : O(o), sk = src.u + ":" + bi + ":" + ei, nm = `「${src.c.name}」`;
          if (cw === "self"){ if (src.mon) add("m" + src.mon.u, sk, e.ctr, n, nm); }
          else if (cw === "player") add("p" + side, sk, e.ctr, n, nm);
          else P(st, side).mz.forEach(m => { if (m) add("m" + m.u, sk, e.ctr, n, nm); });
        });
      }); });
    }
    const fix = (tk, rec, apply) => {
      const cur = rec() || {}, keys = new Set([...Object.keys(cur), ...[...want.keys()].filter(k => k.startsWith(tk + "#")).map(k => k.slice(tk.length + 1))]);
      keys.forEach(k => { const w = want.get(tk + "#" + k), have = cur[k] || 0, n = w ? w.n : 0; if (n === have) return; const id = k.slice(k.lastIndexOf("|") + 1);
        const r = rec(true); if (n) r[k] = n; else delete r[k]; apply(id, n - have, w ? w.nm : "場にいる間の効果が切れたこと"); });
    };
    for (const o of ["a", "b"]){
      const p = P(st, o);
      fix("p" + o, mk => mk ? (p.ctrA = p.ctrA || {}) : p.ctrA, (id, d, nm) => { if (d < 0 && !ctrOfP(p, id)) return; ctrPl(st, o, id, d, nm, o); });
      p.mz.forEach(m => { if (!m) return; fix("m" + m.u, mk => mk ? (m.ctrA = m.ctrA || {}) : m.ctrA, (id, d, nm) => { const i = p.mz.indexOf(m); if (i >= 0 && !(d < 0 && !ctrOfM(m, id))) ctrMon(st, o, i, id, d, nm, o); }); });
    }
  } finally { ctrAuraSync.busy = false; }
}
// 場にいる間の「能力を付与する」: 出しているカードがある間だけ、モンスター m（s 側）がその能力を持つ
function staticAbs(st, s, m){
  const out = []; if (!st || !st.players || staticAbs.busy) return out;
  staticAbs.busy = true;
  try{
    const srcs = [];
    for (const o of ["a", "b"]){ const p = P(st, o); p.mz.forEach((x, i) => { if (x && !sealedM(x)) srcs.push({ o, c: monCard(x), mon: x, ctx: { zone: i, mon: { s: o, i, u: x.u } } }); }); p.sz.forEach((z, i) => { if (z && z.face && (isPersist(card(z.c)) || z.fcp)) srcs.push({ o, c: card(z.c), mon: null, ctx: { pz: i } }); }); if (st.field && (!card(st.field.c).fieldMine || st.field.o === o)) srcs.push({ o, c: card(st.field.c), mon: null, ctx: { field: true } }); }
    srcs.forEach(src => blocksOf(src.c).forEach(b => {
      if (b.trig !== "while") return;
      const plain = b.conds.filter(x => x.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(x => condMet(st, src.o, src.c, x, src.ctx)) : plain.every(x => condMet(st, src.o, src.c, x, src.ctx)));
      (ok ? b.then : b.else).forEach(e => {
        if (e.kind !== "giveAb") return;
        const w = e.gw || "self"; if (!GAB_STATIC_W.includes(w)) return;
        if (w === "self" ? src.mon !== m : (w === "mineAll") !== (s === src.o)) return;
        const a = gabAbility(e); if (gabStaticList().includes(a.k)) out.push({ ...a, mult: 1, gab: true, stat: true, from: src.c.name });
      });
    }));
  } finally { staticAbs.busy = false; }
  return out;
}
function staticAtk(m){
  const out = { add: 0, mul: 1 }; if (typeof G === "undefined" || !G || !G.st || !G.st.players || staticAtk.busy) return out;
  const st = G.st; let ms = null;
  for (const o of ["a", "b"]){ const i = P(st, o).mz.indexOf(m); if (i >= 0) ms = o; }
  if (!ms) return out;
  staticAtk.busy = true;
  try{
    const srcs = [];
    for (const o of ["a", "b"]){ const p = P(st, o); p.mz.forEach((x, i) => { if (x) srcs.push({ o, c: monCard(x), mon: x, ctx: { zone: i, mon: { s: o, i, u: x.u } } }); }); p.sz.forEach((z, i) => { if (z && z.face && (isPersist(card(z.c)) || z.fcp)) srcs.push({ o, c: card(z.c), mon: null, ctx: { pz: i } }); }); if (st.field && (!card(st.field.c).fieldMine || st.field.o === o)) srcs.push({ o, c: card(st.field.c), mon: null, ctx: { field: true } }); }
    srcs.forEach(src => blocksOf(src.c).forEach(b => {
      if (b.trig !== "while") return;
      const plain = b.conds.filter(x => x.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(x => condMet(st, src.o, src.c, x, src.ctx)) : plain.every(x => condMet(st, src.o, src.c, x, src.ctx)));
      (ok ? b.then : b.else).forEach(e => {
        const n = +e.n || 0, mine = ms === src.o, self = src.mon === m, all = e.to === "all";
        const pn = e.per && PER_DEFS[e.per] ? (e.pm ?? 1) * PER_DEFS[e.per].val(st, src.o, src.c, null, src.ctx, e) : 0;
        if (!STATIC_KINDS.includes(e.kind) && e.kind !== "atk") return;
        // 場にいる間の「自分のモンスター1体のATKアップ」は、前からこのモンスター自身に効く
        const a = fxNorm(e.kind === "atkUp" && e.to !== "all" ? { ...e, kind: "selfAtk" } : e);
        if (!a || a.kind !== "atk" || a.dur || !["add", "sub", "mul"].includes(a.op)) return;
        const hit = a.to === "this" ? self : a.to === "all" ? (a.side === "me") === mine : false;
        if (!hit) return;
        if (a.op === "mul") out.mul *= Math.max(0, n || 1);
        else out.add += (a.op === "sub" ? -1 : 1) * (n + pn);
      });
    }));
  } finally { staticAtk.busy = false; }
  return out;
}
// ATKを○にする: いまのATKがちょうど○になるように効果のアップ・ダウン（mod）を合わせる（あとから来たアップ・ダウンはその上に足される）
function setAtk(m, n){
  m.zero = false; m.fix = null;
  for (let i = 0; i < 6; i++){ const a = atkOf(m); if (a === n) return; if (!isFinite(a)) break; m.mod = (m.mod || 0) + (n - a); }
  if (atkOf(m) !== n) m.fix = n; // ∞のモンスターなど、足し引きで合わせられないときは数字を固定
}
function atkOf(m){
  if (!m) return 0;
  if (!atkOf.gl && typeof G !== "undefined" && G && G.st && G.st.players) for (const o of ["a", "b"]){ const i = P(G.st, o).mz.indexOf(m); if (i < 0) continue; const L = glGroup(G.st, o, i); if (L.length > 1){ atkOf.gl = true; try{ return L.reduce((t, j) => t + atkOf(P(G.st, o).mz[j]), 0); } finally{ atkOf.gl = false; } } break; }
  if (m.zero) return 0;
  if (m.fix != null) return m.fix;
  const c = card(m.c), es = eqsOf(m), sa = staticAtk(m); let v = baseAtk(c) + (m.mod || 0) + (m.tmp || 0) + (m.str || 0) + (m.strT || 0) + sa.add;
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
  (p.usedNowIds = p.usedNowIds || []).push(c.id);
  if (cardType(c) !== "monster" && aceOn(c, "use")) ev(st, { type: "ace", s, c: c.id });
  if (cardType(c) === "magic"){ const ids = [...new Set(p.hand)].filter(id => { const x = card(id); return x && (+x.sbCost > 0 || absOf(x).some(a => a.k === "sbAtk")); }); if (ids.length){ p.sb = { ...(p.sb || {}) }; ids.forEach(id => { p.sb[id] = (p.sb[id] || 0) + 1; }); log(st, s, `スペルブースト！ 手札の${ids.map(id => `「${card(id).name}」（${p.sb[id]}）`).join("")}`); } }
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
    const z = freeZone(p.mz, p);
    if (z < 0){ p.grave.push(id); log(st, s, `${src}で山札の一番上の「${c.name}」をめくった（場がいっぱいなので墓地へ）`); then && then(st); return; }
    p.mz[z] = mkMon(st, id); ev(st, { type: "summon", s, z }); log(st, s, `${src}で山札の一番上の「${c.name}」をプレイ！（召喚扱いで場に出た）`);
    runCard(st, s, c, "summon", { zone: z, mon: { s, i: z, u: p.mz[z].u } }, st2 => enterFire(st2, s, "summon", st3 => onCardUsed(st3, s, c, then, (P(st3, s).mz[z] || {}).u)));
    return;
  }
  if (t !== "magic" && t !== "trap"){ p.grave.push(id); log(st, s, `${src}で山札の一番上の「${c.name}」をめくった（プレイできないので墓地へ）`); then && then(st); return; }
  log(st, s, `${src}で山札の一番上の「${c.name}」をプレイ！`); ev(st, { type: "spell", s, c: id }); countPlay(st, s, c);
  const pz = isPersist(c) && !ex ? freeZone(p.sz, p) : -1;
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
const PICK_OK = { oppSummon: c => cardType(c) === "monster", summonNamed: c => cardType(c) === "monster", oppSetNamed: c => cardType(c) === "magic" || cardType(c) === "trap" };
function pickCardKind(k){ return !!(KINDS[k] && KINDS[k].name && !KINDS[k].tag && k !== "autoPlay"); }
function nameCands(name, kind){ const ok = PICK_OK[kind]; return name ? [...S.cards.values()].filter(c => c && !c.skinOf && (c.name === name || plainRuby(c.nameRuby || "") === name) && (!ok || ok(c))) : []; }
function fxCardId(fx, srcCard){ const ok = PICK_OK[fx.kind]; if (fx.intoId && S.cards.has(fx.intoId) && (!ok || ok(card(fx.intoId)))) return fx.intoId; return intoId(fx.into, srcCard, ok); }
function intoId(into, srcCard, okFn){
  if (!into) return null;
  const L = [...S.cards.values()].filter(c => c && !c.skinOf && (c.name === into || plainRuby(c.nameRuby || "") === into) && (!okFn || okFn(c)));
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
    : (() => { const f = x => x && x.id !== c.id && !x.token && (!ok || ok(x)); let L = draftPool().filter(f); if (!L.length) L = [...S.cards.values()].filter(x => f(x) && !x.skinOf); return L.length ? L[Math.floor(Math.random() * L.length)].id : null; })();
  if (!id){ log(st, s, `${src}：${fx.into ? `「${fx.into}」という${m ? "モンスター" : "カード"}が見つからない` : "変化先のカードがない"}`); return; }
  const done = (old, where) => log(st, s, `${src}で${where}の「${card(old).name}」が「${card(id).name}」に変化した`);
  if (m){ const old = m.c; m.c = id; m.mod = 0; delete m.mul; ev(st, { type: "summon", s: ctx.mon.s, z: ctx.mon.i }); done(old, "場"); return; }
  if (eq){ const old = eq.c; eq.c = id; done(old, "装備"); return; }
  const p = P(st, s);
  if (ctx.pz != null && p.sz[ctx.pz] && p.sz[ctx.pz].c === c.id){ p.sz[ctx.pz].c = id; done(c.id, "場"); return; }
  if (ctx.field && st.field && st.field.c === c.id){ st.field.c = id; done(c.id, "フィールド"); return; }
  if (ctx.inHand){ const k = p.hand.indexOf(ctx.inHand); if (k >= 0){ p.hand[k] = id; hfMove(p, ctx.inHand, id, st); done(ctx.inHand, "手札"); return; } }
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
  const p = P(st, s), pool = [...p.hand.map((id, i) => ({ from: "hand", i, id })), ...p.mz.map((m, i) => m && !monCannotLeave(m) ? { from: "mz", i, id: m.c, a: atkOf(m) } : null).filter(Boolean).sort((x, y) => x.a - y.a)];
  const rank = { name: 0, tag: 1, any: 2 }, mats = [...fc.fusion].sort((a, b) => (rank[a.m] ?? 0) - (rank[b.m] ?? 0)), used = new Set(), out = [];
  const rec = k => { if (k >= mats.length) return true; for (let j = 0; j < pool.length; j++){ if (used.has(j) || !fusionMatOk(pool[j].id, mats[k])) continue; used.add(j); out.push(pool[j]); if (rec(k + 1)) return true; used.delete(j); out.pop(); } return false; };
  if (!rec(0)) return null;
  if (freeZone(p.mz, p) < 0 && !out.some(x => x.from === "mz")) return null;
  return out;
}
// シンクロ・エクシーズ: 自分の場のモンスターを素材にして、EXデッキから出す
function sxHit(id, y, t){
  if (!y) return false; if (y.m === "nott") return !sxHit(id, t); if (y.m === "any") return true;
  const c = card(id), w = String(y.v || "").trim(); if (!w) return false; if (y.m === "tag") return hasTag(id, w);
  return normQ(c.name).trim() === normQ(w).trim() || plainRuby(c.nameRuby || "") === w;
}
function ovOk(st, s, c, x, i){
  const p = P(st, s), m = p.mz[i], o = x && x.ov; if (!m || !o || m.c === c.id || (p.ovT || {})[c.id] === st.turnNo) return false;
  const mc = card(m.c); if (o.m === "xyz"){ const r = isXyz(mc) ? lvOf(mc) : 0; return !!r && r >= o.lo && r <= o.hi; }
  return o.m === "any" || sxHit(m.c, o);
}
function sxPicksOk(st, s, c, picks){
  const x = sxK(c), p = P(st, s), lv = lvOf(c); if (!x || (!lv && x.k !== "cf")) return false;
  const L = [...new Set((picks || []).map(Number))]; if (L.length !== (picks || []).length || !L.every(i => p.mz[i] && !monCannotLeave(p.mz[i]))) return false;
  if (x.k === "cf") return !!fusionPlanFrom(st, s, c, L.map(i => ({ from: "mz", i })));
  const ids = L.map(i => p.mz[i].c), lvs = ids.map(id => matLv(card(id)));
  if (x.k === "xyz") return L.length === 1 && x.ov ? ovOk(st, s, c, x, L[0]) : L.length === x.n && ids.every((id, j) => lvs[j] === lv && sxHit(id, x));
  if (L.length < 2 || lvs.some(v => !v) || lvs.reduce((a, b) => a + b, 0) !== lv) return false;
  return ids.some((id, j) => sxHit(id, x.t) && ids.every((id2, j2) => j2 === j || sxHit(id2, x.o, x.t)));
}
// 素材にできそうな自分の場のモンスター（場所の番号）
function sxCands(st, s, c){
  const x = sxK(c), p = P(st, s), lv = lvOf(c); if (!x || (!lv && x.k !== "cf")) return [];
  return p.mz.map((m, i) => i).filter(i => { const m = p.mz[i]; if (!m || monCannotLeave(m)) return false; if (x.k === "cf") return c.fusion.some(y => fusionMatOk(m.c, y)); if (x.k === "xyz" && ovOk(st, s, c, x, i)) return true; const v = matLv(card(m.c)); return x.k === "xyz" ? v === lv && sxHit(m.c, x) : v > 0 && v < lv && (sxHit(m.c, x.t) || sxHit(m.c, x.o, x.t)); });
}
// どれかの正しい組み合わせに入るモンスターだけ（えらぶ画面に出す）
function sxUsable(st, s, c){ const C = sxCands(st, s, c), U = new Set(); for (let mask = 1; mask < 1 << C.length; mask++){ const L = C.filter((_, j) => mask >> j & 1); if (sxPicksOk(st, s, c, L)) L.forEach(i => U.add(i)); } return C.filter(i => U.has(i)); }
// 自動で素材をえらぶ（ATKの合計がいちばん小さい組み合わせ）。null = 出せない
function sxAuto(st, s, c){
  const C = sxCands(st, s, c), p = P(st, s); let best = null, bs = Infinity;
  for (let mask = 1; mask < 1 << C.length; mask++){ const L = C.filter((_, j) => mask >> j & 1); if (!sxPicksOk(st, s, c, L)) continue; const a = L.reduce((t, i) => t + (Number(atkOf(p.mz[i])) || 0), 0); if (best == null || a < bs){ bs = a; best = L; } }
  return best;
}
function sxWhy(st, s, c){
  const x = sxK(c); if (!x) return "シンクロ・エクシーズモンスターではない";
  if (st.turn !== s || st.pending || st.winner) return "自分のターンに出せます";
  if (!lvOf(c) && x.k !== "cf") return `${x.k === "xyz" ? "ランク" : "レベル"}が決まっていないカード`;
  if (!canPay(st, s, c)) return "マナが足りない";
  if (!sxAuto(st, s, c)) return x.k === "cf" ? `素材（${c.fusion.map(fusionMatText).join("＋")}）が自分の場にそろっていない` : x.k === "xyz" ? `素材（レベル${lvOf(c)}のモンスター${x.n}体）がそろっていない` : `素材（レベルの合計が${lvOf(c)}）がそろっていない`;
  return "";
}
// id: EXデッキのカード、picks: 素材にする自分の場所（なければ自動）
function sxSummon(st, s, id, picks){
  const p = P(st, s), k = (p.ex || []).indexOf(id), c = card(id), x = sxK(c);
  if (k < 0 || sxWhy(st, s, c)) return false;
  if (!picks) picks = sxAuto(st, s, c);
  if (!sxPicksOk(st, s, c, picks)) return false;
  if (!pay(st, s, c)) return false;
  const L = [...new Set(picks.map(Number))], matIds = L.map(i => p.mz[i].c), names = matIds.map(m => `「${card(m).name}」`).join(""), how = x.k === "cf" ? "融合召喚" : x.k === "xyz" ? "エクシーズ召喚" : "シンクロ召喚";
  p.ex.splice(k, 1); if (x.k === "xyz" && L.length === 1) p.ovT = { ...(p.ovT || {}), [id]: st.turnNo };
  const mats = [];
  if (x.k === "xyz") L.forEach(i => { const m = p.mz[i]; leaveEquips(st, m); sealsOut(st, m); if (!m.cp) (m.owner && m.owner !== s ? P(st, m.owner).grave : mats).push(m.c); mats.push(...(m.mats || [])); p.mz[i] = null; ev(st, { type: "destroy", s, z: i }); });
  else L.forEach(i => sendToGrave(st, s, i));
  ev(st, { type: "fusion", s, mats: matIds, c: id, lbl: how + "！" });
  const z = freeZone(p.mz, p), paid = `${names}を${x.k === "xyz" ? "重ねて" : "墓地へ送って"}`;
  if (sumWin(st, s, id)){
    st.chain = [{ s, c: id, summon: true, special: true, z, ctx: { zone: z }, mats }];
    log(st, s, `${paid}、「${c.name}」（ATK ${fmtN(baseAtk(c))}）を${how}しようとしている…`);
    st.pending = { type: "chain", by: s, wait: true, resume: null };
    return true;
  }
  p.mz[z] = mkMon(st, id); if (mats.length) p.mz[z].mats = mats;
  ev(st, { type: "summon", s, z });
  log(st, s, `${paid}、「${c.name}」（ATK ${fmtN(baseAtk(c))}）を${how}！`);
  trigger(st, s, c, "ssummon", { zone: z, mon: { s, i: z, u: p.mz[z].u } });
  enterFire(st, s, "put");
  onCardUsed(st, s, c, null, p.mz[z] && p.mz[z].u);
  summonedWindow(st, s, z, true);
  return true;
}
// picks = [{from: "hand"|"mz", i}] chosen by the player → a plan, or null if they don't match the materials
function fusionPlanFrom(st, s, fc, picks){
  const p = P(st, s), pool = (picks || []).map(x => ({ from: x.from, i: +x.i, id: x.from === "hand" ? p.hand[+x.i] : p.mz[+x.i] && p.mz[+x.i].c })).filter(x => x.id != null);
  if ((picks || []).some(x => x.from === "mz" && monCannotLeave(p.mz[+x.i]))) return null;
  if (!isFusion(fc) || pool.length !== fc.fusion.length || new Set(pool.map(x => x.from + x.i)).size !== pool.length) return null;
  const used = new Set(), rec = k => { if (k >= fc.fusion.length) return true; for (let j = 0; j < pool.length; j++){ if (used.has(j) || !fusionMatOk(pool[j].id, fc.fusion[k])) continue; used.add(j); if (rec(k + 1)) return true; used.delete(j); } return false; };
  if (!rec(0)) return null;
  if (freeZone(p.mz, p) < 0 && !pool.some(x => x.from === "mz")) return null;
  return pool;
}
function transformAt(st, s, k, into, src, srcCard, fxo){
  const p = P(st, s), old = p.hand[k]; if (old == null) return;
  const id = into ? fxCardId({ kind: "transformHand", into, intoId: fxo && fxo.intoId }, srcCard) : randSpire(false, p.spc);
  if (!id){ log(st, s, `${src}：${into ? `「${into}」というカードが見つからない` : "変化先のカードがない"}`); return; }
  p.hand[k] = id; log(st, s, `${src}で「${card(old).name}」が「${card(id).name}」に変化した`);
}
// 自動で使う: the drawn card is played for free (targets at random), then goes to the graveyard (or 廃棄 / stays if 永続)
function autoPlayCard(st, s, id){
  const p = P(st, s), c = card(id);
  { const why = useCondWhy(st, s, c); if (why){ p.hand.push(id); log(st, s, `「${c.name}」は発動条件を満たさないため手札へ：${why}`); return; } }
  if (isField(c) && st.field && cannotLeave(st.field.c)){ p.hand.push(id); log(st, s, `場から離れないフィールドがあるため「${c.name}」は手札へ`); return; }
  log(st, s, `「${c.name}」を自動で使った！`); ev(st, { type: "spell", s, c: id }); countPlay(st, s, c);
  const pz = isPersist(c) ? freeZone(p.sz, p) : -1;
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
  if (n > 0 && m.dmg < a && P(st, s).mz[i] === m) ctrReachFire(st, monTrigList(st, s, i, "ctrReach", m, { ctrEv: { id: CTR_DMG, before: m.dmg - n, after: m.dmg, w: "self" } }));
}
const potionChips = (p, mine) => (p.potions || []).map((k, i) => [k, i, potionDef(k)]).filter(x => x[2]).map(([k, i, d]) => mine ? `<button class="bst pot" data-potion="${i}" title="${esc(d.text)}" ${G && G.st && canAct(G.st, G.slot) ? "" : "disabled"}>${d.img ? `<img alt="" src="${d.img}">` : "🧪"}${esc(d.name)}</button>` : `<span class="bst pot" title="${esc(d.text)}">${d.img ? `<img alt="" src="${d.img}">` : "🧪"}${esc(d.name)}</span>`).join("");
// the row under each player: relics, 筋力 / 脱力 / ブロック…, and ポーション (full width, so the name and LP keep their room)
const potRow = (p, mine, noPots) => { const h = statChips(p) + (noPots ? "" : potionChips(p, mine)); return h ? `<div class="pots">${h}</div>` : ""; };
const lockChips = p => { const tn = typeof G !== "undefined" && G && G.st ? G.st.turnNo : null; if (tn == null) return ""; return ((p.noAtkUntil || 0) >= tn ? `<span class="bst wk" title="効果で、このターンはモンスターが攻撃できない">攻撃できない</span>` : "") + ((p.noUseUntil || 0) >= tn ? `<span class="bst wk" title="相手の効果で、魔法・罠を発動できない">発動できない</span>` : "")
  + (p.skipNow && p.skipNow.no === tn ? (p.skipNow.main ? `<span class="bst wk" title="このターンは手札のカードを使えない（召喚・セット・発動など）">メイン飛ばし中</span>` : "") + (p.skipNow.battle ? `<span class="bst wk" title="このターンはモンスターで攻撃できない">バトル飛ばし中</span>` : "") : "")
  + (p.skipNext ? ["draw", "main", "battle"].filter(k => p.skipNext[k]).map(k => `<span class="bst wk" title="次のターンの${SKIP_WHAT[k]}を飛ばす">次の${SKIP_WHAT[k].replace("ステップ", "")}を飛ばす</span>`).join("") : ""); };
const timerChips = p => (p.timers || []).map(t => { const c = t.c && hasCard(t.c) ? card(t.c) : null, tx = c ? blockText(c, { ...t.b, delay: 0 }) : ""; return `<span class="bst tmrc" title="${esc(`「${t.name}」：あと${t.left}回の自分のターンのはじめで効果が出る${tx ? "（" + tx + "）" : ""}`)}">${clockSVG(t.left)}${esc(t.name)}</span>`; }).join("");
const boonChips = p => (p.boons || []).map(t => { const c = t.c && hasCard(t.c) ? card(t.c) : { id: t.c, name: t.name, type: "magic" }, tx = blockText(c, { ...t.b, delay: 0, grant: null }); return `<span class="bst boon" title="${esc(`付与された効果「${t.name}」：自分のターンの${t.at === "turnStart" ? "はじめ" : "おわり"}に、${tx}${t.dur ? `（あと${t.left}回）` : "（ずっと）"}`)}">✦${esc(t.name)}${t.dur ? `<small>×${t.left}</small>` : ""}</span>`; }).join("");
const statChips = p => ctrChipsP(p) + lockChips(p) + timerChips(p) + boonChips(p) + Object.entries(p.free || {}).filter(([, v]) => v > 0).map(([k, v]) => `<span class="bst free" title="次に使うこの種類のカードはコスト0">次の${SPIRE_LABEL[k]}0コスト${v > 1 ? "×" + v : ""}</span>`).join("") + (p.relics || []).map(k => relicDef(k)).filter(Boolean).map(d => `<span class="bst rel" title="${esc(d.text)}">${d.img ? `<img alt="" src="${d.img}">` : ""}${esc(d.name)}</span>`).join("") + (p.block ? `<span class="bst blk" title="次の自分のターンのはじめまで、受けるダメージを先に引き受ける">ブロック ${p.block}</span>` : "") + (p.vuln > 0 ? `<span class="bst vul" title="受けるダメージが1.5倍">弱体 ${p.vuln}</span>` : "") + (p.str ? `<span class="bst str" title="カードで与えるダメージ（1回ごと）と、自分のモンスターがプレイヤーに与える戦闘ダメージが${p.str > 0 ? "+" : "−"}${Math.abs(p.str)}">筋力 ${p.str}</span>` : "") + (p.dex ? `<span class="bst str" title="カードで得るブロックが${p.dex > 0 ? "+" : "−"}${Math.abs(p.dex)}">敏捷 ${p.dex}</span>` : "") + (p.dblNext || []).map(e => `<span class="bst pw" title="このターン、次に使うこのカードはもう1回発動する">次の${esc(usedPfText(e))}×2</span>`).join("") + (p.freeNext || []).map(e => `<span class="bst free" title="次に使うこのカードはコスト0">次の${esc(usedPfText(e))}0コスト</span>`).join("") + (p.intang > 0 ? `<span class="bst blk" title="受けるダメージが1になる（自分のターンのはじめに1減る）">霊体 ${p.intang}</span>` : "") + (p.weak > 0 ? `<span class="bst wk" title="カードで与えるダメージが0.75倍">脱力 ${p.weak}</span>` : "")
  + [[p.barricade, "バリケード", "ブロックがターンのはじめに消えない"], [p.plate > 0, `プレート ${p.plate}`, "自分のターンのおわりにこの分ブロックを得る。LPを失うたび20減る"], [p.corrupt, "堕落", "スキルのコストが0。使うと廃棄"], [p.vulnBonus > 0, `無慈悲 +${p.vulnBonus}%`, "弱体の相手へのダメージがさらにふえる"], [p.firstBlock2, "盤石", "毎ターン最初のブロックが2倍"], [p.rage > 0, `激怒 ${p.rage}`, "このターン、アタックを使うたびブロックを得る"], [p.thorns > 0, `反撃 ${p.thorns}`, "攻撃してきたモンスターにダメージ"], [p.dblAtk > 0, `次のアタック×2`, "次に使うアタックをもう1回プレイ"], [p.extraTurns > 0, `追加ターン${p.extraTurns > 1 ? "×" + p.extraTurns : ""}`, "このターンのあと、もう一度自分のターン"], [(p.autoPlay || []).length, `自動：${(p.autoPlay || []).join("・")}`, "名前にこの文字が入ったカードを引くと自動で使う"]].filter(x => x[0]).map(x => `<span class="bst pw" title="${x[2]}">${x[1]}</span>`).join("");
function dealDmg(st, s, n){
  const p = P(st, s);
  // ダメージを跳ね返す: このターン受けるダメージは相手へ（跳ね返されたダメージはもう跳ね返らない）
  if (n > 0 && (p.reflectUntil || 0) >= st.turnNo && !dealDmg.busy){ log(st, s, `${p.name}は${n === Infinity ? "" : fmtN(n) + "の"}ダメージを跳ね返した！`); dealDmg.busy = true; try { dealDmg(st, O(s), n); } finally { dealDmg.busy = false; } return; }
  // シールドデッキ: LPのかわりに、ダメージ1回でシールド1枚（300ごとにもう1枚）をブレイク
  if (p.shieldOn){ if (n > 0) breakShields(st, s, n === Infinity ? p.shields.length : 1 + Math.floor(n / 300), "ダメージ"); return; }
  if (n === Infinity){ p.lp = Math.min(0, p.lp); return; }
  if (n > 0 && p.vuln > 0){ n = Math.floor(n * (1.5 + (P(st, O(s)).vulnBonus || 0) / 100)); log(st, s, `弱体で${n}ダメージに！`); }
  if (n > 1 && p.intang > 0){ n = 1; log(st, s, `霊体でダメージが1になった`); }
  let blk = 0;
  if (n > 0 && p.block > 0){ const b = Math.min(p.block, n); p.block -= b; n -= b; blk = b; log(st, s, `ブロックで${b}ダメージを防いだ（残りブロック ${p.block}）`); }
  p.lp -= n;
  if (n > 0 || blk) ev(st, { type: "hit", s, d: n, blk });
  if (n > 0) lostLp(st, s);
}
function log(st, s, m){ st.log.push({ t: Date.now(), s: s || "", m }); if (st.log.length > 80) st.log.splice(0, st.log.length - 80); lpTrack(st); }
/* ---- LPの増減の記録（lpLog）----
   LPを変える処理はあちこちにあるので、ログを書くたび・勝ち負けを見るたびに「前に見たLP」とくらべて記録する
   理由は、そのとき・その前のログからLPやダメージの話をしているものを使う */
const LP_WHY = /LP|ダメージ|回復|吸収|払/, LP_WHY_NO = /^(ブロックで|弱体で|霊体で)/;
function lpTrack(st){
  if (!st || !st.players) return;
  for (const k of ["a", "b"]){
    const p = st.players[k]; if (!p || typeof p.lp !== "number") continue;
    if (p.lpSeen == null || p.lpSeen !== p.lpSeen){ p.lpSeen = p.lp; continue; }
    if (p.lp === p.lpSeen) continue;
    const d = p.lp - p.lpSeen; let why = "";
    for (let j = st.log.length - 1; j >= 0 && j >= st.log.length - 6; j--){ const m = st.log[j].m || ""; if (LP_WHY.test(m) && !LP_WHY_NO.test(m)){ why = m; break; } }
    const L = p.lpLog = p.lpLog || [];
    L.push({ n: st.turnNo || 0, d: isFinite(d) ? d : (d > 0 ? "∞" : "-∞"), lp: isFinite(p.lp) ? p.lp : String(p.lp), w: why.slice(0, 80) });
    if (L.length > 40) L.splice(0, L.length - 40);
    p.lpSeen = p.lp;
  }
}
const nm = (st, s) => P(st, s).name;
const isHumanHere = s => G && s === G.slot;

function checkEnd(st){
  lpTrack(st);
  if (st.winner) return;
  ctrAuraSync(st);
  const la = st.players.a.shieldOn ? 1 : st.players.a.lp, lb = st.players.b.shieldOn ? 1 : st.players.b.lp, na = la <= 0 ? noLoseBy(st, "a") : "", nb = lb <= 0 ? noLoseBy(st, "b") : "", xa = la <= 0 && !na, xb = lb <= 0 && !nb;
  if (xa && xb){ st.winner = "draw"; st.why = "両者LP0"; }
  else if (xa){ st.winner = "b"; st.why = `${nm(st, "a")} のLPが0になった`; }
  else if (xb){ st.winner = "a"; st.why = `${nm(st, "b")} のLPが0になった`; }
  // 敗北回避: LPが0以下でも負けない（1回だけお知らせ）
  [["a", na], ["b", nb]].forEach(([s, w]) => { if (!w) return; const p = P(st, s), k = st.turnNo + ":" + p.lp + ":" + w; if (p.noLoseLog !== k){ p.noLoseLog = k; log(st, s, `LPが${p.lp}だけど、「${w}」の効果でゲームに負けない！`); } });
}
// 敗北回避: 負けないなら、その効果を出したカードの名前（なければ ""）
function noLoseBy(st, s){
  const p = P(st, s); if (!p) return "";
  if (p.noLoseT === st.turnNo) return p.noLoseSrc || "敗北回避";
  const srcs = [];
  p.mz.forEach((m, i) => { if (m) srcs.push({ c: monCard(m), ctx: { zone: i, mon: { s, i, u: m.u } } }); });
  p.sz.forEach((z, i) => { if (z && z.face && (isPersist(card(z.c)) || z.fcp)) srcs.push({ c: card(z.c), ctx: { pz: i } }); });
  if (st.field && st.field.o === s) srcs.push({ c: card(st.field.c), ctx: { field: true } });
  for (const x of srcs) for (const b of blocksOf(x.c)){
    let L = b.then || [];
    if (b.trig === "while"){ const plain = (b.conds || []).filter(y => y.k !== "ask"), ok = !plain.length || (b.join === "or" ? plain.some(y => condMet(st, s, x.c, y, x.ctx)) : plain.every(y => condMet(st, s, x.c, y, x.ctx))); L = (ok ? b.then : b.else) || []; }
    if (L.some(e => e && e.kind === "noLoseWhile")) return x.c.name;
  }
  return "";
}
// from: どの人の山札から引くか（ふつうは自分。相手の山札から引く効果では相手）
function drawN(st, s, n, why, from = s){
  const p = P(st, s), d = P(st, from), opp = from !== s; let got = 0; p.lastDrawn = [];
  if (p.noDraw && n > 0){ log(st, s, `${why || ""}：このターンはもうカードを引けない`); return; }
  for (let i = 0; i < n; i++){ if (!d.deck.length) refill(st, from); if (d.deck.length){ p.hand.push(d.deck.shift()); got++; } }
  p.lastDrawn = got ? p.hand.slice(-got) : []; aceDrew(st, s, p.lastDrawn);
  if (why) log(st, s, `${why}で${opp ? `${d.name}の山札から` : ""}カードを${got}枚引いた`);
  // 「名前に○が入ったカードを引くたび自動で使う」
  if (got && (p.autoPlay || []).length && !st.winner){
    p.hand.slice(-got).forEach(id => {
      const c = card(id); if (cardType(c) !== "magic" || !p.autoPlay.some(w => (c.name || "").includes(w))) return;
      const k = p.hand.lastIndexOf(id); if (k < 0) return;
      p.hand.splice(k, 1); autoPlayCard(st, s, id);
    });
  }
  if (got < n) log(st, s, `${opp ? "相手の" : ""}山札がなくて引けなかった`);
}
// 切り札を引いたら演出（引いた人にだけ見える）
function aceDrew(st, s, ids){ (ids || []).forEach(id => { if (aceOn(card(id), "draw")) ev(st, { type: "ace", s, c: id, draw: true }); }); }
// 空いているゾーン（なければ -1）。盤面上限なしのデッキ（p.nolim）は、いっぱいならゾーンを1つふやす
function freeZone(arr, p){ const i = arr.findIndex(x => !x); if (i >= 0 || !p || !p.nolim) return i; arr.push(null); return arr.length - 1; }
// 盤面上限なし: いつも空きゾーンを1つ見せる（置く場所をえらべるように）
function zonePad(p){ if (!p || !p.nolim) return; for (const k of ["mz", "sz"]){ const a = p[k]; if (a && !a.some(x => !x)) a.push(null); } }
// 盤面上限なし: ターンのはじめに、右はしのあまった空きゾーンをつめる（5つより少なくはしない）
function zoneTrim(p){ if (!p || !p.nolim) return; for (const k of ["mz", "sz"]){ const a = p[k]; while (a && a.length > ZONES && !a[a.length - 1] && a.slice(0, -1).some(x => !x)) a.pop(); } }
// 場のモンスターを手札・除外に送る（破壊ではないので「破壊されたとき」は出ない）。装備と質量は墓地へ、コピーは消える
function leaveEquips(st, m){
  eqsOf(m).forEach(e => { const p = P(st, e.o); if (cannotLeave(e.c)) (p.standingEq || (p.standingEq = [])).push(e); else p.grave.push(e.c); });
}
function attachStanding(st, s, k, ts, ti){
  if (!canAct(st, s)) return false;
  const p = P(st, s), e = (p.standingEq || [])[k], m = P(st, ts).mz[ti];
  if (!e || !m || !canEquipOn(st, e.c, ts, ti)) return false;
  p.standingEq.splice(k, 1); (m.eqs || (m.eqs = [])).push(e);
  log(st, s, `待機していた「${card(e.c).name}」を「${card(m.c).name}」に装備した`);
  ev(st, { type: "equip", s: ts, z: ti }); return true;
}
// 山札に置く: top 一番上（次に引く）/ bottom 一番下 / shuffle 混ぜる
function deckPut(p, id, pos){ if (pos === "top") p.deck.unshift(id); else { p.deck.push(id); if (pos !== "bottom") shuffle(p.deck); } }
// 超次元: 場を離れるとき、かわりにEXデッキに戻る
function psyBack(st, o, id){ const c = card(id); if (!c || !c.psychic) return false; const w = P(st, o); (w.ex = w.ex || []).push(id); log(st, o, `「${c.name}」はEXデッキに戻った（超次元）`); return true; }
function moveMonOut(st, o, i, to, opt = {}){
  const p = P(st, o), m = p.mz[i]; if (!m || monCannotLeave(m)) return null;
  if (!opt.noMorph && (exLifeSave(st, o, i) || leaveMorph(st, o, i))) return null;
  leaveEquips(st, m); p.grave.push(...(m.mats || [])); sealsOut(st, m);
  p.mz[i] = null; ev(st, { type: "destroy", s: o, z: i });
  if (!m.cp && psyBack(st, m.owner || o, m.c)){}
  else if (!m.cp){ const w = P(st, m.owner || o); if (to === "exile") (w.exile = w.exile || []).push(m.c); else if (to === "mana"){ if (w.manaZ){ manaSync(w); manaPut(st, m.owner || o, m.c); } else w.grave.push(m.c); } else if (to === "deck") deckPut(w, m.c, opt.pos); else if (to === "shield"){ if (w.shieldOn && w.shields) w.shields.push(m.c); else w.grave.push(m.c); } else w.hand.push(m.c); }
  return m;
}
// 質量を場に出す: モンスターはモンスターゾーンへ、魔法・罠は魔法・罠ゾーンに伏せて。copy = コピー（やられても本体は墓地に行かない）
function putOut(st, s, id, copy){
  const p = P(st, s), c = card(id);
  if (cardType(c) === "monster"){ const z = freeZone(p.mz, p); if (z < 0) return false; p.mz[z] = mkMon(st, id); if (copy) p.mz[z].cp = true; ev(st, { type: "summon", s, z }); trigger(st, s, c, "ssummon", { zone: z, mon: { s, i: z, u: p.mz[z].u } }); enterFire(st, s, "put"); return true; }
  if (cardType(c) === "equip") return false;
  const z = freeZone(p.sz, p); if (z < 0) return false; st.un = (st.un || 0) + 1; p.sz[z] = { c: id, turn: st.turnNo, face: false, u: st.un, ...(copy ? { cp: true } : {}) }; return true;
}
// ナナシ（anySum）: 自分のターンのはじめ、墓地に質量が足りていれば、手札・山札・墓地のどこからでも召喚できる
function anySumFind(st, s){
  const p = P(st, s); if (freeZone(p.mz, p) < 0) return null;
  for (const where of ["hand", "deck", "grave"]) for (let j = 0; j < p[where].length; j++){ const c = card(p[where][j]); if (c && c.anySum && cardType(c) === "monster" && p.grave.length - (where === "grave" ? 1 : 0) >= massOf(c)) return { id: p[where][j], where, j }; }
  return null;
}
function anySumDo(st, s, id){
  const p = P(st, s), x = anySumFind(st, s); if (!x || x.id !== id) return;
  p[x.where].splice(x.j, 1); const ms = massOf(card(id)), mats = p.grave.splice(0, ms), z = freeZone(p.mz, p);
  p.mz[z] = mkMon(st, id); if (mats.length) p.mz[z].mats = mats;
  log(st, s, `「${card(id).name}」を${{ hand: "手札", deck: "山札", grave: "墓地" }[x.where]}から召喚した！（墓地の${mats.length}枚を質量に）`); ev(st, { type: "summon", s, z });
  trigger(st, s, card(id), "ssummon", { zone: z, mon: { s, i: z, u: p.mz[z].u } });
  enterFire(st, s, "put");
}
function anySumAsk(st, s, then){
  const x = !st.winner && anySumFind(st, s);
  if (!x){ then && then(st); return; }
  const c = card(x.id), go = (st2, yes) => { if (yes) anySumDo(st2, s, x.id); else log(st2, s, `「${c.name}」は召喚しなかった`); then && then(st2); };
  if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c, fx: { kind: "__block", ask: `「${c.name}」を${{ hand: "手札", deck: "山札", grave: "墓地" }[x.where]}から召喚する？` }, yesTxt: `墓地のカード${massOf(c)}枚を質量にして「${c.name}」を召喚する`, ctx: {}, then, block: { b: { then: [], else: [] }, fin: y => y, go } }); return; }
  go(st, true);
}
const tauntIdx = (st, s) => P(st, s).mz.map((m, i) => m && hasAb(st, s, i, "taunt") ? i : -1).filter(i => i >= 0);
// 隠密: 自分から攻撃するまで、相手の攻撃・効果の対象にならない
// 封印: m.seals = [{ c: カード, o: 持ち主 }]。1つでもあれば、ないものとして扱う
const sealedM = m => !!(m && m.seals && m.seals.length);
const hiddenMon = (st, s, i) => { const m = P(st, s).mz[i]; return !!m && (sealedM(m) || (!m.revealed && hasAb(st, s, i, "stealth")) || jdOn(st, s, i)); };
const sealShare = (a, b) => { const A = tagsOf(a), B = tagsOf(b); return !A.length && !B.length ? true : A.some(t => B.includes(t)); };
// 自分のモンスターを出したとき、同じタグの（封印された）自分のモンスターから封印を1つはがす
function sealRelease(st, s, z){
  const p = P(st, s), nm = p.mz[z]; if (!nm || sealedM(nm)) return;
  const j = p.mz.findIndex((m, k) => k !== z && sealedM(m) && sealShare(card(nm.c), card(m.c))); if (j < 0) return;
  const m = p.mz[j], sl = m.seals.shift(); P(st, sl.o).grave.push(sl.c);
  log(st, s, `「${card(nm.c).name}」を出したので、「${card(m.c).name}」の封印が1つはがれた（のこり${m.seals.length}）`);
}
const sealsOut = (st, m) => { (m && m.seals || []).forEach(x => P(st, x.o).grave.push(x.c)); if (m) m.seals = []; evoUOut(st, m); };
// 進化（デュエマ風）: 下に重なったカード（進化元）。場をはなれるときはいっしょに墓地へ
const evoUOut = (st, m) => { (m && m.evoU || []).forEach(x => P(st, x.o).grave.push(x.c)); if (m) m.evoU = []; };
const isDmEvo = c => !!(c && cardType(c) === "monster" && c.dmEvo && String(c.dmEvo.name || "").trim());
function evoBases(st, s, c){ const p = P(st, s); if (!isDmEvo(c)) return []; return p.mz.map((m, i) => m && !monCannotLeave(m) && !m.cp && !hiddenMon(st, s, i) && revoHit(card(m.c), c.dmEvo) ? i : -1).filter(i => i >= 0); }
// 無月の門: 仲間のモンスターが出たら覚えておき、あとで（効果の処理が終わってから）聞く
function mugNote(st, s, z){ const m = P(st, s).mz[z]; if (!m) return; const p = P(st, s); if (![...p.hand, ...p.grave].some(id => mugOf(card(id)) && revoHit(card(m.c), mugOf(card(id))))) return; st.mugQ = [...new Set([...(st.mugQ || []), s])]; }
// 使える無月の門: [{ where, j, id, f: 場のゾーン, g: 墓地の位置 }]
function mugCands(st, s){
  const p = P(st, s), out = [];
  [["hand", p.hand], ["grave", p.grave]].forEach(([where, L]) => L.forEach((id, j) => {
    const c = card(id), g = mugOf(c); if (!g) return;
    const fAll = p.mz.map((m, i) => m && !monCannotLeave(m) && !m.cp && !hiddenMon(st, s, i) && revoHit(card(m.c), g) ? i : -1).filter(i => i >= 0).sort((a, b) => cmpNum(atkOf(p.mz[a]), atkOf(p.mz[b]))), f = fAll.slice(0, g.nf);
    const gAll = p.grave.map((x, k) => !(where === "grave" && k === j) && revoHit(card(x), g) ? k : -1).filter(k => k >= 0), gr = gAll.slice(0, g.ng);
    if (f.length < g.nf || gr.length < g.ng || (!f.length && freeZone(p.mz, p) < 0)) return;
    if (out.some(o => o.id === id)) return;
    out.push({ where, j, id, f, g: gr, fAll, gAll, nf: g.nf, ng: g.ng });
  }));
  return out;
}
// 自分で選んだ下のカード（f: 場のゾーン, g: 墓地の位置）が今も使えるか
function mugPicked(st, s, id, f, g){
  const x = mugCands(st, s).find(d => d.id === id); if (!x) return null;
  f = [...new Set((f || []).map(Number))]; g = [...new Set((g || []).map(Number))];
  if (f.length !== x.nf || g.length !== x.ng || f.some(i => !x.fAll.includes(i)) || g.some(k => !x.gAll.includes(k))) return null;
  return { ...x, f, g };
}
function mugDo(st, s, x){
  const p = P(st, s), c = card(x.id); if ((x.where === "hand" ? p.hand : p.grave)[x.j] !== x.id) return false;
  if (x.f.some(i => !p.mz[i] || monCannotLeave(p.mz[i]))) return false;
  const under = [], gIds = x.g.map(k => p.grave[k]);
  // 墓地から: 後ろの位置から抜く（出すカード自身が墓地ならいっしょに）
  const rm = [...x.g, ...(x.where === "grave" ? [x.j] : [])].sort((a, b) => b - a); rm.forEach(k => p.grave.splice(k, 1));
  if (x.where === "hand") p.hand.splice(x.j, 1);
  gIds.forEach(id => under.push({ c: id, o: s }));
  x.f.forEach(i => { const m = p.mz[i]; if (!m) return; under.push(...(m.evoU || [])); m.evoU = []; leaveEquips(st, m); p.grave.push(...(m.mats || [])); sealsOut(st, m); p.mz[i] = null; if (!m.cp) under.push({ c: m.c, o: m.owner || s }); ev(st, { type: "destroy", s, z: i }); });
  const z = x.f.length ? x.f[0] : freeZone(p.mz, p); if (z < 0) return false;
  const nm = mkMon(st, x.id); nm.evoU = under; p.mz[z] = nm;
  log(st, s, `無月の門！${under.map(u => `「${card(u.c).name}」`).join("")}の上に「${c.name}」を${x.where === "hand" ? "手札" : "墓地"}から召喚した`);
  ev(st, { type: "summon", s, z });
  trigger(st, s, c, "summon", { zone: z, mon: { s, i: z, u: nm.u } });
  return true;
}
// たまった無月の門を処理（手が空いたときだけ）。オンラインでは、その人の画面でだけ聞く
function mugRun(st){
  if (!st || !(st.mugQ || []).length || st.pending || st.winner || st.askQ || (G && (G.chooseQ.length || G.mugPick))) return;
  const L = st.mugQ.slice(); st.mugQ = [];
  for (const s of L){
    if (G && G.mode === "online" && s !== G.slot){ st.mugQ.push(s); continue; }
    const C = mugCands(st, s); if (!C.length) continue;
    const p = P(st, s), desc = x => `${x.where === "hand" ? "手札" : "墓地"}から・ATK ${fmtN(baseAtk(card(x.id)))}・下に：${[...x.f.map(i => card(p.mz[i].c).name), ...x.g.map(k => card(p.grave[k]).name)].map(n => `「${n}」`).join("")}`;
    if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c: card(C[0].id), fx: { kind: "__block", ask: "無月の門を使う？（えらんだカードの上に重ねて、タダで召喚する）" }, ctx: {}, then: null, pick1: [...C.map(x => ({ name: card(x.id).name, text: desc(x) })), { name: "使わない", text: "このまま" }], p1go: (st2, k) => { const D = mugCands(st2, s); if (k < C.length){ const x = D.find(d => d.id === C[k].id); if (!x) return; if (x.fAll.length === x.nf && x.gAll.length === x.ng) mugDo(st2, s, x); else G.mugPick = { s, id: x.id, pf: x.f.slice(), pg: x.g.slice() }; } } }); return; }
    // CPU: 下にする場のモンスターより強ければ使う
    const best = C.map(x => ({ x, gain: cmpNum(baseAtk(card(x.id)), x.f.reduce((t, i) => t + (+atkOf(p.mz[i]) || 0), 0)) })).filter(o => o.gain > 0).sort((a, b) => cmpNum(baseAtk(card(b.x.id)), baseAtk(card(a.x.id))))[0];
    if (best) mugDo(st, s, best.x);
  }
}
// 進化元 z の上に id を重ねる
function evoPut(st, s, z, id){
  const p = P(st, s), b = p.mz[z]; if (!b) return null;
  const nm = mkMon(st, id);
  nm.evoU = [...(b.evoU || []), { c: b.c, o: b.owner || s }]; nm.eqs = b.eqs || []; if ((b.mats || []).length) nm.mats = b.mats;
  nm.attacked = b.attacked; nm.atkCount = b.atkCount; nm.atkTotal = b.atkTotal; nm.evoDM = true;
  p.mz[z] = nm; return nm;
}
// ジャストダイバー: 出たターンと、そのあとの相手のターンのあいだ
const jdOn = (st, s, i) => { const m = P(st, s).mz[i]; return !!m && hasAb(st, s, i, "justDiver") && (st.turnNo === m.born || (st.turnNo === m.born + 1 && st.turn !== s)); };
// えらべる対象（「しぼる」で属性・ATKなどに合うモンスターだけ）
function fxTargets(st, s, fx, ctx = {}){
  const opts = targetOptions(st, s, fx.kind, ctx); if (!opts || !opts.length || !mfOn(fx)) return opts;
  const TS = ctx.side === "me" ? s : O(s), t = fxTgt(fx);
  if (t === "grave") return opts.filter(id => mfCardOk(st, s, fx, id));
  return opts.filter(o => { const k = String(o); if (k === "p") return true; let side, i; const mm = k.match(/^(?:(a|b):)?(?:m:)?(\d+)$/); if (!mm) return true; side = mm[1] || (t === "mine" ? s : TS); i = +mm[2]; return mfOk(st, s, fx, P(st, side).mz[i]); });
}
// 使えるかどうかを見るとき（まだ発動していない）: まとめた効果は中身（だれの・どれを）で対象を見る
function useTargets(st, s, fx){
  if (!fx) return null; const f = fxExec(fx), ctx = { tagName: fx.into || "" };
  if (FX_FORMS[f.kind]) Object.assign(ctx, { form: f, side: f.side === "me" ? "me" : null });
  return targetOptions(st, s, f.kind, ctx);
}
function targetOptions(st, s, kind, ctx = {}){
  // スパイア attack: the opponent ("p") or one of their monsters ("m:i"); only asks when there is a monster to hit
  // 1体/2体 aim at the opponent's monsters first; the player only when there is none (ランダム can hit either)
  const TS = ctx.side === "me" ? s : O(s);
  if (kind === "removeBoard"){ const sides = ctx.rside === "me" ? [s] : ctx.rside === "both" ? [s, O(s)] : [O(s)], out = []; sides.forEach(o => { const X = P(st, o); X.mz.forEach((m, i) => { if (m && (o === s || !fxHidden(st, o, i))) out.push(`${o}:mz:${i}`); }); X.sz.forEach((z, i) => { if (z) out.push(`${o}:sz:${i}`); }); (X.standingEq || []).forEach((e, i) => out.push(`${o}:eq:${i}`)); }); if (st.field && sides.includes(st.field.o)) out.push("field"); return out; }
  if (kind === "setCost" && ctx.sp !== "pick") return null;
  if (kind === "giveAttr"){ const w = ctx.aw; if (w !== "opp1" && w !== "mine1") return null; const o = w === "mine1" ? s : O(s), out = []; P(st, o).mz.forEach((m, i) => { if (m && (o === s || !fxHidden(st, o, i))) out.push(`${o}:${i}`); }); return out; }
  if (kind === "giveAb" || kind === "loseAb"){ const w = ctx.gw; if (w !== "mine" && w !== "opp") return null; const o = w === "mine" ? s : O(s), out = []; P(st, o).mz.forEach((m, i) => { if (m && (o === s || !fxHidden(st, o, i))) out.push(`${o}:${i}`); }); return out; }
  if (kind === "ctrAdd" || kind === "ctrDel") return ctx.ctrPick ? P(st, TS).mz.map((m, i) => m && (TS === s || !fxHidden(st, TS, i)) ? "m:" + i : null).filter(Boolean) : null;
  if (ctx.spireAtk && (kind === "dmg" || kind === "bash" || kind === "vuln" || kind === "weak")){ const tt = TS === s ? [] : tauntIdx(st, TS), ms = (tt.length ? tt : P(st, TS).mz.map((m, i) => m ? i : -1).filter(i => i >= 0)).map(i => "m:" + i); if (ctx.anyEnemy) return ms.length ? ["p", ...ms] : null; const left = ms.filter(o => !(ctx.hit && (ctx.hit.picked || []).includes(o))); return left.length ? ms : ["p"]; }
  const F = FX_FORMS[kind], form = F && ctx.form && ctx.form.kind === kind ? ctx.form : null;
  if (F && F.opts && form){ const r = F.opts(st, s, form, ctx); if (r !== undefined) return r; }
  const t = form ? fxTgt(form) : KINDS[kind] && KINDS[kind].target;
  if (t === "szOpp") return P(st, O(s)).sz.map((z, i) => z ? i : -1).filter(i => i >= 0);
  if (t === "opp"){ const tt = TS === s ? [] : tauntIdx(st, TS); return (tt.length ? tt : P(st, TS).mz.map((m, i) => m ? i : -1).filter(i => i >= 0)).filter(i => TS === s || !fxHidden(st, TS, i)); }
  if (t === "any"){
    const src = ctx.mon && monAt(st, ctx.mon);
    if (kind === "moveEquips" && (!src || !eqsOf(src).some(e => e.u !== ctx.eqU))) return [];
    const out = [];
    for (const o of [s, O(s)]) P(st, o).mz.forEach((m, i) => { if (m && m !== src && (o === s || !fxHidden(st, o, i)) && (kind !== "matCopy" || (m.mats || []).length)) out.push(`${o}:${i}`); });
    return out;
  }
  if (t === "mine") return P(st, s).mz.map((m, i) => m ? i : -1).filter(i => i >= 0);
  if (t === "draft") return (ctx.draft || []).filter(id => S.cards.has(id));
  if (KINDS[kind] && KINDS[kind].mod && !ctx.modPick) return null;
  if (t === "hand") return P(st, s).hand.map((_, i) => i);
  if (t === "oppHand") return P(st, O(s)).hand.map((_, i) => i);
  if (t === "tagPick" && kind === "manaSummon"){ const p = P(st, s); if (!p.manaZ || freeZone(p.mz, p) < 0) return []; const tag = ctx.tagName || ""; return [...new Set(p.manaZ.map(x => x.c))].filter(id => cardType(card(id)) === "monster" && !isEx(card(id)) && (!tag || hasTag(id, tag))); }
  if (t === "tagPick" && kind === "fusion"){ const p = P(st, s); return [...new Set(p.ex || [])].filter(id => isFusion(card(id)) && fusionPlan(st, s, card(id))); }
  if (t === "tagPick"){
    const p = P(st, s), tag = ctx.tagName || "", fromEx = kind === "exSummon" || kind === "tagSummonEx", src = fromEx ? (p.ex || []) : /Hand$/.test(kind) && kind !== "tagGraveHand" ? p.hand : /Deck$|tagSearch/.test(kind) ? p.deck : p.grave;
    const summ = /^tagSummon/.test(kind) || kind === "exSummon";
    if (summ && freeZone(p.mz, p) < 0) return [];
    return [...new Set(src.filter(id => (kind === "exSummon" || hasTag(id, tag)) && (!summ || cardType(card(id)) === "monster") && !(fromEx && (isFusion(card(id)) || sxOf(card(id))))))];
  }
  if (t === "graveAny") return [...new Set(P(st, s).grave)].filter(id => S.cards.has(id));
  if (t === "deckType"){ const want = { searchMon: "monster", searchMagic: "magic", searchTrap: "trap" }[kind]; return [...new Set(P(st, s).deck.filter(id => cardType(card(id)) === want))]; }
  if (t === "oppGrave") return [...new Set(P(st, O(s)).grave)].filter(id => S.cards.has(id));
  if (t === "deckTop") return P(st, s).deck.slice(0, Math.max(1, ctx.scryN || 3)).map((_, i) => i);
  if (t === "grave"){
    if (kind === "reborn" && freeZone(P(st, s).mz, P(st, s)) < 0) return [];
    return [...new Set(P(st, s).grave.filter(id => cardType(card(id)) === "monster"))];
  }
  return null;
}
function autoTarget(st, s, kind, opts, fx){
  { const F = FX_FORMS[kind]; if (F && F.auto && fx){ const r = F.auto(st, s, opts, fx); if (r !== undefined) return r; } }
  // 場のカードを除去: 相手の一番強いモンスター → 相手の魔法・罠 → フィールド（自分のカードはなるべく選ばない）
  if (kind === "removeBoard"){ const v = o => { if (o === "field") return st.field && st.field.o !== s ? 250 : -500; const [os, k, i] = o.split(":"), X = P(st, os), sg = os === s ? -1 : 1; if (k === "mz"){ const m = X.mz[+i]; return sg * (100 + (m ? atkOf(m) : 0)); } return sg * 300; }; return opts.slice().sort((a, b) => v(b) - v(a))[0]; }
  { const val = id => { const c = card(id); return (cardType(c) === "monster" ? baseAtk(c) || 0 : 300) + (costOf(c) || 0) * 100; };
    if (kind === "searchMon" || kind === "searchMagic" || kind === "searchTrap" || kind === "banishGrave") return opts.slice().sort((a, b) => val(b) - val(a))[0];
    // ATKを元に戻す: 自分の下がっているモンスターか、相手の上がっているモンスター
    if (kind === "scry"){ const D = P(st, s).deck; return opts.slice().sort((a, b) => val(D[b]) - val(D[a]))[0]; } }
  // ピーピングハンデス: 相手の手札の一番強そうなカード（ATK・コストが高いもの）
  if (kind === "discardPeek"){ const H = P(st, O(s)).hand, v = j => { const c = card(H[j]); return (cardType(c) === "monster" ? baseAtk(c) || 0 : 300) + (costOf(c) || 0) * 100; }; return opts.slice().sort((a, b) => v(b) - v(a))[0]; }
  // 合成: 自分の一番強いモンスターに付ける
  if (kind === "synthTo"){ const own = opts.filter(o => String(o).split(":")[0] === s); const L = own.length ? own : opts; return L.slice().sort((a, b) => { const [sa, ia] = String(a).split(":"), [sb, ib] = String(b).split(":"); return cmpNum(atkOf(P(st, sb).mz[+ib]), atkOf(P(st, sa).mz[+ia])); })[0]; }
  if (kind === "giveAb" || kind === "loseAb") return opts.slice().sort((a, b) => { const A = String(a).split(":"), B = String(b).split(":"); return cmpNum(atkOf(P(st, B[0]).mz[+B[1]]), atkOf(P(st, A[0]).mz[+A[1]])); })[0];
  // ATKを○にする: 自分のモンスターなら一番上がるもの、相手のなら一番下がるもの
  if (fx && fx.side === "me"){ const own = P(st, s), v = o => o === "p" ? 1e9 : (m => m ? atkOf(m) : 0)(own.mz[typeof o === "string" ? +o.slice(2) : o]); return opts.slice().sort((a, b) => v(a) - v(b))[0]; }
  // CPU スパイア attack: finish the strongest monster it can destroy now, otherwise the one closest to dying
  if (opts.length && opts.every(o => typeof o === "string" && o.startsWith("m:"))){
    const op = P(st, O(s)), n = fx && kind !== "vuln" ? fx.n || 0 : 0, m = o => op.mz[+o.slice(2)], left = o => (atkOf(m(o)) - (m(o).dmg || 0)) / (m(o).vuln > 0 ? 1.5 : 1);
    if (kind === "vuln" || kind === "weak") return opts.slice().sort((x, y) => atkOf(m(y)) - atkOf(m(x)))[0];
    const kill = opts.filter(o => left(o) <= n).sort((x, y) => atkOf(m(y)) - atkOf(m(x)));
    return kill.length ? kill[0] : opts.slice().sort((x, y) => left(x) - left(y))[0];
  }
  if (opts[0] === "p"){ const ms = opts.slice(1).sort((x, y) => atkOf(P(st, O(s)).mz[+y.slice(2)]) - atkOf(P(st, O(s)).mz[+x.slice(2)])); return ms.length && P(st, O(s)).lp > 300 ? ms[0] : "p"; }
  const t = fx ? fxTgt(fx) : KINDS[kind].target;
  if (t === "opp") return opts.slice().sort((a, b) => atkOf(P(st, O(s)).mz[b]) - atkOf(P(st, O(s)).mz[a]))[0];
  if (t === "mine") return opts.slice().sort((a, b) => (kind === "destroyOwn" ? -1 : 1) * (atkOf(P(st, s).mz[b]) - atkOf(P(st, s).mz[a])))[0];
  if (t === "grave") return opts.slice().sort((a, b) => cmpNum(baseAtk(card(b)), baseAtk(card(a))))[0];
  // CPU: throws away the cheapest (basic ones first), brings back the most expensive
  if (t === "hand"){ const h = P(st, s).hand, v = i => (SPIRE_BASIC.some(b => b.id === h[i]) ? 0 : 10) + costOf(card(h[i])); return opts.slice().sort((a, b) => v(a) - v(b))[0]; }
  if (t === "graveAny") return opts.slice().sort((a, b) => costOf(card(b)) - costOf(card(a)))[0];
  if (t === "tagPick") return opts.slice().sort((a, b) => cmpNum(cardType(card(b)) === "monster" ? baseAtk(card(b)) : costOf(card(b)) * 100, cardType(card(a)) === "monster" ? baseAtk(card(a)) : costOf(card(a)) * 100))[0];
  if (t === "any") return opts.find(o => o.startsWith(s + ":")) || opts[0];
  if (t === "draft") return opts[0];
  if (t === "szOpp") return opts[Math.floor(Math.random() * opts.length)];
}
/* ---- equips stick to a monster: m.eqs = [{ c, o (owner), u }] from left to right ---- */
// born: the turn it came out — 召喚酔い: it can attack from its owner's next turn (unless it has 速攻)
/* ---- 「召喚」と「出す」 ----
   召喚: 手札からモンスターを使う（ふつうの召喚・踏み倒しでの使用もふくむ）→ そのモンスターの「召喚したとき」と、永続・レリックの「〜が召喚するたび」
   出す: 効果やルールで場に置く（特殊召喚・融合・シンクロ・効果で出す）→ そのモンスターの「出されたとき（特殊召喚）」と、永続・レリックの「〜の場に出されるたび」
   kind: "summon" | "put"。o = そのモンスターが出た場の持ち主（自分・相手・どちらかは、その永続を持っている人から見て） */
function enterFire(st, o, kind, then){
  const T = kind === "put" ? ["myPut", "oppPut", "anyPut"] : ["mySummon", "oppSummonT", "anySummonT"];
  persistFire(st, o, T[0], {}, st2 => persistFire(st2, o, T[2], {}, st3 => persistFire(st3, O(o), T[1], {}, st4 => persistFire(st4, O(o), T[2], {}, then))));
}
// 場にモンスターを出す（効果・特殊召喚）。出せたらゾーン番号、場がいっぱいなら -1
function putMon(st, o, id, opt = {}){
  const p = P(st, o), z = freeZone(p.mz, p); if (z < 0) return -1;
  p.mz[z] = mkMon(st, id); if (opt.copy) p.mz[z].cp = true; if (opt.mats && opt.mats.length) p.mz[z].mats = opt.mats;
  ev(st, { type: "summon", s: o, z });
  if (opt.log) log(st, opt.by || o, opt.log);
  trigger(st, o, card(id), "ssummon", { zone: z, mon: { s: o, i: z, u: p.mz[z].u } });
  enterFire(st, o, "put");
  return z;
}
function mkMon(st, id){ st.un = (st.un || 0) + 1; const m = { c: id, mod: 0, attacked: false, eqs: [], u: st.un, born: st.turnNo }; if (st.sbAtkPend && st.sbAtkPend.id === id){ m.mod += st.sbAtkPend.add; st.sbAtkPend = null; } return m; }
const sick = (st, s, i) => glGroup(st, s, i).every(j => sick1(st, s, j));
const sick1 = (st, s, i) => { const m = P(st, s).mz[i]; return !!m && (m.born === st.turnNo || (m.strigSick != null && st.turnNo <= m.strigSick)) && !m.evoDM && !hasAb(st, s, i, "haste"); };
const monAt = (st, ref) => { const m = ref && P(st, ref.s).mz[ref.i]; return m && m.u === ref.u ? m : null; };
function findEq(st, u){ for (const s of ["a", "b"]){ const mz = P(st, s).mz; for (let i = 0; i < mz.length; i++){ const k = eqsOf(mz[i]).findIndex(e => e.u === u); if (k >= 0) return { s, i, k, e: mz[i].eqs[k] }; } } return null; }
// all equips on monster (s,i) go to their owners' graveyards
function detachEquips(st, s, i){
  const m = P(st, s).mz[i]; if (!m) return;
  leaveEquips(st, m);
  m.eqs = [];
}
function unequip(){}
// abilities of monster (s,i): its own + the ones its equips give (a 化身 doubles numbers)
function monAbs(st, s, i){
  const m = P(st, s).mz[i]; if (!m || sealedM(m)) return [];
  const out = absOf(card(m.c)).map(a => ({ ...a, mult: 1 }));
  const es = eqsOf(m);
  es.forEach((e, k) => absOf(card(e.c)).forEach(a => { if (a.k !== "double") out.push({ ...a, mult: eqMult(es, k), eqU: e.u }); }));
  (m.gab || []).forEach(g => { if (ABS[g.k] && (!g.until || st.turnNo <= g.until)) out.push({ ...g, mult: 1, gab: true }); });
  out.push(...staticAbs(st, s, m));
  if (!monAbs.gl){ const GL = glGroup(st, s, i); if (GL.length > 1){ monAbs.gl = true; try{ GL.forEach(j => { if (j !== i) out.push(...monAbs(st, s, j).map(a => ({ ...a, glFrom: j }))); }); } finally{ monAbs.gl = false; } } }
  const lab = (m.lab || []).filter(x => !x.until || st.turnNo <= x.until);
  return lab.length ? out.filter(a => !lab.some(x => x.k === "all" || x.k === a.k)) : out;
}
function hasAb(st, s, i, ab){ return monAbs(st, s, i).some(a => a.k === ab); }
// ゴッドリンク: A（左）の右G と B（右）の左G がそろい、おたがいが相手をリンクできる相手と認めるとリンクする
function glAccept(x, y){ const w = normQ(String((glOf(x) || {}).w || "")).trim(); return !w || normQ(String(y.name || "")).includes(w) || tagsOf(y).some(t => normQ(String(t)).includes(w)); }
function glPair(x, y){ const gx = glOf(x), gy = glOf(y); return !!(gx && gy && gx.r && gy.l && glAccept(x, y) && glAccept(y, x)); }
function glLinked(st, s, a){ const p = P(st, s), A = p.mz[a], B = p.mz[a + 1]; return !!(A && B && !sealedM(A) && !sealedM(B) && glPair(monCard(A), monCard(B))); }
// リンクしているひとかたまり（ゾーン番号のならび）。リンクしていなければ [i]
function glGroup(st, s, i){
  const p = st && st.players && P(st, s); if (!p || !p.mz[i] || !glOf(monCard(p.mz[i]))) return [i];
  let lo = i, hi = i; while (lo > 0 && glLinked(st, s, lo - 1)) lo--; while (hi < p.mz.length - 1 && glLinked(st, s, hi)) hi++;
  const L = []; for (let j = lo; j <= hi; j++) L.push(j); return L;
}
// ゴッドを出すゾーン: リンクできるとなりがあればそこ、なければ左から空いているところ
function glZone(st, s, id){
  const p = P(st, s), c = card(id); let free = p.mz.map((m, z) => m ? -1 : z).filter(z => z >= 0);
  if (!free.length){ if (!p.nolim) return -1; p.mz.push(null); free = [p.mz.length - 1]; }
  if (!glOf(c)) return free[0];
  const nb = z => (z > 0 && p.mz[z - 1] && !sealedM(p.mz[z - 1]) && glPair(monCard(p.mz[z - 1]), c)) || (z < p.mz.length - 1 && p.mz[z + 1] && !sealedM(p.mz[z + 1]) && glPair(c, monCard(p.mz[z + 1])));
  const z = free.find(nb); return z == null ? free[0] : z;
}
// 盤面の「G・リンク」帯
function glBadge(st, s, i, h){ const L = glGroup(st, s, i); if (L.length < 2) return h; h = h.replace(/^<div class="card /, `<div data-glg="${s}:${L[0]}" data-glp="${i - L[0]}" class="card gl-on `); return h.replace(/<\/div>$/, `<span class="glx${L[0] < i ? " gl-l" : ""}${L[L.length - 1] > i ? " gl-r" : ""}" title="ゴッドリンク中（${L.length}体で1体のモンスター）">G・リンク</span></div>`); }
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
  if (st && s){ const why = useCondWhy(st, s, c); if (why) return why; }
  if (st && isField(c) && st.field && cannotLeave(st.field.c)) return "場から離れないフィールドがあるため置き換えられません";
  if (c && c.mland) return "土地はマナゾーンに置くカード（発動はできない）";
  if (c && c.noUse && (cardType(c) === "magic" || cardType(c) === "trap")) return "このカードは発動できません";
  { const w = whenOf(c); if (w && st && !whenWinOk(st, w, win !== undefined ? win : chainWindow(st))) return `このカードは「${WHEN_LABEL[w]}」にしか発動できません`; }
  if (st && s && (P(st, s).noUseUntil || 0) >= st.turnNo) return "いまは魔法・罠を発動できません（相手の効果）";
  if (st && s && isField(c) && massOf(c) && P(st, s).grave.length < massOf(c)) return `墓地が足りません（要求質量${massOf(c)}）`;
  return "";
}
const atkLocked = (st, s) => (P(st, s).noAtkUntil || 0) >= st.turnNo || stepSkipped(st, s, "battle");
function canAttack(st, s, i){
  const m = P(st, s).mz[i];
  return !!m && !sealedM(m) && !atkLocked(st, s) && !((m.noAtkTurn || 0) >= st.turnNo) && !m.attacked && st.turnNo > 1 && (!sick(st, s, i) || m.rushTurn === st.turnNo || hasAb(st, s, i, "rush")) && !hasAb(st, s, i, "noAttack") && !charmActive(st, m) && atkCondOk(st, s, i);
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
// 起動効果: 自分のターンに、場のモンスターのボタンから使える（回数は効果ブロックごと: 1ターンに○回／ゲーム中に○回／何回でも）
// 1ターンの回数はそのモンスターごと、ゲーム中の回数はプレイヤーとカードごとに数える
function actFree(st, s, m, c, bi, b){
  const L = actLim(b); if (L.per === "free") return true;
  if (L.per === "turn") return (m.actT && m.actT.no === st.turnNo ? m.actT.c[bi] || 0 : 0) < L.n;
  return ((P(st, s).actG || {})[c.id + ":" + bi] || 0) < L.n;
}
const actBlocks = (st, s, m) => { const c = monCard(m); return blocksOf(c).map((b, bi) => [b, bi]).filter(([b]) => b.trig === "act"); };
// 起動効果のマナコスト（マナのないふつうのデッキではタダ）
const xcOk = (m, b) => !(b && b.xc > 0) || (m && m.mats || []).length >= b.xc;
// LPのコスト: 払ったあとにLPが残る（LPがコストより多い）ときだけ払える
const actLpOk = (st, s, b) => !(b && b.lpc > 0) || P(st, s).lp > b.lpc;
const actManaOk = (st, s, b) => !(b && b.mcost > 0) || !P(st, s).mana || P(st, s).mana.cur >= b.mcost;
function actWhy(st, s, i, quick){
  const m = P(st, s).mz[i]; if (!m || !hasTrig(monCard(m), "act")) return "起動効果がない";
  if (!quick && st.turn !== s) return "自分のターンだけ使える";
  const c = card(m.c), L = actBlocks(st, s, m).filter(([b]) => !quick || b.aq); if (!L.length) return "相手のターンに使える起動効果がない";
  { const why = useCondWhy(st, s, c); if (why) return why; }
  if (!L.some(([b, bi]) => actFree(st, s, m, c, bi, b))) return L.every(([b]) => actLim(b).per === "game") ? "この試合ではもう使えない" : "このターンはもう使えない";
  if (!L.some(([b, bi]) => actFree(st, s, m, c, bi, b) && !ctrPayWhy(st, s, b.cost, { mon: { s, i, u: m.u } }))) return "コストのカウンターが足りない";
  if (!L.some(([b, bi]) => actFree(st, s, m, c, bi, b) && xcOk(m, b))) return "エクシーズ素材が足りない";
  if (!L.some(([b, bi]) => actFree(st, s, m, c, bi, b) && actManaOk(st, s, b))) return "マナが足りない";
  if (!L.some(([b, bi]) => actFree(st, s, m, c, bi, b) && actLpOk(st, s, b))) return "コストのLPが足りない";
  if (!quick && !canAct(st, s)) return "いまは使えない";
  return "";
}
// bi: どの起動効果を使うか（なければ使える最初の1つ）
function activateMon(st, s, i, bi, quick, then){
  if (actWhy(st, s, i, quick)) return false;
  const m = P(st, s).mz[i], c = monCard(m), p = P(st, s);
  const L = actBlocks(st, s, m).filter(([b]) => !quick || b.aq).filter(([b, k]) => actFree(st, s, m, c, k, b) && !ctrPayWhy(st, s, b.cost, { mon: { s, i, u: m.u } }) && actManaOk(st, s, b) && actLpOk(st, s, b) && xcOk(m, b) && (bi == null || k === +bi)).slice(0, 1);
  if (!L.length) return false;
  if (!m.actT || m.actT.no !== st.turnNo) m.actT = { no: st.turnNo, c: {} };
  L.forEach(([b, bi]) => { const per = actLim(b).per; if (per === "turn") m.actT.c[bi] = (m.actT.c[bi] || 0) + 1; if (per === "game"){ p.actG = p.actG || {}; p.actG[c.id + ":" + bi] = (p.actG[c.id + ":" + bi] || 0) + 1; } });
  log(st, s, `「${c.name}」の起動効果を発動！`); ev(st, { type: "spell", s, c: m.c });
  L.forEach(([b]) => { if (b.xc > 0){ const out = (m.mats || []).splice(0, b.xc); p.grave.push(...out); log(st, s, `「${c.name}」のエクシーズ素材${out.map(x => `「${card(x).name}」`).join("")}を取り除いた`); } });
  L.forEach(([b]) => { ctrPay(st, s, b.cost, `「${c.name}」`, { mon: { s, i, u: m.u } }); if (b.mcost > 0 && p.mana){ p.mana.cur -= b.mcost; log(st, s, `「${c.name}」のコストでマナを${b.mcost}払った（${p.mana.cur}/${p.mana.max}）`); } });
  let lpPaid = 0;
  L.forEach(([b]) => { if (b.lpc > 0){ p.lp -= b.lpc; lpPaid += b.lpc; ev(st, { type: "hit", s, d: b.lpc, blk: 0 }); log(st, s, `「${c.name}」のコストでLPを${fmtN(b.lpc)}払った`); } });
  const ctx = { zone: i, mon: { s, i, u: m.u }, hit: lpPaid ? { lpPaid } : {} };
  const step = (st2, k) => { if (k >= L.length){ checkEnd(st2); then && then(st2); return; } runBlock(st2, s, c, L[k][0], ctx, st3 => step(st3, k + 1)); };
  step(st, 0);
  return true;
}
// 残りの回数の説明（詳細・確認画面用）
function actLeftText(st, s, m){
  const c = card(m.c);
  return actBlocks(st, s, m).map(([b, bi]) => { const L = actLim(b); if (L.per === "free") return "何回でも使える"; const used = L.per === "turn" ? (m.actT && m.actT.no === st.turnNo ? m.actT.c[bi] || 0 : 0) : ((P(st, s).actG || {})[c.id + ":" + bi] || 0); return `${L.per === "turn" ? "このターン" : "この試合"}あと${Math.max(0, L.n - used)}回`; }).join("／");
}
function monTrigList(st, s, i, trig, m, extra = {}){
  m = m || P(st, s).mz[i]; if (!m || sealedM(m)) return [];
  const base = { zone: i, mon: { s, i, u: m.u }, ...extra };
  const L = [{ s, c: monCard(m), trig, ctx: base }];
  const es = eqsOf(m);
  es.forEach((e, k) => { const n = eqMult(es, k); for (let r = 0; r < n; r++) L.push({ s: e.o, c: card(e.c), trig, ctx: { ...base, zone: e.o === s ? i : null, eqU: e.u } }); });
  return L;
}
function runList(st, L, then){
  const step = (st2, k) => { if (k >= L.length){ then && then(st2); return; } const x = L[k];
    if (x.trig === "__cdKill"){ const p = P(st2, x.s), z = p.sz[x.ctx.pz]; if (z && z.u === x.ctx.u && !cannotLeave(z.c)){ p.sz[x.ctx.pz] = null; p.grave.push(z.c); log(st2, x.s, `「${card(z.c).name}」はカウントダウンが0になって破壊された`); ev(st2, { type: "destroy", s: x.s, z: x.ctx.pz, k: "sz" }); } step(st2, k + 1); return; }
    runCard(st2, x.s, x.c, x.trig, x.ctx, st3 => step(st3, k + 1)); };
  step(st, 0);
}
// turn start / end: every monster of `who`, and every equip `who` owns (wherever it's stuck)
// 付与された効果: そのプレイヤーのターンのはじめ／おわりに、そのプレイヤー自身の効果として出る（○回なら使うたび1へる）
function runBoons(st, who, trig, then){
  const due = (P(st, who).boons || []).filter(t => t.at === trig);
  const step = (st2, k) => {
    if (k >= due.length || st2.winner){ then && then(st2); return; }
    const t = due[k], p2 = P(st2, who), cur = (p2.boons || []).find(x => x.u === t.u); if (!cur) return step(st2, k + 1);
    if (cur.left > 0){ cur.left--; if (!cur.left) p2.boons = p2.boons.filter(x => x.u !== t.u); }
    const c = (t.c && hasCard(t.c) ? card(t.c) : null) || { id: t.c, name: t.name, type: "magic" };
    log(st2, who, `付与された「${t.name}」の効果！${t.dur ? (cur.left ? `（あと${cur.left}回）` : "（これで終わり）") : ""}`);
    runBlock(st2, who, c, t.b, { hit: {}, delayed: true, granted: true }, st3 => step(st3, k + 1));
  };
  step(st, 0);
}
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
function fireTurn(st, who, trig, then, timersDone, boonsDone){
  if (trig === "turnStart" && !timersDone && (P(st, who).timers || []).length) return runTimers(st, who, st2 => fireTurn(st2, who, trig, then, true));
  if (!boonsDone && (P(st, who).boons || []).some(t => t.at === trig)) return runBoons(st, who, trig, st2 => fireTurn(st2, who, trig, then, true, true));
  if (trig === "turnEnd") etherealEnd(st, who);
  altarTurn(st, who, trig);
  const CD = trig === "turnStart" ? cdTick(st, who) : [];
  const L = [];
  for (const o of ["a", "b"]) P(st, o).mz.forEach((m, i) => { if (m) monTrigList(st, o, i, trig).forEach(x => { if (x.s === who && hasTrig(x.c, trig)) L.push(x); }); });
  const PL = persistList(st, who, trig, {}); PL.forEach(x => log(st, who, `${x.c.relicView ? "レリック" : "永続"}「${x.c.name}」の効果！`));
  const fc = fieldCard(st), FL = fc && (trig === "turnStart" || trig === "turnEnd") && hasTrig(fc, trig) && (!fc.fieldMine || st.field.o === who) ? [{ s: who, c: fc, trig, ctx: { field: true } }] : [];
  FL.forEach(x => log(st, who, `フィールド「${x.c.name}」の効果！`));
  // 「相手のターンのはじめ／終わり」: ターンを迎えていない側のモンスター・装備・永続・レリック（ターンの持ち主の効果のあとに出る）
  const ot = trig === "turnStart" ? "oppTurnStart" : trig === "turnEnd" ? "oppTurnEnd" : null, op = who === "a" ? "b" : "a", OL = [];
  if (ot) for (const o of ["a", "b"]) P(st, o).mz.forEach((m, i) => { if (m) monTrigList(st, o, i, ot).forEach(x => { if (x.s === op && hasTrig(x.c, ot)) OL.push(x); }); });
  const OPL = ot ? persistList(st, op, ot, {}) : []; OPL.forEach(x => log(st, op, `${x.c.relicView ? "レリック" : "永続"}「${x.c.name}」の効果！`));
  runList(st, CD.concat(L, PL, FL, OL, OPL), trig === "turnStart" ? st2 => anySumAsk(st2, who, then) : then);
}
// face-up 永続 cards of player s whose effect fires on `trig`
function persistList(st, s, trig, ctx){
  const L = [];
  P(st, s).sz.forEach((z, i) => { if (!z || !z.face) return; const c = card(z.c); if ((isPersist(c) || z.fcp) && hasTrig(c, trig)) for (let r = 0; r < (z.fcp ? Math.max(1, z.stack || 1) : 1); r++) L.push({ s, c, trig, ctx: { ...ctx, pz: i } }); });
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
  if (!id || cardType(c) !== "equip" || mainSkipped(st, s)) return false;
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
  runList(st, L, st2 => onCardUsed(st2, s, c, null));
  return true;
}
// visual events, stored in the game state so both players see the same animations
function ev(st, e){ if (e.type === "summon" && e.s && e.z != null){ const m = P(st, e.s).mz[e.z]; if (m) e = { ...e, c: e.c || m.c }; sealRelease(st, e.s, e.z); mugNote(st, e.s, e.z); exLifeOn(st, e.s, e.z); } if (e.type === "summon" && e.c && aceOn(card(e.c), "use")) ev(st, { type: "ace", s: e.s, c: e.c }); if (e.type === "spell" && e.c) st.recent = [...(st.recent || []), { c: e.c, s: e.s }].slice(-5); st.evn = (st.evn || 0) + 1; (st.ev || (st.ev = [])).push({ ...e, n: st.evn }); if (st.ev.length > 30) st.ev.splice(0, st.ev.length - 30); if (["summon", "destroy", "equip", "spell", "bounce", "banish"].includes(e.type)) ctrAuraSync(st); }
// 相手の効果を受けない: m が s 以外のプレイヤーの場にいて「効果を受けない」を持つ
function fxImmune(st, s, m){
  if (!st || !m) return false;
  for (const o of ["a", "b"]){ if (o === s) continue; const i = P(st, o).mz.indexOf(m); if (i >= 0) return hasAb(st, o, i, "unaffected"); }
  return false;
}
const fxHidden = (st, o, i) => hiddenMon(st, o, i) || hasAb(st, o, i, "unaffected");
function immuneStop(st, s, c, fx, target, ctx){
  const w = wardMon(st, s, fx, target, ctx); if (!w || w[0] === s) return false;
  const m = P(st, w[0]).mz[w[1]]; if (!m || !fxImmune(st, s, m)) return false;
  log(st, s, `「${card(m.c).name}」は相手の効果を受けない！${c ? `（「${c.name}」の効果は消えた）` : ""}`); return true;
}
// 変身: 場を離れるとき、かわりに指定したカードになって同じ場所に残る（成功したら true）
function leaveMorph(st, s, i){
  const p = P(st, s), m = p.mz[i]; if (!m || !hasAb(st, s, i, "leaveMorph")) return false;
  const a = monAbs(st, s, i).find(x => x.k === "leaveMorph"); if (!a) return false;
  const id = a.name ? fxCardId({ kind: "oppSummon", into: a.name }, card(m.c)) : null;
  if (!id || id === m.c){ log(st, s, `「${card(m.c).name}」は変身しようとしたが、「${a.name || "？"}」というモンスターが見つからない`); return false; }
  const old = card(m.c).name; m.c = id; m.mod = 0; delete m.mul; delete m.tmp; m.dmg = 0; delete m.shieldGone; delete m.reborned; m.atkTotal = 0; m.age = 0;
  ev(st, { type: "summon", s, z: i }); log(st, s, `「${old}」は場を離れるかわりに「${card(id).name}」に変身した！`);
  return true;
}
// returns true if the monster actually left the field. opt.battle: destroyed by battle; opt.force: manual (no protection)
/* ---- 相手の場に移す（状態はそのまま: ATKの増減・装備・カウンター・付いた能力など）----
   移ったモンスターは召喚酔い（移ったターンは攻撃できない）。持ち主はおぼえておく（墓地は持ち主の墓地へ）
   相手の場がいっぱいなら移せない。orDestroy のとき（デメリット効果）はかわりに破壊する */
function giveMon(st, s, i, src, opt = {}){
  const me = P(st, s), op = P(st, O(s)), m = me.mz[i]; if (!m) return false;
  const nm2 = card(m.c).name, z = freeZone(op.mz, op);
  if (z < 0){
    if (opt.orDestroy){ log(st, s, `${src}：相手の場がいっぱいなので、「${nm2}」は移せずに破壊される`); destroyMonster(st, s, i, src); return true; }
    log(st, s, `${src}：相手の場がいっぱいで「${nm2}」を送れない`); return false;
  }
  me.mz[i] = null; op.mz[z] = m;
  if (m.owner === O(s)) delete m.owner; else m.owner = m.owner || s;
  delete m.retBy; m.born = st.turnNo;
  ev(st, { type: "summon", s: O(s), z }); log(st, s, `${src}で「${nm2}」を${op.name}の場に移した`);
  return true;
}
function destroyMonster(st, s, i, why, opt = {}){
  const p = P(st, s), m = p.mz[i]; if (!m || monCannotLeave(m)) return false;
  if (!opt.glOne){ const L = glGroup(st, s, i); if (L.length > 1){ const solo = j => { atkOf.gl = true; try{ return atkOf(p.mz[j]); } finally{ atkOf.gl = false; } }; const v = L.slice().sort((a, b) => cmpNum(solo(a), solo(b)))[0]; log(st, s, `ゴッドリンク：${L.map(j => `「${card(p.mz[j].c).name}」`).join("")}のうち「${card(p.mz[v].c).name}」だけが場を離れる`); return destroyMonster(st, s, v, why, { ...opt, glOne: true }); } }
  const name = card(m.c).name;
  // opt.rule: ダメージカウンターがATKに届いた → ルールによる破壊 (効果での破壊ではないので、耐性も身代わりも効かない)
  if (!opt.force && !opt.rule){
    if (!opt.battle && hasAb(st, s, i, "noEffect")){ log(st, s, `「${name}」は効果では破壊されない！`); return false; }
    const es = eqsOf(m);
    if (es.some(e => !cannotLeave(e.c) && absOf(card(e.c)).some(a => a.k === "substitute"))){
      let k = es.findIndex(e => !cannotLeave(e.c) && !absOf(card(e.c)).some(a => a.k === "substitute"));
      if (k < 0) k = es.findIndex(e => !cannotLeave(e.c) && absOf(card(e.c)).some(a => a.k === "substitute"));
      const [e] = es.splice(k, 1); P(st, e.o).grave.push(e.c);
      log(st, s, `「${name}」は「${card(e.c).name}」を身代わりにして破壊をまぬがれた！`);
      return false;
    }
  }
  if (!opt.force && !m.shieldGone && hasAb(st, s, i, "shield")){ m.shieldGone = true; if (opt.rule) m.dmg = 0; log(st, s, `「${name}」の聖なる盾が破壊を防いだ！（盾ははがれた）`); return false; }
  if (!opt.force && exLifeSave(st, s, i)){ if (opt.rule) m.dmg = 0; return false; }
  if (!opt.force && leaveMorph(st, s, i)) return false;
  const rb = !opt.force && !m.reborned && hasAb(st, s, i, "reborn");
  const es = eqsOf(m).slice();
  p.mz[i] = null; if (!m.cp && !psyBack(st, m.owner || s, m.c)) P(st, m.owner || s).grave.push(m.c); ev(st, { type: "destroy", s, z: i });
  log(st, s, `「${name}」が破壊された${why ? "（" + why + "）" : ""}`);
  leaveEquips(st, m);
  if (es.length) log(st, s, "付いていた装備を外した（場から離れない装備は場で待機）");
  if ((m.mats || []).length){ p.grave.push(...m.mats); log(st, s, `質量${m.mats.length}枚も墓地へ`); }
  if (sealedM(m)){ log(st, s, `封印${m.seals.length}枚も墓地へ`); sealsOut(st, m); }
  if ((m.evoU || []).length){ log(st, s, `下に重なっていた${m.evoU.map(x => `「${card(x.c).name}」`).join("")}も墓地へ`); evoUOut(st, m); }
  if (rb){ const k = p.grave.lastIndexOf(m.c); if (k >= 0) p.grave.splice(k, 1); const r = mkMon(st, m.c), b = baseAtk(card(m.c)); r.reborned = true; if (isFinite(b)) r.mod = -Math.ceil(b / 2); p.mz[i] = r; ev(st, { type: "summon", s, z: i }); log(st, s, `「${name}」が復活した！（ATK半分）`); }
  // スパイアデッキ: beating an opponent's monster → カード報酬 + maybe a ポーション
  // 選択の祭壇: beating an opponent's monster → カード報酬, 40% ポーション, 10% レリック
  if (!opt.force && hasAltar(P(st, O(s)))) offerReward(st, O(s), { pot: Math.random() < POTION_DROP ? randPotionKey() : null, rel: Math.random() < RELIC_DROP ? dropRelicId(st, O(s)) : null });
  runList(st, [...monTrigList(st, s, i, "destroyed", { ...m, eqs: es.filter(e => !cannotLeave(e.c)) }, { eqs: es.map(e => ({ c: e.c, o: e.o, u: e.u })), eqCount: es.length, mats: (m.mats || []).slice() }), ...ctrTrigs(st, s, i, m, "destroyed")], st2 => persistFire(st2, s, "monDestroyed", {}, st3 => persistFire(st3, O(s), "monDestroyed", {}, opt.then)));
  return true;
}
// ATKを変える（atk）: 対象のモンスターを集めて、op（+・−・○にする・○倍・元に戻す）をかける
function atkMons(st, s, c, target, ctx, fx){
  const me = P(st, s), T = P(st, fx.side === "me" ? s : O(s));
  if (fx.to === "this"){ const m = ctx.mon ? monAt(st, ctx.mon) : ctx.zone != null ? me.mz[ctx.zone] : null; return m && (ctx.mon || m.c === c.id) ? [m] : null; }
  if (fx.to === "all") return T.mz.filter(m => m && mfOk(st, s, fx, m));
  if (fx.to === "any"){ const [os, oi] = String(target).split(":"), X = P(st, os); return X && X.mz[+oi] ? [X.mz[+oi]] : []; }
  return T.mz[target] ? [T.mz[target]] : [];
}
function applyAtk(st, s, c, target, ctx, fx, n, src){
  const L = atkMons(st, s, c, target, ctx, fx), tmp = fx.dur === "turn";
  if (!L){ log(st, s, `${src}：場にいないのでATKは変わらない`); return; }
  L.forEach(m => {
    if (fx.op === "add" || fx.op === "sub"){ const d = fx.op === "sub" ? -n : n; if (tmp){ m.tmp = (m.tmp || 0) + d; m.tmpBy = st.turn; } else m.mod = (m.mod || 0) + d; }
    else if (fx.op === "set") setAtk(m, n);
    else if (fx.op === "mul") m.mul = (m.mul || 1) * Math.max(0, n || 1);
    else if (fx.op === "reset"){ m.mod = 0; m.tmp = 0; m.tmpBy = null; m.mul = 1; m.zero = false; m.fix = null; }
  });
  const how = fx.op === "add" ? `ATK+${fmtN(n)}` : fx.op === "sub" ? `ATK−${fmtN(n)}` : fx.op === "set" ? `ATKを${fmtN(n)}にした` : fx.op === "mul" ? `ATKが${n || 1}倍になった` : "ATKを元の数字に戻した";
  const who = fx.to === "all" ? `${fx.side === "me" ? "自分" : "相手"}のモンスター${L.length}体` : L[0] ? `「${card(L[0].c).name}」` : "";
  if (who) log(st, s, `${src}で${who}の${how}${tmp ? "（このターンだけ）" : ""}`);
}
FX_FORMS.atk.run = applyAtk;
// このモンスター・全体はえらばない
FX_FORMS.atk.opts = (st, s, f) => f.to === "this" || f.to === "all" ? null : undefined;
// CPUのえらび方: 元に戻すは自分の下がっている／相手の上がっているモンスター、○にするは一番得をするモンスター、
// 自分のモンスターのアップ・○倍は一番強いモンスター（ほかは KINDS の target どおり）
FX_FORMS.atk.auto = (st, s, opts, fx) => {
  if (fx.op === "reset") { const gain = o => { const [os, oi] = String(o).split(":"), m = P(st, os).mz[+oi]; const d = m.zero ? -(baseAtk(card(m.c)) || 0) : modOf(m); return os === s ? -d : d; }; return opts.slice().sort((a, b) => gain(b) - gain(a))[0]; }
  if (fx.op === "set") { const T = P(st, fx.side === "me" ? s : O(s)), sg = fx.side === "me" ? 1 : -1, v = o => { const m = T.mz[+o]; const a = m ? atkOf(m) : 0; return sg * ((+fx.n || 0) - (isFinite(a) ? a : 1e9)); }; return opts.slice().sort((a, b) => v(b) - v(a))[0]; }
  if (fx.side === "me" && (fx.op === "add" || fx.op === "mul")) { const own = P(st, s); return opts.slice().sort((a, b) => cmpNum(atkOf(own.mz[+b]), atkOf(own.mz[+a])))[0]; }
};
/* ---- 山札の上を見る（look） ---- */
function applyLook(st, s, c, target, ctx, f, n, src){
  const me = P(st, s), N = Math.max(1, ctx.scryN || f.n || 3), top = me.deck.splice(0, N), k = +target, keep = top[k];
  if (!top.length){ log(st, s, `${src}：山札がない`); return; }
  if (keep == null){ me.deck.unshift(...top); return; }
  const rest = top.filter((_, i) => i !== k);
  if (f.rest === "grave") me.grave.push(...rest); else me.deck.push(...rest);
  if (f.keep === "hand") me.hand.push(keep); else me.deck.unshift(keep);
  log(st, s, `${src}：山札の上を${top.length}枚見て、${f.keep === "hand" ? `「${card(keep).name}」を手札に加え` : "1枚を一番上に置き"}${rest.length ? `、${rest.length}枚を${f.rest === "grave" ? "墓地へ送った" : "一番下に置いた"}` : "た"}`);
}
FX_FORMS.look.run = applyLook;
FX_FORMS.look.auto = (st, s, opts) => { const D = P(st, s).deck, val = id => { const x = card(id); return (cardType(x) === "monster" ? baseAtk(x) || 0 : 300) + (costOf(x) || 0) * 100; }; return opts.slice().sort((a, b) => val(D[b]) - val(D[a]))[0]; };
/* ---- 相手がえらぶ ----
   chooser（ふつうは効果を使った人の相手）が、えらべるもの（labels）から1つえらぶ。cb(st, えらんだ番号)
   この画面の人がえらぶ: ボタン / オンラインで相手の画面: st.askQ で答えを待つ / CPU: auto(なければ先頭) */
function askPick(st, s, chooser, c, title, labels, auto, cb){
  if (!labels.length){ cb(st, -1); return; }
  if (isHumanHere(chooser)){ G.chooseQ.push({ ask: true, s, to: chooser !== s ? chooser : null, c, ctx: {}, then: null, fx: { kind: "__block", ask: title }, pick1: labels.map(l => ({ name: l.name, text: l.text || "" })), p1go: (st2, k) => cb(st2, k) }); return; }
  if (G && G.mode === "online" && !G.spectate && chooser !== G.slot && s === G.slot){
    st.un = (st.un || 0) + 1; st.askQ = { n: st.un, by: s, to: chooser, text: title, name: c.name, ans: null, opts: labels.map(l => ({ name: l.name, text: l.text || "" })) };
    G.askWait = { n: st.un, s, name: c.name, text: title, pick: true, resume: (st2, k) => cb(st2, k) };
    log(st, s, `「${c.name}」：相手がえらんでいます`); return;
  }
  cb(st, Math.max(0, Math.min(labels.length - 1, auto)));
}
// 場のカードの名前（えらぶ人から見えないセットは名前を出さない）
function boardOptLabel(st, o, viewer){
  if (o === "field") return { name: card(st.field.c).name, text: "フィールド魔法" };
  const [os, zk, oi] = String(o).split(":"), X = P(st, os), who = os === viewer ? "自分" : "相手";
  if (zk === "mz"){ const m = X.mz[+oi]; return { name: card(m.c).name, text: `${who}のモンスター（ATK ${fmtN(atkOf(m))}）` }; }
  if (zk === "eq"){ const e = X.standingEq[+oi]; return { name: card(e.c).name, text: `${who}の待機中の装備` }; }
  if (zk === "mana"){ const x = X.manaZ[+oi]; return { name: card(x.c).name, text: `${who}のマナゾーン` }; }
  const z = X.sz[+oi], vis = z.face || os === viewer;
  return { name: vis ? card(z.c).name : "セットされたカード", text: `${who}の${z.face ? "魔法・罠" : "セット中"}（左から${+oi + 1}番目）` };
}
// 「相手がえらんで」の除去: 1枚ずつ相手がえらび、そのたびにどかす（n 枚まで）
function oppPickRun(st, s, c, ctx, then, fx, left){
  if (left <= 0 || st.winner){ then && then(st); return; }
  ctx = { ...ctx, form: fx };
  const one = { ...fx, to: "one" }, opts = fxTargets(st, s, fx, ctx) || [], chooser = O(s);
  if (!opts.length){ log(st, s, `「${c.name}」：どかすカードがない`); then && then(st); return; }
  const verb = { destroy: "破壊する", hand: "手札に戻す", exile: "除外する", deck: "山札に戻す", grave: "墓地へ送る" }[fx.how] || "どかす";
  // CPUがえらぶとき: 自分のカードなら一番どうでもいいもの（弱いモンスター → マナ → 魔法・罠 → フィールド）、相手のカードなら一番強いもの
  const val = o => { if (o === "field") return 400; const [os, k, i] = String(o).split(":"), m = k === "mz" ? P(st, os).mz[+i] : null; return (os === chooser ? 1 : -1) * (k === "mz" ? 100 + (m ? atkOf(m) : 0) : k === "mana" ? 250 : 300); };
  const best = opts.slice().sort((a, b) => val(a) - val(b))[0], auto = Math.max(0, opts.indexOf(best));
  askPick(st, s, chooser, c, `「${c.name}」：${verb}カードをえらんでください（あと${left}枚）`, opts.map(o => boardOptLabel(st, o, chooser)), auto, (st2, k) => {
    const o = (fxTargets(st2, s, fx, ctx) || [])[k];
    if (o == null){ then && then(st2); return; }
    applyEffect(st2, s, c, o, ctx, one);
    oppPickRun(st2, s, c, ctx, then, fx, left - 1);
  });
}
/* ---- 場から除去する（remove） ---- */
// えらべる対象: このカード・全部・このカード以外・攻撃してきたモンスター・フィールドはえらばない
FX_FORMS.remove.opts = (st, s, f, ctx) => {
  if (f.to === "this" || f.to === "all" || f.to === "others" || f.to === "attacker" || f.zone === "field") return null;
  if (fxTgt(f) === "opp" && f.to !== "oppPick") return undefined; // 前と同じ（相手のモンスター → 挑発・裏向きを見る / 自分のモンスター）
  const sides = f.side === "me" ? [s] : f.side === "both" ? [s, O(s)] : [O(s)], out = [];
  sides.forEach(o => { const X = P(st, o);
    if (f.zone === "mon" || rmBoard(f.zone)) X.mz.forEach((m, i) => { if (m && (o === s || !fxHidden(st, o, i))) out.push(`${o}:mz:${i}`); });
    if (f.zone === "st" || rmBoard(f.zone)) X.sz.forEach((z, i) => { if (z && !(o === s && ctx.pz === i)) out.push(`${o}:sz:${i}`); });
    if (rmBoard(f.zone)) (X.standingEq || []).forEach((e, i) => out.push(`${o}:eq:${i}`));
    if (rmMana(f.zone)) (X.manaZ || []).forEach((x, i) => { if (x) out.push(`${o}:mana:${i}`); }); });
  if (rmBoard(f.zone) && st.field && sides.includes(st.field.o) && !ctx.field) out.push("field");
  return out;
};
// CPUのえらび方: 場のカードは、相手の一番強いモンスター → 相手の魔法・罠 → フィールド（自分のカードはなるべく選ばない）。
// 魔法・罠だけのときはランダム、自分のモンスターは一番弱いもの（ほかは「opp」どおり相手の一番強いもの）
FX_FORMS.remove.auto = (st, s, opts, f) => {
  if (fxTgt(f) === "board"){
    if (f.zone === "st") return opts[Math.floor(Math.random() * opts.length)];
    const v = o => { if (o === "field") return st.field && st.field.o !== s ? 250 : -500; const [os, k, i] = o.split(":"), X = P(st, os), sg = os === s ? -1 : 1; if (k === "mz"){ const m = X.mz[+i]; return sg * (100 + (m ? atkOf(m) : 0)); } return sg * 300; };
    return opts.slice().sort((a, b) => v(b) - v(a))[0];
  }
  if (f.side === "me"){ const own = P(st, s); return opts.slice().sort((a, b) => cmpNum(atkOf(own.mz[+a]), atkOf(own.mz[+b])))[0]; }
};
// どかすもの = { k: "mz" | "sz" | "eq" | "field", o: 場の持ち主, i: 場所, u: モンスターの印 }
function removeThings(st, s, c, target, ctx, f){
  const me = P(st, s), TS = f.side === "me" ? s : O(s), out = [];
  const mz = (o, i) => { const m = P(st, o).mz[i]; if (m) out.push({ k: "mz", o, i, u: m.u }); };
  if (f.to === "this"){ const m = ctx.mon ? monAt(st, ctx.mon) : null; if (m) mz(ctx.mon.s, ctx.mon.i); else if (ctx.pz != null && me.sz[ctx.pz]) out.push({ k: "sz", o: s, i: ctx.pz }); return out; }
  if (f.to === "attacker"){ const a = ctx.attack; if (a && P(st, a.by).mz[a.from]) mz(a.by, a.from); return out; }
  if (f.zone === "field"){ if (st.field) out.push({ k: "field" }); return out; }
  if (f.to === "others"){
    const selfMon = ctx.mon ? monAt(st, ctx.mon) : null, host = ctx.eqU ? (findEq(st, ctx.eqU) || {}) : {}, hostM = host.s ? P(st, host.s).mz[host.i] : null;
    for (const o of [s, O(s)]){ const X = P(st, o);
      (X.standingEq || []).forEach((e, i) => out.push({ k: "eq", o, i }));
      X.sz.forEach((z, i) => { if (z && !(o === s && ctx.pz === i)) out.push({ k: "sz", o, i }); });
      X.mz.forEach((m, i) => { if (m && m !== selfMon && m !== hostM && !fxImmune(st, s, m)) mz(o, i); }); }
    if (st.field && !ctx.field) out.push({ k: "field" });
    return out;
  }
  if (f.to === "all"){
    const sides = f.side === "both" ? [s, O(s)] : [TS];
    for (const o of sides){ const X = P(st, o);
      if (f.zone === "mon" || rmBoard(f.zone)) X.mz.forEach((m, i) => { if (m && mfOk(st, s, f, m)) mz(o, i); });
      if (f.zone === "st" || rmBoard(f.zone)) X.sz.forEach((z, i) => { if (z && !(o === s && ctx.pz === i)) out.push({ k: "sz", o, i }); });
      if (rmBoard(f.zone)) (X.standingEq || []).forEach((e, i) => out.push({ k: "eq", o, i }));
      if (rmMana(f.zone)) (X.manaZ || []).forEach((x, i) => { if (x) out.push({ k: "mana", o, i }); }); }
    if (rmBoard(f.zone) && st.field && sides.includes(st.field.o) && !ctx.field) out.push({ k: "field" });
    return out;
  }
  if (target == null) return out;
  if (typeof target === "number"){ mz(TS, target); return out; }
  const t = String(target); if (t === "field"){ if (st.field) out.push({ k: "field" }); return out; }
  const mm = t.match(/^([ab]):(mz|sz|eq|mana):(\d+)$/); if (!mm) return out;
  if (mm[2] === "mz") mz(mm[1], +mm[3]); else out.push({ k: mm[2], o: mm[1], i: +mm[3] });
  return out;
}
// 魔法・罠・待機中の装備・フィールドを、どかし方どおりの場所へ（コピーは質量だけ墓地へ）
function removeCardTo(st, owner, id, how, pos, mats, copy){
  const w = P(st, owner); w.grave.push(...(mats || [])); if (copy) return;
  if (how === "hand") w.hand.push(id); else if (how === "exile") (w.exile = w.exile || []).push(id); else if (how === "deck") deckPut(w, id, pos); else if (how === "shield" && w.shieldOn && w.shields) w.shields.push(id); else w.grave.push(id);
}
function applyRemove(st, s, c, target, ctx, f, n, src){
  const L = removeThings(st, s, c, target, ctx, f), verb = { destroy: "破壊した", hand: "持ち主の手札に戻した", exile: "除外した", deck: "持ち主の山札に戻した", grave: "墓地へ送った", shield: "持ち主のシールドに置いた（シールドデッキでなければ墓地へ）" }[f.how];
  if (!L.length){ log(st, s, `${src}：${f.to === "attacker" ? "攻撃してきたモンスターがいない" : f.zone === "field" ? "場を離れられるフィールド魔法がない" : "どかすカードがない"}`); return; }
  if (f.to === "attacker" && L[0].o !== s && fxImmune(st, s, P(st, L[0].o).mz[L[0].i])){ log(st, s, `「${card(P(st, L[0].o).mz[L[0].i].c).name}」は相手の効果を受けない！`); return; }
  if (f.to === "others") log(st, s, `${src}で、このカード以外の場のカードをすべて${verb}！`);
  else if (f.to === "all") log(st, s, `${src}で${f.side === "me" ? "自分" : f.side === "both" ? "お互い" : "相手"}の${RM_ZONE[f.zone]}をすべて${verb}`);
  for (const x of L){
    if (x.k === "mz"){
      const X = P(st, x.o), m = X.mz[x.i]; if (!m || m.u !== x.u) continue; const nm = card(m.c).name;
      if (f.how === "destroy") destroyMonster(st, x.o, x.i, src);
      else if (f.how === "grave"){ if (!exLifeSave(st, x.o, x.i) && sendToGrave(st, x.o, x.i) !== false && f.to !== "all" && f.to !== "others") log(st, s, `${src}で「${nm}」を${verb}`); }
      else { const out = moveMonOut(st, x.o, x.i, f.how === "exile" ? "exile" : f.how === "deck" ? "deck" : f.how === "shield" ? "shield" : "hand", { pos: f.pos }); if (out && f.to !== "all" && f.to !== "others") log(st, s, `${src}で「${nm}」を${verb}`); }
      continue;
    }
    if (x.k === "field"){ const fl = st.field; if (!fl || cannotLeave(fl.c)) continue; st.field = null; removeCardTo(st, fl.o, fl.c, f.how, f.pos, fl.mats); if (f.to !== "others") log(st, s, `${src}でフィールド魔法「${card(fl.c).name}」を${verb}`); else log(st, s, `フィールド「${card(fl.c).name}」も${verb}`); continue; }
    // マナゾーン: カードを持ち主の墓地・手札などへ（タップしていないマナなら、使えるマナも1減る）
    if (x.k === "mana"){ const X = P(st, x.o), mz0 = (X.manaZ || [])[x.i]; if (!mz0) continue; X.manaZ[x.i] = null; if (!mz0.tap && X.mana) X.mana.cur = Math.max(0, X.mana.cur - 1); removeCardTo(st, x.o, mz0.c, f.how === "destroy" ? "grave" : f.how, f.pos); if (f.to !== "all" && f.to !== "others") log(st, s, `${src}でマナゾーンの「${card(mz0.c).name}」を${f.how === "destroy" ? "墓地へ送った" : verb}`); continue; }
    if (x.k === "eq"){ const X = P(st, x.o), e = (X.standingEq || [])[x.i]; if (!e || cannotLeave(e.c)) continue; X.standingEq[x.i] = null; removeCardTo(st, e.o, e.c, f.how, f.pos); if (f.to !== "all" && f.to !== "others") log(st, s, `${src}で待機中の「${card(e.c).name}」を${verb}`); continue; }
    const X = P(st, x.o), z = X.sz[x.i]; if (!z || cannotLeave(z.c)) continue; X.sz[x.i] = null;
    removeCardTo(st, x.o, z.c, f.how, f.pos, z.fcp || z.cp ? z.mats : [], z.fcp || z.cp); ev(st, { type: "destroy", s: x.o, z: x.i, k: "sz" });
    if (f.to !== "all" && f.to !== "others") log(st, s, `${src}で${z.face ? `「${card(z.c).name}」` : `セットされていたカード（「${card(z.c).name}」）`}を${verb}`);
  }
  for (const o of ["a", "b"]){ const X = P(st, o); if (X.standingEq) X.standingEq = X.standingEq.filter(Boolean); if (X.manaZ && X.manaZ.some(x => !x)){ X.manaZ = X.manaZ.filter(Boolean); manaSync(X); } }
}
FX_FORMS.remove.run = applyRemove;
/* ---- 手札をどかす（handOut） ---- */
// CPU: 相手の手札を見てえらぶときは一番強そうなカード（ATK・コストが高いもの）。自分の手札は KINDS の hand どおり安いもの
FX_FORMS.handOut.auto = (st, s, opts, f) => {
  // 自分の手札: 安いもの（基本カードを先に）から
  if (f.to === "one" && f.side === "me"){ const h = P(st, s).hand, v = i => (SPIRE_BASIC.some(b => b.id === h[i]) ? 0 : 10) + costOf(card(h[i])); return opts.slice().sort((a, b) => v(a) - v(b))[0]; }
  if (f.to === "one" && f.side !== "me"){ const H = P(st, O(s)).hand, v = j => { const c = card(H[j]); return (cardType(c) === "monster" ? baseAtk(c) || 0 : 300) + (costOf(c) || 0) * 100; }; return opts.slice().sort((a, b) => v(b) - v(a))[0]; }
};
function applyHandOut(st, s, c, target, ctx, f, n, src){
  const o = f.side === "me" ? s : O(s), p = P(st, o), who = o === s ? "" : `${p.name}の`;
  let idx;
  if (f.to === "one") idx = p.hand[target] != null ? [target] : [];
  else { let all = p.hand.map((_, k) => k); if (f.only === "nonAtk") all = all.filter(k => !isAttackCard(card(p.hand[k]))); idx = f.to === "all" ? all : shuffle(all).slice(0, n || 1); }
  const gone = idx.sort((a, b) => b - a).map(k => p.hand.splice(k, 1)[0]).reverse();
  if (!gone.length){ log(st, s, `${src}：${f.how === "exhaust" ? "廃棄する" : f.how === "deck" ? "山札に戻す" : "捨てる"}${f.only === "nonAtk" ? "アタック以外の" : ""}手札がない`); if (f.how === "exhaust" && f.to !== "one") ctx.exN = 0; return; }
  if (f.how === "exhaust"){ gone.forEach(id => exileCard(st, o, id, src)); if (f.to !== "one") ctx.exN = gone.length; return; }
  if (f.how === "deck"){ gone.forEach(id => deckPut(p, id, f.pos)); log(st, s, `${src}で${who}手札の${gone.length}枚を山札に${f.pos === "top" ? "一番上に置いた" : f.pos === "bottom" ? "一番下に置いた" : "戻してシャッフルした"}`); return; }
  p.grave.push(...gone);
  // 捨てた枚数は「直前の効果で捨てた手札1枚につき」で使う（この効果の中で足していく）
  if (o === s){ const h = ctx.hit || ctx; h.discN = (h.discN || 0) + gone.length; ctx.discN = h.discN; log(st, s, `${src}：手札の${gone.map(id => `「${card(id).name}」`).join("")}を捨てた`); }
  else log(st, s, f.to === "one" ? `${src}で${p.name}の手札を見て、「${card(gone[0]).name}」を捨てさせた` : `${src}で${p.name}の手札を${gone.length}枚捨てさせた`);
  slyFire(st, o, gone);
}
FX_FORMS.handOut.run = applyHandOut;
/* ---- カードを生む（gen） ---- */
// 生むカード（n 枚ぶん）。見つからなければ空
function genIds(st, s, c, target, f, n){
  const me = P(st, s);
  if (f.what === "named"){ const id = fxCardId(f, c); return id ? Array(n).fill(id) : []; }
  if (f.what === "self") return c && hasCard(c.id) ? Array(n).fill(c.id) : [];
  if (f.what === "lastAtk") return me.lastAtk && hasCard(me.lastAtk) ? Array(n).fill(me.lastAtk) : [];
  if (f.what === "pick"){ const id = me.hand[target]; return id != null ? Array(n).fill(id) : []; }
  // タグのついたランダムなカード（全カードから。トークン・スキン・テスト用は除く。場に出すときは装備を除く）
  if (f.what === "tag"){
    const pool = [...S.cards.values()].filter(x => x && !x.skinOf && !x.token && !x.tut && hasTag(x.id, f.into) && (!f.tk || cardType(x) === f.tk) && (f.dest !== "field" || cardType(x) !== "equip"));
    return pool.length ? Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)].id) : [];
  }
  const pool = draftPool(me.spc).filter(x => spireKind(x) === f.sk); if (!pool.length) return [];
  return Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)].id);
}
function applyGen(st, s, c, target, ctx, f, n, src){
  n = Math.max(1, Math.round(n || 1));
  const sides = f.who === "both" ? [s, O(s)] : f.who === "op" ? [O(s)] : [s];
  for (const o of sides){
    const ids = genIds(st, s, c, target, f, n), p = P(st, o), whose = o === s ? "自分" : p.name;
    if (!ids.length){ log(st, s, `${src}：${f.what === "named" ? `「${f.into || "？"}」というカードが見つからない` : f.what === "lastAtk" ? "コピーするアタックがない" : f.what === "random" ? `加えられる${SPIRE_LABEL[f.sk] || "カード"}がない` : f.what === "tag" ? `タグ「${f.into || "？"}」の${GEN_TK[f.tk] || "カード"}がない` : "生むカードがない"}`); return; }
    const nm = [...new Set(ids)].map(id => `「${card(id).name}」`).join("");
    if (f.dest === "hand"){
      if (f.when === "next"){ (p.nextGive = p.nextGive || []).push({ id: ids[0], n: ids.length }); log(st, s, `${src}：次の${o === s ? "自分" : p.name}のターンのはじめに${nm}を${ids.length}枚手札に加える`); continue; }
      ids.forEach(id => { p.hand.push(id); if (f.free) (p.freeIds = p.freeIds || []).push(id); });
      log(st, s, `${src}で${nm}を${ids.length}枚${whose}の手札に加えた${f.free ? "（このターンはコスト0）" : ""}`); continue;
    }
    if (f.dest === "grave"){ p.grave.push(...ids); log(st, s, `${src}で${nm}を${ids.length}枚${whose}の墓地に加えた`); continue; }
    if (f.dest === "deck"){ ids.forEach(id => deckPut(p, id, f.pos)); log(st, s, `${src}で${nm}を${ids.length}枚${whose}の山札に${f.pos === "top" ? "置いた（一番上）" : f.pos === "bottom" ? "置いた（一番下）" : "混ぜた"}`); continue; }
    // 場: モンスターは出す（特殊召喚）、魔法・罠は伏せてセット。場がいっぱいなら出せた分だけ
    let k = 0;
    for (const id of ids){
      const t = cardType(card(id));
      if (t === "monster"){ if (putMon(st, o, id) < 0) break; k++; }
      else if (t === "magic" || t === "trap"){ const z = freeZone(p.sz, p); if (z < 0) break; st.un = (st.un || 0) + 1; p.sz[z] = { c: id, turn: st.turnNo, face: false, u: st.un }; k++; }
      else { log(st, s, `${src}：装備は場に出せない`); break; }
    }
    log(st, s, k ? `${src}で${nm}を${k}枚${whose}の場に出した` : `${src}：${whose}の場がいっぱいで出せない`);
  }
}
FX_FORMS.gen.run = applyGen;
FX_FORMS.gen.opts = (st, s, f) => f.what === "pick" ? undefined : null;

/* ---- カードを持ってくる・出す（fetch） ---- */
const feSrc = (p, from) => from === "mana" ? (p.manaZ || []).map(x => x.c) : from === "ex" ? (p.ex || []) : p[from] || [];
// 持ってこられるカード（同じカードは1つ）
function fetchCands(st, s, c, f, ctx = {}){
  const p = P(st, s);
  if (f.what === "self"){ const id = ctx.inHand || (c && c.id); return id && p.hand.includes(id) && cardType(card(id)) === "monster" && freeZone(p.mz, p) >= 0 ? [id] : []; }
  if (f.dest === "field" && freeZone(p.mz, p) < 0) return [];
  return [...new Set(feSrc(p, f.from))].filter(id => { const x = card(id), t = cardType(x);
    if (f.what === "mon" && t !== "monster") return false; if (f.what === "magic" && t !== "magic") return false; if (f.what === "trap" && t !== "trap") return false;
    if (f.what === "atk" && !isAttackCard(x)) return false; if (f.what === "tag" && !hasTag(id, f.into || ctx.tagName || "")) return false;
    if (f.dest === "field"){ if (t !== "monster") return false; if (f.from === "ex" && (isFusion(x) || sxOf(x))) return false; if (f.from === "mana" && (x.ex || sxOf(x))) return false; }
    return hasCard(id); });
}
// 1枚とる（山札はそのあとシャッフル。墓地は一番上の同じカード。マナはタップしているものから〔していなければマナを1減らす〕）
function fetchTake(st, s, f, id){
  const p = P(st, s);
  if (f.from === "mana"){ const Z = p.manaZ || []; let j = Z.findIndex(x => x.c === id && x.tap); if (j < 0) j = Z.findIndex(x => x.c === id); if (j < 0) return false; const x = Z.splice(j, 1)[0]; if (!x.tap && p.mana) p.mana.cur = Math.max(0, p.mana.cur - 1); manaSync(p); return true; }
  const L = f.from === "ex" ? (p.ex = p.ex || []) : p[f.from], k = f.from === "grave" ? L.lastIndexOf(id) : L.indexOf(id); if (k < 0) return false;
  L.splice(k, 1); if (f.from === "deck") shuffle(p.deck); return true;
}
function applyFetch(st, s, c, target, ctx, f, n, src){
  const p = P(st, s), where = FE_FROM[f.from];
  const picks = f.what === "self" ? fetchCands(st, s, c, f, ctx).slice(0, 1) : f.pick === "one" ? (target != null ? [target] : []) : null;
  let k = 0;
  const one = id => {
    if (f.dest === "field" && freeZone(p.mz, p) < 0) return false;
    if (!fetchTake(st, s, f, id)) return false;
    if (f.dest === "hand"){ p.hand.push(id); log(st, s, `${src}で${where}から「${card(id).name}」を手札に加えた${f.from === "deck" ? "（山札はシャッフル）" : ""}`); }
    else putMon(st, s, id, { log: `${src}で${where}から「${card(id).name}」を場に出した（特殊召喚）`, by: s });
    k++; return true;
  };
  if (picks) picks.forEach(one);
  else for (let r = 0; r < Math.max(1, n || 1); r++){ const L = fetchCands(st, s, c, f, ctx); if (!L.length) break; one(L[Math.floor(Math.random() * L.length)]); }
  if (!k) log(st, s, `${src}：${where}から${f.dest === "field" ? "出せる" : "持ってこられる"}カードがない`);
}
FX_FORMS.fetch.run = applyFetch;
FX_FORMS.fetch.opts = (st, s, f, ctx) => f.pick === "one" && f.what !== "self" ? fetchCands(st, s, null, f, ctx) : null;
// CPU: 強そうなカード（モンスターは ATK、ほかは 300）＋コスト
FX_FORMS.fetch.auto = (st, s, opts) => { const v = id => { const x = card(id); return (cardType(x) === "monster" ? baseAtk(x) || 0 : 300) + (costOf(x) || 0) * 100; }; return opts.slice().sort((a, b) => cmpNum(v(b), v(a)))[0]; };
/* ---- 状態を付ける（status: 筋力・敏捷・霊体。弱体・脱力・魅了は前からある効果で動く） ---- */
function applyStatus(st, s, c, target, ctx, f, n, src){
  const o = f.side === "me" ? s : O(s), p = P(st, o), d = f.op === "sub" ? -n : n, nm = ST_NAME[f.st], who = o === s ? "自分" : p.name;
  if (f.to === "p" || f.to === "all" || f.st !== "str"){
    if (f.st === "intang"){ p.intang = (p.intang || 0) + n; log(st, s, `${src}で${who}が霊体${n}を得た（霊体 ${p.intang}：受けるダメージが1になる）`); return; }
    const k = f.st, kt = k + "Temp"; p[k] = (p[k] || 0) + d; if (f.dur === "turn") p[kt] = (p[kt] || 0) + d;
    log(st, s, `${src}で${who}の${nm}が${d >= 0 ? "+" : "−"}${Math.abs(d)}（${nm} ${p[k]}${f.dur === "turn" ? `・${o === s ? "このターン" : `${p.name}のターンの終わりまで`}` : ""}）`);
    if (f.to === "p") return;
  }
  // モンスターの筋力（そのぶん ATK が上がる・下がる）
  const me = P(st, s), L = f.to === "this" ? [ctx.mon ? monAt(st, ctx.mon) : ctx.zone != null ? me.mz[ctx.zone] : null] : f.to === "mons" || f.to === "all" ? p.mz.filter(m => m && mfOk(st, s, f, m)) : [p.mz[target]];
  let k = 0;
  L.forEach(m => { if (!m) return; if (f.dur === "turn"){ m.strT = (m.strT || 0) + d; m.strTBy = st.turn; } else m.str = (m.str || 0) + d; k++; });
  if (k) log(st, s, `${src}で${f.to === "this" || L.length === 1 ? `「${card(L[0].c).name}」` : `${who}のモンスター${k}体`}の筋力が${d >= 0 ? "+" : "−"}${Math.abs(d)}（ATK${d >= 0 ? "+" : "−"}${Math.abs(d)}${f.dur === "turn" ? "・このターンだけ" : ""}）`);
  else log(st, s, `${src}：筋力を付けるモンスターがいない`);
}
FX_FORMS.status.run = applyStatus;
FX_FORMS.status.opts = (st, s, f) => f.st === "str" && ["one", "two", "n", "random"].includes(f.to) ? undefined : null;

/* ---- 状態を消す（cleanse） ---- */
function cleanseOne(x, f, n, isMon){
  const red = (k, v) => { if (!(x[k] > 0)) return; x[k] = f.how === "reduce" ? Math.max(0, x[k] - v) : 0; };
  const toward0 = (k, kt) => { if (!x[k]) return; if (f.how === "reduce"){ const v = Math.min(Math.abs(x[k]), n); x[k] += x[k] > 0 ? -v : v; } else x[k] = 0; if (kt && x[kt]) x[kt] = 0; };
  if (f.what === "debuff"){ red("vuln"); red("weak"); if (isMon) delete x.charm;
    if (isMon){ if (x.str < 0) x.str = 0; if (x.strT < 0) x.strT = 0; } else { if (x.str < 0){ x.str = 0; if (x.strTemp < 0) x.strTemp = 0; } if (x.dex < 0){ x.dex = 0; if (x.dexTemp < 0) x.dexTemp = 0; } }
    return; }
  if (f.what === "charm"){ if (isMon) delete x.charm; return; }
  if (f.what === "vuln" || f.what === "weak" || f.what === "intang") return red(f.what, n);
  if (isMon && f.what === "str"){ toward0("str"); toward0("strT"); return; }
  if (!isMon) toward0(f.what, f.what + "Temp");
}
function applyCleanse(st, s, c, target, ctx, f, n, src){
  const o = f.who === "op" ? O(s) : s, p = P(st, o), me = P(st, s), who = o === s ? "自分" : p.name;
  if (f.to === "p" || f.to === "all") cleanseOne(p, f, n, false);
  const L = f.to === "this" ? [ctx.mon ? monAt(st, ctx.mon) : ctx.zone != null ? me.mz[ctx.zone] : null] : f.to === "one" ? [p.mz[target]] : f.to === "mons" || f.to === "all" ? p.mz : [];
  L.forEach(m => { if (m) cleanseOne(m, f, n, true); });
  log(st, s, `${src}：${cleanseText(f).replace(/^自分/, who)}`);
}
FX_FORMS.cleanse.run = applyCleanse;
FX_FORMS.cleanse.opts = (st, s, f) => f.to === "one" ? undefined : null;
/* ---- 行動をしばる（lock） ---- */
function applyLock(st, s, c, target, ctx, f, n, src){
  if (f.who === "this"){ const m = ctx.mon && monAt(st, ctx.mon); if (!m){ log(st, s, `${src}：そのモンスターはもう場にいない`); return; } m.noAtkTurn = Math.max(m.noAtkTurn || 0, st.turn === ctx.mon.s ? st.turnNo : st.turnNo + 1); log(st, s, `${src}：「${card(m.c).name}」はこのターン攻撃できない`); return; }
  const o = f.who === "me" ? s : O(s), p = P(st, o), until = st.turn === o ? st.turnNo : st.turnNo + 1, when = o === s ? "このターン" : `${p.name}の次のターンの終わりまで`;
  if (f.what === "draw"){ p.noDraw = true; log(st, s, `${src}：${when}、${p.name}はもうカードを引けない`); return; }
  const k = f.what === "atk" ? "noAtkUntil" : "noUseUntil"; p[k] = Math.max(p[k] || 0, until);
  log(st, s, `${src}：${when}、${p.name}は${f.what === "atk" ? "攻撃" : "魔法・罠を発動"}できない`);
}
FX_FORMS.lock.run = applyLock;
/* ---- ターンを飛ばす（skip） ----
   rest: いま解決中のものを終えてから、このターンを終える（requestTurnEnd）
   draw・main・battle: その人の次のターンに印（skipNext）をつけておき、ターンのはじめに skipNow にうつす */
function applySkip(st, s, c, target, ctx, f, n, src){
  if (f.what === "rest"){ requestTurnEnd(st, s, c); return; }
  const o = f.who === "me" ? s : O(s), p = P(st, o);
  p.skipNext = { ...(p.skipNext || {}), [f.what]: true };
  log(st, s, `${src}：${p.name}の次のターンの${SKIP_WHAT[f.what]}を飛ばす`);
}
FX_FORMS.skip.run = applySkip;
// いまのターン、その人のメイン・バトルステップが飛ばされているか
const stepSkipped = (st, s, what) => { const k = st && P(st, s).skipNow; return !!(k && k[what] && k.no === st.turnNo && st.turn === s); };
const mainSkipped = (st, s) => stepSkipped(st, s, "main");

/* ---- LP（lp） ---- */
function applyLp(st, s, c, target, ctx, f, n, src){
  if (!(n > 0) || !isFinite(n)) return;
  if (f.op === "leave" && ctx && ctx.hit) ctx.hit.lpPaid = 0;
  for (const o of f.who === "both" ? [s, O(s)] : f.who === "op" ? [O(s)] : [s]){
    const p = P(st, o), whose = o === s ? "" : `${p.name}の`;
    if (f.op === "leave"){ const d = Math.max(0, p.lp - n); if (!d){ log(st, s, `${src}：${whose}LPが${n}以下なので払わない`); continue; } p.lp -= d; if (o === s && ctx && ctx.hit) ctx.hit.lpPaid = (ctx.hit.lpPaid || 0) + d; ev(st, { type: "hit", s: o, d, blk: 0 }); log(st, s, `${src}で${whose}LPを${d}払った（残り${p.lp}）`); }
    else if (f.op === "lose"){ p.lp -= n; ev(st, { type: "hit", s: o, d: n, blk: 0 }); log(st, s, `${src}で${whose}LPを${n}失った`); lostLp(st, o); }
    else { p.lp += n; log(st, s, `${src}で${whose}LPを${n}回復`); }
  }
}
FX_FORMS.lp.run = applyLp;

/* ---- 墓地・山札をあやつる（deckGrave） ---- */
function applyDeckGrave(st, s, c, target, ctx, f, n, src){
  const sides = f.who === "both" ? [s, O(s)] : f.who === "op" ? [O(s)] : [s];
  if (f.act === "steal"){ const op = P(st, O(s)), me = P(st, s); let k = 0; for (let r = 0; r < (n || 1) && op.grave.length; r++){ me.grave.push(op.grave.pop()); k++; } log(st, s, k ? `${src}で相手の墓地のカード${k}枚を自分の墓地に移した` : `${src}：相手の墓地にカードがない`); return; }
  for (const o of sides){
    const X = P(st, o);
    if (f.act === "shuf"){ const k = X.grave.length; X.deck.push(...X.grave.splice(0)); shuffle(X.deck); log(st, s, `${src}で${X.name}の墓地${k}枚を山札に戻してシャッフルした`); continue; }
    if (f.act === "mill"){ const got = X.deck.splice(0, Math.min(Math.max(0, Math.floor(n || 1)), X.deck.length)); X.grave.push(...got); log(st, s, got.length ? `${src}で${X.name}の山札の上から${got.length}枚を墓地へ送った` : `${src}：${X.name}の山札がない`); continue; }
    if (f.pick === "all"){ const k = X.grave.length; (X.exile = X.exile || []).push(...X.grave.splice(0)); log(st, s, `${src}で${X.name}の墓地のカード${k}枚を除外した`); continue; }
    const k = X.grave.lastIndexOf(target); if (k >= 0){ X.grave.splice(k, 1); (X.exile = X.exile || []).push(target); log(st, s, `${src}で${X.name}の墓地の「${card(target).name}」を除外した`); }
  }
}
FX_FORMS.deckGrave.run = applyDeckGrave;
FX_FORMS.deckGrave.opts = (st, s, f) => f.act === "banish" && f.pick === "one" ? [...new Set(P(st, f.who === "op" ? O(s) : s).grave)].filter(id => hasCard(id)) : null;
FX_FORMS.deckGrave.auto = (st, s, opts) => FX_FORMS.fetch.auto(st, s, opts);
// apply effect of card c for player s. target resolved already (or undefined for untargeted)
// 護法: 相手の効果の対象になったモンスター（自分のモンスターを対象にする効果はそのまま）
function wardMon(st, s, fx, target, ctx){
  const k = fx && KINDS[fx.kind]; if (!k || target == null) return null;
  const TS = ctx && ctx.side === "me" ? s : O(s);
  if (typeof target === "string"){ let m = target.match(/^m:(\d+)$/); if (m) return [TS, +m[1]]; m = target.match(/^([ab]):(?:mz:)?(\d+)$/); if (m) return [m[1], +m[2]]; return null; }
  if (fxTgt(fx) === "opp" && typeof target === "number") return [TS, target];
  return null;
}
function wardStop(st, s, c, fx, target, ctx){
  const w = wardMon(st, s, fx, target, ctx); if (!w || w[0] === s) return false;
  const [o, i] = w, m = P(st, o).mz[i]; if (!m) return false;
  const n = abN(st, o, i, "ward"); if (!(n > 0)) return false;
  if (ctx && ctx.wardPaid && ctx.wardPaid[m.u]) return false;
  const p = P(st, s);
  if (p.lp > n){ p.lp -= n; lostLp(st, s); log(st, s, `「${card(m.c).name}」の護法：LPを${n}払った`); if (ctx) ctx.wardPaid = { ...(ctx.wardPaid || {}), [m.u]: 1 }; return false; }
  log(st, s, `「${card(m.c).name}」の護法：LPが足りないので、${c ? `「${c.name}」の` : ""}効果は消えた`); return true;
}
function applyEffect(st, s, c, target, ctx = {}, fx = normFx(c)){
  if (!fx) return;
  fx = fxExec(fx);
  if (immuneStop(st, s, c, fx, target, ctx)) return;
  if (wardStop(st, s, c, fx, target, ctx)) return;
  if (ctx.hit && ctx.spireAtk && typeof target === "string") ctx.hit.t = target;
  if (ctx.hit && target != null) (ctx.hit.picked = ctx.hit.picked || []).push(String(target));
  const me = P(st, s), op = P(st, O(s)), src = `「${c.name}」`, OS = fx.side === "me" && SIDED_KINDS.has(fx.kind) ? s : O(s), opT = P(st, OS);
  let n = fx.n || 0;
  if (fx.per && !fx.hits) n += (fx.pm ?? 1) * perVal(st, s, c, fx, target, ctx);
  if (["dmg", "dmgAll", "dmgRand", "bash"].includes(fx.kind)) n = hitPower(st, s, n, ctx);
  // まとめた効果（新しい形）は、それぞれの run で処理する
  if (FX_FORMS[fx.kind] && FX_FORMS[fx.kind].run){ FX_FORMS[fx.kind].run(st, s, c, target, ctx, fx, n, src); return; }
  switch (fx.kind){
    // カウンターを乗せる・取り除く
    case "ctrAdd": case "ctrDel": {
      const id = fx.ctr, d = fx.kind === "ctrDel" ? -n : n, cw = CTR_CW[fx.cw] ? fx.cw : "pick";
      if (!id || !n) break;
      if (cw === "self"){ const r = ctx.mon; if (r && monAt(st, r)) ctrMonEach(st, r.s, r.i, id, d, src, s); else log(st, s, `${src}：このモンスターが場にいない`); }
      else if (cw === "pick" || cw === "rand"){ if (typeof target === "string" && target.startsWith("m:")) ctrMonEach(st, OS, +target.slice(2), id, d, src, s); }
      else if (cw === "all"){ opT.mz.filter(m => m && !fxImmune(st, s, m)).map(m => m.u).filter(u => u != null).forEach(u => { const i = opT.mz.findIndex(m => m && m.u === u); if (i >= 0) ctrMonEach(st, OS, i, id, d, src, s); }); }
      else ctrPlEach(st, OS, id, d, src, s);
      break;
    }
    // 場のカードを指定して除去（破壊・手札に戻す・除外）
    case "lpSwap": { const a = me.lp, b = op.lp; me.lp = b; op.lp = a; log(st, s, `${src}で${me.name}と${op.name}のLPを入れかえた（${me.name} ${fmtN(a)}→${fmtN(b)}・${op.name} ${fmtN(b)}→${fmtN(a)}）`); break; }
    case "dmgRand": { const L = ["p", ...opT.mz.map((m, i) => m && !fxImmune(st, s, m) ? "m:" + i : null).filter(Boolean)], t = L[Math.floor(Math.random() * L.length)]; if (t === "p"){ log(st, s, `${src}で${opT.name}に${n}ダメージ（ランダム）`); dealDmg(st, OS, n); } else monDmg(st, OS, +t.slice(2), n, src + "（ランダム）"); break; }
    case "dmgAll": { opT.mz.map((m, i) => mfOk(st, s, fx, m) ? i : -1).filter(i => i >= 0).forEach(i => monDmg(st, OS, i, n, src)); if (!fx.monOnly){ log(st, s, `${src}で${opT.name}に${n}ダメージ`); dealDmg(st, OS, n); } break; }
    case "freeAttack": case "freeSkill": case "freePower": { const k = fx.kind.slice(4).toLowerCase(); me.free = { ...(me.free || {}), [k]: ((me.free || {})[k] || 0) + 1 }; log(st, s, `${src}：次に使う${SPIRE_LABEL[k]}のコストが0になる`); break; }
    case "draft": if (target && hasCard(target)){ me.grave.push(target); log(st, s, `${src}で「${card(target).name}」を墓地に加えた`); } break;
    case "dmg": if (typeof target === "string" && target.startsWith("m:")){ monDmg(st, OS, +target.slice(2), n, src); break; } log(st, s, `${src}で${opT.name}に${n}ダメージ`); dealDmg(st, OS, n); break;
    case "block": { if (me.dex && !ctx.potion){ n = Math.max(0, n + me.dex); } if (me.firstBlock2 && !me.blockedNow && !ctx.potion){ n *= 2; log(st, s, `最初のブロックなので2倍！`); } me.blockedNow = true; me.block = (me.block || 0) + n; log(st, s, `${src}でブロックを${n}得た（ブロック ${me.block}）`); if (n > 0) persistFire(st, s, "blockGain", {}); break; }
    case "barricade": me.barricade = true; log(st, s, `${src}：ブロックがターンのはじめに消えなくなった`); break;
    case "plate": me.plate = (me.plate || 0) + n; log(st, s, `${src}でプレート${n}を得た（プレート ${me.plate}）`); break;
    case "corrupt": me.corrupt = true; log(st, s, `${src}：スキルのコストが0になり、使うと廃棄されるようになった`); break;
    case "vulnBonus": me.vulnBonus = (me.vulnBonus || 0) + n; log(st, s, `${src}：弱体の相手へのダメージが+${me.vulnBonus}%`); break;
    case "firstBlock2": me.firstBlock2 = true; log(st, s, `${src}：毎ターン最初のブロックが2倍になった`); break;
    case "rageNow": me.rage = (me.rage || 0) + n; log(st, s, `${src}：このターン、アタックを使うたびブロック${me.rage}`); break;
    case "thornsNow": me.thorns = (me.thorns || 0) + n; log(st, s, `${src}：次の自分のターンまで、攻撃してきたモンスターに${me.thorns}ダメージ`); break;
    case "absorbKill": { const mm = ctx.mon && monAt(st, ctx.mon); if (!mm){ log(st, s, `${src}：取りこむモンスターがいない`); break; } let got = 0;
      (ctx.killed || []).forEach(k => { const g = P(st, k.s).grave, j = g.lastIndexOf(k.c); if (j >= 0){ g.splice(j, 1); (mm.mats = mm.mats || []).push(k.c); got++; log(st, s, `${src}：倒した「${card(k.c).name}」を質量として取りこんだ（質量${mm.mats.length}）`); } });
      if (!got) log(st, s, `${src}：取りこめる相手がいない`); break; }
    case "synthHand": { const id = me.hand[target]; if (id && ctx.hit) ctx.hit.synthId = id; if (id) log(st, s, `${src}：手札の「${card(id).name}」をえらんだ`); break; }
    case "synthTo": { const id = ctx.hit && ctx.hit.synthId, [os, oi] = String(target).split(":"), mm = P(st, os) && P(st, os).mz[+oi];
      if (!id || !mm || !me.hand.includes(id)){ log(st, s, `${src}：合成できなかった`); break; }
      const sc = card(id), mon = cardType(sc) === "monster";
      const bl = blocksOf(sc).map(b => ({ ...JSON.parse(JSON.stringify(b)), ...(sc.fxRows && !freeText(sc) ? { xfr: 1 } : {}), trig: mon && MON_TRIGS.includes(b.trig) ? b.trig : "act", ...(mon && MON_TRIGS.includes(b.trig) ? {} : { ap: "turn", an: 1 }) }));
      const k = Math.min(bl.length, me.grave.length);
      if (!bl.length){ log(st, s, `${src}：「${sc.name}」には付けられる効果がない`); break; }
      const mats = me.grave.splice(0, k); (mm.mats = mm.mats || []).push(...mats);
      mm.xb = (mm.xb || []).concat(bl.slice(0, k));
      const hi = me.hand.indexOf(id); if (hi >= 0){ me.hand.splice(hi, 1); me.grave.push(id); }
      log(st, s, `${src}：「${sc.name}」の効果${k}つを「${card(mm.c).name}」に合成した（墓地${k}枚を質量に）${k < bl.length ? `。墓地が足りず${bl.length - k}つは付かなかった` : ""}`); break; }
    case "matCopy": { const [os, oi] = String(target).split(":"), mm = P(st, os) && P(st, os).mz[+oi];
      if (!mm || !(mm.mats || []).length){ log(st, s, `${src}：質量がない`); break; }
      const isM = id => cardType(card(id)) === "monster" ? 1 : 0, id = mm.mats.slice().sort((a, b) => isM(b) - isM(a) || cmpNum(baseAtk(card(b)) || 0, baseAtk(card(a)) || 0))[0];
      if (!putOut(st, s, id, true)) log(st, s, `${src}：場がいっぱいで出せなかった`); else log(st, s, `${src}：「${card(mm.c).name}」の質量「${card(id).name}」をコピーして場に出した`); break; }
    case "matOut": { const m = ctx.mats ? null : ctx.mon && monAt(st, ctx.mon); let L = [];
      if (ctx.mats) ctx.mats.forEach(id => { const k = me.grave.lastIndexOf(id); if (k >= 0){ me.grave.splice(k, 1); L.push(id); } });
      else if (m){ L = (m.mats || []).slice(); m.mats = []; }
      if (!L.length){ log(st, s, `${src}：質量がない`); break; }
      let out = 0; const rest = []; L.forEach(id => { if (putOut(st, s, id, false)) out++; else rest.push(id); }); me.grave.push(...rest);
      log(st, s, `${src}：質量${out}枚を場に出した${rest.length ? `（出せなかった${rest.length}枚は墓地へ）` : ""}`); break; }
    case "fieldOut": { const f = st.field; if (!ctx.field || !f || f.o !== s || !(f.mats || []).length) break;
      // コピーは魔法・罠ゾーンの1枠にまとめてストックする（何枚でも1枠）
      const k = Math.floor(f.mats.length / 2); if (!k) break;
      let zi = me.sz.findIndex(z => z && z.fcp && z.c === f.c);
      if (zi < 0){ zi = freeZone(me.sz, me); if (zi >= 0){ st.un = (st.un || 0) + 1; me.sz[zi] = { c: f.c, face: true, turn: st.turnNo, u: st.un, fcp: true, stack: 0, mats: [] }; } }
      if (zi < 0){ log(st, s, `${src}：魔法・罠ゾーンに空きがない`); break; }
      const z = me.sz[zi]; z.mats = (z.mats || []).concat(f.mats.splice(0, k)); z.stack = (z.stack || 0) + k; ev(st, { type: "spell", s, c: f.c });
      log(st, s, `${src}：質量${k}枚が「${card(f.c).name}」のコピーになって、魔法・罠ゾーンにストックされた（ストック${z.stack}枚・のこりの質量 ${f.mats.length}枚）`); break; }
    case "reflectDmg": me.reflectUntil = st.turnNo; log(st, s, `${src}：このターン、${me.name}が受けるダメージは相手に跳ね返る！`); break;
    case "extraTurn": me.extraTurns = (me.extraTurns || 0) + (n || 1); log(st, s, `${src}：このターンのあと、もう${(n || 1) > 1 ? (n || 1) + "回" : "1回"}自分のターン！`); break;
    case "dblAtk": me.dblAtk = (me.dblAtk || 0) + (n || 1); log(st, s, `${src}：次に使うアタックをもう1回プレイする`); break;
    case "vuln": addVuln(st, s, target, n, src, OS); break;
    case "bash": if (typeof target === "string" && target.startsWith("m:")){ const i = +target.slice(2), u = opT.mz[i] && opT.mz[i].u; monDmg(st, OS, i, n, src); if (opT.mz[i] && opT.mz[i].u === u) addVuln(st, s, target, 2, src, OS); } else { log(st, s, `${src}で${opT.name}に${n}ダメージ`); dealDmg(st, OS, n); addVuln(st, s, "p", 2, src, OS); } break;
    case "draw": drawN(st, s, n, src); break;
    case "oppDeckDraw": drawN(st, s, n, src, O(s)); break;
    // 「このターン」: 自分のターンならこのターン、相手のターンに出たら次の自分のターン
    case "giveThis": { const r = ctx.mon, m = r && monAt(st, r); if (!m){ log(st, s, `${src}：そのモンスターはもう場にいない`); break; } giveMon(st, r.s, r.i, src, { orDestroy: true }); break; }
    case "thisTopOnly": { const m = ctx.mon && monAt(st, ctx.mon); if (!m){ log(st, s, `${src}：そのモンスターはもう場にいない`); break; } m.topOnly = true; log(st, s, `${src}：「${card(m.c).name}」は相手の一番ATKが高いモンスターにしか攻撃できなくなった`); break; }
    case "modAdd": case "modRep": case "modClear": case "modName": modApply(st, s, c, fx, target, src); break;
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
    case "dblNext": (me.dblNext = me.dblNext || []).push({ pf: fx.pf || "any", pfn: fx.pfn || "", n: Math.max(1, n || 1) }); log(st, s, `${src}：このターン、次に使う${usedPfText(fx)}はもう1回発動する`); break;
    case "freeNext": (me.freeNext = me.freeNext || []).push({ pf: fx.pf || "any", pfn: fx.pfn || "", n: Math.max(1, n || 1) }); log(st, s, `${src}：次に使う${usedPfText(fx)}のコストが0になる`); break;
    case "drawTo": { const k = Math.max(0, n - me.hand.length); if (k) drawN(st, s, k, src); else log(st, s, `${src}：手札はもう${me.hand.length}枚ある`); break; }
    case "setCost": { const fixed = Math.max(0, Math.round(fx.n ?? n ?? 0)), until = fx.sd === "turn" || !COST_SD[fx.sd] ? st.turnNo : 0, once = fx.sd === "used", rnd = fx.sv === "rand", lo = costLo(fx), hi = costHi(fx);
      const ok = id => card(id) && !card(id).costX && (fx.sp === "pick" || fx.sp === "all" || usedMatch(card(id), fx.pf, fx.pfn));
      let L;
      if (rnd){
        // ランダム: 1枚ずつちがうコストにする（その1枚を対戦中だけの別のカードにしてから、コストを決める）
        const zones = fx.sp === "pick" ? [[me.hand, [target]]] : [fx.sw === "deck" ? null : [me.hand], fx.sw === "deck" || fx.sw === "both" ? [me.deck] : null].filter(Boolean);
        L = [];
        zones.forEach(([arr, only]) => (only || arr.map((_, i) => i)).forEach(i => { if (arr[i] == null || !ok(arr[i])) return; const nid = modId(st, arr[i], {}); arr[i] = nid; L.push({ id: nid, v: lo + Math.floor(Math.random() * (hi - lo + 1)), hand: arr === me.hand }); }));
      } else {
        // 決まった数: 同じカードはまとめて同じコスト
        const pool = fx.sp === "pick" ? (me.hand[target] != null ? [me.hand[target]] : []) : fx.sw === "deck" ? me.deck : fx.sw === "both" ? [...me.hand, ...me.deck] : me.hand;
        L = [...new Set(pool.filter(ok))].map(id => ({ id, v: fixed }));
      }
      L.forEach(x => (me.costSet = me.costSet || []).push({ id: x.id, v: x.v, until, once }));
      if (me.costSet && me.costSet.length > 400) me.costSet = me.costSet.slice(-400);
      const when = COST_SD[fx.sd] || "このターン";
      if (!L.length) log(st, s, `${src}：コストを変えるカードがない`);
      else if (!rnd) log(st, s, `${src}で${L.length > 8 ? `${L.length}種類のカード` : L.map(x => `「${card(x.id).name}」`).join("")}のコストが${fixed}になった（${when}）`);
      else { const hand = L.filter(x => x.hand), rest = L.length - hand.length; log(st, s, `${src}で${L.length}枚のカードのコストがランダムに${lo}〜${hi}になった（${when}）${hand.length ? "：手札は" + hand.slice(0, 10).map(x => `「${card(x.id).name}」${x.v}`).join("・") : ""}${rest ? `${hand.length ? "、" : "："}山札の${rest}枚も1枚ずつ` : ""}`); }
      break; }
    case "seal": { const m = opT.mz[target]; if (!m) break; let k = 0;
      for (let r = 0; r < Math.max(1, n || 1); r++){ if (!me.deck.length) refill(st, s); const id = me.deck.shift(); if (id == null) break; (m.seals = m.seals || []).push({ c: id, o: s }); k++; }
      log(st, s, k ? `${src}で「${card(m.c).name}」に封印を${k}つつけた（ないものとして扱う）` : `${src}：山札がないので封印をつけられない`); break; }
    case "pctDmg": { const pc = Math.max(1, Math.min(100, Math.round(n || 0))), d = Math.ceil((P(st, O(s)).lp || 0) * pc / 100); log(st, s, `${src}で${P(st, O(s)).name}のLPの${pctWord(pc)}（${d}）のダメージ`); if (d > 0) dealDmg(st, O(s), d); break; }
    case "loseAb": {
      const k = labKey(fx), w = GAB_W[fx.gw] ? fx.gw : "self", until = fx.gd === "turn" ? st.turnNo : fx.gd === "next" ? st.turnNo + 2 : 0;
      const lose = m => { if (!m) return; (m.lab = m.lab || []).push({ k, until }); log(st, s, `${src}で「${card(m.c).name}」が${k === "all" ? "すべての能力" : ABS[k].kw ? `《${ABS[k].kw}》` : ABS[k].label}を失った${until ? `（${GAB_D[fx.gd]}）` : ""}`); };
      if (w === "self"){ const m = ctx.mon ? monAt(st, ctx.mon) : ctx.zone != null ? me.mz[ctx.zone] : null; if (m && (ctx.mon || m.c === c.id)) lose(m); }
      else if (w === "mineAll") me.mz.forEach(lose);
      else if (w === "oppAll") op.mz.forEach(lose);
      else if (typeof target === "string"){ const [o, i] = target.split(":"); lose(P(st, o).mz[+i]); }
      break;
    }
    case "giveAttr": { const a = String(fx.ga || "火"), w = GAT_W[fx.aw] ? fx.aw : "opp1"; let L = [];
      if (target != null && /^[ab]:\d+$/.test(String(target))){ const [ts, ti] = String(target).split(":"); L = [P(st, ts).mz[+ti]]; }
      else if (w === "self") L = [ctx.mon ? monAt(st, ctx.mon) : null];
      else if (w === "mineAll" || w === "oppAll") L = P(st, w === "mineAll" ? s : O(s)).mz.filter(m => m && mfOk(st, s, fx, m));
      L = L.filter(Boolean); L.forEach(m => { if (fx.gm === "set"){ m.atSet = true; m.xat = [a]; } else m.xat = [...new Set([...(m.xat || []), a])]; });
      log(st, s, L.length ? `${src}：${L.map(m => `「${card(m.c).name}」`).join("")}${fx.gm === "set" ? `の属性を${a}にした` : `に${a}属性を加えた`}` : `${src}：属性を付与するモンスターがいない`); break; }
    case "giveAb": {
      const a = gabAbility(fx), w = GAB_W[fx.gw] ? fx.gw : "self", until = fx.gd === "turn" ? st.turnNo : fx.gd === "next" ? st.turnNo + 2 : 0;
      const give = m => { if (!m) return; const g = { ...a, until };
        // 成長は「付与されてから」数える
        if (g.k === "evoTurn") g.n = (g.n || 1) + (m.age || 0); if (g.k === "evoAtk") g.n = (g.n || 1) + (m.atkTotal || 0); if (g.k === "evoTurn" || g.k === "evoAtk"){ g.n0 = a.n || 1; delete m.evoFail; }
        (m.gab = m.gab || []).push(g); log(st, s, `${src}で「${card(m.c).name}」が${ABS[g.k].kw ? `《${ABS[g.k].kw}》` : ABS[g.k].label}を得た${until ? `（${GAB_D[fx.gd]}）` : ""}`); };
      if (w === "self"){ const m = ctx.mon ? monAt(st, ctx.mon) : ctx.zone != null ? me.mz[ctx.zone] : null; if (m && (ctx.mon || m.c === c.id)) give(m); else log(st, s, `${src}：場にいないので能力は得られない`); }
      else if (w === "mineAll") me.mz.forEach(give);
      else if (w === "oppAll") op.mz.forEach(give);
      else if (typeof target === "string"){ const [o, i] = target.split(":"); give(P(st, o).mz[+i]); }
      break;
    }
    case "charm": {
      const m = opT.mz[target];
      if (m){ m.charm = { eu: ctx.eqU || null, mu: ctx.mon ? ctx.mon.u : null, c: c.id }; log(st, s, `${src}で「${card(m.c).name}」を魅了した（${src}が場にある間、攻撃できない）`); }
      break;
    }
    case "charmAll": opT.mz.forEach(m => { if (mfOk(st, s, fx, m)) m.charm = { eu: ctx.eqU || null, mu: ctx.mon ? ctx.mon.u : null, c: c.id }; }); log(st, s, `${src}で${OS === s ? "自分" : "相手"}のモンスターをすべて魅了した（攻撃できない）`); break;
    case "vulnAll": if (!fx.monOnly) addVuln(st, s, "p", n, src, OS); opT.mz.forEach((m, i) => { if (mfOk(st, s, fx, m)) addVuln(st, s, "m:" + i, n, src, OS); }); break;
    case "weak": addWeak(st, s, target, n, src, OS); break;
    case "weakAll": if (!fx.monOnly) addWeak(st, s, "p", n, src, OS); opT.mz.forEach((m, i) => { if (mfOk(st, s, fx, m)) addWeak(st, s, "m:" + i, n, src, OS); }); break;
    case "graveToTop": { const k = me.grave.indexOf(target); if (k >= 0){ me.grave.splice(k, 1); me.deck.unshift(target); log(st, s, `${src}で墓地の「${card(target).name}」を山札の一番上に置いた`); } break; }
    case "drawUntil": { let k = 0, last = null; while (k < 12 && !me.noDraw){ if (!me.deck.length) refill(st, s); if (!me.deck.length) break; last = me.deck.shift(); me.hand.push(last); k++; if (!isAttackCard(card(last))) break; } log(st, s, `${src}でカードを${k}枚引いた${last && !isAttackCard(card(last)) ? `（「${card(last).name}」で止まった）` : ""}`); break; }
    // このカード以外すべて: お互いの場のモンスター・魔法・罠・フィールドを破壊（このカード自身と、このカードが付いているモンスターはのこす）
    case "stealMon": case "stealMonTmp": {
      const m = opT.mz[target], z = freeZone(me.mz, me); if (!m || OS === s) break;
      if (z < 0){ log(st, s, `${src}：場がいっぱいでうばえない`); break; }
      opT.mz[target] = null; me.mz[z] = m; m.owner = m.owner || OS; m.attacked = false; m.atkCount = 0; m.born = 0;
      if (fx.kind === "stealMonTmp") m.retBy = st.turn; else delete m.retBy;
      ev(st, { type: "summon", s, z }); log(st, s, `${src}で「${card(m.c).name}」のコントロールをうばった${fx.kind === "stealMonTmp" ? "（このターンだけ）" : ""}`); break; }
    case "scry": { const N = Math.max(1, ctx.scryN || n || 3), top = me.deck.splice(0, N), k = +target, keep = top[k];
      if (keep == null){ me.deck.unshift(...top); break; }
      const rest = top.filter((_, i) => i !== k); me.deck.push(...rest); me.deck.unshift(keep);
      log(st, s, `${src}：山札の上を${top.length}枚見て、1枚を一番上に、${rest.length}枚を一番下に置いた`); break; }
    case "atkSwap": { const me2 = ctx.mon && monAt(st, ctx.mon), t2 = opT.mz[target]; if (!me2 || !t2) { log(st, s, `${src}：入れかえる相手がいない`); break; }
      const a = atkOf(me2), b = atkOf(t2); if (!isFinite(a) || !isFinite(b)) break; me2.zero = t2.zero = false; me2.fix = t2.fix = null;
      me2.mod = (me2.mod || 0) + (b - atkOf(me2)); t2.mod = (t2.mod || 0) + (a - atkOf(t2)); log(st, s, `${src}：「${card(me2.c).name}」と「${card(t2.c).name}」のATKを入れかえた（${fmtN(a)} ⇔ ${fmtN(b)}）`); break; }
    case "fusion": {
      const fc = card(target), ex = (me.ex = me.ex || []), k = ex.indexOf(target), plan = k >= 0 && isFusion(fc) ? (ctx.fusMats && fusionPlanFrom(st, s, fc, ctx.fusMats)) || fusionPlan(st, s, fc) : null;
      if (!plan){ log(st, s, `${src}：融合できない（素材が足りない）`); break; }
      const names = plan.map(x => `「${card(x.id).name}」`).join("");
      plan.filter(x => x.from === "hand").map(x => x.i).sort((a, b) => b - a).forEach(i => me.grave.push(me.hand.splice(i, 1)[0]));
      plan.filter(x => x.from === "mz").forEach(x => sendToGrave(st, s, x.i));
      ev(st, { type: "fusion", s, mats: plan.map(x => x.id), c: target });
      ex.splice(k, 1); const z = freeZone(me.mz, me); me.mz[z] = mkMon(st, target); ev(st, { type: "summon", s, z });
      log(st, s, `${src}：${names}を融合！「${fc.name}」を融合召喚した`);
      trigger(st, s, fc, "ssummon", { zone: z, mon: { s, i: z, u: me.mz[z].u } }); enterFire(st, s, "put");
      break;
    }
    case "transformHand": transformAt(st, s, target, fx.into, src, c, fx); break;
    case "transformRand": { const L = shuffle(me.hand.map((_, k) => k)).slice(0, n || 1); if (!L.length) log(st, s, `${src}：手札がない`); L.forEach(k => transformAt(st, s, k, fx.into, src, c, fx)); break; }
    case "transformAtk": { const L = me.hand.map((id, k) => isAttackCard(card(id)) ? k : -1).filter(k => k >= 0); if (!L.length) log(st, s, `${src}：手札にアタックがない`); L.forEach(k => transformAt(st, s, k, fx.into, src, c, fx)); break; }
    case "transformSelf": transformSelf(st, s, c, ctx, fx, src); break;
    case "transformAll": { if (!me.hand.length) log(st, s, `${src}：手札がない`); me.hand.forEach((_, k) => transformAt(st, s, k, fx.into, src, c, fx)); break; }
    case "oppDraw": { let k = 0; for (let r = 0; r < (n || 1); r++){ if (!op.deck.length) refill(st, O(s)); if (!op.deck.length) break; op.hand.push(op.deck.shift()); k++; } log(st, s, `${src}で${op.name}はカードを${k}枚引いた${k < (n || 1) ? "（山札がなくてそれ以上引けなかった）" : ""}`); break; }
    case "autoPlay": if (fx.into){ me.autoPlay = [...new Set([...(me.autoPlay || []), fx.into])]; log(st, s, `${src}：これから名前に「${fx.into}」が入ったカードは引いたら自動で使う`); } break;
    // このターンだけ: m.tmp に入れて、このターンのおわりに0にもどす
    case "manaNow": if (me.mana){ me.mana.cur += n; log(st, s, `${src}でマナを${n}回復（${me.mana.cur}/${me.mana.max}）`); } else log(st, s, `${src}：マナを使わないデッキなので効果なし`); break;
    case "selfMana": { if (!me.manaZ){ log(st, s, `${src}：マナゾーンのないデッキ`); break; }
      const m = ctx.mon && monAt(st, ctx.mon); if (m){ const i = P(st, ctx.mon.s).mz.indexOf(m); moveMonOut(st, ctx.mon.s, i, "mana"); log(st, s, `${src}：場の「${card(m.c).name}」をマナゾーンに置いた`); break; }
      let k = me.grave.lastIndexOf(c.id); if (k >= 0){ me.grave.splice(k, 1); manaSync(me); manaPut(st, s, c.id); log(st, s, `${src}：墓地の「${c.name}」をマナゾーンに置いた`); break; }
      k = ctx.inHand ? me.hand.indexOf(ctx.inHand) : -1; if (k >= 0){ const id = me.hand.splice(k, 1)[0]; manaSync(me); manaPut(st, s, id); log(st, s, `${src}：手札の「${card(id).name}」をマナゾーンに置いた`); break; }
      log(st, s, `${src}：このカードが見つからない`); break; }
    // 盾を追加: 山札の上から n 枚を裏向きのままシールドに加える（シールドデッキのときだけ）
    case "addShield": { if (!me.shieldOn){ log(st, s, `${src}：シールドのないデッキ`); break; }
      const k = Math.min(Math.max(1, n || 1), me.deck.length); if (!k){ log(st, s, `${src}：山札がない`); break; }
      me.shields.push(...me.deck.splice(0, k)); log(st, s, `${src}で山札の上から${k}枚をシールドに加えた（シールド${me.shields.length}枚）`); ev(st, { type: "shieldAdd", s, n: k }); break; }
    // シールド回収: 自分のシールドを手札へ（ブレイクではないのでS・トリガーは使わない）
    case "shieldToHand": { if (!me.shieldOn || !me.shields){ log(st, s, `${src}：シールドのないデッキ`); break; }
      const k = Math.min(Math.max(1, n || 1), me.shields.length); if (!k){ log(st, s, `${src}：シールドがない`); break; }
      me.hand.push(...me.shields.splice(me.shields.length - k, k)); log(st, s, `${src}で自分のシールドを${k}枚手札に加えた（ブレイクではない・のこり${me.shields.length}枚）`); ev(st, { type: "shieldTake", s, n: k }); break; }
    // シールド交換: えらんだ手札1枚をシールドに、かわりにランダムなシールド1枚を手札に（カードの名前は相手に見せない）
    case "shieldSwap": { if (!me.shieldOn || !me.shields){ log(st, s, `${src}：シールドのないデッキ`); break; }
      if (!me.shields.length){ log(st, s, `${src}：シールドがない`); break; }
      const id = me.hand[target]; if (id == null){ log(st, s, `${src}：手札がない`); break; }
      me.hand.splice(target, 1); const j = Math.floor(Math.random() * me.shields.length), got = me.shields[j]; me.shields[j] = id; me.hand.push(got);
      log(st, s, `${src}で手札の1枚とシールド1枚を入れかえた`); break; }
    // シールド焼却: 相手のシールドを墓地へ（ブレイクではない）
    case "shieldBurn": { if (!op.shieldOn || !op.shields){ log(st, s, `${src}：相手はシールドのないデッキなので、なにもしない`); break; }
      const k = Math.min(Math.max(1, n || 1), op.shields.length); if (!k){ log(st, s, `${src}：相手のシールドがない`); break; }
      op.grave.push(...op.shields.splice(op.shields.length - k, k)); log(st, s, `${src}で${op.name}のシールドを${k}枚墓地に置いた（ブレイクではない・のこり${op.shields.length}枚）`); ev(st, { type: "shieldTake", s: O(s), n: k }); break; }
    // シールド送り（前の形）: 相手のモンスター1体を持ち主のシールドへ（シールドデッキでなければ墓地へ）
    case "shieldSend": { const m = op.mz[target]; if (!m){ log(st, s, `${src}：対象のモンスターがいない`); break; } const nm = card(m.c).name; if (moveMonOut(st, O(s), target, "shield")) log(st, s, `${src}で「${nm}」を${P(st, m.owner || O(s)).shieldOn ? "持ち主のシールドに置いた" : "墓地へ送った（シールドデッキでない）"}`); break; }
    // タップ・アンタップ（シールドデッキのルール。タップ中はブロックできず、シールドデッキのモンスターは攻撃される）
    case "tapMon": { const m = op.mz[target]; if (!m){ log(st, s, `${src}：対象のモンスターがいない`); break; } m.tap = true; log(st, s, `${src}で「${card(m.c).name}」をタップした`); break; }
    case "tapAll": { const L = op.mz.filter(m => m && !(typeof fxImmune === "function" && fxImmune(st, s, m))); L.forEach(m => { m.tap = true; }); log(st, s, `${src}で${op.name}のモンスター${L.length}体をタップした`); break; }
    case "untapMon": { const m = me.mz[target]; if (!m){ log(st, s, `${src}：対象のモンスターがいない`); break; } delete m.tap; log(st, s, `${src}で「${card(m.c).name}」をアンタップした`); break; }
    case "untapAll": { me.mz.forEach(m => { if (m) delete m.tap; }); log(st, s, `${src}で自分のモンスターをすべてアンタップした`); break; }
    case "strigLock": op.noStrigUntil = st.turnNo; log(st, s, `${src}：このターン、${op.name}はS・トリガーを使えない`); break;
    // ブレイク封鎖: 次の相手のターンの終わりまで（相手のターン中に使ったら、そのターンもふくむ）
    case "brkLock": me.brkCapUntil = Math.max(me.brkCapUntil || 0, st.turnNo + (st.turn === s ? 1 : 2)); log(st, s, `${src}：次の相手のターンの終わりまで、${me.name}のシールドは1回に1枚までしかブレイクされない`); break;
    case "manaBoost": if (me.manaZ) manaFromDeck(st, s, n, src); else if (me.mana){ const add = Math.max(0, Math.min(n, MANA_LIMIT - me.mana.max)); me.mana.max += add; me.mana.cur += add; log(st, s, `${src}で最大マナを${add}増やした（${me.mana.cur}/${me.mana.max}）`); } else log(st, s, `${src}：マナを使わないデッキ`); break;
    case "manaHand": { if (!me.manaZ){ log(st, s, `${src}：マナゾーンのないルール`); break; } const id = me.hand[target]; if (id == null){ log(st, s, `${src}：手札がない`); break; } me.hand.splice(target, 1); manaSync(me); const tp = manaPut(st, s, id); log(st, s, `${src}：手札の「${card(id).name}」をマナゾーンに置いた${tp ? "（タップ）" : ""}`); break; }
    case "manaGrave": { if (!me.manaZ){ log(st, s, `${src}：マナゾーンのないルール`); break; } const L = me.grave.splice(Math.max(0, me.grave.length - Math.max(1, n || 1))); manaSync(me); L.forEach(id => manaPut(st, s, id)); log(st, s, L.length ? `${src}：墓地の${L.map(id => `「${card(id).name}」`).join("")}をマナゾーンに置いた` : `${src}：墓地にカードがない`); break; }
    case "manaBreak": { if (!op.manaZ){ if (op.mana){ const k = Math.min(Math.max(1, n || 1), op.mana.max); op.mana.max -= k; op.mana.cur = Math.min(op.mana.cur, op.mana.max); log(st, s, `${src}で${op.name}の最大マナを${k}減らした`); } else log(st, s, `${src}：相手はマナを使わない`); break; }
      let k = Math.min(Math.max(1, n || 1), op.manaZ.length); const out = []; while (k-- > 0) out.push(op.manaZ.splice(Math.floor(Math.random() * op.manaZ.length), 1)[0]);
      op.grave.push(...out.map(x => x.c)); op.mana.cur = Math.min(op.mana.cur, manaFree(op).length); manaSync(op); log(st, s, out.length ? `${src}：${op.name}のマナゾーンの${out.map(x => `「${card(x.c).name}」`).join("")}を墓地へ置いた` : `${src}：相手のマナゾーンにカードがない`); break; }
    case "manaBack": { if (!me.manaZ){ log(st, s, `${src}：マナゾーンのないルール`); break; } const J = me.manaZ.map((x, j) => j).sort((a, b) => cmpNum(costOf(card(me.manaZ[b].c)), costOf(card(me.manaZ[a].c)))).slice(0, Math.max(1, n || 1)).sort((a, b) => b - a), out = J.map(j => me.manaZ.splice(j, 1)[0]);
      me.hand.push(...out.map(x => x.c)); me.mana.cur = Math.min(me.mana.cur, manaFree(me).length); manaSync(me); log(st, s, out.length ? `${src}：マナゾーンの${out.map(x => `「${card(x.c).name}」`).join("")}を手札に戻した` : `${src}：マナゾーンにカードがない`); break; }
    case "manaMax": if (me.manaZ){ manaFromDeck(st, s, n, src); break; } if (me.mana){ const add = Math.max(0, Math.min(n, MANA_LIMIT - me.mana.max)); me.mana.max += add; me.mana.cur += n; if (me.spire) me.maxAdj = (me.maxAdj || 0) + add; log(st, s, `${src}で最大マナ+${add}、マナ+${n}（${me.mana.cur}/${me.mana.max}）`); } else log(st, s, `${src}：マナを使わないデッキなので効果なし`); break;
    case "manaDrain": if (op.mana){ const k = Math.min(n, op.mana.cur); op.mana.cur -= k; log(st, s, `${src}で${op.name}のマナを${k}減らした`); } else log(st, s, `${src}：相手はマナを使わないデッキなので効果なし`); break;
    case "negate": if (ctx.attack){ st.pending.negated = true; log(st, s, `${src}で攻撃を無効にした`); } else log(st, s, `${src}：無効にする攻撃がない`); break;
    case "atkDownAtk": { const am = ctx.attack && P(st, ctx.attack.by).mz[ctx.attack.from]; if (am && fxImmune(st, s, am)) log(st, s, `「${card(am.c).name}」は相手の効果を受けない！`); else if (am){ am.mod = (am.mod || 0) - n; log(st, s, `${src}で攻撃してきた「${card(am.c).name}」のATK−${n}`); } else log(st, s, `${src}：攻撃してきたモンスターがいない`); break; }
    case "dmgAtkAtk": { const am = ctx.attack && P(st, ctx.attack.by).mz[ctx.attack.from], d = am ? Math.max(0, +atkOf(am) || 0) : 0; if (am && d > 0 && isFinite(d)){ log(st, s, `${src}：攻撃してきた「${card(am.c).name}」のATK ${fmtN(d)}ぶんのダメージを${P(st, ctx.attack.by).name}に与えた`); dealDmg(st, ctx.attack.by, d); } else log(st, s, `${src}：攻撃してきたモンスターがいない`); break; }
    case "noLoseTurn": me.noLoseT = st.turnNo; me.noLoseSrc = c.name; log(st, s, `${src}：このターン、${me.name}はゲームに負けない！`); break;
    case "noLoseWhile": log(st, s, `${src}：このカードが場にいる限り、${me.name}はゲームに負けない`); break;
    case "win": {
      let ok = true;
      if (fx.cond === "lp") ok = me.lp <= fx.cn;
      if (fx.cond === "grave") ok = me.grave.length >= fx.cn;
      if (fx.cond === "hand") ok = me.hand.filter(id => id === c.id).length + (ctx.fromHand ? 1 : 0) >= fx.cn;
      if (ok && noLoseBy(st, O(s))) log(st, s, `${src}：勝利の条件はそろったけど、相手は「${noLoseBy(st, O(s))}」の効果で負けない`);
      else if (ok){ st.winner = s; st.why = `${src}の効果で勝利`; log(st, s, `${src}の効果でゲームに勝利！`); }
      else log(st, s, `${src}：勝利の条件がそろっていない`);
      break;
    }
  }
}
// resolve an effect that may need a target; `then` runs after (for attack responses)
function runEffect(st, s, c, ctx = {}, then, fx = normFx(c)){
  if (!fx){ then && then(st); return; }
  fx = fxExec(fx);
  if (fx.ask){
    if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c, fx, ctx, then }); return; }
    const yes = Math.random() < .5;
    log(st, s, `「${c.name}」：「${fx.ask}」→ ${yes ? "はい" : "いいえ"}`);
    if (!yes){ then && then(st); return; }
    fx = { ...fx, ask: "" };
  }
  if (fx.per && !fx.hits && fx.per !== "tgtVuln" && PER_DEFS[fx.per]) fx = { ...fx, n: (+fx.n || 0) + (fx.pm ?? 1) * perVal(st, s, c, fx, null, ctx), per: null };
  if (fx.eachN){ const k = Math.max(0, Math.min(40, Math.round(+fx.n || 0))), one = { ...fx, n: 1, eachN: false }, go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } runEffect(st2, s, c, ctx, st3 => go(st3, r - 1), one); }; go(st, k); return; }
  // 合成: 手札のカード → 付けるモンスターの順にえらぶ
  if (fx.kind === "synth"){ if (!ctx.hit) ctx = { ...ctx, hit: {} }; const h = ctx.hit; h.synthId = null; runEffect(st, s, c, ctx, st2 => { if (!h.synthId){ then && then(st2); return; } runEffect(st2, s, c, ctx, then, { kind: "synthTo" }); }, { kind: "synthHand" }); return; }
  if (fx.kind === "draft" && !ctx.draft) ctx = { ...ctx, draft: draftPick(fx.n, P(st, s).spc) };
  if (fx.kind === "scry" || fx.kind === "look") ctx = { ...ctx, scryN: Math.max(1, fx.n || 3) };
  if (KINDS[fx.kind] && KINDS[fx.kind].tag) ctx = { ...ctx, tagName: fx.into || "" };
  if (SIDED_KINDS.has(fx.kind)) ctx = { ...ctx, side: fx.side === "me" ? "me" : null };
  if (FX_FORMS[fx.kind]) ctx = { ...ctx, form: fx };
  if (fx.kind === "giveAb" || fx.kind === "loseAb") ctx = { ...ctx, gw: GAB_W[fx.gw] ? fx.gw : "self" };
  if (fx.kind === "giveAttr") ctx = { ...ctx, aw: GAT_W[fx.aw] ? fx.aw : "opp1" };
  if (fx.kind === "setCost") ctx = { ...ctx, sp: fx.sp === "pick" ? "pick" : "filter" };
  if (KINDS[fx.kind] && KINDS[fx.kind].ctr){ const cw = CTR_CW[fx.cw] ? fx.cw : "pick"; ctx = { ...ctx, ctrPick: cw === "pick" || cw === "rand" };
    // ランダムなモンスター: ○回くりかえして、そのたびにランダムに1体えらぶ
    if (cw === "rand" && !fx.rand){ const one = { ...fx, rand: true }, go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } runEffect(st2, s, c, ctx, st3 => go(st3, r - 1), one); }; go(st, Math.max(1, Math.min(10, Math.round(+fx.ctn || 1)))); return; } }
  if (KINDS[fx.kind] && KINDS[fx.kind].mod) ctx = { ...ctx, modPick: modT(fx).scope === "pick" };
  // 「○1つにつき、もう1回」: the hit is repeated (each one is a normal hit)
  if (fx.hits && fx.per){ const k = 1 + Math.max(0, perVal(st, s, c, fx, null, ctx)), one = { ...fx, per: null, hits: false }, go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } runEffect(st2, s, c, ctx, st3 => go(st3, r - 1), one); }; go(st, Math.min(k, 30)); return; }
  if (fx.kind === "playHandAtk"){ const go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } const p = P(st2, s), L = p.hand.map((id, j) => j).filter(j => isAttackCard(card(p.hand[j])) && cardType(card(p.hand[j])) === "magic"); if (!L.length){ log(st2, s, `「${c.name}」：手札にアタックがない`); then && then(st2); return; } const id = p.hand.splice(L[Math.floor(Math.random() * L.length)], 1)[0]; p.deck.unshift(id); playTopCard(st2, s, `「${c.name}」`, false, st3 => go(st3, r - 1)); }; go(st, Math.max(1, fx.n || 1)); return; }
  if (fx.kind === "playTop" || fx.kind === "playTopEx"){ const ex = fx.kind === "playTopEx", go = (st2, r) => { if (r <= 0 || st2.winner){ then && then(st2); return; } playTopCard(st2, s, `「${c.name}」`, ex, st3 => go(st3, r - 1)); }; go(st, Math.max(1, fx.n || 1)); return; }
  if ((c && c.frame === "spire" || fx.rand || fx.distinct) && (fx.kind === "dmg" || fx.kind === "bash" || fx.kind === "vuln" || fx.kind === "weak")) ctx = { ...ctx, spireAtk: true };
  let opts = fxTargets(st, s, fx, ctx);
  if (fx.to === "oppPick" && fx.kind === "remove") return oppPickRun(st, s, c, ctx, then, fx, Math.max(1, Math.min(10, Math.round(+fx.tn || 1))));
  if (opts && fx.distinct && ctx.hit && ctx.hit.picked) opts = opts.filter(o => !ctx.hit.picked.includes(String(o)));
  if (fx.rand && ctx.spireAtk) ctx = { ...ctx, anyEnemy: true }, opts = fxTargets(st, s, fx, ctx);
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
  const field = () => p.mz.filter((m, i) => m && !(ctx.zone != null && i === ctx.zone) && is(m.c)).length + p.sz.filter(z => z && is(z.c)).length + (p.standingEq || []).filter(e => is(e.c)).length + ["a", "b"].reduce((a, o) => a + P(st, o).mz.reduce((b, m) => b + eqsOf(m).filter(e => e.o === s && e.u !== ctx.eqU && is(e.c)).length, 0), 0);
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
  if (cascadeOn(c) && !ctx.cascaded && ((trig === "summon" && ctx.cast) || (trig === "use" && (ctx.fromHand || ctx.cast)))){ ctx.cascaded = true; return doCascade(st, s, c, st2 => runCard(st2, s, c, trig, ctx, then)); }
  ctx = { ...ctx, hit: {} };
  const bs = blockGroups(blocksOf(c).map((b, i) => ({ ...b, _bi: i }))).map(g => g.filter(b => (b.trig === trig && (trig !== "ctrReach" || ctrReachHit(b, ctx))) || ((trig === "summon" || trig === "ssummon") && b.trig === "enter" && cardType(c) === "monster"))).filter(g => g.length);
  const step = (st2, k) => { if (k >= bs.length){ then && then(st2); return; } runBlockGroup(st2, s, c, bs[k], ctx, st3 => step(st3, k + 1)); };
  step(st, 0);
}
// 続唱（MTG）: 山札の上から、このカードよりコストが小さいモンスターか魔法が出るまでめくり、それをタダで使ってよい。めくった残りはランダムな順で山札の下へ
// ct: めくって使えるもの（"monster" / "magic"、なければどちらも）
function cascadeOk(st, s, x, lim, ct){
  const t = cardType(x); if (!x || (t !== "monster" && t !== "magic") || !hasCost(x) || !(costOf(x) < lim)) return false;
  if ((ct === "monster" || ct === "magic") && t !== ct) return false;
  if (t === "monster") return !isFusion(x) && !isEx(x) && !isDmEvo(x) && !tribOf(x, st, s) && !massOf(x) && !(ssOf(x) || {}).only;
  return !x.noUse && !useBlockedWhy(st, s, x);
}
function doCascade(st, s, c, then){
  const p = P(st, s), src = `「${c.name}」の続唱`;
  if (!p.mana){ log(st, s, `${src}：コストを使うデッキでだけ働く`); then && then(st); return; }
  const lim = costOf(c), shown = []; let hit = null;
  while (p.deck.length){ const id = p.deck.shift(); if (cascadeOk(st, s, card(id), lim, c.cascT)){ hit = id; break; } shown.push(id); }
  log(st, s, `${src}：山札の上から${shown.length + (hit ? 1 : 0)}枚めくった${hit ? `→「${card(hit).name}」（コスト${costLabel(card(hit))}）` : "（コストが小さいカードは出なかった）"}`);
  const bottom = st2 => P(st2, s).deck.push(...shuffle(shown));
  if (!hit){ bottom(st); then && then(st); return; }
  const go = (st2, k) => {
    if (k){ shown.push(hit); bottom(st2); log(st2, s, `${src}：「${card(hit).name}」は使わずに山札の下へ`); then && then(st2); return; }
    bottom(st2); castFree(st2, s, hit, src, then);
  };
  if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c, ctx: {}, then, fx: { kind: "__block", ask: `続唱：「${card(hit).name}」をタダで使う？` }, pick1: [{ name: "タダで使う", text: fxText(card(hit)) || card(hit).name }, { name: "使わない", text: "めくったカードと一緒に山札の下へ" }], p1go: go }); return; }
  go(st, 0);
}
// 続唱で出たカードを、コストを払わずに使う（モンスターは召喚・魔法は発動。どちらも「使った」扱いなので、続唱があればまた続唱する）
function castFree(st, s, id, src, then){
  const p = P(st, s), c = card(id);
  { const why = useCondWhy(st, s, c); if (why){ p.hand.push(id); log(st, s, `${src}：「${c.name}」は発動条件を満たさないため手札へ：${why}`); then && then(st); return; } }
  if (cardType(c) === "monster"){
    const z = glZone(st, s, id);
    if (z < 0){ p.grave.push(id); log(st, s, `${src}：場がいっぱいなので「${c.name}」は墓地へ`); then && then(st); return; }
    p.mz[z] = mkMon(st, id); ev(st, { type: "summon", s, z }); log(st, s, `${src}で「${c.name}」をタダで召喚！`);
    runCard(st, s, c, "summon", { zone: z, mon: { s, i: z, u: p.mz[z].u }, cast: true }, st2 => enterFire(st2, s, "summon", st3 => onCardUsed(st3, s, c, then, (P(st3, s).mz[z] || {}).u)));
    return;
  }
  if (isField(c) && st.field && cannotLeave(st.field.c)){ p.hand.push(id); log(st, s, `${src}：場から離れないフィールドがあるため「${c.name}」は手札へ`); then && then(st); return; }
  const pz = isPersist(c) ? freeZone(p.sz, p) : -1;
  if (isPersist(c) && pz < 0){ p.deck.push(id); log(st, s, `${src}：魔法・罠ゾーンがいっぱいなので「${c.name}」は山札の下へ`); then && then(st); return; }
  log(st, s, `${src}で「${c.name}」をタダで発動！`); ev(st, { type: "spell", s, c: id }); countPlay(st, s, c);
  if (isField(c)) placeField(st, s, id);
  else if (pz >= 0){ st.un = (st.un || 0) + 1; p.sz[pz] = { c: id, turn: st.turnNo, face: true, u: st.un }; }
  else if (exhausts(c)) exileCard(st, s, id, src);
  else p.grave.push(id);
  runCard(st, s, c, "use", { x: 0, cast: true }, st2 => onCardUsed(st2, s, c, then));
}
// one block: check もし (a 質問 is asked last, only when it can still change the result), then なにを or ちがったら
// サイコロ／コイン: 結果は ctx.roll に入り、その効果ブロックの条件・「出た目1につき」・「出た目の回数」で使える
// ガチンコ・ジャッジ（デュエマ）: お互い山札の上を1枚見せて、コスト（パワー版はATK、モンスター以外は0）が相手以上なら勝ち。見せたカードは山札の一番下へ
function gachinko(st, s, c, power){
  const me = P(st, s), op = P(st, O(s)), a = me.deck[0], b = op.deck[0];
  const val = id => { const x = card(id); return power ? (cardType(x) === "monster" ? baseAtk(x) : 0) : costOf(x); };
  const va = a != null ? val(a) : null, vb = b != null ? val(b) : null;
  const win = a != null && (b == null || va >= vb) ? 1 : 0;
  if (a != null) me.deck.push(me.deck.shift()); if (b != null) op.deck.push(op.deck.shift());
  const nm = power ? "パワーガチンコ・ジャッジ" : "ガチンコ・ジャッジ", u = power ? "ATK" : "コスト", sh = (id, v) => id == null ? "山札なし" : `「${card(id).name}」（${u}${fmtN(v)}）`;
  log(st, s, `「${c ? c.name : "？"}」：${nm}！ ${me.name} ${sh(a, va)} vs ${op.name} ${sh(b, vb)} → ${win ? `${me.name}の勝ち` : `${me.name}の負け`}（見せたカードは山札の一番下へ）`);
  ev(st, { type: "gj", s, a, b, va, vb, win, power: !!power });
  return { kind: "gj", v: win, a: va, b: vb };
}
function doRoll(st, s, c, b){
  const die = b.roll === "die", faces = Math.max(2, Math.min(100, Math.round(+b.faces || 6))), cn = die ? 1 : Math.max(1, Math.min(10, Math.round(+b.coins || 1)));
  const flips = die ? [] : Array.from({ length: cn }, () => Math.random() < .5 ? 1 : 0), v = die ? 1 + Math.floor(Math.random() * faces) : flips.reduce((t, x) => t + x, 0);
  log(st, s, `「${c ? c.name : "？"}」：${die ? `サイコロを振った → ${v}` : cn > 1 ? `コインを${cn}回投げた → ${flips.map(x => x ? "表" : "裏").join("・")}（表${v}枚）` : `コインを投げた → ${v ? "表" : "裏"}`}`);
  ev(st, { type: "roll", s, kind: die ? "die" : "coin", v, faces, ...(cn > 1 ? { cn, fl: flips } : {}) });
  return { kind: die ? "die" : "coin", v, n: cn };
}
function runBlockGroup(st, s, c, bs, ctx, then){
  if (bs.length === 1) return runBlock(st, s, c, bs[0], ctx, then);
  const go = (st2, k) => { const b = bs[k]; if (!b) return; log(st2, s, `「${c.name}」：効果ブロック${k + 1}を選んだ`); runBlock(st2, s, c, b, ctx, then); };
  if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c, ctx, then, fx: { kind: "__block", ask: "どの効果ブロックを発動する？" }, pick1: bs.map((b, k) => ({ name: b.bn || `効果 ${k + 1}`, text: blockText(c, b, true) })), p1go: go }); return; }
  go(st, Math.floor(Math.random() * bs.length));
}
// 「1ターンに○度だけ」: 場のモンスター・永続カードはその1枚ごと、それ以外はカードごとに、効果ブロックが出た回数を数える
function limKey(st, s, c, b, ctx){ const p = P(st, s), u = ctx && ctx.eqU ? "e" + ctx.eqU : ctx && ctx.mon ? "m" + ctx.mon.u : ctx && ctx.pz != null && p.sz[ctx.pz] ? "z" + p.sz[ctx.pz].u : "c"; return `${u}:${c && c.id}:${b._bi}`; }
function limUsed(st, s, k){ const t = P(st, s).limT; return t && t.no === st.turnNo ? t.c[k] || 0 : 0; }
function limAdd(st, s, k){ const p = P(st, s); if (!p.limT || p.limT.no !== st.turnNo) p.limT = { no: st.turnNo, c: {} }; p.limT.c[k] = (p.limT.c[k] || 0) + 1; }
function runBlock(st, s, c, b, ctx, then){
  const lk = b.lim > 0 && b._bi != null && !ctx.delayed && !ctx.granted ? limKey(st, s, c, b, ctx) : null;
  if (lk && limUsed(st, s, lk) >= b.lim){ log(st, s, `「${c ? c.name : "？"}」：この効果は1ターンに${b.lim}度だけ（このターンはもう出ない）`); then && then(st); return; }
  // サイコロの出た目のターン後: いまサイコロを振って、出た目の数だけ時計を進める
  if (b.delayDie && !ctx.delayed){ const r = doRoll(st, s, c, { ...b, roll: "die" }); return runBlock(st, s, c, { ...b, delayDie: false, roll: "", delay: Math.max(1, r.v) }, ctx, then); }
  if (b.delay > 0 && !ctx.delayed){
    if (lk) limAdd(st, s, lk);
    st.un = (st.un || 0) + 1; const p = P(st, s);
    (p.timers = p.timers || []).push({ u: st.un, c: c && !c.ctrCard && c.id || null, name: c && c.name || "？", b: { trig: b.trig, join: b.join, ...(b.one ? { one: true, ...(b.oneN > 1 ? { oneN: b.oneN } : {}) } : {}), conds: b.conds, then: b.then, else: b.else, roll: b.roll || "", faces: b.faces, coins: b.coins, dieBr: b.dieBr || [], grant: b.grant || null }, left: b.delay, ctx: { zone: ctx.zone ?? null, mon: ctx.mon || null } });
    log(st, s, `「${c ? c.name : "？"}」：${b.delay === 1 ? "次の自分のターンのはじめ" : b.delay + "ターン後の自分のターンのはじめ"}に効果が出る（時計 ${b.delay}）`);
    then && then(st); return;
  }
  if (b.grant && b.grant.to === "pick" && !ctx.granted){
    const go = (st2, k) => runBlock(st2, s, c, { ...b, grant: { ...b.grant, to: k === 1 ? "op" : "me" } }, ctx, then);
    if (isHumanHere(s)){
      G.chooseQ.push({ ask: true, s, c, ctx, then, fx: { kind: "__block", ask: "どちらに効果を付与する？" }, pick1: [{ name: "自分に付与する", text: blockText(c, { ...b, grant: { ...b.grant, to: "me" } }) }, { name: "相手に付与する", text: blockText(c, { ...b, grant: { ...b.grant, to: "op" } }) }], p1go: go });
      return;
    }
    return go(st, Math.random() < .5 ? 0 : 1);
  }
  if (b.grant && !ctx.granted){
    if (lk) limAdd(st, s, lk);
    st.un = (st.un || 0) + 1; const to = b.grant.to === "op" ? O(s) : s, p = P(st, to);
    (p.boons = p.boons || []).push({ u: st.un, c: c && !c.ctrCard && c.id || null, name: c && c.name || "？", at: b.grant.at, dur: b.grant.dur || 0, left: b.grant.dur || 0, b: { trig: b.grant.at, join: b.join, ...(b.one ? { one: true, ...(b.oneN > 1 ? { oneN: b.oneN } : {}) } : {}), conds: b.conds, then: b.then, else: b.else, roll: b.roll || "", faces: b.faces, coins: b.coins, dieBr: b.dieBr || [] } });
    log(st, s, `「${c ? c.name : "？"}」：${P(st, to).name}に効果を付与した（${P(st, to).name}のターンの${b.grant.at === "turnStart" ? "はじめ" : "おわり"}に出る${b.grant.dur ? `・${b.grant.dur}回` : "・ずっと"}）`);
    then && then(st); return;
  }
  // ネクロマンス: 墓地のカードを消費して発動（足りなければこの効果ブロックは出ない）
  if (b.necro > 0 && !ctx.necroDone){ const p = P(st, s), selfK = c && (cardType(c) === "magic" || cardType(c) === "trap") ? p.grave.lastIndexOf(c.id) : -1, pool = p.grave.length - (selfK >= 0 ? 1 : 0); if (pool < b.necro){ log(st, s, `「${c ? c.name : "？"}」：ネクロマンス${b.necro}（墓地が${pool}枚で足りない）`); then && then(st); return; } const self = selfK >= 0 ? p.grave.splice(selfK, 1) : [], used = p.grave.splice(0, b.necro); p.grave.push(...self); (p.exile = p.exile || []).push(...used); log(st, s, `「${c ? c.name : "？"}」：ネクロマンス${b.necro}！ 墓地のカードを${b.necro}枚消費した`); ctx = { ...ctx, necroDone: true }; }
  if (b.roll === "die" || b.roll === "coin" || b.roll === "gj" || b.roll === "pgj") ctx = { ...ctx, roll: b.roll === "gj" || b.roll === "pgj" ? gachinko(st, s, c, b.roll === "pgj") : doRoll(st, s, c, b) };
  const plain = b.conds.filter(x => x.k !== "ask"), ask = b.conds.find(x => x.k === "ask"), or = b.join === "or";
  const base = plain.length ? (or ? plain.some(x => condMet(st, s, c, x, ctx)) : plain.every(x => condMet(st, s, c, x, ctx))) : !or;
  const go = (st2, ok) => {
    if (lk && ok) limAdd(st2, s, lk);
    if (b.conds.length && !ok) log(st2, s, `「${c.name}」：条件に合わなかった${b.else.length ? "" : "（効果なし）"}`);
    let br = ok && ctx.roll && ctx.roll.kind === "die" && b.dieBr && b.dieBr.length ? b.dieBr.find(x => ctx.roll.v >= x.lo && ctx.roll.v <= x.hi) : null;
    // 当たりの目を増やす: 場のカードの「○〜○も当たり」に入っていたら、当たりの行の効果
    if (ok && !br && ctx.roll && ctx.roll.kind === "die" && b.dieBr && b.dieBr.some(x => x.win)){ const w = dieWinBy(st2, s, c, ctx.roll.v); if (w){ br = b.dieBr.find(x => x.win); log(st2, s, `「${w}」の効果で、出た目${ctx.roll.v}も当たり！`); } }
    if (ok && b.one && b.then.length > 1 && !br) return pickOne(st2, s, c, b.then, ctx, then, b.oneN > 1 ? b.oneN : 1);
    runEffects(st2, s, c, ok ? b.then.concat(br ? br.then : []) : b.else, ctx, then);
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
// 「1つえらんで発動」: 人はボタンでえらぶ、CPUはランダム
// えらぶ: 一覧から1つ。times > 1 なら、その回数えらんで順に発動（同じものをえらんでもよい・パーフェクト呪文）
function pickOne(st, s, c, effs, ctx, then, times = 1, nth = 1){
  const next = st2 => { if (nth < times && !st2.winner) pickOne(st2, s, c, effs, ctx, then, times, nth + 1); else then && then(st2); };
  const go = (st2, k) => { log(st2, s, `「${c.name}」：「${fxOneName(effs[k])}」をえらんだ${times > 1 ? `（${nth}/${times}回目）` : ""}`); runEffects(st2, s, c, [effs[k]], ctx, next); };
  if (isHumanHere(s)){ G.chooseQ.push({ ask: true, pick1: effs.map(e => ({ name: fxOneName(e), text: effsText(c, [e]) })), p1go: go, s, c, fx: { kind: "__block", ask: times > 1 ? `どの効果を発動する？（${nth}/${times}回目）` : "どの効果を発動する？" }, ctx, then }); return; }
  go(st, Math.floor(Math.random() * effs.length));
}
const fxOneName = e => e.dn || (FX_ROW_DEF[e.kind] || [])[0] || String((KINDS[e.kind] || {}).label || "効果").replace(/（.*$/, "").slice(0, 12);
function runEffects(st, s, c, effs, ctx, then){
  const list = [];
  (effs || []).forEach(e => {
    const one = [];
    // 1枚ずつの効果に「ふえる」: 枚数は使うときに決めてから1枚ずつおこなう（runEffect の eachN）
    if (KINDS[e.kind] && KINDS[e.kind].each && e.per && PER_DEFS[e.per]) one.push({ kind: e.kind, n: e.n, ...(e.into ? { into: e.into } : {}), per: e.per, pm: e.pm, hits: e.hits, pf: e.pf, pfn: e.pfn, pctr: e.pctr, pcw: e.pcw, pattr: e.pattr, eachN: true });
    else if (KINDS[e.kind] && KINDS[e.kind].each && e.n > 1){ for (let r = 0; r < e.n; r++) one.push({ kind: e.kind, n: 1, ...(e.into ? { into: e.into } : {}) }); }
    else one.push(...expandFx({ kind: e.kind, n: e.n, to: e.to, ...(e.into ? { into: e.into } : {}), ...(e.intoId ? { intoId: e.intoId } : {}), ...(e.per ? { per: e.per, pm: e.pm, hits: e.hits } : {}), ...(KINDS[e.kind] && KINDS[e.kind].mod ? { mt: e.mt, ms: e.ms, mpl: e.mpl, mc: e.mc, mn: e.mn, gk: e.gk, gn: e.gn, nm: e.nm, ge: e.ge } : {}), ...(e.side ? { side: e.side } : {}), ...fxFields(e), ...(e.tn ? { tn: e.tn } : {}), ...(e.kind === "removeBoard" ? { rside: e.rside, rm: e.rm } : {}), ...(mfOn(e) ? { mfK: e.mfK, mfOp: e.mfOp, mfBy: e.mfBy, mfN: e.mfN, mfA: e.mfA } : {}), ...(KINDS[e.kind] && KINDS[e.kind].ctr ? { ctr: e.ctr, cw: e.cw } : {}), ...(e.per === "ctr" ? { pctr: e.pctr, pcw: e.pcw } : {}), ...(e.per === "attrMon" ? { pattr: e.pattr } : {}), ...(e.per === "usedNow" || e.per === "handF" ? { pf: e.pf, pfn: e.pfn } : {}), ...(e.kind === "giveAb" || e.kind === "loseAb" ? { ab: e.ab, gw: e.gw, gd: e.gd } : {}), ...(e.kind === "giveAttr" ? { aw: e.aw, ga: e.ga, gm: e.gm } : {}), ...(["dblNext", "freeNext", "setCost", "copyPick"].includes(e.kind) ? { pf: e.pf, pfn: e.pfn, cpw: e.cpw, sp: e.sp, sd: e.sd } : {}) }));
    // 「×○回」: the same effect again and again
    const cr = ctx && ctx.roll && ctx.roll.kind === "coin" ? ctx.roll : null;
    const reps = e.timesDie ? (ctx && ctx.roll && ctx.roll.kind === "die" ? ctx.roll.v : 0) : e.timesCoin ? (cr ? (e.timesCoin === "t" ? (cr.n || 1) - cr.v : cr.v) : 0) : Math.max(1, Math.min(20, e.times || 1));
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
// 払うコスト: G・ゼロなら0、シンパシー・スペルブーストで下がる。探査は墓地のぶんだけさらに下げられる
// 逆転劇: 相手のモンスターが自分に直接攻撃しているあいだ、手札からタダで使える（1回の攻撃に1回）。次の自分のターンのはじめにマナを払い、払えなければ負け
function revAtk(st, s){ const pd = st && st.pending, a = !pd ? null : pd.type === "attack" ? pd : pd.type === "chain" && pd.resume && pd.resume.type === "attack" ? pd.resume : null; return a && a.by !== s && a.to === "direct" ? a : null; }
function revOk(st, s, c){ if (!c || c.revG == null || cardType(c) !== "magic" || !P(st, s).hand.includes(c.id)) return false; const a = revAtk(st, s); return !!(a && !a.revUsed); }
function revDue(st, s){ return (P(st, s).revDebt || []).reduce((t, d) => t + (+d.n || 0), 0); }
// コストを○にする（手札のカード）／次に使う○のコスト0
const costSetOf = (st, s, c) => { if (!c) return null; const L = (P(st, s).costSet || []).filter(e => e.id === c.id && (!e.until || st.turnNo <= e.until)); return L.length ? L[L.length - 1] : null; };
const freeNextIdx = (st, s, c) => c ? (P(st, s).freeNext || []).findIndex(e => e.n > 0 && usedMatch(c, e.pf, e.pfn)) : -1;
function baseCost(st, s, c){ const cs = c && !c.costX ? costSetOf(st, s, c) : null; if (cs) return cs.v; return c && c.costX ? 0 : freeNextIdx(st, s, c) >= 0 ? 0 : freeKey(st, s, c) || freeId(st, s, c) || corrupted(st, s, c) || gzOk(st, s, c) || revOk(st, s, c) ? 0 : sbCut(st, s, c, symCost(st, s, c, costOf(c))); }
function effCost(st, s, c){ const b = baseCost(st, s, c), d = c && c.delve && isFinite(b) ? Math.max(0, b - P(st, s).grave.length) : b; return isFinite(d) && P(st, s).mana ? d + taxOn(st, s, c) : d; }
// コスト増加: 相手の場（モンスター・表向きの魔法罠）にあるカードの「相手の○のコスト+n」
function taxOn(st, s, c){
  if (!c || !hasCost(c)) return 0; const o = P(st, O(s)), t = cardType(c); let n = 0;
  const add = x => { const k = x && x.tax; if (k && +k.n > 0 && (k.what === "any" || !k.what || k.what === t)) n += +k.n; };
  o.mz.forEach(m => { if (m && !sealedM(m)) add(card(m.c)); }); o.sz.forEach(z => { if (z && z.face) add(card(z.c)); });
  return n;
}
function sbCut(st, s, c, base){ const n = +(c && c.sbCost) || 0, k = c ? ((P(st, s).sb || {})[c.id] || 0) : 0; return !n || !k || !isFinite(base) ? base : Math.max(0, base - n * k); }
function gzOk(st, s, c){ const g = c && c.gz; if (g && g.where === "none") return hasCost(c); if (!g || !String(g.name || "").trim() || !hasCost(c)) return false; return condMet(st, s, c, { k: "card", name: g.name, where: ["field", "grave", "hand"].includes(g.where) ? g.where : "field", match: ["tag", "part", "exact"].includes(g.match) ? g.match : "tag", cnt: Math.max(1, +g.cnt || 1), op: "ge" }, {}); }
// シンパシー: 自分の場の「タグ／名前に○○が入る」モンスター1体につきコストが下がる（1より下にはならない。もとが0ならそのまま）
// 手札では、シンパシーで下がったあとのコストを見せる
const symView = (st, s, c) => { if (!P(st, s).mana || !c || !hasCost(c) || c.costX || c.costInf) return c; const b = costOf(c), e = effCost(st, s, c); return e < b ? { ...c, cost: e } : c; };
function symCount(st, s, a, self){
  const w = String(a.name || "").trim(), t = symT(a), wh = symW(a);
  const ok = id => { const c = card(id); if (!c) return false; if (t !== "any" && cardType(c) !== t) return false; return !w || tagsOf(c).includes(w) || normQ(c.name || "").includes(normQ(w)); };
  const fieldIds = o => { const p = P(st, o), L = []; p.mz.forEach(m => { if (m){ L.push(m.c); eqsOf(m).forEach(e => { if (e.o === o) L.push(e.c); }); } }); p.sz.forEach(z => { if (z) L.push(z.c); }); ["a", "b"].forEach(x => { if (x !== o) P(st, x).mz.forEach(m => eqsOf(m).forEach(e => { if (e.o === o) L.push(e.c); })); }); if (st.field && st.field.o === o) L.push(st.field.c); return L; };
  const p = P(st, s);
  let L = wh === "grave" ? p.grave : wh === "hand" ? p.hand.slice() : wh === "oppField" ? fieldIds(O(s)) : wh === "both" ? [...fieldIds(s), ...fieldIds(O(s))] : fieldIds(s);
  if (wh === "hand" && self){ const k = L.indexOf(self); if (k >= 0) L.splice(k, 1); }
  return L.filter(ok).length;
}
function symCost(st, s, c, base){
  if (!c || cardType(c) !== "monster" || !isFinite(base) || base <= 1) return base;
  const cut = absOf(c).filter(a => a.k === "sympathy").reduce((t, a) => t + Math.max(1, a.n || 1) * symCount(st, s, a, c.id), 0);
  return cut ? Math.max(1, base - cut) : base;
}
// 追加コスト「LPを○払う」: LPがそれより多くないと使えない（払ってLP0にはならない）
// マナ化（ベイBジャック風）: 自分の場に「マナ化」がいれば、攻撃していないモンスター1体を1マナとして払える
function bayBMons(st, s){ const p = P(st, s); if (!p.mana || !p.mz.some((m, i) => m && hasAb(st, s, i, "bayB"))) return []; return p.mz.map((m, i) => m && !m.attacked && !sealedM(m) ? i : -1).filter(i => i >= 0); }
function canPay(st, s, c){ const p = P(st, s), m = p.mana; return (!m || m.cur + bayBMons(st, s).length >= effCost(st, s, c)) && costWhy(st, s, c) === ""; }
// Activation requirements only inspect the pre-payment state; they never consume cards.
function useCondCount(st, s, x){
  const p = P(st, s), match = id => !x.attr || attrsOf(card(id)).includes(x.attr);
  if (x.where === "grave" || x.where === "hand") return (p[x.where] || []).filter(match).length;
  if (x.where === "mana") return (p.manaZ || []).filter(z => match(z.c)).length;
  let count = p.mz.filter(m => m && (!x.attr || monAttrs(m).includes(x.attr))).length;
  count += p.sz.filter(z => z && match(z.c)).length;
  for (const o of ["a", "b"]) P(st, o).mz.forEach(m => { count += eqsOf(m).filter(e => e.o === s && match(e.c)).length; });
  count += (p.standingEq || []).filter(e => match(e.c)).length;
  if (st.field && st.field.o === s && match(st.field.c)) count++;
  return count;
}
function useCondWhy(st, s, c){
  for (const x of useCondsOf(c)){ const n = useCondCount(st, s, x); if (n < x.n) return `${useCondPart(x)}必要（いま${n}枚）`; }
  return "";
}
// why the 追加コスト can't be paid right now ("" = it can)
function costWhy(st, s, c){
  { const why = useCondWhy(st, s, c); if (why) return why; }
  const p = P(st, s), m = p.mana;
  { const cv = manaCivWhy(st, s, c); if (cv) return cv; }
  if (payLpOf(c) && p.lp <= payLpOf(c)) return `LPが${payLpOf(c)}より多くないと使えない`;
  if (payDiscOf(c)){ const pool = c.payDiscTag ? p.hand.filter(id => hasTag(id, c.payDiscTag)).length - (p.hand.includes(c.id) && hasTag(c.id, c.payDiscTag) ? 1 : 0) : p.hand.length - (c && p.hand.includes(c.id) ? 1 : 0); if (pool < payDiscOf(c)) return c.payDiscTag ? `捨てるタグ「${c.payDiscTag}」の手札が${payDiscOf(c)}枚いる` : `捨てる手札が${payDiscOf(c)}枚いる`; }
  { const cw = ctrPayWhy(st, s, payCtrOf(c), {}); if (cw) return cw; }
  if (payMaxOf(c) && !(m && m.max >= payMaxOf(c))) return m ? `最大マナが${payMaxOf(c)}いる` : "マナを使うデッキ専用";
  return "";
}
// 追加コスト「手札を捨てる」: picks = indices in the hand (after the used card has left it); missing / wrong picks → random
// スライ: 手札から捨てられたら、タダで使う（ターン終了で捨てるときはのぞく）
// エセリアル: ターンの終わりに手札にあると廃棄される
function etherealEnd(st, s){
  const p = P(st, s), gone = p.hand.filter(id => card(id) && card(id).ethereal); if (!gone.length) return;
  p.hand = p.hand.filter(id => !(card(id) && card(id).ethereal)); (p.exile = p.exile || []).push(...gone); p.exhaustedNow = (p.exhaustedNow || 0) + gone.length;
  log(st, s, `エセリアル：手札の${gone.map(id => `「${card(id).name}」`).join("")}が廃棄された`); persistFire(st, s, "exhaust", {});
}
function slyFire(st, s, ids){
  if ((ids || []).length) P(st, s).discNow = (P(st, s).discNow || 0) + ids.length;
  (ids || []).forEach(id => { const c = card(id); if (!c || !c.sly || useCondWhy(st, s, c)) return;
    // マッドネス: モンスターは墓地から特殊召喚
    if (cardType(c) === "monster"){ const p = P(st, s), k = p.grave.lastIndexOf(id); if (k < 0 || freeZone(p.mz, p) < 0) return; p.grave.splice(k, 1); putMon(st, s, id, { log: `マッドネス！ 捨てられた「${c.name}」がタダで場に出た` }); return; }
    if (cardType(c) !== "magic" && cardType(c) !== "trap") return;
    log(st, s, `スライ！ 捨てられた「${c.name}」をタダで使った`); ev(st, { type: "spell", s, c: id }); countPlay(st, s, c); runCard(st, s, c, "use", { sly: true }); });
}
function discardCost(st, s, c, picks){
  if (payDiscAll(c)){ const p = P(st, s), gone = p.hand.splice(0); p.grave.push(...gone); log(st, s, gone.length ? `「${c.name}」のコストで手札をすべて（${gone.length}枚）捨てた` : `「${c.name}」のコスト：捨てる手札はなかった`); slyFire(st, s, gone); return; }
  const n = payDiscOf(c); if (!n) return;
  const p = P(st, s), okJ = j => p.hand[j] != null && (!c.payDiscTag || hasTag(p.hand[j], c.payDiscTag));
  let L = [...new Set((picks || []).map(Number))].filter(okJ);
  if (L.length !== n){ const all = shuffle(p.hand.map((_, j) => j).filter(okJ)); L = all.slice(0, n); }
  const gone = L.sort((a, b) => b - a).map(j => p.hand.splice(j, 1)[0]);
  p.grave.push(...gone); log(st, s, `「${c.name}」のコストで手札の${gone.map(id => `「${card(id).name}」`).join("")}を捨てた`); slyFire(st, s, gone);
}
const shiftPicks = (picks, hi) => (picks || []).map(Number).map(j => hi != null && hi >= 0 && j > hi ? j - 1 : j);
/* ---- マナゾーン（デュエマ式・MTG式）: p.manaZ = [{ c: カード, tap }]、p.mana.cur はタップしていない枚数 ---- */
const MANA_RULES = { grow: "毎ターン1つずつ増える", zone: "マナチャージ（デュエマ式）", land: "土地（MTG式）" };
function applyManaRule(st, rule){
  if (!st || !MANA_RULES[rule] || rule === "grow") return st;
  st.manaRule = rule;
  for (const o of ["a", "b"]){ const p = st.players && st.players[o]; if (!p || !p.mana || p.spire) continue; p.manaZ = []; p.mana = { max: 0, cur: 0 }; p.charged = false; }
  return st;
}
const manaCount = p => p ? (p.manaZ ? p.manaZ.length : p.mana ? p.mana.max : 0) : 0;
const manaFree = p => (p.manaZ || []).filter(x => !x.tap);
// k枚タップする（need の属性を1枚ずつ先に、あとは余っている属性から）
function manaTap(p, k, need = []){
  const Z = p.manaZ; if (!Z) return;
  need.forEach(a => { if (k <= 0) return; const L = Z.filter(x => !x.tap && attrsOf(card(x.c)).includes(a)); if (!L.length) return; L.sort((x, y) => attrsOf(card(x.c)).length - attrsOf(card(y.c)).length); L[0].tap = true; k--; });
  while (k > 0){ const L = Z.filter(x => !x.tap); if (!L.length) break; const cnt = {}; L.forEach(x => attrsOf(card(x.c)).forEach(a => { cnt[a] = (cnt[a] || 0) + 1; })); const sc = x => { const A = attrsOf(card(x.c)); return A.length ? Math.min(...A.map(a => cnt[a])) : 999; }; L.sort((x, y) => sc(y) - sc(x)); L[0].tap = true; k--; }
}
// タップしていない枚数を p.mana.cur に合わせる
function manaSync(p){
  if (!p || !p.manaZ || !p.mana) return; p.mana.max = p.manaZ.length;
  const want = Math.max(0, Math.min(p.mana.cur, p.mana.max)), u = manaFree(p).length;
  if (u > want) manaTap(p, u - want); else if (u < want){ let k = want - u; for (const x of p.manaZ){ if (k <= 0) break; if (x.tap){ x.tap = false; k--; } } }
}
// 文明: カードを使うには、その属性のカードがタップしていないマナに要る
function manaCivWhy(st, s, c){
  const p = P(st, s); if (!p.manaZ || !c || !(effCost(st, s, c) > 0)) return "";
  manaSync(p); const F = manaFree(p), miss = attrsOf(c).filter(a => !F.some(x => attrsOf(card(x.c)).includes(a)));
  return miss.length ? `マナゾーンに${miss.join("・")}属性のカードがない` : "";
}
function chargeWhy(st, s, hi){
  const p = P(st, s), c = card(p.hand[hi]); if (!p.manaZ) return "マナゾーンのないルール";
  if (st.turn !== s || st.pending || st.winner) return "自分のターンだけ"; if (mainSkipped(st, s)) return "メインステップが飛ばされている"; if (p.charged) return "このターンはもう置いた";
  if (!c) return "カードがない"; if (p.exTemp && p.exTemp.i === hi) return "EXデッキのカード";
  if ((p.landOnly || st.manaRule === "land") && !c.mland) return "土地しか置けない";
  return "";
}
// マナゾーンに置く（多色はタップして置く。土地はタップしない）
function manaPut(st, s, id, tapIn){ const p = P(st, s), c = card(id), tap = tapIn != null ? tapIn : attrsOf(c).length >= 2 && !c.mland; p.manaZ.push({ c: id, tap }); p.mana.max = p.manaZ.length; if (!tap) p.mana.cur += 1; landfall(st, s); return tap; }
// 上陸: マナゾーンにカードが置かれるたび（自分のモンスター・装備・永続・レリック）。効果がまたマナを置いても5段まで
function landfall(st, s){
  if (st.winner || (st._landDepth || 0) >= 5) return;
  const L = []; P(st, s).mz.forEach((m, i) => { if (m) monTrigList(st, s, i, "manaPut").forEach(x => { if (x.s === s && hasTrig(x.c, "manaPut")) L.push(x); }); });
  const PL = persistList(st, s, "manaPut", {}); PL.forEach(x => log(st, s, `${x.c.relicView ? "レリック" : "永続"}「${x.c.name}」の効果！`));
  if (!L.length && !PL.length) return;
  st._landDepth = (st._landDepth || 0) + 1;
  runList(st, L.concat(PL), st2 => { st2._landDepth = Math.max(0, (st2._landDepth || 1) - 1); });
}
function manaCharge(st, s, hi){
  if (chargeWhy(st, s, hi)) return false;
  const p = P(st, s); manaSync(p); const id = p.hand.splice(hi, 1)[0], tap = manaPut(st, s, id); p.charged = true;
  log(st, s, `「${card(id).name}」をマナゾーンに置いた${tap ? "（多色なのでタップして置いた）" : ""}（マナ ${p.mana.cur}/${p.mana.max}）`);
  return true;
}
function manaFromDeck(st, s, n, src){ const p = P(st, s); manaSync(p); let k = 0; for (let r = 0; r < Math.max(1, n || 1); r++){ if (!p.deck.length) refill(st, s); if (!p.deck.length) break; manaPut(st, s, p.deck.shift()); k++; } log(st, s, `${src}：山札の上から${k}枚をマナゾーンに置いた（マナ ${p.mana.cur}/${p.mana.max}）`); }
function pay(st, s, c){
  const p = P(st, s), m = p.mana, fk = freeKey(st, s, c);
  let k = !m ? 0 : c && c.costX ? (fk ? 0 : m.cur) : effCost(st, s, c), dv = 0;
  // 探査: マナで払いきれないぶんだけ、墓地のカードを除外する
  if (m && c && c.delve && !c.costX){ const b = baseCost(st, s, c); dv = Math.min(p.grave.length, Math.max(0, b - m.cur)); k = b - dv; }
  if (m && m.cur < k){ const B = bayBMons(st, s); if (m.cur + B.length < k || costWhy(st, s, c)) return false;
    const need = k - m.cur, use = B.sort((a, b) => cmpNum(atkOf(p.mz[a]), atkOf(p.mz[b]))).slice(0, need);
    use.forEach(i => { p.mz[i].attacked = true; }); m.cur += need;
    log(st, s, `マナ化：${use.map(i => `「${card(p.mz[i].c).name}」`).join("")}をマナのかわりにした（このターン攻撃できない）`); }
  if (costWhy(st, s, c)) return false;
  const lpc = payLpOf(c), mx = payMaxOf(c);
  ctrPay(st, s, payCtrOf(c), `「${c.name}」`, {});
  p.playedNow = (p.playedNow || 0) + 1;
  if (c && c.id && (cardType(c) === "monster" || cardType(c) === "equip")) (p.usedNowIds = p.usedNowIds || []).push(c.id);
  // スペルブースト: 使った（出した）ときの回数を覚えておき、手札にもう1枚もなければ0にもどす
  if (c && c.id){ const sbn = (p.sb || {})[c.id] || 0; p.sbLast = { ...(p.sbLast || {}), [c.id]: sbn }; const an = cardType(c) === "monster" ? absOf(c).filter(a => a.k === "sbAtk").reduce((t, a) => t + (a.n || 0), 0) : 0; if (an && sbn) st.sbAtkPend = { id: c.id, add: an * sbn }; if (sbn && p.hand.filter(x => x === c.id).length <= 1){ const o = { ...(p.sb || {}) }; delete o[c.id]; p.sb = o; } }
  if (lpc){ p.lp -= lpc; log(st, s, `「${c.name}」のコストでLPを${lpc}払った`); lostLp(st, s); }
  if (mx && m && p.manaZ){ p.grave.push(...p.manaZ.splice(-mx).map(x => x.c)); m.cur = Math.min(m.cur, manaFree(p).length); manaSync(p); log(st, s, `「${c.name}」のコストでマナゾーンのカード${mx}枚を墓地へ置いた`); }
  else if (mx && m){ m.max -= mx; if (p.spire) p.maxAdj = (p.maxAdj || 0) - mx; log(st, s, `「${c.name}」のコストで最大マナが${mx}減った（${m.cur}/${m.max}）`); }
  if (fk){ p.free[fk]--; log(st, s, `「${c.name}」はコスト0で使える！`); }
  else if (!costSetOf(st, s, c) && freeNextIdx(st, s, c) >= 0 && !(c && c.costX)){ const fi = freeNextIdx(st, s, c), e = p.freeNext[fi]; e.n--; if (e.n <= 0) p.freeNext.splice(fi, 1); log(st, s, `「${c.name}」はコスト0で使える！`); }
  else if (freeId(st, s, c) && !(c && c.costX)){ p.freeIds.splice(p.freeIds.indexOf(c.id), 1); }
  { const cs = costSetOf(st, s, c); if (cs && cs.once) p.costSet.splice(p.costSet.indexOf(cs), 1); }
  if (dv){ const ex = p.grave.splice(0, dv); (p.exile = p.exile || []).push(...ex); log(st, s, `「${c.name}」の探査：墓地のカード${dv}枚を除外した`); }
  if (m){ m.cur -= k; if (p.manaZ){ manaTap(p, Math.max(0, manaFree(p).length - Math.max(0, Math.min(m.cur, p.manaZ.length))), attrsOf(c)); manaSync(p); } } p.lastPaid = k; return true;
}
// ツインパクト: 手札の hi 番目を魔法として使う
function twinWhy(st, s, hi){ const p = P(st, s), id = p.hand[hi], c = card(id); if (!twOf(c)) return "ツインパクトではない"; if (mainSkipped(st, s)) return "メインステップが飛ばされている"; if (twOf(c).accel && p.mana && canPay(st, s, c)) return "アクセラレートは、モンスターのコストが払えないときだけ"; const sp = card(id + "~tw"); return useBlockedWhy(st, s, sp) || (canPay(st, s, sp) ? "" : costWhy(st, s, sp) || "マナが足りない"); }
function castTwin(st, s, hi, ctx = {}){ const p = P(st, s), id = p.hand[hi]; if (!twOf(card(id)) || twinWhy(st, s, hi)) return false; p.hand[hi] = id + "~tw"; if (activate(st, s, "hand", hi, ctx)) return true; if (p.hand[hi] === id + "~tw") p.hand[hi] = id; return false; }
/* ---- そのほかの使い方: サイクリング・墓地から出る・結晶 ---- */
const manaWhy = (st, s, n) => { const p = P(st, s); return n > 0 && p.mana && p.mana.cur < n ? "マナが足りない" : ""; };
const payMana = (st, s, n, why) => { const p = P(st, s); if (n > 0 && p.mana){ p.mana.cur -= n; log(st, s, `${why}でマナを${n}払った（${p.mana.cur}/${p.mana.max}）`); } };
function cycleWhy(st, s, hi){ const c = card(P(st, s).hand[hi]); if (!c || !c.cycle) return "サイクリングがない"; if (st.turn !== s) return "自分のターンだけ"; if (mainSkipped(st, s)) return "メインステップが飛ばされている"; return manaWhy(st, s, +c.cycle.n || 0); }
function cycleCard(st, s, hi){
  if (cycleWhy(st, s, hi)) return false;
  const p = P(st, s), id = p.hand[hi], c = card(id); payMana(st, s, +c.cycle.n || 0, `「${c.name}」のサイクリング`);
  p.hand.splice(hi, 1); p.grave.push(id); log(st, s, `「${c.name}」をサイクリング（捨てて1枚引く）`);
  slyFire(st, s, [id]); drawN(st, s, 1, `「${c.name}」のサイクリング`); checkEnd(st); return true;
}
function graveSumWhy(st, s, gi){ const p = P(st, s), c = card(p.grave[gi]); if (!c || !c.graveSum || cardType(c) !== "monster") return "墓地から出せない"; if (st.turn !== s) return "自分のターンだけ"; if (freeZone(p.mz, p) < 0) return "場がいっぱい"; return manaWhy(st, s, +c.graveSum.n || 0); }
function graveSummon(st, s, gi){
  if (graveSumWhy(st, s, gi)) return false;
  const p = P(st, s), id = p.grave[gi], c = card(id); payMana(st, s, +c.graveSum.n || 0, `「${c.name}」`);
  p.grave.splice(gi, 1); putMon(st, s, id, { log: `「${c.name}」が墓地から場に出た！` }); checkEnd(st); return true;
}
function crystWhy(st, s, hi){ const p = P(st, s), c = card(p.hand[hi]); if (!c || !c.cryst || cardType(c) !== "monster") return "結晶がない"; if (st.turn !== s) return "自分のターンだけ"; if (mainSkipped(st, s)) return "メインステップが飛ばされている"; if (freeZone(p.sz, p) < 0) return "魔法・罠ゾーンがいっぱい"; return manaWhy(st, s, +c.cryst.n || 0); }
function crystPlace(st, s, hi){
  if (crystWhy(st, s, hi)) return false;
  const p = P(st, s), id = p.hand[hi], c = card(id), z = freeZone(p.sz, p); payMana(st, s, +c.cryst.n || 0, `「${c.name}」の結晶`);
  p.hand.splice(hi, 1); st.un = (st.un || 0) + 1; p.sz[z] = { c: id, turn: st.turnNo, face: true, u: st.un, cryst: true, cd: Math.max(1, +c.cryst.k || 2) };
  log(st, s, `「${c.name}」を結晶として置いた（カウントダウン${p.sz[z].cd}）`); ev(st, { type: "spell", s, c: id }); return true;
}
// カウントダウン: 自分のターンのはじめに1減る。0になったら、結晶は場に出て、ほかは「0になったとき」の効果のあと破壊
function cdTick(st, s){
  const p = P(st, s), L = [];
  p.sz.forEach((z, i) => { if (!z || !z.face) return; const c = card(z.c); const k = z.cryst ? z.cd : c && c.countdown ? (z.cd != null ? z.cd : +c.countdown) : null; if (k == null) return;
    z.cd = k - 1; log(st, s, `「${c.name}」のカウントダウン：${z.cd}`);
    if (z.cd > 0) return;
    if (z.cryst){ p.sz[i] = null; if (putMon(st, s, z.c, { log: `結晶の「${c.name}」が場に出た！` }) < 0){ p.grave.push(z.c); log(st, s, `場がいっぱいで「${c.name}」は出られなかった`); } return; }
    if (hasTrig(c, "cdEnd")) L.push({ s, c, trig: "cdEnd", ctx: { pz: i } });
    L.push({ s, c: { id: "__cd", name: c.name }, trig: "__cdKill", ctx: { pz: i, u: z.u } });
  });
  return L;
}
// a card with 「手札を捨てる」 cost: the human picks which ones first (hi = the used card's hand index, -1 if it isn't in the hand)
const st0 = () => G.st;
function withDiscard(c, hi, go){
  const n = payDiscOf(c);
  if (!n || !G || G.mode === "spectate"){ go([]); return; }
  G.costPick = { name: c.name, hi, need: n, picked: [], go, tag: c.payDiscTag || "" }; renderAll();
}
// フュージョン（シャドバの融合）: なぜ今はフュージョンできないか（"" ならできる）・フュージョンできる手札・フュージョンする
function hfOpts(st, s, hi){ const p = P(st, s), g = hfOf(card(p.hand[hi])); return g ? p.hand.map((id, j) => j).filter(j => j !== hi && hfMatch(g, card(p.hand[j]))) : []; }
function hfWhy(st, s, hi){
  const p = P(st, s), c = card(p.hand[hi]); if (!hfOf(c)) return "フュージョンできないカード";
  if (st.turn !== s || st.pending || st.winner) return "自分のターンだけ"; if (mainSkipped(st, s)) return "メインステップが飛ばされている";
  if (p.hfT && p.hfT.no === st.turnNo && p.hfT.ids.includes(c.id)) return "このターンはもうフュージョンした";
  if (!hfOpts(st, s, hi).length) return "フュージョンできる手札がない";
  return "";
}
function fuseHand(st, s, hi, picks){
  if (hfWhy(st, s, hi)) return false;
  const p = P(st, s), id = p.hand[hi], ok = new Set(hfOpts(st, s, hi));
  picks = [...new Set((picks || []).map(Number))].filter(j => ok.has(j)); if (!picks.length) return false;
  const gone = picks.sort((a, b) => b - a).map(j => p.hand.splice(j, 1)[0]).reverse();
  (p.exile = p.exile || []).push(...gone);
  const n = ((p.hf || {})[id] || 0) + gone.length; p.hf = { ...(p.hf || {}), [id]: n };
  const t = ((p.hfX || {})[id] || 0) + 1; p.hfX = { ...(p.hfX || {}), [id]: t }; p.hfTotal = (p.hfTotal || 0) + 1;
  if (!p.hfT || p.hfT.no !== st.turnNo) p.hfT = { no: st.turnNo, ids: [] }; p.hfT.ids.push(id);
  log(st, s, `「${card(id).name}」に${gone.map(x => `「${card(x).name}」`).join("")}をフュージョンした（フュージョン ${n}枚・${t}回目）`);
  ev(st, { type: "spell", s, c: id });
  // 「このカードにフュージョンしたとき（手札で）」と、場の「自分がフュージョンしたとき」
  const c = card(id), L = [];
  const hctx = { hfN: n, hfTimes: t, fuseN: gone.length, inHand: id, fused: id };
  if (hasTrig(c, "fuse")) L.push({ c, trig: "fuse", ctx: hctx });
  // 手札のこのカード自身の「自分がフュージョンしたとき」も出る（このカードもフュージョンしたので）
  if (hasTrig(c, "myFuse")) L.push({ c, trig: "myFuse", ctx: hctx });
  p.mz.forEach((m, i) => { if (m && hasTrig(card(m.c), "myFuse")) L.push({ c: card(m.c), trig: "myFuse", ctx: { zone: i, mon: { s, i, u: m.u }, fuseN: gone.length, fused: id } }); });
  const step = (st2, k) => { if (k >= L.length || st2.winner){ checkEnd(st2); return; } runCard(st2, s, L[k].c, L[k].trig, L[k].ctx, st3 => step(st3, k + 1)); };
  step(st, 0);
  return true;
}
// 手札から出したとき: フュージョンした枚数を受けとる（手札の記録は消える）
function hfTake(p, id){ const n = (p.hf || {})[id] || 0; if (p.hf && p.hf[id] != null){ const o = { ...p.hf }; delete o[id]; p.hf = o; } return n; }
// 手札で変化したとき: 変化先は新しいカードなので、フュージョンした枚数と回数は0から数えなおす（少しずつフュージョンして段階的に進化できる）。
// 「1ターンに1回」はひきつぐ（変化してすぐ同じターンにもう1回フュージョンはできない）
function hfMove(p, from, to, st){
  for (const k of ["hf", "hfX"]){ const o = p[k]; if (!o || o[from] == null) continue; const q = { ...o }; delete q[from]; delete q[to]; p[k] = q; }
  if (p.hfT && st && p.hfT.no === st.turnNo && p.hfT.ids.includes(from) && !p.hfT.ids.includes(to)) p.hfT.ids.push(to);
}
// フュージョンした回数も同じように受けとる
function hfTakeX(p, id){ const n = (p.hfX || {})[id] || 0; if (p.hfX && p.hfX[id] != null){ const o = { ...p.hfX }; delete o[id]; p.hfX = o; } return n; }
function canSummonNow(st, s){ if (mainSkipped(st, s)) return false; return P(st, s).mana ? true : !st.summoned; }
function canAct(st, s){ return !(G && G.spectate) && st.turn === s && !st.pending && !st.askQ && !st.winner && !(G && G.chooseQ.length); }
// mats: 質量にする墓地の場所（なければ古い順に自動）
function summon(st, s, hi, zi, disc, trib, mats){
  const p = P(st, s), id = p.hand[hi], evo = isDmEvo(card(id)), need = evo ? 0 : tribOf(card(id), st, s), ms = evo ? 0 : massOf(card(id));
  if (evo){ const B = evoBases(st, s, card(id)); if (!B.length) return false; if (zi == null || !B.includes(+zi)) zi = B.sort((a, b) => cmpNum(atkOf(p.mz[a]), atkOf(p.mz[b])))[0]; zi = +zi; }
  if (ms){ if (p.grave.length < ms) return false; let L = [...new Set((mats || []).map(Number))].filter(j => p.grave[j] != null); if (L.length !== ms) L = p.grave.map((_, j) => j).slice(0, ms); mats = L; }
  let z = evo ? zi : (zi != null && !p.mz[zi]) ? zi : glZone(st, s, id);
  if (need){ const tt = card(id).tribTag; trib = [...new Set((trib || []).map(Number))].filter(i => p.mz[i] && !monCannotLeave(p.mz[i]) && (!tt || hasTag(p.mz[i].c, tt))); if (trib.length !== need) return false; }
  if (!canSummonNow(st, s) || (z < 0 && !need) || cardType(card(id)) !== "monster" || !canPay(st, s, card(id)) || (ssOf(card(id)) || {}).only || isFusion(card(id)) || sxOf(card(id))) return false;
  if (!pay(st, s, card(id))) return false;
  let matIds = [];
  if (ms){ matIds = mats.slice().sort((a, b) => b - a).map(j => p.grave.splice(j, 1)[0]).reverse(); log(st, s, `墓地の${matIds.map(x => `「${card(x).name}」`).join("")}を質量にした`); }
  p.hand.splice(hi, 1); if (!p.mana) st.summoned = true; const hfN = hfTake(p, id), hfX = hfTakeX(p, id);
  discardCost(st, s, card(id), shiftPicks(disc, hi));
  let tribAtk = 0;
  if (need){ tribAtk = trib.reduce((a, i) => a + Math.max(0, atkOf(p.mz[i]) || 0), 0); log(st, s, `${trib.map(i => `「${card(p.mz[i].c).name}」`).join("")}を生贄にした`); trib.forEach(i => sendToGrave(st, s, i)); z = (zi != null && !p.mz[zi]) ? zi : trib.includes(z) || z < 0 ? trib[0] : z; }
  const label = `「${card(id).name}」（ATK ${fmtN(baseAtk(card(id)))}）を${evo ? `「${card(p.mz[z].c).name}」から進化` : "召喚"}${p.mana ? `（コスト${costLabel(card(id))}）` : ""}`;
  // the opponent gets a window only if they hold something that can counter it
  if (sumWin(st, s, id)){
    st.chain = [{ s, c: id, summon: true, cast: true, hfN, hfX, tribAtk, z, ctx: { zone: z }, mats: matIds, ...(evo ? { evo: true, bu: p.mz[z].u } : {}) }];
    log(st, s, `${label}しようとしている…`);
    st.pending = { type: "chain", by: s, wait: true, resume: null };
    return true;
  }
  if (evo) evoPut(st, s, z, id); else { p.mz[z] = mkMon(st, id); if (matIds.length) p.mz[z].mats = matIds; }
  if (hfN && p.mz[z]) p.mz[z].hfN = hfN;
  if (hfX && p.mz[z]) p.mz[z].hfTimes = hfX;
  if (tribAtk && p.mz[z]) p.mz[z].tribAtk = tribAtk;
  log(st, s, label); ev(st, { type: "summon", s, z });
  trigger(st, s, card(id), "summon", { zone: z, mon: { s, i: z, u: p.mz[z].u }, cast: true });
  enterFire(st, s, "summon");
  onCardUsed(st, s, card(id), null, p.mz[z] && p.mz[z].u);
  summonedWindow(st, s, z, false);
  return true;
}
// why special summon of hand[hi] isn't possible right now ("" = it is)
function ssBlock(st, s, hi){
  const p = P(st, s), op = P(st, O(s)), c = card(p.hand[hi]), ss = ssOf(c);
  if (isFusion(c)) return "融合召喚でしか出せないカード";
  if (sxOf(c)) return isXyz(c) ? "エクシーズ召喚でしか出せないカード" : "シンクロ召喚でしか出せないカード";
  if (!ss) return "特殊召喚できないカード";
  if (!canPay(st, s, c)) return "マナが足りない";
  const mine = p.mz.filter(Boolean).length;
  let ok = true;
  if (ss.cond === "oppHas") ok = op.mz.filter(Boolean).length >= Math.max(1, +ss.n || 1);
  if (ss.cond === "myEmpty") ok = !mine;
  if (ss.cond === "oppMore") ok = op.mz.filter(Boolean).length > mine;
  if (ss.cond === "lp") ok = p.lp <= ss.n;
  if (ss.cond === "grave") ok = p.grave.length >= ss.n;
  if (ss.cond === "name"){ const w = normQ(ss.name).trim(); ok = !!w && p.mz.filter(m => m && !m.cp && normQ(card(m.c).name).includes(w)).length >= Math.max(1, +ss.n || 1); }
  if (!ok) return "条件がそろっていない";
  if (ss.cost === "tribute" && p.mz.filter(m => m && !monCannotLeave(m)).length < ss.cn) return "墓地へ送るモンスターが足りない";
  if (ss.cost === "discard" && p.hand.length - 1 < ss.cn) return "捨てる手札が足りない";
  if (ss.cost === "lp" && p.lp <= ss.cn) return "LPが足りない";
  if (ss.cost !== "tribute" && freeZone(p.mz, p) < 0) return "場がいっぱい";
  return "";
}
const canSpecial = (st, s, hi) => st.turn === s && !st.pending && !st.winner && !mainSkipped(st, s) && !ssBlock(st, s, hi);
// a monster (and whatever is stuck on it) goes to the graveyard without being "destroyed"
function sendToGrave(st, s, i){
  const p = P(st, s), m = p.mz[i]; if (!m || monCannotLeave(m)) return false;
  leaveEquips(st, m);
  p.mz[i] = null; P(st, m.owner || s).grave.push(...(m.cp ? [] : [m.c])); p.grave.push(...(m.mats || [])); sealsOut(st, m); ev(st, { type: "destroy", s, z: i });
}
// picks: my monster zones (tribute) or other hand indexes (discard)
function specialSummon(st, s, hi, picks = []){
  if (!canSpecial(st, s, hi)) return false;
  const p = P(st, s), id = p.hand[hi], c = card(id), ss = ssOf(c);
  const need = ss.cost === "tribute" || ss.cost === "discard" ? ss.cn : 0;
  picks = [...new Set(picks.map(Number))];
  if (picks.length !== need) return false;
  if (ss.cost === "tribute" && !picks.every(i => p.mz[i] && !monCannotLeave(p.mz[i]))) return false;
  if (ss.cost === "discard" && !picks.every(i => i !== hi && p.hand[i] != null)) return false;
  pay(st, s, c);
  let paid = "";
  if (ss.cost === "tribute"){ paid = picks.map(i => `「${card(p.mz[i].c).name}」`).join(""); picks.forEach(i => sendToGrave(st, s, i)); paid += "を墓地へ送って"; }
  if (ss.cost === "lp"){ p.lp -= ss.cn; paid = `LPを${ss.cn}払って`; }
  const gone = ss.cost === "discard" ? picks.map(i => p.hand[i]) : [];
  [hi, ...(ss.cost === "discard" ? picks : [])].sort((a, b) => b - a).forEach(i => p.hand.splice(i, 1));
  if (gone.length){ p.grave.push(...gone); paid = `手札を${gone.length}枚捨てて`; }
  const z = freeZone(p.mz, p);
  if (z < 0){ p.grave.push(id); log(st, s, `場がいっぱいで「${c.name}」は出られなかった`); return true; }
  // the opponent may answer with a cancel, just like a normal summon (the cost stays paid)
  if (sumWin(st, s, id)){
    st.chain = [{ s, c: id, summon: true, special: true, z, ctx: { zone: z } }];
    log(st, s, `${paid ? paid + "、" : ""}「${c.name}」（ATK ${fmtN(baseAtk(c))}）を特殊召喚しようとしている…`);
    st.pending = { type: "chain", by: s, wait: true, resume: null };
    return true;
  }
  p.mz[z] = mkMon(st, id);
  ev(st, { type: "summon", s, z });
  log(st, s, `${paid ? paid + "、" : ""}「${c.name}」（ATK ${fmtN(baseAtk(c))}）を特殊召喚！`);
  trigger(st, s, c, "ssummon", { zone: z, mon: { s, i: z, u: p.mz[z].u } });
  enterFire(st, s, "put");
  onCardUsed(st, s, c, null, p.mz[z] && p.mz[z].u);
  summonedWindow(st, s, z, true);
  return true;
}
function setCard(st, s, hi, zi){
  const p = P(st, s), id = p.hand[hi], z = (zi != null && !p.sz[zi]) ? zi : freeZone(p.sz, p);
  // スパイア風 cards can't be set (no keeping cards past the end of the turn)
  if (z < 0 || mainSkipped(st, s) || cardType(card(id)) === "monster" || cardType(card(id)) === "equip" || card(id).frame === "spire") return false;
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
  const id = from === "hand" ? p.hand[i] : from === "grave" ? p.grave[i] : p.sz[i] && p.sz[i].c; if (!id) return false;
  if (from === "sz" && p.sz[i].fcp) return false;
  const c = card(id), t = cardType(c);
  if (t === "monster" || t === "equip") return false;
  if (from === "hand" && (t !== "magic" || mainSkipped(st, s))) return false;
  if (from === "grave" && (t !== "magic" || !c.flashback)) return false;
  if (useBlockedWhy(st, s, c)) return false;
  const keep = isPersist(c), pz = keep ? (from === "sz" ? i : freeZone(p.sz, p)) : -1;
  if (keep && pz < 0) return false;
  const fms = isField(c) ? massOf(c) : 0; if (fms && p.grave.length < fms) return false;
  const revNow = from === "hand" && revOk(st, s, c);
  if (!pay(st, s, c)) return false;
  if (revNow){ revAtk(st, s).revUsed = true; const n = Math.max(0, +c.revG || 0); (p.revDebt = p.revDebt || []).push({ n, name: c.name }); log(st, s, `逆転劇！「${c.name}」をタダで発動（次の自分のターンのはじめにマナを${n}払う。払えなければ負け）`); }
  // キッカー: 人は「キッカーも払って発動」で、CPUは払えるときはいつも払う
  { const kk = Math.max(0, +c.kick || 0); if (kk && p.mana && (ctx.kick || c.kickAuto || (ctx.kick == null && typeof G !== "undefined" && G && G.mode === "cpu" && s !== G.slot)) && p.mana.cur >= kk){ p.mana.cur -= kk; ctx = { ...ctx, kicked: true }; log(st, s, `「${c.name}」：${c.kickAuto ? "エンハンス" : "キッカー"}${kk}を払った！`); } }
  if (c.costX){ ctx = { ...ctx, x: p.lastPaid || 0 }; log(st, s, `「${c.name}」：X = ${p.lastPaid || 0}`); }
  if (from === "hand"){ p.hand.splice(i, 1); const hn = hfTake(p, id), hx = hfTakeX(p, id); if (hn) ctx = { ...ctx, hfN: hn }; if (hx) ctx = { ...ctx, hfTimes: hx }; }
  else if (from === "grave") p.grave.splice(i, 1);
  else { var wasCp = !!(p.sz[i] && p.sz[i].cp); p.sz[i] = null; }
  countPlay(st, s, c);
  discardCost(st, s, c, shiftPicks(ctx.disc, from === "hand" ? i : null));
  // 永続: stays face-up in the magic/trap zone
  if (isField(c)){ placeField(st, s, id); if (fms){ st.field.mats = p.grave.splice(0, fms); log(st, s, `墓地の${fms}枚を「${c.name}」の質量にした`); } }
  else if (keep){ st.un = (st.un || 0) + 1; p.sz[pz] = { c: id, turn: st.turnNo, face: true, u: st.un }; }
  else if (exhausts(c) || corrupted(st, s, c) || from === "grave") (p.exile = p.exile || []).push(twBase(id));
  else if (!wasCp) p.grave.push(twBase(id));
  ev(st, { type: "spell", s, c: id });
  if (from === "grave") log(st, s, `「${c.name}」を墓地から発動（フラッシュバック）。使ったあとは廃棄される`);
  // ワン・ツーパンチ: this attack is played twice
  if (isAttackCard(c) && cardType(c) === "magic" && p.dblAtk > 0){ p.dblAtk--; ctx = { ...ctx, dbl: true }; log(st, s, `「${c.name}」をもう1回プレイする！`); }
  if (!ctx.dbl){ const di = (p.dblNext || []).findIndex(e => e.n > 0 && usedMatch(c, e.pf, e.pfn)); if (di >= 0){ const e = p.dblNext[di]; e.n--; if (e.n <= 0) p.dblNext.splice(di, 1); ctx = { ...ctx, dbl: true }; log(st, s, `「${c.name}」をもう1回発動する！`); } }
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
  if (link.cancel || ["cancel", "reflectFx"].includes((normFx(card(id)) || {}).kind)) link.target = st.chain.length - 1;
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
  if (old && cannotLeave(old.c)) return false;
  if (old){ P(st, old.o).grave.push(old.c, ...(old.mats || [])); log(st, s, `フィールド「${card(old.c).name}」は墓地へ（新しいフィールドが出た）`); }
  st.un = (st.un || 0) + 1; st.field = { c: id, o: s, u: st.un };
  log(st, s, `フィールド「${card(id).name}」が出た`);
}
const fieldCard = st => st && st.field ? card(st.field.c) : null;
function onCardUsed(st, user, c, then, exU){
  const t = cardType(c), sp = t === "magic" || t === "trap"; if (!c || (st._usedDepth || 0) > 2 || st.winner){ then && then(st); return; }
  const used = { c: c.id, s: user }, L = [];
  for (const o of ["a", "b"]){
    const p = P(st, o);
    p.mz.forEach((m, i) => { if (!m) return; const mc = card(m.c), ctx = { used, zone: i, mon: { s: o, i, u: m.u } }; if (sp && hasTrig(mc, "anyUse")) L.push({ s: o, c: mc, trig: "anyUse", ctx }); if (m.u !== exU && hasTrig(mc, "cardUse")) L.push({ s: o, c: mc, trig: "cardUse", ctx }); });
    if (!sp) continue;
    persistList(st, o, "anyUse", { used }).forEach(x => L.push(x));
    if (o === user && fieldCard(st) && hasTrig(fieldCard(st), "anyUse") && (!fieldCard(st).fieldMine || st.field.o === user)) L.push({ s: user, c: fieldCard(st), trig: "anyUse", ctx: { used, field: true } });
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
      if (link.negated){ p.grave.push(link.c, ...(link.mats || [])); log(st2, link.s, `「${c.name}」の${link.special ? "特殊召喚" : "召喚"}は打ち消された！`); step(st2); return; }
      if (link.evo){ const b = p.mz[link.z];
        if (!b || b.u !== link.bu){ p.grave.push(link.c); log(st2, link.s, `進化元がいなくなって、「${c.name}」は出られなかった`); step(st2); return; }
        evoPut(st2, link.s, link.z, link.c); log(st2, link.s, `「${c.name}」が「${card(b.c).name}」から進化した！`); ev(st2, { type: "summon", s: link.s, z: link.z });
        runCard(st2, link.s, c, "summon", { zone: link.z, mon: { s: link.s, i: link.z, u: p.mz[link.z].u }, cast: !!link.cast }, st3 => enterFire(st3, link.s, "summon", st4 => onCardUsed(st4, link.s, c, step, (P(st4, link.s).mz[link.z] || {}).u))); return; }
      let z = p.mz[link.z] ? glZone(st2, link.s, link.c) : link.z;
      if (z < 0){ p.grave.push(link.c); log(st2, link.s, `場がいっぱいで「${c.name}」は出られなかった`); step(st2); return; }
      p.mz[z] = mkMon(st2, link.c); if (link.ctx && link.ctx.strig) p.mz[z].strigSick = st2.turn === link.s ? st2.turnNo : (st2.turnNo || 0) + 1; if ((link.mats || []).length) p.mz[z].mats = link.mats.slice(); if (link.hfN) p.mz[z].hfN = link.hfN; if (link.hfX) p.mz[z].hfTimes = link.hfX; if (link.tribAtk) p.mz[z].tribAtk = link.tribAtk;
      log(st2, link.s, `「${c.name}」の${link.special ? "特殊召喚" : "召喚"}に成功！`); ev(st2, { type: "summon", s: link.s, z });
      runCard(st2, link.s, c, link.special ? "ssummon" : "summon", { zone: z, mon: { s: link.s, i: z, u: p.mz[z].u }, cast: !!link.cast && !link.special }, st3 => enterFire(st3, link.s, link.special ? "put" : "summon", st4 => onCardUsed(st4, link.s, c, step, (P(st4, link.s).mz[z] || {}).u)));
      return;
    }
    if (link.negated){
      log(st2, link.s, `「${c.name}」の発動は${link.reflect ? "跳ね返された" : "無効になった"}`);
      if (link.pz != null){ const p = P(st2, link.s), z = p.sz[link.pz]; if (z && z.u === link.pu && !cannotLeave(z.c)){ p.sz[link.pz] = null; p.grave.push(z.c); } }
      if (st2.field && st2.field.c === link.c && st2.field.o === link.s){ P(st2, link.s).grave.push(st2.field.c); st2.field = null; }
      // 跳ね返し: その効果は跳ね返した人が使ったことになる（相手をねらう効果は、もとの持ち主に向かう）
      if (link.reflect && !st2.winner){ ev(st2, { type: "spell", s: link.reflect, c: link.c }); runCard(st2, link.reflect, c, "use", { reflected: true }, step); return; }
      step(st2); return;
    }
    if ((normFx(c) || {}).kind === "reflectFx"){
      const t = chain[link.target];
      if (t && !t.summon && noNegLink(t)) log(st2, link.s, `「${card(t.c).name}」は打ち消されない！`);
      else if (t && !t.summon && !t.negated){ t.negated = true; t.reflect = link.s; ev(st2, { type: "counter", s: link.s }); log(st2, link.s, `「${c.name}」で「${card(t.c).name}」を跳ね返す！`); }
      else log(st2, link.s, `「${c.name}」：跳ね返すカードがない`);
      step(st2); return;
    }
    if (link.cancel || (normFx(c) || {}).kind === "cancel"){
      const t = chain[link.target];
      if (noNegLink(t)) log(st2, link.s, `「${card(t.c).name}」の${t.summon ? "召喚" : "発動"}は打ち消されない！`);
      else if (t){ t.negated = true; ev(st2, { type: "counter", s: link.s }); log(st2, link.s, `「${c.name}」で「${card(t.c).name}」の${t.summon ? (t.special ? "特殊召喚" : "召喚") : "発動"}を打ち消す！`); }
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
  const pd = st.pending; if (!pd || st.winner){ if (!pd && !st.winner && (st.strigQ || st.brkQ)) shieldStep(st); return; }
  if (pd.type === "attack" && pd.strigResume){
    delete pd.strigResume;
    // ターンを飛ばす効果は、保留中の直接攻撃を終えてからターン終了へ進む。
    const r = st.endTurnRequested;
    if (r && r.s === st.turn && r.no === st.turnNo){ st.pending = null; flushTurnEndRequest(st); return; }
    attackResponse(st, pd.by);
  }
  else if (pd.type === "attack") resolveAttack(st);
  else if (pd.type === "end") finishEndTurn(st);
  else if (pd.type === "summoned") st.pending = null;
}
// 「召喚を打ち消されない」モンスター: 相手は召喚に答えられない（打ち消しのチャンスを出さない）
const noNegSum = id => absOf(card(id)).some(a => a.k === "noNegSummon") || !!(card(id) || {}).noNeg;
// 《打ち消されない》: 発動・召喚のどちらも、打ち消し・跳ね返しで無効にされない
const noNegLink = t => !!t && (t.summon ? noNegSum(t.c) : !!(card(t.c) || {}).noNeg);
const sumWin = (st, s, id) => !noNegSum(id) && responseOptions(st, O(s), "summon").length > 0;
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
  if (isAtkReply(fx) && win !== "attack" && win !== "chainAttack") return false;
  if (fx && fx.kind === "cancel" && win !== "chain" && win !== "chainAttack" && win !== "summon") return false;
  if (fx && (fx.kind === "cancel" || fx.kind === "reflectFx")){ const top = st.chain && st.chain[st.chain.length - 1]; if (noNegLink(top)) return false; }
  if (fx && fx.kind === "reflectFx"){ const top = st.chain && st.chain[st.chain.length - 1]; if ((win !== "chain" && win !== "chainAttack") || !top || top.summon || top.s === s || top.cancel) return false; }
  if (win === "summon" && (!fx || fx.kind !== "cancel")) return false;
  const opts = useTargets(st, s, fx);
  return !(opts && !opts.length);
}
// equips with the "cancel once" ability that player s owns
function eqCancelOptions(st, s, win){
  if (win !== "chain" && win !== "chainAttack" && win !== "summon") return [];
  { const top = st.chain && st.chain[st.chain.length - 1]; if (noNegLink(top)) return []; }
  const out = [];
  for (const o of ["a", "b"]) P(st, o).mz.forEach(m => eqsOf(m).forEach(e => { if (e.o === s && !e.used && absOf(card(e.c)).some(a => a.k === "negateOnce")) out.push({ from: "eq", i: e.u, c: card(e.c) }); }));
  return out;
}
// everything player s may activate in a response window: set traps, set quick spells, quick spells in hand
function responseOptions(st, s, win){
  const p = P(st, s), out = [];
  p.sz.forEach((z, i) => { if (!z || z.face) return; const c = card(z.c); if ((cardType(c) === "trap" || isQuick(c)) && z.turn < st.turnNo && canPay(st, s, c) && usableIn(st, s, c, win)) out.push({ from: "sz", i, c }); });
  p.hand.forEach((id, i) => { const c = card(id), rv = win === "attack" || win === "chainAttack" ? revOk(st, s, c) : false; if ((isQuick(c) || rv) && canPay(st, s, c) && usableIn(st, s, c, win)) out.push({ from: "hand", i, c, ...(rv ? { rev: +c.revG || 0 } : {}) }); });
  // 相手のターンにも使える起動効果（クイック）: 相手の攻撃・ターン終わり・チェーンに答えて使える
  if (st.turn !== s && win !== "summon") p.mz.forEach((m, i) => { if (m && !actWhy(st, s, i, true)) out.push({ from: "act", i, c: card(m.c) }); });
  return out.concat(eqCancelOptions(st, s, win), win === "attack" ? blockOpts(st, s) : []);
}
function usableTraps(st, s){ return responseOptions(st, s, "attack").filter(o => o.from === "sz").map(o => o.i); }
// where monster `from` may attack: L = opponent zones, direct = may attack directly
const topOnlyMon = (st, s, i) => !!(P(st, s).mz[i] && (P(st, s).mz[i].topOnly || hasAb(st, s, i, "topOnly")));
// タップ（シールドデッキ）: シールドデッキのモンスターは攻撃・ブロックでタップし、自分のターンのはじめにアンタップ。
// アンタップ中のシールドデッキのモンスターは、突進を持つモンスターにしか攻撃されない
const canHitUntapped = (st, s, i) => { const m = P(st, s).mz[i]; return !!m && (hasAb(st, s, i, "rush") || m.rushTurn === st.turnNo); };
function atkTargets(st, s, from){
  const o = O(s), op = P(st, o), hitU = !op.shieldOn || canHitUntapped(st, s, from), all = op.mz.map((x, j) => x ? j : -1).filter(j => j >= 0 && !hiddenMon(st, o, j) && (hitU || op.mz[j].tap)), tt = tauntIdx(st, o).filter(j => all.includes(j)), top = topOnlyMon(st, s, from);
  // 飛行: 飛行・対空を持つモンスターにしか攻撃されない
  const air = hasAb(st, s, from, "flying") || hasAb(st, s, from, "reach"), fly = j => hasAb(st, o, j, "flying");
  let L = (tt.length ? tt : all).filter(j => air || !fly(j));
  if (top && L.length){ const mx = Math.max(...L.map(j => atkOf(op.mz[j]))); L = L.filter(j => atkOf(op.mz[j]) === mx); }
  { const aa = monAbs(st, s, from).filter(a => a.k === "atkAttr").map(a => String(a.name || "").replace(/属性$/, "").trim()).filter(Boolean); if (aa.length) L = L.filter(j => aa.every(x => monAttrs(op.mz[j]).includes(x))); }
  const flyDirect = hasAb(st, s, from, "flying") && !all.some(j => fly(j) || hasAb(st, o, j, "reach"));
  // シールドデッキの相手には、場にモンスターがいても直接攻撃できる（止めるのはブロッカー）
  if (op.shieldOn) return { L, direct: !rushOnly(st, s, from), top, taunt: tt.length > 0 };
  return { L, direct: !rushOnly(st, s, from) && !tt.length && (!all.length || (!top && (hasAb(st, s, from, "direct") || flyDirect))), top, taunt: tt.length > 0 };
}

/* ---- エボルヴ（シャドバ風）: ゲーム中2回・1ターンに1回・自分の3ターン目（ターン5）から ---- */
const EVO_MAX = 2;
function evoWhy(st, s, i){
  const p = P(st, s), m = p.mz[i]; if (!m || !hasAb(st, s, i, "evolve")) return "エボルヴできない";
  if (m.evolved) return "もうエボルヴしている";
  if (st.turn !== s) return "自分のターンだけ";
  if (st.turnNo < 5) return "自分の3ターン目からエボルヴできる";
  if ((p.evoUsed || 0) >= EVO_MAX) return "エボルヴポイントがもうない";
  if (p.evoTurn === st.turnNo) return "このターンはもうエボルヴした";
  if (!canAct(st, s)) return "いまはエボルヴできない";
  return "";
}
function evolveMon(st, s, i){
  if (evoWhy(st, s, i)) return false;
  const p = P(st, s), m = p.mz[i], n = abN(st, s, i, "evolve") || 200;
  p.evoUsed = (p.evoUsed || 0) + 1; p.evoTurn = st.turnNo;
  m.evolved = true; m.mod = (m.mod || 0) + n; m.rushTurn = st.turnNo;
  log(st, s, `「${card(m.c).name}」がエボルヴした！ ATK+${n}（エボルヴポイント あと${EVO_MAX - p.evoUsed}）`); ev(st, { type: "evolve", s, z: i });
  const L = monTrigList(st, s, i, "evolve").filter(x => hasTrig(x.c, "evolve"));
  if (L.length) runList(st, L, st2 => checkEnd(st2)); else checkEnd(st);
  return true;
}
// エボルヴしたターン: 出たばかりでも、相手のモンスターになら攻撃できる（突進）
const rushOnly = (st, s, i) => { const m = P(st, s).mz[i]; return !!m && (m.rushTurn === st.turnNo || hasAb(st, s, i, "rush")) && sick(st, s, i); };

/* ---- 革命チェンジ（デュエマ風）: 条件に合うモンスターが攻撃するとき、手札のこのカードと入れかえる ---- */
function revoHit(ac, r){ const w = String(r && r.name || "").trim(); if (!w || !ac) return false; if (r.match === "tag") return tagsOf(ac).includes(w); if (r.match === "exact") return normQ(ac.name || "").trim() === normQ(w).trim(); return normQ(ac.name || "").includes(normQ(w)); }
function revoCands(st, s, from){
  const p = P(st, s), m = p.mz[from]; if (!m || monCannotLeave(m)) return [];
  const ac = card(m.c);
  return p.hand.map((id, j) => j).filter(j => { const c = card(p.hand[j]); return c && cardType(c) === "monster" && c.revo && p.hand[j] !== m.c && revoHit(ac, c.revo); });
}
function revoSwap(st, s, i, hj, then){
  const p = P(st, s), m = p.mz[i], id = p.hand[hj]; if (!m || monCannotLeave(m) || !id){ then && then(st); return; }
  p.hand.splice(hj, 1);
  const keep = { atkCount: m.atkCount, atkTotal: m.atkTotal, attacked: m.attacked, revealed: true };
  moveMonOut(st, s, i, "hand", { noMorph: true });
  const nm2 = mkMon(st, id); Object.assign(nm2, keep); p.mz[i] = nm2;
  log(st, s, `革命チェンジ！「${card(m.c).name}」を手札にもどして「${card(id).name}」が出た`); ev(st, { type: "summon", s, z: i });
  const L = monTrigList(st, s, i, "summon").filter(x => hasTrig(x.c, "summon") || hasTrig(x.c, "enter"));
  if (L.length) runList(st, L, then); else then && then(st);
}
// CPU: いまより強いものに入れかえる
function revoAuto(st, s, from){ const p = P(st, s), m = p.mz[from], L = revoCands(st, s, from).filter(j => cmpNum(baseAtk(card(p.hand[j])), atkOf(m)) > 0).sort((a, b) => cmpNum(baseAtk(card(p.hand[b])), baseAtk(card(p.hand[a])))); return L.length ? L[0] : -1; }

/* ---- ブロッカー（デュエマ風）: 相手の攻撃に、代わりに受けて立つ ---- */
function blockOpts(st, s){
  const pd = st.pending; if (!pd || pd.type !== "attack" || pd.by === s || pd.blocked || hasAb(st, pd.by, pd.from, "unblock")) return [];
  return P(st, s).mz.map((m, i) => m && !m.tap && i !== pd.to && hasAb(st, s, i, "blocker") && m.blkTurn !== st.turnNo ? { from: "blk", i, c: card(m.c) } : null).filter(Boolean);
}
function doBlock(st, s, i){
  const pd = st.pending, m = P(st, s).mz[i]; if (!pd || pd.type !== "attack" || !m) return false;
  m.blkTurn = st.turnNo; pd.to = i; pd.blocked = true; if (P(st, s).shieldOn) m.tap = true;
  log(st, s, `「${card(m.c).name}」がブロックした！`); ev(st, { type: "block", s, z: i });
  return true;
}
// CPU: 勝てるブロッカーがいれば出す。直接攻撃なら一番強いブロッカーで止める
function cpuBlock(st, s, opts){
  const pd = st.pending, bl = opts.filter(o => o.from === "blk"); if (!bl.length || !pd) return null;
  const am = P(st, pd.by).mz[pd.from]; if (!am) return null; const a = atkOf(am), mz = P(st, s).mz;
  const win = bl.filter(o => cmpNum(atkOf(mz[o.i]), a) > 0).sort((x, y) => cmpNum(atkOf(mz[x.i]), atkOf(mz[y.i])));
  if (win.length) return win[0];
  if (pd.to === "direct" && a >= 200) return bl.slice().sort((x, y) => cmpNum(atkOf(mz[y.i]), atkOf(mz[x.i])))[0];
  return null;
}
function declareAttack(st, s, from, to, noRevo){
  const m = P(st, s).mz[from]; if (!m || !canAttack(st, s, from)) return false;
  const T = atkTargets(st, s, from);
  if (to === "direct" ? !T.direct : !T.L.includes(to)) return false;
  m.atkCount = (m.atkCount || 0) + 1; m.atkTotal = (m.atkTotal || 0) + 1; if (P(st, s).shieldOn && !hasAb(st, s, from, "vigil")) m.tap = true;
  m.attacked = m.atkCount >= maxAttacks(st, s, from); if (m.attacked && !P(st, s).shieldOn && !hasAb(st, s, from, "vigil")) m.rest = true;
  glGroup(st, s, from).forEach(j => { const x = P(st, s).mz[j]; if (x && x !== m){ x.atkCount = m.atkCount; x.attacked = m.attacked; } });
  if (!m.revealed && hasAb(st, s, from, "stealth")){ m.revealed = true; log(st, s, `「${card(m.c).name}」の隠密がとけた`); }
  ev(st, { type: "attack", s, from, to, c: m.c });
  const target = to === "direct" ? "直接攻撃" : `「${card(P(st, O(s)).mz[to].c).name}」に攻撃`;
  log(st, s, `「${card(m.c).name}」で${target}！`);
  // 「攻撃するとき」 effects (the monster and its equips) come first, then the defender may answer
  st.pending = { type: "attack", by: s, from, to, wait: false };
  // 革命チェンジ: 攻撃するモンスターと手札のカードを入れかえる（「攻撃するとき」より先）
  if (!noRevo){ const rc = revoCands(st, s, from); if (rc.length){
    const cont = st2 => atkHand(st2, s, from);
    if (isHumanHere(s)){ const p = P(st, s); G.chooseQ.push({ ask: true, s, c: card(m.c), fx: { kind: "__block", ask: "革命チェンジする？（手札のカードと入れかえて、そのまま攻撃する）" }, ctx: {}, then: null, pick1: [...rc.map(j => ({ name: card(p.hand[j]).name, text: `ATK ${fmtN(baseAtk(card(p.hand[j])))}・「${card(m.c).name}」は手札にもどる` })), { name: "しない", text: "このまま攻撃する" }], p1go: (st2, k) => { if (k < rc.length) revoSwap(st2, s, from, rc[k], cont); else cont(st2); } }); return true; }
    const j = revoAuto(st, s, from); if (j >= 0){ revoSwap(st, s, from, j, st2 => atkHand(st2, s, from)); return true; }
  } }
  atkHand(st, s, from);
  return true;
}
// 攻撃するときの手札: 侵略（上に重ねて出る）→ アタック・チャンス（魔法をタダで使う）→ 攻撃するときの効果へ
function atkHand(st, s, from){
  const go = st2 => atkChanceStep(st2, s, from, st3 => attackGo(st3, s, from));
  const p = P(st, s), m = p.mz[from]; if (!m || st.winner){ go(st); return; }
  const ac = card(m.c), ok = (id, z) => { const c = card(id); return c && cardType(c) === "monster" && c.invade && invFrom(c).includes(z) && revoHit(ac, c.invade); };
  // 侵略の候補（S級侵略は墓地・マナゾーン・場からも）。同じ場所の同じカードは1つにまとめる
  const L = [], seen = new Set(), add = (z, i, id) => { const k = z + ":" + id; if (seen.has(k)) return; seen.add(k); L.push({ z, i, id }); };
  p.hand.forEach((id, i) => { if (ok(id, "hand")) add("hand", i, id); });
  p.grave.forEach((id, i) => { if (ok(id, "grave")) add("grave", i, id); });
  (p.manaZ || []).forEach((x, i) => { if (x && ok(x.c, "mana")) add("mana", i, x.c); });
  p.mz.forEach((x, i) => { if (x && i !== from && !monCannotLeave(x) && ok(x.c, "field")) add("field", i, x.c); });
  if (!L.length){ go(st); return; }
  const ZN = { hand: "手札", grave: "墓地", mana: "マナゾーン", field: "場" };
  const doIt = (st2, x) => { const p2 = P(st2, s); if (!p2.mz[from]){ go(st2); return; }
    if (x.z === "hand"){ const k = p2.hand.indexOf(x.id); if (k < 0){ go(st2); return; } p2.hand.splice(k, 1); }
    else if (x.z === "grave"){ const k = p2.grave.lastIndexOf(x.id); if (k < 0){ go(st2); return; } p2.grave.splice(k, 1); }
    else if (x.z === "mana"){ const k = (p2.manaZ || []).findIndex(y => y && y.c === x.id); if (k < 0){ go(st2); return; } const y = p2.manaZ.splice(k, 1)[0]; if (!y.tap && p2.mana) p2.mana.cur = Math.max(0, p2.mana.cur - 1); manaSync(p2); }
    else { const y = p2.mz[x.i]; if (!y || y.c !== x.id || monCannotLeave(y)){ go(st2); return; } leaveEquips(st2, y); p2.grave.push(...(y.mats || [])); sealsOut(st2, y); p2.mz[x.i] = null; ev(st2, { type: "destroy", s, z: x.i }); }
    const sc = x.z !== "hand", old = card(p2.mz[from].c).name, nm = evoPut(st2, s, from, x.id); nm.revealed = true;
    log(st2, s, `${sc ? "S級侵略" : "侵略"}！${sc ? ZN[x.z] + "から" : ""}「${old}」の上に「${card(x.id).name}」を重ねた`); ev(st2, { type: "summon", s, z: from });
    const T = monTrigList(st2, s, from, "summon").filter(y => hasTrig(y.c, "summon") || hasTrig(y.c, "enter")); if (T.length) runList(st2, T, go); else go(st2); };
  if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c: ac, fx: { kind: "__block", ask: "侵略する？（上に重ねて、そのまま攻撃する）" }, ctx: {}, then: null, pick1: [...L.map(x => ({ name: card(x.id).name, text: `${ZN[x.z]}から・ATK ${fmtN(baseAtk(card(x.id)))}・「${ac.name}」の上に重ねる` })), { name: "しない", text: "このまま攻撃する" }], p1go: (st2, k) => { if (k < L.length) doIt(st2, L[k]); else go(st2); } }); return; }
  const best = L.filter(x => cmpNum(baseAtk(card(x.id)), atkOf(m)) > 0).sort((a, b) => cmpNum(baseAtk(card(b.id)), baseAtk(card(a.id))))[0];
  if (best) doIt(st, best); else go(st);
}
function atkChanceStep(st, s, from, then){
  const p = P(st, s), m = p.mz[from]; if (!m || st.winner){ then(st); return; }
  const ac = card(m.c), L = p.hand.map((id, j) => j).filter(j => { const c = card(p.hand[j]); return c && cardType(c) === "magic" && c.atkChance && revoHit(ac, c.atkChance) && !useCondWhy(st, s, c); });
  if (!L.length){ then(st); return; }
  const doIt = (st2, hj) => { const p2 = P(st2, s), id = p2.hand[hj], c = card(id); if (!id){ then(st2); return; } p2.hand.splice(hj, 1); log(st2, s, `アタック・チャンス！「${c.name}」をタダで使った`); ev(st2, { type: "spell", s, c: id }); countPlay(st2, s, c);
    runCard(st2, s, c, "use", { atkChance: true, attack: { by: s, from } }, st3 => { P(st3, s).grave.push(id); then(st3); }); };
  if (isHumanHere(s)){ G.chooseQ.push({ ask: true, s, c: ac, fx: { kind: "__block", ask: "アタック・チャンス：手札の魔法をタダで使う？" }, ctx: {}, then: null, pick1: [...L.map(j => ({ name: card(p.hand[j]).name, text: fxText(card(p.hand[j])) || "" })), { name: "使わない", text: "このまま攻撃する" }], p1go: (st2, k) => { if (k < L.length) doIt(st2, L[k]); else then(st2); } }); return; }
  doIt(st, L[0]);
}
function attackGo(st, s, from){
  const go = st2 => attackResponse(st2, s);
  const L = monTrigList(st, s, from, "attack").filter(x => hasTrig(x.c, "attack")).concat(monTrigList(st, s, from, "clash").filter(x => x.s === s && hasTrig(x.c, "clash")));
  const reply = st2 => { const pd = st2.pending; if (!pd || pd.type !== "attack" || pd.by !== s || st2.winner) return; const R = oppAttackList(st2, O(s), { attack: { by: s, from } }); if (R.length) runList(st2, R, go); else go(st2); };
  if (L.length) runList(st, L, reply); else reply(st);
}
// 直接攻撃のS・トリガーを先に解決し、その後にブロック・罠の応答へ進む。
function attackResponse(st, s){
  const pd = st.pending;
  if (!pd || pd.type !== "attack" || pd.by !== s || st.winner) return;
  if (pd.negated){ resolveAttack(st); return; }
  if (pd.to === "direct" && !pd.strigChecked){
    pd.strigChecked = true; pd.strigResume = true;
    if (sTrigger(st, O(s))) return;
    delete pd.strigResume;
  }
  pd.wait = responseOptions(st, O(s), "attack").length > 0;
  if (!pd.wait) resolveAttack(st);
}
// 「相手が攻撃してきたとき」: 攻撃された側 d のモンスター（と装備）・永続カード
function oppAttackList(st, d, actx){
  const L = [];
  P(st, d).mz.forEach((m, i) => { if (m) monTrigList(st, d, i, "oppAttack").forEach(x => { if (x.s === d && hasTrig(x.c, "oppAttack")) L.push({ ...x, ctx: { ...x.ctx, ...actx } }); }); });
  // 交戦: 攻撃されたモンスター
  { const pd = st.pending; if (pd && pd.type === "attack" && typeof pd.to === "number" && P(st, d).mz[pd.to]) monTrigList(st, d, pd.to, "clash").forEach(x => { if (x.s === d && hasTrig(x.c, "clash")) L.push({ ...x, ctx: { ...x.ctx, ...actx } }); }); }
  const PL = persistList(st, d, "oppAttack", actx); PL.forEach(x => log(st, d, `${x.c.relicView ? "レリック" : "永続"}「${x.c.name}」の効果！`));
  return L.concat(PL);
}
// choice: null (pass) or { from: "sz"|"hand", i }
function respond(st, s, choice){
  const pend = st.pending; if (!pend) return;
  pend.wait = false;
  if (choice && choice.from === "blk"){ if (pend.type === "attack") doBlock(st, s, choice.i); afterChain(st); return; }
  if (choice == null){
    if (pend.type === "chain"){ log(st, s, "チェーンしなかった"); resolveChain(st, pend.resume); }
    else { log(st, s, pend.type === "end" ? "なにも使わなかった" : "罠・速攻魔法は使わなかった"); afterChain(st); }
    return;
  }
  if (choice.from === "act"){ const fin = st2 => { if (st2.winner) return; if (pend.type === "chain") resolveChain(st2, pend.resume); else afterChain(st2); }; if (!activateMon(st, s, choice.i, null, true, fin)) fin(st); return; }
  const atk = pend.type === "attack" ? pend : (pend.type === "chain" && pend.resume && pend.resume.type === "attack" ? pend.resume : null);
  const ok = activate(st, s, choice.from, choice.i, { ...(atk ? { attack: { by: atk.by, from: atk.from } } : {}), ...(choice.disc ? { disc: choice.disc } : {}) });
  if (!ok){ if (pend.type === "chain") resolveChain(st, pend.resume); else afterChain(st); }
}
// 吸収: モンスター (s,i) が戦闘で与えたダメージ y のぶん、持ち主のLPを回復
function drain(st, s, i, y){ const m = P(st, s).mz[i]; if (!m || !(y > 0) || !isFinite(y) || !hasAb(st, s, i, "lifelink")) return; P(st, s).lp += y; log(st, s, `「${card(m.c).name}」の吸収でLPを${fmtN(y)}回復`); }
// S・トリガー: 直接攻撃の宣言時、ダメージ前に山札の一番上をタダで使う（1回の攻撃につき1回）
function sTrigger(st, s){
  const attack = st.pending;
  if (!attack || attack.type !== "attack" || attack.to !== "direct" || attack.by === s || attack.negated) return false;
  const p = P(st, s), id = p.deck[0]; if (!id || p.shieldOn || (p.noStrigUntil || 0) >= st.turnNo) return false;
  const c = card(id), t = cardType(c);
  if (!c || !c.strig || (t !== "monster" && t !== "magic" && t !== "trap") || c.noUse) return false;
  p.deck.shift(); log(st, s, `S・トリガー！ 山札の一番上の「${c.name}」をダメージを受ける前にタダで使う！`);
  return strigCast(st, s, id);
}
// S・トリガーのカード id（山札・シールドからもう取り出してある）をタダで使う。使えなければ手札へ。チェーンを始めたら true
function strigCast(st, s, id){
  const p = P(st, s), c = card(id), t = cardType(c);
  if (useCondWhy(st, s, c) || (t !== "monster" && useBlockedWhy(st, s, c))){ p.hand.push(id); log(st, s, `「${c.name}」はいま発動できないので手札に加えた`); return false; }
  if (t === "monster"){
    const z = glZone(st, s, id);
    if (z < 0){ p.hand.push(id); log(st, s, `モンスターゾーンがいっぱいなので「${c.name}」は手札に加えた`); return false; }
    countPlay(st, s, c);
    // 通常の召喚回数やコストを使わず、召喚時の効果は共通のチェーン処理で解決する。
    pushChain(st, s, id, { strig: true }, `S・トリガー「${c.name}」の召喚`, { summon: true, cast: false, z });
    return true;
  }
  const keep = isPersist(c), pz = keep ? freeZone(p.sz, p) : -1;
  if (keep && pz < 0){ p.hand.push(id); log(st, s, `魔法・罠ゾーンがいっぱいなので「${c.name}」は手札に加えた`); return false; }
  countPlay(st, s, c);
  if (isField(c)) placeField(st, s, id);
  else if (keep){ st.un = (st.un || 0) + 1; p.sz[pz] = { c: id, turn: st.turnNo, face: true, u: st.un }; }
  else if (exhausts(c)) (p.exile = p.exile || []).push(id);
  else p.grave.push(id);
  ev(st, { type: "spell", s, c: id });
  pushChain(st, s, id, { strig: true }, `S・トリガー「${c.name}」`, keep ? { pz, pu: p.sz[pz].u } : isField(c) && st.field ? { fu: st.field.u } : null);
  return true;
}
/* ---- シールド（デュエマ式のシールドデッキ）: p.shieldOn, p.shields = [カード]（裏向き） ---- */
// ブレイクする枚数: 1枚（ブレイカーならその枚数）。シールドデッキでない人のモンスターは、ATK300ごとにもう1枚
function breakCount(st, A, from){
  const m = P(st, A).mz[from]; let n = Math.max(1, abN(st, A, from, "breaker") || 1);
  if (m && !P(st, A).shieldOn){ const a = atkOf(m); n += a === Infinity ? 999 : isFinite(a) && a > 0 ? Math.floor(a / 300) : 0; }
  return n;
}
// D のシールドを n 枚ブレイク: 手札に加えて、S・トリガーはあとで（strigStep）タダで使う
// opt.by = { s, i, u } ブレイクしたモンスター（「ブレイクしたとき」用）、opt.burn = 焼却（ブレイクのかわりに墓地へ）
function breakShields(st, D, n, why, opt = {}){
  const p = P(st, D); if (!p.shieldOn || !p.shields) return 0;
  if (!p.shields.length) return 0;
  // ブレイク封鎖: 1回に1枚まで
  if ((p.brkCapUntil || 0) >= st.turnNo && n > 1){ n = 1; log(st, D, `ブレイク封鎖で、ブレイクは1枚だけ`); }
  // ブロック: ブレイク1枚につきブロックを300使って防ぐ（300より少なくても、のこりで1枚防ぐ）
  if (p.block > 0 && n > 0){ let b = 0; while (n > 0 && p.block > 0){ p.block = Math.max(0, p.block - 300); n--; b++; } log(st, D, `ブロックでシールド${b}枚ぶんのブレイクを防いだ（残りブロック ${p.block}）`); ev(st, { type: "hit", s: D, d: 0, blk: b }); }
  // シールド・セイバー: かわりに自分のモンスターが破壊される（1体につき1枚）
  if (n > 0 && p.mz) for (let i = 0; i < p.mz.length && n > 0; i++){ const m = p.mz[i]; if (!m || !hasAb(st, D, i, "saver")) continue; const nm0 = card(m.c).name; if (destroyMonster(st, D, i, "シールド・セイバー")){ n--; log(st, D, `「${nm0}」がシールド・セイバーでシールドを守った！`); } }
  const k = Math.min(Math.max(0, n), p.shields.length); if (!k) return 0;
  const got = p.shields.splice(p.shields.length - k, k);
  if (opt.burn){ p.grave.push(...got); log(st, D, `${why}で${p.name}のシールドを${k}枚墓地に置いた（シールド焼却・のこり${p.shields.length}枚）`); ev(st, { type: "shieldTake", s: D, n: k }); return k; }
  p.hand.push(...got);
  log(st, D, `${why}で${p.name}のシールドを${k}枚ブレイク！（のこり${p.shields.length}枚）`);
  ev(st, { type: "shieldBreak", s: D, n: k, c: got.slice() });
  const L = got.filter(id => { const c = card(id), t = cardType(c); return c && c.strig && !c.noUse && (t === "monster" || t === "magic" || t === "trap"); });
  if (L.length && (p.noStrigUntil || 0) >= st.turnNo) log(st, D, `トリガー封じで、S・トリガーは使えない（手札に加えた）`);
  else if (L.length) (st.strigQ = st.strigQ || []).push(...L.map(id => ({ s: D, c: id })));
  (st.brkQ = st.brkQ || []).push({ s: D, by: opt.by || null });
  return k;
}
// ブレイクのあと: 「このモンスターがシールドをブレイクしたとき」「自分のシールドがブレイクされたとき」を出してから、S・トリガーへ
function shieldStep(st){
  if (st.brkQ && st.brkQ.length && !st.pending && !st.winner && !(st.chain && st.chain.length)){
    const Q = st.brkQ, L = []; delete st.brkQ;
    Q.forEach(x => {
      const b = x.by, bm = b && P(st, b.s).mz[b.i];
      if (bm && bm.u === b.u) monTrigList(st, b.s, b.i, "brk").forEach(y => { if (y.s === b.s && hasTrig(y.c, "brk")) L.push(y); });
      P(st, x.s).mz.forEach((m, i) => { if (m) monTrigList(st, x.s, i, "shieldBrk").forEach(y => { if (y.s === x.s && hasTrig(y.c, "shieldBrk")) L.push(y); }); });
      const PL = persistList(st, x.s, "shieldBrk", {}); PL.forEach(y => log(st, x.s, `${y.c.relicView ? "レリック" : "永続"}「${y.c.name}」の効果！`)); L.push(...PL);
    });
    if (L.length){ runList(st, L, st2 => { checkEnd(st2); shieldStep(st2); }); return; }
  }
  if (st.brkQ && !st.brkQ.length) delete st.brkQ;
  strigStep(st);
}
/* ---- EXライフ（デュエマ風）: 出たとき、山札の上を「このモンスターのシールド」に。場を離れるとき、かわりにそのシールドを墓地へ ---- */
function exLifeOn(st, s, z){
  const p = P(st, s), m = p.mz[z]; if (!m || m.exlDone || !hasAb(st, s, z, "exLife")) return;
  m.exlDone = true; if (!p.shieldOn || !p.shields) return;
  const id = p.deck.shift(); if (!id){ log(st, s, `「${card(m.c).name}」のEXライフ：山札がない`); return; }
  p.shields.push(id); m.exl = id; log(st, s, `「${card(m.c).name}」のEXライフ：山札の上から1枚をシールドに加えた（シールド${p.shields.length}枚）`); ev(st, { type: "shieldAdd", s, n: 1 });
}
// EXライフのシールドがまだあるか（うばわれていても、シールドは持ち主のもの）
const exLifeHas = (st, s, m) => !!(m && m.exl && (P(st, m.owner || s).shields || []).includes(m.exl));
function exLifeSave(st, s, i){
  const m = P(st, s).mz[i]; if (!exLifeHas(st, s, m) || (typeof monCannotLeave === "function" && monCannotLeave(m))) return false;
  const w = P(st, m.owner || s); w.shields.splice(w.shields.lastIndexOf(m.exl), 1); w.grave.push(m.exl); delete m.exl;
  log(st, s, `「${card(m.c).name}」のEXライフ！ かわりにシールドを1枚墓地に置いて、場に残った（シールド${w.shields.length}枚）`); ev(st, { type: "shieldTake", s: m.owner || s, n: 1 });
  return true;
}
// ブレイクしたシールドのS・トリガーを1枚ずつ使う（チェーンが終わるたびに afterChain から続きへ）
function strigStep(st){
  while (st.strigQ && st.strigQ.length && !st.pending && !st.winner && !(st.chain && st.chain.length)){
    const x = st.strigQ.shift(), p = P(st, x.s), j = p.hand.lastIndexOf(x.c); if (!st.strigQ.length) delete st.strigQ;
    if (j < 0) continue;
    p.hand.splice(j, 1); log(st, x.s, `S・トリガー！ シールドから「${card(x.c).name}」をタダで使う！`);
    if (strigCast(st, x.s, x.c)) return;
  }
  if (st.strigQ && !st.strigQ.length) delete st.strigQ;
}
// 成長: when "end" → 攻撃の回数（ターンのおわり）、"start" → むかえたターンの数（ターンのはじめ）
function evolveCheck(st, s, when){
  P(st, s).mz.forEach((m, i) => {
    if (!m || m.evoFail) return;
    const a = monAbs(st, s, i).find(x => x.name && (when === "end" ? x.k === "evoAtk" && (m.atkTotal || 0) >= (x.n || 1) : x.k === "evoTurn" && (m.age || 0) >= (x.n || 1)));
    if (!a) return;
    const id = fxCardId({ kind: "oppSummon", into: a.name }, card(m.c));
    if (!id || id === m.c){ m.evoFail = true; log(st, s, `「${card(m.c).name}」は成長しようとしたが、「${a.name}」というモンスターが見つからない`); return; }
    const old = card(m.c).name; m.c = id; m.mod = 0; delete m.mul; m.atkTotal = 0; m.age = 0; if (m.gab) m.gab = m.gab.filter(g => g.k !== "evoTurn" && g.k !== "evoAtk");
    ev(st, { type: "summon", s, z: i }); log(st, s, `「${old}」が成長して「${card(id).name}」になった！`);
  });
}
function resolveAttack(st){
  const pd = st.pending; st.pending = null; if (!pd) return;
  const A = pd.by, D = O(A), am = P(st, A).mz[pd.from];
  if (pd.negated){ checkEnd(st); return; }
  if (!am){ log(st, A, "攻撃モンスターがいなくなった"); checkEnd(st); return; }
  if (P(st, D).thorns > 0){ monDmg(st, A, pd.from, P(st, D).thorns, "炎の障壁（反撃）"); if (!P(st, A).mz[pd.from]){ checkEnd(st); return; } }
  if (pd.to === "direct" && P(st, D).shieldOn){
    const sh = P(st, D).shields || [];
    if (!sh.length){
      const nl = noLoseBy(st, D);
      if (nl) log(st, D, `シールドが0枚でダイレクトアタックを受けたけど、「${nl}」の効果でゲームに負けない！`);
      else { log(st, A, `「${card(am.c).name}」のダイレクトアタックが決まった！`); st.winner = A; st.why = `${nm(st, D)} はシールドが0枚のときにダイレクトアタックを受けた`; }
      checkEnd(st); return;
    }
    if (hasAb(st, A, pd.from, "noBreak")) log(st, A, `「${card(am.c).name}」はシールドをブレイクできない`);
    else breakShields(st, D, breakCount(st, A, pd.from), `「${card(am.c).name}」の攻撃`, { by: { s: A, i: pd.from, u: am.u }, burn: hasAb(st, A, pd.from, "burnBrk") });
    checkEnd(st); shieldStep(st); return;
  }
  if (pd.to === "direct"){
    const a = battleHit(st, A, pd.from, atkOf(am)); dealDmg(st, D, a); log(st, A, `${nm(st, D)} に直接 ${fmtN(a)} ダメージ！`);
    drain(st, A, pd.from, a);
    checkEnd(st);
    return;
  } else {
    const dm = P(st, D).mz[pd.to];
    if (!dm){ log(st, A, "攻撃対象がいなくなった"); checkEnd(st); return; }
    const a = atkOf(am), d = atkOf(dm);
    // damage to a player is cut by the losing monster's 鉄壁-type ability
    const hurt = (s2, i2, x) => { if (P(st, s2).shieldOn) return [0, 0]; const cut = abN(st, s2, i2, "dmgCut"), y = x === Infinity ? x : Math.max(0, x - cut); dealDmg(st, s2, y); if (y > 0 && hasAb(st, s2, i2, "reflect")){ log(st, s2, `「${card(P(st, s2).mz[i2].c).name}」の反射！ ${nm(st, O(s2))}にも${y === Infinity ? "" : fmtN(y)}ダメージ`); dealDmg(st, O(s2), y); } return [y, cut]; };
    const losers = [];
    // 先制攻撃: 片方だけが持っていて、相手を倒せる（ATKが同じか上・必殺）なら、先に倒して自分は無事
    const fsA = hasAb(st, A, pd.from, "first") && !hasAb(st, D, pd.to, "first"), fsD = hasAb(st, D, pd.to, "first") && !hasAb(st, A, pd.from, "first");
    const pre = fsA && (a >= d || hasAb(st, A, pd.from, "bane")) ? A : fsD && (d >= a || hasAb(st, D, pd.to, "bane")) ? D : null;
    if (pre === A && a <= d){ log(st, A, `「${card(am.c).name}」の先制攻撃！ 先に「${card(dm.c).name}」を倒した`); losers.push([D, pd.to, dm.u]); }
    else if (pre === D && d <= a){ log(st, D, `「${card(dm.c).name}」の先制攻撃！ 先に「${card(am.c).name}」を倒した`); losers.push([A, pd.from, am.u]); }
    else {
      // 貫通: 差ではなくATKぶん全部 ／ 吸収: 与えたぶん回復
      if (a > d){ const pc = hasAb(st, A, pd.from, "pierce"), [y, cut] = hurt(D, pd.to, battleHit(st, A, pd.from, pc ? a : a - d)); log(st, A, `バトル ${fmtN(a)} vs ${fmtN(d)}：${nm(st, D)} に ${fmtN(y)} ダメージ${pc ? "（貫通）" : ""}${cut ? `（${cut}へった）` : ""}`); drain(st, A, pd.from, y); losers.push([D, pd.to, dm.u]); }
      else if (a < d){ const pc = hasAb(st, D, pd.to, "pierce"), [y, cut] = hurt(A, pd.from, battleHit(st, D, pd.to, pc ? d : d - a)); log(st, A, `バトル ${fmtN(a)} vs ${fmtN(d)}：${nm(st, A)} に ${fmtN(y)} ダメージ${pc ? "（貫通）" : ""}${cut ? `（${cut}へった）` : ""}`); drain(st, D, pd.to, y); losers.push([A, pd.from, am.u]); }
      else { log(st, A, `バトル ${fmtN(a)} vs ${fmtN(d)}：相打ち！`); losers.push([A, pd.from, am.u], [D, pd.to, dm.u]); }
      if (hasAb(st, A, pd.from, "bane") && !losers.some(l => l[0] === D)){ losers.push([D, pd.to, dm.u]); log(st, A, `「${card(am.c).name}」の必殺！`); }
      if (hasAb(st, D, pd.to, "bane") && !losers.some(l => l[0] === A)){ losers.push([A, pd.from, am.u]); log(st, D, `「${card(dm.c).name}」の必殺！`); }
      if (pre){ const k = losers.findIndex(l => l[0] === pre); if (k >= 0){ losers.splice(k, 1); log(st, pre, `「${card((pre === A ? am : dm).c).name}」の先制攻撃！ 先に倒したので破壊されない`); } }
    }
    const W = pre === A ? [A, pd.from, am.u] : pre === D ? [D, pd.to, dm.u] : a > d ? [A, pd.from, am.u] : a < d ? [D, pd.to, dm.u] : null;
    // "when it loses a battle" effects first, then the losers are destroyed
    const L = [].concat(...losers.map(([s2, i2]) => monTrigList(st, s2, i2, "battleLose")));
    runList(st, L, st2 => {
      let killed = false; const kills = [];
      losers.forEach(([s2, i2, u]) => {
        const m2 = P(st2, s2).mz[i2]; if (!m2 || m2.u !== u) return;
        if (hasAb(st2, s2, i2, "guard")){ log(st2, s2, `「${card(m2.c).name}」は戦闘では破壊されない！`); return; }
        const kc = m2.c; if (destroyMonster(st2, s2, i2, "戦闘", { battle: true })){ killed = true; if (!W || s2 !== W[0]) kills.push({ s: s2, c: kc }); }
      });
      if (W && killed){ const wm = P(st2, W[0]).mz[W[1]]; if (wm && wm.u === W[2]) runList(st2, monTrigList(st2, W[0], W[1], "kill", null, { killed: kills }), null); }
      checkEnd(st2);
    });
    return;
  }
  checkEnd(st);
}
// 「このターンの残りを飛ばす」は、いま解決中の効果・チェーンを終えてから通常のターン終了へ合流する。
// 直接 passTurn しないことで、ターン終了時効果・一時効果の解除・追加ターン・相手の応答を保つ。
function turnEnding(st){ return !!(st && st.pending && (st.pending.type === "end" || (st.pending.type === "chain" && st.pending.resume && st.pending.resume.type === "end"))); }
function requestTurnEnd(st, s, c){
  if (!st || st.winner) return;
  if (turnEnding(st)){ log(st, s, `「${c && c.name || "？"}」：ターンはすでに終了中`); return; }
  st.endTurnRequested = { s: st.turn, no: st.turnNo };
  log(st, s, `「${c && c.name || "？"}」の効果で、このターンの残りを飛ばす！`);
}
function flushTurnEndRequest(st){
  const r = st && st.endTurnRequested;
  if (!r) return false;
  if (r.s !== st.turn || r.no !== st.turnNo){ delete st.endTurnRequested; return false; }
  if (st.winner || st.pending || st.askQ || (st.chain && st.chain.length)) return false;
  delete st.endTurnRequested;
  endTurn(st, r.s);
  return true;
}
// ending the turn first gives the other player a chance to use quick spells / traps
function endTurn(st, s){
  exReturnP(st, s);
  if (responseOptions(st, O(s), "end").length){ st.pending = { type: "end", by: s, wait: true }; log(st, s, "ターン終了…"); return; }
  passTurn(st, s);
}
function finishEndTurn(st){ const pd = st.pending; st.pending = null; checkEnd(st); if (!st.winner && pd) passTurn(st, pd.by); }
function passTurn(st, s){
  if (st.endTurnRequested && st.endTurnRequested.s === s && st.endTurnRequested.no === st.turnNo) delete st.endTurnRequested;
  fireTurn(st, s, "turnEnd", st => {
    ctrTick(st, s, "end"); checkEnd(st); if (st.winner) return;
    evolveCheck(st, s, "end");
    P(st, s).mz.forEach(m => { if (m){ m.attacked = false; m.atkCount = 0; } });
    { const ep = P(st, s); if (ep.strTemp){ ep.str = (ep.str || 0) - ep.strTemp; log(st, s, `一時的な筋力がもどった（筋力 ${ep.str}）`); ep.strTemp = 0; } if (ep.dexTemp){ ep.dex = (ep.dex || 0) - ep.dexTemp; log(st, s, `一時的な敏捷がもどった（敏捷 ${ep.dex}）`); ep.dexTemp = 0; } ep.freeIds = []; ep.noDraw = false; ep.rage = 0; ep.dblAtk = 0; ep.dblNext = []; ep.costSet = (ep.costSet || []).filter(e => !e.until);
      if (ep.plate > 0){ ep.block = (ep.block || 0) + ep.plate; log(st, s, `プレートでブロックを${ep.plate}得た（ブロック ${ep.block}）`); }
      for (const o of ["a", "b"]){ const q = P(st, o); q.lostNow = 0; q.exhaustedNow = 0; q.atkNow = 0; q.playedNow = 0; q.usedNowIds = []; q.discNow = 0; }
      // 脱力 wears off at the end of its owner's own turn (it weakens what they deal on that turn)
      if (ep.weak > 0){ ep.weak--; if (!ep.weak) log(st, s, `${ep.name}の脱力がとけた`); }
      ep.mz.forEach(m => { if (m && m.weak > 0){ m.weak--; if (!m.weak) log(st, s, `「${card(m.c).name}」の脱力がとけた`); } }); }
    for (const o of ["a", "b"]) P(st, o).mz.forEach(m => { if (m && m.tmpBy === s){ m.tmp = 0; m.tmpBy = null; } if (m && m.strTBy === s){ m.strT = 0; m.strTBy = null; } });
    for (const o of ["a", "b"]) P(st, o).mz.forEach((m, i) => { if (!m || m.retBy !== s) return; const back = m.owner, B = P(st, back); const z = freeZone(B.mz, B); if (z < 0 && monCannotLeave(m)) return; delete m.retBy; P(st, o).mz[i] = null;
      if (z >= 0){ B.mz[z] = m; delete m.owner; log(st, back, `「${card(m.c).name}」が持ち主の場に戻った`); } else { leaveEquips(st, m); B.grave.push(m.c, ...(m.mats || [])); sealsOut(st, m); log(st, back, `「${card(m.c).name}」は戻る場所がなく墓地へ`); } });
    const xt = P(st, s).extraTurns > 0; if (xt) P(st, s).extraTurns--;
    st.turn = xt ? s : O(s); st.turnNo++; st.summoned = false;
    const np = P(st, st.turn); zoneTrim(st.players.a); zoneTrim(st.players.b);
    np.mz.forEach(m => { if (m){ m.age = (m.age || 0) + 1; delete m.tap; delete m.rest; } }); evolveCheck(st, st.turn, "start");
    if (np.intang > 0){ np.intang--; if (!np.intang) log(st, st.turn, `${np.name}の霊体がとけた`); }
    if (np.vuln > 0){ np.vuln--; if (!np.vuln) log(st, st.turn, `${np.name}の弱体がとけた`); }
    np.mz.forEach(m => { if (m && m.vuln > 0){ m.vuln--; if (!m.vuln) log(st, st.turn, `「${card(m.c).name}」の弱体がとけた`); } });
    if (np.block && !np.barricade){ log(st, st.turn, `ブロック${np.block}が消えた`); np.block = 0; }
    np.thorns = 0; np.blockedNow = false;
    if (np.manaZ){ np.manaZ.forEach(x => { x.tap = false; }); np.mana.max = np.manaZ.length; np.mana.cur = np.mana.max; np.charged = false; }
    else if (np.mana){ np.mana.max = np.sz.some(z => z && z.face && isAltar(z.c)) ? 3 : Math.max(np.mana.max, Math.min(MAX_MANA, np.mana.max + 1)); np.mana.cur = np.mana.max; }
    log(st, st.turn, `ターン${st.turnNo}：${np.name} の${xt ? "追加" : ""}ターン${np.mana ? `（マナ ${np.mana.max}）` : ""}`);
    ev(st, { type: "turn", s: st.turn, no: st.turnNo, ...(xt ? { xt: true } : {}) });
    if (np.revDebt && np.revDebt.length){ const L = np.revDebt; np.revDebt = []; for (const d of L){ const n = +d.n || 0; if (!np.mana || np.mana.cur >= n){ if (np.mana && n){ np.mana.cur -= n; } log(st, st.turn, `逆転劇「${d.name}」のコストでマナを${n}払った${np.mana ? `（${np.mana.cur}/${np.mana.max}）` : ""}`); } else { st.winner = O(st.turn); st.why = `${np.name} は逆転劇「${d.name}」のマナ${n}を払えなかった`; log(st, st.turn, `逆転劇「${d.name}」のマナ${n}を払えない…ゲームに負けた`); return; } } }
    checkEnd(st); if (st.winner) return;
    refill(st, st.turn);
    // 前のターンに飛ばされたステップ: ドローはここで飛ばし、メイン・バトルはこのターンのあいだ印をのこす
    const sk = np.skipNext; delete np.skipNext; delete np.skipNow;
    if (sk && (sk.main || sk.battle)){ np.skipNow = { no: st.turnNo, ...(sk.main ? { main: true } : {}), ...(sk.battle ? { battle: true } : {}) }; log(st, st.turn, `このターンは${[sk.main && "メインステップ", sk.battle && "バトルステップ"].filter(Boolean).join("と")}を飛ばす`); }
    if (sk && sk.draw) log(st, st.turn, "ドローステップを飛ばした（カードを引かない）");
    else {
    if (!np.deck.length && !np.spire){ const nl = noLoseBy(st, st.turn); if (nl) log(st, st.turn, `引くカードがないけど、「${nl}」の効果でゲームに負けない！`); else { st.winner = s; st.why = `${np.name} の山札がなくなった`; log(st, st.turn, "引くカードがない！"); return; } }
    np.deck = innateTop(np.deck);
    if (np.deck.length){ np.hand.push(np.deck.shift()); aceDrew(st, st.turn, np.hand.slice(-1)); } }
    if ((np.nextGive || []).length){ const L = np.nextGive; np.nextGive = []; L.forEach(g => { for (let r = 0; r < g.n; r++) np.hand.push(g.id); log(st, st.turn, `「${card(g.id).name}」のコピーを${g.n}枚手札に加えた`); }); }
    ctrTick(st, st.turn, "start"); checkEnd(st); if (st.winner) return;
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

