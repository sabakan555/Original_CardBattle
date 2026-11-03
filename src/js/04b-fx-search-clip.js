/* ================= カード工房: 効果をさがす・効果ブロックのコピー／貼りつけ =================
   効果をさがす: 言葉で効果の種類をさがして、押すと「効果 ○」の「なにを」に足す（最後にさわった効果ブロック。なければ一番下）
   コピー／貼りつけ: 効果ブロックをこの端末に覚えておき、ほかのカードに貼りつける。コード（OCBK1-…）にもなるので、LINEなどで送れる */

// さがすときの言いかえ（左の言葉でさがすと、右の言葉が入っている効果も出す）
const FX_SYN = {
  "ドロー": ["引く", "引か"], "引く": ["ドロー"], "サーチ": ["山札から", "手札に加え"], "バウンス": ["手札に戻す"],
  "除去": ["破壊", "除外", "除去"], "ハンデス": ["捨てさせ"], "火力": ["ダメージ"], "バーン": ["ダメージ"],
  "トークン": ["生み出", "トークン"], "蘇生": ["墓地から"], "リアニメイト": ["墓地から"], "マナ加速": ["マナ"],
  "パンプ": ["ATK"], "強化": ["ATK", "アップ"], "弱体化": ["ダウン", "弱体"], "ミル": ["墓地に送る", "墓地へ送る"],
  "墓地肥やし": ["墓地に送る", "墓地へ送る"], "打ち消し": ["打ち消", "無効"], "ライフ": ["LP"], "踏み倒し": ["コストを払わずに", "タダ", "踏み倒"]
};
// よく使う組み合わせ（ふつうの一覧では作りにくい形を、そのまま足せるように）
const FX_SEARCH_EXTRA = [
  { label: "自分の手札を好きな枚数えらんで捨てる（0枚もOK）", words: "好きな枚数 任意 捨てる 手札 0枚", sg: "minus", e: { kind: "handOut", side: "me", to: "upto", how: "grave" } },
  { label: "相手のモンスター1体を破壊（直前に捨てた手札1枚につき1回）", words: "捨てた 枚数 ぶん につき 破壊 除去", e: { kind: "destroy", per: "discN", hits: true, hx: true } }
];
// いま「足す先」になる効果ブロック
function fxTargetBi(){ const L = MK.blocks || []; return L[MK.bkFocus] ? MK.bkFocus : L.length - 1; }
// その効果ブロックで使える効果の一覧（「なにを」の大きな分け方 › 細かい分け方 つき）
function fxSearchList(b){
  const tb = b && b.trig, all = mkKinds();
  const ks = tb === "while" ? all.filter(k => STATIC_KINDS.includes(k)) : !mkTrapOk(MK.type) && tb !== "oppAttack" ? all.filter(k => !ATK_REPLY.includes(k)) : all;
  const out = [], seen = new Set();
  superGroups(kindGroups(ks)).forEach(sup => sup.subs.forEach(sub => sub.v.forEach(([k, l]) => {
    const key = k + "|" + sub.g; if (seen.has(key)) return; seen.add(key);
    const f = famOf(k), fv = f && (f.v.find(x => x[0] === k) || [])[1];
    const label = f && fv ? `${f.label}（${fv}）` : (l || (KINDS[k] || {}).label || k);
    out.push({ k, sg: sub.g, label, path: sup.label === sub.label ? sup.label : `${sup.label} › ${sub.label}`, text: [label, l, (KINDS[k] || {}).label, sub.label, sup.label].filter(Boolean).join(" ") });
  })));
  FX_SEARCH_EXTRA.forEach((x, i) => { const e = fxNorm({ ...x.e }); if (ks.includes(e.kind)) out.push({ k: e.kind, sg: x.sg || null, label: x.label, path: "よく使う組み合わせ", text: x.label + " " + x.words, extra: i }); });
  return out;
}
// ことばで しぼる（スペース区切りはぜんぶ入っているもの）。名前に入っているほど上に
function fxSearch(q, list){
  const terms = normQ(q).split(/[\s、,]+/).filter(Boolean); if (!terms.length) return [];
  const syn = Object.entries(FX_SYN).map(([a, L]) => [normQ(a), L.map(normQ)]);
  const hit = (t, txt) => txt.includes(t) || syn.some(([a, L]) => a === t && L.some(w => txt.includes(w)));
  return list.map(x => { const lt = normQ(x.label), tt = normQ(x.text); if (!terms.every(t => hit(t, tt))) return null; return { ...x, sc: terms.filter(t => hit(t, lt)).length * 10 + (x.extra != null ? 5 : 0) - lt.length / 100 }; })
    .filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 12);
}
function fxToolsHTML(){
  return `<div class="fxs"><label class="fxs-l" for="fxQ">効果をさがす</label>`
    + `<input type="search" id="fxQ" placeholder="例: 捨てる・破壊・ドロー・好きな枚数" value="${esc(MK.fxQ || "")}" autocomplete="off" enterkeyhint="search">`
    + `<div class="note fxs-to" id="fxsTo"></div><div class="fxs-res" id="fxRes"></div></div>`
    + ((MK.blocks || []).length ? `<div class="bk-clipbar"><button type="button" class="small ghost" data-bkclip="copyAll">効果をぜんぶコピー</button></div>` : "");
}
function fxSearchRender(){
  const box = $("#fxRes"), to = $("#fxsTo"); if (!box || !to) return;
  const q = MK.fxQ || "";
  if (!q.trim()){ box.innerHTML = ""; to.textContent = ""; MK._fxRes = []; return; }
  const bi = fxTargetBi(), L = MK._fxRes = fxSearch(q, fxSearchList((MK.blocks || [])[bi]));
  to.textContent = bi >= 0 ? `押すと「効果 ${bi + 1}」の「なにを」に足します` : "押すと新しい効果ブロックを作って足します";
  box.innerHTML = L.length ? L.map((x, i) => `<button type="button" class="fxs-it" data-fxs="${i}"><b>${esc(x.label)}</b><span class="note">${esc(x.path)}</span></button>`).join("")
    : `<p class="note" style="margin:0">見つかりませんでした。ちがう言葉でさがしてみてね（例: 「引く」「ドロー」）</p>`;
}
function fxAddFromSearch(x){
  if (!MK.blocks.length) MK.blocks.push({ trig: mkTrigs()[0], join: "and", conds: [], then: [], else: [] });
  const bi = fxTargetBi(), b = MK.blocks[bi];
  const base = x.extra != null ? fxNorm(JSON.parse(JSON.stringify(FX_SEARCH_EXTRA[x.extra].e))) : { kind: x.k, n: defN(x.k) };
  const pre = FX_FORMS[base.kind] && FX_FORMS[base.kind].preset && x.sg ? FX_FORMS[base.kind].preset[x.sg] : null;
  b.then.push(setG({ ...(pre || {}), ...base }, x.sg || undefined));
  const j = b.then.length - 1;
  MK.fxQ = ""; MK.bkFocus = bi; renderBlocksUI();
  const row = document.querySelector(`#bkUI .bk[data-b="${bi}"] .bk-row[data-part="then"][data-i="${j}"]`);
  if (row){ row.classList.add("bk-new-row"); row.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => row.classList.remove("bk-new-row"), 1600); }
  toast(`「効果 ${bi + 1}」に「${x.label}」を足しました`);
}

