import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
// ATKを変える効果（ATKアップ・ダウン・○にする・○倍・元に戻す・このターンだけ・場にいる間）
// 古い効果（selfAtk / atkDownAll …）で作られたカードが、今までどおりに動くことを確かめる
function setup(){
  const ctx = {};
  vm.createContext(ctx);
  for (const f of ['00-helpers.js', '01-effects.js', '07-engine.js']) vm.runInContext(read('js/' + f), ctx, { filename: f });
  const js = code => vm.runInContext(code, ctx);
  js(`ev=()=>{};persistFire=(st,s,k,x,then)=>then&&then(st);`);
  const S = js('S'); ctx.S = S;
  for (const [id, atk] of [['src', 1000], ['a1', 500], ['a2', 800], ['b1', 600], ['b2', 900], ['b3', 300]]) ctx.S.cards.set(id, { id, name: id, type: 'monster', atk });
  ctx.S.cards.set('spell', { id: 'spell', name: 'spell', type: 'magic' });
  const player = () => ({ name: 'p', deck: [], hand: [], grave: [], exile: [], mz: [null, null, null, null, null], sz: [null, null], lp: 1000 });
  const st = { players: { a: player(), b: player() }, turn: 'a', turnNo: 3, log: [], ev: [] };
  let u = 1; const mon = c => ({ c, u: u++, eqs: [], born: 0 });
  const a = st.players.a, b = st.players.b;
  a.mz[0] = mon('src'); a.mz[1] = mon('a1'); a.mz[2] = mon('a2');
  b.mz[0] = mon('b1'); b.mz[1] = mon('b2'); b.mz[2] = mon('b3');
  ctx.__st = st; js('G = { st: __st, slot: null, chooseQ: [] }');
  const atk = m => js('atkOf')(m);
  const atks = p => p.mz.filter(Boolean).map(atk);
  // src（a.mz[0]）が出した効果として、CPU（自動でえらぶ）で動かす
  const run = (...effs) => { const c = ctx.S.cards.get('src'); js('runEffects')(st, 'a', c, effs, { zone: 0, mon: { s: 'a', i: 0, u: a.mz[0].u }, hit: {} }, null); };
  const spell = (...effs) => js('runEffects')(st, 'a', ctx.S.cards.get('spell'), effs, { hit: {} }, null);
  return { ctx, st, a, b, atk, atks, run, spell, mon };
}

test('このモンスター: アップ・ダウン・○倍', () => {
  let t = setup(); t.run({ kind: 'selfAtk', n: 100 }); assert.deepEqual(t.atks(t.a), [1100, 500, 800]);
  t = setup(); t.run({ kind: 'selfAtkDown', n: 100 }); assert.deepEqual(t.atks(t.a), [900, 500, 800]);
  t = setup(); t.run({ kind: 'atkMul', n: 2 }); assert.deepEqual(t.atks(t.a), [2000, 500, 800]);
  assert.deepEqual(t.atks(t.b), [600, 900, 300]);
});

test('自分のモンスター: 1体アップはCPUだと一番強いモンスター、全体アップ・全体ダウン', () => {
  let t = setup(); t.spell({ kind: 'atkUp', n: 100 }); assert.deepEqual(t.atks(t.a), [1100, 500, 800]);
  t = setup(); t.spell({ kind: 'atkAll', n: 100 }); assert.deepEqual(t.atks(t.a), [1100, 600, 900]);
  t = setup(); t.spell({ kind: 'atkUp', n: 100, to: 'all' }); assert.deepEqual(t.atks(t.a), [1100, 600, 900]);
  t = setup(); t.spell({ kind: 'myAtkDownAll', n: 100 }); assert.deepEqual(t.atks(t.a), [900, 400, 700]);
  t = setup(); t.spell({ kind: 'myAtkDown', n: 100 }); assert.equal(t.atks(t.a).reduce((x, y) => x + y), 2200);
  assert.deepEqual(t.atks(t.b), [600, 900, 300]);
});

