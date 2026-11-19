<script setup>
import { inject, ref, watch } from 'vue'
import NumberSlider from '../../components/NumberSlider.vue'
const props = defineProps({ id: String, label: String, value: [Number, String], min: { type: Number, default: -19200 },
  max: { type: Number, default: 19200 }, sliderMin: Number, sliderMax: Number, step: { type: Number, default: 1 }, unit: String,
  text: Boolean, disabled: Boolean })
const emit = defineEmits(['change'])
const gesture = inject('editorGesture', null)
const interactions = new WeakMap()
function begin(target) { if (gesture) interactions.set(target, gesture.begin()) }
function finish(target, cancel = false) {
  const token = interactions.get(target)
  if (token === undefined) return
  interactions.delete(target)
  if (cancel) gesture.cancel(token)
  else gesture.end(token)
}
const draft = ref(props.value)
watch(() => props.value, value => { draft.value = value })
function update(value) { draft.value = value; emit('change', value) }
</script>
<template>
  <div v-if="disabled" class="parameter-field editor-field editor-disabled-field"><span class="field-label">{{ label }}</span><span class="field-restriction">編集制限</span></div>
  <label v-else-if="text" :for="id" class="parameter-field editor-field"><span class="field-label">{{ label }}</span><input :id="id" :value="draft" type="text" @change="update($event.target.value)" @focus="begin($event.target)" @blur="finish($event.target)" /></label>
  <NumberSlider v-else :id="id" class="editor-field" :model-value="draft ?? ''" :label="label" :unit="unit" :min="min" :max="max" :slider-min="sliderMin" :slider-max="sliderMax" :step="step" @update:model-value="update" @interaction-start="begin" @interaction-end="finish($event)" @interaction-cancel="finish($event, true)" />
</template>
