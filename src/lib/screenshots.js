// Prepares screenshots for upload with the evaluation. Apps Script limits how
// large a request can be, so images over KEEP_ORIGINAL_BYTES are resized to at
// most MAX_DIMENSION pixels on their longest side and re-encoded as JPEG,
// which keeps text in screenshots readable at a fraction of the size. The
// backend checks the same count and size limits.

export const MAX_SCREENSHOTS = 10
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024
export const MAX_TOTAL_SCREENSHOT_BYTES = 15 * 1024 * 1024

const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024
const MAX_DIMENSION = 2560
const JPEG_QUALITY = 0.85

export class ScreenshotError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ScreenshotError'
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ScreenshotError('could not be opened as an image'))
    img.src = url
  })
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1))
    reader.onerror = () => reject(new ScreenshotError('could not be read'))
    reader.readAsDataURL(blob)
  })
}

async function resizeToJpeg(img) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  // JPEG has no transparency; a white background keeps transparent areas readable.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new ScreenshotError('could not be resized')
  return blob
}

/**
 * Returns { id, name, type, size, data, previewUrl } for an image file, where
 * data is base64 and previewUrl is an object URL the caller must revoke.
 * Throws ScreenshotError with a reason that reads after the file name.
 */
export async function prepareScreenshot(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new ScreenshotError('is not a PNG, JPEG, or WebP image')

  const previewUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(previewUrl)
    const blob = file.size > KEEP_ORIGINAL_BYTES ? await resizeToJpeg(img) : file
    if (blob.size > MAX_SCREENSHOT_BYTES) throw new ScreenshotError('is too large, even after resizing')
    return {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      name: file.name || 'Pasted image',
      type: blob.type,
      size: blob.size,
      data: await toBase64(blob),
      previewUrl,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error instanceof ScreenshotError ? error : new ScreenshotError('could not be processed')
  }
}
