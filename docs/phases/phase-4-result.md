# Phase 4 実装・検証記録

確認日: 2026-11-19。Phase 4で停止し、Phase 5以降は実装していません。

## コミットと今回の範囲

承認済みのPhase 3、暗転原因のcover表示、UI統一、関連する実装記録を `c7ac6ff`（feat: complete Phase 3 editor, persistence, and consistent UI）にコミットしました。Phase 4は承認後、Phase 5着手前に `5dd86f9` へコミット済みです。

今回の実装は、保存済みTransitionをVueスライド間で再生するPresentationです。スライド本文の本格的な編集、直接操作、Undo/Redo、Phase 5以降の機能は追加していません。

## 実装した機能

- タイトル・コンテンツ・クロージングの3枚のVueスライド。初期Projectには別々の演出を割り当てています。
- Diagonal Sweep（平行四辺形の移動・回転・Stagger）とBlock Reveal（青い長方形の拡大・縮小）。元のEditor用Transitionも維持します。
- Editorの「発表構成」で登録済みスライドの選択・追加・削除・順序変更・次へ進むTransitionの割り当て。
- 「発表する」と画面上部の「Phase 4 · Presentation」から発表を開始。保存前に画面を移動しても、最新の確定済みProjectを反映します。
- 出発スライドのTransitionを時刻0から実経過時間で評価し、switchAtMsに一度だけDOMを変更します。
- 透明な単一GPU CanvasをVueスライドDOMへ重ねます。図形が全画面を覆わなくても再生し、終端で演出レイヤーを非表示へ戻します。
- 次へは右矢印・Space・PageDown、前へは左矢印・PageUp。前へ戻る場合は即時切替です。
- 全画面開始・終了、現在ページ番号、前後移動ボタン、操作パネルの表示・非表示。
- 初期化・準備・描画に失敗しても行先へ即時切替し、発表を続けられます。
- 未登録コンポーネントの安全なプレースホルダー、スライド0枚時のEditorへの案内。

## 追補: 発表構成とEditorプレビューの連動

発表構成の変更はProjectと発表画面に反映されていましたが、Editorのプレビューは独立した「編集中のTransition」を表示し続けていました。スライドや割り当て演出を変更してもEditorの表示が変わらず、変更をその場で確認できない状態でした。

内容・演出の選択を変更すると、その行のスライドと割り当てたTransitionをEditorで選び、先頭時刻へ戻してプレビューへ反映するよう修正しました。各行の「プレビュー」ボタンからも選べます。追加したスライド・サンプルも直ちに選択します。

プレビューには選んだVueスライドを背景に表示し、透明なCanvas上へ演出を重ねます。現在のスライド番号・内容・演出名を表示し、「演出のみを表示」または編集中のTransitionの直接選択で従来の図形編集へ戻れます。EditorのシークではスライドのDOMを切り替えず、実際のスライド間切替は「発表する」で確認します。

「即時切替」を選ぶと以前の演出を解除し、スライド本文のみを表示します。選択状態はSlideのIDで保持するため、順序変更後も同じスライドを確認できます。対象を削除した場合は通常の演出編集へ戻ります。プレビュー選択・背景DOM・表示倍率はProjectへ保存しません。

変更ファイルは `src/editor/useEditor.js`、`src/editor/components/SlideAssignmentPanel.vue`、`src/editor/EditorView.vue`、`src/editor/editor.css`、`src/components/ShapePreview.vue`、`tests/editorPreview.test.js` と本記録です。ShapePreviewに背景用スロット・透明描画・同じfitCanvasによる背景の等比表示を追加し、ResizeObserverはアンマウント時に解除します。

Vueのsetupを使う回帰テスト3件を追加し、割り当て演出との同期、内容・即時切替の反映、並べ替え・削除時の選択を確認しました。ChromeのWebGPU / WebGL2の両方で、背景・演出の実画素、プレビュー行の選択、演出解除、追加・並べ替え・削除、幅320〜1600 pxでのCanvasと背景の一致、発表への反映を確認しました。未処理のページ例外は0件です。

