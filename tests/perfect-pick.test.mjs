import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const engineSource = fs.readFileSync(new URL("../src/js/07-engine.js", import.meta.url), "utf8");
function declaration(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} should exist`);
  const brace = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not read ${marker}`);
}

function harness(human) {
  const ctx = { ran: [], logs: [], G: { chooseQ: [] } };
  vm.runInNewContext(`
    const isHumanHere = () => ${human};
    const fxOneName = e => e.kind;
    const effsText = (c, effs) => effs.map(e => e.kind).join();
    const log = (st, s, m) => logs.push(m);
    const runEffects = (st, s, c, effs, cx, then) => { ran.push(effs[0].kind); then && then(st); };
    ${declaration(engineSource, "function pickOne")}
    this.pickOne = pickOne;
  `, ctx);
  return ctx;
}
const effs = [{ kind: "draw" }, { kind: "dmg" }, { kind: "heal" }];

test("パーフェクト呪文: 人間は2回えらべて、同じものもOK", () => {
  const h = harness(true); let done = 0;
  h.pickOne({}, "a", { name: "P" }, effs, {}, () => done++, 2);
  assert.equal(h.G.chooseQ.length, 1);
  assert.match(h.G.chooseQ[0].fx.ask, /1\/2回目/);
  h.G.chooseQ.shift().p1go({}, 1);
  assert.equal(done, 0);
  assert.match(h.G.chooseQ[0].fx.ask, /2\/2回目/);
  h.G.chooseQ.shift().p1go({}, 1);
  assert.deepEqual([...h.ran], ["dmg", "dmg"]);
  assert.equal(done, 1);
});

test("CPUも2回えらぶ・ふつうの「または」は1回だけ", () => {
  const h = harness(false); let done = 0;
  h.pickOne({}, "b", { name: "P" }, effs, {}, () => done++, 2);
  assert.equal(h.ran.length, 2); assert.equal(done, 1);
  const h1 = harness(false);
  h1.pickOne({}, "b", { name: "P" }, effs, {}, () => {});
  assert.equal(h1.ran.length, 1);
});

test("決着がついたら残りの回はえらばない", () => {
  const h = harness(false); let done = 0;
  h.pickOne({ winner: "a" }, "a", { name: "P" }, effs, {}, () => done++, 3);
  assert.equal(h.ran.length, 1); assert.equal(done, 1);
});
