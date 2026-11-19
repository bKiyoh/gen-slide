import { evaluateTransition } from '../domain/transition/evaluateTransition.js'

/** 再生に必要な時刻と描画データを検証する。全画面の遮蔽は要求しない。 */
export function validateTransitionForPlayback(transition) {
  if (!transition || !Number.isFinite(transition.durationMs) || transition.durationMs < 0
    || !Number.isFinite(transition.switchAtMs) || transition.switchAtMs < 0 || transition.switchAtMs > transition.durationMs) throw new RangeError('Transitionの長さ・切替時刻が不正です。')
  return evaluateTransition(transition, transition.switchAtMs)
}

export function transitionFrame(transition, timeMs) {
  return { ...evaluateTransition(transition, timeMs), timeMs }
}
