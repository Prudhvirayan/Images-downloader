import express from 'express'
import { load as cheerioLoad } from 'cheerio'
import { existsSync } from 'fs'

const app = express()
app.use(express.json())

// In production, serve the built React frontend from dist/
// (dist/ is built by `npm run build` and lives next to server.js)
if (existsSync('dist')) {
  app.use(express.static('dist'))
}

const IMAGE_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg']
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?[^"']*)?$/i
const THUMB_RE = /thumb(nail)?|[\-_]sm[\-_]|[\-_]xs[\-_]|[\-_]icon|preview[\-_]|[\-_]small/i
const FULLSIZE_RE = /full(size|res)?|[\-_]large|[\-_]orig(inal)?|[\-_]hq|[\-_]hires|[\-_]big|photo(?!s)/i

// URL patterns that indicate junk images (icons, logos, ads, tracking)
const JUNK_URL_RE = /favicon|sprite|1x1|tracking|placeholder|blank|spacer|separator/i
// Checked against just the filename (last path segment)
const JUNK_FILENAME_RE = /logo|favicon|icon|sprite|banner|avatar|thumb-placeholder/i

// Detects WordPress/CDN thumbnail dimension suffixes: image-800x600.jpg, image_300x200.png
const WP_DIM_RE = /[-_](\d{2,4})[x×](\d{2,4})(?:-\w+)?\.(jpe?g|png|webp|gif)(\?.*)?$/i
const MIN_QUALITY_DIM = 600 // skip thumbnails smaller than this in any dimension

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

const THUMB_UPGRADE_RULES = [
  [/(\d+)t(\.[a-z]+)$/i, '$1$2'],
  [/[\-_]?thumb(\.[a-z]+)$/i, '$1'],
  [/[\-_]thumbnail(\.[a-z]+)$/i, '$1'],
  [/[\-_]small(\.[a-z]+)$/i, '$1'],
  [/[\-_]sm(\.[a-z]+)$/i, '$1'],
  [/[\-_](s|xs|xxs)(\.[a-z]+)$/i, '$2'],
  [/[\-_](150|200|300|400)(\.[a-z]+)$/i, '$2'],
]

function isImage(contentType) {
  return IMAGE_MIME_PREFIXES.some((p) => contentType?.toLowerCase().startsWith(p))
}

function resolveUrl(src, base) {
  if (!src || src.startsWith('data:')) return null
  try { return new URL(src, base).href } catch { return null }
}

function scoreUrl(url) {
  let s = 0
  if (IMAGE_EXT_RE.test(url)) s += 5
  if (FULLSIZE_RE.test(url)) s += 10
  if (THUMB_RE.test(url)) s -= 15
  if (JUNK_URL_RE.test(url)) s -= 30
  return s
}

async function upgradeThumbnail(url, referer) {
  const urlObj = new URL(url)
  const pathname = urlObj.pathname

  for (const [pattern, replacement] of THUMB_UPGRADE_RULES) {
    if (!pattern.test(pathname)) continue
    const newPathname = pathname.replace(pattern, replacement)
    if (newPathname === pathname) continue

    urlObj.pathname = newPathname
    const upgraded = urlObj.href

    try {
      const res = await fetch(upgraded, {
        method: 'HEAD',
        headers: { ...BROWSER_HEADERS, Referer: referer },
        redirect: 'follow',
      })
      if (res.ok && isImage(res.headers.get('content-type') || '')) return upgraded
    } catch {}
  }

  return url
}

// Extract the single best image from a page (used by the download proxy)
function extractImageFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)

  for (const sel of [
    'meta[property="og:image"]', 'meta[property="og:image:url"]',
    'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]',
  ]) {
    const val = $(sel).first().attr('content')
    const resolved = resolveUrl(val, pageUrl)
    if (resolved) return resolved
  }

  const candidates = []

  $('img, source').each((_, el) => {
    const $el = $(el)
    for (const attr of ['src', 'data-src', 'data-lazy', 'data-original', 'data-full']) {
      const raw = $el.attr(attr)
      const url = resolveUrl(raw, pageUrl)
      if (!url) continue
      const w = parseInt($el.attr('width') || '0', 10)
      const h = parseInt($el.attr('height') || '0', 10)
      candidates.push({ url, score: scoreUrl(url) + (w * h > 0 ? Math.log(w * h + 1) * 2 : 0) })
      break
    }

    const srcset = $el.attr('srcset') || $el.attr('data-srcset') || ''
    if (srcset) {
      let bestW = 0, bestSrc = null
      for (const part of srcset.split(',').map((s) => s.trim())) {
        const [rawUrl, descriptor] = part.split(/\s+/)
        const w = descriptor ? parseFloat(descriptor) : 0
        if (w > bestW) { bestW = w; bestSrc = rawUrl }
      }
      const url = resolveUrl(bestSrc, pageUrl)
      if (url) candidates.push({ url, score: scoreUrl(url) + bestW / 100 })
    }
  })

  if (!candidates.length) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].url
}

