<script setup>
import { computed } from 'vue'
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
const fields = computed(() => e.layer?.kind === 'group' && !e.selection?.itemId ? SHAPE_FIELDS.filter(field => field.property.startsWith('transform.')) : SHAPE_FIELDS)
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
  <section class="editor-panel property-panel" aria-labelledby="properties-title"><div class="panel-heading"><h2 id="properties-title">プロパティ</h2><small>選択対象の編集</small></div>
    <div class="panel-body">
    <div class="edit-mode" role="group" aria-label="編集モード"><button :aria-pressed="e.mode === 'base'" @click="e.mode = 'base'">ベース編集</button><button :aria-pressed="e.mode === 'keyframe'" @click="e.mode = 'keyframe'">キーフレーム編集</button></div>
    <div v-if="!e.selection" class="editor-empty-state"><p>レイヤーを選択</p><span>図形や生成子を選ぶと、編集できる項目がここに表示されます。</span></div>
    <template v-else>
      <p class="selection-caption">{{ e.selection.itemId ? `${e.layer.id} / ${e.selection.itemId}` : e.layer.id }}</p>
      <p v-if="context.error" class="input-warning">{{ context.error }}</p>
      <p v-if="e.mode === 'keyframe'" class="control-note">下のタイムラインでキーを明示的に追加・編集します。プロパティ操作だけでキーは追加されません。</p>
      <template v-else-if="!context.error">
        <label v-if="e.layer.kind === 'shape'" class="parameter-field"><span class="field-label">形状</span><select id="shape-type" :value="e.layer.geometry.type" @change="editLayer(layer => { layer.geometry.type = $event.target.value; if (layer.geometry.type === 'rectangle') layer.geometry.skewX = 0 })"><option value="rectangle">Rectangle</option><option value="parallelogram">Parallelogram</option></select></label>
        <p class="control-note">位置・回転・倍率は現在の画面表示値。幅・高さ・傾斜はローカル形状のパラメーターです。</p>
        <div v-if="Object.keys(context.restrictions).length" class="input-warning">{{ [...new Set(Object.values(context.restrictions))].join(' ') }}</div>
        <div class="property-fields">
          <div v-for="field in fields" :key="`${e.layer.id}/${e.selection.itemId ?? ''}/${field.property}`" class="base-field">
            <EditorField :id="`base-${fieldId(field.property)}`" :value="context.values[field.property]" v-bind="{ ...field, ...displayLimits(field) }" :disabled="Boolean(context.restrictions[field.property])" @change="e.editBase(field.property, $event)" />
            <button v-if="e.selection.itemId && overridden(field.property)" type="button" class="reset-override" @click="resetOverride(field.property)">個別設定中 · 共通へ戻す</button>
          </div>
        </div>
      </template>
      <template v-if="e.mode === 'base' && e.layer.kind === 'group' && !e.selection.itemId">
        <details class="property-section property-disclosure"><summary>Template <small>共通の基本値</small></summary><p class="control-note">生成・Modifier・個別設定・Animationの前の共通値です。後段で上書きされる項目は表示に反映されない場合があります。</p>
          <label class="parameter-field"><span class="field-label">形状</span><select id="template-type" :value="e.layer.template.geometry.type" @change="editLayer(layer => { layer.template.geometry.type = $event.target.value; if (layer.template.geometry.type === 'rectangle') layer.template.geometry.skewX = 0 })"><option value="rectangle">Rectangle</option><option value="parallelogram">Parallelogram</option></select></label>
          <div class="property-fields"><EditorField v-for="field in SHAPE_FIELDS" :id="`template-${fieldId(field.property)}`" :key="`template-${e.layer.id}-${field.property}`" v-bind="field" :label="field.label.replace('画面の', 'ローカル ')" :value="e.layer.template[field.property.split('.')[0]][field.property.split('.')[1]]" @change="editLayer(layer => { layer.template[field.property.split('.')[0]][field.property.split('.')[1]] = $event })" /></div>
        </details>
        <details class="property-section property-disclosure" open><summary>Generator <small>配置と個数</small></summary><label class="parameter-field"><span class="field-label">配置方式</span><select id="editor-generator-type" :value="e.layer.generator.type" @change="editLayer(layer => { layer.generator = $event.target.value === 'grid' ? createSampleGridGenerator() : createSampleTransition().layers[1].generator })"><option value="linear">Linear</option><option value="grid">Grid</option></select></label>
          <div class="property-fields"><EditorField v-for="key in generatorKeys" :id="`generator-${key}`" :key="`${e.layer.id}-${key}`" :label="generatorLabels[key]" :value="e.layer.generator[key]" :min="['count', 'rows', 'columns'].includes(key) ? 0 : SHAPE_LIMITS[key.endsWith('X') ? 'x' : 'y'].min" :max="['count', 'rows', 'columns'].includes(key) ? 1000 : SHAPE_LIMITS[key.endsWith('X') ? 'x' : 'y'].max" :slider-min="['count', 'rows', 'columns'].includes(key) ? 0 : -500" :slider-max="['count', 'rows', 'columns'].includes(key) ? 40 : 1920" @change="editLayer(layer => { layer.generator[key] = $event })" /></div>
          <p class="control-note">生成上限は全体1000個。Gridの間隔は中心間ステップです。個別設定は同じ生成順の番号に残ります。</p>
        </details>
        <ModifierPanel :editor="e" />
      </template>
    </template>
    </div>
  </section>
</template>
