# Generative Slide System — 基本設計

- 設計ベース：会話で合意した基本設計 v0.1〜v0.9
- ステータス：**合意済みの方向性を統合した初期設計**。実装で発見した制約は追記・レビューする。
- 技術選択：Vue 3 + Three.js `WebGPURenderer` を第一候補（WebGPU利用は実行時に要検証）

## 1. 目的と境界

本システムは、**四角形（長方形、正方形、平行四辺形、台形、任意の四角形）を中心とする意匠アニメーションを自由に制作するツール**と、それをスライド切り替えに利用するプレゼンテーション機能から構成される。

- 「スライド1 → Transition A → スライド2 → Transition B → スライド3」のように、**Transition それぞれが独立して完結**する。
- スライドの本文は Vue の DOM で描画し、切り替え時の意匠だけ Three.js の Canvas で描画する。
- 参考映像にある赤と青の線・四角形の勢いある切り替えは目標表現だが、映像のフレーム分析は未実施。特定の演出を再現したと断定しない。
- まず 2D 表現を構築する。3D 演出、スライド本文の GPU 変形、動画出力は初期対象外。

## 2. 設計の決定事項

| 領域 | 決定事項 |
|---|---|
| 基本形状 | 四角形を中心にし、平行四辺形などへの変形を許容 |
| 図形管理 | 個別 `Shape` と自動生成 `ShapeGroup` を併用 |
| 生成 | `Generator` で個数と配置を決定 |
| 意匠の変化 | `Modifier` で色・幅・角度などを規則的に変化 |
| 個別編集 | `Overrides` で生成図形の一部のみ上書き（グループを解除しない） |
| アニメーション | Group / Child / Individual の3階層。キーフレームと Stagger に対応 |
| UI | レイヤー、プレビュー、プロパティ、タイムラインの4領域 |
| 編集哲学 | 表示されている位置・角度をそのまま編集。Absolute/Relative の選択は原則 UI に露出させない |
| 保存 | localStorage 自動保存 + JSON ファイル入出力。Cookie・DB なし |
| 描画 | Three.js + WebGPURenderer 第一候補。Domain / Evaluator から独立 |
| 座標 | 1920×1080 の論理座標。左上原点、X右向き、Y下向き、16:9 |

## 3. コンポーネントと依存方向

```text
Project JSON
  ├─ Transition[]
  │    ├─ Shape
  │    └─ ShapeGroup
  │         ├─ Shape Template
  │         ├─ Generator
  │         ├─ Modifier[]
  │         ├─ Child Animation
  │         └─ Overrides
  └─ Slide[]

Project/Transition Data
    ↓
Generator → Modifier → Overrides → Animation Evaluator
    ↓                                  ↓
Resolved Shape State (時刻 t の描画状態)
    ↓
Three.js Renderer
    ↓
Canvas（Vue のスライドの上に重ねる）
```

- **Domain 層**は Vue、Three.js、DOM API に依存しない。
- **Editor** は Project を操作し、評価結果を Renderer に渡す。
- **Presentation** は遷移時に同じ Transition 評価と Renderer を使い、`switchAtMs` で Vue のスライドを変更する。
- 各時刻の状態は直前の描画に依存せず、同じデータと時刻から同じ結果になる。

## 4. データモデル案

以下は **設計契約の例**。詳細な型検証・ファイル分割は対応する Phase で実装する。JSON へシリアライズできるデータのみを保持する。

### 4.1 Project

```js
const project = {
  schemaVersion: 1,
  transitions: [],
  slides: []
}
```

### 4.2 Transition

```js
const transition = {
  id: 'transition-001',
  name: 'Diagonal Sweep',
  durationMs: 1200,
  switchAtMs: 600,
  layers: [], // Shape または ShapeGroup。配列順が表示順の基準
  cover: {
    enabled: true,
    color: '#FF0000',
    fromMs: 550,
    toMs: 650
  }
}
```

- `switchAtMs` は `0 <= switchAtMs <= durationMs`。
- `cover` はスライドの DOM を切り替える瞬間に背後を確実に隠すための安全策。範囲は一例であり、アニメーション全体での視覚効果に合わせて調整する。
- `cover` が無効な場合は、その時点で意匠自体が完全に不透明で画面を覆う必要がある。初期段階では `cover` を有効にする。

### 4.3 Shape（単体）

```js
const shape = {
  id: 'shape-001',
  kind: 'shape',
  geometry: { type: 'parallelogram', width: 200, height: 100, skewX: 30 },
  style: { color: '#FF0000', opacity: 1 },
  transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  tracks: []
}
```

