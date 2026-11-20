<script setup>
import { computed, ref, watch } from 'vue'
import { SHAPE_FIELDS, fieldId } from '../fields.js'
import { displayContext } from '../displayValues.js'
import { createSampleGridGenerator, createSampleTransition } from '../../domain/transition/sampleTransition.js'
import EditorField from './EditorField.vue'
import ModifierPanel from './ModifierPanel.vue'
import { SHAPE_LIMITS } from '../../domain/shapes.js'
import { transformMatrix } from '../../domain/transition/transform.js'
const props = defineProps({ editor: Object })
const e = props.editor
const context = computed(() => {
  if (!e.selection) return { values: {}, restrictions: {} }
  try { return displayContext(e.transition, e.selection, e.selection.itemId ? 'individual' : e.layer.kind === 'group' ? 'group' : 'shape', e.timeMs) }
  catch (error) { return { values: {}, restrictions: {}, error: error.message } }
})
const tab = ref('transform')
const selectionLabel = computed(() => {
  const index = e.transition?.layers.findIndex(layer => layer.id === e.selection?.layerId) ?? -1
  const label = (e.layer?.kind === 'group' ? 'グループ ' : '図形 ') + (index + 1)
  return e.selection?.itemId ? label + ' / 図形 ' + (Number(e.selection.itemId.slice(5)) + 1) : label
})
const isGroup = computed(() => e.layer?.kind === 'group' && !e.selection?.itemId)
const tabs = computed(() => isGroup.value
  ? [{ key: 'transform', label: '全体の位置・回転' }, { key: 'template', label: '共通の形' }, { key: 'generator', label: '配置・個数' }, { key: 'modifier', label: '変化の規則' }]
  : [{ key: 'transform', label: '位置・回転' }, { key: 'shape', label: '形・色' }])
