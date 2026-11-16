import express from 'express'
import { load as cheerioLoad } from 'cheerio'
import { execFile } from 'node:child_process'
import { existsSync, createReadStream } from 'fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const app = express()
app.use(express.json())
const execFileAsync = promisify(execFile)
const DEFAULT_PYTHON_EXECUTABLE = fileURLToPath(new URL('./.venv/bin/python', import.meta.url))
const YOUTUBE_HOST_RE = /(^|\.)(youtube\.com|youtu\.be)$/i
const FFMPEG_EXECUTABLE = process.env.IDONE_FFMPEG || 'ffmpeg'
const proxyDiagnostic = (event, details = {}) => {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[local proxy diagnostic]', event, details)
  }
}

// In production, serve the built React frontend from dist/
// (dist/ is built by `npm run build` and lives next to server.js)
if (existsSync('dist')) {
  app.use(express.static('dist'))
}

const IMAGE_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg']
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?[^"']*)?$/i
const THUMB_RE = /thumb(nail)?|[-_]sm[-_]|[-_]xs[-_]|[-_]icon|preview[-_]|[-_]small/i
const FULLSIZE_RE = /full(size|res)?|[-_]large|[-_]orig(inal)?|[-_]hq|[-_]hires|[-_]big|photo(?!s)/i

// URL patterns that indicate junk images (icons, logos, ads, tracking)
const JUNK_URL_RE = /favicon|sprite|1x1|tracking|placeholder|blank|spacer|separator/i
// Checked against just the filename (last path segment)
const JUNK_FILENAME_RE = /logo|favicon|icon|sprite|banner|avatar|thumb-placeholder/i
const ASSET_PATH_RE    = /\/webruntime\/|\/org-asset\/|\/_next\/static\/|\/node_modules\//i

// Detects WordPress/CDN thumbnail dimension suffixes: image-800x600.jpg, image_300x200.png
const WP_DIM_RE = /[-_](\d{2,4})[x×](\d{2,4})(?:-\w+)?\.(jpe?g|png|webp|gif)(\?.*)?$/i
const MIN_QUALITY_DIM = 600 // skip thumbnails smaller than this in any dimension

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?[^"']*)?$/i
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)(\?[^"']*)?$/i
const DOC_EXT_RE   = /\.(pdf|epub|docx?|xlsx?|pptx?|zip|rar|7z|tar\.gz?)(\?[^"']*)?$/i

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
}

// User-friendly messages for common HTTP error codes
function httpErrorMessage(status) {
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
  [/[-_]?thumb(\.[a-z]+)$/i, '$1'],
  [/[-_]thumbnail(\.[a-z]+)$/i, '$1'],
  [/[-_]small(\.[a-z]+)$/i, '$1'],
  [/[-_]sm(\.[a-z]+)$/i, '$1'],
  [/[-_](s|xs|xxs)(\.[a-z]+)$/i, '$2'],
  [/[-_](150|200|300|400)(\.[a-z]+)$/i, '$2'],
]

function isImage(contentType) {
  return IMAGE_MIME_PREFIXES.some((p) => contentType?.toLowerCase().startsWith(p))
}

function resolveUrl(src, base) {
  if (!src || src.startsWith('data:')) return null
  try { return new URL(src, base).href } catch { return null }
}

function unwrapCdnSrc(raw) {
  if (!raw || raw.startsWith('data:')) return raw
  try {
    if (raw.includes('/_next/image')) {
      const u = new URL(raw, 'https://x.com')
      const original = u.searchParams.get('url')
      if (original) return decodeURIComponent(original)
    }
  } catch { /* optional enhancement failed; continue with the existing fallback */ }
  return raw
}

function deoptimizeUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('cloudinary.com') && u.pathname.includes('/image/upload/')) {
      u.pathname = u.pathname.replace(
        /(\/image\/upload\/)([a-z_,.\d]+\/)(.*)/,
        (_, prefix, _transforms, rest) => prefix + rest
      )
      return u.href
    }
    u.pathname = u.pathname.replace(/_(\d+)x(\d+)(\.[a-z]+)$/i, '$3')
    if (u.searchParams.has('format') && /^\d+w$/i.test(u.searchParams.get('format') || '')) {
      u.searchParams.set('format', '2500w')
      return u.href
    }
    for (const key of ['w', 'h', 'width', 'height', 'fit', 'crop', 'resize', 'size', 'maxwidth', 'maxheight', 'imwidth', 'imheight']) {
      u.searchParams.delete(key)
    }
    return u.href
  } catch { return url }
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
      const res = await fetch(upgraded, {
        method: 'HEAD',
        headers: { ...BROWSER_HEADERS, Referer: referer },
        redirect: 'follow',
      })
      if (res.ok && isImage(res.headers.get('content-type') || '')) return upgraded
    } catch { /* optional enhancement failed; continue with the existing fallback */ }
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
    const url = resolveUrl(deoptimizeUrl(resolveUrl(raw, pageUrl) || raw), pageUrl)
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
      let raw = $el.attr(attr)
      if (!raw) continue
      raw = unwrapCdnSrc(raw)
      if (IMAGE_EXT_RE.test(raw)) { addCandidate(raw, w, h); break }
    }

    const srcset = $el.attr('srcset') || $el.attr('data-srcset') || ''
    if (srcset) {
      let bestW = 0, bestSrc = null
      for (const part of srcset.split(',').map((s) => s.trim())) {
        const [rawUrl, descriptor] = part.split(/\s+/)
        const dw = descriptor ? parseFloat(descriptor) : 0
        if (dw > bestW) { bestW = dw; bestSrc = rawUrl }
      }
      if (bestSrc) {
        const unwrapped = unwrapCdnSrc(bestSrc)
        if (IMAGE_EXT_RE.test(unwrapped)) addCandidate(unwrapped, w, h)
      }
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
  return deduped  // {url: string, score: number}[]
}

