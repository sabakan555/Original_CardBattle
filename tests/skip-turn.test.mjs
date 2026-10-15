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

test("skipTurn is a common effect with the intended card text", () => {
  const object = declaration(effectsSource, "const KINDS =").replace(/^const KINDS\s*=\s*/, "");
  const context = {};
  vm.runInNewContext(`KINDS = ${object}`, context);
  assert.equal(context.KINDS.skipTurn.label, "このターンの残りを飛ばす");
  assert.equal(context.KINDS.skipTurn.text(), "このターンの残りを飛ばす");
  assert.equal(context.KINDS.skipTurn.mon, undefined);
  assert.equal(context.KINDS.skipTurn.trap, undefined);
  assert.equal(context.KINDS.skipTurn.chain, undefined);
  for (const type of ["monster", "magic", "trap"]) {
    const effect = context.KINDS.skipTurn;
    const available = (!effect.trap || type === "trap") && (!effect.mon || type === "monster") && (!effect.chain || type === "trap" || type === "magic");
    assert.equal(available, true, `${type} can use skipTurn`);
  }
});

function turnHarness() {
  const calls = [];
  const code = [
    declaration(engineSource, "function turnEnding"),
    declaration(engineSource, "function requestTurnEnd"),
    declaration(engineSource, "function flushTurnEndRequest"),
  ].join("\n");
  const context = {
    calls,
    log: (st, s, text) => calls.push(["log", s, text]),
    endTurn: (st, s) => calls.push(["endTurn", s]),
  };
  vm.runInNewContext(`${code}; api = { requestTurnEnd, flushTurnEndRequest };`, context);
  return context;
}

test("the effect ends the active turn only after resolution is idle", () => {
  const h = turnHarness();
  const st = { turn: "b", turnNo: 7, pending: { type: "chain" } };
  h.api.requestTurnEnd(st, "a", { name: "時飛ばし" });
  assert.deepEqual({ ...st.endTurnRequested }, { s: "b", no: 7 });
  assert.equal(h.api.flushTurnEndRequest(st), false);
  assert.equal(h.calls.some(([kind]) => kind === "endTurn"), false);

  st.pending = null;
  st.askQ = { to: "a" };
  assert.equal(h.api.flushTurnEndRequest(st), false);
  assert.equal(h.calls.some(([kind]) => kind === "endTurn"), false);

  st.askQ = null;
  st.chain = [{ c: "another-effect" }];
  assert.equal(h.api.flushTurnEndRequest(st), false);
  assert.equal(h.calls.some(([kind]) => kind === "endTurn"), false);

  st.chain = [];
  st.pending = null;
  assert.equal(h.api.flushTurnEndRequest(st), true);
  assert.equal(st.endTurnRequested, undefined);
  assert.deepEqual(h.calls.at(-1), ["endTurn", "b"]);
});

test("a stale request cannot end the next turn", () => {
  const h = turnHarness();
  const st = { turn: "a", turnNo: 4, endTurnRequested: { s: "b", no: 3 } };
  assert.equal(h.api.flushTurnEndRequest(st), false);
  assert.equal(st.endTurnRequested, undefined);
  assert.equal(h.calls.length, 0);
});

test("an end-turn response cannot schedule a second ending", () => {
  const h = turnHarness();
  const st = { turn: "a", turnNo: 2, pending: { type: "chain", resume: { type: "end" } } };
  h.api.requestTurnEnd(st, "b", { name: "時飛ばし" });
  assert.equal(st.endTurnRequested, undefined);
  assert.match(h.calls[0][2], /すでに終了中/);
});