const fields = computed(() => SHAPE_FIELDS.filter(field => field.property.startsWith('transform.') === (tab.value === 'transform')))
watch(() => [e.selection?.layerId, e.selection?.itemId], () => { tab.value = 'transform' })
const generatorKeys = computed(() => e.layer?.generator?.type === 'linear' ? ['count', 'startX', 'startY', 'stepX', 'stepY'] : ['rows', 'columns', 'startX', 'startY', 'gapX', 'gapY', 'rowOffsetX', 'columnOffsetY'])
const generatorLabels = { count: '個数', rows: '行数', columns: '列数', startX: '開始 X', startY: '開始 Y', stepX: 'X ステップ', stepY: 'Y ステップ', gapX: 'X 間隔', gapY: 'Y 間隔', rowOffsetX: '行の X オフセット', columnOffsetY: '列の Y オフセット' }
function editLayer(edit) { return e.editTransition(t => edit(t.layers.find(layer => layer.id === e.selection.layerId))) }
function displayLimits(field) {
  const parent = context.value.parent
  if (!parent) return {}
  if (field.property === 'transform.rotation') return { min: parent.rotation - 360, max: parent.rotation + 360 }
  if (field.property === 'transform.scaleX' || field.property === 'transform.scaleY') return { min: -100 * Math.abs(parent.scaleX ?? 1), max: 100 * Math.abs(parent.scaleX ?? 1) }
  if (field.property === 'transform.x' || field.property === 'transform.y') {
    const [a, b, c, d, x, y] = transformMatrix(parent)
    const isX = field.property === 'transform.x'
    const radius = Math.abs(isX ? a : b) * SHAPE_LIMITS.x.max + Math.abs(isX ? c : d) * SHAPE_LIMITS.y.max
    return { min: (isX ? x : y) - radius, max: (isX ? x : y) + radius }
  }
  return {}
}
function overrideKey(property) { return property === 'transform.x' ? 'transform.offsetX' : property === 'transform.y' ? 'transform.offsetY' : property }
function overridden(property) { const [section, key] = overrideKey(property).split('.'); return Object.hasOwn(e.layer?.overrides?.[e.selection?.itemId]?.[section] ?? {}, key) }
function resetOverride(property) {
  editLayer(layer => { const override = layer.overrides[e.selection.itemId]; const [section, key] = overrideKey(property).split('.'); delete override[section][key]; if (!Object.keys(override[section]).length) delete override[section] })
}
</script>
<template>
  <section class="editor-panel property-panel" aria-labelledby="properties-title">
    <div class="panel-heading"><h2 id="properties-title">選択対象を編集</h2><small>{{ e.selection?.itemId ? 'この図形だけ' : isGroup ? 'グループ全体' : '図形' }}</small></div>
    <div class="property-context">
      <div class="edit-mode" role="group" aria-label="編集モード"><button :aria-pressed="e.mode === 'base'" @click="e.mode = 'base'">見た目を編集</button><button :aria-pressed="e.mode === 'keyframe'" @click="e.mode = 'keyframe'">動きを編集</button></div>
      <p v-if="e.selection" class="selection-caption">{{ selectionLabel }} · {{ e.selection.itemId ? `${e.layer.id} / ${e.selection.itemId}` : e.layer.id }}<span v-if="e.mode === 'keyframe'"> · {{ e.scope === 'child' ? '子の共通の動き' : e.scope === 'group' ? 'グループ全体の動き' : 'この図形の動き' }}</span></p>
      <div v-if="e.selection && e.mode === 'base'" class="property-tabs" role="group" aria-label="見た目の編集項目"><button v-for="item in tabs" :key="item.key" :aria-pressed="tab === item.key" @click="tab = item.key">{{ item.label }}</button></div>
    </div>
    <div class="panel-body">
      <div v-if="!e.selection" class="editor-empty-state"><p>左のレイヤーで対象を選択</p><span>図形を追加するか、上の「素材から追加」で演出を選びます。</span></div>
      <template v-else-if="e.mode === 'base'">
        <p v-if="context.error" class="input-warning">{{ context.error }}</p>
        <template v-else-if="tab === 'transform' || tab === 'shape'">
          <label v-if="e.layer.kind === 'shape' && tab === 'shape'" class="parameter-field"><span class="field-label">形状</span><select id="shape-type" :value="e.layer.geometry.type" @change="editLayer(layer => { layer.geometry.type = $event.target.value; if (layer.geometry.type === 'rectangle') layer.geometry.skewX = 0 })"><option value="rectangle">長方形</option><option value="parallelogram">平行四辺形</option></select></label>
          <p v-if="tab === 'shape'" class="control-note">幅・高さ・傾斜は図形自体の値です。</p>
          <div v-if="Object.keys(context.restrictions).length" class="input-warning">{{ [...new Set(Object.values(context.restrictions))].join(' ') }}</div>
          <div class="property-fields"><div v-for="field in fields" :key="`${e.layer.id}/${e.selection.itemId ?? ''}/${field.property}`" class="base-field">
            <EditorField :id="`base-${fieldId(field.property)}`" :value="context.values[field.property]" v-bind="{ ...field, ...displayLimits(field) }" :disabled="Boolean(context.restrictions[field.property])" @change="e.editBase(field.property, $event)" />
            <button v-if="e.selection.itemId && overridden(field.property)" type="button" class="reset-override" @click="resetOverride(field.property)">個別設定中 · 共通へ戻す</button>
          </div></div>
        </template>
        <template v-if="isGroup">
          <section v-if="tab === 'template'" aria-label="共通の形">
            <p class="control-note">配置・規則・個別設定・動きを適用する前の共通値です。後の設定で上書きされる項目は、表示に反映されない場合があります。</p>
            <label class="parameter-field"><span class="field-label">形状</span><select id="template-type" :value="e.layer.template.geometry.type" @change="editLayer(layer => { layer.template.geometry.type = $event.target.value; if (layer.template.geometry.type === 'rectangle') layer.template.geometry.skewX = 0 })"><option value="rectangle">長方形</option><option value="parallelogram">平行四辺形</option></select></label>
            <div class="property-fields"><EditorField v-for="field in SHAPE_FIELDS" :id="`template-${fieldId(field.property)}`" :key="`template-${e.layer.id}-${field.property}`" v-bind="field" :label="field.label.replace('画面の', 'ローカル ')" :value="e.layer.template[field.property.split('.')[0]][field.property.split('.')[1]]" @change="editLayer(layer => { layer.template[field.property.split('.')[0]][field.property.split('.')[1]] = $event })" /></div>
          </section>
          <section v-if="tab === 'generator'" aria-label="配置と個数">
            <label class="parameter-field"><span class="field-label">配置方式</span><select id="editor-generator-type" :value="e.layer.generator.type" @change="editLayer(layer => { layer.generator = $event.target.value === 'grid' ? createSampleGridGenerator() : createSampleTransition().layers[1].generator })"><option value="linear">一列に配置</option><option value="grid">格子に配置</option></select></label>
            <div class="property-fields"><EditorField v-for="key in generatorKeys" :id="`generator-${key}`" :key="`${e.layer.id}-${key}`" :label="generatorLabels[key]" :value="e.layer.generator[key]" :min="['count', 'rows', 'columns'].includes(key) ? 0 : SHAPE_LIMITS[key.endsWith('X') ? 'x' : 'y'].min" :max="['count', 'rows', 'columns'].includes(key) ? 1000 : SHAPE_LIMITS[key.endsWith('X') ? 'x' : 'y'].max" :slider-min="['count', 'rows', 'columns'].includes(key) ? 0 : -500" :slider-max="['count', 'rows', 'columns'].includes(key) ? 40 : 1920" @change="editLayer(layer => { layer.generator[key] = $event })" /></div>
            <p class="control-note">全体1000個まで。格子の間隔は中心間の距離です。個別設定は生成順の番号に残ります。</p>
          </section>
          <ModifierPanel v-if="tab === 'modifier'" :editor="e" />
        </template>
      </template>
      <!-- 常に先に配置し、TimelinePanelのキー編集欄をここへ移す。 -->
      <div id="animation-inspector" v-show="e.mode === 'keyframe'"></div>
    </div>
  </section>
</template>