// ─── Video detection ──────────────────────────────────────────────────────────

function extractVideosFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)
  const seen = new Set()
  const videos = []

  // 1. <video> tags
  $('video').each((_, el) => {

    const $el = $(el)
    const src = resolveUrl($el.attr('src'), pageUrl)
    if (src && !seen.has(src)) { seen.add(src); videos.push({ platform: 'direct', url: src, directUrl: src }) }
    $el.find('source[src]').each((__, s) => {
      const u = resolveUrl($(s).attr('src'), pageUrl)
      if (u && !seen.has(u)) { seen.add(u); videos.push({ platform: 'direct', url: u, directUrl: u }) }
    })
  })

  // 2. Direct video file links
  $('a[href]').each((_, el) => {
    const u = resolveUrl($(el).attr('href'), pageUrl)
    if (u && VIDEO_EXT_RE.test(u) && !seen.has(u)) {
      seen.add(u); videos.push({ platform: 'direct', url: u, directUrl: u })
    }
  })

  // 3. Wistia embed divs: class="wistia_async_HASH"
  $('[class*="wistia_async_"]').each((_, el) => {
    const m = ($(el).attr('class') || '').match(/wistia_async_([a-zA-Z0-9]+)/)
    if (m && !seen.has(m[1])) {
      seen.add(m[1])
      videos.push({ platform: 'wistia', url: `https://home.wistia.com/medias/${m[1]}`, wistiaHash: m[1] })
    }
  })

  // 4. Wistia hashes anywhere in HTML source (both wistia.com and wistia.net patterns)
  const wRe = /wistia\.(?:com|net)\/(?:embed\/(?:medias|iframe)|medias)\/([a-zA-Z0-9]+)/g
  let wm
  while ((wm = wRe.exec(html)) !== null) {
    if (!seen.has(wm[1])) {
      seen.add(wm[1])
      videos.push({ platform: 'wistia', url: `https://home.wistia.com/medias/${wm[1]}`, wistiaHash: wm[1] })
    }
  }

  // 5. YouTube / Vimeo / Loom / Wistia iframes
  for (const [sel, platform] of [
    ['iframe[src*="youtube.com/embed"], iframe[src*="youtu.be"]', 'youtube'],
    ['iframe[src*="player.vimeo.com"]', 'vimeo'],
    ['iframe[src*="loom.com/embed"]', 'loom'],
    ['iframe[src*="wistia.com"], iframe[src*="wistia.net"]', 'wistia'],
  ]) {
    $(sel).each((_, el) => {
      const src = $(el).attr('src') || ''
      if (!src) return
      // For Wistia iframes, extract the hash and skip if section 4 already found it
      if (platform === 'wistia') {
        const hm = src.match(/embed\/(?:iframe|medias)\/([a-zA-Z0-9]+)/)
        const hash = hm?.[1]
        if (hash && seen.has(hash)) return  // already found by regex scan, skip duplicate
        if (seen.has(src)) return
        seen.add(src)
        if (hash) seen.add(hash)
        videos.push({ platform, url: src, embedUrl: src, ...(hash ? { wistiaHash: hash } : {}) })
        return
      }
      if (!seen.has(src)) { seen.add(src); videos.push({ platform, url: src, embedUrl: src }) }
    })
  }

  // 6. og:video meta
  $('meta[property="og:video"]').each((_, el) => {
    const u = resolveUrl($(el).attr('content'), pageUrl)
    if (u && !seen.has(u)) { seen.add(u); videos.push({ platform: 'direct', url: u, directUrl: u }) }
  })

  return videos
}

