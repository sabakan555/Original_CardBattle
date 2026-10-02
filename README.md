# ORIGINAL CARD BATTLE

みんなでカード描いてバトルしようぜの会 のオンライン対戦サイト。

- `index.html` … 公開されるゲーム本体（**直接は編集しない**。下の `src/` から作られる）
- `config.js` … Firebaseの接続設定（公開されても問題ない情報）
- `src/` … ゲームのソース（ここを直す）
  - `page.html` … 画面の骨組み（HTML）
  - `style.css` … 見た目
  - `js/00-helpers.js` … 小さな道具（`$`、保存など）
  - `js/01-effects.js` … 効果の一覧と、カードの文の作り方
  - `js/02-cards-data.js` … はじめからあるカード、カードの表示、持っているカード、データの読み書き
  - `js/03-home-tabs-search.js` … タイトル画面、タブ、さがす・しぼりこみ
  - `js/04-maker.js` … カード工房
  - `js/05-decks-viewer-mypage-account.js` … デッキ編集、カードの詳細、マイページ、デッキ一覧、ログイン
  - `js/06-lobby.js` … 対戦の部屋、CPU戦の開始、再戦
  - `js/07-engine.js` … 対戦のルール（召喚・効果・チェーンなど）
  - `js/08-board-ui.js` … CPUの動き、対戦画面、演出、カード詳細パネル
  - `js/09-boot-firebase.js` … 起動とFirebaseへの接続
- `tools/build.py` … `src/` をつなげて `index.html` を作る

## 直し方

1. `src/` の中のファイルを直す
2. `python3 tools/build.py` を実行して `index.html` を作り直す
3. 公開前に `python3 tools/build.py --check` で、`index.html` が `src/` と一致しているか確かめる

JSのファイルは名前の順番どおりにひとつにつなげられるので、ファイルをまたいで関数を呼んでも、これまでと同じように動きます。

※ Firestoreのルール（firestore.rules）はこのリポジトリには置かず、Firebaseコンソールで管理しています。
