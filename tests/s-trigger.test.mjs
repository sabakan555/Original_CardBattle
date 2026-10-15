import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const engine = read('js/07-engine.js');
const source = engine.slice(engine.indexOf('function sTrigger('), engine.indexOf('// 成長:'));
function harness(type = 'monster', options = {}) {
  const c = { id: 'trigger', name: 'トリガー', type, strig: true, ...options };
  const p = { deck: [c.id, 'next'], hand: [], grave: [], exile: [], mz: [null], sz: [null] };
  const calls = [];
  const ctx = { P: () => p, card: () => c, cardType: c => c.type, log: () => {},
    useBlockedWhy: () => options.blocked || '', glZone: () => options.full ? -1 : 0,
    countPlay: () => calls.push('count'), pushChain: (...a) => calls.push(a),
    isPersist: () => false, isField: () => false, exhausts: () => false,
    ev: () => {}, freeZone: () => 0 };
  vm.createContext(ctx); vm.runInContext(source + ';this.fire=sTrigger;', ctx);
  ctx.fire({pending:{type:'attack',by:'a',to:'direct'}}, 'b'); return { p, calls };
}
test('monster S-trigger queues a free summon without spending a normal summon or mana', () => {
  const { p, calls } = harness();
  assert.deepEqual(p.deck, ['next']); assert.deepEqual(p.grave, []);
  assert.equal(calls[0], 'count'); assert.equal(calls[1][5].summon, true);
  assert.equal(calls[1][5].cast, false); assert.equal(calls[1][5].z, 0);
  const triggers = [];
  const ctx = { P:()=>p, card:()=>({id:'trigger',name:'トリガー'}), log:()=>{},
    mkMon:(_,id)=>({c:id,u:1}), ev:()=>{}, afterChain:()=>{},
    runCard:(st,s,c,trig,context,done)=>{triggers.push(trig);done(st);},
    persistFire:(st,s,trig,context,done)=>done(st), onCardUsed:(st,s,c,done)=>done(st) };
  vm.createContext(ctx);
  vm.runInContext(engine.slice(engine.indexOf('function resolveChain('),engine.indexOf('function afterChain('))+';this.resolve=resolveChain;',ctx);
  ctx.resolve({chain:[{s:'b',c:'trigger',...calls[1][5]}]},null);
  assert.equal(p.mz[0].c,'trigger'); assert.deepEqual(triggers,['summon']);
});
test('a full monster field or blocked spell puts the revealed card in hand', () => {
  for (const [type,options] of [['monster',{full:true}], ['magic',{blocked:'禁止'}]]) {
    const {p,calls}=harness(type, options);
    assert.deepEqual(p.hand,['trigger']); assert.equal(calls.length,0);
  }
});
test('magic and trap triggers retain their activation chain', () => {
  for (const type of ['magic','trap']) {
    const {p,calls}=harness(type); assert.deepEqual(p.grave,['trigger']);
    assert.equal(calls[1][3].strig,true); assert.equal(calls[1][5],null);
  }
});
test('monsters can save and display S-trigger, while flashback and kicker stay spell-only', () => {
  const maker = read('js/04-maker.js');
  const fn = maker.split('\n').find(l=>l.startsWith('function mkSpOpts('));
  const opts=vm.runInNewContext(fn+';mkSpOpts()', { MK:{type:'monster',kind:'card'}, $: q=>({checked:true,value:'3'}) });
  assert.equal(opts.strig,true); assert.equal(opts.flashback,undefined); assert.equal(opts.kick,undefined);
  const line=read('js/01-effects.js').split('\n').find(l=>l.startsWith('const spOptText ='));
  const text=vm.runInNewContext(line+';spOptText({type:"monster",strig:true,flashback:true,kick:3})',{cardType:c=>c.type});
  assert.equal(text,'《S・トリガー》');
  const html=read('page.html'); assert.equal((html.match(/id="mkStrig"/g)||[]).length,1);
  assert.ok(html.indexOf('id="mkStrig"')>html.indexOf('コストが下がる・タダになる'));
});

test('a spell lock does not prevent an S-trigger monster summon',()=>{assert.equal(harness('monster',{blocked:'魔法・罠は禁止'}).calls[1][5].summon,true);});

test('direct-attack trigger resolves before responses and damage, once per attack', () => {
  const events=[]; const ctx={ O:s=>s==='a'?'b':'a', resolveAttack:()=>events.push('damage'),
    responseOptions:()=>{events.push('responses');return ['block'];},
    sTrigger:st=>{events.push('trigger');return true;} };
  vm.createContext(ctx);
  vm.runInContext(engine.slice(engine.indexOf('function attackResponse('),engine.indexOf('// 「相手が攻撃してきたとき」'))+';this.go=attackResponse;',ctx);
  const st={pending:{type:'attack',by:'a',to:'direct'}};
  ctx.go(st,'a'); assert.deepEqual(events,['trigger']);
  ctx.go(st,'a'); assert.deepEqual(events,['trigger','responses']); assert.equal(st.pending.wait,true);
  events.length=0;ctx.go({pending:{type:'attack',by:'a',to:0}},'a');assert.deepEqual(events,['responses']);
});

test('skip-rest-of-turn from a trigger cancels the pending attack before damage', () => {
  const events=[]; const ctx={checkEnd:()=>{},flushTurnEndRequest:st=>{events.push('end');return true;},
    attackResponse:()=>events.push('responses'),resolveAttack:()=>events.push('damage')};
  vm.createContext(ctx);
  vm.runInContext(engine.slice(engine.indexOf('function afterChain('),engine.indexOf('// after a summon succeeds'))+';this.after=afterChain;',ctx);
  const st={turn:'a',turnNo:4,endTurnRequested:{s:'a',no:4},pending:{type:'attack',by:'a',to:'direct',strigResume:true}};
  ctx.after(st);assert.equal(st.pending,null);assert.deepEqual(events,['end']);
});

test('S-trigger ignores monster attacks and non-attack damage',()=>{
  for(const pending of [null,{type:'attack',by:'a',to:0},{type:'attack',by:'b',to:'direct'},{type:'attack',by:'a',to:'direct',negated:true}]){
    const ctx={};vm.createContext(ctx);vm.runInContext(source+';this.fire=sTrigger;',ctx);
    assert.equal(ctx.fire({pending},'b'),false);
  }
});
