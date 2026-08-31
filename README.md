# 少し昔の地図を見てみよう

## Webサイト
* https://armd-02.github.io/TimeMapTravel_Japan/

## 目的
* 過去のOpenStreetMap(日本)を閲覧するマップ
* 2010年から1～2年毎(+EXPO2025最終日)を閲覧可能
* 初期表示は2010年とし、当時からOpenStreetMapが育ってきた過程を年代順に確認可能

## 利用環境
* Webブラウザ(PC/タブレット)、スマートフォン対応

## ニュース表示
表示中の地図年に対応する月次ニュースJSONを読み込み、地図下部にニュースヘッドラインを表示します。

* ズームレベル9.5未満: 全国ニュースを表示
* ズームレベル9.5以上: 地図中央を都道府県境界で判定し、その都道府県のニュースを表示
* 前後ボタンによる切り替えと、一定時間ごとの自動切り替えに対応
* ニュース枠を左・上へドラッグ／スワイプすると次、右・下へ操作すると前のニュースへ切り替え
* 見出しをクリックすると、ニュースに対応するWikipedia記事を新しいタブで表示
* モバイルでは、画面幅を超える見出しを自動横スクロールでループ表示

ニュースのデータソースはWikidataです。画面上にも「News from Wikidata」へのリンクを表示します。

ニュースデータのファイル名を設定へ列挙する必要はありません。`sourceBaseUrl/index.json` の `months` を参照し、選択した地図年に対応する月が掲載されている場合だけニュースを表示します。別の年の地図へ切り替えた場合は、その年の掲載済みデータを一度だけ遅延読み込みします。

```text
{sourceBaseUrl}/index.json
{sourceBaseUrl}/YYYY-MM.json
```

### ニュース設定
`data/config-user.jsonc` の `news` で設定します。

```jsonc
"news": {
    "use": true,
    "sourceBaseUrl": "https://armd-01.sakura.ne.jp/timeline/data/",
    "prefectureFile": "./data/prefectures.min.geojson",
    "regionalMinZoom": 9.5,
    "nationalLimitPerMonth": 5,
    "displayDuration": 10000
}
```

* `use`: ニュース表示の有効・無効
* `sourceBaseUrl`: 月次ニュースJSONを配置しているディレクトリ
* `prefectureFile`: 都道府県判定に利用するGeoJSON
* `regionalMinZoom`: 全国ニュースから都道府県ニュースへ切り替えるズームレベル
* `nationalLimitPerMonth`: 1か月あたりに表示する全国ニュースの最大件数（`0`で全国ニュースを非表示）
* `displayDuration`: ニュース1件の表示時間（ミリ秒）

## 起動・地図表示

* 起動時は `image/splash.png` を表示し、初期化が早く完了しても最低2秒間表示します
* PC（画面幅768px以上）ではスプラッシュカードを最大640px幅、モバイルでは最大420px幅で表示します
* 地図切り替え時のタイトルは、MapLibreの `idle` を待って地図が落ち着いた後に表示します
* `baselist` の背景画像は `data/config-user.jsonc` の `listTable.backgroundImage` で指定します

```jsonc
"listTable": {
    "backgroundImage": "./image/bgimage.png"
}
```

## ライセンス
* HTML/CSS/JavaScript/JSON : MIT License
* PMtiles : ODbL（ダウンロードしてご自由にお使いください）

## PMTilesの保存場所(ファイル名の数字は年月日)
* 地図APIに頼らず、自分のサーバーで日本地図を表示する。
  https://armd-01.sakura.ne.jp/tiles/
* https://armd-01.sakura.ne.jp/tiles/japan-20100106.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20120104.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20140101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20160101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20180101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20200101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20220101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20230101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20240101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20250101.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20251013.pmtiles
* https://armd-01.sakura.ne.jp/tiles/japan-20260101.pmtiles

## 主な更新履歴
* 2024/05/18 初版公開
* 2024/05/15 2018年、2020年の地図を追加(Sakura Internetにpmtilesを配置)
* 2024/06/23 関西から日本へ変更。レンダラー調整など
* 2024/07/16 Maplibreを4.5へ更新。空を表示させる（最大Pitch80度）
             合わせて、2023年と2024年の地図も追加
* 2026/03/11 クロールされるとタイトルに英語名が返されるので日本語へ設定
* 2026/04/19 2025年、2026年のPMTilesを追加
* 2026/08/30 地図年・ズーム・都道府県に対応した全国／地域ニュース表示を追加
* 2026/08/30 初期年代を2010年に設定し、1日1回の案内バナーを追加
* 2026/08/31 ニュースのドラッグ／スワイプ切り替えとWikipedia記事リンクを追加
* 2026/08/31 起動スプラッシュ、地図タイトル表示タイミング、baselist背景表示を調整
