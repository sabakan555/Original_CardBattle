import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const lobby = fs.readFileSync(new URL('../src/js/06-lobby.js', import.meta.url), 'utf8');
const src = lobby.slice(lobby.indexOf('// マリガン: yes'), lobby.indexOf('// the CPU picks at random'));

function harness(hand, deck){
  const p = { hand: hand.slice(), deck: deck.slice(), mullPick: true }, logs = [];
  const ctx = { P: () => p, log: (st, s, m) => logs.push(m), shuffle: a => a.slice().reverse(), innateTop: a => a };
  vm.createContext(ctx); vm.runInContext(src + ';this.mull=mulligan;this.auto=autoMull;', ctx);
  return { ctx, p, logs };
}
test('mulligan returns the whole hand and draws the same number again', () => {
  const h = harness(['h1', 'h2', 'h3', 'h4', 'h5'], ['d1', 'd2', 'd3']);
  assert.equal(h.ctx.mull({}, 'a', true), true);
  assert.equal(h.p.hand.length, 5); assert.equal(h.p.deck.length, 3);
  assert.deepEqual([...h.p.hand, ...h.p.deck].sort(), ['d1', 'd2', 'd3', 'h1', 'h2', 'h3', 'h4', 'h5']);
  assert.equal(h.p.mullPick, null);
});
test('only once: a second call does nothing', () => {
  const h = harness(['h1'], ['d1']);
  h.ctx.mull({}, 'a', true);
  const hand = h.p.hand.slice();
  assert.equal(h.ctx.mull({}, 'a', true), false); assert.deepEqual(h.p.hand, hand);
});
test('keeping the hand changes nothing', () => {
  const h = harness(['h1', 'h2'], ['d1']);
  assert.equal(h.ctx.mull({}, 'a', false), true);
  assert.deepEqual(h.p.hand, ['h1', 'h2']); assert.deepEqual(h.p.deck, ['d1']); assert.equal(h.p.mullPick, null);
});
test('the CPU just keeps', () => {
  const h = harness(['h1'], ['d1']); h.ctx.auto({}, 'b');
  assert.equal(h.p.mullPick, null); assert.deepEqual(h.p.hand, ['h1']);
});
