import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// ターンを飛ばす効果（skip）: このターンの残り・ドローステップ・メインステップ・バトルステップ
function setup(){
  const ctx = {};
  vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>then&&then(st);refill=()=>{};altarTurn=()=>{};ctrTick=()=>{};innateTop=d=>d;`);
  const S = js('S');
  for (const id of ['m1', 'm2', 'd1', 'd2', 'd3', 'd4']) S.cards.set(id, { id, name: id, type: 'monster', atk: 500 });
  S.cards.set('spell', { id: 'spell', name: '時のいたずら', type: 'magic' });
  const player = name => ({ name, deck: ['d1', 'd2', 'd3', 'd4'], hand: [], grave: [], exile: [], mz: [null, null, null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player('A'), b: player('B') }, turn: 'a', turnNo: 3, log: [], ev: [] };
  let u = 1; const mon = c => ({ c, u: u++, eqs: [], born: 0, age: 2 });
  st.players.a.mz[0] = mon('m1'); st.players.b.mz[0] = mon('m2');
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const spell = (s, ...effs) => js('runEffects')(st, s, S.cards.get('spell'), effs, { hit: {} }, null);
  const pass = s => js('passTurn')(st, s);
  return { js, st, a: st.players.a, b: st.players.b, spell, pass };
}

test('効果の文と、前の「このターンの残りを飛ばす」がそのまま読めること', () => {
  const { js } = setup();
  const txt = f => js('skipText')(f);
  assert.equal(txt({ kind: 'skipTurn' }), 'このターンの残りを飛ばす');
  assert.equal(js('fxNorm')({ kind: 'skipTurn' }).kind, 'skip');
  assert.equal(js('fxNorm')({ kind: 'skipTurn' }).what, 'rest');
  assert.match(txt({ kind: 'skip', what: 'draw' }), /^相手の次のターンのドローステップを飛ばす/);
  assert.match(txt({ kind: 'skip', what: 'main', who: 'me' }), /^自分の次のターンのメインステップを飛ばす/);
  assert.match(txt({ kind: 'skip', what: 'battle' }), /^相手の次のターンのバトルステップを飛ばす/);
  // このターンの残りは「だれの」を持たない
  assert.equal(js('fxNorm')({ kind: 'skip', what: 'rest', who: 'me' }).who, undefined);
});

test('ドローステップを飛ばす: 相手の次のターンだけ引かない', () => {
  const t = setup();
  t.spell('a', { kind: 'skip', what: 'draw' });
  assert.ok(t.b.skipNext.draw);
  t.pass('a');
  assert.equal(t.st.turn, 'b');
  assert.equal(t.b.hand.length, 0, '引かない');
  assert.equal(t.b.deck.length, 4);
  assert.equal(t.b.skipNext, undefined);
  t.pass('b'); t.pass('a');
  assert.equal(t.b.hand.length, 1, 'その次のターンはふつうに引く');
});

test('ドローステップを飛ばすなら、山札が0でも負けない', () => {
  const t = setup();
  t.b.deck = [];
  t.spell('a', { kind: 'skip', what: 'draw' });
  t.pass('a');
  assert.equal(t.st.winner, undefined);
});

test('バトルステップを飛ばす: そのターンは攻撃できない・次のターンはできる', () => {
  const t = setup();
  t.spell('a', { kind: 'skip', what: 'battle' });
  t.pass('a');
  assert.equal(t.js('canAttack')(t.st, 'b', 0), false);
  assert.equal(t.js('canSummonNow')(t.st, 'b'), true, 'メインはできる');
  assert.equal(t.b.hand.length, 1, 'ドローはする');
  t.pass('b');
  assert.equal(t.js('canAttack')(t.st, 'a', 0), true, '使った側は攻撃できる');
  t.pass('a');
  assert.equal(t.js('canAttack')(t.st, 'b', 0), true);
});

test('メインステップを飛ばす: 召喚・セット・手札の魔法が使えない、攻撃はできる', () => {
  const t = setup();
  t.spell('a', { kind: 'skip', what: 'main' });
  t.pass('a');
  const { js, st } = t;
  assert.equal(js('mainSkipped')(st, 'b'), true);
  assert.equal(js('canSummonNow')(st, 'b'), false);
  t.b.hand.push('spell');
  assert.equal(js('setCard')(st, 'b', t.b.hand.length - 1), false);
  assert.equal(js('activate')(st, 'b', 'hand', t.b.hand.length - 1), false);
  assert.equal(js('canAttack')(st, 'b', 0), true);
  t.pass('b'); t.pass('a');
  assert.equal(js('mainSkipped')(st, 'b'), false);
  assert.equal(js('canSummonNow')(st, 'b'), true);
});

test('自分の次のターンを飛ばす（デメリット）: 自分のターン中に使えば、次の自分のターンにかかる', () => {
  const t = setup();
  t.spell('a', { kind: 'skip', what: 'battle', who: 'me' });
  assert.equal(t.js('canAttack')(t.st, 'a', 0), true, 'いまのターンはまだ攻撃できる');
  t.pass('a');
  assert.equal(t.js('canAttack')(t.st, 'b', 0), true);
  t.pass('b');
  assert.equal(t.js('canAttack')(t.st, 'a', 0), false);
});

test('前のカード（skipTurn）は、いままでどおりこのターンの残りを飛ばす', () => {
  const t = setup();
  t.spell('a', { kind: 'skipTurn' });
  assert.deepEqual({ ...t.st.endTurnRequested }, { s: 'a', no: 3 });
});
