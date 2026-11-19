import { SHAPE_LIMITS } from '../shapes.js'

// color のみ文字列（alternate限定）、残りは両方式に対応する数値。
export const MODIFIER_PROPERTIES = Object.freeze([
  'style.color', 'geometry.width', 'geometry.height', 'geometry.skewX',
  'transform.rotation', 'style.opacity', 'transform.x', 'transform.y',
])

export function validatePropertyValue(property, value) {
  if (property === 'style.color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError('style.color は #RRGGBB 形式で指定してください。')
  } else {
    const key = property.split('.')[1]
    const limits = SHAPE_LIMITS[key]
    if (!limits || !Number.isFinite(value) || value < limits.min || value > limits.max) {
      throw new RangeError(`${property} の値が型または範囲に適合しません。`)
    }
  }
}

export function validateModifiers(modifiers) {
  if (!Array.isArray(modifiers)) throw new RangeError('modifiers は配列で指定してください。')
  for (const modifier of modifiers) {
    if (!modifier || !MODIFIER_PROPERTIES.includes(modifier.property)) throw new RangeError('未対応の Modifier プロパティです。')
    if (modifier.enabled !== undefined && typeof modifier.enabled !== 'boolean') throw new RangeError('Modifier.enabled は真偽値で指定してください。')
    if (modifier.type === 'alternate') {
      if (!Array.isArray(modifier.values) || modifier.values.length === 0) throw new RangeError('alternate.values は空でない配列が必要です。')
      for (const value of modifier.values) validatePropertyValue(modifier.property, value)
    } else if (modifier.type === 'linear') {
      if (modifier.property === 'style.color') throw new RangeError('linear は数値プロパティのみ対応しています。')
      validatePropertyValue(modifier.property, modifier.from)
      validatePropertyValue(modifier.property, modifier.to)
    } else throw new RangeError('Modifier は alternate / linear に対応しています。')
  }
}

/** 値のネストを複製し、入力を変更しない。 */
export function copyShape(shape) {
  return { ...shape, geometry: { ...shape.geometry }, style: { ...shape.style }, transform: { ...shape.transform } }
}

/**
 * 配列順に後勝ち。位置は生成済みの基準位置 + 最後のModifier値。
 * xのModifierが10→20なら基準+20（+30ではない）。Overrideのoffsetはこの後に加算。
 * 呼び出し元で validateModifiers を一度実行し、子ごとの再検証を避ける。
 */
export function applyModifiers(shape, modifiers, index, total) {
  const result = copyShape(shape)
  for (const modifier of modifiers) {
    if (modifier.enabled === false) continue
    const value = modifier.type === 'alternate' ? modifier.values[index % modifier.values.length]
      : total <= 1 ? modifier.from : modifier.from + (modifier.to - modifier.from) * index / (total - 1)
    const [section, key] = modifier.property.split('.')
    result[section][key] = section === 'transform' && ['x', 'y'].includes(key)
      ? shape.transform[key] + value : value
  }
  return result
}