function extractFilesFromHtml(html, pageUrl) {
  const $ = cheerioLoad(html)
  const seen = new Set()
  const files = []
  function addFile(raw, category) {
    const url = resolveUrl(raw, pageUrl)
    if (!url || seen.has(url) || JUNK_URL_RE.test(url)) return
    seen.add(url)
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || url
    const ext  = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || ''
    files.push({ url, name, ext, category })
  }
  $('audio').each((_, el) => {
    const src = $(el).attr('src')
    if (src && AUDIO_EXT_RE.test(src)) addFile(src, 'audio')
    $(el).find('source[src]').each((__, s) => {
      const u = $(s).attr('src')
      if (u && AUDIO_EXT_RE.test(u)) addFile(u, 'audio')
    })
  })
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    if (AUDIO_EXT_RE.test(href)) addFile(href, 'audio')
    else if (DOC_EXT_RE.test(href)) addFile(href, 'document')
  })
  return files
}

async function resolveWistiaVideo(hash) {
  try {
    const res = await fetch(`https://fast.wistia.com/embed/medias/${hash}.json`, { headers: BROWSER_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const assets = data?.media?.assets || []
    const mp4 = assets
      .filter(a => a.ext === 'mp4' || a.type === 'original')
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]
    if (!mp4) return null
    // Wistia's still frame is served as .bin; the .jpg variant with a resize hint returns a small JPEG thumbnail.
    const still = assets.find(a => a.type === 'still_image' && a.url)
    return {
      directUrl: mp4.url,
      title: data?.media?.name || null,
      thumbnail: still ? `${still.url.replace(/\.bin(\?.*)?$/, '.jpg')}?image_crop_resized=320x180` : null,
      width: mp4.width || null,
      height: mp4.height || null,
      duration: Math.round(data?.media?.duration || 0) || null,
    }
  } catch { return null }
}

async function fetchImageFromUrl(targetUrl, { signal, onResponse } = {}) {
  const parsed = new URL(targetUrl)
  const referer = parsed.origin + '/'
  const headers = { ...BROWSER_HEADERS, Referer: referer, Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8' }

  const response = await fetch(targetUrl, { headers, redirect: 'follow', signal })
  const contentType = response.headers.get('content-type') || ''
  onResponse?.({ status: response.status, contentType })
  if (!response.ok) return { ok: false, status: response.status, message: httpErrorMessage(response.status) }

  // Stream video and audio bodies through without buffering them in the Express process.
  const normalizedContentType = contentType.toLowerCase()
  if (normalizedContentType.startsWith('video/') || normalizedContentType.startsWith('audio/')) {
    proxyDiagnostic('media stream branch entered', { contentType })
    return {
      ok: true,
      stream: response.body,
      status: response.status,
      contentType,
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
      acceptRanges: response.headers.get('accept-ranges'),
      cacheControl: response.headers.get('cache-control'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    }
  }

  proxyDiagnostic('media stream branch skipped', { contentType: contentType || '(missing)' })

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
      } catch { /* optional enhancement failed; continue with the existing fallback */ }
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

  proxyDiagnostic('Express rejected upstream content type', { status: 415, contentType: contentType || '(missing)' })
  return { ok: false, status: 415, message: `Unexpected content-type: ${contentType}` }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Local development bridge to the same Python handler deployed as a Vercel function.
app.get('/api/extract', async (req, res) => {
  const { url, mode, quality, audio_fmt: audioFmt } = req.query
  if (typeof url !== 'string' || !url) return res.status(400).json({ error: 'url parameter required' })

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only HTTP/HTTPS URLs allowed' })
  }

  const params = new URLSearchParams({ url })
  if (typeof mode === 'string') params.set('mode', mode)
  if (typeof quality === 'string') params.set('quality', quality)
  if (typeof audioFmt === 'string') params.set('audio_fmt', audioFmt)

  try {
    const { stdout } = await execFileAsync(
      process.env.IDONE_PYTHON || DEFAULT_PYTHON_EXECUTABLE,
      ['api/local-extract.py', `?${params}`],
      { timeout: 45_000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(stdout)
    const body = JSON.parse(result.body)
    if (result.status >= 500 && body.error?.includes("No module named 'yt_dlp'")) {
      return res.status(503).json({
        error: 'The yt-dlp Python dependency is missing. Install the dependencies in requirements.txt to enable local video extraction.',
      })
    }
    // Local only: YouTube serves Shorts/most videos as separate video + audio streams,
    // so Video mode is handed to /api/yt-merge, which merges them with FFmpeg.
    const wantsVideo = (typeof mode !== 'string' || mode === 'video')
    if (wantsVideo && YOUTUBE_HOST_RE.test(parsed.hostname) && (result.status === 200 || body.merge_required)) {
      const mergeParams = new URLSearchParams({ url })
      if (typeof quality === 'string') mergeParams.set('quality', quality)
      return res.status(200).json({
        title: body.title || 'video',
        platform: 'youtube',
        ext: 'mp4',
        merge_path: `/api/yt-merge?${mergeParams}`,
      })
    }
    return res.status(result.status).json(body)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(503).json({
        error: `Python executable not found: ${process.env.IDONE_PYTHON || DEFAULT_PYTHON_EXECUTABLE}. Set IDONE_PYTHON or create the project .venv.`,
      })
    }
    if (err.code === 'ETIMEDOUT' || err.killed) {
      return res.status(504).json({ error: 'Video extraction timed out. Try again or use a lower quality.' })
    }
    console.error('Extraction bridge error:', err.message)
    return res.status(502).json({ error: 'The local extraction process failed.' })
  }
})

// Local development only: download the selected YouTube quality plus its audio track
// with yt-dlp, merge them into one MP4 with FFmpeg, and stream the file to the browser.

app.get('/api/yt-merge', async (req, res) => {
  const { url, quality } = req.query
  let parsed
  try { parsed = new URL(typeof url === 'string' ? url : '') } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol) || !YOUTUBE_HOST_RE.test(parsed.hostname)) {
    return res.status(400).json({ error: 'Only YouTube URLs can be merged' })
  }

  try {
    await execFileAsync(FFMPEG_EXECUTABLE, ['-version'], { timeout: 10_000 })
  } catch {
    return res.status(503).json({ error: 'FFmpeg is required to merge YouTube video and audio. Install it with: brew install ffmpeg' })
  }

  const height = typeof quality === 'string' && /^\d{2,4}$/.test(quality) ? quality : null
  // Direct (non-HLS) streams only; prefer the requested height, MP4/M4A, then H.264 for wide playback support.
  const formatSort = [height ? `res:${height}` : 'res', 'ext:mp4:m4a', 'vcodec:h264'].join(',')
  const workDir = await mkdtemp(join(tmpdir(), 'idone-yt-'))
  const cleanup = () => rm(workDir, { recursive: true, force: true }).catch(() => {})
  const startedAt = Date.now()
  proxyDiagnostic('yt-merge started', { hostname: parsed.hostname, height: height || 'best' })

  try {
    const args = [
      '-m', 'yt_dlp', '--no-playlist', '--no-progress', '--quiet', '--no-warnings',
      '-f', 'bv*[protocol^=http]+ba[protocol^=http]/b[protocol^=http][acodec!=none]',
      '-S', formatSort,
      '--merge-output-format', 'mp4',
      '-o', join(workDir, 'media.%(ext)s'),
    ]
    if (process.env.IDONE_FFMPEG) args.push('--ffmpeg-location', process.env.IDONE_FFMPEG)
    args.push(parsed.href)
    await execFileAsync(process.env.IDONE_PYTHON || DEFAULT_PYTHON_EXECUTABLE, args, { timeout: 170_000, maxBuffer: 4 * 1024 * 1024 })

    const output = (await readdir(workDir)).find(name => /^media\.(mp4|mkv|webm)$/.test(name))
    if (!output) throw new Error('yt-dlp finished without producing a merged file')
    const filePath = join(workDir, output)
    const { size } = await stat(filePath)
    proxyDiagnostic('yt-merge completed', { file: output, bytes: size, ms: Date.now() - startedAt })

    res.setHeader('Content-Type', output.endsWith('.mp4') ? 'video/mp4' : output.endsWith('.webm') ? 'video/webm' : 'video/x-matroska')
    res.setHeader('Content-Length', String(size))
    res.setHeader('Cache-Control', 'no-store')
    await pipeline(createReadStream(filePath), res)
  } catch (err) {
    const detail = String(err.stderr || err.message || '').split('\n').find(line => line.includes('ERROR')) || ''
    proxyDiagnostic('yt-merge failed', { killed: Boolean(err.killed), detail: detail.replace(/https?:\/\/\S+/g, '<url>').slice(0, 300) })
    if (!res.headersSent) {
      res.status(err.killed ? 504 : 502).json({ error: err.killed ? 'Merging timed out. Try a lower quality.' : 'Could not download and merge this YouTube video.' })
    } else {
      res.destroy()
    }
  } finally {
    cleanup()
  }
})

app.get('/api/proxy', async (req, res) => {
  // mode=scan: local dev forwards to /api/scan (Vercel uses inline handler in proxy.js)
  if (req.query.mode === 'scan') {
    const scanUrl = req.query.url ? `/api/scan?url=${encodeURIComponent(req.query.url)}` : '/api/scan'
    return res.redirect(302, scanUrl)
  }
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url parameter')

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).send('Invalid URL') }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Only HTTP/HTTPS URLs allowed')
  proxyDiagnostic('proxy request received', { hostname: parsed.hostname })

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Upstream response headers timed out'))
  }, 45_000)
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort(new Error('Client disconnected'))
  }
  let proxyStage = 'upstream request'
  const clearHeaderTimeout = (upstream) => {
    clearTimeout(timeout)
    proxyDiagnostic('upstream response', upstream)
  }
  req.once('aborted', abortOnDisconnect)
  res.once('close', abortOnDisconnect)

  try {
    const result = await fetchImageFromUrl(url, { signal: controller.signal, onResponse: clearHeaderTimeout })
    if (!result.ok) {
      proxyDiagnostic('upstream error response returned by Express', { status: result.status })
      return res.status(result.status ?? 500).send(result.message ?? 'Fetch failed')
    }

    if (result.stream) {
      res.status(result.status)
      res.setHeader('Content-Type', result.contentType)
      if (result.contentLength) res.setHeader('Content-Length', result.contentLength)
      if (result.contentRange) res.setHeader('Content-Range', result.contentRange)
      if (result.acceptRanges) res.setHeader('Accept-Ranges', result.acceptRanges)
      if (result.cacheControl) res.setHeader('Cache-Control', result.cacheControl)
      if (result.etag) res.setHeader('ETag', result.etag)
      if (result.lastModified) res.setHeader('Last-Modified', result.lastModified)
      proxyStage = 'video stream'
      proxyDiagnostic('video streaming started', { status: result.status, contentType: result.contentType })
      await pipeline(Readable.fromWeb(result.stream), res)
      proxyStage = 'complete'
      proxyDiagnostic('video streaming completed')
      return
    }

    res.setHeader('Content-Type', result.contentType)
    res.setHeader('X-Image-Url', encodeURIComponent(result.imageUrl))
    res.send(Buffer.from(result.buffer))
  } catch (err) {
    proxyDiagnostic('proxy error', {
      stage: proxyStage,
      name: err.name,
      code: err.code,
    })
    if (res.destroyed || res.writableEnded) return
    if (res.headersSent) {
      res.destroy(err)
      return
    }
    if (timedOut) return res.status(504).send('Upstream request timed out')
    console.error('[local proxy diagnostic] request failed', {
      hostname: parsed.hostname,
      stage: proxyStage,
      name: err.name,
      code: err.code,
    })
    res.status(500).send(`Error: ${err.message}`)
  } finally {
    clearHeaderTimeout()
    req.off('aborted', abortOnDisconnect)
    res.off('close', abortOnDisconnect)
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

    if (!response.ok) return res.status(response.status).json({ error: httpErrorMessage(response.status) })

    const contentType = response.headers.get('content-type') || ''

    // URL itself is a direct image — return as single item
    if (isImage(contentType)) {
      return res.json({ images: [{ url, score: 99 }], videos: [], count: 1, direct: true })
    }

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      let html = await response.text()

      // If the first pass finds nothing (JS-rendered SPA), retry with Googlebot UA.
      // Salesforce Experience Cloud, Next.js and many SPAs serve pre-rendered HTML
      // to search crawlers for SEO — this often contains Wistia embed codes.
      let images = extractAllImagesFromHtml(html, url)
      let rawVideos = extractVideosFromHtml(html, url)

      // Always retry with Googlebot when no videos found — SPAs (Salesforce, Next.js, etc.)
      // return browser images (static assets) but hide video embeds from regular crawlers.
      // Googlebot triggers SSR/pre-rendering that exposes Wistia embed codes.
      if (rawVideos.length === 0) {
        try {
          const gbHeaders = {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referer,
          }
          const gbRes = await fetch(url, { headers: gbHeaders, redirect: 'follow' })
          if (gbRes.ok) {
            const gbHtml   = await gbRes.text()
            const gbVideos = extractVideosFromHtml(gbHtml, url)
            if (gbVideos.length > 0) {
              rawVideos = gbVideos
              // Only replace images if the browser scan found none
              if (images.length === 0) images = extractAllImagesFromHtml(gbHtml, url)
            }
          }
        } catch { /* optional enhancement failed; continue with the existing fallback */ }
      }

      // Resolve Wistia hashes to direct MP4 URLs in parallel
      const videos = await Promise.all(
        rawVideos.map(async v => {
          if (v.platform === 'wistia' && v.wistiaHash) {
            const resolved = await resolveWistiaVideo(v.wistiaHash)
            return resolved ? { ...v, ...resolved } : v
          }
          return v
        })
      )

      const files = extractFilesFromHtml(html, url)
      return res.json({ images, videos: videos.filter(v => v.platform !== 'wistia' || v.directUrl || v.embedUrl), files, count: images.length })
    }

    return res.status(415).json({ error: `Cannot scan content-type: ${contentType}` })
  } catch (err) {
    console.error('Scan error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Resolve a Wistia media hash to a direct MP4 URL
app.get('/api/resolve-wistia', async (req, res) => {
  const { hash } = req.query
  if (!hash || !/^[a-zA-Z0-9]+$/.test(hash)) return res.status(400).json({ error: 'Invalid or missing hash' })
  try {
    const resolved = await resolveWistiaVideo(hash)
    if (!resolved) return res.status(404).json({ error: 'Could not resolve this Wistia video. Check the hash and try again.' })
    res.json({ ...resolved, hash })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
