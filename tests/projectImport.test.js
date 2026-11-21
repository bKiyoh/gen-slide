import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendProject, applyProjectEdit, createProject, createTransition, serializeProject, validateProject } from '../src/domain/project/project.js'
import { createInitialProject } from '../src/domain/project/presentationSample.js'
import { evaluateTransition } from '../src/domain/transition/evaluateTransition.js'

const ids = project => project.transitions.flatMap(t => [t.id, ...t.layers.map(layer => layer.id)]).concat(project.slides.map(slide => slide.id))

test('JSON追加: 既存の演出・スライドを保持し、参照と子の設定・描画を保って末尾へ追加', () => {
  const current = createInitialProject()
  const incoming = createInitialProject()
  incoming.transitions[0].cover = { legacy: true }
  const before = serializeProject(current)
  const source = serializeProject(incoming)
  let addedIds
  const next = applyProjectEdit(current, draft => { addedIds = appendProject(draft, incoming) })
  assert.equal(serializeProject(current), before)
  assert.equal(serializeProject(incoming), source)
  assert.deepEqual(next.transitions.slice(0, current.transitions.length), current.transitions)
  assert.deepEqual(next.slides.slice(0, current.slides.length), current.slides)
  assert.equal(next.transitions.length, current.transitions.length + incoming.transitions.length)
  assert.equal(next.slides.length, current.slides.length + incoming.slides.length)
  assert.equal(new Set(ids(next)).size, ids(next).length)
  const added = next.transitions.slice(current.transitions.length)
  assert.deepEqual(added.map(t => t.id), addedIds)
  for (const [index, slide] of next.slides.slice(current.slides.length).entries()) {
    const target = incoming.transitions.findIndex(t => t.id === incoming.slides[index].transitionId)
    assert.equal(slide.transitionId, target === -1 ? incoming.slides[index].transitionId : added[target].id)
  }
  for (const [index, transition] of added.entries()) {
    const original = incoming.transitions[index]
    assert.deepEqual(transition.cover, original.cover)
    for (const [layerIndex, layer] of transition.layers.entries()) assert.deepEqual({ ...layer, id: original.layers[layerIndex].id }, original.layers[layerIndex])
    for (const time of [0, 600, transition.durationMs]) {
      const drawing = t => evaluateTransition(t, time).shapes.map(({ geometry, style, worldMatrix }) => ({ geometry, style, worldMatrix }))
      assert.deepEqual(drawing(transition), drawing(original))
    }
  }
  added[0].name = 'changed after import'
  assert.equal(serializeProject(incoming), source)
})

test('JSON追加: 異種のIDも予約し、衝突しない取り込み側のIDを維持する', () => {
  const incoming = createProject()
  incoming.transitions[0].layers[0].id = 'transition-002'
  incoming.transitions[0].layers[1].id = 'group-002'
  incoming.transitions.push(createTransition('shape-002'))
  incoming.slides.push({ id: 'transition-003', component: 'TitleSlide', transitionId: incoming.transitions[0].id })
  const next = applyProjectEdit(createProject(), draft => appendProject(draft, incoming))
  assert.equal(next.transitions[1].id, 'transition-004')
  assert.equal(next.transitions[1].layers[0].id, 'transition-002')
  assert.equal(next.transitions[1].layers[1].id, 'group-002')
  assert.equal(next.transitions[2].id, 'shape-002')
  assert.equal(next.slides[0].id, 'transition-003')
  assert.equal(next.slides[0].transitionId, 'transition-004')
  validateProject(next)
})

test('JSON追加: 同じファイルを繰り返しても既存を上書きせずIDと参照が有効', () => {
  const incoming = createInitialProject()
  const original = serializeProject(incoming)
  let current = createInitialProject()
  for (let index = 0; index < 3; index++) current = applyProjectEdit(current, draft => appendProject(draft, incoming))
  assert.equal(current.transitions.length, incoming.transitions.length * 4)
  assert.equal(current.slides.length, incoming.slides.length * 4)
  assert.equal(new Set(ids(current)).size, ids(current).length)
  assert.equal(serializeProject(incoming), original)
  validateProject(current)
})

test('JSON追加: 不正なデータは一部も追加せず、既存Projectを保つ', () => {
  const current = createInitialProject(), before = serializeProject(current)
  for (const edit of [
    p => { p.schemaVersion = 2 },
    p => { p.slides[0].transitionId = 'missing' },
    p => { p.transitions[0].layers[0].id = p.transitions[0].id },
    p => { p.transitions[0].layers[0].geometry.width = -1 },
  ]) {
    const incoming = createInitialProject(); edit(incoming)
    assert.throws(() => applyProjectEdit(current, draft => appendProject(draft, incoming)), RangeError)
    assert.equal(serializeProject(current), before)
  }
})

test('JSON追加: 空のProjectと、演出のないスライドだけの追加にも対応', () => {
  const current = createInitialProject()
  const empty = { schemaVersion: 1, transitions: [], slides: [] }
  const unchanged = applyProjectEdit(current, draft => assert.deepEqual(appendProject(draft, empty), []))
  assert.deepEqual(unchanged, current)
  const incoming = { ...empty, slides: [
    { id: current.slides[0].id, component: 'TitleSlide', transitionId: null },
    { id: 'standalone-slide', component: 'ContentSlide' },
  ] }
  const next = applyProjectEdit(current, draft => assert.deepEqual(appendProject(draft, incoming), []))
  assert.deepEqual(next.transitions, current.transitions)
  assert.deepEqual(next.slides.slice(0, current.slides.length), current.slides)
  assert.equal(next.slides.at(-2).transitionId, null)
  assert.equal(Object.hasOwn(next.slides.at(-1), 'transitionId'), false)
  assert.equal(next.slides.at(-1).id, 'standalone-slide')
})
