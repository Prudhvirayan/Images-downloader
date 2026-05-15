import { BROWSER_HEADERS, httpErrorMessage, isImage, extractAllImagesFromHtml, extractVideosFromHtml, resolveWistiaVideo } from './shared.js'

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

async function googlebotFetch(url, referer) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': GOOGLEBOT_UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', Referer: referer },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return await res.text()
  } catch (_e) {
    return null
  }
}

async function resolveVideos(rawVideos) {
  return Promise.all(
    rawVideos.map(async (v) => {
      if (v.platform === 'wistia' && v.wistiaHash) {
        const resolved = await resolveWistiaVideo(v.wistiaHash)
        return resolved ? { ...v, ...resolved } : v
      }
      return v
    })
  )
}

export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  let parsed
  try { parsed = new URL(url) } catch (_e) { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only HTTP/HTTPS URLs allowed' })
  }

  try {
    const referer = parsed.origin + '/'
    const headers = { ...BROWSER_HEADERS, Referer: referer, Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8' }
    const response = await fetch(url, { headers, redirect: 'follow' })

    if (!response.ok) return res.status(response.status).json({ error: httpErrorMessage(response.status) })

    const contentType = response.headers.get('content-type') || ''

    if (isImage(contentType)) {
      return res.json({ images: [{ url, score: 99 }], videos: [], count: 1, direct: true })
    }

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await response.text()
      const browserImages = extractAllImagesFromHtml(html, url)
      const browserVideos = extractVideosFromHtml(html, url)

      // Retry with Googlebot UA when no videos — SPAs hide video embeds from browsers
      let images = browserImages
      let rawVideos = browserVideos

      if (browserVideos.length === 0) {
        const gbHtml = await googlebotFetch(url, referer)
        if (gbHtml !== null) {
          const gbVideos = extractVideosFromHtml(gbHtml, url)
          if (gbVideos.length > 0) {
            rawVideos = gbVideos
            images = browserImages.length === 0 ? extractAllImagesFromHtml(gbHtml, url) : browserImages
          }
        }
      }

      const videos = await resolveVideos(rawVideos)
      const publishedVideos = videos.filter((v) => v.platform !== 'wistia' || v.directUrl || v.embedUrl)

      return res.json({ images, videos: publishedVideos, count: images.length })
    }

    return res.status(415).json({ error: `Cannot scan content-type: ${contentType}` })
  } catch (err) {
    console.error('Scan error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
