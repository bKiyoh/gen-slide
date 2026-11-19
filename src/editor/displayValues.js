import { evaluateTransition } from '../domain/transition/evaluateTransition.js'
import { resolveLocalShapes } from '../domain/transition/resolveStaticShapes.js'
import { prepareTracks, sampleTracks, applyTrackValues } from '../domain/transition/animation/tracks.js'
import { transformMatrix } from '../domain/transition/transform.js'

export const valueAt = (object, property) => {
  const [section, key] = property.split('.')
  return object[section]?.[key] ?? (key.startsWith('scale') ? 1 : undefined)
}
const writeAt = (object, property, value) => {
  const [section, key] = property.split('.')
  object[section] ??= {}
  object[section][key] = value
}

export function invertPoint(matrix, x, y) {
  const [a, b, c, d, tx, ty] = matrix
  const determinant = a * d - b * c
  if (Math.abs(determinant) < 1e-12) throw new RangeError('親の倍率が0、または逆変換が不安定なため、画面座標を編集できません。')
  return { x: (d * (x - tx) - c * (y - ty)) / determinant,
    y: (-b * (x - tx) + a * (y - ty)) / determinant }
}

export function getTracks(layer, itemId, scope, create = false) {
  if (scope === 'child') {
    if (create) layer.childAnimation ??= { staggerMs: 0, tracks: [] }
    return layer.childAnimation?.tracks ?? []
  }
  if (scope === 'individual') {
    if (create) { layer.overrides ??= {}; layer.overrides[itemId] ??= {}; layer.overrides[itemId].tracks ??= [] }
    return layer.overrides?.[itemId]?.tracks ?? []
  }
  if (create) layer.tracks ??= []
  return layer.tracks ?? []
}

/** 位置は常に画面座標。子の角度・倍率は正の一様な親scaleだけを扱う。 */
export function displayContext(transition, selection, scope, timeMs) {
  const layer = transition.layers.find(layer => layer.id === selection?.layerId)
  if (!layer) throw new RangeError('レイヤーを選択してください。')
  const itemId = scope === 'child' ? 'item-000' : selection.itemId
  const parent = layer.kind === 'group' ? applyTrackValues({ transform: layer.transform }, sampleTracks(prepareTracks(layer.tracks), timeMs)).transform : undefined
  const groupTarget = scope === 'group'
  const id = itemId ? `${layer.id}/${itemId}` : layer.id
  const base = groupTarget ? { transform: layer.transform } : resolveLocalShapes(transition).shapes.find(shape => shape.id === id)
  const current = groupTarget ? { transform: parent } : evaluateTransition(transition, timeMs).shapes.find(shape => shape.id === id)
  if (!base || !current) throw new RangeError('生成されていない子は編集できません。個数を増やしてください。')
  const hasParent = Boolean(itemId)
  const uniform = !hasParent || (parent.scaleX ?? 1) > 0 && Math.abs((parent.scaleX ?? 1) - (parent.scaleY ?? 1)) < 1e-9
  const values = {}
  for (const section of ['geometry', 'style', 'transform']) for (const key of Object.keys(current[section] ?? {})) values[`${section}.${key}`] = current[section][key]
  values['transform.scaleX'] = current.transform.scaleX ?? 1
  values['transform.scaleY'] = current.transform.scaleY ?? 1
  const restrictions = {}
  if (hasParent) {
    values['transform.x'] = current.worldMatrix[4]
    values['transform.y'] = current.worldMatrix[5]
    if (uniform) {
      values['transform.rotation'] += parent.rotation
      values['transform.scaleX'] *= parent.scaleX ?? 1
      values['transform.scaleY'] *= parent.scaleY ?? 1
    } else {
      for (const property of ['transform.rotation', 'transform.scaleX', 'transform.scaleY']) {
        values[property] = undefined
        restrictions[property] = '親の非一様・反転・0倍率では、子の回転・倍率の画面値編集に対応していません。'
      }
    }
    try { invertPoint(transformMatrix(parent), values['transform.x'], values['transform.y']) }
    catch (error) { restrictions['transform.x'] = restrictions['transform.y'] = error.message }
  }
  return { layer, itemId, parent: hasParent ? parent : undefined, base, current, values, restrictions }
}

function localChanges(context, property, displayed) {
  if (context.restrictions[property]) throw new RangeError(context.restrictions[property])
  if (!context.parent) return new Map([[property, displayed]])
  if (['transform.x', 'transform.y'].includes(property)) {
    const point = invertPoint(transformMatrix(context.parent),
      property === 'transform.x' ? displayed : context.values['transform.x'],
      property === 'transform.y' ? displayed : context.values['transform.y'])
    return new Map([['transform.x', point.x], ['transform.y', point.y]])
  }
  if (property === 'transform.rotation') return new Map([[property, displayed - context.parent.rotation]])
  if (property === 'transform.scaleX' || property === 'transform.scaleY') return new Map([[property, displayed / (context.parent.scaleX ?? 1)]])
  return new Map([[property, displayed]])
}

