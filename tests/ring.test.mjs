import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// 場からどかす効果（破壊・手札に戻す・除外・魔法罠やフィールドの破壊・場のカードを除去）
// 古い効果で作られたカードが、今までどおりに動くことを確かめる
function setup(){
  const ctx = {};
  vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>then&&then(st);hasAltar=()=>false;ctrTrigs=()=>[];`);
  js(read('js/02b-counters.js').split('\n').filter(l => /^const RB_SIDE =/.test(l)).join('\n'));
  const S = js('S');
  for (const [id, atk] of [['src', 1000], ['a1', 500], ['a2', 800], ['b1', 600], ['b2', 900], ['b3', 300]]) S.cards.set(id, { id, name: id, type: 'monster', atk });
  S.cards.set('immune', { id: 'immune', name: 'immune', type: 'monster', atk: 700, abs: [{ k: 'unaffected' }] });
  S.cards.set('spell', { id: 'spell', name: 'spell', type: 'magic' });
  S.cards.set('trap', { id: 'trap', name: 'trap', type: 'trap' });
  S.cards.set('fld', { id: 'fld', name: 'fld', type: 'magic', field: true });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null, null, null], sz: [null, null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [], pending: {} };
  let u = 1; const mon = c => ({ c, u: u++, eqs: [], born: 0 });
  const a = st.players.a, b = st.players.b;
  a.mz[0] = mon('src'); a.mz[1] = mon('a1'); a.mz[2] = mon('a2');
  b.mz[0] = mon('b1'); b.mz[1] = mon('b2'); b.mz[2] = mon('b3');
  b.sz[0] = { c: 'spell', face: true }; b.sz[1] = { c: 'trap', face: false };
  a.sz[0] = { c: 'spell', face: true };
  st.field = { c: 'fld', o: 'b' };
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const names = p => p.mz.filter(Boolean).map(m => m.c);
  const spell = (fx, extra = {}) => js('runEffects')(st, 'a', S.cards.get('spell'), Array.isArray(fx) ? fx : [fx], { hit: {}, ...extra }, null);
  const fromSrc = fx => js('runEffects')(st, 'a', S.cards.get('src'), [fx], { zone: 0, mon: { s: 'a', i: 0, u: a.mz[0].u }, hit: {} }, null);
  return { ctx, js, S, st, a, b, mon, names, spell, fromSrc };
}


// 破壊輪（遊戯王）: 相手のモンスター1体を破壊し、そのATKぶんのダメージをお互いが受ける
test('破壊輪: 破壊したモンスターのATKぶんをお互いが受ける', () => {
  const t = setup(); t.a.lp = 2000; t.b.lp = 2000;
  t.spell([{ kind: 'destroy' }, { kind: 'dmgRmAtkBoth' }]);
  assert.deepEqual(t.names(t.b), ['b1', 'b3']);
  assert.equal(t.a.lp, 1100); assert.equal(t.b.lp, 1100);
});
test('除去したATKぶん: 相手だけ・自分だけ・手札に戻しても数える', () => {
  let t = setup(); t.a.lp = 2000; t.b.lp = 2000; t.spell([{ kind: 'destroy' }, { kind: 'dmgRmAtk' }]);
  assert.equal(t.a.lp, 2000); assert.equal(t.b.lp, 1100);
  t = setup(); t.a.lp = 2000; t.b.lp = 2000; t.spell([{ kind: 'destroy' }, { kind: 'dmgRmAtkMe' }]);
  assert.equal(t.a.lp, 1100); assert.equal(t.b.lp, 2000);
  t = setup(); t.a.lp = 2000; t.b.lp = 2000; t.spell([{ kind: 'remove', zone: 'mon', how: 'hand' }, { kind: 'dmgRmAtkBoth' }]);
  assert.equal(t.a.lp, 1100); assert.equal(t.b.lp, 1100);
});
test('除去したATKぶん: 全体破壊なら合計・どかせなければダメージなし', () => {
  let t = setup(); t.a.lp = 5000; t.b.lp = 5000; t.spell([{ kind: 'destroyAll' }, { kind: 'dmgRmAtkBoth' }]);
  assert.equal(t.a.lp, 3200); assert.equal(t.b.lp, 3200);
  t = setup(); t.b.mz = [null, null, null, null, null]; t.a.lp = 2000; t.b.lp = 2000; t.spell([{ kind: 'destroy' }, { kind: 'dmgRmAtkBoth' }]);
  assert.equal(t.a.lp, 2000); assert.equal(t.b.lp, 2000);
});
test('しぼりこみ: ATKが相手のLP以下のモンスターだけ（破壊輪の条件）', () => {
  const t = setup(); t.b.lp = 700;
  t.spell([{ kind: 'destroy', mfK: 'atk', mfOp: 'le', mfBy: 'oppLp', mfN: 0 }, { kind: 'dmgRmAtkBoth' }]);
  assert.deepEqual(t.names(t.b), ['b2', 'b3']); assert.equal(t.b.lp, 100);
  assert.equal(t.js('mfPhrase')({ kind: 'destroy', mfK: 'atk', mfOp: 'le', mfBy: 'oppLp', mfN: 0 }), 'ATKが相手のLP以下の');
  assert.equal(t.js('KINDS').dmgRmAtkBoth.text(), '除去したモンスターのATKぶんのダメージをお互いが受ける');
});