// Strip WordPress/CDN size suffix to get the base image identity for deduplication
function getBaseUrl(url) {
  return url.replace(WP_DIM_RE, '.$3')
}

// Extract ALL candidate images from a page (used by /api/scan)
function extractAllImagesFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)
  const seen = new Set()
  const images = []

  function addCandidate(raw, w = 0, h = 0) {
    const url = resolveUrl(raw, pageUrl)
    if (!url || seen.has(url)) return
    if (JUNK_URL_RE.test(url)) return
    const filename = url.split('/').pop().split('?')[0]
    if (JUNK_FILENAME_RE.test(filename)) return

    // Skip images with explicit tiny HTML dimensions
    if ((w > 0 && w < 200) || (h > 0 && h < 200)) return

    // Detect embedded dimension suffix (e.g. -300x200.jpg) and skip low-res thumbnails
    const dimMatch = WP_DIM_RE.exec(url)
    if (dimMatch) {
      const dw = parseInt(dimMatch[1], 10)
      const dh = parseInt(dimMatch[2], 10)
      if (Math.max(dw, dh) < MIN_QUALITY_DIM) return // thumbnail — skip
    }

    seen.add(url)
    const area = w * h
    // Images with detected large dimensions or no suffix (original) score higher
    const dimBonus = dimMatch ? Math.log(Math.max(parseInt(dimMatch[1]), parseInt(dimMatch[2])) + 1) : 12
    images.push({ url, score: scoreUrl(url) + dimBonus + (area > 0 ? Math.log(area + 1) : 0) })
  }

  $('img, source').each((_, el) => {
    const $el = $(el)
    const w = parseInt($el.attr('width') || '0', 10)
    const h = parseInt($el.attr('height') || '0', 10)

    for (const attr of ['src', 'data-src', 'data-lazy', 'data-original', 'data-full', 'data-image']) {
      const raw = $el.attr(attr)
      if (raw && IMAGE_EXT_RE.test(raw)) { addCandidate(raw, w, h); break }
    }

    const srcset = $el.attr('srcset') || $el.attr('data-srcset') || ''
    if (srcset) {
      let bestW = 0, bestSrc = null
      for (const part of srcset.split(',').map((s) => s.trim())) {
        const [rawUrl, descriptor] = part.split(/\s+/)
        const dw = descriptor ? parseFloat(descriptor) : 0
        if (dw > bestW) { bestW = dw; bestSrc = rawUrl }
      }
      if (bestSrc && IMAGE_EXT_RE.test(bestSrc)) addCandidate(bestSrc, w, h)
    }
  })

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (href && IMAGE_EXT_RE.test(href) && !JUNK_URL_RE.test(href)) {
      addCandidate(href)
    }
  })

  // Deduplicate by base URL — collapses WordPress multi-size variants into one
  // e.g. photo-300x200.jpg, photo-1080x720.jpg, photo.jpg → keeps best-scored one
  const byBase = new Map()
  for (const img of images) {
    const base = getBaseUrl(img.url)
    if (!byBase.has(base) || img.score > byBase.get(base).score) {
      byBase.set(base, img)
    }
  }

  const deduped = Array.from(byBase.values())
  deduped.sort((a, b) => b.score - a.score)
  return deduped.map((i) => i.url)
}

