import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateEasing } from '../src/domain/transition/animation/easing.js'
import { evaluateTrack, prepareTracks } from '../src/domain/transition/animation/tracks.js'
import { evaluateTransition } from '../src/domain/transition/evaluateTransition.js'
import { resolveStaticShapes, resolveLocalShapes } from '../src/domain/transition/resolveStaticShapes.js'
import { createSampleTransition } from '../src/domain/transition/sampleTransition.js'
import { createSampleAnimatedTransition } from '../src/domain/transition/sampleAnimatedTransition.js'

const track = (property, mode = 'offset', from = 0, to = 100) => ({ property, mode,
  keyframes: [{ timeMs: 0, value: from }, { timeMs: 100, value: to }] })
const fixed = (property, mode, value) => ({ property, mode, keyframes: [{ timeMs: 0, value }] })
const children = state => state.shapes.filter(shape => shape.groupId)
function sample() {
  const transition = createSampleTransition()
  return { transition, group: transition.layers[1], shape: transition.layers[0] }
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`) }

for (const [name, expected] of Object.entries({
  linear: [0, 0.25, 0.5, 0.75, 1],
  easeInCubic: [0, 0.015625, 0.125, 0.421875, 1],
  easeOutCubic: [0, 0.578125, 0.875, 0.984375, 1],
  easeInOutCubic: [0, 0.0625, 0.5, 0.9375, 1],
})) {
  test(`Easing ${name}: 0/0.25/0.5/0.75/1`, () => {
    for (const [index, progress] of [0, 0.25, 0.5, 0.75, 1].entries()) near(evaluateEasing(name, progress), expected[index])
  })
}

test('Easing: 未対応名と不正な進行率を拒否', () => {
  for (const name of ['unknown', 'toString', null]) assert.throws(() => evaluateEasing(name, 0.5), RangeError)
  for (const progress of [-0.1, 1.1, NaN, Infinity, '0.5']) assert.throws(() => evaluateEasing('linear', progress), RangeError)
})

test('Track: 空・1件・複数のキー、区間外と正確な端点', () => {
  assert.equal(evaluateTrack({ ...track('transform.x'), keyframes: [] }, 0), undefined)
  const single = fixed('transform.x', 'offset', 37)
  for (const time of [-100, 0, 50, 10000]) assert.equal(evaluateTrack(single, time), 37)
  const multiple = { property: 'transform.x', mode: 'offset', keyframes: [
    { timeMs: 100, value: 0 }, { timeMs: 200, value: 80 }, { timeMs: 300, value: -20 },
  ] }
  for (const [time, expected] of [[-100, 0], [100, 0], [150, 40], [200, 80], [250, 30], [300, -20], [400, -20]]) {
    assert.equal(evaluateTrack(multiple, time), expected)
  }
})

test('Track: 開始側Easingが各区間に適用され、未整列の入力は非破壊で昇順化', () => {
  const value = { property: 'transform.x', mode: 'offset', keyframes: [
    { timeMs: 200, value: 0 }, { timeMs: 0, value: 0, easing: 'easeInCubic' }, { timeMs: 100, value: 80, easing: 'easeOutCubic' },
  ] }
  const before = structuredClone(value)
  assert.equal(evaluateTrack(value, 50), 10)
  assert.equal(evaluateTrack(value, 150), 10)
  assert.equal(evaluateTrack(value, 100), 80)
  assert.deepEqual(value, before)
})

test('Track: 型・値・時刻・重複・Easing・未対応propertyを明示的に拒否', () => {
  for (const bad of [
    null, { ...track('style.color'), keyframes: [{ timeMs: 0, value: '#FF0000' }] },
    track('geometry.width'), track('transform.offsetX'), { ...track('transform.x'), mode: 'multiply' },
    { ...track('transform.x'), keyframes: null }, { ...track('transform.x'), keyframes: Array(1) },
    { ...track('transform.x'), keyframes: [{ timeMs: 10, value: 0 }, { timeMs: 10, value: 1 }] },
    ...[-1, NaN, Infinity, '0', undefined].map(timeMs => ({ ...track('transform.x'), keyframes: [{ timeMs, value: 0 }] })),
    ...[NaN, Infinity, '1', null].map(value => fixed('transform.x', 'offset', value)),
    fixed('style.opacity', 'absolute', -0.1), fixed('style.opacity', 'absolute', 1.1),
    fixed('geometry.skewX', 'absolute', 81), fixed('transform.scaleX', 'absolute', 101),
    fixed('style.opacity', 'offset', 1.1),
    { ...track('transform.x'), keyframes: [{ timeMs: 0, value: 1, easing: 'unknown' }] },
  ]) assert.throws(() => evaluateTrack(bad, 50), RangeError)
  assert.throws(() => prepareTracks([track('transform.x'), track('transform.x')]), /重複/)
  assert.throws(() => prepareTracks({}), RangeError)
  for (const time of [NaN, Infinity, '50', undefined]) assert.throws(() => evaluateTrack(track('transform.x'), time), RangeError)
})

test('静的API互換: AnimationなしはPhase 1と一致、ローカルAPIには親合成を含めない', () => {
  const { transition, group } = sample()
  group.transform.x = 100
  group.transform.rotation = 30
  assert.deepEqual(evaluateTransition(transition, 500), resolveStaticShapes(transition))
  assert.equal(resolveLocalShapes(transition).shapes[1].worldMatrix, undefined)
  assert.equal(resolveLocalShapes(transition).shapes[1].transform.x, 200)
})

test('Transition時刻: 負値/終了超過をclamp、duration=0、異常値を拒否', () => {
  const transition = createSampleAnimatedTransition()
  assert.deepEqual(evaluateTransition(transition, -100), evaluateTransition(transition, 0))
  assert.deepEqual(evaluateTransition(transition, 10000), evaluateTransition(transition, 1200))
  transition.durationMs = 0
  assert.deepEqual(evaluateTransition(transition, 100), evaluateTransition(transition, 0))
  for (const time of [NaN, Infinity, -Infinity, '', '100', undefined]) assert.throws(() => evaluateTransition(transition, time), RangeError)
  for (const duration of [-1, NaN, Infinity, '100', undefined]) {
    transition.durationMs = duration
    assert.throws(() => evaluateTransition(transition, 0), RangeError)
  }
})

test('Shape: absoluteはローカル値の置換、offsetは静的なベースに加算', () => {
  const { transition, shape } = sample()
  shape.tracks = [track('transform.x', 'offset', 0, 100), track('transform.y', 'absolute', 0, 100),
    fixed('transform.rotation', 'absolute', 30), fixed('geometry.skewX', 'absolute', 0), fixed('style.opacity', 'offset', -0.5)]
  const result = evaluateTransition(transition, 50).shapes[0]
  assert.equal(result.transform.x, shape.transform.x + 50)
  assert.equal(result.transform.y, 50)
  assert.equal(result.transform.rotation, 30)
  assert.equal(result.style.opacity, 0.5)
})

test('scale offsetは全階層で加算: base1+0は1、base1-1は0、未指定baseも1', () => {
  const { transition, group, shape } = sample()
  delete shape.transform.scaleX
  shape.tracks = [fixed('transform.scaleX', 'offset', 0)]
  group.tracks = [fixed('transform.scaleX', 'offset', 1)]
  group.childAnimation.tracks = [fixed('transform.scaleX', 'offset', -1), fixed('transform.scaleY', 'offset', 0.5)]
  group.overrides['item-002'].tracks = [fixed('transform.scaleX', 'offset', -0.25)]
  const result = evaluateTransition(transition, 0)
  assert.equal(result.shapes[0].transform.scaleX, 1)
  const shapes = children(result)
  assert.equal(shapes[0].transform.scaleX, 0)
  assert.equal(shapes[0].transform.scaleY, 1.5)
  assert.equal(shapes[2].transform.scaleX, 0.75)
  near(shapes[2].worldMatrix[0], 1.5) // 親scale 2 × 子scale 0.75
  assert.ok(shapes[0].worldMatrix.every(Number.isFinite))
})

test('Stagger: index*40をChildだけから減算、負のローカル時刻は先頭キー', () => {
  const { transition, group } = sample()
  group.childAnimation = { staggerMs: 40, tracks: [track('transform.x', 'offset', -100, 0)] }
  const result = children(evaluateTransition(transition, 60))
  assert.equal(result[0].transform.x, 200 - 40)
  assert.equal(result[1].transform.x, 365 - 80)
  assert.equal(result[2].transform.x, 570 - 100)
  group.childAnimation.staggerMs = 0
  assert.equal(children(evaluateTransition(transition, 60))[2].transform.x, 570 - 40)
})

test('Individual: 同じpropertyのみChildと差し替え、全体時刻を使用し二重加算しない', () => {
  const { transition, group } = sample()
  group.overrides['item-002'].transform.rotation = 10
  group.overrides['item-002'].tracks = [track('transform.rotation', 'offset', 0, 100)]
  group.childAnimation = { staggerMs: 40, tracks: [track('transform.rotation', 'offset', 0, 20), track('transform.x', 'offset', -100, 0)] }
  let third = children(evaluateTransition(transition, 100))[2]
  assert.equal(third.transform.rotation, 110) // 個別10+100。Childの4は加算しない
  assert.equal(third.transform.x, 570 - 80) // XだけChildのローカル20ms
  assert.equal(third.style.color, '#FFFFFF')
  group.overrides['item-002'].tracks = [fixed('transform.rotation', 'absolute', 45)]
  third = children(evaluateTransition(transition, 100))[2]
  assert.equal(third.transform.rotation, 45)
  group.overrides['item-002'].tracks[0].keyframes = []
  assert.equal(children(evaluateTransition(transition, 100))[2].transform.rotation, 14) // 空キーはChildを隠さない
})

test('Group: 原点ピボット、親scale→rotation→translationを子の変換後に一度だけ合成', () => {
  const { transition, group } = sample()
  group.template.transform.rotation = 45
  group.tracks = [fixed('transform.x', 'offset', 100), fixed('transform.y', 'absolute', 200),
    fixed('transform.rotation', 'absolute', 90), fixed('transform.scaleX', 'offset', 1), fixed('transform.scaleY', 'absolute', 3)]
  const first = children(evaluateTransition(transition, 50))[0]
  assert.equal(first.transform.x, 200)
  assert.equal(first.transform.rotation, 45)
  const expected = [-3 * Math.SQRT1_2, 2 * Math.SQRT1_2, -3 * Math.SQRT1_2, -2 * Math.SQRT1_2, -1040, 600]
  first.worldMatrix.forEach((value, index) => near(value, expected[index]))
})

test('傾斜・不透明度の補間とStatic Overrideのベース値、負scaleの絶対値指定', () => {
  const { transition, group } = sample()
  group.childAnimation.tracks = [track('geometry.skewX', 'absolute', -20, 20),
    track('style.opacity', 'offset', 0, -0.4), track('transform.scaleY', 'absolute', -1, 1)]
  group.overrides['item-002'].style.opacity = 0.6
  const shapes = children(evaluateTransition(transition, 50))
  assert.equal(shapes[0].geometry.skewX, 0)
  assert.equal(shapes[0].style.opacity, 0.8)
  near(shapes[2].style.opacity, 0.4)
  assert.equal(shapes[0].transform.scaleY, 0)
  assert.equal(children(evaluateTransition(transition, 0))[0].transform.scaleY, -1)
})

test('評価結果の範囲外を拒否: offset加算後のopacity/scale/傾斜/座標とGroup', () => {
  for (const bad of [fixed('style.opacity', 'offset', 0.5), fixed('transform.scaleX', 'offset', 100),
    fixed('geometry.skewX', 'offset', 1), fixed('transform.x', 'offset', 38400)]) {
    const { transition, shape } = sample()
    shape.tracks = [bad]
    assert.throws(() => evaluateTransition(transition, 0), RangeError)
  }
  const { transition, group } = sample()
  group.tracks = [fixed('transform.scaleX', 'offset', 100)]
  assert.throws(() => evaluateTransition(transition, 0), RangeError)
  group.tracks = [fixed('style.opacity', 'absolute', 0.5)]
  assert.throws(() => evaluateTransition(transition, 0), /未対応/)
})

test('不正なChild、Stagger、非表示Individual、0個のGroupにも検証が働く', () => {
  for (const bad of [null, [], { staggerMs: -1 }, { staggerMs: NaN }, { staggerMs: '40' },
    { staggerMs: 0, tracks: null }, { staggerMs: 0, tracks: [track('style.color')] }, { staggerMs: Number.MAX_VALUE, tracks: [] }]) {
    const { transition, group } = sample()
    group.childAnimation = bad
    assert.throws(() => evaluateTransition(transition, 0), RangeError)
  }
  const { transition, group } = sample()
  group.generator.count = 0
  group.overrides['item-999'] = { tracks: [track('style.color')] }
  assert.throws(() => evaluateTransition(transition, 0), /未対応/)
  delete group.overrides['item-999']
  group.childAnimation.tracks = [track('style.color')]
  assert.throws(() => evaluateTransition(transition, 0), /未対応/)
  delete group.childAnimation
  group.tracks = []
  assert.equal(evaluateTransition(transition, 0).shapes.length, 1)
})

test('デモ: -1000→0、共通回転と白い図形の個別回転、親Y移動の合成', () => {
  const transition = createSampleAnimatedTransition()
  const zero = children(evaluateTransition(transition, 0))
  assert.equal(zero[0].transform.x, -800)
  assert.equal(zero[0].transform.rotation, -45)
  assert.equal(zero[2].transform.rotation, 90)
  assert.equal(zero[2].worldMatrix[5], 450 - 80)
  const middle = children(evaluateTransition(transition, 400))
  near(middle[2].transform.rotation, 19.44)
  assert.ok(middle[0].transform.x > middle[1].transform.x - 165)
  assert.deepEqual(evaluateTransition(transition, 1200), resolveStaticShapes(transition))
})

test('非破壊・決定論: freezeした入力で800→0→800が一致し、ID/順序を維持する', () => {
  const transition = createSampleAnimatedTransition()
  const snapshot = structuredClone(transition)
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  }
  freeze(transition)
  const first = evaluateTransition(transition, 800)
  evaluateTransition(transition, 0)
  assert.deepEqual(evaluateTransition(transition, 800), first)
  assert.deepEqual(transition, snapshot)
  assert.deepEqual(first.shapes.map(shape => shape.id), resolveStaticShapes(transition).shapes.map(shape => shape.id))
  first.shapes[1].transform.x = 0
  first.shapes[1].style.color = '#000000'
  assert.deepEqual(transition, snapshot)
  assert.notDeepEqual(evaluateTransition(transition, 800), first)
})
