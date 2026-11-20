<script setup>
import { DESIGN_PATTERNS, addDesignPatterns, createDesignDemoProject, createDesignPattern } from '../../domain/project/designPatterns.js'
import { evaluateTransition } from '../../domain/transition/evaluateTransition.js'
import { shapePoints } from '../previewGeometry.js'
const props = defineProps({ editor: { type: Object, required: true } })
const emit = defineEmits(['compare', 'preview'])
const examplesUrl = `${import.meta.env.BASE_URL}examples/design-patterns.json`
const cards = DESIGN_PATTERNS.map(pattern => ({ ...pattern, shapes: evaluateTransition(createDesignPattern(pattern.key), pattern.previewAtMs).shapes.map(shape => ({
  id: shape.id, color: shape.style.color, opacity: shape.style.opacity, points: shapePoints(shape).map(point => `${point.x},${point.y}`).join(' '),
})) }))
function add(key) {
  let ids
  if (props.editor.commit(project => { ids = addDesignPatterns(project, key ? [key] : undefined) })) {
    props.editor.selectTransition(ids[0])
    emit('preview', { play: Boolean(key), timeMs: DESIGN_PATTERNS[0].previewAtMs })
  }
}
</script>
<template>
  <section class="design-library" aria-label="意匠ライブラリ">
    <div class="transition-settings-content">
      <div class="pattern-library-actions"><p class="control-note">動きの異なる5種類です。追加した意匠は、通常のレイヤー・色・キーで編集できます。</p><div class="editor-actions"><button type="button" @click="$emit('compare', createDesignDemoProject())">5パターンを発表で比較</button><button type="button" @click="add()">5種類をまとめて追加</button><a class="pattern-download" :href="examplesUrl" download="design-patterns.json">比較用JSONを保存</a></div></div>
      <div class="pattern-grid">
        <article v-for="card in cards" :key="card.key" class="pattern-card" :data-pattern="card.key">
          <svg viewBox="0 0 1920 1080" role="img" :aria-label="`${card.name}のプレビュー`"><rect width="1920" height="1080" fill="#F5F3EE" /><polygon v-for="shape in card.shapes" :key="shape.id" :points="shape.points" :fill="shape.color" :opacity="shape.opacity" /></svg>
          <h3>{{ card.name }}</h3><p>{{ card.description }}</p><div class="pattern-card-footer"><span>{{ (card.durationMs / 1000).toFixed(2) }}秒</span><button type="button" :aria-label="`${card.name}を追加して再生`" @click="add(card.key)">追加して再生</button></div>
        </article>
      </div>
    </div>
  </section>
</template>
