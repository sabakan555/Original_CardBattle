import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// 行動しばり（攻撃・発動・ドロー）・LP（回復・失う）・墓地と山札（戻す・送る・除外・うばう）
// 古い効果で作られたカードが今までどおりに動くことを確かめる
function setup(turn = 'a'){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};__pf=[];persistFire=(st,s,k,x,then)=>{__pf.push(s+':'+k);then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=()=>{};`);
  const S = js('S');
  for (const [id, atk] of [['src', 1000], ['x', 100], ['y', 200], ['z', 300]]) S.cards.set(id, { id, name: id, type: 'monster', atk });
  S.cards.set('spell', { id: 'spell', name: 'spell', type: 'magic' });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn, turnNo: 5, log: [], ev: [], pending: {} };
  const a = st.players.a, b = st.players.b;
  a.mz[0] = { c: 'src', u: 1, eqs: [], born: 0 }; st.un = 10;
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const run = (fx, card = 'spell') => js('runEffects')(st, 'a', S.cards.get(card), [fx], { hit: {}, ...(card === 'src' ? { zone: 0, mon: { s: 'a', i: 0, u: 1 } } : {}) }, null);
  return { ctx, js, S, st, a, b, run, pf: () => [...js('__pf')] };
}
const sorted = L => L.slice().sort();

test('行動しばり: このモンスター・自分（このターン）・相手（相手の次のターンの終わりまで）・ドロー', () => {
  let t = setup(); t.run({ kind: 'thisNoAtk' }, 'src'); assert.equal(t.a.mz[0].noAtkTurn, 5);
  t = setup('b'); t.run({ kind: 'thisNoAtk' }, 'src'); assert.equal(t.a.mz[0].noAtkTurn, 6);
  t = setup(); t.run({ kind: 'selfNoAtk' }); assert.equal(t.a.noAtkUntil, 5);
  t = setup(); t.run({ kind: 'oppNoAtk' }); assert.equal(t.b.noAtkUntil, 6); assert.ok(!t.a.noAtkUntil);
  t = setup('b'); t.run({ kind: 'oppNoUse' }); assert.equal(t.b.noUseUntil, 5);
  t = setup(); t.run({ kind: 'noDraw' }); assert.equal(t.a.noDraw, true); t.a.deck = ['x']; t.js('drawN')(t.st, 'a', 1, 'test'); assert.deepEqual(t.a.hand, []);
});

test('LP: 回復・相手を回復・自分が失う（「LPを失うたび」）', () => {
  let t = setup(); t.run({ kind: 'heal', n: 300 }); assert.equal(t.a.lp, 1300);
  t = setup(); t.run({ kind: 'oppHeal', n: 200 }); assert.equal(t.b.lp, 1200);
  t = setup(); t.a.block = 500; t.run({ kind: 'loseLp', n: 100 }); assert.equal(t.a.lp, 900); assert.equal(t.a.block, 500); assert.ok(t.pf().includes('a:myLoseLp'));
});

test('墓地と山札: 墓地を山札に戻す（自分・相手・お互い）・山札の上を墓地へ・除外・うばう', () => {
  let t = setup(); t.a.grave = ['x', 'y']; t.a.deck = ['z']; t.run({ kind: 'graveShuf' }); assert.deepEqual(t.a.grave, []); assert.deepEqual(sorted(t.a.deck), ['x', 'y', 'z']);
  t = setup(); t.b.grave = ['x']; t.a.grave = ['y']; t.run({ kind: 'graveShufOpp' }); assert.deepEqual(t.b.deck, ['x']); assert.deepEqual(t.a.grave, ['y']);
  t = setup(); t.b.grave = ['x']; t.a.grave = ['y']; t.run({ kind: 'graveShufBoth' }); assert.deepEqual(t.b.deck, ['x']); assert.deepEqual(t.a.deck, ['y']);
  t = setup(); t.a.deck = ['x', 'y', 'z']; t.run({ kind: 'mill', n: 2 }); assert.deepEqual(t.a.grave, ['x', 'y']); assert.deepEqual(t.a.deck, ['z']);
  t = setup(); t.a.deck = ['x', 'y']; t.b.deck = ['z']; t.run({ kind: 'millBoth', n: 1 }); assert.deepEqual(t.a.grave, ['x']); assert.deepEqual(t.b.grave, ['z']);
  t = setup(); t.b.grave = ['x', 'z', 'y']; t.run({ kind: 'banishGrave', n: 1 }); assert.deepEqual(t.b.exile, ['z']); assert.deepEqual(t.b.grave, ['x', 'y']);
  t = setup(); t.b.grave = ['x', 'y']; t.run({ kind: 'banishGraveAll' }); assert.deepEqual(t.b.exile, ['x', 'y']); assert.deepEqual(t.b.grave, []);
  t = setup(); t.b.grave = ['x', 'y', 'z']; t.run({ kind: 'stealGrave', n: 2 }); assert.deepEqual(t.a.grave, ['z', 'y']); assert.deepEqual(t.b.grave, ['x']);
});

test('新しい形: 相手のドローを止める・自分の発動を止める・相手のLPを失わせる・お互い回復', () => {
  let t = setup(); t.run({ kind: 'lock', what: 'draw' }); assert.equal(t.b.noDraw, true); assert.ok(!t.a.noDraw);
  t = setup(); t.run({ kind: 'lock', what: 'use', who: 'me' }); assert.equal(t.a.noUseUntil, 5);
  t = setup(); t.b.block = 300; t.run({ kind: 'lp', who: 'op', op: 'lose', n: 200 }); assert.equal(t.b.lp, 800); assert.equal(t.b.block, 300); assert.equal(t.b.lostNow, 1);
  t = setup(); t.run({ kind: 'lp', who: 'both', n: 100 }); assert.equal(t.a.lp, 1100); assert.equal(t.b.lp, 1100);
});

test('新しい形 deckGrave: 相手の山札を削る・自分の墓地をえらんで除外・お互いの墓地をすべて除外', () => {
  let t = setup(); t.b.deck = ['x', 'y']; t.run({ kind: 'deckGrave', act: 'mill', who: 'op', n: 1 }); assert.deepEqual(t.b.grave, ['x']);
  t = setup(); t.a.grave = ['x', 'z']; t.run({ kind: 'deckGrave', act: 'banish', n: 1 }); assert.deepEqual(t.a.exile, ['z']);
  t = setup(); t.a.grave = ['x']; t.b.grave = ['y']; t.run({ kind: 'deckGrave', act: 'banish', pick: 'all', who: 'both' }); assert.deepEqual(t.a.exile, ['x']); assert.deepEqual(t.b.exile, ['y']);
  t = setup(); t.b.grave = ['x', 'y', 'z']; t.run({ kind: 'deckGrave', act: 'banish', who: 'op', n: 2 }); assert.deepEqual(sorted(t.b.exile), ['y', 'z']);
});

test('lock・lp・deckGrave: 旧効果からの変換・保存・文', () => {
  const t = setup(), norm = f => ({ ...t.js('fxNorm')(f) }), clean = f => ({ ...t.js('cleanEff')(f) });
  assert.deepEqual(norm({ kind: 'oppNoUse' }), { kind: 'lock', what: 'use' });
  assert.deepEqual(norm({ kind: 'thisNoAtk' }), { kind: 'lock', what: 'atk', who: 'this' });
  assert.deepEqual(norm({ kind: 'loseLp', n: 100 }), { kind: 'lp', n: 100, op: 'lose' });
  assert.deepEqual(norm({ kind: 'banishGraveAll' }), { kind: 'deckGrave', act: 'banish', pick: 'all', who: 'op' });
  assert.deepEqual(norm({ kind: 'stealGrave', n: 2 }), { kind: 'deckGrave', n: 2, act: 'steal', who: 'op' });
  const l = clean({ kind: 'lock', what: 'draw', who: 'me' }); assert.equal(l.what, 'draw'); assert.equal(l.who, 'me');
  const p = clean({ kind: 'lp', who: 'both', op: 'lose', n: 50 }); assert.equal(p.who, 'both'); assert.equal(p.op, 'lose');
  const d = clean({ kind: 'deckGrave', act: 'banish', pick: 'all', who: 'both' }); assert.equal(d.act, 'banish'); assert.equal(d.pick, 'all'); assert.equal(d.who, 'both');
  assert.equal(t.js('lockText')({ what: 'draw' }), '相手の次のターンの終わりまで、相手はこれ以上カードを引けない');
  assert.equal(t.js('lpText')({ who: 'op', op: 'lose', n: 200 }), '相手のLPを200失う（ブロックでは防げない）');
  assert.equal(t.js('deckGraveText')({ act: 'mill', who: 'both', n: 3 }), 'お互いの山札の上から3枚を墓地に送る');
});
