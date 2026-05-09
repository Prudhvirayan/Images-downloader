import { fetchImageFromUrl } from './_shared.js'

export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url parameter')

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).send('Invalid URL') }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).send('Only HTTP/HTTPS URLs allowed')
  }

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
