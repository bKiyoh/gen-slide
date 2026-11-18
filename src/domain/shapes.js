/**
 * @typedef {Object} Shape
 * @property {string} id
 * @property {{type: 'rectangle'|'parallelogram', width: number, height: number, skewX: number}} geometry
 * @property {{color: string, opacity: number}} style
 * @property {{x: number, y: number, rotation: number}} transform
 */

export const LOGICAL_SIZE = Object.freeze({ width: 1920, height: 1080 })

// Phase 0 の入力範囲。90°近傍の tan の発散や過大な座標を防ぐ。
export const SHAPE_LIMITS = Object.freeze({
  width: { min: 0, max: 7680 },
  height: { min: 0, max: 4320 },
  skewX: { min: -80, max: 80 },
  x: { min: -19200, max: 19200 },
  y: { min: -10800, max: 10800 },
  rotation: { min: -360, max: 360 },
  opacity: { min: 0, max: 1 },
})

/** 毎回独立した、JSON シリアライズ可能なサンプルを返す。 @returns {Shape[]} */
export function createSampleShapes() {
  return [
    {
      id: 'rectangle',
      geometry: { type: 'rectangle', width: 580, height: 340, skewX: 0 },
      style: { color: '#FF0000', opacity: 1 },
      transform: { x: 560, y: 540, rotation: 0 },
    },
    {
      id: 'parallelogram',
      geometry: { type: 'parallelogram', width: 520, height: 340, skewX: 28 },
      style: { color: '#0000FF', opacity: 1 },
      transform: { x: 1320, y: 540, rotation: 0 },
    },
  ]
}

/** 不正な値を丸めずに拒否する。呼び出し側は最後の正常な描画を保持できる。
 * @param {unknown} shape
 * @returns {string[]}
 */
export function validateShape(shape) {
  if (!shape || typeof shape !== 'object') return ['図形データが必要です。']
  const errors = []
  if (typeof shape.id !== 'string' || !shape.id.trim()) errors.push('図形 ID が必要です。')
  if (!['rectangle', 'parallelogram'].includes(shape.geometry?.type)) {
    errors.push('図形の種類が不正です。')
  }

  const values = {
    width: shape.geometry?.width,
    height: shape.geometry?.height,
    skewX: shape.geometry?.skewX,
    x: shape.transform?.x,
    y: shape.transform?.y,
    rotation: shape.transform?.rotation,
    opacity: shape.style?.opacity,
  }
  for (const [key, value] of Object.entries(values)) {
    const { min, max } = SHAPE_LIMITS[key]
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${key} は ${min}〜${max} の有限な数値で指定してください。`)
    }
  }
  if (shape.geometry?.type === 'rectangle' && shape.geometry.skewX !== 0) {
    errors.push('長方形の skewX は 0 にしてください。')
  }
  if (typeof shape.style?.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(shape.style.color)) {
    errors.push('color は #RRGGBB 形式で指定してください。')
  }
  return errors
}
