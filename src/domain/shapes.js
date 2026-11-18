/**
 * @typedef {Object} Shape
 * @property {string} id
 * @property {'shape'} [kind]
 * @property {{type: 'rectangle'|'parallelogram', width: number, height: number, skewX: number}} geometry
 * @property {{color: string, opacity: number}} style
 * @property {{x: number, y: number, rotation: number, scaleX?: number, scaleY?: number}} transform
 * @property {Array} [tracks]
 * @property {number[]} [worldMatrix] 評価済み2Dアフィン変換 [a,b,c,d,tx,ty]
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
  scaleX: { min: -100, max: 100 },
  scaleY: { min: -100, max: 100 },
  opacity: { min: 0, max: 1 },
})

/** 毎回独立した、JSON シリアライズ可能なサンプルを返す。 @returns {Shape[]} */
export function createSampleShapes() {
  return [
    {
      id: 'rectangle',
      kind: 'shape',
      geometry: { type: 'rectangle', width: 580, height: 340, skewX: 0 },
      style: { color: '#FF0000', opacity: 1 },
      transform: { x: 560, y: 540, rotation: 0, scaleX: 1, scaleY: 1 },
      tracks: [],
    },
    {
      id: 'parallelogram',
      kind: 'shape',
      geometry: { type: 'parallelogram', width: 520, height: 340, skewX: 28 },
      style: { color: '#0000FF', opacity: 1 },
      transform: { x: 1320, y: 540, rotation: 0, scaleX: 1, scaleY: 1 },
      tracks: [],
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
    opacity: shape.style?.opacity,
  }
  errors.push(...validateTransform(shape.transform))
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
  if (shape.tracks !== undefined && !Array.isArray(shape.tracks)) errors.push('tracks は配列で指定してください。')
  if (shape.worldMatrix !== undefined && (!Array.isArray(shape.worldMatrix)
    || shape.worldMatrix.length !== 6 || !Array.from(shape.worldMatrix).every(Number.isFinite))) {
    errors.push('worldMatrix は6個の有限な数値で指定してください。')
  }
  return errors
}

/** Phase 0 のデータでは省略された scale を1として扱う。 */
export function validateTransform(transform) {
  const errors = []
  for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY']) {
    const value = key.startsWith('scale') && transform?.[key] === undefined ? 1 : transform?.[key]
    const { min, max } = SHAPE_LIMITS[key]
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${key} は ${min}〜${max} の有限な数値で指定してください。`)
    }
  }
  return errors
}
