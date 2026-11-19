# Phase 2 実装・検証記録

確認日: 2026-11-19。Phase 1を `e5e522d` にコミットした後、Phase 2のみ実装しました。Phase 3以降には進んでいません。

## 実装機能

- 指定時刻から決定論的に描画状態を返す `evaluateTransition(transition, timeMs)`。
- キーフレームの数値補間、4種類のEasing、端点の保持、キーの非破壊ソートと検証。
- 単体Shape、Group / Child / Individualの評価とproperty単位の優先順位。
- ChildのみへのStagger。静的Overridesをアニメーションのベースに使用。
- ローカル状態の評価後に親変換を一度だけ合成。0倍率・負倍率にも対応。
- 10個の平行四辺形によるデモ、時刻・Staggerのスライダーと数値入力、評価結果の表示。
- Phase 1 / Phase 0サンプルへの切り替えを維持。

## 追加・変更ファイル

| ファイル | 内容 |
|---|---|
| `src/domain/transition/animation/easing.js` | Linear / Cubicの純粋な補間関数 |
| `src/domain/transition/animation/tracks.js` | 対応プロパティ、Track検証・整列・補間、ベースへの適用 |
| `src/domain/transition/evaluateTransition.js` | 時刻制限、3階層の評価、Stagger、親変換との合成 |
| `src/domain/transition/resolveStaticShapes.js` | 親合成前の `resolveLocalShapes` を切り出し、静的APIを維持 |
| `src/domain/transition/sampleAnimatedTransition.js` | Phase 1サンプルから作るアニメーションデータ |
| `src/components/PhaseTwoSample.vue` | 時刻指定・Stagger確認・最後の正常値保持・評価結果表 |
| `src/App.vue` | Phase 2を初期表示にし、過去サンプルへの切り替えを維持 |
| `tests/animation.test.js` | Easing / Track / 優先順位 / Stagger / 変換 / 検証 / 決定論のテスト |
| `tests/shapeMeshes.test.js` | 時刻変更でのMesh / Geometry / Material再利用と停止時の解放 |
| `README.md`, `docs/phases/phase-2-result.md` | 操作案内、API契約、検証結果と引き継ぎ |

依存関係・lockfile、Renderer、合意済み設計書・Phase指示書は変更していません。

## 評価APIと処理フロー

| API | 出力・用途 |
|---|---|
| `resolveLocalShapes(transition)` | Generator → Modifier → Overrides後のローカルな静的状態。親変換・Animationなし |
| `resolveStaticShapes(transition)` | Phase 1互換の静的状態。worldMatrixに静的な親変換を合成 |
| `evaluateTransition(transition, timeMs)` | Animation後のローカル値と、親変換を合成したworldMatrixを含む描画状態 |
| `evaluateTrack(track, timeMs)` | 単独Trackの検証・整列・補間。キー0件ならundefined |

返却形式は `{ shapes: [...] }`。Groupの子には `groupId`, `itemId`, `index` があり、IDは引き続き `group-001/item-002`、Overrideキーは `item-002` です。配列順・IDは時刻によって変わりません。

```text
Transition + timeMs
  → 0〜durationMsに時刻を制限
  → Template → Generator → Modifier → 静的Overrides
  → Shape、またはChild / Individualをproperty単位で評価
  → Group Trackを評価した親Transformと合成
  → { shapes: [..., transform（ローカル値）, worldMatrix（最終描画値）] }
  → 既存Renderer
```

Domain / EvaluatorはVue・Three.js・DOM APIをimportせず、入力を書き換えません。時間の積分や前フレームへの依存もなく、RAFは持ちません。毎回データと指定時刻から計算します。

## KeyframeとEasingの契約

