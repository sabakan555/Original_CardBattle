/* ================= effect catalog ================= */
const TYPE_LABEL = { monster: "モンスター", magic: "魔法", equip: "装備", trap: "罠" };
// スパイア風 cards use Slay-the-Spire style names for the same three kinds
const SPIRE_LABEL = { attack: "アタック", skill: "スキル", power: "パワー", monster: "アタック", magic: "スキル", equip: "装備", trap: "パワー" };
// スパイア風 kind: アタック / スキル are one-shot magic, パワー is 永続 magic (older cards: monster → アタック, trap → パワー)
const RARITY = { common: "コモン", uncommon: "アンコモン", rare: "レア" };
const rarityOf = c => c && RARITY[c.rarity] ? c.rarity : "common";
const spireKind = c => { const t = cardType(c); if (c && c.sk && t === "magic") return c.persist ? "power" : c.sk === "attack" ? "attack" : "skill"; return t === "monster" ? "attack" : t === "trap" || (t === "magic" && c.persist) ? "power" : "skill"; };
const typeLabel = c => { if (c && c.potionView) return "ポーション"; const t = cardType(c); if (t === "monster" && c && c.token) return "トークン"; if (t === "monster" && c && c.ex) return "EXモンスター"; return isQuick(c) ? "速攻魔法" : isField(c) ? "フィールド魔法" : isPersist(c) ? "永続" + TYPE_LABEL[t] : TYPE_LABEL[t]; };
const TRIGS = { evolve: "進化したとき", ctrReach: "カウンターが○個以上になったとき", summon: "召喚したとき", ssummon: "特殊召喚したとき", attack: "攻撃するとき", kill: "戦闘で相手を破壊したとき", destroyed: "破壊されたとき", battleLose: "バトルに負けたとき", turnStart: "自分のターンのはじめ", turnEnd: "自分のターンの終わり", enter: "場に出たとき", while: "場にいる間", anyUse: "魔法・罠が発動したとき", attach: "装備したとき", use: "発動したとき", act: "起動（ボタンで使う）" };
const MON_TRIGS = ["summon", "ssummon", "enter", "while", "act", "evolve", "ctrReach", "anyUse", "attack", "kill", "destroyed", "battleLose", "turnStart", "turnEnd"];
const EQ_TRIGS = ["attach", "attack", "turnStart", "turnEnd", "destroyed", "battleLose"];
// 永続魔法・永続罠 (スパイア風 のパワー): stay face-up in the magic/trap zone; their effect fires on one of these
const PERSIST_TRIG_LABEL = { use: "発動したとき", while: "場にある間", anyUse: "魔法・罠が発動したとき", turnStart: "自分のターンのはじめ", turnEnd: "自分のターンのおわり", mySummon: "自分がモンスターを召喚するたび", exhaust: "自分のカードが廃棄されるたび", monDestroyed: "モンスターが破壊されるたび", myLoseLp: "自分のターンにLPを失うたび", blockGain: "自分がブロックを得るたび", vulnApply: "相手に弱体を付与するたび", atkPlay: "自分がアタックを使うたび" };
const PERSIST_TRIGS = Object.keys(PERSIST_TRIG_LABEL);
// レリック (カード以外): always on; 「手に入れたとき」 + the same timings as 永続 cards
const RELIC_TRIG_LABEL = { gain: "手に入れたとき", ...Object.fromEntries(Object.entries(PERSIST_TRIG_LABEL).filter(([k]) => k !== "use" && k !== "while")) };
const RELIC_TRIGS = Object.keys(RELIC_TRIG_LABEL);
const isPersist = c => !!(c && c.persist && !c.field && (cardType(c) === "magic" || cardType(c) === "trap"));
// フィールド魔法: お互いに1枚だけ（場に1枚）。新しいフィールドが出ると、前のフィールドは持ち主の墓地へ。効果はどちらのプレイヤーにも効く
const isField = c => !!(c && c.field && cardType(c) === "magic");
const FIELD_TRIG_LABEL = { use: "出したとき", turnStart: "それぞれのターンのはじめ", turnEnd: "それぞれのターンのおわり", while: "場にある間", anyUse: "魔法・罠が発動したとき" };
const FIELD_TRIGS = Object.keys(FIELD_TRIG_LABEL);
// 「効果は出した人にだけ効く」フィールド（例: 空集合）: ターンのはじめ・おわりは出した人のターンだけ
const fieldMine = c => !!(c && c.fieldMine && isField(c));
const FIELD_MINE_LABEL = { ...FIELD_TRIG_LABEL, turnStart: "自分のターンのはじめ", turnEnd: "自分のターンのおわり" };
const fieldTrigLabel = (c, trig) => (fieldMine(c) ? FIELD_MINE_LABEL : FIELD_TRIG_LABEL)[trig];
const EQ_TRIG_LABEL = { attack: "装備したモンスターが攻撃するとき", destroyed: "装備したモンスターが破壊されたとき", battleLose: "装備したモンスターがバトルに負けたとき" };
const trigLabel = (t, k) => (t === "equip" && EQ_TRIG_LABEL[k]) || TRIGS[k];
const OLD_TRIG = { open: "summon", win: "kill", lose: "destroyed" };
const KINDS = {
  none:       { label: "なし" },
  heal:       { label: "自分のLPを回復", n: true, text: n => `自分のLPを${n}回復` },
  dmg:        { label: "相手にダメージ", n: true, text: n => `相手に${n}ダメージ` },
  draw:       { label: "カードを引く", n: true, text: n => `カードを${n}枚引く` },
  discard:    { label: "相手の手札を捨てさせる", n: true, text: n => `相手の手札をランダムに${n}枚捨てさせる` },
  discardPeek:{ label: "相手の手札を見て、えらんで捨てさせる（ピーピングハンデス）", n: true, target: "oppHand", each: true, text: n => `相手の手札を見て、その中から${n}枚えらんで捨てさせる` },
  destroy:    { label: "相手モンスター1体を破壊", target: "opp", text: () => `相手のモンスター1体を破壊` },
  destroyOwn: { label: "自分のモンスター1体を破壊（デメリット）", target: "mine", text: () => `自分のモンスター1体を破壊` },
  destroyThis: { label: "このモンスターを破壊（デメリット）", mon: true, text: () => `このモンスターを破壊` },
  destroyOwnAll: { label: "自分のモンスターをすべて破壊（デメリット）", text: () => `自分のモンスターをすべて破壊` },
  destroySt:  { label: "相手の魔法・罠を1枚えらんで破壊", target: "szOpp", n: true, each: true, text: n => `相手の魔法・罠を${n}枚えらんで破壊` },
  destroyStRand: { label: "相手の魔法・罠をランダムに破壊", n: true, text: n => `相手の魔法・罠をランダムに${n}枚破壊` },
  destroyStAll: { label: "相手の魔法・罠をすべて破壊", text: () => `相手の魔法・罠をすべて破壊` },
  destroyField: { label: "フィールド魔法を破壊", text: () => `場のフィールド魔法を破壊` },
  destroyAll: { label: "相手モンスターを全部破壊", text: () => `相手のモンスターをすべて破壊` },
  bounce:     { label: "相手のモンスターを手札に戻す（バウンス）", target: "opp", text: () => `相手のモンスター1体を持ち主の手札に戻す` },
  bounceAll:  { label: "相手のモンスターを全部手札に戻す", text: () => `相手のモンスターをすべて持ち主の手札に戻す` },
  stealMon:   { label: "相手のモンスターのコントロールをうばう（ずっと）", target: "opp", text: () => `相手のモンスター1体のコントロールをうばい、自分の場に出す` },
  stealMonTmp:{ label: "相手のモンスターのコントロールをうばう（このターンだけ）", target: "opp", text: () => `このターンの間、相手のモンスター1体のコントロールをうばう（ターンのおわりに持ち主の場に戻る）` },
  summonNamed:{ label: "名前を指定したモンスターを自分の場に出す（トークンなど）", n: true, name: true, need: true, text: (n, into) => `「${into || "？"}」を${n > 1 ? n + "体" : ""}自分の場に出す` },
  searchMon:  { label: "山札からモンスターを手札に加える", n: true, target: "deckType", each: true, text: n => `山札からモンスターを${n > 1 ? n + "枚" : "1枚"}えらんで手札に加える` },
  searchMagic:{ label: "山札から魔法を手札に加える", n: true, target: "deckType", each: true, text: n => `山札から魔法を${n > 1 ? n + "枚" : "1枚"}えらんで手札に加える` },
  searchTrap: { label: "山札から罠を手札に加える", n: true, target: "deckType", each: true, text: n => `山札から罠を${n > 1 ? n + "枚" : "1枚"}えらんで手札に加える` },
  scry:       { label: "山札の上を見て、1枚を一番上に・のこりを一番下に置く", n: true, target: "deckTop", text: n => `山札の上から${n || 3}枚を見て、1枚を山札の一番上に、のこりを山札の一番下に置く` },
  atkZero:    { label: "相手のモンスターのATKを0にする", target: "opp", text: () => `相手のモンスター1体のATKを0にする` },
  atkSwap:    { label: "このモンスターと相手のモンスターのATKを入れかえる", target: "opp", mon: true, text: () => `このモンスターと相手のモンスター1体のATKを入れかえる` },
  atkReset:   { label: "モンスターのATKを元の数字に戻す", target: "any", text: () => `場のモンスター1体のATKを、カードに書いてある数字に戻す（効果でのアップ・ダウンをなくす）` },
  banishMon:  { label: "相手のモンスターを除外する", target: "opp", text: () => `相手のモンスター1体を除外する（墓地に行かない）` },
  banishGrave:{ label: "相手の墓地のカードを除外する", n: true, target: "oppGrave", each: true, text: n => `相手の墓地のカードを${n > 1 ? n + "枚" : "1枚"}えらんで除外する` },
  banishGraveAll:{ label: "相手の墓地をすべて除外する", text: () => `相手の墓地のカードをすべて除外する` },
  destroyOthers: { label: "このカード以外の、お互いの場のカードをすべて破壊", text: () => `このカード以外の、お互いの場のカードをすべて破壊` },
  selfAtk:    { label: "このモンスターのATKアップ", n: true, mon: true, text: n => `このモンスターのATK+${n}` },
  moveEquips: { label: "装備を別のモンスターに付けかえる", mon: true, target: "any", text: () => `このモンスターの装備（このカード以外）をすべて、ほかのモンスター1体（相手のでもOK）に付けかえる` },
  equipsToHand: { label: "ほかの装備を手札に戻す", mon: true, text: () => `いっしょに付いていたほかの装備を、持ち主の手札に戻す` },
  blast:      { label: "自爆（装備の枚数×○以下を全部破壊）", n: true, mon: true, text: n => `付いていた装備の枚数×${n}以下のATKのモンスターをすべて破壊し、破壊したうち一番低いATKぶんのダメージを相手に与える` },
  charm:      { label: "相手モンスター1体を魅了（攻撃できなくする）", target: "opp", mon: true, text: () => `相手のモンスター1体を魅了する（このカードが場にある間、そのモンスターは攻撃できない）` },
  atkUp:      { label: "自分のモンスターのATKアップ", n: true, target: "mine", text: n => `自分のモンスター1体のATK+${n}` },
  block:      { label: "ブロックを得る（次の自分のターンまでダメージを肩代わり）", n: true, text: n => `ブロックを${n}得る` },
  vuln:       { label: "相手を弱体にする（受けるダメージ1.5倍・○ターン）", n: true, text: n => `相手を弱体${n}にする` },
  weak:       { label: "相手を脱力にする（与えるダメージ0.75倍・○ターン）", n: true, text: n => `相手を脱力${n}にする` },
  weakAll:    { label: "相手と相手のモンスター全部を脱力にする", n: true, text: n => `相手と相手のモンスターすべてを脱力${n}にする` },
  str:        { label: "筋力を得る（与えるダメージ+○）", n: true, text: n => `筋力${n}を得る` },
  strTemp:    { label: "このターンだけ筋力を得る", n: true, text: n => `このターン、筋力${n}を得る` },
  oppStr:     { label: "相手が筋力を得る", n: true, text: n => `相手は筋力${n}を得る` },
  oppStrDown: { label: "相手の筋力を下げる（相手の次のターンの終わりまで）", n: true, text: n => `相手の次のターンの終わりまで、相手は筋力${n}を失う` },
  loseLp:     { label: "自分のLPを失う", n: true, text: n => `自分のLPを${n}失う` },
  selfDisc:      { label: "自分の手札をえらんで捨てる（デメリット）", n: true, target: "hand", each: true, text: n => `自分の手札を${n}枚えらんで捨てる` },
  selfDiscRand:  { label: "自分の手札をランダムに捨てる（デメリット）", n: true, text: n => `自分の手札をランダムに${n}枚捨てる` },
  selfDiscAll:   { label: "自分の手札をすべて捨てる（デメリット）", text: () => `自分の手札をすべて捨てる` },
  exhaustHand:   { label: "手札をえらんで廃棄", n: true, target: "hand", each: true, text: n => `手札を${n}枚えらんで廃棄する` },
  exhaustRand:   { label: "手札をランダムに廃棄", n: true, text: n => `手札をランダムに${n}枚廃棄する` },
  exhaustAll:    { label: "手札をすべて廃棄", text: () => `手札をすべて廃棄する` },
  exhaustNonAtk: { label: "手札のアタック以外をすべて廃棄", text: () => `手札のアタック以外をすべて廃棄する` },
  graveToTop:    { label: "墓地のカードを山札の一番上に置く", n: true, target: "graveAny", each: true, text: n => `墓地のカードを${n}枚えらんで山札の一番上に置く` },
  playTop:       { label: "山札の一番上のカードをプレイ", n: true, text: n => `山札の一番上のカードを${n > 1 ? n + "枚" : ""}プレイする` },
  playTopEx:     { label: "山札の一番上のカードをプレイして廃棄", n: true, text: n => `山札の一番上のカードを${n > 1 ? n + "枚" : ""}プレイし、それを廃棄する` },
  noDraw:        { label: "このターン、もうカードを引けない", text: () => `このターン、これ以上カードを引けない` },
  drawUntil:     { label: "アタック以外を引くまで引く", text: () => `アタック以外のカードを引くまで、カードを引く` },
  barricade:  { label: "ブロックがターンのはじめに消えなくなる", text: () => `ブロックが自分のターンのはじめに消えなくなる` },
  plate:      { label: "プレートを得る（ターンのおわりにその分ブロック）", n: true, text: n => `プレート${n}を得る（自分のターンのおわりにブロック${n}を得る。LPを失うたび20減る）` },
  corrupt:    { label: "スキルのコストが0になり、使うと廃棄される", text: () => `スキルのコストが0になる。スキルを使うたび、それを廃棄する` },
  vulnBonus:  { label: "弱体の相手に与えるダメージがさらに○%ふえる", n: true, text: n => `弱体の相手に与えるダメージがさらに${n}%ふえる` },
  firstBlock2:{ label: "毎ターン最初にカードで得るブロックが2倍", text: () => `毎ターン、最初にカードで得るブロックが2倍になる` },
  rageNow:    { label: "このターン、アタックを使うたびブロックを得る", n: true, text: n => `このターン、アタックを使うたびブロックを${n}得る` },
  thornsNow:  { label: "次の自分のターンまで、攻撃されるたび反撃", n: true, text: n => `次の自分のターンのはじめまで、モンスターに攻撃されるたび、そのモンスターに${n}ダメージ` },
  absorbKill: { label: "バトルで倒した相手を、このモンスターの質量にする", text: () => `バトルで倒した相手のモンスターを、このモンスターの質量として取りこむ` },
  synth:      { label: "合成（手札のカードの効果を、場のモンスターに付ける）", text: () => `手札を1枚えらび、場のモンスター1体にそのカードの効果を付ける（効果1つにつき、墓地のカード1枚を質量として重ねる）` },
  synthHand:  { label: "（合成：手札をえらぶ）", target: "hand", text: () => `効果を付けたい手札のカードをえらぶ` },
  synthTo:    { label: "（合成：付けるモンスターをえらぶ）", target: "any", text: () => `効果を付ける場のモンスターをえらぶ` },
  millBoth:   { label: "お互いの山札の上から○枚を墓地へ", n: true, text: n => `お互いの山札の上から${n || 1}枚を墓地に送る` },
  graveHand:  { label: "墓地のカードをえらんで手札に戻す（どのカードでも）", target: "graveAny", text: () => `自分の墓地のカード1枚を手札に戻す` },
  matCopy:    { label: "分裂：場のモンスターの質量1枚をコピーして自分の場に出す", target: "any", text: () => `場のモンスター1体をえらび、その質量1枚をコピーして自分の場に出す` },
  matOut:     { label: "増殖：このモンスターの質量をできるだけ場に出す（出せない分は墓地へ）", mon: true, text: () => `このモンスターの下の質量をできるだけ自分の場に出す（出せなかった分は墓地へ）` },
  stealGrave: { label: "相手の墓地の一番上のカードを自分の墓地へ移す", n: true, text: n => `相手の墓地のカード${n || 1}枚を自分の墓地に移す` },
  fieldOut:   { label: "このフィールドの質量の半分（切り捨て）を、このカードのコピーとして場に出す", text: () => `このカードの質量の半分（切り捨て）を、このカードのコピーとして自分の魔法・罠ゾーンの1枠にストックする（コピーの数だけ効果が出る）` },
  extraTurn:  { label: "追加ターン（このターンのあと、もう一度自分のターン）", n: true, text: n => `このターンのあと、もう${n > 1 ? n + "回" : "1回"}自分のターンをおこなう` },
  dblAtk:     { label: "次に使うアタックをもう1回プレイ", n: true, text: n => `このターン、次に使う${n > 1 ? n + "枚の" : ""}アタックをもう1回プレイする` },
  copyLastAtk:{ label: "直前に使ったアタックのコピーを手札に加える", text: () => `直前に使ったアタックのコピーを1枚手札に加える` },
  graveAtkToHand: { label: "墓地のランダムなアタックを手札に加える", n: true, text: n => `墓地のランダムなアタックを${n}枚手札に加える` },
  playHandAtk:{ label: "手札のランダムなアタックをプレイ", n: true, text: n => `手札のランダムなアタックを${n > 1 ? n + "枚" : "1枚"}プレイする` },
  transformHand: { label: "手札をえらんで変化させる", target: "hand", each: true, n: true, name: true, text: (n, into) => `手札を${n}枚えらんで、${intoText(into)}に変化させる` },
  transformRand: { label: "手札をランダムに変化させる", n: true, name: true, text: (n, into) => `手札をランダムに${n}枚、${intoText(into)}に変化させる` },
  transformAtk:  { label: "手札のアタックをすべて変化させる", name: true, text: (n, into) => `手札のアタックをすべて${intoText(into)}に変化させる` },
  transformAll:  { label: "手札をすべて変化させる", name: true, text: (n, into) => `手札をすべて${intoText(into)}に変化させる` },
  transformSelf: { label: "このカード自身を変化させる", name: true, text: (n, into) => `このカードを${intoText(into)}に変化させる` },
  modAdd:        { label: "カードに効果を追加する", mod: true, target: "hand", text: (n, into, e) => `${modTargetText(e)}に「${grantText(e)}」の効果を追加する` },
  modRep:        { label: "カードの効果を上書きする", mod: true, target: "hand", text: (n, into, e) => `${modTargetText(e)}の効果を「${grantText(e)}」に上書きする` },
  modClear:      { label: "カードの効果をなくす", mod: true, target: "hand", text: (n, into, e) => `${modTargetText(e)}の効果をなくす` },
  modName:       { label: "カードの名前を変える", mod: true, target: "hand", text: (n, into, e) => `${modTargetText(e)}の名前を「${(e && e.nm) || "？"}」に変える` },
  atkMul:        { label: "このモンスターのATKを○倍", n: true, mon: true, text: n => `このモンスターのATKを${n}倍にする` },
  summonSelf:    { label: "このカードを手札から特殊召喚", mon: true, text: () => `このカードを手札から特殊召喚する` },
  thisTopOnly:   { label: "このモンスターは相手の一番ATKが高いモンスターにしか攻撃できない", mon: true, text: () => `このモンスターは相手の場の一番ATKが高いモンスターにしか攻撃できない` },
  thisNoAtk:     { label: "このモンスターは攻撃できない（このターン）", mon: true, text: () => `このモンスターはこのターン攻撃できない` },
  selfNoAtk:     { label: "自分のモンスターは攻撃できない（このターン）", text: () => `このターン、自分のモンスターは攻撃できない` },
  oppNoAtk:      { label: "相手は攻撃できない（相手の次のターンの終わりまで）", text: () => `相手の次のターンの終わりまで、相手のモンスターは攻撃できない` },
  oppNoUse:      { label: "相手は魔法・罠を発動できない（相手の次のターンの終わりまで）", text: () => `相手の次のターンの終わりまで、相手は魔法・罠を発動できない` },
  oppSetNamed:   { label: "名前を指定した魔法・罠を相手の場にセットする", n: true, name: true, need: true, text: (n, into) => `「${into || "？"}」を${n > 1 ? n + "枚" : ""}相手の魔法・罠ゾーンにセットする` },
  oppDraw:       { label: "相手にカードを引かせる", n: true, text: n => `相手はカードを${n}枚引く` },
  oppGenHand:    { label: "名前を指定したカードを相手の手札に加える", n: true, name: true, need: true, text: (n, into) => `「${into || "？"}」を${n}枚相手の手札に加える` },
  oppGenDeck:    { label: "名前を指定したカードを相手の山札に混ぜる", n: true, name: true, need: true, text: (n, into) => `「${into || "？"}」を${n}枚相手の山札に混ぜる` },
  oppSummon:     { label: "名前を指定したモンスターを相手の場に出す", n: true, name: true, need: true, text: (n, into) => `「${into || "？"}」を${n > 1 ? n + "体" : ""}相手の場に出す` },
  genNamed:      { label: "名前を指定したカードを手札に加える", n: true, name: true, need: true, text: (n, into) => `「${into || "？"}」を${n}枚手札に加える` },
  autoPlay:      { label: "名前に○が入ったカードを引くたび自動で使う", name: true, need: true, text: (n, into) => `これから、名前に「${into || "？"}」が入ったカードを引くたび、それを自動で使う（ねらいはランダム）` },
  tagSearch:     { label: "山札からタグのカードを手札に加える", n: true, name: true, need: true, tag: true, target: "tagPick", each: true, text: (n, t) => `山札からタグ「${t || "？"}」のカードを${n}枚えらんで手札に加える` },
  tagGraveHand:  { label: "墓地からタグのカードを手札に加える", n: true, name: true, need: true, tag: true, target: "tagPick", each: true, text: (n, t) => `墓地からタグ「${t || "？"}」のカードを${n}枚えらんで手札に加える` },
  tagSummonHand: { label: "手札からタグのモンスターを場に出す", name: true, need: true, tag: true, target: "tagPick", text: (n, t) => `手札からタグ「${t || "？"}」のモンスター1体を自分の場に出す` },
  tagSummonDeck: { label: "山札からタグのモンスターを場に出す", name: true, need: true, tag: true, target: "tagPick", text: (n, t) => `山札からタグ「${t || "？"}」のモンスター1体を自分の場に出す` },
  fusion:        { label: "融合召喚する", target: "tagPick", text: () => `手札・場から素材のモンスターを墓地へ送り、EXデッキの融合モンスター1体を融合召喚する` },
  exSummon:      { label: "EXデッキのモンスターを場に出す", target: "tagPick", text: () => `EXデッキのモンスター1体を自分の場に出す` },
  tagSummonEx:   { label: "EXデッキからタグのモンスターを場に出す", name: true, need: true, tag: true, target: "tagPick", text: (n, t) => `EXデッキからタグ「${t || "？"}」のモンスター1体を自分の場に出す` },
  tagSummonGrave:{ label: "墓地からタグのモンスターを場に出す", name: true, need: true, tag: true, target: "tagPick", text: (n, t) => `墓地からタグ「${t || "？"}」のモンスター1体を自分の場に出す` },
  tagGen:        { label: "タグのついたランダムなカードを手札に加える", n: true, name: true, need: true, tag: true, text: (n, t) => `タグ「${t || "？"}」のついたランダムなカードを${n}枚手札に加える` },
  copyHand:   { label: "このカードのコピーを手札に加える", text: () => `このカードのコピーを1枚手札に加える` },
  copyDeck:   { label: "このカードのコピーを山札に混ぜる", text: () => `このカードのコピーを1枚山札に混ぜる` },
  genAttack:  { label: "ランダムなアタックを手札に加える", n: true, text: n => `ランダムなアタックを${n}枚手札に加える` },
  genAttack0: { label: "ランダムなアタックを手札に加える（このターンはコスト0）", n: true, text: n => `ランダムなアタックを${n}枚手札に加える（このターンはコスト0で使える）` },
  genSkill:   { label: "ランダムなスキルを手札に加える", n: true, text: n => `ランダムなスキルを${n}枚手札に加える` },
  genPower:   { label: "ランダムなパワーを手札に加える", n: true, text: n => `ランダムなパワーを${n}枚手札に加える` },
  bash:       { label: "相手にダメージ＋弱体2", n: true, text: n => `相手に${n}ダメージを与え、弱体2にする` },
  dmgRand:    { label: "ランダムな敵に○ダメージ（相手か相手のモンスター）", n: true, text: n => `ランダムな敵（相手か相手のモンスター）に${n}ダメージ` },
  dmgAll:     { label: "相手と相手のモンスター全部に○ダメージ", n: true, text: n => `相手と相手のモンスターすべてに${n}ダメージ` },
  copyGrave:  { label: "このカードのコピーを墓地に加える", text: () => `このカードのコピーを1枚墓地に加える` },
  freeAttack: { label: "次に使うアタックのコストを0にする", text: () => `次に使うアタックのコストを0にする` },
  freeSkill:  { label: "次に使うスキルのコストを0にする", text: () => `次に使うスキルのコストを0にする` },
  freePower:  { label: "次に使うパワーのコストを0にする", text: () => `次に使うパワーのコストを0にする` },
  draft:      { label: "スパイアのカードを○枚から1枚えらんで墓地に加える", n: true, target: "draft", text: n => `ランダムなスパイア風カード${n}枚から1枚えらんで墓地に加える` },
  atkAll:     { label: "自分のモンスター全部のATKアップ", n: true, text: n => `自分のモンスターすべてのATK+${n}` },
  charmAll:   { label: "相手モンスター全部を魅了（攻撃できなくする）", mon: true, text: () => `相手のモンスターすべてを魅了する（このカードが場にある間、攻撃できない）` },
  vulnAll:    { label: "相手と相手のモンスター全部を弱体にする", n: true, text: n => `相手と相手のモンスターすべてを弱体${n}にする` },
  atkDownAll: { label: "相手のモンスター全部のATKダウン", n: true, text: n => `相手のモンスターすべてのATK−${n}` },
  atkDown:    { label: "相手のモンスターのATKダウン", n: true, target: "opp", text: n => `相手のモンスター1体のATK−${n}` },
  atkDownTmp: { label: "相手のモンスターのATKダウン（このターンだけ）", n: true, target: "opp", text: n => `このターンの間、相手のモンスター1体のATK−${n}` },
  atkDownTmpAll: { label: "相手のモンスター全部のATKダウン（このターンだけ）", n: true, text: n => `このターンの間、相手のモンスターすべてのATK−${n}` },
  revive:     { label: "墓地から手札に戻す", target: "grave", text: () => `墓地のモンスター1体を手札に戻す` },
  reborn:     { label: "墓地から場に出す", target: "grave", text: () => `墓地のモンスター1体を自分の場に出す` },
  cancel:     { label: "発動・召喚を無効（打ち消し）", chain: true, text: () => `魔法・罠の発動かモンスターの召喚を無効にする（打ち消し）` },
  reflectFx:  { label: "効果を跳ね返す（相手の魔法・罠を打ち消し、その効果を自分が使う）", chain: true, text: () => `相手が発動した魔法・罠を打ち消し、その効果を自分が使ったことにする（跳ね返す）` },
  reflectDmg: { label: "ダメージを跳ね返す（このターン、自分が受けるダメージを相手が受ける）", text: () => `このターン、自分が受けるダメージを相手に跳ね返す` },
  negate:     { label: "攻撃を無効にする（罠）", trap: true, text: () => `相手の攻撃を無効にする` },
  atkDownAtk: { label: "攻撃してきたモンスターのATKダウン", n: true, trap: true, text: n => `攻撃してきたモンスターのATK−${n}` },
  killAtk:    { label: "攻撃モンスターを破壊（罠）", trap: true, text: () => `攻撃してきたモンスターを破壊` },
  manaNow:    { label: "マナを回復（このターン）", n: true, text: n => `マナを${n}回復する` },
  manaMax:    { label: "最大マナを増やす", n: true, text: n => `最大マナを${n}増やす` },
  manaDrain:  { label: "相手のマナを減らす", n: true, text: n => `相手のマナを${n}減らす` },
  removeBoard:{ label: "場のカードを1枚えらんで除去（モンスター・魔法・罠・フィールド）", target: "board", text: (n, _, m) => `${RB_SIDE[m && m.rside] || RB_SIDE.op}の場のカード1枚をえらんで${RB_MODE[m && m.rm] || RB_MODE.destroy}` },
  ctrAdd:     { label: "カウンターを乗せる", n: true, ctr: true, text: (n, _, m) => `${ctrWhereText(m)}に${ctrName(m && m.ctr)}を${n}個乗せる` },
  ctrDel:     { label: "カウンターを取り除く", n: true, ctr: true, text: (n, _, m) => `${ctrWhereText(m)}の${ctrName(m && m.ctr)}を${n}個取り除く` },
  giveAb:     { label: "モンスターに能力を付与する（成長・2回攻撃・ブロッカーなど）", target: "any", text: (n, nm, m) => gabText(m) },
  win:        { label: "ゲームに勝利する", text: () => `ゲームに勝利する` }
};
const CONDS = {
  none:  { label: "条件なし", text: () => "" },
  lp:    { label: "自分のLPが○以下", n: true, text: n => `自分のLPが${n}以下なら、` },
  grave: { label: "自分の墓地が○枚以上", n: true, text: n => `自分の墓地が${n}枚以上なら、` },
  hand:  { label: "手札にこのカードが○枚", n: true, text: n => `手札にこのカードが${n}枚そろっていたら、` }
};
const EQ_AB = { none: "なし", twice: "1ターンに2回攻撃できる", direct: "相手の場にモンスターがいても直接攻撃できる", guard: "戦闘では破壊されない" };
// abilities: stuck on a monster (its own, or given by an equip). only: "mon" = monster cards only, "eq" = equip cards only.
// self: the text is about this card itself, not "the monster"
// kw: キーワード名（カードには《速攻》のように短く出て、詳細でタップすると KW_DESC の説明が出る）
const ABS = {
  twice:      { label: "1ターンに2回攻撃できる", kw: "2回攻撃" },
  haste:      { label: "速攻（出たターンから攻撃できる）", kw: "速攻" },
  direct:     { label: "相手の場にモンスターがいても直接攻撃できる", kw: "直接攻撃" },
  guard:      { label: "戦闘では破壊されない", kw: "戦闘耐性" },
  noEffect:   { label: "効果では破壊されない", kw: "効果耐性" },
  noAttack:   { label: "攻撃できない", kw: "攻撃不可" },
  topOnly:    { label: "相手の一番ATKが高いモンスターにしか攻撃できない（デメリット）", kw: "強者狙い", text: () => `相手の場の一番ATKが高いモンスターにしか攻撃できない` },
  taunt:      { label: "相手に狙われる（ほかのモンスターは攻撃・効果の対象にされない）", kw: "挑発" },
  dmgCut:     { label: "戦闘で受けるダメージを減らす", n: 300, kw: "鉄壁", kwx: n => `（${n}）`, text: n => `戦闘で受けるダメージが${n}減る` },
  pierce:     { label: "貫通（戦闘で倒したとき、ATKの差ではなくATKぶん全部のダメージ）", kw: "貫通" },
  lifelink:   { label: "吸収（戦闘で相手に与えたダメージぶん、自分のLPを回復）", kw: "吸収" },
  reflect:    { label: "反射（このモンスターの戦闘で自分が受けたダメージを、相手にも与える）", kw: "反射" },
  shield:     { label: "聖なる盾（1回だけ、破壊されるのを防ぐ）", kw: "聖なる盾" },
  flying:     { label: "飛行（飛行・対空にしか攻撃されない。相手に飛行・対空がいなければ直接攻撃できる）", kw: "飛行" },
  reach:      { label: "対空（飛行のモンスターにも攻撃できる）", kw: "対空" },
  stealth:    { label: "隠密（自分から攻撃するまで、相手の攻撃・効果の対象にならない）", kw: "隠密" },
  reborn:     { label: "復活（1回だけ、破壊されてもATK半分で同じ場所に戻ってくる）", kw: "復活" },
  evoAtk:     { label: "成長：攻撃を○回したら、そのターンのおわりに指定したカードに変化", only: "mon", n: 3, name: true, ph: "変化先のカード名", kw: "成長", kwx: (n, nm) => `（攻撃${n}回→「${nm || "？"}」）` },
  evoTurn:    { label: "成長：自分のターンのはじめを○回むかえたら、指定したカードに変化", only: "mon", n: 2, name: true, ph: "変化先のカード名", kw: "成長", kwx: (n, nm) => `（${n}ターン→「${nm || "？"}」）` },
  substitute: { label: "破壊されるとき、かわりにほかの装備を1枚墓地へ", only: "eq", self: true, text: () => `装備したモンスターが破壊されるとき、かわりにほかの装備1枚を墓地へ送る` },
  negateOnce: { label: "1回だけ、相手の発動・召喚を打ち消せる", only: "eq", self: true, text: () => `1回だけ、相手の魔法・罠の発動かモンスターの召喚を打ち消せる` },
  double:     { label: "左どなりの装備の効果を2倍にする", only: "eq", self: true, text: () => `このカードの左どなりの装備の効果は2倍になる` },
  bane:       { label: "必殺（戦闘したモンスターを、ATKに関係なく破壊する）", kw: "必殺" },
  blocker:    { label: "ブロッカー（相手が攻撃してきたとき、代わりに攻撃を受けられる・1ターンに1回）", only: "mon", kw: "ブロッカー" },
  justDiver:  { label: "ジャストダイバー（出てから次の自分のターンまで、攻撃も効果の対象もされない）", only: "mon", kw: "ジャストダイバー" },
  ward:       { label: "護法（相手がこのモンスターを効果の対象にするとき、LPを払わないと効果が消える）", only: "mon", n: 200, kw: "護法", kwx: n => `（LP${n}）` },
  evolve:     { label: "進化（進化ポイントを使って、ATKアップ＋そのターン相手のモンスターに攻撃できる）", only: "mon", n: 200, kw: "進化", kwx: n => `（ATK+${n}）` },
  sbAtk:      { label: "スペルブースト（手札にある間、魔法を使うたびに、出たときのATKが上がる）", only: "mon", n: 100, kw: "スペルブースト", kwx: n => `（ATK+${n}）` },
  sympathy:   { label: "シンパシー：○○1枚につき、召喚するコストが下がる（コストデッキ用）", only: "mon", n: 1, name: true, ph: "タグか名前に入る文字（空ならぜんぶ）", kw: "シンパシー",
    sel: [["where", "どこの", [["field", "自分の場"], ["grave", "自分の墓地"], ["hand", "自分の手札"], ["oppField", "相手の場"], ["both", "お互いの場"]]], ["what", "なにを", [["monster", "モンスター"], ["magic", "魔法"], ["trap", "罠"], ["equip", "装備"], ["any", "カード（なんでも）"]]]],
    kwx: (n, nm, a) => `（${symWhat(a, nm)}${n > 1 ? `・1${symUnit(a)}につき${n}` : ""}）` },
  eqBonus:    { label: "特定の名前の装備を付けているとATKアップ", only: "mon", self: true, n: 300, name: true, text: (n, nm) => `名前に「${nm || "？"}」が入った装備を付けているとき、ATK+${n}` }
};
const KW_DESC = {
  "天賦": "ゲーム開始時と自分のターンのはじめに、このカードが山札にあれば山札の一番上に置く（だから最初の手札に来やすく、毎ターン引ける）",
  "反射": "このモンスターが戦闘して自分がダメージを受けたとき、同じダメージを相手にも与える",
  "必殺": "このモンスターと戦闘した相手のモンスターは、ATKに関係なく破壊される",
  "ブロッカー": "相手のモンスターが攻撃してきたとき、このモンスターが代わりに攻撃を受けられる（1ターンに1回。攻撃されたモンスター自身はできない）",
  "ジャストダイバー": "場に出てから次の自分のターンのはじめまで、相手の攻撃と効果の対象にならない",
  "護法": "相手がこのモンスターを効果の対象にするとき、相手は（ ）のLPを払う。払えないと、その効果は消える",
  "進化": "自分の3ターン目から、1ターンに1回・ゲーム中に2回まで、場のモンスターのボタンから進化できる。進化するとATKが（ ）上がり、そのターンは出たばかりでも相手のモンスターに攻撃できる。「進化したとき」の効果も出る",
  "スペルブースト": "このカードが手札にある間、自分が魔法を使うたびに強くなる（コストが下がる・ATKが上がる）。同じカードが手札に何枚あっても、全部いっしょに強くなる",
  "シンパシー": "（ ）に書いてある場所の、そのカード1枚（1体）につき、このモンスターを召喚するコストが1（数が書いてあればその数）少なくなる。コストは1より少なくはならない。「 」はタグか、名前に入る文字",
  "2回攻撃": "1ターンに2回攻撃できる", "速攻": "出たターンから攻撃できる（召喚酔いしない）", "直接攻撃": "相手の場にモンスターがいても、相手に直接攻撃できる",
  "戦闘耐性": "戦闘では破壊されない", "効果耐性": "効果では破壊されない", "攻撃不可": "攻撃できない", "強者狙い": "相手の場で一番ATKが高いモンスターにしか攻撃できない",
  "挑発": "相手はこのモンスターにしか攻撃できず、効果の対象にもこのモンスターしか選べない", "鉄壁": "戦闘で受けるダメージが（ ）の数だけ減る",
  "貫通": "相手のモンスターを戦闘で倒したとき、ATKの差ではなく、このモンスターのATKぶん全部のダメージを相手に与える",
  "吸収": "このモンスターが戦闘で相手に与えたダメージのぶん、自分のLPを回復する",
  "聖なる盾": "1回だけ、破壊されるのを防ぐ（戦闘でも効果でも）。防ぐと盾ははがれる",
  "飛行": "飛行か対空を持つモンスターにしか攻撃されない。相手の場に飛行・対空のモンスターがいなければ、相手に直接攻撃できる",
  "対空": "飛行を持つモンスターにも攻撃できる。相手の飛行モンスターは、対空がいると直接攻撃できない",
  "隠密": "自分から攻撃するまで、相手の攻撃や効果の対象にならない",
  "復活": "1回だけ、破壊されたときにATKが半分になって同じ場所に戻ってくる",
  "成長": "（ ）の条件を満たすと、そのカードに変化する。攻撃の回数はそのターンのおわりに、ターンの数は自分のターンのはじめに数える",
  "フラッシュバック": "墓地からもう1回だけ使える（自分のターンに、手札の下に出るボタンから）。使ったあとは廃棄される",
  "キッカー": "コストデッキで、コストに（ ）のマナを足して払うと「もし：キッカーを払った」の効果が出る",
  "S・トリガー": "相手の攻撃で自分がダメージを受けたとき、山札の一番上がこのカードなら、コストを払わずにすぐ発動する"
};
const kwStr = a => `《${ABS[a.k].kw}》${ABS[a.k].kwx ? ABS[a.k].kwx(a.n || 0, a.name || "", a) : ""}`;
// シンパシー: どこの・なにを（むかしのカードは「自分の場のモンスター」）
const SYM_WHERE = { field: "自分の場", grave: "自分の墓地", hand: "自分の手札", oppField: "相手の場", both: "お互いの場" };
const SYM_WHAT = { monster: "モンスター", magic: "魔法", trap: "罠", equip: "装備", any: "カード" };
const symW = a => SYM_WHERE[a && a.where] ? a.where : "field", symT = a => SYM_WHAT[a && a.what] ? a.what : "monster";
const symUnit = a => symT(a) === "monster" && /field|both/i.test(symW(a)) ? "体" : "枚";
const symWhat = (a, nm) => `${SYM_WHERE[symW(a)]}の${nm ? `「${nm}」の` : ""}${SYM_WHAT[symT(a)]}`;
// 《キーワード》 → 下線つきの言葉（詳細でタップすると説明）
const kwLink = html => html ? html.replace(/《([^《》<]{1,12})》/g, (m, w) => KW_DESC[w] ? `<span class="kwd" data-kw="${w}" role="button" tabindex="0">${w}</span>` : m) : html;
const absOf = c => !c ? [] : Array.isArray(c.abs) ? c.abs.filter(a => a && ABS[a.k]) : (c.eqAb && c.eqAb !== "none" && ABS[c.eqAb] ? [{ k: c.eqAb }] : []);
const abPhrase = a => ABS[a.k].text ? ABS[a.k].text(a.n || 0, a.name || "") : ABS[a.k].label;
function absText(c, who){
  const L = absOf(c), kws = L.filter(a => !ABS[a.k].self && ABS[a.k].kw), mon = L.filter(a => !ABS[a.k].self && !ABS[a.k].kw), self = L.filter(a => ABS[a.k].self);
  const parts = [];
  if (kws.length) parts.push(who === "このモンスター" ? kws.map(kwStr).join("") : `${who}は${kws.map(kwStr).join("")}を得る`);
  if (mon.length) parts.push(`${who}は${mon.map(abPhrase).join("、")}`);
  self.forEach(a => parts.push(abPhrase(a)));
  return parts.join("。");
}
function eqText(c){
  const n = c.eqN || 0, parts = [];
  if (n) parts.push(`装備したモンスターのATK${n > 0 ? "+" : "−"}${Math.abs(n)}`);
  const ab = absText(c, "装備したモンスター"); if (ab) parts.push(ab);
  return parts.join("。");
}
const monAbsText = c => absText(c, "このモンスター");
// equip capacity: a monster holds equips whose costs add up to its capacity (blank = ATK÷100)
const eqCostOf = c => Math.max(0, Math.round(+(c && c.eqCost) || 0));
const hasEqCap = c => !!c && c.eqCap != null && c.eqCap !== "" && !isNaN(+c.eqCap);
function eqCapOf(c){ if (hasEqCap(c)) return Math.max(0, Math.round(+c.eqCap)); const b = baseAtk(c); return isFinite(b) ? Math.floor(b / 100) : 99; }
const eqsOf = m => (m && m.eqs) || [];
// a 化身-type equip doubles the equip on its left
const eqMult = (list, k) => 1 + (list[k + 1] && absOf(card(list[k + 1].c)).some(a => a.k === "double") ? 1 : 0);
const eqUsed = m => eqsOf(m).reduce((t, e) => t + eqCostOf(card(e.c)), 0);
// g: どんな感じのフォントか（カード工房のフォント選びで分けて見せる）
const FONT_GROUPS = { std: "ふつう", cool: "かっこいい", wa: "和風・重厚", cute: "かわいい", game: "ゲーム・遊び" };
const FONTS = {
  klee:   { label: "手書き（標準）", g: "std", css: `"Klee One",var(--hand)` },
  maru:   { label: "まるゴシック", g: "std", css: `"Zen Maru Gothic",var(--ui)` },
  bold:   { label: "極太ゴシック", g: "cool", css: `"Dela Gothic One",var(--ui)` },
  heavy:  { label: "ヘビーゴシック", g: "cool", css: `"Zen Kaku Gothic New",var(--ui)` },
  murecho:{ label: "スタイリッシュ極太", g: "cool", css: `"Murecho",var(--ui)` },
  lubri:  { label: "シャープ（Lubrifont）", g: "cool", css: `"WDXL Lubrifont JP N",var(--ui)` },
  rock:   { label: "ロック", g: "cool", css: `"RocknRoll One",var(--ui)` },
  reggae: { label: "ギザギザ", g: "cool", css: `"Reggae One",var(--ui)` },
  rampart:{ label: "立体アウトライン", g: "cool", css: `"Rampart One",var(--ui)` },
  train:  { label: "ネオン線", g: "cool", css: `"Train One",var(--ui)` },
  serifH: { label: "極太明朝", g: "wa", css: `"Noto Serif JP",var(--hand)` },
  shipM:  { label: "力強い明朝", g: "wa", css: `"Shippori Mincho B1",var(--hand)` },
  antique:{ label: "アンティーク", g: "wa", css: `"Shippori Antique B1",var(--hand)` },
  zenAnt: { label: "古風な明朝", g: "wa", css: `"Zen Antique",var(--hand)` },
  boku:   { label: "筆（力強い）", g: "wa", css: `"Yuji Boku",var(--hand)` },
  syuku:  { label: "筆（すっきり）", g: "wa", css: `"Yuji Syuku",var(--hand)` },
  decol:  { label: "おしゃれ明朝", g: "wa", css: `"Kaisei Decol",var(--hand)` },
  round:  { label: "まるっと太字", g: "cute", css: `"M PLUS Rounded 1c",var(--ui)` },
  mochiy: { label: "ポップ極太", g: "cute", css: `"Mochiy Pop One",var(--ui)` },
  potta:  { label: "筆ポップ", g: "cute", css: `"Potta One",var(--ui)` },
  daruma: { label: "ぽってり", g: "cute", css: `"Darumadrop One",var(--ui)` },
  pop:    { label: "まるポップ", g: "cute", css: `"Hachi Maru Pop",var(--ui)` },
  magic:  { label: "マジック書き", g: "cute", css: `"Yusei Magic",var(--hand)` },
  pencil: { label: "えんぴつ", g: "cute", css: `"Yomogi",var(--hand)` },
  logo:   { label: "ロゴたいぷゴシック", g: "cool", css: `"LogoTypeGothic",var(--ui)` },
  genjyu: { label: "源柔ゴシック", g: "std", css: `"GenJyuuGothic",var(--ui)` },
  dot:    { label: "ドット", g: "game", css: `"DotGothic16",var(--ui)` },
  stick:  { label: "棒きれ", g: "game", css: `"Stick",var(--ui)` }
};
const fontCss = c => FONTS[c && c.font] ? FONTS[c.font].css : "";
// text size per card (name / effect+flavor)
const SIZES_T = { s: { label: "小さめ", k: .82 }, m: { label: "ふつう", k: 1 }, l: { label: "大きめ", k: 1.2 } };
const sizeK = v => (SIZES_T[v] || SIZES_T.m).k;
// furigana: ｜漢字《かんじ》, or just 漢字《かんじ》 right after kanji
function rubyHTML(t){
  return esc(t).replace(/[｜|]([^｜|《》\n]+?)《([^《》\n]*?)》/g, "<ruby>$1<rt>$2</rt></ruby>")
    .replace(/([\u3400-\u9FFF\uF900-\uFAFF々〆ヵヶ]+)《([^《》\n]*?)》/g, "<ruby>$1<rt>$2</rt></ruby>");
}
const plainRuby = t => String(t || "").replace(/[｜|]([^｜|《》\n]+?)《[^《》\n]*?》/g, "$1").replace(/《[^《》\n]*?》/g, "");
const cardType = c => (c && (c.type === "magic" || c.type === "trap" || c.type === "equip")) ? c.type : "monster";
const MAX_MANA = 10;
// cost is only what the card's creator set; no cost means 0
const hasCost = c => !!c && c.cost != null && c.cost !== "" && !isNaN(+c.cost);
// カードのコストは 0〜99 と ∞（costInf：ふつうには払えない。踏み倒しなら使える）
const MAX_COST = 99, MANA_LIMIT = 99;
function costOf(c){ return !hasCost(c) ? 0 : c.costInf ? Infinity : Math.max(0, Math.min(MAX_COST, +c.cost)); }
// which decks a card can go in: normal (no mana), cost (mana decks only), both. Older cards: with a cost → both, without → normal
const DECK_LABEL = { normal: "ふつうのデッキ", cost: "コストデッキ", both: "どちらでも" };
const deckModeOf = c => c && DECK_LABEL[c.deckMode] ? c.deckMode : hasCost(c) ? (c && c.starter ? "cost" : "both") : "normal";
const fitsDeck = (c, mana) => { const m = deckModeOf(c); return m === "both" || m === (mana ? "cost" : "normal"); };
const cardLimit = c => (c && c.limit != null) ? +c.limit : 3;
function normFx(c){
  if (c && Array.isArray(c.blocks)){ const b = blocksOf(c).find(x => x.then.length); return b ? { ...b.then[0], trig: b.trig } : null; }
  return normFx0(c);
}
function normFx0(c){
  const fx = c && c.fx; if (!fx || !fx.kind || fx.kind === "none" || !KINDS[fx.kind]) return null;
  const t = cardType(c);
  let trig = "use";
  if (t === "monster"){ const k = OLD_TRIG[fx.trig] || fx.trig; trig = MON_TRIGS.includes(k) ? k : "summon"; }
  if (t === "equip") trig = EQ_TRIGS.includes(fx.trig) ? fx.trig : "attach";
  if (isPersist(c)) trig = PERSIST_TRIGS.includes(fx.trig) ? fx.trig : "use";
  return { ...fx, trig };
}
const WHERE = { field: "場", grave: "墓地", hand: "手札", any: "場か墓地", deck: "山札", all: "場・手札・山札・墓地のどこか" };
function normCombo(c){
  const cb = c && c.combo; if (!cb || !cb.name || !cb.kind || cb.kind === "none" || !KINDS[cb.kind]) return null;
  const t = cardType(c); if (t === "equip") return null;
  const trig = t === "monster" ? (MON_TRIGS.includes(cb.trig) ? cb.trig : (normFx0(c) || {}).trig || "summon") : "use";
  return { ...cb, where: WHERE[cb.where] ? cb.where : "field", match: cb.match === "part" ? "part" : "exact", trig };
}
/* ---- special summon from the hand: the card's own condition + what you pay instead (a normal summon is not used up) ---- */
const SS_CONDS = {
  none:    { label: "条件なし", text: () => "" },
  oppHas:  { label: "相手の場にモンスターがいる", text: () => "相手の場にモンスターがいるなら、" },
  myEmpty: { label: "自分の場にモンスターがいない", text: () => "自分の場にモンスターがいないなら、" },
  oppMore: { label: "相手のモンスターが自分より多い", text: () => "相手の場のモンスターが自分より多いなら、" },
  lp:      { label: "自分のLPが○以下", n: true, text: n => `自分のLPが${n}以下なら、` },
  grave:   { label: "自分の墓地が○枚以上", n: true, text: n => `自分の墓地が${n}枚以上なら、` },
  name:    { label: "名前に○が入ったモンスターが自分の場にいる", name: true, text: (n, nm) => `名前に「${nm || "？"}」が入ったモンスターが自分の場にいるなら、` }
};
const SS_COSTS = {
  none:    { label: "なし", text: () => "" },
  tribute: { label: "自分のモンスター○体を墓地へ送る", n: true, text: n => `自分のモンスター${n}体を墓地へ送って、` },
  discard: { label: "手札を○枚捨てる", n: true, text: n => `手札を${n}枚捨てて、` },
  lp:      { label: "LPを○払う", n: true, text: n => `LPを${n}払って、` }
};
const ssOf = c => c && cardType(c) === "monster" && c.ss && c.ss.on ? { cond: SS_CONDS[c.ss.cond] ? c.ss.cond : "none", n: +c.ss.n || 0, name: c.ss.name || "", cost: SS_COSTS[c.ss.cost] ? c.ss.cost : "none", cn: Math.max(1, +c.ss.cn || 1), only: !!c.ss.only } : null;
// 生贄召喚: a normal summon that sends this many of your own monsters to the graveyard first
// (st, s) given: a コストデッキ player uses tribCost when the card has one
// 要求質量: 召喚するとき、墓地のカードをこの枚数だけモンスターの下に重ねる（モンスターが破壊されたら墓地にもどる）
const massOf = c => !c || (cardType(c) !== "monster" && !isField(c)) ? 0 : Math.max(0, Math.min(40, Math.round(+c.mass || 0)));
const massText = c => massOf(c) ? (isField(c) ? `【要求質量${massOf(c)}】自分の墓地のカード${massOf(c)}枚を質量としてこのカードの下に重ねて発動する` : `【要求質量${massOf(c)}】墓地のカード${massOf(c)}枚を質量としてこのモンスターの下に重ねて召喚する`) : "";
// ナナシ: ターンのはじめに、質量が足りていれば手札・山札・墓地のどこからでも召喚できる（任意）
const anySumText = c => c && c.anySum && cardType(c) === "monster" ? "【自分のターンのはじめ】墓地に質量が足りていれば、手札・山札・墓地のどこからでも召喚できる" : "";
// 場のモンスターの中身: カードの効果＋合成でついた効果（m.xb）
const monCard = m => !m ? null : (m.xb || []).length ? { ...card(m.c), blocks: [...blocksOf(card(m.c)), ...m.xb] } : card(m.c);
function tribOf(c, st, s){
  if (!c || cardType(c) !== "monster") return 0;
  const v = +(st && s && P(st, s).mana && c.tribCost != null ? c.tribCost : c.trib) || 0;
  return v > 0 ? Math.min(3, Math.round(v)) : 0;
}
function tribText(c){
  if (!c || cardType(c) !== "monster") return "";
  const f = tribOf(c), k = c.tribCost != null ? Math.min(3, Math.max(0, Math.round(+c.tribCost || 0))) : f;
  if (!f && !k) return "";
  const tg = c.tribTag ? `タグ「${c.tribTag}」の` : "";
  if (f === k) return `【生贄召喚】自分の${tg}モンスター${f}体を墓地へ送って召喚する`;
  const w = n => n ? `${n}体` : "いらない";
  return `【生贄召喚】召喚するとき自分の${tg}モンスターを墓地へ送る（コストなしデッキ：${w(f)}／コストデッキ：${w(k)}）`;
}
function ssText(c){
  const ss = ssOf(c); if (!ss) return "";
  return `${ss.only ? "このカードは普通には召喚できない。" : ""}【特殊召喚】${SS_CONDS[ss.cond].text(ss.n, ss.name)}${SS_COSTS[ss.cost].text(ss.cn)}手札から特殊召喚できる`;
}
// extra effects that follow the main one (same timing), e.g. 「100ダメージを与えて、1枚引く」
const moreFx = fx => (fx && Array.isArray(fx.more) ? fx.more : []).filter(m => m && KINDS[m.kind] && m.kind !== "none" && m.kind !== "win");
const costLabel = c => c && c.costX ? "X" : c && c.costInf && hasCost(c) ? "∞" : costOf(c);

