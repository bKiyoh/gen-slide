# Phase 0 実装・検証記録

確認日: 2026-11-18。Phase 1 以降は実装していません。

## 実装機能

- Vue 3 / Vite / JavaScript の最小構成。
- 赤い長方形、青い平行四辺形を同時に描画。
- 幅・高さ・平行四辺形の傾斜・中心座標・回転・色・不透明度の即時変更。
- 数値パラメーターはスライダーで調整し、併設した数値入力で細かい値を指定できる。
- 初期値へのリセット、描画コンポーネントの停止・再開。
- 1920×1080 の論理座標を維持した等比フィット。余白は濃いグレー。
- 初期化完了後の実バックエンド表示、フォールバックの説明、失敗時のエラー表示。
- 無効入力時は最後の正常な描画を維持。
- アンマウント時の監視解除と GPU リソース解放。初期化中のアンマウントにも対応。

## 追加ファイル

| ファイル | 責務 |
|---|---|
| `.gitignore` | 依存・ビルド出力等を Git 対象外にする |
| `package.json`, `package-lock.json` | 依存バージョン・実行コマンドを固定 |
| `index.html`, `vite.config.js`, `src/main.js` | Vite と Vue の起動 |
| `src/App.vue` | サンプルデータ、入力 UI、検証、最後の正常値の保持 |
| `src/components/ShapePreview.vue` | Canvas コンテナ、Vue ライフサイクル、状態表示 |
| `src/style.css` | サンプル画面と狭い画面への対応 |
| `src/domain/shapes.js` | プレーンな図形データ、単位・入力範囲、検証 |
| `src/domain/shapeGeometry.js` | 描画ライブラリに依存しない頂点・三角形計算 |
| `src/renderer/fitCanvas.js` | コンテナに収める等比スケール計算 |
| `src/renderer/three/geometryFactory.js` | BufferGeometry の生成と既存バッファの更新 |
| `src/renderer/three/createShapeRenderer.js` | Scene / Camera / Renderer、更新・リサイズ・破棄 |
| `tests/shapeGeometry.test.js` | 長方形、傾斜、中心、面積、不正値、再現性 |
| `tests/shapes.test.js` | サンプルデータ、JSON 往復、入力境界 |
| `tests/fitCanvas.test.js` | 横長・縦長・非表示コンテナの等比フィット |
| `tests/geometryFactory.test.js` | 実際の Three.js の頂点バッファの再利用と境界更新 |
| `README.md`, `docs/phases/phase-0-result.md` | 起動案内、設計判断、検証記録 |

既存の設計書・仕様書・Phase 指示書は変更していません。

## 描画の流れと責務

1. **Vue で入力する**: 図形は `geometry` / `style` / `transform` の通常の JavaScript データ。検証が通ったデータだけを描画側へ渡す。Scene や Material を Vue のリアクティブな状態に入れない。
2. **四角形を計算する**: 幅・高さ・傾斜から中心基準の4頂点を計算する。頂点を結ぶ順番 `[0, 1, 2, 0, 2, 3]` により、四角形を2枚の三角形に分ける。GPU はこの三角形を塗りつぶす。
3. **GPU に渡すデータを作る**: GeometryFactory が頂点を `BufferGeometry` に格納する。入力変更では同じ頂点バッファを書き換え、色と不透明度は同じ Material を更新する。
4. **Scene に置く**: Geometry（形）と Material（塗り）を Mesh にまとめ、中心回りの回転後に中心座標へ移動する。2つの Mesh を Scene（描画対象の入れ物）に置く。
5. **Camera を通して Canvas に描く**: OrthographicCamera は遠近による縮小をせず、左上 `(0, 0)`・右下 `(1920, 1080)` を映す。`await renderer.init()` の後でのみ描画する。Renderer が GPU に三角形の描画を指示し、結果が Canvas に現れる。
6. **サイズ変更に追従する**: コンテナに収まる倍率を計算して Canvas の表示サイズを更新する。Camera の論理座標は変えない。余白はコンテナの背景として残す。
7. **後始末する**: Vue の `onUnmounted` から `dispose()` を呼ぶ。ResizeObserver と resize リスナー、Canvas を外し、Geometry / Material / Renderer を解放する。Renderer の非同期 `dispose()` が Three.js 内部の RAF とバックエンドを解放する。初期化が終わる前なら完了を待ってから解放する。

アプリ独自のアニメーションや常時再描画は設けず、入力・リサイズ時に描画する。Three.js r187 自体は `render()` で内部 RAF を開始するため、停止時には Renderer の破棄も必要になる。

## 幾何と入力の定義