## データと保存済み作品の扱い

Slideは `id`・文字列の `component`・次へ進む `transitionId` を保存します。Vueコンポーネントは明示的なレジストリに登録したものだけを使い、JSONの文字列をimportパスやコードとして実行しません。未知の文字列は文字として表示します。

Transitionの参照が未設定なら即時切替です。Projectのインポート時には従来どおり存在しないTransitionへの参照を拒否し、実行時にも参照が消えていた場合は即時切替します。EditorでTransitionを削除すると、そのIDを参照するSlideはnullへ解除されます。

スライド0枚の既存Projectへサンプルを自動追加しません。「発表構成」内の「発表サンプルを追加（3枚・2演出）」で、既存のTransition・Slideを残したまま追加できます。保存済みデータがない初回だけ、3枚と2演出を含むProjectを初期値にします。

Editorを離れる前に自動保存をflushし、プレーンなProjectのスナップショットをAppからPresentationへ渡します。PresentationはEditorの選択・編集モード・再生位置を読みません。保存に失敗しても同じ起動中はメモリーにある確定済み作品を発表できます。Editorへ戻って修正した内容やJSONで適用した内容は、次の発表開始時に反映されます。

## 状態遷移と多重入力

```text
idle / Slide A
  ↓ 次へ（出発スライドのtransitionIdを解決）
transitioning / シェーダー準備（この時点から追加入力を無視）
  ↓ 時刻0から実経過時間で再生
switchAtMsに達した最初のフレームでSlide BへDOMを一度だけ変更
  ↓ 同じ実経過時間の図形を描画し、終端まで再生
Canvasを非表示に戻す
  ↓
idle / Slide B

開始前・再生途中の失敗
  → 行先のSlide Bを確定 → 演出解除 → idle
```

準備中から終了まで追加の次・前の入力を無視します。UIにも「演出中 · 追加入力は無視します」と表示し、ボタンを無効化します。最初・最後の境界では移動しません。入力欄、select、textarea、contenteditable、修飾キー付き入力、キーの自動リピートと競合しません。ボタン上のSpaceはブラウザ標準のクリックとして扱い、二重起動を避けます。

フレーム時刻がswitchAtMsを飛び越しても、最初に到達したフレームで一度だけDOMを変更します。単色の遮蔽フレームや、その表示を維持するRAF待ちは挟みません。シェーダーの準備完了からの実経過時間で評価するため、準備時間はdurationに含みません。

## cover廃止と再生条件の見直し

ユーザーから「coverがないと動かないのは直感的でない」「幕がちらつく」「機能として不要」という指摘と実際のProject JSONを受け、単色cover機能と全画面遮蔽を要求する再生前チェックを廃止しました。最初の実装は「本文の切替を隠す」という要件を、演出を再生するための必須条件にしていたため、部分的な図形の演出をスキップしていました。

添付Projectは4枚で、1→2枚目にBlock Reveal、2→3枚目と3→4枚目に14個の平行四辺形のStaggered sweepを割り当てています。後者はcoverがOFFで全画面を覆わず、従来の判定でスキップされていました。このProjectを回帰テストの素材にして、設定変更なしで全ての割り当て演出を再生できるようにしました。2枚目と3枚目の本文には同じContentSlideが指定されています。

現在は、作った図形とキーフレームをそのまま再生し、指定されたswitchAtMsで次へ進みます。図形の数・大きさ・不透明度で再生を制限しません。画面を覆わない演出では本文の切替が見えます。遮蔽が必要なら、通常のShapeやAnimationで表現できます。

Editorのcoverチェック・色・区間・ON/OFF表示、GPUの追加幕図形、PresentationのDOM幕、遮蔽判定、遮蔽フレーム維持のための待機を削除しました。新しいProject・Transition・サンプルにはcoverを作成しません。時刻や図形データの不正、描画失敗時のフォールバックは維持しています。

