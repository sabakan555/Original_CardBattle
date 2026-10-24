import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const fx = fs.readFileSync(new URL('../src/js/01-effects.js', import.meta.url), 'utf8');
const src = fx.slice(fx.indexOf('const COST_SW'), fx.indexOf('const KINDS'));
const ctx = { usedPfText: m => m.pf === 'monster' ? 'モンスター' : 'カード' }; vm.createContext(ctx); vm.runInContext(src + ';this.t=costSetText;this.lo=costLo;this.hi=costHi;', ctx);
test('text for all / deck / random range / whole game', () => {
  assert.equal(ctx.t(0, { sp: 'all', sw: 'both', sv: 'rand', lo: 1, hi: 5, sd: 'game' }), '自分の手札と山札のカードすべてのコストを1枚ずつランダムに1〜5にする（この試合のあいだずっと）');
  assert.equal(ctx.t(2, { sp: 'filter', pf: 'monster', sw: 'deck', sd: 'turn' }), '自分の山札のモンスターのコストを2にする（このターン）');
  assert.equal(ctx.t(0, { sp: 'pick', sv: 'rand', lo: 0, hi: 3, sd: 'used' }), '手札を1枚えらび、そのコストをランダムに0〜3にする（使うまで）');
});
test('range is clamped and ordered (0〜99, hi ≥ lo, hi defaults to 10)', () => {
  assert.equal(ctx.lo({ lo: -3 }), 0); assert.equal(ctx.hi({ lo: 5, hi: 2 }), 5); assert.equal(ctx.hi({}), 10); assert.equal(ctx.hi({ hi: 500 }), 99);
});
