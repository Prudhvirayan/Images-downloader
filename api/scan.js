import { BROWSER_HEADERS, httpErrorMessage, isImage, extractAllImagesFromHtml, extractVideosFromHtml, resolveWistiaVideo } from './shared.js'

const GOOGLEBOT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
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
      let html = await response.text()
      let images   = extractAllImagesFromHtml(html, url)
      let rawVideos = extractVideosFromHtml(html, url)

      // Always retry with Googlebot when no videos found — SPAs return browser images
      // (static assets) but hide video embeds; Googlebot triggers SSR that exposes them.
      if (rawVideos.length === 0) {
        try {
          const gbRes = await fetch(url, { headers: { ...GOOGLEBOT_HEADERS, Referer: referer }, redirect: 'follow' })
          if (gbRes.ok) {
            const gbHtml   = await gbRes.text()
            const gbVideos = extractVideosFromHtml(gbHtml, url)
            if (gbVideos.length > 0) {
              rawVideos = gbVideos
              if (images.length === 0) images = extractAllImagesFromHtml(gbHtml, url)
            }
          }
        } catch {}
      }

      const videos = await Promise.all(
        rawVideos.map(async v => {
          if (v.platform === 'wistia' && v.wistiaHash) {
            const resolved = await resolveWistiaVideo(v.wistiaHash)
            return resolved ? { ...v, ...resolved } : v
          }
          return v
        })
      )

      return res.json({ images, videos: videos.filter(v => v.platform !== 'wistia' || v.directUrl || v.embedUrl), count: images.length })
    }

    return res.status(415).json({ error: `Cannot scan content-type: ${contentType}` })
  } catch (err) {
    console.error('Scan error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
