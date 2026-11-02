import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const ui = fs.readFileSync(new URL('../src/js/08-board-ui.js', import.meta.url), 'utf8');
const src = ui.slice(ui.indexOf('const MZ_GROUP_MIN'), ui.indexOf('function renderBoard()'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.g=mzGroups;', ctx);
const mon = (c, i, extra = {}, cls = '') => ({ z: { c, mod: 0, attacked: false, eqs: [], u: 100 + i, born: 1, ...extra }, i, html: `<div class="card pick ${cls}" data-z="mz" data-s="me" data-i="${i}"></div>` });
const slot = i => ({ z: null, i, html: `<div class="slot " data-z="mz" data-s="me" data-i="${i}"></div>` });
const run = (L, open = {}) => JSON.parse(JSON.stringify(ctx.g(L, open)));

test('fewer than six monsters are never grouped', () => {
  const out = run([mon('a', 0), mon('a', 1), mon('a', 2), slot(3), slot(4)]);
  assert.equal(out.length, 5); assert.ok(out.every(g => g.n === 1));
});
test('identical monsters collapse into one group led by the first, and only one empty slot stays', () => {
  const out = run([mon('a', 0), mon('b', 1), mon('a', 2), mon('a', 3), mon('b', 4), mon('c', 5), slot(6), slot(7)]);
  assert.deepEqual(out.map(g => [g.i, g.n]), [[0, 3], [1, 2], [5, 1], [6, 1]]);
  assert.deepEqual(out[0].members, [0, 2, 3]);
});
test('a different state or a different look keeps monsters apart', () => {
  const out = run([mon('a', 0), mon('a', 1, { attacked: true }), mon('a', 2, {}, 'sel'), mon('a', 3, { born: 9 }), mon('a', 4), mon('a', 5)]);
  assert.deepEqual(out.map(g => [g.i, g.n]), [[0, 4], [1, 1], [2, 1]]);
});
test('an opened group shows every member after the leader', () => {
  const L = [mon('a', 0), mon('a', 1), mon('a', 2), mon('b', 3), mon('b', 4), mon('c', 5)];
  const key = run(L)[0].key;
  const out = run(L, { [key]: true });
  assert.deepEqual(out.map(g => g.i), [0, 1, 2, 3, 5]);
  assert.equal(out[0].open, true); assert.equal(out[2].open, undefined);
});