- 図形の `x`, `y` は中心位置。幅・高さ・位置は論理 px、回転・傾斜は度。
- 平行四辺形のずれは `shift = height * tan(skewX * π / 180)`。
- 上辺を `+shift / 2`、下辺を `-shift / 2` ずらすので、傾斜変更でも中心を保つ。
- ローカルの4頂点は左上から順に `(-w/2+s/2, -h/2)`, `(w/2+s/2, -h/2)`, `(w/2-s/2, h/2)`, `(-w/2-s/2, h/2)`。
- 適用順は **傾斜したローカル形状 → 中心回りの回転 → 中心座標への移動**。Y下向きなので正の回転は画面上で時計回り。
- 幅 `0〜7680`、高さ `0〜4320`、傾斜 `-80〜80°`、X `-19200〜19200`、Y `-10800〜10800`、回転 `-360〜360°`、不透明度 `0〜1`。Phase 0 の安全な入力範囲であり、最終的な製品仕様の上限ではない。
- 幅・高さ0は面積0として受け入れる。負数、空欄、NaN、Infinity、過度な傾斜は拒否する。色は6桁の `#RRGGBB`。
- Canvas の CSS サイズと GPU の画素数を分ける。実際の devicePixelRatio を使用し、GPU メモリー節約のため最大2に制限する。
- 2D の表示順は配列順。全 Material を透過対応にし、深度テストと深度書き込みを無効化する。Y反転による面の向きの影響を避けるため両面描画を使用する。

## Three.js の API 確認

依存は Three.js **0.187.0 (r187)**、Vue **3.5.45**、Vite **8.3.8**、Vue plugin **6.0.11** に固定。

