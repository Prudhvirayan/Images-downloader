import { useState, useRef, useCallback, useEffect } from 'react'
import { parseUrlTemplate, getFilenameFromUrl } from './utils/urlParser'
import { fetchWithPool, buildAndDownloadZip } from './utils/fetcher'

// ─── Design tokens (used via var(--*) in CSS, see index.css) ─────────────────
// Light: --bg #F5F4F0  --surface #FFF  --border #E3E2DC  --text-1 #1A1917 etc.
// Dark:  --bg #0E0E11  --surface #17171B  --border #2A2A31 etc.

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  Clipboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>
    </svg>
  ),
  ExternalLink: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
  Copy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  Close: ({cls='w-4 h-4'}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  ChevLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><polyline points="15 18 9 12 15 6"/></svg>
  ),
  ChevRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><polyline points="9 18 15 12 9 6"/></svg>
  ),
  ZoomIn: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  ),
  ZoomOut: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  ),
  RotateCW: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  RotateCCW: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  ),
  Play: () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
  ),
  Fullscreen: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ),
  ExitFullscreen: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/>
    </svg>
  ),
  Scan: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <rect x="7" y="7" width="10" height="10" rx="1"/>
    </svg>
  ),
  Download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Photo: ({cls='w-4 h-4'}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  Sun: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  Moon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Eye: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function TbBtn({ onClick, title, children, wide=false, active=false }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex items-center justify-center h-8 rounded-lg transition-all
        ${active ? 'bg-violet-500/80 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}
        ${wide ? 'px-3 gap-1.5 text-xs font-medium' : 'w-8'}`}>
      {children}
    </button>
  )
}

const SPEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function Lightbox({ images, startIndex, onClose }) {
  const [index, setIndex]       = useState(startIndex)
  const [rotation, setRotation] = useState(0)
  const [playing, setPlaying]   = useState(false)
  const [speed, setSpeed]       = useState(3)
  const [isFS, setIsFS]         = useState(false)
  const [dragging, setDragging] = useState(false)
  const [flashIcon, setFlashIcon] = useState(null) // null | 'play' | 'pause'
  const [vt, setVt]             = useState({ x: 0, y: 0, scale: 1 })

  const vtRef   = useRef({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef({ startX: 0, startY: 0, tx: 0, ty: 0, dist: 0 })
  const lbRef   = useRef(null)
  const ctrRef  = useRef(null)
  useEffect(() => { vtRef.current = vt }, [vt])

  const total   = images.length
  const current = images[index]
  const resetView = useCallback(() => setVt({ x: 0, y: 0, scale: 1 }), [])
  const prev = useCallback(() => { setPlaying(false); setIndex(i => Math.max(0, i - 1)) }, [])
  const next = useCallback(() => { setPlaying(false); setIndex(i => (i + 1) % total) }, [total])

  useEffect(() => { resetView(); setRotation(0) }, [index, resetView])
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => setIndex(i => (i + 1) % total), speed * 1000)
    return () => clearTimeout(t)
  }, [playing, index, speed, total])

  useEffect(() => {
    const fn = () => setIsFS(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Auto-clear the play/pause flash icon after animation completes
  useEffect(() => {
    if (!flashIcon) return
    const t = setTimeout(() => setFlashIcon(null), 700)
    return () => clearTimeout(t)
  }, [flashIcon])

  const toggleFS = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await lbRef.current?.requestFullscreen()
      else await document.exitFullscreen()
    } catch {}
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !document.fullscreenElement) { onClose(); return }
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'r' || e.key === 'R') { resetView(); setRotation(r => (r + 90) % 360) }
      if (e.key === '0') { resetView(); setRotation(0) }
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(p => {
          const next = !p
          setFlashIcon(next ? 'play' : 'pause')
          return next
        })
      }
      if (/^[1-9]$/.test(e.key)) setSpeed(parseInt(e.key))
      if (e.key === 'f' || e.key === 'F') toggleFS()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next, resetView, toggleFS])

  const zoomAt = useCallback((clientX, clientY, factor) => {
    const el = ctrRef.current
    if (!el) return
    const r   = el.getBoundingClientRect()
    const mx  = clientX - (r.left + r.width / 2)
    const my  = clientY - (r.top  + r.height / 2)
    const cur = vtRef.current
    const ns  = Math.min(10, Math.max(0.5, cur.scale * factor))
    const ratio = ns / cur.scale
    setVt({ x: mx - (mx - cur.x) * ratio, y: my - (my - cur.y) * ratio, scale: ns })
  }, [])

  useEffect(() => {
    const el = ctrRef.current
    if (!el) return
    const fn = e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9) }
    el.addEventListener('wheel', fn, { passive: false })
    return () => el.removeEventListener('wheel', fn)
  }, [zoomAt])

  function onMouseDown(e) {
    if (vtRef.current.scale <= 1) return
    e.preventDefault()
    setDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx: vtRef.current.x, ty: vtRef.current.y, dist: 0 }
  }
  function onMouseMove(e) {
    if (!dragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    dragRef.current.dist = Math.sqrt(dx * dx + dy * dy)
    setVt(p => ({ ...p, x: dragRef.current.tx + dx, y: dragRef.current.ty + dy }))
  }
  function onMouseUp() { setDragging(false) }

  function onTouchStart(e) {
    if (e.touches.length !== 1 || vtRef.current.scale <= 1) return
    setDragging(true)
    dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, tx: vtRef.current.x, ty: vtRef.current.y, dist: 0 }
  }
  function onTouchMove(e) {
    if (!dragging || e.touches.length !== 1) return
    e.preventDefault()
    const dx = e.touches[0].clientX - dragRef.current.startX
    const dy = e.touches[0].clientY - dragRef.current.startY
    dragRef.current.dist = Math.sqrt(dx * dx + dy * dy)
    setVt(p => ({ ...p, x: dragRef.current.tx + dx, y: dragRef.current.ty + dy }))
  }
  function onTouchEnd() { setDragging(false) }

  function onAreaClick(e) {
    if (dragRef.current.dist > 5) return
    if (!isFS) return
    const r = e.currentTarget.getBoundingClientRect()
    if (e.clientX < r.left + r.width / 2) prev(); else next()
  }

  const cursor = dragging ? 'grabbing' : vt.scale > 1 ? 'grab' : isFS ? 'pointer' : 'default'

  return (
    <div ref={lbRef} className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      {/* Toolbar — hidden in fullscreen */}
      {!isFS && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 flex-shrink-0" style={{ background: 'rgba(10,10,12,0.85)', backdropFilter: 'blur(12px)' }}>
          <span className="text-white/40 text-xs tabular-nums font-mono flex-shrink-0">{index + 1} / {total}</span>
          <p className="text-white/20 text-[11px] font-mono truncate hidden lg:block min-w-0 flex-1">{current.imageUrl || current.url}</p>

          {/* Desktop-only controls — hidden on small screens to prevent overflow */}
          <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
            <TbBtn onClick={() => zoomAt(0,0,0.75)} title="Zoom out (-)"><Ic.ZoomOut /></TbBtn>
            <span className="text-white/30 text-xs w-10 text-center tabular-nums">{Math.round(vt.scale * 100)}%</span>
            <TbBtn onClick={() => zoomAt(0,0,1.33)} title="Zoom in (+)"><Ic.ZoomIn /></TbBtn>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <TbBtn onClick={() => { resetView(); setRotation(r => (r-90+360)%360) }} title="Rotate left"><Ic.RotateCCW /></TbBtn>
            <TbBtn onClick={() => { resetView(); setRotation(r => (r+90)%360) }} title="Rotate right (R)"><Ic.RotateCW /></TbBtn>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <TbBtn onClick={() => { resetView(); setRotation(0) }} title="Reset (0)" wide>Reset</TbBtn>
            <div className="w-px h-4 bg-white/10 mx-1" />
          </div>

          {/* Always visible — fullscreen + close must never be pushed off screen */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
            <TbBtn onClick={toggleFS} title="Fullscreen (F)" active={isFS}><Ic.Fullscreen /></TbBtn>
            <TbBtn onClick={onClose} title="Close (Esc)"><Ic.Close /></TbBtn>
          </div>
        </div>
      )}

      {/* Image area */}
      <div ref={ctrRef} className="flex-1 flex items-center justify-center overflow-hidden relative"
        style={{ cursor }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onClick={onAreaClick}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

        {!isFS && index > 0 && (
          <button onClick={e => { e.stopPropagation(); prev() }}
            className="absolute left-4 z-10 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2.5 transition-all backdrop-blur-sm border border-white/10">
            <Ic.ChevLeft />
          </button>
        )}

        <img key={current.previewUrl} src={current.previewUrl} alt="" draggable={false}
          style={{
            maxWidth:  isFS ? '100vw' : '90vw',
            maxHeight: isFS ? '100vh' : 'calc(100vh - 120px)',
            objectFit: 'contain',
            pointerEvents: 'none',
            transform: `translate(${vt.x}px,${vt.y}px) scale(${vt.scale}) rotate(${rotation}deg)`,
            transition: dragging ? 'none' : 'transform 0.12s ease',
          }} />

        {playing && !isFS && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10 pointer-events-none">
            <div key={`${index}-${playing}`} className="h-full bg-violet-400" style={{ animation: `lbFill ${speed}s linear` }} />
          </div>
        )}

        {!isFS && index < total - 1 && (
          <button onClick={e => { e.stopPropagation(); next() }}
            className="absolute right-4 z-10 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2.5 transition-all backdrop-blur-sm border border-white/10">
            <Ic.ChevRight />
          </button>
        )}

        {isFS && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/20 text-xs tabular-nums font-mono pointer-events-none">
            {index + 1} / {total}
          </div>
        )}

        {/* Play/pause flash — YouTube-style visual feedback, visible on Space press */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          style={{ opacity: flashIcon ? 1 : 0, transition: flashIcon ? 'opacity 0.05s ease' : 'opacity 0.6s ease' }}>
          <div className="rounded-full p-5" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            {flashIcon === 'play'
              ? <svg viewBox="0 0 24 24" fill="white" className="w-10 h-10"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              : <svg viewBox="0 0 24 24" fill="white" className="w-10 h-10"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>}
          </div>
        </div>
      </div>

      {/* Bottom bar — hidden in fullscreen */}
      {!isFS && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/8 flex-shrink-0" style={{ background: 'rgba(10,10,12,0.85)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setPlaying(p => { const next = !p; setFlashIcon(next ? 'play' : 'pause'); return next })}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${playing ? 'bg-violet-600 text-white' : 'bg-white/8 text-white/60 hover:bg-white/12 hover:text-white border border-white/10'}`}>
              {playing ? <Ic.Pause /> : <Ic.Play />}
              {playing ? 'Pause' : 'Slideshow'}
            </button>
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
              className="text-xs rounded-lg px-2 py-1.5 border outline-none cursor-pointer"
              style={{ colorScheme: 'dark', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.10)' }}>
              {SPEEDS.map(s => <option key={s} value={s}>{s}s</option>)}
            </select>
            <button onClick={toggleFS} title="Fullscreen (F)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/8 text-white/60 hover:bg-white/12 hover:text-white border border-white/10 transition-all">
              <Ic.Fullscreen /> Fullscreen
            </button>
          </div>
          <p className="text-white/15 text-[11px] hidden md:block">
            ← → navigate &nbsp;·&nbsp; Space play/pause &nbsp;·&nbsp; 1–9 speed &nbsp;·&nbsp; scroll zoom &nbsp;·&nbsp; R rotate &nbsp;·&nbsp; F fullscreen
          </p>
        </div>
      )}
      <style>{`@keyframes lbFill { from{width:0} to{width:100%} }`}</style>
    </div>
  )
}

