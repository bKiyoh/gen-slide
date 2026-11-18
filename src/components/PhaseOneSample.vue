<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import ShapePreview from './ShapePreview.vue'
import NumberSlider from './NumberSlider.vue'
import { LOGICAL_SIZE, SHAPE_LIMITS } from '../domain/shapes.js'
import { MAX_SHAPES } from '../domain/transition/generators.js'
import { createSampleGridGenerator, createSampleTransition } from '../domain/transition/sampleTransition.js'
import { resolveStaticShapes } from '../domain/transition/resolveStaticShapes.js'

const transition = ref(createSampleTransition())
const group = computed(() => transition.value.layers[1])
const linear = ref({ ...group.value.generator })
const grid = ref(createSampleGridGenerator())
const generatorType = ref('linear')
const generator = computed(() => generatorType.value === 'linear' ? linear.value : grid.value)
const showShape = ref(true)
const showGroup = ref(true)
const reverseLayers = ref(false)
const alternate = ref(true)
const linearWidth = ref(true)
const overrideEnabled = ref(true)
const previewVisible = ref(true)

const evaluation = computed(() => {
  const layers = []
  if (showShape.value) layers.push(transition.value.layers[0])
  if (showGroup.value) layers.push({ ...group.value,
    generator: generator.value,
    modifiers: group.value.modifiers.filter(modifier => modifier.type === 'alternate' ? alternate.value : linearWidth.value),
    overrides: overrideEnabled.value ? group.value.overrides : {},
  })
  if (reverseLayers.value) layers.reverse()
  try {
    return { ...resolveStaticShapes({ ...transition.value, layers }), error: '' }
  } catch (error) {
    return { shapes: [], error: error.message }
  }
})
const renderShapes = shallowRef([])
watch(evaluation, result => {
  if (!result.error) renderShapes.value = result.shapes
}, { immediate: true })

function positionField(key, label, sliderMin, sliderMax) {
  const axis = key.endsWith('X') ? 'x' : 'y'
  return { key, label, ...SHAPE_LIMITS[axis], sliderMin, sliderMax, unit: 'px' }
}

const generatorFields = computed(() => [
  ...(generatorType.value === 'linear'
    ? [{ key: 'count', label: '個数', min: 0, max: MAX_SHAPES, integer: true },
      positionField('stepX', 'X ステップ', -480, 480), positionField('stepY', 'Y ステップ', -270, 270)]
    : [{ key: 'rows', label: '行数', min: 0, max: MAX_SHAPES, integer: true }, { key: 'columns', label: '列数', min: 0, max: MAX_SHAPES, integer: true },
      positionField('gapX', 'X 間隔', -960, 960), positionField('gapY', 'Y 間隔', -540, 540),
      positionField('rowOffsetX', '行の X オフセット', -480, 480), positionField('columnOffsetY', '列の Y オフセット', -270, 270)]),
  positionField('startX', '開始 X', 0, LOGICAL_SIZE.width), positionField('startY', '開始 Y', 0, LOGICAL_SIZE.height),
])
const transformFields = [
  { key: 'x', label: 'グループ X', sliderMin: -1920, sliderMax: 1920, unit: 'px' },
  { key: 'y', label: 'グループ Y', sliderMin: -1080, sliderMax: 1080, unit: 'px' },
  { key: 'rotation', label: '回転', sliderMin: -180, sliderMax: 180, unit: '°' },
  { key: 'scaleX', label: 'X 倍率', sliderMin: -2, sliderMax: 2, step: 0.01 },
  { key: 'scaleY', label: 'Y 倍率', sliderMin: -2, sliderMax: 2, step: 0.01 },
]

function reset() {
  transition.value = createSampleTransition()
  linear.value = { ...group.value.generator }
  grid.value = createSampleGridGenerator()
  generatorType.value = 'linear'
  showShape.value = showGroup.value = alternate.value = linearWidth.value = overrideEnabled.value = true
  reverseLayers.value = false
}
</script>

