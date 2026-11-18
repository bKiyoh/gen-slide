import { LOGICAL_SIZE } from '../domain/shapes.js'

/** 論理座標を変えず、コンテナ内に等比で収める。余白はコンテナ側に残す。 */
export function fitCanvas(containerWidth, containerHeight) {
  if (![containerWidth, containerHeight].every(value => Number.isFinite(value) && value > 0)) {
    return { width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(containerWidth / LOGICAL_SIZE.width, containerHeight / LOGICAL_SIZE.height)
  return { width: LOGICAL_SIZE.width * scale, height: LOGICAL_SIZE.height * scale, scale }
}
