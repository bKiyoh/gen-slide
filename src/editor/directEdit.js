import { displayContext, editBaseDisplay, editKeyDisplay, getTracks } from './displayValues.js'

export function directScope(transition, selection, mode, scope) {
  return mode === 'keyframe' ? scope : selection.itemId ? 'individual'
    : transition.layers.find(layer => layer.id === selection.layerId)?.kind === 'group' ? 'group' : 'shape'
}
export function directContext(transition, selection, mode, scope, timeMs) {
  return displayContext(transition, selection, directScope(transition, selection, mode, scope), timeMs)
}

export function assertDirectEdit(context, selection, mode, scope, keySelection, action, timeMs) {
  const properties = action === 'move' ? ['transform.x', 'transform.y'] : action === 'rotate'
    ? ['transform.rotation'] : ['transform.scaleX', 'transform.scaleY']
  const matrix = context.current.worldMatrix
  const determinant = matrix ? matrix[0] * matrix[3] - matrix[1] * matrix[2]
    : (context.current.transform.scaleX ?? 1) * (context.current.transform.scaleY ?? 1)
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new RangeError('倍率が0、または変換が不安定です。先に数値入力で倍率を戻してください。')
  for (const property of properties) if (context.restrictions[property]) throw new RangeError(context.restrictions[property])
  if (mode !== 'keyframe') return
  if (!keySelection || keySelection.layerId !== selection.layerId || keySelection.itemId !== (selection.itemId ?? null)
    || keySelection.scope !== scope || keySelection.timeMs !== timeMs || !properties.includes(keySelection.property)) {
    throw new RangeError('タイムラインで、この操作に対応する位置・回転・倍率のキーを選択してください。ドラッグではキーを自動追加しません。')
  }
  const tracks = getTracks(context.layer, context.itemId, scope)
  if (properties.some(property => !tracks.find(track => track.property === property)?.keyframes.some(key => key.timeMs === keySelection.timeMs))) {
    throw new RangeError('位置・倍率の操作には同時刻のX/Yキーが必要です。タイムラインのキー追加ボタンで対を作成してください。')
  }
}

/** 開始時の画面値に対する差分。拡縮は中心を固定した一様倍率。 */
export function directValues(action, start, current, pivot, values) {
  if (![start.x, start.y, current.x, current.y, pivot.x, pivot.y].every(Number.isFinite)) throw new RangeError('ポインター座標が不正です。')
  if (action === 'move') return { 'transform.x': values['transform.x'] + current.x - start.x,
    'transform.y': values['transform.y'] + current.y - start.y }
  if (action === 'rotate') {
    let delta = (Math.atan2(current.y - pivot.y, current.x - pivot.x) - Math.atan2(start.y - pivot.y, start.x - pivot.x)) * 180 / Math.PI
    delta = (delta + 540) % 360 - 180
    return { 'transform.rotation': values['transform.rotation'] + delta }
  }
  const radius = Math.hypot(start.x - pivot.x, start.y - pivot.y)
  if (radius < 1e-8) throw new RangeError('中心とハンドルが重なるため拡縮できません。')
  const ratio = Math.max(.01, Math.hypot(current.x - pivot.x, current.y - pivot.y) / radius)
  return { 'transform.scaleX': values['transform.scaleX'] * ratio, 'transform.scaleY': values['transform.scaleY'] * ratio }
}
export function applyDirectValues(transition, selection, mode, scope, keySelection, values, timeMs) {
  for (const [property, value] of Object.entries(values)) {
    if (mode === 'base') editBaseDisplay(transition, selection, property, value, timeMs)
    else {
      const layer = transition.layers.find(layer => layer.id === selection.layerId)
      const track = getTracks(layer, selection.itemId, scope).find(track => track.property === property)
      const index = track?.keyframes.findIndex(key => key.timeMs === keySelection.timeMs)
      if (index === undefined || index < 0) throw new RangeError('編集対象のキーがありません。')
      editKeyDisplay(transition, selection, scope, property, index, value)
    }
  }
}

/** キーは隣のキーを追い越さず、1ms刻みで移動する。 */
export function draggedKeyTime(track, index, requested, durationMs) {
  if (!Number.isFinite(requested)) throw new RangeError('キー時刻が不正です。')
  const current = track.keyframes[index].timeMs
  // JSONのキー配列が未整列でも、時刻順の隣接キーを基準にする。
  const times = track.keyframes.filter((_, candidate) => candidate !== index).map(key => key.timeMs)
  const previous = times.filter(time => time < current)
  const next = times.filter(time => time > current)
  const min = previous.length ? Math.max(...previous) + 1 : 0
  const max = Math.min(durationMs, next.length ? Math.min(...next) - 1 : durationMs)
  if (Math.ceil(min) > Math.floor(max)) throw new RangeError('隣接するキーの間に1msの移動余地がありません。時刻の数値入力で調整してください。')
  return Math.max(Math.ceil(min), Math.min(Math.floor(max), Math.round(requested)))
}
