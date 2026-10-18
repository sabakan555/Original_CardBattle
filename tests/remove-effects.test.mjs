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
  const spell = (fx, extra = {}) => js('runEffects')(st, 'a', S.cards.get('spell'), [fx], { hit: {}, ...extra }, null);
  const fromSrc = fx => js('runEffects')(st, 'a', S.cards.get('src'), [fx], { zone: 0, mon: { s: 'a', i: 0, u: a.mz[0].u }, hit: {} }, null);
  return { ctx, js, S, st, a, b, mon, names, spell, fromSrc };
}

test('破壊: 相手1体（CPUは一番強いもの）・相手全部・自分側へ向ける', () => {
  let t = setup(); t.spell({ kind: 'destroy' }); assert.deepEqual(t.names(t.b), ['b1', 'b3']); assert.deepEqual(t.b.grave, ['b2']);
  t = setup(); t.spell({ kind: 'destroyAll' }); assert.deepEqual(t.names(t.b), []); assert.equal(t.b.grave.length, 3); assert.deepEqual(t.names(t.a), ['src', 'a1', 'a2']);
  t = setup(); t.spell({ kind: 'destroy', to: 'all' }); assert.deepEqual(t.names(t.b), []);
  t = setup(); t.spell({ kind: 'destroy', side: 'me' }); assert.deepEqual(t.names(t.a), ['src', 'a2']); assert.deepEqual(t.a.grave, ['a1']); assert.equal(t.names(t.b).length, 3);
  t = setup(); t.spell({ kind: 'destroyAll', side: 'me' }); assert.deepEqual(t.names(t.a), []); assert.equal(t.names(t.b).length, 3);
});

test('破壊（デメリット）: 自分1体は一番弱いもの・自分全部・このモンスター', () => {
  let t = setup(); t.spell({ kind: 'destroyOwn' }); assert.deepEqual(t.names(t.a), ['src', 'a2']);
  t = setup(); t.spell({ kind: 'destroyOwnAll' }); assert.deepEqual(t.names(t.a), []); assert.equal(t.names(t.b).length, 3);
  t = setup(); t.fromSrc({ kind: 'destroyThis' }); assert.deepEqual(t.names(t.a), ['a1', 'a2']); assert.ok(t.a.grave.includes('src'));
});

test('破壊: しぼりこみと「効果を受けない」は全体から外れる', () => {
  let t = setup(); t.spell({ kind: 'destroyAll', mfK: 'atk', mfOp: 'ge', mfN: 600 }); assert.deepEqual(t.names(t.b), ['b3']);
  t = setup(); t.b.mz[2] = t.mon('immune'); t.spell({ kind: 'destroyAll' }); assert.deepEqual(t.names(t.b), ['immune']);
});

test('手札に戻す・除外', () => {
  let t = setup(); t.spell({ kind: 'bounce' }); assert.deepEqual(t.names(t.b), ['b1', 'b3']); assert.deepEqual(t.b.hand, ['b2']); assert.equal(t.b.grave.length, 0);
  t = setup(); t.spell({ kind: 'bounceAll' }); assert.deepEqual(t.names(t.b), []); assert.deepEqual(t.b.hand.slice().sort(), ['b1', 'b2', 'b3']);
  t = setup(); t.spell({ kind: 'bounce', to: 'all' }); assert.deepEqual(t.names(t.b), []);
  t = setup(); t.spell({ kind: 'banishMon' }); assert.deepEqual(t.names(t.b), ['b1', 'b3']); assert.deepEqual(t.b.exile, ['b2']); assert.equal(t.b.grave.length, 0);
});

test('魔法・罠とフィールドの破壊', () => {
  let t = setup(); t.spell({ kind: 'destroySt' }); assert.equal(t.b.sz.filter(Boolean).length, 1); assert.equal(t.b.grave.length, 1); assert.ok(t.a.sz[0]);
  t = setup(); t.spell({ kind: 'destroyStAll' }); assert.equal(t.b.sz.filter(Boolean).length, 0); assert.deepEqual(t.b.grave.slice().sort(), ['spell', 'trap']); assert.ok(t.a.sz[0]);
  t = setup(); t.spell({ kind: 'destroyStRand', n: 1 }); assert.equal(t.b.sz.filter(Boolean).length, 1);
  t = setup(); t.spell({ kind: 'destroyField' }); assert.equal(t.st.field, null); assert.deepEqual(t.b.grave, ['fld']);
});

test('このカード以外の場のカードをすべて破壊', () => {
  const t = setup(); t.fromSrc({ kind: 'destroy', to: 'others' });
  assert.deepEqual(t.names(t.a), ['src']); assert.deepEqual(t.names(t.b), []); assert.equal(t.b.sz.filter(Boolean).length, 0); assert.equal(t.a.sz.filter(Boolean).length, 0); assert.equal(t.st.field, null);
});

test('場のカードを1枚えらんで除去: CPUは相手の一番強いモンスター、どかし方は3つ', () => {
  let t = setup(); t.spell({ kind: 'removeBoard' }); assert.deepEqual(t.names(t.b), ['b1', 'b3']); assert.deepEqual(t.b.grave, ['b2']);
  t = setup(); t.spell({ kind: 'removeBoard', rm: 'bounce' }); assert.deepEqual(t.b.hand, ['b2']);
  t = setup(); t.spell({ kind: 'removeBoard', rm: 'banish' }); assert.deepEqual(t.b.exile, ['b2']);
  t = setup(); t.js('applyEffect')(t.st, 'a', t.S.cards.get('spell'), 'field', {}, { kind: 'removeBoard', rm: 'bounce' }); assert.equal(t.st.field, null); assert.deepEqual(t.b.hand, ['fld']);
  t = setup(); t.js('applyEffect')(t.st, 'a', t.S.cards.get('spell'), 'b:sz:1', {}, { kind: 'removeBoard', rm: 'banish' }); assert.equal(t.b.sz[1], null); assert.deepEqual(t.b.exile, ['trap']);
  t = setup(); t.js('applyEffect')(t.st, 'a', t.S.cards.get('spell'), 'a:mz:1', {}, { kind: 'removeBoard', rside: 'me' }); assert.deepEqual(t.names(t.a), ['src', 'a2']);
});

