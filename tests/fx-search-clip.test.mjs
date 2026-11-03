import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const src = fs.readFileSync(new URL('../src/js/04b-fx-search-clip.js', import.meta.url), 'utf8');
const body = src.slice(0, src.indexOf('{ const box = $("#bkUI");'));
const kata2hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const ctx = { normQ: t => kata2hira(String(t || '').toLowerCase().normalize('NFKC')), btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
vm.createContext(ctx); vm.runInContext(body + ';this.fxSearch=fxSearch;this.bkReadCode=bkReadCode;this.b64u=b64u;this.bkFxCount=bkFxCount;this.BK_CODE=BK_CODE;', ctx);

const list = [
  { k: 'draw', label: '○枚引く', path: '引く', text: '○枚引く 引く' },
  { k: 'remove', label: '場から除去する（破壊・手札に戻す）', path: '破壊・除去', text: '場から除去する（破壊・手札に戻す） 破壊' },
  { k: 'handOut', label: '自分の手札を好きな枚数えらんで捨てる（0枚もOK）', path: 'よく使う組み合わせ', text: '自分の手札を好きな枚数えらんで捨てる 好きな枚数 捨てる', extra: 0 },
];
const ks = q => JSON.parse(JSON.stringify(ctx.fxSearch(q, list).map(x => x.k)));
test('言葉で効果をさがせる（ひらがな・カタカナどちらでも）', () => {
  assert.deepEqual(ks('引く'), ['draw']);
  assert.deepEqual(ks('ばうんす'), ['remove']);
  assert.deepEqual(ks('どろー'), ['draw']);
  assert.deepEqual(ks('好きな枚数'), ['handOut']);
});
test('言いかえでもさがせる', () => {
  assert.deepEqual(ks('ドロー'), ['draw']);
  assert.deepEqual(ks('バウンス'), ['remove']);
  assert.deepEqual(ks('除去'), ['remove']);
});
test('スペース区切りはぜんぶ入っているものだけ・空なら出さない', () => {
  assert.deepEqual(ks('捨てる 好き'), ['handOut']);
  assert.deepEqual(ks('引く 破壊'), []);
  assert.deepEqual(ks('  '), []);
});
test('効果のコードは読みもどせる（日本語もそのまま）', () => {
  const blocks = [{ trig: 'use', conds: [], then: [{ kind: 'handOut', side: 'me', to: 'upto', how: 'grave' }], else: [] }];
  const code = ctx.BK_CODE + ctx.b64u(JSON.stringify({ v: 1, blocks, label: '「轟轟轟」の効果ブロック' }));
  const back = ctx.bkReadCode(' ' + code + '\n');
  assert.equal(back.label, '「轟轟轟」の効果ブロック');
  assert.deepEqual(JSON.parse(JSON.stringify(back.blocks)), blocks);
  assert.equal(ctx.bkReadCode('OCB1-xxxx'), null);
  assert.equal(ctx.bkReadCode('OCBK1-!!!'), null);
});
test('貼りつけで減った効果の数がわかる', () => {
  assert.equal(ctx.bkFxCount([{ then: [1, 2], else: [3] }, { then: [], dieBr: [{ then: [4] }, { then: [5, 6] }] }]), 6);
});