// ─── Mode Chip ────────────────────────────────────────────────────────────────
function ModeChip({ isSingle, isScanned, isWistia, isWebPage, urls, parseError, videoCount = 0 }) {
  if (!urls.length || parseError) return null

  if (isScanned) {
    const imgPart = urls.length > 0 ? `${urls.length.toLocaleString()} image${urls.length !== 1 ? 's' : ''}` : null
    const vidPart = videoCount > 0 ? `${videoCount} video${videoCount !== 1 ? 's' : ''}` : null
    const summary = [imgPart, vidPart].filter(Boolean).join(' · ')
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          Found {summary} on this page
        </span>
      </div>
    )
  }

  if (!isSingle) return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--violet)' }} />
      <span className="text-xs font-medium" style={{ color: 'var(--violet)' }}>
        Sequence &middot; {urls.length.toLocaleString()} images
      </span>
    </div>
  )

  if (isWistia) return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa' }} />
      <span className="text-xs font-medium" style={{ color: '#60a5fa' }}>Wistia video</span>
    </div>
  )

  if (isWebPage) return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />
      <span className="text-xs font-medium" style={{ color: '#d97706' }}>Web page — use Scan to find images &amp; videos</span>
    </div>
  )

  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-3)' }} />
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>Direct image link</span>
    </div>
  )
}

