// Set to the deployed Cloudflare Worker HTTPS URL; never put credentials here.
const packApiUrl = "https://original-cardbattle-packs.tnt2006224.workers.dev";
// ターン通知（Web Push）の公開鍵。`node tools/vapid-keys.mjs` で作った PUBLIC を入れる（秘密鍵はここに書かない）。空ならターン通知は出ない
const pushPublicKey = "";
