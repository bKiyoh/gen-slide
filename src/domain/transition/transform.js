/**
 * [a,b,c,d,tx,ty] は x'=a*x+c*y+tx, y'=b*x+d*y+ty。
 * 図形中心で scale → 時計回りrotation → translation。
 * Group はローカル原点(0,0)をピボットとし、子の変換後に適用する。
 */
export function transformMatrix({ x, y, rotation, scaleX = 1, scaleY = 1 }) {
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y]
}

/** 非一様な親scaleと子rotationが作るせん断も保持し、角度の加算に近似しない。 */
export function composeShapeMatrix(transform, parentTransform) {
  const child = transformMatrix(transform)
  if (!parentTransform) return child
  const [a, b, c, d, x, y] = transformMatrix(parentTransform)
  const [e, f, g, h, u, v] = child
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h,
    a * u + c * v + x, b * u + d * v + y]
}
