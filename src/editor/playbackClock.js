/** RAFはEditorの時計にだけ使う。評価器は実経過時間から直接状態を計算する。 */
export function createPlaybackClock({ now, requestFrame, cancelFrame, getDuration, onTime, onPlaying }) {
  let time = 0
  let frame = null
  let playing = false
  let origin = 0
  function pause() {
    playing = false
    if (frame !== null) cancelFrame(frame)
    frame = null
    onPlaying(false)
  }
  function tick(timestamp) {
    frame = null
    if (!playing) return
    time = Math.min(getDuration(), Math.max(0, timestamp - origin))
    onTime(time)
    if (time >= getDuration()) pause()
    else frame = requestFrame(tick)
  }
  function seek(value) {
    if (!Number.isFinite(value)) throw new RangeError('時刻は有限な数値で指定してください。')
    time = Math.min(getDuration(), Math.max(0, value))
    origin = now() - time
    onTime(time)
  }
  function play() {
    if (playing) return
    if (time >= getDuration()) time = 0
    origin = now() - time
    playing = true
    onPlaying(true)
    onTime(time)
    frame = requestFrame(tick)
  }
  function stop() { pause(); seek(0) }
  return { play, pause, stop, seek, dispose: pause }
}
