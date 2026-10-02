/* ================= starter cards ================= */
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function artCanvas(){ const c = document.createElement("canvas"); c.width = 336; c.height = 240; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 336, 240); return [c, x]; }
function drawMonster(seed, col){
  const [c, x] = artCanvas(); const r = rng(seed);
  x.translate(8, -38);
  x.lineJoin = x.lineCap = "round"; x.strokeStyle = "#1e2328"; x.lineWidth = 5;
  const cx = 160, cy = 172, rx = 92 + r() * 22, ry = 62 + r() * 20;
  for (const s of [-1, 1]){ x.beginPath(); x.ellipse(cx + s * rx * .5, cy + ry - 4, 20, 13, 0, 0, 7); x.fillStyle = col; x.fill(); x.stroke(); }
  if (r() > .45){ for (const s of [-1, 1]){ x.beginPath(); x.moveTo(cx + s * 30, cy - ry + 12); x.lineTo(cx + s * 52, cy - ry - 30); x.lineTo(cx + s * 64, cy - ry + 18); x.fillStyle = "#fff"; x.fill(); x.stroke(); } }
  x.beginPath();
  const n = 40, wob = [r() * 6, r() * 6];
  for (let i = 0; i <= n; i++){ const a = i / n * Math.PI * 2; const k = 1 + Math.sin(a * 3 + wob[0]) * .04 + Math.sin(a * 5 + wob[1]) * .025; const px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k; i ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.closePath(); x.fillStyle = col; x.fill(); x.stroke();
  const eyes = r() < .3 ? 1 : (r() < .8 ? 2 : 3);
  const er = eyes === 1 ? 28 : 16 + r() * 5, ey = cy - ry * .32;
  for (let i = 0; i < eyes; i++){
    const ex = eyes === 1 ? cx : cx + (i - (eyes - 1) / 2) * (er * 2.4);
    x.beginPath(); x.arc(ex, ey, er, 0, 7); x.fillStyle = "#fff"; x.fill(); x.stroke();
    x.beginPath(); x.arc(ex + er * .25, ey + er * .1, er * .45, 0, 7); x.fillStyle = "#1e2328"; x.fill();
    x.beginPath(); x.arc(ex + er * .38, ey - er * .08, er * .14, 0, 7); x.fillStyle = "#fff"; x.fill();
  }
  const my = cy + ry * .28, mw = rx * (.55 + r() * .25);
  if (r() > .4){
    x.beginPath(); x.moveTo(cx - mw, my); x.quadraticCurveTo(cx, my + 50, cx + mw, my); x.closePath(); x.fillStyle = "#6b2a2a"; x.fill(); x.stroke();
    const teeth = 5 + Math.floor(r() * 4); x.fillStyle = "#fff"; x.beginPath();
    for (let i = 0; i < teeth; i++){ const t0 = cx - mw + (2 * mw) * i / teeth, t1 = cx - mw + (2 * mw) * (i + 1) / teeth; x.moveTo(t0, my); x.lineTo((t0 + t1) / 2, my + 13); x.lineTo(t1, my); }
    x.fill(); x.lineWidth = 3; x.stroke(); x.lineWidth = 5;
  } else {
    x.beginPath(); x.arc(cx, my - 10, mw * .5, .15 * Math.PI, .85 * Math.PI); x.stroke();
    x.fillStyle = "rgba(240,120,120,.45)"; for (const s of [-1, 1]){ x.beginPath(); x.ellipse(cx + s * rx * .62, my - 6, 14, 8, 0, 0, 7); x.fill(); }
  }
  return c.toDataURL("image/jpeg", .85);
}
function drawSymbol(col, sym, trap){
  const [c, x] = artCanvas();
  x.lineJoin = x.lineCap = "round"; x.strokeStyle = "#1e2328"; x.lineWidth = 5;
  x.beginPath();
  if (trap){ // jagged jaw shape
    x.moveTo(40, 60); for (let i = 0; i <= 8; i++) x.lineTo(40 + i * 32, i % 2 ? 100 : 60); x.lineTo(296, 180); for (let i = 8; i >= 0; i--) x.lineTo(40 + i * 32, i % 2 ? 140 : 180); x.closePath();
  } else {
    const pts = 14; for (let i = 0; i <= pts * 2; i++){ const a = i / (pts * 2) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? 62 : 106; const px = 168 + Math.cos(a) * rr * 1.2, py = 120 + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.closePath();
  }
  x.fillStyle = col; x.fill(); x.stroke();
  x.beginPath(); x.arc(168, 120, 46, 0, 7); x.fillStyle = "#fff"; x.fill(); x.stroke();
  x.fillStyle = "#1e2328"; x.font = "bold 52px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(sym, 168, 124);
  return c.toDataURL("image/jpeg", .85);
}
const STARTERS = [
  { name: "ガブリン", atk: 300, effect: "", col: "#f7c873", combo: { name: "ガブリン", where: "grave", kind: "dmg", n: 100, trig: "summon" }, n: 3 },
  { name: "ぷるもち", atk: 100, col: "#f6c6d9", fx: { trig: "destroyed", kind: "heal", n: 150 }, n: 3 },
  { name: "メダマン", atk: 200, effect: "", col: "#b9dcf2", combo: { name: "ヒトツメ大王", where: "field", kind: "selfAtk", n: 200, trig: "summon" }, n: 3 },
  { name: "ツノぼうず", atk: 250, col: "#cfe8b5", fx: { trig: "summon", kind: "atkDown", n: 100 }, n: 3 },
  { name: "ねむねむ", atk: 150, col: "#d9cff2", fx: { trig: "summon", kind: "heal", n: 100 }, n: 2 },
  { name: "どすこい", atk: 400, col: "#f2b9a0", n: 2 },
  { name: "ヒトツメ大王", atk: 500, effect: "つよい。とにかくつよい。", col: "#9fd6c6", limit: 1, n: 1 },
  { name: "こっそり", atk: 50, col: "#e8e2c4", fx: { trig: "summon", kind: "draw", n: 1 }, n: 2 },
  { type: "magic", name: "がんばれ！", sym: "↑", col: "#ffd76a", fx: { kind: "atkUp", n: 150 }, n: 2 },
  { type: "magic", quick: true, name: "ふいうち", sym: "ϟ", col: "#ffe08a", fx: { kind: "atkDown", n: 150 }, effect: "", n: 2 },
  { type: "magic", name: "おかわり", sym: "+2", col: "#a8e0f0", fx: { kind: "draw", n: 2 }, n: 1 },
  { type: "magic", name: "よみがえれ", sym: "↺", col: "#c6f0c2", fx: { kind: "reborn" }, limit: 1, n: 1 },
  { type: "magic", name: "つまみぐい", sym: "✕", col: "#f5b6b6", fx: { kind: "discard", n: 1 }, n: 1 },
  { type: "magic", name: "ドカーン", sym: "!", col: "#ff9d6e", fx: { kind: "destroy" }, limit: 1, n: 1 },
  { type: "equip", name: "ぼうし", sym: "▲", col: "#ffe29a", eqN: 150, effect: "かぶるとちょっと強くなる。", n: 1 },
  { type: "equip", name: "はやぐつ", sym: "≫", col: "#b6f0e4", eqN: 0, eqAb: "twice", limit: 1, n: 1 },
  { type: "equip", name: "おもり", sym: "■", col: "#c9c9d6", eqN: -150, effect: "相手につけて重くする。", n: 1 },
  { type: "trap", name: "おとしあな", sym: "↓", col: "#c9a27a", fx: { kind: "killAtk" }, n: 1 },
  { type: "trap", name: "バリア", sym: "◎", col: "#b8c9f5", fx: { kind: "negate" }, n: 2 },
  { type: "trap", name: "カウンター", sym: "✕✕", col: "#e0c3ff", fx: { kind: "cancel" }, limit: 1, n: 1 },
  { type: "trap", name: "しかえし", sym: "!!", col: "#f2a3c7", fx: { kind: "dmg", n: 200 }, n: 1 }
];
// sample cost deck (built-in, only used by the sample mana deck)
const MANA_SAMPLE = [
  { name: "ちびスライム", atk: 100, cost: 1, col: "#bfe6ff", n: 3 },
  { name: "マナリス", atk: 50, cost: 1, col: "#c9f2d0", fx: { trig: "summon", kind: "manaMax", n: 1 }, effect: "マナを集めるリス。", n: 3 },
  { name: "ぽよぽよ", atk: 200, cost: 2, col: "#ffd1e8", n: 3 },
  { name: "まほうねこ", atk: 150, cost: 2, col: "#e3d4ff", fx: { trig: "summon", kind: "draw", n: 1 }, n: 2 },
  { name: "ガードン", atk: 300, cost: 3, col: "#ffe0a8", n: 3 },
  { name: "つのドラ", atk: 350, cost: 4, col: "#ffb8a6", fx: { trig: "summon", kind: "atkDown", n: 100 }, n: 2 },
  { name: "どっしり岩", atk: 450, cost: 5, col: "#d5d9de", effect: "うごかない。", n: 2 },
  { name: "大魔王マナドン", atk: 500, cost: 7, col: "#b7a6f2", fx: { trig: "summon", kind: "destroyAll" }, limit: 1, n: 1 },
  { type: "magic", quick: true, name: "しゅんかんバリア", sym: "◎", col: "#bde0ff", cost: 1, fx: { kind: "heal", n: 150 }, n: 2 },
  { type: "magic", quick: true, name: "うちけし", sym: "⊘", col: "#c7d2ff", cost: 2, fx: { kind: "cancel" }, n: 2 },
  { type: "magic", name: "マナのしずく", sym: "◆", col: "#9fd4ff", cost: 0, fx: { kind: "manaNow", n: 2 }, n: 2 },
  { type: "magic", name: "ひらめき", sym: "★", col: "#fff0a0", cost: 2, fx: { kind: "draw", n: 2 }, n: 2 },
  { type: "magic", name: "いかずち", sym: "ϟ", col: "#ffe066", cost: 3, fx: { kind: "destroy" }, n: 2 },
  { type: "equip", name: "まほうのつえ", sym: "✦", col: "#c4f0e6", cost: 2, eqN: 200, n: 2 },
  { type: "trap", name: "マナどろぼう", sym: "↘", col: "#b9c7ff", cost: 1, fx: { kind: "manaDrain", n: 2 }, n: 1 },
  { type: "trap", name: "まもりのかべ", sym: "▣", col: "#cfe3ff", cost: 2, fx: { kind: "negate" }, n: 2 }
];
// ソクラテスラデッキ (built in; the admin can draw the art / change the cards from the card list)
const SOCRA = [
  { name: "月村手毬", atk: 200, eqCap: 4, flavor: "「足を引っ張ったら殺すから」", n: 2 },
  { name: "物理学実験", atk: 300, eqCap: 3, fx: { trig: "summon", kind: "selfAtk", n: 300, ask: "物理学実験を履修していますか？" }, n: 2 },
  { name: "キノコ", atk: 200, eqCap: 3, abs: [{ k: "eqBonus", name: "ただの", n: 300 }], n: 2 },
  { name: "天邪鬼", atk: 300, eqCap: 4, fx: { trig: "battleLose", kind: "moveEquips" }, n: 2 },
  { type: "equip", name: "ただの", eqCost: 0 },
  { type: "equip", name: "憤怒の", eqCost: 1, eqN: 300 },
  { type: "equip", name: "傲慢な", eqCost: 2, abs: [{ k: "negateOnce" }] },
  { type: "equip", name: "暴食の", eqCost: 1, fx: { trig: "turnEnd", kind: "draw", n: 1 } },
  { type: "equip", name: "色欲の", eqCost: 2, fx: { trig: "attach", kind: "charm" } },
  { type: "equip", name: "怠惰の", eqCost: 0, abs: [{ k: "noAttack" }] },
  { type: "equip", name: "空腹の", eqCost: 1, fx: { trig: "attach", kind: "draw", n: 2 } },
  { type: "equip", name: "鉄壁の", eqCost: 1, abs: [{ k: "dmgCut", n: 300 }] },
  { type: "equip", name: "不動の", eqCost: 1, abs: [{ k: "noEffect" }] },
  { type: "equip", name: "不死の", eqCost: 2, abs: [{ k: "substitute" }] },
  { type: "equip", name: "不滅の", eqCost: 1, fx: { trig: "destroyed", kind: "equipsToHand" } },
  { type: "equip", name: "癒しの", eqCost: 1, fx: { trig: "turnStart", kind: "heal", n: 100 } },
  { type: "equip", name: "化身", eqCost: 2, abs: [{ k: "double" }] },
  { type: "equip", name: "屍術師", nameRuby: "｜屍術師《ネクロマンサー》", eqCost: 2, fx: { trig: "turnStart", kind: "revive" } },
  { type: "equip", name: "呪い", eqCost: 1, fx: { trig: "battleLose", kind: "moveEquips" } },
  { type: "equip", name: "要塞", eqCost: 1, abs: [{ k: "noAttack" }, { k: "taunt" }] },
  { type: "equip", name: "自爆する", eqCost: 1, fx: { trig: "destroyed", kind: "blast", n: 100 } }
];
const socraCard = (s, i) => ({ id: "socra-" + i, type: s.type || "monster", name: s.name, nameRuby: s.nameRuby || null, atk: s.atk || 0, eqN: s.eqN || 0, eqAb: "none", eqCost: s.eqCost ?? null, eqCap: s.eqCap ?? null, abs: s.abs || [], fx: s.fx || null, combo: null, effect: "", flavor: s.flavor || "", frame: "socra", cost: null, deckMode: "normal", limit: 3, author: "ソクラテスラ", starter: true, img: "" });
function socraDeck(){ const ids = []; SOCRA.forEach((s, i) => { for (let k = 0; k < (s.n || 1); k++) ids.push("socra-" + i); }); return { id: "socra", name: "ソクラテスラデッキ", cards: ids, builtin: true, key: "socra-0" }; }
const builtinDecks = () => [starterDeck()].concat(sampleManaDeck(), socraDeck(), spireDeck());
function sampleManaDeck(){ const ids = []; MANA_SAMPLE.forEach((s, i) => { for (let k = 0; k < s.n; k++) ids.push("mana-" + i); }); return { id: "sample-mana", name: "サンプルデッキ【コスト】", cards: ids, builtin: true, mana: true }; }
function buildStarters(){
  const extra = MANA_SAMPLE.map((s, i) => ({
    id: "mana-" + i, type: s.type || "monster", name: s.name, atk: s.type ? 0 : s.atk, effect: s.effect || "",
    fx: s.fx ? { trig: s.type ? "use" : s.fx.trig, ...s.fx } : null, cost: s.cost, quick: !!s.quick, eqN: s.eqN || 0, eqAb: "none", limit: s.limit ?? 3,
    author: "サンプル（コスト）", starter: true,
    img: s.type ? drawSymbol(s.col, s.sym, s.type === "trap") : drawMonster(777 + i * 131, s.col)
  }));
  S.starterBase = STARTERS.map((s, i) => ({
    id: "starter-" + i, type: s.type || "monster", name: s.name, atk: s.type ? 0 : s.atk, effect: s.effect || "",
    fx: s.fx ? { trig: s.type ? "use" : s.fx.trig, ...s.fx } : null, combo: s.combo || null, cost: s.cost ?? null, quick: !!s.quick, eqN: s.eqN || 0, eqAb: s.eqAb || "none", limit: s.limit ?? 3, author: "スターター", starter: true,
    img: s.type ? drawSymbol(s.col, s.sym, s.type === "trap") : drawMonster(1234 + i * 97, s.col)
  })).concat(extra, SOCRA.map(socraCard), [SPIRE_ALTAR], SPIRE_BASIC);
  S.starters = S.starterBase;
}
// スパイアデッキ: this card is face-up in the magic/trap zone from the start; every turn it offers 3 random スパイア風 cards
const SPIRE_ALTAR = { id: "spire-altar", type: "magic", frame: "spire", sk: "power", rarity: "rare", persist: true, name: "選択の祭壇", atk: 0, eqN: 0, eqAb: "none", abs: [], fx: { trig: "turnStart", kind: "draft", n: 3 }, combo: null, effect: "自分のマナは毎ターン3（増えない）。自分のターンのはじめ、手札が5枚になるまでカードを引く。自分のターンのおわり、手札をすべて墓地に捨てる。相手のモンスターを倒すたび、カード報酬（3枚から1枚）をもらい、40%でポーション、10%でレリックを手に入れる。", flavor: "スパイアデッキの始まりの一枚", cost: 0, deckMode: "both", limit: 1, author: "スターター", starter: true, img: "" };
// 攻撃 / 防御 / 強打: the basic スパイア cards (damage and block = the original ×20)
const SPIRE_BASIC = [
  { id: "spire-strike", sk: "attack", name: "攻撃", cost: 1, fx: { kind: "dmg", n: 120 } },
  { id: "spire-defend", sk: "skill", name: "防御", cost: 1, fx: { kind: "block", n: 100 } },
  { id: "spire-bash", sk: "attack", name: "強打", cost: 2, fx: { kind: "dmg", n: 160, more: [{ kind: "vuln", n: 2 }] } }
].map(x => ({ type: "magic", frame: "spire", rarity: "common", persist: false, tags: ["アイアンクラッド"], atk: 0, eqN: 0, eqAb: "none", abs: [], combo: null, effect: "", flavor: "", deckMode: "both", limit: 5, author: "スターター", starter: true, img: "", ...x, fx: { trig: "use", ...x.fx } }));
function spireDeck(){ return { id: "spire-start", name: "スパイアデッキ（はじまり）", cards: [...Array(5).fill("spire-strike"), ...Array(4).fill("spire-defend"), "spire-bash"], builtin: true, mana: true, spire: true, key: "spire-strike" }; }
const DRAFT_TAG = "アイアンクラッド";
const spirePoolAll = () => [...S.cards.values()].filter(c => c && c.frame === "spire" && !c.token && !c.ex && c.id !== SPIRE_ALTAR.id && !SPIRE_BASIC.some(b => b.id === c.id));
// 選択の祭壇などで出るのは #アイアンクラッド のついたカードだけ（1枚もなければ、スパイア風カード全部）
function draftPool(){ const all = spirePoolAll(), t = all.filter(c => tagsOf(c).includes(DRAFT_TAG)); return t.length ? t : all; }
const RARITY_W = { common: 6, uncommon: 3, rare: 1 };
function draftPick(n){
  const pool = draftPool(), out = []; n = Math.max(1, n || 3);
  while (out.length < n && pool.length){ let r = Math.random() * pool.reduce((a, c) => a + RARITY_W[rarityOf(c)], 0), k = 0; while (k < pool.length - 1 && (r -= RARITY_W[rarityOf(pool[k])]) > 0) k++; out.push(pool.splice(k, 1)[0].id); }
  return out;
}
function starterDeck(){ const ids = []; STARTERS.forEach((s, i) => { for (let k = 0; k < s.n; k++) ids.push("starter-" + i); }); return { id: "starter", name: "スターターデッキ", cards: ids, builtin: true }; }
function starterManaDeck(){ return { ...starterDeck(), id: "starter-mana", name: "スターターデッキ【コスト】", mana: true }; }
// the admin's changes to built-in cards are stored in builtin/<card id> and laid over the originals
S.builtinEdits = {};
// site: the account whose ID is "savakan" (Firestore rules check the same thing)
const ADMIN_ID = "savakan";
const isAdmin = () => !!S.db && S.loginId === ADMIN_ID;
function applyBuiltinEdits(){
  if (!S.starterBase) return;
  S.starters = S.starterBase.map(c => { const e = S.builtinEdits[c.id]; return e ? { ...c, ...e, id: c.id, starter: true, author: c.author, edited: true } : c; });
}
async function saveBuiltinDoc(id, doc){
  if (!S.db || !isAdmin()) throw { code: "not-admin" };
  await S.db.doc("builtin/" + id).set(JSON.parse(JSON.stringify(doc)));
}
async function deleteBuiltinDoc(id){
  if (!S.db || !isAdmin()) throw { code: "not-admin" };
  await S.db.doc("builtin/" + id).delete();
}
function rebuildCards(){
  applyBuiltinEdits();
  // ポーション (カード以外) live in the cards collection too, but never act as cards
  const allU = S.userCards || []; S.userPotions = allU.filter(c => c && c.type === "potion"); S.userRelics = allU.filter(c => c && c.type === "relic"); S.userCards = allU.filter(c => !(c && (c.type === "potion" || c.type === "relic")));
  S.userCards.forEach(c => { if (c && c.nameRuby == null && /《/.test(c.name || "")){ c.nameRuby = c.name; c.name = plainRuby(c.name); } });
  S.cards = new Map([...S.starters, ...S.userCards].map(c => [c.id, c]));
  rebuildOwned();
  const dl = document.getElementById("cardNames");
  if (dl) dl.innerHTML = [...new Set([...S.cards.values()].map(c => c.name))].map(n => `<option value="${esc(n)}"></option>`).join("");
  const tl = document.getElementById("tagNames");
  if (tl) tl.innerHTML = [...new Set([...S.cards.values()].flatMap(tagsOf))].map(n => `<option value="${esc(n)}"></option>`).join("");
}

/* ================= card html ================= */
function cardHTML(c, cls = "", attrs = "", opts = {}){
  if (!c) c = { name: "？", type: "monster", atk: 0 };
  const t = cardType(c);
  const art = c.img ? `<img alt="" src="${c.img}">` : `<span class="noart">絵なし</span>`;
  const ft = fxText(c);
  const lim = cardLimit(c);
  let atk = "";
  if (t === "equip" && c.eqN){ const n = c.eqN; atk = `<div class="c-atk">ATK <span class="${n >= 0 ? "up" : "dn"}">${n >= 0 ? "+" : "−"}${Math.abs(n)}</span></div>`; }
  if (t === "monster"){
    const base = baseAtk(c), mod = opts.mod || 0;
    atk = `<div class="c-atk">ATK ${mod ? `<span class="${mod > 0 ? "up" : "dn"}">${fmtN(Math.max(0, base + mod))}</span>` : fmtN(base)}</div>`;
  }
  const eqT = t === "equip" ? eqText(c) : t === "monster" ? monAbsText(c) : "";
  const eqTxt = eqT ? `<span class="fx">${esc(eqT)}</span> ` : "";
  const eqc = t === "monster" && hasEqCap(c) ? `<span class="c-eqc" title="装備キャパ">${eqCapOf(c)}</span>` : t === "equip" && eqCostOf(c) ? `<span class="c-eqc cost" title="装備コスト">−${eqCostOf(c)}</span>` : "";
  const fc = fontCss(c);
  const showCost = hasCost(c) && opts.mana !== false;
  const fl = !!(c.frameless && c.img);
  const flv = c.flavor ? plainRuby(c.flavor).trim() && c.flavor : "";
  const cl = (flv ? { s: 4, m: 3, l: 2 } : { s: 6, m: 5, l: 4 })[SIZES_T[c.textSize] ? c.textSize : "m"];
  const sv = []; if (fc) sv.push(`--cf:${fc}`); if (c.nameSize && c.nameSize !== "m") sv.push(`--nk:${sizeK(c.nameSize)}`); if (c.textSize && c.textSize !== "m") sv.push(`--tk:${sizeK(c.textSize)}`); if (cl !== 5) sv.push(`--cl:${cl};--cls:${cl}`);
  if (fl && c.flAlpha != null && isFinite(+c.flAlpha)) sv.push(`--fla:${Math.max(0, Math.min(100, +c.flAlpha))}%`);
  if (c.frame === "socra") return socraHTML(c, t, cls, attrs, opts, sv, showCost);
  if (c.frame === "spire") return spireHTML(c, t, cls, attrs, opts, sv, showCost);
  return `<div class="card ${t}${showCost ? " costed" : ""}${fl ? " frameless" : ""}${fl && c.flAlpha != null && +c.flAlpha === 0 ? " fl0" : ""}${fl && c.textEdge ? " tedge" : ""}${c.token ? " token" : ""} ${cls}" ${attrs}${sv.length ? ` style='${sv.join(";")}'` : ""}>${opts.done ? `<span class="done">${opts.done}</span>` : ""}${opts.eq ? `<span class="eqb">${esc(opts.eq)}</span>` : ""}${opts.dmg ? `<span class="dmgc" title="ダメージカウンター（ATK以上になると破壊）">ダメージ ${opts.dmg}</span>` : ""}${opts.vuln ? `<span class="vulc" title="弱体：受けるダメージが1.5倍">弱体${opts.vuln}</span>` : ""}${opts.weak ? `<span class="wkc" title="脱力：与える戦闘ダメージが0.75倍">脱力${opts.weak}</span>` : ""}<div class="c-in">${fl ? `<div class="c-bgart">${art}</div>` : ""}${showCost ? `<span class="c-cost" title="コスト">${costLabel(c)}</span>` : ""}<div class="c-name">${rubyHTML(c.nameRuby || c.name)}</div><div class="c-art">${fl ? "" : art}${eqc}<div class="c-tab">${typeLabel(c)}</div></div><div class="c-text${atk ? " ha" : ""}"><div class="body">${freeText(c) ? rubyHTML(c.effect) : `${eqTxt}${ft ? `<span class="fx">${tkLink(esc(ft))}</span> ` : ""}${exhausts(c) ? ` <span class="fx">廃棄</span>` : ""}`}</div>${flv ? `<div class="flv">${rubyHTML(flv)}</div>` : ""}${c.id ? `<span class="c-lim">${lim ? "×" + lim : "∞"}</span>` : ""}${atk}</div></div></div>`;
}
// ソクラテスラ frame (hand-drawn club cards): 「・憤怒　の▷」 banner for equips, a band for monsters,
// equip capacity / cost in a circle at the bottom left, ATK (or the equip's ATK change) outlined at the bottom right
function socraHTML(c, t, cls, attrs, opts, sv, showCost){
  const raw = c.nameRuby || c.name || "";
  const m = t === "equip" ? raw.match(/^(.+?)(の|な|する)$/) : null;
  const nameH = t === "equip" ? `<span class="s-dot">・</span><span class="s-main">${rubyHTML(m ? m[1] : raw)}</span>${m ? `<span class="s-suf">${m[2]}</span>` : ""}` : `<span class="s-main">${rubyHTML(raw)}</span>`;
  const lines = [];
  if (t === "equip" && c.eqN) lines.push(`ATK ${c.eqN > 0 ? "+" : "−"}${Math.abs(c.eqN)}`);
  absOf(c).forEach(a => lines.push(ABS[a.k].self ? abPhrase(a) : `このモンスターは${abPhrase(a)}`));
  const ft = fxText(c); if (ft) lines.push(ft.replace(/装備したモンスター/g, "このモンスター"));
  let body = lines.map(l => `<div>・${tkLink(esc(l))}</div>`).join("");
  if (exhausts(c)) body += `<div>・廃棄</div>`;
  if (freeText(c)) body = `<div>${rubyHTML(c.effect)}</div>`;
  if (!body && !c.flavor && t === "equip") body = `<div>・効果なし</div>`;
  const cap = t === "monster" ? `<span class="s-cap" title="装備キャパ">${eqCapOf(c)}</span>` : t === "equip" ? `<span class="s-cap" title="装備コスト">${eqCostOf(c) ? "−" + eqCostOf(c) : "0"}</span>` : "";
  let num = "";
  if (t === "monster"){ const base = baseAtk(c), mod = opts.mod || 0; num = `<span class="s-atk s-box ${mod > 0 ? "up" : mod < 0 ? "dn" : ""}">${fmtN(Math.max(0, base + mod))}</span>`; }
  else if (t === "equip" && c.eqN) num = `<span class="s-atk">${c.eqN > 0 ? "+" : "−"}${Math.abs(c.eqN)}</span>`;
  const art = c.img ? `<img alt="" src="${c.img}">` : "";
  return `<div class="card socra ${t}${showCost ? " costed" : ""}${c.token ? " token" : ""} ${cls}" ${attrs}${sv.length ? ` style='${sv.join(";")}'` : ""}>${opts.done ? `<span class="done">${opts.done}</span>` : ""}${opts.eq ? `<span class="eqb">${esc(opts.eq)}</span>` : ""}${opts.dmg ? `<span class="dmgc" title="ダメージカウンター（ATK以上になると破壊）">ダメージ ${opts.dmg}</span>` : ""}${opts.vuln ? `<span class="vulc" title="弱体：受けるダメージが1.5倍">弱体${opts.vuln}</span>` : ""}${opts.weak ? `<span class="wkc" title="脱力：与える戦闘ダメージが0.75倍">脱力${opts.weak}</span>` : ""}<div class="c-in">${showCost ? `<span class="c-cost" title="コスト">${costLabel(c)}</span>` : ""}<div class="s-name">${nameH}</div><div class="c-art">${art}</div><div class="c-text"><div class="body">${body}</div>${c.flavor ? `<div class="flv">${rubyHTML(c.flavor)}</div>` : ""}</div>${cap}${num}</div></div>`;
}
// スパイア風 frame: gem cost at the top left, ribbon name over an arched picture, type plaque, centered text
const exhausts = c => !!(c && c.exhaust && (cardType(c) === "magic" || cardType(c) === "trap"));
// トークンの名前（「○○」）に下線を引いて、押すとそのトークンの詳細が開くようにする
var TK_CACHE;
function tokenMap(){
  const now = Date.now();
  if (!TK_CACHE || TK_CACHE.n !== S.cards.size || now - TK_CACHE.at > 3000){
    const m = new Map(); S.cards.forEach(c => { if (c && c.token && c.name && !m.has(c.name)) m.set(c.name, c.id); });
    TK_CACHE = { n: S.cards.size, at: now, map: m };
  }
  return TK_CACHE.map;
}
function tkLink(html){
  const m = tokenMap(); if (!m.size || !html) return html;
  return html.replace(/「([^「」<>]{1,40})」/g, (all, nm) => { const raw = nm.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); const id = m.get(raw); return id ? `「<span class="tk-link" role="link" tabindex="0" data-tk="${esc(id)}">${nm}</span>」` : all; });
}
function openTokenView(id){ if (S.cards.has(id)) openCardView("token", [id], 0); }
document.addEventListener("click", e => { const a = e.target.closest && e.target.closest(".tk-link"); if (!a) return; e.preventDefault(); e.stopPropagation(); openTokenView(a.dataset.tk); }, true);
document.addEventListener("keydown", e => { if (e.key !== "Enter") return; const a = e.target.closest && e.target.closest(".tk-link"); if (a){ e.preventDefault(); e.stopPropagation(); openTokenView(a.dataset.tk); } }, true);
// 自由に書いた文があれば、カードの表にはそれだけを出す（本来の効果はカードを開くと見られる）
function freeText(c){ return c && c.effect && plainRuby(c.effect).trim() ? c.effect : ""; }
const spireKw = s => s.replace(/【[^】]*】|廃棄|ブロック|弱体/g, m => `<span class="kw">${m}</span>`);
function spireHTML(c, t, cls, attrs, opts, sv, showCost){
  const parts = [];
  const eqT = t === "equip" ? eqText(c) : t === "monster" ? monAbsText(c) : "";
  if (eqT) parts.push(spireKw(esc(eqT)));
  const ft = fxText(c).replace(/^【永続】使ったあとも場に残る。?/, ""); if (ft) parts.push(tkLink(spireKw(esc(ft))));
  if (exhausts(c)) parts.push(`<span class="kw">廃棄</span>`);
  if (freeText(c)) parts.splice(0, parts.length, spireKw(rubyHTML(c.effect)));
  const body = parts.map(p => /[。．.！!）)]$/.test(p.replace(/<[^>]*>/g, "")) ? p : p + "。").join("<br>");
  let num = "", cap = "";
  if (t === "monster"){ const base = baseAtk(c), mod = opts.mod || 0; num = `<span class="p-atk ${mod > 0 ? "up" : mod < 0 ? "dn" : ""}"><small>ATK</small><b>${fmtN(Math.max(0, base + mod))}</b></span>`; if (hasEqCap(c)) cap = `<span class="p-cap" title="装備キャパ">${eqCapOf(c)}</span>`; }
  else if (t === "equip"){ if (c.eqN) num = `<span class="p-atk ${c.eqN > 0 ? "up" : "dn"}"><small>ATK</small><b>${c.eqN > 0 ? "+" : "−"}${Math.abs(c.eqN)}</b></span>`; if (eqCostOf(c)) cap = `<span class="p-cap" title="装備コスト">−${eqCostOf(c)}</span>`; }
  const art = c.img ? `<img alt="" src="${c.img}">` : "";
  return `<div class="card spire ${t} sk-${spireKind(c)} rar-${rarityOf(c)}${showCost ? " costed" : ""}${c.token ? " token" : ""} ${cls}" ${attrs}${sv.length ? ` style='${sv.join(";")}'` : ""}>${opts.done ? `<span class="done">${opts.done}</span>` : ""}${opts.eq ? `<span class="eqb">${esc(opts.eq)}</span>` : ""}${opts.dmg ? `<span class="dmgc" title="ダメージカウンター（ATK以上になると破壊）">ダメージ ${opts.dmg}</span>` : ""}${opts.vuln ? `<span class="vulc" title="弱体：受けるダメージが1.5倍">弱体${opts.vuln}</span>` : ""}${opts.weak ? `<span class="wkc" title="脱力：与える戦闘ダメージが0.75倍">脱力${opts.weak}</span>` : ""}<div class="p-base"></div><div class="p-art">${art}</div><div class="p-over"></div><div class="p-gemimg"></div>${showCost ? `<span class="p-gem" title="コスト">${costLabel(c)}</span>` : ""}<div class="p-name"><span>${rubyHTML(c.nameRuby || c.name || "")}</span></div><div class="p-type">${SPIRE_LABEL[spireKind(c)]}</div><div class="p-text"><div class="body">${body}</div>${c.flavor ? `<div class="flv">${rubyHTML(c.flavor)}</div>` : ""}</div>${cap}${num}</div>`;
}
// card back: the owner's own sleeve if they drew one
const backHTML = (cls = "", attrs = "", sleeve = "") => sleeve && /^data:image\//.test(sleeve)
  ? `<div class="card back sleeve ${cls}" ${attrs}><div class="c-in" style="background-image:url('${sleeve}')"></div></div>`
  : `<div class="card back ${cls}" ${attrs}><div class="c-in"><span>?</span></div></div>`;
