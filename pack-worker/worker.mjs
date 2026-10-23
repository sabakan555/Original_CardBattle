// No admin credential: Firebase validates its own token and applies existing read rules.
const PROJECT = "card-battle-f6b56";
const FIREBASE_KEY = "AIzaSyBp2WD8oWJYUh5tQOKDV8fel7xYnn6vuPo";
const ORIGIN = "https://sabakan555.github.io";
const fields = ["ownerId", "noPack", "type", "starter", "skinOf", "token", "public", "visibility"];
class PackError extends Error { constructor(message,status=503){ super(message); this.status=status; } }
export function dayInfo(now){
  const day = new Date(now + 9*3600000).toISOString().slice(0,10);
  return { day, now, nextReset: Date.parse(day + "T00:00:00+09:00") + 86400000 };
}
export function eligible(d,uid){
  const f=d.fields || {}, str=k=>f[k]?.stringValue, yes=k=>f[k]?.booleanValue === true;
  return !!str("ownerId") && str("ownerId") !== uid && !yes("noPack") && !yes("starter") && !yes("token") && !str("skinOf") && f.public?.booleanValue !== false && str("visibility") !== "private" && ["monster","magic","trap","equip"].includes(str("type"));
}
export function chooseThree(ids,random=crypto){
  const a=[...new Set(ids)]; if(a.length<3) throw new PackError("配布できるカードがまだ3種類ありません。今日のパックは消費していません。",409);
  for(let i=0;i<3;i++){
    const n=a.length-i, limit=4294967296-(4294967296%n), v=new Uint32Array(1); do{random.getRandomValues(v);}while(v[0]>=limit);
    const j=i+v[0]%n; [a[i],a[j]]=[a[j],a[i]];
  }
  return a.slice(0,3);
}
async function firebaseUser(token,fetcher){
  const r=await fetcher("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+FIREBASE_KEY,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new PackError("ログインを確認できません。もう一度ログインしてね。",401);
  const u=(await r.json()).users?.[0];
  if(!u?.localId || u.disabled || !u.providerUserInfo?.length) throw new PackError("パックを開くにはIDを登録してログインしてね。",403);
  return u.localId;
}
async function cardPool(token,uid,fetcher){
  const r=await fetcher("https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents:runQuery",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({structuredQuery:{from:[{collectionId:"cards"}],select:{fields:fields.map(fieldPath=>({fieldPath}))}}}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new PackError("カードを読み込めませんでした。パックは消費していません。");
  const data=await r.json(); if(!Array.isArray(data) || data.some(x=>x.error)) throw new PackError("カードを読み込めませんでした。");
  return data.filter(x=>x.document && eligible(x.document,uid)).map(x=>decodeURIComponent(x.document.name.split("/").at(-1)));
}
async function status(db,uid,info){
  const rows=await db.batch([
    db.prepare("SELECT day,cards,created_at FROM claims WHERE uid=? ORDER BY day DESC LIMIT 1").bind(uid),
    db.prepare("SELECT card_id FROM inventory WHERE uid=?").bind(uid)
  ]);
  const row=rows[0].results[0];
  return {...info,result:row?{day:row.day,cards:JSON.parse(row.cards),receivedAt:row.created_at}:null,owned:rows[1].results.map(x=>x.card_id)};
}
// ---- ターン通知（Web Push） ----
// 中身なしのプッシュを送る（暗号化した本文は不要）。VAPIDの鍵はWorkerのシークレット VAPID_PUBLIC / VAPID_PRIVATE（どちらもbase64url）
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4)),c=>c.charCodeAt(0));
export async function vapidAuth(endpoint,env,now=Date.now()){
  const pub=unb64u(env.VAPID_PUBLIC); if(pub.length!==65) throw new PackError("通知の設定がまだです。");
  const key=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:b64u(pub.slice(1,33)),y:b64u(pub.slice(33,65)),d:env.VAPID_PRIVATE,ext:true},{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const enc=o=>b64u(new TextEncoder().encode(JSON.stringify(o)));
  const body=enc({typ:"JWT",alg:"ES256"})+"."+enc({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:env.VAPID_SUB||"mailto:noreply@example.com"});
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(body));
  return "vapid t="+body+"."+b64u(sig)+", k="+env.VAPID_PUBLIC;
}
const okEndpoint=e=>typeof e==="string" && e.length<2000 && /^https:\/\//.test(e);
// Firestore REST の値をふつうのJSに
export function fsVal(v){ if(!v) return null; if("stringValue" in v) return v.stringValue; if("integerValue" in v) return +v.integerValue; if("doubleValue" in v) return v.doubleValue; if("booleanValue" in v) return v.booleanValue; if("nullValue" in v) return null; if(v.mapValue){ const o={}; for(const [k,x] of Object.entries(v.mapValue.fields||{})) o[k]=fsVal(x); return o; } return null; }
// 部屋を読んで、いま動く番の人のuidを返す（呼んだ人がその部屋のプレイヤーで、番が相手に移っているときだけ）
export function turnTarget(room,uid){
  const pl=room?.players||{}, slot=["a","b"].find(k=>pl[k]?.uid===uid); if(!slot || !room.started || room.winner) return null;
  const w=room.turn, t=pl[w]?.uid; return w && w!==slot && t && t!==uid ? t : null;
}
async function readRoom(token,code,fetcher){
  const r=await fetcher("https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents/rooms/"+encodeURIComponent(code)+"?mask.fieldPaths=players&mask.fieldPaths=turn&mask.fieldPaths=started&mask.fieldPaths=winner",{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new PackError("部屋を読み込めませんでした。",404);
  const d=await r.json(), f=d.fields||{}; return {players:fsVal(f.players),turn:fsVal(f.turn),started:fsVal(f.started),winner:fsVal(f.winner)};
}
async function pushTurn(db,env,target,code,now,fetcher){
  const last=await db.prepare("SELECT at FROM push_sent WHERE room=? AND uid=?").bind(code,target).first();
  if(last && now-last.at<20000) return {sent:0,skipped:"recent"};
  await db.prepare("INSERT INTO push_sent(room,uid,at) VALUES(?,?,?) ON CONFLICT(room,uid) DO UPDATE SET at=excluded.at").bind(code,target,now).run();
  const subs=(await db.prepare("SELECT endpoint FROM push_subs WHERE uid=?").bind(target).all()).results||[];
  let sent=0;
  for(const {endpoint} of subs){
    try{
      const r=await fetcher(endpoint,{method:"POST",headers:{Authorization:await vapidAuth(endpoint,env,now),TTL:"120",Urgency:"high","Content-Length":"0"},signal:AbortSignal.timeout(10000)});
      if(r.status===404 || r.status===410) await db.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(endpoint).run(); else if(r.ok) sent++;
    }catch(e){}
  }
  return {sent};
}
export async function handle(request,env,fetcher=fetch,now=Date.now()){
  const origin=request.headers.get("Origin"), headers={"Access-Control-Allow-Origin":ORIGIN,"Vary":"Origin","Cache-Control":"no-store","Content-Type":"application/json;charset=utf-8","X-Content-Type-Options":"nosniff"};
  const reply=(d,code=200)=>new Response(JSON.stringify(d),{status:code,headers});
  if(origin && origin!==ORIGIN) return reply({error:"このサイトからは利用できません。"},403);
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{...headers,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Max-Age":"3600"}});
  const path=new URL(request.url).pathname;
  if(request.method!=="POST" || !["/open","/status","/push/sub","/push/unsub","/push/turn"].includes(path)) return reply({error:"Not found"},404);
  try{
    const token=request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1]; if(!token || token.length>10000) throw new PackError("ログインしてね。",401);
    const uid=await firebaseUser(token,fetcher), info=dayInfo(now), db=env.DB;
    if(!db) throw new PackError("パックの公開準備中です。");
    if(path.startsWith("/push/")){
      if(!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) throw new PackError("通知の設定がまだです。");
      let body={}; try{ body=await request.json(); }catch(e){}
      if(path==="/push/sub"){ if(!okEndpoint(body.endpoint)) throw new PackError("通知の登録情報がおかしいです。",400); await db.prepare("INSERT INTO push_subs(endpoint,uid,created_at) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET uid=excluded.uid,created_at=excluded.created_at").bind(body.endpoint,uid,now).run(); return reply({ok:true}); }
      if(path==="/push/unsub"){ if(okEndpoint(body.endpoint)) await db.prepare("DELETE FROM push_subs WHERE endpoint=? AND uid=?").bind(body.endpoint,uid).run(); return reply({ok:true}); }
      const code=String(body.room||""); if(!/^[A-Za-z0-9]{1,12}$/.test(code)) throw new PackError("部屋コードがおかしいです。",400);
      const target=turnTarget(await readRoom(token,code,fetcher),uid);
      return reply(target?await pushTurn(db,env,target,code,now,fetcher):{sent:0});
    }
    if(path==="/open"){
      const existing=await db.prepare("SELECT day FROM claims WHERE uid=? AND day=?").bind(uid,info.day).first();
      if(!existing){
        const cards=chooseThree(await cardPool(token,uid,fetcher));
        // Atomic batch: the unique key picks ONE winning result for simultaneous requests.
        // Inventory is always granted from that persisted result, never the losing draw.
        await db.batch([
          db.prepare("INSERT INTO claims(uid,day,cards,created_at) VALUES(?,?,?,?) ON CONFLICT(uid,day) DO NOTHING").bind(uid,info.day,JSON.stringify(cards),now),
          db.prepare("INSERT INTO inventory(uid,card_id,received_at) SELECT claims.uid,j.value,claims.created_at FROM claims,json_each(claims.cards) AS j WHERE claims.uid=? AND claims.day=? ON CONFLICT(uid,card_id) DO NOTHING").bind(uid,info.day)
        ]);
      }
    }
    return reply(await status(db,uid,info));
  }catch(e){ return reply({error:e instanceof PackError?e.message:"通信が途切れました。再読み込みして結果を確認してね。"},e.status || 503); }
}
export default {fetch:(request,env)=>handle(request,env)};
