import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitCanvas } from '../src/renderer/fitCanvas.js'

test('横長コンテナでは左右に余白を残す', () => {
  assert.deepEqual(fitCanvas(1000, 450), { width: 800, height: 450, scale: 800 / 1920 })
})

test('縦長コンテナでは上下に余白を残す', () => {
  assert.deepEqual(fitCanvas(960, 900), { width: 960, height: 540, scale: 0.5 })
})

test('高DPIでも論理座標に変更を加えずCSSサイズで等比フィットする', () => {
  assert.deepEqual(fitCanvas(1920, 1080), { width: 1920, height: 1080, scale: 1 })
  for (const [width, height] of [[390, 260], [1440, 560], [2500, 1000]]) {
    const fitted = fitCanvas(width, height)
    assert.ok(fitted.width <= width + 1e-9 && fitted.height <= height + 1e-9)
    assert.ok(Math.abs(fitted.width / fitted.height - 16 / 9) < 1e-9)
  }
})

test('非表示や不正なコンテナサイズは0として扱う', () => {
  for (const [width, height] of [[0, 400], [200, 0], [-1, 1], [NaN, 2], [2, Infinity]]) {
    assert.deepEqual(fitCanvas(width, height), { width: 0, height: 0, scale: 0 })
  }
})
