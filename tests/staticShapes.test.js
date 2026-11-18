import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generatePositions, MAX_SHAPES } from '../src/domain/transition/generators.js'
import { createSampleTransition, createSampleGridGenerator } from '../src/domain/transition/sampleTransition.js'
import { resolveStaticShapes } from '../src/domain/transition/resolveStaticShapes.js'
import { composeShapeMatrix } from '../src/domain/transition/transform.js'

function sample() {
  const transition = createSampleTransition()
  return { transition, group: transition.layers[1] }
}
function children(transition) { return resolveStaticShapes(transition).shapes.filter(shape => shape.groupId) }
function near(actual, expected) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9, `${value} != ${expected[index]}`))
}

test('Linear: 先頭・末尾、負/0ステップ、0個、上限を扱う', () => {
  const generator = { type: 'linear', count: 3, startX: 100, startY: 200, stepX: -20, stepY: 0 }
  assert.deepEqual(generatePositions(generator), [
    { itemId: 'item-000', index: 0, x: 100, y: 200 },
    { itemId: 'item-001', index: 1, x: 80, y: 200 },
    { itemId: 'item-002', index: 2, x: 60, y: 200 },
  ])
  assert.deepEqual(generatePositions({ ...generator, count: 0 }), [])
  assert.equal(generatePositions({ ...generator, count: MAX_SHAPES, stepX: 0 }).length, MAX_SHAPES)
})

test('Grid: 行優先、原点間ステップ、行列オフセット、1×1と0行列', () => {
  const generator = { type: 'grid', rows: 2, columns: 3, startX: 10, startY: 20, gapX: 100, gapY: -80, rowOffsetX: 15, columnOffsetY: -5 }
  assert.deepEqual(generatePositions(generator).map(({ x, y }) => [x, y]), [
    [10, 20], [110, 15], [210, 10], [25, -60], [125, -65], [225, -70],
  ])
  assert.equal(generatePositions({ ...generator, rows: 1, columns: 1 }).length, 1)
  assert.deepEqual(generatePositions({ ...generator, rows: 0 }), [])
  assert.deepEqual(generatePositions({ ...generator, columns: 0 }), [])
  assert.equal(generatePositions({ ...generator, rows: 10, columns: 100, gapX: 0, gapY: 0 }).length, MAX_SHAPES)
})

test('Generator: 負数、小数、型違い、NaN、無限大、積の上限と生成座標範囲を拒否', () => {
  const generator = sample().group.generator
  for (const count of [-1, 1.5, '2', NaN, Infinity, MAX_SHAPES + 1]) assert.throws(() => generatePositions({ ...generator, count }), RangeError)
  for (const key of ['startX', 'startY', 'stepX', 'stepY']) {
    for (const value of [NaN, Infinity, '0']) assert.throws(() => generatePositions({ ...generator, [key]: value }), RangeError)
  }
  const grid = createSampleGridGenerator()
  assert.throws(() => generatePositions({ ...grid, rows: 32, columns: 32 }), /rows × columns/)
  assert.throws(() => generatePositions({ ...grid, columns: -1 }), RangeError)
  assert.throws(() => generatePositions({ ...grid, rowOffsetX: NaN }), RangeError)
  assert.throws(() => generatePositions({ ...generator, stepX: 19200 }), /生成位置/)
  assert.throws(() => generatePositions({ ...generator, count: 0, stepY: NaN }), RangeError)
  assert.throws(() => generatePositions({ type: 'random' }), RangeError)
})

test('サンプル: ShapeとGroup混在、交互色、幅50→200、item-002は白・X+40', () => {
  const { transition } = sample()
  const shapes = resolveStaticShapes(transition).shapes
  assert.equal(shapes.length, 11)
  assert.equal(shapes[0].id, 'background-shape')
  assert.deepEqual(shapes.slice(1, 5).map(shape => shape.style.color), ['#FF0000', '#0000FF', '#FFFFFF', '#0000FF'])
  assert.equal(shapes[1].geometry.width, 50)
  assert.equal(shapes.at(-1).geometry.width, 200)
  assert.equal(shapes[3].transform.x, 200 + 2 * 165 + 40)
  transition.layers.reverse()
  assert.equal(resolveStaticShapes(transition).shapes.at(-1).id, 'background-shape')
})

