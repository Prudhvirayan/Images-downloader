import { resolveWistiaVideo } from './shared.js'

export default async function handler(req, res) {
  const { hash } = req.query
  if (!hash || !/^[a-zA-Z0-9]+$/.test(hash)) {
    return res.status(400).json({ error: 'Invalid or missing Wistia media hash' })
  }
  try {
    const resolved = await resolveWistiaVideo(hash)
    if (!resolved) {
      return res.status(404).json({ error: 'Could not resolve this Wistia video. Check the hash and try again.' })
    }
    res.json({ ...resolved, hash })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
