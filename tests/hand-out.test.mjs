import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// 手札をどかす効果（捨てる・捨てさせる・廃棄）。古い効果で作られたカードが今までどおりに動くことを確かめる
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>{(__pf=globalThis.__pf||[]).push(s+':'+k);then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=(st,s,ids)=>{(globalThis.__sly=globalThis.__sly||[]).push(s+':'+ids.join(','));};`);
  const S = js('S');
  for (const [id, cost, sk] of [['cheap', 0], ['mid', 2], ['big', 5], ['hit', 1, 'attack'], ['spell', 0]]) S.cards.set(id, { id, name: id, type: id === 'spell' ? 'magic' : 'monster', atk: cost * 100, cost, ...(sk ? { type: 'magic', sk: 'attack', frame: 'spire' } : {}) });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [], pending: {} };
  const a = st.players.a, b = st.players.b;
  a.hand = ['cheap', 'mid', 'big', 'hit']; b.hand = ['cheap', 'mid', 'big'];
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }'); js('__pf = []; __sly = [];');
  const run = (fx, extra = {}) => { const c2 = { hit: {}, ...extra }; js('runEffects')(st, 'a', S.cards.get('spell'), [fx], c2, null); return c2; };
  return { ctx, js, S, st, a, b, run };
}
const sorted = L => L.slice().sort();

test('自分の手札を捨てる: えらぶ（CPUは安いもの）・ランダム・すべて、捨てた数を数える', () => {
  let t = setup(); let c = t.run({ kind: 'selfDisc', n: 1 }); assert.deepEqual(t.a.grave, ['cheap']); assert.equal(t.a.hand.length, 3); assert.equal(c.hit.discN, 1);
  t = setup(); c = t.run({ kind: 'selfDiscRand', n: 2 }); assert.equal(t.a.hand.length, 2); assert.equal(t.a.grave.length, 2); assert.equal(c.hit.discN, 2);
  t = setup(); t.run({ kind: 'selfDiscAll' }); assert.deepEqual(t.a.hand, []); assert.deepEqual(sorted(t.a.grave), ['big', 'cheap', 'hit', 'mid']); assert.equal(t.js('__sly').length, 1);
  t = setup(); t.run({ kind: 'selfDisc', n: 2 }); assert.deepEqual(sorted(t.a.grave), ['cheap', 'hit']);
});

test('相手の手札を捨てさせる: ランダム・見てえらぶ（CPUは一番強そうなもの）', () => {
  let t = setup(); t.run({ kind: 'discard', n: 2 }); assert.equal(t.b.hand.length, 1); assert.equal(t.b.grave.length, 2); assert.ok(t.js('__sly')[0].startsWith('b:'));
  t = setup(); t.run({ kind: 'discardPeek', n: 1 }); assert.deepEqual(t.b.grave, ['big']); assert.deepEqual(sorted(t.b.hand), ['cheap', 'mid']);
  t = setup(); t.run({ kind: 'discard', n: 5 }); assert.equal(t.b.hand.length, 0);
});

test('手札を廃棄: えらぶ・ランダム・すべて・アタック以外、廃棄した数と「廃棄されるたび」', () => {
  let t = setup(); t.run({ kind: 'exhaustHand', n: 1 }); assert.deepEqual(t.a.exile, ['cheap']); assert.equal(t.a.grave.length, 0); assert.deepEqual([...t.js('__pf')], ['a:exhaust']);
  t = setup(); let c = t.run({ kind: 'exhaustRand', n: 2 }); assert.equal(t.a.exile.length, 2); assert.equal(t.a.hand.length, 2);
  t = setup(); t.run({ kind: 'exhaustAll' }); assert.equal(t.a.exile.length, 4); assert.deepEqual(t.a.hand, []);
  t = setup(); t.a.hand = ['spell', 'hit', 'cheap', 'spell']; t.run({ kind: 'exhaustNonAtk' }); assert.deepEqual(t.a.hand, ['hit', 'cheap']); assert.deepEqual(t.a.exile, ['spell', 'spell']);
});

test('新しい形 handOut: 山札に戻す（上・下・シャッフル）・相手の手札を廃棄', () => {
  let t = setup(); t.a.deck = ['x', 'y']; t.run({ kind: 'handOut', side: 'me', to: 'one', n: 1, how: 'deck', pos: 'top' }); assert.deepEqual(t.a.deck, ['cheap', 'x', 'y']); assert.equal(t.a.hand.length, 3);
  t = setup(); t.a.deck = ['x']; t.run({ kind: 'handOut', side: 'me', to: 'all', how: 'deck', pos: 'bottom' }); assert.deepEqual(t.a.deck, ['x', 'cheap', 'mid', 'big', 'hit']); assert.deepEqual(t.a.hand, []);
  t = setup(); t.b.deck = ['x']; t.run({ kind: 'handOut', to: 'random', n: 2, how: 'deck' }); assert.equal(t.b.hand.length, 1); assert.equal(t.b.deck.length, 3);
  t = setup(); t.run({ kind: 'handOut', to: 'one', n: 1, how: 'exhaust' }); assert.deepEqual(t.b.exile, ['big']); assert.deepEqual([...t.js('__pf')], ['b:exhaust']);
  t = setup(); t.run({ kind: 'handOut', side: 'me', to: 'one', n: 2 }); assert.deepEqual(sorted(t.a.grave), ['cheap', 'hit']);
  t = setup(); t.a.hand = ['spell', 'hit', 'cheap']; t.run({ kind: 'handOut', side: 'me', to: 'random', n: 1, only: 'nonAtk' }); assert.deepEqual(t.a.grave, ['spell']);
});

test('handOut: 旧効果からの変換・保存・文', () => {
  const t = setup(), norm = t.js('fxNorm'), clean = t.js('cleanEff'), txt = t.js('handOutText');
  assert.deepEqual({ ...norm({ kind: 'exhaustNonAtk' }) }, { kind: 'handOut', to: 'all', how: 'exhaust', side: 'me', only: 'nonAtk' });
  assert.deepEqual({ ...norm({ kind: 'discardPeek', n: 1 }) }, { kind: 'handOut', n: 1, to: 'one', how: 'grave' });
  const c = clean({ kind: 'handOut', side: 'me', to: 'random', n: 2, how: 'deck', pos: 'top', only: 'nonAtk' });
  assert.equal(c.how, 'deck'); assert.equal(c.pos, 'top'); assert.equal(c.only, 'nonAtk'); assert.equal(c.side, 'me'); assert.equal(c.to, 'random'); assert.equal(c.n, 2);
  assert.equal(txt({ to: 'random', n: 2 }), '相手の手札をランダムに2枚捨てさせる');
  assert.equal(txt({ to: 'one', n: 1 }), '相手の手札を見て、その中から1枚えらんで捨てさせる');
  assert.equal(txt({ side: 'me', to: 'all', how: 'exhaust', only: 'nonAtk' }), '自分の手札のアタック以外をすべて廃棄する');
  assert.equal(txt({ side: 'me', to: 'one', n: 2, how: 'deck', pos: 'bottom' }), '自分の手札を2枚えらんで山札の一番下に置く');
  assert.equal(t.js('useTargets')(t.st, 'a', { kind: 'handOut', to: 'one' }).length, 3);
  assert.equal(t.js('useTargets')(t.st, 'a', { kind: 'handOut', to: 'all' }), null);
});
