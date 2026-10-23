import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const lobby = fs.readFileSync(new URL('../src/js/06-lobby.js', import.meta.url), 'utf8');
const src = lobby.slice(lobby.indexOf('function stableJSON('), lobby.indexOf('function startOnline('));
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.f=liveOnlyChange;', ctx);
test('a heartbeat-only change is detected even when key order differs', () => {
  const a = { turn: 'a', players: { a: { lp: 1000, hand: ['x'] }, b: { lp: 900 } }, live: { a: 1 } };
  const b = { live: { a: 1, b: 5 }, players: { b: { lp: 900 }, a: { hand: ['x'], lp: 1000 } }, turn: 'a' };
  assert.equal(ctx.f(a, b), true);
});
test('a real game change is not treated as a heartbeat', () => {
  const a = { turn: 'a', live: { a: 1 } }, b = { turn: 'b', live: { a: 2 } };
  assert.equal(ctx.f(a, b), false);
});
test('no live change → normal update path', () => {
  assert.equal(ctx.f({ turn: 'a', live: { a: 1 } }, { turn: 'b', live: { a: 1 } }), false);
});
