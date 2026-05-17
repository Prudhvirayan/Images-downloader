import { useState, useRef, useCallback, useEffect, useMemo, createContext, useContext } from 'react'
import { parseUrlTemplate, getFilenameFromUrl } from './utils/urlParser'
import { fetchWithPool, buildAndDownloadZip } from './utils/fetcher'
import { LANGUAGES, makeT, getLegalSections } from './i18n/index.js'
import { useForm } from '@formspree/react'

const T = createContext(null)
const useT = () => useContext(T)

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
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Zap: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Monitor: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  Link: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  Save: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
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
const YTDLP_PLATFORM_LABELS = {
  youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', twitter: 'Twitter/X',
  x: 'X (Twitter)', vimeo: 'Vimeo', dailymotion: 'Dailymotion', reddit: 'Reddit', facebook: 'Facebook',
}

function ModeChip({ isSingle, isScanned, isWistia, isYtdlp, isWebPage, urls, parseError, videoCount = 0 }) {
  const t = useT()
  if (!urls.length || parseError) return null

  if (isScanned) {
    const imgPart = urls.length > 0 ? `${urls.length.toLocaleString()} image${urls.length !== 1 ? 's' : ''}` : null
    const vidPart = videoCount > 0 ? `${videoCount} video${videoCount !== 1 ? 's' : ''}` : null
    const summary = [imgPart, vidPart].filter(Boolean).join(' · ')
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          {t('mode_found', { summary })}
        </span>
      </div>
    )
  }

  if (!isSingle) return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--violet)' }} />
      <span className="text-xs font-medium" style={{ color: 'var(--violet)' }}>
        {t('mode_sequence', { n: urls.length.toLocaleString() })}
      </span>
    </div>
  )

  if (isWistia) return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa' }} />
      <span className="text-xs font-medium" style={{ color: '#60a5fa' }}>{t('mode_wistia')}</span>
    </div>
  )

  if (isYtdlp) return null  // info card shown below input instead

  if (isWebPage) return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />
      <span className="text-xs font-medium" style={{ color: '#d97706' }}>{t('mode_webpage')}</span>
    </div>
  )

  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-3)' }} />
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{t('mode_direct')}</span>
    </div>
  )
}

// ─── Video Card ───────────────────────────────────────────────────────────────
const PLATFORM_LABELS = { wistia: 'Wistia', youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', direct: 'Direct' }
const PLATFORM_COLORS = { wistia: '#60a5fa', youtube: '#f87171', vimeo: '#a78bfa', loom: '#34d399', direct: 'var(--text-2)' }
const CAN_DOWNLOAD    = new Set(['wistia', 'direct'])

function VideoCard({ video }) {
  const t = useT()
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
              {t('card_preview')}
            </a>
            {/* Download — fetches directly from CDN in-browser, saves as .mp4 */}
            <button onClick={handleDownload} disabled={downloading}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'var(--gradient-button)', minWidth: '80px' }}>
              {downloading
                ? (dlProgress !== null ? `${dlProgress}%` : t('card_downloading'))
                : <><Ic.Download /> {t('card_download')}</>}
            </button>
          </>
        ) : canDownload && video.wistiaHash ? (
          <button onClick={handleResolve} disabled={resolving}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 border"
            style={{ borderColor: color, color, background: `${color}12` }}>
            {resolving ? '…' : t('card_resolve')}
          </button>
        ) : (
          <a href={video.embedUrl || video.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}>
            {t('card_watch')}
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
  const t = useT()
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
        title={copied ? 'Copied!' : t('btn_copy')}
        className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: copied ? '#10b981' : 'var(--text-3)' }}
        onMouseEnter={e => { if (!copied) e.currentTarget.style.color = 'var(--violet)' }}
        onMouseLeave={e => { if (!copied) e.currentTarget.style.color = 'var(--text-3)' }}>
        {copied ? <Ic.Check /> : <Ic.Copy />}
      </button>
    )
  }

  return (
    <button onClick={onPaste} disabled={disabled}
      title={t('btn_paste')}
      className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ color: 'var(--text-3)' }}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--violet)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
      <Ic.Clipboard />
    </button>
  )
}

// ─── URL Preview List (expandable) ───────────────────────────────────────────
function UrlPreviewList({ urls }) {
  const t = useT()
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
            {t('expand_more', { n: hiddenCount.toLocaleString() })}
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
          {t('collapse')}
        </button>
      )}
    </div>
  )
}

// ─── FileCard ─────────────────────────────────────────────────────────────────
const FILE_CATEGORY_COLORS = { audio: '#34d399', document: '#60a5fa' }
const FILE_EXT_LABELS = { pdf: 'PDF', mp3: 'MP3', wav: 'WAV', flac: 'FLAC', aac: 'AAC', m4a: 'M4A', ogg: 'OGG', opus: 'Opus', wma: 'WMA', epub: 'EPUB', docx: 'DOCX', doc: 'DOC', xlsx: 'XLSX', xls: 'XLS', pptx: 'PPTX', ppt: 'PPT', zip: 'ZIP', rar: 'RAR' }

function FileCard({ file }) {
  const t = useT()
  const label = FILE_EXT_LABELS[file.ext] || file.ext?.toUpperCase() || 'FILE'
  const color = FILE_CATEGORY_COLORS[file.category] || 'var(--text-2)'
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(file.url)}`
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${color}18`, color }}>{label}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }} title={file.name}>{file.name}</p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-3)' }} title={file.url}>{file.url}</p>
      </div>
      <div className="flex-shrink-0 flex gap-1.5">
        <a href={file.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--border-2)', color: 'var(--text-2)' }}>
          {t('card_open')}
        </a>
        <a href={proxyUrl} download={file.name}
          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white"
          style={{ background: 'var(--gradient-button)' }}>
          <Ic.Download /> {t('card_save')}
        </a>
      </div>
    </div>
  )
}

