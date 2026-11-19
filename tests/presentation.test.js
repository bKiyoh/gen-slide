import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createInitialProject, addPresentationSample } from '../src/domain/project/presentationSample.js'
import { createProject, validateProject, serializeProject, parseProject } from '../src/domain/project/project.js'
import { validateTransitionForPlayback, transitionFrame } from '../src/presentation/transitionFrame.js'
import { createPresentationController } from '../src/presentation/presentationController.js'

function fixture(overrides = {}) {
  const project = createInitialProject()
  let time = 0, nextId = 0
  const frames = new Map(), events = [], states = [], warnings = []
  const controller = createPresentationController({
    getProject: () => project, isReady: () => true,
    prepare: async () => { events.push(['prepare']) }, draw: async frame => { events.push(['draw', frame.timeMs]) },
    clear: () => { events.push(['clear']) },
    now: () => time, requestFrame: callback => { frames.set(++nextId, callback); return nextId }, cancelFrame: id => frames.delete(id),
    onSlide: value => { events.push(['slide', value]) }, onState: value => states.push(value), onWarning: message => warnings.push(message), ...overrides,
  })
  async function tick(value) {
    time = value
    const callbacks = [...frames.values()]; frames.clear()
    for (const callback of callbacks) callback(value)
    for (let index = 0; index < 20; index++) await Promise.resolve()
  }
  return { project, controller, events, states, warnings, frames, tick }
}
const slides = fixture => fixture.events.filter(event => event[0] === 'slide').map(event => event[1])

test('発表サンプル: 既存作品を保持し、3枚・異なる2演出をJSON往復できる', () => {
  const base = createProject(), original = serializeProject(base)
  addPresentationSample(base)
  validateProject(base)
  assert.equal(base.slides.length, 3)
  assert.equal(new Set(base.slides.slice(0, 2).map(slide => slide.transitionId)).size, 2)
  assert.equal(serializeProject({ ...base, slides: [], transitions: base.transitions.slice(0, 1) }), original)
  assert.deepEqual(parseProject(serializeProject(base)), base)
  for (const slide of base.slides.slice(0, 2)) validateTransitionForPlayback(base.transitions.find(t => t.id === slide.transitionId))
  addPresentationSample(base); validateProject(base); assert.equal(base.slides.length, 6)
})

test('Slideのcomponentは文字列のみ。未知の文字列は安全なプレースホルダー用に保持する', () => {
  for (const value of ['', null, {}, 3]) {
    const project = createInitialProject(); project.slides[0].component = value
    assert.throws(() => validateProject(project), RangeError)
  }
  const project = createInitialProject(); project.slides[0].component = '<script>alert(1)</script>'
  assert.equal(validateProject(project), project)
})

test('再生時刻の異常は拒否し、coverなし・部分的な図形でも再生を許可する', () => {
  const transition = createInitialProject().transitions[1]
  for (const edit of [t => { t.switchAtMs = NaN }, t => { t.durationMs = -1 }, t => { t.switchAtMs = 1201 }]) {
    const t = structuredClone(transition); edit(t); assert.throws(() => validateTransitionForPlayback(t), RangeError)
  }
  assert.ok(validateTransitionForPlayback(transition).shapes.length)
  assert.equal(Object.hasOwn(transitionFrame(transition, 600), 'coverColor'), false)
  const empty = { ...transition, layers: [] }
  assert.deepEqual(validateTransitionForPlayback(empty).shapes, [])
})

test('旧coverのON/OFF/範囲は描画に影響せず、旧JSONとcoverなしJSONを読み書きできる', () => {
  const project = createInitialProject()
  const before = transitionFrame(project.transitions[1], 600)
  for (const cover of [{ enabled: true, color: '#182436', fromMs: 550, toMs: 650 }, { enabled: false }, null,
    { enabled: true, color: 'unused legacy value', fromMs: 9999, toMs: -1 }]) {
    project.transitions[1].cover = cover
    const restored = parseProject(serializeProject(project))
    assert.deepEqual(restored.transitions[1].cover, cover)
    assert.deepEqual(transitionFrame(restored.transitions[1], 600), before)
    validateTransitionForPlayback(restored.transitions[1])
  }
  assert.ok(createInitialProject().transitions.every(t => !Object.hasOwn(t, 'cover')))
})

test('switch前後: 一度だけDOM変更、終了後に演出解除、2種類の演出で3枚へ', async () => {
  const f = fixture()
  assert.equal(f.controller.previous(), false)
  await f.controller.next(); await f.tick(599)
  assert.deepEqual(slides(f), [])
  await f.tick(600); assert.deepEqual(slides(f), [1])
  await f.tick(650); assert.deepEqual(slides(f), [1])
  await f.tick(1200); assert.equal(f.states.at(-1).state, 'idle'); assert.equal(f.frames.size, 0)
  await f.controller.next(); await f.tick(1750); await f.tick(2300)
  assert.deepEqual(slides(f), [1, 2]); assert.equal(await f.controller.next(), false)
  assert.equal(f.controller.previous(), true); assert.deepEqual(slides(f), [1, 2, 1])
})

