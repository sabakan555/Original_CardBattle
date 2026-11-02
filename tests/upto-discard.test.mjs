import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const fxs = read('js/01-effects.js'), engine = read('js/07-engine.js');

function textOf(f){
  const src = fxs.slice(fxs.indexOf('function handOutText'), fxs.indexOf('/* ---- カードを生む'));
  const ctx = { fxNorm: x => x }; vm.createContext(ctx); vm.runInContext(src + ';this.t=handOutText;', ctx);
  return ctx.t(f);
}
test('「好きな枚数」の文', () => {
  assert.equal(textOf({ side: 'me', to: 'upto', how: 'grave' }), '自分の手札を好きな枚数えらんで捨ててもよい（0枚でもよい）');
  assert.equal(textOf({ to: 'upto', how: 'grave' }), '相手の手札を見て、その中から好きな枚数えらんで捨てさせてもよい');
  assert.equal(textOf({ side: 'me', to: 'upto', how: 'deck', pos: 'top' }), '自分の手札を好きな枚数えらんで山札の一番上に置いてもよい（0枚でもよい）');
});
test('「好きな枚数」は形を変えても残る', () => {
  assert.ok(fxs.includes('const HO_TO = new Set(["one", "random", "all", "upto"]);'));
  assert.ok(fxs.includes('to: v => v === "random" || v === "all" || v === "upto" ? v : undefined'));
});

// 「○1つにつき」のくり返し回数: hx なら0から、そうでなければ1から
function reps(fx, v){
  const line = engine.slice(engine.indexOf('if (fx.hits && fx.per){'));
  const m = line.match(/const k = (.+?), one =/);
  return vm.runInNewContext(m[1], { fx, Math, perVal: () => v, st: 0, s: 0, c: 0, ctx: 0 });
}
test('「1つにつき1回（0なら0回）」は数ぴったり', () => {
  assert.equal(reps({ hx: true }, 0), 0);
  assert.equal(reps({ hx: true }, 3), 3);
  assert.equal(reps({}, 0), 1);
  assert.equal(reps({}, 3), 4);
});
test('hx は保存のときも実行のときも運ばれる', () => {
  assert.ok(fxs.includes('{ hits: true, ...(e.hx ? { hx: true } : {}) }'));
  assert.equal((engine.match(/\.\.\.\(e\.hx \? \{ hx: true \} : \{\}\)/g) || []).length, 2);
});
