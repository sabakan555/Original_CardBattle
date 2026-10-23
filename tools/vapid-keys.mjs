// ターン通知用のVAPID鍵を作る: node tools/vapid-keys.mjs
// PUBLIC  → pack-config.js の pushPublicKey と、Workerのシークレット VAPID_PUBLIC
// PRIVATE → Workerのシークレット VAPID_PRIVATE だけ（GitHubやチャットに貼らない）
const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url");
const priv = (await crypto.subtle.exportKey("jwk", k.privateKey)).d;
console.log("PUBLIC  =", pub);
console.log("PRIVATE =", priv);
