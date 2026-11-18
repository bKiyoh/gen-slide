import {
  Color, OrthographicCamera, Scene, WebGPURenderer,
} from 'three/webgpu'
import { LOGICAL_SIZE, validateShape } from '../../domain/shapes.js'
import { fitCanvas } from '../fitCanvas.js'
import { createShapeMeshes } from './shapeMeshes.js'

/**
 * Vue からは init / updateShapes / dispose だけを呼ぶ。
 * Three.js インスタンスはこのクロージャー内に保持し、Vue のリアクティブ化を避ける。
 * @param {HTMLElement} container
 * @param {(status: {state: string, backend: string, message: string}) => void} onStatus
 */
export function createShapeRenderer(container, onStatus) {
  const scene = new Scene()
  scene.background = new Color('#f5f3ee')
  // left / right / top / bottom。カメラの投影だけで Y下向きを実現する。
  const camera = new OrthographicCamera(0, LOGICAL_SIZE.width, 0, LOGICAL_SIZE.height, 0.1, 100)
  camera.position.z = 10
  const shapeMeshes = createShapeMeshes(scene)
  let renderer = null
  let resizeObserver = null
  let initTask = null
  let releaseTask = null
  let disposed = false
  let failed = false
  let backend = '判定不能'

  function reportError(error) {
    failed = true
    if (!disposed) {
      onStatus({ state: 'error', backend, message: error instanceof Error ? error.message : String(error) })
    }
  }

  function render() {
    if (!disposed && !failed && renderer?.initialized) renderer.render(scene, camera)
  }

  function resize() {
    if (disposed || failed || !renderer?.initialized) return
    try {
      const { width, height } = fitCanvas(container.clientWidth, container.clientHeight)
      if (width === 0 || height === 0) return
      // CSS px と GPU の画素数は別。高DPIは最大2倍に制限してメモリー消費を抑える。
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height)
      render()
    } catch (error) {
      reportError(error)
    }
  }

  /** @param {import('../../domain/shapes.js').Shape[]} shapes */
  function updateShapes(shapes) {
    // 全件の検証を終えてから Scene に反映。不正な入力では直前の描画を維持する。
    const ids = new Set()
    for (const shape of shapes) {
      const errors = validateShape(shape)
      if (errors.length) throw new RangeError(errors.join('\n'))
      if (ids.has(shape.id)) throw new RangeError('Duplicate shape ID')
      ids.add(shape.id)
    }
    if (disposed || failed || !renderer?.initialized) return

    shapeMeshes.update(shapes)
    render()
  }

  function detach() {
    resizeObserver?.disconnect()
    resizeObserver = null
    window.removeEventListener('resize', resize)
    renderer?.domElement.remove()
  }

  function releaseResources() {
    if (releaseTask) return releaseTask
    releaseTask = (async () => {
      detach()
      shapeMeshes.dispose()
      scene.clear()
      if (renderer) {
        // dispose後の contextlost / device lost 通知で Vue を更新しない。
        renderer.onDeviceLost = () => {}
        renderer.onError = () => {}
        if (renderer.initialized) {
          // r187 の dispose() は非同期。内部 RAF とバックエンドのリソースも解放する。
          await renderer.dispose()
        } else if (renderer.backend.isWebGPUBackend && renderer.backend.device) {
          await renderer.backend.dispose()
        } else if (renderer.backend.isWebGLBackend && renderer.backend.gl) {
          // r187 の renderer.dispose() は失敗済み init() を再awaitして例外になるため、
          // 部分初期化時に確保できたコンテキストはバックエンドから解放する。
          await renderer.backend.dispose()
        }
        renderer = null
      }
    })().catch(error => {
      console.error('描画リソースの解放に失敗しました。', error)
      renderer = null
    })
    return releaseTask
  }

  /** 初期化中の破棄はフラグで記録し、await の後に一度だけ後始末する。
   * @param {import('../../domain/shapes.js').Shape[]} shapes
   */
  function init(shapes) {
    if (initTask || disposed) return initTask ?? Promise.resolve()
    onStatus({ state: 'initializing', backend, message: '描画バックエンドを初期化しています。' })
    initTask = (async () => {
      try {
        // バックエンド選択・フォールバックは Three.js に任せる。
        renderer = new WebGPURenderer({ antialias: true })
        renderer.onDeviceLost = info => reportError(`描画デバイスを利用できなくなりました: ${info.message}`)
        renderer.onError = info => reportError(`GPU 描画エラー: ${info.message}`)
        await renderer.init()
        if (disposed) return

        // r187 の公式ソースで確認済み。init前はまだフォールバックしていないので判定しない。
        if (renderer.backend.isWebGPUBackend === true) backend = 'WebGPU'
        else if (renderer.backend.isWebGLBackend === true) backend = 'WebGL2'

        renderer.domElement.setAttribute('aria-label', '図形のプレビュー')
        renderer.domElement.setAttribute('role', 'img')
        container.appendChild(renderer.domElement)
        updateShapes(shapes)
        resize()
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(container)
        window.addEventListener('resize', resize)
        if (!failed) {
          onStatus({
            state: 'ready', backend,
            message: backend === 'WebGPU' ? 'WebGPU で描画しています。'
              : backend === 'WebGL2' ? 'WebGPU が利用できないため、Three.js が WebGL 2 にフォールバックしました。'
                : '初期化は完了しましたが、既知のバックエンド識別フラグを確認できませんでした。',
          })
        }
      } catch (error) {
        reportError(error)
        await releaseResources()
      } finally {
        if (disposed) await releaseResources()
      }
    })()
    return initTask
  }

  function dispose() {
    disposed = true
    detach()
    // Vue のアンマウント自体は待たせず、GPU初期化の決着後も必ず解放する。
    return (async () => {
      await initTask
      await releaseResources()
    })()
  }

  return { init, updateShapes, dispose }
}
