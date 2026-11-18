<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import ShapePreview from './ShapePreview.vue'
import { createSampleShapes, LOGICAL_SIZE, SHAPE_LIMITS, validateShape } from '../domain/shapes.js'

const shapes = ref(createSampleShapes())
const previewVisible = ref(true)
const errors = computed(() => shapes.value.map(shape => validateShape(shape)))
const hasErrors = computed(() => errors.value.some(items => items.length > 0))
const renderShapes = shallowRef(createSampleShapes())

watch(shapes, () => {
  if (!hasErrors.value) {
    // 入力途中の空欄や不正値を GPU に渡さず、最後の正常なデータを維持する。
    renderShapes.value = JSON.parse(JSON.stringify(shapes.value))
  }
}, { deep: true })

const fields = [
  { section: 'geometry', key: 'width', label: '幅', unit: 'px', step: 1, sliderMin: 0, sliderMax: LOGICAL_SIZE.width },
  { section: 'geometry', key: 'height', label: '高さ', unit: 'px', step: 1, sliderMin: 0, sliderMax: LOGICAL_SIZE.height },
  { section: 'geometry', key: 'skewX', label: '傾斜', unit: '°', step: 1 },
  { section: 'transform', key: 'x', label: '中心 X', unit: 'px', step: 1, sliderMin: 0, sliderMax: LOGICAL_SIZE.width },
  { section: 'transform', key: 'y', label: '中心 Y', unit: 'px', step: 1, sliderMin: 0, sliderMax: LOGICAL_SIZE.height },
  { section: 'transform', key: 'rotation', label: '回転', unit: '°', step: 1 },
  { section: 'style', key: 'opacity', label: '不透明度', unit: '0–1', step: 0.01 },
]

// 通常はキャンバス内の範囲を使って調整しやすくする。
// 数値入力で範囲外の有効値を指定した場合は、その値までスライダーを広げる。
function sliderLimits(field, value) {
  const limits = SHAPE_LIMITS[field.key]
  const current = Number.isFinite(value) ? Math.min(limits.max, Math.max(limits.min, value)) : limits.min
  return {
    min: Math.min(field.sliderMin ?? limits.min, current),
    max: Math.max(field.sliderMax ?? limits.max, current),
  }
}
</script>

<template>
  <main>
    <header class="page-header">
      <div>
        <p class="eyebrow">GENERATIVE SLIDE / PHASE 0</p>
        <h1>図形の描画検証</h1>
        <p class="intro">スライダーを動かして、四角形の形・位置・透明度を調整できます。</p>
      </div>
      <button type="button" @click="shapes = createSampleShapes()">初期値に戻す</button>
    </header>

    <section class="preview-panel" aria-labelledby="preview-title">
      <div class="section-header">
        <h2 id="preview-title">プレビュー</h2>
        <button type="button" @click="previewVisible = !previewVisible">
          {{ previewVisible ? 'プレビューを停止' : 'プレビューを開始' }}
        </button>
      </div>
      <ShapePreview v-if="previewVisible" :shapes="renderShapes" />
      <div v-else class="preview-stopped" role="status">プレビューを停止しました。再開すると描画を初期化します。</div>
      <div class="preview-caption">
        <span>1920 × 1080 / 16:9</span>
        <span>左上原点 · X → / Y ↓ · 余白は濃いグレーで表示</span>
      </div>
    </section>

    <p v-if="hasErrors" class="input-warning" role="alert">
      入力値を確認してください。無効な値がある間は、直前の正常な描画を保持します。
    </p>

    <section class="shape-controls" aria-label="図形のパラメーター">
      <fieldset v-for="(shape, index) in shapes" :key="shape.id" class="shape-card">
        <legend>
          <span class="shape-mark" :class="shape.id" aria-hidden="true"></span>
          {{ shape.geometry.type === 'rectangle' ? '赤い長方形' : '青い平行四辺形' }}
        </legend>
        <p class="shape-kind">{{ shape.geometry.type === 'rectangle' ? 'Rectangle' : 'Parallelogram' }}</p>
        <div class="field-grid">
          <template v-for="field in fields" :key="field.key">
            <div v-if="field.key !== 'skewX' || shape.geometry.type === 'parallelogram'" class="parameter-field">
              <label :id="`${shape.id}-${field.key}-label`" :for="`${shape.id}-${field.key}-slider`" class="field-label">
                {{ field.label }} <small>{{ field.unit }}</small>
              </label>
              <div class="slider-control">
                <input
                  :id="`${shape.id}-${field.key}-slider`"
                  type="range"
                  :min="sliderLimits(field, shape[field.section][field.key]).min"
                  :max="sliderLimits(field, shape[field.section][field.key]).max"
                  :step="field.step"
                  :value="shape[field.section][field.key]"
                  :aria-describedby="errors[index].length ? `${shape.id}-errors` : undefined"
                  @input="shape[field.section][field.key] = Number($event.target.value)"
                />
                <input
                  :id="`${shape.id}-${field.key}`"
                  v-model.number="shape[field.section][field.key]"
                  type="number"
                  :min="SHAPE_LIMITS[field.key].min"
                  :max="SHAPE_LIMITS[field.key].max"
                  step="any"
                  :aria-labelledby="`${shape.id}-${field.key}-label`"
                  :aria-describedby="errors[index].length ? `${shape.id}-errors` : undefined"
                />
              </div>
            </div>
          </template>
          <label :for="`${shape.id}-color`">
            <span class="field-label">色 <small>HEX</small></span>
            <input :id="`${shape.id}-color`" v-model="shape.style.color" type="text" spellcheck="false" :aria-describedby="errors[index].length ? `${shape.id}-errors` : undefined" />
          </label>
        </div>
        <ul v-if="errors[index].length" :id="`${shape.id}-errors`" class="field-errors">
          <li v-for="error in errors[index]" :key="error">{{ error }}</li>
        </ul>
      </fieldset>
    </section>

    <footer class="notes">
      <p>位置は図形の中心。回転は中心を軸に時計回りです。</p>
      <p>傾斜が正のとき、上辺は下辺より「高さ × tan(傾斜角)」だけ右へずれます。傾斜 → 回転 → 移動の順に適用します。</p>
      <p>Phase 0 は描画基盤の検証用です。入力内容は保存されません。</p>
    </footer>
  </main>
</template>
