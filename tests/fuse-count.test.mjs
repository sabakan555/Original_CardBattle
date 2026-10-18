import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// フュージョンの回数: 「このカードにフュージョンしたとき」・「自分がフュージョンしたとき」・回数の条件とふえる
function setup(){
  const ctx = {}; vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>{then&&then(st);};hasAltar=()=>false;ctrTrigs=()=>[];SPIRE_BASIC=[];slyFire=()=>{};ctrPayWhy=()=>'';ctrPay=()=>{};ctrCostText=()=>'';ctrFire=()=>{};payCtrOf=()=>null;`);
  const S = js('S');
  const blk = (trig, then, conds = []) => ({ trig, join: 'and', conds, then, else: [] });
  S.cards.set('m', { id: 'm', name: 'm', type: 'monster', atk: 100 });
  // 3回目のフュージョンのとき2枚引く・フュージョンしたとき毎回100回復
  S.cards.set('f', { id: 'f', name: 'f', type: 'monster', atk: 1000, hf: { m: 'any' }, blocks: [
    blk('fuse', [{ kind: 'lp', n: 100 }]),
    blk('fuse', [{ kind: 'draw', n: 2 }], [{ k: 'hfTimes', op: 'eq', n: 3 }]),
    blk('summon', [{ kind: 'atk', op: 'add', to: 'this', n: 0, per: 'hfTimes', pm: 500 }])] });
  // 場にいる間、自分がフュージョンするたびATK+（今フュージョンした枚数×100）
  S.cards.set('w', { id: 'w', name: 'w', type: 'monster', atk: 0, blocks: [blk('myFuse', [{ kind: 'atk', op: 'add', to: 'this', n: 0, per: 'fuseN', pm: 100 }])] });
  S.cards.set('sp', { id: 'sp', name: 'sp', type: 'magic', hf: { m: 'any' }, blocks: [blk('fuse', [{ kind: 'lp', op: 'lose', who: 'op', n: 300 }]), blk('use', [{ kind: 'lp', n: 1 }])] });
  const player = () => ({ name: 'p', deck: ['m', 'm', 'm', 'm'], hand: [], grave: [], exile: [], mz: [null, null, null], sz: [null, null], lp: 4000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 1, log: [], ev: [], pending: null, un: 10 };
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  return { js, S, st, a: st.players.a, b: st.players.b, atk: m => js('atkOf')(m) };
}

test('このカードにフュージョンしたとき: 毎回の効果と「3回目」だけの効果、召喚したら回数でATKが上がる', () => {
  const t = setup(), fuse = () => t.js('fuseHand')(t.st, 'a', t.a.hand.indexOf('f'), [t.a.hand.findIndex(x => x === 'm')]);
  t.a.hand = ['f', 'm', 'm', 'm'];
  for (let r = 1; r <= 3; r++){ assert.equal(fuse(), true); t.st.turnNo++; }
  assert.equal(t.a.lp, 4300); assert.equal(t.a.hfX.f, 3); assert.equal(t.a.hfTotal, 3);
  assert.equal(t.a.hand.filter(x => x === 'm').length, 2); // 3回目で2枚引いた
  assert.equal(t.js('summon')(t.st, 'a', t.a.hand.indexOf('f'), null, [], []), true);
  const m = t.a.mz.find(x => x && x.c === 'f'); assert.equal(m.hfTimes, 3); assert.equal(t.atk(m), 2500);
});

test('自分がフュージョンしたとき（場のモンスター）・この試合の回数・魔法のフュージョンしたとき', () => {
  const t = setup(); t.a.mz[0] = { c: 'w', u: 1, eqs: [], born: 0 };
  t.a.hand = ['sp', 'm', 'm'];
  assert.equal(t.js('fuseHand')(t.st, 'a', 0, [1, 2]), true);
  assert.equal(t.atk(t.a.mz[0]), 200); assert.equal(t.b.lp, 3700);
  assert.equal(t.a.lp, 4000); // 「発動したとき」は動かない
  assert.equal(t.js('COND_DEFS').hfTotal.val(t.st, 'a'), 1);
});

test('文: トリガーの名前・回数の条件', () => {
  const t = setup(), sp = t.S.cards.get('sp');
  assert.equal(t.js('normTrig')(sp, 'fuse'), 'fuse');
  assert.match(t.js('blockText')(sp, sp.blocks[0]), /^【このカードにフュージョンしたとき（手札で）】/);
  const f = t.S.cards.get('f');
  assert.match(t.js('blockText')(f, f.blocks[1]), /このカードにフュージョンした回数が3回/);
});

test('手札のカード自身の「自分がフュージョンしたとき」: 3枚以上で変化し、変化先は0から数えなおす', () => {
  const t = setup();
  t.S.cards.set('j3', { id: 'j3', name: 'SCP-280-JP-3', type: 'monster', atk: 50, hf: { m: 'any' } });
  t.S.cards.set('j2', { id: 'j2', name: 'SCP-280-JP-2', type: 'monster', token: true, atk: 34, hf: { m: 'any' }, blocks: [
    { trig: 'myFuse', join: 'and', conds: [{ k: 'hfN', op: 'ge', n: 3 }], then: [{ kind: 'transformSelf', into: 'SCP-280-JP-3' }], else: [] }] });
  t.a.hand = ['j2', 'm', 'm'];
  t.js('fuseHand')(t.st, 'a', 0, [1, 2]); assert.deepEqual(t.a.hand, ['j2']); // まだ2枚
  t.st.turnNo++; t.a.hand.push('m');
  t.js('fuseHand')(t.st, 'a', 0, [1]);
  assert.deepEqual(t.a.hand, ['j3']); assert.ok(!t.a.hf.j3); assert.ok(!t.a.hfX.j3); assert.ok(!t.a.hf.j2); // 変化先は0から
  t.a.hand.push('m'); assert.equal(t.js('hfWhy')(t.st, 'a', 0), 'このターンはもうフュージョンした');
});