/* ---- 「だれに」: one base effect (ダメージ / 弱体 / 魅了 / ATKダウン / 破壊) + who it goes to ---- */
const TARGETABLE = { atkUp: ["one", "two", "random", "all"], dmg: ["one", "two", "random", "all"], vuln: ["one", "two", "random", "all"], weak: ["one", "two", "random", "all"], atkDown: ["one", "two", "random", "all"], atkDownTmp: ["one", "two", "random", "all"], charm: ["one", "two", "random", "all"], destroy: ["one", "two", "random", "all", "others"], bounce: ["one", "two", "random", "all"] };
const TO_LABEL = { one: "1体をえらぶ", two: "ちがう2体をえらぶ", random: "ランダムに1体", all: "全体", others: "このカード以外すべて（お互いの場のモンスター・魔法・罠）" };
const TO_ALL = { atkUp: "atkAll", dmg: "dmgAll", vuln: "vulnAll", weak: "weakAll", atkDown: "atkDownAll", atkDownTmp: "atkDownTmpAll", charm: "charmAll", destroy: "destroyAll", bounce: "bounceAll" };
const TO_LEGACY = { atkAll: ["atkUp", "all"], dmgRand: ["dmg", "random"], dmgAll: ["dmg", "all"], vulnAll: ["vuln", "all"], weakAll: ["weak", "all"], atkDownAll: ["atkDown", "all"], atkDownTmpAll: ["atkDownTmp", "all"], charmAll: ["charm", "all"], destroyAll: ["destroy", "all"], bounceAll: ["bounce", "all"], destroyOthers: ["destroy", "others"] };
const hitsPlayer = k => k === "dmg" || k === "vuln" || k === "weak";
// the words for who gets it: 相手 / 相手のモンスター …
const SIDED_KINDS = new Set(["ctrAdd", "ctrDel", "dmg", "dmgAll", "dmgRand", "bash", "vuln", "vulnAll", "weak", "weakAll", "atkDown", "atkDownAll", "atkDownTmp", "atkDownTmpAll", "charm", "charmAll", "destroy", "destroyAll", "bounce", "bounceAll", "stealMon", "stealMonTmp", "atkZero", "banishMon"]);
// 「自分／相手」の「○体・全体・ランダムに○回」
const SELF_ONLY = new Set(["atkUp"]);
function toPhrase(kind, to, spire, tn, side){
  if (SELF_ONLY.has(kind)) side = "me";
  const w = toPhrase0(kind, to, spire, tn);
  return side === "me" ? w.replace(/ランダムな敵（相手か相手のモンスター）/g, "ランダムに自分か自分のモンスター").replace(/相手/g, "自分") : w;
}
function toPhrase0(kind, to, spire, tn){
  const pl = hitsPlayer(kind);
  if (to === "n" && tn > 1) return pl ? `相手のモンスターちがう${tn}体（足りなければ相手も）` : `相手のモンスター${tn}体`;
  if (to === "others") return "このカード以外の、お互いの場のカードすべて";
  if (to === "all") return pl ? "相手と相手のモンスターすべて" : "相手のモンスターすべて";
  if (to === "random") return pl ? "ランダムな敵（相手か相手のモンスター）" : "ランダムな相手のモンスター1体";
  if (to === "two") return pl ? "相手のモンスターちがう2体（足りなければ相手も）" : "相手のモンスター2体";
  return pl ? (spire ? "相手のモンスター1体（いなければ相手）" : "相手") : "相手のモンスター1体";
}
function toText(kind, n, to, spire, tn, side){
  const r = to === "random" && tn > 1 ? tn : 0, base = toText0(kind, n, to, spire, tn, side);
  return r ? (kind === "dmg" ? `${base}を${r}回` : `${base}（${r}回）`) : base;
}
function toText0(kind, n, to, spire, tn, side){
  const w = toPhrase(kind, to, spire, tn, side);
  if (kind === "dmg") return `${w}に${n}ダメージ`;
  if (kind === "vuln") return `${w}を弱体${n}にする`;
  if (kind === "weak") return `${w}を脱力${n}にする`;
  if (kind === "atkDown") return `${w}のATK−${n}`;
  if (kind === "atkDownTmp") return `このターンの間、${w}のATK−${n}`;
  if (kind === "atkUp") return `${w}のATK+${n}`;
  if (kind === "charm") return `${w}を魅了する（このカードが場にある間、攻撃できない）`;
  if (kind === "destroy") return `${w}を破壊`;
  if (kind === "bounce") return `${w}を持ち主の手札に戻す`;
  return KINDS[kind].text(n);
}
// one effect → what the engine runs (全体 → the old 全体 kinds, 2体 → twice with different targets, ランダム → a random pick)
function expandFx(f){
  const to = f.to, k = f.kind;
  if (!to || to === "one" || !TARGETABLE[k]) return [f];
  if (to === "all") return [{ ...f, kind: TO_ALL[k], to: null }];
  if (to === "others") return [{ ...f, kind: "destroyOthers", to: null }];
  const tn = Math.max(1, Math.min(10, Math.round(+f.tn || 1)));
  if (to === "random") return Array.from({ length: tn }, () => ({ ...f, rand: true }));
  if (to === "two") return [{ ...f, distinct: true }, { ...f, distinct: true, ask: "" }];
  if (to === "n") return tn > 1 ? Array.from({ length: tn }, (_, i) => ({ ...f, distinct: true, ...(i ? { ask: "" } : {}) })) : [{ ...f, to: "one" }];
  return [f];
}
// 追加コスト: LPを払う / 手札を捨てる / 最大マナを減らす（払えないと使えない）
const payLpOf = c => c && c.payLp > 0 ? Math.round(+c.payLp) : 0;
// タグ: free words on a card (c.tags), used by effects, conditions and costs
const tagsOf = c => c && Array.isArray(c.tags) ? c.tags.filter(Boolean) : [];
const hasTag = (id, tag) => !!tag && tagsOf(card(id)).includes(tag);
const parseTags = s => [...new Set(String(s || "").split(/[\s,、，#＃]+/).map(t => t.trim()).filter(Boolean))].slice(0, 8);
const payDiscOf = c => c && c.payDisc > 0 ? Math.round(+c.payDisc) : 0;
// 「手札をすべて捨てる」 (payDisc -1): the rest of the hand goes, however many that is (0 is fine too)
const payDiscAll = c => !!(c && +c.payDisc === -1);
const payMaxOf = c => c && c.payMax > 0 ? Math.round(+c.payMax) : 0;
// スペルブースト（コスト）・G・ゼロ・探査
function costMechText(c){
  if (!c) return ""; const L = [];
  if (+c.sbCost > 0) L.push(`【スペルブースト】手札にある間、自分が魔法を使うたびに、このカードのコスト−${c.sbCost}`);
  if (c.gz && c.gz.where === "none") L.push("【G・ゼロ】いつでもコストを払わずに使える");
  else if (c.gz && String(c.gz.name || "").trim()){ const g = c.gz, n = Math.max(1, +g.cnt || 1); L.push(`【G・ゼロ】自分の${WHERE[g.where] || WHERE.field}に${g.match === "part" ? `名前に「${g.name}」が入ったカード` : g.match === "exact" ? `「${g.name}」` : `タグ「${g.name}」のカード`}が${n > 1 ? n + "枚以上" : ""}あれば、コストを払わずに使える`); }
  if (c.revG != null && cardType(c) === "magic") L.push(`【逆転劇 ${+c.revG || 0}】相手のモンスターが自分に直接攻撃するとき、その攻撃中に1回、手札からこのカードをコストを払わずに使ってよい。そうしたら、次の自分のターンのはじめにマナを${+c.revG || 0}払う。払えなければ、自分はゲームに負ける`);
  if (c.delve) L.push("【探査】マナで払いきれないぶん、自分の墓地のカードを1枚除外するごとにコスト−1");
  return L.join("。");
}
// 革命チェンジ
function revoText(c){ const r = c && cardType(c) === "monster" && c.revo; if (!r || !String(r.name || "").trim()) return ""; return `【革命チェンジ】自分の${r.match === "part" ? `名前に「${r.name}」が入った` : r.match === "exact" ? `「${r.name}」という名前の` : `タグ「${r.name}」の`}モンスターが攻撃するとき、手札のこのカードと入れかえてよい（入れかえたモンスターは手札にもどり、このカードがそのまま攻撃する）`; }
function extraCostText(c){ const L = [payLpOf(c) ? `LPを${payLpOf(c)}払う` : "", payDiscAll(c) ? "手札をすべて捨てる" : payDiscOf(c) ? `手札${c.payDiscTag ? `のタグ「${c.payDiscTag}」のカード` : ""}を${payDiscOf(c)}枚捨てる` : "", payMaxOf(c) ? `最大マナを${payMaxOf(c)}減らす` : "", ctrCostText(payCtrOf(c))].filter(Boolean); return L.length ? "【コスト】" + L.join("、") : ""; }
// 発動タイミング（罠・速攻魔法）: 決めておくと、そのときにしか発動できない
const WHEN_LABEL = { attacked: "相手が攻撃してきたとき", oppUse: "相手がカードを発動したとき", oppSummon: "相手がモンスターを召喚・特殊召喚したとき", oppEnd: "相手のターンの終わり" };
const WHEN_ORDER = ["attacked", "oppSummon", "oppUse", "oppEnd"];
function whenOf(c){ const t = c && cardType(c); return c && (t === "trap" || t === "magic") && !c.field && WHEN_LABEL[c.when] ? c.when : ""; }
function whenText(c){ const w = whenOf(c); return w ? `【${WHEN_LABEL[w]}に発動できる】` : ""; }
// 融合モンスター: materials {m: "name"|"tag"|"any", v}
function fusionMatText(x){ return x.m === "any" ? "モンスター" : x.m === "tag" ? `タグ「${x.v || "？"}」のモンスター` : `「${x.v || "？"}」`; }
function fusionText(c){ return c && cardType(c) === "monster" && Array.isArray(c.fusion) && c.fusion.length ? `【融合】${c.fusion.map(fusionMatText).join("＋")}` : ""; }
const spOptText = c => !c || (cardType(c) !== "magic" && cardType(c) !== "trap") ? "" : [c.strig ? "《S・トリガー》" : "", c.flashback && cardType(c) === "magic" ? "《フラッシュバック》" : "", +c.kick > 0 ? `《キッカー》（${+c.kick}）` : ""].join("");
function fxText(c){ const t = fxTextB(c); return c && c.innate ? "《天賦》" + (t ? "。" + t : "") : t; }
function fxTextB(c){ return (c && c.token && cardType(c) !== "monster" ? "【トークン】" : "") + (c && c.ex && cardType(c) !== "monster" ? "【EX】" : "") + (c && !c.noUse ? whenText(c) : "") + [fusionText(c) ? fusionText(c) + "（「融合召喚」の効果でだけ出せる）" : "", c && c.noUse && (cardType(c) === "magic" || cardType(c) === "trap") ? "このカードは発動できない" : "", isPersist(c) ? "【永続】使ったあとも場に残る" : "", spOptText(c), isField(c) ? `【フィールド】お互いに1枚だけ場に置ける（新しいフィールドが出ると、前のフィールドは墓地へ）。${fieldMine(c) ? "効果は出した人にだけ効く" : "効果はお互いに効く"}` : "", extraCostText(c), costMechText(c), revoText(c), tribText(c), massText(c), anySumText(c), atkCondText(c), ssText(c), fxText0(c)].filter(Boolean).join("。"); }
/* ================= effect blocks: いつ / もし / なにを / ちがったら =================
   c.blocks = [{ trig, conds: [{k, op, n | name, where, match | text}], join: "and"|"or", then: [{kind, n, to}], else: [...] }]
   Older cards (c.fx + c.combo) are read as blocks too, so everything below runs on blocks. */
const COND_DEFS = {
  lp:       { label: "自分のLP", who: "自分のLPが", unit: "", val: (st, s) => P(st, s).lp },
  oppLp:    { label: "相手のLP", who: "相手のLPが", unit: "", val: (st, s) => P(st, O(s)).lp },
  hand:     { label: "自分の手札の枚数", who: "自分の手札が", unit: "枚", val: (st, s) => P(st, s).hand.length },
  grave:    { label: "自分の墓地の枚数", who: "自分の墓地が", unit: "枚", val: (st, s) => P(st, s).grave.length },
  otherMon: { label: "自分のほかのモンスターの数（このカード以外）", who: "自分のほかのモンスターが", unit: "体", val: (st, s, c, ctx) => P(st, s).mz.filter((m, i) => m && !(ctx && ctx.zone != null && i === ctx.zone)).length },
  myMon:    { label: "自分のモンスターの数", who: "自分のモンスターが", unit: "体", val: (st, s) => P(st, s).mz.filter(Boolean).length },
  oppMon:   { label: "相手のモンスターの数", who: "相手のモンスターが", unit: "体", val: (st, s) => P(st, O(s)).mz.filter(Boolean).length },
  mana:     { label: "自分のマナ", who: "自分のマナが", unit: "", val: (st, s) => { const m = P(st, s).mana; return m ? m.cur : 0; } },
  block:    { label: "自分のブロック", who: "自分のブロックが", unit: "", val: (st, s) => P(st, s).block || 0 },
  oppVuln:  { label: "相手の弱体", who: "相手の弱体が", unit: "", val: (st, s) => P(st, O(s)).vuln || 0 },
  lostNow:  { label: "このターンLPを失った回数", who: "このターンLPを失った回数が", unit: "回", val: (st, s) => P(st, s).lostNow || 0 },
  exNow:    { label: "このターン廃棄した枚数", who: "このターン廃棄したカードが", unit: "枚", val: (st, s) => P(st, s).exhaustedNow || 0 },
  exile:    { label: "廃棄札の枚数", who: "廃棄札のカードが", unit: "枚", val: (st, s) => (P(st, s).exile || []).length },
  atkNow:   { label: "このターン使ったアタックの枚数", who: "このターン使ったアタックが", unit: "枚", val: (st, s) => P(st, s).atkNow || 0 },
  myStr:    { label: "自分の筋力", who: "自分の筋力が", unit: "", val: (st, s) => P(st, s).str || 0 },
  sameHand: { label: "手札のこのカードの枚数", who: "手札にこのカードが", unit: "枚", val: (st, s, c, ctx) => P(st, s).hand.filter(id => id === c.id).length + (ctx && ctx.fromHand ? 1 : 0) },
  card:     { label: "特定のカードがある" },
  costDeck: { label: "自分がコストデッキを使っている" },
  ask:      { label: "質問して「はい」と答えた" },
  used:     { label: "発動したカード（「魔法・罠が発動したとき」用）" },
  die:      { label: "サイコロの目（「まず」でサイコロを振ったとき）", who: "サイコロの目が", unit: "", roll: true, val: (st, s, c, ctx) => ctx && ctx.roll && ctx.roll.kind === "die" ? ctx.roll.v : 0 },
  stronger: { label: "このモンスターよりATKが高いモンスターがいる・いない" },
  coinH:    { label: "コインが表（「まず」でコインを投げたとき）", roll: true },
  coinT:    { label: "コインが裏（「まず」でコインを投げたとき）", roll: true },
  kicked:   { label: "キッカーを払った（キッカーのあるカード用）" },
  ctr:      { label: "カウンターの数", who: "カウンターが", unit: "個", val: () => 0 },
  played:   { label: "連携：このターン使ったカードの枚数（このカードもふくむ）", who: "このターン使ったカードが", unit: "枚", val: (st, s) => P(st, s).playedNow || 0 },
  maxMana:  { label: "覚醒：自分の最大マナ", who: "自分の最大マナが", unit: "", val: (st, s) => { const m = P(st, s).mana; return m ? m.max : 0; } },
  mass:     { label: "このモンスターの質量の数", who: "このモンスターの質量が", unit: "枚", val: (st, s, c, ctx) => { const m = ctx && ctx.mon && monAt(st, ctx.mon); return m ? (m.mats || []).length : 0; } }
};
const OPS = { ge: "以上", le: "以下", eq: "" };
// 「○1つにつき」: what a number can grow with (ダメージ / ブロック / マナ / 回復, or the number of hits)
const PER_DEFS = {
  myBlock:  { label: "自分のブロック", u: "1", val: (st, s) => P(st, s).block || 0 },
  mass5:    { label: "このモンスターの質量5枚", u: "", val: (st, s, c, t, ctx) => { const m = ctx && ctx.mon && monAt(st, ctx.mon); return m ? Math.floor((m.mats || []).length / 5) : 0; } },
  mass:     { label: "このモンスターの質量", u: "1枚", val: (st, s, c, t, ctx) => { const m = ctx && ctx.mon && monAt(st, ctx.mon); return m ? (m.mats || []).length : 0; } },
  strike:   { label: "名前に「ストライク」が入った自分のカード", u: "1枚", val: (st, s) => { const p = P(st, s); return [...p.hand, ...p.deck, ...p.grave].filter(id => /ストライク/.test(card(id).name || "")).length; } },
  tgtVuln:  { label: "対象の弱体", u: "1", val: (st, s, c, t) => { const op = P(st, O(s)); if (typeof t === "string" && t.startsWith("m:")){ const m = op.mz[+t.slice(2)]; return m ? m.vuln || 0 : 0; } return op.vuln || 0; } },
  exile:    { label: "廃棄札のカード", u: "1枚", val: (st, s) => (P(st, s).exile || []).length },
  exN:      { label: "直前の効果で廃棄したカード", u: "1枚", val: (st, s, c, t, ctx) => (ctx && ctx.exN) || 0 },
  discN:    { label: "直前の効果で捨てた手札", u: "1枚", val: (st, s, c, t, ctx) => (ctx && ((ctx.hit && ctx.hit.discN) || ctx.discN)) || 0 },
  used:     { label: "この試合でこのカードを使った回数（今回をのぞく）", u: "1回", val: (st, s, c) => Math.max(0, ((P(st, s).usedCount || {})[c && c.id] || 0) - 1) },
  lostTotal:{ label: "この試合でLPを失った回数", u: "1回", val: (st, s) => P(st, s).lostTotal || 0 },
  handAtk:  { label: "手札のアタック", u: "1枚", val: (st, s) => P(st, s).hand.filter(id => isAttackCard(card(id))).length },
  atkNow:   { label: "このターン使ったアタック", u: "1枚", old: true, val: (st, s) => P(st, s).atkNow || 0 },
  usedNow:  { label: "このターン使ったカード", u: "1枚", val: (st, s, c, t, ctx, fx) => (P(st, s).usedNowIds || []).filter(id => usedMatch(card(id), fx && fx.pf, fx && fx.pfn)).length },
  ctr:      { label: "カウンター", u: "1個", val: (st, s, c, t, ctx, fx) => fx ? ctrCount(st, s, ctx, fx.pctr, fx.pcw) : 0 },
  sbN:      { label: "このカードのスペルブーストの回数", u: "1回", val: (st, s, c) => c ? ((P(st, s).sbLast || {})[c.id] || 0) : 0 },
  die:      { label: "サイコロの出た目", u: "1", val: (st, s, c, t, ctx) => ctx && ctx.roll && ctx.roll.kind === "die" ? ctx.roll.v : 0 }
};
const PER_OK = { dmg: true, block: true, manaNow: true, heal: true, draw: true, discard: true, vuln: true, weak: true, loseLp: true, atkUp: true, selfAtk: true, atkAll: true, atkDown: true, str: true, oppDraw: true, exhaustRand: true, manaMax: true, plate: true };
const perVal = (st, s, c, fx, t, ctx) => PER_DEFS[fx.per] ? PER_DEFS[fx.per].val(st, s, c, t, ctx, fx) : 0;
const perText = m => !m.per || !PER_DEFS[m.per] ? "" : m.hits ? `（${perLab(m)}につき、もう1回）` : `（${perLab(m)}につき+${m.pm ?? 1}）`;
const isNumCond = k => !!(COND_DEFS[k] && COND_DEFS[k].val);
const usedWhat = x => x.match === "magic" ? "魔法" : x.match === "trap" ? "罠" : x.match === "tag" ? `タグ「${x.name || "？"}」のカード` : x.match === "part" ? `名前に「${x.name || "？"}」が入ったカード` : x.match === "name" ? `「${x.name || "？"}」` : "なんでも";
function condPhrase(x){
  if (x.k === "card"){ const cnt = +(x.cnt ?? 1), op = x.op === "le" ? "le" : "ge"; return `${x.match === "tag" ? `タグ「${x.name || "？"}」のカード` : x.match === "part" ? `名前に「${x.name || "？"}」が入ったカード` : `「${x.name || "？"}」`}が自分の${WHERE[x.where] || WHERE.field}に${cnt === 1 && op === "ge" ? "ある" : `${cnt}枚${OPS[op]}ある`}`; }
  if (x.k === "ask") return `${x.who === "op" ? "相手が" : ""}「${x.text || "？"}」に「はい」`;
  if (x.k === "costDeck") return "自分がコストデッキを使っている";
  if (x.k === "stronger") return `${{ me: "自分の場に", any: "場に" }[x.side] || "相手の場に"}このモンスターよりATKが高いモンスターが${x.has === "no" ? "いない" : "いる"}`;
  if (x.k === "coinH") return "コインが表";
  if (x.k === "used") return `${{ me: "自分が", op: "相手が" }[x.who] || ""}発動したカードが${usedWhat(x)}`;
  if (x.k === "coinT") return "コインが裏";
  if (x.k === "kicked") return "キッカーを払っていた";
  if (x.k === "ctr") return `${ctrAtText(x.cw)}の${ctrName(x.ctr)}が${x.n ?? 0}個${x.op in OPS ? OPS[x.op] : OPS.ge}`;
  const d = COND_DEFS[x.k]; return `${d.who}${x.n ?? 0}${d.unit}${x.op in OPS ? OPS[x.op] : OPS.ge}`;
}
const condsText = b => b.conds && b.conds.length ? b.conds.map(condPhrase).join(b.join === "or" ? "か、" : "、かつ") + "なら、" : "";
// how many monsters on `side` have more ATK than this monster (the one on the field, or the card's own ATK)
function strongerCount(st, s, c, ctx, side){
  const ref = ctx && ctx.mon ? monAt(st, ctx.mon) : ctx && ctx.zone != null ? P(st, s).mz[ctx.zone] : null;
  const a = ref ? atkOf(ref) : c && cardType(c) === "monster" ? baseAtk(c) : 0;
  let n = 0; for (const o of side === "me" ? [s] : side === "any" ? [s, O(s)] : [O(s)]) P(st, o).mz.forEach(m => { if (m && m !== ref && atkOf(m) > a) n++; });
  return n;
}
function condMet(st, s, c, x, ctx){
  if (x.k === "kicked") return !!(ctx && ctx.kicked);
  if (x.k === "costDeck") return !!P(st, s).mana;
  if (x.k === "stronger"){ const n = strongerCount(st, s, c, ctx, x.side || "op"); return x.has === "no" ? n === 0 : n > 0; }
  if (x.k === "used"){
    const u = ctx && ctx.used; if (!u) return false;
    if (x.who === "me" && u.s !== s) return false; if (x.who === "op" && u.s === s) return false;
    const uc = card(u.c), t = cardType(uc), w = String(x.name || "").trim();
    if (x.match === "magic") return t === "magic"; if (x.match === "trap") return t === "trap"; if (x.match === "any" || !x.match) return true;
    if (!w) return false;
    if (x.match === "tag") return tagsOf(uc).includes(w); if (x.match === "part") return normQ(uc.name).includes(normQ(w));
    return normQ(uc.name).trim() === normQ(w).trim() || plainRuby(uc.nameRuby || "") === w;
  }
  if (x.k === "coinH" || x.k === "coinT") return !!(ctx && ctx.roll && ctx.roll.kind === "coin" && ctx.roll.v === (x.k === "coinH" ? 1 : 0));
  if (x.k === "card"){ if (!x.name) return false; const v = comboCount(st, s, { name: x.name, where: WHERE[x.where] ? x.where : "field", match: x.match === "part" || x.match === "tag" ? x.match : "exact" }, ctx || {}), n = Math.max(0, +(x.cnt ?? 1)); return x.op === "le" ? v <= n : v >= n; }
  if (x.k === "ctr"){ const v = ctrCount(st, s, ctx, x.ctr, x.cw), n = +x.n || 0; return x.op === "le" ? v <= n : x.op === "eq" ? v === n : v >= n; }
  const d = COND_DEFS[x.k]; if (!d || !d.val) return true;
  const v = d.val(st, s, c, ctx), n = +x.n || 0;
  return x.op === "le" ? v <= n : x.op === "eq" ? v === n : v >= n;
}
function normTrig(c, trig){
  if (c && c.relicView) return RELIC_TRIGS.includes(trig) ? trig : "gain";
  const t = cardType(c);
  if (t === "monster"){ const k = OLD_TRIG[trig] || trig; return MON_TRIGS.includes(k) ? k : "summon"; }
  if (t === "equip") return EQ_TRIGS.includes(trig) ? trig : "attach";
  if (isField(c)) return FIELD_TRIGS.includes(trig) ? trig : "use";
  if (isPersist(c)) return PERSIST_TRIGS.includes(trig) ? trig : "use";
  return "use";
}
// カードを書きかえる: だれの・どこの・どのカードを（mt）、なにを足す／上書きする（gk・gn）、新しい名前（nm）
const GRANT_KINDS = ["draw", "dmg", "heal", "block", "vuln", "weak", "discard", "manaNow", "str", "atkUp", "atkAll", "destroy", "oppDraw", "loseLp", "noDraw", "exhaustRand"];
// どのカードを: だれの（自分／相手）・どこの（手札／山札／両方）・どう（1枚えらぶ／すべて／ランダムに○枚／名前を指定）
const MOD_LEGACY = { myHandPick: ["me", "hand", "pick"], myHandAll: ["me", "hand", "all"], myDeckAll: ["me", "deck", "all"], myDeckRand: ["me", "deck", "rand"], myNamed: ["me", "both", "named"], opHandAll: ["op", "hand", "all"], opHandRand: ["op", "hand", "rand"], opDeckAll: ["op", "deck", "all"], opDeckRand: ["op", "deck", "rand"], opNamed: ["op", "both", "named"] };
function modT(e){
  const lg = e && !e.ms && MOD_LEGACY[e.mt];
  const side = lg ? lg[0] : e && e.ms === "op" ? "op" : "me", place = lg ? lg[1] : e && ["hand", "deck", "both", "last"].includes(e.mpl) ? e.mpl : "hand";
  if (place === "last") return { side, place, scope: "last" };
  let scope = lg ? lg[2] : e && ["pick", "all", "rand", "named"].includes(e.mc) ? e.mc : "pick";
  if (scope === "pick" && !(side === "me" && place === "hand")) scope = "rand";
  return { side, place, scope };
}
function modTargetText(e){
  const T = modT(e), n = (e && e.mn) || 1, nm = (e && e.into) || "？", who = T.side === "me" ? "自分" : "相手", where = { hand: "手札", deck: "山札", both: "手札と山札" }[T.place];
  if (T.scope === "last") return "直前に発動したカード";
  return T.scope === "pick" ? `${who}の手札のカード1枚` : T.scope === "all" ? `${who}の${where}のカードすべて` : T.scope === "rand" ? `${who}の${where}のランダムなカード${n}枚` : `${who}の${where}の「${nm}」すべて`;
}
function grantText(e){ if (e && e.ge && KINDS[e.ge.kind] && !KINDS[e.ge.kind].mod) return effsText({ type: "magic" }, [cleanEff(e.ge)].filter(Boolean)); const k = e && e.gk && KINDS[e.gk] && !KINDS[e.gk].mod ? e.gk : "draw"; return KINDS[k].text(e && e.gn || (smallN(k) ? 1 : 100)); }
const cleanEff = e => e && KINDS[e.kind] && e.kind !== "none" ? { kind: e.kind, ...(e.dn ? { dn: String(e.dn).slice(0, 20) } : {}), ...(e.di ? { di: String(e.di).slice(0, 12) } : {}), ...(e.dd ? { dd: String(e.dd).slice(0, 80) } : {}), ...(e.n != null ? { n: e.n } : {}), ...(e.to && e.to !== "one" && TARGETABLE[e.kind] ? { to: e.to } : {}), ...(TARGETABLE[e.kind] && e.side === "me" ? { side: "me" } : {}), ...(TARGETABLE[e.kind] && (e.to === "n" || e.to === "random") && e.tn > 1 ? { tn: Math.min(10, Math.round(+e.tn)) } : {}), ...(KINDS[e.kind].name && e.into ? { into: String(e.into).slice(0, 40) } : {}), ...(KINDS[e.kind].name && e.into && e.intoId && pickCardKind(e.kind) ? { intoId: String(e.intoId).slice(0, 80) } : {}), ...(e.times > 1 ? { times: Math.min(20, Math.round(e.times)) } : {}), ...(e.timesDie ? { timesDie: true } : {}), ...(KINDS[e.kind].mod && (e.kind === "modAdd" || e.kind === "modRep") && e.ge && KINDS[e.ge.kind] && !KINDS[e.ge.kind].mod ? { ge: cleanEff(e.ge) } : {}), ...(KINDS[e.kind].mod ? { ms: modT(e).side, mpl: modT(e).place, mc: modT(e).scope, ...(e.mn > 1 ? { mn: Math.min(40, Math.round(+e.mn)) } : {}), ...(e.gk && KINDS[e.gk] && !KINDS[e.gk].mod ? { gk: e.gk, gn: Math.max(1, Math.round(+e.gn || 1)) } : {}), ...(e.nm ? { nm: String(e.nm).slice(0, 20) } : {}), ...(modT(e).scope === "named" && e.into ? { into: String(e.into).slice(0, 40) } : {}) } : {}), ...(e.per && PER_DEFS[e.per] && PER_OK[e.kind] ? { per: e.per, pm: e.pm ?? 1, ...(e.hits && e.kind === "dmg" ? { hits: true } : {}), ...(e.per === "ctr" ? { pctr: String(e.pctr || ctrDefault()), pcw: CTR_AT[e.pcw] ? e.pcw : "self" } : {}), ...(e.per === "usedNow" ? { pf: USED_PF[e.pf] ? e.pf : "any", ...(["name", "part", "tag"].includes(e.pf) && e.pfn ? { pfn: String(e.pfn).slice(0, 40) } : {}) } : {}) } : {}), ...(e.kind === "giveAb" ? { ab: gabKey(e), gw: GAB_W[e.gw] ? e.gw : "self", ...(GAB_D[e.gd] != null && e.gd ? { gd: e.gd } : {}), ...(ABS[gabKey(e)].name && e.into ? { into: String(e.into).slice(0, 40) } : {}) } : {}), ...(e.kind === "removeBoard" ? { rside: RB_SIDE[e.rside] ? e.rside : "op", rm: RB_MODE[e.rm] ? e.rm : "destroy" } : {}), ...(KINDS[e.kind].ctr ? { ctr: String(e.ctr || ctrDefault()), cw: CTR_CW[e.cw] ? e.cw : "pick", ...(e.side === "me" ? { side: "me" } : {}) } : {}) } : null;
const LEGACY_COND = { lp: { k: "lp", op: "le" }, grave: { k: "grave", op: "ge" }, hand: { k: "sameHand", op: "ge" } };
function blocksOf(c){
  if (!c) return [];
  if (Array.isArray(c.blocks)) return c.blocks.filter(b => b && typeof b === "object").map(b => ({
    trig: normTrig(c, b.trig), join: b.join === "or" ? "or" : "and", roll: b.roll === "die" || b.roll === "coin" ? b.roll : "", faces: Math.max(2, Math.min(100, Math.round(+b.faces || 6))), delay: Math.max(0, Math.min(9, Math.round(+b.delay || 0))),
    ...(b.trig === "act" ? { ap: b.ap === "game" || b.ap === "free" ? b.ap : "turn", an: Math.max(1, Math.min(9, Math.round(+b.an || 1))) } : {}),
    ...(b.trig === "ctrReach" ? { rc: String(b.rc || ctrDefault()), rn: Math.max(1, Math.min(99, Math.round(+b.rn || 1))), rw: b.rw === "me" ? "me" : "self" } : {}),
    ...(b.trig === "act" && b.cost && b.cost.id && +b.cost.n > 0 ? { cost: { id: String(b.cost.id), n: Math.min(99, Math.round(+b.cost.n)), w: b.cost.w === "me" || b.cost.w === "field" ? b.cost.w : "self" } } : {}),
    ...(+b.necro > 0 ? { necro: Math.min(40, Math.round(+b.necro)) } : {}), ...(b.trig === "act" && +b.mcost > 0 ? { mcost: Math.min(99, Math.round(+b.mcost)) } : {}),
    ...(b.bn ? { bn: String(b.bn).slice(0, 20) } : {}), ...(b.bic ? { bic: String(b.bic).slice(0, 12) } : {}), ...(b.bd ? { bd: String(b.bd).slice(0, 40) } : {}), ...(b.one ? { one: true } : {}),
    // プレイヤーに付与: { to: me|op, at: turnStart|turnEnd, dur: 0=ずっと / ○回 }
    grant: b.grant && (b.grant.to === "me" || b.grant.to === "op") ? { to: b.grant.to, at: b.grant.at === "turnStart" ? "turnStart" : "turnEnd", dur: Math.max(0, Math.min(9, Math.round(+b.grant.dur || 0))) } : null,
    conds: (Array.isArray(b.conds) ? b.conds : []).filter(x => x && COND_DEFS[x.k]),
    then: (Array.isArray(b.then) ? b.then : []).map(cleanEff).filter(Boolean),
    else: (Array.isArray(b.else) ? b.else : []).map(cleanEff).filter(Boolean),
    // サイコロの出た目ごとの効果: [{lo, hi, then}]
    dieBr: b.roll === "die" && Array.isArray(b.dieBr) ? b.dieBr.filter(x => x && Array.isArray(x.then)).map(x => ({ lo: Math.max(1, Math.round(+x.lo || 1)), hi: Math.max(1, Math.round(+x.hi || +x.lo || 1)), then: x.then.map(cleanEff).filter(Boolean) })).filter(x => x.then.length) : []
  })).filter(b => b.then.length || b.else.length || b.dieBr.length);
  const out = [], fx = normFx0(c), cb = normCombo(c);
  if (fx){
    const conds = [];
    if (fx.ask) conds.push({ k: "ask", text: fx.ask });
    if (fx.kind === "win" && LEGACY_COND[fx.cond]) conds.push({ ...LEGACY_COND[fx.cond], n: fx.cn });
    out.push({ trig: fx.trig, join: "and", conds, then: [fx, ...moreFx(fx)].map(cleanEff).filter(Boolean), else: [] });
  }
  if (cb) out.push({ trig: cb.trig, join: "and", conds: [{ k: "card", name: cb.name, where: cb.where, match: cb.match }], then: [cleanEff(cb)].filter(Boolean), else: [] });
  return out;
}
const hasTrig = (c, trig) => blocksOf(c).some(b => b.trig === trig);
// the words for a list of effects (the same rules the single effect had: 同じ相手, 装備したモンスター, スパイア風の狙い先)
function effsText(c, effs){
  const spire = c.frame === "spire" || !!c.potionView, t = cardType(c), one = x => !x.to || x.to === "one", aim = x => ["dmg", "bash", "vuln", "weak"].includes(x.kind) && one(x);
  // the same effect several times in a row reads as 「…を4回」
  const G2 = [];
  effs.forEach(m => { const cnt = m.times > 1 ? m.times : 1, key = JSON.stringify({ ...m, times: 1 }), last = G2[G2.length - 1]; if (last && last.key === key) last.cnt += cnt; else G2.push({ m, key, cnt }); });
  let out = G2.map((g, k) => {
    const m = g.m;
    // base 0 + 「○1つにつき」 reads as 「○1つにつき100ダメージ」
    const pz = m.per && !m.hits && !m.n && PER_DEFS[m.per], nn = pz ? `${perLab(m)}につき${m.pm ?? 1}` : m.n;
    let tx = ((m.to || m.side === "me") && TARGETABLE[m.kind] ? toText(m.kind, nn, m.to || "one", spire, m.tn, m.side) : KINDS[m.kind].text(nn, m.into, m)) + (pz ? "" : perText(m));
    if (spire && k > 0 && aim(m) && G2.slice(0, k).some(x => aim(x.m))) tx = tx.replace(/^相手(に|を)/, "同じ相手$1");
    if (g.cnt > 1) tx += /ダメージ$/.test(tx) ? `を${g.cnt}回` : `（${g.cnt}回）`;
    if (m.timesDie) tx += "（出た目の回数くり返す）";
    return tx;
  }).join("、");
  if (t === "equip") out = out.replace(/このモンスター/g, "装備したモンスター");
  if (spire) out = out.replace(/(?<!同じ)相手に([^、。]+?)ダメージ/g, "相手のモンスター1体（いなければ相手）に$1ダメージ").replace(/(?<!同じ)相手を弱体/g, "相手のモンスター1体（いなければ相手）を弱体").replace(/(?<!同じ)相手を脱力/g, "相手のモンスター1体（いなければ相手）を脱力");
  return out;
}
// 「次の自分のターンのはじめ」「○ターン後の自分のターンのはじめ」: カードでは時計マーク＋数字で出す
const delayText = d => d > 0 ? (d === 1 ? "【次の自分のターンのはじめ】" : `【${d}ターン後の自分のターンのはじめ】`) : "";
function clockSVG(n, cls){ return `<svg class="clk${cls ? " " + cls : ""}" viewBox="0 0 40 46" aria-hidden="true"><rect x="13" y="0" width="14" height="9" rx="4" fill="currentColor"/><circle cx="20" cy="26" r="18" fill="currentColor"/><circle cx="20" cy="26" r="11.5" fill="#fff"/><text x="20" y="31.5" text-anchor="middle" font-size="15" font-weight="800" font-family="sans-serif" fill="#111">${n}</text></svg>`; }
function clockMark(html){ return html ? html.replace(/【次の自分のターンのはじめ】/g, () => `<span class="clkm" title="次の自分のターンのはじめに出る">${clockSVG(1)}</span>`).replace(/【(\d)ターン後の自分のターンのはじめ】/g, (_, d) => `<span class="clkm" title="${d}ターン後の自分のターンのはじめに出る">${clockSVG(d)}</span>`) : html; }
const boonText = g => `${g.to === "op" ? "相手" : "自分"}に効果を付与する${g.dur ? `（${g.dur}回）` : "（ずっと）"}：`;
// 起動効果の回数: ap = turn（1ターンに○回）/ game（ゲーム中に○回）/ free（制限なし）
const actLim = b => ({ per: b && (b.ap === "game" || b.ap === "free") ? b.ap : "turn", n: Math.max(1, Math.min(9, Math.round(+(b && b.an) || 1))) });
const actLimText = b => { const L = actLim(b); return L.per === "free" ? "・何回でも" : L.per === "game" ? `・ゲーム中に${L.n}回` : `・1ターンに${L.n}回`; };
function blockText(c, b){
  const t = cardType(c), isMon = t === "monster" || t === "equip";
  const head = c && c.relicView ? `【${RELIC_TRIG_LABEL[b.trig] || ""}】` : isMon ? (b.trig === "act" ? `【起動${actLimText(b)}】` + ((L => L.length ? L.join("、") + "：" : "")([b.mcost > 0 ? `マナを${b.mcost}払う` : "", b.cost ? ctrCostText(b.cost) : ""].filter(Boolean))) : b.trig === "ctrReach" ? `【${ctrReachHead(b)}】` : `【${trigLabel(t, b.trig)}】`) : isField(c) && b.trig !== "use" ? `【${fieldTrigLabel(c, b.trig)}】` : isPersist(c) && b.trig !== "use" ? `【${PERSIST_TRIG_LABEL[b.trig]}】` : "";
  const br = b.roll === "die" && b.dieBr && b.dieBr.length ? b.dieBr : null;
  const brText = br ? br.map(x => `${x.lo === x.hi ? x.lo : `${x.lo}〜${x.hi}`}が出たら、${effsText(c, x.then)}`).join("。") : "";
  let s = head + (b.necro > 0 ? `【ネクロマンス${b.necro}】` : "") + delayText(b.delay) + (b.roll === "die" ? `サイコロ${b.faces && b.faces !== 6 ? `（${b.faces}面）` : ""}を振る。` : b.roll === "coin" ? "コインを投げる。" : "") + condsText(b) + (b.then.length ? (b.one && b.then.length > 1 ? "次の効果から1つえらんで発動する：" + b.then.map(e => effsText(c, [e])).join("／") : effsText(c, b.then)) + (br ? "。" : "") : br ? "" : "なにもしない") + brText;
  if (b.conds.length && b.else.length) s += `。そうでなければ、${effsText(c, b.else)}`;
  if (b.grant){ const pre = head + delayText(b.delay), g = b.grant; s = pre + boonText(g) + `「自分のターンの${g.at === "turnStart" ? "はじめ" : "おわり"}に、${s.slice(pre.length)}」`; }
  if (isField(c) && !fieldMine(c)) s = s.replace(/(自分|相手)のモンスターすべて/g, "お互いのモンスターすべて");
  return s;
}
function fxText0(c){ const out = blocksOf(c).map(b => blockText(c, b)).join("。"); return c && c.costX && out ? "【X回くり返す】" + out : out; }

