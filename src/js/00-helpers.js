const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ls = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
let toastT;
function toast(m){ const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = o => JSON.parse(JSON.stringify(o));

const START_LP = 1000, MIN_DECK = 20, ZONES = 5;
// ATK has no upper limit and can be ∞ (stored as atkInf: true, since JSON can't hold Infinity)
const INF_WORDS = ["∞", "inf", "infinity", "無限", "むげん"];
const baseAtk = c => c && c.atkInf ? Infinity : (c && +c.atk) || 0;
const fmtN = n => n === Infinity ? "∞" : n === -Infinity ? "−∞" : String(n);
const cmpNum = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const S = { db: null, name: "", tab: "play", starters: [], userCards: [], cards: new Map(), decks: [], galF: "all" };
let G = null;

