import { computed, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { applyProjectEdit, createTransition, duplicateTransition, nextId, parseProject, serializeProject } from '../domain/project/project.js'
import { createInitialProject } from '../domain/project/presentationSample.js'
import { createSampleShapes } from '../domain/shapes.js'
import { createSampleTransition } from '../domain/transition/sampleTransition.js'
import { evaluateTransition } from '../domain/transition/evaluateTransition.js'
import { createPlaybackClock } from './playbackClock.js'
import { createProjectStorage, readStoredProject } from './projectStorage.js'
import { editBaseDisplay } from './displayValues.js'
import { createProjectHistory } from './projectHistory.js'

export function useEditor(initialProject) {
  const getStorage = () => window.localStorage
  const restored = readStoredProject(getStorage, createInitialProject)
  if (initialProject) restored.project = parseProject(JSON.stringify(initialProject))
  const project = shallowRef(restored.project)
  const transitionId = ref(project.value.transitions[0]?.id ?? '')
  const previewSlideId = ref(null)
  const previewSlide = computed(() => project.value.slides.find(slide => slide.id === previewSlideId.value) ?? null)
  const selection = ref(null)
  const keySelection = ref(null)
  const pickMode = ref('child')
  const scope = ref('shape')
  const mode = ref('base')
  const timeMs = ref(0)
  const playing = ref(false)
  const error = ref(restored.error)
  const storageBlocked = ref(restored.blocked)
  const saveStatus = ref({ state: restored.blocked ? 'error' : 'saved', message: restored.blocked ? '自動保存を保留中（元データ保護）' : '保存済み' })
  const pendingImport = shallowRef(null)
  const history = createProjectHistory()
  const historyState = ref(history.state())
  const gestureActive = ref(false)
  const gestureChanged = ref(false)
  let gestureBase = null
  let gestureHasError = false
  let gestureSerial = 0
  let gestureToken = null
  const canUndo = computed(() => historyState.value.undoCount > 0 || gestureChanged.value)
  const canRedo = computed(() => historyState.value.redoCount > 0 && !gestureActive.value)
  const transition = computed(() => project.value.transitions.find(t => t.id === transitionId.value))
  const layer = computed(() => transition.value?.layers.find(layer => layer.id === selection.value?.layerId))
  const persistence = createProjectStorage({ getStorage, blocked: restored.blocked, onStatus: status => { saveStatus.value = status } })
  const clock = createPlaybackClock({ now: () => performance.now(), requestFrame: callback => requestAnimationFrame(callback),
    cancelFrame: id => cancelAnimationFrame(id), getDuration: () => transition.value?.durationMs ?? 0,
    onTime: value => { timeMs.value = value }, onPlaying: value => { playing.value = value } })
  const snapshot = computed(() => {
    try { return { shapes: transition.value ? evaluateTransition(transition.value, timeMs.value).shapes : [], error: '' } }
    catch (exception) { return { shapes: [], error: exception.message } }
  })
  const renderShapes = shallowRef([])
  watch(snapshot, state => {
    if (state.error) { error.value = state.error; clock.pause(); return }
    renderShapes.value = state.shapes
  }, { immediate: true })

  function reconcile() {
    if (previewSlideId.value) {
      if (!previewSlide.value) selectTransition(project.value.transitions[0]?.id ?? '')
      else if (transitionId.value !== (previewSlide.value.transitionId ?? '')) selectSlide(previewSlideId.value)
    } else if (!transition.value) selectTransition(project.value.transitions[0]?.id ?? '')
    if (selection.value && !layer.value) selection.value = null
    if (keySelection.value) {
      const key = keySelection.value
      const target = transition.value?.layers.find(layer => layer.id === key.layerId)
      const tracks = key.scope === 'child' ? target?.childAnimation?.tracks : key.scope === 'individual' ? target?.overrides?.[key.itemId]?.tracks : target?.tracks
      if (!tracks?.find(track => track.property === key.property)?.keyframes.some(candidate => candidate.timeMs === key.timeMs)) keySelection.value = null
    }
    if (timeMs.value > (transition.value?.durationMs ?? 0)) clock.seek(transition.value?.durationMs ?? 0)
  }
  function commit(edit, fromStart = false) {
    try {
      const before = project.value
      project.value = applyProjectEdit(fromStart && gestureBase ? gestureBase : before, edit)
      if (gestureActive.value) gestureChanged.value = JSON.stringify(gestureBase) !== JSON.stringify(project.value)
      else { history.record(before, project.value); historyState.value = history.state(); persistence.schedule(project.value) }
      reconcile()
      if (!gestureActive.value) error.value = ''
      return true
    } catch (exception) { if (gestureActive.value) gestureHasError = true; error.value = exception.message; return false }
  }
  function editTransition(edit) { return commit(draft => edit(draft.transitions.find(t => t.id === transitionId.value))) }
  function selectTransition(id) { clock.stop(); transitionId.value = id; selection.value = null; keySelection.value = null; previewSlideId.value = null }
  function selectSlide(id) {
    const slide = project.value.slides.find(slide => slide.id === id)
    if (!slide) return
    selectTransition(slide.transitionId ?? '')
    previewSlideId.value = id
  }
  function selectLayer(layerId, itemId) {
    if (!layerId) { selection.value = null; keySelection.value = null; return }
    if (selection.value?.layerId !== layerId || selection.value?.itemId !== itemId) keySelection.value = null
    selection.value = itemId ? { layerId, itemId } : { layerId }
    scope.value = itemId ? 'individual' : transition.value.layers.find(layer => layer.id === layerId).kind === 'group' ? 'group' : 'shape'
    pickMode.value = scope.value === 'group' ? 'group' : 'child'
  }
  function selectKey(property, time) {
    if (!selection.value) return
    clock.pause(); seek(time)
    keySelection.value = { ...selection.value, itemId: selection.value.itemId ?? null, scope: scope.value, property, timeMs: time }
  }
  function beginGesture() {
    if (gestureActive.value) endGesture()
    clock.pause(); gestureBase = project.value; gestureActive.value = true; gestureChanged.value = false; gestureHasError = false
    gestureToken = ++gestureSerial
    return gestureToken
  }
  function endGesture(token) {
    if (!gestureActive.value || token !== undefined && token !== gestureToken) return
    history.record(gestureBase, project.value); historyState.value = history.state()
    gestureBase = null; gestureToken = null; gestureActive.value = false; gestureChanged.value = false
    if (!gestureHasError) error.value = ''
    persistence.schedule(project.value)
  }
  function cancelGesture(token) {
    if (!gestureActive.value || token !== undefined && token !== gestureToken) return
    project.value = gestureBase; gestureBase = null; gestureToken = null; gestureActive.value = false; gestureChanged.value = false
    reconcile(); persistence.schedule(project.value)
  }
  function updateGesture(edit, token) {
    if (!gestureActive.value || token !== undefined && token !== gestureToken) return false
    return commit(edit, true)
  }
  function undo() {
    endGesture(); clock.pause()
    const restored = history.undo(project.value)
    if (restored) { project.value = restored; reconcile(); persistence.schedule(project.value); error.value = '' }
    historyState.value = history.state()
  }
  function redo() {
    if (gestureActive.value) return
    clock.pause()
    const restored = history.redo(project.value)
    if (restored) { project.value = restored; reconcile(); persistence.schedule(project.value); error.value = '' }
    historyState.value = history.state()
  }
  function historyKey(event) {
    if (event.key === 'Escape' && gestureActive.value) { event.preventDefault(); cancelGesture(); return }
    if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)
      || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
    const key = event.key.toLowerCase()
    if (key === 'z' || key === 'y') { event.preventDefault(); if (event.shiftKey || key === 'y') redo(); else undo() }
  }
  function addTransition() {
    let id
    if (commit(draft => { id = nextId(draft, 'transition'); draft.transitions.push(createTransition(id)) })) selectTransition(id)
  }
  function copyTransition() {
    let id
    if (commit(draft => { id = duplicateTransition(draft, transitionId.value) })) selectTransition(id)
  }
  function removeTransition() {
    const id = transitionId.value
    if (commit(draft => {
      draft.transitions = draft.transitions.filter(t => t.id !== id)
      for (const slide of draft.slides) if (slide.transitionId === id) slide.transitionId = null
    })) selectTransition(project.value.transitions[0]?.id ?? '')
  }
  function addLayer(kind) {
    let id
    if (commit(draft => {
      const target = draft.transitions.find(t => t.id === transitionId.value)
      id = nextId(draft, kind)
      const added = kind === 'group' ? createSampleTransition().layers[1] : createSampleShapes()[1]
      added.id = id
      if (kind === 'shape') { added.geometry.width = 200; added.geometry.height = 120; added.transform.x = 960; added.transform.y = 540 }
      target.layers.push(added)
    })) selectLayer(id)
  }
  function copyLayer() {
    let id
    if (commit(draft => {
      const target = draft.transitions.find(t => t.id === transitionId.value)
      const original = target.layers.find(layer => layer.id === selection.value.layerId)
      id = nextId(draft, original.kind)
      target.layers.splice(target.layers.indexOf(original) + 1, 0, { ...JSON.parse(JSON.stringify(original)), id })
    })) selectLayer(id)
  }
  function removeLayer() {
    if (editTransition(t => { t.layers = t.layers.filter(layer => layer.id !== selection.value.layerId) })) selection.value = null
  }
  function moveLayer(direction) {
    editTransition(t => {
      const index = t.layers.findIndex(layer => layer.id === selection.value.layerId)
      const destination = index + direction
      if (destination >= 0 && destination < t.layers.length) [t.layers[index], t.layers[destination]] = [t.layers[destination], t.layers[index]]
    })
  }
  function editBase(property, value) { return editTransition(t => editBaseDisplay(t, selection.value, property, value, timeMs.value)) }
  function seek(value) { try { clock.seek(value); error.value = '' } catch (exception) { error.value = exception.message } }
  async function prepareImport(file) {
    try { pendingImport.value = { project: parseProject(await file.text()), name: file.name }; error.value = '' }
    catch (exception) { pendingImport.value = null; error.value = `JSONを読み込めません: ${exception.message}` }
  }
  function applyImport() {
    if (!pendingImport.value) return
    cancelGesture(); clock.stop()
    project.value = pendingImport.value.project
    pendingImport.value = null
    storageBlocked.value = false
    persistence.unblock(project.value)
    selectTransition(project.value.transitions[0]?.id ?? '')
    error.value = ''
    history.clear(); historyState.value = history.state()
  }
  function exportProject() {
    const url = URL.createObjectURL(new Blob([serializeProject(project.value)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'generative-slide-project.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  function retryRestore() {
    const next = readStoredProject(getStorage, () => project.value)
    if (next.blocked) { error.value = next.error; return }
    cancelGesture(); project.value = next.project; storageBlocked.value = false; error.value = ''
    history.clear(); historyState.value = history.state()
    selectTransition(project.value.transitions[0]?.id ?? '')
    persistence.unblock(project.value)
  }
  const flush = () => { cancelGesture(); persistence.flush() }
  window.addEventListener('pagehide', flush)
  window.addEventListener('keydown', historyKey)
  if (!restored.blocked) persistence.schedule(project.value)
  onUnmounted(() => { cancelGesture(); clock.dispose(); persistence.flush(); window.removeEventListener('pagehide', flush); window.removeEventListener('keydown', historyKey) })
  return reactive({ project, transition, transitionId, previewSlide, layer, selection, scope, mode, timeMs, playing, error, saveStatus, storageBlocked, pendingImport,
    renderShapes, keySelection, pickMode, gestureActive, historyState, canUndo, canRedo,
    beginGesture, endGesture, cancelGesture, updateGesture, undo, redo, selectKey,
    commit, editTransition, selectTransition, selectSlide, selectLayer, addTransition, copyTransition, removeTransition,
    addLayer, copyLayer, removeLayer, moveLayer, editBase, seek, play: clock.play, pause: clock.pause, stop: clock.stop,
    prepareImport, applyImport, exportProject, retryRestore, flush, retrySave: () => persistence.unblock(project.value) })
}
