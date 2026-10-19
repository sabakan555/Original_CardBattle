import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const effects = fs.readFileSync(new URL('../src/js/01-effects.js', import.meta.url), 'utf8');
// フィールドの「お互い／自分のみ／相手のみ」の判定だけを取り出して試す
function setup(fieldCard){
  const ctx = { card: id => id === 'f' ? fieldCard : null };
  vm.createContext(ctx);
  const want = /^const (isField|cardType|FIELD_TRIG_LABEL|FIELD_SIDE_LABEL|fieldSide|fieldMine|fieldFor|fieldUser|FIELD_MINE_LABEL|FIELD_OPP_LABEL|fieldTrigLabel|swapSelfOpp) =/;
  vm.runInContext(effects.split('\n').filter(l => want.test(l)).join('\n').replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const st = { field: { c: 'f', o: 'a' } };
test('お互いのフィールドは両方のプレイヤーに効く', () => {
  const c = setup({ type: 'magic', field: true });
  assert.equal(c.fieldSide(c.card('f')), 'both');
  assert.equal(c.fieldFor(st, 'a'), true); assert.equal(c.fieldFor(st, 'b'), true);
  assert.equal(c.fieldUser(st), 'a');
});
test('自分のみのフィールドは出した人だけに効く', () => {
  const c = setup({ type: 'magic', field: true, fieldMine: true });
  assert.equal(c.fieldFor(st, 'a'), true); assert.equal(c.fieldFor(st, 'b'), false);
  assert.equal(c.fieldUser(st), 'a');
  assert.equal(c.fieldTrigLabel(c.card('f'), 'turnStart'), '自分のターンのはじめ');
});
test('相手のみのフィールドは出した人の相手だけに効く', () => {
  const c = setup({ type: 'magic', field: true, fieldOpp: true });
  assert.equal(c.fieldSide(c.card('f')), 'opp');
  assert.equal(c.fieldFor(st, 'a'), false); assert.equal(c.fieldFor(st, 'b'), true);
  assert.equal(c.fieldUser(st), 'b');
  assert.equal(c.fieldTrigLabel(c.card('f'), 'turnStart'), '相手のターンのはじめ');
  assert.equal(c.swapSelfOpp('自分のLPを500回復し、相手に300ダメージ'), '相手のLPを500回復し、自分に300ダメージ');
});
test('場にフィールドがなければだれにも効かない', () => {
  const c = setup({ type: 'magic', field: true });
  assert.equal(c.fieldFor({}, 'a'), false); assert.equal(c.fieldUser({}), null);
});
