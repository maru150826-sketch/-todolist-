# Supabase認証・RLS設定

1. SupabaseのSQL Editorで `supabase/migrations/202607110001_auth_rls.sql` を実行します。
2. Authentication → Providers → Email を有効にします。
3. Authentication → URL Configuration の Site URL に公開URLを登録します。
4. Redirect URLs に同じ公開URL（開発時はローカルURLも）を追加します。
5. アプリ上部にメールアドレスを入力し、「ログインリンク送信」を押します。

未ログイン時は端末のlocalStorageだけに保存されます。ログイン後は、認証ユーザー本人のタスク・履歴・長期目標・週次目標だけがRLS経由で同期されます。

以前の `default-user` 形式の共有データは、新しい認証ユーザーから見えません。移行が必要な場合は、対象ユーザーのUUIDを確認してから管理者権限で `user_id` を置換してください。
