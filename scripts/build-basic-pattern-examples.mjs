import { mkdir, writeFile } from 'node:fs/promises'
import { serializeProject } from '../src/domain/project/project.js'

// Phase 5までのGrid / Linear / Override / Keyframeだけで作る、A〜Dの制作例。
const BLUE = '#2857D9', RED = '#EE5846', GOLD = '#E5BC52', INK = '#182436', PAPER = '#F5F3EE'
const transform = (x = 0, y = 0) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 })
const geometry = (width, height, skewX = 0) => ({ type: 'parallelogram', width, height, skewX })
const itemId = index => 'item-' + String(index).padStart(3, '0')
const track = (property, keys, mode = 'offset') => ({ property, mode,
  keyframes: keys.map(([timeMs, value, easing = 'easeInOutCubic']) => ({ timeMs, value, easing })) })
const opacity = end => track('style.opacity', [[0, 0], [140, 1], [end - 160, 1], [end, 0]], 'absolute')
const linear = (count, startX = 0, startY = 0, stepX = 0, stepY = 0) => ({ type: 'linear', count, startX, startY, stepX, stepY })
function group(id, templateGeometry, generator, colors) {
  return { id, kind: 'group', template: { geometry: templateGeometry, style: { color: colors[0], opacity: 1 }, transform: transform() },
    generator, modifiers: [{ property: 'style.color', type: 'alternate', values: colors }], transform: transform(),
    tracks: [], childAnimation: { staggerMs: 0, tracks: [] }, overrides: {} }
}
function transition(id, name, durationMs, switchAtMs, layers) { return { id, name, durationMs, switchAtMs, layers } }

function grid() {
  const tiles = group('basic-a-tiles', geometry(148, 148), {
    type: 'grid', rows: 4, columns: 7, startX: 240, startY: 216,
    gapX: 240, gapY: 216, rowOffsetX: 0, columnOffsetY: 0,
  }, [BLUE, RED, GOLD])
  tiles.childAnimation.tracks = [opacity(2400)]
  for (let index = 0; index < 28; index++) {
    // 列と行に応じてキー時刻をずらし、左上から右下へ伝わる波を作る。
    const delay = index % 7 * 55 + Math.floor(index / 7) * 30
    tiles.overrides[itemId(index)] = { tracks: [
      track('transform.y', [[0, 0], [260 + delay, 0], [620 + delay, -64], [980 + delay, 48], [1360 + delay, 0], [2400, 0]]),
      track('transform.rotation', [[0, -20], [240 + delay, 0], [620 + delay, 28], [980 + delay, -16], [1360 + delay, 0], [2200, 0], [2400, 20]]),
      track('transform.scaleX', [[0, .15], [220 + delay, 1], [620 + delay, 1.2], [980 + delay, .75], [1360 + delay, 1], [2200, 1], [2400, .3]], 'absolute'),
      track('transform.scaleY', [[0, .15], [220 + delay, 1], [620 + delay, .8], [980 + delay, 1.3], [1360 + delay, 1], [2200, 1], [2400, .3]], 'absolute'),
    ] }
  }
  return transition('basic-a-grid', 'A：グリッド · 回転・伸縮・波', 2400, 1200, [tiles])
}

function partition() {
  const panes = group('basic-b-panes', geometry(322, 1084), linear(6, 160, 540, 320), [INK, BLUE, RED, PAPER, GOLD, BLUE])
  panes.childAnimation = { staggerMs: 45, tracks: [
    track('transform.x', [[0, -2300], [520, 0, 'easeOutCubic'], [1000, 0], [1520, 2300]]),
    track('geometry.skewX', [[0, -18], [520, 0], [1000, 0], [1520, 18]], 'absolute'),
    opacity(1560),
  ] }
  for (const index of [1, 3, 5]) {
    const delay = index * 45
    // 交互の区画だけ反対側から進入。Childの傾斜と透明度はそのまま使う。
    panes.overrides[itemId(index)] = { tracks: [track('transform.x', [
      [0, 2300], [delay, 2300], [delay + 520, 0, 'easeOutCubic'], [delay + 1000, 0], [delay + 1520, -2300],
    ])] }
  }
  return transition('basic-b-partition', 'B：分割 · スライド・傾斜', 1820, 900, [panes])
}

