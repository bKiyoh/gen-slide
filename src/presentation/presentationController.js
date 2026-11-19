import { validateTransitionForPlayback, transitionFrame } from './transitionFrame.js'

/**
 * idle→transitioning→idle。入力連打は無視する。時計と描画先は呼び出し側から渡す。
 * switch時刻を跨ぐ最初のフレームで、一度だけDOMを切り替える。
 */
export function createPresentationController({ getProject, isReady, prepare, draw, clear,
  now, requestFrame, cancelFrame, onSlide, onState, onWarning }) {
  let index = 0
  let job = null
  let raf = null
  let serial = 0
  let disposed = false
  const publish = timeMs => { if (!disposed) onState({ state: job ? 'transitioning' : 'idle', index, timeMs, transitionId: job?.transition.id ?? null }) }
  const active = id => !disposed && job?.id === id

  function cancelTick() { if (raf !== null) cancelFrame(raf); raf = null }
  function commitSlide(target) { index = target; return onSlide(target) }
  function finish() {
    cancelTick()
    job = null
    clear()
    publish(0)
  }
  function fail(error) {
    if (disposed) return
    const failed = job
    job = null
    cancelTick()
    serial++
    if (failed && !failed.switched) void commitSlide(failed.target)
    clear()
    onWarning(error instanceof Error ? error.message : String(error))
    publish(0)
  }

  async function paint(id, timeMs) {
    if (!active(id)) return
    const frame = transitionFrame(job.transition, timeMs)
    await draw(frame)
    if (active(id)) publish(timeMs)
  }

  async function advance(id, timeMs) {
    if (!active(id)) return
    const current = job
    if (!current.switched && timeMs >= current.transition.switchAtMs) {
      current.switched = true
      await commitSlide(current.target)
      if (!active(id)) return
    }
    await paint(id, timeMs)
    if (!active(id)) return
    if (timeMs >= current.transition.durationMs) { finish(); return }
    raf = requestFrame(timestamp => {
      raf = null
      void advance(id, Math.min(current.transition.durationMs, Math.max(0, timestamp - current.origin))).catch(error => { if (active(id)) fail(error) })
    })
  }

  async function next() {
    const project = getProject()
    if (disposed || job || index >= project.slides.length - 1) return false
    const target = index + 1
    const source = project.slides[index]
    const transition = project.transitions.find(transition => transition.id === source.transitionId)
    if (!transition) {
      if (source.transitionId) onWarning('指定されたTransitionが見つからないため即時切替しました。')
      void commitSlide(target); publish(0)
      return true
    }
    const id = ++serial
    job = { id, transition, target, origin: 0, switched: false }
    publish(0)
    try {
      if (!isReady()) throw new Error('演出の描画を利用できないため即時切替しました。')
      const switchState = validateTransitionForPlayback(transition)
      await prepare(switchState.shapes)
      if (!active(id)) return false
      job.origin = now()
      await advance(id, 0)
      return true
    } catch (error) { if (active(id)) fail(error); return false }
  }

  function previous() {
    if (disposed || job || index <= 0) return false
    void commitSlide(index - 1)
    clear(); publish(0)
    return true
  }
  function dispose() { disposed = true; serial++; job = null; cancelTick(); clear() }
  publish(0)
  return { next, previous, fail, dispose }
}
