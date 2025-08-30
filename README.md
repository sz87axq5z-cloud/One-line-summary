# 1行要約 (Next.js 14 + TypeScript)

URLを入力すると、サーバ側で本文抽出し、Gemini (gemini-1.5-flash, REST v1beta) に投げて日本語で1行要約(最大80文字)を返す最小構成アプリ。

## セットアップ
1. リポジトリ取得後、依存関係をインストール:
   ```bash
   npm i
   ```
2. 環境変数ファイルを作成:
   ```bash
   cp .env.local.sample .env.local
   # .env.local を開き、あなたの Google API Key を設定
   # GOOGLE_API_KEY=xxxx
   ```

## 実行
- 開発サーバ起動:
  ```bash
  npm run dev
  ```
  ブラウザで http://localhost:3000 を開き、URLを入力→「要約する」。

- 本番ビルドと起動:
  ```bash
  npm run build
  npm start
  ```

## API 仕様
- エンドポイント: `POST /api/summarize`
- リクエスト(JSON):
  ```json
  { "url": "https://example.com/article" }
  ```
- レスポンス(JSON 成功):
  ```json
  { "summary": "...80文字以内の一文..." }
  ```
- エラー例(JSON):
  ```json
  { "error": "エラーメッセージ" }
  ```

## curl 例
```bash
curl -sS http://localhost:3000/api/summarize \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}' | jq .
```

## 制約と仕様(抜粋)
- 要約は日本語・一文のみ・80文字以内。URL/絵文字/ハッシュタグ禁止。
- 取得タイムアウト合計15秒目安(フェッチ10秒, LLM 5秒)。
- リダイレクト最大5回。本文抽出が200文字未満なら 422。
- 入力URL: http(s)のみ/前後空白除去/最大2048文字。

## 既知の課題
- 動的/AMP/JS描画専用ページでは本文抽出が不十分な場合があります。
- PDF/ログイン必須/無情報ページは 422 で失敗します。
- Geminiの応答検証はヒューリスティックです。

## ディレクトリ
- `app/page.tsx`: フロント(1ページ)
- `app/api/summarize/route.ts`: API 本体
- `lib/extract.ts`: URL検証/本文抽出
- `lib/gemini.ts`: Gemini呼び出し

## テストケース
以下は手動確認用の観点です。

### 正常系
- ニュース記事: 一般的なニュースURLで一文かつ80文字以内の要約が返る
- ブログ記事: 技術ブログ等で日本語要約が返る
- 企業プレス: プレスリリースで具体名を含む要約が返る
- 英語記事: 出力は必ず日本語になる

### 異常系
- リダイレクトループ/多重: 5回超で 422
- 非httpスキーム: 400
- 短文LP/情報が薄い: 本文<200文字で 422
- ログイン必須ページ: 422
- PDF/バイナリ: 422
- 404: 422

### 回帰観点
- 80文字超の際に句読点で短縮、なければ安全切り詰め
- 一文検証で複文が弾かれる(必要時1回再プロンプト)
- 出力は常に日本語でURL/絵文字/ハッシュタグなし
