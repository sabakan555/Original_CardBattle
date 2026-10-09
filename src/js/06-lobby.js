/* ================= lobby ================= */
$("#pname").addEventListener("change", e => { S.name = e.target.value.trim() || "プレイヤー"; e.target.value = S.name; ls.set("cb_name", S.name); saveProfile(); renderAll(); });
$("#deckSel").addEventListener("change", e => ls.set("cb_deck", e.target.value));
$("#cpuDeckSel").addEventListener("change", e => ls.set("cb_cpudeck", e.target.value));
// decks the CPU can play: built-in ones, yours, and everyone else's (ownership doesn't matter for practice)
function cpuDeckOptions(){ return [...builtinDecks(), ...S.decks.filter(d => d && Array.isArray(d.cards) && d.cards.length)]; }
function renderCpuDeckSel(){
  const sel = $("#cpuDeckSel"), want = ls.get("cb_cpudeck", "auto"), mine = myDecks(), others = S.decks.filter(d => d && Array.isArray(d.cards) && d.cards.length && !isMine(d, "owner"));
  const opt = d => `<option value="${esc(d.id)}">${esc(d.name)}${d.mana && !d.builtin ? "【コスト】" : ""}（${d.cards.length}枚）${d.builtin || isMine(d, "owner") ? "" : "／" + esc(d.owner || "？")}</option>`;
  sel.innerHTML = `<option value="auto">おまかせ（自分と同じルールのサンプル）</option><optgroup label="はじめからあるデッキ">${builtinDecks().map(opt).join("")}</optgroup>`
    + (mine.length ? `<optgroup label="自分のデッキ">${mine.map(opt).join("")}</optgroup>` : "")
    + (others.length ? `<optgroup label="みんなのデッキ">${others.map(opt).join("")}</optgroup>` : "");
  sel.value = want === "auto" || cpuDeckOptions().some(d => d.id === want) ? want : "auto";
}
$("#joinCode").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
$("#joinCode").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnJoin").click(); });
function chosenMana(){ const id = $("#deckSel").value; const d = allDeckOptions().find(x => x.id === id); return !!(d && d.mana); }
const deckSpireVal = d => d && d.spire ? (d.spc === "silent" ? "silent" : true) : false;
function chosenSpire(){ const id = $("#deckSel").value; const d = allDeckOptions().find(x => x.id === id); return deckSpireVal(d); }
function chosenDeckIds(){
  const id = $("#deckSel").value; const d = allDeckOptions().find(x => x.id === id) || starterDeck();
  return d.cards.filter(c => S.cards.has(c) && (!S.tradesReady || owns(c) || (Array.isArray(d.borrow) && d.borrow.includes(c))));
}
function deckOk(ids){
  const limitIssue = deckLimitIssue(ids); if (limitIssue){ toast(limitIssue); return false; }
  const selectedDeck = allDeckOptions().find(d => d.id === $("#deckSel").value);
  if (S.pack && S.pack.url && packAccount() && !S.pack.ready && selectedDeck && selectedDeck.cards.some(id => S.cards.has(id) && !owns(id) && !(Array.isArray(selectedDeck.borrow) && selectedDeck.borrow.includes(id)))){ toast("このデッキの所持カードを確認中です。パック画面で再読み込みしてね"); return false; }
  ids = ids.filter(id => !isEx(S.cards.get(id)));
  if (!chosenSpire() && ids.length < MIN_DECK){ toast(`デッキのカードが足りません（${MIN_DECK}枚以上）`); return false; }
  if (!chosenSpire() && !ids.some(id => cardType(S.cards.get(id)) === "monster")){ toast("デッキにモンスターが入っていません"); return false; }
  return true;
}
function renderPlay(){
  if (document.activeElement !== $("#pname")) $("#pname").value = S.name;
  const opts = allDeckOptions(); const want = ls.get("cb_deck", "starter");
  $("#deckSel").innerHTML = opts.map(d => `<option value="${esc(d.id)}">${esc(d.name)}${d.mana && !d.builtin ? "【コスト】" : ""}（${d.cards.length}枚）</option>`).join("");
  $("#deckSel").value = opts.some(d => d.id === want) ? want : "starter";
  if (document.activeElement !== $("#cpuDeckSel")) renderCpuDeckSel();
  $("#offlineNote").hidden = !!S.db;
  if (!S.db) $("#offlineNote").textContent = S.connecting ? "サーバーに接続中…（10秒ほどかかることがあります）" : (S.connErr ? "⚠ " + S.connErr + "。" : "サーバーにつながっていません。") + "いまはこのブラウザだけに保存され、CPU練習ができます。";
  $("#btnCreate").disabled = $("#btnJoin").disabled = !S.db;
  const lastG = ls.get("cb_last3", null), rj = $("#rejoin");
  if (S.db && lastG && Date.now() - lastG.t < 6 * 3600e3){ rj.hidden = false; rj.innerHTML = `<button class="small" id="btnRejoin">部屋 ${esc(lastG.code)} にもどる</button><span class="note">前回の対戦のつづき</span>`; }
  else rj.hidden = true;
  const started = G && G.st && G.st.started;
  if (!G) renderRoomList();
  $("#lobby").hidden = !!G;
  $("#waiting").hidden = !(G && !started);
  $("#board").hidden = !started;
  if (G && !started) renderWaiting();
  if (started) renderBoard();
}
$("#rejoin").addEventListener("click", e => { if (e.target.closest("#btnRejoin")){ const l = ls.get("cb_last3", null); if (l) joinRoom(l.code); } });

