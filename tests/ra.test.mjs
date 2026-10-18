import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// ラーの翼神竜のための効果: 生贄のATKの合計・起動効果のLPコスト・LPを○だけ残して払う・召喚を打ち消されない
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>{then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=()=>{};ctrPayWhy=()=>'';ctrPay=()=>{};ctrCostText=()=>'';ctrFire=()=>{};payCtrOf=()=>null;`);
  const S = js('S');
  for (const [id, atk] of [['x', 1000], ['y', 1500], ['z', 2000], ['b1', 1200]]) S.cards.set(id, { id, name: id, type: 'monster', atk });
  S.cards.set('spell', { id: 'spell', name: 'spell', type: 'magic' });
  S.cards.set('ra', { id: 'ra', name: 'ra', type: 'monster', atk: 0, trib: 3, abs: [{ k: 'noNegSummon' }],
    blocks: [{ trig: 'summon', join: 'and', conds: [], then: [{ kind: 'atk', op: 'set', to: 'this', n: 0, per: 'tribAtk' }], else: [] },
      { trig: 'act', ap: 'turn', an: 1, lpc: 1000, join: 'and', conds: [], then: [{ kind: 'remove', zone: 'mon', to: 'one' }], else: [] },
      { trig: 'act', ap: 'turn', an: 1, join: 'and', conds: [], then: [{ kind: 'lp', op: 'leave', n: 100 }, { kind: 'atk', op: 'add', to: 'this', n: 0, per: 'lpPaid' }], else: [] }] });
  S.cards.set('cxl', { id: 'cxl', name: 'cxl', type: 'trap', fx: { kind: 'cancel' } });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 4000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [], pending: null };
  const a = st.players.a, b = st.players.b;
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  return { ctx, js, S, st, a, b, atk: m => js('atkOf')(m) };
}

test('生贄にしたモンスターのATKの合計: 召喚したとき ATK がその合計になる', () => {
  const t = setup();
  t.a.mz = [{ c: 'x', u: 1, eqs: [], born: 0 }, { c: 'y', u: 2, eqs: [], born: 0 }, { c: 'z', u: 3, eqs: [], born: 0 }]; t.st.un = 10;
  t.a.mz[1].mod = 500; // 効果で上がった分もふくむ
  t.a.hand = ['ra'];
  assert.equal(t.js('summon')(t.st, 'a', 0, null, [], [0, 1, 2]), true);
  const ra = t.a.mz.find(m => m && m.c === 'ra');
  assert.equal(ra.tribAtk, 5000); assert.equal(t.atk(ra), 5000);
});

test('召喚を打ち消されない: 相手に打ち消しの罠があっても召喚の割りこみが出ない・打ち消しは効かない', () => {
  const t = setup();
  t.a.mz = [{ c: 'x', u: 1, eqs: [], born: 0 }, { c: 'y', u: 2, eqs: [], born: 0 }, { c: 'z', u: 3, eqs: [], born: 0 }]; t.st.un = 10;
  t.b.sz[0] = { c: 'cxl', u: 9, turn: 1 }; t.a.hand = ['ra'];
  t.S.cards.set('ra2', { ...t.S.cards.get('ra'), id: 'ra2', abs: [] });
  assert.equal(t.js('sumWin')(t.st, 'a', 'ra2'), true); // ふつうなら打ち消しのチャンスがある
  assert.equal(t.js('sumWin')(t.st, 'a', 'ra'), false);
  t.st.chain = [{ s: 'a', c: 'ra', summon: true }]; assert.equal(t.js('usableIn')(t.st, 'b', t.S.cards.get('cxl'), 'chain'), false);
  t.st.chain = [{ s: 'a', c: 'ra2', summon: true }]; assert.equal(t.js('usableIn')(t.st, 'b', t.S.cards.get('cxl'), 'chain'), true);
  t.st.chain = null;
  t.js('summon')(t.st, 'a', 0, null, [], [0, 1, 2]);
  assert.ok(t.a.mz.some(m => m && m.c === 'ra')); assert.ok(!t.st.chain || !t.st.chain.length);
  assert.equal(t.js('noNegSum')('x'), false);
});

test('起動効果のLPコスト: 払えるときだけ使える・払ったLPを数えられる', () => {
  const t = setup();
  t.a.mz[0] = { c: 'ra', u: 1, eqs: [], born: 0, tribAtk: 3000 }; t.b.mz[0] = { c: 'b1', u: 2, eqs: [], born: 0 }; t.st.un = 10;
  t.a.lp = 1000; assert.equal(t.js('actLpOk')(t.st, 'a', { lpc: 1000 }), false);
  t.a.lp = 4000; assert.equal(t.js('activateMon')(t.st, 'a', 0, 1), true);
  assert.equal(t.a.lp, 3000); assert.ok(!t.b.mz[0]);
  assert.match(t.js('blockText')(t.S.cards.get('ra'), t.S.cards.get('ra').blocks[1]), /LPを1,?000払う/);
});

test('LPを○だけ残して払う: 払った分だけ ATK が上がる・○以下なら払わない', () => {
  const t = setup();
  t.a.mz[0] = { c: 'ra', u: 1, eqs: [], born: 0 }; t.st.un = 10; t.a.lp = 4000;
  assert.equal(t.js('activateMon')(t.st, 'a', 0, 2), true);
  assert.equal(t.a.lp, 100); assert.equal(t.atk(t.a.mz[0]), 3900);
  const u = setup(); u.a.mz[0] = { c: 'ra', u: 1, eqs: [], born: 0 }; u.st.un = 10; u.a.lp = 80;
  u.js('activateMon')(u.st, 'a', 0, 2); assert.equal(u.a.lp, 80); assert.equal(u.atk(u.a.mz[0]), 0);
});

test('文と保存: 生贄のATK・払ったLP・LPコスト・残して払う', () => {
  const t = setup();
  assert.equal(t.js('lpText')({ op: 'leave', n: 100 }), '自分のLPを100だけ残して払う');
  assert.equal({ ...t.js('cleanEff')({ kind: 'lp', op: 'leave', n: 100 }) }.op, 'leave');
  assert.match(t.js('effsText')(t.S.cards.get('ra'), [{ kind: 'atk', op: 'set', to: 'this', n: 0, per: 'tribAtk' }]), /このモンスターのATKを生贄にしたモンスターのATKの合計にする/);
  assert.match(t.js('effsText')(t.S.cards.get('ra'), [{ kind: 'atk', op: 'add', to: 'this', n: 0, per: 'lpPaid' }]), /このモンスターのATK\+直前に払ったLP/);
});