function assertCommonVisible(context, scope, property) {
  if (scope === 'child' && prepareTracks(context.layer.overrides?.[context.itemId]?.tracks).some(track => track.property === property && track.keyframes.length)) {
    throw new RangeError('基準item-000のこの値はIndividualで上書きされています。個別トラックを解除してから共通キーを編集してください。')
  }
}

/** 現在見える値を変えるための静的差分を計算。absoluteで固定された項目は拒否する。 */
export function editBaseDisplay(transition, selection, property, displayed, timeMs) {
  const scope = selection.itemId ? 'individual' : transition.layers.find(layer => layer.id === selection.layerId)?.kind === 'group' ? 'group' : 'shape'
  const context = displayContext(transition, selection, scope, timeMs)
  const active = context.itemId ? new Map([
    ...sampleTracks(prepareTracks(context.layer.childAnimation?.tracks), timeMs - context.current.index * (context.layer.childAnimation?.staggerMs ?? 0)),
    ...sampleTracks(prepareTracks(context.layer.overrides?.[context.itemId]?.tracks), timeMs),
  ]) : sampleTracks(prepareTracks(context.layer.tracks), timeMs)
  for (const [target, value] of localChanges(context, property, displayed)) {
    const current = valueAt(context.current, target)
    if (typeof value === 'number' && Math.abs(value - current) < 1e-9) continue
    if (active.get(target)?.mode === 'absolute') throw new RangeError('この表示値はキーで固定されています。「キーフレーム編集」で変更するかトラックを削除してください。')
    const baseValue = typeof value === 'number' ? valueAt(context.base, target) + value - current : value
    if (context.itemId) {
      context.layer.overrides ??= {}
      const override = context.layer.overrides[context.itemId] ??= {}
      if (target === 'transform.x' || target === 'transform.y') {
        const key = target.endsWith('x') ? 'offsetX' : 'offsetY'
        override.transform ??= {}
        override.transform[key] = (override.transform[key] ?? 0) + value - current
      } else writeAt(override, target, baseValue)
    } else writeAt(context.layer, target, baseValue)
  }
}

export function addKey(transition, selection, scope, property, timeMs) {
  const context = displayContext(transition, selection, scope, timeMs)
  assertCommonVisible(context, scope, property)
  const tracks = getTracks(context.layer, context.itemId, scope, true)
  let track = tracks.find(track => track.property === property)
  if (!track) { track = { property, mode: ['group', 'child'].includes(scope) ? 'offset' : 'absolute', keyframes: [] }; tracks.push(track) }
  const localTime = scope === 'child' ? timeMs - context.current.index * (context.layer.childAnimation?.staggerMs ?? 0) : timeMs
  if (localTime < 0) throw new RangeError('待機中の負のローカル時刻にはキーを追加できません。')
  if (track.keyframes.some(key => key.timeMs === localTime)) throw new RangeError('同じ時刻のキーが既にあります。既存キーを編集してください。')
  const value = valueAt(context.current, property)
  track.keyframes.push({ timeMs: localTime, value: track.mode === 'offset' ? value - valueAt(context.base, property) : value, easing: 'linear' })
  track.keyframes.sort((a, b) => a.timeMs - b.timeMs)
}

/** 回転した親での位置キーは、同時刻のX/Yキーを対で変更してもう一方の画面座標を保つ。 */
export function editKeyDisplay(transition, selection, scope, property, keyIndex, displayed) {
  const layer = transition.layers.find(layer => layer.id === selection.layerId)
  const itemId = scope === 'child' ? 'item-000' : selection.itemId
  const tracks = getTracks(layer, itemId, scope)
  const key = tracks.find(track => track.property === property).keyframes[keyIndex]
  const globalTime = key.timeMs // Child編集の基準はindex=0
  if (globalTime > transition.durationMs) throw new RangeError('プレビュー範囲外のキーです。先にキー時刻をduration以内へ変更してください。')
  const context = displayContext(transition, selection, scope, globalTime)
  assertCommonVisible(context, scope, property)
  for (const [target, value] of localChanges(context, property, displayed)) {
    if (target !== property && Math.abs(value - valueAt(context.current, target)) < 1e-9) continue
    const targetTrack = tracks.find(track => track.property === target)
    const targetKey = targetTrack?.keyframes.find(candidate => candidate.timeMs === key.timeMs)
    if (!targetKey) throw new RangeError('回転した親で画面位置を編集するには、同時刻のX/Yキーが必要です。「位置キー追加」で対を作成してください。')
    targetKey.value = targetTrack.mode === 'offset' ? value - valueAt(context.base, target) : value
  }
}
