<script setup>
import { computed, ref } from 'vue'
import { useEditor } from './useEditor.js'
import ShapePreview from '../components/ShapePreview.vue'
import NumberSlider from '../components/NumberSlider.vue'
import EditorField from './components/EditorField.vue'
import LayerPanel from './components/LayerPanel.vue'
import PropertyPanel from './components/PropertyPanel.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import './editor.css'
const e = useEditor()
const previewVisible = ref(true)
const selectedIds = computed(() => !e.selection || e.coverActive ? [] : [e.selection.itemId ? `${e.selection.layerId}/${e.selection.itemId}` : e.selection.layerId])
function setDuration(value) {
  e.editTransition(t => { t.durationMs = value; t.switchAtMs = Math.min(t.switchAtMs, value); t.cover.fromMs = Math.min(t.cover.fromMs, value); t.cover.toMs = Math.min(t.cover.toMs, value) })
}
</script>
<template>
  <main class="transition-editor">
    <header class="page-header editor-header">
      <div><p class="eyebrow">GENERATIVE SLIDE / PHASE 3</p><h1>Transition Editor</h1></div>
      <div class="editor-actions project-actions">
        <span class="save-status" :data-state="e.saveStatus.state" role="status">{{ e.saveStatus.message }}</span>
        <button type="button" @click="e.exportProject">JSON出力</button>
        <label class="file-button">JSON読込<input id="project-import" type="file" accept=".json,application/json" @change="e.prepareImport($event.target.files[0]); $event.target.value = ''" /></label>
      </div>
    </header>
    <div v-if="e.error" class="input-warning" role="alert">{{ e.error }}</div>
    <div v-if="e.storageBlocked" class="input-warning">元の保存データを保護するため自動保存を保留しています。JSON出力で現在の作業を退避できます。<button @click="e.retryRestore">保存データを再取得</button></div>
    <button v-else-if="e.saveStatus.state === 'error'" @click="e.retrySave">現在の編集内容で保存を再試行</button>
    <section v-if="e.pendingImport" class="import-review" aria-label="JSON読込の確認"><p>{{ e.pendingImport.name }} — 検証済み。Transition {{ e.pendingImport.project.transitions.length }} 件、Slide {{ e.pendingImport.project.slides.length }} 件。</p><p>適用すると現在のProjectを置き換えます。必要なら先にJSON出力してください。</p><div class="editor-actions"><button @click="e.applyImport">このJSONで置き換える</button><button @click="e.pendingImport = null">キャンセル</button></div></section>
    <section class="transition-toolbar" aria-label="Transition管理">
      <label for="transition-select"><span class="field-label">編集中のTransition</span><select id="transition-select" :value="e.transitionId" @change="e.selectTransition($event.target.value)"><option v-for="transition in e.project.transitions" :key="transition.id" :value="transition.id">{{ transition.name }}</option><option v-if="!e.project.transitions.length" value="">Transitionなし</option></select></label>
      <div class="editor-actions transition-actions">
        <button type="button" class="button-primary" @click="e.addTransition">新規Transition</button>
        <button type="button" :disabled="!e.transition" @click="e.copyTransition">Transition複製</button>
        <button type="button" class="button-danger" :disabled="!e.transition" @click="e.removeTransition">Transition削除</button>
      </div>
    </section>
    <details v-if="e.transition" :key="e.transitionId" class="transition-settings">
      <summary>Transition設定 <span>名前・長さ・切替時刻・cover</span></summary>
      <div class="transition-settings-content">
        <div class="transition-settings-grid">
          <EditorField id="transition-name" :value="e.transition.name" label="名前" text @change="e.editTransition(t => { t.name = $event })" />
          <EditorField id="transition-duration" :value="e.transition.durationMs" label="長さ" unit="ms" :min="0" :max="Number.MAX_SAFE_INTEGER" :slider-max="5000" @change="setDuration" />
          <EditorField id="transition-switch" :value="e.transition.switchAtMs" label="切替時刻" unit="ms" :min="0" :max="e.transition.durationMs" @change="e.editTransition(t => { t.switchAtMs = $event })" />
        </div>
        <section class="cover-settings" aria-label="スライド切替用の幕の設定">
          <label class="check-field"><input id="cover-enabled" type="checkbox" :checked="e.transition.cover.enabled" @change="e.editTransition(t => { t.cover.enabled = $event.target.checked })" />スライド切替用の幕（cover）を表示</label>
          <p class="control-note">有効区間はプレビュー全体を設定色で覆います。動きだけを確認するときはOFFにできます。</p>
          <div class="transition-settings-grid">
            <EditorField id="cover-color" :value="e.transition.cover.color" label="幕の色 (HEX)" text @change="e.editTransition(t => { t.cover.color = $event })" />
            <EditorField id="cover-from" :value="e.transition.cover.fromMs" label="表示開始" unit="ms" :min="0" :max="e.transition.durationMs" @change="e.editTransition(t => { t.cover.fromMs = $event })" />
            <EditorField id="cover-to" :value="e.transition.cover.toMs" label="表示終了" unit="ms" :min="0" :max="e.transition.durationMs" @change="e.editTransition(t => { t.cover.toMs = $event })" />
          </div>
        </section>
        <p class="control-note">長さの短縮時は切替時刻・coverを範囲内へ調整します。Editorではスライド切替を実行しません。</p>
      </div>
    </details>
    <div class="editor-grid">
      <LayerPanel :editor="e" />
      <section class="editor-panel editor-preview" aria-labelledby="editor-preview-title"><div class="section-header panel-heading"><h2 id="editor-preview-title">プレビュー</h2><button type="button" @click="previewVisible = !previewVisible">{{ previewVisible ? 'プレビューを停止' : 'プレビューを開始' }}</button></div>
        <ShapePreview v-if="previewVisible" :shapes="e.renderShapes" :selected-ids="selectedIds" /><div v-else class="preview-stopped">プレビュー停止中</div>
        <div class="preview-caption"><span class="preview-selection">1920 × 1080 · {{ e.selection?.itemId ?? e.selection?.layerId ?? '選択なし' }}</span><span class="cover-status" :data-active="e.coverActive"><span v-if="e.coverActive" data-testid="cover-active">切替幕 ON</span><span v-else>切替幕 OFF</span></span></div>
        <div class="playback-controls"><div class="transport-buttons"><button type="button" class="button-primary" :disabled="!e.transition" @click="e.play"><span aria-hidden="true">▶</span> 再生 / 再開</button><button type="button" :disabled="!e.playing" @click="e.pause">一時停止</button><button type="button" @click="e.stop">停止・先頭へ</button></div><span class="playback-state" data-testid="playback-state">{{ e.playing ? '再生中' : '停止中' }}</span></div>
        <NumberSlider id="editor-time" :model-value="Math.round(e.timeMs)" label="現在時刻" unit="ms" :min="0" :max="e.transition?.durationMs ?? 0" @update:model-value="e.seek" />
      </section>
      <PropertyPanel :editor="e" />
      <TimelinePanel :editor="e" />
    </div>
  </main>
</template>