// ─── Legal Disclaimer ─────────────────────────────────────────────────────────
// ─── Legal Full Page ─────────────────────────────────────────────────────────
function LegalPage({ onBack, lang, setLang, dark, setDark }) {
  const t = useT()
  const SECTIONS = getLegalSections(lang)

  return (
    <div className="app-shell min-h-screen">
      <div className="motion-bg" aria-hidden="true">
        <span className="beam beam-a" /><span className="beam beam-b" />
      </div>
      <div className="page-wrap px-4 sm:px-8 py-10">
        <div className="mx-auto" style={{ maxWidth: '720px' }}>

          {/* Mini nav */}
          <div className="flex items-center justify-between mb-12">
            <button onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => e.currentTarget.style.color='var(--text-1)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
              {t('back_app')}
            </button>
            <div className="flex items-center gap-2">
              <LanguagePicker lang={lang} setLang={setLang} />
              <button onClick={() => setDark(d => !d)}
                className="utility-pill flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                {dark ? <><Ic.Sun /><span className="hidden sm:inline">Light</span></> : <><Ic.Moon /><span className="hidden sm:inline">Dark</span></>}
              </button>
            </div>
          </div>

          {/* Page header */}
          <div className="mb-12 pb-8 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5 select-none"
              style={{ background: 'var(--violet-bg)', color: 'var(--violet)', fontSize: '12px', fontWeight: 600 }}>
              {t('legal_tag')}
            </div>
            <h1 className="font-bold leading-tight mb-3" style={{ fontSize: 'clamp(26px,4vw,38px)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              {t('legal_page_title')}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('legal_updated')}</p>
          </div>

          {/* Sections — document style, no individual boxes */}
          <div>
            {SECTIONS.map(({ title, body, bullets, footer }, idx) => (
              <div key={title} className="py-8 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex gap-6 sm:gap-10">
                  {/* Section number accent */}
                  <span className="flex-shrink-0 w-6 text-right text-[11px] font-mono pt-1 select-none"
                    style={{ color: 'var(--violet)', opacity: 0.5 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold mb-3" style={{ fontSize: '15px', color: 'var(--text-1)' }}>
                      {title.replace(/^\d+\.\s/, '')}
                    </h2>
                    <p className="leading-[1.75]" style={{ fontSize: '14px', color: 'var(--text-2)' }}>{body}</p>
                    {bullets && (
                      <ul className="mt-3 space-y-2">
                        {bullets.map(b => (
                          <li key={b} className="flex items-start gap-2.5 leading-relaxed"
                            style={{ fontSize: '14px', color: 'var(--text-2)' }}>
                            <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0"
                              style={{ background: 'var(--violet)', opacity: 0.55 }} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    {footer && (
                      <p className="mt-3 text-[13px] italic" style={{ color: 'var(--text-3)' }}>{footer}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs mt-12 pb-6" style={{ color: 'var(--text-3)' }}>
            © 2026 Idone. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Legal Summary Card ──────────────────────────────────────────────────────
function LegalSummary({ onReadFull }) {
  const t = useT()
  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ background: 'var(--violet-bg)', borderColor: 'var(--violet-border)' }}>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--violet)' }}><Ic.Lock /></span>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--violet)' }}>{t('legal_summary_title')}</span>
        </div>
        <button onClick={onReadFull}
          className="text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity"
          style={{ color: 'var(--violet)' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
          {t('legal_read')}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div className="px-5 py-4 space-y-2.5" style={{ background: 'var(--surface)' }}>
        {[t('legal_p1'), t('legal_p2'), t('legal_p3')].map((point, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex-shrink-0 mt-1 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--violet-bg)', color: 'var(--violet)', border: '1px solid var(--violet-border)' }}>
              {i + 1}
            </span>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{point}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Download Confirmation Modal ─────────────────────────────────────────────
function DownloadConfirmModal({ onConfirm, onCancel }) {
  const t = useT()
  const [checked, setChecked] = useState(true)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="rounded-2xl border shadow-2xl p-7 w-full max-w-md"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}>
        <p className="font-semibold mb-1" style={{ fontSize: '15px', color: 'var(--text-1)' }}>{t('before_dl_title')}</p>
        <p className="text-[13px] mb-5 leading-relaxed" style={{ color: 'var(--text-3)' }}>{t('before_dl_desc')}</p>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer accent-violet-600" />
          <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{t('before_dl_check')}</span>
        </label>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel}
            className="flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }}>
            {t('btn_cancel')}
          </button>
          <button onClick={onConfirm} disabled={!checked}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--gradient-button)' }}>
            {t('btn_continue_dl')}
          </button>
        </div>
      </div>
    </div>
  )
}

function LegalDisclaimer() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
        style={{ color: 'var(--text-2)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}>
        <div className="flex items-center gap-2.5">
          <span style={{ color: 'var(--violet)', opacity: 0.7 }}><Ic.Lock /></span>
          <span className="font-semibold text-[13px] tracking-wide">{t('legal_header')}</span>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 leading-relaxed border-t text-[12px]" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
          <div className="pt-3 text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-3)' }}>Last updated: May 2026</div>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>1. User Responsibility</p>
            <p>By using this tool, you acknowledge and agree that you are solely responsible for ensuring that you have all appropriate rights, licenses, authorizations, or permissions before downloading, reproducing, distributing, or otherwise using any content obtained through this service, particularly for commercial purposes.</p>
          </section>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>2. No Verification of Rights</p>
            <p>This platform does not verify, validate, or confirm the ownership, copyright status, licensing terms, or usage rights of any third-party content accessible through this service. The technical capability to access or download a file does not imply that you are legally entitled to do so. Availability through this tool is not a representation that any content is free, public domain, or licensed for reuse.</p>
          </section>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>3. Copyright & Intellectual Property</p>
            <p>A significant portion of content available online is protected by copyright, trademark, and other intellectual property laws. Downloading, reproducing, or distributing protected material without authorization from the rights holder may constitute infringement and may expose you to civil liability or criminal penalties. Commercial use of third-party content typically requires explicit licensing from the rights holder.</p>
          </section>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>4. Limitation of Liability</p>
            <p>This platform and its operators expressly disclaim all liability for any misuse, copyright infringement, violation of third-party terms of service, unauthorized distribution, or any other unlawful use of content downloaded through this service. The tool is provided "as is," without warranties of any kind, express or implied. Use is entirely at your own risk.</p>
          </section>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>5. Third-Party Terms of Service</p>
            <p>Many websites and platforms prohibit automated access, scraping, or downloading of their content through their Terms of Service. You are solely responsible for reviewing and complying with the applicable terms of service of any website or platform from which you download content using this tool.</p>
          </section>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>6. DMCA Compliance</p>
            <p>This service respects intellectual property rights and operates in compliance with the Digital Millennium Copyright Act (DMCA) and other applicable copyright laws. This tool does not circumvent any technical protection measures (DRM). Content that is not publicly accessible without authentication cannot be downloaded through this service.</p>
          </section>

          <section>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>7. Permitted Use</p>
            <p>This tool is intended for lawful purposes including accessing content you own or have the right to use, downloading freely licensed or public domain material, personal archiving of legally accessible content, and academic or research use consistent with applicable fair use or fair dealing provisions. These exceptions are narrow and do not constitute general authorization to download protected content.</p>
          </section>
        </div>
      )}
    </div>
  )
}

// ─── Feedback Modal ───────────────────────────────────────────────────────────
function FeedbackModal({ onClose }) {
  const [state, handleSubmit] = useForm('xykvgyrw')
  const [msg, setMsg] = useState('')
  const MAX = 1000
  const remaining = MAX - msg.length
  const showCount = remaining <= 50

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="rounded-2xl border shadow-2xl p-7 w-full max-w-lg"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
        onClick={e => e.stopPropagation()}>
        {state.succeeded ? (
          <div className="text-center space-y-4 py-4">
            <p className="text-3xl">🙏</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              Thanks for your feedback! We'll use it to make the tool better.
            </p>
            <button onClick={onClose} className="w-full rounded-xl py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--gradient-button)' }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Help us improve</p>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Share a bug, a missing feature, or anything we should know.
              </p>
            </div>

            <div className="relative">
              <textarea
                name="message"
                required
                rows={5}
                value={msg}
                onChange={e => setMsg(e.target.value.slice(0, MAX))}
                placeholder="What's on your mind? Any features missing, something broken, or ideas to improve..."
                autoFocus
                className="w-full rounded-xl px-4 py-3 text-sm outline-none border resize-none"
                style={{ background: 'var(--bg)', borderColor: 'var(--border-2)', color: 'var(--text-1)', lineHeight: '1.6' }} />
              {showCount && (
                <span className="absolute bottom-3 right-3.5 text-[11px] tabular-nums pointer-events-none"
                  style={{ color: remaining <= 20 ? '#f43f5e' : 'var(--text-3)' }}>
                  {remaining}
                </span>
              )}
            </div>

            <input type="hidden" name="_subject" value="Feedback — Download Anything" />

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-2)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                Cancel
              </button>
              <button type="submit"
                disabled={state.submitting || msg.trim().length === 0}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--gradient-button)' }}>
                {state.submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function FeedbackPanel({ onOpen }) {
  return (
    <section className="feedback-panel">
      <div>
        <p className="eyebrow">Help us improve</p>
        <h2>Shape the next version</h2>
        <p>
          Tell us what felt confusing, what source failed, or which download workflow should feel faster.
        </p>
      </div>
      <button onClick={onOpen} className="secondary-action">
        Send feedback
      </button>
    </section>
  )
}

// ─── Language Picker ──────────────────────────────────────────────────────────
function LanguagePicker({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="utility-pill flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium border transition-all"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
        🌐 <span className="hidden sm:inline">{LANGUAGES[lang]?.label ?? 'English'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 rounded-2xl border shadow-xl overflow-hidden"
          style={{ width: '13rem', background: 'var(--surface)', borderColor: 'var(--border)' }}>
          {Object.entries(LANGUAGES).map(([code, { label, flag }]) => (
            <button key={code} onClick={() => { setLang(code); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors"
              style={{
                color: code === lang ? 'var(--violet)' : 'var(--text-1)',
                fontWeight: code === lang ? 600 : 400,
                background: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{flag}</span> {label}
              {code === lang && <span className="ml-auto text-[11px]" style={{ color: 'var(--violet)' }}>✓</span>}
            </button>
          ))}
        </div>
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

  useEffect(() => {
    document.title = 'Download Anything - Idone'
  }, [])

  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // ── Client-side routing ──
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = (path) => { window.history.pushState(null, '', path); setCurrentPath(path) }

  // ── Legal confirmation (once per browser, stored in localStorage) ──
  const legalConfirmedRef = useRef(
    (() => { try { return localStorage.getItem('idone_legal') === '1' } catch { return false } })()
  )
  const [pendingLegalAction, setPendingLegalAction] = useState(null) // 'download' | 'scan'

  // Cursor-following glow — lerp animation for a smooth "liquid" follow effect
  useEffect(() => {
    let animX = window.innerWidth / 2, animY = 120
    let targetX = animX, targetY = animY
    let rafId
    const lerp = (a, b, t) => a + (b - a) * t
    const tick = () => {
      animX = lerp(animX, targetX, 0.07)
      animY = lerp(animY, targetY, 0.07)
      document.documentElement.style.setProperty('--glow-x', `${animX}px`)
      document.documentElement.style.setProperty('--glow-y', `${animY}px`)
      rafId = requestAnimationFrame(tick)
    }
    const onMove = (e) => { targetX = e.clientX; targetY = e.clientY }
    window.addEventListener('mousemove', onMove, { passive: true })
    rafId = requestAnimationFrame(tick)
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(rafId) }
  }, [])

  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('lang')
      if (saved && LANGUAGES[saved]) return saved
      const browser = navigator.language?.split('-')[0] || 'en'
      return LANGUAGES[browser] ? browser : 'en'
    } catch { return 'en' }
  })
  useEffect(() => { try { localStorage.setItem('lang', lang) } catch {} }, [lang])
  const t = useMemo(() => makeT(lang), [lang])

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
  const [isYtdlp, setIsYtdlp]           = useState(false)
  const [ytdlpMode, setYtdlpMode]       = useState('video')
  const [ytdlpQuality, setYtdlpQuality] = useState('best')
  const [ytdlpAudioFmt, setYtdlpAudioFmt] = useState('m4a')
  const [ytdlpInfo, setYtdlpInfo]       = useState(null)   // fetched video metadata + formats
  const [ytdlpLoading, setYtdlpLoading] = useState(false)

  const [phase, setPhase]           = useState('idle')
  const [scanError, setScanError]   = useState(null)
  const [scannedVideos, setScannedVideos] = useState([])
  const [scannedImages, setScannedImages] = useState([])  // {url, score}[]
  const [scannedFiles, setScannedFiles]   = useState([])  // {url, name, ext, category}[]
  const [activeTab, setActiveTab]         = useState('quality') // 'videos'|'quality'|'other'|'files'
  const [statuses, setStatuses]     = useState([])
  const [done, setDone]             = useState(0)
  const [zipPct, setZipPct]         = useState(null)
  const [lbIdx, setLbIdx]           = useState(null)
  const phCurRef            = useRef(0)
  const [phCur, setPhCur]   = useState(0)
  const [phPrev, setPhPrev] = useState(null)

  const PLACEHOLDERS = [
    t('url_placeholder'),
    t('ph_seq'),
    t('ph_pdf'),
  ]
  useEffect(() => {
    if (template) { setPhPrev(null); return }
    let t1
    const id = setInterval(() => {
      // Phase 1: exit current text (show exit animation only)
      setPhPrev(phCurRef.current)
      // Phase 2: after exit completes, swap index and play enter animation
      t1 = setTimeout(() => {
        const next = (phCurRef.current + 1) % 3
        phCurRef.current = next
        setPhCur(next)    // new text index
        setPhPrev(null)   // clear prev → triggers enter animation for new text
      }, 320) // matches ph-exit duration (0.3s) + small buffer
    }, 3800)
    return () => { clearInterval(id); clearTimeout(t1) }
  }, [template])

  // Auto-fetch video info when a yt-dlp platform URL is detected (debounced 600ms)
  useEffect(() => {
    setYtdlpInfo(null)
    setYtdlpLoading(false)
    if (!isYtdlp || !urls[0]) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setYtdlpLoading(true)
      try {
        const res = await fetch(`/api/extract?url=${encodeURIComponent(urls[0])}&mode=info`, { signal: ctrl.signal })
        const ct  = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return // API not available locally — silent fallback
        const data = await res.json()
        if (data.error || ctrl.signal.aborted) return
        setYtdlpInfo(data)
        if (data.video_formats?.length) setYtdlpQuality(data.video_formats[0].key)
        if (data.audio_formats?.length) setYtdlpAudioFmt(data.audio_formats[0].key)
      } catch { /* silently ignore — show static fallback chips */ }
      finally { if (!ctrl.signal.aborted) setYtdlpLoading(false) }
    }, 600)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [isYtdlp, template])

  const abortRef   = useRef(null)
  const objUrlsRef = useRef([])

  const WISTIA_URL_RE    = /wistia\.com\/(?:embed\/medias|medias)\/([a-zA-Z0-9]+)/
  const YTDLP_URL_RE     = /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/|tiktok\.com\/@.+\/video|instagram\.com\/(?:reel|p|tv)\/|(?:twitter|x)\.com\/.+\/status\/|vimeo\.com\/\d|dailymotion\.com\/video\/|reddit\.com\/.+\/comments\/|facebook\.com\/.+\/video|fb\.watch\/)/i
  const IMG_EXT_RE_SMP   = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i
  const AUDIO_EXT_RE_SMP = /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)(\?.*)?$/i
  const DOC_EXT_RE_SMP   = /\.(pdf|epub|docx?|xlsx?|pptx?|zip|rar)(\?.*)?$/i

  const onInput = useCallback((value) => {
    setTemplate(value)
    setScanError(null)
    setIsScanned(false)
    setScannedVideos([])
    setScannedImages([])
    setScannedFiles([])
    setActiveTab('quality')
    setYtdlpInfo(null)
    const { error, urls: parsed, single } = parseUrlTemplate(value)
    setParseError(error)
    setUrls(parsed)
    setIsSingle(single)
    const wistia  = single && WISTIA_URL_RE.test(value)
    const ytdlp   = single && !wistia && YTDLP_URL_RE.test(value)
    setIsWistia(wistia)
    setIsYtdlp(ytdlp)
    const path0 = value.split('?')[0]
    const isDirectFile = IMG_EXT_RE_SMP.test(path0) || AUDIO_EXT_RE_SMP.test(path0) || DOC_EXT_RE_SMP.test(path0)
    setIsWebPage(single && !wistia && !ytdlp && !isDirectFile)
  }, [])

  const onPaste = useCallback(async () => {
    try { const t = await navigator.clipboard.readText(); if (t) onInput(t.trim()) } catch {}
  }, [onInput])

  const onScan = useCallback(async () => {
    if (!legalConfirmedRef.current) { setPendingLegalAction('scan'); return }
    if (!urls[0] || phase !== 'idle') return
    setPhase('scanning'); setScanError(null)
    try {
      const res  = await fetch(`/api/proxy?mode=scan&url=${encodeURIComponent(urls[0])}`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setScanError(t('err_unavailable'))
        setPhase('idle')
        return
      }

      const data = await res.json()
      if (!res.ok || data.error) { setScanError(data.error || 'Scan failed'); setPhase('idle'); return }
      const hasImages = data.images?.length > 0
      const hasVideos = data.videos?.length > 0
      if (!hasImages && !hasVideos) {
        setScanError(t('err_nothing_found'))
        setPhase('idle'); return
      }
      const imgs = data.images || []
      const vids = data.videos || []
      const fils = data.files  || []
      setScannedImages(imgs)
      setScannedVideos(vids)
      setScannedFiles(fils)
      setUrls([]); setIsSingle(false); setIsScanned(true)
      // default tab: videos if any, else quality if any, else files, else other
      const hasVids = vids.length > 0
      const hasQual = imgs.some(i => i.score > 0)
      const hasFils = fils.length > 0
      setActiveTab(hasVids ? 'videos' : hasQual ? 'quality' : hasFils ? 'files' : 'other')
    } catch (e) {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      setScanError(isLocal
        ? 'Scan failed: local API server is not reachable. Start the app with npm run dev, not vite by itself.'
        : `Scan failed: ${e.message}`)
    }
    finally { setPhase('idle') }
  }, [urls, phase])

  // ── yt-dlp extraction ──────────────────────────────────────────────────────
  const onExtract = useCallback(async () => {
    if (!legalConfirmedRef.current) { setPendingLegalAction('download'); return }
    if (!urls[0] || phase !== 'idle') return
    setPhase('scanning'); setScanError(null)
    try {
      const qs = new URLSearchParams({
        url: urls[0],
        mode: ytdlpMode,
        quality: ytdlpQuality,
        audio_fmt: ytdlpAudioFmt,
      })
      const res = await fetch(`/api/extract?${qs}`)
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        setScanError(t('err_unavailable'))
        setPhase('idle'); return
      }
      const data = await res.json()
      if (!res.ok || data.error) {
        setScanError(data.error || 'Extraction failed')
        setPhase('idle'); return
      }
      // ytdlpInfo already has the card — no separate meta state needed

      const ext      = data.ext || (ytdlpMode === 'audio' ? 'm4a' : 'mp4')
      const filename = `${(data.title || 'video').replace(/[^\w\s-]/g, '').trim()}.${ext}`

      // YouTube uses IP-bound signed URLs — the extraction IP (Vercel server) matches
      // the proxy server IP on Vercel, so proxy works. For other platforms, the CDN
      // URL is open, so we can try direct browser download to avoid the proxy size limit.
      const isYoutube = data.platform === 'youtube'

      if (!isYoutube) {
        // Direct browser download — works for TikTok, Vimeo, Dailymotion, Reddit, etc.
        setPhase('done')
        const a = document.createElement('a')
        a.href = data.url
        a.download = filename
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      }

      // YouTube: proxy through Vercel — same server IP as extraction, but limited to ~45s / ~50MB
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(data.url)}`
      const ctrl = new AbortController(); abortRef.current = ctrl
      setPhase('fetching'); setStatuses([]); setDone(0)
      const r = await fetch(proxyUrl, { signal: ctrl.signal })
      if (!r.ok) throw new Error(`YouTube download failed (${r.status}). Large videos may exceed server limits — try a lower quality.`)
      const blob = await r.blob()
      if (ctrl.signal.aborted) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setPhase('done')
    } catch (e) {
      if (!abortRef.current?.signal.aborted) setScanError(e.message || 'Extraction failed')
      setPhase('idle')
    }
  }, [urls, phase, ytdlpMode, ytdlpQuality, ytdlpAudioFmt])

  const onDownload = useCallback(async () => {
    if (!legalConfirmedRef.current) { setPendingLegalAction('download'); return }
    const targetUrls = isScanned
      ? (activeTab === 'quality' ? scannedImages.filter(i => i.score > 0).map(i => i.url)
         : activeTab === 'other'  ? scannedImages.filter(i => i.score <= 0).map(i => i.url)
         : scannedImages.map(i => i.url))
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
  }, [urls, scannedImages, activeTab, isScanned, phase, autoSave])

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
    setIsSingle(false); setIsScanned(false); setIsWistia(false); setIsWebPage(false); setIsYtdlp(false); setYtdlpInfo(null); setYtdlpLoading(false); setScannedVideos([])
    setScannedImages([]); setScannedFiles([]); setActiveTab('quality')
    setPhase('idle'); setStatuses([]); setDone(0); setZipPct(null); setLbIdx(null)
  }, [])

  useEffect(() => () => { objUrlsRef.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const ok       = statuses.filter(s => s?.ok).length
  const fail     = statuses.filter(s => s && !s.ok).length
  const isBusy   = phase === 'fetching' || phase === 'zipping'
  const previews = statuses.filter(s => s?.ok && s.previewUrl)

  // Derived from scannedImages — used after a scan instead of template-driven urls
  const qualityImages = scannedImages.filter(i => i.score > 0).map(i => i.url)
  const otherImages   = scannedImages.filter(i => i.score <= 0).map(i => i.url)
  const allScanImages = scannedImages.map(i => i.url)
  const displayUrls   = isScanned
    ? (activeTab === 'quality' ? qualityImages : activeTab === 'other' ? otherImages : allScanImages)
    : urls

  const pct      = displayUrls.length > 0 ? Math.round((done / displayUrls.length) * 100) : 0

  const previewList = urls.length <= MAX_PREV + 1
    ? urls : [...urls.slice(0, MAX_PREV), null, urls[urls.length - 1]]

  // Legal confirmation handler
  const handleLegalConfirm = () => {
    try { localStorage.setItem('idone_legal', '1') } catch {}
    legalConfirmedRef.current = true
    const action = pendingLegalAction
    setPendingLegalAction(null)
    if (action === 'download') onDownload()
    if (action === 'scan') onScan()
  }

  // Route: /legal page
  if (currentPath === '/legal') {
    return (
      <T.Provider value={t}>
        <LegalPage onBack={() => navigate('/')} lang={lang} setLang={setLang} dark={dark} setDark={setDark} />
      </T.Provider>
    )
  }

  return (
    <T.Provider value={t}>
    {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    {pendingLegalAction && (
      <DownloadConfirmModal
        onConfirm={handleLegalConfirm}
        onCancel={() => setPendingLegalAction(null)}
      />
    )}
    <div className="app-shell min-h-screen transition-colors duration-200">

      {/* Lightbox */}
      {lbIdx !== null && previews.length > 0 && (
        <Lightbox images={previews} startIndex={Math.min(lbIdx, previews.length - 1)} onClose={() => setLbIdx(null)} />
      )}

      <div className="motion-bg" aria-hidden="true">
        <span className="beam beam-a" />
        <span className="beam beam-b" />
      </div>

      <div className="page-wrap min-h-screen px-4 sm:px-6 lg:px-10 pt-5 pb-16">
        <nav className="top-nav">
          <a className="brand-lockup" href="/" aria-label="Idone home">
            <img src="/favicon.svg" alt="" className="brand-logo" />
            <span>Idone</span>
          </a>
          <div className="top-actions">
            <button onClick={() => setFeedbackOpen(true)}
              className="utility-pill flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium border transition-all"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
              <span>Feedback</span>
            </button>
            <LanguagePicker lang={lang} setLang={setLang} />
            <button onClick={() => setDark(d => !d)}
              className="utility-pill flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all border"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
              {dark ? <><Ic.Sun /><span className="hidden sm:inline">Light</span></> : <><Ic.Moon /><span className="hidden sm:inline">Dark</span></>}
            </button>
          </div>
        </nav>

        <main className="mx-auto w-full max-w-[860px] pt-[clamp(28px,5vh,60px)] pb-12 px-4">

          {/* ── Hero ── */}
          <header className="text-center mb-10">
            {/* Badge — decorative label, not interactive */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full mb-6 select-none"
              style={{ background: 'var(--violet-bg)', color: 'var(--violet)', fontSize: '12px', fontWeight: 600 }}>
              <span>✦</span>
              <span>{t('badge')}</span>
            </div>

            <h1 className="font-bold leading-[1.04] mb-5"
              style={{ fontSize: 'clamp(44px, 8vw, 72px)', letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
              {t('hero_a')} <span className="gradient-text">{t('hero_b')}</span>
              {t('hero_c') && <><br />{t('hero_c')}</>}
            </h1>

            <p className="mx-auto" style={{ color: 'var(--text-2)', fontSize: 'clamp(15px,1.5vw,16px)', lineHeight: '1.6', maxWidth: '580px' }}>
              {t('subtitle')}
            </p>
          </header>

          {/* ── Input + results ── */}
          <div className="space-y-3">

              {/* URL input row — no card wrapper, floats on the page */}
              <div className="flex items-center rounded-2xl border transition-all duration-150 input-inner px-4 gap-2.5"
                style={{ minHeight: '58px', borderColor: parseError ? '#f43f5e' : 'var(--border-2)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}>
                  <span className="flex-shrink-0" style={{ color: 'var(--text-3)' }}><Ic.Link /></span>
                  {/* Animated placeholder overlay + input wrapper */}
                  <div className="flex-1 relative overflow-hidden" style={{ minHeight: '46px', display: 'flex', alignItems: 'center' }}>
                  {!template && (
                    phPrev !== null
                      /* EXIT phase: only old text visible, sliding up */
                      ? <span key={`exit-${phPrev}`} aria-hidden="true"
                          className="absolute left-0 top-1/2 whitespace-nowrap pointer-events-none select-none"
                          style={{ color: 'var(--text-3)', fontSize: '15px',
                                   animation: 'ph-exit 0.3s cubic-bezier(0.4,0,1,1) forwards' }}>
                          {PLACEHOLDERS[phPrev]}
                        </span>
                      /* ENTER/IDLE phase: only new text visible, sliding in from below */
                      : <span key={phCur} aria-hidden="true"
                          className="absolute left-0 top-1/2 whitespace-nowrap pointer-events-none select-none"
                          style={{ color: 'var(--text-3)', fontSize: '15px',
                                   animation: 'ph-enter 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }}>
                          {PLACEHOLDERS[phCur]}
                        </span>
                  )}
                  <input
                    type="text"
                    value={template}
                    onChange={e => onInput(e.target.value)}
                    placeholder=""
                    disabled={isBusy || phase === 'scanning'}
                    className="w-full py-3.5 bg-transparent outline-none disabled:opacity-50"
                    style={{ color: 'var(--text-1)', fontSize: '15px' }}
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
                  </div>{/* end animated placeholder wrapper */}
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
                    <ModeChip isSingle={isSingle} isScanned={isScanned} isWistia={isWistia} isYtdlp={isYtdlp} isWebPage={isWebPage} urls={isScanned ? allScanImages : displayUrls} parseError={parseError} videoCount={scannedVideos.length} />
                  </div>
                )}

              {/* Scan result tabs: Videos / Photos / Site assets / Files */}
              {isScanned && (scannedImages.length > 0 || scannedVideos.length > 0 || scannedFiles.length > 0) && (() => {
                const chipStyle = (tab) => ({
                  padding: '3px 10px',
                  background: activeTab === tab ? 'var(--gradient-button)' : 'var(--bg)',
                  color: activeTab === tab ? 'white' : 'var(--text-2)',
                  border: activeTab === tab ? '1px solid transparent' : '1px solid var(--border)',
                  boxShadow: activeTab === tab ? '0 1px 6px rgba(124,58,237,0.25)' : 'none',
                })
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {scannedVideos.length > 0 && (
                      <button onClick={() => setActiveTab('videos')} className="rounded-full text-[11px] font-medium transition-all" style={chipStyle('videos')}>
                        {t('tab_videos', { n: scannedVideos.length })}
                      </button>
                    )}
                    {qualityImages.length > 0 && (
                      <button onClick={() => setActiveTab('quality')} className="rounded-full text-[11px] font-medium transition-all" style={chipStyle('quality')}>
                        {t('tab_photos', { n: qualityImages.length })}
                      </button>
                    )}
                    {otherImages.length > 0 && (
                      <button onClick={() => setActiveTab('other')} className="rounded-full text-[11px] font-medium transition-all" style={chipStyle('other')}>
                        {t('tab_assets', { n: otherImages.length })}
                      </button>
                    )}
                    {scannedFiles.length > 0 && (
                      <button onClick={() => setActiveTab('files')} className="rounded-full text-[11px] font-medium transition-all" style={chipStyle('files')}>
                        {t('tab_files', { n: scannedFiles.length })}
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Videos tab content — inline in main card */}
              {isScanned && activeTab === 'videos' && scannedVideos.length > 0 && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {scannedVideos.map((v, i) => <VideoCard key={i} video={v} />)}
                </div>
              )}

              {/* Files tab content */}
              {isScanned && activeTab === 'files' && scannedFiles.length > 0 && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {scannedFiles.map((f, i) => <FileCard key={i} file={f} />)}
                </div>
              )}

              {/* URL / scan result preview — images tabs only */}
              {((isScanned && activeTab !== 'videos' && activeTab !== 'files' && displayUrls.length > 0) || (urls.length > 1 && !isScanned)) && !parseError && (
                <UrlPreviewList urls={isScanned ? displayUrls : urls} />
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
                  {t('status_scanning')}
                </div>
              )}

              {/* Download progress */}
              {isBusy && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                      {phase === 'zipping' ? t('status_packaging') : t('status_downloading', { done, total: displayUrls.length })}
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
                      {t('status_ready', { n: ok })}{fail > 0 ? ` ${t('status_failed', { n: fail })}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {fail > 0 && (
                      <button onClick={onRetryFailed}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#f59e0b' }}>
                        {t('btn_retry', { n: fail })}
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
                    style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)', transition: 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                    <Ic.Download /> {t('btn_save_zip', { n: ok })}
                  </button>
                )}

                {/* ── Phase: busy — show progress in button ── */}
                {isBusy && (
                  <button disabled
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white opacity-80 cursor-not-allowed"
                    style={{ background: 'var(--gradient-button)' }}>
                    {phase === 'zipping' ? t('status_packaging') : t('status_downloading', { done, total: displayUrls.length })}
                  </button>
                )}

                {/* ── Phase: idle — sequence or scanned (not videos tab) ── */}
                {phase === 'idle' && (!isSingle || isScanned) && displayUrls.length > 0 && !parseError && activeTab !== 'videos' && activeTab !== 'files' && (
                  <button onClick={onDownload} disabled={phase === 'scanning'}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)', transition: 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                    <Ic.Download /> {activeTab === 'other' ? t('btn_download_assets', { n: displayUrls.length.toLocaleString() }) : t('btn_download_photos', { n: displayUrls.length.toLocaleString() })}
                  </button>
                )}

                {/* ── Phase: idle — yt-dlp platform (YouTube, TikTok, etc.) ── */}
                {phase === 'idle' && isYtdlp && urls.length > 0 && !parseError && (
                  <div className="space-y-2.5">

                    {/* Video info card — shown once fetched */}
                    {ytdlpInfo && (
                      <div className="flex items-center gap-3 p-3 rounded-xl border"
                        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                        {ytdlpInfo.thumbnail && (
                          <img src={ytdlpInfo.thumbnail} alt=""
                            className="w-16 h-11 rounded-lg object-cover flex-shrink-0"
                            onError={e => e.currentTarget.style.display='none'} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-tight truncate" style={{ color: 'var(--text-1)' }}>
                            {ytdlpInfo.title}
                          </p>
                          {ytdlpInfo.uploader && (
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                              {ytdlpInfo.uploader}
                              {ytdlpInfo.duration && ` · ${Math.floor(ytdlpInfo.duration/60)}:${String(ytdlpInfo.duration%60).padStart(2,'0')}`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Loading state */}
                    {ytdlpLoading && !ytdlpInfo && (
                      <div className="flex items-center gap-2 py-1 px-1">
                        <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>Fetching video info…</span>
                      </div>
                    )}

                    {/* Mode + quality chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Video / Audio mode */}
                      {[{ id: 'video', label: '🎬 Video' }, { id: 'audio', label: '🎵 Audio' }].map(({ id, label }) => (
                        <button key={id} onClick={() => setYtdlpMode(id)}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-all"
                          style={{
                            background: ytdlpMode === id ? 'var(--gradient-button)' : 'var(--bg)',
                            borderColor: ytdlpMode === id ? 'transparent' : 'var(--border)',
                            color: ytdlpMode === id ? '#fff' : 'var(--text-2)',
                          }}>
                          {label}
                        </button>
                      ))}
                      <span className="text-[10px]" style={{ color: 'var(--border-2)' }}>·</span>

                      {/* Dynamic quality chips from fetched info, or static fallback */}
                      {ytdlpMode === 'video'
                        ? (ytdlpInfo?.video_formats || [
                            {key:'best',label:'Best'},{key:'1080',label:'1080p'},
                            {key:'720',label:'720p'},{key:'480',label:'480p'},
                          ]).map(f => (
                            <button key={f.key} onClick={() => setYtdlpQuality(f.key)}
                              className="rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all"
                              style={{
                                background: ytdlpQuality === f.key ? 'var(--violet-bg)' : 'transparent',
                                borderColor: ytdlpQuality === f.key ? 'var(--violet)' : 'var(--border)',
                                color: ytdlpQuality === f.key ? 'var(--violet)' : 'var(--text-3)',
                              }}>
                              {f.label}
                            </button>
                          ))
                        : (ytdlpInfo?.audio_formats || [
                            {key:'m4a',label:'M4A'},{key:'webm',label:'WebM'},{key:'best',label:'Best'},
                          ]).map(f => (
                            <button key={f.key} onClick={() => setYtdlpAudioFmt(f.key)}
                              className="rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all"
                              style={{
                                background: ytdlpAudioFmt === f.key ? 'var(--violet-bg)' : 'transparent',
                                borderColor: ytdlpAudioFmt === f.key ? 'var(--violet)' : 'var(--border)',
                                color: ytdlpAudioFmt === f.key ? 'var(--violet)' : 'var(--text-3)',
                              }}>
                              {f.label}
                            </button>
                          ))
                      }
                    </div>

                    {/* Extract button */}
                    <button onClick={onExtract} disabled={ytdlpLoading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-wait"
                      style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)', transition: 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease' }}
                      onMouseEnter={e => { if (!ytdlpLoading) { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' } }}
                      onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                      <Ic.Download />
                      {ytdlpMode === 'audio' ? 'Download Audio' : 'Download Video'}
                    </button>
                  </div>
                )}

                {/* ── Phase: idle — single URL: context-aware buttons ── */}
                {phase === 'idle' && isSingle && !isScanned && !isYtdlp && urls.length > 0 && !parseError && (
                  isWebPage ? (
                    // Web page → Scan is the primary action; Download is secondary fallback
                    <div className="space-y-2">
                      <button onClick={onScan}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all"
                        style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)', transition: 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                        <Ic.Scan /> {t('btn_scan')}
                      </button>
                      <button onClick={onDownload}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor='var(--border-2)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                        <Ic.Download /> {t('btn_try_direct')}
                      </button>
                    </div>
                  ) : (
                    // Direct image or Wistia → Download is primary
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={onDownload}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-all"
                        style={{ background: 'var(--gradient-button)', boxShadow: 'var(--gradient-btn-shadow)', transition: 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                        <Ic.Download /> {isWistia ? t('card_resolve') : t('card_download')}
                      </button>
                      <button onClick={onScan}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all border"
                        style={{ background: 'var(--violet-bg)', borderColor: 'var(--violet-border)', color: 'var(--violet)' }}
                        onMouseEnter={e => e.currentTarget.style.opacity='0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                        <Ic.Scan /> {t('btn_scan')}
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
                      {t('btn_cancel')}
                    </button>
                  )}
                  {(phase === 'done' || statuses.length > 0) && !isBusy && phase !== 'scanning' && (
                    <button onClick={onClear}
                      className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor='var(--border-2)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                      {t('btn_clear')}
                    </button>
                  )}
                </div>
              </div>}

              {/* Auto-save toggle — toggle first (proximity), single line */}
              <div className="flex items-center gap-3 px-1 py-2">
                <button
                  onClick={() => setAutoSave(a => !a)}
                  title={autoSave ? 'Auto-save on' : 'Auto-save off'}
                  className="flex-shrink-0 w-10 h-[22px] rounded-full relative transition-colors duration-200"
                  style={{ background: autoSave ? 'var(--violet)' : 'var(--border-2)' }}>
                  <span
                    className="absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200"
                    style={{ left: '3px', transform: autoSave ? 'translateX(18px)' : 'translateX(0)' }} />
                </button>
                {/* <span className="flex-shrink-0" style={{ color: 'var(--violet)' }}><Ic.Save /></span> */}
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{t('autosave_new')}</p>
                <Tooltip content={t('autosave_tooltip')}>
                  <span className="text-[13px] leading-none select-none cursor-default" style={{ color: 'var(--text-3)' }}>ⓘ</span>
                </Tooltip>
              </div>
            </div>

          {/* Videos are now shown inline inside the main card as a tab */}

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

          {/* ── Feature strip ── */}
          <div className="flex items-center justify-center gap-0 mt-16">
            {[
              { Icon: Ic.Shield, lk: 'feat_safe',    slk: 'feat_safe_sub',    color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
              { Icon: Ic.Lock,   lk: 'feat_private', slk: 'feat_private_sub', color: 'var(--violet)', bg: 'var(--violet-bg)' },
              { Icon: Ic.Zap,    lk: 'feat_fast',    slk: 'feat_fast_sub',    color: '#5b8ef7', bg: 'rgba(91,142,247,0.10)' },
            ].flatMap(({ Icon, lk, slk, color, bg }, i) => [
              i > 0 && <div key={`sep-${i}`} className="hidden sm:block w-px self-stretch mx-6 my-1" style={{ background: 'var(--border)' }} />,
              <div key={lk} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                  <span style={{ color }}><Icon /></span>
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>{t(lk)}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{t(slk)}</p>
                </div>
              </div>,
            ])}
          </div>

          {/* ── How it works ── */}
          <div className="mt-14">
            <h2 className="text-center font-semibold mb-7" style={{ fontSize: '16px', color: 'var(--text-1)' }}>
              {t('how_works')}
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { Icon: Ic.Link,     tk: 'how_step1_title', dk: 'how_step1_desc', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.20)' },
                { Icon: Ic.Scan,     tk: 'how_step2_title', dk: 'how_step2_desc', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  glow: 'rgba(96,165,250,0.20)'  },
                { Icon: Ic.Download, tk: 'how_step3_title', dk: 'how_step3_desc', color: '#34d399', bg: 'rgba(52,211,153,0.12)',  glow: 'rgba(52,211,153,0.20)'  },
              ].map(({ Icon, tk, dk, color, bg, glow }, i) => (
                <div key={tk} className="relative flex flex-col items-center text-center p-5 rounded-2xl border"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                  {i < 2 && (
                    <span className="hidden sm:block absolute -right-5 top-1/2 -translate-y-1/2 text-[10px] font-medium z-10 select-none"
                      style={{ color: 'var(--text-3)', letterSpacing: '2px' }}>···→</span>
                  )}
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 flex-shrink-0"
                    style={{ background: bg, boxShadow: `0 0 20px ${glow}` }}>
                    <span style={{ color }}><Icon /></span>
                  </div>
                  <p className="text-[13px] font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>{t(tk)}</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>{t(dk)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-12 space-y-4">
            <LegalSummary onReadFull={() => navigate('/legal')} />
            <p className="text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
              {t('footer')}
            </p>
          </div>

        </main>
      </div>
    </div>
    </T.Provider>
  )
}
