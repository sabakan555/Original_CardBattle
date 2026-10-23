import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle,vapidAuth,turnTarget,fsVal} from '../worker.mjs';
class D1 {
  constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));}
  prepare(text){const db=this.sql;return {args:[],bind(...a){this.args=a;return this;},async first(){return db.prepare(text).get(...this.args)||null;},async all(){return {results:db.prepare(text).all(...this.args)};},async run(){return db.prepare(text).run(...this.args);}};}
  async batch(s){return Promise.all(s.map(x=>x.all()));}
}
const b64u=b=>Buffer.from(b).toString('base64url');
async function keys(){const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const raw=await crypto.subtle.exportKey('raw',k.publicKey);const jwk=await crypto.subtle.exportKey('jwk',k.privateKey);return {pub:k.publicKey,env:{VAPID_PUBLIC:b64u(raw),VAPID_PRIVATE:jwk.d,VAPID_SUB:'mailto:a@b.c'}};}
const NOW=Date.parse('2026-10-23T06:00:00Z');
test('VAPID header is a valid ES256 JWT for the push service origin',async()=>{
  const {pub,env}=await keys(); const h=await vapidAuth('https://fcm.googleapis.com/fcm/send/xyz',env,NOW);
  const m=h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/); assert.ok(m); assert.equal(m[4],env.VAPID_PUBLIC);
  const payload=JSON.parse(Buffer.from(m[2],'base64url')); assert.equal(payload.aud,'https://fcm.googleapis.com'); assert.equal(payload.exp,NOW/1000+12*3600);
  assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Buffer.from(m[3],'base64url'),new TextEncoder().encode(m[1]+'.'+m[2])));
});
test('only a player in the room can notify, and only the one whose turn it is now',()=>{
  const room={started:true,turn:'b',players:{a:{uid:'me'},b:{uid:'you'}}};
  assert.equal(turnTarget(room,'me'),'you'); assert.equal(turnTarget(room,'you'),null); assert.equal(turnTarget(room,'stranger'),null);
  assert.equal(turnTarget({...room,winner:'a'},'me'),null); assert.equal(turnTarget({...room,players:{a:{uid:'me'},b:{}}},'me'),null);
  assert.deepEqual(fsVal({mapValue:{fields:{a:{mapValue:{fields:{uid:{stringValue:'x'},lp:{integerValue:'900'}}}}}}}),{a:{uid:'x',lp:900}});
});
test('subscribe, then a turn change pushes once (rate-limited) and drops dead endpoints',async()=>{
  const {env}=await keys(); const DB=new D1(); const pushes=[];
  const room={fields:{started:{booleanValue:true},turn:{stringValue:'b'},players:{mapValue:{fields:{a:{mapValue:{fields:{uid:{stringValue:'me'}}}},b:{mapValue:{fields:{uid:{stringValue:'you'}}}}}}}}};
  const fetcher=who=>async(url,opt)=>{ if(url.includes('accounts:lookup')) return Response.json({users:[{localId:who,providerUserInfo:[{providerId:'password'}]}]}); if(url.includes('/rooms/AB12')) return Response.json(room); pushes.push(url); return new Response('',{status:url.includes('dead')?410:201}); };
  const req=(path,body)=>new Request('https://w.example'+path,{method:'POST',headers:{Origin:'https://sabakan555.github.io',Authorization:'Bearer t','Content-Type':'application/json'},body:JSON.stringify(body)});
  for(const e of ['https://push.example/live','https://push.example/dead']) assert.equal((await handle(req('/push/sub',{endpoint:e}),{DB,...env},fetcher('you'),NOW)).status,200);
  const r=await (await handle(req('/push/turn',{room:'AB12'}),{DB,...env},fetcher('me'),NOW)).json();
  assert.equal(r.sent,1); assert.equal(pushes.length,2);
  assert.equal(DB.sql.prepare('SELECT COUNT(*) n FROM push_subs').get().n,1);
  const again=await (await handle(req('/push/turn',{room:'AB12'}),{DB,...env},fetcher('me'),NOW+5000)).json(); assert.equal(again.sent,0);
  const self=await (await handle(req('/push/turn',{room:'AB12'}),{DB,...env},fetcher('you'),NOW+60000)).json(); assert.equal(self.sent,0);
  assert.equal((await handle(req('/push/sub',{endpoint:'http://insecure'}),{DB,...env},fetcher('you'),NOW)).status,400);
});
test('without VAPID keys the push routes say so and packs still work',async()=>{
  const DB=new D1(); const f=async url=>Response.json({users:[{localId:'me',providerUserInfo:[{providerId:'password'}]}]});
  const r=await handle(new Request('https://w.example/push/sub',{method:'POST',headers:{Origin:'https://sabakan555.github.io',Authorization:'Bearer t'},body:'{}'}),{DB},f,NOW);
  assert.equal(r.status,503); assert.match((await r.json()).error,/通知の設定/);
});
