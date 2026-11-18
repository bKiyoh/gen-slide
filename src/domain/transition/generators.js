import { SHAPE_LIMITS } from '../shapes.js'

// 子1個につき Mesh/Material と描画命令を使うため、検証段階では合計1000個に制限。
// 60fpsを保証する値ではない。Instancing等は必要性を計測してから検討する。
export const MAX_SHAPES = 1000

function count(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SHAPES) {
    throw new RangeError(`${name} は 0〜${MAX_SHAPES} の整数で指定してください。`)
  }
}

/** 生成前に検証し、個数を返す。0個でも配置パラメーターを検証する。 */
export function getGeneratorCount(generator) {
  if (!generator || !['linear', 'grid'].includes(generator.type)) {
    throw new RangeError('Generator は linear / grid に対応しています。')
  }
  let total
  let keys
  if (generator.type === 'linear') {
    count(generator.count, 'count')
    total = generator.count
    keys = ['startX', 'startY', 'stepX', 'stepY']
  } else {
    count(generator.rows, 'rows')
    count(generator.columns, 'columns')
    total = generator.rows * generator.columns
    count(total, 'rows × columns')
    keys = ['startX', 'startY', 'gapX', 'gapY', 'rowOffsetX', 'columnOffsetY']
  }
  for (const key of keys) {
    const { min, max } = SHAPE_LIMITS[key.endsWith('X') ? 'x' : 'y']
    if (!Number.isFinite(generator[key]) || generator[key] < min || generator[key] > max) {
      throw new RangeError(`${key} は ${min}〜${max} の有限な数値で指定してください。`)
    }
  }
  return total
}

/**
 * Grid は行優先。gap は外寸を加えない中心間ステップ。
 * x = startX + column*gapX + row*rowOffsetX
 * y = startY + row*gapY + column*columnOffsetY
 * @returns {{itemId: string, index: number, x: number, y: number}[]}
 */
export function generatePositions(generator) {
  const total = getGeneratorCount(generator)
  return Array.from({ length: total }, (_, index) => {
    const row = generator.type === 'grid' ? Math.floor(index / generator.columns) : 0
    const column = generator.type === 'grid' ? index % generator.columns : 0
    const x = generator.type === 'linear' ? generator.startX + index * generator.stepX
      : generator.startX + column * generator.gapX + row * generator.rowOffsetX
    const y = generator.type === 'linear' ? generator.startY + index * generator.stepY
      : generator.startY + row * generator.gapY + column * generator.columnOffsetY
    for (const [key, value] of Object.entries({ x, y })) {
      const { min, max } = SHAPE_LIMITS[key]
      if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`生成位置 ${key} が範囲外です。`)
    }
    return { itemId: `item-${String(index).padStart(3, '0')}`, index, x, y }
  })
}
