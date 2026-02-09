#!/bin/bash
# 福楽キャッテリー — Cloudflare Workers 自動デプロイスクリプト
# 使い方: cd api && bash deploy.sh

set -e

echo ""
echo "🐾 福楽キャッテリー Workers デプロイ"
echo "======================================"
echo ""

# Step 1: Login check
echo "📌 Step 1: Cloudflare にログイン中..."
npx wrangler whoami 2>/dev/null || {
  echo "❌ Cloudflare にログインしていません。ログインしてください..."
  npx wrangler login
}
echo "✅ ログイン済み"
echo ""

# Step 2: Create R2 bucket
echo "📌 Step 2: R2 バケット作成..."
npx wrangler r2 bucket create fuluck-images 2>/dev/null && echo "✅ R2 バケット作成完了" || echo "ℹ️ R2 バケットは既に存在します"
echo ""

# Step 3: Create KV namespace
echo "📌 Step 3: KV Namespace 作成..."
KV_OUTPUT=$(npx wrangler kv namespace create DATA 2>&1)
echo "$KV_OUTPUT"

# Extract KV namespace ID
KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | grep -o '"[^"]*"' | tr -d '"')

if [ -n "$KV_ID" ]; then
  echo ""
  echo "✅ KV Namespace ID: $KV_ID"
  echo "📝 wrangler.toml を更新中..."

  # Update wrangler.toml with the real KV ID
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/YOUR_KV_NAMESPACE_ID_HERE/$KV_ID/" wrangler.toml
  else
    sed -i "s/YOUR_KV_NAMESPACE_ID_HERE/$KV_ID/" wrangler.toml
  fi
  echo "✅ wrangler.toml 更新完了"
else
  echo "ℹ️ KV Namespace は既に存在するか、IDの自動取得に失敗しました"
  echo "手動で wrangler.toml の YOUR_KV_NAMESPACE_ID_HERE を置き換えてください"
fi
echo ""

# Step 4: Deploy Worker
echo "📌 Step 4: Worker デプロイ中..."
npx wrangler deploy
echo ""
echo "✅ Worker デプロイ完了!"
echo ""

# Step 5: Set admin password
echo "📌 Step 5: 管理画面パスワード設定..."
echo "以下のコマンドで管理画面パスワードを設定してください:"
echo ""
echo "  npx wrangler secret put ADMIN_PASSWORD"
echo ""
echo "プロンプトが表示されたら、管理画面のパスワードを入力してください。"
echo ""
echo "======================================"
echo "🎉 デプロイ完了!"
echo ""
echo "Workers URL: https://fuluck-api.<your-subdomain>.workers.dev"
echo ""
echo "次のステップ:"
echo "  1. 上のコマンドでパスワードを設定"
echo "  2. Cloudflare Dashboard で api.fuluckpet.com のカスタムドメインを設定"
echo "======================================"
