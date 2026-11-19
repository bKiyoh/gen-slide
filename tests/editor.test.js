import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProject, validateProject, serializeProject, parseProject, applyProjectEdit, duplicateTransition, nextId } from '../src/domain/project/project.js'
import { evaluateTransition } from '../src/domain/transition/evaluateTransition.js'
import { displayContext, editBaseDisplay, addKey, editKeyDisplay, invertPoint } from '../src/editor/displayValues.js'
import { transformMatrix } from '../src/domain/transition/transform.js'
import { readStoredProject, createProjectStorage, STORAGE_KEY } from '../src/editor/projectStorage.js'
import { createPlaybackClock } from '../src/editor/playbackClock.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const fixture = () => { const project = createProject(); return { project, transition: project.transitions[0], group: project.transitions[0].layers[1], selection: { layerId: 'group-001', itemId: 'item-002' } } }

test('Project: JSON往復で状態と評価が一致。UI/DOM/GPUを含めない', () => {
  const project = createProject()
  assert.deepEqual(validateProject(project), project)
  const restored = parseProject(serializeProject(project))
  assert.deepEqual(restored, project)
  assert.deepEqual(evaluateTransition(restored.transitions[0], 400), evaluateTransition(project.transitions[0], 400))
  for (const extra of [new Date(), new Map(), () => {}, NaN, undefined, { nodeType: 1, remove() {} }]) {
    project.extra = extra
    assert.throws(() => serializeProject(project), RangeError)
  }
})

test('Project検証: スキーマ、参照、ID、時刻、途中のキーの異常を拒否', () => {
  for (const edit of [
    p => { p.schemaVersion = 2 }, p => { p.transitions[0].name = '' },
    p => { p.transitions[0].switchAtMs = 1300 }, p => { p.transitions[0].durationMs = -1 },
    p => { p.slides = [{ id: 'slide-001', component: 'TitleSlide', transitionId: 'missing' }] },
    p => { p.transitions[0].layers[0].id = p.transitions[0].id },
    p => { p.transitions[0].layers[0].tracks = [{ property: 'style.opacity', mode: 'offset', keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 400, value: 1 }, { timeMs: 1200, value: 0 }] }] },
    p => { p.transitions[0].layers[1].overrides['item-999'] = { tracks: [{ property: 'transform.x', mode: 'absolute', keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 0, value: 1 }] }] } },
  ]) { const project = createProject(); edit(project); assert.throws(() => validateProject(project), RangeError) }
  assert.throws(() => parseProject('{'), SyntaxError)
})

test('一操作一更新: 無効な編集は元データを変えず、有効な編集だけ新しいProjectを返す', () => {
  const project = createProject()
  const before = serializeProject(project)
  assert.throws(() => applyProjectEdit(project, p => { p.transitions[0].layers[0].geometry.width = -1 }), RangeError)
  assert.equal(serializeProject(project), before)
  const edited = applyProjectEdit(project, p => { p.transitions[0].name = 'Edited' })
  assert.notEqual(edited, project)
  assert.equal(project.transitions[0].name, 'Staggered sweep')
  assert.equal(edited.transitions[0].name, 'Edited')
})

test('複製: Transition/Layerの新IDは衝突せず、Override/Individualのキーは保持', () => {
  const project = createProject()
  const original = structuredClone(project.transitions[0])
  for (let index = 0; index < 3; index++) duplicateTransition(project, original.id)
  validateProject(project)
  const ids = project.transitions.flatMap(t => [t.id, ...t.layers.map(layer => layer.id)])
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(project.transitions[1].layers[1].overrides, original.layers[1].overrides)
  assert.equal(nextId(project, 'transition'), 'transition-005')
  project.transitions[1].layers[1].overrides['item-002'].style.color = '#000000'
  assert.equal(project.transitions[0].layers[1].overrides['item-002'].style.color, '#FFFFFF')
})

test('Modifierの無効化: データは保持し、後勝ちの評価からだけ外す', () => {
  const { transition, group } = fixture()
  group.modifiers.push({ property: 'geometry.width', type: 'alternate', values: [250], enabled: false })
  assert.equal(evaluateTransition(transition, 1200).shapes[1].geometry.width, 50)
  group.modifiers.at(-1).enabled = true
  assert.equal(evaluateTransition(transition, 1200).shapes[1].geometry.width, 250)
  group.modifiers.at(-1).enabled = 'false'
  assert.throws(() => evaluateTransition(transition, 0), RangeError)
})

test('逆変換: 非一様scale/rotation/translationの親でも画面X編集がYを保持', () => {
  const { project, transition, group, selection } = fixture()
  group.transform = { x: 100, y: 200, rotation: 30, scaleX: 2, scaleY: 3 }
  const before = displayContext(transition, selection, 'individual', 400)
  editBaseDisplay(transition, selection, 'transform.x', 700, 400)
  validateProject(project)
  const after = displayContext(transition, selection, 'individual', 400)
  near(after.values['transform.x'], 700)
  near(after.values['transform.y'], before.values['transform.y'])
  assert.ok(group.overrides['item-002'].transform.offsetY !== undefined)
  assert.throws(() => editBaseDisplay(transition, selection, 'transform.rotation', 30, 400), RangeError)
})

