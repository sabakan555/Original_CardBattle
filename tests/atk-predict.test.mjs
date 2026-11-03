import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const src = fs.readFileSync(new URL('../src/js/08c-play-assist.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function atkPredict('), src.indexOf('const atkPvHTML'));

// 盤面: a のモンスター（mz[0]）が b を攻撃する。abs は能力のキー → 数
function predict({ a = 300, d = 200, aAbs = {}, dAbs = {}, to = 0, dLp = 1000, shieldOn = false, shields = [], aStr = 0, set = false }){
  const pa = { mz: [{ atk: a, abs: aAbs }], str: aStr, sz: [] };
  const pb = { mz: [{ atk: d, abs: dAbs }], lp: dLp, shieldOn, shields, sz: set ? [{ c: 'x', face: false }] : [] };
  const ctx = {
    P: (st, s) => s === 'a' ? pa : pb, O: s => s === 'a' ? 'b' : 'a',
    atkOf: m => m.atk, hasAb: (st, s, i, k) => !!P2(s).mz[i].abs[k], abN: (st, s, i, k) => +P2(s).mz[i].abs[k] || 0,
    battleHit: (st, s, i, x) => x === Infinity || !(x > 0) ? x : x + (P2(s).str || 0), noLoseBy: () => null,
    breakCount: () => 2, fmtN: n => n === Infinity ? '∞' : String(n)
  };
  const P2 = s => s === 'a' ? pa : pb;
  vm.createContext(ctx); vm.runInContext(fn + ';this.f=atkPredict;', ctx);
  return JSON.parse(JSON.stringify(ctx.f({}, 'a', 0, to)));
}
test('ATKくらべ: 撃破・相打ち・返り討ち（ダメージは差）', () => {
  assert.deepEqual([predict({ a: 300, d: 200 }).t, predict({ a: 300, d: 200 }).s], ['撃破', '相手に−100']);
  assert.equal(predict({ a: 200, d: 200 }).t, '相打ち');
  assert.deepEqual([predict({ a: 200, d: 700 }).t, predict({ a: 200, d: 700 }).s], ['返り討ち', '自分に−500']);
});
test('能力: 貫通・鉄壁・戦闘で破壊されない・必殺・先制攻撃・筋力', () => {
  assert.equal(predict({ a: 300, d: 200, aAbs: { pierce: 1 } }).s, '相手に−300');
  assert.equal(predict({ a: 300, d: 200, dAbs: { dmgCut: 60 } }).s, '相手に−40');
  assert.equal(predict({ a: 300, d: 200, dAbs: { guard: 1 } }).t, 'どちらも残る');
  assert.equal(predict({ a: 100, d: 500, aAbs: { bane: 1 } }).t, '相打ち');
  assert.equal(predict({ a: 200, d: 200, aAbs: { first: 1 } }).t, '撃破');
  assert.equal(predict({ a: 300, d: 200, aStr: 50 }).s, '相手に−150');
});
test('直接攻撃: ダメージ・とどめ・シールド', () => {
  assert.deepEqual([predict({ to: 'direct', a: 300 }).k, predict({ to: 'direct', a: 300 }).t], ['dmg', '−300']);
  assert.equal(predict({ to: 'direct', a: 300, dLp: 300 }).t, 'とどめ！');
  assert.equal(predict({ to: 'direct', shieldOn: true, shields: [1, 2, 3] }).t, 'シールド2枚ブレイク');
  assert.equal(predict({ to: 'direct', shieldOn: true, shields: [] }).t, 'とどめ！');
});
test('相手に伏せカードがあれば知らせる', () => {
  assert.equal(predict({ set: true }).traps, true);
  assert.equal(predict({}).traps, false);
});
