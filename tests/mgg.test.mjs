import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const engine = read('js/07-engine.js'), fxs = read('js/01-effects.js');
const src = engine.slice(engine.indexOf('function mggOk('), engine.indexOf('function gzOk('));

function run(hand, mgg, cost = 7){
  const p = { hand };
  const ctx = { P: () => p, hasCost: c => +c.cost > 0 };
  vm.createContext(ctx); vm.runInContext(src + ';this.ok=mggOk;', ctx);
  return ctx.ok({}, 'a', { id: 'ggg', cost, mgg });
}
test('free only when this card is the whole hand (mgg 1)', () => {
  assert.equal(run(['ggg'], 1), true);
  assert.equal(run(['ggg', 'x'], 1), false);
  assert.equal(run(['x'], 1), false);
  assert.equal(run([], 1), false);
});
test('a larger limit counts this card too', () => {
  assert.equal(run(['ggg', 'x', 'y'], 3), true);
  assert.equal(run(['ggg', 'x', 'y', 'z'], 3), false);
});
test('cards without the option or without a cost are never free by it', () => {
  assert.equal(run(['ggg'], 0), false);
  assert.equal(run(['ggg'], null), false);
  assert.equal(run(['ggg'], 1, 0), false);
});
test('the card text names the ability', () => {
  assert.ok(fxs.includes('【マスターG・G・G】自分の手札がこのカードだけなら、コストを払わずに使える'));
  assert.ok(engine.includes('gzOk(st, s, c) || mggOk(st, s, c)'));
});
