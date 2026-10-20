import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// シールド対応の新しい効果・能力（EXライフ・シールド送り・焼却・セイバー・封鎖・トリガー封じ・タップなど）
function setup({ aShield = true, bShield = true } = {}){
  const ctx = {};
  vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>then&&then(st);hasAltar=()=>false;ctrTrigs=()=>[];`);
  js(read('js/02b-counters.js').split('\n').filter(l => /^const RB_SIDE =/.test(l)).join('\n'));
  const S = js('S');
  for (const [id, atk] of [['src', 1000], ['a1', 500], ['b1', 600], ['b2', 900], ['s1', 0], ['s2', 0], ['s3', 0], ['d1', 0], ['d2', 0]]) S.cards.set(id, { id, name: id, type: 'monster', atk });
  S.cards.set('ex', { id: 'ex', name: 'ex', type: 'monster', atk: 400, abs: [{ k: 'exLife' }] });
  S.cards.set('saver', { id: 'saver', name: 'saver', type: 'monster', atk: 100, abs: [{ k: 'saver' }] });
  S.cards.set('trig', { id: 'trig', name: 'trig', type: 'magic', strig: true });
  S.cards.set('spell', { id: 'spell', name: 'spell', type: 'magic' });
  const player = on => ({ name: 'p', deck: ['d1', 'd2'], hand: [], grave: [], exile: [], mz: [null, null, null, null, null], sz: [null, null, null], lp: 1000, ...(on ? { shieldOn: true, shields: ['s1', 's2', 's3'] } : {}) });
  const st = { players: { a: player(aShield), b: player(bShield) }, turn: 'a', turnNo: 3, log: [], ev: [], pending: null };
  let u = 1; const mon = c => ({ c, u: u++, eqs: [], born: 0 });
  const a = st.players.a, b = st.players.b;
  a.mz[0] = mon('src'); b.mz[0] = mon('b1'); b.mz[1] = mon('b2');
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const spell = fx => js('runEffects')(st, 'a', S.cards.get('spell'), [fx], { hit: {} }, null);
  return { ctx, js, S, st, a, b, mon, spell };
}

test('シールド回収・焼却はブレイクではない（S・トリガーは使わない）', () => {
  let t = setup(); t.a.shields = ['s1', 'trig']; t.spell({ kind: 'shieldToHand', n: 1 });
  assert.deepEqual(t.a.shields, ['s1']); assert.deepEqual(t.a.hand, ['trig']); assert.equal(t.st.strigQ, undefined); assert.equal(t.st.brkQ, undefined);
  t = setup(); t.spell({ kind: 'shieldBurn', n: 2 }); assert.deepEqual(t.b.shields, ['s1']); assert.deepEqual(t.b.grave, ['s2', 's3']);
  t = setup({ bShield: false }); t.spell({ kind: 'shieldBurn', n: 2 }); assert.deepEqual(t.b.grave, []);
});

test('シールド交換: 手札1枚とシールド1枚を入れかえる（枚数は変わらない）', () => {
  const t = setup(); t.a.hand = ['a1']; t.spell({ kind: 'shieldSwap' });
  assert.equal(t.a.shields.length, 3); assert.ok(t.a.shields.includes('a1')); assert.equal(t.a.hand.length, 1); assert.ok(['s1', 's2', 's3'].includes(t.a.hand[0]));
});

test('シールド送り: シールドデッキならシールドへ、そうでなければ墓地へ（前の形も「除去する」も）', () => {
  let t = setup(); t.spell({ kind: 'shieldSend' }); assert.deepEqual(t.b.shields, ['s1', 's2', 's3', 'b2']); assert.equal(t.b.mz[1], null);
  t = setup(); t.spell({ kind: 'remove', zone: 'mon', how: 'shield' }); assert.deepEqual(t.b.shields, ['s1', 's2', 's3', 'b2']);
  t = setup({ bShield: false }); t.spell({ kind: 'shieldSend' }); assert.deepEqual(t.b.grave, ['b2']); assert.equal(t.b.mz[1], null);
  assert.match(t.js('removeText')({ zone: 'mon', how: 'shield' }), /シールド》に置く/);
});

test('EXライフ: 出たときシールドを1枚ふやし、場を離れるときにかわりにそれを墓地へ', () => {
  const t = setup(); t.a.mz[1] = t.mon('ex'); t.js('exLifeOn')(t.st, 'a', 1);
  assert.deepEqual(t.a.shields, ['s1', 's2', 's3', 'd1']); assert.deepEqual(t.a.deck, ['d2']);
  t.js('exLifeOn')(t.st, 'a', 1); assert.equal(t.a.shields.length, 4);
  assert.equal(t.js('destroyMonster')(t.st, 'a', 1, 'test'), false);
  assert.ok(t.a.mz[1]); assert.deepEqual(t.a.shields, ['s1', 's2', 's3']); assert.deepEqual(t.a.grave, ['d1']);
  assert.equal(t.js('destroyMonster')(t.st, 'a', 1, 'test'), true); assert.equal(t.a.mz[1], null);
  // EXライフのシールドが先にブレイクされていたら、ふつうに場を離れる
  const u = setup(); u.a.mz[1] = u.mon('ex'); u.js('exLifeOn')(u.st, 'a', 1); u.js('breakShields')(u.st, 'a', 1, 'x');
  assert.ok(u.js('moveMonOut')(u.st, 'a', 1, 'hand')); assert.deepEqual(u.a.hand, ['d1', 'ex']);
  // シールドデッキでないときはなにもしない
  const v = setup({ aShield: false }); v.a.mz[1] = v.mon('ex'); v.js('exLifeOn')(v.st, 'a', 1); assert.equal(v.a.shields, undefined); assert.deepEqual(v.a.deck, ['d1', 'd2']);
});

test('ブレイク: 封鎖で1枚まで → ブロック300で1枚防ぐ → セイバーが身代わり', () => {
  let t = setup(); t.js('breakShields')(t.st, 'b', 3, 'x'); assert.equal(t.b.shields.length, 0); assert.deepEqual(JSON.parse(JSON.stringify(t.st.brkQ)), [{ s: 'b', by: null }]);
  t = setup(); t.b.brkCapUntil = 3; t.js('breakShields')(t.st, 'b', 3, 'x'); assert.equal(t.b.shields.length, 2);
  t = setup(); t.b.block = 350; t.js('breakShields')(t.st, 'b', 3, 'x'); assert.equal(t.b.shields.length, 2); assert.equal(t.b.block, 0);
  t = setup(); t.b.mz[2] = t.mon('saver'); t.js('breakShields')(t.st, 'b', 2, 'x'); assert.equal(t.b.shields.length, 2); assert.equal(t.b.mz[2], null); assert.ok(t.b.grave.includes('saver'));
});

test('焼却ブレイクは墓地へ（トリガーなし）、トリガー封じでS・トリガーは手札のまま', () => {
  let t = setup(); t.b.shields = ['trig']; t.js('breakShields')(t.st, 'b', 1, 'x', { burn: true });
  assert.deepEqual(t.b.grave, ['trig']); assert.equal(t.st.strigQ, undefined); assert.equal(t.st.brkQ, undefined);
  t = setup(); t.b.shields = ['trig']; t.spell({ kind: 'strigLock' }); t.js('breakShields')(t.st, 'b', 1, 'x');
  assert.deepEqual(t.b.hand, ['trig']); assert.equal(t.st.strigQ, undefined);
  t = setup(); t.b.shields = ['trig']; t.js('breakShields')(t.st, 'b', 1, 'x'); assert.equal(t.st.strigQ.length, 1);
});

test('ブレイクしたとき・ブレイクされたときの効果が出る', () => {
  const t = setup();
  t.S.cards.set('hitter', { id: 'hitter', name: 'hitter', type: 'monster', atk: 500, blocks: [{ trig: 'brk', then: [{ kind: 'draw', n: 1 }] }] });
  t.S.cards.set('guard', { id: 'guard', name: 'guard', type: 'monster', atk: 500, blocks: [{ trig: 'shieldBrk', then: [{ kind: 'draw', n: 1 }] }] });
  t.a.mz[1] = t.mon('hitter'); t.b.mz[2] = t.mon('guard'); t.b.deck = ['d1', 'd2'];
  t.js('breakShields')(t.st, 'b', 1, 'x', { by: { s: 'a', i: 1, u: t.a.mz[1].u } });
  t.js('shieldStep')(t.st);
  assert.deepEqual(t.a.hand, ['d1']); assert.deepEqual(t.b.hand, ['s3', 'd1']); assert.equal(t.st.brkQ, undefined);
});

test('タップ・アンタップ、警戒・ブロックされない・ブレイクできない', () => {
  const t = setup(); t.spell({ kind: 'tapAll' }); assert.ok(t.b.mz[0].tap && t.b.mz[1].tap);
  t.a.mz[0].tap = true; t.spell({ kind: 'untapAll' }); assert.ok(!t.a.mz[0].tap);
  t.S.cards.set('ub', { id: 'ub', name: 'ub', type: 'monster', atk: 300, abs: [{ k: 'unblock' }] });
  t.S.cards.set('blk', { id: 'blk', name: 'blk', type: 'monster', atk: 300, abs: [{ k: 'blocker' }] });
  t.a.mz[1] = t.mon('ub'); t.b.mz[2] = t.mon('blk');
  t.st.pending = { type: 'attack', by: 'a', from: 1, to: 'direct' }; assert.equal(t.js('blockOpts')(t.st, 'b').length, 0);
  t.st.pending = { type: 'attack', by: 'a', from: 0, to: 'direct' }; assert.equal(t.js('blockOpts')(t.st, 'b').length, 1);
  assert.ok(t.js('ABS').vigil && t.js('ABS').noBreak && t.js('ABS').burnBrk && t.js('KW_DESC')['EXライフ']);
});

test('ブレイク封鎖は次の相手のターンの終わりまで', () => {
  const t = setup(); t.spell({ kind: 'brkLock' }); assert.equal(t.a.brkCapUntil, 4);
  t.st.turn = 'b'; t.spell({ kind: 'brkLock' }); assert.equal(t.a.brkCapUntil, 5);
});

test('S・トリガーで出たモンスターは、持ち主の次のターンも召喚酔い（速攻ならしない）', () => {
  const t = setup(); t.b.mz[2] = { ...t.mon('b1'), born: 3, strigSick: 4 };
  t.st.turnNo = 4; assert.equal(t.js('sick1')(t.st, 'b', 2), true);
  t.st.turnNo = 6; assert.equal(t.js('sick1')(t.st, 'b', 2), false);
  t.S.cards.set('fast', { id: 'fast', name: 'fast', type: 'monster', atk: 1, abs: [{ k: 'haste' }] });
  t.st.turnNo = 4; t.b.mz[3] = { ...t.mon('fast'), born: 3, strigSick: 4 }; assert.equal(t.js('sick1')(t.st, 'b', 3), false);
});

test('もし・ふえる: シールドの枚数', () => {
  const t = setup(); t.b.shields = ['s1'];
  assert.equal(t.js('COND_DEFS').myShield.val(t.st, 'a'), 3); assert.equal(t.js('COND_DEFS').oppShield.val(t.st, 'a'), 1);
  assert.equal(t.js('PER_DEFS').myShield.val(t.st, 'a'), 3);
});
