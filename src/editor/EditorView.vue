<script setup>
import { computed, nextTick, provide, ref } from 'vue'
import { useEditor } from './useEditor.js'
import ShapePreview from '../components/ShapePreview.vue'
import NumberSlider from '../components/NumberSlider.vue'
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
defineEmits(['present', 'compare-designs'])
const e = useEditor(props.initialProject)
provide('editorGesture', { begin: e.beginGesture, end: e.endGesture, cancel: e.cancelGesture })
defineExpose({ getProject: () => JSON.parse(JSON.stringify(e.project)), flush: e.flush })
const previewVisible = ref(true)
const previewPanel = ref(null)
async function previewDesign({ play, timeMs }) {
  previewVisible.value = true
  await nextTick()
  previewPanel.value?.scrollIntoView({ block: 'start' })
  if (play) e.play()
  else e.seek(timeMs)
}
const previewComponent = computed(() => resolveSlide(e.previewSlide?.component))
const previewCaption = computed(() => {
  if (!e.previewSlide) return ''
  const index = e.project.slides.findIndex(slide => slide.id === e.previewSlide.id)
  const name = SLIDE_OPTIONS.find(option => option.key === e.previewSlide.component)?.name ?? '未登録スライド'
  return `スライド ${index + 1} · ${name} / ${e.transition?.name ?? '即時切替（演出なし）'}`
})
const selectedIds = computed(() => !e.selection ? [] : [e.selection.itemId ? `${e.selection.layerId}/${e.selection.itemId}` : e.selection.layerId])
function setDuration(value) {
  e.editTransition(t => { t.durationMs = value; t.switchAtMs = Math.min(t.switchAtMs, value) })
}
</script>
<template>
  <main class="transition-editor">
    <header class="page-header editor-header">
      <div><p class="eyebrow">GENERATIVE SLIDE / PHASE 3</p><h1>Transition Editor</h1></div>
      <div class="editor-actions project-actions">
        <span class="save-status" :data-state="e.saveStatus.state" role="status">{{ e.saveStatus.message }}</span>
        <button type="button" :disabled="!e.canUndo" title="Ctrl/Cmd+Z" @click="e.undo">元に戻す</button>
        <button type="button" :disabled="!e.canRedo" title="Ctrl/Cmd+Shift+Z" @click="e.redo">やり直す</button>
        <button type="button" class="button-primary" @click="$emit('present')">発表する</button>
        <button type="button" @click="e.exportProject">JSON出力</button>
        <label class="file-button">JSON読込<input id="project-import" type="file" accept=".json,application/json" @change="e.prepareImport($event.target.files[0]); $event.target.value = ''" /></label>
      </div>
    </header>
    <div v-if="e.error" class="input-warning" role="alert">{{ e.error }}</div>
    <div v-if="e.storageBlocked" class="input-warning">元の保存データを保護するため自動保存を保留しています。JSON出力で現在の作業を退避できます。<button @click="e.retryRestore">保存データを再取得</button></div>
    <button v-else-if="e.saveStatus.state === 'error'" @click="e.retrySave">現在の編集内容で保存を再試行</button>
    <section v-if="e.pendingImport" class="import-review" aria-label="JSON読込の確認"><p>{{ e.pendingImport.name }} — 検証済み。Transition {{ e.pendingImport.project.transitions.length }} 件、Slide {{ e.pendingImport.project.slides.length }} 件。</p><p>適用すると現在のProjectを置き換えます。必要なら先にJSON出力してください。</p><div class="editor-actions"><button @click="e.applyImport">このJSONで置き換える</button><button @click="e.pendingImport = null">キャンセル</button></div></section>
    <section class="transition-toolbar" aria-label="Transition管理">
      <label for="transition-select"><span class="field-label">編集中のTransition</span><select id="transition-select" :value="e.transitionId" @change="e.selectTransition($event.target.value)"><option v-for="transition in e.project.transitions" :key="transition.id" :value="transition.id">{{ transition.name }}</option><option v-if="!e.transition" value="">{{ e.previewSlide ? '即時切替（演出なし）' : 'Transitionなし' }}</option></select></label>
      <div class="editor-actions transition-actions">
        <button type="button" class="button-primary" @click="e.addTransition">新規Transition</button>
        <button type="button" :disabled="!e.transition" @click="e.copyTransition">Transition複製</button>
        <button type="button" class="button-danger" :disabled="!e.transition" @click="e.removeTransition">Transition削除</button>
      </div>
    </section>
    <DesignLibrary :editor="e" @compare="$emit('compare-designs', $event)" @preview="previewDesign" />
    <details v-if="e.transition" :key="e.transitionId" class="transition-settings">
      <summary>Transition設定 <span>名前・長さ・切替時刻</span></summary>
      <div class="transition-settings-content">
        <div class="transition-settings-grid">
          <EditorField id="transition-name" :value="e.transition.name" label="名前" text @change="e.editTransition(t => { t.name = $event })" />
          <EditorField id="transition-duration" :value="e.transition.durationMs" label="長さ" unit="ms" :min="0" :max="Number.MAX_SAFE_INTEGER" :slider-max="5000" @change="setDuration" />
          <EditorField id="transition-switch" :value="e.transition.switchAtMs" label="切替時刻" unit="ms" :min="0" :max="e.transition.durationMs" @change="e.editTransition(t => { t.switchAtMs = $event })" />
        </div>
        <p class="control-note">切替時刻に次のスライドへ進みます。図形が画面全体を覆っていなくても演出を再生します。長さを短縮すると切替時刻も範囲内へ調整します。</p>
      </div>
    </details>
    <SlideAssignmentPanel :editor="e" />
    <div class="editor-grid">
      <LayerPanel :editor="e" />
      <section ref="previewPanel" class="editor-panel editor-preview" aria-labelledby="editor-preview-title"><div class="section-header panel-heading"><h2 id="editor-preview-title">プレビュー</h2><button type="button" @click="previewVisible = !previewVisible">{{ previewVisible ? 'プレビューを停止' : 'プレビューを開始' }}</button></div>
        <div class="preview-tools"><label><span>クリックで選択</span><select id="preview-pick-mode" v-model="e.pickMode"><option value="child">個別の図形</option><option value="group">Group全体</option></select></label><span>ドラッグで移動 · 四隅で拡縮 · 丸で回転</span></div>
        <p class="editor-slide-note">図形は中心、Group全体は親の位置（金色の点）を基準に変形します。</p>
        <div v-if="e.previewSlide" class="editor-slide-context"><span data-testid="preview-context">{{ previewCaption }}</span><button type="button" @click="e.selectTransition(e.transitionId)">演出のみを表示</button></div>
        <ShapePreview v-if="previewVisible" :key="e.previewSlide ? 'slide' : 'transition'" :shapes="e.renderShapes" :selected-ids="selectedIds" :transparent="Boolean(e.previewSlide)">
          <template v-if="e.previewSlide" #background><div class="editor-slide-background" :data-preview-slide="e.previewSlide.id"><component :is="previewComponent" v-if="previewComponent" /><article v-else class="slide-content slide-unknown"><h1>未登録のスライドです</h1><p>{{ e.previewSlide.component }}</p></article></div></template>
          <template #interaction="{ fit }"><PreviewInteraction :editor="e" :fit="fit" /></template>
        </ShapePreview><div v-else class="preview-stopped">プレビュー停止中</div>
        <p v-if="e.previewSlide" class="editor-slide-note">選んだスライドに演出を重ねて表示します。スライド間の切替は「発表する」で確認できます。</p>
        <div class="preview-caption"><span class="preview-selection">1920 × 1080 · {{ e.selection?.itemId ?? e.selection?.layerId ?? '選択なし' }}</span><span class="preview-time">{{ Math.round(e.timeMs) }} ms</span></div>
        <div class="playback-controls"><div class="transport-buttons"><button type="button" class="button-primary" :disabled="!e.transition" @click="e.play"><span aria-hidden="true">▶</span> 再生 / 再開</button><button type="button" :disabled="!e.playing" @click="e.pause">一時停止</button><button type="button" @click="e.stop">停止・先頭へ</button></div><span class="playback-state" data-testid="playback-state">{{ e.playing ? '再生中' : '停止中' }}</span></div>
        <NumberSlider id="editor-time" :model-value="Math.round(e.timeMs)" label="現在時刻" unit="ms" :min="0" :max="e.transition?.durationMs ?? 0" @update:model-value="e.seek" />
        <p class="editor-history-note">履歴 {{ e.historyState.undoCount }} / {{ e.historyState.limit }} 件 · Escで操作をキャンセル。履歴は再読込・JSON読込・保存データ再取得でリセットします。</p>
      </section>
      <PropertyPanel :editor="e" />
      <TimelinePanel :editor="e" />
    </div>
  </main>
</template>