/* ---- コピー／貼りつけ ---- */
const BK_CODE = "OCBK1-";
function bkClipGet(){ const c = ls.get("cb_bkClip", null); return c && Array.isArray(c.blocks) && c.blocks.length ? c : null; }
const bkClipLabel = (bs, from) => `${from ? `「${from}」の` : ""}${bs.length > 1 ? `効果ブロック${bs.length}つ` : "効果ブロック"}`;
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => { let b = s.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return decodeURIComponent(escape(atob(b))); };
// コピー: この端末に覚える＋コード（OCBK1-…）をクリップボードに
function bkClipSet(blocks, from){
  const bs = JSON.parse(JSON.stringify(blocks || [])).filter(b => b && typeof b === "object"); if (!bs.length) return null;
  const clip = { v: 1, blocks: bs, label: bkClipLabel(bs, from), t: Date.now() };
  ls.set("cb_bkClip", clip);
  try{ navigator.clipboard && navigator.clipboard.writeText(BK_CODE + b64u(JSON.stringify({ v: 1, blocks: bs, label: clip.label }))).catch(() => {}); }catch(e){}
  return clip;
}
function bkReadCode(s){
  const t = String(s || "").trim().replace(/\s+/g, ""); if (!t.startsWith(BK_CODE)) return null;
  try{ const d = JSON.parse(unb64u(t.slice(BK_CODE.length))); return d && Array.isArray(d.blocks) && d.blocks.length ? { blocks: d.blocks, label: String(d.label || "効果ブロック").slice(0, 60) } : null; }catch(e){ return null; }
}
const bkFxCount = L => L.reduce((t, b) => t + (b.then || []).length + (b.else || []).length + (b.dieBr || []).reduce((s, x) => s + (x.then || []).length, 0), 0);
// 貼りつけ: いまのカードの下に足す。このカードで使えない効果・いつ は、ふだんどおり直す（直したら知らせる）
function bkPaste(clip){
  const add = JSON.parse(JSON.stringify(clip.blocks)).filter(b => b && typeof b === "object");
  if (!add.length){ toast("貼りつける効果がありません"); return; }
  delete add[0].cont; delete add[0].alt;
  const trig0 = add.map(b => b.trig), before = bkFxCount(add), start = MK.blocks.length;
  MK.blocks.push(...add); bkNormalize();
  const got = MK.blocks.slice(start), lost = before - bkFxCount(got), moved = got.filter((b, i) => b.trig !== trig0[i]).length;
  MK.bkFocus = start; renderBlocksUI();
  const first = document.querySelector(`#bkUI .bk[data-b="${start}"]`); if (first) first.scrollIntoView({ block: "start", behavior: "smooth" });
  toast(`${clip.label}を貼りつけました${lost ? `。このカードでは使えない効果${lost}つは入れていません` : ""}${moved ? `。「いつ」を変えたブロックがあるので、たしかめてね` : ""}`);
}
function bkPasteHTML(){
  const c = bkClipGet();
  return `<div class="bk-paste">${c ? `<button type="button" class="small" data-bkclip="paste">📋 貼りつけ：${esc(c.label)}</button>` : ""}<button type="button" class="small ghost" data-bkclip="code">コードで貼りつけ</button></div>`;
}
function fxAfterRender(){ if (MK.fxQ) fxSearchRender(); }

