import { SHAPE_LIMITS } from '../domain/shapes.js'
export const SHAPE_FIELDS = [
  ['geometry.width', '幅', 'px', 0, 1920], ['geometry.height', '高さ', 'px', 0, 1080], ['geometry.skewX', '傾斜', '°', -80, 80],
  ['transform.x', '画面の中心 X', 'px', 0, 1920], ['transform.y', '画面の中心 Y', 'px', 0, 1080],
  ['transform.rotation', '画面の回転', '°', -180, 180], ['transform.scaleX', '画面の X 倍率', '', -2, 2], ['transform.scaleY', '画面の Y 倍率', '', -2, 2],
  ['style.opacity', '不透明度', '', 0, 1], ['style.color', '色 (HEX)', '', 0, 1],
].map(([property, label, unit, sliderMin, sliderMax]) => ({ property, label, unit, sliderMin, sliderMax,
  ...(SHAPE_LIMITS[property.split('.')[1]] ?? {}), text: property === 'style.color',
  step: /scale|opacity/.test(property) ? 0.01 : 1 }))
export const fieldId = property => property.replace('.', '-')
export const labelFor = property => SHAPE_FIELDS.find(field => field.property === property)?.label ?? property
