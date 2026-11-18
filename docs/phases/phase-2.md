# Phase 2 — Animation Evaluator・Keyframe・Stagger

**Codexへの実装指示。Phase 1のレビュー承認後に着手し、Phase 3以降は実装しないこと。**

## 0. 着手前の確認

`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、本書と、Phase 1の静的評価API・テストを確認する。特に生成図形ID、Overrideのデータ構造、Group Transformの合成位置を把握する。

## 1. 目的

**時間 `timeMs` を指定すると、その瞬間の図形状態を決定論的に返せる**アニメーション評価エンジンを作る。Group / Child / Individual Animation、Easing、Staggerに対応させる。再生ループとUIはこのPhaseの中心ではない。

## 2. 評価インターフェース

```js
// 概念的なAPI。命名は既存コードに合わせてよい。
const state = evaluateTransition(transition, timeMs)
// { shapes: [{ id, geometry, style, transform }, ...], cover?: ... }
```

- `timeMs` はミリ秒。時刻の負値／終了超過についての扱いを決める。基本は**0〜durationMsにクランプ**して評価する。
- Transitionのレイヤー、Generator、Modifier、Overridesを評価したあとにAnimationを適用する。
- Vue・Three.js・ブラウザAPIへ依存しない純粋関数とする。入力オブジェクトは更新しない。
- 同じTransitionと時刻は、再生順序に関係なく同じ結果を返す。
- 数値や色などのバリデーションを行い、無効なトラックを黙って描画させない。

## 3. Keyframe Track

```js
{
  property: 'transform.x',
  mode: 'offset', // 'offset' または 'absolute'
  keyframes: [
    { timeMs: 0, value: -500, easing: 'easeOutCubic' },
    { timeMs: 400, value: 0, easing: 'linear' },
    { timeMs: 800, value: 500 }
  ]
}
```

- 初期対象のプロパティ：`transform.x/y`、`transform.rotation`、`transform.scaleX/scaleY`、`style.opacity`、`geometry.skewX`。
- キーフレームの時刻は昇順で扱い、重複時刻は**エラー**として扱う。読込時や編集時に検出できること。
- 0件のトラックは変化なし。1件はその値を固定適用する。
- 最初より前は最初の値、最後より後は最後の値を使う。
- `easing` は**開始側キーから次のキーへの区間**へ適用する。
- Easing：`linear`、`easeInCubic`、`easeOutCubic`、`easeInOutCubic`。
- 補間対象の型は数値とし、色補間はPhase 6以降の拡張候補。
- `offset` はベース値への加算値。ただしスケールのoffsetの意味を混同しないよう、**加算オフセット**か**倍率**かを設計メモとテストで明示し、全レイヤーで統一する（推奨：scaleも加算差分、初期状態1に対して0は無変化）。
- `absolute` は**対象レイヤーのローカルな値**を直接指定する。UIに両モードを露出させる必要はない。

## 4. 3階層のAnimation

### 4.1 Shape自身のトラック

単体Shapeの `tracks` をベース状態に評価・適用する。単体Shapeにも`offset`／`absolute`の基本ルールを適用する。

### 4.2 Child Animation

- `group.childAnimation.tracks` を各生成Shapeへ適用する。
- `localTimeMs = timeMs - index * staggerMs` でローカル時刻を計算する。
- `localTimeMs < 0` でも最初のキーの値を保持するため、開始キーは**待機中に見せたい状態**を表す。
- ModifierやOverrideで得た基本状態を残し、Childの`offset`を加算する。

### 4.3 Individual Animation

- 特定の子の独自トラックは `group.overrides[itemId].tracks` で保持する方式を第一候補にする。既存のPhase 1コードと整合する名称にする。
- **同じpropertyのトラックがChildとIndividualの両方にあればIndividualを優先**する（加算しない）。別のpropertyはChildを引き継ぐ。
- 個別Overrideの**静的値**はアニメーションのベース値を設定する。Individualの`absolute`トラックの値がある場合は、そのプロパティに限って動的値で置き換える。
- IndividualへのStagger適用方針を明示する。初期案は**ChildのみStagger**、IndividualはTransition全体の時刻で評価し、意図しない二重遅延を防ぐ。

### 4.4 Group Animation

- `group.tracks` は `group.transform` に対する時系列変化として計算する。
- 生成図形のローカル変換を確定してから、Group Transformを**親変換**として合成する。
- 初期ピボットは各図形の中心、グループのピボットはグループのTransform基準点とする。どこを回転中心とするか、具体例とテストで確定する。
- Groupの回転・スケール・平行移動は子の相対配置を保って合成する。
- 座標系は左上原点・Y下向き。角度の正方向と変換順序を明示する。

## 5. ShapeGroup計算パイプライン

```text
Template
 → Generator（配置）
 → Modifier（登録順）
 → Overrides（静的値）
 → Child / Individual Track（property単位の優先）
 → Group Transform / Group Track（親として合成）
 → 描画可能な最終Shapeの配列
