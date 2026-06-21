# 公認会計士 復習スケジュール

エビングハウス忘却曲線に基づく復習管理アプリ（静的サイト版）

## 機能

- **登録**: 科目・論点・受講日
- **自動スケジュール**: 受講日から 1, 3, 7, 14, 30, 60, 90 日後に復習を生成
- **今日やること**: 当日の復習を ○ △ ✕ で記録
- **忘却曲線グラフ**: 論点ごとの記憶保持率
- **復習履歴の後付け登録**: 登録済み講義編集から追加可能

## 公開URL（GitHub Pages）

リポジトリを GitHub に push し、Pages を有効化すると次の URL で公開されます。

`https://<ユーザー名>.github.io/cpa-review-schedule/`

## スマホ（iPhone Safari）での使い方

1. 上記 URL を Safari で開く
2. 共有ボタン → **ホーム画面に追加**
3. ホーム画面のアイコンから起動（アプリのように全画面表示）

## データ保存

ブラウザの **localStorage** に保存されます。データは端末・ブラウザごとに独立しており、サーバーには送信されません。

## ローカルで確認

```bash
cd cpa-review-schedule
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開く

## 技術構成

- HTML / CSS / JavaScript（ビルド不要）
- Chart.js（CDN）
- GitHub Pages（無料ホスティング）

## GitHub Pages の有効化

1. GitHub にリポジトリ `cpa-review-schedule` を作成
2. このフォルダを push
3. リポジトリの **Settings → Pages**
4. **Source**: GitHub Actions
5. `main` ブランチへ push すると自動デプロイ
