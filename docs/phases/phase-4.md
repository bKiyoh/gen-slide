# Phase 4 — Presentation連携・スライド間Transition

**Codexへの実装指示。Phase 3承認後に着手し、Phase 5以降には進まないこと。**

## 0. 前提

`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、本書を読む。Phase 3のProject永続化、Transition再生・評価API、Renderer破棄処理を確認する。

## 1. 目的

**Vueのスライド1 → 独立したTransition → スライド2**を実現し、LTで発表に使えるPresentationを完成させる。作成した複数Transitionをスライド間に割り当て、指定時刻で一度だけDOMを変更する。2026-11-19のユーザーフィードバックを受け、単色coverと全画面遮蔽の必須条件を廃止し、遮蔽を演出の表現に任せる仕様へ改訂した。

## 2. SlideとProjectの契約

```js
const slides = [
  { id: 'slide-001', component: 'TitleSlide', transitionId: 'transition-001' },
  { id: 'slide-002', component: 'ContentSlide', transitionId: 'transition-002' },
  { id: 'slide-003', component: 'ClosingSlide', transitionId: null }
]
```

- `component` は**登録されたVueコンポーネントを指す文字列キー**。JSONへVueコンポーネントそのものを入れない。
- Presentation側にキー→Vueコンポーネントの明示的なレジストリを置き、**インポートした不明なキーを任意コード実行に使わない**。
- `transitionId` は**そのスライドから次に進むとき**に再生するTransitionを表す。
- 最終スライドの`transitionId`はnullでよい。
- Transitionが未設定／存在しない場合は即時に次スライドへ切り替え、エラーで停止しない。
- Slideが削除されても参照整合性を検証し、存在しないIDは安全に扱う。

## 3. 表示・レンダリング構成

- Vueで16:9のスライドDOMを描画する。
- Transition用のThree.js Canvasはスライドより前面に**単一の描画レイヤー**として重ねる。
- 何も再生していない場合、Canvasは透明／非表示とし、スライド本文のクリックや操作を妨げない。
- Transition Editorと同じ論理座標（1920×1080）、同じEvaluator／Rendererを使う。
- スライドのサイズ変更・全画面表示にCanvasが等比追従し、スライドと演出の位置がずれない。
- スライドとCanvasの拡大倍率・余白・DPRの扱いを統一する。

## 4. 遷移の状態機械

最低限、以下を区別する。

```text
idle (Slide A)
  → transitioning (Transition再生中)
      → switchAtMs到達: DOMをSlide Bへ1回変更
      → finish: Canvasを透明へ戻す
  → idle (Slide B)