const mySleeve = () => ls.get("cb_sleeve", "") || "";

/* ================= ownership ================= */
// cards/decks belong to the signed-in account (ownerId). Older items without ownerId fall back to the player name.
S.uid = null;
function isMine(x, nameKey = "author"){
  if (!x || x.starter || x.builtin) return false;
  if (x.ownerId) return !!S.uid && x.ownerId === S.uid;
  return x[nameKey] === S.name;
}

// cards you can put in a deck: starters, cards you drew, and cards you got by trading
S.trades = { in: [], out: [] }; S.tradesReady = false; S.owned = new Set();
function allTrades(){ const m = new Map(); [...S.trades.in, ...S.trades.out].forEach(t => m.set(t.id, t)); return [...m.values()]; }
function rebuildOwned(){
  const o = new Set(S.starters.map(c => c.id));
  S.userCards.forEach(c => { if (!S.db || isMine(c)) o.add(c.id); });
  if (S.uid) allTrades().forEach(t => { if (t.status !== "accepted") return; if (t.from === S.uid) o.add(t.want); if (t.to === S.uid) o.add(t.give); });
  S.owned = o;
}
const owns = id => S.owned.has(id);

/* ================= data layer ================= */
const local = { cards(){ return ls.get("cb_cards", []); }, decks(){ return ls.get("cb_decks", []); } };
// card art: saved at the drawing canvas's full size (560×400).
// Line drawings usually fit as PNG (no quality loss at all); photos and busy drawings
// use whichever of WebP / JPEG is smaller at high quality, stepping down only if needed.
const ART_BUDGET = 150000; // characters of the data URL (about 110KB; the database allows 256KB per card)
function encodeArt(c, alpha){
  const png = c.toDataURL("image/png");
  if (png.length <= ART_BUDGET) return png;
  const webp = c.toDataURL("image/webp", .5).startsWith("data:image/webp");
  // see-through pictures (ポーション): never JPEG, it would turn the background black
  if (alpha && webp){ let u = png; for (const q of [.92, .86, .8, .72, .64, .56, .48, .4]){ u = c.toDataURL("image/webp", q); if (u.length <= ART_BUDGET) break; } return u; }
  let url = "";
  for (const q of [.92, .86, .8, .72, .64, .56, .48]){
    const j = c.toDataURL("image/jpeg", q), w = webp ? c.toDataURL("image/webp", q) : j;
    url = w.length < j.length ? w : j;
    if (url.length <= ART_BUDGET) break;
  }
  return url;
}
async function saveCardDoc(id, doc){
  if (JSON.stringify(doc).length > 900000) throw { code: "too-big" };
  if (S.db){ await S.db.doc("cards/" + id).set(doc); }
  else { const a = local.cards().filter(c => c.id !== id); a.push({ id, ...doc }); ls.set("cb_cards", a); S.userCards = a; rebuildCards(); renderAll(); }
}
async function deleteCardDoc(id){
  if (S.db){ await S.db.doc("cards/" + id).delete(); }
  else { const a = local.cards().filter(c => c.id !== id); ls.set("cb_cards", a); S.userCards = a; rebuildCards(); renderAll(); }
}
async function saveDeckDoc(id, doc){
  if (S.db){ await S.db.doc("decks/" + id).set(doc); }
  else { const a = local.decks().filter(d => d.id !== id); a.push({ id, ...doc }); ls.set("cb_decks", a); S.decks = a; renderAll(); }
}
async function deleteDeckDoc(id){
  if (S.db){ await S.db.doc("decks/" + id).delete(); }
  else { const a = local.decks().filter(d => d.id !== id); ls.set("cb_decks", a); S.decks = a; renderAll(); }
}
function subscribeData(){
  if (S.db){
    S.db.collection("cards").onSnapshot(snap => { S.userCards = snap.docs.map(d => ({ id: d.id, ...d.data() })); rebuildCards(); renderAll(); }, () => toast("カードの読みこみが止まりました。ページを開きなおしてね"));
    S.db.collection("decks").onSnapshot(snap => { S.decks = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll(); }, () => {});
    S.db.collection("builtin").onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); S.builtinEdits = m; rebuildCards(); renderAll(); }, () => {});
    subscribeTrades();
  } else { S.userCards = local.cards(); S.decks = local.decks(); rebuildCards(); renderAll(); }
}
const writeErr = e => toast(e && e.code === "too-big" ? "カードのデータが大きすぎて保存できません。効果の文章を短くしてみてね" : e && (e.code === "permission-denied" || e.code === "invalid_argument") ? "保存できませんでした（権限がありません）。自分のカード以外は変更できないよ" : e && e.code === "quota_exceeded" ? "保存容量がいっぱいです。古いカードを消してね" : "保存できませんでした。もう一度ためしてね");

