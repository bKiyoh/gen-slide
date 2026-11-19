import { SHAPE_LIMITS } from '../../shapes.js'
import { EASINGS, evaluateEasing } from './easing.js'

export const TRANSFORM_TRACK_PROPERTIES = Object.freeze([
  'transform.x', 'transform.y', 'transform.rotation', 'transform.scaleX', 'transform.scaleY',
])
export const TRACK_PROPERTIES = Object.freeze([...TRANSFORM_TRACK_PROPERTIES, 'style.opacity', 'geometry.skewX'])

/**
 * @typedef {Object} Track
 * @property {string} property
 * @property {'offset'|'absolute'} mode scaleを含めoffsetは加算差分
 * @property {{timeMs: number, value: number, easing?: string}[]} keyframes
 */

/** 未整列のキーは複製して昇順化し、重複時刻と同一propertyの重複Trackは拒否する。
 * @param {Track[]} tracks
 * @param {readonly string[]} [properties]
 * @returns {Track[]}
 */
export function prepareTracks(tracks = [], properties = TRACK_PROPERTIES) {
  if (!Array.isArray(tracks)) throw new RangeError('tracks は配列で指定してください。')
  const used = new Set()
  return Array.from(tracks, track => {
    if (!track || !properties.includes(track.property)) throw new RangeError(`未対応の Track プロパティ: ${track?.property}`)
    if (!['offset', 'absolute'].includes(track.mode)) throw new RangeError('Track.mode は offset / absolute が必要です。')
    if (used.has(track.property)) throw new RangeError(`同じ階層に Track が重複しています: ${track.property}`)
    used.add(track.property)
    if (!Array.isArray(track.keyframes)) throw new RangeError('keyframes は配列で指定してください。')
    const limits = SHAPE_LIMITS[track.property.split('.')[1]]
    const keyframes = Array.from(track.keyframes, key => {
      if (!key || !Number.isFinite(key.timeMs) || key.timeMs < 0) throw new RangeError('Keyframe.timeMs は非負の有限な数値が必要です。')
      // offsetは対象範囲の最大差分まで許可。加算後の状態も評価時に検証する。
      const min = track.mode === 'offset' ? limits.min - limits.max : limits.min
      const max = track.mode === 'offset' ? limits.max - limits.min : limits.max
      if (!Number.isFinite(key.value) || key.value < min || key.value > max) throw new RangeError(`${track.property}: Keyframe.value は ${min}〜${max} の数値が必要です。`)
      const easing = key.easing === undefined ? 'linear' : key.easing
      if (!Object.hasOwn(EASINGS, easing)) throw new RangeError(`未対応の Easing: ${easing}`)
      return { timeMs: key.timeMs, value: key.value, easing }
    }).sort((a, b) => a.timeMs - b.timeMs)
    for (let index = 1; index < keyframes.length; index++) {
      if (keyframes[index].timeMs === keyframes[index - 1].timeMs) throw new RangeError('Keyframe の時刻が重複しています。')
    }
    return { property: track.property, mode: track.mode, keyframes }
  })
}

/** 検証・整列済みTrackの直接評価。負のローカル時刻も先頭キーで待機する。
 * @param {Track} track
 * @param {number} timeMs
 * @returns {number|undefined} 空のキー列は無変化
 */
export function sampleTrack(track, timeMs) {
  const keys = track.keyframes
  if (!keys.length) return undefined
  if (timeMs <= keys[0].timeMs) return keys[0].value
  if (timeMs >= keys.at(-1).timeMs) return keys.at(-1).value
  for (let index = 0; index < keys.length - 1; index++) {
    const start = keys[index]
    const end = keys[index + 1]
    if (timeMs > end.timeMs) continue
    if (timeMs === end.timeMs) return end.value
    const progress = (timeMs - start.timeMs) / (end.timeMs - start.timeMs)
    return start.value + (end.value - start.value) * evaluateEasing(start.easing, progress)
  }
}

/** 単独Trackを検証して評価する公開API。入力を並べ替えない。 */
export function evaluateTrack(track, timeMs) {
  if (!Number.isFinite(timeMs)) throw new RangeError('評価時刻は有限な数値が必要です。')
  return sampleTrack(prepareTracks([track])[0], timeMs)
}

/** 検証済みTrack群をproperty→評価値にする。空キーは優先順位にも参加しない。 */
export function sampleTracks(tracks, timeMs) {
  const values = new Map()
  for (const track of tracks) {
    const value = sampleTrack(track, timeMs)
    if (value !== undefined) values.set(track.property, { mode: track.mode, value })
  }
  return values
}

/** Child/Individualの選択を済ませてから、静的なベースに対し一度だけ適用する。 */
export function applyTrackValues(base, values) {
  const result = { ...base, transform: { ...base.transform }, style: { ...base.style }, geometry: { ...base.geometry } }
  for (const [property, { mode, value }] of values) {
    const [section, key] = property.split('.')
    const baseValue = section === 'transform' && key.startsWith('scale') ? base[section][key] ?? 1 : base[section][key]
    result[section][key] = mode === 'offset' ? baseValue + value : value
  }
  return result
}