test('0倍率は逆変換を拒否。正の一様scaleでは角度/倍率の画面値を再現', () => {
  const { transition, group, selection } = fixture()
  group.transform.scaleX = 0
  const before = JSON.stringify(transition)
  assert.throws(() => editBaseDisplay(transition, selection, 'transform.x', 300, 1200), /逆変換/)
  assert.equal(JSON.stringify(transition), before)
  group.transform = { x: 0, y: 0, rotation: 30, scaleX: 2, scaleY: 2 }
  group.overrides['item-002'].tracks = []
  editBaseDisplay(transition, selection, 'transform.rotation', 60, 1200)
  editBaseDisplay(transition, selection, 'transform.scaleX', 3, 1200)
  const displayed = displayContext(transition, selection, 'individual', 1200).values
  near(displayed['transform.rotation'], 60)
  near(displayed['transform.scaleX'], 3)
  assert.deepEqual(invertPoint(transformMatrix({ x: 10, y: 20, rotation: 0 }), 30, 40), { x: 20, y: 20 })
})

test('ベース編集: Child差分を二重加算せず、absoluteで固定された値の変更を拒否', () => {
  const { transition, selection } = fixture()
  editBaseDisplay(transition, selection, 'transform.x', 500, 400)
  near(displayContext(transition, selection, 'individual', 400).values['transform.x'], 500)
  assert.throws(() => editBaseDisplay(transition, selection, 'transform.rotation', 50, 400), /キーで固定/)
})

test('位置キー: 明示的なX/Y追加後、親回転を逆算して画面位置を保存', () => {
  const { project, transition, group, selection } = fixture()
  group.transform.rotation = 30
  addKey(transition, selection, 'individual', 'transform.x', 400)
  const before = serializeProject(project)
  assert.throws(() => applyProjectEdit(project, p => editKeyDisplay(p.transitions[0], selection, 'individual', 'transform.x', 0, 700)), /X\/Yキー/)
  assert.equal(serializeProject(project), before)
  addKey(transition, selection, 'individual', 'transform.y', 400)
  const priorY = displayContext(transition, selection, 'individual', 400).values['transform.y']
  editKeyDisplay(transition, selection, 'individual', 'transform.x', 0, 700)
  validateProject(project)
  near(displayContext(transition, selection, 'individual', 400).values['transform.x'], 700)
  near(displayContext(transition, selection, 'individual', 400).values['transform.y'], priorY)
  assert.throws(() => addKey(transition, selection, 'individual', 'transform.x', 400), /既に/)
})

test('Child共通キー: 基準item-000の表示値を保存し、Individualの差し替えを維持', () => {
  const { project, transition, group } = fixture()
  const selection = { layerId: group.id }
  addKey(transition, selection, 'child', 'transform.x', 400)
  editKeyDisplay(transition, selection, 'child', 'transform.x', 1, 500)
  near(displayContext(transition, selection, 'child', 400).values['transform.x'], 500)
  validateProject(project)
  group.overrides['item-000'] = { tracks: [{ property: 'transform.x', mode: 'absolute', keyframes: [{ timeMs: 0, value: 10 }] }] }
  assert.throws(() => addKey(transition, selection, 'child', 'transform.x', 300), /Individual/)
})

test('保存: 500msデバウンスは最後のProjectを保存し、失敗時も再試行できる', () => {
  let callback, delay, saved, fail = false
  const statuses = []
  const storage = createProjectStorage({ getStorage: () => ({ setItem(key, value) { assert.equal(key, STORAGE_KEY); if (fail) throw new Error('quota'); saved = value } }),
    onStatus: state => statuses.push(state.state), setTimer(fn, ms) { callback = fn; delay = ms; return 1 }, clearTimer() {} })
  const first = createProject(), last = createProject()
  last.transitions[0].name = 'Last'
  storage.schedule(first); storage.schedule(last)
  assert.equal(delay, 500)
  assert.equal(saved, undefined)
  callback()
  assert.equal(JSON.parse(saved).transitions[0].name, 'Last')
  fail = true
  storage.schedule(first); callback()
  assert.equal(statuses.at(-1), 'error')
  assert.equal(JSON.parse(saved).transitions[0].name, 'Last')
  fail = false; storage.flush()
  assert.equal(statuses.at(-1), 'saved')
})

test('復元エラー: 壊れた原本を上書きせず、再取得/有効JSONの適用を待つ', () => {
  for (const getStorage of [() => ({ getItem: () => '{broken' }), () => { throw new Error('denied') }]) {
    const result = readStoredProject(getStorage, createProject)
    assert.equal(result.blocked, true)
    assert.ok(result.error.length)
    let writes = 0
    const persistence = createProjectStorage({ getStorage: () => ({ setItem() { writes++ } }), onStatus() {}, blocked: result.blocked, setTimer() { return 1 }, clearTimer() {} })
    persistence.schedule(result.project); persistence.flush()
    assert.equal(writes, 0)
    persistence.unblock(result.project); persistence.flush()
    assert.equal(writes, 1)
  }
})

test('再生時計: 実時間、pause/resume、seek、終端、非表示タブ相当のジャンプ、破棄', () => {
  let now = 1000, callback, current, playing, cancelled = 0
  const clock = createPlaybackClock({ now: () => now, getDuration: () => 1200, requestFrame: fn => { callback = fn; return 1 }, cancelFrame: () => cancelled++, onTime: value => { current = value }, onPlaying: value => { playing = value } })
  clock.play(); callback(1100); assert.equal(current, 100)
  clock.pause(); assert.equal(playing, false); assert.ok(cancelled > 0)
  now = 2000; clock.play(); callback(2100); assert.equal(current, 200)
  now = 2100; clock.seek(500); callback(2200); assert.equal(current, 600)
  callback(100000); assert.equal(current, 1200); assert.equal(playing, false)
  clock.play(); assert.equal(current, 0)
  clock.stop(); assert.equal(current, 0); assert.equal(playing, false)
  assert.throws(() => clock.seek(NaN), RangeError)
  clock.play(); clock.dispose(); assert.equal(playing, false)
})