// ─── Video Card ───────────────────────────────────────────────────────────────
const PLATFORM_LABELS = { wistia: 'Wistia', youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', direct: 'Direct' }
const PLATFORM_COLORS = { wistia: '#60a5fa', youtube: '#f87171', vimeo: '#a78bfa', loom: '#34d399', direct: 'var(--text-2)' }
const CAN_DOWNLOAD    = new Set(['wistia', 'direct'])

function VideoCard({ video }) {
  const [resolving, setResolving]   = useState(false)
  const [resolved, setResolved]     = useState(video.directUrl ? video : null)
  const [err, setErr]               = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [dlProgress, setDlProgress]   = useState(null)

  const label = PLATFORM_LABELS[video.platform] || video.platform
  const color = PLATFORM_COLORS[video.platform] || 'var(--text-2)'
  const canDownload = CAN_DOWNLOAD.has(video.platform)

  async function handleResolve() {
    if (!video.wistiaHash) return
    setResolving(true); setErr(null)
    try {
      const res  = await fetch(`/api/resolve-wistia?hash=${video.wistiaHash}`)
      const data = await res.json()
      if (!res.ok || data.error) { setErr(data.error || 'Could not resolve'); return }
      setResolved(data)
    } catch (e) { setErr(e.message) }
    finally { setResolving(false) }
  }

  async function handleDownload() {
    if (!resolved?.directUrl || downloading) return
    setDownloading(true); setDlProgress(null); setErr(null)
    try {
      const res = await fetch(resolved.directUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const contentLength = res.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength, 10) : null
      const reader = res.body.getReader()
      const chunks = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (total) setDlProgress(Math.round((received / total) * 100))
      }
      const blob = new Blob(chunks, { type: 'video/mp4' })
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `${resolved.title || video.title || 'video'}.mp4`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
    } catch (e) { setErr(`Download failed: ${e.message}`) }
    finally { setDownloading(false); setDlProgress(null) }
  }

  const title   = resolved?.title || video.title || null
  const dims    = resolved?.width && resolved?.height ? `${resolved.width}×${resolved.height}` : null
  const dur     = resolved?.duration ? `${Math.floor(resolved.duration / 60)}:${String(resolved.duration % 60).padStart(2,'0')}` : null
  const meta    = [dims, dur].filter(Boolean).join(' · ')

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      {/* Platform badge */}
      <div className="flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${color}18`, color }}>
        {label}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>
          {title || (video.wistiaHash ? `Wistia ${video.wistiaHash}` : video.url)}
        </p>
        {meta && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{meta}</p>}
        {err && <p className="text-[11px] mt-0.5 text-rose-400">{err}</p>}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex flex-col gap-1.5">
        {canDownload && resolved?.directUrl ? (
          <>
            {/* Preview — streams in new tab */}
            <a href={resolved.directUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}>
              Preview ↗
            </a>
            {/* Download — fetches directly from CDN in-browser, saves as .mp4 */}
            <button onClick={handleDownload} disabled={downloading}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'var(--gradient-button)', minWidth: '80px' }}>
              {downloading
                ? (dlProgress !== null ? `${dlProgress}%` : 'Downloading…')
                : <><Ic.Download /> Download</>}
            </button>
          </>
        ) : canDownload && video.wistiaHash ? (
          <button onClick={handleResolve} disabled={resolving}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 border"
            style={{ borderColor: color, color, background: `${color}12` }}>
            {resolving ? '…' : 'Resolve'}
          </button>
        ) : (
          <a href={video.embedUrl || video.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}>
            Watch ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Result Item ──────────────────────────────────────────────────────────────
function ResultItem({ status, onPreview }) {
  const [copied, setCopied] = useState(false)
  const filename = getFilenameFromUrl(status.imageUrl || status.url, 0)
    .replace(/\.[^.]+$/, '') // strip extension for display
    || status.url.split('/').pop()

  async function copy(e) {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(status.url); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch {}
  }

  return (
    <li
      onClick={status.ok && onPreview ? onPreview : undefined}
      className="group flex items-center gap-3 py-2 border-b last:border-0 transition-colors"
      style={{ borderColor: 'var(--border)', cursor: status.ok && onPreview ? 'pointer' : 'default' }}>

      {/* Thumbnail / status indicator */}
      <div className="w-8 h-8 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        {status.ok && status.previewUrl
          ? <img src={status.previewUrl} className="w-full h-full object-cover" alt="" />
          : <span className="text-red-400 text-[10px] font-bold">✗</span>}
      </div>

      {/* Name + reason */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: status.ok ? 'var(--text-1)' : 'var(--text-2)' }}>
          {filename}
        </p>
        {!status.ok && (
          <p className="text-[11px] text-red-400 mt-0.5">{status.reason}</p>
        )}
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {status.ok && (
          <div className="flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-colors" title="View image"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => e.currentTarget.style.color='var(--violet)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
            <Ic.Eye />
          </div>
        )}
        <button onClick={copy} title={copied ? 'Copied' : 'Copy URL'}
          className="flex items-center justify-center w-6 h-6 rounded transition-colors"
          style={{ color: copied ? '#10b981' : 'var(--text-3)' }}
          onMouseEnter={e => { if (!copied) e.currentTarget.style.color='var(--violet)' }}
          onMouseLeave={e => { if (!copied) e.currentTarget.style.color='var(--text-3)' }}>
          {copied ? <Ic.Check /> : <Ic.Copy />}
        </button>
        <a href={status.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          title="Open in new tab"
          className="flex items-center justify-center w-6 h-6 rounded transition-colors"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => e.currentTarget.style.color='var(--violet)'}
          onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
          <Ic.ExternalLink />
        </a>
      </div>
    </li>
  )
}

