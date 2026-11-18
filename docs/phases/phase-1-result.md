# Phase 1 実装・検証記録

確認日: 2026-11-19。Phase 2以降は実装していません。

## 実装機能

- 同一Transition内の個別ShapeとShapeGroup、レイヤー配列順・子の生成順による前後関係。
- Linear / Grid Generator、安定した子ID、0個と生成数の上限検証。
- Alternate / Linear Modifier、配列順の後勝ち、配置を維持する位置オフセット。
- プロパティ単位のOverrides。個数減増・配置方式変更後も同じindexに再適用。
- 静的なグループ移動・回転・拡縮。親の非一様scaleと子rotationも正確に合成。
- 検証用UI、最後の正常な描画の維持、従来のPhase 0サンプルへの切り替え。
- 描画オブジェクトの再利用、未変更頂点の更新省略、削除・停止時のリソース解放。

## 追加・変更ファイル

| ファイル | 内容 |
|---|---|
| `src/domain/shapes.js` | Shapeのkind / tracks / scale、変換・描画行列の検証。従来のscale省略データにも対応 |
| `src/domain/transition/generators.js` | Linear / Gridの配置・ID生成、個数・座標の検証 |
| `src/domain/transition/modifiers.js` | 対応プロパティ・型の宣言、Modifierの検証・適用 |
| `src/domain/transition/overrides.js` | 差分の検証・上書き、相対位置の加算 |
| `src/domain/transition/transform.js` | 描画ライブラリ非依存の2D変換行列と親子合成 |
| `src/domain/transition/resolveStaticShapes.js` | 静的評価API、混在レイヤーと全体上限の検証 |
| `src/domain/transition/sampleTransition.js` | JSON化可能なShapeGroupのサンプル、データ型とGrid配置例 |
| `src/renderer/three/shapeMeshes.js` | IDでのMesh同期、描画行列・配列順・削除時の解放 |
| `src/renderer/three/createShapeRenderer.js` | Mesh管理を切り出し、初期化・リサイズ・描画・破棄に集中 |
| `src/renderer/three/geometryFactory.js` | 形状パラメーターが変わらない場合のバッファ更新省略 |
| `src/App.vue` | Phase 1 / Phase 0サンプルの切り替え |
| `src/components/PhaseOneSample.vue` | Phase 1検証UIと純粋な評価処理の接続 |
| `src/components/PhaseZeroSample.vue` | 従来のAppから移動したPhase 0のUI（import先を調整） |
| `src/style.css` | サンプル切り替え、検証用入力・結果表、狭い画面への対応 |
| `tests/staticShapes.test.js` | Generator / Modifier / Overrides / 親子合成 / 入力非破壊の検証 |
| `tests/shapeMeshes.test.js` | 実Three.jsオブジェクトの再利用・行列・配列順・解放の検証 |
| `tests/shapes.test.js` | scale・描画行列の境界値とPhase 0形式の互換性 |
| `README.md`, `docs/phases/phase-1-result.md` | 起動・操作案内、設計判断・検証結果・引き継ぎ |

依存パッケージ・lockfile、合意済み設計書・Phase指示書は変更していません。

## データ契約と設計判断

`Transition.layers` は `kind: 'shape'` / `kind: 'group'` を持つレイヤーの配列です。ShapeはPhase 0のgeometry / style / transformを継続し、kind / tracks / scaleX / scaleYを追加しました。scale省略時は1です。Groupのデータ例は `createSampleTransition()` にまとめています。tracks、childAnimation、Overrideのtracksは元データに保持し、このPhaseでは評価しません。

純粋なAPIは `resolveStaticShapes(transition) → { shapes }` です。入力を書き換えず、独立したgeometry / style / transformと描画用worldMatrixを返します。不正入力はRangeErrorで拒否し、Vue側で最後の正常値を保持します。

### Generator

