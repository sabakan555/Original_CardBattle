import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const dk = fs.readFileSync(new URL('../src/js/05-decks-viewer-mypage-account.js', import.meta.url), 'utf8');
const src = dk.slice(dk.indexOf('function deckWinRows('), dk.indexOf('function renderMatchHist('));
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.f=deckWinRows;', ctx);
test('win rate per deck, most-played first; unnamed decks grouped', () => {
  const H = [{ deck: 'A', res: 'w' }, { deck: 'A', res: 'l' }, { deck: 'A', res: 'w' }, { deck: 'B', res: 'd' }, { deck: '', res: 'w' }];
  const r = JSON.parse(JSON.stringify(ctx.f(H)));
  assert.deepEqual(r[0], { name: 'A', n: 3, w: 2, l: 1 });
  assert.deepEqual(r.find(x => x.name === 'B'), { name: 'B', n: 1, w: 0, l: 0 });
  assert.ok(r.some(x => x.name.includes('わからない') && x.w === 1));
});
