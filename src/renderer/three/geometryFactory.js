import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import { calculateShapeGeometry } from '../../domain/shapeGeometry.js'

/** @param {import('../../domain/shapes.js').Shape['geometry']} geometryData */
export function createShapeGeometry(geometryData) {
  const { positions, indices } = calculateShapeGeometry(geometryData)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

/** 同じ4頂点のバッファを更新し、毎入力での GPU リソース再生成を避ける。
 * @param {BufferGeometry} geometry
 * @param {import('../../domain/shapes.js').Shape['geometry']} geometryData
 */
export function updateShapeGeometry(geometry, geometryData) {
  const { positions } = calculateShapeGeometry(geometryData)
  const attribute = geometry.getAttribute('position')
  attribute.array.set(positions)
  attribute.needsUpdate = true
  geometry.computeBoundingSphere()
}