- 基本値は `geometry` / `style` / `transform` へ置き、時間変化は `tracks` に置く。
- `skewX` と `rotation` の単位は **度**。`width/height/x/y` は論理ピクセル。`opacity` は 0〜1。
- 平行四辺形の傾斜は頂点位置を計算して表す。具体的な「傾斜角」の幾何学的定義はPhase 0で実装コメントとテストにより固定する（例：上辺が下辺に対して `height * tan(skewX)` ずれる）。

### 4.4 ShapeGroup（自動生成）

```js
const group = {
  id: 'group-001',
  kind: 'group',
  template: {
    geometry: { type: 'parallelogram', width: 200, height: 100, skewX: 30 },
    style: { color: '#FF0000', opacity: 1 },
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  },
  generator: {
    type: 'linear', count: 12,
    startX: 100, startY: 200, stepX: 80, stepY: 0
  },
  modifiers: [
    { property: 'style.color', type: 'alternate', values: ['#FF0000', '#0000FF'] }
  ],
  transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  tracks: [],
  childAnimation: {
    staggerMs: 40,
    tracks: [{
      property: 'transform.x', mode: 'offset',
      keyframes: [
        { timeMs: 0, value: -1000, easing: 'easeOutCubic' },
        { timeMs: 500, value: 0 }
      ]
    }]
  },
  overrides: {
    'item-002': { style: { color: '#FFFFFF' }, transform: { offsetX: 40 } }
  }
}
```

- 生成した子の ID は**生成順に対応した安定 ID**（`item-000` など）。`count` を減らしても `overrides` は消さず、増やしたとき復元する。
- Generator は Linear（`count` / `startX` / `startY` / `stepX` / `stepY`）と Grid（`rows` / `columns` / `gapX` / `gapY` / 行・列オフセット）を初期対象とする。
- Modifier は初期対象が `alternate` / `linear`。将来的に `sequence` / `random(seed)`、Radial/Path配置などを追加する。
- Modifier は登録順に適用する。同一プロパティに複数ある場合は**後勝ち**を基本とし、エディタ上で衝突を確認できるようにする。
- `overrides` は**変更されたプロパティだけ**保存する。生成位置に対する個別移動はオフセットとして保持し、Generator変更後にも適用する。
- 複数レイヤーの入れ子グループは初期対象外。

### 4.5 Keyframe Track

```js
const track = {
  property: 'transform.rotation',
  mode: 'offset', // 'absolute' または 'offset'。UIには原則表示しない
  keyframes: [
    { timeMs: 0, value: 0, easing: 'linear' },
    { timeMs: 400, value: 45, easing: 'easeOutCubic' },
    { timeMs: 800, value: 90 }
  ]
}
```

- `easing` は**当該キーフレームから次のキーフレームまで**に適用する。
- 時刻の昇順に評価し、範囲外は端点の値を採用する。
- `linear` / `easeInCubic` / `easeOutCubic` / `easeInOutCubic` を初期対応とする。
- `offset` は基本状態からの差分、`absolute` は対象プロパティの値を直接指定する内部表現。
- キーフレームのUIでは、**その時刻に実際に見えている値**を編集できるよう、必要な逆変換を行う。

## 5. 時刻 t での評価順序

**決定済みの順序**：

1. Templateから図形の基本値を準備。
2. Generatorで個数・位置を生成。
3. Modifierを順に適用（色・サイズ・角度・位置オフセット等）。
4. Overridesをプロパティ単位で適用。
5. Animationで時刻 `t` の値を計算。ChildとIndividualの同一プロパティは**Individualを優先**。
6. Group Transformを親の変換として合成。
7. Rendererへ描画状態を渡す。

```js
const renderState = evaluateTransition(transition, timeMs)
// 想定出力：{ shapes: [{ id, geometry, style, transform }, ...] }
```

### 5.1 Animation の優先・合成ルール

| アニメーション | 適用方法 |
|---|---|
| Group Animation | 子のローカル変形に**親の変換**を合成する（置き換えではない） |
| Child Animation | 生成された図形に共通の時系列変化（初期は基本値への相対オフセット） |
| Individual Animation | 特定図形の**同一プロパティのみ** Child Animation より優先。その他のプロパティは共通値を維持 |
| Static Override | 動画評価の前の**基本状態**を変更。Child Animation の相対変化を受ける |

