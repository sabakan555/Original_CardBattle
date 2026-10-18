import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const engine=read('js/07-engine.js'), effects=read('js/01-effects.js'), lobby=read('js/06-lobby.js');
function setup(){
  const cards=new Map();
  for (const [id,type,extra] of [['anchor','monster',{cannotLeave:true}],['ordinary','monster',{}],['equip','equip',{cannotLeave:true}],['spell','magic',{cannotLeave:true}],['field','magic',{field:true,cannotLeave:true}],['newfield','magic',{field:true}],['start','monster',{startOnField:true}],['startEq','equip',{startOnField:true}],['trap','trap',{startOnField:true}],['startField','magic',{field:true,startOnField:true}]]) cards.set(id,{id,name:id,type,...extra});
  const player=()=>({name:'test',deck:[],deckIds:[],hand:[],ex:[],grave:[],mz:[null,null],sz:[null,null],lp:1000});
  const st={players:{a:player(),b:player()},first:'a',turn:'a',turnNo:1,log:[],ev:[]};
  const ctx={S:{cards},G:null,cardType:c=>c.type,eqsOf:m=>m?.eqs||[],KINDS:{},RB_MODE:{destroy:"破壊する",bounce:"戻す",banish:"除外する"},SIDED_KINDS:new Set(),
    isField:c=>!!c.field,whenOf:()=>'',sealedM:()=>false,eqCostOf:()=>0,eqUsed:()=>0,eqCapOf:()=>99};
  vm.createContext(ctx);vm.runInContext(engine,ctx);
  vm.runInContext(effects.split('\n').filter(l=>/^const (cannotLeave|monCannotLeave|isPersist) =/.test(l)).join('\n'),ctx);
  vm.runInContext(effects.slice(effects.indexOf('/* ---- ATKを変える'), effects.indexOf('// 追加コスト')), ctx); // atkNorm・fxTgt
  vm.runInContext('ev=()=>{};glGroup=(st,s,i)=>[i];hasAb=()=>false;hasAltar=()=>false;monTrigList=()=>[];ctrTrigs=()=>[];runList=()=>{};',ctx);
  vm.runInContext(lobby.slice(lobby.indexOf('function startingField('),lobby.indexOf('function startState(')),ctx);
  return {ctx,st,cards,a:st.players.a,b:st.players.b};
}
test('starting cards occupy the board without reducing the opening hand or duplicating cards',()=>{
  const {ctx,st,a,b}=setup();a.hand=['start','ordinary','ordinary','ordinary','ordinary'];a.deck=['startEq','trap','startField','ordinary','ordinary'];a.deckIds=[...a.hand,...a.deck];
  b.hand=['ordinary'];b.deck=['start'];b.deckIds=['ordinary','start'];
  ctx.startingField(st);
  assert.equal(a.hand.length,5);assert.equal(a.mz[0].c,'start');assert.equal(a.mz[0].born,0);
  assert.equal(a.sz[0].c,'trap');assert.equal(a.sz[0].face,false);assert.equal(a.standingEq[0].c,'startEq');assert.equal(st.field.c,'startField');
  assert.equal(b.mz[0].c,'start');assert.notEqual(a.mz[0].u,b.mz[0].u);
  assert.equal(a.hand.includes('start'),false);assert.equal(a.deck.length,1);
});
test('full zones and a competing shared field leave starting cards in their decks',()=>{
  const {ctx,st,a,b}=setup();a.mz=[{c:'ordinary'},{c:'ordinary'}];a.deck=['start'];a.deckIds=['start'];
  a.sz=[{c:'spell'},{c:'spell'}];a.deck.push('trap');a.deckIds.push('trap');
  st.field={c:'field',o:'a'};b.ex=['startField'];b.deckIds=['startField'];
  ctx.startingField(st);assert.deepEqual(a.deck,['start','trap']);assert.deepEqual(b.ex,['startField']);assert.equal(st.field.c,'field');
});
test('an anchored monster survives battle, rule destruction, bounce, exile, mana and tribute removal',()=>{
  const {ctx,st,a}=setup();a.mz[0]={c:'anchor',u:1,eqs:[]};
  for(const opt of [{battle:true},{rule:true},{force:true},{}]) assert.equal(ctx.destroyMonster(st,'a',0,'test',opt),false);
  for(const to of ['hand','exile','mana']) assert.equal(ctx.moveMonOut(st,'a',0,to),null);
  assert.equal(ctx.sendToGrave(st,'a',0),false);assert.equal(a.mz[0].c,'anchor');assert.equal(a.grave.length,0);
});
test('ordinary monsters still leave, while anchored equipment stays on the field and reattaches',()=>{
  const {ctx,st,a}=setup();a.mz[0]={c:'ordinary',u:1,eqs:[{c:'equip',o:'a',u:2},{c:'ordinary',o:'a',u:3}]};
  ctx.moveMonOut(st,'a',0,'hand');assert.equal(a.mz[0],null);assert.deepEqual(a.hand,['ordinary']);assert.deepEqual(a.grave,['ordinary']);assert.equal(a.standingEq[0].c,'equip');
  a.mz[1]={c:'ordinary',u:4,eqs:[]};assert.equal(ctx.attachStanding(st,'a',0,'a',1),true);assert.equal(a.mz[1].eqs[0].u,2);assert.equal(a.standingEq.length,0);
});
test('all spell/trap and shared field removal modes respect the flag',()=>{
  const {ctx,st,b}=setup();b.sz[0]={c:'spell',face:true};st.field={c:'field',o:'b'};
  for(const rm of ['destroy','bounce','banish']) for(const target of ['b:sz:0','field']) ctx.applyEffect(st,'a',{name:'test'},target,{}, {kind:'removeBoard',rm});
  for(const kind of ['destroyStAll','destroyField','destroyOthers']) ctx.applyEffect(st,'a',{name:'test'},null,{}, {kind});
  assert.equal(b.sz[0].c,'spell');assert.equal(st.field.c,'field');assert.equal(ctx.placeField(st,'a','newfield'),false);assert.equal(b.grave.length,0);
});
test('anchored monsters are rejected as synchro/xyz and fusion material before payment',()=>{
  const {ctx,st,a}=setup();a.mz[0]={c:'anchor'};
  vm.runInContext('sxK=()=>({k:"xyz",n:1});lvOf=()=>1;',ctx);
  assert.equal(ctx.sxPicksOk(st,'a',{id:'ordinary'},[0]),false);
  assert.equal(ctx.fusionPlanFrom(st,'a',{type:'monster',fusion:[{m:'any'}]},[{from:'mz',i:0}]),null);
});
test('anchored magic and trap remain permanent after activation',()=>{
  const {ctx}=setup();assert.equal(vm.runInContext('isPersist(card("spell"))',ctx),true);
  assert.equal(vm.runInContext('isPersist({type:"trap",cannotLeave:true})',ctx),true);
});
test('all source JavaScript parses after the build',()=>{
  for(const file of fs.readdirSync(new URL('../src/js/',import.meta.url)).filter(f=>f.endsWith('.js'))) new vm.Script(read('js/'+file),{filename:file});
});
