# AI書記 セットアップ

## API未接続のまま使う

設定は不要です。`index.html`を開くと、既存のlocalStorageデータを使ったローカル提案が表示されます。現在の版は`aiSecretary.js`の`LOCAL_ONLY`が有効なため、ボタンを押しても外部APIへ通信せず、料金は発生しません。

ローカル提案は以下を点数化します。

- 締切の近さ
- タスクの重要度と今日指定
- 直近7日で不足しているカテゴリ
- 今使える時間とタスクの予想時間
- 元気・普通・疲れたの状態
- 直前と同じカテゴリへの偏り
- 過去の「採用・後回し・微妙」評価

追加設定は既存データと分けて保存します。

- `ai_secretary_preferences_v1`: 体力・使える時間
- `ai_secretary_task_meta_v1`: 予想時間・難しさ・必要体力・次の一手
- `ai_secretary_feedback_v1`: 提案評価と補正値
- `ai_secretary_advice_v2`: 最後に表示した提案

既存の`focus_dashboard_v1`は読み取るだけで、AI書記から構造を変更しません。

## Supabase Edge Functionを公開する

Supabase CLIでログインし、このフォルダをプロジェクトとして開いて実行します。

```bash
supabase login
supabase link --project-ref あなたのPROJECT_REF
supabase functions deploy ai-secretary
```

OpenAI APIキーと使用モデルはSupabase側のSecretに保存します。

```bash
supabase secrets set OPENAI_API_KEY=あなたのOpenAI_APIキー
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

ブラウザのJavaScriptへOpenAI APIキーを書かないでください。Supabaseのanon keyは公開クライアント用ですが、OpenAI APIキーは必ずEdge Functionだけで使います。

## フロントエンド設定

現在の`index.html`にある既存の`SUPABASE_URL`と`SUPABASE_KEY`をAI書記も利用します。別プロジェクトを使う場合だけ、`index.html`の既存Supabase設定を変更してください。

## API接続版へ戻す場合

OpenAI APIは別料金です。利用する場合だけ、`aiSecretary.js`冒頭の`LOCAL_ONLY`を`false`へ変更し、以下の設定を行います。

## 動作

- 初回表示: ローカル提案を表示
- ボタン操作: ローカルで即時に再計算
- `LOCAL_ONLY`が`false`の場合のみEdge Functionを呼び、失敗時はローカル提案へ復帰
- 最後の提案: `ai_secretary_advice_v2`へ保存
- 体力・使える時間: `ai_secretary_preferences_v1`へ保存
- 「この提案で開始」は確認後に既存タスクを選択し、既存タイマーを起動
- 既存データ: `focus_dashboard_v1`を読み取るだけで変更しない

## 今後の拡張

- ユーザー認証とユーザー別レート制限
- 1日あたりのAPI回数上限
- 週次レポートの保存
- 時間帯別の採用傾向