function isEx(c){ return !!(c && c.ex); }
function newPlayer(deckIds, name, mana, spire){
  const deck = shuffle(deckIds.filter(id => !isEx(card(id)))); deck.splice(0, deck.length, ...innateTop(deck)); const hand = deck.splice(0, 5), ex = deckIds.filter(id => isEx(card(id)));
  const p = { name: name || S.name, lp: START_LP, deck, hand, grave: [], mz: Array(ZONES).fill(null), sz: Array(ZONES).fill(null), mana: mana ? { max: 0, cur: 0 } : null, sleeve: name ? null : (mySleeve() || null), deckIds: [...deckIds], ex };
  // スパイアデッキ: the altar starts on the field, and the deck never runs out (the graveyard is shuffled back in)
  // スパイアデッキ: the opening hand is drawn only after the relic is picked (若葉 can change any card of the deck)
  if (spire){ p.spire = true; p.relicPick = neowChoices(); p.deck = innateTop(shuffle([...p.hand, ...p.deck])); p.hand = []; p.openHand = 5; if (!p.mana) p.mana = { max: 0, cur: 0 }; p.spc = spire === "silent" ? "silent" : null; p.relics = [p.spc ? "snake" : "blood"]; if (p.spc) p.openHand += 2; p.sz[0] = { c: p.spc ? SPIRE_ALTAR_S.id : SPIRE_ALTAR.id, turn: 0, face: true, u: -1 }; }
  return p;
}
// 選択の祭壇 (face-up): turn start → draw up to 5 cards, turn end → the whole hand goes to the graveyard
function altarTurn(st, s, trig){
  const p = P(st, s); if (!p.sz.some(z => z && z.face && isAltar(z.c))) return;
  if (trig === "turnStart"){ if (p.mana){ p.mana.max = Math.max(0, 3 + (p.maxAdj || 0)); p.mana.cur = p.mana.max; if (p.conch){ p.mana.cur += 1; p.conch = false; } } const k = 5 - p.hand.length; if (k > 0) drawN(st, s, k, "「選択の祭壇」"); }
  if (trig === "turnEnd" && p.hand.length){ const keep = p.hand.filter(id => card(id) && card(id).retain), gone = p.hand.filter(id => !(card(id) && card(id).retain)); p.hand = keep; p.grave.push(...gone); log(st, s, `「選択の祭壇」で手札${gone.length}枚を墓地に捨てた${keep.length ? `（保留で${keep.length}枚は手札に残した）` : ""}`); }
}
// ネオーのレリック: at the start of a スパイアデッキ game the player picks 1 of these 3
const RELICS = {
  scroll: { name: "秘術の巻物", text: "ランダムなレアのスパイア風カード1枚をデッキに加える" },
  sprout: { name: "若葉", text: "デッキのカードを1枚えらんで、ランダムなスパイア風カードに変える" },
  conch:  { name: "轟音のほら貝", text: "最初の手札が2枚多くなり、最初のターンだけマナが1増える" },
  // キャラのはじまりのレリック（ネオーの祝福には出ない）
  blood:  { name: "燃える血", text: "自分のターンの終わりに、LPを60回復する", starter: true, blocks: [{ trig: "turnEnd", conds: [], join: "and", then: [{ kind: "heal", n: 60 }], else: [] }] },
  snake:  { name: "蛇の指輪", text: "最初の手札が2枚多くなる", starter: true }
};
// user-made レリック (cards collection, type "relic")
const userRelic = k => (S.userRelics || []).find(c => c && c.id === k) || null;
// はじめからあるレリック: 管理者が名前・絵・説明を変えたり、自動の効果を足したりできる（builtin/relic-<key>）。元の効果（巻物・若葉・ほら貝）はそのまま
const relicEdit = k => (S.builtinEdits || {})["relic-" + k] || null;
function builtinRelicCard(id){
  const k = String(id || "").replace(/^relic-/, ""); if (!RELICS[k]) return null;
  const e = relicEdit(k) || {};
  return { id: "relic-" + k, name: RELICS[k].name, effect: RELICS[k].text, flavor: "", fx: null, blocks: RELICS[k].blocks || null, img: "", ...e, type: "relic", author: "はじめから", ownerId: null, builtinRelic: true, starter: true, neow: !RELICS[k].starter, relicView: true, edited: !!relicEdit(k), relKey: k };
}
const relicCard = k => { const u = userRelic(k) || (RELICS[k] && (relicEdit(k) || RELICS[k].blocks) ? builtinRelicCard(k) : null); return u ? { ...u, type: "magic", frame: "spire", sk: "power", persist: false, relicView: true, costX: false, payLp: null, payDisc: null, payMax: null } : null; };
function relicDef(k){
  if (RELICS[k]){ const b = builtinRelicCard(k), rc = relicCard(k); return { name: b.name, text: [plainRuby(b.effect || ""), rc && relicEdit(k) ? fxText0(rc) : ""].filter(Boolean).join("。") || RELICS[k].text, img: b.img || "", key: k }; }
  const c = userRelic(k); if (!c) return null;
  return { name: c.name, text: [fxText0(relicCard(k)), plainRuby(c.effect || "")].filter(Boolean).join("。") || "（効果なし）", img: c.img || "", key: k, user: true, neow: !!c.neow };
}
// ネオーの祝福: 3 of the ネオーレリック (the built-in ones + ones marked ネオーレリック in the card maker)
function neowChoices(){ const pool = [...Object.keys(RELICS).filter(k => !RELICS[k].starter), ...(S.userRelics || []).filter(c => c.neow).map(c => c.id)]; return pool.length <= 3 ? pool : shuffle(pool).slice(0, 3); }
function gainRelic(st, s, k, why, then){
  const p = P(st, s), d = relicDef(k); if (!d){ then && then(st); return; }
  p.relics = [...(p.relics || []), k]; log(st, s, `${why}レリック「${d.name}」を手に入れた`); ev(st, { type: "gain", s, what: "relic", k });
  const rc = relicCard(k); if (rc && hasTrig(rc, "gain")) runCard(st, s, rc, "gain", {}, then); else then && then(st);
}
// ふつうのレリック (not ネオー) that the player doesn't have yet
function dropRelicId(st, s){
  const have = new Set(P(st, s).relics || []), pool = (S.userRelics || []).filter(c => !c.neow && !have.has(c.id));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
}
const hasAltar = p => !!(p && p.sz.some(z => z && z.face && isAltar(z.c)));
function randSpire(rare, spc){ const pool = draftPool(spc), rp = pool.filter(c => rarityOf(c) === "rare"); const L = rare && rp.length ? rp : pool; return L.length ? L[Math.floor(Math.random() * L.length)].id : null; }
// pick relic `key` for player s (step 2 of 若葉: `target` = "deck:i" or "hand:i")
function chooseRelic(st, s, key, target){
  const p = P(st, s); if (!p.relicPick || !(RELICS[key] || userRelic(key))) return false;
  // a ネオーレリック made in the card maker: its 「手に入れたとき」 runs, then the opening hand
  if (!RELICS[key]){
    p.relicPick = null;
    gainRelic(st, s, key, "ネオーの祝福で");
    if (p.openHand){ const k = Math.max(0, p.openHand - p.hand.length); p.openHand = 0; if (k) drawN(st, s, k, "最初の手札"); }
    return true;
  }
  if (key === "sprout" && target == null){ p.relicPick = "sprout"; return true; }
  p.relicPick = null; p.relics = [...(p.relics || []), key];
  const nm = `レリック「${relicDef(key).name}」`;
  if (key === "scroll"){ const id = randSpire(true, p.spc); if (id){ p.deck.splice(Math.floor(Math.random() * (p.deck.length + 1)), 0, id); log(st, s, `${nm}で「${card(id).name}」をデッキに加えた`); } else log(st, s, `${nm}：加えられるスパイア風カードがない`); }
  if (key === "sprout"){
    const [where, i] = String(target).split(":"), arr = where === "hand" ? p.hand : p.deck, id = randSpire(false, p.spc);
    if (arr[+i] && id){ const old = arr[+i]; arr[+i] = id; log(st, s, `${nm}で「${card(old).name}」を「${card(id).name}」に変えた`); }
    else log(st, s, `${nm}：変えられるカードがない`);
  }
  if (key === "conch"){ if (p.mana){ if (st.turn === s && st.turnNo <= 1) p.mana.cur += 1; else p.conch = true; } log(st, s, `${nm}：最初のターンはマナ+1`); }
  log(st, s, `${p.name} はレリック「${relicDef(key).name}」を選んだ`);
  { const rc = relicCard(key); if (rc && hasTrig(rc, "gain")) runCard(st, s, rc, "gain", {}); }
  // now the opening hand (ほら貝: 2 more)
  if (p.openHand){ const want = p.openHand + (key === "conch" ? 2 : 0), k = Math.max(0, want - p.hand.length); p.openHand = 0; if (k) drawN(st, s, k, "最初の手札"); }
  return true;
}
// the CPU picks at random (若葉 turns its first 攻撃 into something else)
function autoRelic(st, s){
  const p = P(st, s); if (!p.relicPick) return;
  const L = Array.isArray(p.relicPick) && p.relicPick.length ? p.relicPick : ["scroll", "sprout", "conch"], key = L[Math.floor(Math.random() * L.length)];
  if (key === "sprout"){ let i = p.deck.indexOf("spire-strike"); chooseRelic(st, s, "sprout", i >= 0 ? "deck:" + i : p.deck.length ? "deck:0" : "hand:0"); }
  else chooseRelic(st, s, key);
}
// ポーション (スパイアデッキだけ): 3つまで持てる。自分のターンならいつでも、マナなしで使える（使うとなくなる）
const POTIONS = {
  fire:   { name: "炎のポーション", text: "相手のモンスター1体（いなければ相手）に400ダメージ", fx: [{ kind: "dmg", n: 400 }] },
  blast:  { name: "爆発ポーション", text: "相手と相手のモンスターすべてに200ダメージ", fx: [{ kind: "dmg", n: 200, to: "all" }] },
  block:  { name: "ブロックポーション", text: "ブロックを240得る", fx: [{ kind: "block", n: 240 }] },
  energy: { name: "エナジーポーション", text: "このターン、マナを2回復する", fx: [{ kind: "manaNow", n: 2 }] },
  speed:  { name: "スピードポーション", text: "カードを3枚引く", fx: [{ kind: "draw", n: 3 }] },
  fear:   { name: "恐怖ポーション", text: "相手のモンスター1体（いなければ相手）を弱体3にする", fx: [{ kind: "vuln", n: 3 }] },
  heal:   { name: "回復ポーション", text: "LPを200回復する", fx: [{ kind: "heal", n: 200 }] }
};
const POTION_MAX = 3, POTION_DROP = .4, RELIC_DROP = .1;
// ポーション made in the card maker (cards collection, type "potion")
const userPotion = k => (S.userPotions || []).find(c => c && c.id === k) || null;
// the built-in ones can be changed by the admin (builtin/potion-<key>), like built-in cards
const potionEdit = k => (S.builtinEdits || {})["potion-" + k] || null;
function builtinPotionCard(id){
  const k = String(id || "").replace(/^potion-/, ""); if (!POTIONS[k]) return null;
  const e = potionEdit(k) || {};
  return { id: "potion-" + k, name: POTIONS[k].name, effect: "", flavor: "", fx: null, blocks: [{ trig: "use", conds: [], join: "and", then: POTIONS[k].fx, else: [] }], img: potionArt(k), ...e, type: "potion", author: "はじめから", ownerId: null, builtinPotion: true, starter: true, edited: !!potionEdit(k), potKey: k };
}
function potionDef(k){
  if (POTIONS[k] && potionEdit(k)){ const b = builtinPotionCard(k); return { name: b.name, text: [fxText0(potionCard(k)), plainRuby(b.effect || "")].filter(Boolean).join("。") || "（効果なし）", img: b.img, key: k }; }
  if (POTIONS[k]) return { ...POTIONS[k], img: potionArt(k), key: k };
  const c = userPotion(k); if (!c) return null;
  return { name: c.name, text: [fxText0(potionCard(k)), plainRuby(c.effect || "")].filter(Boolean).join("。") || "（効果なし）", img: c.img || "", key: k, user: true };
}
// how a potion is shown (gallery, maker preview, the confirm box)
// no card frame: just the (see-through) picture, the name and what it does
function potionHTML(c, cls = "", attrs = ""){
  if (!c) return "";
  const tx = [fxText0({ ...c, type: "magic", frame: "spire", costX: false }), plainRuby(c.effect || "")].filter(Boolean).join("。");
  const img = c.img || (c.potKey ? potionArt(c.potKey) : "");
  return `<div class="potion-ic ${cls}" ${attrs} title="${esc(tx)}"><div class="pi-img">${img ? `<img alt="" src="${img}">` : `<span>${c.relicView ? "🏺" : "🧪"}</span>`}</div><div class="pi-name" style="${c.font && FONTS[c.font] ? `font-family:${FONTS[c.font].css}` : ""}">${rubyHTML(c.nameRuby || c.name || "")}</div>${tx ? `<div class="pi-text">${esc(tx)}</div>` : ""}${c.flavor ? `<div class="pi-flv">${rubyHTML(c.flavor)}</div>` : ""}</div>`;
}
// which built-in potion a home-made one behaves like (for the CPU's timing)
function potionLike(k){
  if (POTIONS[k] && !potionEdit(k)) return k;
  const e = blocksOf(potionCard(k)).flatMap(b => b.then)[0]; if (!e) return "speed";
  if (e.kind === "dmgAll" || (e.kind === "dmg" && e.to === "all")) return "blast";
  return { dmg: "fire", bash: "fire", dmgRand: "fire", block: "block", heal: "heal", manaNow: "energy", manaMax: "energy", draw: "speed", vuln: "fear", vulnAll: "fear", weak: "fear", weakAll: "fear" }[e.kind] || "speed";
}
// is player s played by the computer here? (CPU match, or the simulator)
const isCpuSide = s => !G || (G.mode === "cpu" && s !== G.slot);
function givePotion(st, s, why){ givePotionKey(st, s, randPotionKey(), why); }
function givePotionKey(st, s, k, why){
  const p = P(st, s), d = potionDef(k); if (!d) return;
  p.potions = p.potions || [];
  if (p.potions.length >= POTION_MAX){ log(st, s, `${why}ポーションを見つけたが、もう持てない（${POTION_MAX}つまで）`); return; }
  p.potions.push(k); log(st, s, `${why}「${d.name}」を手に入れた`); ev(st, { type: "gain", s, what: "potion", k });
}
const potionCard = k => { const u = !POTIONS[k] && userPotion(k); if (u) return { ...u, type: "magic", frame: "spire", sk: "skill", persist: false, costX: false, payLp: null, payDisc: null, payMax: null }; const b = builtinPotionCard(k); return b ? { ...b, type: "magic", frame: "spire", sk: "skill", persist: false, costX: false, payLp: null, payDisc: null, payMax: null } : null; };
function usePotion(st, s, i, then){
  const p = P(st, s), k = (p.potions || [])[i];
  if (!k || !potionCard(k) || st.turn !== s || st.pending || st.winner) return false;
  p.potions.splice(i, 1); log(st, s, `${p.name} は「${potionDef(k).name}」を使った`);
  runCard(st, s, potionCard(k), "use", { potion: k }, then);
  return true;
}
// カード報酬: a スパイアデッキ player who destroys an opponent's monster picks 1 of 3 スパイア風 cards (→ graveyard, so it joins the deck at the next shuffle)
// (stored as [{ ids }] because Firestore can't hold arrays inside arrays)
// 報酬 (選択の祭壇): 1 of 3 cards, maybe a ポーション, maybe a レリック — each can be taken or skipped
const randPotionKey = () => { const ks = [...Object.keys(POTIONS), ...(S.userPotions || []).map(c => c.id)]; return ks[Math.floor(Math.random() * ks.length)]; };
function offerReward(st, s, extra = {}){
  const ids = draftPick(3, P(st, s).spc), r = { ids, pot: extra.pot || null, rel: extra.rel || null, cd: !ids.length, pd: !extra.pot, rd: !extra.rel };
  if (r.cd && r.pd && r.rd) return;
  const p = P(st, s); (p.rewards = p.rewards || []).push(r);
  if (isCpuSide(s)){ if (!r.cd) rewardAct(st, s, "card", cpuRewardPick(st, s, ids)); if (!r.pd) rewardAct(st, s, "pot", (p.potions || []).length < POTION_MAX ? "1" : "0"); if (!r.rd) rewardAct(st, s, "rel", "1"); if (p.rewards[0] === r) rewardAct(st, s, "done"); }
}
function rewardAct(st, s, what, val){
  const p = P(st, s), r = (p.rewards || [])[0]; if (!r) return false;
  if (what === "card" && !r.cd){ r.cd = true; if (val && r.ids.includes(val) && S.cards.has(val)){ p.grave.push(val); log(st, s, `カード報酬で「${card(val).name}」を墓地に加えた`); ev(st, { type: "gain", s, what: "card", c: val }); } else log(st, s, "カード報酬をスキップした"); }
  if (what === "pot" && !r.pd){ r.pd = true; if (val === "1") givePotionKey(st, s, r.pot, "報酬で"); else log(st, s, "ポーションを受け取らなかった"); }
  if (what === "rel" && !r.rd){ r.rd = true; if (val === "1") gainRelic(st, s, r.rel, "報酬で"); else log(st, s, "レリックを受け取らなかった"); }
  if (what === "done" || (r.cd && r.pd && r.rd)) p.rewards.shift();
  return true;
}
const takeReward = (st, s, id) => rewardAct(st, s, "card", id) && (P(st, s).rewards && P(st, s).rewards[0] && rewardAct(st, s, "done"), true);
// CPU: the rarest one (ties at random)
function cpuRewardPick(st, s, ids){ const w = { rare: 3, uncommon: 2, common: 1 }; return ids.slice().sort((a, b) => (w[rarityOf(card(b))] - w[rarityOf(card(a))]) || Math.random() - .5)[0]; }
// CPU: when to drink a potion. phase "main" = while playing cards, "end" = right before ending the turn
function cpuPotion(st, s, phase){
  const p = P(st, s), op = P(st, O(s)), L = p.potions || []; if (!L.length || st.turn !== s || st.pending || st.winner) return false;
  const ms = op.mz.map((m, i) => m ? i : -1).filter(i => i >= 0);
  const rem = i => { const m = op.mz[i]; return (atkOf(m) - (m.dmg || 0)) / (m.vuln > 0 ? 1.5 : 1); };
  const threat = ms.reduce((a, i) => a + atkOf(op.mz[i]), 0);
  const oppHp = n => (op.vuln > 0 ? Math.floor(n * 1.5) : n) - (op.block || 0);
  const handCost = p.hand.reduce((a, id) => a + (card(id).frame === "spire" ? effCost(st, s, card(id)) : 0), 0);
  const attacks = p.hand.filter(id => card(id).frame === "spire" && spireKind(card(id)) === "attack").length;
  const want = k => {
    if (k === "heal") return p.lp <= 450 || (phase === "end" && L.length >= POTION_MAX && p.lp < START_LP);
    if (k === "speed") return phase === "main" && p.mana && p.mana.cur >= 1;
    if (k === "energy") return phase === "main" && p.mana && handCost > p.mana.cur;
    if (k === "fire") return ms.length ? (ms.some(i => rem(i) <= 400) || threat >= 400) : oppHp(400) >= op.lp;
    if (k === "blast") return ms.length >= 2 || ms.some(i => rem(i) <= 200) || oppHp(200) >= op.lp || (phase === "end" && L.length >= POTION_MAX);
    if (k === "fear") return phase === "main" && attacks >= 1 && (ms.length ? ms.some(i => atkOf(op.mz[i]) >= 300 && !(op.mz[i].vuln > 0)) : !(op.vuln > 0) && attacks >= 2);
    if (k === "block") return phase === "end" && threat > (p.block || 0) + 100;
    return false;
  };
  const i = L.findIndex(k => potionCard(k) && want(potionLike(k))); if (i < 0) return false;
  return usePotion(st, s, i);
}
function refill(st, s){
  const p = P(st, s); if (p.deck.length || !p.spire || !p.grave.length) return;
  p.deck = shuffle(p.grave.splice(0)); log(st, s, `山札がなくなったので、墓地の${p.deck.length}枚をシャッフルして山札に戻した`);
}
function makeCode(){ const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function startState(pa, pb){
  const first = Math.random() < .5 ? "a" : "b";
  const fp = first === "a" ? pa : pb; if (fp.mana){ fp.mana.max = 1; fp.mana.cur = 1; }
  [pa, pb].forEach(p => { if (p.mana && p.sz.some(z => z && z.face && isAltar(z.c))){ p.mana.max = 3; p.mana.cur = p === fp ? 3 : 0; } });
  return { v: 3, started: true, players: { a: pa, b: pb }, first, turn: first, turnNo: 1, summoned: false, pending: null, winner: null, why: "", log: [{ t: Date.now(), m: `${(first === "a" ? pa : pb).name} の先攻でスタート！` }] };
}

$("#btnCreate").addEventListener("click", async () => {
  const ids = chosenDeckIds(); if (!deckOk(ids)) return;
  const code = makeCode();
  const st = { v: 3, started: false, players: { a: newPlayer(ids, null, chosenMana(), chosenSpire()) }, log: [], createdAt: Date.now(), updatedAt: Date.now(), hidden: $("#roomPrivate").checked };
  try{ await S.db.doc("rooms/" + code).set(st); } catch(e){ writeErr(e); return; }
  startOnline(code, "a", st);
});
$("#btnJoin").addEventListener("click", () => { const code = $("#joinCode").value.trim(); if (code.length !== 4){ toast("4文字の部屋コードを入れてね"); return; } joinRoom(code); });
async function joinRoom(code){
  try{
    const d = await S.db.doc("rooms/" + code).get();
    if (!d.exists){ toast("部屋 " + code + " が見つかりません"); return; }
    const st = clone(d.data());
    const mySlot = ls.get("cb_slot3_" + code, null);
    if (mySlot && st.players && st.players[mySlot]){ startOnline(code, mySlot, st); return; }
    if (st.players && st.players.b){ toast("この部屋はもう2人そろっています"); return; }
    const ids = chosenDeckIds(); if (!deckOk(ids)) return;
    const full = startState(st.players.a, newPlayer(ids, null, chosenMana(), chosenSpire()));
    full.updatedAt = Date.now(); full.hidden = !!st.hidden;
    await S.db.doc("rooms/" + code).set(full);
    startOnline(code, "b", full);
  } catch(e){ writeErr(e); }
}
function startOnline(code, slot, st){
  leaveGame();
  ls.set("cb_slot3_" + code, slot); ls.set("cb_last3", { code, t: Date.now() });
  G = { mode: "online", code, slot, st, sel: null, atkFrom: null, chooseQ: [], q: Promise.resolve(), evSeen: st.evn || 0 };
  G.unsub = S.db.doc("rooms/" + code).onSnapshot(snap => {
    if (!G || G.code !== code || !snap.exists) return;
    const prevNo = (G.st && G.st.gameNo) || 1;
    G.st = clone(snap.data());
    if ((G.st.gameNo || 1) !== prevNo){ resetLocal(); G.evSeen = G.st.evn || 0; }
    if (maybeTurnStart()) return;
    after(false);
  }, () => toast("通信が切れました。「部屋にもどる」で再接続してね"));
  S.tab = "play"; renderAll();
}
$("#btnCpu").addEventListener("click", () => {
  const ids = chosenDeckIds(); if (!deckOk(ids)) return;
  leaveGame();
  const cid = $("#cpuDeckSel").value, cd = cid && cid !== "auto" ? cpuDeckOptions().find(d => d.id === cid) : null;
  const cpuMana = cd ? !!cd.mana : chosenMana(), cpuIds = (cd || (cpuMana ? sampleManaDeck() : starterDeck())).cards.filter(id => S.cards.has(id));
  if ((!(cd && cd.spire) && cpuIds.length < MIN_DECK) || (!(cd && cd.spire) && !cpuIds.some(id => cardType(S.cards.get(id)) === "monster"))){ toast("CPUのデッキのカードが足りません。別のデッキをえらんでね"); return; }
  G = { mode: "cpu", slot: "a", st: startState(newPlayer(ids, null, chosenMana(), chosenSpire()), newPlayer(cpuIds, cd ? `CPU（${cd.name}）` : "CPU", cpuMana, deckSpireVal(cd))), sel: null, atkFrom: null, chooseQ: [], evSeen: 0 };
  autoRelic(G.st, "b");
  after(false);
});
/* ---- rematch: same players, same decks, fresh game (online: both have to say yes) ---- */
function allCardsOf(st, s){
  const p = P(st, s), out = [...p.deck, ...p.hand, ...p.grave, ...(p.exile || [])];
  p.sz.forEach(z => { if (z) out.push(z.c); });
  for (const o of ["a", "b"]) P(st, o).mz.forEach(m => { if (!m) return; if (o === s) out.push(m.c); eqsOf(m).forEach(e => { if (e.o === s) out.push(e.c); }); });
  return out;
}
function freshFrom(st, s){
  const p = P(st, s), ids = p.deckIds && p.deckIds.length ? p.deckIds : allCardsOf(st, s);
  const n = newPlayer(ids, p.name, !!p.mana, p.spire ? (p.spc === "silent" ? "silent" : true) : false); n.sleeve = p.sleeve || null; return n;
}
function resetLocal(){ Object.assign(G, { costPick: null, potPick: null, sel: null, atkFrom: null, chooseQ: [], evSeen: 0, recorded: false, prevLp: null, eqPlace: null, ssPick: null, view: null, graveHand: false, detailOpen: false, detailBack: null, lastDetail: null }); renderDetail(null); }
function rematch(){
  if (!G || !G.st || !G.st.winner || G.spectate) return;
  if (G.mode !== "online"){
    const old = G.st; clearTimeout(G.cpuT); G.cpuT = null;
    G.st = startState(freshFrom(old, "a"), freshFrom(old, "b")); autoRelic(G.st, "b"); resetLocal(); after(false); return;
  }
  const me = G.slot;
  act(st => {
    st.rematch = { ...(st.rematch || {}), [me]: true };
    if (st.rematch.a && st.rematch.b){
      const f = startState(freshFrom(st, "a"), freshFrom(st, "b"));
      f.gameNo = (st.gameNo || 1) + 1; f.hidden = !!st.hidden;
      Object.keys(st).forEach(k => delete st[k]); Object.assign(st, f);
      resetLocal();
    }
  });
}
function leaveGame(){ if (G){ G.unsub && G.unsub(); clearTimeout(G.cpuT); } G = null; renderDetail(null); }
function renderWaiting(){
  if (G.spectate){ $("#waiting").innerHTML = `<h2 style="margin:0">観戦の準備中…</h2><button class="small ghost" id="btnLeave1">やめる</button>`; return; }
  $("#waiting").innerHTML = `<h2 style="margin:0">友達を待っています…</h2><p class="muted" style="margin:0">この部屋コードを伝えてね</p><div class="code">${esc(G.code)}</div><div class="row" style="justify-content:center"><button class="small" id="btnCopy">コードをコピー</button><button class="small ghost" id="btnLeave1">やめる</button></div><p class="note" style="margin:0">相手はこのページを開いて「部屋に入る」にコードを入力します。</p>`;
}
$("#waiting").addEventListener("click", e => {
  if (e.target.closest("#btnCopy")){ const t = G.code; navigator.clipboard?.writeText(t).then(() => toast("コピーしました"), () => toast("コード: " + t)); }
  if (e.target.closest("#btnLeave1")){ const code = G && !G.spectate && G.st && !G.st.started && G.slot === "a" ? G.code : null; leaveGame(); if (code && S.db) S.db.doc("rooms/" + code).delete().catch(() => {}); renderAll(); }
});

