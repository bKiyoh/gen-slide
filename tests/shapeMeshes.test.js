import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene, Vector3 } from 'three/webgpu'
import { createShapeMeshes } from '../src/renderer/three/shapeMeshes.js'
import { createSampleShapes } from '../src/domain/shapes.js'
import { resolveStaticShapes } from '../src/domain/transition/resolveStaticShapes.js'
import { createSampleTransition } from '../src/domain/transition/sampleTransition.js'

test('Mesh同期: IDで再利用、未変更頂点は更新せず、色/形状変更と配列順を反映', () => {
  const scene = new Scene()
  const meshes = createShapeMeshes(scene)
  const transition = createSampleTransition()
  const shapes = resolveStaticShapes(transition).shapes
  meshes.update(shapes)
  const mesh = scene.children[1]
  const geometry = mesh.geometry
  const material = mesh.material
  const attribute = geometry.getAttribute('position')
  const version = attribute.version
  shapes[1].style.color = '#123456'
  meshes.update(shapes)
  assert.equal(scene.children[1], mesh)
  assert.equal(mesh.material, material)
  assert.equal(mesh.geometry, geometry)
  assert.equal(attribute.version, version)
  assert.equal(material.color.getHexString(), '123456')
  shapes[1].geometry.width += 100
  meshes.update(shapes)
  assert.ok(attribute.version > version)
  assert.equal(geometry.getAttribute('position'), attribute)
  meshes.update([...shapes].reverse())
  assert.equal(mesh.renderOrder, shapes.length - 2)
  meshes.dispose()
})

test('Mesh削除/停止: 不要なGeometryとMaterialを一度だけ解放し、再追加できる', () => {
  const scene = new Scene()
  const meshes = createShapeMeshes(scene)
  const shapes = createSampleShapes()
  meshes.update(shapes)
  const removed = scene.children[1]
  const retained = scene.children[0]
  let releasedGeometry = 0
  let releasedMaterial = 0
  for (const mesh of [...scene.children]) {
    mesh.geometry.addEventListener('dispose', () => releasedGeometry++)
    mesh.material.addEventListener('dispose', () => releasedMaterial++)
  }
  meshes.update([shapes[0]])
  assert.equal(releasedGeometry, 1)
  assert.equal(releasedMaterial, 1)
  assert.equal(scene.children[0], retained)
  meshes.update(shapes)
  assert.notEqual(scene.children[1], removed)
  meshes.dispose()
  meshes.dispose()
  assert.equal(scene.children.length, 0)
  assert.equal(releasedGeometry, 2)
  assert.equal(releasedMaterial, 2)
})

test('Mesh行列: 評価済み親子変換を一度だけ適用し、Phase 0へ切替可能', () => {
  const scene = new Scene()
  const meshes = createShapeMeshes(scene)
  const transition = createSampleTransition()
  transition.layers[1].transform = { x: 100, y: 200, rotation: 90, scaleX: 2, scaleY: 3 }
  const shapes = resolveStaticShapes(transition).shapes
  meshes.update(shapes)
  scene.updateMatrixWorld()
  const mesh = scene.children[1]
  const center = new Vector3().applyMatrix4(mesh.matrixWorld)
  assert.ok(Math.abs(center.x + 1040) < 1e-9)
  assert.ok(Math.abs(center.y - 600) < 1e-9)
  assert.equal(mesh.matrixAutoUpdate, false)
  const phaseZero = { ...createSampleShapes()[0], id: shapes[1].id }
  meshes.update([phaseZero])
  scene.updateMatrixWorld()
  assert.equal(mesh.matrixAutoUpdate, true)
  assert.equal(mesh.matrixWorld.elements[12], 560)
  assert.equal(mesh.matrixWorld.elements[13], 540)
  meshes.dispose()
})
