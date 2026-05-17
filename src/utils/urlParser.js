// Matches [n-m] or (n-m) — parentheses supported as mobile-friendly alternative
const BRACKET_RE = /[\[(](\d+)-(\d+)[\])]/

export function parseUrlTemplate(template) {
  const trimmed = template.trim()
  if (!trimmed) return { error: null, urls: [], single: false }

  // No [start-end] or (start-end) bracket — treat as a single direct URL
  const match = BRACKET_RE.exec(trimmed)
  if (!match) {
    // Auto-prepend https:// if the user omitted the protocol
    const url = (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
      ? trimmed : 'https://' + trimmed
    return { error: null, urls: [url], single: true }
  }

  // Sequence mode: [start-end] found
  const [full, rawStart, rawEnd] = match
  const start = parseInt(rawStart, 10)
  const end = parseInt(rawEnd, 10)

  if (isNaN(start) || isNaN(end)) {
    return { error: 'Invalid numbers in range.', urls: [], single: false }
  }
  if (start > end) {
    return { error: `Start (${start}) must be ≤ end (${end}).`, urls: [], single: false }
  }
  if (end - start > 9999) {
    return { error: 'Range too large (max 10,000 images).', urls: [], single: false }
  }

  const padWidth = rawStart.startsWith('0') ? rawStart.length : 0
  const urls = []
  for (let i = start; i <= end; i++) {
    const idx = padWidth > 0 ? String(i).padStart(padWidth, '0') : String(i)
    urls.push(trimmed.replace(full, idx))
  }

  return { error: null, urls, single: false }
}

export function getFilenameFromUrl(url, fallbackIndex) {
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').pop()
    if (name) return name
  } catch (_) {}
  return `image_${fallbackIndex + 1}.jpg`
}
