import { BROWSER_HEADERS, httpErrorMessage, isImage, extractAllImagesFromHtml } from './_shared.js'

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
}
