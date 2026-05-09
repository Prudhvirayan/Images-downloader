import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { getFilenameFromUrl } from './urlParser'

function getOptimalConcurrency() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn?.saveData || conn?.effectiveType === '2g') return 1
    if (conn?.effectiveType === '3g') return 2
  } catch {}
  if (/mobile|android|iphone|ipad/i.test(navigator.userAgent)) return 3
  return 6
}

async function fetchOne(url, signal) {
  try {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl, { signal })
    if (!res.ok) {
      const reason = await res.text().catch(() => `HTTP ${res.status}`)
      return { url, ok: false, reason: reason || `HTTP ${res.status}` }
    }
    const blob = await res.blob()
    // Server tells us the actual image URL (may differ from page URL when HTML was parsed)
    const imageUrl = res.headers.get('x-image-url')
      ? decodeURIComponent(res.headers.get('x-image-url'))
      : url
    return { url, ok: true, blob, imageUrl }
  } catch (err) {
    if (err.name === 'AbortError') return { url, ok: false, reason: 'Cancelled' }
    return { url, ok: false, reason: 'Network error' }
  }
}

export function fetchWithPool(urls, { onProgress, onResult, signal }) {
  return new Promise((resolve) => {
    const results = new Array(urls.length)
    let nextIndex = 0
    let inFlight = 0
    let completed = 0

    const CONCURRENCY = getOptimalConcurrency()
    function pump() {
      while (inFlight < CONCURRENCY && nextIndex < urls.length) {
        if (signal?.aborted) break
        const i = nextIndex++
        inFlight++
        fetchOne(urls[i], signal).then((result) => {
          results[i] = result
          inFlight--
          completed++
          onResult(i, result)
          onProgress(completed, urls.length)
          if (completed === urls.length) {
            resolve(results)
          } else {
            pump()
          }
        })
      }
    }

    if (urls.length === 0) {
      resolve([])
      return
    }

    pump()
  })
}

export async function buildAndDownloadZip(results, zipName = 'images.zip', onZipProgress) {
  const zip = new JSZip()
  const folder = zip.folder('images')

  const successful = results.filter((r) => r?.ok)
  if (successful.length === 0) return 0

  successful.forEach((r, i) => {
    // Use the actual image URL for filename (server extracts it from pages like .aspx)
    const filename = getFilenameFromUrl(r.imageUrl || r.url, i)
    folder.file(filename, r.blob)
  })

  const blob = await zip.generateAsync(
    { type: 'blob' },
    onZipProgress ? (meta) => onZipProgress(Math.round(meta.percent)) : undefined
  )
  saveAs(blob, zipName)
  return successful.length
}
