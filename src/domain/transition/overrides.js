import { copyShape, validatePropertyValue } from './modifiers.js'

const properties = {
  geometry: ['width', 'height', 'skewX'],
  style: ['color', 'opacity'],
  transform: ['offsetX', 'offsetY', 'rotation', 'scaleX', 'scaleY'],
}

/** 消えている子のOverrideも検証し、元データは一切削除しない。tracksは評価しない。 */
export function validateOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new RangeError('overrides はオブジェクトで指定してください。')
  for (const [itemId, override] of Object.entries(overrides)) {
    if (!/^item-\d{3,}$/.test(itemId) || !override || typeof override !== 'object' || Array.isArray(override)) {
      throw new RangeError('Override の子 ID またはデータが不正です。')
    }
    for (const [section, values] of Object.entries(override)) {
      if (section === 'tracks') {
        if (!Array.isArray(values)) throw new RangeError('Override.tracks は配列で指定してください。')
        continue
      }
      if (!Object.hasOwn(properties, section) || !values || typeof values !== 'object' || Array.isArray(values)) throw new RangeError(`未対応の Override: ${section}`)
      for (const [key, value] of Object.entries(values)) {
        if (!properties[section].includes(key)) throw new RangeError(`未対応の Override: ${section}.${key}`)
        const valueKey = key === 'offsetX' ? 'x' : key === 'offsetY' ? 'y' : key
        validatePropertyValue(`${section}.${valueKey}`, value)
      }
    }
  }
}

/** 部分上書き。位置の offsetX/Y だけは Modifier 適用後の配置へ加算する。 */
export function applyOverride(shape, override = {}) {
  const result = copyShape(shape)
  Object.assign(result.geometry, override.geometry)
  Object.assign(result.style, override.style)
  const { offsetX = 0, offsetY = 0, ...transform } = override.transform ?? {}
  Object.assign(result.transform, transform)
  result.transform.x += offsetX
  result.transform.y += offsetY
  return result
}