// ─── URL action button (Paste when empty, Copy when has content) ──────────────
function UrlActionBtn({ template, onPaste, disabled }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(template)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }

  const btnStyle = {
    borderColor: 'var(--border)',
    color: copied ? '#10b981' : 'var(--text-2)',
    background: 'var(--surface)',
  }

  if (template) {
    return (
      <button onClick={handleCopy} disabled={disabled}
        className="flex items-center gap-1.5 px-3 border-l text-xs font-medium flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={btnStyle}
        onMouseEnter={e => { if (!copied) e.currentTarget.style.color = 'var(--violet)' }}
        onMouseLeave={e => { if (!copied) e.currentTarget.style.color = 'var(--text-2)' }}>
        {copied ? <Ic.Check /> : <Ic.Copy />}
        <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
      </button>
    )
  }

  return (
    <button onClick={onPaste} disabled={disabled}
      className="flex items-center gap-1.5 px-3 border-l text-xs font-medium flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={btnStyle}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--violet)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}>
      <Ic.Clipboard />
      <span className="hidden sm:inline">Paste</span>
    </button>
  )
}

// ─── URL Preview List (expandable) ───────────────────────────────────────────
function UrlPreviewList({ urls }) {
  const [expanded, setExpanded] = useState(false)
  const MAX = 3
  const visible = expanded || urls.length <= MAX + 1 ? urls : urls.slice(0, MAX)
  const hiddenCount = urls.length - MAX - 1

  return (
    <div className="rounded-xl px-3 py-2.5 text-[11px] font-mono space-y-0.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      {visible.map((u, i) =>
        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
          className="truncate block hover:underline"
          style={{ color: 'var(--text-2)' }} title={u}>{u}</a>
      )}
      {!expanded && hiddenCount > 0 && (
        <>
          <button onClick={() => setExpanded(true)}
            className="text-left hover:underline"
            style={{ color: 'var(--violet)' }}>
            + {hiddenCount.toLocaleString()} more — tap to expand
          </button>
          <a href={urls[urls.length - 1]} target="_blank" rel="noopener noreferrer"
            className="truncate block hover:underline"
            style={{ color: 'var(--text-2)' }} title={urls[urls.length - 1]}>
            {urls[urls.length - 1]}
          </a>
        </>
      )}
      {expanded && urls.length > MAX + 1 && (
        <button onClick={() => setExpanded(false)}
          className="text-left hover:underline"
          style={{ color: 'var(--text-3)' }}>
          collapse
        </button>
      )}
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ content, children }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <span onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(o => !o)} className="cursor-default">
        {children}
      </span>
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed pointer-events-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {content}
        </div>
      )}
    </span>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
const MAX_PREV = 3

