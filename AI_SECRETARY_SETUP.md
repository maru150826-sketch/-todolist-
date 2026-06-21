# AI書記 セットアップ

## API未接続のまま使う

設定は不要です。`index.html`を開くと、既存のlocalStorageデータを使ったローカル提案が表示されます。

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

## 動作

- 初回表示: APIを呼ばず、ローカル提案を表示
- ボタン操作: Edge Functionを1回だけ呼ぶ
- API未設定、通信失敗、JSON不正: ローカル提案へ自動復帰
- 最後の提案: `ai_secretary_advice_v2`へ保存
- 体力設定: `ai_secretary_preferences_v1`へ保存
- 「この提案で開始」は確認後に既存タスクを選択し、既存タイマーを起動
- 既存データ: `focus_dashboard_v1`を読み取るだけで変更しない

## 今後の拡張

- ユーザー認証とユーザー別レート制限
- 1日あたりのAPI回数上限
- 提案からタスクを選択状態にする確認ボタン
- 疲労度の手動入力
- 週次レポートの保存
- AI提案の評価ボタン
