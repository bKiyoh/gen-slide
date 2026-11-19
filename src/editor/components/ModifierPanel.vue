<script setup>
import { computed } from 'vue'
import { MODIFIER_PROPERTIES } from '../../domain/transition/modifiers.js'
import { labelFor, SHAPE_FIELDS } from '../fields.js'
import EditorField from './EditorField.vue'
const props = defineProps({ editor: Object })
const modifiers = computed(() => props.editor.layer?.modifiers ?? [])
const fieldFor = property => SHAPE_FIELDS.find(field => field.property === property)
const conflicts = computed(() => [...new Set(modifiers.value.filter((rule, index, all) => rule.enabled !== false && all.some((other, otherIndex) => otherIndex < index && other.enabled !== false && other.property === rule.property)).map(rule => rule.property))])
function update(index, edit) { props.editor.editTransition(t => edit(t.layers.find(layer => layer.id === props.editor.layer.id).modifiers[index])) }
function setProperty(index, property) {
  update(index, rule => { rule.property = property; rule.type = 'alternate'; rule.values = property === 'style.color' ? ['#FF0000', '#0000FF'] : [0, 1]; delete rule.from; delete rule.to })
}
function move(index, direction) {
  props.editor.editTransition(t => {
    const rules = t.layers.find(layer => layer.id === props.editor.layer.id).modifiers
    if (index + direction >= 0 && index + direction < rules.length) [rules[index], rules[index + direction]] = [rules[index + direction], rules[index]]
  })
}
</script>
<template>
  <details class="property-section property-disclosure" aria-label="Modifierの編集" open><summary>Modifier <small>上から順に適用・後勝ち</small></summary>
    <p class="control-note">位置の値は生成位置に加えるオフセットです。幅・高さ・傾斜はローカル形状の値です。</p>
    <p v-if="conflicts.length" class="control-note">同一項目への複数指定: {{ conflicts.map(labelFor).join('、') }}。有効な最後のルールが優先します。</p>
    <div v-for="(rule, index) in modifiers" :key="index" class="modifier-card">
      <div class="editor-actions modifier-actions"><label class="check-field"><input type="checkbox" :checked="rule.enabled !== false" @change="update(index, rule => { rule.enabled = $event.target.checked })" />有効</label><button type="button" class="button-icon" :aria-label="`Modifier ${index + 1}を上へ`" :disabled="index === 0" @click="move(index, -1)">↑</button><button type="button" class="button-icon" :aria-label="`Modifier ${index + 1}を下へ`" :disabled="index === modifiers.length - 1" @click="move(index, 1)">↓</button><button type="button" class="button-danger" @click="editor.editTransition(t => t.layers.find(layer => layer.id === editor.layer.id).modifiers.splice(index, 1))">削除</button></div>
      <label><span class="field-label">対象</span><select :value="rule.property" @change="setProperty(index, $event.target.value)"><option v-for="property in MODIFIER_PROPERTIES" :key="property" :value="property">{{ labelFor(property) }}</option></select></label>
      <label><span class="field-label">方式</span><select :value="rule.type" @change="update(index, rule => { rule.type = $event.target.value; if (rule.type === 'linear') { rule.from = 0; rule.to = 1; delete rule.values } else { rule.values = rule.property === 'style.color' ? ['#FF0000', '#0000FF'] : [0, 1]; delete rule.from; delete rule.to } })"><option value="alternate">Alternate</option><option v-if="rule.property !== 'style.color'" value="linear">Linear</option></select></label>
      <label v-if="rule.type === 'alternate'"><span class="field-label">値（カンマ区切り）</span><input :value="rule.values.join(', ')" @change="update(index, rule => { rule.values = $event.target.value.split(',').map(value => rule.property === 'style.color' ? value.trim() : value.trim() === '' ? NaN : Number(value)) })" /></label>
      <div v-else class="modifier-values"><EditorField :id="`modifier-${index}-from`" v-bind="fieldFor(rule.property)" label="From" :value="rule.from" @change="update(index, rule => { rule.from = $event })" /><EditorField :id="`modifier-${index}-to`" v-bind="fieldFor(rule.property)" label="To" :value="rule.to" @change="update(index, rule => { rule.to = $event })" /></div>
    </div>
    <button type="button" class="button-full" @click="editor.editTransition(t => { t.layers.find(layer => layer.id === editor.layer.id).modifiers.push({ property: 'style.color', type: 'alternate', values: ['#FF0000', '#0000FF'] }) })">Modifier追加</button>
  </details>
</template>
