import { fetchImageFromUrl, httpErrorMessage, isImage, extractAllImagesFromHtml, extractVideosFromHtml, resolveWistiaVideo, BROWSER_HEADERS } from './shared.js'

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

export default async function handler(req, res) {
  const { url, mode } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  let parsed
  try { parsed = new URL(url) } catch (_e) { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only HTTP/HTTPS URLs allowed' })
  }

  // ── Scan mode: find all images and videos on a page ───────────────────────
  if (mode === 'scan') {
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
        let images = extractAllImagesFromHtml(html, url)
        let rawVideos = extractVideosFromHtml(html, url)

        if (rawVideos.length === 0) {
          try {
            const gbRes = await fetch(url, {
              headers: { 'User-Agent': GOOGLEBOT_UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', Referer: referer },
              redirect: 'follow',
            })
            if (gbRes.ok) {
              const gbHtml = await gbRes.text()
              const gbVideos = extractVideosFromHtml(gbHtml, url)
              if (gbVideos.length > 0) {
                rawVideos = gbVideos
                if (images.length === 0) images = extractAllImagesFromHtml(gbHtml, url)
              }
            }
          } catch (_e) {}
        }

        const videos = await Promise.all(
          rawVideos.map(async (v) => {
            if (v.platform === 'wistia' && v.wistiaHash) {
              const resolved = await resolveWistiaVideo(v.wistiaHash)
              return resolved ? { ...v, ...resolved } : v
            }
            return v
          })
        )
        const published = videos.filter((v) => v.platform !== 'wistia' || v.directUrl || v.embedUrl)
        return res.json({ images, videos: published, count: images.length })
      }

      return res.status(415).json({ error: `Cannot scan content-type: ${contentType}` })
    } catch (err) {
      console.error('Scan error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── Proxy mode: download and stream a single image ────────────────────────
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
}
