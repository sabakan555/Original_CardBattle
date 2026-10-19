import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const engine = read('js/07-engine.js');
const shieldSrc = engine.slice(engine.indexOf('function breakCount('), engine.indexOf('// 成長: when'));
const zoneSrc = engine.slice(engine.indexOf('function freeZone('), engine.indexOf('// 場のモンスターを手札・除外に送る'));

function harness({ atk = 0, breaker = 0, attackerShield = false, shields = ['s1', 's2', 's3', 's4', 's5'], strig = [] } = {}){
  const a = { shieldOn: attackerShield, mz: [{ c: 'm' }] }, d = { name: 'D', shieldOn: true, shields: shields.slice(), hand: [] };
  const cast = [];
  const ctx = { P: (st, s) => s === 'a' ? a : d, atkOf: () => atk, abN: () => breaker, log: () => {}, ev: () => {},
    card: id => ({ id, name: id, strig: strig.includes(id), type: 'magic' }), cardType: c => c.type,
    strigCast: (st, s, id) => { cast.push(id); return false; } };
  vm.createContext(ctx); vm.runInContext(shieldSrc + ';this.bc=breakCount;this.br=breakShields;this.step=strigStep;', ctx);
  return { ctx, a, d, cast, st: {} };
}
test('a non-shield attacker breaks one more shield for every 300 ATK', () => {
  assert.equal(harness({ atk: 0 }).ctx.bc({}, 'a', 0), 1);
  assert.equal(harness({ atk: 299 }).ctx.bc({}, 'a', 0), 1);
  assert.equal(harness({ atk: 600 }).ctx.bc({}, 'a', 0), 3);
  assert.ok(harness({ atk: Infinity }).ctx.bc({}, 'a', 0) >= 5);
});
test('shield-deck attackers use breakers only', () => {
  assert.equal(harness({ atk: 900, attackerShield: true }).ctx.bc({}, 'a', 0), 1);
  assert.equal(harness({ atk: 900, attackerShield: true, breaker: 2 }).ctx.bc({}, 'a', 0), 2);
});
test('broken shields go to hand and S-triggers are queued then cast', () => {
  const h = harness({ strig: ['s5'] });
  assert.equal(h.ctx.br(h.st, 'd', 2, 'x'), 2);
  assert.deepEqual(h.d.shields, ['s1', 's2', 's3']); assert.deepEqual(h.d.hand, ['s4', 's5']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.st.strigQ)), [{ s: 'd', c: 's5' }]);
  h.ctx.step(h.st);
  assert.deepEqual(h.cast, ['s5']); assert.deepEqual(h.d.hand, ['s4']); assert.equal(h.st.strigQ, undefined);
  assert.equal(h.ctx.br(h.st, 'd', 9, 'x'), 3); assert.equal(h.ctx.br(h.st, 'd', 1, 'x'), 0);
});
test('no-limit boards grow a zone when full; normal boards stay at 5', () => {
  const ctx = { ZONES: 5 }; vm.createContext(ctx); vm.runInContext(zoneSrc + ';this.fz=freeZone;this.trim=zoneTrim;', ctx);
  const full = () => [1, 2, 3, 4, 5];
  assert.equal(ctx.fz(full(), {}), -1);
  const p = { nolim: true, mz: full(), sz: [null, null, null, null, null] };
  assert.equal(ctx.fz(p.mz, p), 5); p.mz[5] = 6; p.mz.push(null, null);
  ctx.trim(p); assert.equal(p.mz.length, 7); p.mz[5] = null; ctx.trim(p); assert.equal(p.mz.length, 6); p.mz[0] = null; ctx.trim(p); assert.equal(p.mz.length, 5);
});
