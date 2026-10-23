import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const dk = read('js/05-decks-viewer-mypage-account.js'), mk = read('js/04-maker.js');

test('deck code round-trips cards, counts and options (Japanese names too)', () => {
  const src = dk.slice(dk.indexOf('const DK_CODE'), dk.indexOf('$("#btnDeckCode")'));
  const el = { '#deckName': { value: 'かわいい軍団' }, '#deckMana': { checked: true }, '#deckZone': { checked: false }, '#deckLand': { checked: false }, '#deckSpire': { checked: false }, '#deckSpc': { value: '' }, '#deckShield': { checked: true }, '#deckNolim': { checked: false }, '#deckMull': { checked: true } };
  const ctx = { S: { deckEdit: { cards: { c1: 3, 'c2~s1': 1, c3: 0 }, key: 'c1' } }, $: q => el[q], btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent };
  vm.createContext(ctx); vm.runInContext(src + ';this.enc=deckCode;this.dec=readDeckCode;', ctx);
  const code = ctx.enc();
  assert.match(code, /^OCB1-[A-Za-z0-9_-]+$/);
  const d = ctx.dec('  ' + code + '\n');
  assert.equal(d.name, 'かわいい軍団'); assert.deepEqual([...d.cards].sort(), ['c1', 'c1', 'c1', 'c2~s1']);
  assert.equal(d.key, 'c1'); assert.equal(d.mana, true); assert.equal(d.shield, true); assert.equal(d.mull, true); assert.equal(d.spire, undefined);
  assert.equal(ctx.dec('hello'), null); assert.equal(ctx.dec('OCB1-%%%'), null);
});
test('edit history keeps the old name/numbers/text, newest first, max 10, skips art-only edits', () => {
  const src = mk.slice(mk.indexOf('const HIST_MAX'), mk.indexOf('// 保存するときのカードの中身'));
  const ctx = { S: { name: 'サバ缶' }, fxText: c => c.fx || '' }; vm.createContext(ctx); vm.runInContext(src + ';this.h=cardHist;', ctx);
  const a = { type: 'monster', name: 'A', atk: 300, fx: 'x' };
  assert.equal(ctx.h(a, { ...a, img: 'new' }), null);
  const h1 = ctx.h(a, { ...a, atk: 500 });
  assert.equal(h1.length, 1); assert.equal(h1[0].atk, 300); assert.equal(h1[0].by, 'サバ缶');
  let prev = { ...a, atk: 500, hist: h1 };
  for (let i = 0; i < 12; i++){ const next = { ...prev, atk: prev.atk + 1 }; prev = { ...next, hist: ctx.h(prev, next) }; }
  assert.equal(prev.hist.length, 10); assert.equal(prev.hist[0].atk, 511);
});