function overlap() {
  const specs = [
    { x: 900, y: 520, width: 1120, height: 620, color: BLUE, angle: -8 },
    { x: 1040, y: 560, width: 620, height: 620, color: RED, angle: 16 },
    { x: 900, y: 540, width: 380, height: 380, color: INK, angle: -12 },
    { x: 1010, y: 500, width: 160, height: 160, color: PAPER, angle: 28 },
  ]
  const layers = specs.map((spec, index) => {
    const delay = index * 80
    const scale = property => track(property, [[0, 0], [delay + 100, 0], [delay + 500, 1], [1160, 1], [1800, 0]], 'absolute')
    return { id: 'basic-c-block-' + (index + 1), kind: 'shape', geometry: geometry(spec.width, spec.height),
      style: { color: spec.color, opacity: 1 }, transform: transform(spec.x, spec.y), tracks: [
        scale('transform.scaleX'), scale('transform.scaleY'), opacity(1800),
        track('transform.rotation', [[0, spec.angle - 35], [delay + 520, spec.angle], [1160, spec.angle + 24], [1800, spec.angle + 65]], 'absolute'),
      ] }
  })
  return transition('basic-c-overlap', 'C：重なり · 拡大縮小・回転', 1800, 900, layers)
}

function assembly() {
  // 8本の短冊を四隅の枠に、3枚の平行四辺形を中央の折れた帯に組み合わせる。
  // [中心X, 中心Y, 幅, 高さ, 傾斜, 分解時のX差分, 分解時のY差分]
  const pieces = [
    [720, 260, 180, 40, 0, -400, -180], [640, 340, 40, 180, 0, -400, 0],
    [1200, 260, 180, 40, 0, 400, -180], [1280, 340, 40, 180, 0, 400, 0],
    [720, 820, 180, 40, 0, -400, 180], [640, 740, 40, 180, 0, -400, 0],
    [1200, 820, 180, 40, 0, 400, 180], [1280, 740, 40, 180, 0, 400, 0],
    [960, 410, 120, 180, -30, -170, -240], [930, 540, 240, 100, 30, 220, 0],
    [960, 670, 120, 180, -30, -170, 240],
  ]
  const parts = group('basic-d-parts', geometry(100, 100), linear(pieces.length), [BLUE])
  parts.transform = transform(960, 540)
  parts.childAnimation.tracks = [opacity(2600)]
  pieces.forEach(([x, y, width, height, skewX, dx, dy], index) => {
    const delay = index % 4 * 30, angle = (index % 2 ? -1 : 1) * (35 + index * 3)
    const movement = (property, delta) => track(property, [
      [0, delta * 1.5], [520 + delay, 0], [940, 0], [1420, delta], [1620, delta], [2140 + delay, 0], [2420, 0], [2600, 0],
    ])
    const scale = property => track(property, [[0, .55], [550 + delay, 1], [1000, 1], [1450, .65], [1640, .65], [2160 + delay, 1], [2400, 1], [2600, 1]], 'absolute')
    parts.overrides[itemId(index)] = {
      geometry: { width, height, skewX },
      style: { color: index < 4 ? BLUE : index < 8 ? RED : INK },
      transform: { offsetX: x - 960, offsetY: y - 540 },
      tracks: [movement('transform.x', dx), movement('transform.y', dy), scale('transform.scaleX'), scale('transform.scaleY'),
        track('transform.rotation', [[0, -angle], [550 + delay, 0], [1000, 0], [1450, angle], [1640, angle], [2160 + delay, 0], [2600, 0]], 'absolute')],
    }
  })
  return transition('basic-d-assembly', 'D：変形 · 分解・再構築', 2600, 1300, [parts])
}

const transitions = [grid(), partition(), overlap(), assembly()]
const components = ['TitleSlide', 'ContentSlide', 'ContentSlide', 'ContentSlide', 'ClosingSlide']
const project = { schemaVersion: 1, transitions, slides: components.map((component, index) => ({
  id: 'basic-slide-' + String(index + 1).padStart(3, '0'), component, transitionId: transitions[index]?.id ?? null,
})) }
const destination = new URL('../public/examples/', import.meta.url)
await mkdir(destination, { recursive: true })
await writeFile(new URL('basic-four-patterns.json', destination), serializeProject(project) + '\n')
console.log('public/examples/basic-four-patterns.json を生成しました（A〜Dの4演出・5スライド）。')
