import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSampleShapes, validateShape } from '../src/domain/shapes.js'

test('サンプルは赤い長方形と青い平行四辺形。JSON往復で変化しない', () => {
  const samples = createSampleShapes()
  assert.deepEqual(samples.map(shape => shape.style.color), ['#FF0000', '#0000FF'])
  assert.deepEqual(samples.map(shape => shape.geometry.type), ['rectangle', 'parallelogram'])
  assert.ok(samples.every(shape => validateShape(shape).length === 0))
  assert.deepEqual(JSON.parse(JSON.stringify(samples)), samples)
  samples[0].geometry.width = 1
  assert.equal(createSampleShapes()[0].geometry.width, 580)
})

test('空欄、不正色、型違い、範囲外、欠損を検出する', () => {
  for (const mutate of [
    s => { s.geometry.width = '' },
    s => { s.geometry.height = NaN },
    s => { s.geometry = null },
    s => { s.style.opacity = -0.1 },
    s => { s.style.opacity = 1.1 },
    s => { s.style.color = 'red' },
    s => { s.style.color = '#fff' },
    s => { s.style = null },
    s => { s.transform.x = Infinity },
    s => { s.transform.rotation = 361 },
    s => { s.transform = null },
    s => { s.id = '' },
  ]) {
    const shape = createSampleShapes()[0]
    mutate(shape)
    assert.ok(validateShape(shape).length > 0)
  }
  assert.ok(validateShape(null).length > 0)
  assert.ok(validateShape({}).length > 0)
})

test('透明度の両端と小文字HEXを受け入れる', () => {
  const shape = createSampleShapes()[0]
  shape.style.color = '#abcdef'
  for (const opacity of [0, 1]) {
    shape.style.opacity = opacity
    assert.deepEqual(validateShape(shape), [])
  }
})
