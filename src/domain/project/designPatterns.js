import { nextId, validateProject } from './project.js'

const BLUE = '#2857D9', RED = '#EE5846', INK = '#182436', PAPER = '#F5F3EE', GOLD = '#E5BC52'
const transform = (x = 0, y = 0) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 })
const rectangle = (width, height) => ({ type: 'rectangle', width, height, skewX: 0 })
const track = (property, keys, mode = 'absolute') => ({ property, mode,
  keyframes: keys.map(([timeMs, value, easing = 'easeInOutCubic']) => ({ timeMs, value, easing })) })
const opacity = (end, delay = 0) => track('style.opacity', [[0, 0], [delay + 60, 1], [end - 60, 1], [end, 0]])
function group(id, geometry, generator, colors) {
  return { id, kind: 'group', template: { geometry, style: { color: colors[0], opacity: 1 }, transform: transform() },
    generator, modifiers: [{ property: 'style.color', type: 'alternate', values: colors }],
    transform: transform(), tracks: [], childAnimation: { staggerMs: 0, tracks: [] }, overrides: {} }
}
const linear = (count, startX, startY, stepX, stepY) => ({ type: 'linear', count, startX, startY, stepX, stepY })
function shape(id, geometry, color, tracks) {
  return { id, kind: 'shape', geometry, style: { color, opacity: 1 }, transform: transform(960, 540), tracks }
}
const transition = (name, durationMs, switchAtMs, layers) => ({ id: 'design-transition', name, durationMs, switchAtMs, layers })

function diagonalSweep() {
  const bars = group('diagonal-bars', { type: 'parallelogram', width: 360, height: 1800, skewX: -16 },
    linear(8, -90, 540, 300, 0), [BLUE, RED])
  bars.childAnimation = { staggerMs: 25, tracks: [
    track('transform.x', [[0, -2600, 'easeOutCubic'], [420, 0], [620, 0, 'easeInCubic'], [1080, 2600]], 'offset'), opacity(1080),
  ] }
  return transition('斜線スイープ', 1280, 600, [bars])
}
function centerBlock() {
  const scale = (property, keys) => track(`transform.${property}`, keys)
  const outer = [[0, 0], [460, 6], [650, 6], [1100, 0]]
  const inner = [[0, 0], [100, 0], [540, 7], [650, 7], [1020, 0]]
  const accent = [[0, 0], [240, 0], [520, 2], [750, 2], [950, 0]]
  return transition('センターブロック', 1160, 580, [
    shape('outer-block', rectangle(384, 216), BLUE, [scale('scaleX', outer), scale('scaleY', outer), opacity(1120)]),
    shape('inner-block', rectangle(256, 144), RED, [scale('scaleX', inner), scale('scaleY', inner), opacity(1050, 80)]),
    shape('center-diamond', rectangle(96, 96), PAPER, [scale('scaleX', accent), scale('scaleY', accent),
      track('transform.rotation', [[0, -45], [950, 135]]), opacity(960, 200)]),
  ])
}
function checkerFlip() {
  const tiles = group('checker-tiles', rectangle(1920 / 7 + 2, 272),
    { type: 'grid', rows: 4, columns: 7, startX: 960 / 7, startY: 135, gapX: 1920 / 7, gapY: 270, rowOffsetX: 0, columnOffsetY: 0 }, [INK, PAPER])
  tiles.overrides = { 'item-007': { style: { color: RED } }, 'item-020': { style: { color: BLUE } } }
  tiles.childAnimation = { staggerMs: 14, tracks: [
    track('transform.scaleX', [[0, 0], [360, 1], [860, 1], [1140, 0]]),
    track('transform.rotation', [[0, -70], [360, 0], [860, 0], [1140, 45]]), opacity(1140),
  ] }
  return transition('チェッカー・フリップ', 1540, 780, [tiles])
}
function alternatingShutter() {
  const bands = group('shutter-bands', rectangle(2000, 182), linear(6, 960, 90, 0, 180), [INK, RED, BLUE])
  bands.childAnimation = { staggerMs: 35, tracks: [
    track('transform.x', [[0, -2100, 'easeOutCubic'], [400, 0], [680, 0, 'easeInCubic'], [1080, 2100]], 'offset'), opacity(1080),
  ] }
  for (const index of [1, 3, 5]) {
    const delay = index * 35
    bands.overrides[`item-${String(index).padStart(3, '0')}`] = { tracks: [track('transform.x',
      [[0, 2100], [delay, 2100, 'easeOutCubic'], [delay + 400, 0], [delay + 680, 0, 'easeInCubic'], [delay + 1080, -2100]], 'offset')] }
  }
  return transition('交互シャッター', 1280, 620, [bands])
}
function frameZoom() {
  const layers = [BLUE, RED, INK, GOLD].map((color, index) => {
    const delay = index * 140, end = delay + 1080, angle = index % 2 ? 10 : -10
    const frame = group(`zoom-frame-${index}`, rectangle(1140, 40), linear(4, 0, 0, 0, 0), [color])
    frame.transform = transform(960, 540)
    frame.overrides = {
      'item-000': { transform: { offsetY: -310 } }, 'item-001': { transform: { offsetY: 310 } },
      'item-002': { geometry: { width: 40, height: 660 }, transform: { offsetX: -550 } },
      'item-003': { geometry: { width: 40, height: 660 }, transform: { offsetX: 550 } },
    }
    frame.tracks = ['transform.scaleX', 'transform.scaleY'].map(property => track(property, [[0, 0], [delay + 100, .08], [end, 2.8]]))
    frame.tracks.push(track('transform.rotation', [[0, angle], [end, -angle]]))
    frame.childAnimation.tracks = [opacity(end, delay)]
    return frame
  })
  layers.push(shape('zoom-center', rectangle(32, 32), INK, [
    track('transform.rotation', [[0, 45], [1000, 225]]),
    track('transform.scaleX', [[0, 0], [400, 2], [1000, 0]]), track('transform.scaleY', [[0, 0], [400, 2], [1000, 0]]), opacity(1000),
  ]))
  return transition('フレームズーム', 1600, 780, layers)
}

