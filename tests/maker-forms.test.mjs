import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// カード工房: 前の効果は新しい形（atk・remove）に直して出し、欄をかえると新しい形のまま保存される
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const maker = read('js/04-maker.js');
  vm.runInContext(maker.slice(maker.indexOf('/* ---- まとめた効果（atk・remove）の欄'), maker.indexOf('function atkUI(')), ctx);
  const js = c => vm.runInContext(c, ctx);
  const conv = (e, trig = 'summon') => ({ ...js('formFix')(js('fxNorm')(trig === 'while' && e.kind === 'atkUp' && e.to !== 'all' ? { ...e, kind: 'selfAtk' } : e), trig) });
  const change = (e, f, v, trig = 'summon') => ({ ...js('formFix')(js('fxNorm')(js('FORM_F')[f](e, v)), trig) });
  const save = e => ({ ...js('cleanEff')(e) });
  return { js, conv, change, save };
}
test('前の効果を開くと新しい形になる', () => {
  const { conv } = setup();
  assert.deepEqual(conv({ kind: 'atkDownTmpAll', n: 200 }), { kind: 'atk', n: 200, op: 'sub', to: 'all', dur: 'turn', _g: 'atk' });
  assert.deepEqual(conv({ kind: 'bounce' }), { kind: 'remove', zone: 'mon', to: 'one', how: 'hand', _g: 'destroy' });
  assert.deepEqual(conv({ kind: 'killAtk' }), { kind: 'remove', zone: 'mon', to: 'attacker', how: 'destroy', _g: 'destroy' });
  assert.deepEqual(conv({ kind: 'removeBoard', rm: 'banish', rside: 'me' }), { kind: 'remove', zone: 'any', to: 'one', how: 'exile', side: 'me', _g: 'destroy' });
  assert.equal(conv({ kind: 'destroyStRand', n: 2 }).tn, 2);
});
test('場にいる間の ATK はこのモンスターか全体だけ（前のカードの意味のまま）', () => {
  const { conv } = setup();
  assert.equal(conv({ kind: 'atkUp', n: 100 }, 'while').to, 'this');
  assert.equal(conv({ kind: 'atkAll', n: 100 }, 'while').to, 'all');
  const d = conv({ kind: 'atkDown', n: 100, to: 'all', side: 'me' }, 'while'); assert.equal(d.to, 'all'); assert.equal(d.side, 'me'); assert.equal(d.op, 'sub');
  assert.equal(conv({ kind: 'atkSet', n: 0 }, 'while').op, 'add');
});
test('欄をかえる: だれの・どうする・いつまで・数', () => {
  const { conv, change } = setup();
  let e = conv({ kind: 'selfAtk', n: 100 });
  e = change(e, 'aWho', 'opAll'); assert.equal(e.to, 'all'); assert.equal(e.side, undefined);
  e = change(e, 'aOp', 'sub'); e = change(e, 'aDur', 'turn'); assert.equal(e.dur, 'turn');
  e = change(e, 'aWho', 'me1'); e = change(e, 'fTn', '3'); assert.equal(e.to, 'n'); assert.equal(e.tn, 3); assert.equal(e.side, 'me');
  e = change(e, 'aOp', 'mul'); assert.equal(e.n, 2); assert.equal(e.dur, undefined);
  e = change(e, 'aOp', 'set'); assert.equal(e.n, 100);
  e = change(e, 'aWho', 'this'); assert.equal(e.to, 'this'); assert.equal(e.side, undefined); assert.equal(e.tn, undefined);
});
test('除去の欄: なにを・どれを・だれの・どうどかす・山札のどこ', () => {
  const { conv, change } = setup();
  let e = conv({ kind: 'destroy' });
  e = change(e, 'rZone', 'st'); e = change(e, 'rWho', 'random'); e = change(e, 'fTn', '2'); assert.equal(e.to, 'random'); assert.equal(e.tn, 2);
  e = change(e, 'rSide', 'both'); assert.equal(e.side, 'both');
  e = change(e, 'rHow', 'deck'); assert.equal(e.pos, 'shuffle'); e = change(e, 'rPos', 'top'); assert.equal(e.pos, 'top');
  e = change(e, 'rWho', 'attacker'); assert.equal(e.zone, 'mon'); assert.equal(e.side, undefined);
  e = change(e, 'rZone', 'st'); assert.equal(e.to, 'one');
  e = change(e, 'rZone', 'any'); e = change(e, 'rWho', 'others'); assert.equal(e.zone, 'any'); e = change(e, 'rZone', 'mon'); assert.equal(e.to, 'one');
  e = change(e, 'rHow', 'hand'); assert.equal(e.pos, undefined);
});
test('保存すると新しい形のパラメータが残る', () => {
  const { conv, change, save } = setup();
  const a = save(change(conv({ kind: 'atkDown', n: 100 }), 'aDur', 'turn')); assert.equal(a.kind, 'atk'); assert.equal(a.op, 'sub'); assert.equal(a.dur, 'turn');
  const r = save(change(change(conv({ kind: 'destroy' }), 'rHow', 'deck'), 'rSide', 'both')); assert.equal(r.kind, 'remove'); assert.equal(r.how, 'deck'); assert.equal(r.pos, 'shuffle'); assert.equal(r.side, 'both'); assert.equal(r.zone, 'mon');
  const t = save(conv({ kind: 'killAtk' })); assert.equal(t.to, 'attacker');
});
test('手札をどかす: 前の効果を開く・欄をかえる・保存', () => {
  const { conv, change, save } = setup();
  let e = conv({ kind: 'selfDiscRand', n: 2 }); assert.equal(e.side, 'me'); assert.equal(e.to, 'random'); assert.equal(e._g, 'minus');
  assert.equal(conv({ kind: 'exhaustAll' })._g, 'exhaust'); assert.equal(conv({ kind: 'discard', n: 1 })._g, 'hand');
  e = change(e, 'hOnly', 'nonAtk'); assert.equal(e.only, 'nonAtk');
  e = change(e, 'hWho', 'one'); assert.equal(e.only, undefined); assert.equal(e.n, 2);
  e = change(e, 'hHow', 'deck'); assert.equal(e.pos, 'shuffle'); e = change(e, 'rPos', 'top');
  e = change(e, 'hSide', ''); assert.equal(e.side, undefined);
  const c = save(e); assert.equal(c.kind, 'handOut'); assert.equal(c.how, 'deck'); assert.equal(c.pos, 'top'); assert.equal(c.n, 2); assert.equal(c.to, undefined);
  const d = save(change(conv({ kind: 'exhaustNonAtk' }), 'hHow', 'grave')); assert.equal(d.to, 'all'); assert.equal(d.only, 'nonAtk'); assert.equal(d.how, 'grave');
});
test('生む・持ってくる: 前の効果を開く・欄をかえる・保存', () => {
  const { conv, change, save } = setup();
  let g = conv({ kind: 'oppSummon', into: 'ボム', n: 1 }); assert.equal(g.kind, 'gen'); assert.equal(g.dest, 'field'); assert.equal(g.who, 'op'); assert.equal(g._g, 'summon');
  assert.equal(conv({ kind: 'oppGenHand', into: 'x' })._g, 'give'); assert.equal(conv({ kind: 'copyHand' })._g, 'make');
  g = change(g, 'gWho', 'both'); g = change(g, 'gDest', 'deck'); assert.equal(g.pos, 'shuffle'); g = change(g, 'rPos', 'top');
  g = change(g, 'gDest', 'hand'); g = change(g, 'gWho', ''); g = change(g, 'gOpt', 'next'); assert.equal(g.when, 'next');
  g = change(g, 'gWho', 'op'); assert.equal(g.when, undefined);
  g = change(g, 'gWhat', 'random'); assert.equal(g.sk, 'attack'); assert.equal(g.into, undefined);
  let c = save(g); assert.equal(c.kind, 'gen'); assert.equal(c.what, 'random'); assert.equal(c.who, 'op'); assert.equal(c.dest, undefined);
  let f = conv({ kind: 'reborn' }); assert.equal(f.kind, 'fetch'); assert.equal(f._g, 'summon');
  f = change(f, 'fFrom', 'deck'); f = change(f, 'fWhat', 'tag'); f = change(f, 'fDest', 'hand'); assert.equal(f.dest, 'hand');
  f = change(f, 'fFrom', 'hand'); assert.equal(f.dest, 'field');
  f = change(f, 'fWhat', 'magic'); assert.equal(f.what, 'mon');
  f = change(f, 'fWhat', 'self'); assert.equal(f.from, 'hand'); f = change(f, 'fFrom', 'grave'); assert.equal(f.what, 'mon');
  f = change(f, 'fPick', 'random'); c = save(f); assert.equal(c.kind, 'fetch'); assert.equal(c.from, 'grave'); assert.equal(c.pick, 'random'); assert.equal(c.dest, 'field');
});
