import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// 相手の場に移す（手動・デメリット効果）と、LPの増減の記録
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>{then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=()=>{};`);
  const S = js('S');
  for (const id of ['m1', 'm2', 'spell']) S.cards.set(id, { id, name: id, type: id === 'spell' ? 'magic' : 'monster', atk: 500, cost: 1 });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [], pending: {} };
  st.players.a.name = 'A'; st.players.b.name = 'B';
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  return { js, S, st, a: st.players.a, b: st.players.b };
}
const mon = (c, extra = {}) => ({ c, u: 'u-' + c, mod: 0, born: 1, ...extra });

test('相手の場に移す: 状態はそのまま、持ち主をおぼえる、召喚酔い', () => {
  const t = setup(); t.a.mz[0] = mon('m1', { mod: 300, dmg: 100, eqs: [{ c: 'spell', o: 'a' }] });
  assert.equal(t.js('giveMon')(t.st, 'a', 0, '（手動）'), true);
  assert.equal(t.a.mz[0], null); const m = t.b.mz[0];
  assert.equal(m.mod, 300); assert.equal(m.dmg, 100); assert.equal(m.eqs.length, 1); assert.equal(m.owner, 'a'); assert.equal(m.born, 3);
  // もう一度もどすと持ち主の印は消える
  t.js('giveMon')(t.st, 'b', 0, 'x'); assert.equal(t.a.mz[0].owner, undefined);
});

test('相手の場に移す: いっぱいなら送れない／デメリットなら破壊', () => {
  let t = setup(); t.a.mz[0] = mon('m1'); t.b.mz = [mon('m2'), mon('m2'), mon('m2')];
  assert.equal(t.js('giveMon')(t.st, 'a', 0, 'x'), false); assert.ok(t.a.mz[0]);
  t = setup(); t.a.mz[1] = mon('m1'); t.b.mz = [mon('m2'), mon('m2'), mon('m2')];
  t.js('runEffects')(t.st, 'a', t.S.cards.get('m1'), [{ kind: 'giveThis' }], { mon: { s: 'a', i: 1, u: 'u-m1' } }, null);
  assert.equal(t.a.mz[1], null); assert.ok(t.a.grave.includes('m1'));
});

test('デメリット効果 giveThis: このモンスターを相手の場に', () => {
  const t = setup(); t.a.mz[2] = mon('m1', { mod: -100 });
  t.js('runEffects')(t.st, 'a', t.S.cards.get('m1'), [{ kind: 'giveThis' }], { mon: { s: 'a', i: 2, u: 'u-m1' } }, null);
  assert.equal(t.a.mz[2], null); assert.equal(t.b.mz[0].mod, -100);
  assert.match(t.js('KINDS').giveThis.text(), /相手の場に移す/);
});

test('LPの増減を理由つきで記録する', () => {
  const t = setup(), log = t.js('log'), dealDmg = t.js('dealDmg'), checkEnd = t.js('checkEnd');
  log(t.st, 'a', '対戦開始');
  log(t.st, 'a', '「火の玉」でBに300ダメージ'); dealDmg(t.st, 'b', 300); checkEnd(t.st);
  t.a.lp += 200; log(t.st, 'a', '「薬草」でLPを200回復');
  const lb = t.b.lpLog, la = t.a.lpLog;
  assert.equal(lb.length, 1); assert.equal(lb[0].d, -300); assert.equal(lb[0].lp, 700); assert.match(lb[0].w, /火の玉/);
  assert.equal(la.length, 1); assert.equal(la[0].d, 200); assert.match(la[0].w, /薬草/);
});