export const DESIGN_PATTERNS = Object.freeze([
  { key: 'diagonal-sweep', name: '斜線スイープ', description: '赤と青の斜線が、時間差で画面を横切る。', previewAtMs: 470, durationMs: 1280 },
  { key: 'center-block', name: 'センターブロック', description: '中央からブロックが広がり、ダイヤが回転する。', previewAtMs: 390, durationMs: 1160 },
  { key: 'checker-flip', name: 'チェッカー・フリップ', description: '市松模様のタイルが、順に開いて閉じる。', previewAtMs: 600, durationMs: 1540 },
  { key: 'alternating-shutter', name: '交互シャッター', description: '6本の帯が左右交互に入り、逆側へ抜ける。', previewAtMs: 440, durationMs: 1280 },
  { key: 'frame-zoom', name: 'フレームズーム', description: '4色のフレームが、回転しながら外へ広がる。', previewAtMs: 760, durationMs: 1600 },
])
const factories = { 'diagonal-sweep': diagonalSweep, 'center-block': centerBlock, 'checker-flip': checkerFlip,
  'alternating-shutter': alternatingShutter, 'frame-zoom': frameZoom }
export function createDesignPattern(key) {
  if (!Object.hasOwn(factories, key)) throw new RangeError('指定の意匠パターンがありません。')
  return factories[key]()
}

/** 既存の作品・発表構成を保持して、通常の編集可能なTransitionとして追加する。 */
export function addDesignPatterns(project, keys = DESIGN_PATTERNS.map(pattern => pattern.key)) {
  const added = keys.map(createDesignPattern)
  for (const design of added) {
    design.id = nextId(project, 'transition')
    const name = design.name
    let index = 2
    while (project.transitions.some(transition => transition.name === design.name)) design.name = `${name} · ${index++}`
    const layers = design.layers
    design.layers = []
    project.transitions.push(design)
    for (const layer of layers) design.layers.push({ ...layer, id: nextId(project, layer.kind) })
  }
  return added.map(design => design.id)
}

/** 比較用の独立Project。Editorの保存Projectには追加しない。 */
export function createDesignDemoProject() {
  const project = { schemaVersion: 1, transitions: [], slides: [] }
  const ids = addDesignPatterns(project)
  const components = ['TitleSlide', 'ContentSlide', 'ClosingSlide', 'TitleSlide', 'ContentSlide', 'ClosingSlide']
  for (const [index, component] of components.entries()) project.slides.push({ id: nextId(project, 'slide'), component, transitionId: ids[index] ?? null })
  return validateProject(project)
}
