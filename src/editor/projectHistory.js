/** Projectのみを保存する履歴。UI状態やGPU参照は受け取らない。 */
export function createProjectHistory({ limit = 50, maxCharacters = 4 * 1024 * 1024 } = {}) {
  const past = [], future = []
  const encode = project => JSON.stringify(project)
  function trim() {
    while (past.length + future.length > limit || [...past, ...future].reduce((size, value) => size + value.length, 0) > maxCharacters) {
      if (past.length) past.shift()
      else future.shift()
    }
  }
  function record(before, after) {
    const previous = encode(before)
    if (previous === encode(after)) return false
    future.length = 0
    past.push(previous)
    trim()
    return true
  }
  function undo(current) {
    if (!past.length) return null
    const previous = past.pop()
    future.push(encode(current)); trim()
    return JSON.parse(previous)
  }
  function redo(current) {
    if (!future.length) return null
    const next = future.pop()
    past.push(encode(current)); trim()
    return JSON.parse(next)
  }
  return { record, undo, redo, clear() { past.length = future.length = 0 },
    state: () => ({ undoCount: past.length, redoCount: future.length, limit, maxCharacters }) }
}