```

- `evaluateTransition` は描画結果のスナップショットを返すだけとし、`requestAnimationFrame`は持たない。
- 将来のEditorで最終画面位置を数値編集できるよう、親変換の数学的定義を小さな関数に分離し、**逆変換しやすい構成**にする。
- 0倍率など逆変換不能な状態は評価自体では安全に描画し、将来の編集UIでは拒否できるよう情報を整理する。
- 親Groupのスケールによる子の形状サイズとローカル座標の変化を二重適用しない。

## 6. デモとRenderer接続

- Phase 1の10個の赤青平行四辺形にChild Animationを設定する。
- `staggerMs: 40`で時間差をつけ、`x: -1000 → 0` の移動と回転を組み合わせる。
- `item-002`に独自の回転トラックを与え、共通回転と差し替わることを示す。
- Group全体の回転または平行移動を加え、ローカルな動きと親の動きが合成されることを確認する。
- 最低限の `timeMs` 数値入力またはスライダーで0→中間→終了の状態を確認できるようにする。再生UI／タイムラインの本実装はPhase 3。

## 7. テスト観点

- linearと各Cubicの0・中間・1、端点の一致。
- キー0件・1件・複数、区間外、重複／非昇順、時間値異常。
- `absolute`と`offset`の違い。スケールoffsetの定義。
- Staggerが各indexで指定どおり働く。負のローカル時刻が安全に処理される。
- ChildとIndividualの**同じpropertyだけ**Individualが優先される。
- 静的OverridesにChildの相対アニメーションが合成される。
- Group回転・スケール・移動の合成順序とピボット。
- `evaluateTransition(T, 800)` → `evaluateTransition(T, 0)` → `evaluateTransition(T, 800)` が一致する。
- 入力の破壊的変更なし、描画配列の並び順・IDの不変性。
- Rendererで時間値変更に応じて画面が更新され、リソースリークしない。

## 8. 実装しないもの

Transition Editor本体、キーフレームGUI、自動再生とプレゼンテーション、保存処理、時間の自動進行、自由な頂点編集、色の補間。

## 9. 完了条件

- [ ] 指定した `timeMs` の最終描画状態を返す。
- [ ] Keyframeの補間とEasingが正しい。
- [ ] Group / Child / Individualを合成できる。
- [ ] Staggerと個別優先順位が正しい。
- [ ] 時刻を前後に変更しても再現性がある。
- [ ] Rendererでアニメーションの複数時点を表示できる。
- [ ] 数学処理をユニットテストしている。
- [ ] Phase 3以降の機能を実装していない。

## 10. 完了報告・Codexへの依頼文

評価API、オフセット／絶対値、座標・ピボット・親変換の定義を報告に明記する。テスト結果とコマンドの**実行場所**を示し、Phase 3のUI実装へ向けた契約を引き継ぐ。

> Phase 2を実装してください。`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、`docs/phases/phase-2.md`を読み、Phase 1のデータモデル／静的評価を流用してください。時刻ベースのAnimation Evaluatorとテストを作り、結果を報告したら停止してください。
