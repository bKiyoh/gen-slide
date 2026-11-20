<script setup>
import { getGeneratorCount } from '../../domain/transition/generators.js'
defineProps({ editor: Object })
const itemId = index => `item-${String(index).padStart(3, '0')}`
</script>
<template>
  <section class="editor-panel layer-panel" aria-labelledby="layers-title">
    <div class="panel-heading"><h2 id="layers-title">レイヤー</h2><small>対象を選ぶ</small></div>
    <div class="panel-body">
    <div class="editor-actions layer-add-actions"><button type="button" :disabled="!editor.transition" @click="editor.addLayer('shape')">図形追加</button><button type="button" :disabled="!editor.transition" @click="editor.addLayer('group')">グループ追加</button></div>
    <div class="layer-list">
      <p v-if="!editor.transition?.layers.length" class="control-note">図形を追加して制作を始めます。</p>
      <div v-for="(layer, layerIndex) in editor.transition?.layers" :key="layer.id" class="layer-entry">
        <button class="layer-row" :data-layer-id="layer.id" :title="layer.id" :aria-pressed="editor.selection?.layerId === layer.id && !editor.selection?.itemId" @click="editor.selectLayer(layer.id)"><span aria-hidden="true">{{ layer.kind === 'group' ? '▦' : '▰' }}</span> {{ layer.kind === 'group' ? 'グループ' : '図形' }} {{ layerIndex + 1 }}</button>
        <details v-if="layer.kind === 'group'" class="layer-children"><summary>{{ getGeneratorCount(layer.generator) }} 個の図形</summary>
          <button v-for="index in getGeneratorCount(layer.generator)" :key="index" :title="itemId(index - 1)" class="layer-row child-row" :aria-pressed="editor.selection?.layerId === layer.id && editor.selection?.itemId === itemId(index - 1)" @click="editor.selectLayer(layer.id, itemId(index - 1))">図形 {{ index }} <span v-if="layer.overrides[itemId(index - 1)]" class="override-dot" title="個別設定あり">●</span></button>
        </details>
      </div>
    </div>
    <div class="editor-actions layer-actions"><button type="button" :disabled="!editor.selection" @click="editor.copyLayer">複製</button><button type="button" class="button-danger" :disabled="!editor.selection" @click="editor.removeLayer">削除</button><button type="button" :disabled="!editor.selection" @click="editor.moveLayer(-1)">奥へ</button><button type="button" :disabled="!editor.selection" @click="editor.moveLayer(1)">手前へ</button></div>
    <p v-if="editor.selection?.itemId" class="control-note">複製・削除・順序変更は親Groupに適用します。</p>
    </div>
  </section>
</template>
