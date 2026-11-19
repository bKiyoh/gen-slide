import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRenderer, nextTick } from 'vue'
import { useEditor } from '../src/editor/useEditor.js'
import { createInitialProject } from '../src/domain/project/presentationSample.js'

// DOM・GPUを必要とせず、Vueのsetup/破棄とEditorの公開操作を検証する。
function mountEditor() {
  const previousWindow = globalThis.window
  const storage = new Map()
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null })
  let editor
  const app = renderer.createApp({ setup() { editor = useEditor(createInitialProject()); return () => null } })
  app.mount({})
  return { editor, dispose() { app.unmount(); globalThis.window = previousWindow } }
}

test('発表構成のプレビュー選択は割り当てた演出へ切替、選択状態をProjectに保存しない', async () => {
  const fixture = mountEditor(), e = fixture.editor
  try {
    const source = e.project.slides[1]
    e.selectSlide(source.id)
    assert.equal(e.previewSlide.id, source.id)
    assert.equal(e.transition.id, source.transitionId)
    assert.equal(e.timeMs, 0)
    assert.equal(e.selection, null)
    assert.equal(Object.hasOwn(e.project, 'previewSlide'), false)
    e.selectTransition(e.project.transitions[0].id)
    assert.equal(e.previewSlide, null)
    await nextTick()
  } finally { fixture.dispose() }
})

test('スライドの内容・演出・即時切替の変更をEditorの状態へ反映する', async () => {
  const fixture = mountEditor(), e = fixture.editor
  try {
    const id = e.project.slides[0].id
    e.selectSlide(id)
    e.commit(project => { project.slides[0].component = 'ClosingSlide' })
    assert.equal(e.previewSlide.component, 'ClosingSlide')
    const assigned = e.project.transitions[2].id
    e.commit(project => { project.slides[0].transitionId = assigned })
    assert.equal(e.transition.id, assigned)
    e.commit(project => { project.slides[0].transitionId = null })
    await nextTick()
    assert.equal(e.previewSlide.id, id)
    assert.equal(e.transition, undefined)
    assert.deepEqual(e.renderShapes, [])
  } finally { fixture.dispose() }
})

test('並べ替え後もIDで選択を保持し、プレビュー対象を削除したら通常の演出編集へ戻る', async () => {
  const fixture = mountEditor(), e = fixture.editor
  try {
    const id = e.project.slides[0].id
    e.selectSlide(id)
    e.commit(project => { project.slides.reverse() })
    assert.equal(e.previewSlide.id, id)
    assert.equal(e.project.slides.findIndex(slide => slide.id === id), 2)
    e.commit(project => { project.slides = project.slides.filter(slide => slide.id !== id) })
    assert.equal(e.previewSlide, null)
    assert.equal(e.transition.id, e.project.transitions[0].id)
    await nextTick()
  } finally { fixture.dispose() }
})
