import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// 状態（弱体・脱力・魅了・筋力・敏捷・霊体）。古い効果で作られたカードが今までどおりに動くことを確かめる
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};__pf=[];persistFire=(st,s,k,x,then)=>{__pf.push(s+':'+k);then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=()=>{};`);
  const S = js('S');
  for (const [id, atk] of [['src', 1000], ['a1', 500], ['b1', 600], ['b2', 900]]) S.cards.set(id, { id, name: id, type: 'monster', atk });
  S.cards.set('spell', { id: 'spell', name: 'spell', type: 'magic' });
  S.cards.set('sp', { id: 'sp', name: 'sp', type: 'magic', frame: 'spire', sk: 'skill' });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [], pending: {} };
  const a = st.players.a, b = st.players.b;
  a.mz[0] = { c: 'src', u: 1, eqs: [], born: 0 }; a.mz[1] = { c: 'a1', u: 2, eqs: [], born: 0 };
  b.mz[0] = { c: 'b1', u: 3, eqs: [], born: 0 }; b.mz[1] = { c: 'b2', u: 4, eqs: [], born: 0 }; st.un = 10;
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const run = (fx, card = 'spell', extra = {}) => js('runEffects')(st, 'a', S.cards.get(card), [fx], { hit: {}, ...(card === 'src' ? { zone: 0, mon: { s: 'a', i: 0, u: 1 } } : {}), ...extra }, null);
  return { ctx, js, S, st, a, b, run, atk: m => js('atkOf')(m), pf: () => [...js('__pf')] };
}

test('弱体・脱力: 相手プレイヤー・自分・全体・モンスター全員だけ', () => {
  let t = setup(); t.run({ kind: 'vuln', n: 2 }); assert.equal(t.b.vuln, 2); assert.ok(!t.b.mz[0].vuln); assert.ok(t.pf().includes('a:vulnApply'));
  t = setup(); t.run({ kind: 'vuln', n: 1, side: 'me' }); assert.equal(t.a.vuln, 1); assert.ok(!t.b.vuln);
  t = setup(); t.run({ kind: 'vulnAll', n: 1 }); assert.equal(t.b.vuln, 1); assert.equal(t.b.mz[0].vuln, 1); assert.equal(t.b.mz[1].vuln, 1);
  t = setup(); t.run({ kind: 'vuln', n: 1, to: 'mons' }); assert.ok(!t.b.vuln); assert.equal(t.b.mz[1].vuln, 1);
  t = setup(); t.run({ kind: 'weak', n: 2 }); assert.equal(t.b.weak, 2);
  t = setup(); t.run({ kind: 'weakAll', n: 1 }); assert.equal(t.b.weak, 1); assert.equal(t.b.mz[0].weak, 1);
});

test('弱体: スパイアのカードは相手のモンスターをえらぶ（CPUは強いほう）・ランダムは敵のどれか', () => {
  let t = setup(); t.run({ kind: 'vuln', n: 1 }, 'sp'); assert.equal(t.b.mz[1].vuln, 1); assert.ok(!t.b.vuln);
  t = setup(); t.run({ kind: 'vuln', n: 1, to: 'random', tn: 3 }); const hits = (t.b.vuln || 0) + (t.b.mz[0].vuln || 0) + (t.b.mz[1].vuln || 0); assert.equal(hits, 3);
});

test('魅了: 1体・全員、かけたモンスターがいる間だけ', () => {
  let t = setup(); t.run({ kind: 'charm' }, 'src'); assert.ok(t.b.mz[1].charm); assert.ok(!t.b.mz[0].charm); assert.equal(t.js('charmActive')(t.st, t.b.mz[1]), true);
  t.a.mz[0] = null; assert.equal(t.js('charmActive')(t.st, t.b.mz[1]), false);
  t = setup(); t.run({ kind: 'charmAll' }, 'src'); assert.ok(t.b.mz[0].charm && t.b.mz[1].charm);
});

test('筋力・敏捷・霊体: 自分が得る・このターンだけ・相手が得る・相手の筋力を下げる', () => {
  let t = setup(); t.run({ kind: 'str', n: 40 }); assert.equal(t.a.str, 40); assert.ok(!t.a.strTemp);
  t = setup(); t.run({ kind: 'strTemp', n: 40 }); assert.equal(t.a.str, 40); assert.equal(t.a.strTemp, 40);
  t = setup(); t.run({ kind: 'oppStr', n: 20 }); assert.equal(t.b.str, 20);
  t = setup(); t.run({ kind: 'oppStrDown', n: 20 }); assert.equal(t.b.str, -20); assert.equal(t.b.strTemp, -20);
  t = setup(); t.run({ kind: 'dex', n: 20 }); assert.equal(t.a.dex, 20);
  t = setup(); t.run({ kind: 'dexTemp', n: 20 }); assert.equal(t.a.dex, 20); assert.equal(t.a.dexTemp, 20);
  t = setup(); t.run({ kind: 'intang', n: 1 }); assert.equal(t.a.intang, 1);
});

test('新しい形 status: モンスターの筋力（ATK が上がる）・ランダム・このターンだけ・相手の敏捷を下げる', () => {
  let t = setup(); t.run({ kind: 'status', st: 'str', to: 'this', n: 100 }, 'src'); assert.equal(t.atk(t.a.mz[0]), 1100); assert.equal(t.a.mz[0].str, 100); assert.ok(!t.a.str);
  t = setup(); t.run({ kind: 'status', st: 'str', side: 'me', to: 'mons', n: 100, dur: 'turn' }); assert.equal(t.atk(t.a.mz[1]), 600); assert.equal(t.a.mz[1].strTBy, 'a');
  t = setup(); t.run({ kind: 'status', st: 'str', to: 'one', op: 'sub', n: 200 }); assert.equal(t.atk(t.b.mz[1]), 700);
  t = setup(); t.run({ kind: 'status', st: 'str', to: 'random', tn: 2, op: 'sub', n: 100 }); assert.equal(t.atk(t.b.mz[0]) + t.atk(t.b.mz[1]), 1300);
  t = setup(); t.run({ kind: 'status', st: 'str', to: 'all', n: 20 }); assert.equal(t.b.str, 20); assert.equal(t.atk(t.b.mz[0]), 620);
  t = setup(); t.run({ kind: 'status', st: 'dex', op: 'sub', dur: 'turn', n: 20 }); assert.equal(t.b.dex, -20); assert.equal(t.b.dexTemp, -20);
  t = setup(); t.run({ kind: 'status', st: 'charm', to: 'random' }, 'src'); assert.equal([t.b.mz[0], t.b.mz[1]].filter(m => m.charm).length, 1);
  t = setup(); t.run({ kind: 'status', st: 'weak', to: 'mons', n: 1 }); assert.ok(!t.b.weak); assert.equal(t.b.mz[0].weak, 1);
});

test('状態を消す（回復）: デバフすべて・1つだけ減らす・相手のバフを消す', () => {
  let t = setup(); Object.assign(t.a, { vuln: 2, weak: 1, str: -20, strTemp: -20, dex: 10 }); t.a.mz[1].charm = { mu: 99 }; t.a.mz[1].vuln = 1; t.a.mz[1].str = -100;
  t.run({ kind: 'cleanse', to: 'all' }); assert.equal(t.a.vuln, 0); assert.equal(t.a.weak, 0); assert.equal(t.a.str, 0); assert.equal(t.a.strTemp, 0); assert.equal(t.a.dex, 10);
  assert.ok(!t.a.mz[1].charm); assert.equal(t.a.mz[1].vuln, 0); assert.equal(t.a.mz[1].str, 0);
  t = setup(); t.a.vuln = 3; t.run({ kind: 'cleanse', what: 'vuln', how: 'reduce', n: 1 }); assert.equal(t.a.vuln, 2);
  t = setup(); t.b.str = 60; t.b.strTemp = 20; t.run({ kind: 'cleanse', who: 'op', what: 'str' }); assert.equal(t.b.str, 0); assert.equal(t.b.strTemp, 0);
  t = setup(); t.b.mz[1].str = 300; t.run({ kind: 'cleanse', who: 'op', to: 'one', what: 'str', how: 'reduce', n: 100 }); assert.equal(t.b.mz[1].str, 200);
});

test('status・cleanse: 旧効果からの変換・保存・文', () => {
  const t = setup(), norm = f => ({ ...t.js('fxNorm')(f) }), clean = f => ({ ...t.js('cleanEff')(f) }), st = t.js('statusText'), cl = t.js('cleanseText');
  assert.deepEqual(norm({ kind: 'oppStrDown', n: 20 }), { kind: 'status', n: 20, st: 'str', to: 'p', op: 'sub', dur: 'turn' });
  assert.deepEqual(norm({ kind: 'vulnAll', n: 1, side: 'me' }), { kind: 'status', n: 1, st: 'vuln', to: 'all', side: 'me' });
  assert.equal(norm({ kind: 'charmAll' }).to, 'all');
  const c = clean({ kind: 'status', st: 'str', to: 'random', tn: 2, op: 'sub', dur: 'turn', side: 'me', n: 100 });
  assert.equal(c.st, 'str'); assert.equal(c.to, 'random'); assert.equal(c.tn, 2); assert.equal(c.op, 'sub'); assert.equal(c.dur, 'turn'); assert.equal(c.side, 'me');
  const d = clean({ kind: 'cleanse', who: 'op', to: 'mons', what: 'weak', how: 'reduce', n: 1 }); assert.equal(d.who, 'op'); assert.equal(d.to, 'mons'); assert.equal(d.what, 'weak'); assert.equal(d.how, 'reduce');
  assert.equal(st({ st: 'vuln', n: 2 }), '相手を弱体2にする');
  assert.equal(st({ st: 'weak', to: 'random', tn: 2, n: 1 }), 'ランダムな敵（相手か相手のモンスター）を脱力1にする（2回）');
  assert.equal(st({ st: 'str', op: 'sub', dur: 'turn', n: 20 }), '相手の次のターンの終わりまで、相手は筋力を20失う');
  assert.equal(st({ st: 'str', side: 'me', to: 'this', n: 100 }), 'このモンスターは筋力100を得る（モンスターは ATK+100）');
  assert.equal(cl({ to: 'all' }), '自分と自分のモンスターすべてのデバフ（弱体・脱力・魅了・マイナスの筋力と敏捷）をすべて取り除く');
  assert.equal(cl({ who: 'op', what: 'str' }), '相手の筋力をすべて取り除く');
});
test('筋力をモンスター1体に: 保存しても「1体えらぶ」のまま', () => {
  const t = setup(), c = { ...t.js('cleanEff')({ kind: 'status', st: 'str', to: 'one', n: 100 }) };
  assert.equal(c.to, 'one'); assert.equal(t.js('statusText')(c), '相手のモンスター1体は筋力100を得る（モンスターは ATK+100）');
  assert.equal(t.js('fxNorm')({ ...t.js('cleanEff')({ kind: 'status', st: 'str', to: 'p', n: 20 }) }).to, 'p');
});
