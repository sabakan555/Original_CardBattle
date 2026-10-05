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
// ナナシデッキ（サバ缶のうちの子デッキ）のサンプル: 質量・合成と、効果のブロック表示
const NB = (trig, then, extra) => ({ trig, join: "and", conds: [], then, else: [], ...(extra || {}) });
const NANASHI = [
  { nid: 3, type: "magic", name: "PHASE-1　生贄", col: "#d9c79c", sym: "✝", blocks: [NB("use", [{ kind: "draw", n: 1, dn: "発見", di: "cards", dd: "山札から１ドロー" }, { kind: "millBoth", n: 1, dn: "反発", di: "clash", dd: "互いの山札を１枚破壊" }], { bn: "生贄", bic: "ikenie", bd: "任意の効果を一つ発動し、破壊。", one: true })] },
  { nid: 0, type: "monster", name: "PHASE-2　四足", atk: 300, mass: 2, col: "#b9c4d8", blocks: [NB("turnStart", [{ kind: "draw", n: 1, dn: "発見", di: "cards", dd: "山札から1枚ドローする。" }, { kind: "selfDisc", n: 1, dn: "自己破壊", di: "trash", dd: "自分は手札を1枚選んで捨ててもよい" }], { bn: "起爆" })] },
  { nid: 1, type: "monster", name: "PHASE-2　暴食の王", atk: 200, mass: 3, col: "#e3a6a0", blocks: [NB("while", [{ kind: "selfAtk", n: 200, dn: "攻撃力ＵＰ", di: "sword", dd: "ATK＋200" }]), NB("kill", [{ kind: "absorbKill", dn: "暴食の王", di: "teeth", dd: "バトルに勝った時、相手を質量として取り込む" }])] },
  { nid: 4, type: "magic", name: "PHASE-3　分裂", col: "#a8dcc8", sym: "◎", blocks: [NB("use", [{ kind: "matCopy", dn: "分裂", di: "split", dd: "場にある質量１枚をコピーして、それを場に出す" }], { bn: "呪文", bic: "jumon", bd: "効果を全て発動し、このカードを破壊" })] },
  { nid: 5, type: "magic", name: "PHASE-3　再生", col: "#b9e2a6", sym: "♻", blocks: [NB("use", [{ kind: "graveHand", dn: "蘇生", di: "revive", dd: "捨て札を１枚手札に戻す" }, { kind: "heal", n: 100, dn: "自己修復", di: "heart", dd: "LP+100" }], { bn: "生贄", bic: "ikenie", bd: "任意の効果を発動し、破壊", one: true })] },
  { nid: 2, type: "magic", name: "PHASE-3　合成", col: "#cdb7f0", sym: "⊕", blocks: [NB("use", [{ kind: "synth", dn: "合成", di: "synth", dd: "手札を1枚選び、場のモンスターにその効果を付与する。効果1つにつき1質量必要" }], { bn: "呪文", bic: "jumon", bd: "効果を全て発動し、このカードを破壊" })] },
  { nid: 6, type: "monster", name: "PHASE-3　繭", atk: 300, mass: 5, col: "#e8e2c4", abs: [{ k: "noAttack", dn: "不動", di: "lock", dd: "このカードは攻撃しない" }], blocks: [NB("destroyed", [{ kind: "matOut", dn: "増殖", di: "cocoon", dd: "質量を全て場に放出（出せなかった分は墓地へ）" }], { bn: "不発弾", bic: "jirai", bd: "このモンスターが破壊されたとき、効果を全て発動する" })] },
  { nid: 7, type: "magic", field: true, fieldMine: true, land: true, name: "PHASE-4　空集合", mass: 7, col: "#c9c9d6", sym: "∅", blocks: [NB("turnStart", [{ kind: "stealGrave", n: 1, dn: "侵食", di: "void", dd: "ターン開始時、相手の捨て札を１枚自分の墓地に送る" }]), NB("turnEnd", [{ kind: "fieldOut", dn: "増殖", di: "box", dd: "ターン終了時、質量の半分をこのカードとして場に出す" }])] },
  { nid: 8, limit: 1, type: "monster", name: "PHASE-5　ナナシ", atk: 0, mass: 15, anySum: true, anyDn: "顕現", col: "#3b3f4a", blocks: [NB("while", [{ kind: "selfAtk", n: 0, per: "mass5", pm: 400, dn: "成長", di: "sword", dd: "ATK：(質量の数)÷5（切り捨て）×400" }])] }
];
const socraCard = (s, i) => ({ id: "socra-" + i, type: s.type || "monster", name: s.name, nameRuby: s.nameRuby || null, atk: s.atk || 0, eqN: s.eqN || 0, eqAb: "none", eqCost: s.eqCost ?? null, eqCap: s.eqCap ?? null, abs: s.abs || [], fx: s.fx || null, combo: null, effect: "", flavor: s.flavor || "", frame: "socra", cost: null, deckMode: "normal", limit: 3, author: "ソクラテスラ", starter: true, img: "" });
function socraDeck(){ const ids = []; SOCRA.forEach((s, i) => { for (let k = 0; k < (s.n || 1); k++) ids.push("socra-" + i); }); return { id: "socra", name: "ソクラテスラデッキ", cards: ids, builtin: true, key: "socra-0" }; }
// ナナシデッキ（25枚）: 1種類3枚まで（ナナシは1枚）
const NANASHI_DECK = { 3: 3, 0: 3, 1: 3, 5: 3, 4: 3, 2: 3, 6: 3, 7: 3, 8: 1 };
function nanashiDeck(){ const ids = []; Object.entries(NANASHI_DECK).forEach(([k, n]) => { for (let r = 0; r < n; r++) ids.push("nanashi-" + k); }); return { id: "nanashi", name: "ナナシデッキ", cards: ids, builtin: true, key: "nanashi-8" }; }
const builtinDecks = () => [starterDeck()].concat(sampleManaDeck(), socraDeck(), nanashiDeck(), spireDeck());
function sampleManaDeck(){ const ids = []; MANA_SAMPLE.forEach((s, i) => { for (let k = 0; k < s.n; k++) ids.push("mana-" + i); }); return { id: "sample-mana", name: "サンプルデッキ【コスト】", cards: ids, builtin: true, mana: true }; }
function buildStarters(){
  const extra = MANA_SAMPLE.map((s, i) => ({
    id: "mana-" + i, type: s.type || "monster", name: s.name, atk: s.type ? 0 : s.atk, effect: s.effect || "",
    fx: s.fx ? { trig: s.type ? "use" : s.fx.trig, ...s.fx } : null, cost: s.cost, quick: !!s.quick, eqN: s.eqN || 0, eqAb: "none", limit: s.limit ?? 3,
    author: "サンプル（コスト）", starter: true,
    img: s.type ? drawSymbol(s.col, s.sym, s.type === "trap") : drawMonster(777 + i * 131, s.col)
  }));
  // 前のスターター（STARTERS）は練習バトル用に裏で残すだけ（図鑑・デッキ作りには出さない）
  S.hiddenBase = STARTERS.map((s, i) => ({
    id: "starter-" + i, tut: true, type: s.type || "monster", name: s.name, atk: s.type ? 0 : s.atk, effect: s.effect || "",
    fx: s.fx ? { trig: s.type ? "use" : s.fx.trig, ...s.fx } : null, combo: s.combo || null, cost: s.cost ?? null, quick: !!s.quick, eqN: s.eqN || 0, eqAb: s.eqAb || "none", limit: s.limit ?? 3, author: "スターター", starter: true,
    img: s.type ? drawSymbol(s.col, s.sym, s.type === "trap") : drawMonster(1234 + i * 97, s.col)
  }));
  S.starterBase = STARTER_CARDS.map(c => ({ ...c })).concat(extra, SOCRA.map(socraCard), [SPIRE_ALTAR], SPIRE_BASIC, NANASHI.map(s => ({ id: "nanashi-" + s.nid, effect: "", flavor: "", eqN: 0, eqAb: "none", abs: [], cost: null, deckMode: "normal", limit: 3, author: "ナナシ（サンプル）", starter: true, frame: "socra", fxRows: true, ...s, img: s.type === "magic" ? drawSymbol(s.col, s.sym, false) : drawMonster(4321 + s.nid * 53, s.col) })));
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
function starterDeck(){ return { id: "starter", name: "スターターデッキ", cards: STARTER_DECK_IDS.slice(), builtin: true, key: STARTER_DECK_KEY }; }
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
  S.cards = new Map([...S.starters, ...(S.hiddenBase || []), ...S.userCards].map(c => [c.id, c]));
  rebuildOwned();
  rebuildCtrEmb();
  const dl = document.getElementById("cardNames");
  if (dl) dl.innerHTML = [...new Set([...S.cards.values()].map(c => c.name))].map(n => `<option value="${esc(n)}"></option>`).join("");
  const tl = document.getElementById("tagNames");
  if (tl) tl.innerHTML = [...new Set([...S.cards.values()].flatMap(tagsOf))].map(n => `<option value="${esc(n)}"></option>`).join("");
}

