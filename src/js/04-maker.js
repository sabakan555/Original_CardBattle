/* ================= maker ================= */
const cv = $("#cv"), cx = cv.getContext("2d");
const COLORS = ["#1e2328", "#e0533a", "#f29b38", "#f2c94c", "#4caf6e", "#3d8bd9", "#8e5bc9", "#f28fb5", "#8b5a3c", "#ffffff"];
const SIZES = [["細", 4], ["中", 9], ["太", 18], ["特太", 34]];
const pen = { color: COLORS[0], size: 9, erase: false };
const MK = { type: "monster", sk: null };
// スパイア風 kind being made (null for other frames)
function mkSk(){ if ($("#mkFrame").value !== "spire") return null; const t = MK.type; if (t === "magic") return $("#mkPersist").checked ? "power" : MK.sk === "attack" ? "attack" : "skill"; return t === "monster" ? "attack" : t === "trap" ? "power" : "skill"; }
let undoStack = [], drawing = false, last = null;
S.editId = null;
// layers: photo (movable background) + ink (pen strokes, transparent)
const ink = document.createElement("canvas"); ink.width = cv.width; ink.height = cv.height;
const ik = ink.getContext("2d");
let photo = null; // { img, x, y, s, base, r }
MK.mode = "draw";
function composite(){
  cx.setTransform(1, 0, 0, 1, 0, 0);
  if (MK.kind === "potion" || MK.kind === "relic") cx.clearRect(0, 0, cv.width, cv.height);
  else { cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); }
  if (photo){
    cx.save(); cx.translate(photo.x, photo.y); cx.rotate(photo.r); cx.scale(photo.s, photo.s);
    cx.drawImage(photo.img, -photo.img.width / 2, -photo.img.height / 2); cx.restore();
  }
  cx.drawImage(ink, 0, 0);
  if (MK.mode === "photo"){ cx.strokeStyle = "rgba(224,83,58,.9)"; cx.lineWidth = 6; cx.setLineDash([14, 10]); cx.strokeRect(3, 3, cv.width - 6, cv.height - 6); cx.setLineDash([]); }
}
MK.frameless = false;
// キャンバスの高さを変える（横は560のまま。描いた線はそのまま、写真は入るように拡大しなおす）
function resizeCv(H){
  if (cv.height === H) return;
  const keep = document.createElement("canvas"); keep.width = ink.width; keep.height = ink.height; keep.getContext("2d").drawImage(ink, 0, 0);
  cv.height = H; ink.height = H; ik.drawImage(keep, 0, 0);
  if (photo){ const nb = Math.max(cv.width / photo.img.width, cv.height / photo.img.height); photo.s *= nb / photo.base; photo.base = nb; }
  undoStack = []; MK.artDirty = true;
}
// 枠ごとに絵の欄の縦横比がちがう（遊戯王風・近未来・MTG風…）ので、キャンバスをその比率に合わせる
// → 「大きく描く」でも、カードに出るのと同じ形で描ける
function fitCanvas(){
  if (MK.kind === "potion" || MK.kind === "relic") return;
  const a = document.querySelector("#editCard .c-art"); if (!a) return;
  const r = a.getBoundingClientRect(); if (r.width < 20 || r.height < 20) return;
  const H = Math.max(240, Math.min(900, Math.round(cv.width * r.height / r.width)));
  if (Math.abs(cv.height - H) <= 2) return;
  resizeCv(H); composite();
}
function setFrameless(on){
  MK.frameless = !!on; $("#mkFrameless").checked = MK.frameless;
  resizeCv(MK.frameless ? 680 : 400);
  $("#editCard").classList.toggle("frameless", MK.frameless); $("#flGuide").hidden = !MK.frameless;
  $("#flAlphaRow").hidden = !MK.frameless || $("#mkFrame").value === "future"; $("#tEdgeRow").hidden = !MK.frameless;
  composite(); fitCanvas();
}
// 半フレームレス: how solid the text box over the picture is (0 = see-through, 100 = solid)
const FL_ALPHA_DEF = 68;
function setFlAlpha(v){
  v = Math.max(0, Math.min(100, Math.round(+v))); if (!isFinite(v)) v = FL_ALPHA_DEF;
  MK.flAlpha = v; $("#mkFlAlpha").value = String(v); $("#flAlphaVal").textContent = v + "%";
  $("#editCard").style.setProperty("--fla", v + "%"); $("#editCard").classList.toggle("fl0", v === 0);
}
$("#mkFlAlpha").addEventListener("input", e => setFlAlpha(e.target.value));
$("#btnFlAlpha").addEventListener("click", () => setFlAlpha(FL_ALPHA_DEF));
function setShine(holo, foil){
  $("#mkHolo").value = HOLO[holo] ? holo : ""; $("#mkFoil").value = FOIL[foil] ? foil : "";
  const ec = $("#editCard"); [...ec.classList].filter(k => /^(holo|foil-)/.test(k)).forEach(k => ec.classList.remove(k));
  if ($("#mkHolo").value) ec.classList.add("holo", "holo-" + $("#mkHolo").value);
  if ($("#mkFoil").value) ec.classList.add("foil-" + $("#mkFoil").value);
}
$("#mkHolo").addEventListener("change", () => setShine($("#mkHolo").value, $("#mkFoil").value));
$("#mkFoil").addEventListener("change", () => setShine($("#mkHolo").value, $("#mkFoil").value));
function setTEdge(on){ $("#mkTEdge").checked = !!on; $("#editCard").classList.toggle("tedge", !!on); }
$("#mkTEdge").addEventListener("change", e => setTEdge(e.target.checked));
$("#mkFrameless").addEventListener("change", e => setFrameless(e.target.checked));
function syncRarity(){ const sp = $("#mkFrame").value === "spire", r = $("#mkRarity").value; $("#rarityRow").hidden = !sp; $("#spcRow").hidden = !sp; $("#editCard").classList.toggle("spc-silent", sp && $("#mkSpc").value === "silent"); ["common", "uncommon", "rare"].forEach(k => $("#editCard").classList.toggle("rar-" + k, sp && r === k)); }
$("#mkRarity").addEventListener("change", syncRarity); $("#mkSpc").addEventListener("change", syncRarity);
function syncFrame(){ if (typeof updateSecs === "function") setTimeout(updateSecs); setTimeout(fitCanvas); $("#editCard").classList.toggle("mtg", $("#mkFrame").value === "mtg"); $("#editCard").classList.toggle("fut", $("#mkFrame").value === "future"); $("#editCard").classList.toggle("ygo", $("#mkFrame").value === "ygo"); $("#editCard").classList.toggle("dm", $("#mkFrame").value === "dm"); $("#editCard").classList.toggle("socra", $("#mkFrame").value === "socra"); $("#editCard").classList.toggle("spire", $("#mkFrame").value === "spire"); syncRarity(); $("#flAlphaRow").hidden = !MK.frameless || $("#mkFrame").value === "future"; if ($("#mkFrame").value === "spire" && MK.frameless) setFrameless(false); $("#mkFrameless").closest("label").hidden = $("#mkFrame").value === "spire"; if (typeof syncTypeNames === "function") syncTypeNames(); if (MK.deck) syncCost(); $("#capRow").hidden = MK.type !== "monster" || $("#mkFrame").value !== "socra"; }
$("#mkFrame").addEventListener("change", () => { if ($("#mkFrame").value === "future" && !MK.frameless) setFrameless(true); syncFrame(); syncFont(); });
function clearCanvas(){ ik.clearRect(0, 0, ink.width, ink.height); photo = null; setMode("draw"); composite(); }
$("#swatches").innerHTML = COLORS.map(c => `<button class="sw" style="background:${c}" data-c="${c}" aria-label="色 ${c}" aria-pressed="${c === pen.color}"></button>`).join("");
$("#sizes").innerHTML = SIZES.map(([l, s]) => `<button data-s="${s}" aria-pressed="${s === pen.size}">${l}</button>`).join("");
$("#swatches").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; pen.color = b.dataset.c; pen.erase = false; syncTools(); });
$("#sizes").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; pen.size = +b.dataset.s; syncTools(); });
$("#btnErase").addEventListener("click", () => { pen.erase = !pen.erase; syncTools(); });
function syncTools(){
  document.querySelectorAll(".sw").forEach(b => b.setAttribute("aria-pressed", !pen.erase && b.dataset.c === pen.color));
  document.querySelectorAll("#sizes button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.s === pen.size));
  $("#btnErase").setAttribute("aria-pressed", pen.erase); $("#btnErase").classList.toggle("primary", pen.erase);
}
function pushUndo(){ MK.artDirty = true; try{ undoStack.push({ ink: ik.getImageData(0, 0, ink.width, ink.height), photo: photo ? { ...photo } : null }); if (undoStack.length > 25) undoStack.shift(); }catch(e){} }
$("#btnUndo").addEventListener("click", () => { const d = undoStack.pop(); if (!d) return; MK.artDirty = true; ik.putImageData(d.ink, 0, 0); photo = d.photo; if (!photo && MK.mode === "photo") setMode("draw"); syncPhotoUI(); composite(); });
$("#btnClear").addEventListener("click", () => { pushUndo(); clearCanvas(); });
// 大きく描く: the canvas and the pen tools move into a popup (no text boxes nearby, so iPad's handwriting-to-text doesn't pop up)
const DM = { open: false };
function openDrawModal(){
  if (DM.open) return; fitCanvas(); DM.open = true; $("#drawModal").style.setProperty("--cva", (cv.width / cv.height).toFixed(4));
  DM.ph = document.createComment("cv"); cv.parentNode.insertBefore(DM.ph, cv); $("#drawModal .dm-canvas").appendChild(cv);
  const pane = document.querySelector('.tools-col .mk-pane[data-pane="draw"]');
  DM.pane = pane; DM.pp = pane.parentNode; DM.pn = pane.nextSibling; DM.ph2 = pane.hidden; pane.hidden = false; $("#drawModal .dm-tools").appendChild(pane);
  $("#drawModal").classList.toggle("potion", MK.kind === "potion" || MK.kind === "relic");
  $("#drawModal").hidden = false; document.body.classList.add("dm-lock");
  if (typeof composite === "function") composite();
}
function closeDrawModal(){
  if (!DM.open) return; DM.open = false;
  DM.ph.parentNode.insertBefore(cv, DM.ph); DM.ph.remove();
  DM.pp.insertBefore(DM.pane, DM.pn); DM.pane.hidden = DM.ph2;
  $("#drawModal").hidden = true; document.body.classList.remove("dm-lock");
  if (typeof composite === "function") composite();
}
$("#dmDone").addEventListener("click", closeDrawModal);
$("#btnBigDraw").addEventListener("click", openDrawModal);
document.addEventListener("keydown", e => { if (e.key === "Escape" && DM.open) closeDrawModal(); });
// with a pen or a finger, touching the small canvas on the card opens the popup instead
document.addEventListener("pointerdown", e => {
  if (DM.open || e.target !== cv || (e.pointerType !== "pen" && e.pointerType !== "touch")) return;
  e.preventDefault(); e.stopImmediatePropagation(); openDrawModal();
}, true);
function pt(e){ const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
function stroke(a, b){
  ik.globalCompositeOperation = pen.erase ? "destination-out" : "source-over";
  ik.strokeStyle = ik.fillStyle = pen.erase ? "#000" : pen.color;
  ik.lineWidth = pen.erase ? pen.size * 2 : pen.size; ik.lineCap = ik.lineJoin = "round";
  if (a.x === b.x && a.y === b.y){ ik.beginPath(); ik.arc(a.x, a.y, ik.lineWidth / 2, 0, 7); ik.fill(); }
  else { ik.beginPath(); ik.moveTo(a.x, a.y); ik.lineTo(b.x, b.y); ik.stroke(); }
  ik.globalCompositeOperation = "source-over";
}
// photo placement mode
function setMode(m){
  MK.mode = m;
  cv.style.cursor = m === "photo" ? "move" : "crosshair";
  syncPhotoUI();
}
function syncPhotoUI(){
  $("#photoPanel").hidden = MK.mode !== "photo" || !photo;
  $("#phEdit").hidden = MK.mode === "photo" || !photo;
  if (photo){ $("#phScale").value = Math.round(photo.s / photo.base * 100); $("#phRot").value = Math.round(photo.r * 180 / Math.PI); }
}
function fitPhoto(){ if (!photo) return; photo.x = cv.width / 2; photo.y = cv.height / 2; photo.r = 0; photo.s = photo.base; }
function setPhoto(img){
  pushUndo();
  const base = Math.max(cv.width / img.width, cv.height / img.height);
  photo = { img, x: cv.width / 2, y: cv.height / 2, s: base, base, r: 0 };
  setMode("photo"); composite();
}
const drawImageCover = setPhoto;
let drag = null;
// photo mode: one finger moves, two fingers zoom + rotate (the wheel also zooms)
const mkPtrs = new Map(); let mkPinch = null;
const twoOf = m => { const [a, b] = [...m.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x) }; };
cv.addEventListener("pointerdown", e => {
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  if (MK.mode === "photo" && photo){
    mkPtrs.set(e.pointerId, pt(e));
    if (mkPtrs.size === 1){ pushUndo(); drag = { p: pt(e), x: photo.x, y: photo.y }; }
    if (mkPtrs.size === 2){ const t = twoOf(mkPtrs); mkPinch = { d: t.d, a: t.a, s: photo.s, r: photo.r }; drag = null; }
    return;
  }
  pushUndo(); drawing = true; last = pt(e); stroke(last, last); composite();
});
cv.addEventListener("pointermove", e => {
  if (MK.mode === "photo" && photo && mkPtrs.has(e.pointerId)){
    mkPtrs.set(e.pointerId, pt(e));
    if (mkPinch && mkPtrs.size >= 2){ const t = twoOf(mkPtrs); photo.s = Math.min(photo.base * 4, Math.max(photo.base * .1, mkPinch.s * t.d / mkPinch.d)); photo.r = mkPinch.r + t.a - mkPinch.a; syncPhotoUI(); composite(); return; }
  }
  if (drag){ const p = pt(e); photo.x = drag.x + p.x - drag.p.x; photo.y = drag.y + p.y - drag.p.y; composite(); return; }
  if (!drawing) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])){ const p = pt(ev); stroke(last, p); last = p; }
  composite();
});
const endStroke = e => { drawing = false; mkPtrs.delete(e.pointerId); if (mkPtrs.size < 2) mkPinch = null; if (!mkPtrs.size) drag = null; };
cv.addEventListener("pointerup", endStroke); cv.addEventListener("pointercancel", endStroke);
cv.addEventListener("wheel", e => {
  if (MK.mode !== "photo" || !photo) return;
  e.preventDefault();
  const k = Math.exp(-e.deltaY * 0.0015);
  photo.s = Math.min(photo.base * 4, Math.max(photo.base * 0.1, photo.s * k));
  syncPhotoUI(); composite();
}, { passive: false });
$("#phScale").addEventListener("input", e => { if (!photo) return; photo.s = photo.base * (+e.target.value / 100); composite(); });
$("#phRot").addEventListener("input", e => { if (!photo) return; photo.r = (+e.target.value) * Math.PI / 180; composite(); });
$("#phScale").addEventListener("pointerdown", () => pushUndo());
$("#phRot").addEventListener("pointerdown", () => pushUndo());
$("#phFit").addEventListener("click", () => { pushUndo(); fitPhoto(); syncPhotoUI(); composite(); });
$("#phDel").addEventListener("click", () => { pushUndo(); photo = null; setMode("draw"); composite(); });
$("#phDone").addEventListener("click", () => { setMode("draw"); composite(); });
$("#phEdit").addEventListener("click", () => { setMode("photo"); composite(); });
$("#mkFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => setPhoto(im); im.src = rd.result; }; rd.readAsDataURL(f); e.target.value = "";
});
composite();
$("#mkEqAb").innerHTML = Object.entries(EQ_AB).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#mkEqAb").addEventListener("input", syncEqLine); $("#mkEq").addEventListener("input", syncEqLine);
function syncEqLine(){
  if (MK.type !== "equip" && MK.type !== "monster") return;
  if (typeof updateBkText === "function" && $("#bkUI") && $("#bkUI").childNodes.length){ updateBkText(); return; }
  const c = { type: MK.type, eqN: Math.round(+$("#mkEq").value || 0), abs: readAbs(), fx: readFx(), combo: readCombo(), ss: readSS() };
  $("#mkFxLine").innerHTML = kwLink(esc([MK.type === "equip" ? eqText(c) : monAbsText(c), fxText(c)].filter(Boolean).join("。")));
}
// 能力のなかま分け（しぼりこみ用）
const ABS_CAT = { twice: "atk", haste: "atk", direct: "atk", noAttack: "atk", topOnly: "atk", pierce: "atk", lifelink: "atk", flying: "atk", reach: "atk", bane: "atk",
  guard: "def", noEffect: "def", taunt: "def", dmgCut: "def", reflect: "def", shield: "def", stealth: "def", reborn: "def", blocker: "def", justDiver: "def", ward: "def",
  evoAtk: "grow", evoTurn: "grow", evolve: "grow", sbAtk: "grow", sympathy: "cost", substitute: "eq", negateOnce: "eq", double: "eq", eqBonus: "eq" };
