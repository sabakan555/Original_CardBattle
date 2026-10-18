import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const engine = read('js/07-engine.js'), effects = read('js/01-effects.js');
// 変身（場を離れるとき、かわりに別のカードになる）と、相手の効果を受けない
function setup(){
  const cards = new Map();
  for (const [id, extra] of [
    ['morph', { abs: [{ k: 'leaveMorph', name: 'dragon' }] }],
    ['dragon', {}],
    ['plain', {}],
    ['immune', { abs: [{ k: 'unaffected' }] }],
    ['lost', { abs: [{ k: 'leaveMorph', name: 'nothing' }] }],
  ]) cards.set(id, { id, name: id, type: 'monster', atk: 500, ...extra });
  const player = () => ({ name: 'test', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 1, log: [], ev: [] };
  const ctx = { S: { cards }, G: null, cardType: c => c.type, eqsOf: m => m?.eqs || [], KINDS: { destroy: { target: 'opp' }, bounce: { target: 'opp' }, removeBoard: { target: 'board' } },
    RB_MODE: { destroy: '破壊する', bounce: '戻す', banish: '除外する' }, SIDED_KINDS: new Set(), isField: () => false, sealedM: () => false, mfOn: () => false };
  vm.createContext(ctx); vm.runInContext(engine, ctx);
  vm.runInContext(effects.split('\n').filter(l => /^const (cannotLeave|monCannotLeave) =/.test(l)).join('\n'), ctx);
  vm.runInContext(effects.slice(effects.indexOf('/* ---- ATKを変える'), effects.indexOf('// 追加コスト')), ctx); // atkNorm・fxTgt
  vm.runInContext(effects.slice(effects.indexOf('function mfOk('), effects.indexOf('\n', effects.indexOf('function mfOk('))), ctx);
  vm.runInContext(`ev=()=>{};glGroup=(st,s,i)=>[i];hasAltar=()=>false;monTrigList=()=>[];ctrTrigs=()=>[];runList=()=>{};
    monAbs=(st,s,i)=>(card(P(st,s).mz[i].c).abs||[]);hasAb=(st,s,i,k)=>{const m=P(st,s).mz[i];return !!m&&monAbs(st,s,i).some(a=>a.k===k);};
    fxCardId=fx=>[...S.cards.values()].find(c=>c.name===fx.into)?.id||null;`, ctx);
  return { ctx, st, a: st.players.a, b: st.players.b };
}
const mon = (c, u) => ({ c, u, eqs: [], mod: 300, dmg: 200 });

test('変身: 破壊されるかわりに指定したカードになって同じ場所に残る', () => {
  const { ctx, st, b } = setup(); b.mz[1] = mon('morph', 1);
  assert.equal(ctx.destroyMonster(st, 'b', 1, 'test'), false);
  assert.equal(b.mz[1].c, 'dragon'); assert.equal(b.mz[1].u, 1); assert.equal(b.mz[1].mod, 0); assert.equal(b.mz[1].dmg, 0); assert.equal(b.grave.length, 0);
  // 変身した先は変身を持たないので、次はふつうに破壊される
  assert.equal(ctx.destroyMonster(st, 'b', 1, 'test'), true); assert.deepEqual(b.grave, ['dragon']);
});
test('変身: 戦闘・手札戻し・除外・マナ送りでも変身する', () => {
  const { ctx, st, b } = setup();
  b.mz[0] = mon('morph', 1); assert.equal(ctx.destroyMonster(st, 'b', 0, '戦闘', { battle: true }), false); assert.equal(b.mz[0].c, 'dragon');
  for (const to of ['hand', 'exile', 'mana']){ b.mz[0] = mon('morph', 2); assert.equal(ctx.moveMonOut(st, 'b', 0, to), null); assert.equal(b.mz[0].c, 'dragon'); }
  assert.equal(b.hand.length + b.exile.length, 0);
});
test('変身: 生贄（コスト）と革命チェンジ用の戻しでは変身しない／変身先が見つからなければ場を離れる', () => {
  const { ctx, st, b } = setup();
  b.mz[0] = mon('morph', 1); ctx.sendToGrave(st, 'b', 0); assert.equal(b.mz[0], null); assert.deepEqual(b.grave, ['morph']);
  b.mz[0] = mon('morph', 2); ctx.moveMonOut(st, 'b', 0, 'hand', { noMorph: true }); assert.equal(b.mz[0], null); assert.deepEqual(b.hand, ['morph']);
  b.mz[0] = mon('lost', 3); assert.equal(ctx.destroyMonster(st, 'b', 0, 'test'), true); assert.equal(b.mz[0], null);
});
test('効果を受けない: 相手の効果の対象にならず、対象にされても効果が消える', () => {
  const { ctx, st, b } = setup(); b.mz[0] = mon('immune', 1); b.mz[1] = mon('plain', 2);
  assert.deepEqual([...ctx.targetOptions(st, 'a', 'destroy')], [1]);
  assert.deepEqual([...ctx.targetOptions(st, 'a', 'removeBoard')], ['b:mz:1']);
  ctx.applyEffect(st, 'a', { name: 'x' }, 0, {}, { kind: 'destroy' }); assert.equal(b.mz[0].c, 'immune');
  ctx.applyEffect(st, 'a', { name: 'x' }, 'b:mz:0', {}, { kind: 'removeBoard', rm: 'bounce' }); assert.equal(b.mz[0].c, 'immune');
});
test('効果を受けない: 相手の全体効果からは外れ、自分の効果と戦闘はふつうに受ける', () => {
  const { ctx, st, b } = setup(); b.mz[0] = mon('immune', 1); b.mz[1] = mon('plain', 2);
  ctx.applyEffect(st, 'a', { name: 'x' }, null, {}, { kind: 'destroyAll' });
  assert.equal(b.mz[0].c, 'immune'); assert.equal(b.mz[1], null);
  ctx.applyEffect(st, 'a', { name: 'x' }, null, {}, { kind: 'destroyOthers' }); assert.equal(b.mz[0].c, 'immune');
  ctx.applyEffect(st, 'b', { name: 'own' }, 0, {}, { kind: 'destroyOwn' }); assert.equal(b.mz[0], null);
  b.mz[0] = mon('immune', 3); assert.equal(ctx.destroyMonster(st, 'b', 0, '戦闘', { battle: true }), true);
});
