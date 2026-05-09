// Shared logic used by both /api/proxy and /api/scan
import { load as cheerioLoad } from 'cheerio'

export const IMAGE_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg']
export const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?[^"']*)?$/i
const THUMB_RE   = /thumb(nail)?|[\-_]sm[\-_]|[\-_]xs[\-_]|[\-_]icon|preview[\-_]|[\-_]small/i
const FULLSIZE_RE = /full(size|res)?|[\-_]large|[\-_]orig(inal)?|[\-_]hq|[\-_]hires|[\-_]big|photo(?!s)/i
const JUNK_URL_RE      = /favicon|sprite|1x1|tracking|placeholder|blank|spacer|separator/i
const JUNK_FILENAME_RE = /logo|favicon|icon|sprite|banner|avatar|thumb-placeholder/i

export const BROWSER_HEADERS = {
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

export function isImage(contentType) {
  return IMAGE_MIME_PREFIXES.some(p => contentType?.toLowerCase().startsWith(p))
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
      const res = await fetch(upgraded, { method: 'HEAD', headers: { ...BROWSER_HEADERS, Referer: referer }, redirect: 'follow' })
      if (res.ok && isImage(res.headers.get('content-type') || '')) return upgraded
    } catch {}
  }
  return url
}

function extractImageFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)
  for (const sel of ['meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']) {
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
      for (const part of srcset.split(',').map(s => s.trim())) {
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

export function extractAllImagesFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)
  const seen = new Set()
  const images = []

  function addCandidate(raw, w = 0, h = 0) {
    const url = resolveUrl(raw, pageUrl)
    if (!url || seen.has(url)) return
    if (JUNK_URL_RE.test(url)) return
    const filename = url.split('/').pop().split('?')[0]
    if (JUNK_FILENAME_RE.test(filename)) return
    if ((w > 0 && w < 80) || (h > 0 && h < 80)) return
    seen.add(url)
    images.push({ url, score: scoreUrl(url) + (w * h > 0 ? Math.log(w * h + 1) : 0) })
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
      for (const part of srcset.split(',').map(s => s.trim())) {
        const [rawUrl, descriptor] = part.split(/\s+/)
        const dw = descriptor ? parseFloat(descriptor) : 0
        if (dw > bestW) { bestW = dw; bestSrc = rawUrl }
      }
      if (bestSrc && IMAGE_EXT_RE.test(bestSrc)) addCandidate(bestSrc, w, h)
    }
  })

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (href && IMAGE_EXT_RE.test(href) && !JUNK_URL_RE.test(href)) addCandidate(href)
  })

  images.sort((a, b) => b.score - a.score)
  return images.map(i => i.url)
}

export async function fetchImageFromUrl(targetUrl) {
  const parsed = new URL(targetUrl)
  const referer = parsed.origin + '/'
  const headers = { ...BROWSER_HEADERS, Referer: referer, Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8' }

  const response = await fetch(targetUrl, { headers, redirect: 'follow' })
  if (!response.ok) return { ok: false, status: response.status }

  const contentType = response.headers.get('content-type') || ''

  if (isImage(contentType)) {
    const upgraded = await upgradeThumbnail(targetUrl, referer)
    if (upgraded !== targetUrl) {
      try {
        const upgRes = await fetch(upgraded, { headers: { ...BROWSER_HEADERS, Accept: 'image/*', Referer: referer }, redirect: 'follow' })
        if (upgRes.ok && isImage(upgRes.headers.get('content-type') || '')) {
          const buffer = await upgRes.arrayBuffer()
          return { ok: true, buffer, contentType: upgRes.headers.get('content-type'), imageUrl: upgraded }
        }
      } catch {}
    }
    const buffer = await response.arrayBuffer()
    return { ok: true, buffer, contentType, imageUrl: targetUrl }
  }

  if (contentType.includes('text/html') || contentType.includes('text/xml') || contentType.includes('application/xhtml')) {
    const html = await response.text()
    let imageUrl = extractImageFromHtml(html, targetUrl)
    if (!imageUrl) return { ok: false, status: 422, message: 'Could not find an image in this page' }
    imageUrl = await upgradeThumbnail(imageUrl, referer)
    const imgRes = await fetch(imageUrl, { headers: { ...BROWSER_HEADERS, Accept: 'image/*,*/*;q=0.8', Referer: referer }, redirect: 'follow' })
    if (!imgRes.ok) return { ok: false, status: imgRes.status, message: `Image HTTP ${imgRes.status}` }
    const imgCT = imgRes.headers.get('content-type') || 'image/jpeg'
    const buffer = await imgRes.arrayBuffer()
    return { ok: true, buffer, contentType: imgCT, imageUrl }
  }

  return { ok: false, status: 415, message: `Unexpected content-type: ${contentType}` }
}
