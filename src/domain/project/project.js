import { createSampleAnimatedTransition } from '../transition/sampleAnimatedTransition.js'
import { evaluateTransition } from '../transition/evaluateTransition.js'
import { resolveLocalShapes } from '../transition/resolveStaticShapes.js'
import { prepareTracks, applyTrackValues } from '../transition/animation/tracks.js'
import { validateShape, validateTransform } from '../shapes.js'

/** 保存にDOM/GPU等のインスタンス、循環参照、NaNが混ざらないよう検証する。 */
function assertPlainJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) return
  if (!value || typeof value !== 'object' || ancestors.has(value)
    || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new RangeError('ProjectにはJSON化可能なプレーンデータだけを保存できます。')
  ancestors.add(value)
  for (const child of Object.values(value)) assertPlainJson(child, ancestors)
  ancestors.delete(value)
}

function assertTrackBounds(base, tracks, group = false) {
  for (const track of prepareTracks(tracks)) for (const key of track.keyframes) {
    const result = applyTrackValues(base, new Map([[track.property, { mode: track.mode, value: key.value }]]))
    const errors = group ? validateTransform(result.transform) : validateShape(result)
    if (errors.length) throw new RangeError(`キーフレームの値が描画範囲外です: ${errors.join(' ')}`)
  }
}

/** スキーマ・ID・参照・静的状態・全キー端点を検証する。入力は変更しない。 */
export function validateProject(project) {
  assertPlainJson(project)
  if (project?.schemaVersion !== 1) throw new RangeError('未対応のschemaVersionです。対応値は1です。')
  if (!Array.isArray(project.transitions) || !Array.isArray(project.slides)) throw new RangeError('transitions / slides は配列が必要です。')
  const ids = new Set()
  const claimId = id => {
    if (typeof id !== 'string' || !id.trim() || id.includes('/') || ids.has(id)) throw new RangeError('IDが不正または重複しています。')
    ids.add(id)
  }
  for (const transition of project.transitions) {
    if (!transition || typeof transition !== 'object' || Array.isArray(transition)) throw new RangeError('Transitionはオブジェクトで指定してください。')
    claimId(transition.id)
    if (typeof transition.name !== 'string' || !transition.name.trim()) throw new RangeError('Transition名を入力してください。')
    if (!Number.isFinite(transition.switchAtMs) || transition.switchAtMs < 0 || transition.switchAtMs > transition.durationMs) throw new RangeError('switchAtMs は0〜durationMsで指定してください。')
    // 旧JSONのcoverは互換性のため保持するが、検証・描画には使用しない。
    evaluateTransition(transition, 0) // 型・重複キー・未対応property・Staggerも検証
    evaluateTransition(transition, transition.durationMs)
    for (const layer of transition.layers) {
      claimId(layer.id)
      if (layer.kind === 'group') assertTrackBounds({ transform: layer.transform }, layer.tracks, true)
    }
    for (const base of resolveLocalShapes(transition).shapes) {
      const layer = transition.layers.find(layer => layer.id === (base.groupId ?? base.id))
      const child = base.groupId ? prepareTracks(layer.childAnimation?.tracks) : prepareTracks(layer.tracks)
      const individual = base.groupId ? prepareTracks(layer.overrides?.[base.itemId]?.tracks) : []
      const merged = new Map(child.map(track => [track.property, track]))
      for (const track of individual) if (track.keyframes.length) merged.set(track.property, track)
      assertTrackBounds(base, [...merged.values()])
    }
  }
  const transitionIds = new Set(project.transitions.map(transition => transition.id))
  for (const slide of project.slides) {
    if (!slide || typeof slide !== 'object' || Array.isArray(slide)) throw new RangeError('Slideはオブジェクトで指定してください。')
    claimId(slide.id)
    if (typeof slide.component !== 'string' || !slide.component.trim()) throw new RangeError('Slideのcomponentは文字列キーで指定してください。')
    if (slide.transitionId !== undefined && slide.transitionId !== null && !transitionIds.has(slide.transitionId)) throw new RangeError('Slideが存在しないTransitionを参照しています。')
  }
  return project
}

export function createProject() {
  const transition = createSampleAnimatedTransition()
  return { schemaVersion: 1, transitions: [transition], slides: [] }
}

export function createTransition(id) {
  return { id, name: '新しいTransition', durationMs: 1200, switchAtMs: 600, layers: [] }
}

/** 小さなトランザクション。検証成功まで現在のProjectを変更しない。 */
export function applyProjectEdit(project, edit) {
  const next = JSON.parse(JSON.stringify(project))
  edit(next)
  return validateProject(next)
}

export function parseProject(text) { return validateProject(JSON.parse(text)) }
export function serializeProject(project) { validateProject(project); return JSON.stringify(project, null, 2) }

/** TransitionとLayerのIDはProject全体で一意。複製後も生成子のキーは保持する。 */
export function nextId(project, prefix) {
  const ids = new Set(project.transitions.flatMap(t => [t.id, ...t.layers.map(layer => layer.id)]).concat(project.slides.map(slide => slide.id)))
  let index = 1
  while (ids.has(`${prefix}-${String(index).padStart(3, '0')}`)) index++
  return `${prefix}-${String(index).padStart(3, '0')}`
}

export function duplicateTransition(project, id) {
  const original = project.transitions.find(t => t.id === id)
  const copy = JSON.parse(JSON.stringify(original))
  copy.id = nextId(project, 'transition')
  copy.name += ' のコピー'
  copy.layers = []
  project.transitions.push(copy)
  for (const layer of original.layers) copy.layers.push({ ...JSON.parse(JSON.stringify(layer)), id: nextId(project, layer.kind) })
  return copy.id
}