const ABS_CATS = [["all", "すべて"], ["card", "カード（天賦など）"], ["atk", "攻撃"], ["def", "守り・耐性"], ["grow", "成長・進化"], ["cost", "コスト"], ["eq", "装備"], ["other", "その他"]];
const absCatOf = k => ABS_CAT[k] || "other";
function absFilter(){
  const box = $("#absBox"); if (!box) return;
  const q = normQ($("#absQ").value || "").trim(), cat = MK.absCat || "all";
  const labs = [...box.querySelectorAll(".abs-list label[data-cat]")].filter(l => !l.closest("[hidden]") || l.parentElement.id !== "mkAbs" || !$("#mkAbs").hidden);
  const have = new Set(labs.filter(l => !l.parentElement.hidden).map(l => l.dataset.cat));
  if (cat !== "all" && !have.has(cat)){ MK.absCat = "all"; return absFilter(); }
  $("#absCats").innerHTML = ABS_CATS.filter(([k]) => k === "all" || have.has(k)).map(([k, l]) => `<button type="button" class="small ghost${k === cat ? " on" : ""}" data-abscat="${k}">${l}</button>`).join("");
  let shown = 0;
  labs.forEach(l => { const on = l.querySelector("input[type=checkbox]") && l.querySelector("input[type=checkbox]").checked; const ok = on || ((cat === "all" || l.dataset.cat === cat) && (!q || normQ(l.textContent + " " + (l.dataset.q || "")).includes(q))); l.hidden = !ok; if (ok && !l.parentElement.hidden) shown++; });
  $("#absNone").hidden = shown > 0;
}
$("#absQ").addEventListener("input", absFilter);
$("#absCats").addEventListener("click", e => { const b = e.target.closest("[data-abscat]"); if (!b) return; MK.absCat = b.dataset.abscat; absFilter(); });
["#mkInnate", "#mkRetain", "#mkEthereal", "#mkSly"].forEach(q => $(q).addEventListener("change", () => { if (typeof updateSecs === "function") updateSecs(); }));
function renderAbsForm(t){
  const cur = readAbs();
  $("#mkAbs").innerHTML = Object.entries(ABS).filter(([, v]) => !v.only || v.only === (t === "equip" ? "eq" : "mon")).map(([k, v]) =>
    `<label data-cat="${absCatOf(k)}" data-q="${esc((v.kw || "") + " " + (ABS_CATS.find(c => c[0] === absCatOf(k)) || [])[1])}"><input type="checkbox" data-ab="${k}"> ${v.label}${(v.sel || []).map(([f, l, o]) => ` <select data-absel="${k}" data-f="${f}" aria-label="${l}">${o.map(([ov, ol]) => `<option value="${ov}">${ol}</option>`).join("")}</select>`).join("")}${v.name ? ` ${v.ph ? "" : "名前"}<input type="text" data-abname="${k}" maxlength="40" ${v.ph ? `list="cardNames" placeholder="${v.ph}"` : `placeholder="例: ただの"`}>` : ""}${v.n ? ` 数<input type="number" data-abn="${k}" min="1" max="9999" value="${v.n}">` : ""}</label>`).join("");
  loadAbs(cur); absFilter();
}
function readAbs(){
  if (!document.querySelector("#mkAbs [data-ab]")) return [];
  return [...document.querySelectorAll("#mkAbs [data-ab]")].filter(x => x.checked).map(x => {
    const k = x.dataset.ab, a = { k };
    if (ABS[k].n){ const el = document.querySelector(`#mkAbs [data-abn="${k}"]`); a.n = Math.max(1, Math.round(+(el && el.value) || ABS[k].n)); }
    if (ABS[k].name){ const el = document.querySelector(`#mkAbs [data-abname="${k}"]`); a.name = (el && el.value.trim()) || ""; }
    document.querySelectorAll(`#mkAbs [data-absel="${k}"]`).forEach(el => { a[el.dataset.f] = el.value; });
    return a;
  });
}
function loadAbs(list){
  document.querySelectorAll("#mkAbs [data-ab]").forEach(x => { x.checked = false; });
  (list || []).forEach(a => {
    const x = document.querySelector(`#mkAbs [data-ab="${a.k}"]`); if (!x) return; x.checked = true;
    const n = document.querySelector(`#mkAbs [data-abn="${a.k}"]`); if (n && a.n) n.value = a.n;
    const m = document.querySelector(`#mkAbs [data-abname="${a.k}"]`); if (m && a.name) m.value = a.name;
    document.querySelectorAll(`#mkAbs [data-absel="${a.k}"]`).forEach(el => { if (a[el.dataset.f] && [...el.options].some(o => o.value === a[el.dataset.f])) el.value = a[el.dataset.f]; });
  });
  syncEqLine();
}
$("#mkAbs").addEventListener("input", syncEqLine); $("#mkAbs").addEventListener("change", syncEqLine);
$("#fxAskOn").addEventListener("change", () => { $("#fxAskWrap").hidden = !$("#fxAskOn").checked; syncFxForm(); });
$("#fxAsk").addEventListener("input", () => syncFxForm());
MK.deck = "normal";
function syncCost(){
  const v = MK.deck === "normal" ? "" : $("#mkCost").value;
  const fu = $("#mkFrame").value === "future" && MK.kind !== "potion" && MK.kind !== "relic";
  $("#mkCostBadge").textContent = v === "" && fu ? "‐" : v; $("#mkCostBadge").hidden = v === "" && !fu;
  if ($("#mkFrame").value === "ygo" && v !== "") $("#mkCostBadge").innerHTML = ygoStars(v, MK.type); $("#editCard").classList.toggle("costed", v !== "");
}
$("#mkCost").innerHTML = [...Array.from({ length: 31 }, (_, k) => k), 35, 40, 45, 50, 60, 70, 80, 90, 99].map(k => `<option value="${k}">${k}</option>`).join("") + `<option value="∞">∞（ふつうには払えない。踏み倒しでだけ使える）</option><option value="X">X（あるマナを全部使って、効果をX回くり返す）</option>`;
$("#mkCost").value = "1";
const MODE_NOTE = { normal: "マナを使わない、ふつうのデッキ用。コストはつかない", cost: "コストデッキ専用。ふつうのデッキには入れられない", both: "どちらのデッキにも入れられる。ふつうのデッキで遊ぶときはコストが表示されない" };
function setMkDeck(m){ MK.deck = DECK_LABEL[m] ? m : "normal"; if (typeof syncMkView === "function") setTimeout(syncMkView); document.querySelectorAll("#mkMode button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === MK.deck)); $("#costRow").hidden = MK.deck === "normal"; $("#modeNote").textContent = MODE_NOTE[MK.deck]; syncCost(); }
$("#mkMode").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setMkDeck(b.dataset.m); });
setMkDeck("normal");
$("#mkCost").addEventListener("change", syncCost); $("#mkAtk").addEventListener("input", syncCost);
syncCost();
$("#mkFont").innerHTML = Object.entries(FONTS).map(([k, v]) => `<option value="${k}" style='font-family:${v.css}'>${v.label}</option>`).join("");
// 枠の色（ふつうの枠だけ）: チェックを入れると #editCard に色が付く
const COL_PRESETS = [["#2b2b2b", "#eef3f3", "ふつう"], ["#8a1c1c", "#fbe3dc", "赤"], ["#1c3f8a", "#e1ebfb", "青"], ["#1f6b3a", "#e2f4e6", "緑"], ["#b8860b", "#fff4cf", "金"], ["#5b2a86", "#efe3fb", "紫"], ["#111111", "#3a3a3a", "黒"], ["#d06a9a", "#fde7f1", "ピンク"]];
$("#colPresets").innerHTML = COL_PRESETS.map(([f, b, n]) => `<button type="button" class="col-pre" data-cf="${f}" data-cb="${b}" title="${n}" aria-label="${n}" style="background:linear-gradient(135deg,${f} 50%,${b} 50%)"></button>`).join("");
function syncColor(){
  const on = $("#mkColOn").checked, ec = $("#editCard");
  ec.classList.toggle("mcol", on);
  ["--cframe", "--cbg", "--cframeBg", "--cbgBg", "--cbgTL", "--cbgBR", "--cbgBL"].forEach(k => ec.style.removeProperty(k));
  $("#colGrBox").hidden = !$("#mkColGr").checked;
  if (on) colVars(mkColVals()).forEach(x => { const i = x.indexOf(":"); ec.style.setProperty(x.slice(0, i), x.slice(i + 1)); });
}
// 色の欄 → カードに保存する値（オフなら全部 null）
function mkColVals(){ const on = $("#mkColOn").checked, gr = on && $("#mkColGr").checked; return { colF: on ? $("#mkColF").value : null, colB: on ? $("#mkColB").value : null, colF2: gr ? $("#mkColF2").value : null, colB2: gr ? $("#mkColB2").value : null, colGd: gr && $("#mkColGd").value !== "v" ? $("#mkColGd").value : null }; }
function setColor(f, b, f2, b2, gd){ const on = HEX6.test(f || "") || HEX6.test(b || ""); $("#mkColOn").checked = on; $("#mkColF").value = HEX6.test(f || "") ? f : "#2b2b2b"; $("#mkColB").value = HEX6.test(b || "") ? b : "#eef3f3"; const gr = HEX6.test(f2 || "") || HEX6.test(b2 || ""); $("#mkColGr").checked = gr; $("#mkColF2").value = HEX6.test(f2 || "") ? f2 : (HEX6.test(f || "") ? f : "#6a3fb5"); $("#mkColB2").value = HEX6.test(b2 || "") ? b2 : (HEX6.test(b || "") ? b : "#ffffff"); $("#mkColGd").value = GRAD_DIR[gd] ? gd : "v"; syncColor(); }
["#mkColOn", "#mkColF", "#mkColB", "#mkColGr", "#mkColF2", "#mkColB2", "#mkColGd"].forEach(q => { $(q).addEventListener("input", syncColor); $(q).addEventListener("change", syncColor); });
$("#mkColGr").addEventListener("change", () => { if ($("#mkColGr").checked) $("#mkColOn").checked = true; syncColor(); });
MK.fxRows = false;
$("#mkFxRows").addEventListener("change", e => { MK.fxRows = e.target.checked; if (typeof renderBlocksUI === "function" && $("#bkUI")) renderBlocksUI(); });
$("#colPresets").addEventListener("click", e => { const b = e.target.closest("[data-cf]"); if (!b) return; $("#mkColOn").checked = true; $("#mkColF").value = b.dataset.cf; $("#mkColB").value = b.dataset.cb; syncColor(); });
function syncFont(){ const k = $("#mkFont").value; if (["mtg", "future", "ygo", "dm"].includes($("#mkFrame").value) && k === "klee") $("#editCard").style.removeProperty("--cf"); else $("#editCard").style.setProperty("--cf", FONTS[k] ? FONTS[k].css : ""); $("#mkFont").style.fontFamily = FONTS[k] ? FONTS[k].css : ""; renderFontGrid(); }
// フォント選び: 見本の文字（カード名）をそれぞれのフォントで並べる
function renderFontGrid(){
  const box = $("#fontGrid"); if (!box) return;
  const cur = $("#mkFont").value, sample = esc(($("#mkName") && $("#mkName").value.trim()) || "ドラゴン召喚！");
  { const fc = $("#fontCur"); if (fc){ const f = FONTS[cur] || FONTS.klee; fc.textContent = f.label; fc.style.fontFamily = f.css; } }
  box.innerHTML = Object.entries(FONT_GROUPS).map(([g, gl]) => { const L = Object.entries(FONTS).filter(([, v]) => v.g === g); return L.length ? `<div class="fg-h">${gl}</div><div class="fg-row">${L.map(([k, v]) => `<button type="button" class="fg-b" role="radio" aria-checked="${k === cur}" data-font="${k}"><span class="fg-s" style='font-family:${v.css}'>${sample}</span><small>${v.label}</small></button>`).join("")}</div>` : ""; }).join("");
}
$("#fontGrid").addEventListener("click", e => { const b = e.target.closest("[data-font]"); if (!b) return; $("#mkFont").value = b.dataset.font; syncFont(); $("#fontPick").open = false; });
{ let fT = null; $("#mkName").addEventListener("input", () => { clearTimeout(fT); fT = setTimeout(renderFontGrid, 250); }); }
$("#fontPick").addEventListener("toggle", () => { if ($("#fontPick").open) renderFontGrid(); });
renderFontGrid();
$("#mkFont").addEventListener("change", syncFont);
$("#mkNameSize").innerHTML = $("#mkTextSize").innerHTML = Object.entries(SIZES_T).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
$("#mkNameSize").value = $("#mkTextSize").value = "m";
function syncSizes(){ const ec = $("#editCard"); ec.style.setProperty("--nk", sizeK($("#mkNameSize").value)); ec.style.setProperty("--tk", sizeK($("#mkTextSize").value)); syncRubyPrev(); }
$("#mkNameSize").addEventListener("change", syncSizes); $("#mkTextSize").addEventListener("change", syncSizes);
function syncRubyPrev(){
  const parts = [["名前", $("#mkName").value], ["効果", $("#mkEff").value], ["フレーバー", $("#mkFlv").value]].filter(([, v]) => /《/.test(v));
  const box = $("#rubyPrev"); box.hidden = !parts.length;
  box.innerHTML = parts.map(([k, v]) => `<div><span class="note">${k}：</span>${rubyHTML(v)}</div>`).join("");
}
let rubyField = null;
["#mkName", "#mkEff", "#mkFlv"].forEach(s => { $(s).addEventListener("focus", e => { rubyField = e.target; }); $(s).addEventListener("input", syncRubyPrev); });
$("#mkRuby").addEventListener("mousedown", e => e.preventDefault()); // keep the text selection
$("#mkRuby").addEventListener("click", () => {
  const el = rubyField || $("#mkName"); const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
  const sel = el.value.slice(a, b), ins = `｜${sel}《》`;
  el.setRangeText(ins, a, b, "end");
  const caret = sel ? a + ins.length - 1 : a + 1; // inside 《》, or where the kanji goes
  el.focus(); el.setSelectionRange(caret, caret); syncRubyPrev();
});
$("#mkInf").addEventListener("click", () => { $("#mkAtk").value = $("#mkAtk").value.trim() === "∞" ? "300" : "∞"; });
$("#fxCond").innerHTML = Object.entries(CONDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
function setMkType(t){
  if (MK.kind === "potion" || MK.kind === "relic") t = "magic";
  MK.type = t;
  document.querySelectorAll("#mkType button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === t));
  const ec = $("#editCard"); ec.classList.remove("monster", "magic", "trap", "equip"); ec.classList.add(t);
  $("#atkRow").hidden = $("#infRow").hidden = t !== "monster";
  $("#quickRow").hidden = t !== "magic" || $("#mkFrame").value === "spire";
  const pers = (t === "magic" || t === "trap") && $("#mkPersist").checked;
  $("#persistRow").hidden = (t !== "magic" && t !== "trap") || $("#mkFrame").value === "spire" || $("#mkField").checked;
  $("#fieldRow").hidden = t !== "magic" || $("#mkFrame").value === "spire"; $("#fieldOpts").hidden = $("#fieldRow").hidden || !$("#mkField").checked;
  { const ec = $("#editCard"); if (ec) ec.classList.toggle("land", t === "magic" && $("#mkField").checked && $("#mkLand").checked && !FR_CLS[$("#mkFrame").value] && $("#mkFrame").value !== "spire"); }
  $("#exhaustRow").hidden = (t !== "magic" && t !== "trap") || pers;
  $("#noUseRow").hidden = t !== "magic" && t !== "trap";
  $("#spOptRow").hidden = t !== "magic" && t !== "trap"; $("#flashLbl").hidden = t !== "magic";
  syncWhenRow();
  $("#mkTab").textContent = mkTabLabel();
  if (typeof syncCost === "function" && $("#mkCost").options.length) syncCost();
  $("#eqRow").hidden = $("#eqNote").hidden = t !== "equip";
  $("#capRow").hidden = t !== "monster" || $("#mkFrame").value !== "socra";
  $("#absBox").hidden = false; $("#mkAbs").hidden = t !== "monster" && t !== "equip"; $("#absHead").hidden = $("#mkAbs").hidden;
  $("#absHead").textContent = t === "equip" ? "装備したモンスターに付く能力" : "このモンスターの能力";
  renderAbsForm(t);
  $("#cbBox").hidden = t === "equip";
  $("#ssBox").hidden = t !== "monster";
  { const fs = $("#secFusion"); if (fs) fs.hidden = t !== "monster"; }
  const trigs = t === "monster" ? MON_TRIGS : t === "equip" ? EQ_TRIGS : pers ? PERSIST_TRIGS : ["use"];
  const cur = $("#fxTrig").value;
  $("#fxTrig").innerHTML = trigs.map(k => `<option value="${k}">${pers ? PERSIST_TRIG_LABEL[k] : trigLabel(t, k)}</option>`).join("");
  if (trigs.includes(cur)) $("#fxTrig").value = cur;
  $("#trigWrap").hidden = t !== "monster" && t !== "equip" && !pers;
  { const sk = mkSk(), ec = $("#editCard"); ec.classList.toggle("sk-attack", sk === "attack"); ec.classList.toggle("sk-power", sk === "power"); }
  if (typeof syncTypePressed === "function") syncTypePressed();
  if (typeof bkSync === "function") bkSync();
  const curK = $("#fxKind").value, curCb = $("#cbKind").value;
  const kinds = Object.entries(KINDS).filter(([, v]) => (!v.trap || mkTrapOk(t)) && (!v.mon || t === "monster" || t === "equip") && (!v.chain || t === "trap" || t === "magic"));
  const opts = kinds.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("#fxKind").innerHTML = opts; $("#cbKind").innerHTML = opts;
  if (typeof refreshMoreFx === "function") refreshMoreFx();
  $("#fxKind").value = kinds.some(([k]) => k === curK) ? curK : "none";
  $("#cbKind").value = kinds.some(([k]) => k === curCb) ? curCb : "none";
  syncFxForm();
  potionModeUI();
  if (typeof syncMkView === "function") syncMkView();
}
// つくるもの: カード / カード以外（ポーション）
function potionModeUI(){
  const pot = MK.kind === "potion" || MK.kind === "relic", rel = MK.kind === "relic", what = rel ? "レリック" : "ポーション";
  document.querySelectorAll("#mkKind2 button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k2 === MK.kind));
  $("#neowRow").hidden = !rel;
  $("#mkKindNote").textContent = rel ? "いつでも効果が続く。選択の祭壇を使うデッキで、モンスターを倒すと10%で手に入る" : "選択の祭壇を使うデッキで、モンスターを倒すと40%で手に入る";
  $("#editCard").classList.toggle("potion", pot);
  $("#mkKindSub").hidden = !pot; $("#mkTypeWrap").hidden = pot;
  ["#quickRow", "#persistRow", "#exhaustRow", "#noUseRow", "#spOptRow", "#payRow", "#whenRow", "#mkCostWrap"].forEach(q => { if (pot) $(q).hidden = true; });
  if (!pot) $("#mkCostWrap").hidden = false;
  if (!pot) $("#payRow").hidden = false;
  const fr = $("#mkFrame").closest("label"); if (fr) fr.hidden = pot;
  const fl = $("#mkFrameless").closest("label"); if (fl) fl.hidden = pot;
  if (pot && MK.frameless) setFrameless(false);
  if (typeof composite === "function") composite();
  if (pot){ $("#rarityRow").hidden = true; $("#spcRow").hidden = true; }
  const db = document.querySelector('#mkTabs button[data-pane="deck"]'); if (db) db.hidden = pot;
  if (pot && db && db.getAttribute("aria-pressed") === "true") setMkPane("draw");
  if (pot){ $("#mkTab").textContent = what; $("#mkCostBadge").hidden = true; }
  $("#mkTitle").textContent = pot ? (S.editId ? `${what}を編集中` : `${what}を描く`) : (S.editId ? "カードを編集中" : "カードを描く");
  if (!S.editId) $("#btnSave").textContent = pot ? `${what}を保存` : "カードを保存";
  setTimeout(syncSpOpt);
  ctrModeUI();
}
// カード以外 → カウンター: カードの編集はかくして、カウンターの一覧と作る欄だけ出す
function ctrModeUI(){
  const on = !!MK.ctrMode, mk = document.querySelector("#tab-make .maker"); if (mk) mk.classList.toggle("ctr-mode", on);
  if (!on) return;
  document.querySelectorAll("#mkKind2 button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k2 === "counter"));
  $("#mkTitle").textContent = "カウンターを作る"; renderCtrBox();
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-goctr]") && !S.editId){ setMkKind("counter"); const t = $("#mkTitle"); if (t) t.scrollIntoView({ block: "start", behavior: "smooth" }); } });
function setMkKind(k){
  MK.ctrMode = k === "counter"; if (MK.ctrMode) k = "potion";
  MK.kind = k === "potion" || k === "relic" ? k : "card";
  const other = MK.kind !== "card";
  document.querySelectorAll("#mkKind button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === (other ? "potion" : "card")));
  if (other){ $("#mkFrame").value = ""; if (typeof syncFrame === "function") syncFrame(); setMkDeck("normal"); }
  setMkType(other ? "magic" : MK.type);
  if (typeof bkSync === "function") bkSync();
}
$("#ssCond").innerHTML = Object.entries(SS_CONDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
$("#ssCost").innerHTML = Object.entries(SS_COSTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
function readSS(){
  if (MK.type !== "monster" || !$("#ssOn").checked) return null;
  return { on: true, cond: $("#ssCond").value, n: Math.max(0, Math.round(+$("#ssN").value || 0)), name: $("#ssName").value.trim(), cost: $("#ssCost").value, cn: Math.max(1, Math.round(+$("#ssCn").value || 1)), only: $("#ssOnly").checked };
}
function syncSS(){
  $("#ssOpts").hidden = !$("#ssOn").checked;
  $("#ssNWrap").hidden = !(SS_CONDS[$("#ssCond").value] || {}).n;
  $("#ssNameWrap").hidden = !(SS_CONDS[$("#ssCond").value] || {}).name;
  $("#ssCnWrap").hidden = !(SS_COSTS[$("#ssCost").value] || {}).n;
  if (typeof syncFxForm === "function") syncFxForm();
}
function loadSS(c){
  const s = c && c.ss && c.ss.on ? c.ss : null;
  $("#ssOn").checked = !!s; $("#ssCond").value = s && SS_CONDS[s.cond] ? s.cond : "none"; $("#ssN").value = s && s.n != null ? s.n : 1; $("#ssName").value = s ? s.name || "" : "";
  $("#ssCost").value = s && SS_COSTS[s.cost] ? s.cost : "none"; $("#ssCn").value = s && s.cn ? s.cn : 1; $("#ssOnly").checked = !!(s && s.only);
  syncSS();
}
["#ssOn", "#ssCond", "#ssN", "#ssName", "#ssCost", "#ssCn", "#ssOnly"].forEach(q => { $(q).addEventListener("input", syncSS); $(q).addEventListener("change", syncSS); });
function readFx(){
  const kind = $("#fxKind").value; if (!kind || kind === "none") return null;
  const fx = { trig: MK.type === "monster" || MK.type === "equip" || ((MK.type === "magic" || MK.type === "trap") && $("#mkPersist").checked) ? $("#fxTrig").value : "use", kind };
  if ($("#fxAskOn").checked && $("#fxAsk").value.trim()) fx.ask = $("#fxAsk").value.trim();
  if (KINDS[kind].n) fx.n = Math.max(1, Math.round(+$("#fxN").value || 1));
  if (TARGETABLE[kind] && $("#fxKind").dataset.to && $("#fxKind").dataset.to !== "one") fx.to = $("#fxKind").dataset.to;
  if (kind === "win"){ fx.cond = $("#fxCond").value; if (CONDS[fx.cond].n) fx.cn = Math.max(1, Math.round(+$("#fxCn").value || 1)); }
  const more = [...document.querySelectorAll("#moreFx .mfx")].map(r => { const s = r.querySelector(".mfk"), k = s.value, m = { kind: k }; if (TARGETABLE[k] && s.dataset.to && s.dataset.to !== "one") m.to = s.dataset.to; if (KINDS[k] && KINDS[k].n) m.n = Math.max(1, Math.round(+r.querySelector(".mfn").value || 1)); return m; }).filter(m => KINDS[m.kind] && m.kind !== "none");
  if (more.length) fx.more = more;
  return fx;
}
function readCombo(){
  if (MK.type === "equip") return null;
  const name = $("#cbName").value.trim(), kind = $("#cbKind").value;
  if (!name || !kind || kind === "none") return null;
  const cb = { name, where: $("#cbWhere").value, match: $("#cbMatch").value, kind, trig: MK.type === "monster" ? $("#fxTrig").value : "use" };
  if (KINDS[kind].n) cb.n = Math.max(1, Math.round(+$("#cbN").value || 1));
  if (TARGETABLE[kind] && $("#cbKind").dataset.to && $("#cbKind").dataset.to !== "one") cb.to = $("#cbKind").dataset.to;
  return cb;
}

/* ---- effect picker: "なにをする" (a group) + "だれに・どれ" (which one), instead of one long list.
   The original <select> stays as the value everything else reads; these two just drive it. ---- */
const KIND_GROUPS = [
  { g: "none",    label: "なし", v: [["none", "なし"]] },
  { g: "dmg",     label: "ダメージを与える", v: [["dmg", "ダメージ"]] },
  { g: "destroy", label: "破壊する（モンスター・魔法・罠）", v: [["destroy", "相手のモンスターを破壊"], ["removeBoard", "場のカードを1枚えらんで除去（モンスター・魔法・罠・フィールド）"], ["killAtk", "攻撃してきたモンスターを破壊（罠・速攻魔法）"], ["destroySt", "相手の魔法・罠をえらんで破壊"], ["destroyStRand", "相手の魔法・罠をランダムに破壊"], ["destroyStAll", "相手の魔法・罠をすべて破壊"], ["destroyField", "フィールド魔法を破壊"], ["blast", "自爆して、装備の枚数×○以下のATKを全部破壊"]] },
  { g: "debuff",  label: "相手を弱らせる（デバフ）", v: [["vuln", "弱体（受けるダメージ1.5倍）"], ["weak", "脱力（与えるダメージが減る）"], ["atkDown", "ATKを下げる"], ["atkDownTmp", "ATKを下げる（このターンだけ）"], ["atkDownAtk", "攻撃してきたモンスターのATKを下げる（罠・速攻魔法）"], ["charm", "魅了（攻撃できなくする）"], ["oppStrDown", "筋力を失わせる（相手の次のターンの終わりまで）"], ["discard", "手札を捨てさせる（ランダム）"], ["discardPeek", "手札を見て、えらんで捨てさせる（ピーピングハンデス）"], ["manaDrain", "マナを減らす"], ["oppNoAtk", "攻撃できなくする（相手の次のターンまで）"], ["oppNoUse", "魔法・罠を発動できなくする（相手の次のターンまで）"]] },
  { g: "buff",    label: "自分を強くする（バフ）", v: [["str", "筋力を得る（与えるダメージ+○）"], ["strTemp", "筋力を得る（このターンだけ）"], ["dex", "敏捷を得る（得るブロック+○）"], ["dexTemp", "敏捷を得る（このターンだけ）"], ["intang", "霊体（受けるダメージが1・○ターン）"], ["selfAtk", "このモンスターのATKを上げる"], ["atkMul", "このモンスターのATKを○倍"], ["atkUp", "自分のモンスターのATKを上げる（えらぶ・全体・ランダム）"], ["vulnBonus", "弱体の相手へのダメージ+○%（ずっと）"]] },
  { g: "guard",   label: "守る・回復する", v: [["block", "ブロックを得る"], ["heal", "LPを回復する"], ["plate", "プレート（ターンのおわりにブロック）"], ["barricade", "ブロックが消えなくなる（ずっと）"], ["firstBlock2", "毎ターン最初のブロックが2倍（ずっと）"], ["rageNow", "このターン、アタックを使うたびブロック"], ["thornsNow", "攻撃されたら反撃（次の自分のターンまで）"]] },
  { g: "draw",    label: "カードを引く", v: [["draw", "○枚引く"], ["drawTo", "手札が○枚になるまで引く"], ["drawUntil", "アタック以外を引くまで引く"], ["oppDraw", "相手に○枚引かせる"]] },
  { g: "fetch",   label: "カードを手札に持ってくる", v: [["searchMon", "山札からモンスターを（えらぶ）"], ["searchMagic", "山札から魔法を（えらぶ）"], ["searchTrap", "山札から罠を（えらぶ）"], ["tagSearch", "タグのカードを山札から（えらぶ）"], ["tagGraveHand", "タグのカードを墓地から（えらぶ）"], ["revive", "墓地のモンスターを手札に"], ["graveAtkToHand", "墓地のランダムなアタックを手札に"]] },
  { g: "make",    label: "カードを生み出す・コピーする", v: [["copyHand", "このカードのコピーを手札に"], ["copyDeck", "このカードのコピーを山札に"], ["copyGrave", "このカードのコピーを墓地に"], ["copyLastAtk", "直前に使ったアタックのコピーを手札に"], ["genAttack", "ランダムなアタックを手札に"], ["genAttack0", "ランダムなアタックを手札に（このターンコスト0）"], ["genSkill", "ランダムなスキルを手札に"], ["genPower", "ランダムなパワーを手札に"], ["genNamed", "名前を指定したカード（トークンなど）を手札に"], ["tagGen", "タグのカードをランダムに生み出して手札に"], ["draft", "スパイア風カードを○枚から1枚えらんで墓地に"]] },
  { g: "summon",  label: "モンスターを場に出す", v: [["summonNamed", "名前を指定したモンスターを自分の場に（トークンなど）"], ["reborn", "墓地のモンスターを場に"], ["tagSummonHand", "タグのモンスターを手札から"], ["tagSummonDeck", "タグのモンスターを山札から"], ["tagSummonGrave", "タグのモンスターを墓地から"], ["summonSelf", "このカードを手札から特殊召喚（手札で反応する効果用）"], ["fusion", "融合召喚（EXデッキの融合モンスター）"], ["exSummon", "EXデッキのモンスターを（えらんで）"], ["tagSummonEx", "タグのモンスターをEXデッキから"]] },
  { g: "free",    label: "踏み倒す（コストを払わずに使う）", v: [["playTop", "山札の一番上をプレイ（○枚）"], ["playTopEx", "山札の一番上をプレイして廃棄（○枚）"], ["playHandAtk", "手札のランダムなアタックをプレイ"], ["autoPlay", "名前に○が入ったカードを引いたら自動で使う"], ["dblAtk", "次のアタックをもう1回使う"], ["freeAttack", "次に使うアタックのコストを0に"], ["freeSkill", "次に使うスキルのコストを0に"], ["freePower", "次に使うパワーのコストを0に"], ["corrupt", "スキルがずっと0コスト（使うと廃棄）"]] },
  { g: "mass",    label: "質量（ナナシ系）", v: [["matCopy", "分裂：場のモンスターの質量1枚をコピーして出す"], ["matOut", "増殖：このモンスターの質量をできるだけ場に出す（「破壊されたとき」用）"], ["fieldOut", "このフィールドの質量の半分をコピーとして出す（フィールド魔法用）"], ["stealGrave", "相手の墓地のカードを自分の墓地へ移す"], ["millBoth", "お互いの山札の上を墓地へ"], ["graveHand", "墓地のカードを手札に戻す（どのカードでも）"], ["absorbKill", "バトルで倒した相手を質量にする（「戦闘で相手を破壊したとき」用）"], ["synth", "合成：手札の効果を場のモンスターに付ける"]] },
  { g: "remove",  label: "場からどかす（手札に戻す・除外・うばう・封印）", v: [["seal", "相手のモンスターに封印をつける"], ["bounce", "相手のモンスターを手札に戻す（バウンス）"], ["banishMon", "相手のモンスターを除外する"], ["stealMon", "相手のモンスターをうばう（ずっと）"], ["stealMonTmp", "相手のモンスターをうばう（このターンだけ）"], ["banishGrave", "相手の墓地のカードを除外する（えらぶ）"], ["banishGraveAll", "相手の墓地をすべて除外する"]] },
  { g: "atk",     label: "ATKをあやつる（0にする・入れかえる・元に戻す）", v: [["atkZero", "相手のモンスターのATKを0にする"], ["atkSwap", "このモンスターと相手のモンスターのATKを入れかえる"], ["atkReset", "モンスターのATKを元の数字に戻す"]] },
  { g: "next",    label: "次に使うカード・手札のコスト・コピー", v: [["dblNext", "次に使う○をもう1回使う"], ["freeNext", "次に使う○のコストを0"], ["setCost", "手札のカードのコストを○にする"], ["copyPick", "手札を1枚えらんでコピーを加える"]] },
  { g: "ability", label: "能力を付与する（成長・2回攻撃・ブロッカーなど）", v: [["giveAb", "モンスターに能力を付与する"]] },
  { g: "turn",    label: "ターンを追加する", v: [["extraTurn", "追加ターン（このターンのあと、もう一度自分のターン）"]] },
  { g: "mana",    label: "マナ", v: [["manaNow", "マナを回復（このターン）"], ["manaMax", "最大マナを増やす"], ["manaDrain", "相手のマナを減らす"]] },
  { g: "deck",    label: "山札・墓地をあやつる", v: [["scry", "山札の上を見て、1枚を上に・のこりを下に"], ["graveToTop", "墓地のカードを山札の一番上に"], ["playTop", "山札の一番上をプレイ（○枚）"], ["playTopEx", "山札の一番上をプレイして廃棄（○枚）"], ["drawUntil", "アタック以外を引くまで引く"], ["draft", "スパイア風カードを○枚から1枚えらんで墓地に"]] },
  { g: "exhaust", label: "カードを廃棄する", v: [["exhaustHand", "手札から○枚えらんで"], ["exhaustRand", "手札からランダムに○枚"], ["exhaustAll", "手札をすべて"], ["exhaustNonAtk", "手札のアタック以外をすべて"]] },
  { g: "rewrite", label: "カードを書きかえる（効果の追加・上書き・名前）", v: [["modAdd", "効果を追加する"], ["modRep", "効果を上書きする"], ["modClear", "効果をなくす"], ["modName", "名前を変える"]] },
  { g: "transform", label: "カードを変化させる", v: [["transformHand", "手札から○枚えらんで"], ["transformRand", "手札からランダムに○枚"], ["transformAtk", "手札のアタックすべて"], ["transformAll", "手札すべて"], ["transformSelf", "このカード自身"]] },
  { g: "give",    label: "相手にカードを送りこむ", v: [["oppDraw", "相手に○枚引かせる"], ["oppGenHand", "名前を指定したカードを相手の手札に"], ["oppGenDeck", "名前を指定したカードを相手の山札に混ぜる"], ["oppSummon", "名前を指定したモンスターを相手の場に出す"], ["oppSetNamed", "名前を指定した魔法・罠を相手の場にセット"]] },
  { g: "negate",  label: "打ち消す・無効にする", v: [["cancel", "魔法・罠の発動かモンスターの召喚を打ち消す"], ["reflectFx", "相手の魔法・罠を打ち消して、その効果を自分が使う（跳ね返す）"], ["negate", "相手の攻撃を無効にする（罠・速攻魔法）"], ["reflectDmg", "このターン、自分が受けるダメージを相手に跳ね返す"]] },
  { g: "equip",   label: "装備を動かす", v: [["moveEquips", "別のモンスターに付けかえる"], ["equipsToHand", "ほかの装備を手札に戻す"]] },
  { g: "minus",   label: "自分にデメリット", v: [["loseLp", "LPを失う（ブロックでは防げない）"], ["selfDisc", "手札をえらんで捨てる"], ["selfDiscRand", "手札をランダムに捨てる"], ["selfDiscAll", "手札をすべて捨てる"], ["thisNoAtk", "このモンスターは攻撃できない（このターン）"], ["thisTopOnly", "一番ATKが高い相手にしか攻撃できない"], ["selfNoAtk", "自分のモンスターは攻撃できない（このターン）"], ["destroyOwn", "自分のモンスター1体を破壊"], ["destroyThis", "このモンスターを破壊"], ["destroyOwnAll", "自分のモンスターをすべて破壊"], ["oppStr", "相手が筋力を得る"], ["noDraw", "このターンもう引けない"]] },
  { g: "ctr",     label: "カウンター（乗せる・取り除く）", v: [["ctrAdd", "カウンターを乗せる"], ["ctrDel", "カウンターを取り除く"]] },
  { g: "win",     label: "ゲームに勝つ", v: [["win", "勝利する"]] }
];
// kinds shown only when an older card already uses them (they're now 基本の効果 + 「だれに」)
const intoText = into => into ? `「${into}」` : "ランダムなスパイア風カード";
// 同じ効果の「どこに・どれ・いつまで」ちがい: 「どれ」には1つだけ出して、となりの小さい欄でえらぶ
const KIND_FAM = [
  { label: "このカードのコピーを加える", ax: "どこに", v: [["copyHand", "手札に"], ["copyDeck", "山札に"], ["copyGrave", "墓地に"]] },
  { label: "ランダムなスパイア風カードを手札に", ax: "種類", v: [["genAttack", "アタック"], ["genAttack0", "アタック（このターン0コスト）"], ["genSkill", "スキル"], ["genPower", "パワー"]] },
  { label: "相手の魔法・罠を破壊", ax: "どれを", v: [["destroySt", "えらんで"], ["destroyStRand", "ランダムに"], ["destroyStAll", "すべて"]] },
  { label: "ATKを下げる", ax: "いつまで", v: [["atkDown", "ずっと"], ["atkDownTmp", "このターンだけ"]] },
  { label: "筋力を得る（与えるダメージ+○）", ax: "いつまで", v: [["str", "ずっと"], ["strTemp", "このターンだけ"]] },
  { label: "敏捷を得る（得るブロック+○）", ax: "いつまで", v: [["dex", "ずっと"], ["dexTemp", "このターンだけ"]] },
  { label: "山札からカードを手札に（えらぶ）", ax: "種類", v: [["searchMon", "モンスター"], ["searchMagic", "魔法"], ["searchTrap", "罠"]] },
  { label: "タグのカードを手札に（えらぶ）", ax: "どこから", v: [["tagSearch", "山札から"], ["tagGraveHand", "墓地から"]] },
  { label: "タグのモンスターを場に出す", ax: "どこから", v: [["tagSummonHand", "手札から"], ["tagSummonDeck", "山札から"], ["tagSummonGrave", "墓地から"], ["tagSummonEx", "EXデッキから"]] },
  { label: "山札の一番上をプレイ（○枚）", ax: "使ったあと", v: [["playTop", "ふつう"], ["playTopEx", "廃棄する"]] },
  { label: "相手のモンスターをうばう", ax: "いつまで", v: [["stealMon", "ずっと"], ["stealMonTmp", "このターンだけ"]] },
  { label: "相手の墓地のカードを除外する", ax: "どれを", v: [["banishGrave", "えらんで"], ["banishGraveAll", "すべて"]] },
  { label: "手札を捨てる", ax: "どれを", v: [["selfDisc", "えらんで"], ["selfDiscRand", "ランダムに"], ["selfDiscAll", "すべて"]] },
  { label: "自分のモンスターを破壊", ax: "どれを", v: [["destroyOwn", "1体えらんで"], ["destroyThis", "このモンスター"], ["destroyOwnAll", "すべて"]] },
  { label: "名前を指定したカードを相手に送る", ax: "どこに", v: [["oppGenHand", "手札に"], ["oppGenDeck", "山札に混ぜる"]] },
  { label: "手札を廃棄する", ax: "どれを", v: [["exhaustHand", "○枚えらんで"], ["exhaustRand", "ランダムに○枚"], ["exhaustAll", "すべて"], ["exhaustNonAtk", "アタック以外すべて"]] },
  { label: "手札を変化させる", ax: "どれを", v: [["transformHand", "○枚えらんで"], ["transformRand", "ランダムに○枚"], ["transformAtk", "アタックすべて"], ["transformAll", "すべて"]] }
];
const famOf = k => KIND_FAM.find(f => f.v.some(([x]) => x === k)) || null;
// 「どれ」の一覧: なかまは1つにまとめる（いまえらんでいるものを代表に）
function famCollapse(v, cur){
  const out = [], seen = new Set(), ks = v.map(x => x[0]);
  v.forEach(([k, l]) => { const f = famOf(k); if (!f){ out.push([k, l]); return; } if (seen.has(f)) return; seen.add(f); const mine = ks.filter(x => famOf(x) === f); out.push([mine.includes(cur) ? cur : mine[0], f.label]); });
  return out;
}
function famSel(e, avail, opt){
  const f = famOf(e.kind); if (!f) return ""; const vs = f.v.filter(([k]) => k === e.kind || avail.includes(k)); if (vs.length < 2) return "";
  return `<select data-f="kind" class="bk-fam" aria-label="${esc(f.ax)}">${vs.map(([k, l]) => opt(k, l, e.kind)).join("")}</select>`;
}
// 前の効果（いまは「次に使う○」でしぼれる）は、もう使っているカードのときだけ出す
const PICK_HIDDEN = ["dblAtk", "freeAttack", "freeSkill", "freePower", "atkAll", "bash", "dmgRand", "dmgAll", "vulnAll", "weakAll", "atkDownAll", "atkDownTmpAll", "charmAll", "destroyAll", "destroyOthers", "bounceAll"];
function attachKindPicker(sel){
  if (!sel) return;
  if (!sel._kp){
    const mk = (cls, aria) => { const x = document.createElement("select"); x.className = cls; x.setAttribute("aria-label", aria); return x; };
    const g = mk("kp-g", "なにをする"), v = mk("kp-v", "どれ"), t = mk("kp-t", "だれに");
    const lab = sel.parentElement && sel.parentElement.tagName === "LABEL" ? sel.parentElement : null;
    sel.hidden = true;
    if (lab){
      sel.after(g);
      const wv = document.createElement("label"); wv.className = "f kp-vwrap"; wv.append("どれ", v);
      const wt = document.createElement("label"); wt.className = "f kp-vwrap"; wt.append("だれに", t);
      lab.after(wv, wt); sel._kpWrap = wv; sel._kpTWrap = wt;
    } else sel.after(g, v, t);
    const push = () => { sel.value = v.value; sel.dataset.to = t.value || ""; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); };
    g.addEventListener("change", () => { fillV(sel); fillT(sel); push(); });
    v.addEventListener("change", () => { fillT(sel); push(); });
    t.addEventListener("change", push);
    sel._kp = { g, v, t, sig: "" };
  }
  const avail = [...sel.options].map(o => o.value).filter(k => !PICK_HIDDEN.includes(k) || k === sel.value), { g } = sel._kp, sig = avail.join(",");
  if (sig !== sel._kp.sig){
    sel._kp.sig = sig;
    const known = new Set(KIND_GROUPS.flatMap(x => x.v.map(y => y[0])));
    const groups = KIND_GROUPS.map(x => ({ ...x, v: x.v.filter(([k]) => avail.includes(k)) })).filter(x => x.v.length);
    avail.filter(k => !known.has(k)).forEach(k => groups.push({ g: "k_" + k, label: (KINDS[k] || {}).label || k, v: [[k, ""]] }));
    sel._kp.groups = groups;
    g.innerHTML = groups.map(x => `<option value="${x.g}">${x.label}</option>`).join("");
  }
  const cur = sel._kp.groups.find(x => x.v.some(([k]) => k === sel.value)) || sel._kp.groups[0];
  if (cur) g.value = cur.g;
  fillV(sel, sel.value); fillT(sel, sel.dataset.to);
}
function fillV(sel, want){
  const { g, v } = sel._kp, grp = sel._kp.groups.find(x => x.g === g.value); if (!grp) return;
  v.innerHTML = grp.v.map(([k, l]) => `<option value="${k}">${l || (KINDS[k] || {}).label || k}</option>`).join("");
  v.value = grp.v.some(([k]) => k === want) ? want : grp.v[0][0];
  const one = grp.v.length < 2; v.hidden = one; if (sel._kpWrap) sel._kpWrap.hidden = one;
}
// 「だれに」: for effects aimed at the opponent's side
function fillT(sel, want){
  const { v, t } = sel._kp, k = v.value, opts = TARGETABLE[k];
  t.innerHTML = opts ? opts.map(o => `<option value="${o}">${o === "one" && hitsPlayer(k) ? "1体をえらぶ（スパイア風は相手のモンスター優先、ふつうの枠は相手）" : TO_LABEL[o]}</option>`).join("") : "";
  t.value = opts && opts.includes(want) ? want : opts ? opts[0] : "";
  t.hidden = !opts; if (sel._kpTWrap) sel._kpTWrap.hidden = !opts;
  sel.dataset.to = t.value || "";
}
function syncFxForm(){
  attachKindPicker($("#fxKind")); attachKindPicker($("#cbKind"));
  const kind = $("#fxKind").value;
  $("#cbNWrap").hidden = !(KINDS[$("#cbKind").value] && KINDS[$("#cbKind").value].n);
  $("#fxNWrap").hidden = !(KINDS[kind] && KINDS[kind].n);
  if (typeof syncMoreFx === "function") syncMoreFx();
  $("#condRow").hidden = kind !== "win";
  $("#fxCnWrap").hidden = !(CONDS[$("#fxCond").value] || {}).n;
  if ($("#bkUI") && $("#bkUI").childNodes.length) updateBkText(); else $("#mkFxLine").textContent = fxText({ type: MK.type, fx: readFx(), combo: readCombo(), ss: readSS() });
  $("#fxAskWrap").hidden = !$("#fxAskOn").checked;
  $("#cbState").textContent = readCombo() ? "（設定あり）" : "";
  syncEqLine();
  if (typeof updateSecs === "function") updateSecs();
}
$("#mkQuick").addEventListener("change", () => { $("#mkTab").textContent = mkTabLabel(); setMkType(MK.type); });
// 発動タイミング: 罠と速攻魔法だけ（スパイア風・フィールドはなし）
function mkTrapOk(t){ return t === "trap" || (t === "magic" && $("#mkQuick").checked && !$("#mkField").checked && $("#mkFrame").value !== "spire"); }
function mkWhenVal(){ const t = MK.type, on = MK.kind !== "potion" && MK.kind !== "relic" && $("#mkFrame").value !== "spire" && (t === "trap" || (t === "magic" && $("#mkQuick").checked && !$("#mkField").checked)); return on && WHEN_LABEL[$("#mkWhen").value] ? $("#mkWhen").value : null; }
// ふつうの罠・速攻魔法は効果ブロックの「いつ」で決める。永続は「いつ」が効果の出るタイミングなので、上の欄で決める
function mkWhenOn(){ const t = MK.type; return MK.kind !== "potion" && MK.kind !== "relic" && $("#mkFrame").value !== "spire" && (t === "trap" || (t === "magic" && $("#mkQuick").checked && !$("#mkField").checked)); }
function syncWhenRow(){ $("#whenRow").hidden = !(mkWhenOn() && $("#mkPersist").checked); }
$("#mkWhen").addEventListener("change", () => updateBkText());
// 融合モンスター: 素材のリスト（2〜5個）
function mkFusionVal(){ if (MK.type !== "monster" || MK.kind === "potion" || MK.kind === "relic" || !$("#mkFusion").checked) return null; const L = (MK.fusion || []).filter(x => x.m === "any" || String(x.v || "").trim()).map(x => ({ m: x.m === "tag" || x.m === "any" ? x.m : "name", v: x.m === "any" ? "" : String(x.v).trim() })); return L.length ? L : null; }
function renderFusion(){
  const box = $("#fusionMats"); if (!box) return;
  const on = $("#mkFusion").checked; box.hidden = !on;
  { const sm = $("#sumFusion"); if (sm){ const v = mkFusionVal(); sm.textContent = v ? v.map(fusionMatText).join("＋") : "なし"; sm.classList.toggle("on", !!v); } }
  if (!on) return;
  if (!MK.fusion || !MK.fusion.length) MK.fusion = [{ m: "name", v: "" }, { m: "name", v: "" }];
  const opt = (v, l, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`;
  box.innerHTML = MK.fusion.map((x, j) => `<div class="bk-row" data-i="${j}"><span class="bk-no">${j + 1}</span><select data-f="m" aria-label="素材の決め方">${opt("name", "名前で", x.m)}${opt("tag", "タグで", x.m)}${opt("any", "どのモンスターでも", x.m)}</select>${x.m === "any" ? "" : `<input type="text" data-f="v" list="${x.m === "tag" ? "tagNames" : "cardNames"}" maxlength="40" placeholder="${x.m === "tag" ? "タグ" : "モンスターの名前"}" value="${esc(x.v || "")}" aria-label="素材">`}${MK.fusion.length > 2 ? `<button type="button" class="small ghost" data-fdel="${j}" aria-label="この素材を消す">×</button>` : ""}</div>`).join("")
    + (MK.fusion.length < 5 ? `<button type="button" class="small bk-add" data-fadd>＋ 素材を足す</button>` : "")
    + `<p class="note" style="margin:0">融合召喚するとき、自分の手札か場から素材のモンスターを墓地へ送る。魔法カードなどの効果「融合召喚する」で出す</p>`;
}
$("#mkFusion").addEventListener("change", () => { if ($("#mkFusion").checked) $("#mkEx").checked = true; renderFusion(); updateBkText(); });
$("#fusionMats").addEventListener("change", e => { const el = e.target.closest("[data-f]"); if (!el) return; const x = MK.fusion[+el.closest(".bk-row").dataset.i]; if (!x) return; x[el.dataset.f] = el.value; if (el.dataset.f === "m") renderFusion(); else { const sm = $("#sumFusion"); renderFusion(); } updateBkText(); });
$("#fusionMats").addEventListener("input", e => { const el = e.target.closest("input[data-f]"); if (!el) return; const x = MK.fusion[+el.closest(".bk-row").dataset.i]; if (x){ x.v = el.value; updateBkText(); } });
$("#fusionMats").addEventListener("click", e => { if (e.target.closest("[data-fadd]")){ MK.fusion.push({ m: "name", v: "" }); renderFusion(); return; } const d = e.target.closest("[data-fdel]"); if (d){ MK.fusion.splice(+d.dataset.fdel, 1); renderFusion(); updateBkText(); } });
function mkTabLabel(){ const t = MK.type, pers = (t === "magic" || t === "trap") && $("#mkPersist").checked; if ($("#mkFrame").value === "spire") return SPIRE_LABEL[mkSk()]; return t === "magic" && $("#mkField").checked ? "フィールド魔法" : t === "magic" && $("#mkQuick").checked ? "速攻魔法" : (pers ? "永続" : "") + TYPE_LABEL[t]; }
$("#mkPersist").addEventListener("change", () => { if ($("#mkPersist").checked) $("#mkField").checked = false; setMkType(MK.type); });
$("#mkField").addEventListener("change", () => { if ($("#mkField").checked){ $("#mkPersist").checked = false; $("#mkQuick").checked = false; } setMkType(MK.type); });
["#mkPayLp", "#mkPayDisc", "#mkPayMax"].forEach(q => $(q).addEventListener("input", () => updateBkText()));
function mkPays(save){ const v = q => Math.max(0, Math.round(+$(q).value || 0)) || (save ? null : 0); return { payLp: v("#mkPayLp"), payDisc: $("#mkPayDiscAll").checked ? -1 : v("#mkPayDisc"), payDiscTag: $("#mkPayDiscTag").value.trim() || null, payMax: v("#mkPayMax"), payCtr: mkPayCtrVal(), ...mkCostMech(save) }; }
["#mkPayDiscTag", "#mkTags", "#mkTribTag"].forEach(q => $(q).addEventListener("input", () => updateBkText()));
// カード工房の見本: タグを名前の下に
function syncTribe(){ const el = $("#mkTribe"), en = $("#mkTribeN"); if (!el) return; const L = parseTags($("#mkTags").value), on = !!($("#mkShowTags").checked && L.length), fr = $("#mkFrame").value, band = !fr || fr === "dm";
  el.textContent = en.textContent = L.join("／"); en.style.setProperty("--trn", Math.max(1, [...L.join("／")].length)); el.hidden = !on || band; en.hidden = !on || !band; en.parentElement.classList.toggle("has-tr", on && band); }
$("#mkFrame").addEventListener("change", () => syncTribe());
$("#mkTags").addEventListener("input", syncTribe); $("#mkShowTags").addEventListener("change", syncTribe);
$("#mkPayDiscAll").addEventListener("change", () => { $("#mkPayDisc").disabled = $("#mkPayDiscAll").checked; updateBkText(); });
// スパイア風: スキル = magic, パワー = 永続 magic (the kind buttons show which one is on)
function syncTypePressed(){ const sk = mkSk(), map = { monster: "attack", magic: "skill", power: "power" }; document.querySelectorAll("#mkType button").forEach(b => { const k = b.dataset.t; b.setAttribute("aria-pressed", sk ? map[k] === sk : k === MK.type); }); }
// スパイア風: the kind buttons read アタック / スキル / パワー and there is no 装備
function syncTypeNames(){ const sp = $("#mkFrame").value === "spire"; document.querySelectorAll("#mkType button").forEach(b => { b.dataset.base = b.dataset.base || b.textContent; b.textContent = sp ? SPIRE_LABEL[b.dataset.t] : b.dataset.base; b.hidden = sp ? b.dataset.t === "equip" || b.dataset.t === "trap" : b.dataset.t === "power"; }); if (sp && MK.type !== "magic"){ const k = MK.type === "trap" ? "power" : "attack"; MK.sk = k; $("#mkPersist").checked = k === "power"; setMkType("magic"); } else setMkType(MK.type || "monster"); if (MK.type) $("#mkTab").textContent = mkTabLabel(); }
$("#mkType").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if ($("#mkFrame").value === "spire"){ const k = { monster: "attack", magic: "skill", power: "power" }[b.dataset.t]; if (!k) return; MK.sk = k; $("#mkPersist").checked = k === "power"; setMkType("magic"); return; } setMkType(b.dataset.t); });
// sensible default numbers when the effect kind changes (cards to draw vs. points)
// 数の入れ方: ダメージ・ATK・LP・ブロックのような「量」は100くらい、それ以外（枚数・回数・ターン数）は1から
const BIG_N = ["dex", "dexTemp", "dmg", "heal", "block", "selfAtk", "atkUp", "atkAll", "atkDown", "atkDownTmp", "loseLp", "plate", "thornsNow", "rageNow", "blast", "str", "strTemp", "oppStr", "oppStrDown", "vulnBonus", "bash", "dmgRand", "dmgAll", "atkDownAll"];
const smallN = k => !BIG_N.includes(k);
[["#fxKind", "#fxN"], ["#cbKind", "#cbN"]].forEach(([k, n]) => $(k).addEventListener("change", () => {
  const v = +$(n).value || 0, kind = $(k).value;
  if (smallN(kind) && v > 5) $(n).value = 1;
  if (!smallN(kind) && v < 50) $(n).value = 100;
  syncFxForm();
}));
$("#cbWhere").innerHTML = Object.entries(WHERE).map(([k, v]) => `<option value="${k}">自分の${v}</option>`).join("");
["#fxTrig", "#fxKind", "#fxN", "#fxCond", "#fxCn", "#cbName", "#cbMatch", "#cbWhere", "#cbKind", "#cbN"].forEach(s => $(s).addEventListener("input", syncFxForm));
// 追加の効果 rows (any number): what to do + a number, run right after the main effect
function moreKindOpts(){ return [...$("#fxKind").options].filter(o => o.value !== "none" && o.value !== "win").map(o => `<option value="${o.value}">${o.textContent}</option>`).join(""); }
function addMoreFx(m){
  const r = document.createElement("div"); r.className = "mfx";
  r.innerHTML = `<span class="note">そのあと</span><select class="mfk">${moreKindOpts()}</select><input type="number" class="mfn" min="1" max="9999" value="${m && m.n ? m.n : 100}"><button class="small ghost" type="button" data-mfdel aria-label="この効果を消す">×</button>`;
  const lg = m && TO_LEGACY[m.kind]; const mk = lg ? lg[0] : m && m.kind;
  if (mk && r.querySelector(`.mfk option[value="${mk}"]`)) r.querySelector(".mfk").value = mk;
  r.querySelector(".mfk").dataset.to = lg ? lg[1] : (m && m.to) || "";
  $("#moreFx").appendChild(r); syncMoreFx();
}
function syncMoreFx(){
  const on = $("#fxKind").value && $("#fxKind").value !== "none";
  $("#btnMoreFx").hidden = !on; $("#moreFx").hidden = !on;
  document.querySelectorAll("#moreFx .mfx").forEach(r => { const s = r.querySelector(".mfk"), k = s.value; attachKindPicker(s); r.querySelector(".mfn").hidden = !(KINDS[k] && KINDS[k].n); });
}
function refreshMoreFx(){ const cur = [...document.querySelectorAll("#moreFx .mfx")].map(r => ({ kind: r.querySelector(".mfk").value, n: +r.querySelector(".mfn").value, to: r.querySelector(".mfk").dataset.to })); $("#moreFx").innerHTML = ""; cur.forEach(m => { if ([...$("#fxKind").options].some(o => o.value === m.kind)) addMoreFx(m); }); syncMoreFx(); }
$("#btnMoreFx").addEventListener("click", () => { addMoreFx({ kind: "draw", n: 1 }); syncFxForm(); });
$("#moreFx").addEventListener("click", e => { const d = e.target.closest("[data-mfdel]"); if (d){ d.closest(".mfx").remove(); syncFxForm(); } });
$("#moreFx").addEventListener("input", e => { if (e.target.closest(".kp-g,.kp-v,.kp-t")) return; syncMoreFx(); syncFxForm(); });
$("#moreFx").addEventListener("change", e => { if (e.target.closest(".kp-g,.kp-v,.kp-t")) return; const s = e.target.closest(".mfk"); if (s){ const n = s.parentNode.querySelector(".mfn"), v = +n.value || 0; if (smallN(s.value) && v > 5) n.value = 1; if (!smallN(s.value) && v < 50) n.value = 100; } syncMoreFx(); syncFxForm(); });
function loadFxForm(c){
  if (typeof loadBlocks === "function") loadBlocks(c);
  const fx = normFx(c);
  $("#moreFx").innerHTML = "";
  { const lg = fx && TO_LEGACY[fx.kind]; $("#fxKind").value = fx ? (lg ? lg[0] : fx.kind) : "none"; $("#fxKind").dataset.to = lg ? lg[1] : (fx && fx.to) || ""; }
  moreFx(fx).forEach(m => addMoreFx(m));
  if (fx && (MK.type === "monster" || MK.type === "equip" || isPersist(c))) $("#fxTrig").value = fx.trig;
  $("#fxAskOn").checked = !!(fx && fx.ask); $("#fxAsk").value = fx && fx.ask ? fx.ask : "";
  $("#fxN").value = fx && fx.n ? fx.n : 100;
  $("#fxCond").value = fx && fx.cond ? fx.cond : "none";
  $("#fxCn").value = fx && fx.cn ? fx.cn : 3;
  const cb = normCombo(c);
  if (cb && MK.type === "monster" && !fx) $("#fxTrig").value = cb.trig;
  $("#cbName").value = cb ? cb.name : ""; $("#cbBox").open = !!cb; $("#cbWhere").value = cb ? cb.where : "field"; $("#cbMatch").value = cb ? cb.match : "exact"; { const lg = cb && TO_LEGACY[cb.kind]; $("#cbKind").value = cb ? (lg ? lg[0] : cb.kind) : "none"; $("#cbKind").dataset.to = lg ? lg[1] : (cb && cb.to) || ""; } $("#cbN").value = cb && cb.n ? cb.n : 100;
  syncFxForm();
}

/* ---- the block builder in the card maker ---- */
MK.blocks = [];
// 効果の作り方: かんたん (よく使う効果だけ) / こだわり (ぜんぶ). Things already set on a card always stay visible.
function isEasyKind(k){ return ["fusion", "destroySt", "destroyStAll", "dmg", "destroy", "killAtk", "atkDownAtk", "vuln", "charm", "atkDown", "selfAtk", "atkUp", "atkAll", "heal", "block", "draw", "discard", "revive", "reborn", "cancel", "negate", "manaNow", "manaMax"].includes(k); }
MK.easy = ls.get("cb_fxmode") !== "pro";
function easyKinds(){ const ks = mkKinds(), e = ks.filter(isEasyKind); return e.length ? e : ks; }
function syncProOn(){
  const on = (q, v) => { const el = $(q); if (el) el.classList.toggle("pro-on", !!v); };
  { const c = mkPreviewCard(), tx = extraCostText(c).replace(/^【コスト】/, ""), el = $("#sumCost"); if (el){ el.textContent = tx || "なし"; el.classList.toggle("on", !!tx); } }
  on("#payRow", (+$("#mkPayLp").value || 0) || (+$("#mkPayDisc").value || 0) || $("#mkPayDiscAll").checked || (+$("#mkPayMax").value || 0) || (+$("#mkPayCtrN").value || 0) || (+$("#mkSbCost").value || 0) || $("#mkGz").checked || $("#mkDelve").checked || ($("#mkRevG") && $("#mkRevG").checked) || $("#mkRevo").checked || ($("#mkDmEvo") && $("#mkDmEvo").checked) || ($("#mkMug") && $("#mkMug").checked));
  on("#secAtk", (MK.atkConds || []).length);
  on("#secSs", (+$("#mkTrib").value || 0) || $("#ssOn").checked);
  on("#tokenRow", $("#mkToken").checked);
  { const ec = $("#editCard"); if (ec) ec.classList.toggle("token", $("#mkToken").checked); }
}
function applyFxMode(){
  document.body.classList.toggle("fx-easy", !!MK.easy);
  document.querySelectorAll("#mkFxMode button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.m === "easy") === !!MK.easy)));
  const n = $("#fxModeNote"); if (n) n.textContent = MK.easy ? "よく使う効果だけ出しています。条件・くり返し・追加コスト・生贄などは「こだわり」で" : "ぜんぶの効果・条件・コストが使えます";
  syncProOn(); renderBlocksUI();
}
$("#mkToken").addEventListener("change", syncProOn);
$("#mkNoUse").addEventListener("change", () => updateBkText());
["#mkFlash", "#mkStrig", "#mkKick"].forEach(q => $(q).addEventListener("input", () => updateBkText()));
$("#mkEx").addEventListener("change", () => updateBkText());
function setFxMode(m){ MK.easy = m !== "pro"; ls.set("cb_fxmode", MK.easy ? "easy" : "pro"); applyFxMode(); }
function mkKinds(){
  const t = MK.type;
  return Object.entries(KINDS).filter(([k, v]) => k !== "none" && (!v.trap || mkTrapOk(t)) && (!v.mon || t === "monster" || t === "equip") && (!v.chain || t === "trap" || t === "magic")).map(([k]) => k);
}
function mkTrigs(){ if (MK.kind === "relic") return RELIC_TRIGS; if (MK.type === "magic" && $("#mkField").checked) return FIELD_TRIGS; const t = MK.type, pers = (t === "magic" || t === "trap") && $("#mkPersist").checked; return t === "monster" ? MON_TRIGS : t === "equip" ? EQ_TRIGS : pers ? PERSIST_TRIGS : ["use"]; }
const mkTrigLabel = k => { if (MK.kind === "relic") return RELIC_TRIG_LABEL[k]; if (MK.type === "magic" && $("#mkField").checked) return ($("#mkFieldMine").checked ? FIELD_MINE_LABEL : FIELD_TRIG_LABEL)[k]; const t = MK.type, pers = (t === "magic" || t === "trap") && $("#mkPersist").checked; return pers ? PERSIST_TRIG_LABEL[k] : trigLabel(t, k); };
function kindGroups(avail, cur){
  avail = avail.filter(k => !PICK_HIDDEN.includes(k) || k === cur);
  const known = new Set(KIND_GROUPS.flatMap(x => x.v.map(y => y[0])));
  const gs = KIND_GROUPS.filter(x => x.g !== "none").map(x => ({ ...x, v: x.v.filter(([k]) => avail.includes(k)) })).filter(x => x.v.length);
  avail.filter(k => !known.has(k)).forEach(k => gs.push({ g: "k_" + k, label: (KINDS[k] || {}).label || k, v: [[k, ""]] }));
  return gs;
}
const defN = k => k === "atkMul" ? 2 : smallN(k) ? 1 : 100;
// フラッシュバック（魔法だけ）・S・トリガー・キッカー
function mkSpOpts(){ const sp = MK.type === "magic" || MK.type === "trap", k = Math.max(0, Math.min(99, Math.round(+$("#mkKick").value || 0))); return { ...(sp && MK.type === "magic" && $("#mkFlash").checked ? { flashback: true } : {}), ...(sp && $("#mkStrig").checked ? { strig: true } : {}), ...(sp && k ? { kick: k } : {}) }; }
// 要求質量: モンスターは召喚のとき、フィールド魔法は発動のとき
function mkMassVal(){ const v = id => Math.max(0, Math.min(40, Math.round(+$(id).value || 0))) || null; return MK.type === "monster" ? v("#mkMass") : MK.type === "magic" && $("#mkField").checked ? v("#mkFMass") : null; }
function mkPreviewCard(){ return { fusion: mkFusionVal(), when: mkWhenVal(), field: MK.type === "magic" && $("#mkField").checked, ex: $("#mkEx").checked, noUse: (MK.type === "magic" || MK.type === "trap") && $("#mkNoUse").checked, fxRows: $("#mkFxRows").checked, ...mkSpOpts(), mass: mkMassVal(), fieldMine: MK.type === "magic" && $("#mkField").checked && $("#mkFieldMine").checked || null, anySum: MK.type === "monster" && $("#mkAnySum").checked || null, land: MK.type === "magic" && $("#mkField").checked && $("#mkLand").checked || null, tags: MK.kind === "card" || !MK.kind ? parseTags($("#mkTags").value) : [], showTags: (MK.kind === "card" || !MK.kind) && $("#mkShowTags").checked || null, tribTag: MK.type === "monster" ? $("#mkTribTag").value.trim() || null : null, ...(MK.type === "monster" ? mkVarFields() : {}), ...(MK.kind === "relic" ? { relicView: true } : {}), type: MK.type, frame: MK.kind === "potion" || MK.kind === "relic" ? "spire" : $("#mkFrame").value, persist: (MK.type === "magic" || MK.type === "trap") && $("#mkPersist").checked && !$("#mkField").checked, costX: $("#mkCost").value === "X", costInf: $("#mkCost").value === "∞", ...mkPays(), blocks: readBlocks(), ss: readSS(), eqN: Math.round(+$("#mkEq").value || 0), abs: readAbs() }; }
function readBlocks(){
  const bs = (MK.blocks || []).map(b => ({ trig: b.trig, ...(b.cont ? { cont: true } : {}), ...(b.bn ? { bn: b.bn } : {}), ...(b.necro > 0 ? { necro: b.necro } : {}), ...(b.trig === "act" && b.mcost > 0 ? { mcost: b.mcost } : {}), ...(b.trig === "ctrReach" ? { rc: b.rc || ctrDefault(), rn: b.rn || 1, rw: b.rw === "me" ? "me" : "self" } : {}), ...(b.trig === "act" && b.cost && b.cost.id && b.cost.n > 0 ? { cost: { id: b.cost.id, n: b.cost.n, w: b.cost.w } } : {}), ...(b.bic ? { bic: b.bic } : {}), ...(b.bd ? { bd: b.bd } : {}), ...(b.one ? { one: true } : {}), ...(b.trig === "act" ? { ap: b.ap === "game" || b.ap === "free" ? b.ap : "turn", an: Math.max(1, Math.min(9, Math.round(+b.an || 1))) } : {}), ...(b.delay > 0 ? { delay: b.delay } : {}), ...(b.grant && b.grant.to ? { grant: { to: b.grant.to, at: b.grant.at === "turnStart" ? "turnStart" : "turnEnd", dur: b.grant.dur || 0 } } : {}), ...(b.roll === "die" || b.roll === "coin" ? { roll: b.roll, ...(b.roll === "die" && b.faces && b.faces !== 6 ? { faces: b.faces } : {}) } : {}), join: b.join === "or" ? "or" : "and", conds: (b.conds || []).map(x => ({ ...x })), then: (b.then || []).map(cleanEff).filter(Boolean), else: (b.conds || []).length ? (b.else || []).map(cleanEff).filter(Boolean) : [], ...(b.roll === "die" && (b.dieBr || []).length ? { dieBr: b.dieBr.map(x => ({ lo: x.lo, hi: x.hi, then: (x.then || []).map(cleanEff).filter(Boolean) })).filter(x => x.then.length) } : {}) })).filter(b => b.then.length || (b.dieBr || []).length || b.else.length);
  return bs.length ? bs : null;
}
function loadBlocks(c){ MK.blocks = c ? JSON.parse(JSON.stringify(blocksOf(c))) : []; renderBlocksUI(); }
const BK_TEMPLATES = [
  { name: "ダメージ＋ドロー", then: [{ kind: "dmg", n: 100 }, { kind: "draw", n: 1 }] },
  { name: "ブロック＋ドロー", then: [{ kind: "block", n: 100 }, { kind: "draw", n: 1 }] },
  { name: "召喚したとき強化", trig: "summon", then: [{ kind: "selfAtk", n: 100 }] },
  { name: "全体攻撃", then: [{ kind: "dmg", n: 100, to: "all" }] },
  { name: "もし〜なら", conds: [{ k: "lp", op: "le", n: 300 }], then: [{ kind: "heal", n: 200 }], else: [{ kind: "draw", n: 1 }] }
];
function bkNormalize(){
  MK.blocks = MK.blocks || [];
  MK.blocks.forEach((b, i) => { if (!i) delete b.cont; else if (b.cont) b.trig = MK.blocks[i - 1].trig; });
  const trigs = mkTrigs(), kinds = mkKinds();
  MK.blocks.forEach(b => {
    if (!trigs.includes(b.trig)) b.trig = trigs[0];
    b.conds = b.conds || []; b.else = b.else || []; b.join = b.join === "or" ? "or" : "and";
    const unLegacy = e => { const lg = TO_LEGACY[e.kind]; return lg && kinds.includes(lg[0]) ? { ...e, kind: lg[0], to: lg[1] } : e; };
    b.then = (b.then || []).map(unLegacy).filter(e => kinds.includes(e.kind)); b.else = b.else.map(unLegacy).filter(e => kinds.includes(e.kind));
    if (b.roll !== "die" || (b.dieBr && !b.dieBr.length)) b.dieBr = null; else if (b.dieBr) b.dieBr.forEach(x => { x.then = (x.then || []).map(unLegacy).filter(e => kinds.includes(e.kind)); });
  });
}
function renderBlocksUI(){
  const box = $("#bkUI"); if (!box) return;
  bkNormalize();
  const trigs = mkTrigs(), kinds = mkKinds(), groups = kindGroups(kinds), easy = !!MK.easy, ek = easyKinds();
  const gFor = (e, bi) => { const bk = (MK.blocks[bi] || {}).trig === "while" ? kinds.filter(k => STATIC_KINDS.includes(k) || k === e.kind) : kinds; return kindGroups(easy ? bk.filter(k => ek.includes(k) || k === e.kind || (MK.blocks[bi] || {}).trig === "while") : bk, e.kind); };
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`;
  const effRow = (bi, part, e, j, sub) => {
    const gs = sub ? kindGroups(kinds.filter(k => !KINDS[k].mod && k !== "win"), e.kind) : gFor(e, bi), has = x => x.v.some(([k]) => k === e.kind), g = (e._g && gs.find(x => x.g === e._g && has(x))) || gs.find(has) || gs[0];
    const tg = TARGETABLE[e.kind];
    return `<div class="bk-row${sub ? " bk-sub" : ""}" data-part="${part}" data-i="${j}"${sub ? ' data-sub="ge"' : ""}>${sub ? `<span class="note bk-subl">${sub === "rep" ? "上書きする効果" : "足す効果"}</span>` : `<span class="bk-no">${j + 1}</span>`}`
      + `<select data-f="g" aria-label="なにをする">${gs.map(x => opt(x.g, x.label, g && g.g)).join("")}</select>`
      + (g && famCollapse(g.v, e.kind).length > 1 ? `<select data-f="kind" aria-label="どれ">${famCollapse(g.v, e.kind).map(([k, l]) => opt(k, l || KINDS[k].label, e.kind)).join("")}</select>` : "")
      + famSel(e, g ? g.v.map(x => x[0]) : [], opt)
      + (tg ? toUI(e, opt) : "")
      + (KINDS[e.kind] && KINDS[e.kind].ctr ? ctrEffUI(e, opt) : "")
      + (e.kind === "dblNext" || e.kind === "freeNext" || (e.kind === "setCost" && e.sp !== "pick") ? usedPfUI(e, opt) : "")
      + (e.kind === "setCost" ? `<select data-f="sp" aria-label="どのカード">${opt("filter", "手札の（しぼる）", e.sp === "pick" ? "pick" : "filter")}${opt("pick", "1枚えらぶ", e.sp === "pick" ? "pick" : "filter")}</select><select data-f="sd" aria-label="いつまで">${opt("turn", "このターン", e.sd === "used" ? "used" : "turn")}${opt("used", "使うまで", e.sd === "used" ? "used" : "turn")}</select>` : "")
      + (e.kind === "copyPick" ? `<select data-f="cpw" aria-label="いつ加える">${opt("", "いま", e.cpw || "")}${opt("next", "次の自分のターンのはじめ", e.cpw || "")}</select>` : "")
      + (e.kind === "giveAb" ? gabUI(e, opt) : "")
      + (mfAble(e) ? `<span class="bk-mf"><select data-f="mfK" aria-label="しぼる">${opt("", "しぼらない", e.mfK || "")}${opt("cost", "コストが", e.mfK || "")}${opt("atk", "ATKが", e.mfK || "")}</select>${MF_K[e.mfK] ? `<select data-f="mfBy" aria-label="くらべるもの">${Object.entries(MF_BY).map(([k, d]) => opt(k, d.label, MF_BY[e.mfBy] ? e.mfBy : "n")).join("")}</select>${(MF_BY[e.mfBy] ? e.mfBy : "n") === "n" ? `<input type="number" data-f="mfN" min="0" max="9999" value="${esc(e.mfN ?? 0)}" style="width:64px" aria-label="数">` : `<label class="note">＋<input type="number" data-f="mfN" min="-99" max="99" value="${esc(e.mfN ?? 0)}" style="width:52px" aria-label="たす数"></label>`}<select data-f="mfOp" aria-label="以下・以上">${opt("le", "以下", e.mfOp === "ge" ? "ge" : "le")}${opt("ge", "以上", e.mfOp === "ge" ? "ge" : "le")}</select><span class="note">のモンスターだけ</span>` : ""}</span>` : "")
      + (e.kind === "removeBoard" ? `<select data-f="rside" aria-label="どちらの場">${Object.entries(RB_SIDE).map(([k, l]) => opt(k, l + "の場", e.rside || "op")).join("")}</select><select data-f="rm" aria-label="どうする">${Object.entries(RB_MODE).map(([k, l]) => opt(k, l, e.rm || "destroy")).join("")}</select>` : "")
      + (KINDS[e.kind] && KINDS[e.kind].n ? `<input type="number" data-f="n" min="${e.per || e.kind === "setCost" ? 0 : 1}" max="9999" value="${esc(e.n ?? defN(e.kind))}" aria-label="数">` : "")
      + (KINDS[e.kind] && KINDS[e.kind].name ? `<input type="text" data-f="into" list="${KINDS[e.kind] && KINDS[e.kind].tag ? "tagNames" : "cardNames"}" maxlength="40" value="${esc(e.into || "")}" placeholder="${KINDS[e.kind].tag ? "タグ（例: アイアンクラッド）" : KINDS[e.kind].need ? (e.kind === "autoPlay" ? "名前に入る文字（例: ストライク）" : "カード名") : "カード名（空ならランダム）"}" aria-label="カード名">` + pickHTML(e) : "") + modRowHTML(e) + ((e.kind === "modAdd" || e.kind === "modRep") && !sub ? effRow(bi, part, e.ge || (e.ge = { kind: e.gk && KINDS[e.gk] && !KINDS[e.gk].mod ? e.gk : "draw", n: e.gn || 1 }), j, e.kind === "modRep" ? "rep" : "add") : "")
      + (PER_OK[e.kind] && (!easy || e.per) ? `<select data-f="per" aria-label="ふえる">${opt("", "ふえない", e.per || "")}${Object.entries(PER_DEFS).filter(([k, d]) => !d.old || e.per === k).map(([k, d]) => opt(k, d.label + d.u + "につき", e.per || "")).join("")}</select>` + (e.per === "usedNow" || e.per === "handF" ? usedPfUI(e, opt) : "") + `` + (e.per === "ctr" ? ctrPerUI(e, opt) : "") + (e.per ? (e.kind === "dmg" ? `<select data-f="hits" aria-label="ふえかた">${opt("", "数が＋", e.hits ? "1" : "")}${opt("1", "もう1回", e.hits ? "1" : "")}</select>` : "") + (e.hits ? "" : `<input type="number" data-f="pm" min="1" max="9999" value="${esc(e.pm ?? 1)}" aria-label="1つにつき増える数">`) : "") : "")
      + ((MK.blocks[bi] || {}).roll === "die" ? `<select data-f="timesDie" aria-label="くり返し">${opt("", "1回", e.timesDie ? "1" : "")}${opt("1", "×出た目の回数", e.timesDie ? "1" : "")}</select>` : "")
      + (!e.timesDie && (!easy || e.times > 1) ? `<label class="bk-times" title="同じ効果を何回くり返すか">×<input type="number" data-f="times" min="1" max="20" value="${esc(e.times || 1)}" aria-label="回数">回</label>` : "")
      + (sub ? "" : `<button type="button" class="small ghost" data-bk="delRow" aria-label="この行を消す">×</button>`)
      + (MK.fxRows && !sub ? `<div class="bk-fxr">ブロック表示：<input type="text" data-f="dn" maxlength="20" value="${esc(e.dn || "")}" placeholder="名前（空なら${esc((FX_ROW_DEF[e.kind] || [""])[0] || "自動")}）"><select data-f="di" aria-label="アイコン">${opt("", "アイコン：自動", e.di || "")}${Object.entries(FX_ICONS).filter(([k]) => k !== "flag").map(([k, l]) => opt(k, l, e.di || "")).join("")}</select><input type="text" data-f="dd" maxlength="80" value="${esc(e.dd || "")}" placeholder="説明（空なら効果の文）"></div>` : "") + `</div>`;
  };
  const condRow = (b, x, j) => {
    let h = `<div class="bk-row" data-part="cond" data-i="${j}">`;
    if (j > 0) h += `<select data-f="join" aria-label="つなぎ" class="bk-join">${opt("and", "かつ", b.join)}${opt("or", "または", b.join)}</select>`;
    h += `<select data-f="k" aria-label="なにが">${Object.entries(COND_DEFS).map(([k, d]) => opt(k, d.label, x.k)).join("")}</select>`;
    if (x.k === "ctr") h += ctrCondUI(x, opt);
    if (x.k === "handF" || x.k === "drawn") h += usedPfUI(x, opt);
    if (isNumCond(x.k)) h += `<select data-f="op" aria-label="くらべかた">${opt("ge", "以上", x.op)}${opt("le", "以下", x.op)}${opt("eq", "ちょうど", x.op)}</select><input type="number" data-f="n" min="0" max="99999" value="${esc(x.n ?? 1)}" aria-label="数">`;
    if (x.k === "card") h += `<input type="text" data-f="name" maxlength="40" placeholder="カード名" value="${esc(x.name || "")}" aria-label="カード名"><select data-f="where" aria-label="どこに">${Object.entries(WHERE).map(([k, v]) => opt(k, "自分の" + v, x.where || "field")).join("")}</select><select data-f="match" aria-label="名前の合わせ方">${opt("exact", "名前がぴったり", x.match)}${opt("part", "名前に含む", x.match)}${opt("tag", "タグ", x.match)}</select><input type="number" data-f="cnt" min="0" max="99" value="${esc(x.cnt ?? 1)}" aria-label="枚数" style="width:64px">枚<select data-f="op" aria-label="くらべかた">${opt("ge", "以上", x.op || "ge")}${opt("le", "以下", x.op)}</select>`;
    if (x.k === "used") h += `<select data-f="who" aria-label="だれが">${opt("any", "だれでも", x.who || "any")}${opt("me", "自分が", x.who || "any")}${opt("op", "相手が", x.who || "any")}</select><select data-f="match" aria-label="どのカード">${opt("trap", "罠", x.match)}${opt("magic", "魔法", x.match)}${opt("name", "名前がぴったり", x.match)}${opt("part", "名前に含む", x.match)}${opt("tag", "タグ", x.match)}${opt("any", "なんでも", x.match)}</select>${["name", "part", "tag"].includes(x.match) ? `<input type="text" data-f="name" maxlength="40" list="${x.match === "tag" ? "tagNames" : "cardNames"}" placeholder="${x.match === "tag" ? "タグ" : "カード名"}" value="${esc(x.name || "")}" aria-label="カード名">` : ""}`;
    if (x.k === "stronger") h += `<select data-f="side" aria-label="どこに">${opt("op", "相手の場に", x.side || "op")}${opt("me", "自分の場に", x.side || "op")}${opt("any", "どちらかの場に", x.side || "op")}</select><span class="note">このモンスターよりATKが高いモンスターが</span><select data-f="has" aria-label="いる・いない">${opt("yes", "いる", x.has || "yes")}${opt("no", "いない", x.has || "yes")}</select>`;
    if (x.k === "ask") h += `<select data-f="who" aria-label="だれに聞く">${opt("me", "自分に聞く", x.who === "op" ? "op" : "me")}${opt("op", "相手に聞く", x.who === "op" ? "op" : "me")}</select>`;
    if (x.k === "ask") h += `<input type="text" data-f="text" maxlength="40" placeholder="例: 物理学実験を履修していますか？" value="${esc(x.text || "")}" aria-label="質問">`;
    return h + `<button type="button" class="small ghost" data-bk="delRow" aria-label="この条件を消す">×</button></div>`;
  };
  const tpls = BK_TEMPLATES.filter(tp => [...(tp.then || []), ...(tp.else || [])].every(e => kinds.includes(e.kind)) && (!tp.trig || trigs.includes(tp.trig)) && (!easy || (!tp.conds && [...(tp.then || [])].every(e => ek.includes(e.kind)))));
  box.innerHTML = `<div class="bk-sentence"><div class="bk-cap">できあがる文</div><div id="bkText"></div></div>`
    + (tpls.length ? `<div class="bk-tpls"><span class="note">ひな形から始める：</span>${tpls.map((tp, i) => `<button type="button" class="small" data-tpl="${BK_TEMPLATES.indexOf(tp)}">${esc(tp.name)}</button>`).join("")}</div>` : "")
    + (trigs.length <= 1 && mkWhenOn() ? `<div class="bk bk-whenbox"><div class="bk-grid"><span class="bk-tag t-when">いつ</span><div class="row" style="gap:6px;flex-wrap:wrap"><select data-f="when" aria-label="いつ（発動できるとき）">${opt("", "いつでも", $("#mkWhen").value)}${WHEN_ORDER.map(k => opt(k, WHEN_LABEL[k], $("#mkWhen").value)).join("")}</select><span class="note">${$("#mkWhen").value ? "このときにしか発動できない" : "自分のターンでも、相手のターンでも発動できる"}</span></div></div></div>` : "")
    + MK.blocks.map((b, bi) => `<div class="bk" data-b="${bi}"><div class="bk-h"><b>効果 ${bi + 1}</b>${bi ? `<label class="row" style="gap:4px;font-size:12px;margin-left:8px;cursor:pointer" title="前の効果のつづきとして出す（「さらに、もし引いたカードが〜なら」など）"><input type="checkbox" data-f="cont"${b.cont ? " checked" : ""}>さらに（前の効果のつづき）</label>` : ""}<span style="flex:1"></span>`
      + `<button type="button" class="small ghost" data-bk="up" aria-label="上へ" ${bi ? "" : "disabled"}>↑</button><button type="button" class="small ghost" data-bk="down" aria-label="下へ" ${bi < MK.blocks.length - 1 ? "" : "disabled"}>↓</button><button type="button" class="small ghost danger" data-bk="del" aria-label="この効果を消す">×</button></div>`
      + `<div class="bk-grid">`
      + (trigs.length > 1 && !b.cont ? `<span class="bk-tag t-when">いつ</span><div><select data-f="trig" aria-label="いつ">${trigs.map(k => opt(k, mkTrigLabel(k), b.trig)).join("")}</select></div>` : "")
      + (MK.fxRows && b.trig !== "while" ? `<span class="bk-tag t-when">見出し</span><div class="row" style="gap:6px;flex-wrap:wrap"><input type="text" data-f="bn" maxlength="20" value="${esc(b.bn || "")}" placeholder="ブロック表示の見出し（例: 起爆）"><input type="text" data-f="bd" maxlength="40" value="${esc(b.bd || "")}" placeholder="見出しの説明（空なら自動）"><select data-f="bic" aria-label="見出しのアイコン">${opt("", "アイコン：爆弾", b.bic || "")}${Object.entries(FX_ICONS).filter(([k]) => k !== "flag" && k !== "bomb").map(([k, l]) => opt(k, l, b.bic || "")).join("")}</select></div>` : "")
      + (b.trig === "ctrReach" ? ctrReachUI(b, opt) : "")
      + (b.trig === "act" ? ctrActCostUI(b, opt) + `<span class="bk-tag t-when">マナ</span><div class="row" style="gap:6px;align-items:center"><input type="number" data-f="amana" min="0" max="99" value="${esc(b.mcost || 0)}" aria-label="起動のマナコスト" style="width:64px"><span class="note">マナを払って発動（0ならなし。マナのないふつうのデッキではタダ）</span></div>` : "")
      + (b.trig === "act" ? (L => `<span class="bk-tag t-when">回数</span><div class="row" style="gap:6px;align-items:center"><select data-f="ap" aria-label="起動効果の回数">${opt("turn", "1ターンに", L.per)}${opt("game", "ゲーム中に", L.per)}${opt("free", "何回でも（制限なし）", L.per)}</select>${L.per === "free" ? "" : `<input type="number" data-f="an" min="1" max="9" value="${L.n}" aria-label="回数" style="width:60px"><span class="note">回まで</span>`}</div>`)(actLim(b)) : "")

      + ((!easy && b.trig !== "while") || b.necro > 0 ? `<span class="bk-tag t-when">ネクロ</span><div class="row" style="gap:6px;align-items:center"><span class="note">ネクロマンス：墓地のカードを</span><input type="number" data-f="necro" min="0" max="40" value="${esc(b.necro || 0)}" aria-label="ネクロマンスの枚数" style="width:64px"><span class="note">枚消費して発動（0ならなし。足りないときは出ない）</span></div>` : "")
      + `<span class="bk-tag t-when">まず</span><div class="row" style="gap:6px"><select data-f="roll" aria-label="まず">${opt("", "なし", b.roll || "")}${opt("die", "サイコロを振る", b.roll || "")}${opt("coin", "コインを投げる", b.roll || "")}</select>${b.roll === "die" ? `<input type="number" data-f="faces" min="2" max="100" value="${esc(b.faces || 6)}" aria-label="面の数" style="width:60px"><span class="note">面</span>` : ""}${b.roll === "die" ? `<select data-f="split" aria-label="出た目で分ける">${opt("", "どの目でも同じ効果", b.dieBr ? "1" : "")}${opt("1", "出た目ごとに効果を変える", b.dieBr ? "1" : "")}</select>` : ""}${b.roll ? `<span class="note">${b.roll === "die" ? "「もし」でサイコロの目を、数の「ふえる」や「×出た目の回数」で出た目を使えます" : "「もし」でコインが表／裏を使えます"}</span>` : ""}</div>`
      + (b.roll === "die" && b.dieBr ? `<span class="bk-tag t-do">出た目</span><div class="bk-col">${b.dieBr.map((x, k) => `<div class="bk-dbr"><div class="row bk-dbr-h" style="gap:4px;align-items:center"><input type="number" data-f="brlo" data-k="${k}" min="1" max="${b.faces || 6}" value="${x.lo}" aria-label="から" style="width:58px">${x.lo === x.hi ? "" : ""}<span>〜</span><input type="number" data-f="brhi" data-k="${k}" min="1" max="${b.faces || 6}" value="${x.hi}" aria-label="まで" style="width:58px"><b>が出たら</b><span style="flex:1"></span>${b.dieBr.length > 1 ? `<button type="button" class="small ghost" data-bk="delBr" data-k="${k}" aria-label="この目の行を消す">×</button>` : ""}</div>${x.then.map((e, j) => effRow(bi, "br" + k, e, j)).join("")}<button type="button" class="small bk-add" data-bk="addEff" data-part="br${k}">＋ ${x.then.length ? "そのあと…" : "効果を選ぶ"}</button></div>`).join("")}<button type="button" class="small bk-add" data-bk="addBr">＋ 出た目の範囲を足す</button><span class="note">「なにを」の効果はどの目でも出て、そのあとに出た目の効果が出ます</span></div>` : "")
      + (!easy || b.delay > 0 ? `<span class="bk-tag t-when">出るまで</span><div><select data-f="delay" aria-label="効果が出るまで">${[0, 1, 2, 3, 4, 5].map(d => opt(d, d === 0 ? "すぐ" : d === 1 ? "次の自分のターンのはじめ（時計1）" : `${d}ターン後の自分のターンのはじめ（時計${d}）`, b.delay || 0)).join("")}</select></div>` : "")
      + `<span class="bk-tag t-when">付与</span><div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><select data-f="gto" aria-label="プレイヤーに付与">${opt("", "しない（すぐ効果が出る）", b.grant ? b.grant.to : "")}${opt("me", "自分に付与する", b.grant ? b.grant.to : "")}${opt("op", "相手に付与する", b.grant ? b.grant.to : "")}</select>${b.grant ? `<select data-f="gat" aria-label="いつ出るか">${opt("turnStart", "そのプレイヤーのターンのはじめに", b.grant.at)}${opt("turnEnd", "そのプレイヤーのターンのおわりに", b.grant.at)}</select><select data-f="gdur" aria-label="何回">${[0, 1, 2, 3, 4, 5].map(d => opt(d, d ? `${d}回だけ` : "ずっと", b.grant.dur || 0)).join("")}</select><span class="note">「もし」「なにを」は、付与されたプレイヤーが自分のこととしておこなう（例：相手に付与＋LPを失う → 相手がLPを失う）</span>` : ""}</div>`
      + (easy && !b.conds.length && b.trig !== "anyUse" ? "" : `<span class="bk-tag t-if">もし</span><div class="bk-col">${b.conds.map((x, j) => condRow(b, x, j)).join("")}<button type="button" class="small bk-add" data-bk="addCond">＋ 条件を足す</button>${b.conds.length ? "" : `<span class="note">なし（いつも出る）</span>`}</div>`)
      + `<span class="bk-tag t-do">なにを</span><div class="bk-col">${b.then.map((e, j) => (j > 0 ? `<div class="row bk-connect" style="gap:8px;margin:4px 0 8px 24px"><select data-f="one" aria-label="効果のつなぎ（この一覧すべてに適用）" title="そして：すべて順に発動／または：一覧から1つ選んで発動">${opt("", "そして", b.one ? "1" : "")}${opt("1", "または", b.one ? "1" : "")}</select><span class="note">効果のつなぎ</span></div>` : "") + effRow(bi, "then", e, j)).join("")}<button type="button" class="small bk-add" data-bk="addEff" data-part="then">＋ ${b.then.length ? "そのあと…" : "効果を選ぶ"}</button></div>`
      + (b.conds.length ? `<span class="bk-tag t-else">ちがったら</span><div class="bk-col">${b.else.map((e, j) => effRow(bi, "else", e, j)).join("")}<button type="button" class="small bk-add" data-bk="addEff" data-part="else">＋ ${b.else.length ? "そのあと…" : "効果を選ぶ（なくてもいい）"}</button></div>` : "")
      + `</div></div>`).join("")
    + `<button type="button" class="bk-new" data-bk="addBlock">＋ 効果ブロックを足す${trigs.length > 1 ? "（べつのタイミング）" : ""}</button>`;
  updateBkText();
}
function updateBkText(){
  const c = mkPreviewCard(), el = $("#bkText");
  if (el) el.textContent = fxText({ ...c }) || "まだ効果がありません（なくてもOK。自由に書いた効果は手動で処理します）";
  $("#mkFxLine").innerHTML = kwLink(esc(MK.type === "equip" || MK.type === "monster" ? [MK.type === "equip" ? eqText(c) : monAbsText(c), fxText(c)].filter(Boolean).join("。") : fxText(c)));
  if (typeof updateSecs === "function") updateSecs();
}
function bkSync(){ if ($("#bkUI")) renderBlocksUI(); }
// remember which menu (group) a row was picked from — a kind can sit in two menus (e.g. 踏み倒す and 山札・墓地). Not saved.
function setG(o, g){ if (g) Object.defineProperty(o, "_g", { value: g, writable: true, configurable: true, enumerable: false }); return o; }
// 同じ名前のカードが何枚もあるときは「どのカード？」をえらべる（1枚だけなら自動でそれに決まる）
// だれに: 「自分／相手」＋「○体／全体／ランダムに○回」（数は ○体・ランダム のときだけ）
// 能力を付与する: だれに・どの能力（数・カード名）・いつまで
function gabUI(e, opt){
  const k = gabKey(e), d = ABS[k];
  return `<select data-f="gw" aria-label="だれに">${Object.entries(GAB_W).map(([v, l]) => opt(v, l, GAB_W[e.gw] ? e.gw : "self")).join("")}</select>`
    + `<select data-f="ab" aria-label="どの能力">${gabList().map(v => opt(v, ABS[v].label, k)).join("")}</select>`
    + (d.n ? `<input type="number" data-f="n" min="0" max="9999" value="${esc(e.n != null ? e.n : d.n)}" aria-label="数" style="width:72px">` : "")
    + (d.name ? `<input type="text" data-f="into" list="cardNames" maxlength="40" value="${esc(e.into || "")}" placeholder="${esc(d.ph || "カード名")}" aria-label="カード名">` : "")
    + `<select data-f="gd" aria-label="いつまで">${Object.entries(GAB_D).map(([v, l]) => opt(v, l, e.gd || "")).join("")}</select>`;
}
function usedPfUI(e, opt){ const pf = USED_PF[e.pf] ? e.pf : "any"; return `<select data-f="pf" aria-label="どんなカード">${Object.entries(USED_PF).map(([k, l]) => opt(k, l, pf)).join("")}</select>` + (["name", "part", "tag"].includes(pf) ? `<input type="text" data-f="pfn" list="${pf === "tag" ? "tagNames" : "cardNames"}" maxlength="40" value="${esc(e.pfn || "")}" placeholder="${pf === "tag" ? "タグ" : pf === "part" ? "名前に入る文字" : "カード名"}" aria-label="名前" style="width:120px">` : ""); }
function toUI(e, opt){
  const scope = e.to === "all" ? "all" : e.to === "random" ? "random" : "n", tn = e.tn || (e.to === "two" ? 2 : 1);
  const pl = hitsPlayer(e.kind), sp = $("#mkFrame").value === "spire";
  const nLabel = pl && !sp ? "えらぶ（1なら相手そのもの）" : "えらぶ";
  return (SELF_ONLY.has(e.kind) ? `<span class="note">自分のモンスター</span>` : `<select data-f="side" aria-label="自分か相手か">${opt("op", "相手", e.side === "me" ? "me" : "op")}${opt("me", "自分", e.side === "me" ? "me" : "op")}</select>`)
    + `<select data-f="scope" aria-label="どのくらい">${opt("n", nLabel, scope)}${opt("all", "全体", scope)}${opt("random", "ランダムに", scope)}</select>`
    + (scope === "all" ? "" : `<input type="number" data-f="tn" min="1" max="10" value="${esc(tn)}" aria-label="数" style="width:60px"><span class="note">${scope === "random" ? "回" : "体"}</span>`);
}
function modRowHTML(e){
  if (!KINDS[e.kind] || !KINDS[e.kind].mod) return "";
  const T = modT(e); e.ms = T.side; e.mpl = T.place; e.mc = T.scope; delete e.mt;
  const o = (v, l, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`;
  const canPick = T.side === "me" && T.place === "hand";
  let h = `<select data-f="ms" aria-label="だれの">${o("me", "自分", T.side)}${o("op", "相手", T.side)}</select>`
    + `<select data-f="mpl" aria-label="どこの">${o("hand", "手札", T.place)}${o("deck", "山札", T.place)}${o("both", "手札と山札", T.place)}${o("last", "直前に発動したカード", T.place)}</select>`
    + (T.place === "last" ? "" : `<select data-f="mc" aria-label="どのカードを">${canPick ? o("pick", "1枚えらぶ", T.scope) : ""}${o("all", "すべて", T.scope)}${o("rand", "ランダムに", T.scope)}${o("named", "名前を指定", T.scope)}</select>`);
  if (T.place === "last") h = h.replace(/^<select data-f="ms"[\s\S]*?<\/select>/, "");
  if (T.scope === "rand") h += `<input type="number" data-f="mn" min="1" max="40" value="${esc(e.mn || 1)}" aria-label="枚数" style="width:60px"><span class="note">枚</span>`;
  if (T.scope === "named") h += `<input type="text" data-f="into" list="cardNames" maxlength="40" value="${esc(e.into || "")}" placeholder="カード名" aria-label="カード名">`;
  if (false){
    h += `<span class="note">${e.kind === "modAdd" ? "足す効果" : "上書きする効果"}</span><select data-f="gk" aria-label="足す効果">${GRANT_KINDS.filter(k => KINDS[k]).map(k => o(k, KINDS[k].label, e.gk)).join("")}</select><input type="number" data-f="gn" min="1" max="9999" value="${esc(e.gn)}" aria-label="数" style="width:80px">`;
  }
  if (e.kind === "modName") h += `<input type="text" data-f="nm" maxlength="20" value="${esc(e.nm || "")}" placeholder="新しい名前" aria-label="新しい名前">`;
  return h;
}
function pickHTML(e){
  if (!pickCardKind(e.kind) || !e.into) return "";
  const L = nameCands(e.into, e.kind);
  if (!L.length) return `<span class="note bk-pick">見つからない名前です</span>`;
  if (L.length === 1){ e.intoId = L[0].id; }
  if (L.length === 1) return `<span class="note bk-pick" title="このカードに決まっています">✓ ${esc(TYPE_LABEL[cardType(L[0])] || "")}・${esc(L[0].starter ? "はじめから" : L[0].author || "？")}</span>`;
  const cur = L.some(c => c.id === e.intoId) ? e.intoId : (autoPickId(e) || L[0].id); e.intoId = cur;
  return `<select data-f="intoId" aria-label="どのカード？" class="bk-pick">${L.map(c => `<option value="${esc(c.id)}"${c.id === cur ? " selected" : ""}>${esc(c.name)}（${esc(TYPE_LABEL[cardType(c)] || "")}・${esc(c.starter ? "はじめから" : c.author || "？")}${c.token ? "・トークン" : ""}）</option>`).join("")}</select>`;
}
function autoPickId(x){ if (!pickCardKind(x.kind) || !x.into) return null; const L = nameCands(x.into, x.kind); if (!L.length) return null; if (x.intoId && L.some(c => c.id === x.intoId)) return x.intoId; return intoId(x.into, { ownerId: S.uid }, PICK_OK[x.kind]); }
// サイコロの出た目ごと: はじめは1つの目ずつ（7面以上なら半分ずつ）
function dieBrDefault(f){ return f <= 6 ? Array.from({ length: f }, (_, k) => ({ lo: k + 1, hi: k + 1, then: [] })) : [{ lo: 1, hi: Math.floor(f / 2), then: [] }, { lo: Math.floor(f / 2) + 1, hi: f, then: [] }]; }
// "then" / "else" / "br0", "br1"… → the effect list of block b
function bkList(b, part){ if (/^br\d+$/.test(part)){ const x = (b.dieBr || [])[+part.slice(2)]; return x ? (x.then = x.then || []) : null; } return b[part]; }
function bkEvent(e, rerenderOnInput){
  const el = e.target.closest("[data-f]"); if (!el) return;
  if (el.dataset.f === "when"){ if (e.type === "change"){ $("#mkWhen").value = el.value; renderBlocksUI(); } return; }
  const bi = +el.closest(".bk").dataset.b, b = MK.blocks[bi]; if (!b) return;
  const f = el.dataset.f, v = el.value;
  if (f === "cont"){ if (el.checked) b.cont = true; else delete b.cont; bkNormalize(); return renderBlocksUI(); }
  if (f === "ap"){ b.ap = v === "game" || v === "free" ? v : "turn"; if (!b.an) b.an = 1; return renderBlocksUI(); }
  if (f === "an"){ b.an = Math.max(1, Math.min(9, Math.round(+v || 1))); return updateBkText(); }
  if (f === "bn" || f === "bic" || f === "bd"){ if (v) b[f] = v.slice(0, f === "bd" ? 40 : 20); else delete b[f]; return updateBkText(); }
  if (f === "one"){ if (v === "1") b.one = true; else delete b.one; el.closest(".bk").querySelectorAll('[data-f="one"]').forEach(x => { x.value = b.one ? "1" : ""; }); return updateBkText(); }
  if (f === "trig"){ b.trig = v; if (v === "while"){ const fix = L => L.map(x => STATIC_KINDS.includes(x.kind) ? x : { kind: "selfAtk", n: 100 }); b.then = fix(b.then); b.else = fix(b.else); } if (v === "anyUse" && !b.conds.some(x => x.k === "used")) b.conds.push({ k: "used", who: "any", match: "trap", name: "" }); return renderBlocksUI(); }
  if (f === "delay"){ b.delay = Math.max(0, Math.min(9, +v || 0)); return updateBkText(); }
  if (f === "gto"){ b.grant = v === "me" || v === "op" ? { to: v, at: b.grant ? b.grant.at : "turnEnd", dur: b.grant ? b.grant.dur || 0 : 0 } : null; return renderBlocksUI(); }
  if (f === "gat" || f === "gdur"){ if (!b.grant) return; if (f === "gat") b.grant.at = v === "turnStart" ? "turnStart" : "turnEnd"; else b.grant.dur = Math.max(0, Math.min(9, +v || 0)); return updateBkText(); }
  if (f === "roll"){ b.roll = v === "die" || v === "coin" ? v : ""; if (b.roll === "die" && !b.faces) b.faces = 6; if (b.roll === "coin" && !b.conds.length){ b.conds.push({ k: "coinH" }); } return renderBlocksUI(); }
  if (f === "rc" || f === "rw"){ b[f] = v; return updateBkText(); }
  if (f === "necro"){ b.necro = Math.max(0, Math.min(40, Math.round(+v || 0))); return updateBkText(); }
  if (f === "amana"){ b.mcost = Math.max(0, Math.min(99, Math.round(+v || 0))); return updateBkText(); }
  if (f === "rn"){ b.rn = Math.max(1, Math.min(99, Math.round(+v || 1))); return updateBkText(); }
  if (f === "cpw"){ b.cost = v ? { id: (b.cost && b.cost.id) || ctrDefault(), n: (b.cost && b.cost.n) || 1, w: v } : null; return renderBlocksUI(); }
  if (f === "cpc" || f === "cpn"){ if (!b.cost) return; if (f === "cpc") b.cost.id = v; else b.cost.n = Math.max(1, Math.min(99, Math.round(+v || 1))); return updateBkText(); }
  if (f === "faces"){ b.faces = Math.max(2, Math.min(100, Math.round(+v || 6))); return b.dieBr ? renderBlocksUI() : updateBkText(); }
  if (f === "split"){ b.dieBr = v ? dieBrDefault(b.faces || 6) : null; return renderBlocksUI(); }
  if (f === "brlo" || f === "brhi"){ const x = b.dieBr && b.dieBr[+el.dataset.k]; if (!x) return; const n = Math.max(1, Math.min(b.faces || 6, Math.round(+v || 1))); if (f === "brlo"){ x.lo = n; if (x.hi < n) x.hi = n; } else { x.hi = n; if (x.lo > n) x.lo = n; } return e.type === "change" ? renderBlocksUI() : updateBkText(); }
  const row = el.closest(".bk-row"), part = row.dataset.part, j = +row.dataset.i;
  if (part === "cond"){
    const x = b.conds[j]; if (!x) return;
    if (f === "join"){ b.join = v; return renderBlocksUI(); }
    if (f === "k"){ b.conds[j] = v === "ctr" ? { k: v, ctr: ctrDefault(), cw: "self", op: "ge", n: 1 } : v === "stronger" ? { k: v, side: "op", has: "yes" } : v === "card" ? { k: v, name: "", where: "field", match: "exact" } : v === "ask" ? { k: v, text: "" } : v === "used" ? { k: v, who: "any", match: "trap", name: "" } : { k: v, op: v === "lp" ? "le" : "ge", n: v === "lp" || v === "oppLp" ? 300 : v === "maxMana" ? 7 : v === "played" ? 2 : 1 }; return renderBlocksUI(); }
    x[f] = f === "n" || f === "cnt" ? Math.max(0, Math.round(+v || 0)) : v;
    return f === "op" || f === "where" || f === "match" || f === "pf" ? renderBlocksUI() : updateBkText();
  }
  const list = bkList(b, part), x0 = list && list[j]; if (!x0) return;
  const sub = row.dataset.sub === "ge", x = sub ? (x0.ge = x0.ge || { kind: "draw", n: 1 }) : x0, put = o => { if (sub) x0.ge = o; else list[j] = o; };
  if (f === "g"){ const g = (MK.easy && kindGroups(easyKinds()).find(q => q.g === v)) || kindGroups(mkKinds()).find(q => q.g === v); if (g){ put(setG({ kind: g.v[0][0], n: defN(g.v[0][0]) }, g.g)); } return renderBlocksUI(); }
  if (f === "kind"){ put(setG({ kind: v, n: x.n != null && smallN(v) === smallN(x.kind) ? x.n : defN(v), to: x.to, ...(x.side ? { side: x.side } : {}), ...(x.tn ? { tn: x.tn } : {}), ...(x.times > 1 ? { times: x.times } : {}), ...(KINDS[v] && KINDS[v].name && x.into ? { into: x.into } : {}), ...(PER_OK[v] && x.per ? { per: x.per, pm: x.pm, hits: v === "dmg" && x.hits } : {}), ...(KINDS[v] && KINDS[v].mod && (x.ms || x.mt) ? { mt: x.mt, ms: x.ms, mpl: x.mpl, mc: x.mc, mn: x.mn, gk: x.gk, gn: x.gn, nm: x.nm, into: x.into, ge: x.ge } : {}) }, x._g)); return renderBlocksUI(); }
  if (f === "ctr" || f === "cw" || f === "pctr" || f === "pcw" || f === "rside" || f === "rm"){ x[f] = v; return renderBlocksUI(); }
  if (f === "mfK" || f === "mfBy" || f === "mfOp"){ x[f] = v; if (f === "mfK" && !v){ delete x.mfBy; delete x.mfOp; delete x.mfN; } if (f === "mfBy") x.mfN = 0; return renderBlocksUI(); }
  if (f === "mfN"){ x.mfN = Math.round(+v || 0); return updateBkText(); }
  if (f === "gw" || f === "gd"){ x[f] = v; return updateBkText(); }
  if (f === "pf"){ x.pf = v; return renderBlocksUI(); }
  if (f === "sp" || f === "sd" || f === "cpw"){ x[f] = v; return renderBlocksUI(); }
  if (f === "pfn"){ x.pfn = v.slice(0, 40); return updateBkText(); }
  if (f === "ab"){ x.ab = v; x.n = ABS[v] && ABS[v].n ? ABS[v].n : null; if (!(ABS[v] && ABS[v].name)) delete x.into; return renderBlocksUI(); }
  if (f === "into"){ x.into = v.trim(); x.intoId = autoPickId(x); return e.type === "change" ? renderBlocksUI() : updateBkText(); }
  if (f === "intoId"){ x.intoId = v; return updateBkText(); }
  if (f === "timesDie"){ x.timesDie = v === "1" || undefined; return renderBlocksUI(); }
  if (f === "ms" || f === "mpl" || f === "mc"){ x[f] = v; delete x.mt; return renderBlocksUI(); }
  if (f === "mn"){ x.mn = Math.max(1, Math.min(40, Math.round(+v || 1))); return updateBkText(); }
  if (f === "gk"){ x.gk = v; x.gn = smallN(v) ? 1 : 100; return renderBlocksUI(); }
  if (f === "gn"){ x.gn = Math.max(1, Math.round(+v || 1)); return updateBkText(); }
  if (f === "dn" || f === "di" || f === "dd"){ if (v) x[f] = v.slice(0, f === "dd" ? 80 : 20); else delete x[f]; return updateBkText(); }
  if (f === "nm"){ x.nm = v.slice(0, 20); return updateBkText(); }
  if (f === "times"){ x.times = Math.max(1, Math.min(20, Math.round(+v || 1))); return updateBkText(); }
  if (f === "per"){ x.per = v || null; if (!v){ x.hits = false; } else if (x.pm == null) x.pm = x.kind === "dmg" || x.kind === "block" ? (v === "myBlock" ? 1 : 40) : 1; return renderBlocksUI(); }
  if (f === "hits"){ x.hits = v === "1"; return renderBlocksUI(); }
  if (f === "pm"){ x.pm = Math.max(1, Math.round(+v || 1)); return updateBkText(); }
  if (f === "to"){ x.to = v; return updateBkText(); }
  if (f === "side"){ x.side = v === "me" ? "me" : undefined; return updateBkText(); }
  if (f === "scope"){ const tn = x.tn || (x.to === "two" ? 2 : 1); x.to = v === "all" ? "all" : v === "random" ? "random" : (tn > 1 ? "n" : "one"); x.tn = v === "all" ? undefined : tn; return renderBlocksUI(); }
  if (f === "tn"){ const tn = Math.max(1, Math.min(10, Math.round(+v || 1))); x.tn = tn; if (x.to !== "random" && x.to !== "all") x.to = tn > 1 ? "n" : "one"; return updateBkText(); }
  if (f === "n"){ x.n = Math.max(x.per || x.kind === "setCost" ? 0 : 1, Math.round(+v || 0)); return updateBkText(); }
}
function initBlocksUI(){
  const box = $("#bkUI"); if (!box || box._on) return; box._on = true;
  box.addEventListener("change", e => bkEvent(e));
  box.addEventListener("input", e => { if (e.target.matches("input")) bkEvent(e); });
  box.addEventListener("click", e => {
    const tp = e.target.closest("[data-tpl]");
    if (tp){ const t = BK_TEMPLATES[+tp.dataset.tpl], trigs = mkTrigs(); MK.blocks.push({ trig: t.trig && trigs.includes(t.trig) ? t.trig : trigs[0], join: "and", conds: JSON.parse(JSON.stringify(t.conds || [])), then: JSON.parse(JSON.stringify(t.then || [])), else: JSON.parse(JSON.stringify(t.else || [])) }); return renderBlocksUI(); }
    const btn = e.target.closest("[data-bk]"); if (!btn) return;
    const a = btn.dataset.bk, bkEl = btn.closest(".bk"), bi = bkEl ? +bkEl.dataset.b : -1, b = MK.blocks[bi];
    if (a === "addBlock"){ MK.blocks.push({ trig: mkTrigs()[0], join: "and", conds: [], then: [{ kind: mkKinds().includes("dmg") ? "dmg" : mkKinds()[0], n: 100 }], else: [] }); return renderBlocksUI(); }
    if (!b) return;
    if (a === "del"){ MK.blocks.splice(bi, 1); return renderBlocksUI(); }
    if (a === "up" && bi > 0){ [MK.blocks[bi - 1], MK.blocks[bi]] = [MK.blocks[bi], MK.blocks[bi - 1]]; return renderBlocksUI(); }
    if (a === "down" && bi < MK.blocks.length - 1){ [MK.blocks[bi + 1], MK.blocks[bi]] = [MK.blocks[bi], MK.blocks[bi + 1]]; return renderBlocksUI(); }
    if (a === "addCond"){ b.conds.push({ k: "lp", op: "le", n: 300 }); return renderBlocksUI(); }
    if (a === "addEff"){ const part = btn.dataset.part, L = bkList(b, part); if (!L) return; const k0 = (L[L.length - 1] || {}).kind ? "draw" : "dmg", k = mkKinds().includes(k0) ? k0 : easyKinds()[0]; L.push({ kind: k, n: defN(k) }); return renderBlocksUI(); }
    if (a === "delRow"){ const row = btn.closest(".bk-row"), part = row.dataset.part, j = +row.dataset.i; (part === "cond" ? b.conds : bkList(b, part) || []).splice(j, 1); return renderBlocksUI(); }
    if (a === "addBr"){ const f = b.faces || 6, last = (b.dieBr || []).reduce((m, x) => Math.max(m, x.hi), 0); (b.dieBr = b.dieBr || []).push({ lo: Math.min(f, last + 1), hi: Math.min(f, last + 1), then: [] }); return renderBlocksUI(); }
    if (a === "delBr"){ if (b.dieBr) b.dieBr.splice(+btn.dataset.k, 1); return renderBlocksUI(); }
  });
}
initBlocksUI();
$("#mkFxMode").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (b) setFxMode(b.dataset.m); });
applyFxMode();
function resetMaker(){
  S.editId = null; mkSkinReset(null); $("#mkInnate").checked = false; $("#mkRetain").checked = false; $("#mkEthereal").checked = false; $("#mkSly").checked = false; setFrameless(false); setFlAlpha(FL_ALPHA_DEF); setTEdge(false); setShine("", ""); setColor(null, null); $("#mkFxRows").checked = MK.fxRows = false; $("#mkName").value = ""; $("#mkEff").value = ""; $("#mkFlv").value = ""; $("#mkNameSize").value = $("#mkTextSize").value = "m"; syncSizes(); $("#mkAtk").value = 300; $("#mkEq").value = 200; $("#mkEqAb").value = "none"; $("#mkEqCost").value = "0"; $("#mkEqCap").value = ""; $("#mkFrame").value = ""; syncFrame(); $("#mkFont").value = "klee"; syncFont(); $("#mkQuick").checked = false; $("#mkWhen").value = ""; $("#mkFusion").checked = false; MK.fusion = null; renderFusion(); $("#mkExhaust").checked = false; $("#mkNoUse").checked = false; $("#mkFlash").checked = $("#mkStrig").checked = false; $("#mkKick").value = 0; $("#mkMass").value = 0; $("#mkFMass").value = 0; $("#mkLand").checked = $("#mkAnySum").checked = $("#mkFieldMine").checked = false; $("#mkToken").checked = false; $("#mkEx").checked = false; $("#mkNeow").checked = false; $("#mkPayLp").value = "0"; $("#mkPayDisc").value = "0"; $("#mkPayDiscTag").value = ""; setPayCtr(null); setCostMech(null); $("#mkTags").value = ""; $("#mkShowTags").checked = false; syncTribe(); $("#mkTribTag").value = ""; $("#mkPayDiscAll").checked = false; $("#mkPayDisc").disabled = false; $("#mkPayMax").value = "0"; $("#mkPersist").checked = false; $("#mkField").checked = false; MK.sk = null; $("#mkRarity").value = "common"; $("#mkSpc").value = ""; $("#mkCost").value = "1"; setMkDeck("normal"); $("#mkLimit").value = "3"; clearCanvas(); undoStack = [];
  setMkType("monster"); loadFxForm(null); loadAbs([]); loadSS(null); mkLoadVars(null);
  $("#mkTitle").textContent = "カードを描く"; $("#btnNew").hidden = true; $("#btnSave").textContent = "カードを保存"; potionModeUI();
}
setMkType("monster"); loadFxForm(null);
/* ---- maker tabs + folding effect boxes (a line on each box says what's set) ---- */
function setMkPane(p){
  document.querySelectorAll("#mkTabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.pane === p));
  document.querySelectorAll(".tools-col .mk-pane").forEach(x => { x.hidden = x.dataset.pane !== p; });
  ls.set("cb_mkpane", p); $("#editCard").classList.toggle("pane-draw", p === "draw");
}
$("#mkKind").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b && !S.editId) setMkKind(b.dataset.k); });
$("#mkKind2").addEventListener("click", e => { const b = e.target.closest("button[data-k2]"); if (b && !S.editId) setMkKind(b.dataset.k2); });
$("#mkTabs").addEventListener("click", e => { const b = e.target.closest("button[data-pane]"); if (b) setMkPane(b.dataset.pane); });
// 魔法・罠の細かい設定（速攻・永続・フィールド・廃棄…）: たたんでおいて、見出しに今の設定を出す
function syncSpOpt(){
  const box = $("#secSpOpt"); if (!box) return;
  const rows = ["#quickRow", "#whenRow", "#fieldRow", "#fieldOpts", "#persistRow", "#exhaustRow", "#noUseRow", "#spOptRow"].map(q => $(q)).filter(Boolean);
  box.hidden = MK.kind === "potion" || MK.kind === "relic" || rows.every(r => r.hidden);
  const ck = q => { const e = $(q); return !!e && e.checked && !e.closest("[hidden]"); }, on = [];
  [["#mkQuick", "速攻"], ["#mkField", "フィールド"], ["#mkPersist", "永続"], ["#mkExhaust", "廃棄"], ["#mkNoUse", "発動できない"], ["#mkFlash", "フラッシュバック"], ["#mkStrig", "S・トリガー"]].forEach(([q, l]) => { if (ck(q)) on.push(l); });
  const k = +$("#mkKick").value || 0; if (k && !$("#spOptRow").hidden) on.push("キッカー" + k);
  const w = $("#mkWhen").value; if (w && !$("#whenRow").hidden && WHEN_LABEL[w]) on.push(WHEN_LABEL[w]);
  $("#secSpOptTitle").textContent = MK.type === "trap" ? "罠の細かい設定" : MK.type === "magic" ? "魔法の細かい設定" : "細かい設定";
  const sm = $("#sumSpOpt"); sm.textContent = on.join("・") || "なし"; sm.classList.toggle("on", on.length > 0);
}
$("#secSpOpt").addEventListener("change", () => setTimeout(syncSpOpt)); $("#secSpOpt").addEventListener("input", () => setTimeout(syncSpOpt));
function updateSecs(){
  const t = MK.type, sum = (id, txt, on) => { const el = $(id); if (!el) return; el.textContent = txt; el.classList.toggle("on", !!on); };
  const bs = typeof readBlocks === "function" ? readBlocks() : null;
  sum("#sumFx", bs ? fxText({ ...mkPreviewCard(), ss: null }) || "設定あり" : "なし", !!bs);
  const abs = readAbs();
  $("#secAbs").hidden = false; if (typeof syncCostUI === "function") syncCostUI();
  $("#secAbsTitle").textContent = "能力";
  { const cn = [["#mkInnate", "天賦"], ["#mkRetain", "保留"], ["#mkEthereal", "エセリアル"], ["#mkSly", "スライ"]].filter(([q]) => $(q).checked).map(x => x[1]), al = [...cn, ...abs.map(a => ABS[a.k] ? (ABS[a.k].kw || ABS[a.k].label) : a.k)]; sum("#sumAbs", al.length ? al.join("・") : "なし", al.length); }
  $("#secEq").hidden = $("#eqNote").hidden && $("#capRow").hidden;
  $("#secEqTitle").textContent = t === "equip" ? "装備コスト" : "装備キャパ";
  if (t === "equip") sum("#sumEq", `コスト ${Math.max(0, Math.round(+$("#mkEqCost").value || 0))}`, true);
  else sum("#sumEq", $("#mkEqCap").value.trim() === "" ? "自動（ATK÷100）" : `キャパ ${$("#mkEqCap").value}`, $("#mkEqCap").value.trim() !== "");
  $("#secSs").hidden = t !== "monster";
  $("#secAtk").hidden = t !== "monster";
  syncProOn(); syncSpOpt();
  sum("#sumAtk", (MK.atkConds || []).length ? (MK.atkConds || []).map(condPhrase).join(MK.atkJoin === "or" ? "か、" : "、かつ") : "なし", (MK.atkConds || []).length);
  const ss = readSS();
  { const tn = +$("#mkTrib").value || 0; sum("#sumSs", [tn ? `生贄${tn}体` : "", ss ? (ss.only ? "特殊召喚のみ・" : "") + (SS_CONDS[ss.cond] ? SS_CONDS[ss.cond].label : "") : ""].filter(Boolean).join("・") || "なし", !!ss || tn > 0); }
}
["#mkEqCost", "#mkEqCap"].forEach(q => $(q).addEventListener("input", updateSecs));
$("#mkTrib").addEventListener("change", () => updateBkText());
$("#mkMass").addEventListener("input", () => updateBkText());
$("#mkFMass").addEventListener("input", () => updateBkText());
$("#mkAnySum").addEventListener("change", () => updateBkText());
$("#mkFieldMine").addEventListener("change", () => { renderBlocksUI(); updateBkText(); });
$("#mkLand").addEventListener("change", () => { setMkType(MK.type); updateBkText(); setTimeout(fitCanvas, 30); });
// コストデッキ版 / コストなし版: 生贄召喚 and 攻撃の条件 can differ (only for 「どちらでも」 cards)
MK.view = "free"; MK.varFree = null; MK.varCost = null;
function mkCurVar(){ return { trib: +$("#mkTrib").value || 0, atkConds: JSON.parse(JSON.stringify(MK.atkConds || [])), atkJoin: MK.atkJoin === "or" ? "or" : "and" }; }
function mkShowVar(v){ $("#mkTrib").value = String(v.trib || 0); MK.atkConds = JSON.parse(JSON.stringify(v.atkConds || [])); MK.atkJoin = v.atkJoin === "or" ? "or" : "and"; renderAtkConds(); }
function mkVarFields(){
  const cur = mkCurVar(), free = MK.view !== "cost" ? cur : (MK.varFree || cur), cost = MK.view === "cost" ? cur : MK.varCost;
  const out = { trib: free.trib || null, atkConds: free.atkConds.length ? free.atkConds : null, atkJoin: free.atkJoin, tribCost: null, atkCondsCost: null, atkJoinCost: null };
  if (MK.deck === "both" && cost && JSON.stringify(cost) !== JSON.stringify(free)) Object.assign(out, { tribCost: cost.trib, atkCondsCost: cost.atkConds, atkJoinCost: cost.atkJoin });
  return out;
}
function syncMkView(){
  const show = MK.deck === "both" && (MK.kind || "card") === "card";
  if (!show && MK.view === "cost") setMkView("free");
  $("#mkViewRow").hidden = !show; $("#mkViewNote").hidden = !show || MK.type !== "monster";
  document.querySelectorAll("#mkView button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === MK.view));
  $("#editCard").classList.toggle("view-free", show && MK.view === "free");
}
function setMkView(v){
  if (v === MK.view) return;
  const cur = mkCurVar(); if (MK.view === "free") MK.varFree = cur; else MK.varCost = cur;
  MK.view = v; mkShowVar(v === "free" ? (MK.varFree || cur) : (MK.varCost || MK.varFree || cur));
  syncMkView(); updateBkText();
}
function mkLoadVars(c){
  MK.view = "free";
  MK.varFree = { trib: c ? tribOf(c) : 0, atkConds: c && Array.isArray(c.atkConds) ? c.atkConds : [], atkJoin: c && c.atkJoin === "or" ? "or" : "and" };
  MK.varCost = c && (c.tribCost != null || Array.isArray(c.atkCondsCost)) ? { trib: c.tribCost != null ? +c.tribCost || 0 : MK.varFree.trib, atkConds: Array.isArray(c.atkCondsCost) ? c.atkCondsCost : MK.varFree.atkConds, atkJoin: (Array.isArray(c.atkCondsCost) ? c.atkJoinCost : c.atkJoin) === "or" ? "or" : "and" } : null;
  mkShowVar(MK.varFree); syncMkView();
}
$("#mkView").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) setMkView(b.dataset.v); });
// 攻撃の条件 rows (the same conditions as 「もし」, without 質問)
function renderAtkConds(){
  const box = $("#atkCondUI"); if (!box) return;
  MK.atkConds = MK.atkConds || [];
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`;
  box.innerHTML = MK.atkConds.map((x, j) => {
    let h = `<div class="bk-row" data-i="${j}">`;
    if (j > 0) h += `<select data-f="join" aria-label="つなぎ" class="bk-join">${opt("and", "かつ", MK.atkJoin)}${opt("or", "または", MK.atkJoin)}</select>`;
    h += `<select data-f="k" aria-label="なにが">${Object.entries(COND_DEFS).filter(([k, d]) => k !== "ask" && !d.roll).map(([k, d]) => opt(k, d.label, x.k)).join("")}</select>`;
    if (x.k === "ctr") h += ctrCondUI(x, opt);
    if (isNumCond(x.k)) h += `<select data-f="op" aria-label="くらべかた">${opt("ge", "以上", x.op)}${opt("le", "以下", x.op)}${opt("eq", "ちょうど", x.op)}</select><input type="number" data-f="n" min="0" max="99999" value="${esc(x.n ?? 1)}" aria-label="数">`;
    if (x.k === "card") h += `<input type="text" data-f="name" maxlength="40" placeholder="カード名" value="${esc(x.name || "")}" aria-label="カード名"><select data-f="where" aria-label="どこに">${Object.entries(WHERE).map(([k, v]) => opt(k, "自分の" + v, x.where || "field")).join("")}</select><select data-f="match" aria-label="名前の合わせ方">${opt("exact", "名前がぴったり", x.match)}${opt("part", "名前に含む", x.match)}${opt("tag", "タグ", x.match)}</select><input type="number" data-f="cnt" min="0" max="99" value="${esc(x.cnt ?? 1)}" aria-label="枚数" style="width:64px">枚<select data-f="op" aria-label="くらべかた">${opt("ge", "以上", x.op || "ge")}${opt("le", "以下", x.op)}</select>`;
    if (x.k === "stronger") h += `<select data-f="side" aria-label="どこに">${opt("op", "相手の場に", x.side || "op")}${opt("me", "自分の場に", x.side || "op")}${opt("any", "どちらかの場に", x.side || "op")}</select><span class="note">このモンスターよりATKが高いモンスターが</span><select data-f="has" aria-label="いる・いない">${opt("yes", "いる", x.has || "yes")}${opt("no", "いない", x.has || "yes")}</select>`;
    return h + `<button type="button" class="small ghost" data-del="${j}" aria-label="この条件を消す">×</button></div>`;
  }).join("") || `<span class="note">なし（いつでも攻撃できる）</span>`;
  updateBkText();
}
function atkCondEvent(e, rerender){
  const el = e.target.closest("[data-f]"); if (!el) return;
  const j = +el.closest(".bk-row").dataset.i, x = MK.atkConds[j]; if (!x) return;
  const f = el.dataset.f, v = el.value;
  if (f === "join"){ MK.atkJoin = v; return renderAtkConds(); }
  if (f === "k"){ MK.atkConds[j] = v === "ctr" ? { k: v, ctr: ctrDefault(), cw: "self", op: "ge", n: 1 } : v === "stronger" ? { k: v, side: "op", has: "no" } : v === "card" ? { k: v, name: "", where: "field", match: "exact", cnt: 1, op: "ge" } : { k: v, op: v === "lp" ? "le" : "ge", n: v === "lp" || v === "oppLp" ? 300 : v === "otherMon" ? 2 : 1 }; return renderAtkConds(); }
  x[f] = f === "n" || f === "cnt" ? Math.max(0, Math.round(+v || 0)) : v;
  return rerender ? renderAtkConds() : updateBkText();
}
$("#atkCondUI").addEventListener("change", e => atkCondEvent(e, true));
$("#atkCondUI").addEventListener("input", e => { if (e.target.matches("input")) atkCondEvent(e, false); });
$("#atkCondUI").addEventListener("click", e => { const d = e.target.closest("[data-del]"); if (d){ MK.atkConds.splice(+d.dataset.del, 1); renderAtkConds(); } });
$("#btnAddAtkCond").addEventListener("click", () => { (MK.atkConds = MK.atkConds || []).push({ k: "otherMon", op: "ge", n: 2 }); renderAtkConds(); });
$("#mkAbs").addEventListener("change", updateSecs);
setMkPane(["draw", "look", "fx", "deck"].includes(ls.get("cb_mkpane", "draw")) ? ls.get("cb_mkpane", "draw") : "draw");
updateSecs();
$("#btnNew").addEventListener("click", resetMaker);
/* ---- スキン（同じカードの別の見た目） ---- */
const lookOf = d => { const o = {}; LOOK_KEYS.forEach(k => { o[k] = d && d[k] !== undefined ? d[k] : null; }); return o; };
function mkCurLook(){ MK.skinRaw = true; let B = null; try{ B = mkBuildDoc(); } finally { MK.skinRaw = false; } return B ? lookOf(B.doc) : null; }
function mkApplyLook(L){
  if (!L) return;
  const fr = $("#mkFrame"); fr.value = [...fr.options].some(o => o.value === (L.frame || "")) ? (L.frame || "") : "";
  setFrameless(!!L.frameless); setFlAlpha(L.flAlpha ?? FL_ALPHA_DEF); setTEdge(!!L.textEdge); setShine(L.holo, L.foil); setColor(L.colF, L.colB, L.colF2, L.colB2, L.colGd);
  $("#mkFont").value = FONTS[L.font] ? L.font : "klee"; syncFrame(); syncFont(); $("#mkSpc").value = L.spc === "silent" ? "silent" : ""; syncRarity();
  if (!L.img){ clearCanvas(); undoStack = []; } else { const im = new Image(); im.onload = () => { clearCanvas(); setPhoto(im); setMode("draw"); composite(); undoStack = []; MK.artDirty = true; }; im.src = L.img; }
  MK.artDirty = true;
}
function renderSkinUI(){
  const sel = $("#mkSkin"); if (!sel) return; MK.skins = MK.skins || []; if (MK.skinCur == null) MK.skinCur = -1;
  sel.innerHTML = `<option value="-1">もとの見た目</option>${MK.skins.map((s, i) => `<option value="${i}">${esc(s.name || "スキン")}</option>`).join("")}<option value="new">＋ 新しいスキン（いまの見た目から）</option>`;
  sel.value = String(MK.skinCur); const on = MK.skinCur >= 0 && MK.skins[MK.skinCur];
  $("#mkSkinName").hidden = $("#mkSkinDel").hidden = !on; if (on) $("#mkSkinName").value = MK.skins[MK.skinCur].name || "";
}
function mkSkinReset(c){ MK.skins = c && Array.isArray(c.skins) ? c.skins.filter(s => s && s.key).map(s => ({ ...s })) : []; MK.skinCur = -1; MK.baseLook = null; renderSkinUI(); }
function switchSkin(to){
  const look = mkCurLook(); if (!look){ renderSkinUI(); return; }
  if (MK.skinCur < 0) MK.baseLook = look; else if (MK.skins[MK.skinCur]) MK.skins[MK.skinCur] = { ...MK.skins[MK.skinCur], ...look };
  if (to === "new"){ MK.skins.push({ key: uid("s"), name: "スキン" + (MK.skins.length + 1), ...look }); MK.skinCur = MK.skins.length - 1; toast("新しいスキンを作りました。絵や枠を変えてから保存してね"); }
  else MK.skinCur = Math.max(-1, Math.min(MK.skins.length - 1, +to));
  mkApplyLook(MK.skinCur < 0 ? MK.baseLook : MK.skins[MK.skinCur]); renderSkinUI();
}
$("#mkSkin").addEventListener("change", e => switchSkin(e.target.value));
$("#mkSkinName").addEventListener("input", e => { const s = MK.skins && MK.skins[MK.skinCur]; if (s) s.name = e.target.value.slice(0, 20); });
$("#mkSkinDel").addEventListener("click", () => { if (!(MK.skinCur >= 0)) return; MK.skins.splice(MK.skinCur, 1); MK.skinCur = -1; mkApplyLook(MK.baseLook); renderSkinUI(); });
// 保存するときのカードの中身（テストモードでも使う）
function mkBuildDoc(){
  const name = $("#mkName").value.trim();
  if (!name){ toast("カード名を書いてね"); $("#mkName").focus(); return; }
  const atkRaw = $("#mkAtk").value.trim().toLowerCase().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const atkInf = MK.type === "monster" && INF_WORDS.includes(atkRaw);
  const atk = atkInf ? 0 : Math.max(0, Math.round(+atkRaw || 0)); $("#mkAtk").value = atkInf ? "∞" : atk;
  const wasMode = MK.mode; MK.mode = "draw"; composite();
  const out = document.createElement("canvas"); out.width = cv.width; out.height = cv.height; out.getContext("2d").drawImage(cv, 0, 0);
  MK.mode = wasMode; composite();
  const id = S.editId || uid("c");
  const prev = S.cards.get(id) || userPotion(id) || userRelic(id) || builtinPotionCard(id) || builtinRelicCard(id);
  let eqN = Math.round(+$("#mkEq").value || 0); $("#mkEq").value = eqN;
  const doc = { type: MK.type, name, atk: MK.type === "monster" ? atk : 0, atkInf, eqN: MK.type === "equip" ? eqN : 0, eqAb: "none", eqCost: MK.type === "equip" ? Math.max(0, Math.round(+$("#mkEqCost").value || 0)) : null, eqCap: MK.type === "monster" && $("#mkFrame").value === "socra" && $("#mkEqCap").value.trim() !== "" ? Math.max(0, Math.round(+$("#mkEqCap").value || 0)) : null, abs: MK.type === "monster" || MK.type === "equip" ? readAbs() : [], frame: $("#mkFrame").value || null, ss: readSS(), tags: parseTags($("#mkTags").value), showTags: $("#mkShowTags").checked || null, tribTag: MK.type === "monster" ? $("#mkTribTag").value.trim() || null : null, ...(MK.type === "monster" ? mkVarFields() : { trib: null, atkConds: null, atkJoin: "and", tribCost: null, atkCondsCost: null, atkJoinCost: null }), effect: $("#mkEff").value.trim(), flavor: $("#mkFlv").value.trim(), nameSize: $("#mkNameSize").value, textSize: $("#mkTextSize").value, fx: null, combo: null, blocks: readBlocks(), font: $("#mkFont").value, quick: MK.type === "magic" && $("#mkFrame").value !== "spire" && $("#mkQuick").checked, persist: (MK.type === "magic" || MK.type === "trap") && $("#mkPersist").checked && !$("#mkField").checked, field: MK.type === "magic" && $("#mkField").checked || null, sk: mkSk(), rarity: $("#mkFrame").value === "spire" ? $("#mkRarity").value : null, spc: $("#mkFrame").value === "spire" && $("#mkSpc").value === "silent" ? "silent" : null, exhaust: (MK.type === "magic" || MK.type === "trap") && $("#mkExhaust").checked, noUse: (MK.type === "magic" || MK.type === "trap") && $("#mkNoUse").checked || null, flashback: null, strig: null, kick: null, ...mkSpOpts(), mass: mkMassVal(), fieldMine: MK.type === "magic" && $("#mkField").checked && $("#mkFieldMine").checked || null, anySum: MK.type === "monster" && $("#mkAnySum").checked || null, land: MK.type === "magic" && $("#mkField").checked && $("#mkLand").checked || null, when: mkWhenVal(), fusion: mkFusionVal(), token: $("#mkToken").checked || null, ex: $("#mkEx").checked || !!mkFusionVal() || null, ...mkPays(true), cost: MK.deck === "normal" ? null : $("#mkCost").value === "X" || $("#mkCost").value === "∞" ? 0 : +$("#mkCost").value, costX: MK.deck !== "normal" && $("#mkCost").value === "X", costInf: MK.deck !== "normal" && $("#mkCost").value === "∞" || null, deckMode: MK.deck, limit: +$("#mkLimit").value,
    img: prev && prev.img && !MK.artDirty ? prev.img : encodeArt(out, MK.kind === "potion" || MK.kind === "relic"), frameless: MK.frameless, textEdge: MK.frameless && $("#mkTEdge").checked || null, holo: $("#mkHolo").value || null, fxRows: $("#mkFxRows").checked || null, ...mkColVals(), foil: $("#mkFoil").value || null, flAlpha: MK.frameless && MK.flAlpha != null && MK.flAlpha !== FL_ALPHA_DEF ? MK.flAlpha : null, author: S.name, ownerId: prev?.ownerId || S.uid || null, updatedAt: Date.now() };
  if (prev && prev.builtinPotion && !MK.artDirty && doc.img === potionArt(prev.potKey)) delete doc.img;
  if (prev && prev.builtinRelic){ if (!MK.artDirty && !prev.img) doc.img = ""; doc.neow = true; }
  doc.innate = $("#mkInnate").checked || null; doc.retain = $("#mkRetain").checked || null; doc.ethereal = $("#mkEthereal").checked || null; doc.sly = (MK.type === "magic" || MK.type === "trap") && $("#mkSly").checked || null;
  if (MK.kind === "potion" || MK.kind === "relic") Object.assign(doc, { type: MK.kind, neow: MK.kind === "relic" && $("#mkNeow").checked || null, atk: 0, atkInf: false, eqN: 0, eqCost: null, eqCap: null, abs: [], frame: null, ss: null, quick: false, persist: false, sk: null, rarity: null, exhaust: false, payLp: null, payDisc: null, payMax: null, cost: null, costX: false, deckMode: "normal", limit: 0 });
  doc.ctrs = ctrSnap(doc);
  if (!MK.skinRaw){ MK.skins = MK.skins || []; if (MK.skinCur >= 0 && MK.skins[MK.skinCur]){ MK.skins[MK.skinCur] = { ...MK.skins[MK.skinCur], ...lookOf(doc) }; if (MK.baseLook) Object.assign(doc, MK.baseLook); } doc.skins = MK.skins.length ? MK.skins.map(s => ({ ...s })) : null; }
  return { id, prev, doc };
}
// 完成を見る: 保存したときのカード（図鑑の大きさ・対戦の小さいサイズ）を、保存しないで表示する
function closeMkPreview(){ const v = document.getElementById("mkPreview"); if (v) v.remove(); }
$("#btnPreview").addEventListener("click", () => {
  const nm = $("#mkName"), empty = !nm.value.trim(); if (empty) nm.value = "（カード名）";
  const B = mkBuildDoc(); if (empty) nm.value = ""; if (!B) return;
  const c = { ...B.doc, id: "preview-" + B.id, author: S.name || "あなた" };
  closeMkPreview();
  const v = document.createElement("div"); v.id = "mkPreview"; v.className = "overlay"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "完成を見る");
  v.innerHTML = `<div class="pv-box"><button type="button" class="cv-x ghost" data-pvclose aria-label="とじる">×</button>
    <div class="pv-big">${cardHTML(c, "detail", "", {}).replace('class="card ', 'style="--w:min(360px,78vw)" class="card ')}</div>
    <div class="pv-side"><h3 style="margin:0">完成するとこう見える</h3><p class="note" style="margin:0">まだ保存していません。文字がはみ出たり、ずれたりしていないか確かめてね。</p>
      <div class="pv-sizes"><figure>${cardHTML(c, "", "", {})}<figcaption>図鑑・デッキ</figcaption></figure><figure>${cardHTML(c, "sm", "", {})}<figcaption>手札・場</figcaption></figure></div>
      ${c.fxRows && !freeText(c) ? `<div class="fxr-big">${fxRowsHTML(c)}</div>` : `<p style="margin:0;font-size:14px">${kwLink(esc(fxText(c) || "（効果なし）"))}</p>`}
      <button type="button" class="primary" data-pvclose>編集にもどる</button></div></div>`;
  v.addEventListener("click", e => { if (e.target === v || e.target.closest("[data-pvclose]")) closeMkPreview(); });
  document.body.appendChild(v); v.querySelector("[data-pvclose]").focus();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMkPreview(); });
$("#btnShot").addEventListener("click", () => { const B = mkBuildDoc(); if (!B) return; saveCardImage({ ...B.doc, id: B.id }); });
$("#btnTest").addEventListener("click", () => {
  if (MK.kind === "potion" || MK.kind === "relic"){ toast("ポーション・レリックはテストモードでは試せません"); return; }
  const B = mkBuildDoc(); if (!B) return;
  startTest({ ...B.doc, id: B.id });
});
$("#btnSave").addEventListener("click", async () => {
  const B = mkBuildDoc(); if (!B) return; const { id, prev, doc } = B;
  $("#btnSave").disabled = true;
  try{
    if (prev && prev.starter){ await saveBuiltinDoc(id, { ...doc, author: prev.author, ownerId: null }); toast(`はじめからある${prev.builtinRelic ? "レリック" : prev.builtinPotion ? "ポーション" : "カード"}を更新しました（みんなに反映されます）`); }
    else { await saveCardDoc(id, doc); toast(MK.kind === "potion" || MK.kind === "relic" ? (MK.kind === "relic" ? "レリック" : "ポーション") + (S.editId ? "を更新しました" : "を保存しました！") : S.editId ? "カードを更新しました" : "カードを保存しました！"); }
    resetMaker();
  }
  catch(e){ writeErr(e); }
  finally{ $("#btnSave").disabled = false; }
});
$("#galFilter").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.galF = b.dataset.f; document.querySelectorAll("#galFilter button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderGallery(); });
let delArm = null;
// the 7 built-in ポーション, shown like home-made ones
const POTION_COL = { fire: "#e0533a", blast: "#f29b38", block: "#3d8bd9", energy: "#f2c94c", speed: "#4caf6e", fear: "#8e5bc9", heal: "#f28fb5" };
// a simple flask picture for the built-in ones (they have no drawing)
const potionArt = k => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 200"><path d="M122 30h36v44l40 70a18 18 0 0 1-16 27H98a18 18 0 0 1-16-27l40-70z" fill="#fff" stroke="#1e2328" stroke-width="7" stroke-linejoin="round"/><path d="M104 118h72l22 34a12 12 0 0 1-10 18H92a12 12 0 0 1-10-18z" fill="${POTION_COL[k] || "#e0533a"}"/><rect x="114" y="20" width="52" height="16" rx="5" fill="#8b5a3c" stroke="#1e2328" stroke-width="5"/><circle cx="120" cy="145" r="7" fill="#fff" opacity=".7"/><circle cx="150" cy="132" r="4" fill="#fff" opacity=".7"/></svg>`);
const builtinPotionCards = () => Object.keys(POTIONS).map(k => builtinPotionCard(k));
function potionList(){
  const f = S.filt.gal || {};
  let L = [...(S.userPotions || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (S.galF === "mine") L = L.filter(c => isMine(c)); else L = L.concat(builtinPotionCards());
  if (f.q){ const ws = normQ(f.q).split(/\s+/).filter(Boolean); L = L.filter(c => { const hay = normQ([c.name, plainRuby(c.effect || ""), fxText0(potionCard(c.potKey || c.id)), c.author, "ポーション"].join(" ")); return ws.every(w => hay.includes(w)); }); }
  return L;
}
const potItemHTML = c => `<div class="g-item">${potionHTML(c, "sm")}<div class="meta">${c.builtinPotion ? "はじめから" + (c.edited ? "（編集ずみ）" : "") : "by " + esc(c.author || "？")}</div>${c.builtinPotion && isAdmin() ? `<div class="row g-btns" style="gap:6px"><button class="small" data-pedit="${esc(c.id)}" title="はじめからあるポーションを編集（管理者）">編集</button>${c.edited ? `<button class="small" data-preset="${esc(c.id)}">${delArm === "pr:" + c.id ? "本当に戻す" : "元に戻す"}</button>` : ""}</div>` : ""}${!c.builtinPotion && isMine(c) ? `<div class="row" style="gap:6px"><button class="small" data-pedit="${esc(c.id)}">編集</button><button class="small danger" data-pdel="${esc(c.id)}">${delArm === c.id ? "本当に消す" : "消す"}</button></div>` : ""}</div>`;
// レリック in the gallery (the built-in ネオーレリック are shown too)
function builtinRelicCards(){ return Object.keys(RELICS).map(k => builtinRelicCard(k)); }
function relicList(){
  const f = S.filt.gal || {};
  let L = [...(S.userRelics || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(c => ({ ...c, relicView: true }));
  if (S.galF === "mine") L = L.filter(c => isMine(c)); else L = L.concat(builtinRelicCards());
  if (f.q){ const ws = normQ(f.q).split(/\s+/).filter(Boolean); L = L.filter(c => { const hay = normQ([c.name, plainRuby(c.effect || ""), fxText0({ ...c, type: "magic" }), c.author, "レリック", c.neow ? "ネオー" : ""].join(" ")); return ws.every(w => hay.includes(w)); }); }
  return L;
}
const relItemHTML = c => `<div class="g-item">${potionHTML(c, "sm")}<div class="meta">${c.neow ? "ネオー・" : ""}${c.builtinRelic ? "はじめから" + (c.edited ? "（編集ずみ）" : "") : "by " + esc(c.author || "？")}</div>${c.builtinRelic && isAdmin() ? `<div class="row g-btns" style="gap:6px"><button class="small" data-pedit="${esc(c.id)}" title="はじめからあるレリックを編集（管理者）">編集</button>${c.edited ? `<button class="small" data-preset="${esc(c.id)}">${delArm === "pr:" + c.id ? "本当に戻す" : "元に戻す"}</button>` : ""}</div>` : ""}${!c.builtinRelic && isMine(c) ? `<div class="row" style="gap:6px"><button class="small" data-pedit="${esc(c.id)}">編集</button><button class="small danger" data-pdel="${esc(c.id)}">${delArm === c.id ? "本当に消す" : "消す"}</button></div>` : ""}</div>`;
function renderPotGallery(){
  { const f = S.filt.gal || {}, L = relicList(); $("#relWrap").hidden = !L.length || f.type !== "all" || !!f.fx; $("#relGallery").innerHTML = L.map(relItemHTML).join(""); }
  const f = S.filt.gal || {}, L = potionList();
  // 「すべて」 shows them under the cards; 「ポーション」 shows only them (in the main list)
  $("#potWrap").hidden = !L.length || f.type !== "all" || !!f.fx;
  $("#potGallery").innerHTML = L.map(potItemHTML).join("");
}
async function potGalClick(e){
  const ed = e.target.closest("[data-pedit]"), del = e.target.closest("[data-pdel]"), rs = e.target.closest("[data-preset]");
  if (rs && isAdmin()){
    const id = rs.dataset.preset;
    if (delArm !== "pr:" + id){ delArm = "pr:" + id; renderGallery(); return true; }
    delArm = null;
    try{ await deleteBuiltinDoc(id); toast(/^relic-/.test(id) ? "レリックをはじめの状態に戻しました" : "ポーションをはじめの状態に戻しました"); } catch(err){ writeErr(err); }
    return true;
  }
  if (ed){
    const c = userPotion(ed.dataset.pedit) || userRelic(ed.dataset.pedit) || (isAdmin() ? builtinPotionCard(ed.dataset.pedit) || builtinRelicCard(ed.dataset.pedit) : null); if (!c || !(isMine(c) || ((c.builtinPotion || c.builtinRelic) && isAdmin()))) return true;
    resetMaker(); setMkKind(c.type === "relic" ? "relic" : "potion"); $("#mkNeow").checked = !!c.neow;
    S.editId = c.id; MK.artDirty = false; $("#mkName").value = c.nameRuby || c.name; $("#mkEff").value = c.effect || ""; $("#mkFlv").value = c.flavor || "";
    $("#mkNameSize").value = SIZES_T[c.nameSize] ? c.nameSize : "m"; $("#mkTextSize").value = SIZES_T[c.textSize] ? c.textSize : "m"; syncSizes();
    $("#mkFont").value = FONTS[c.font] ? c.font : "klee"; syncFont();
    loadFxForm({ ...c, type: "magic", ...(c.type === "relic" ? { relicView: true } : {}) });
    if (!c.img){ clearCanvas(); undoStack = []; MK.artDirty = false; }
    else { const im = new Image(); im.onload = () => { clearCanvas(); setPhoto(im); setMode("draw"); composite(); undoStack = []; MK.artDirty = false; }; im.src = c.img; }
    potionModeUI(); $("#btnNew").hidden = false; $("#btnSave").textContent = "変更を保存";
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }
  if (del){
    const id = del.dataset.pdel; if (!isMine(userPotion(id) || userRelic(id))) return true;
    if (delArm !== id){ delArm = id; renderGallery(); return true; }
    delArm = null;
    try{ await deleteCardDoc(id); toast("消しました"); } catch(err){ writeErr(err); }
    return true;
  }
  return !!ed;
}
$("#potGallery").addEventListener("click", potGalClick);
$("#relGallery").addEventListener("click", potGalClick);
// 管理者: add a tag to every card shown in the gallery (own cards + built-in ones; others' cards are skipped)
async function bulkTag(){
  const tag = parseTags($("#bulkTag").value)[0]; if (!tag || !isAdmin()) return;
  let ok = 0, skip = 0;
  for (const id of S.galIds || []){
    const c = S.cards.get(id); if (!c || tagsOf(c).includes(tag)) continue;
    const tags = [...tagsOf(c), tag].slice(0, 8);
    try{
      if (c.starter){ await saveBuiltinDoc(id, { ...(S.builtinEdits[id] || {}), tags }); ok++; }
      else if (isMine(c)){ const { id: _, ...doc } = c; await saveCardDoc(id, JSON.parse(JSON.stringify({ ...doc, tags }))); ok++; }
      else skip++;
    }catch(e){ writeErr(e); return; }
  }
  toast(`${ok}枚にタグ「${tag}」をつけました${skip ? `（ほかの人のカード${skip}枚はつけられませんでした）` : ""}`);
}
$("#btnBulkTag").addEventListener("click", bulkTag);
function renderGallery(){
  $("#adminTagRow").hidden = !isAdmin();
  let list = [...S.userCards].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (S.galF === "mine") list = list.filter(c => isMine(c));
  const items = list.map(c => {
    return "";
  });
  if (S.galF === "all") list = list.concat(S.starters);
  const total = list.length;
  list = sortCards(list.filter(c => matchCard(c, S.filt.gal)), S.filt.gal.sort);
  S.galIds = list.map(c => c.id);
  setCount("gal", list.length, total);
  const items2 = list.map(c => {
    if (c.starter) return `<div class="g-item">${cardHTML(c, "sm")}<div class="meta">${esc(c.author)}</div>${isAdmin() ? `<div class="row g-btns"><button class="small" data-edit="${esc(c.id)}" title="はじめからあるカードを編集（管理者）">編集</button></div>` : ""}</div>`;
    const mine = isMine(c);
    return `<div class="g-item">${cardHTML(c, "sm")}<div class="meta">by ${esc(c.author || "？")}</div>${!mine && S.db ? tradeBtnHTML(c) : ""}${mine ? `<div class="row" style="gap:6px"><button class="small" data-edit="${esc(c.id)}">編集</button><button class="small danger" data-del="${esc(c.id)}">${delArm === c.id ? "本当に消す" : "消す"}</button></div>${isAdmin() && S.starters.some(b => b.name === c.name) ? `<button class="small g-wide" data-toBuiltin="${esc(c.id)}">${delArm === "b:" + c.id ? "本当に？（このカードは消えます）" : "はじめからあるカードと入れ替え"}</button>` : ""}` : ""}</div>`;
  });
  renderPotGallery();
  if ((S.filt.gal || {}).type === "counter"){ const L = ctrGalList(); setCount("gal", L.length, L.length); $("#gallery").innerHTML = L.map(ctrTileHTML).join("") + `<div class="ctr-tile ctr-new"><button type="button" class="primary" data-ctrnewg>＋ 新しいカウンターを作る</button><span class="note">カード工房の「カード以外 → カウンター」で作れます</span></div>`; return; }
  if ((S.filt.gal || {}).type === "relic"){ const L = relicList(); setCount("gal", L.length, L.length); $("#gallery").innerHTML = L.map(relItemHTML).join("") || `<p class="muted">レリックがありません。</p>`; return; }
  if ((S.filt.gal || {}).type === "potion"){ const L = potionList(); setCount("gal", L.length, L.length); $("#gallery").innerHTML = L.map(potItemHTML).join("") || `<p class="muted">ポーションがありません。上の「つくるもの」で「カード以外」をえらぶと作れます。</p>`; return; }
  $("#gallery").innerHTML = ctrBanner(S.filt.gal) + (items2.join("") || (total ? `<p class="muted">条件に合うカードがありません。</p>` : `<p class="muted">まだ自分のカードはありません。上で描いてみよう！</p>`));
}
$("#gallery").addEventListener("click", async e => {
  { const f = S.filt.gal, cc = e.target.closest("[data-ctrcards]");
    if (cc){ f.ctr = cc.dataset.ctrcards; f.type = "all"; document.querySelectorAll("#galType button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === "all")); renderGallery(); return; }
    if (e.target.closest("[data-ctrclear]")){ f.ctr = ""; renderGallery(); return; }
    const ce = e.target.closest("[data-ctreditg]"), cn = e.target.closest("[data-ctrnewg]");
    if ((ce || cn) && !S.editId){ setMkKind("counter"); const d = ce ? ctrDef(ce.dataset.ctreditg) : null; S.ctrEdit = d && ctrCanEdit(d) ? { id: d.id, name: d.name, color: d.color || "#7a4fd0", icon: d.icon || "" } : { id: null, name: "", color: "#7a4fd0", icon: "" }; renderCtrBox(); const t = $("#mkTitle"); if (t) t.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    if ((ce || cn) && S.editId){ toast("いま編集中のカードを保存するか、新しく描くを押してからね"); return; } }
  if (e.target.closest("[data-pedit],[data-pdel],[data-preset]")){ potGalClick(e); return; }
  const tb = e.target.closest("[data-trade]"); if (tb){ openTradeDlg(tb.dataset.trade); return; }
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed){
    const c = S.cards.get(ed.dataset.edit); if (!c || !(isMine(c) || (c.starter && isAdmin()))) return;
    setMkKind("card"); S.editId = c.id; mkSkinReset(c); setFrameless(!!c.frameless); setFlAlpha(c.flAlpha ?? FL_ALPHA_DEF); setTEdge(!!c.textEdge); setShine(c.holo, c.foil); setColor(c.colF, c.colB, c.colF2, c.colB2, c.colGd); $("#mkFxRows").checked = MK.fxRows = !!c.fxRows; MK.artDirty = false; $("#mkName").value = c.nameRuby || c.name; $("#mkEff").value = c.effect || ""; $("#mkFlv").value = c.flavor || ""; $("#mkNameSize").value = SIZES_T[c.nameSize] ? c.nameSize : "m"; $("#mkTextSize").value = SIZES_T[c.textSize] ? c.textSize : "m"; syncSizes(); $("#mkAtk").value = c.atkInf ? "∞" : (c.atk || 0); $("#mkLimit").value = String(cardLimit(c));
    mkLoadVars(c); $("#mkFusion").checked = !!(Array.isArray(c.fusion) && c.fusion.length); MK.fusion = Array.isArray(c.fusion) && c.fusion.length ? JSON.parse(JSON.stringify(c.fusion)) : null; renderFusion(); $("#mkQuick").checked = !!c.quick; $("#mkInnate").checked = !!c.innate; $("#mkRetain").checked = !!c.retain; $("#mkEthereal").checked = !!c.ethereal; $("#mkSly").checked = !!c.sly; $("#mkWhen").value = WHEN_LABEL[c.when] ? c.when : ""; $("#mkExhaust").checked = !!c.exhaust; $("#mkNoUse").checked = !!c.noUse; $("#mkFlash").checked = !!c.flashback; $("#mkMass").value = Math.max(0, +c.mass || 0); $("#mkFMass").value = c.field ? Math.max(0, +c.mass || 0) : 0; $("#mkLand").checked = !!c.land; $("#mkFieldMine").checked = !!c.fieldMine; $("#mkAnySum").checked = !!c.anySum; $("#mkStrig").checked = !!c.strig; $("#mkKick").value = Math.max(0, +c.kick || 0); $("#mkToken").checked = !!c.token; $("#mkEx").checked = !!c.ex; $("#mkPayLp").value = String(payLpOf(c)); $("#mkPayDisc").value = String(payDiscOf(c)); $("#mkPayDiscTag").value = c.payDiscTag || ""; setPayCtr(c.payCtr); setCostMech(c); $("#mkTags").value = tagsOf(c).join(" "); $("#mkShowTags").checked = !!c.showTags; syncTribe(); $("#mkTribTag").value = c.tribTag || ""; $("#mkPayDiscAll").checked = payDiscAll(c); $("#mkPayDisc").disabled = payDiscAll(c); $("#mkPayMax").value = String(payMaxOf(c)); $("#mkPersist").checked = !!c.persist; $("#mkField").checked = !!c.field; MK.sk = c.sk || null; $("#mkRarity").value = rarityOf(c); $("#mkSpc").value = c.spc === "silent" ? "silent" : ""; setMkType(cardType(c)); loadFxForm(c); $("#mkFont").value = FONTS[c.font] ? c.font : "klee"; syncFont(); $("#mkCost").value = c.costX ? "X" : c.costInf && hasCost(c) ? "∞" : hasCost(c) ? String(costOf(c)) : "1"; if (!$("#mkCost").value && hasCost(c)) $("#mkCost").insertAdjacentHTML("beforeend", `<option value="${costOf(c)}">${costOf(c)}</option>`), $("#mkCost").value = String(costOf(c)); setMkDeck(deckModeOf(c)); $("#mkEq").value = c.eqN || 0; $("#mkEqAb").value = "none"; $("#mkEqCost").value = String(eqCostOf(c)); $("#mkEqCap").value = hasEqCap(c) ? String(+c.eqCap) : ""; loadAbs(absOf(c)); syncEqLine(); $("#mkFrame").value = [...$("#mkFrame").options].some(o => o.value && o.value === c.frame) ? c.frame : ""; syncFrame(); loadSS(c);
    if (!c.img){ clearCanvas(); undoStack = []; MK.artDirty = false; }
    else { const im = new Image(); im.onload = () => { clearCanvas(); setPhoto(im); setMode("draw"); composite(); undoStack = []; MK.artDirty = false; }; im.src = c.img; }
    $("#mkTitle").textContent = "カードを編集中"; $("#btnNew").hidden = false; $("#btnSave").textContent = "変更を保存";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // admin: a card you drew takes the place of the built-in card with the same name (your copy is then removed)
  const tbi = e.target.closest("[data-tobuiltin]");
  if (tbi && isAdmin()){
    const id = tbi.dataset.tobuiltin, c = S.cards.get(id), base = c && S.starters.find(b => b.name === c.name);
    if (!c || !base || !isMine(c)) return;
    if (delArm !== "b:" + id){ delArm = "b:" + id; renderGallery(); return; }
    delArm = null;
    try{
      const doc = JSON.parse(JSON.stringify({ ...c, id: undefined, starter: undefined, edited: undefined, author: base.author, ownerId: null, updatedAt: Date.now() }));
      await saveBuiltinDoc(base.id, doc);
      for (const d of myDecks().filter(d => d.cards.includes(id))) await saveDeckDoc(d.id, { ...d, id: undefined, cards: d.cards.map(x => x === id ? base.id : x), key: d.key === id ? base.id : d.key || null });
      await deleteCardDoc(id);
      toast(`「${base.name}」（${base.author}）をこのカードに入れ替えました`);
    }catch(err){ writeErr(err); }
    return;
  }
  const rs = e.target.closest("[data-reset]");
  if (rs && isAdmin()){
    const id = rs.dataset.reset;
    if (delArm !== "r:" + id){ delArm = "r:" + id; renderGallery(); return; }
    delArm = null;
    try{ await deleteBuiltinDoc(id); toast("はじめの状態に戻しました"); } catch(err){ writeErr(err); }
    return;
  }
  if (del){
    const id = del.dataset.del;
    if (!isMine(S.cards.get(id))) return;
    if (delArm !== id){ delArm = id; renderGallery(); return; }
    delArm = null;
    try{ await deleteCardDoc(id); toast("カードを消しました"); } catch(err){ writeErr(err); }
  }
});