async function fetchImageFromUrl(targetUrl) {
  const parsed = new URL(targetUrl)
  const referer = parsed.origin + '/'
  const headers = { ...BROWSER_HEADERS, Referer: referer, Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8' }

  const response = await fetch(targetUrl, { headers, redirect: 'follow' })
  if (!response.ok) return { ok: false, status: response.status }

  const contentType = response.headers.get('content-type') || ''

  // Direct image — try thumbnail upgrade before returning
  if (isImage(contentType)) {
    const upgraded = await upgradeThumbnail(targetUrl, referer)
    if (upgraded !== targetUrl) {
      try {
        const upgRes = await fetch(upgraded, {
          headers: { ...BROWSER_HEADERS, Accept: 'image/*', Referer: referer },
          redirect: 'follow',
        })
        if (upgRes.ok && isImage(upgRes.headers.get('content-type') || '')) {
          const buffer = await upgRes.arrayBuffer()
          return { ok: true, buffer, contentType: upgRes.headers.get('content-type'), imageUrl: upgraded }
        }
      } catch {}
    }
    const buffer = await response.arrayBuffer()
    return { ok: true, buffer, contentType, imageUrl: targetUrl }
  }

  // HTML page — extract single best image
  if (contentType.includes('text/html') || contentType.includes('text/xml') || contentType.includes('application/xhtml')) {
    const html = await response.text()
    let imageUrl = extractImageFromHtml(html, targetUrl)
    if (!imageUrl) return { ok: false, status: 422, message: 'Could not find an image in this page' }

    imageUrl = await upgradeThumbnail(imageUrl, referer)

    const imgRes = await fetch(imageUrl, {
      headers: { ...BROWSER_HEADERS, Accept: 'image/*,*/*;q=0.8', Referer: referer },
      redirect: 'follow',
    })
    if (!imgRes.ok) return { ok: false, status: imgRes.status, message: `Image HTTP ${imgRes.status}` }
    const imgCT = imgRes.headers.get('content-type') || 'image/jpeg'
    const buffer = await imgRes.arrayBuffer()
    return { ok: true, buffer, contentType: imgCT, imageUrl }
  }

  return { ok: false, status: 415, message: `Unexpected content-type: ${contentType}` }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url parameter')

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).send('Invalid URL') }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Only HTTP/HTTPS URLs allowed')

  try {
    const result = await fetchImageFromUrl(url)
    if (!result.ok) return res.status(result.status ?? 500).send(result.message ?? 'Fetch failed')
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('X-Image-Url', encodeURIComponent(result.imageUrl))
    res.send(Buffer.from(result.buffer))
  } catch (err) {
    console.error(`Proxy error for ${url}:`, err.message)
    res.status(500).send(`Error: ${err.message}`)
  }
})

// Scan a page URL and return all image URLs found on it
app.get('/api/scan', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Only HTTP/HTTPS URLs allowed' })

  try {
    const referer = parsed.origin + '/'
    const headers = { ...BROWSER_HEADERS, Referer: referer, Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8' }
    const response = await fetch(url, { headers, redirect: 'follow' })

    if (!response.ok) return res.status(response.status).json({ error: `HTTP ${response.status}` })

    const contentType = response.headers.get('content-type') || ''

    // URL itself is a direct image — return as single item
    if (isImage(contentType)) {
      return res.json({ images: [url], count: 1, direct: true })
    }

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await response.text()
      const images = extractAllImagesFromHtml(html, url)
      return res.json({ images, count: images.length })
    }

    return res.status(415).json({ error: `Cannot scan content-type: ${contentType}` })
  } catch (err) {
    console.error('Scan error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