test('安定IDとOverride: 10→2→0→10、別Group、Gridの列数変更でもindexへ適用', () => {
  const { transition, group } = sample()
  const initial = children(transition)
  const stored = structuredClone(group.overrides)
  for (const count of [2, 0, 10]) {
    group.generator.count = count
    assert.equal(children(transition).length, count)
    assert.deepEqual(group.overrides, stored)
  }
  assert.deepEqual(children(transition), initial)
  group.generator = createSampleGridGenerator()
  for (const columns of [4, 2]) {
    group.generator.columns = columns
    const child = children(transition)[2]
    assert.equal(child.id, 'group-001/item-002')
    assert.equal(child.style.color, '#FFFFFF')
    assert.equal(child.transform.x, columns === 4 ? 1140 : 370)
  }
  transition.layers.push({ ...structuredClone(group), id: 'group-002' })
  const ids = resolveStaticShapes(transition).shapes.map(shape => shape.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('Modifier: N=1はfrom、0個でも検証、配列順の後勝ち、位置は基準+最後の値', () => {
  const { transition, group } = sample()
  group.generator.count = 1
  assert.equal(children(transition)[0].geometry.width, 50)
  group.template.transform.x = 7
  group.modifiers.push(
    { type: 'alternate', property: 'geometry.width', values: [99] },
    { type: 'alternate', property: 'transform.x', values: [10] },
    { type: 'linear', property: 'transform.x', from: 20, to: 30 },
    { type: 'alternate', property: 'transform.y', values: [-10] },
  )
  const shape = children(transition)[0]
  assert.equal(shape.geometry.width, 99)
  assert.equal(shape.transform.x, 200 + 7 + 20)
  assert.equal(shape.transform.y, 370)
  group.modifiers.reverse()
  assert.equal(children(transition)[0].geometry.width, 50)
  assert.equal(children(transition)[0].transform.x, 200 + 7 + 10)
  group.generator.count = 0
  group.modifiers.push({ type: 'alternate', property: 'style.color', values: [] })
  assert.throws(() => children(transition), /空でない/)
})

test('Modifier: 全対応数値プロパティを評価し、未対応・型・範囲違いを明示的に拒否', () => {
  const { transition, group } = sample()
  group.overrides = {}
  group.modifiers = ['geometry.width', 'geometry.height', 'geometry.skewX', 'transform.rotation', 'style.opacity', 'transform.x', 'transform.y']
    .map(property => ({ type: 'linear', property, from: 0, to: property === 'style.opacity' ? 1 : 20 }))
  const shapes = children(transition)
  assert.equal(shapes[0].geometry.height, 0)
  assert.equal(shapes.at(-1).geometry.skewX, 20)
  assert.equal(shapes.at(-1).transform.rotation, 20)
  assert.equal(shapes.at(-1).style.opacity, 1)
  assert.equal(shapes.at(-1).transform.x, group.generator.startX + 9 * group.generator.stepX + 20)
  assert.equal(shapes.at(-1).transform.y, group.generator.startY + 9 * group.generator.stepY + 20)
  for (const modifier of [
    { type: 'linear', property: 'style.color', from: 0, to: 1 },
    { type: 'linear', property: 'geometry.width', from: '10', to: 20 },
    { type: 'alternate', property: 'style.color', values: ['red'] },
    { type: 'alternate', property: 'style.opacity', values: [2] },
    { type: 'alternate', property: 'transform.scaleX', values: [1] },
    { type: 'sequence', property: 'geometry.width', values: [10] },
  ]) {
    group.modifiers = [modifier]
    assert.throws(() => children(transition), RangeError)
  }
})

test('Override: プロパティ単位の上書きと位置加算。未対応キーや不正値は拒否', () => {
  const { transition, group } = sample()
  group.modifiers.push({ type: 'alternate', property: 'transform.x', values: [15] })
  group.overrides['item-002'] = { geometry: { width: 80, height: 60, skewX: -20 },
    style: { color: '#abcdef', opacity: 0.3 }, transform: { rotation: 45, scaleX: 2, scaleY: -1, offsetX: 40, offsetY: -30 }, tracks: [] }
  const child = children(transition)[2]
  assert.equal(child.transform.x, 200 + 330 + 15 + 40)
  assert.equal(child.transform.y, 380 + 70 - 30)
  assert.equal(child.transform.rotation, 45)
  assert.equal(child.transform.scaleY, -1)
  assert.equal(child.geometry.width, 80)
  assert.equal(child.geometry.skewX, -20)
  assert.equal(child.style.opacity, 0.3)
  for (const override of [{ transform: { x: 40 } }, { style: { color: '#fff' } }, { geometry: { width: -1 } }, { transform: { offsetY: NaN } }, { tracks: {} }, { layers: [] }]) {
    group.overrides['item-002'] = override
    assert.throws(() => children(transition), RangeError)
  }
})

test('入力副作用なし: freezeされたデータを評価でき、将来のtracksを保持・無視する', () => {
  const { transition, group } = sample()
  group.tracks = [{ property: 'transform.x', keyframes: [{ timeMs: 0, value: 999 }] }]
  group.childAnimation = { staggerMs: 40, tracks: group.tracks }
  group.overrides['item-002'].tracks = structuredClone(group.tracks)
  const snapshot = structuredClone(transition)
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  }
  freeze(transition)
  const first = resolveStaticShapes(transition)
  assert.deepEqual(resolveStaticShapes(transition), first)
  first.shapes[3].style.color = '#000000'
  first.shapes[3].transform.x = 0
  assert.deepEqual(transition, snapshot)
  assert.equal(children(transition)[2].style.color, '#FFFFFF')
})

test('Group変換: 親のscale→rotation→translation、非一様scale、0/負scaleを正確に保持', () => {
  near(composeShapeMatrix({ x: 10, y: 20, rotation: 0 }, { x: 100, y: 200, rotation: 90, scaleX: 2, scaleY: 3 }), [0, 2, -3, 0, 40, 220])
  near(composeShapeMatrix({ x: 0, y: 0, rotation: 45 }, { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 1 }), [Math.SQRT2, Math.SQRT1_2, -Math.SQRT2, Math.SQRT1_2, 0, 0])
  near(composeShapeMatrix({ x: 10, y: 20, rotation: 0, scaleX: 0, scaleY: -1 }), [0, 0, 0, -1, 10, 20])
  const { transition, group } = sample()
  group.transform = { x: 100, y: 200, rotation: 90, scaleX: 2, scaleY: 3 }
  const first = children(transition)[0]
  assert.equal(first.transform.x, 200) // ローカル座標は保持。二重適用しない。
  near(first.worldMatrix, [0, 2, -3, 0, -1040, 600])
})

test('Transition: ID衝突、ネスト、不正形状、上限、全体件数、隠れたOverrideを検証', () => {
  for (const mutate of [
    t => t.layers.push(structuredClone(t.layers[0])),
    t => { t.layers[0].id = 'group-001/item-000' },
    t => { t.layers[1].kind = 'unknown' },
    t => { t.layers[1].layers = [] },
    t => { t.layers[1].template.geometry.width = -1 },
    t => { t.layers[1].transform.scaleX = Infinity },
    t => { t.layers[1].overrides['item-999'] = { style: { opacity: 2 } } },
    t => { t.layers[1].generator = { ...t.layers[1].generator, count: MAX_SHAPES, stepX: 0, stepY: 0 } },
    t => { t.layers[1].template.transform.x = 19200 },
  ]) {
    const { transition } = sample()
    mutate(transition)
    assert.throws(() => resolveStaticShapes(transition), RangeError)
  }
  assert.deepEqual(resolveStaticShapes({ layers: [] }), { shapes: [] })
  assert.throws(() => resolveStaticShapes(null), RangeError)
})