test('相手のモンスター: 1体ダウン（CPUは一番強いもの）・全体ダウン・自分側にも向けられる', () => {
  let t = setup(); t.spell({ kind: 'atkDown', n: 100 }); assert.deepEqual(t.atks(t.b), [600, 800, 300]);
  t = setup(); t.spell({ kind: 'atkDown', n: 100, to: 'all' }); assert.deepEqual(t.atks(t.b), [500, 800, 200]);
  t = setup(); t.spell({ kind: 'atkDownAll', n: 100 }); assert.deepEqual(t.atks(t.b), [500, 800, 200]);
  t = setup(); t.spell({ kind: 'atkDownAll', n: 100, side: 'me' }); assert.deepEqual(t.atks(t.a), [900, 400, 700]); assert.deepEqual(t.atks(t.b), [600, 900, 300]);
  t = setup(); t.spell({ kind: 'atkDown', n: 100, side: 'me' }); assert.deepEqual(t.atks(t.b), [600, 900, 300]); assert.equal(t.atks(t.a).reduce((x, y) => x + y), 2200);
});

test('このターンだけのダウンは tmp に入り、ターンのしるしが付く', () => {
  let t = setup(); t.spell({ kind: 'atkDownTmp', n: 200 }); assert.deepEqual(t.atks(t.b), [600, 700, 300]); assert.equal(t.b.mz[1].tmp, -200); assert.equal(t.b.mz[1].tmpBy, 'a'); assert.ok(!t.b.mz[1].mod);
  t = setup(); t.spell({ kind: 'atkDownTmpAll', n: 200 }); assert.deepEqual(t.atks(t.b), [400, 700, 100]); assert.ok(t.b.mz.filter(Boolean).every(m => m.tmp === -200));
  t = setup(); t.spell({ kind: 'atkDownTmp', n: 200, to: 'all' }); assert.deepEqual(t.atks(t.b), [400, 700, 100]);
});

test('○にする・0にする・元に戻す', () => {
  let t = setup(); t.spell({ kind: 'atkSet', n: 100 }); assert.deepEqual(t.atks(t.b), [600, 100, 300]);
  t = setup(); t.spell({ kind: 'atkSetAll', n: 100 }); assert.deepEqual(t.atks(t.b), [100, 100, 100]);
  t = setup(); t.spell({ kind: 'atkSet', n: 100, to: 'all' }); assert.deepEqual(t.atks(t.b), [100, 100, 100]);
  t = setup(); t.spell({ kind: 'atkZero' }); assert.deepEqual(t.atks(t.b), [600, 0, 300]);
  t = setup(); t.b.mz[1].mod = 500; t.a.mz[1].mod = 200; t.spell({ kind: 'atkReset' }); assert.deepEqual(t.atks(t.b), [600, 900, 300]); assert.deepEqual(t.atks(t.a), [1000, 700, 800]);
  t = setup(); t.b.mz[1].mul = 2; t.b.mz[1].tmp = -100; t.b.mz[1].tmpBy = 'a'; t.spell({ kind: 'atkReset' }); assert.deepEqual(t.atks(t.b), [600, 900, 300]); assert.ok(!t.b.mz[1].tmp);
});

test('しぼりこみ（ATK○以上）は全体の効果にだけかかる', () => {
  const t = setup(); t.spell({ kind: 'atkDownAll', n: 100, mfK: 'atk', mfOp: 'ge', mfN: 600 }); assert.deepEqual(t.atks(t.b), [500, 800, 300]);
});

test('場にいる間: 自分・自分全体・相手全体のATKが変わり、いなくなると戻る', () => {
  const t = setup();
  const set = (...then) => t.ctx.S.cards.set('src', { ...t.ctx.S.cards.get('src'), blocks: [{ trig: 'while', conds: [], join: 'and', then, else: [] }] });
  set({ kind: 'selfAtk', n: 100 }); assert.deepEqual(t.atks(t.a), [1100, 500, 800]);
  set({ kind: 'atkUp', n: 100 }); assert.deepEqual(t.atks(t.a), [1100, 500, 800]);
  set({ kind: 'atkAll', n: 100 }); assert.deepEqual(t.atks(t.a), [1100, 600, 900]); assert.deepEqual(t.atks(t.b), [600, 900, 300]);
  set({ kind: 'myAtkDownAll', n: 100 }); assert.deepEqual(t.atks(t.a), [900, 400, 700]);
  set({ kind: 'atkDownAll', n: 100 }); assert.deepEqual(t.atks(t.b), [500, 800, 200]); assert.deepEqual(t.atks(t.a), [1000, 500, 800]);
  set({ kind: 'atkDown', n: 100, to: 'all', side: 'me' }); assert.deepEqual(t.atks(t.a), [900, 400, 700]);
  set({ kind: 'atkMul', n: 2 }); assert.deepEqual(t.atks(t.a), [2000, 500, 800]);
  set({ kind: 'atkDown', n: 100 }, { kind: 'atkSet', n: 0 }); assert.deepEqual(t.atks(t.b), [600, 900, 300]);
  set({ kind: 'atkAll', n: 100 }); t.a.mz[0] = null; assert.deepEqual(t.atks(t.a), [500, 800]);
});

