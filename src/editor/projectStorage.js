import { parseProject, serializeProject } from '../domain/project/project.js'

export const STORAGE_KEY = 'generative-slide-system.project.v1'

/** 読み取り失敗・破損時は自動上書きを禁止して、元の保存値を保護する。 */
export function readStoredProject(getStorage, fallback) {
  try {
    const text = getStorage().getItem(STORAGE_KEY)
    return { project: text === null ? fallback() : parseProject(text), blocked: false, error: '' }
  } catch (error) {
    return { project: fallback(), blocked: true, error: `保存データを復元できません: ${error.message}` }
  }
}

/** UI状態を受け取らず、確定したProjectだけを500ms後に保存する。 */
export function createProjectStorage({ getStorage, onStatus, blocked = false, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null
  let pending = null
  function flush() {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (blocked || pending === null) return
    try {
      getStorage().setItem(STORAGE_KEY, serializeProject(pending))
      pending = null
      onStatus({ state: 'saved', message: '保存済み' })
    } catch (error) { onStatus({ state: 'error', message: `保存できません: ${error.message}。JSON出力で退避できます。` }) }
  }
  function schedule(project) {
    pending = project
    if (blocked) return
    if (timer !== null) clearTimer(timer)
    onStatus({ state: 'saving', message: '保存中…' })
    timer = setTimer(flush, 500)
  }
  function unblock(project) { blocked = false; schedule(project) }
  return { schedule, flush, unblock }
}
