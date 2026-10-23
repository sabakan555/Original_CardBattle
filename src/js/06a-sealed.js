/* ================= 開封バトル（シールド戦） =================
   パックを開けて出た40枚（図鑑のカードからランダム）だけでデッキを作り、そのデッキでCPU戦・オンライン対戦をする。
   開封デッキは「使うデッキ」に 📦 開封デッキ として出る（持っていないカードでも使える。この端末に保存） */
const SEALED_N = 40, SEALED_MON = 22, SEALED_ID = "__sealed";
S.sealed = (() => { const v = ls.get("cb_sealed", null); return v && Array.isArray(v.pool) ? { pool: v.pool, cards: Array.isArray(v.cards) ? v.cards : [], t: v.t || 0 } : null; })();
S.sealedEdit = null;
// 開封で出るカード: ふつうのデッキで使える、ふつうのカード（トークン・EX・スパイア・ポーションなどは出ない）
function sealedEligible(){
  return [...S.cards.values()].filter(c => c && c.id && !String(c.id).includes("~") && !c.skinOf && !c.tut && !c.token && !c.ctrCard && !c.potionView && !c.relicView && c.type !== "potion" && c.type !== "relic" && c.frame !== "spire" && !isEx(c) && ["normal", "both"].includes(deckModeOf(c)) && ["monster", "magic", "trap", "equip"].includes(cardType(c)));
}
function sealedPool(){
  const E = sealedEligible(), mons = E.filter(c => cardType(c) === "monster"), rest = E.filter(c => cardType(c) !== "monster");
  if (mons.length < 3) return null;
  const out = [], cnt = {};
  const draw = (L, n) => { let g = 0; while (n > 0 && L.length && g++ < 4000){ const c = L[Math.floor(Math.random() * L.length)], lim = cardLimit(c) || 99; if ((cnt[c.id] || 0) >= lim) continue; cnt[c.id] = (cnt[c.id] || 0) + 1; out.push(c.id); n--; } };
  draw(mons, rest.length ? SEALED_MON : SEALED_N); draw(rest, SEALED_N - out.length); draw(mons, SEALED_N - out.length);
  return out;
}
// おまかせで組む（CPUも使う）: 強いモンスター14枚まで＋魔法・罠・装備で22枚に
function sealedAuto(pool){
  const cs = pool.map(id => card(id)).filter(Boolean), atk = c => c.atkInf ? Infinity : +c.atk || 0;
  const mons = cs.filter(c => cardType(c) === "monster").sort((a, b) => cmpNum(atk(b), atk(a))), rest = cs.filter(c => cardType(c) !== "monster");
  const pick = [...mons.slice(0, 14), ...rest.slice(0, 22 - Math.min(14, mons.length))];
  for (const c of mons.slice(14)) if (pick.length < 22) pick.push(c);
  return pick.map(c => c.id);
}
const sealedCount = ids => ids.reduce((o, id) => (o[id] = (o[id] || 0) + 1, o), {});
function sealedDeckObj(){
  const s = S.sealed; if (!s || !s.cards.length) return null;
  const cards = s.cards.filter(id => S.cards.has(id)); if (!cards.length) return null;
  return { id: SEALED_ID, name: "📦 開封デッキ", cards, sealed: true, builtin: true };
}
function sealedSave(){ ls.set("cb_sealed", S.sealed); }
// いまのデッキの問題（なければ ""）
function sealedIssue(ids){
  if (ids.length < MIN_DECK) return `あと${MIN_DECK - ids.length}枚（${MIN_DECK}枚以上）`;
  if (!ids.some(id => cardType(card(id)) === "monster")) return "モンスターを1枚以上入れてね";
  return "";
}
function openSealed(fresh){
  if (fresh || !S.sealed){
    const pool = sealedPool(); if (!pool){ toast("開封できるカードがまだ足りません"); return; }
    S.sealed = { pool, cards: [], t: Date.now() }; sealedSave();
  }
  S.sealedEdit = { cards: S.sealed.cards.slice(), fresh: !!fresh };
  renderSealed(); $("#sealedDlg").hidden = false;
}
function closeSealed(){ $("#sealedDlg").hidden = true; $("#sealedDlg").innerHTML = ""; S.sealedEdit = null; }
function renderSealed(){
  const box = $("#sealedDlg"), E = S.sealedEdit; if (!E || !S.sealed) return;
  const pool = S.sealed.pool.filter(id => S.cards.has(id)), have = sealedCount(pool), used = sealedCount(E.cards);
  const order = id => { const c = card(id), t = cardType(c); return [t === "monster" ? 0 : t === "magic" ? 1 : t === "trap" ? 2 : 3, -(c.atkInf ? 1e9 : +c.atk || 0), c.name]; };
  const uniq = [...new Set(pool)].sort((a, b) => { const x = order(a), y = order(b); for (let k = 0; k < 3; k++){ if (x[k] < y[k]) return -1; if (x[k] > y[k]) return 1; } return 0; });
  const item = id => { const left = have[id] - (used[id] || 0); return `<div class="g-item sl-item${left ? "" : " out"}">${cardHTML(card(id), "sm pick", `data-sladd="${esc(id)}" tabindex="0" role="button" aria-label="${esc(card(id).name)}をデッキに入れる"`, {})}<div class="meta">${used[id] ? `<b>${used[id]}</b> / ` : ""}${have[id]}枚</div></div>`; };
  const deck = [...new Set(E.cards)].sort((a, b) => { const x = order(a), y = order(b); for (let k = 0; k < 3; k++){ if (x[k] < y[k]) return -1; if (x[k] > y[k]) return 1; } return 0; });
  const issue = sealedIssue(E.cards), nMon = E.cards.filter(id => cardType(card(id)) === "monster").length;
  box.innerHTML = `<div class="box sl-dlg" role="dialog" aria-modal="true" aria-label="開封バトル">
    <div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">📦 開封バトル${E.fresh ? "：パックを開けた！" : ""}</h2><button class="ghost" data-sl="close" aria-label="とじる">×</button></div>
    <p class="note" style="margin:0">出た${pool.length}枚の中から、${MIN_DECK}枚以上でデッキを作ろう。カードを押すとデッキに入る／デッキのカードを押すと外れる。</p>
    <div class="row sl-bar"><span class="meter ${issue ? "ng" : "ok"}">${E.cards.length}枚（モンスター ${nMon}）${issue ? "・" + esc(issue) : ""}</span><button class="small" data-sl="auto">おまかせで組む</button><button class="small ghost" data-sl="clear">ぜんぶ外す</button><button class="small ghost" data-sl="reroll">${E.reroll ? "本当に開け直す？（いまのカードは消えます）" : "パックを開け直す"}</button><button class="primary" data-sl="ok" ${issue ? "disabled" : ""}>このデッキで対戦する</button></div>
    <h3 style="margin:4px 0 0">デッキ</h3>
    <div class="gallery sl-deck">${deck.map(id => `<div class="g-item">${cardHTML(card(id), "sm pick", `data-slrm="${esc(id)}" tabindex="0" role="button" aria-label="${esc(card(id).name)}を外す"`, {})}<div class="meta">×${used[id]}</div></div>`).join("") || '<p class="muted">まだ入っていません</p>'}</div>
    <h3 style="margin:4px 0 0">開けたカード</h3>
    <div class="gallery sl-pool">${uniq.map(item).join("")}</div>
  </div>`;
}
$("#sealedDlg").addEventListener("click", e => {
  const E = S.sealedEdit; if (!E) return;
  if (e.target === $("#sealedDlg")){ closeSealed(); return; }
  const add = e.target.closest("[data-sladd]"), rm = e.target.closest("[data-slrm]"), b = e.target.closest("[data-sl]");
  if (add){ const id = add.dataset.sladd, have = S.sealed.pool.filter(x => x === id).length, used = E.cards.filter(x => x === id).length; if (used < have) E.cards.push(id); else toast("この枚数までしか入れられません"); renderSealed(); return; }
  if (rm){ const k = E.cards.indexOf(rm.dataset.slrm); if (k >= 0) E.cards.splice(k, 1); renderSealed(); return; }
  if (!b) return; const k = b.dataset.sl;
  if (k !== "reroll") E.reroll = false;
  if (k === "close"){ closeSealed(); return; }
  if (k === "auto"){ E.cards = sealedAuto(S.sealed.pool.filter(id => S.cards.has(id))); renderSealed(); return; }
  if (k === "clear"){ E.cards = []; renderSealed(); return; }
  if (k === "reroll"){ if (!E.reroll){ E.reroll = true; renderSealed(); return; } closeSealed(); openSealed(true); return; }
  if (k === "ok"){ if (sealedIssue(E.cards)) return; S.sealed.cards = E.cards.slice(); sealedSave(); ls.set("cb_deck", SEALED_ID); closeSealed(); S.tab = "play"; renderAll(); toast("開封デッキにしました。CPU戦か部屋を作って対戦してね"); return; }
});
$("#sealedDlg").addEventListener("keydown", e => { if (e.key === "Escape") closeSealed(); if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-sladd],[data-slrm]")){ e.preventDefault(); e.target.click(); } });
$("#btnSealed").addEventListener("click", () => openSealed(false));
// CPUの開封デッキ（自分とは別のパックを開ける）
function sealedCpuIds(){ const pool = sealedPool(); return pool ? sealedAuto(pool) : []; }
