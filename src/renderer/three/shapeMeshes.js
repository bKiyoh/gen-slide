import { DoubleSide, Mesh, MeshBasicMaterial } from 'three/webgpu'
import { createShapeGeometry, updateShapeGeometry } from './geometryFactory.js'

/** SceneのMeshだけを管理。Generator等の規則は扱わない。GPU初期化なしでも検証できる。 */
export function createShapeMeshes(scene) {
  const meshes = new Map()

  function remove(id, mesh) {
    scene.remove(mesh)
    mesh.geometry.dispose()
    mesh.material.dispose()
    meshes.delete(id)
  }

  function update(shapes) {
    const ids = new Set(shapes.map(shape => shape.id))
    for (const [id, mesh] of meshes) if (!ids.has(id)) remove(id, mesh)
    shapes.forEach((shape, index) => {
      let mesh = meshes.get(shape.id)
      if (!mesh) {
        const material = new MeshBasicMaterial({
          side: DoubleSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
        })
        material.forceSinglePass = true
        mesh = new Mesh(createShapeGeometry(shape.geometry), material)
        mesh.name = shape.id
        meshes.set(shape.id, mesh)
        scene.add(mesh)
      } else updateShapeGeometry(mesh.geometry, shape.geometry)

      if (shape.worldMatrix) {
        const [a, b, c, d, x, y] = shape.worldMatrix
        // r187 Matrix4.setは行優先。評価済みの親×子変換を一度だけ反映する。
        mesh.matrixAutoUpdate = false
        mesh.matrix.set(a, c, 0, x, b, d, 0, y, 0, 0, 1, 0, 0, 0, 0, 1)
        mesh.matrixWorldNeedsUpdate = true
      } else {
        // Phase 0 のプレーンなShapeも従来どおり描画できる。
        mesh.matrixAutoUpdate = true
        mesh.position.set(shape.transform.x, shape.transform.y, 0)
        mesh.rotation.z = shape.transform.rotation * Math.PI / 180
        mesh.scale.set(shape.transform.scaleX ?? 1, shape.transform.scaleY ?? 1, 1)
      }
      mesh.material.color.set(shape.style.color)
      mesh.material.opacity = shape.style.opacity
      mesh.renderOrder = index
    })
  }

  function dispose() {
    for (const [id, mesh] of meshes) remove(id, mesh)
  }

  return { update, dispose }
}