/* ================= card html ================= */
// キラ加工（holo）と名前の箔（foil）: どの枠のカードにも上からかぶせる
const HOLO = { rainbow: "虹ホロ", sparkle: "星くず", galaxy: "ギャラクシー" };
const FOIL = { gold: "金", silver: "銀", bronze: "銅", rainbow: "虹" };
// キーワードの説明: カードの外（詳細・図鑑の文）の下線つきの言葉をタップすると出る
document.addEventListener("click", e => {
  const k = e.target.closest && e.target.closest(".kwd"); let pop = document.getElementById("kwPop");
  if (!k || k.closest(".card")){ if (pop && !(e.target.closest && e.target.closest("#kwPop"))) pop.hidden = true; return; }
  e.stopPropagation(); e.preventDefault();
  if (!pop){ pop = document.createElement("div"); pop.id = "kwPop"; pop.setAttribute("role", "tooltip"); document.body.appendChild(pop); }
  const w = k.dataset.kw; pop.innerHTML = `<b>${esc(w)}</b>${esc(KW_DESC[w] || "")}`; pop.hidden = false;
  const r = k.getBoundingClientRect(), pw = Math.min(300, innerWidth - 24); pop.style.width = pw + "px";
  pop.style.left = Math.max(12, Math.min(innerWidth - pw - 12, r.left + r.width / 2 - pw / 2)) + "px";
  const ph = pop.offsetHeight; pop.style.top = (r.bottom + 8 + ph < innerHeight ? r.bottom + 8 : Math.max(8, r.top - ph - 8)) + "px";
}, true);
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("kwd") && !e.target.closest(".card")){ e.preventDefault(); e.target.click(); } });
const HEX6 = /^#[0-9a-f]{6}$/i;
// 効果のブロック表示: 効果ごとに【名前】・アイコン・説明の行。「いつ」がある効果が2つ以上なら見出し行（「これより下の効果を発動する」）
const FX_ICONS = { cards: "カード", trash: "ゴミ箱", heart: "十字（回復）", revive: "棺（蘇生）", split: "分裂", cocoon: "もくもく（増殖）", clash: "ふたり（反発）", box: "箱（生成）", lock: "鎖（不動）", void: "空集合", ikenie: "生贄（見出し用）", jumon: "呪文（見出し用）", jirai: "地雷（見出し用）", sword: "剣", teeth: "牙", bomb: "爆弾", synth: "合成", spark: "星", flag: "旗" };
const FX_ROW_DEF = { draw: ["発見", "cards"], drawUntil: ["発見", "cards"], selfDisc: ["自己破壊", "trash"], selfDiscRand: ["自己破壊", "trash"], selfDiscAll: ["自己破壊", "trash"], selfAtk: ["攻撃力ＵＰ", "sword"], atkUp: ["攻撃力ＵＰ", "sword"], absorbKill: ["暴食の王", "teeth"], synth: ["合成", "synth"], heal: ["自己修復", "heart"], millBoth: ["反発", "clash"], graveHand: ["蘇生", "revive"], matCopy: ["分裂", "split"], matOut: ["増殖", "cocoon"], stealGrave: ["吸いこみ", "void"], fieldOut: ["増殖", "box"] };
// ブロック表示: 名前つきの能力は行で出すので、上の行（要求質量のとなり）には名前のない能力だけ
const fxAbsText = c => monAbsText({ ...c, abs: absOf(c).filter(a => !a.dn) });
// 枠ごと絵になっているアイコン（Figma）: sq=四角 / tall=2行ぶん / shield=生贄の旗 / dia=ひし形
const FX_FULL = { trash: "sq", split: "sq", revive: "sq", heart: "sq", lock: "sq", cocoon: "sq", clash: "sq", box: "sq", jirai: "sq", synth: "tall", ikenie: "shield", jumon: "dia" };
function fxRowsHTML(c, noMeta, noIc){
  const t = cardType(c), rows = [];
  const row = o => { const k = FX_ICONS[o.ic] ? o.ic : "spark", fl = noIc ? "" : FX_FULL[k] || ""; return `<div class="fxr${o.hdr ? " hdr" : ""}${noIc ? " noic" : ""}${fl === "tall" ? " tall" : ""}">${noIc ? "" : `<span class="fxr-ic${fl ? " full " + fl : ""}"><i class="fxi fxi-${k}"></i></span>`}<div class="fxr-tx"><b>【${esc(o.name)}】</b>${o.small ? `<small>（${esc(o.small)}）</small>` : ""}<span class="fxr-d">${o.mk ? `<i class="fxi fxi-${o.mk}"></i>` : ""}<span>${tkLink(esc(o.desc))}</span></span></div>${o.badge ? `<span class="fxr-bd">${esc(o.badge)}</span>` : ""}</div>`; };
  const tLabel = trig => t === "monster" || t === "equip" ? (trig === "act" ? "起動" : trigLabel(t, trig)) : isField(c) ? fieldTrigLabel(c, trig) || "" : isPersist(c) ? PERSIST_TRIG_LABEL[trig] || "" : "";
  const one = (e, pre) => { const d = FX_ROW_DEF[e.kind] || [String((KINDS[e.kind] || {}).label || "効果").replace(/（.*$/, "").slice(0, 10), "spark"];
    const badge = (e.kind === "selfAtk" || e.kind === "atkUp" || e.kind === "heal") && e.n ? `+${e.n}` : e.kind === "dmg" && e.n ? String(e.n) : "";
    return { name: e.dn || d[0], ic: e.di || d[1], desc: e.dd || (pre || "") + effsText(c, [e]), badge }; };
  // 名前つきの能力（例: 【不動】攻撃できない）も1行に
  absOf(c).filter(a => a.dn).forEach(a => rows.push(row({ name: a.dn, ic: a.di || "lock", desc: a.dd || abPhrase(a) })));
  blocksOf(c).forEach(b => {
    const effs = b.then || [], timed = !["use", "while"].includes(b.trig) || b.delay > 0, tl = tLabel(b.trig), cond = condsText(b);
    const p1 = b.one && effs.length > 1, hdr = (timed && (effs.length >= 2 || b.bn)) || p1 || !!b.bn;
    // 「これより下の効果を発動」の印: ふつうは旗、破壊されたときの効果はドクロ
    const mk = b.trig === "destroyed" ? "skull" : "flag";
    if (hdr) rows.push(row({ hdr: true, mk, name: b.bn || tl || "1つえらぶ", ic: b.bic || "bomb", small: b.bn ? tl : "", desc: cond + (b.bd || (p1 ? "これより下の効果から1つえらんで発動する。" : "これより下の効果を発動する。")) }));
    effs.forEach((e, k) => rows.push(row({ ...one(e, k === 0 ? (!hdr && timed ? `${tl}、` : "") + (!hdr ? cond : "") : ""), ...(k === 0 && !hdr && b.trig === "destroyed" ? { mk: "skull" } : {}) })));
    (b.conds.length ? b.else || [] : []).forEach(e => rows.push(row(one(e, "そうでなければ、"))));
  });
  if (c.anySum && t === "monster") rows.push(row({ name: c.anyDn || "どこからでも", ic: "spark", desc: "ターン開始時、質量が足りていればどこからでも召喚できる（してもしなくてもいい）" }));
  const meta = [massOf(c) ? `要求質量 ${massOf(c)}` : "", t === "monster" ? fxAbsText(c) : t === "equip" ? eqText(c) : ""].filter(Boolean).join("　");
  return `${meta && !noMeta ? `<div class="fxr-meta">${kwLink(esc(meta))}</div>` : ""}<div class="fxrs">${rows.join("")}</div>`;
}
// 画像の枠: カードの frame → クラス名
const FR_CLS = { mtg: "mtg", future: "fut", ygo: "ygo", dm: "dm" };
// 遊戯王風: コストを星で。枠に入る数（モンスター13・罠10・魔法9）をこえたら「★×14」
const YGO_STAR_MAX = { monster: 13, trap: 10 };
function ygoStars(v, t){
  const s = String(v ?? "").trim(); if (s === "") return "";
  const max = YGO_STAR_MAX[t] || 9, n = /^\d+$/.test(s) ? +s : null;
  if (n != null && n >= 1 && n <= max) return `<i class="ys"></i>`.repeat(n);
  return `<i class="ys"></i><span class="ys-x">×${esc(s)}</span>`;
}
function cardHTML(c, cls = "", attrs = "", opts = {}){
  // 画像の枠（MTG風・近未来）: ふつうの枠と同じ中身に、枠の画像と文字の位置をかぶせる
  const fr = c && !c.potionView && !c.relicView && FR_CLS[c.frame] ? c.frame : "", mt = !!fr;
  let h = cardHTML0(mt ? { ...c, frameless: fr === "future" ? c.frameless : false } : c, cls, attrs, opts);
  // MTG風の枠（サバ缶デザイン）: ふつうの枠と同じ中身に、枠の見た目と下の宝石をかぶせる
  // MTG風: カードのフォントが標準（手書き）のままなら、Figmaのデザインのフォントを使う
  if (mt && (!c.font || c.font === "klee")) h = h.replace(/--cf:[^;']*;?/, "");
  if (fr === "future" && !/<span class="c-cost"/.test(h)) h = h.replace('<div class="c-in">', '<div class="c-in"><span class="c-cost nocost" title="コストなし">‐</span>');
  if (fr === "ygo") h = h.replace(/<span class="c-cost"([^>]*)>([^<]*)<\/span>/, (m, a, v) => `<span class="c-cost"${a}>${ygoStars(v, cardType(c))}</span>`);
  if (mt) h = h.replace(/^<div class="card /, `<div class="card ${FR_CLS[fr]}${(fr === "mtg" || fr === "dm") && HEX6.test(c.colF || "") ? " mcol" : ""} `).replace(/<\/div>$/, `<span class="m-gem" aria-hidden="true"></span></div>`).replace(/<div class="c-atk">ATK /, `<div class="c-atk">`).replace(/<div class="c-name">([\s\S]*?)<\/div><div class="c-art">/, `<div class="c-name"><span class="m-nm">$1</span></div><div class="c-art">`);
  if (c && c.fxRows && !freeText(c) && !c.potionView && !c.relicView && c.frame !== "spire" && c.frame !== "socra") h = h.replace(/^<div class="card /, '<div class="card fxrows ').replace(/<div class="body">[\s\S]*?<\/div>(?=<div class="flv">|<span class="c-lim">|<div class="c-atk">|<\/div><\/div>)/, () => `<div class="body">${fxRowsHTML(c)}</div>`);
  if (c && c.land && isField(c) && !c.potionView && !c.relicView && !FR_CLS[c.frame] && c.frame !== "spire") h = h.replace(/^<div class="card /, '<div class="card land ');
  const ho = c && HOLO[c.holo] ? c.holo : "", fo = c && FOIL[c.foil] ? c.foil : "";
  if (!ho && !fo) return h;
  return h.replace(/^<div class="card /, `<div class="card${ho ? ` holo holo-${ho}` : ""}${fo ? ` foil-${fo}` : ""} `).replace(/<\/div>$/, ho ? `<span class="holo-fx" aria-hidden="true"></span></div>` : "</div>");
}
function cardHTML0(c, cls = "", attrs = "", opts = {}){
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
  const eqTxt = eqT ? `<span class="fx">${kwLink(esc(eqT))}</span> ` : "";
  const eqc = t === "monster" && hasEqCap(c) ? `<span class="c-eqc" title="装備キャパ">${eqCapOf(c)}</span>` : t === "equip" && eqCostOf(c) ? `<span class="c-eqc cost" title="装備コスト">−${eqCostOf(c)}</span>` : "";
  const fc = fontCss(c);
  const showCost = hasCost(c) && opts.mana !== false;
  const fl = !!(c.frameless && c.img);
  const flv = c.flavor ? plainRuby(c.flavor).trim() && c.flavor : "";
  const cl = (flv ? { s: 4, m: 3, l: 2 } : { s: 6, m: 5, l: 4 })[SIZES_T[c.textSize] ? c.textSize : "m"];
  const sv = []; if (fc) sv.push(`--cf:${fc}`); if (c.nameSize && c.nameSize !== "m") sv.push(`--nk:${sizeK(c.nameSize)}`); if (c.textSize && c.textSize !== "m") sv.push(`--tk:${sizeK(c.textSize)}`); if (cl !== 5) sv.push(`--cl:${cl};--cls:${cl}`);
  // 自分で決めた枠の色（ふつうの枠だけ）
  if (HEX6.test(c.colF || "")) sv.push(`--cframe:${c.colF}`); if (HEX6.test(c.colB || "")) sv.push(`--cbg:${c.colB}`);
  if (fl && c.flAlpha != null && isFinite(+c.flAlpha)) sv.push(`--fla:${Math.max(0, Math.min(100, +c.flAlpha))}%`);
  if (c.frame === "socra") return socraHTML(c, t, cls, attrs, opts, sv, showCost);
  if (c.frame === "spire") return spireHTML(c, t, cls, attrs, opts, sv, showCost);
  return `<div class="card ${t}${showCost ? " costed" : ""}${fl ? " frameless" : ""}${fl && c.flAlpha != null && +c.flAlpha === 0 ? " fl0" : ""}${fl && c.textEdge ? " tedge" : ""}${c.token ? " token" : ""}${c.modded ? " modded" : ""} ${cls}" ${attrs}${sv.length ? ` style='${sv.join(";")}'` : ""}>${opts.done ? `<span class="done">${opts.done}</span>` : ""}${opts.eq ? `<span class="eqb">${esc(opts.eq)}</span>` : ""}${ctrBadges(opts)}${opts.vuln ? `<span class="vulc" title="弱体：受けるダメージが1.5倍">弱体${opts.vuln}</span>` : ""}${opts.weak ? `<span class="wkc" title="脱力：与える戦闘ダメージが0.75倍">脱力${opts.weak}</span>` : ""}<div class="c-in">${fl ? `<div class="c-bgart">${art}</div>` : ""}${showCost ? `<span class="c-cost" title="コスト">${costLabel(c)}</span>` : ""}<div class="c-name">${rubyHTML(c.nameRuby || c.name)}</div><div class="c-art">${fl ? "" : art}${eqc}<div class="c-tab">${typeLabel(c)}</div></div><div class="c-text${atk ? " ha" : ""}"><div class="body">${freeText(c) ? rubyHTML(c.effect) : `${eqTxt}${ft ? `<span class="fx">${tkLink(esc(ft))}</span> ` : ""}${exhausts(c) ? ` <span class="fx">廃棄</span>` : ""}`}</div>${flv ? `<div class="flv">${rubyHTML(flv)}</div>` : ""}${c.id ? `<span class="c-lim">${lim ? "×" + lim : "∞"}</span>` : ""}${atk}</div></div></div>`;
}
// ソクラテスラ frame (hand-drawn club cards): 「・憤怒　の▷」 banner for equips, a band for monsters,
// equip capacity / cost in a circle at the bottom left, ATK (or the equip's ATK change) outlined at the bottom right
function socraHTML(c, t, cls, attrs, opts, sv, showCost){
  const raw = c.nameRuby || c.name || "";
  const m = t === "equip" ? raw.match(/^(.+?)(の|な|する)$/) : null;
  // ブロック表示のときは手描きのカードみたいに: 名前を全角スペースで分けて上に小さく（「PHASE-2　四足」→ PHASE-2 / 四足）
  const fx = !!(c.fxRows && !freeText(c) && !c.potionView && !c.relicView), sp = fx ? raw.match(/^([^　]+)　+(.+)$/) : null;
  const nameH = sp ? `<span class="s-sub">${rubyHTML(sp[1])}</span><span class="s-main">${rubyHTML(sp[2])}</span>` : t === "equip" ? `<span class="s-dot">・</span><span class="s-main">${rubyHTML(m ? m[1] : raw)}</span>${m ? `<span class="s-suf">${m[2]}</span>` : ""}` : `<span class="s-main">${rubyHTML(raw)}</span>`;
  const lines = [];
  if (t === "equip" && c.eqN) lines.push(`ATK ${c.eqN > 0 ? "+" : "−"}${Math.abs(c.eqN)}`);
  absOf(c).forEach(a => lines.push(ABS[a.k].self ? abPhrase(a) : `このモンスターは${abPhrase(a)}`));
  const ft = fxText(c); if (ft) lines.push(ft.replace(/装備したモンスター/g, "このモンスター"));
  let body = lines.map(l => `<div>・${tkLink(esc(l))}</div>`).join("");
  if (exhausts(c)) body += `<div>・廃棄</div>`;
  if (freeText(c)) body = `<div>${rubyHTML(c.effect)}</div>`;
  if (!body && !c.flavor && t === "equip") body = `<div>・効果なし</div>`;
  let cap = t === "monster" ? `<span class="s-cap" title="装備キャパ">${eqCapOf(c)}</span>` : t === "equip" ? `<span class="s-cap" title="装備コスト">${eqCostOf(c) ? "−" + eqCostOf(c) : "0"}</span>` : "";
  let num = "";
  if (t === "monster"){ const base = baseAtk(c), mod = opts.mod || 0; num = `<span class="s-atk s-box ${mod > 0 ? "up" : mod < 0 ? "dn" : ""}">${fmtN(Math.max(0, base + mod))}</span>`; }
  else if (t === "equip" && c.eqN) num = `<span class="s-atk">${c.eqN > 0 ? "+" : "−"}${Math.abs(c.eqN)}</span>`;
  const art = c.img ? `<img alt="" src="${c.img}">` : "";
  let info = "";
  if (fx){
    body = fxRowsHTML(c); cap = "";
    const ms = [massOf(c) ? `・要求質量：${massOf(c)}` : "", t === "monster" ? fxAbsText(c) : t === "equip" ? eqText(c) : ""].filter(Boolean).join("　");
    if (ms || num) info = `<div class="s-info"><span class="s-ms">${kwLink(esc(ms))}</span>${num}</div>`; num = "";
  }
  return `<div class="card socra${fx ? " fxrows" : ""} ${t}${showCost ? " costed" : ""}${c.token ? " token" : ""}${c.modded ? " modded" : ""} ${cls}" ${attrs}${sv.length ? ` style='${sv.join(";")}'` : ""}>${opts.done ? `<span class="done">${opts.done}</span>` : ""}${opts.eq ? `<span class="eqb">${esc(opts.eq)}</span>` : ""}${ctrBadges(opts)}${opts.vuln ? `<span class="vulc" title="弱体：受けるダメージが1.5倍">弱体${opts.vuln}</span>` : ""}${opts.weak ? `<span class="wkc" title="脱力：与える戦闘ダメージが0.75倍">脱力${opts.weak}</span>` : ""}<div class="c-in">${showCost ? `<span class="c-cost" title="コスト">${costLabel(c)}</span>` : ""}<div class="s-name">${nameH}</div><div class="c-art">${art}</div>${info}<div class="c-text"><div class="body">${body}</div>${c.flavor && !fx ? `<div class="flv">${rubyHTML(c.flavor)}</div>` : ""}</div>${cap}${num}</div></div>`;
}
// スパイア風 frame: gem cost at the top left, ribbon name over an arched picture, type plaque, centered text
const exhausts = c => !!(c && c.exhaust && (cardType(c) === "magic" || cardType(c) === "trap"));
// カードの名前（「○○」）に下線を引いて、押すとそのカードの詳細が開くようにする（トークン以外のカードも。同じ名前ならトークンを優先）
var TK_CACHE;
function tokenMap(){
  const now = Date.now();
  if (!TK_CACHE || TK_CACHE.n !== S.cards.size || now - TK_CACHE.at > 3000){
    const m = new Map(); S.cards.forEach(c => { if (c && c.token && c.name && !m.has(c.name)) m.set(c.name, c.id); }); S.cards.forEach(c => { if (c && !c.token && c.name && !m.has(c.name)) m.set(c.name, c.id); });
    TK_CACHE = { n: S.cards.size, at: now, map: m };
  }
  return TK_CACHE.map;
}
function tkLink(html){
  html = kwLink(clockMark(html));
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
  return `<div class="card spire ${t} sk-${spireKind(c)} rar-${rarityOf(c)}${showCost ? " costed" : ""}${c.token ? " token" : ""}${c.modded ? " modded" : ""} ${cls}" ${attrs}${sv.length ? ` style='${sv.join(";")}'` : ""}>${opts.done ? `<span class="done">${opts.done}</span>` : ""}${opts.eq ? `<span class="eqb">${esc(opts.eq)}</span>` : ""}${ctrBadges(opts)}${opts.vuln ? `<span class="vulc" title="弱体：受けるダメージが1.5倍">弱体${opts.vuln}</span>` : ""}${opts.weak ? `<span class="wkc" title="脱力：与える戦闘ダメージが0.75倍">脱力${opts.weak}</span>` : ""}<div class="p-base"></div><div class="p-art">${art}</div><div class="p-over"></div><div class="p-gemimg"></div>${showCost ? `<span class="p-gem" title="コスト">${costLabel(c)}</span>` : ""}<div class="p-name"><span>${rubyHTML(c.nameRuby || c.name || "")}</span></div><div class="p-type">${SPIRE_LABEL[spireKind(c)]}</div><div class="p-text"><div class="body">${body}</div>${c.flavor ? `<div class="flv">${rubyHTML(c.flavor)}</div>` : ""}</div>${cap}${num}</div>`;
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
    subscribeCounters();
    subscribeTrades();
  } else { S.userCards = local.cards(); S.decks = local.decks(); rebuildCards(); renderAll(); subscribeCounters(); }
}
const writeErr = e => toast(e && e.code === "too-big" ? "カードのデータが大きすぎて保存できません。効果の文章を短くしてみてね" : e && (e.code === "permission-denied" || e.code === "invalid_argument") ? "保存できませんでした（権限がありません）。自分のカード以外は変更できないよ" : e && e.code === "quota_exceeded" ? "保存容量がいっぱいです。古いカードを消してね" : "保存できませんでした。もう一度ためしてね");