export default function App() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark' } catch { return false }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch {}
  }, [dark])

  const [autoSave, setAutoSave] = useState(() => {
    try { return localStorage.getItem('autoSave') !== 'false' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('autoSave', autoSave) } catch {}
  }, [autoSave])

  const [template, setTemplate]     = useState('')
  const [urls, setUrls]             = useState([])
  const [parseError, setParseError] = useState(null)
  const [isSingle, setIsSingle]     = useState(false)
  const [isScanned, setIsScanned]   = useState(false)
  const [isWistia, setIsWistia]     = useState(false)
  const [isWebPage, setIsWebPage]   = useState(false)

  const [phase, setPhase]           = useState('idle')
  const [scanError, setScanError]   = useState(null)
  const [scannedVideos, setScannedVideos] = useState([])
  const [scannedImages, setScannedImages] = useState([])  // {url, score}[]
  const [qualityOnly, setQualityOnly]     = useState(true)
  const [statuses, setStatuses]     = useState([])
  const [done, setDone]             = useState(0)
  const [zipPct, setZipPct]         = useState(null)
  const [lbIdx, setLbIdx]           = useState(null)

  const abortRef   = useRef(null)
  const objUrlsRef = useRef([])

  const WISTIA_URL_RE  = /wistia\.com\/(?:embed\/medias|medias)\/([a-zA-Z0-9]+)/
  const IMG_EXT_RE_SMP = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i

  const onInput = useCallback((value) => {
    setTemplate(value)
    setScanError(null)
    setIsScanned(false)
    setScannedVideos([])
    setScannedImages([])
    const { error, urls: parsed, single } = parseUrlTemplate(value)
    setParseError(error)
    setUrls(parsed)
    setIsSingle(single)
    const wistia = single && WISTIA_URL_RE.test(value)
    setIsWistia(wistia)
    // A single URL that doesn't look like a direct image file is a web page
    setIsWebPage(single && !wistia && !IMG_EXT_RE_SMP.test(value.split('?')[0]))
  }, [])

  const onPaste = useCallback(async () => {
    try { const t = await navigator.clipboard.readText(); if (t) onInput(t.trim()) } catch {}
  }, [onInput])

  const onScan = useCallback(async () => {
    if (!urls[0] || phase !== 'idle') return
    setPhase('scanning'); setScanError(null)
    try {
      const res  = await fetch(`/api/scan?url=${encodeURIComponent(urls[0])}`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setScanError('Scan API is unavailable on this deployment. Use the Vercel URL for full-page scans; GitHub Pages can only serve the static app.')
        setPhase('idle')
        return
      }

      const data = await res.json()
      if (!res.ok || data.error) { setScanError(data.error || 'Scan failed'); setPhase('idle'); return }
      const hasImages = data.images?.length > 0
      const hasVideos = data.videos?.length > 0
      if (!hasImages && !hasVideos) {
        setScanError("Nothing found in the page source. If you see a video in your browser, it may load via JavaScript — try pasting the Wistia media URL directly.")
        setPhase('idle'); return
      }
      setScannedImages(data.images || [])
      setUrls([]); setIsSingle(false); setIsScanned(true); setQualityOnly(true)
      setScannedVideos(data.videos || [])
    } catch (e) { setScanError(`Scan failed: ${e.message}`) }
    finally { setPhase('idle') }
  }, [urls, phase])

  const onDownload = useCallback(async () => {
    const targetUrls = isScanned
      ? (qualityOnly ? scannedImages.filter(i => i.score > 0).map(i => i.url) : scannedImages.map(i => i.url))
      : urls
    if (!targetUrls.length || phase === 'fetching' || phase === 'zipping') return
    const ctrl = new AbortController(); abortRef.current = ctrl
    setPhase('fetching'); setStatuses([]); setDone(0); setZipPct(null); setLbIdx(null)
    objUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); objUrlsRef.current = []

    const results = await fetchWithPool(targetUrls, {
      signal: ctrl.signal,
      onProgress: d => setDone(d),
      onResult: (i, result) => {
        let r = result
        if (result.ok) {
          const pu = URL.createObjectURL(result.blob)
          objUrlsRef.current.push(pu)
          r = { ...result, previewUrl: pu }
        }
        setStatuses(prev => { const n = [...prev]; n[i] = r; return n })
      },
    })
    if (ctrl.signal.aborted) { setPhase('idle'); return }
    if (autoSave) {
      setPhase('zipping')
      await buildAndDownloadZip(results, 'images.zip', setZipPct)
    }
    setPhase('done')
  }, [urls, scannedImages, qualityOnly, isScanned, phase, autoSave])

  // Re-ZIP images already in memory — no network call, instant
  const onSaveAgain = useCallback(async () => {
    const successful = statuses.filter(s => s?.ok && s.blob)
    if (!successful.length) return
    setPhase('zipping')
    setZipPct(null)
    await buildAndDownloadZip(successful, 'images.zip', setZipPct)
    setPhase('done')
  }, [statuses])

  const onRetryFailed = useCallback(async () => {
    const failedIndices = statuses.map((s, i) => (s && !s.ok) ? i : -1).filter(i => i >= 0)
    if (!failedIndices.length || phase === 'fetching' || phase === 'zipping') return
    const failedUrls = failedIndices.map(i => statuses[i].url)
    const ctrl = new AbortController(); abortRef.current = ctrl
    setPhase('fetching'); setDone(0); setZipPct(null)

    const results = await fetchWithPool(failedUrls, {
      signal: ctrl.signal,
      onProgress: d => setDone(d),
      onResult: (relIdx, result) => {
        const origIdx = failedIndices[relIdx]
        let r = result
        if (result.ok) {
          const pu = URL.createObjectURL(result.blob)
          objUrlsRef.current.push(pu)
          r = { ...result, previewUrl: pu }
        }
        setStatuses(prev => { const n = [...prev]; n[origIdx] = r; return n })
      },
    })
    if (ctrl.signal.aborted) { setPhase('idle'); return }
    setPhase('zipping')
    await buildAndDownloadZip(results.filter(Boolean), 'images-retry.zip', setZipPct)
    setPhase('done')
  }, [statuses, phase])

  const onCancel = useCallback(() => { abortRef.current?.abort(); setPhase('idle') }, [])
  const onClear  = useCallback(() => {
    abortRef.current?.abort()
    objUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); objUrlsRef.current = []
    setTemplate(''); setUrls([]); setParseError(null); setScanError(null)
    setIsSingle(false); setIsScanned(false); setIsWistia(false); setIsWebPage(false); setScannedVideos([])
    setScannedImages([]); setQualityOnly(true)
    setPhase('idle'); setStatuses([]); setDone(0); setZipPct(null); setLbIdx(null)
  }, [])

  useEffect(() => () => { objUrlsRef.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const ok       = statuses.filter(s => s?.ok).length
  const fail     = statuses.filter(s => s && !s.ok).length
  const isBusy   = phase === 'fetching' || phase === 'zipping'
  const previews = statuses.filter(s => s?.ok && s.previewUrl)

  // Derived from scannedImages — used after a scan instead of template-driven urls
  const qualityImages = scannedImages.filter(i => i.score > 0).map(i => i.url)
  const allScanImages = scannedImages.map(i => i.url)
  const displayUrls   = isScanned ? (qualityOnly ? qualityImages : allScanImages) : urls

  const pct      = displayUrls.length > 0 ? Math.round((done / displayUrls.length) * 100) : 0

  const previewList = urls.length <= MAX_PREV + 1
    ? urls : [...urls.slice(0, MAX_PREV), null, urls[urls.length - 1]]

  return (
    <div className="min-h-screen transition-colors duration-200">

      {/* Dark mode toggle */}
      <button onClick={() => setDark(d => !d)}
        className="fixed top-4 right-4 z-40 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
        {dark ? <><Ic.Sun /><span className="hidden sm:inline">Light</span></> : <><Ic.Moon /><span className="hidden sm:inline">Dark</span></>}
      </button>

      {/* Lightbox */}
      {lbIdx !== null && previews.length > 0 && (
        <Lightbox images={previews} startIndex={Math.min(lbIdx, previews.length - 1)} onClose={() => setLbIdx(null)} />
      )}

      <div className="flex flex-col items-center px-3 sm:px-4 pt-20 pb-16 min-h-screen" style={{ background: 'var(--gradient-bg)' }}>
        <div className="w-full max-w-[480px] md:max-w-[520px]">

          {/* ── Header ── */}
          <header className="mb-8 text-center">
            <div className="inline-flex flex-col items-center gap-[3px] mb-5" aria-hidden="true">
              <span className="block w-5 h-[3px] rounded-full" style={{ background: 'var(--gradient-button)' }} />
              <span className="block w-3.5 h-[3px] rounded-full opacity-60" style={{ background: 'var(--gradient-button)' }} />
              <span className="block w-2 h-[3px] rounded-full opacity-30" style={{ background: 'var(--gradient-button)' }} />
            </div>
            <h1 className="text-[32px] font-semibold tracking-tight leading-tight gradient-text" style={{ letterSpacing: '-0.5px' }}>
              Image &amp; Video Downloader
            </h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Paste a URL to download images or videos — single file, numbered series, or full page scan.
            </p>
          </header>

          {/* ── Input card ── */}
          <div className="rounded-2xl border overflow-hidden transition-shadow duration-200 input-card" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="p-5 space-y-3">

              {/* URL input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '0.08em' }}>URL</label>
                <div className="flex rounded-xl border overflow-hidden transition-all duration-150 input-inner"
                  style={{ borderColor: parseError ? '#f43f5e' : 'var(--border-2)', background: 'var(--bg)' }}>
                  <input
                    type="text"
                    value={template}
                    onChange={e => onInput(e.target.value)}
                    placeholder="Paste image URL, video URL, or page URL…"
                    disabled={isBusy || phase === 'scanning'}
                    className="flex-1 px-3.5 py-2.5 text-sm bg-transparent outline-none min-w-0 disabled:opacity-50"
                    style={{ color: 'var(--text-1)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '13px' }}
                    onKeyDown={e => {
                      // Enter → trigger primary action
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (!urls.length || !!parseError || isBusy || phase === 'scanning') return
                        if (phase === 'done' && ok > 0) onSaveAgain()
                        else if (phase === 'idle') onDownload()
                        return
                      }
                      // Smart bracket auto-complete: [ → [existing-content|] before next . or /
                      if (e.key === '[' || e.key === '(') {
                        const closing = e.key === '[' ? ']' : ')'
                        const inp = e.target
                        const s = inp.selectionStart
                        const en = inp.selectionEnd
                        e.preventDefault()
                        const before   = template.slice(0, s)
                        const selected = template.slice(s, en)
                        const after    = template.slice(en)
                        let next, cursorPos
                        if (selected.length > 0) {
                          // Wrap selected text with brackets, cursor after ]
                          next = before + e.key + selected + closing + after
                          cursorPos = s + selected.length + 2
                        } else {
                          // Find next . or / after cursor and place ] before it
                          // e.g. image|1.jpg → image[1|].jpg
                          const delimIdx = after.search(/[./]/)
                          if (delimIdx >= 0) {
                            next = before + e.key + after.slice(0, delimIdx) + closing + after.slice(delimIdx)
                            cursorPos = s + 1 + delimIdx  // cursor right before ]
                          } else {
                            next = before + e.key + after + closing
                            cursorPos = s + 1 + after.length  // cursor right before ] at end
                          }
                        }
                        onInput(next)
                        requestAnimationFrame(() => inp.setSelectionRange(cursorPos, cursorPos))
                      }
                    }}
                  />
                  {template && !isBusy && phase !== 'scanning' && (
                    <button
                      onClick={() => onInput('')}
                      title="Clear URL"
                      className="flex items-center justify-center w-8 flex-shrink-0 transition-colors"
                      style={{ color: 'var(--text-3)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                      <Ic.Close cls="w-3.5 h-3.5" />
                    </button>
                  )}
                  <UrlActionBtn
                    template={template}
                    onPaste={onPaste}
                    disabled={isBusy || phase === 'scanning'}
                  />
                </div>

                {/* Mode chip — only renders when there's URL content */}
                {template && (
                  <div className="flex items-center">
                    <ModeChip isSingle={isSingle} isScanned={isScanned} isWistia={isWistia} isWebPage={isWebPage} urls={displayUrls} parseError={parseError} videoCount={scannedVideos.length} />
                  </div>
                )}
              </div>

              {/* Image quality filter chips — only after a scan */}
              {isScanned && scannedImages.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <button onClick={() => setQualityOnly(true)}
                    className="px-2 rounded-full text-[11px] font-medium transition-all"
                    style={{
                      padding: '3px 8px',
                      background: qualityOnly ? 'var(--gradient-button)' : 'var(--bg)',
                      color: qualityOnly ? 'white' : 'var(--text-2)',
                      border: qualityOnly ? '1px solid transparent' : '1px solid var(--border)',
                      boxShadow: qualityOnly ? '0 1px 6px rgba(124,58,237,0.25)' : 'none',
                    }}>
                    Quality ({qualityImages.length})
                  </button>
                  <button onClick={() => setQualityOnly(false)}
                    className="px-2 rounded-full text-[11px] font-medium transition-all"
                    style={{
                      padding: '3px 8px',
                      background: !qualityOnly ? 'var(--gradient-button)' : 'var(--bg)',
                      color: !qualityOnly ? 'white' : 'var(--text-2)',
                      border: !qualityOnly ? '1px solid transparent' : '1px solid var(--border)',
                      boxShadow: !qualityOnly ? '0 1px 6px rgba(124,58,237,0.25)' : 'none',
                    }}>
                    All ({allScanImages.length})
                  </button>
                </div>
              )}

              {/* URL sequence preview */}
              {urls.length > 1 && !parseError && (
                <UrlPreviewList urls={urls} />
              )}

              {/* Errors */}
              {parseError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ color: '#e11d48', background: 'rgba(244,63,94,0.08)' }}>{parseError}</p>
              )}
              {scanError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ color: '#d97706', background: 'rgba(217,119,6,0.08)' }}>{scanError}</p>
              )}

              {/* Scanning indicator */}
              {phase === 'scanning' && (
                <div className="flex items-center gap-2.5 text-xs py-2" style={{ color: 'var(--text-2)' }}>
                  <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Looking for images on this page…
                </div>
              )}

              {/* Download progress */}
              {isBusy && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                      {phase === 'zipping' ? `Packaging ZIP…` : `Downloading ${done} of ${displayUrls.length}`}
                    </span>
                    <span className="text-xs tabular-nums font-medium" style={{ color: 'var(--text-1)' }}>
                      {phase === 'zipping' ? `${zipPct ?? 0}%` : `${pct}%`}
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all duration-150"
                      style={{ width: `${phase === 'zipping' ? (zipPct ?? 0) : pct}%`, background: 'var(--violet)' }} />
                  </div>
                </div>
              )}

              {/* Done banner */}
              {phase === 'done' && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border"
                  style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#10b981' }}>
                      <Ic.Check />
                    </div>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {ok} image{ok !== 1 ? 's' : ''} ready{fail > 0 ? ` · ${fail} failed` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {fail > 0 && (
                      <button onClick={onRetryFailed}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#f59e0b' }}>
                        ↻ Retry {fail} failed
                      </button>
                    )}
                    {previews.length > 0 && (
                      <button onClick={() => setLbIdx(0)}
                        className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                        style={{ color: 'var(--violet)' }}>
                        <Ic.Eye /> Preview
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons — only when there is a URL or ongoing operation */}
              {(template || phase !== 'idle' || statuses.length > 0) && <div className="space-y-2">

                {/* ── Phase: done — save from memory (no re-download) ── */}
                {phase === 'done' && ok > 0 && (
                  <button onClick={onSaveAgain}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all"
                    style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                    <Ic.Download /> Save as ZIP ({ok} image{ok !== 1 ? 's' : ''})
                  </button>
                )}

                {/* ── Phase: busy — show progress in button ── */}
                {isBusy && (
                  <button disabled
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white opacity-80 cursor-not-allowed"
                    style={{ background: 'var(--gradient-button)' }}>
                    {phase === 'zipping' ? 'Packaging ZIP…' : `Downloading… ${done}/${displayUrls.length}`}
                  </button>
                )}

                {/* ── Phase: idle — sequence or scanned ── */}
                {phase === 'idle' && (!isSingle || isScanned) && displayUrls.length > 0 && !parseError && (
                  <button onClick={onDownload} disabled={phase === 'scanning'}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                    <Ic.Download /> Download All ({displayUrls.length.toLocaleString()})
                  </button>
                )}

                {/* ── Phase: idle — single URL: context-aware buttons ── */}
                {phase === 'idle' && isSingle && !isScanned && urls.length > 0 && !parseError && (
                  isWebPage ? (
                    // Web page → Scan is the primary action; Download is secondary fallback
                    <div className="space-y-2">
                      <button onClick={onScan}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all"
                        style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                        <Ic.Scan /> Scan Page
                      </button>
                      <button onClick={onDownload}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor='var(--border-2)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                        <Ic.Download /> Try direct download instead
                      </button>
                    </div>
                  ) : (
                    // Direct image or Wistia → Download is primary
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={onDownload}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-all"
                        style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                        <Ic.Download /> {isWistia ? 'Resolve Video' : 'Download'}
                      </button>
                      <button onClick={onScan}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all border"
                        style={{ background: 'var(--violet-bg)', borderColor: 'var(--violet-border)', color: 'var(--violet)' }}
                        onMouseEnter={e => e.currentTarget.style.opacity='0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                        <Ic.Scan /> Scan Page
                      </button>
                    </div>
                  )
                )}

                {/* Secondary: cancel / clear */}
                <div className="flex gap-2">
                  {isBusy && (
                    <button onClick={onCancel}
                      className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all border"
                      style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)', background: 'transparent' }}>
                      Cancel
                    </button>
                  )}
                  {(phase === 'done' || statuses.length > 0) && !isBusy && phase !== 'scanning' && (
                    <button onClick={onClear}
                      className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor='var(--border-2)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                      Clear
                    </button>
                  )}
                </div>
              </div>}

              {/* Divider */}
              <div className="border-t" style={{ borderColor: 'var(--border)' }} />

              {/* Hint — always visible, detail behind tooltip */}
              <div className="flex items-center gap-1.5">
                <Tooltip content={
                  <div className="space-y-1.5">
                    <p><span className="font-medium" style={{ color: 'var(--text-1)' }}>Numbered series:</span> use <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg)' }}>photo[1–50].jpg</code></p>
                    <p><span className="font-medium" style={{ color: 'var(--text-1)' }}>Full page scan:</span> paste a page URL and tap Scan</p>
                    <p><span className="font-medium" style={{ color: 'var(--text-1)' }}>Wistia video:</span> paste a Wistia URL to download as MP4</p>
                  </div>
                }>
                  <span className="inline-flex items-center gap-1 text-[11px] select-none" style={{ color: 'var(--text-3)' }}>
                    <span className="text-[13px] leading-none">ⓘ</span>
                    <span>Supports images, videos, numbered sequences, and full-page scans</span>
                  </span>
                </Tooltip>
              </div>

              {/* Auto-save toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Auto-save</p>
                  <Tooltip content="When on, the ZIP downloads automatically when all images finish. When off, you can preview first and save manually.">
                    <span className="text-[13px] leading-none select-none" style={{ color: 'var(--text-3)' }}>ⓘ</span>
                  </Tooltip>
                </div>
                <button
                  onClick={() => setAutoSave(a => !a)}
                  title={autoSave ? 'Auto-save on' : 'Auto-save off'}
                  className="flex-shrink-0 w-9 h-5 rounded-full relative transition-colors duration-200 ml-4"
                  style={{ background: autoSave ? 'var(--violet)' : 'var(--border-2)' }}>
                  <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200"
                    style={{ left: '2px', transform: autoSave ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Videos found via scan ── */}
          {scannedVideos.length > 0 && (
            <div className="mt-3 rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                  Videos <span style={{ color: 'var(--text-3)' }}>·</span> {scannedVideos.length}
                </span>
                <Tooltip content="Wistia videos resolve to a direct MP4 download. YouTube and Vimeo open for preview only.">
                  <span className="text-[13px] leading-none select-none" style={{ color: 'var(--text-3)' }}>?</span>
                </Tooltip>
              </div>
              {scannedVideos.map((v, i) => <VideoCard key={i} video={v} />)}
            </div>
          )}

          {/* ── Results ── */}
          {statuses.filter(Boolean).length > 0 && (
            <div className="mt-3 rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Downloads</span>
                <div className="flex items-center gap-3">
                  {ok > 0 && (
                    <button onClick={() => previews.length > 0 && setLbIdx(0)}
                      className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                      style={{ color: previews.length > 0 ? 'var(--violet)' : '#10b981' }}>
                      {previews.length > 0 && <Ic.Eye />}
                      {ok} saved
                    </button>
                  )}
                  {fail > 0 && <span className="text-xs font-medium text-rose-500">{fail} failed</span>}
                </div>
              </div>
              <ul className="px-4 max-h-64 overflow-y-auto scrollbar-thin">
                {statuses.filter(Boolean).map((s, i) => {
                  const pi = previews.findIndex(p => p.previewUrl === s.previewUrl)
                  return <ResultItem key={i} status={s} onPreview={pi >= 0 ? () => setLbIdx(pi) : null} />
                })}
              </ul>
            </div>
          )}

          <p className="mt-8 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
            Everything runs in your browser — no files leave your machine.
          </p>
        </div>
      </div>
    </div>
  )
}
