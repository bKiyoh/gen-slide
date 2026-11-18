import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createShapeGeometry, updateShapeGeometry } from '../src/renderer/three/geometryFactory.js'

test('BufferGeometryは4頂点・2三角形を持ち、更新時は同じバッファを再利用する', () => {
  const geometry = createShapeGeometry({ type: 'rectangle', width: 200, height: 100, skewX: 0 })
  try {
    const attribute = geometry.getAttribute('position')
    const buffer = attribute.array
    const initialRadius = geometry.boundingSphere.radius
    assert.equal(attribute.count, 4)
    assert.equal(geometry.index.count, 6)
    updateShapeGeometry(geometry, { type: 'parallelogram', width: 400, height: 200, skewX: 45 })
    assert.equal(geometry.getAttribute('position'), attribute)
    assert.equal(attribute.array, buffer)
    assert.ok(attribute.version > 0)
    assert.ok(geometry.boundingSphere.radius > initialRadius)
    assert.deepEqual(Array.from(buffer), [-100, -100, 0, 300, -100, 0, 100, 100, 0, -300, 100, 0])
  } finally {
    geometry.dispose()
  }
})
