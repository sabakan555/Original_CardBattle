import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const effectsSource = fs.readFileSync(new URL("../src/js/01-effects.js", import.meta.url), "utf8");
const engineSource = fs.readFileSync(new URL("../src/js/07-engine.js", import.meta.url), "utf8");

function declaration(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} should exist`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not read ${marker}`);
}
const line = marker => effectsSource.split("\n").find(l => l.startsWith(marker));

test("相手のターンのはじめ・終わりをモンスター・装備・永続で選べる", () => {
  const ctx = {};
  vm.runInNewContext([line("const TRIGS ="), line("const MON_TRIGS ="), line("const EQ_TRIGS ="), line("const PERSIST_TRIG_LABEL ="), "out = { TRIGS, MON_TRIGS, EQ_TRIGS, PERSIST_TRIG_LABEL };"].join("\n"), ctx);
  const { TRIGS, MON_TRIGS, EQ_TRIGS, PERSIST_TRIG_LABEL } = ctx.out;
  assert.equal(TRIGS.oppTurnStart, "相手のターンのはじめ");
  assert.equal(TRIGS.oppTurnEnd, "相手のターンの終わり");
  for (const k of ["oppTurnStart", "oppTurnEnd"]) {
    assert.ok(MON_TRIGS.includes(k)); assert.ok(EQ_TRIGS.includes(k)); assert.ok(PERSIST_TRIG_LABEL[k]);
  }
});

function harness(st) {
  const ran = [];
  const card = c => c;
  const context = {
    P: (st, s) => st[s], card,
    hasTrig: (c, trig) => (c.trigs || []).includes(trig),
    monTrigList: (st, s, i, trig) => [{ s, c: st[s].mz[i].c, trig }],
    persistList: (st, s, trig) => st[s].sz.filter(c => c.trigs.includes(trig)).map(c => ({ s, c, trig })),
    runList: (st, L, then) => { L.forEach(x => ran.push([x.s, x.c.name, x.trig])); then && then(st); },
    runTimers: () => {}, runBoons: () => {}, etherealEnd: () => {}, altarTurn: () => {},
    fieldCard: () => null, anySumAsk: (st, who, then) => then && then(st), log: () => {},
  };
  vm.runInNewContext(declaration(engineSource, "function fireTurn") + "; api = { fireTurn };", context);
  return { fire: (who, trig) => context.api.fireTurn(st, who, trig, null), ran };
}

test("ターンを迎えていない側の「相手のターン」効果だけが、持ち主の効果のあとに出る", () => {
  const mon = (name, trigs) => ({ c: { name, trigs } });
  const st = {
    a: { mz: [mon("A自分", ["turnStart"]), mon("A相手", ["oppTurnStart", "oppTurnEnd"])], sz: [{ name: "A永続", trigs: ["oppTurnStart"] }], boons: [], timers: [] },
    b: { mz: [mon("B自分", ["turnStart"]), mon("B相手", ["oppTurnStart"])], sz: [{ name: "B永続", trigs: ["oppTurnEnd"] }], boons: [], timers: [] },
  };
  const h = harness(st);
  h.fire("b", "turnStart");
  assert.deepEqual(h.ran, [["b", "B自分", "turnStart"], ["a", "A相手", "oppTurnStart"], ["a", "A永続", "oppTurnStart"]]);
  h.ran.length = 0;
  h.fire("a", "turnEnd");
  assert.deepEqual(h.ran, [["b", "B永続", "oppTurnEnd"]]);
});