{ const box = $("#bkUI");
  if (box){
    // 最後にさわった効果ブロックを覚える（さがした効果の足し先）
    const focus = e => { const bk = e.target.closest && e.target.closest(".bk[data-b]"); if (bk && MK.bkFocus !== +bk.dataset.b){ MK.bkFocus = +bk.dataset.b; if (MK.fxQ) fxSearchRender(); } };
    box.addEventListener("focusin", focus); box.addEventListener("pointerdown", focus);
    box.addEventListener("input", e => { if (e.target.id !== "fxQ") return; MK.fxQ = e.target.value; fxSearchRender(); });
    box.addEventListener("keydown", e => { if (e.target.id === "fxQ" && e.key === "Enter"){ e.preventDefault(); const x = (MK._fxRes || [])[0]; if (x) fxAddFromSearch(x); } });
    box.addEventListener("click", e => {
      const it = e.target.closest("[data-fxs]"); if (it){ const x = (MK._fxRes || [])[+it.dataset.fxs]; if (x) fxAddFromSearch(x); return; }
      const cp = e.target.closest("[data-bkcopy]"); if (cp){ const b = MK.blocks[+cp.dataset.bkcopy]; if (b && bkClipSet([b], ($("#mkName") || {}).value && $("#mkName").value.trim())){ renderBlocksUI(); toast(`「効果 ${+cp.dataset.bkcopy + 1}」をコピーしました。ほかのカードの「📋 貼りつけ」で使えます`); } return; }
      const cb = e.target.closest("[data-bkclip]"); if (!cb) return;
      const a = cb.dataset.bkclip;
      if (a === "copyAll"){ if (bkClipSet(MK.blocks, ($("#mkName") || {}).value && $("#mkName").value.trim())){ renderBlocksUI(); toast("効果をぜんぶコピーしました。ほかのカードの「📋 貼りつけ」で使えます"); } return; }
      if (a === "paste"){ const c = bkClipGet(); if (c) bkPaste(c); return; }
      if (a === "code"){ const s = prompt("効果のコード（OCBK1-…）を貼りつけてください"); if (!s) return; const c = bkReadCode(s); if (!c){ toast("効果のコードが読めませんでした"); return; } bkPaste(c); }
    });
  }
}
