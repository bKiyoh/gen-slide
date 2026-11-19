import { createProject, nextId, validateProject } from './project.js'
import { createSampleTransition } from '../transition/sampleTransition.js'

/** 保存済みの作品を置き換えず、発表用の3スライド・2演出を明示的に追加する。 */
export function addPresentationSample(project) {
  const sweepId = nextId(project, 'transition')
  const group = createSampleTransition().layers[1]
  group.id = nextId(project, 'group')
  group.childAnimation = { staggerMs: 40, tracks: [
    { property: 'transform.x', mode: 'offset', keyframes: [
      { timeMs: 0, value: -2200, easing: 'easeOutCubic' }, { timeMs: 400, value: 0, easing: 'easeInCubic' }, { timeMs: 800, value: 2200 },
    ] },
    { property: 'transform.rotation', mode: 'offset', keyframes: [{ timeMs: 0, value: -30 }, { timeMs: 400, value: 0 }, { timeMs: 800, value: 30 }] },
  ] }
  project.transitions.push({ id: sweepId, name: 'Presentation · Diagonal Sweep', durationMs: 1200, switchAtMs: 600,
    layers: [group] })
  const blockId = nextId(project, 'transition')
  const scaleTrack = property => ({ property, mode: 'absolute', keyframes: [
    { timeMs: 0, value: 0, easing: 'easeInOutCubic' }, { timeMs: 500, value: 1.1, easing: 'easeInOutCubic' }, { timeMs: 1100, value: 0 },
  ] })
  project.transitions.push({ id: blockId, name: 'Presentation · Block Reveal', durationMs: 1100, switchAtMs: 550,
    layers: [{
      id: nextId(project, 'shape'), kind: 'shape', geometry: { type: 'rectangle', width: 1920, height: 1080, skewX: 0 },
      style: { color: '#315DB6', opacity: 1 }, transform: { x: 960, y: 540, rotation: 0, scaleX: 1, scaleY: 1 },
      tracks: [scaleTrack('transform.scaleX'), scaleTrack('transform.scaleY')],
    }] })
  for (const [component, transitionId] of [['TitleSlide', sweepId], ['ContentSlide', blockId], ['ClosingSlide', null]]) {
    project.slides.push({ id: nextId(project, 'slide'), component, transitionId })
  }
}

export function createInitialProject() {
  const project = createProject()
  addPresentationSample(project)
  return validateProject(project)
}
