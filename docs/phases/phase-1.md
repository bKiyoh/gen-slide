# Phase 1 — Shape / ShapeGroup・Generator・Modifier・Overrides

**Codexへの実装指示。Phase 0のレビューと承認が済んだ後に着手し、Phase 2以降には進まないこと。**

## 0. 前提と参照資料

実装前に、リポジトリルートの `AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、本書を読む。Phase 0の完成コード、テスト、使用中のThree.jsバージョンを確認する。Phase 0の描画サンプルを壊さないこと。

## 1. 目的・スコープ

個別の四角形 `Shape` と、同種の四角形を規則から複数生成する `ShapeGroup` を扱えるようにする。**Generator → Modifier → Overrides** の順で静的な図形データを評価し、Phase 0で作ったRendererへ渡す。

このPhaseでは時間による変化は実装しない。`tracks`、`childAnimation` など将来用フィールドがデータに存在しても、アニメーション評価はPhase 2に委ねる。

## 2. データと処理の契約

- `Transition.layers` に `kind: 'shape'` または `kind: 'group'` が混在できる。
- `Shape` は `id`、`geometry`、`style`、`transform`、`tracks` を持つ。Phase 0のShapeデータを再利用する。
- `ShapeGroup` は `id`、`template`、`generator`、`modifiers`、`transform`、`tracks`、`childAnimation`、`overrides` を持つ。詳細例は `docs/DESIGN.md` を参照。
- **静的評価APIの例**：`resolveStaticShapes(transition)` → `{ shapes: [...] }`。名称は既存実装に合わせてよいが、Vue・Three.jsに依存しない純粋な関数とする。
- 各生成図形は `group-001/item-000` のような描画用一意IDを持つ。子の上書きキーは `item-000` のようなグループ内IDを用いる。
- 元のProject／Transition／Template／Overridesを評価処理で書き換えない。
- `transform` の単位は論理ピクセル・度・倍率。平行四辺形はPhase 0と同じ傾斜定義を使う。

## 3. 実装する機能

### 3.1 Shape・ShapeGroup

- 個別Shapeを、Transitionのレイヤーとして保持・描画する。
- グループの共通Templateを元に指定個数の図形を生成する。
- レイヤー配列順で前後関係を決める。**Group内の子は生成順**とする。
- 初期段階でShapeGroupのネストは実装しない。
- Group全体のTransformはPhase 2で親変換として合成する。Phase 1では静的表示に必要な範囲で反映し、後から二重適用にならない構造とする。

### 3.2 Linear Generator

```js
{
  type: 'linear',
  count: 10,
  startX: 100, startY: 200,
  stepX: 80, stepY: 20
}
```

- `x = startX + index * stepX`、`y = startY + index * stepY`。
- indexは0始まり。`count = 0` は空配列として扱う。
- `count` は有限の非負整数のみ許可し、描画を固めないよう上限を設定する。上限値と根拠を実装／UIに明示する。

### 3.3 Grid Generator

- `rows`、`columns`、`gapX`、`gapY`、`startX`、`startY`、行ごとのX方向オフセット `rowOffsetX`、列ごとのY方向オフセット `columnOffsetY` を扱う。
- 子の線形indexを**行優先**（`index = row * columns + column`）で決める。
- 座標規則を明文化する（例：`x = startX + column * gapX + row * rowOffsetX`、`y = startY + row * gapY + column * columnOffsetY`）。`gapX/gapY`は図形の外寸を加算しない**原点間ステップ**と定義する。
- 行数・列数の0と境界値を処理する。`rows * columns` も生成数上限を超えないよう検証する。

### 3.4 Modifier

最初の2方式に対応する。

| 方式 | 仕様 | 例 |
|---|---|---|
| `alternate` | `values[index % values.length]` を適用。空配列は禁止 | 赤・青を交互 |
| `linear` | 生成されたN個に対し index 0→N-1 で `from`→`to` を線形割当 | 幅を50→200 |

- 対象は `style.color`（alternate）、`geometry.width`、`geometry.height`、`geometry.skewX`、`transform.rotation`、`style.opacity`、`transform.x` / `transform.y` の必要な範囲。**サポートするプロパティと型を明示し、未対応は黙って無視しない**。
- `linear` は数値プロパティのみとする。N=1なら `from` を採用する。
- Modifierは配列順に適用。同一プロパティへの複数適用は**後勝ち**。
- 位置に対するModifierはGeneratorの配置を消さないよう、**配置に対するオフセット**として処理する。表現が曖昧な場合は `offsetX/offsetY` を内部に設け、実装例とテストで意味を固定する。

### 3.5 Overrides

- `overrides['item-002']` のように生成図形の差分だけを記録できる。
- 個別の色・角度・不透明度・サイズを上書きできる。
- 個別の位置変更はGeneratorによる位置に**相対オフセット**で足し込む。
- 生成数を一度減らして増やしても、その子の上書き設定は失われない。
- 配置方式や数値パラメーターを変えても、**同じindexの子へ**Overrideが再適用される。Gridの列数変更時に意味上の『同じ位置』を追跡するものではないことを明示する。
- 将来のIndividual Animation用 `overrides[itemId].tracks` は保持できるようにし、このPhaseでは評価しない。

### 3.6 Rendererとの接続

- Domainで計算したプレーンな静的状態をPhase 0のRendererへ渡す。
- 配列の追加・削除・順序変更・形状パラメーター変更を反映できる。
- 未変更のGeometryやMaterialの再生成を抑える。不要になったGeometry／Materialを破棄する。
- Renderer内にGeneratorやModifierのロジックを書かない。

## 4. 確認用サンプル

1. `Linear`で平行四辺形10個を生成する。
2. `alternate`で赤・青を交互に設定する。
3. `linear`で幅を50→200に変化させる。
4. `item-002`の色を白、位置オフセットX=40にする。
5. countを10→2→10に変更し、`item-002`の設定が戻ることを確認する。
6. `Grid`へ変更し、規則的なタイル配置が描画されることを確認する。

最小限の検証UIまたはデモデータで確認できればよい。本格EditorはPhase 3で実装する。

## 5. テスト観点

- Linear：index=0、末尾、stepの正負・0、count=0。
- Grid：1×1、複数行列、rowOffset、columnOffset、0行・0列、上限超過。
- ID：生成数変更後も同一indexのIDが安定し、グループ間で衝突しない。
- Modifier：alternateの周期、linearの端点／N=1、後勝ち、配列順、型エラー。
- Overrides：プロパティ単位の優先、位置オフセット、count減増後の保持。
- 副作用：入力データが書き換わらない。繰り返し評価で結果が一致する。
- ブラウザ：ShapeとShapeGroupの混在、更新・削除、GPUリソース解放。

数値計算はVitest等のユニットテストで検証する。既存のテスト環境がなければ必要最小限のみ追加する。

## 6. 今回実装しないもの

- Keyframe評価、Easing、Stagger、再生・シーク。
- 本格的なレイヤーパネルやプロパティエディタ。
- JSON保存／localStorage、スライド連携。
- Radial・Random・Path、ネストしたGroup、頂点の直接編集。

## 7. 完了条件

- [ ] 個別ShapeとShapeGroupを同一Transitionで描画できる。
- [ ] Linear / Grid Generatorが仕様どおり動作する。
- [ ] Alternate / Linear Modifierが動作する。
- [ ] 個別Overridesと位置オフセットが適用される。
- [ ] 生成数を変更しても既存Overrideデータが残る。
- [ ] RendererとDomainを分離している。
- [ ] 入力の異常値・境界値を検証する。
- [ ] テスト／ビルド結果を報告した。
- [ ] Phase 2以降の機能を実装していない。

## 8. 完了報告・次Phaseへの申し送り

追加・変更ファイル、データモデル、Generator/Modifier/Overrideの適用順序、レンダリング更新・解放方法、実行したテストと結果、コマンドの実行場所を報告する。**Phase 2で利用する静的評価API・子ID形式・グループTransformの扱いを必ず引き継ぐ。**

## 9. Codexへの依頼文

> Phase 1を実装してください。`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、`docs/phases/phase-1.md`を読み、Phase 0のコードを確認してから着手してください。Shape / ShapeGroup・Linear / Grid Generator・Modifier・Overridesのみ実装し、テストと報告の後に止まってください。