```

- 次へ進む入力で、出発スライドの`transitionId`を取得し、対応するTransitionを**時刻0**から再生する。
- 再生時刻は実経過時間を基準とし、フレームレートの違いに影響されない。
- Transitionの`switchAtMs`で**新スライドへ一度だけ**切り替える。描画フレームを飛ばしてswitch時刻を跨いだときも1回だけ実行する。
- 全画面遮蔽を再生の条件にしない。部分的な図形や透明な図形の演出もそのまま再生する。
- 単色coverのUI・描画は提供しない。旧JSONのcoverは保持して読み込めるが、描画と再生条件には使わない。
- 再生終了後、Canvasを非表示／透明へ戻し、入力受付を復帰する。
- durationMsとswitchAtMsが不正なデータは再生前に拒否し、フォールバックへ進む。旧coverの設定で再生を止めない。
- 高速な連続操作中は**一つのTransitionだけ実行**し、多重再生・二重スライド変更を防止する。

## 5. 操作仕様

- キーボード：右矢印／Space／PageDownで次、左矢印／PageUpで前（入力フォームにフォーカスがあるときの競合を考慮）。
- 全画面開始／終了（ブラウザFullscreen API）。失敗時にはエラーメッセージを表示し、通常表示で発表可能にする。
- 現在ページ番号／全ページ数、前後移動ボタンを表示する（発表ビューでは任意に非表示にできる）。
- 最初のスライドで前へ、最後のスライドで次へ、の操作は何もしない。
- **前のスライドへ戻る場合**：今回の最小仕様では、**即時切り替え**を採用する。Transitionの逆再生は扱わない。将来、逆向き演出を別設計で追加できる構成にする。
- 遷移中の入力は無視するかキューイングするかを固定し、挙動をUIとテストで明示する（初期推奨：無視する）。

## 6. データの選択・再利用

- Transition Editorで作成したProjectの `slides` と `transitions` をPresentationで読み込む。
- 初期サンプルとして**3枚以上のVueスライド**を用意する。
- 最低2種類のTransitionを、それぞれ別のスライド間に割り当てる。
- Editor側でTransitionを修正し保存すると、次回Presentation起動時に反映される。
- JSONファイルから読み込んだProjectでも同様に動作する。
- PresentationはEditor固有の選択状態やUIに依存しない。

## 7. 失敗時とオフライン動作

- WebGPU初期化失敗／Rendererエラー／無効なTransition参照時も、**スライド本文を進められる**ようにする。
- Transition開始前エラーは即時切替にフォールバック。再生途中エラーは最終的な行先スライドを確定してCanvasを解除する。
- 非同期の初期化・アンマウント・高速操作で残ったRAFやイベントリスナーを破棄する。
- フォールバック発生時は開発者が原因を追えるようにしつつ、発表時の画面をブロックしない。
- `npm run build`等で生成された配布物が**ネット接続なしで実行できること**を確認する。CDN上のフォントや画像に依存しない。使用中のVite構成に合わせて静的配信の確認手順を示す。

## 8. テストシナリオ

1. Slide 1→Transition A→Slide 2→Transition B→Slide 3。
2. Transition AとBの再生内容が異なる。
3. `switchAtMs`前はSlide 1、到達後はSlide 2がDOM上の表示対象になる。
4. coverなし・全画面を覆わない演出も再生し、指定時刻で切り替える。旧coverがONでも単色幕を挿入しない。
5. キー連打しても一度しかスライドが切り替わらない。
6. 前へ戻る操作は即時に反映される。
7. 最初／最後のページ境界が正しい。
8. Renderer初期化失敗を模擬して、通常スライド切替にフォールバックする。
9. 再生中アンマウント→再マウントしても描画・入力が重複しない。
10. オフラインで本番ビルドのスライドが動作する。

## 9. 今回実装しないもの

本格的なスライド本文エディタ、PowerPoint/PDF/動画書出し、スライドの3D変形、音声同期、逆再生Transition、キーフレームドラッグ、Undo/Redo。

## 10. 完了条件

- [ ] 3枚以上のサンプルスライドをVueで表示できる。
- [ ] 異なるTransitionを2つ以上のスライド間へ割り当てられる。
- [ ] `switchAtMs`に合わせて1度だけDOMスライドが切り替わる。
- [ ] 遮蔽条件で演出を止めず、単色の幕を挿入しない。
- [ ] キーボード、前後移動、全画面を利用できる。
- [ ] 遷移中の多重操作を防止している。
- [ ] Renderer失敗時にも発表を継続できる。
- [ ] 本番ビルドがオフラインで動作する。
- [ ] 自動テストとブラウザ確認の結果を報告した。
- [ ] Phase 5以降に進んでいない。

## 11. 完了報告・Codexへの依頼文

状態遷移図、指定時刻でのDOM切替と旧cover互換の実装、失敗時の動き、オフライン検証、コマンド実行場所を報告する。既知の表示差やブラウザ制限があれば未検証として明記する。

> Phase 4を実装してください。`AGENTS.md`、`docs/DESIGN.md`、`docs/SPECIFICATION.md`、`docs/phases/phase-4.md`を確認し、Phase 3で保存できるTransitionをVueスライド間に適用してください。最低3枚のスライドと2種類のTransitionを用意し、動作確認後に停止してください。
