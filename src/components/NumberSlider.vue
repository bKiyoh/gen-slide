<script setup>
import { computed } from 'vue'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  modelValue: { type: [Number, String], required: true },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  sliderMin: { type: Number, default: undefined },
  sliderMax: { type: Number, default: undefined },
  step: { type: Number, default: 1 },
})
const emit = defineEmits(['update:modelValue', 'interaction-start', 'interaction-end', 'interaction-cancel'])
function startPointer(event) { event.target.setPointerCapture(event.pointerId); emit('interaction-start', event.target) }

// 普段使う範囲で調整しやすくし、数値入力が有効範囲内ならスライダーも広げる。
// 空欄・範囲外の数値は書き戻さず、既存の入力検証へそのまま渡す。
const limits = computed(() => {
  const current = Number.isFinite(props.modelValue)
    ? Math.min(props.max, Math.max(props.min, props.modelValue))
    : Math.min(props.max, Math.max(props.min, 0))
  return {
    min: Math.min(Math.min(props.max, Math.max(props.min, props.sliderMin ?? props.min)), current),
    max: Math.max(Math.min(props.max, Math.max(props.min, props.sliderMax ?? props.max)), current),
    current,
  }
})

function update(event) {
  const value = event.target.value
  emit('update:modelValue', value === '' ? '' : Number(value))
}
</script>

<template>
  <div class="parameter-field">
    <label :id="`${id}-label`" :for="`${id}-slider`" class="field-label">
      {{ label }} <small v-if="unit">{{ unit }}</small>
    </label>
    <div class="slider-control">
      <input
        :id="`${id}-slider`"
        type="range"
        :min="limits.min"
        :max="limits.max"
        :step="step"
        :value="limits.current"
        @input="update"
        @pointerdown="startPointer"
        @pointerup="emit('interaction-end', $event.target)"
        @pointercancel="emit('interaction-cancel', $event.target)"
        @lostpointercapture="emit('interaction-end', $event.target)"
      />
      <input
        :id="id"
        type="number"
        :min="min"
        :max="max"
        step="any"
        :value="modelValue"
        :aria-labelledby="`${id}-label`"
        @input="update"
        @focus="emit('interaction-start', $event.target)"
        @blur="emit('interaction-end', $event.target)"
      />
    </div>
  </div>
</template>