- Linear: `x = startX + index * stepX`、`y = startY + index * stepY`。
- Grid: `index = row * columns + column` の行優先。
- Gridの `x = startX + column * gapX + row * rowOffsetX`、`y = startY + row * gapY + column * columnOffsetY`。gapに図形の外寸を加算しません。
- Templateのtransform.x / yは、生成位置に加えるローカルオフセットとして扱います。サンプルは両方0です。
- 子IDは `item-000`、描画IDは `group-001/item-000`。レイヤーID内の `/` は予約文字として拒否し、重複IDも拒否します。
- 個数は0〜1000の有限整数。rows / columnsそれぞれ、積、Transition全体の図形数にも上限を適用します。1図形ごとにMesh / Materialと描画命令を使う現段階の負荷を抑えるための値で、60fps保証ではありません。
- 座標はPhase 0と同じ入力範囲で検証します。ステップの結果や、Modifier / Override加算後に範囲を超えた場合も拒否します。

### ModifierとOverrides

| プロパティ | 型 | Alternate | Linear |
|---|---|---|---|
| `style.color` | `#RRGGBB`文字列 | 対応 | 非対応 |
| `geometry.width`, `geometry.height` | 有限数値、Phase 0と同じ範囲 | 対応 | 対応 |
| `geometry.skewX`, `transform.rotation` | 有限数値（度）、Phase 0と同じ範囲 | 対応 | 対応 |
| `style.opacity` | 0〜1の有限数値 | 対応 | 対応 |
| `transform.x`, `transform.y` | 有限数値（配置に対するオフセット） | 対応 | 対応 |

未対応の方式・プロパティ、空のvalues、型違い・範囲外はエラーです。LinearはN=1ならfromを採用します。位置以外のModifierは値を置換し、配列で後のものが優先します。

位置Modifierも後勝ちです。生成済みXが200で、X Modifierが10→20ならXは220です。さらにOverrideのoffsetXが40なら260になります。Modifierの10と20を累積するものではありません。

Overridesはgeometry.width / height / skewX、style.color / opacity、transform.rotation / scaleX / scaleY / offsetX / offsetYを部分指定できます。transform.x / yの直接指定は、相対位置と混同しないよう拒否します。未生成の子の設定も検証しますが、評価では削除しません。Gridの列数変更時も同じindexに適用し、以前の行・列の位置を追跡しません。

### グループの静的変換

ローカル形状はPhase 0と同じ傾斜定義です。図形は中心を軸にscale → 時計回りrotation → translation。グループのピボットはローカル原点 `(0, 0)` とし、子変換後に親のscale → rotation → translationを適用します。

`composeShapeMatrix(localTransform, parentTransform)` が親×子の2Dアフィン行列を返します。表現は `[a, b, c, d, tx, ty]`、意味は `x' = a*x + c*y + tx`, `y' = b*x + d*y + ty` です。非一様な親scaleと子rotationが作るせん断を失わないよう、回転角・倍率への再分解を避けています。

`transform` はローカル値のまま保持し、`worldMatrix` が最終描画変換です。scaleは-100〜100の有限値を許可し、0は退化図形、負数は反転として描画します。編集時の逆変換は後続Phaseで制約を設ける対象です。

## 初学者向けの処理フローとRendererの更新・解放

1. Vueの数値入力を通常のJavaScriptデータに反映します。
2. DomainがTemplateを複製し、Generatorで中心位置を決めます。
3. Modifierを順番に適用し、子ごとのOverrideを重ねます。ここまでThree.jsもGPUも使いません。
4. ローカル変換と親変換を行列にまとめ、プレーンな描画状態をRendererへ渡します。
5. RendererはIDで既存Meshを探します。新しいIDだけGeometry（4頂点・2三角形）とMaterial（塗り）を作り、形状変更時は同じ頂点バッファを更新します。形状未変更なら頂点更新を省略し、色・透明度も既存Materialを更新します。
6. 行列をMeshに一度だけ設定し、配列順をrenderOrderへ反映します。Cameraを通してRendererがGPUへ三角形の描画を指示します。Phase 0形式のShapeでは従来の位置・回転とscaleを使います。
7. 消えたIDのGeometry / Materialを破棄します。アンマウント時は全Meshを解放し、Phase 0の仕組みでRenderer / GPUDevice、Canvas、リサイズ監視を解放します。

