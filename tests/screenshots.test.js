import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareScreenshot } from '../src/lib/screenshots.js'

// jsdom cannot decode images or draw on a canvas, so those browser APIs are
// replaced with small fakes that record how they were used.
let imageSize
let imageFails
let canvas

beforeEach(() => {
  imageSize = { naturalWidth: 1200, naturalHeight: 800 }
  imageFails = false
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'Image',
    class {
      set src(_url) {
        Object.assign(this, imageSize)
        queueMicrotask(() => (imageFails ? this.onerror() : this.onload()))
      }
    },
  )
  canvas = {
    width: 0,
    height: 0,
    ctx: { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' },
    getContext() {
      return this.ctx
    },
    toBlob: vi.fn((cb, type) => cb(new Blob(['resized'], { type }))),
  }
  const createElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : createElement(tag)))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('prepareScreenshot', () => {
  it('keeps a small image as it is and encodes it as base64', async () => {
    const file = new File(['hello'], 'shot.png', { type: 'image/png' })
    const result = await prepareScreenshot(file)
    expect(result).toMatchObject({ name: 'shot.png', type: 'image/png', size: 5, data: btoa('hello'), previewUrl: 'blob:preview' })
    expect(canvas.toBlob).not.toHaveBeenCalled()
  })

  it('resizes a large image to at most 2560 pixels and re-encodes it as JPEG', async () => {
    imageSize = { naturalWidth: 5120, naturalHeight: 2880 }
    const file = new File([new Uint8Array(2 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    const result = await prepareScreenshot(file)
    expect([canvas.width, canvas.height]).toEqual([2560, 1440])
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85)
    expect(canvas.ctx.fillStyle).toBe('#ffffff')
    expect(result).toMatchObject({ type: 'image/jpeg', data: btoa('resized') })
  })

  it('rejects unsupported file types without reading them', async () => {
    await expect(prepareScreenshot(new File(['x'], 'a.gif', { type: 'image/gif' }))).rejects.toThrow(/not a PNG, JPEG, or WebP/)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects a file that cannot be decoded and releases its preview URL', async () => {
    imageFails = true
    await expect(prepareScreenshot(new File(['x'], 'broken.png', { type: 'image/png' }))).rejects.toThrow(/could not be opened/)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
})
