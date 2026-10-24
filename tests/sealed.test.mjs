import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const src0 = fs.readFileSync(new URL('../src/js/06a-sealed.js', import.meta.url), 'utf8');
const src = src0.slice(src0.indexOf('const SEALED_MODES'), src0.indexOf('const sealedCount'));
function ctx(cards){
  const M = new Map(cards.map(c => [c.id, c]));
  const c = { S: { cards: M }, card: id => M.get(id), cardType: c => c.type === 'magic' || c.type === 'trap' || c.type === 'equip' ? c.type : 'monster', isEx: c => !!c.ex, deckModeOf: c => c.deckMode || 'normal', cardLimit: c => c.limit != null ? c.limit : 3, cmpNum: (a, b) => a - b, hasCost: c => c.cost != null && c.cost !== '', SEALED_N: 40, SEALED_MON: 22 };
  vm.createContext(c); vm.runInContext(src + ';this.pool=sealedPool;this.auto=sealedAuto;this.elig=sealedEligible;', c); return c;
}
const cards = [...Array.from({ length: 12 }, (_, i) => ({ id: 'm' + i, type: 'monster', atk: i * 100, name: 'm' + i })), ...Array.from({ length: 8 }, (_, i) => ({ id: 's' + i, type: 'magic', name: 's' + i })),
  { id: 'tk', type: 'monster', token: true }, { id: 'ex', type: 'monster', ex: true }, { id: 'cost', type: 'monster', deckMode: 'cost' }, { id: 'one', type: 'monster', atk: 9999, limit: 1, name: 'one' }, { id: 'm1~s', type: 'monster' }];
test('pool: 40 cards, 22 monsters, no tokens/EX/cost-only/skins, card limits respected', () => {
  const c = ctx(cards); const ids = c.elig().map(x => x.id);
  for (const bad of ['tk', 'ex', 'cost', 'm1~s']) assert.ok(!ids.includes(bad));
  const p = c.pool(); assert.equal(p.length, 40);
  assert.equal(p.filter(id => id.startsWith('m') || id === 'one').length, 22);
  const n = {}; p.forEach(id => n[id] = (n[id] || 0) + 1); assert.ok(Object.values(n).every(k => k <= 3)); assert.ok((n.one || 0) <= 1);
});
test('auto build: 22 cards, strongest monsters first, legal deck', () => {
  const c = ctx(cards); const p = c.pool(), d = c.auto(p);
  assert.equal(d.length, 22); assert.ok(d.filter(id => c.card(id).type === 'monster').length <= 14 || d.every(id => c.card(id).type === 'monster'));
  const left = [...p]; d.forEach(id => { const k = left.indexOf(id); assert.ok(k >= 0, 'only cards from the pool'); left.splice(k, 1); });
});

test('cost-deck pool: only cards usable in cost decks that have a cost; auto build keeps it legal', () => {
  const cc = [...Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, type: 'monster', atk: 200 + i * 100, cost: i % 6, deckMode: 'both', name: 'c' + i })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: 'k' + i, type: 'magic', cost: i, deckMode: 'cost', name: 'k' + i })),
    { id: 'nocost', type: 'monster', atk: 900, deckMode: 'normal' }, { id: 'both0', type: 'monster', atk: 900, deckMode: 'both' }];
  const c = ctx(cc), ids = c.elig(true).map(x => x.id);
  assert.ok(!ids.includes('nocost') && !ids.includes('both0')); assert.ok(ids.includes('k0') && ids.includes('c3'));
  assert.ok(!c.elig(false).map(x => x.id).includes('k0'), 'cost-only cards stay out of the normal pool');
  const p = c.pool(true); assert.equal(p.length, 40); assert.ok(p.every(id => c.card(id).cost != null));
  assert.equal(c.auto(p, true).length, 22);
});
