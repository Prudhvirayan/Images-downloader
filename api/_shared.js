// Shared logic used by both /api/proxy and /api/scan
import { load as cheerioLoad } from 'cheerio'

export const IMAGE_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg']
export const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?[^"']*)?$/i
const THUMB_RE   = /thumb(nail)?|[\-_]sm[\-_]|[\-_]xs[\-_]|[\-_]icon|preview[\-_]|[\-_]small/i
const FULLSIZE_RE = /full(size|res)?|[\-_]large|[\-_]orig(inal)?|[\-_]hq|[\-_]hires|[\-_]big|photo(?!s)/i
const JUNK_URL_RE      = /favicon|sprite|1x1|tracking|placeholder|blank|spacer|separator/i
const JUNK_FILENAME_RE = /logo|favicon|icon|sprite|banner|avatar|thumb-placeholder/i
const ASSET_PATH_RE    = /\/webruntime\/|\/org-asset\/|\/_next\/static\/|\/node_modules\//i
const WP_DIM_RE        = /[-_](\d{2,4})[x×](\d{2,4})(?:-\w+)?\.(jpe?g|png|webp|gif)(\?.*)?$/i
const MIN_QUALITY_DIM  = 600
const VIDEO_EXT_RE     = /\.(mp4|webm|mov|m4v)(\?[^"']*)?$/i

export const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
}

export function httpErrorMessage(status) {
  return {
    401: 'Login required — this page is not publicly accessible.',
    403: 'Access blocked — this website prevents direct downloading. Try opening the URL in your browser.',
    404: 'Not found — the image or page doesn\'t exist at this URL.',
    429: 'Too many requests — wait a moment, then try again.',
    500: 'Server error — the website had an internal error.',
    503: 'Service unavailable — the website may be down or overloaded.',
  }[status] || `HTTP ${status} error.`
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
  if (ASSET_PATH_RE.test(url)) s -= 25
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

function getBaseUrl(url) {
  return url.replace(WP_DIM_RE, '.$3')
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
    if ((w > 0 && w < 200) || (h > 0 && h < 200)) return

    const dimMatch = WP_DIM_RE.exec(url)
    if (dimMatch) {
      const dw = parseInt(dimMatch[1], 10)
      const dh = parseInt(dimMatch[2], 10)
      if (Math.max(dw, dh) < MIN_QUALITY_DIM) return
    }

    seen.add(url)
    const area = w * h
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

  const byBase = new Map()
  for (const img of images) {
    const base = getBaseUrl(img.url)
    if (!byBase.has(base) || img.score > byBase.get(base).score) {
      byBase.set(base, img)
    }
  }

  const deduped = Array.from(byBase.values())
  deduped.sort((a, b) => b.score - a.score)
  return deduped  // {url: string, score: number}[]
}

export function extractVideosFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)
  const seen = new Set()
  const videos = []

  $('video').each((_, el) => {
    const $el = $(el)
    const src = resolveUrl($el.attr('src'), pageUrl)
    if (src && !seen.has(src)) { seen.add(src); videos.push({ platform: 'direct', url: src, directUrl: src }) }
    $el.find('source[src]').each((__, s) => {
      const u = resolveUrl($(s).attr('src'), pageUrl)
      if (u && !seen.has(u)) { seen.add(u); videos.push({ platform: 'direct', url: u, directUrl: u }) }
    })
  })

  $('a[href]').each((_, el) => {
    const u = resolveUrl($(el).attr('href'), pageUrl)
    if (u && VIDEO_EXT_RE.test(u) && !seen.has(u)) {
      seen.add(u); videos.push({ platform: 'direct', url: u, directUrl: u })
    }
  })

  $('[class*="wistia_async_"]').each((_, el) => {
    const m = ($(el).attr('class') || '').match(/wistia_async_([a-zA-Z0-9]+)/)
    if (m && !seen.has(m[1])) {
      seen.add(m[1])
      videos.push({ platform: 'wistia', url: `https://home.wistia.com/medias/${m[1]}`, wistiaHash: m[1] })
    }
  })

  const wRe = /wistia\.(?:com|net)\/(?:embed\/(?:medias|iframe)|medias)\/([a-zA-Z0-9]+)/g
  let wm
  while ((wm = wRe.exec(html)) !== null) {
    if (!seen.has(wm[1])) {
      seen.add(wm[1])
      videos.push({ platform: 'wistia', url: `https://home.wistia.com/medias/${wm[1]}`, wistiaHash: wm[1] })
    }
  }

  for (const [sel, platform] of [
    ['iframe[src*="youtube.com/embed"], iframe[src*="youtu.be"]', 'youtube'],
    ['iframe[src*="player.vimeo.com"]', 'vimeo'],
    ['iframe[src*="loom.com/embed"]', 'loom'],
    ['iframe[src*="wistia.com"], iframe[src*="wistia.net"]', 'wistia'],
  ]) {
    $(sel).each((_, el) => {
      const src = $(el).attr('src') || ''
      if (!src) return
      if (platform === 'wistia') {
        const hm = src.match(/embed\/(?:iframe|medias)\/([a-zA-Z0-9]+)/)
        const hash = hm?.[1]
        if (hash && seen.has(hash)) return
        if (seen.has(src)) return
        seen.add(src)
        if (hash) seen.add(hash)
        videos.push({ platform, url: src, embedUrl: src, ...(hash ? { wistiaHash: hash } : {}) })
        return
      }
      if (!seen.has(src)) { seen.add(src); videos.push({ platform, url: src, embedUrl: src }) }
    })
  }

  $('meta[property="og:video"]').each((_, el) => {
    const u = resolveUrl($(el).attr('content'), pageUrl)
    if (u && !seen.has(u)) { seen.add(u); videos.push({ platform: 'direct', url: u, directUrl: u }) }
  })

  return videos
}

export async function resolveWistiaVideo(hash) {
  try {
    const res = await fetch(`https://fast.wistia.com/embed/medias/${hash}.json`, { headers: BROWSER_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const assets = data?.media?.assets || []
    const mp4 = assets
      .filter(a => a.ext === 'mp4' || a.type === 'original')
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]
    if (!mp4) return null
    return {
      directUrl: mp4.url,
      title: data?.media?.name || null,
      width: mp4.width || null,
      height: mp4.height || null,
      duration: Math.round(data?.media?.duration || 0) || null,
    }
  } catch { return null }
}

export async function fetchImageFromUrl(targetUrl) {
  const parsed = new URL(targetUrl)
  const referer = parsed.origin + '/'
  const headers = { ...BROWSER_HEADERS, Referer: referer, Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8' }

  const response = await fetch(targetUrl, { headers, redirect: 'follow' })
  if (!response.ok) return { ok: false, status: response.status, message: httpErrorMessage(response.status) }

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