Three.jsは **0.187.0 (r187)** を継続。行列設定はインストール済みのJSDoc / 実装と公式の同バージョン [Matrix4](https://github.com/mrdoob/three.js/blob/r187/src/math/Matrix4.js)、[Object3D](https://github.com/mrdoob/three.js/blob/r187/src/core/Object3D.js) を確認し、実Three.jsオブジェクトのテストとブラウザ描画で検証しました。BufferAttributeの更新は [r187公式ソース](https://github.com/mrdoob/three.js/blob/r187/src/core/BufferAttribute.js) と照合しています。

## 動作確認の手順

以下のコマンドはすべて **リポジトリのルート**で実行します。依存を未インストールなら先に `npm ci` を実行してください。

```sh
npm run dev
```

1. 表示されたURLを開き、Phase 1の画面に10個の平行四辺形と背景の個別Shapeがあること、WebGPU / WebGL2の表示を確認します。
2. 赤青交互・幅50→200、3番目が白・X +40になっていることを確認します。「評価結果を見る」で数値を確認できます。
3. 「2個に減らす」→「10個に戻す」で3番目が元の設定で戻ることを確認します。0個では個別Shapeだけが残ります。
4. 配置方式をGridへ変更し、行数・列数・間隔・行列オフセットを変えます。列数変更後も3番目に白・X +40が適用されます。
5. Modifierや個別設定の適用をオン・オフし、幅・傾斜・色・位置オフセットを変更します。
6. グループの位置・回転・倍率、Shape / Groupの表示、レイヤー順を変更します。
7. 個数に-1 / 1001、Gridの行列積に上限超過、色にredを入力し、エラーと最後の正常な描画の維持を確認します。
8. ウィンドウを狭くし、16:9を維持して収まることを確認します。停止・再開とPhase 0への切り替えも確認します。画面切り替えではサンプルの入力は初期化されます。

テスト・本番ビルド・本番ビルドのローカル確認も **リポジトリのルート**で実行します。

```sh
npm test
npm run build
npm run preview
```

## ビルド・テスト結果

- `npm test`: **33件成功、0件失敗**。既存テストを含みます。追加ライブラリなしのNode.js標準ランナーを継続。
- `npm run build`: **成功**。JS約909 kB（gzip約256 kB）、既存と同じ500 kB超のチャンク警告あり。
- `git diff --check`: **成功**。
- Lint: 設定がないため未実行。
- Chrome **158.0.8127.36**、headless、DPR 2で開発版を検証。Playwright / PNG検査ツールは一時ディレクトリへ用意し、プロジェクトの依存に含めていません。

| ブラウザ確認 | 結果 |
|---|---|
| WebGPU上で個別Shapeと10個の平行四辺形 | 成功。赤・青・白の実ピクセルを確認 |
| count 10→2→10 | 成功。復元後のCanvas画像が初期画像と一致 |
| 子の削除時のリソース | 成功。10→2でGeometry / Materialをそれぞれ8個破棄 |
| 負の個数、上限超過、不正色、0個、正常値への復帰 | 成功。不正時はCanvas画像が直前の正常値と一致 |
| Grid・行列オフセット、列数変更後のOverride | 成功。計算位置の赤・青・白のピクセルを確認 |
| レイヤー順の反転、Shape / Groupの表示・削除・再追加 | 成功 |
| グループの移動、scaleX=0 | 成功。移動位置と退化後の非表示を確認 |
| 幅390px | 成功。16:9維持、横スクロールなし |
| 停止・再開、Phase切り替え | 成功。3回のアンマウントでRenderer.dispose / GPUDevice.destroyを各3回確認 |
| Phase 0の幅800・傾斜-30の入力 | 成功。描画エラーなし |
| 開発版のページ例外・console error | **0件** |
| 本番ビルドのWebGPU | 成功。個数の復元、Gridの赤ピクセル、停止・再開、ページ例外0件 |
| 本番ビルドのWebGL2フォールバック | 成功。WebGPUを意図的に無効化し、明示表示・個数の復元・Grid実描画・再開・ページ例外0件を確認 |

GPU実機・ブラウザの網羅試験ではありません。非一様scaleを含む親子変換の詳細な数値検証はユニットテストで行っています。

## 完了条件

- [x] 個別ShapeとShapeGroupを同一Transitionで描画。
- [x] Linear / Grid Generator。
- [x] Alternate / Linear Modifier。
- [x] 個別Overridesと位置オフセット。
- [x] 生成数変更時のOverride保持。
- [x] RendererとDomainの分離。
- [x] 異常値・境界値の検証。
- [x] テスト／ビルド結果の報告。
- [x] Phase 2以降を先回りしていない。

## 制約とPhase 2への引き継ぎ

- 静的評価APIは `resolveStaticShapes(transition)`。Rendererへは返却されたshapesを渡します。
- 子の描画IDは `groupId/item-NNN`、Overrideキーは `item-NNN`。返却状態にはgroupId / itemId / indexも含めています。
- `transform` はローカル値、`worldMatrix` は親を合成済みの描画値です。Phase 2ではGenerator → Modifier → Overridesで得た基本状態へAnimationを適用し、その後に `composeShapeMatrix` を実行します。静的評価のworldMatrixに再度親変換を掛けないでください。元レイヤーのtransformやtracksを使い、アニメーション後の行列を再計算する必要があります。
- 評価結果は描画用の一時データです。worldMatrixをProjectの保存値に混ぜず、元のTransitionを保持します。tracks / childAnimation / Override.tracksを削除する処理はありません。
- 保存、時刻評価、再生、タイムライン、本格Editor、Presentationは未実装です。
- 対応するModifier / Overrideプロパティは上記の範囲です。ネストGroupは非対応です。
- Safari / Firefox、別GPU、物理的なデバイスロスト、1000個での60fpsは未検証です。上限は性能保証ではありません。

## レビュー対応: Phase 1のスライダー入力

連続的に調整する項目へ、スライダーと数値入力を組み合わせた `src/components/NumberSlider.vue` を追加しました。`src/components/PhaseOneSample.vue` で、幅・高さ・傾斜、Generatorの開始位置・ステップ・間隔・行列オフセット、個別Xオフセット、グループの位置・回転・倍率に適用しています。個数・行数・列数は整数の数値入力、色はHEX入力を継続します。

普段使う論理キャンバスの範囲で操作しやすくし、数値入力で範囲外の有効値を指定するとスライダーの範囲も広げます。倍率は0.01刻み、ほかのスライダーは1刻みです。数値入力では小数も指定できます。空欄や不正値をスライダー側から自動修正せず、既存の検証で最後の正常な描画を維持します。入力 → 静的評価 → Renderer → GPU描画の処理をそのまま使い、DomainやRendererのロジックは変更していません。

`src/style.css` は幅701〜1000pxでPhase 1の入力欄を1列にし、スライダーの操作幅を確保しました。`README.md` に操作案内を追加しました。Phase 0の入力UIは変更していません。

コマンドの実行場所は **リポジトリのルート**。`npm test` は33件成功、`npm run build` は成功、`git diff --check` も成功です。既存のチャンクサイズ警告は継続しています。

ChromeのWebGPUで、Linearの全14スライダーのキーボード操作と数値連動、マウスの実ドラッグによる描画画像の変化、数値入力からの範囲拡張、小数、空欄・不正値からの復帰、負の倍率を確認しました。Gridの間隔・行列オフセットのスライダーも確認しました。幅800 / 390pxで横スクロールはなく、スライダーの最小幅はそれぞれ228 / 244pxでした。ページ例外・console errorは0件です。

今回のUI変更はSafari / Firefoxでは未検証です。保存やAnimationなど、Phase 2以降の機能は追加していません。