- Stagger のローカル時刻は `localTimeMs = timeMs - index * staggerMs`。
- 各時刻を直接評価して再生・停止・シークの表示を一致させる。
- 座標系の原点／回転基準（ピボット）と変換順序は、実装を始める際にテスト可能な定義として固定する。初期案は**図形中心をピボット**、親変換を子のローカル変換の後に適用する。
- スケールが0のように逆変換できない場合は、安全に編集を制限し、誤った保存データを作らない。

## 6. Editor UI と操作

```text
┌────────────────────────────────────────────────────────────┐
│ Transition Editor  [新規] [保存] [JSON出力] [JSON読込]       │
├──────────────┬────────────────────────┬────────────────────┤
│ レイヤー     │ プレビュー             │ プロパティ         │
│ ▼ Group A    │    ▰  ▰  ▰             │ Shape              │
│   ├ Item 00  │      ▰  ▰  ▰           │ Generator          │
│   ├ Item 01  │                        │ Modifier           │
│   └ Item 02  │                        │ Animation          │
│ □ Shape B    │ [再生] [停止]           │                    │
├──────────────┴────────────────────────┴────────────────────┤
│ タイムライン  0ms           400ms           800ms          │
│ Group A      ◆─────────────◆                                │
│   Position   ◆──────◆                                       │
│ Shape B          ◆─────────────────◆                        │
└────────────────────────────────────────────────────────────┘
```

- **Layer Panel**：Shape / Group / 生成された子の選択、階層表示、追加・削除・複製。
- **Preview**：16:9、選択・ドラッグ移動・拡縮・回転。直接操作は後半Phaseで実装。
- **Property Panel**：Shape / Generator / Modifier / Animation を選択対象ごとに編集。Groupの子ではOverridesを編集。
- **Timeline**：再生ヘッド、キーフレームの追加・削除・時刻・補間、Group/Child/Individualトラック。後半Phaseでドラッグ編集を追加。
- **ベース編集／キーフレーム編集**を分離。プロパティ変更だけでキーフレームを勝手に追加しない。
- 編集時は最終表示値を入力し、内部のオフセットや親変換への逆算はシステム側で行う。

## 7. Presentation への結合

```text
Slide A 表示
  → 次へ操作
  → 指定された Transition を再生
  → cover または意匠で画面が不透明になった時点
  → switchAtMs で DOM を Slide B に切り替え（1回だけ）
  → アニメーション後半を再生
  → Canvasを透明に戻し Slide B を表示
```

- スライドごとに**次のスライドへ進む際の** `transitionId` を割り当てる。
- 連打時の二重遷移を防ぎ、演出失敗時にもスライド操作を継続できるようにする。
- Editor のシークではスライドを変更しない。
- 発表本番ではネット接続がなくても動作するビルドを目標とする。

## 8. 保存と整合性

- JSON構造は `schemaVersion` で管理する。
- `localStorage` に**編集後約500msのデバウンス自動保存**。起動時に復元。
- プロジェクト単位の JSON エクスポート／インポートに対応。インポートは**検証してから**既存データへ反映する。
- 保存容量超過、JSONパースエラー、未対応スキーマに対してデータを破壊しない失敗処理を用意する。
- Editor の現在選択・再生位置などは基本的に Project 保存対象外。
- GUIからソースコードを直接編集せず、必要ならエクスポートしたJSONをGit管理する。

## 9. 初期ディレクトリ方針（案）

```text
src/
├── domain/
│   ├── project/
│   └── transition/
│       ├── generators/
│       ├── modifiers/
│       ├── animation/
│       └── evaluate.js
├── renderer/
│   └── three/
├── editor/
│   ├── components/
│   ├── composables/
│   └── views/
└── presentation/
    ├── components/
    └── views/
```

これは厳密なディレクトリ命令ではない。**Phase 0では既存構成を確認し、必要最低限のファイルから始める**。

## 10. 実装上の検証観点

- Generatorの個数・位置・IDが安定している。
- Modifierの値が再現可能で、登録順の優先順位が正しい。
- Overridesは生成ルール変更後も対応する子に維持される。
- Group/Child/Individualの変換・時間差・優先順位が仕様どおり。
- 同じ時刻・同じ入力なら描画状態が同じ。
- キーフレームの開始・中間・終了・範囲外の補間が正しい。
- スライド切り替え時に背後の内容が不用意に見えない。
- UI操作とJSON再読み込みで状態が一致する。

## 11. 当面の非対象

- ShapeGroupの多階層ネスト
- 物理演算・衝突判定
- 動画・PDF・PowerPointエクスポート
- 本格的なスライド本文のGUIエディタ
- クラウド同期・認証・共同編集
- 複数描画バックエンドの独自実装
