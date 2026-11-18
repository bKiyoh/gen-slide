import { SHAPE_LIMITS } from './shapes.js'

/**
 * 中心を (0, 0) とする4頂点。論理座標は X右・Y下。
 * skewX > 0 なら上辺が下辺より height * tan(skewX) だけ右にずれる。
 * 上下辺を ±shift/2 ずつずらし、傾斜変更でも中心を固定する。
 * このローカル形状を作った後、中心回りに回転し、最後に (x, y) へ移動する。
 * Y下向きのため正の rotation は画面上では時計回りになる。
 *
 * @param {{type: 'rectangle'|'parallelogram', width: number, height: number, skewX: number}} geometry
 * @returns {{positions: number[], indices: number[]}}
 */
export function calculateShapeGeometry({ type, width, height, skewX }) {
  if (!['rectangle', 'parallelogram'].includes(type)) throw new RangeError('Unknown shape type')
  for (const [key, value] of Object.entries({ width, height, skewX })) {
    const { min, max } = SHAPE_LIMITS[key]
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`Invalid ${key}`)
    }
  }
  if (type === 'rectangle' && skewX !== 0) throw new RangeError('Rectangle skewX must be 0')

  const halfWidth = width / 2
  const halfHeight = height / 2
  const halfShift = type === 'parallelogram' ? height * Math.tan(skewX * Math.PI / 180) / 2 : 0

  return {
    // 左上 → 右上 → 右下 → 左下。Z=0 の平面上に置く。
    positions: [
      -halfWidth + halfShift, -halfHeight, 0,
      halfWidth + halfShift, -halfHeight, 0,
      halfWidth - halfShift, halfHeight, 0,
      -halfWidth - halfShift, halfHeight, 0,
    ],
    indices: [0, 1, 2, 0, 2, 3],
  }
}
