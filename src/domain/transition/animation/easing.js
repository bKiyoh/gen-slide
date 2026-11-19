export const EASINGS = Object.freeze({
  linear: t => t,
  easeInCubic: t => t ** 3,
  easeOutCubic: t => 1 - (1 - t) ** 3,
  easeInOutCubic: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
})

/** 区間内の進行率(0〜1)を補間率に変換する純粋関数。 */
export function evaluateEasing(name, progress) {
  if (!Object.hasOwn(EASINGS, name)) throw new RangeError(`未対応の Easing: ${name}`)
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new RangeError('Easing の進行率は 0〜1 で指定してください。')
  return EASINGS[name](progress)
}
