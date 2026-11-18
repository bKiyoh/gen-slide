import { validateShape, validateTransform } from '../shapes.js'
import { generatePositions, getGeneratorCount, MAX_SHAPES } from './generators.js'
import { applyModifiers, validateModifiers } from './modifiers.js'
import { applyOverride, validateOverrides } from './overrides.js'
import { composeShapeMatrix } from './transform.js'

function checkShape(shape) {
  const errors = validateShape(shape)
  if (errors.length) throw new RangeError(`${shape.id}: ${errors.join(' ')}`)
}

/**
 * Transition の静的評価。Vue/Three/DOM非依存。入力のtracks等は保持し、評価しない。
 * Template移動をローカルオフセットとして生成位置に加算する。
 * @param {{layers: Array}} transition
 * @returns {{shapes: import('../shapes.js').Shape[]}}
 */
export function resolveStaticShapes(transition) {
  if (!Array.isArray(transition?.layers)) throw new RangeError('Transition.layers は配列が必要です。')
  const ids = new Set()
  let total = 0
  // 合計上限を生成前に検証。'/'を予約して子IDとの衝突を防ぐ。
  for (const layer of transition.layers) {
    if (!layer || typeof layer.id !== 'string' || !layer.id.trim() || layer.id.includes('/') || ids.has(layer.id)) {
      throw new RangeError('レイヤー ID は重複せず、/ を含まない文字列にしてください。')
    }
    ids.add(layer.id)
    if (!['shape', 'group'].includes(layer.kind)) throw new RangeError('レイヤーは shape / group のみ対応しています。')
    total += layer.kind === 'shape' ? 1 : getGeneratorCount(layer.generator)
    if (total > MAX_SHAPES) throw new RangeError(`図形の合計上限は ${MAX_SHAPES} 個です。`)
  }

  const shapes = []
  for (const layer of transition.layers) {
    if (layer.kind === 'shape') {
      checkShape(layer)
      shapes.push({ id: layer.id, geometry: { ...layer.geometry }, style: { ...layer.style },
        transform: { ...layer.transform }, worldMatrix: composeShapeMatrix(layer.transform) })
      continue
    }
    const errors = validateTransform(layer.transform)
    if (errors.length) throw new RangeError(`${layer.id}: ${errors.join(' ')}`)
    if (layer.layers || layer.template?.kind === 'group') throw new RangeError('Group のネストには対応していません。')
    checkShape({ ...layer.template, id: layer.id })
    if (layer.tracks !== undefined && !Array.isArray(layer.tracks)) throw new RangeError('Group.tracks は配列で指定してください。')
    const modifiers = layer.modifiers ?? []
    const overrides = layer.overrides ?? {}
    validateModifiers(modifiers)
    validateOverrides(overrides)
    const positions = generatePositions(layer.generator)
    for (const { itemId, index, x, y } of positions) {
      const base = { id: `${layer.id}/${itemId}`, geometry: { ...layer.template.geometry },
        style: { ...layer.template.style }, transform: { ...layer.template.transform,
          x: x + layer.template.transform.x, y: y + layer.template.transform.y } }
      const modified = applyModifiers(base, modifiers, index, positions.length)
      const shape = applyOverride(modified, overrides[itemId])
      checkShape(shape)
      shapes.push({ ...shape, groupId: layer.id, itemId, index,
        worldMatrix: composeShapeMatrix(shape.transform, layer.transform) })
    }
  }
  return { shapes }
}