test('攻撃してきたモンスターを破壊（罠）', () => {
  const t = setup(); t.js('applyEffect')(t.st, 'a', t.S.cards.get('trap'), undefined, { attack: { by: 'b', from: 1 } }, { kind: 'killAtk' });
  assert.deepEqual(t.names(t.b), ['b1', 'b3']); assert.deepEqual(t.b.grave, ['b2']);
});

test('新しい形 remove: 除外・山札（上・下・シャッフル）・墓地へ送る', () => {
  let t = setup(); t.spell({ kind: 'remove', zone: 'mon', to: 'all', how: 'exile' }); assert.deepEqual(t.names(t.b), []); assert.deepEqual(t.b.exile.slice().sort(), ['b1', 'b2', 'b3']); assert.equal(t.b.grave.length, 0);
  t = setup(); t.b.deck = ['x', 'y']; t.spell({ kind: 'remove', zone: 'mon', how: 'deck', pos: 'top' }); assert.deepEqual(t.b.deck, ['b2', 'x', 'y']);
  t = setup(); t.b.deck = ['x', 'y']; t.spell({ kind: 'remove', zone: 'mon', how: 'deck', pos: 'bottom' }); assert.deepEqual(t.b.deck, ['x', 'y', 'b2']);
  t = setup(); t.b.deck = ['x', 'y']; t.spell({ kind: 'remove', zone: 'mon', how: 'deck' }); assert.deepEqual(t.b.deck.slice().sort(), ['b2', 'x', 'y']);
  t = setup(); t.spell({ kind: 'remove', zone: 'mon', how: 'grave' }); assert.deepEqual(t.b.grave, ['b2']); assert.deepEqual(t.names(t.b), ['b1', 'b3']);
});

test('新しい形 remove: 魔法・罠をランダムに2枚手札へ・お互いの場から1枚・フィールドを除外', () => {
  let t = setup(); t.spell({ kind: 'remove', zone: 'st', to: 'random', tn: 2, how: 'hand' }); assert.equal(t.b.sz.filter(Boolean).length, 0); assert.deepEqual(t.b.hand.slice().sort(), ['spell', 'trap']); assert.ok(t.a.sz[0]);
  t = setup(); t.spell({ kind: 'remove', zone: 'any', side: 'both', how: 'exile' }); assert.deepEqual(t.b.exile, ['b2']);
  t = setup(); t.spell({ kind: 'remove', zone: 'field', how: 'exile' }); assert.equal(t.st.field, null); assert.deepEqual(t.b.exile, ['fld']);
  t = setup(); t.spell({ kind: 'remove', zone: 'st', to: 'all', side: 'me', how: 'deck', pos: 'top' }); assert.equal(t.a.sz.filter(Boolean).length, 0); assert.deepEqual(t.a.deck, ['spell']);
});

test('新しい形 remove: 攻撃してきたモンスターを手札に戻す（攻撃に答える効果）', () => {
  const t = setup(); t.js('applyEffect')(t.st, 'a', t.S.cards.get('trap'), undefined, { attack: { by: 'b', from: 0 } }, { kind: 'remove', to: 'attacker', how: 'hand' });
  assert.deepEqual(t.b.hand, ['b1']); assert.equal(t.js('isAtkReply')({ kind: 'remove', to: 'attacker' }), true); assert.equal(t.js('isAtkReply')({ kind: 'remove' }), false);
});

test('旧効果は remove に直り、保存してもパラメータが残る・文は中身から作られる', () => {
  const { js } = setup(), norm = js('fxNorm'), txt = js('removeText'), clean = js('cleanEff');
  assert.deepEqual({ ...norm({ kind: 'removeBoard', rm: 'banish', rside: 'both' }) }, { kind: 'remove', zone: 'any', to: 'one', how: 'exile', side: 'both' });
  assert.equal(norm({ kind: 'destroyStRand', n: 2 }).tn, 2);
  assert.equal(norm({ kind: 'destroy', to: 'others' }).zone, 'any');
  const c = clean({ kind: 'remove', zone: 'st', to: 'all', side: 'both', how: 'deck', pos: 'bottom' });
  assert.equal(c.zone, 'st'); assert.equal(c.side, 'both'); assert.equal(c.how, 'deck'); assert.equal(c.pos, 'bottom');
  assert.equal(txt({ zone: 'mon', to: 'all', how: 'exile' }), '相手のモンスターすべてを除外する');
  assert.equal(txt({ zone: 'st', to: 'random', tn: 2, how: 'hand' }), 'ランダムな相手の魔法・罠2枚を持ち主の手札に戻す');
  assert.equal(txt({ zone: 'mon', how: 'deck', pos: 'top', side: 'me' }), '自分のモンスター1体を持ち主の山札の一番上に置く');
  assert.equal(txt({ to: 'attacker', how: 'destroy' }), '攻撃してきたモンスターを破壊する');
});
