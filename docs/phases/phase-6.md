# Phase 6 — Generator / Modifier・表現力の拡張（任意）

**Codexへの実装指示。Phase 5までのレビュー後に着手する任意Phase。** LTでの発表に必要な最低条件ではない。**Phase 6を一度に全実装する必要はない**ため、着手対象を下のサブPhaseから指定して進める。

## 0. 前提と基本方針

`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、本書を読む。既存のGenerator／Modifierのインターフェース、ShapeGroupの安定ID、Animation Evaluator、Editorの編集UIと保存スキーマを確認する。

- **Generator / Modifierの拡張ポイントを再利用**する。DomainとThree.jsの依存分離を維持する。
- 新しい意匠も、同じProject JSONで保存・復元・シーク可能にする。
- 再現性を重視し、乱数はシードを必須にする。
- 今までのLinear / Grid / Alternate / Linearを壊さずに増やす。
- UIが新しい設定をすべて扱えない中途半端な状態を完成としない。**1種類ずつ、評価→UI→保存→テスト**を完結させる。

## 1. サブPhaseの実装順（推奨）

| サブPhase | 対象 | ねらい |
|---|---|---|
| **6A** | Radial Generator | 中心から放射状に四角形を配置 |
| **6B** | Random Generator + Random Modifier | 不規則でも再現可能な配置・属性変化 |
| **6C** | Sequence Modifier | 指定した色や数値の並びを循環適用 |
| **6D** | Path Generator | 経路に沿う配置 |
| **6E** | プリセットと制作支援 | Transitionの再利用、整列・分布など |

1回のCodex依頼では、**指定されたサブPhaseのみ**実装し、レビュー後に次へ進む。

## 2. 6A — Radial Generator

### 設定案

```js
{
  type: 'radial', count: 12,
  centerX: 960, centerY: 540,
  radiusX: 300, radiusY: 300,
  startAngleDeg: 0, sweepAngleDeg: 360,
  rotateWithAngle: false
}
```

- 指定角度の円／楕円周上へ配置。角度0°の方向、時計／反時計回りの符号を明示する。
- `count=1`、全周360°での**先頭と末尾の重複**が起きない規則を定義する。
- `rotateWithAngle` は図形の回転を配置角度に連動させる任意設定とする。
- 生成子IDは引き続きindexによって安定する。
- 受け入れ例：12個の赤青の平行四辺形が中心から放射状に並ぶ。

## 3. 6B — Random Generator / Random Modifier

### 設定案

```js
{
  type: 'random', count: 20,
  seed: 12345,
  bounds: { minX: 100, maxX: 1800, minY: 100, maxY: 900 }
}
```

- `Math.random()`を評価本体で直接使用しない。**シード付き疑似乱数**を実装する。
- 同じseed・count・設定で同じ位置・属性が返る。
- 可能ならindexごとの乱数を安定生成し、count増減によって既存indexの結果を変えない。
- Random Modifierは幅・角度・不透明度などの数値、またはカラー候補から選択する方式とする。
- seed変更時のみ違う結果が得られること、範囲外の値を出さないことをテストする。
- 上限を設けて大量生成によるフリーズを防ぐ。

## 4. 6C — Sequence Modifier

```js
{
  property: 'style.color', type: 'sequence',
  values: ['#FF0000', '#0000FF', '#FFFFFF']
}
```

- 指定した値列を生成index順に適用し、最後の値以降は末尾の値を維持する（非循環）。
- `alternate`は値を循環適用するのに対し、`sequence`は末尾で固定する。既存データとの互換性を維持する。
- 空配列と対象プロパティの不正な型を拒否する。
- 後勝ちルールを既存Modifierと統一する。

## 5. 6D — Path Generator

```js
{
  type: 'path', count: 10,
  points: [{ x: 100, y: 500 }, { x: 500, y: 300 }, { x: 900, y: 700 }],
  distribution: 'distance',
  rotateWithTangent: false
}
```

- 初期は複数直線からなる**Polyline**に限定する。Bezier曲線編集は後続候補。
- `distribution: 'distance'` は経路長に沿って等距離で配置する。
- count=1、ゼロ長経路、同じ座標が連続するケースを扱う。
- `rotateWithTangent` を有効にしたときの接線方向の定義と、頂点で向きが不連続な場合の処理を明示する。
- RendererはPathの数学を知らず、評価結果の図形を描画するだけにする。

## 6. 6E — プリセットと制作支援

- Transitionのコピーを基に新しい意匠を作成できるプリセット。
- 配置整列、等間隔配置、配色パターンの候補。
- 最低3種類の編集可能なサンプル：**Diagonal Sweep / Block Expansion / Alternating Slide**。
- プリセットは固定アニメーション再生機能ではなく、通常のTransitionデータを初期生成する機能とする。
- プリセットはJSONへ保存でき、生成後にすべての対象パラメーターを変更できる。

## 7. アニメーションと連携する際のルール

- 新Generatorで生成した子も、既存のChild Animation / Stagger / Individual Animationをそのまま適用できる。
- 新Modifierが位置・角度などを変更する場合も、既存のGenerator→Modifier→Overrides→Animationの順序を変えない。
- Group子の再配置後、`overrides[itemId]` は同じindexへ再適用される。
- 編集UIとPresentationで同じTransitionを再生し、生成結果に差が出ない。
- JSONの`schemaVersion`を変える必要がある場合は、**読み込み互換性・バリデーション・移行方針を提示してレビュー**する。独断で既存データを破棄しない。

## 8. サブPhaseごとのテスト／完了条件

- [ ] 指定したGenerator／Modifierが評価層で動作する。
- [ ] 新パラメーターをEditorで編集できる。
- [ ] JSONエクスポート→インポートで同じ意匠を再現できる。
- [ ] Animation Evaluatorの同時刻再現性が保持される。
- [ ] Group子IDとOverridesの意味が維持される。
- [ ] 境界値（0、1、上限、空・重複・非有限）をテストした。
- [ ] Phase 4のPresentationで新意匠を再生できる。
- [ ] 既存のLinear / Gridなどに回帰がない。
- [ ] テスト・ビルド・ブラウザ確認の結果を報告した。

## 9. 今回実装しないもの

- 動画／PowerPoint／PDFエクスポート。
- 多階層Group、物理演算、共同編集、クラウド保存。
- SVG等の任意パス編集UI、Bezierのハンドル操作（別途要件化した場合を除く）。
- 全サブPhaseの無断一括実装。

## 10. 完了報告・Codexへの依頼文

対象サブPhase、追加パラメーター、既存データとの互換性、UI操作方法、再現性テスト、性能上限、コマンドの実行場所を報告する。**着手対象外のサブPhaseには進まず止まる。**

> Phase 6A（Radial Generator）のみ実装してください。`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、`docs/phases/phase-6.md`を読み、既存データ構造とテストを維持してください。評価ロジック・Editor操作・JSON保存・Presentation再生まで確認し、報告後に停止してください。

6B〜6Eへ進むときは、依頼文の`6A`と対象機能名を置き換えること。