非同期初期化と WebGL 2 フォールバックは [公式 WebGPURenderer マニュアル](https://threejs.org/manual/pages/webgpurenderer) を参照。インストール済み r187 の JSDoc / 実装と、同バージョンの公式ソースを照合した。

- [WebGPURenderer r187](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgpu/WebGPURenderer.js): `three/webgpu`、WebGPU 優先と自動フォールバック。
- [Renderer r187](https://github.com/mrdoob/three.js/blob/r187/src/renderers/common/Renderer.js): `init()`, `initialized`, `render()`, `setPixelRatio()`, `setSize()`, 非同期 `dispose()`, `onDeviceLost`, `onError`。
- [WebGPUBackend r187](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgpu/WebGPUBackend.js) / [WebGLBackend r187](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl-fallback/WebGLBackend.js): `isWebGPUBackend` / `isWebGLBackend` の識別フラグ。

`isWebGPURenderer` はレンダラーの種類であり、実際のバックエンドを示さないため判定に使わない。`init()` 完了後の `renderer.backend` を確認する。既知のフラグがなければ「判定不能」と理由を表示する。

r187 の `Renderer.dispose()` は内部で `init()` を待つため、初期化自体が失敗した場合はそのまま呼んでも失敗する。部分初期化で確保済みの device / GL context がある場合はバックエンドの `dispose()` を呼び、Canvas と参照を外す。Three.js 更新時にはこの挙動と識別フラグを再確認すること。

## 起動・手動確認

すべてのコマンドの実行場所: **リポジトリのルート**。

```sh
npm ci
npm run dev
```

1. ターミナルの URL を開き、赤い長方形と青い平行四辺形、バックエンド表示を確認する。
2. 長方形の幅・高さ、平行四辺形の幅・高さ・傾斜を変更して即時更新を確認する。負の傾斜でも中心は変わらない。
3. X / Y / 回転 / 色 / 不透明度を変更する。不透明度0で図形は消える。
4. 幅に負数・空欄、傾斜に89、色に不正文字列を入力する。エラーが表示され、正常な時点の描画が残ることを確認し、有効値に戻す。
5. ブラウザを横長・縦長にリサイズする。図形の比率と位置関係が変わらず、余白が上下または左右に出ることを確認する。
6. 「プレビューを停止」→「プレビューを開始」を繰り返す。Canvas が消え、再初期化後に同じ図形が出ることを確認する。
7. WebGPU 非対応環境では WebGL2 とフォールバックの説明を確認する。両方利用できない場合は初期化エラーを確認する。

テスト・本番ビルド・本番ビルドのローカル確認もルートで実行する。

```sh
npm test
npm run build
npm run preview
```

## 実行結果

- Node.js **26.13.1** / npm **11.20.0** で `npm install` と依存解決に成功。
- `npm test`: **18件成功、0件失敗**。
- `npm run build`: **成功**。Three.js を含む JS が約888 kB（gzip 約250 kB）となり、500 kB 超のチャンク警告あり。
- `npm run preview`: **成功**。本番ビルドを Chrome で開き、WebGPU 描画、幅800・傾斜-30°への入力変更、エラー表示なしを確認。
- 既存の Lint 設定はなく、Lint は未実行。
- ローカル開発サーバーを Chrome **158.0.8127.36** / headless / DPR 2 で検証。Playwright と PNG ピクセル検査は環境内の既存ツールを使用し、プロジェクトの依存には追加していない。

| ブラウザ確認項目 | 結果 |
|---|---|
| 実 WebGPU バックエンドで赤・青の塗りを描画 | 成功。スクリーンショットとピクセル位置・面積で確認 |
| 幅・高さ・傾斜の変更 | 成功。変更後の描画範囲を論理座標へ換算して確認 |
| 中心座標・回転・色・不透明度0 / 0.5 / 1 | 成功 |
| 負の幅・空欄・89°傾斜・不正色 | 成功。エラー表示と直前の正常画像のピクセル一致を確認 |
| 幅390 / 1000 px へのリサイズ | 成功。16:9維持、中心・幅の論理値維持、横スクロールなし |
| Vue アンマウント・再マウントを3回 | 成功。各回で Geometry / Material / Renderer / GPUDevice の破棄を確認 |
| 停止後の RAF / ResizeObserver / resize リスナー | 各回で0を確認 |
| WebGPU を無効化した自動 WebGL2 フォールバック | 成功。実描画と明示表示、破棄を確認 |
| WebGPU / WebGL2 の両方を利用不可にした初期化 | 成功。エラー表示、アンマウント時の例外なし |
| 実 WebGPU adapter 要求を保留中にアンマウント | 成功。要求の解決後に Renderer / GPUDevice を解放し、Canvas・RAF・監視は残らない |
| 検証中のページ例外・console error | 0件 |

フォールバックと非対応環境は、テストブラウザで GPU API を意図的に利用不能にして検証した。異なる実機 GPU / OS の網羅試験を行ったものではない。

## 受け入れチェックリスト

- [x] Vue 上に Three.js の描画領域。
- [x] 赤い長方形と青い平行四辺形。
- [x] 幅・高さ・傾斜変更で再描画。
- [x] 位置・回転・色・不透明度をデータとして保持・編集。
- [x] 16:9 の論理座標を保ってリサイズ。
- [x] 使用中の描画バックエンドとフォールバックを表示。
- [x] 初期化失敗時の情報を表示。
- [x] Vue アンマウント、初期化途中のアンマウントで後始末。
- [x] ビルド・テストを実行して結果を記録。
- [x] Phase 1 以降の機能を実装していない。

## 制約・未検証・Phase 1 への引き継ぎ

- Safari / Firefox、および別の GPU 実機では未検証。実行中の物理的な GPU デバイスロストも未検証。通知ハンドラーとエラー表示は実装済み。
- 本番ビルドでも描画・基本入力を確認したが、解放処理の計測とフォールバックの詳細試験は開発サーバーで実施。
- 入力値・色は検証用の限定範囲。保存、アニメーション、スライド、ShapeGroup 等は未実装。
- 大きな JS チャンクは Three.js 描画機能を含めた結果。Phase 0 では分割のための複雑な構成は追加しない。
- `npm audit` は開発用 Vite の間接依存 `picomatch <=4.0.7` 由来の high を4件報告する。確認時の `npm view picomatch version` は4.0.7。破壊的な `npm audit fix --force` は実行していない。修正版の公開後に lockfile とビルドを再確認する。
- Phase 1 はプレーンなデータと純粋な頂点計算を起点に拡張できる。バックエンド識別と失敗時の破棄は Three.js の固定バージョンに依存するため、更新時に実機確認を行う。

## レビュー対応: スライダー入力

`src/App.vue`、`src/style.css`、`README.md` と本記録を更新。幅・高さ・位置・傾斜・回転・不透明度にスライダーを追加し、数値入力と双方向に連動させた。色は HEX 入力を継続する。

幅・高さ・位置は普段使う論理キャンバスの範囲を基本にし、数値入力で範囲外の有効値を指定するとその値までスライダーを拡張する。入力値の検証と GPU 描画への受け渡しは従来の処理を使う。描画更新はスライダー操作中も即時に行う。

リポジトリルートで `npm test`（18件成功）と `npm run build`（成功、既存のチャンクサイズ警告あり）を実行。Chrome の実ドラッグで数値と描画画像の変化を確認し、キーボード操作、負の傾斜、不透明度0 / 0.01、数値入力からの範囲拡張、不正入力からの復帰、初期値へのリセット、1440 / 390 px 幅での表示を検証した。ページ例外は0件。
