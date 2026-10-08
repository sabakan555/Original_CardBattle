# パック用サーバー

Cloudflare Workers Free + D1。FirebaseはSparkのまま使う。Firebase管理用秘密鍵は不要。
Firebase AuthenticationのREST APIでIDトークンを検証し、本人のトークンで既存のFirestore読み取りルールに従ってカードを抽選する。
匿名ユーザーは受け取り不可。抽選・日本時間の日付・同時実行制限はサーバー側で決定する。

## 初回公開

1. CloudflareでD1データベース `original-cardbattle-packs` を作成し、`schema.sql`を実行する。
2. Worker `original-cardbattle-packs` に `worker.mjs` を公開する。D1のバインディング名は `DB`。
3. サイトの `pack-config.js` にWorkerのHTTPS URLを設定する。

CLIの場合は `npx wrangler login`、`npx wrangler d1 create original-cardbattle-packs` の順で実行し、返されたIDを `wrangler.jsonc` に設定。
`npx wrangler d1 execute original-cardbattle-packs --remote --file=schema.sql` の後、`npx wrangler deploy`。
既存データベースに対してリセットや削除を行わない。

## 保存データと仕様

- `claims`: Firebase UID、日本時間の日付、抽選した3枚のID、受け取り時刻。UIDと日付の複合主キーで1日1回を保証。
- `inventory`: UID、カードID、受け取り時刻。カード内容・イラストは保存しない。
- 同時リクエストは1つの結果だけを保存し、その保存結果から所持カードを追加する。通信が切れても `/status` で結果を確認できる。
- 同じパックに同じカードは入らない。過去の所持カードは再登場するが、所持数は増えない。
- `ownerId` のある、他人の通常カードのみ。スターター・トークン・ポーション・レリック・スキン単体・非公開・`noPack:true` は対象外。所有者不明の旧データは安全のため対象外。
- 有効な候補が3種類未満の場合はその日の権利を消費しない。
- 配布停止は将来の抽選だけに影響する。元カードの編集・削除はカード表示と利用に反映する。
- 元データが消えたIDは監査用履歴に残るが、所持カードには表示しない。削除後の再作成は新しいIDにする。
- `/status` と `/open` は POST + Firebase ID token。CORSは既存GitHub Pagesのoriginのみ。

無料枠を超えるとサービスが停止することがある。課金プランを自動で変更しない。D1レプリカを有効にせず、プライマリから結果を取得する。
検証: `node --test tests/worker.test.mjs`（Node 22以上）。本番ではログイン、日付更新、再読込、他端末の所持カードを確認する。
