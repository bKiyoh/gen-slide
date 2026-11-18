import { createSampleShapes } from '../shapes.js'

/**
 * @typedef {Object} ShapeGroup
 * @property {string} id
 * @property {'group'} kind
 * @property {{geometry: import('../shapes.js').Shape['geometry'], style: import('../shapes.js').Shape['style'], transform: import('../shapes.js').Shape['transform']}} template
 * @property {Object} generator linear / grid の配置パラメーター
 * @property {Object[]} modifiers 登録順に適用する規則
 * @property {import('../shapes.js').Shape['transform']} transform 親変換
 * @property {Array} tracks Phase 1では未評価
 * @property {{staggerMs: number, tracks: Array}} childAnimation Phase 1では未評価
 * @property {Object<string, Object>} overrides item-000等をキーとする差分
 */

/** Phase 1 の独立したデモ。Phase 0 のサンプルはそのまま残す。 */
export function createSampleTransition() {
  return {
    id: 'transition-001', name: 'Static generation', durationMs: 1200, switchAtMs: 600,
    layers: [
      { ...createSampleShapes()[0], id: 'background-shape',
        geometry: { type: 'rectangle', width: 1640, height: 760, skewX: 0 },
        style: { color: '#182436', opacity: 1 },
        transform: { x: 960, y: 540, rotation: 0, scaleX: 1, scaleY: 1 } },
      {
        id: 'group-001', kind: 'group',
        template: {
          geometry: { type: 'parallelogram', width: 100, height: 220, skewX: 24 },
          style: { color: '#FF0000', opacity: 1 },
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        },
        generator: { type: 'linear', count: 10, startX: 200, startY: 380, stepX: 165, stepY: 35 },
        modifiers: [
          { property: 'style.color', type: 'alternate', values: ['#FF0000', '#0000FF'] },
          { property: 'geometry.width', type: 'linear', from: 50, to: 200 },
        ],
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        tracks: [], childAnimation: { staggerMs: 0, tracks: [] },
        overrides: { 'item-002': { style: { color: '#FFFFFF' }, transform: { offsetX: 40 }, tracks: [] } },
      },
    ],
  }
}

export function createSampleGridGenerator() {
  return { type: 'grid', rows: 3, columns: 4, startX: 300, startY: 270,
    gapX: 400, gapY: 270, rowOffsetX: 30, columnOffsetY: 10 }
}
