import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// カードを生む（名前指定・コピー・ランダム）と、カードを持ってくる・出す（サーチ・サルベージ・蘇生・タグ・EX・マナ）
// 古い効果で作られたカードが今までどおりに動くことを確かめる
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};__pf=[];persistFire=(st,s,k,x,then)=>{__pf.push(s+':'+k);then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=()=>{};
    draftPool=()=>[...S.cards.values()].filter(c=>c.frame==='spire');`);
  const S = js('S');
  const add = (id, o) => S.cards.set(id, { id, name: id, type: 'monster', atk: 100, cost: 0, ...o });
  add('src', { atk: 1000 }); add('weak', { atk: 100 }); add('strong', { atk: 900, cost: 3 }); add('tok', { atk: 50 });
  add('spell', { type: 'magic' }); add('trap', { type: 'trap' });
  add('dragon', { atk: 800, tags: ['竜'] }); add('wyrm', { atk: 300, tags: ['竜'] });
  add('exA', { atk: 700, ex: true, tags: ['竜'] });
  add('sAtk', { type: 'magic', frame: 'spire', sk: 'attack' }); add('sSkill', { type: 'magic', frame: 'spire', sk: 'skill' });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], ex: [], mz: [null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [], pending: {} };
  const a = st.players.a, b = st.players.b;
  a.mz[0] = { c: 'src', u: 1, eqs: [], born: 0 }; st.un = 10;
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const run = (fx, card = 'spell', extra = {}) => js('runEffects')(st, 'a', S.cards.get(card), [fx], { hit: {}, ...(card === 'src' ? { zone: 0, mon: { s: 'a', i: 0, u: 1 } } : {}), ...extra }, null);
  const names = p => p.mz.filter(Boolean).map(m => m.c);
  return { ctx, js, S, st, a, b, run, names, pf: () => [...js('__pf')] };
}
const sorted = L => L.slice().sort();

test('名前を指定して生む: 手札・相手の手札・相手の山札・自分の場・相手の場・相手の魔法罠ゾーン', () => {
  let t = setup(); t.run({ kind: 'genNamed', into: 'tok', n: 2 }); assert.deepEqual(t.a.hand, ['tok', 'tok']);
  t = setup(); t.run({ kind: 'oppGenHand', into: 'tok', n: 1 }); assert.deepEqual(t.b.hand, ['tok']);
  t = setup(); t.b.deck = ['x', 'y']; t.run({ kind: 'oppGenDeck', into: 'tok', n: 2 }); assert.equal(t.b.deck.filter(x => x === 'tok').length, 2); assert.equal(t.b.deck.length, 4);
  t = setup(); t.run({ kind: 'summonNamed', into: 'tok', n: 2 }); assert.deepEqual(t.names(t.a), ['src', 'tok', 'tok']);
  t = setup(); t.run({ kind: 'summonNamed', into: 'tok', n: 5 }); assert.equal(t.names(t.a).length, 3);
  t = setup(); t.run({ kind: 'oppSummon', into: 'tok', n: 1 }); assert.deepEqual(t.names(t.b), ['tok']);
  t = setup(); t.run({ kind: 'oppSetNamed', into: 'trap', n: 1 }); assert.equal(t.b.sz[0].c, 'trap'); assert.ok(!t.b.sz[0].face);
  t = setup(); t.run({ kind: 'genNamed', into: 'nothing' }); assert.deepEqual(t.a.hand, []);
});

test('コピーを生む: このカード（手札・山札・墓地）・直前のアタック・えらんだ手札（いま・次のターン）', () => {
  let t = setup(); t.run({ kind: 'copyHand' }); assert.deepEqual(t.a.hand, ['spell']);
  t = setup(); t.a.deck = ['x']; t.run({ kind: 'copyDeck' }); assert.deepEqual(sorted(t.a.deck), ['spell', 'x']);
  t = setup(); t.run({ kind: 'copyGrave' }); assert.deepEqual(t.a.grave, ['spell']);
  t = setup(); t.a.lastAtk = 'sAtk'; t.run({ kind: 'copyLastAtk' }); assert.deepEqual(t.a.hand, ['sAtk']);
  t = setup(); t.a.hand = ['strong', 'weak']; t.run({ kind: 'copyPick', n: 2 }); assert.deepEqual(t.a.hand, ['strong', 'weak', 'weak', 'weak']);
  t = setup(); t.a.hand = ['weak']; t.run({ kind: 'copyPick', n: 1, cpw: 'next' }); assert.deepEqual(t.a.hand, ['weak']); assert.deepEqual(JSON.parse(JSON.stringify(t.a.nextGive)), [{ id: 'weak', n: 1 }]);
});

test('ランダムなスパイア風カードを生む: 種類どおり・このターンコスト0', () => {
  let t = setup(); t.run({ kind: 'genAttack', n: 2 }); assert.deepEqual(t.a.hand, ['sAtk', 'sAtk']);
  t = setup(); t.run({ kind: 'genSkill', n: 1 }); assert.deepEqual(t.a.hand, ['sSkill']);
  t = setup(); t.run({ kind: 'genAttack0', n: 1 }); assert.deepEqual(t.a.hand, ['sAtk']); assert.deepEqual([...t.a.freeIds], ['sAtk']);
});

test('山札・墓地から手札へ: サーチ（CPUは強いもの）・タグ・サルベージ・ランダムなアタック', () => {
  let t = setup(); t.a.deck = ['weak', 'spell', 'strong']; t.run({ kind: 'searchMon', n: 1 }); assert.deepEqual(t.a.hand, ['strong']); assert.equal(t.a.deck.length, 2);
  t = setup(); t.a.deck = ['weak', 'spell', 'trap']; t.run({ kind: 'searchMagic', n: 1 }); assert.deepEqual(t.a.hand, ['spell']);
  t = setup(); t.a.deck = ['weak', 'dragon', 'wyrm']; t.run({ kind: 'tagSearch', into: '竜', n: 2 }); assert.deepEqual(sorted(t.a.hand), ['dragon', 'wyrm']);
  t = setup(); t.a.grave = ['weak', 'dragon']; t.run({ kind: 'tagGraveHand', into: '竜', n: 1 }); assert.deepEqual(t.a.hand, ['dragon']); assert.deepEqual(t.a.grave, ['weak']);
  t = setup(); t.a.grave = ['weak', 'spell', 'strong']; t.run({ kind: 'revive' }); assert.deepEqual(t.a.hand, ['strong']);
  t = setup(); t.a.grave = ['spell']; t.run({ kind: 'graveHand' }); assert.deepEqual(t.a.hand, ['spell']); assert.deepEqual(t.a.grave, []);
  t = setup(); t.a.grave = ['sAtk', 'spell', 'sAtk']; t.run({ kind: 'graveAtkToHand', n: 2 }); assert.deepEqual(t.a.hand, ['sAtk', 'sAtk']); assert.deepEqual(t.a.grave, ['spell']);
});

test('場に出す: 蘇生・タグ（手札・山札・墓地・EX）・EX・このカードを手札から', () => {
  let t = setup(); t.a.grave = ['weak', 'strong']; t.run({ kind: 'reborn' }); assert.deepEqual(t.names(t.a), ['src', 'strong']); assert.deepEqual(t.a.grave, ['weak']);
  t = setup(); t.a.hand = ['weak', 'dragon']; t.run({ kind: 'tagSummonHand', into: '竜' }); assert.deepEqual(t.names(t.a), ['src', 'dragon']); assert.deepEqual(t.a.hand, ['weak']);
  t = setup(); t.a.deck = ['wyrm', 'weak']; t.run({ kind: 'tagSummonDeck', into: '竜' }); assert.deepEqual(t.names(t.a), ['src', 'wyrm']); assert.deepEqual(t.a.deck, ['weak']);
  t = setup(); t.a.grave = ['wyrm']; t.run({ kind: 'tagSummonGrave', into: '竜' }); assert.deepEqual(t.names(t.a), ['src', 'wyrm']);
  t = setup(); t.a.ex = ['exA']; t.run({ kind: 'tagSummonEx', into: '竜' }); assert.deepEqual(t.names(t.a), ['src', 'exA']); assert.deepEqual(t.a.ex, []);
  t = setup(); t.a.ex = ['exA']; t.run({ kind: 'exSummon' }); assert.deepEqual(t.names(t.a), ['src', 'exA']);
  t = setup(); t.a.hand = ['weak']; t.run({ kind: 'summonSelf' }, 'weak', { inHand: 'weak' }); assert.deepEqual(t.names(t.a), ['src', 'weak']); assert.deepEqual(t.a.hand, []);
  t = setup(); t.a.mz = [{ c: 'src', u: 1, eqs: [] }, { c: 'weak', u: 2, eqs: [] }, { c: 'weak', u: 3, eqs: [] }]; t.a.grave = ['strong']; t.run({ kind: 'reborn' }); assert.deepEqual(t.a.grave, ['strong']);
});

test('「召喚」と「出す」: 永続の「〜が召喚するたび」「〜の場に出されるたび」は自分・相手・どちらかで分かれる', () => {
  let t = setup(); t.js('enterFire')(t.st, 'a', 'summon'); assert.deepEqual(t.pf(), ['a:mySummon', 'a:anySummonT', 'b:oppSummonT', 'b:anySummonT']);
  t = setup(); t.js('enterFire')(t.st, 'b', 'put'); assert.deepEqual(t.pf(), ['b:myPut', 'b:anyPut', 'a:oppPut', 'a:anyPut']);
  // 効果で出す（蘇生）は「出す」。召喚ではない
  t = setup(); t.a.grave = ['weak']; t.run({ kind: 'reborn' }); assert.ok(t.pf().includes('a:myPut')); assert.ok(!t.pf().some(x => /Summon/.test(x)));
  // 相手の場に出すと、相手の「自分の場に出されるたび」・自分の「相手の場に出されるたび」
  t = setup(); t.run({ kind: 'oppSummon', into: 'tok' }); assert.ok(t.pf().includes('b:myPut')); assert.ok(t.pf().includes('a:oppPut'));
});

test('相手の場に出したモンスターも「出されたとき」が起きる（その場の持ち主の効果として）', () => {
  const t = setup(); t.S.cards.set('bomb', { id: 'bomb', name: 'bomb', type: 'monster', atk: 0, blocks: [{ trig: 'ssummon', conds: [], join: 'and', then: [{ kind: 'genNamed', into: 'tok', n: 1 }], else: [] }] });
  t.run({ kind: 'gen', what: 'named', into: 'bomb', who: 'op', dest: 'field' });
  assert.deepEqual(t.names(t.b), ['bomb']); assert.deepEqual(t.b.hand, ['tok']); assert.deepEqual(t.a.hand, []);
});

test('新しい形 gen: お互いに・山札の一番上・魔法をセット・次のターン・場がいっぱいなら出せた分だけ', () => {
  let t = setup(); t.run({ kind: 'gen', what: 'named', into: 'tok', who: 'both', n: 2 }); assert.deepEqual(t.a.hand, ['tok', 'tok']); assert.deepEqual(t.b.hand, ['tok', 'tok']);
  t = setup(); t.b.deck = ['x']; t.run({ kind: 'gen', what: 'self', who: 'op', dest: 'deck', pos: 'top' }); assert.deepEqual(t.b.deck, ['spell', 'x']);
  t = setup(); t.run({ kind: 'gen', what: 'named', into: 'trap', dest: 'field', n: 3 }); assert.equal(t.a.sz.filter(Boolean).length, 2); assert.ok(t.a.sz[0].u > 0); assert.equal(t.a.sz[0].face, false);
  t = setup(); t.run({ kind: 'gen', what: 'random', sk: 'skill', dest: 'grave', n: 2 }); assert.deepEqual(t.a.grave, ['sSkill', 'sSkill']);
  t = setup(); t.run({ kind: 'gen', what: 'named', into: 'tok', when: 'next', n: 2 }); assert.deepEqual(t.a.hand, []); assert.deepEqual(JSON.parse(JSON.stringify(t.a.nextGive)), [{ id: 'tok', n: 2 }]);
});

test('新しい形 fetch: 山札から場へ・ランダムに2枚・マナから・場がいっぱい・このカード', () => {
  let t = setup(); t.a.deck = ['spell', 'strong', 'weak']; t.run({ kind: 'fetch', from: 'deck', what: 'mon', dest: 'field' }); assert.deepEqual(t.names(t.a), ['src', 'strong']); assert.equal(t.a.deck.length, 2);
  t = setup(); t.a.grave = ['weak', 'spell', 'trap']; t.run({ kind: 'fetch', from: 'grave', what: 'any', pick: 'random', n: 2 }); assert.equal(t.a.hand.length, 2); assert.equal(t.a.grave.length, 1);
  t = setup(); t.a.manaZ = [{ c: 'strong', tap: false }, { c: 'weak', tap: true }]; t.a.mana = { cur: 2, max: 2 }; t.js('manaSync=()=>{}'); t.run({ kind: 'manaSummon' }); assert.deepEqual(t.names(t.a), ['src', 'strong']); assert.equal(t.a.mana.cur, 1);
  t = setup(); t.a.mz = [{ c: 'src', u: 1, eqs: [] }, { c: 'weak', u: 2, eqs: [] }, { c: 'weak', u: 3, eqs: [] }]; t.a.deck = ['strong']; t.run({ kind: 'fetch', from: 'deck', what: 'mon', dest: 'field' }); assert.deepEqual(t.a.deck, ['strong']);
  t = setup(); t.a.hand = ['weak']; t.run({ kind: 'fetch', what: 'self' }, 'weak', { inHand: 'weak' }); assert.deepEqual(t.names(t.a), ['src', 'weak']);
});

test('gen・fetch: 旧効果からの変換・保存・文', () => {
  const t = setup(), norm = f => ({ ...t.js('fxNorm')(f) }), clean = f => ({ ...t.js('cleanEff')(f) });
  assert.deepEqual(norm({ kind: 'oppGenDeck', into: 'tok', n: 2 }), { kind: 'gen', into: 'tok', what: 'named', dest: 'deck', n: 2, who: 'op', pos: 'shuffle' });
  assert.equal(norm({ kind: 'copyPick', n: 1, cpw: 'next' }).when, 'next');
  assert.equal(norm({ kind: 'genAttack0', n: 1 }).free, true);
  assert.deepEqual(norm({ kind: 'tagSummonEx', into: '竜' }), { kind: 'fetch', into: '竜', from: 'ex', what: 'tag', pick: 'one', dest: 'field', n: 1 });
  assert.equal(norm({ kind: 'manaSummon' }).what, 'mon'); assert.equal(norm({ kind: 'manaSummon', into: '竜' }).what, 'tag');
  const g = clean({ kind: 'gen', what: 'named', into: 'tok', who: 'both', dest: 'deck', pos: 'top', n: 2 }); assert.equal(g.who, 'both'); assert.equal(g.dest, 'deck'); assert.equal(g.pos, 'top'); assert.equal(g.into, 'tok');
  const f = clean({ kind: 'fetch', from: 'grave', what: 'tag', into: '竜', pick: 'random', dest: 'field', n: 2 }); assert.equal(f.from, 'grave'); assert.equal(f.into, '竜'); assert.equal(f.pick, 'random'); assert.equal(f.dest, 'field');
  const gt = t.js('genText'), ft = t.js('fetchText');
  assert.equal(gt({ what: 'named', into: 'トークン', who: 'op', dest: 'field', n: 2 }), '「トークン」を2枚相手の場に出す（魔法・罠はセットする）');
  assert.equal(gt({ what: 'named', into: 'tok', who: 'op', dest: 'field', n: 2 }), '「tok」を2体相手の場に出す（特殊召喚）');
  assert.equal(gt({ what: 'named', into: 'trap', dest: 'field' }), '「trap」を自分の場にセットする');
  assert.equal(gt({ what: 'self', who: 'both', dest: 'deck', pos: 'top' }), 'このカードのコピーをお互いの山札の一番上に置く');
  assert.equal(gt({ what: 'pick', n: 2, when: 'next' }), '手札を1枚えらび、次の自分のターンのはじめに、そのコピーを2枚自分の手札に加える');
  assert.equal(ft({ from: 'grave', what: 'mon', dest: 'field' }), '自分の墓地からモンスターを1枚えらんで場に出す（特殊召喚）');
  assert.equal(ft({ from: 'deck', what: 'tag', into: '竜', n: 2 }), '自分の山札から「竜」タグのカードを2枚えらんで手札に加える（山札はシャッフル）');
});
