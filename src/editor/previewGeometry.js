import { calculateShapeGeometry } from '../domain/shapeGeometry.js'
import { transformMatrix } from '../domain/transition/transform.js'
import { fitCanvas } from '../renderer/fitCanvas.js'

/** CSS pxから論理座標へ。DPRを掛けず、余白は選択対象にしない。 */
export function clientToLogical(x, y, bounds, allowOutside = false) {
  const fit = fitCanvas(bounds.width, bounds.height)
  if (!fit.scale || ![x, y, bounds.left, bounds.top].every(Number.isFinite)) return null
  const point = { x: (x - bounds.left - (bounds.width - fit.width) / 2) / fit.scale,
    y: (y - bounds.top - (bounds.height - fit.height) / 2) / fit.scale }
  if (!allowOutside && (point.x < 0 || point.y < 0 || point.x > 1920 || point.y > 1080)) return null
  return point
}
export function logicalToClient(point, bounds) {
  const fit = fitCanvas(bounds.width, bounds.height)
  return { x: bounds.left + (bounds.width - fit.width) / 2 + point.x * fit.scale,
    y: bounds.top + (bounds.height - fit.height) / 2 + point.y * fit.scale }
}
export function shapePoints(shape) {
  const vertices = calculateShapeGeometry(shape.geometry).positions
  const [a, b, c, d, x, y] = shape.worldMatrix ?? transformMatrix(shape.transform)
  return Array.from({ length: 4 }, (_, index) => ({ x: a * vertices[index * 3] + c * vertices[index * 3 + 1] + x,
    y: b * vertices[index * 3] + d * vertices[index * 3 + 1] + y }))
}
export function pointInQuad(points, point) {
  const crosses = points.map((a, index) => {
    const b = points[(index + 1) % 4]
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
  })
  const area = points.reduce((sum, a, index) => { const b = points[(index + 1) % 4]; return sum + a.x * b.y - b.x * a.y }, 0)
  return Math.abs(area) > 1e-8 && (crosses.every(value => value >= -1e-7) || crosses.every(value => value <= 1e-7))
}
export function hitShape(shapes, point) {
  return [...shapes].reverse().find(shape => shape.style.opacity > 0 && pointInQuad(shapePoints(shape), point)) ?? null
}

/** 単体は実際の四角形、Groupは子の外接枠。Groupの変形中心は契約どおり親の原点。 */
export function manipulationFrame(shapes, selection, context, scale) {
  if (!selection || !context || !scale) return null
  const group = !selection.itemId && context.layer.kind === 'group' && !context.itemId
  const targets = group ? shapes.filter(shape => shape.groupId === selection.layerId) : [context.current]
  if (!targets.length) return null
  let points = targets.flatMap(shapePoints)
  if (group) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    points = [{ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) }, { x: Math.min(...xs), y: Math.max(...ys) }]
  }
  const pivot = { x: context.values['transform.x'], y: context.values['transform.y'] }
  const top = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / 4, y: points.reduce((sum, p) => sum + p.y, 0) / 4 }
  const length = Math.hypot(top.x - center.x, top.y - center.y) || 1
  const pad = 8 / scale
  const rotate = { x: Math.min(1920 - pad, Math.max(pad, top.x + (top.x - center.x) / length * 28 / scale)),
    y: Math.min(1080 - pad, Math.max(pad, top.y + (top.y - center.y) / length * 28 / scale)) }
  return { points, pivot, top, rotate }
}