- Shape / Child / Individualの対象は `transform.x/y`, `transform.rotation`, `transform.scaleX/scaleY`, `style.opacity`, `geometry.skewX`。
- Groupの対象は `transform.x/y`, `transform.rotation`, `transform.scaleX/scaleY`。Groupのstyle / geometryへのTrackは拒否します。
- 値は数値のみ。色・幅・高さの補間は今回の対象外です。
- 未整列のキーは複製して昇順化します。入力配列は並べ替えません。重複時刻はエラーです。
- 同一階層内で同じpropertyのTrackを複数指定するとエラーです。ChildとIndividualで同じpropertyを指定することはできます。
- キー0件は無変化。1件はその値を固定適用。最初のキーより前・最後のキーより後はそれぞれ端点の値を保持します。
- 空キーのIndividualはChildを隠しません。
- 開始側キーのEasingを次のキーまでの区間に適用します。省略時はlinearです。最後のキーに記載されたEasingも型・対応名を検証します。
- Easingは `linear`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`。回転も数値として補間し、最短角への折り返しは行いません。
- キー時刻は非負の有限値。durationMsを超えるキーは保持し、全体時刻が到達できる範囲で補間します。

`offset` は常に**静的なベース値への加算差分**です。scaleも同じです。base scale=1でoffset=0なら1、offset=-1なら0になります。未指定のbase scaleは1です。

`absolute` は**対象レイヤーのローカル値を置き換えます**。親がある子の画面上の最終座標ではありません。UIでの最終表示値との相互変換はPhase 3以降の編集側の責務です。

## Staggerと3階層の合成

Childのローカル時刻は `timeMs - index * staggerMs`。負になっても先頭キーの値を保持し、開始キーは待機中の状態を表します。Staggerは非負の有限値で、子数との積も有限であることを確認します。

IndividualはTransition全体の時刻を使用します。同じpropertyならIndividualの評価値を選んでからベースへ一度だけ適用します。Childを適用した値へIndividualのoffsetをさらに加算する処理ではありません。

例: 静的rotation=10、Childのoffset=4、Individualのoffset=100なら、rotationは110です。別propertyのChildのX移動は維持します。

Groupも全体時刻で評価します。子のローカルな変化を確定した後、Groupのtransform + tracksによる親変換を合成します。IndividualやGroupにStaggerを重ねて適用しません。

## 座標・ピボット・変換の定義

Phase 1の数学的定義を継続しています。

- 論理座標は1920×1080、左上原点、X右・Y下。位置・サイズは論理px、角度は度です。
- 各図形のピボットは中心。傾斜したローカル形状へ、scale → 時計回りrotation → translationを適用します。
- Groupはローカル原点 `(0, 0)` を基準とし、子変換後に親のscale → rotation → translationを適用します。
- 親の平行移動は親の `(x, y)` が画面上のGroup基準点になるように作用します。子の配置の平均やバウンディングボックス中心を自動ピボットにしません。
- `composeShapeMatrix(localTransform, parentTransform)` は親×子の行列を計算します。非一様scaleと子rotationで生じるせん断も保持します。
- `[a,b,c,d,tx,ty]` は `x'=a*x+c*y+tx`, `y'=b*x+d*y+ty`。
- `transform` はローカル値を保持し、`worldMatrix` が最終描画変換です。Rendererは後者を一度だけ適用します。

具体例: 子中心 `(200,380)`、親scale `(2,3)`、rotation `90°`、translation `(100,200)` なら、中心は `(-1040,600)` です。子自身の回転は中心位置を変えず、形状の向きに作用します。テストで非一様scaleを含む行列全体を確認しています。

0倍率・負倍率は安全な描画状態として扱います。逆変換機能は追加していません。将来の編集UIは行列の行列式が0になる状態を検出して逆変換を制限する必要があります。

## 入力検証と制約

- 全体timeMsは有限値のみ。負値を0、終了超過をdurationMsへ制限します。durationMsは非負の有限値で、0も有効です。
- 未対応property / mode / Easing、重複時刻、数値でないキー値はRangeErrorで拒否します。
- absoluteのキー値はShapeの既存範囲を使用します。offsetはそのプロパティ範囲の最大差分まで許可します。例: opacity offsetは-1〜1、scale offsetは-200〜200です。
- ベースへの加算後の値も指定時刻で検証します。範囲外の結果を丸めて描画せず、エラーにします。全時刻の有効性を事前に保証する検証は今回の対象外です。
- 非表示のIndividualや生成数0のGroupでも、トラックの型・時刻・値・対応propertyを検証します。非表示の子の全時刻の状態を生成して検証するものではありません。
- デモでは空欄などの不正入力時に、最後の正常な描画と評価結果表を維持します。
- cover、スライド切り替え、保存、キーフレーム編集、自動再生・時間の自動進行は実装していません。

## GPU初学者向けの描画の流れ

1. Vueの時刻入力が変わると、通常のJavaScript関数が各図形の位置・角度などを計算します。この計算自体にGPUは使いません。
2. 結果を既存Rendererへ渡します。Rendererは同じIDのMesh（形状と塗りをまとめた描画対象）を再利用し、新しい変換行列を設定します。
3. Geometryは四角形を構成する4頂点・2枚の三角形のままです。今回の移動・回転デモでは頂点バッファを更新せず、Materialも作り直しません。
4. Cameraを通してRendererがGPUへ描画を指示し、指定時刻の画像がCanvasへ出ます。
5. プレビュー停止やサンプル切り替えでVueがアンマウントされると、既存の処理がGeometry / Material / Renderer / GPUDeviceとリサイズ監視を解放します。

## 起動・手動確認

以下のコマンドはすべて **リポジトリのルート**で実行します。依存を未インストールの場合は最初に `npm ci` を実行してください。

```sh
npm run dev
```

1. 表示されたURLを開くとPhase 2の800 msが表示されます。描画バックエンドの表示を確認します。
2. 「開始 · 0 ms」「中間 · 400 ms」「中間 · 800 ms」「終了 · 1200 ms」を押し、表示の違いを確認します。
3. 時刻スライダーを前後に動かします。800→0→800で元の状態に戻ります。
4. 「1個ごとの遅延」を40→0→40に変更します。ChildのX移動と共通回転の時間差が変わり、白い図形の個別回転は同じ全体時刻なら同じ角度です。
5. 「指定時刻の評価結果を見る」を開きます。400 msではitem-002のChild時刻は320 ms、個別rotationは19.44°です。
6. 時刻に-50 / 2000を数値入力し、描画は0 / 1200 msになることを確認します。時刻を空欄、Staggerを-1にするとエラーになり、最後の正常な画像と結果表が残ります。
7. 幅390pxへのリサイズ、プレビュー停止・再開、Phase 1 / Phase 0への切り替えを確認します。サンプル切り替えで入力は初期化されます。

テスト・本番ビルド・本番ビルドのローカル確認も **リポジトリのルート**で実行します。

```sh
npm test
npm run build
npm run preview
```

## ビルド・テスト結果

- `npm test`: **54件成功、0件失敗**。既存テストを含み、Node.js標準ランナーを継続。
- `npm run build`: **成功**。JS約920 kB（gzip約259 kB）。従来と同じ500 kB超のチャンク警告あり。
- `git diff --check`: **成功**。
- Lint: 設定がないため未実行。
- Chrome **158.0.8127.36**、headless、開発版DPR 2で検証。Playwright / PNG検査ツールは一時ディレクトリの既存ツールを使い、プロジェクトの依存には追加していません。

| ブラウザ確認 | 結果 |
|---|---|
| WebGPUで0 / 400 / 800 / 1200 ms | 成功。各時点で画像が変わり、白い図形の計算上の中心が白ピクセルになることを確認 |
| 800→0→800 | 成功。800 msの画像のピクセルが完全一致 |
| 時刻変更時のリソース | 成功。新しいpositionバッファ作成とGeometry / Material破棄は0。ユニットテストでも同一オブジェクト・頂点versionの維持を確認 |
| Stagger 40→0→40 | 成功。Childの位置が変わり、Individualの角度は同じ。元へ戻すと画像も一致 |
| 時刻の実ドラッグ、範囲外の制限、空欄、負のStagger | 成功。最後の正常な描画と結果表を保持し、有効値で復帰 |
| 幅390pxの表示 | 成功。16:9維持、横スクロールなし |
| 停止・再開、GPU解放 | 成功。11図形以上のGeometry / Material、Renderer / GPUDeviceの解放を確認 |
| Phase 1の個数減増、Phase 0の幅800への変更 | 成功 |
| 開発版のページ例外・console error | **0件** |
| 本番ビルドのWebGPU | 成功。時刻変更・逆方向シークの画像一致・終了時の白ピクセル・停止再開を確認。ページ例外・console errorは0件 |
| 本番ビルドのWebGL2フォールバック | 成功。WebGPUを意図的に無効化して明示表示と同じ描画・再起動を確認。ページ例外・console errorは0件 |

## 完了条件

- [x] 指定timeMsの最終描画状態を返す。
- [x] Keyframe補間と4種類のEasing。
- [x] Group / Child / Individualの合成。
- [x] ChildのみStagger、同一propertyのみIndividual優先。
- [x] 時刻を前後に変更した場合の再現性。
- [x] Rendererで複数時点を表示。
- [x] 数学処理のユニットテスト。
- [x] Phase 3以降は未実装。

## 既知の制約とPhase 3への引き継ぎ

- Editorのプレビューには `evaluateTransition(transition, timeMs).shapes` を渡せます。時刻制御と保存は呼び出し側の責務です。
- 静的編集には `resolveLocalShapes` を利用でき、Phase 1の `resolveStaticShapes` も互換性を維持しています。
- Groupの親変換はAnimation適用後に一度だけ合成します。worldMatrixにさらに親変換を掛けないでください。
- UIで画面上の値を編集する場合、ローカル値へ逆変換する必要があります。absoluteもローカル値という契約を維持してください。0倍率の逆変換は制限が必要です。
- Projectの保存対象は元のTransitionです。評価結果のworldMatrixやデモの現在時刻は保存データに混ぜないでください。
- 生成順ID・OverrideキーはPhase 1から継続し、Individualのトラックは `overrides[itemId].tracks` です。
- Safari / Firefox、別GPU、物理的なデバイスロスト、1000個での性能は未検証です。全時刻のトラック有効性を事前保証する検証や編集時の逆変換も未実装です。
