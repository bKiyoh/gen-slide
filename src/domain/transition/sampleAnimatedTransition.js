import { createSampleTransition } from './sampleTransition.js'

/** Phase 1の10個の図形に時間変化を追加する、JSON化可能なPhase 2デモ。 */
export function createSampleAnimatedTransition() {
  const transition = createSampleTransition()
  transition.name = 'Staggered sweep'
  const group = transition.layers[1]
  group.childAnimation = {
    staggerMs: 40,
    tracks: [
      { property: 'transform.x', mode: 'offset', keyframes: [
        { timeMs: 0, value: -1000, easing: 'easeOutCubic' }, { timeMs: 600, value: 0 },
      ] },
      { property: 'transform.rotation', mode: 'offset', keyframes: [
        { timeMs: 0, value: -45, easing: 'easeInOutCubic' }, { timeMs: 600, value: 0 },
      ] },
    ],
  }
  group.overrides['item-002'].tracks = [
    { property: 'transform.rotation', mode: 'absolute', keyframes: [
      { timeMs: 0, value: 90, easing: 'easeOutCubic' }, { timeMs: 1000, value: 0 },
    ] },
  ]
  group.tracks = [{ property: 'transform.y', mode: 'offset', keyframes: [
    { timeMs: 0, value: -80 }, { timeMs: 1200, value: 0 },
  ] }]
  return transition
}