test('新しい形 atk: 今までなかった組み合わせも動く', () => {
  let t = setup(); t.spell({ kind: 'atk', op: 'add', n: 300, to: 'all', side: 'me', dur: 'turn' }); assert.deepEqual(t.atks(t.a), [1300, 800, 1100]); assert.ok(t.a.mz.filter(Boolean).every(m => m.tmp === 300 && !m.mod));
  t = setup(); t.spell({ kind: 'atk', op: 'mul', n: 2, to: 'all' }); assert.deepEqual(t.atks(t.b), [1200, 1800, 600]);
  t = setup(); t.spell({ kind: 'atk', op: 'add', n: 100 }); assert.equal(t.atks(t.b).reduce((x, y) => x + y), 1900);
  t = setup(); t.spell({ kind: 'atk', op: 'sub', n: 100, to: 'random' }); assert.equal(t.atks(t.b).reduce((x, y) => x + y), 1700);
  t = setup(); t.spell({ kind: 'atk', op: 'sub', n: 100, to: 'two' }); assert.equal(t.atks(t.b).reduce((x, y) => x + y), 1600); assert.equal(t.b.mz.filter(m => m && m.mod === -100).length, 2);
});

test('0にするは「ATKを0にする」と同じ: あとからのアップは上に足される', () => {
  const t = setup(); t.spell({ kind: 'atkZero' }); assert.equal(t.atk(t.b.mz[1]), 0);
  t.b.mz[1].mod += 100; assert.equal(t.atk(t.b.mz[1]), 100);
});

test('場にいる間: 新しい形の全体ダウン・このターンだけは場にいる間には効かない', () => {
  const t = setup();
  const set = (...then) => t.ctx.S.cards.set('src', { ...t.ctx.S.cards.get('src'), blocks: [{ trig: 'while', conds: [], join: 'and', then, else: [] }] });
  set({ kind: 'atk', op: 'sub', n: 100, to: 'all' }); assert.deepEqual(t.atks(t.b), [500, 800, 200]);
  set({ kind: 'atk', op: 'sub', n: 100, to: 'all', dur: 'turn' }); assert.deepEqual(t.atks(t.b), [600, 900, 300]);
});

test('効果の文は中身から作られる', () => {
  const { ctx } = setup(), txt = f => vm.runInContext('atkText', ctx)(f);
  assert.equal(txt({ op: 'sub', n: 200, to: 'all', dur: 'turn' }), 'このターンの間、相手のモンスターすべてのATK−200');
  assert.equal(txt({ op: 'add', n: 300, to: 'one', side: 'me' }), '自分のモンスター1体のATK+300');
  assert.equal(txt({ op: 'mul', n: 2, to: 'this' }), 'このモンスターのATKを2倍にする');
  assert.equal(txt({ op: 'set', n: 0 }), '相手のモンスター1体のATKを0にする');
  assert.equal(vm.runInContext('fxNorm', ctx)({ kind: 'atkDownTmpAll', n: 100, side: 'me' }).to, 'all');
});

test('ふえる: 墓地のカードの枚数につきATKダウン（自分・相手・お互い）', () => {
  let t = setup(); t.a.grave = ['spell', 'spell', 'spell']; t.b.grave = ['spell'];
  t.run({ kind: 'atk', op: 'sub', to: 'all', n: 0, per: 'myGrave', pm: 100 }); assert.deepEqual(t.atks(t.b), [300, 600, 0]);
  t = setup(); t.a.grave = ['spell', 'spell', 'spell']; t.b.grave = ['spell'];
  t.run({ kind: 'atk', op: 'sub', to: 'all', n: 0, per: 'oppGrave', pm: 100 }); assert.deepEqual(t.atks(t.b), [500, 800, 200]);
  t = setup(); t.a.grave = ['spell', 'spell', 'spell']; t.b.grave = ['spell'];
  t.run({ kind: 'atk', op: 'sub', to: 'all', n: 0, per: 'bothGrave', pm: 100 }); assert.deepEqual(t.atks(t.b), [200, 500, 0]);
});