旧JSONのcoverは互換性のため保持して読み書きしますが、ON/OFF・色・範囲を描画や再生条件に使いません。旧coverの値がONでも暗い幕を追加しません。ユーザーの元のJSONファイルやブラウザ保存値を外部から書き換えてはいません。インポート、図形の編集、通常の自動保存は従来どおりです。

変更理由と結果を基本設計・製品仕様・Phase 4指示書にも反映しました。Phase 0〜3の記録は当時の実装履歴として保持しています。

## GPU描画とサイズの処理フロー

1. Vueが1920×1080のスライドDOMを用意し、表示領域に同じ16:9の倍率で収めます。
2. Rendererを透明な背景で初期化します。Editor側の背景は従来のままです。
3. 次へ進むとき、switchAtMsの図形を既存Evaluatorで計算し、Three.jsのcompileAsyncでシェーダーを準備します。この準備中はスライドを隠しません。
4. 時刻から図形状態を毎回計算し、同じIDのMesh・Geometry・Materialを更新して描画します。
5. 指定した切替時刻でDOMを一度だけ変更し、終端で演出を解除します。待機中の演出レイヤーはクリックを妨げません。
6. アンマウント時はRAF・キーボード・Fullscreenリスナー・ResizeObserverを解除し、非同期初期化・コンパイルの完了後もGPUリソースを破棄します。

CanvasとDOMに同じfitCanvasを使います。Rendererは小数のCSSサイズも保持し、画面端のずれを抑えます。DPRは既存と同じ最大2倍で、論理座標を変更しません。

