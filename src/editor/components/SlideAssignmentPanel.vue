<script setup>
import { nextId } from '../../domain/project/project.js'
import { addPresentationSample } from '../../domain/project/presentationSample.js'
import { SLIDE_OPTIONS } from '../../presentation/slideOptions.js'
const props = defineProps({ editor: { type: Object, required: true } })
function addSlide() {
  let id
  if (props.editor.commit(project => {
    id = nextId(project, 'slide')
    project.slides.push({ id, component: 'ContentSlide', transitionId: null })
  })) props.editor.selectSlide(id)
}
function addSample() {
  const index = props.editor.project.slides.length
  if (props.editor.commit(addPresentationSample)) props.editor.selectSlide(props.editor.project.slides[index].id)
}
function updateSlide(id, property, value) {
  if (props.editor.commit(project => { project.slides.find(slide => slide.id === id)[property] = value })) props.editor.selectSlide(id)
}
function move(project, index, direction) { const target = index + direction; [project.slides[index], project.slides[target]] = [project.slides[target], project.slides[index]] }
</script>
<template>
  <details class="transition-settings slide-assignments">
    <summary>発表構成 <span>{{ editor.project.slides.length }} スライド · 次へ進む演出を割り当て</span></summary>
    <div class="transition-settings-content">
      <p class="control-note">内容・演出を変更すると、下のプレビューも切り替わります。「プレビュー」で設定済みの行を確認できます。各行の演出は、そのスライドから次へ進むときに再生します。</p>
      <div v-for="(slide, index) in editor.project.slides" :key="slide.id" class="slide-assignment-row" :data-preview="editor.previewSlide?.id === slide.id">
        <strong>{{ String(index + 1).padStart(2, '0') }}</strong>
        <label><span class="field-label">スライド</span><select :aria-label="`スライド${index + 1}の内容`" :value="slide.component" @change="updateSlide(slide.id, 'component', $event.target.value)"><option v-if="!SLIDE_OPTIONS.some(option => option.key === slide.component)" :value="slide.component">未登録: {{ slide.component }}</option><option v-for="option in SLIDE_OPTIONS" :key="option.key" :value="option.key">{{ option.name }}</option></select></label>
        <label><span class="field-label">次へ進む演出{{ index === editor.project.slides.length - 1 ? '（最終ページでは再生しません）' : '' }}</span><select :aria-label="`スライド${index + 1}の演出`" :value="slide.transitionId ?? ''" @change="updateSlide(slide.id, 'transitionId', $event.target.value || null)"><option value="">即時切替</option><option v-for="transition in editor.project.transitions" :key="transition.id" :value="transition.id">{{ transition.name }}</option></select></label>
        <div class="editor-actions"><button :aria-label="`スライド${index + 1}をプレビュー`" :aria-pressed="editor.previewSlide?.id === slide.id" @click="editor.selectSlide(slide.id)">プレビュー</button><button :disabled="index === 0" :aria-label="`スライド${index + 1}を上へ`" @click="editor.commit(p => move(p, index, -1))">↑</button><button :disabled="index === editor.project.slides.length - 1" :aria-label="`スライド${index + 1}を下へ`" @click="editor.commit(p => move(p, index, 1))">↓</button><button class="button-danger" :aria-label="`スライド${index + 1}を削除`" @click="editor.commit(p => { p.slides.splice(index, 1) })">削除</button></div>
      </div>
      <p v-if="!editor.project.slides.length" class="control-note">発表するスライドがありません。サンプルを追加すると3枚・2種類の演出を試せます。</p>
      <div class="editor-actions"><button @click="addSlide">スライド追加</button><button @click="addSample">発表サンプルを追加（3枚・2演出）</button></div>
    </div>
  </details>
</template>