test('フレーム飛び: 一度だけDOM変更し、実経過時刻の終端を描画して解除', async () => {
  const f = fixture(); await f.controller.next(); f.events.length = 0
  await f.tick(5000)
  assert.deepEqual(f.events, [['slide', 1], ['draw', 1200], ['clear']])
  assert.equal(f.states.at(-1).state, 'idle')
})

test('高速入力: 非同期の準備中・描画中も次/前を無視する', async () => {
  let release
  const f = fixture({ prepare: () => new Promise(resolve => { release = resolve }) })
  const started = f.controller.next()
  assert.equal(await f.controller.next(), false); assert.equal(f.controller.previous(), false)
  release(); await started
  for (let index = 0; index < 10; index++) assert.equal(await f.controller.next(), false)
  await f.tick(1300); assert.deepEqual(slides(f), [1])
})

test('即時フォールバック: 未設定・存在しない参照・初期化失敗・無効時刻でも操作を継続', async () => {
  for (const mode of ['unset', 'missing', 'notReady', 'invalidTime']) {
    const f = fixture(mode === 'notReady' ? { isReady: () => false } : {})
    if (mode === 'unset') f.project.slides[0].transitionId = null
    if (mode === 'missing') f.project.slides[0].transitionId = 'missing'
    if (mode === 'invalidTime') f.project.transitions[1].switchAtMs = -1
    await f.controller.next(); assert.deepEqual(slides(f), [1]); assert.equal(f.states.at(-1).state, 'idle')
    assert.equal(f.controller.previous(), true)
    if (mode !== 'unset') assert.ok(f.warnings.length)
  }
})

test('再生途中エラー: switch前後とも行先を確定し、二重変更・残存RAFを防ぐ', async () => {
  for (const switched of [false, true]) {
    const f = fixture(); await f.controller.next()
    if (switched) await f.tick(600)
    f.controller.fail(new Error('device lost'))
    assert.deepEqual(slides(f), [1]); assert.equal(f.frames.size, 0)
    await f.tick(2000); assert.deepEqual(slides(f), [1]); assert.equal(f.states.at(-1).state, 'idle')
    assert.equal(f.controller.previous(), true)
  }
})

test('描画/準備の例外も行先へ切替。破棄後の非同期完了で復活しない', async () => {
  for (const overrides of [{ prepare: async () => { throw Error('compile') } }, { draw: async () => { throw Error('render') } }]) {
    const f = fixture(overrides); await f.controller.next(); assert.deepEqual(slides(f), [1]); assert.equal(f.states.at(-1).state, 'idle')
  }
  let release
  const f = fixture({ prepare: () => new Promise(resolve => { release = resolve }) })
  const started = f.controller.next(); f.controller.dispose(); release(); await started
  assert.deepEqual(slides(f), []); assert.equal(f.frames.size, 0)
})

test('DOM変更中の破棄で描画が復活しない。duration/switch=0にも一度だけ対応', async () => {
  let release
  const f = fixture({ onSlide: () => new Promise(resolve => { release = resolve }) })
  await f.controller.next(); await f.tick(600); f.controller.dispose()
  const count = f.events.filter(event => event[0] === 'draw').length
  release(); await f.tick(800)
  assert.equal(f.events.filter(event => event[0] === 'draw').length, count)
  assert.equal(f.frames.size, 0)
  const zero = fixture(); const t = zero.project.transitions[1]
  Object.assign(t, { durationMs: 0, switchAtMs: 0 })
  await zero.controller.next(); assert.deepEqual(slides(zero), [1]); assert.equal(zero.states.at(-1).state, 'idle')
})

test('ユーザーの4枚Project: 全画面を覆わない14図形の演出もスキップせず二回再生する', async () => {
  const project = parseProject(readFileSync(new URL('./fixtures/presentation-legacy-cover.json', import.meta.url), 'utf8'))
  const f = fixture({ getProject: () => project })
  assert.equal(project.transitions[0].layers[0].generator.count, 14)
  assert.equal(project.transitions[0].cover.enabled, false)
  assert.equal(project.transitions[1].cover.enabled, true)
  for (const [start, switchAt, end] of [[0, 550, 1100], [1100, 1700, 2300], [2300, 2900, 3500]]) {
    await f.controller.next()
    assert.equal(f.states.at(-1).state, 'transitioning')
    await f.tick(start + 200)
    assert.equal(f.states.at(-1).state, 'transitioning')
    await f.tick(switchAt)
    await f.tick(end)
    assert.equal(f.states.at(-1).state, 'idle')
  }
  assert.deepEqual(slides(f), [1, 2, 3])
  assert.deepEqual(f.warnings, [])
})
