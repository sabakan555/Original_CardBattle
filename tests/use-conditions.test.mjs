import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=p=>fs.readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const effects=read('js/01-effects.js'), engine=read('js/07-engine.js');
function setup(){
 const cards=new Map([['fire',{id:'fire',type:'monster',name:'火',attrs:['火']}],['multi',{id:'multi',type:'magic',name:'多色',attrs:['火','水']}],['water',{id:'water',type:'magic',attrs:['水']}],['spell',{id:'spell',type:'magic',name:'条件付き',useConds:[{where:'grave',attr:'火',n:2}]}]]);
 const player=()=>({deck:[],hand:[],grave:[],mana:null,manaZ:[],mz:[null,null],sz:[null,null],lp:1000});
 const st={players:{a:player(),b:player()},turn:'a',turnNo:2,log:[],pending:null};
 const ctx={S:{cards},G:null,cardType:c=>c.type,attrsOf:c=>c.attrs||[],monAttrs:m=>cards.get(m.c).attrs||[],eqsOf:m=>m?.eqs||[],
   payLpOf:()=>0,payDiscOf:()=>0,payMaxOf:()=>0,payCtrOf:()=>null,ctrPayWhy:()=>'',whenOf:()=>'',isField:c=>!!c.field,KINDS:{},TARGETABLE:{},SIDED_KINDS:new Set()};
 vm.createContext(ctx);vm.runInContext(effects.slice(effects.indexOf('const USE_COND_WHERE ='),effects.indexOf('const payLpOf =')),ctx);
 vm.runInContext(effects.slice(effects.indexOf('/* ---- まとめた効果'), effects.indexOf('// 追加コスト')),ctx);vm.runInContext(engine,ctx);vm.runInContext('manaCivWhy=()=>"";',ctx);
 return {ctx,st,cards,a:st.players.a,b:st.players.b};
}
test('grave thresholds use >=, combine with AND, and never consume counted cards',()=>{
 const {ctx,st,a,cards}=setup(), c=cards.get('spell');a.grave=['fire'];assert.match(ctx.useCondWhy(st,'a',c),/いま1枚/);
 a.grave.push('multi');assert.equal(ctx.useCondWhy(st,'a',c),'');assert.equal(ctx.canPay(st,'a',c),true);assert.deepEqual(a.grave,['fire','multi']);
 c.useConds.push({where:'hand',attr:'水',n:1});assert.notEqual(ctx.useCondWhy(st,'a',c),'');a.hand=['water'];assert.equal(ctx.useCondWhy(st,'a',c),'');
 a.grave.push('fire');assert.equal(ctx.useCondWhy(st,'a',c),'');
});
test('field counts include owned equips, standby, spells and shared field, once per multicolor card',()=>{
 const {ctx,st,a,b}=setup();a.mz[0]={c:'fire',eqs:[]};a.sz[0]={c:'multi',face:false};b.mz[0]={c:'fire',eqs:[{c:'multi',o:'a'}]};
 a.standingEq=[{c:'multi',o:'a'}];st.field={c:'multi',o:'a'};
 assert.equal(ctx.useCondCount(st,'a',{where:'field',attr:'火'}),5);
 assert.equal(ctx.useCondCount(st,'a',{where:'field',attr:'水'}),4);
 assert.equal(ctx.useCondCount(st,'b',{where:'field',attr:'火'}),1);
});
test('mana requirements count cards including tapped mana, rather than maximum or available mana',()=>{
 const {ctx,st,a}=setup();a.mana={cur:0,max:20};a.manaZ=[{c:'fire',tap:true},{c:'multi',tap:true},{c:'water',tap:false}];
 assert.equal(ctx.useCondCount(st,'a',{where:'mana',attr:'火'}),2);assert.equal(ctx.useCondCount(st,'a',{where:'mana',attr:''}),3);
});
test('failed normal activation leaves hand, LP and mana untouched',()=>{
 const {ctx,st,a}=setup();a.hand=['spell'];a.mana={cur:5,max:5};
 assert.equal(ctx.activate(st,'a','hand',0),false);assert.deepEqual(a.hand,['spell']);assert.equal(a.lp,1000);assert.equal(a.mana.cur,5);assert.equal(st.chain,undefined);
});
test('free casts, autoplay and S-trigger cannot bypass requirements',()=>{
 for(const mode of ['castFree','autoPlayCard','sTrigger']){
  const {ctx,st,a,cards}=setup();cards.get('spell').strig=true;
  if(mode==='sTrigger'){a.deck=['spell'];st.pending={type:'attack',by:'b',to:'direct'};assert.equal(ctx.sTrigger(st,'a'),false);}
  else ctx[mode](st,'a','spell','test',()=>{});
  assert.deepEqual(a.hand,['spell']);assert.deepEqual(a.grave,[]);assert.equal(st.chain,undefined);
 }
});
test('normalization preserves valid custom attributes and old cards have no conditions',()=>{
 const {ctx}=setup();assert.equal(vm.runInContext('useCondsOf({}).length',ctx),0);
 assert.equal(vm.runInContext('useCondsOf({useConds:[{where:"grave",attr:"星",n:2} ]})[0].attr',ctx),'星');
 assert.equal(vm.runInContext('useCondsOf({useConds:[{where:"bogus",n:3},{where:"grave",n:0}]}).length',ctx),0);
 assert.match(vm.runInContext('useCondText({useConds:[{where:"grave",attr:"火",n:2}]})',ctx),/自分の墓地に火属性のカードが2枚以上/);
});
test('requirements are saved, loaded, reset, previewed and placed above additional costs',()=>{
 const html=read('page.html'), maker=read('js/04-maker.js');
 assert.ok(html.indexOf('id="useCondRow"')<html.indexOf('id="payRow"'));
 assert.match(maker,/useConds: useCondsOf\(\{ useConds: MK.useConds \}\)/);assert.match(maker,/setUseConds\(c\)/);assert.match(maker,/setUseConds\(null\)/);
});