Three.js r187の[Renderer公式ソース](https://github.com/mrdoob/three.js/blob/r187/src/renderers/common/Renderer.js)をローカルのインストール済みソースと照合し、compileAsync・alpha・透明なclear・非同期disposeを確認しました。非推奨のrenderAsyncは使わず、init完了後に通常のrenderを呼びます。全画面は[Fullscreen標準](https://fullscreen.spec.whatwg.org/)のAPIを使います。

## 失敗時の動作

| 状況 | 動作 |
|---|---|
| Transition未設定 | 演出せず次へ移動 |
| 存在しないTransition参照 | 原因を表示し、即時切替 |
| Renderer初期化前・初期化失敗 | 即時切替。本文と前後移動は維持 |
| 不正な長さ・切替時刻・図形データ | 開始前に拒否し、即時切替 |
| 画面を覆わない演出・旧coverのON/OFF | 演出をそのまま再生。警告でスキップしない |
| コンパイル・描画失敗・デバイス喪失 | 行先を一度だけ確定し、演出解除 |
| 全画面APIの未対応・拒否 | メッセージを表示し、通常表示で継続 |
| 未登録Slide.component | 安全な文字表示とプレースホルダー。前後移動は継続 |
| 再生中・非同期初期化中のアンマウント | 遅い完了を無視し、Canvas・GPU・イベントを解放 |

## 追加・変更ファイル

| ファイル | 責務 |
|---|---|
| `src/presentation/PresentationView.vue` | スライドDOMと演出レイヤー、サイズ、キー、全画面、破棄 |
| `src/presentation/presentationController.js` | 時刻と状態機械、切替一回保証、多重入力、失敗・破棄 |
| `src/presentation/transitionFrame.js` | 再生時刻の検証と共有Evaluatorによる時刻評価 |
| `src/presentation/slideRegistry.js`, `slideOptions.js` | 明示的なコンポーネント登録とEditorの選択肢 |
| `src/presentation/slides/TitleSlide.vue`, `ContentSlide.vue`, `ClosingSlide.vue` | 3枚のVueサンプル本文 |
| `src/presentation/presentation.css` | 発表画面、16:9のDOM・Canvas、サンプル意匠、割り当てUI |
| `src/domain/project/presentationSample.js` | 既存作品を保持したサンプル追加と初回Project |
| `src/domain/project/project.js` | Slide.componentを文字列キーとして検証 |
| `src/editor/components/SlideAssignmentPanel.vue` | Slide選択、追加・削除・順序変更、演出割り当て |
| `src/editor/useEditor.js`, `EditorView.vue`, `src/App.vue` | 初期Project、最新Projectの受け渡し、発表への移動 |
| `src/renderer/three/createShapeRenderer.js` | 任意の透明背景、compileAsync、コンパイル待ち後の破棄、小数CSSサイズ |
| `tests/presentation.test.js`, `tests/editor.test.js` | 状態遷移・失敗・破棄・Slide契約・旧cover互換の検証 |
| `tests/fixtures/presentation-legacy-cover.json` | 添付された4枚・2演出の回帰テスト素材 |
| `docs/DESIGN.md`, `docs/SPECIFICATION.md`, `docs/phases/phase-4.md` | ユーザーフィードバックによる単色cover廃止・再生条件の改訂 |
| `README.md`, `scripts/build-implementation-report.mjs`, `docs/implementation-report.html` | 操作案内、Phase 4のレポート追加 |

追加依存パッケージと設定変更はありません。Domain / EvaluatorにVue・Three.jsをインポートしていません。

## 自動テストとビルド結果

- `npm test`: **82件成功**。既存67件にPresentation関連12件、Editorプレビュー連動3件を追加しました。
- `npm run build`: **成功**。61 modules、JS約983 kB、gzip約278 kB。従来からの500 kB超のチャンク警告は残っています。
- Lint: 設定がないため未実行。

自動テストでは、サンプルの非破壊追加・ID・JSON往復、component型、時刻の異常、coverなし・部分的な図形の許可、旧cover値が描画へ影響しないこと、switch前後・終端・境界・即時戻り、準備中を含む連打、時刻が5000 ms飛ぶケース、未設定・欠損参照・初期化失敗・描画例外、切替前後のエラー、準備・DOM変更中の破棄、duration/switch=0を確認しています。添付の4枚Projectで全3回の遷移を終端まで再生し、14図形の演出が二回ともスキップされないことを確認しました。

## 実ブラウザの検証結果

Chrome 158.0.8127.36のヘッドレス実行で確認しました。ブラウザ検証用のPlaywrightとpngjsは一時ディレクトリにあるものを使い、プロジェクト依存には追加していません。

| 検証 | 結果 |
|---|---|
| WebGPUで3枚・異なる2演出を再生 | 成功 |
| switch前後のDOM変更をMutationObserverで記録 | 各演出一回。単色幕の挿入なし |
| スライド内の開始ボタンをクリック | 成功。待機中のCanvasはクリックを妨げない |
| 次・前・PageDown・PageUp・Space・境界・連打 | 成功。連打しても一ページだけ進む |
| 入力欄フォーカスとキーの競合 | フォーカス中はスライドが進まない |
| 全画面開始・終了、API拒否の模擬 | 成功。拒否後も通常表示で操作可能 |
| 操作パネルの表示・非表示 | 成功 |
| DPR 2、幅320 / 390 / 768 / 1024 / 1440 px | 16:9、Canvasとスライドの位置、横はみ出しなしを確認 |
| Editorで演出割り当てを変更して再起動 | 即時切替の割り当てが反映 |
| 再生途中にrender例外を発生 | 行先へ切替、演出解除、後続の移動も可能 |
| 再生中にEditorへ戻る・再入場を3回 | キー入力が重複しない。Renderer・GPUDeviceの破棄を記録 |
| initを250 ms遅らせてから即アンマウント | 遅いCanvas追加なし、GPU破棄を記録 |
| WebGPUとWebGL2を両方無効化 | エラーを表示し、次・次・前の通常移動が可能 |
| RAFのtimestampを5000 ms進める | 一度だけDOM変更し、終端で演出解除。単色幕なし |
| 本番ビルドのWebGPU / WebGL2フォールバック | 両方成功。使用バックエンドを画面表示 |
| 添付JSONの4枚・全3回の遷移 | 開発・本番のWebGPU / WebGL2で再生。14図形の演出を二回ともスキップせず、行先へ一度ずつ変更 |
| 旧coverがONの演出を編集 | 青い旧coverを持つBlockの実図形を赤に変更。Editorの実画素は赤で、旧単色幕なし |
| 旧coverがOFFの部分的な図形演出 | 途中・後半の描画が変化し、警告による即時スキップなし |
| 本番のネット切断中に2演出・前へ移動 | WebGPU / WebGL2とも成功。外部HTTPリクエスト0 |
| 未登録キーの文字表示、スライド0枚、サンプル追加 | 成功。JSONの文字列によるスクリプト実行なし |

Renderer変更後の既存Editorについても、本番WebGPU / WebGL2で編集・自動保存からの再読込・再生・プレビュー再起動を確認しました。HTMLレポートはfile://で全5 Phaseの見出し・表・コード・完了チェック、アンカー、390 px表示、印刷ボタンとPDF出力を確認し、外部リクエスト・ページ例外は0件でした。Phase 5〜6は本文のない未着手枠を維持しています。

上記の通常操作と意図した失敗時処理で、未処理のページ例外は0件でした。GPU未対応の模擬では想定した初期化エラーメッセージが発生します。

## 動作確認の手順と実行場所

すべてのコマンドの実行場所は **リポジトリのルート** です。

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

1. 表示されたローカルURLをChromeで開きます。
2. 既存Projectにスライドがない場合は「発表構成」から「発表サンプルを追加（3枚・2演出）」を選びます。
3. 「発表する」で、1→2→3を異なる演出で切り替えます。演出中にキーを連打しても一回だけ進みます。
4. 前へ戻る操作、全画面、操作パネルの非表示・再表示を確認します。
5. Editorへ戻って演出を編集・保存し、もう一度「発表する」で変更を確認します。JSON読込も確認後に適用してから発表できます。
6. オフラインを試す場合は、配信・初回ロード後に開発者ツールでネットワークをOfflineへ変更し、スライドを進めます。

本番ビルドの検証では、外部宛てHTTPを全て遮断し、ローカルHTTP配信で初回ロードした後、ブラウザコンテキストをOfflineへ切り替えて2種類の演出を再生しました。配布物はVue・Three.js・スライド本文・意匠をローカルに含み、フォント・画像・CDNを必要としません。インターネットにつながっていない環境でも、事前に用意したdistをローカルHTTPサーバーから読み込む手順です。

実装記録を再生成する場合も **リポジトリのルート** で実行します。

```sh
npm run docs:report
```

## 制約と次工程への引き継ぎ

- Safari・Firefox・実機モバイル・外部ディスプレイへの発表は未検証です。Fullscreen APIの可否と見え方はブラウザに依存します。
- 実際のGPUデバイス喪失は未検証です。Renderer例外とGPU機能無効化による継続動作は検証しています。
- 図形が全画面を覆わない場合、指定時刻での本文切替が見えます。単色の幕による補完はしません。
- シェーダーの準備時間は演出のdurationに含みません。
- Service Workerによる初回未配信時の起動やfile://による本体起動は対応していません。distのローカルHTTP配信を使います。HTMLレポート自体はfile://で閲覧できます。
- スライド本文はコードで登録したVueコンポーネントです。本文エディタは対象外です。
- Phase 4では停止しています。Phase 5の直接操作・タイムラインドラッグ・Undo/Redoは未着手です。

## 完了条件

- [x] 3枚以上のVueサンプルスライドを表示。
- [x] 異なるTransitionを2つ以上のスライド間へ割り当て。
- [x] switchAtMsに達したフレームで一度だけDOMを変更し、フレーム飛びでも二重切替しない。
- [x] cover機能と遮蔽必須判定を廃止。添付の部分的な14図形の演出も再生。
- [x] キーボード、前後移動、全画面、表示切替に対応。
- [x] 準備中を含めた多重操作を防止。
- [x] Renderer失敗時も発表を継続。
- [x] 本番ビルドをWebGPU・WebGL2の両方でオフライン再生。
- [x] 自動テスト・ビルド・ブラウザ確認を実施。
- [x] Phase 5以降に進まず停止。
