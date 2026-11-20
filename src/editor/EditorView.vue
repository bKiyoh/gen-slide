<script setup>
import { computed, nextTick, provide, ref } from 'vue'
import { useEditor } from './useEditor.js'
import ShapePreview from '../components/ShapePreview.vue'
import EditorField from './components/EditorField.vue'
import LayerPanel from './components/LayerPanel.vue'
import PropertyPanel from './components/PropertyPanel.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import SlideAssignmentPanel from './components/SlideAssignmentPanel.vue'
import PreviewInteraction from './components/PreviewInteraction.vue'
import DesignLibrary from './components/DesignLibrary.vue'
import { resolveSlide } from '../presentation/slideRegistry.js'
import { SLIDE_OPTIONS } from '../presentation/slideOptions.js'
import './editor.css'
const props = defineProps({ initialProject: Object })
const emit = defineEmits(['present', 'compare-designs', 'sample'])
const e = useEditor(props.initialProject)
provide('editorGesture', { begin: e.beginGesture, end: e.endGesture, cancel: e.cancelGesture })
defineExpose({ getProject: () => JSON.parse(JSON.stringify(e.project)), flush: e.flush })
const previewVisible = ref(true)
const previewExpanded = ref(false)
const tool = ref('library')
const toolsDialog = ref(null)
const toolTitles = { library: '素材から追加', slides: 'スライドに演出を割り当て', settings: '演出設定', file: 'ファイル', help: '操作ガイド・開発用サンプル' }
async function openTool(name) {
  e.endGesture()
  e.pause()
  tool.value = name
  await nextTick()
  if (!toolsDialog.value.open) toolsDialog.value.showModal()
}
function closeTool() { toolsDialog.value.close() }
function previewDesign({ play, timeMs }) {
  closeTool()
  previewVisible.value = true
  if (play) e.play()
  else e.seek(timeMs)
}
function compareDesigns(project) { closeTool(); emit('compare-designs', project) }
const previewComponent = computed(() => resolveSlide(e.previewSlide?.component))
const previewCaption = computed(() => {
  if (!e.previewSlide) return ''
  const index = e.project.slides.findIndex(slide => slide.id === e.previewSlide.id)
  const name = SLIDE_OPTIONS.find(option => option.key === e.previewSlide.component)?.name ?? '未登録スライド'
  return 'スライド ' + (index + 1) + ' · ' + name + ' / ' + (e.transition?.name ?? '即時切替（演出なし）')
})
const selectedIds = computed(() => !e.selection ? [] : [e.selection.itemId ? e.selection.layerId + '/' + e.selection.itemId : e.selection.layerId])
function setDuration(value) { e.editTransition(t => { t.durationMs = value; t.switchAtMs = Math.min(t.switchAtMs, value) }) }
function importFile(event) { e.prepareImport(event.target.files[0]); event.target.value = '' }
function applyImport() { e.applyImport(); closeTool() }
</script>
<template>
  <main class="transition-editor">
    <header class="editor-header">
      <div class="editor-brand"><h1>演出エディター</h1><button type="button" @click="openTool('file')">ファイル</button><button type="button" @click="openTool('help')">使い方</button></div>
      <div class="editor-actions project-actions">
        <span class="save-status" :data-state="e.saveStatus.state" role="status">{{ e.saveStatus.message }}</span>
        <button type="button" :disabled="!e.canUndo" title="Ctrl/Cmd+Z" @click="e.undo">元に戻す</button>
        <button type="button" :disabled="!e.canRedo" title="Ctrl/Cmd+Shift+Z" @click="e.redo">やり直す</button>
        <button type="button" class="button-primary" @click="$emit('present')">発表する</button>
      </div>
    </header>
    <section class="transition-toolbar" aria-label="演出の管理">
      <label for="transition-select"><span>編集中の演出</span><select id="transition-select" :value="e.transitionId" @change="e.selectTransition($event.target.value)"><option v-for="transition in e.project.transitions" :key="transition.id" :value="transition.id">{{ transition.name }}</option><option v-if="!e.transition" value="">{{ e.previewSlide ? '即時切替（演出なし）' : '演出なし' }}</option></select></label>
      <div class="editor-actions transition-actions">
        <button type="button" @click="e.addTransition">新規演出</button>
        <button type="button" @click="openTool('library')">素材から追加</button>
        <button type="button" @click="openTool('slides')">スライドに割当</button>
        <button type="button" :disabled="!e.transition" @click="openTool('settings')">演出設定・その他</button>
      </div>
    </section>
    <div v-if="e.error || e.storageBlocked || e.saveStatus.state === 'error'" class="editor-notices">
      <div v-if="e.error" class="input-warning" role="alert">{{ e.error }}</div>
      <div v-if="e.storageBlocked" class="input-warning">元の保存データを保護するため自動保存を保留中。ファイルからJSON出力で退避できます。<button @click="e.retryRestore">保存データを再取得</button></div>
      <button v-else-if="e.saveStatus.state === 'error'" @click="e.retrySave">現在の編集内容で保存を再試行</button>
    </div>
    <div class="editor-grid" :class="{ 'preview-enlarged': previewExpanded }">
      <LayerPanel :editor="e" />
      <PropertyPanel :editor="e" />
      <aside class="editor-sidebar" aria-label="プレビューと演出設定">
        <section class="editor-panel editor-preview" aria-labelledby="editor-preview-title">
          <div class="panel-heading"><h2 id="editor-preview-title">プレビュー</h2><select id="preview-pick-mode" v-model="e.pickMode" aria-label="プレビューで選択する対象"><option value="child">個別の図形</option><option value="group">グループ全体</option></select><button type="button" :aria-pressed="previewExpanded" @click="previewExpanded = !previewExpanded">{{ previewExpanded ? '縮小' : '拡大' }}</button></div>

          <ShapePreview v-if="previewVisible" :key="e.previewSlide ? 'slide' : 'transition'" :shapes="e.renderShapes" :selected-ids="selectedIds" :transparent="Boolean(e.previewSlide)">
            <template v-if="e.previewSlide" #background><div class="editor-slide-background" :data-preview-slide="e.previewSlide.id"><component :is="previewComponent" v-if="previewComponent" /><article v-else class="slide-content slide-unknown"><h1>未登録のスライドです</h1><p>{{ e.previewSlide.component }}</p></article></div></template>
            <template #interaction="{ fit }"><PreviewInteraction :editor="e" :fit="fit" /></template>
          </ShapePreview><div v-else class="preview-stopped">描画を停止中。「使い方」から再開できます。</div>
          <div v-if="e.previewSlide" class="editor-slide-context"><span data-testid="preview-context" :title="previewCaption">{{ previewCaption }}</span><button type="button" @click="e.selectTransition(e.transitionId)">演出のみ</button></div>
          <div v-else class="preview-caption"><span>1920 × 1080 · 16:9</span><span data-testid="playback-state">{{ e.playing ? '再生中' : '停止中' }}</span></div>
          <div class="playback-controls"><button type="button" class="button-primary" :disabled="!e.transition" @click="e.play">再生 / 再開</button><button type="button" :disabled="!e.playing" @click="e.pause">一時停止</button><button type="button" @click="e.stop">停止・先頭へ</button></div>
        </section>
        <button type="button" class="transition-quick-settings" :disabled="!e.transition" @click="openTool('settings')"><strong>演出設定</strong><span>長さ {{ e.transition?.durationMs ?? 0 }} ms · 切替 {{ e.transition?.switchAtMs ?? 0 }} ms</span></button>
      </aside>
      <TimelinePanel :editor="e" />
    </div>
    <footer class="editor-statusbar"><span>左で対象を選択 · 中央で編集 · 右で再生 · 下で時刻を調整</span><span class="editor-history-note">履歴 {{ e.historyState.undoCount }} / {{ e.historyState.limit }} 件</span><button v-if="e.pendingImport" type="button" @click="openTool('file')">JSON読込の確認待ち</button></footer>
    <dialog ref="toolsDialog" class="editor-dialog" aria-labelledby="editor-dialog-title">
      <header class="dialog-heading"><h2 id="editor-dialog-title">{{ toolTitles[tool] }}</h2><button type="button" @click="closeTool">閉じて編集へ戻る</button></header>
      <div class="dialog-body">
        <DesignLibrary v-show="tool === 'library'" :editor="e" @compare="compareDesigns" @preview="previewDesign" />
        <SlideAssignmentPanel v-show="tool === 'slides'" :editor="e" />
        <section v-if="tool === 'settings'" aria-label="演出設定">
          <template v-if="e.transition">
            <div class="transition-settings-grid"><EditorField id="transition-name" :value="e.transition.name" label="名前" text @change="e.editTransition(t => { t.name = $event })" /><EditorField id="transition-duration" :value="e.transition.durationMs" label="長さ" unit="ms" :min="0" :max="Number.MAX_SAFE_INTEGER" :slider-max="5000" @change="setDuration" /><EditorField id="transition-switch" :value="e.transition.switchAtMs" label="スライド切替時刻" unit="ms" :min="0" :max="e.transition.durationMs" @change="e.editTransition(t => { t.switchAtMs = $event })" /></div>
            <p class="control-note">切替時刻に次のスライドへ進みます。長さを短縮すると切替時刻も範囲内へ調整します。</p>
            <div class="editor-actions"><button type="button" @click="e.copyTransition">演出を複製</button><button type="button" class="button-danger" @click="e.removeTransition">演出を削除</button></div>
          </template><p v-else>演出がありません。「新規演出」から作成できます。</p>
        </section>
        <section v-show="tool === 'file'" aria-label="ファイル操作">
          <p>編集内容はこのブラウザに自動保存されます。別の端末へ持ち運ぶ場合はJSONを保存してください。</p>
          <div class="editor-actions"><button type="button" @click="e.exportProject">JSON出力</button><label class="file-button">JSON読込<input id="project-import" type="file" accept=".json,application/json" @change="importFile" /></label></div>
          <section v-if="e.pendingImport" class="import-review" aria-label="JSON読込の確認"><p>{{ e.pendingImport.name }} — 検証済み。演出 {{ e.pendingImport.project.transitions.length }} 件、スライド {{ e.pendingImport.project.slides.length }} 件。</p><p>適用すると現在のProjectを置き換えます。必要なら先にJSON出力してください。</p><div class="editor-actions"><button @click="applyImport">このJSONで置き換える</button><button @click="e.pendingImport = null">キャンセル</button></div></section>
          <p v-if="e.error" class="input-warning" role="alert">{{ e.error }}</p>
        </section>
        <section v-if="tool === 'help'" aria-label="操作ガイド">
          <ol><li>左のレイヤーで図形またはグループを選びます。</li><li>中央の「見た目を編集」で形・配置・色を調整します。</li><li>「動きを編集」で明示的にキーを追加し、下のタイムラインで時刻を調整します。</li><li>右のプレビューで再生し、「スライドに割当」から発表に使います。</li></ol>
          <p>図形本体をドラッグすると移動、四隅で一様拡縮、丸いハンドルで回転します。グループ全体は親の位置（金色の点）を基準に変形します。選択・再生・シークは履歴を増やしません。</p>
          <p>位置・倍率の直接キー編集には同時刻のX/Yキーが必要です。キーを選ばずにドラッグしてもキーは作成しません。Escで操作を取り消し、Ctrl/Cmd+Zで元に戻せます。</p>
          <p>履歴は再読込・JSON適用・保存データ再取得でリセットされます。プレビューの表示サイズを変更すると、進行中の図形操作は取り消されます。</p>
          <button type="button" @click="previewVisible = !previewVisible">{{ previewVisible ? 'GPU描画を停止' : 'GPU描画を再開' }}</button>
          <label class="development-select"><span class="field-label">開発用サンプル</span><select value="" @change="closeTool(); $emit('sample', $event.target.value)"><option disabled value="">検証画面を選ぶ</option><option value="phase2">Phase 2 · 時刻の評価</option><option value="phase1">Phase 1 · 図形の生成</option><option value="phase0">Phase 0 · 描画基盤</option></select></label>
        </section>
      </div>
    </dialog>
  </main>
</template>
