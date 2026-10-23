/* ================= 効果音 =================
   音のファイルは使わず、Web Audio でその場で合成する（読みこみ待ちなし・オフラインでも鳴る）。
   ブラウザの決まりで、最初に画面をさわるまでは鳴らない。設定は端末ごと（cb_sound: 音量 0〜1、0 = オフ） */
const SND = { ctx: null, vol: (() => { const v = ls.get("cb_sound", .6); return typeof v === "number" ? Math.max(0, Math.min(1, v)) : .6; })(), noise: null };
function sndCtx(){
  if (SND.vol <= 0) return null;
  try{
    if (!SND.ctx){ const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; SND.ctx = new A(); }
    if (SND.ctx.state === "suspended") SND.ctx.resume().catch(() => {});
    return SND.ctx;
  }catch(e){ return null; }
}
// 最初のタップで音を使えるようにしておく（iPhoneは、タップの中で resume しないと鳴らない）
addEventListener("pointerdown", () => { if (SND.vol > 0) sndCtx(); }, { once: true, capture: true });
function noiseBuf(c){
  if (SND.noise && SND.noise.sampleRate === c.sampleRate) return SND.noise;
  const b = c.createBuffer(1, c.sampleRate * .6, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return SND.noise = b;
}
// ひとつの音: 波形・音の高さ（はじめ→おわり）・長さ・大きさ・始まるまでの時間
function tone(c, out, { type = "sine", f0 = 440, f1 = f0, dur = .15, gain = .3, at = 0, attack = .005 }){
  const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + .02);
}
function hiss(c, out, { dur = .2, gain = .25, at = 0, f0 = 2000, f1 = f0, q = 1, type = "bandpass" }){
  const t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(c); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + .02);
}
const SFX = {
  summon: (c, o) => { [523, 659, 784].forEach((f, i) => tone(c, o, { type: "triangle", f0: f, dur: .18, gain: .22, at: i * .06 })); hiss(c, o, { dur: .25, gain: .06, f0: 6000, at: .05 }); },
  spell: (c, o) => { tone(c, o, { type: "sine", f0: 880, f1: 1760, dur: .35, gain: .16 }); tone(c, o, { type: "triangle", f0: 1320, f1: 2640, dur: .3, gain: .08, at: .05 }); hiss(c, o, { dur: .4, gain: .05, f0: 8000, f1: 3000, q: 2 }); },
  attack: (c, o) => { hiss(c, o, { dur: .22, gain: .3, f0: 900, f1: 3500, q: .8 }); tone(c, o, { type: "sawtooth", f0: 220, f1: 110, dur: .12, gain: .06 }); },
  hit: (c, o) => { tone(c, o, { type: "sine", f0: 160, f1: 50, dur: .22, gain: .5 }); hiss(c, o, { dur: .1, gain: .25, f0: 1200, type: "lowpass" }); },
  destroy: (c, o) => { hiss(c, o, { dur: .4, gain: .35, f0: 2500, f1: 300, q: .7 }); tone(c, o, { type: "square", f0: 300, f1: 70, dur: .3, gain: .08 }); },
  shieldBreak: (c, o) => { hiss(c, o, { dur: .5, gain: .3, f0: 7000, f1: 2500, q: 1.5 }); [1568, 2093, 2637].forEach((f, i) => tone(c, o, { type: "triangle", f0: f, dur: .25, gain: .1, at: .03 + i * .04 })); tone(c, o, { type: "sine", f0: 140, f1: 60, dur: .25, gain: .35 }); },
  equip: (c, o) => { tone(c, o, { type: "square", f0: 1200, f1: 900, dur: .06, gain: .08 }); tone(c, o, { type: "triangle", f0: 1800, dur: .12, gain: .1, at: .05 }); },
  block: (c, o) => { tone(c, o, { type: "triangle", f0: 330, dur: .18, gain: .25 }); hiss(c, o, { dur: .12, gain: .15, f0: 3000 }); },
  heal: (c, o) => { [660, 880].forEach((f, i) => tone(c, o, { type: "sine", f0: f, dur: .2, gain: .14, at: i * .08 })); },
  turnMine: (c, o) => { [784, 1047].forEach((f, i) => tone(c, o, { type: "triangle", f0: f, dur: .35, gain: .2, at: i * .12 })); },
  turnTheirs: (c, o) => { [523, 392].forEach((f, i) => tone(c, o, { type: "triangle", f0: f, dur: .3, gain: .14, at: i * .12 })); },
  ace: (c, o) => { [392, 523, 659, 784].forEach((f, i) => tone(c, o, { type: "sawtooth", f0: f, dur: .5, gain: .07, at: i * .05 })); hiss(c, o, { dur: .8, gain: .06, f0: 5000, f1: 9000 }); },
  win: (c, o) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, o, { type: "triangle", f0: f, dur: i === 3 ? .7 : .2, gain: .2, at: i * .13 })); },
  lose: (c, o) => { [392, 311, 262].forEach((f, i) => tone(c, o, { type: "sine", f0: f, f1: f * .97, dur: i === 2 ? .8 : .3, gain: .2, at: i * .22 })); },
  tap: (c, o) => tone(c, o, { type: "sine", f0: 900, dur: .05, gain: .06 })
};
function sfx(name){
  const c = sndCtx(), fn = SFX[name]; if (!c || !fn || document.hidden) return;
  try{ const out = c.createGain(); out.gain.value = SND.vol; out.connect(c.destination); fn(c, out); }catch(e){}
}
// 対戦のできごと → 効果音
function sfxFor(e){
  const t = e && e.type; if (!t) return "";
  if (t === "turn") return G && !G.spectate && e.s === G.slot ? "turnMine" : "turnTheirs";
  if (t === "fusion" || t === "evolve") return "ace";
  if (t === "ace") return aceShown(e) ? "ace" : "";
  if (t === "gain") return "heal";
  if (t === "blast") return "destroy";
  return SFX[t] ? t : "";
}
// 勝ち負けが決まったら1回だけ
function sfxEnd(){
  if (!G || !G.st || !G.st.winner || G.sfxEnd || G.test) return;
  G.sfxEnd = true; if (G.spectate) return;
  sfx(G.st.winner === "draw" ? "turnTheirs" : G.st.winner === G.slot ? "win" : "lose");
}
function setSoundVol(v){ SND.vol = Math.max(0, Math.min(1, v)); ls.set("cb_sound", SND.vol); if (SND.vol > 0){ sndCtx(); sfx("tap"); } }
const soundBtnHTML = () => `<button class="small ghost" data-act="sound" title="効果音のオン・オフ">${SND.vol > 0 ? "🔊 音あり" : "🔇 音なし"}</button>`;
function syncVolUI(){ const r = $("#mpVol"); if (!r) return; if (document.activeElement !== r) r.value = SND.vol; $("#mpVolNote").textContent = SND.vol > 0 ? Math.round(SND.vol * 100) + "%" : "オフ"; }
$("#mpVol").addEventListener("input", e => { SND.vol = Math.max(0, Math.min(1, +e.target.value)); ls.set("cb_sound", SND.vol); syncVolUI(); });
$("#mpVol").addEventListener("change", () => { if (SND.vol > 0){ sndCtx(); sfx("summon"); } });
$("#mpVolTest").addEventListener("click", () => { if (SND.vol <= 0) setSoundVol(.6); sndCtx(); sfx("summon"); setTimeout(() => sfx("hit"), 350); setTimeout(() => sfx("turnMine"), 800); syncVolUI(); });
syncVolUI();
