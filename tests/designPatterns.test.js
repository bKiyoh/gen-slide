import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DESIGN_PATTERNS, addDesignPatterns, createDesignDemoProject, createDesignPattern } from '../src/domain/project/designPatterns.js'
import { createProject, validateProject, parseProject, serializeProject } from '../src/domain/project/project.js'
import { evaluateTransition } from '../src/domain/transition/evaluateTransition.js'

test('意匠5種類: 全時刻の評価が有効で、開始・終了は透明、途中は見える図形がある', () => {
  assert.equal(DESIGN_PATTERNS.length, 5)
  assert.equal(new Set(DESIGN_PATTERNS.map(pattern => pattern.key)).size, 5)
  for (const pattern of DESIGN_PATTERNS) {
    const transition = createDesignPattern(pattern.key)
    validateProject({ schemaVersion: 1, transitions: [transition], slides: [] })
    assert.equal(transition.durationMs, pattern.durationMs)
    assert.equal(Object.hasOwn(transition, 'cover'), false)
    const times = new Set([0, transition.durationMs, transition.switchAtMs, pattern.previewAtMs])
    for (let time = 0; time < transition.durationMs; time += 16) times.add(time)
    for (const time of times) {
      const state = evaluateTransition(transition, time)
      assert.ok(state.shapes.length > 0 && state.shapes.length <= 1000)
      if (time === 0 || time === transition.durationMs) assert.ok(state.shapes.every(shape => shape.style.opacity === 0), pattern.name)
      if (time === pattern.previewAtMs) assert.ok(state.shapes.some(shape => shape.style.opacity > 0), pattern.name)
    }
    assert.deepEqual(parseProject(serializeProject({ schemaVersion: 1, transitions: [transition], slides: [] })).transitions[0], transition)
  }
})

test('意匠の追加: 作品・発表構成を保持、繰り返してもIDと名前が一意、参照を共有しない', () => {
  const project = createProject(), original = structuredClone(project)
  project.slides.push({ id: 'slide-001', component: 'TitleSlide', transitionId: project.transitions[0].id })
  const originalSlides = structuredClone(project.slides)
  const ids = [...addDesignPatterns(project), ...addDesignPatterns(project)]
  validateProject(project)
  assert.equal(new Set(ids).size, 10)
  assert.equal(new Set(project.transitions.map(t => t.name)).size, 11)
  assert.deepEqual(project.transitions[0], original.transitions[0])
  assert.deepEqual(project.slides, originalSlides)
  const first = createDesignPattern('diagonal-sweep'), second = createDesignPattern('diagonal-sweep')
  first.layers[0].template.geometry.width = 100
  assert.equal(second.layers[0].template.geometry.width, 360)
  const before = serializeProject(project)
  assert.throws(() => addDesignPatterns(project, ['diagonal-sweep', 'missing']), RangeError)
  assert.equal(serializeProject(project), before)
})

test('比較用Projectと配布JSON: 5演出を6枚で試せる独立した有効なProject', () => {
  const project = createDesignDemoProject()
  assert.equal(project.transitions.length, 5)
  assert.equal(project.slides.length, 6)
  assert.deepEqual(project.slides.slice(0, 5).map(slide => slide.transitionId), project.transitions.map(t => t.id))
  assert.equal(project.slides.at(-1).transitionId, null)
  const json = parseProject(readFileSync(new URL('../public/examples/design-patterns.json', import.meta.url), 'utf8'))
  assert.deepEqual(json, project)
})
