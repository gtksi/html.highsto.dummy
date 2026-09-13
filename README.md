# Hi!story 代理カードメモ ジェネレーター

カードを検索して枚数を指定し、スリーブに挟む代理カードメモをA4印刷用PDFとして
ブラウザ上で直接生成・ダウンロードできる静的サイトです。サーバー処理は一切なく、
GitHub Pagesでそのままホストできます。

## フォルダー構成

```
highsto-proxy-app/
├── .github/workflows/deploy.yml   # push時に自動でGitHub Pagesへデプロイ
├── data/cards.json                # カードDB本体（更新時はこのファイルを差し替え）
├── index.html
├── style.css
├── script.js
└── README.md
```

## セットアップ手順（初回のみ）

1. このフォルダの中身をGitHubリポジトリのルートにpush（`main`ブランチ）。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を
   **「GitHub Actions」** に設定（これは一度だけ手動で必要です）。
3. 上記設定後は、`main`への push（`data/cards.json`の更新も含む）のたびに
   `.github/workflows/deploy.yml` が自動実行され、
   `https://<ユーザー名>.github.io/<リポジトリ名>/` に反映されます。

## カードDBの更新方法

`data/cards.json` を新しいデータで上書きしてpushするだけです。
ビルド工程がないため、他のファイルを触る必要はありません。

## ローカルで試す場合

`index.html` を直接ブラウザで開くと `fetch("data/cards.json")` が
`file://` 制限に引っかかって失敗することがあります。ローカルで確認する場合は
簡易サーバーを使ってください。

```bash
npx serve .
# または
python3 -m http.server 8000
```

## 印刷レイアウトの仕様

- カードサイズ：63×88mm（一般的なトレーディングカードと同寸）
- 各カードの印刷内容は上下左右2mmずつ縮小して配置（黒枠＝実際の切り取り線）
- A4用紙1枚あたり3×3＝最大9枚まで自動配置、超過分は次ページへ
