# SAMPO QUEST 空き時間調整アプリ v11

GitHub Pages + Supabase で動く、固定チーム用の予定調整Webアプリです。

## v11の考え方

今までの「候補日を作る → ○△×で投票」方式ではなく、

1. 各メンバーが自分の空いている時間を入力する
2. アプリが空き時間の重なりを計算する
3. 全員または多くの人が集まれる日時を提示する
4. よさそうな日時を確定する

という流れに変更しています。

## ファイル構成

- `index.html`
- `style.css`
- `app.js`
- `supabase-schema.sql`
- `README.md`

## GitHub Pagesで公開する方法

1. GitHubのリポジトリを開く
2. v11の5ファイルをアップロード、または既存ファイルに上書き
3. `Settings` → `Pages`
4. `Deploy from a branch` を選ぶ
5. `main` / `/root` を選んで保存
6. 公開URLを開く

反映されない場合は、公開URLの後ろに `?v=11` を付けて開いてください。

## Supabase設定

`app.js` の上部にSupabase URLとpublishable keyを設定します。

```js
const SUPABASE_URL = 'https://dgaveiimlslljluimqxn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JPpJW8RmeDVGESJtJatwbA_IH6PIXKE';
```

`sb_secret_...` や `service_role` は絶対に入れないでください。

## SupabaseでSQLを実行する方法

1. Supabaseのプロジェクトを開く
2. 左メニューの `SQL Editor` を開く
3. `New query` を押す
4. `supabase-schema.sql` の中身を全部貼る
5. `Run` を押す

## v11で追加されたテーブル

### availability_slots

メンバーごとの空き時間を保存します。

- `id`
- `group_id`
- `member_id`
- `date`
- `start_time`
- `end_time`
- `location`
- `memo`
- `created_at`
- `updated_at`

## RLSについて

RLSは有効化しています。ログインなしの少人数チーム利用を前提としているため、anonユーザーに select / insert / update / delete を許可しています。

4人程度のチーム内利用では操作しやすさを優先しています。厳密な本人確認が必要になった場合は、Supabase Authによるログインを追加してください。

## 使い方

1. アプリを開く
2. 自分の名前を追加、または一覧から選ぶ
3. 自分が空いている日付・開始時間・終了時間・場所を入力する
4. 複数の空き時間を何個でも追加する
5. 「集まりやすい日時の提案」に候補が表示される
6. よさそうな日時を「この時間で確定」する
7. 間違えた場合は「確定を外す」を押す

## 場所

- オンライン
- 大学
- どちらでも

`どちらでも` にしておくと、オンライン・大学の両方の提案に使われます。


## v15の変更

- 「日ごとの場所判断」セクションを削除しました。
- みんなの空き時間を、日付ごとに「田丸 18:00〜21:00、岩崎 19:00〜21:00」のように表示します。
- 同じ人が同じ日時・同じ場所で重複入力した場合は1つにまとめて表示します。
- 提案欄から場所比較の表示を減らし、日時候補を見やすくしました。


## v15 修正

- v14で週切り替えUIがHTMLから抜けており、読み込み途中で止まる問題を修正しました。
- `index.html` のCSS/JS読み込み番号を `v=15` に更新しました。
