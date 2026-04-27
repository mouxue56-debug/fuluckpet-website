# AI チャット知識ベース セットアップ

`fuluckpet.com` の AI チャットウィジェット（ふくにゃん）は、毎ターン KV から関連知識を検索して system prompt に注入する **RAG（Retrieval-Augmented Generation）方式** で動作しています。
これにより、価格・子猫情報・キャッテリーの事実は必ず公式データから引用され、AI が捏造することはありません。

## 1. 静的サイトコピーを KV に投入（初回のみ）

サイベリアン紹介・受賞歴・見学案内など、HTML 由来の静的コピーは Cloudflare KV に **`kb:*` 接頭辞**で保存します。

```bash
cd ~/projects/fuluckpet-website

# シードコマンドを生成
node tools/seed-kb.js > /tmp/seed.sh

# 確認（任意）
cat /tmp/seed.sh

# api/ で wrangler を実行（DATA バインディングを使用）
cd api
bash /tmp/seed.sh
```

サニティチェック（投入は行わずサイズだけ確認）:

```bash
node tools/seed-kb.js --check
```

投入される 7 つのチャンク:

- `kb:siberian` — サイベリアン猫種の特徴・低アレルゲン情報
- `kb:about` — キャッテリー紹介・受賞歴・代表者
- `kb:visit` — 見学予約・配送方法
- `kb:pricing` — 価格帯（¥160k〜¥290k 税込）
- `kb:health` — 遺伝子検査・ワクチン
- `kb:aftercare` — お迎え後 LINE サポート
- `kb:legal` — 動物取扱業登録番号

## 2. 動的データ（kittens / parents / faq / reviews）

すでに admin で更新するたびに KV に保存されています。`retrieveKnowledge()` は毎リクエストで最新を読み込むので追加作業は不要です。

| キー | データ | 更新場所 |
|---|---|---|
| `kittens` | 子猫一覧 JSON | admin パネル |
| `parents` | 親猫一覧 JSON | admin パネル |
| `faq` | FAQ Q&A JSON | admin パネル |
| `reviews` | お客様の声 JSON | admin パネル |

## 3. 動作確認

worker をデプロイした後、ウィジェットで以下を質問:

| 質問 | 期待動作 |
|---|---|
| `価格はいくら？` | `kb:pricing` を参照して 16〜29 万円帯を回答、詳細は LINE 誘導 |
| `サイベリアンの特徴は？` | `kb:siberian` から特徴を引用 |
| `ワクチンは？` | `kb:health` の遺伝子検査・ワクチン情報を引用 |
| `見学したい` | `kb:visit` から予約フローを案内 |
| `ペルシャ猫はいますか？` | 知識ベースに無いので「LINE で正確にお答えします」と誘導 |

`💬 新しい会話` で送信した内容は Telegram にも転送され、回答が知識ベースに沿っていることを owner 側で確認できます。

## 4. 知識ベースの更新

| 変更内容 | 操作 |
|---|---|
| 子猫追加 / 状態変更 | admin で更新（自動反映） |
| FAQ 追加・編集 | admin で更新（自動反映） |
| お客様の声追加 | admin で更新（自動反映） |
| 静的コピー（siberian / about / pricing 等）変更 | `tools/seed-kb.js` 内のチャンクを編集 → `node tools/seed-kb.js > /tmp/seed.sh && cd api && bash /tmp/seed.sh` |

静的コピーを HTML 大幅改稿後に再生成する場合は、`tools/seed-kb.js` 上部のコメントに沿って Kimi（`KIMI_API_KEY` を `.env` から読み込み）でクリーンアップしてからチャンクを差し替えてください。

## 5. 仕組みの概要

`api/worker.js`:

- `retrieveKnowledge(env, query)` — トークン化したユーザー発話で KV を全走査、ヒット数で並び替え、上位 8 チャンク（各 ≤600 字）を `\n\n---\n\n` で連結
- `/api/chat` ハンドラ — 取得したチャンクを **「知識ベース」セクション + 厳守ルール**として system prompt 末尾に追加
- LLM プロバイダチェーン（Kimi → MiniMax → Infi → DashScope → Gemini）はそのまま、grounding は前段で完了

レビューは `query` に「レビュー / 口コミ / 評判 / お客様 / 声」が含まれる時だけ検索対象に入ります（無関係な文脈を汚染しないため）。