<template>
  <main>
    <header class="page-header">
      <div>
        <p class="eyebrow">GENERATIVE SLIDE / PHASE 1</p>
        <h1>規則から図形をつくる</h1>
        <p class="intro">配置・色・幅をまとめて指定し、ひとつの図形に個別の変更を重ねます。</p>
      </div>
      <button type="button" @click="reset">初期値に戻す</button>
    </header>

    <section class="preview-panel" aria-labelledby="preview-title">
      <div class="section-header">
        <h2 id="preview-title">プレビュー · {{ renderShapes.length }} 図形</h2>
        <button type="button" @click="previewVisible = !previewVisible">{{ previewVisible ? 'プレビューを停止' : 'プレビューを開始' }}</button>
      </div>
      <ShapePreview v-if="previewVisible" :shapes="renderShapes" />
      <div v-else class="preview-stopped" role="status">プレビューを停止しました。再開すると描画を初期化します。</div>
      <div class="preview-caption"><span>1920 × 1080 / 16:9</span><span>図形の中心を配置 · 後のレイヤーが手前</span></div>
    </section>
    <p v-if="evaluation.error" class="input-warning" role="alert">{{ evaluation.error }} 直前の正常な描画を保持します。</p>

    <section class="shape-controls phase-one-controls" aria-label="生成ルールの確認">
      <fieldset class="shape-card">
        <legend>Generator · 配置</legend>
        <label for="generator-type" class="field-label">配置方式</label>
        <select id="generator-type" v-model="generatorType"><option value="linear">Linear</option><option value="grid">Grid</option></select>
        <p class="shape-kind">上限は1グループ・全体とも {{ MAX_SHAPES }} 個。個別 Mesh の描画負荷を抑える検証用の制限です。</p>
        <div class="field-grid">
          <template v-for="field in generatorFields" :key="field.key">
            <label v-if="field.integer" :for="`generator-${field.key}`">
              <span class="field-label">{{ field.label }}</span>
              <input :id="`generator-${field.key}`" v-model.number="generator[field.key]" type="number" :min="field.min" :max="field.max" step="1" />
            </label>
            <NumberSlider v-else :id="`generator-${field.key}`" v-model="generator[field.key]" :label="field.label" :unit="field.unit" :min="field.min" :max="field.max" :slider-min="field.sliderMin" :slider-max="field.sliderMax" />
          </template>
        </div>
        <div v-if="generatorType === 'linear'" class="demo-actions">
          <button type="button" @click="linear.count = 2">2個に減らす</button>
          <button type="button" @click="linear.count = 10">10個に戻す</button>
        </div>
        <p class="control-note">Grid の間隔は中心間のステップです。列数を変えても、個別設定は同じ生成順の番号へ適用されます。</p>
      </fieldset>

      <fieldset class="shape-card">
        <legend>Modifier · 共通の変化</legend>
        <label class="check-field"><input v-model="alternate" type="checkbox" />赤・青を交互にする</label>
        <label class="check-field"><input v-model="linearWidth" type="checkbox" />幅を生成順に変化させる</label>
        <div class="field-grid">
          <NumberSlider id="width-from" v-model="group.modifiers[1].from" label="先頭の幅" unit="px" :min="0" :max="SHAPE_LIMITS.width.max" :slider-max="LOGICAL_SIZE.width" />
          <NumberSlider id="width-to" v-model="group.modifiers[1].to" label="末尾の幅" unit="px" :min="0" :max="SHAPE_LIMITS.width.max" :slider-max="LOGICAL_SIZE.width" />
          <NumberSlider id="template-height" v-model="group.template.geometry.height" label="共通の高さ" unit="px" :min="0" :max="SHAPE_LIMITS.height.max" :slider-max="LOGICAL_SIZE.height" />
          <NumberSlider id="template-skew" v-model="group.template.geometry.skewX" label="共通の傾斜" unit="°" :min="-80" :max="80" />
        </div>
        <p class="control-note">1個のときは先頭の幅を採用します。個別設定は共通の変化より優先します。</p>
      </fieldset>

      <fieldset class="shape-card">
        <legend>Override · item-002</legend>
        <label class="check-field"><input v-model="overrideEnabled" type="checkbox" />3番目だけ個別設定を適用する</label>
        <div class="field-grid">
          <label for="override-color"><span class="field-label">色 (HEX)</span><input id="override-color" v-model="group.overrides['item-002'].style.color" type="text" spellcheck="false" /></label>
          <NumberSlider id="override-x" v-model="group.overrides['item-002'].transform.offsetX" label="X オフセット" unit="px" :min="SHAPE_LIMITS.x.min" :max="SHAPE_LIMITS.x.max" :slider-min="-480" :slider-max="480" />
        </div>
        <p class="control-note">初期値は白・X +40。2個に減らすと3番目は消え、10個に戻すと同じ設定で復元します。</p>
        <p class="control-note" data-testid="stored-override">保持中: {{ group.overrides['item-002'].style.color }} / X +{{ group.overrides['item-002'].transform.offsetX }}</p>
      </fieldset>

      <fieldset class="shape-card">
        <legend>Group · 全体の変換と表示順</legend>
        <div class="field-grid">
          <NumberSlider v-for="field in transformFields" :id="`group-${field.key}`" :key="field.key" v-model="group.transform[field.key]" :label="field.label" :unit="field.unit" :min="SHAPE_LIMITS[field.key].min" :max="SHAPE_LIMITS[field.key].max" :slider-min="field.sliderMin" :slider-max="field.sliderMax" :step="field.step" />
        </div>
        <label class="check-field"><input v-model="showShape" type="checkbox" />個別 Shape を表示</label>
        <label class="check-field"><input v-model="showGroup" type="checkbox" />ShapeGroup を表示</label>
        <label class="check-field"><input v-model="reverseLayers" type="checkbox" />レイヤー順を反転</label>
        <p class="control-note">グループの回転・拡縮はローカル原点 (0, 0) が基準です。</p>
      </fieldset>
    </section>

    <details class="resolved-details">
      <summary>評価結果を見る（先頭12個）</summary>
      <div class="result-scroll"><table>
        <thead><tr><th>ID</th><th>X</th><th>Y</th><th>幅</th><th>色</th></tr></thead>
        <tbody><tr v-for="shape in renderShapes.slice(0, 12)" :key="shape.id"><td>{{ shape.id }}</td><td>{{ shape.transform.x }}</td><td>{{ shape.transform.y }}</td><td>{{ Number(shape.geometry.width.toFixed(2)) }}</td><td>{{ shape.style.color }}</td></tr></tbody>
      </table></div>
    </details>
    <footer class="notes"><p>生成 → Modifier → 個別設定 → グループ変換 → 描画。入力内容は保存されません。</p></footer>
  </main>
</template>
