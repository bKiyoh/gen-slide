import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateShapeGeometry } from '../src/domain/shapeGeometry.js'

const rectangle = { type: 'rectangle', width: 200, height: 100, skewX: 0 }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

test('長方形: 中心ピボットの4頂点と、対角線を共有する2三角形', () => {
  assert.deepEqual(calculateShapeGeometry(rectangle), {
    positions: [-100, -50, 0, 100, -50, 0, 100, 50, 0, -100, 50, 0],
    indices: [0, 1, 2, 0, 2, 3],
  })
})

for (const skewX of [-45, 0, 30, 45, -80, 80]) {
  test(`平行四辺形 (${skewX}°): 上下辺の差、中心、面積を維持する`, () => {
    const { positions: p, indices } = calculateShapeGeometry({ ...rectangle, type: 'parallelogram', skewX })
    const shift = rectangle.height * Math.tan(skewX * Math.PI / 180)
    near(p[0] - p[9], shift)
    near(p[3] - p[6], shift)
    near(p[3] - p[0], rectangle.width)
    near(p[6] - p[9], rectangle.width)
    near((p[0] + p[3] + p[6] + p[9]) / 4, 0)
    near((p[1] + p[4] + p[7] + p[10]) / 4, 0)
    let area = 0
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map(index => [p[index * 3], p[index * 3 + 1]])
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
    }
    near(area, rectangle.width * rectangle.height)
  })
}

test('幅・高さ0は有限な退化図形として扱い、NaNを作らない', () => {
  for (const size of [{ width: 0 }, { height: 0 }, { width: 0, height: 0 }]) {
    assert.ok(calculateShapeGeometry({ ...rectangle, ...size }).positions.every(Number.isFinite))
  }
})

test('不正な種類、負のサイズ、NaN、無限大、過剰な傾斜を拒否する', () => {
  for (const change of [
    { type: 'circle' }, { width: -1 }, { height: -1 }, { width: NaN }, { height: Infinity },
    { width: 7681 }, { width: '' }, { type: 'parallelogram', skewX: 80.01 },
    { type: 'parallelogram', skewX: -90 }, { skewX: 1 },
  ]) {
    assert.throws(() => calculateShapeGeometry({ ...rectangle, ...change }), RangeError)
  }
})

test('同じ入力は同じ結果を返し、入力データを書き換えない', () => {
  const input = Object.freeze({ ...rectangle, type: 'parallelogram', skewX: 30 })
  assert.deepEqual(calculateShapeGeometry(input), calculateShapeGeometry(input))
})
