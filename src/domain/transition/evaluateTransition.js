import { validateShape, validateTransform } from '../shapes.js'
import { resolveLocalShapes } from './resolveStaticShapes.js'
import { composeShapeMatrix } from './transform.js'
import { getGeneratorCount } from './generators.js'
import { applyTrackValues, prepareTracks, sampleTracks, TRANSFORM_TRACK_PROPERTIES } from './animation/tracks.js'

/**
 * 指定時刻の描画スナップショット。Vue/Three/DOM/RAF非依存。
 * Transition時刻は0〜durationMsに制限。ChildだけStagger、IndividualとGroupは全体時刻。
 * @param {{durationMs: number, layers: Array}} transition
 * @param {number} timeMs ミリ秒、有限値のみ
 * @returns {{shapes: import('../shapes.js').Shape[]}}
 */
export function evaluateTransition(transition, timeMs) {
  if (!Number.isFinite(timeMs)) throw new RangeError('timeMs は有限な数値で指定してください。')
  if (!Number.isFinite(transition?.durationMs) || transition.durationMs < 0) throw new RangeError('durationMs は非負の有限な数値で指定してください。')
  const time = Math.min(transition.durationMs, Math.max(0, timeMs))
  const { shapes: localShapes } = resolveLocalShapes(transition)
  const layers = new Map()

  // 非表示の子のIndividualも検証。Groupが0個でも不正なAnimationを見逃さない。
  for (const layer of transition.layers) {
    const tracks = prepareTracks(layer.tracks, layer.kind === 'group' ? TRANSFORM_TRACK_PROPERTIES : undefined)
    if (layer.kind === 'shape') {
      layers.set(layer.id, { tracks })
      continue
    }
    const child = layer.childAnimation === undefined ? { tracks: [], staggerMs: 0 } : layer.childAnimation
    if (!child || typeof child !== 'object' || Array.isArray(child)
      || !Number.isFinite(child.staggerMs) || child.staggerMs < 0) throw new RangeError(`${layer.id}: childAnimation.staggerMs は非負の有限な数値が必要です。`)
    const count = getGeneratorCount(layer.generator)
    if (!Number.isFinite(Math.max(0, count - 1) * child.staggerMs)) throw new RangeError(`${layer.id}: Stagger の合計時間が大きすぎます。`)
    const childTracks = prepareTracks(child.tracks)
    const individualTracks = new Map(Object.entries(layer.overrides ?? {}).map(([id, override]) => [id, prepareTracks(override.tracks)]))
    const parent = applyTrackValues({ transform: layer.transform }, sampleTracks(tracks, time)).transform
    const errors = validateTransform(parent)
    if (errors.length) throw new RangeError(`${layer.id}: ${errors.join(' ')}`)
    layers.set(layer.id, { tracks, childTracks, individualTracks, staggerMs: child.staggerMs, parent })
  }

  const shapes = localShapes.map(base => {
    const animation = layers.get(base.groupId ?? base.id)
    const values = base.groupId
      ? sampleTracks(animation.childTracks, time - base.index * animation.staggerMs)
      : sampleTracks(animation.tracks, time)
    if (base.groupId) {
      // 同一propertyだけ差し替える。両者のoffsetを加算しない。
      for (const [property, value] of sampleTracks(animation.individualTracks.get(base.itemId) ?? [], time)) values.set(property, value)
    }
    const shape = applyTrackValues(base, values)
    const errors = validateShape(shape)
    if (errors.length) throw new RangeError(`${shape.id}: ${errors.join(' ')}`)
    return { ...shape, worldMatrix: composeShapeMatrix(shape.transform, animation.parent) }
  })
  return { shapes }
}
