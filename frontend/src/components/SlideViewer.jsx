import { useEffect, useRef, useState } from 'react'

export default function SlideViewer({ state, token, slideIndex = state.current_slide, preview = false,
  lecturer = false, active = false, send, mode = 'standard', onModeChange, controlsOpen, onToggleControls }) {
  const slide = state.slides[slideIndex] || state.slides[0]
  const [image, setImage] = useState(null)
  const [imageError, setImageError] = useState(false)
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [space, setSpace] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(100)
  const [fullscreen, setFullscreen] = useState(false)
  const [notice, setNotice] = useState('')
  const root = useRef(null)
  const viewport = useRef(null)
  const fullscreenButton = useRef(null)
  const wasFullscreen = useRef(false)
  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    setImage(null); setImageError(false); setNatural({ width: 0, height: 0 })
    if (slide.image_url) {
      fetch(slide.image_url, { headers: { Authorization: `Bearer ${token}` } })
        .then(response => { if (!response.ok) throw new Error('Preview unavailable'); return response.blob() })
        .then(blob => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setImage(objectUrl) } })
        .catch(() => { if (!cancelled) setImageError(true) })
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [slide.image_url, token])
  useEffect(() => {
    const element = viewport.current
    const observer = new ResizeObserver(() => setSpace({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { viewport.current?.scrollTo(0, 0) }, [slideIndex, state.presentation_id])
  useEffect(() => { if (mode !== 'expanded') setNotice('') }, [mode])
  useEffect(() => {
    function changed() {
      const entered = document.fullscreenElement === root.current
      setFullscreen(entered)
      if (wasFullscreen.current && !entered) {
        onModeChange?.('standard')
        fullscreenButton.current?.focus()
      }
      wasFullscreen.current = entered
    }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [onModeChange])
  useEffect(() => {
    const escape = event => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement === root.current) document.exitFullscreen().catch(() => setNotice('Use the browser full-screen exit control to return.'))
      else if (mode === 'expanded') onModeChange?.('standard')
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [mode, onModeChange])
  async function toggleFullscreen() {
    setNotice('')
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen()
      else if (root.current.requestFullscreen && document.fullscreenEnabled !== false) await root.current.requestFullscreen()
      else throw new Error('unsupported')
    } catch {
      onModeChange?.('expanded')
      setNotice('Full screen is unavailable in this browser. Expanded view is open instead.')
    }
  }
  function fit() { setZoom(100); viewport.current?.scrollTo(0, 0) }
  const fitScale = natural.width ? Math.min(Math.max(1, space.width - 24) / natural.width,
    Math.max(1, space.height - 24) / natural.height) : 1
  return <article ref={root} className="slide-viewer" aria-label={preview ? 'Source slide preview' : 'Current presentation slide'} data-fullscreen={fullscreen}>
    <div className="viewer-toolbar" aria-label="Slide viewing controls">
      <label className="sr-only" htmlFor="view-mode">Slide view</label>
      <select id="view-mode" value={mode} disabled={fullscreen} onChange={event => onModeChange?.(event.target.value)}>
        <option value="standard">Standard view</option><option value="half">Half-screen</option><option value="expanded">Expanded view</option>
      </select>
      <button className="secondary" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 75} onClick={() => setZoom(value => Math.max(75, value - 25))}>−</button>
      <output aria-label="Zoom level" className="tabular-nums text-sm">{zoom}%</output>
      <button className="secondary" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 200} onClick={() => setZoom(value => Math.min(200, value + 25))}>+</button>
      <button className="secondary" onClick={fit} aria-label="Reset zoom" title="Reset zoom">Reset</button>
      <button className="secondary" onClick={fit} title="Fit the whole slide to available space">Fit</button>
      <button ref={fullscreenButton} className="secondary" onClick={toggleFullscreen}>{fullscreen ? 'Exit Full Screen' : 'Full screen'}</button>
      {mode === 'expanded' && !fullscreen && <>
        <button className="secondary" onClick={() => onModeChange?.('standard')}>Return to standard view</button>
        <button className="secondary" aria-expanded={controlsOpen} onClick={onToggleControls}>Class controls</button>
      </>}
    </div>
    {notice && <p role="status" className="viewer-notice">{notice}</p>}
    <div className="viewer-caption"><span>{preview ? 'Source preview · ' : ''}{state.active_material?.filename || slide.subtitle}</span>
      <span data-testid="slide-number">Slide {slideIndex + 1} of {state.slides.length}</span></div>
    <div className="slide-viewport" ref={viewport} tabIndex={0} aria-label="Slide content; scroll to inspect when zoomed">
      {slide.image_url && !imageError ? image ? <img src={image} alt={`${slide.title} from ${state.active_material?.filename || 'presentation'}`}
        onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        style={{ width: natural.width ? natural.width * fitScale * zoom / 100 : undefined,
          height: natural.height ? natural.height * fitScale * zoom / 100 : undefined }} className="slide-image" />
        : <p className="p-6 text-slate-600">Loading page preview…</p>
        : <div className="slide-text" style={{ width: `${zoom}%`, fontSize: `${zoom}%` }}>
          {imageError && <p role="status" className="text-sm text-amber-800">Page preview unavailable. Extracted text is shown below.</p>}
          <h2 className="mb-5 text-[1.6em] font-semibold">{slide.title}</h2>
          {slide.image_url ? <p className="whitespace-pre-wrap">{slide.text || 'No selectable text on this slide.'}</p>
            : slide.points?.length ? <ul className="list-disc space-y-4 pl-6">{slide.points.map((point, index) => <li key={index}>{point}</li>)}</ul>
              : <p>No selectable text on this slide.</p>}
        </div>}
    </div>
    <div className="viewer-footer">
      {lecturer && !preview && <nav aria-label="Slide controls" className="flex flex-wrap gap-2">
        <button className="secondary" disabled={!active || state.current_slide === 0} onClick={() => send({ type: 'set_slide', index: state.current_slide - 1 })}>Previous slide</button>
        <button className="primary" disabled={!active || state.current_slide === state.slides.length - 1} onClick={() => send({ type: 'set_slide', index: state.current_slide + 1 })}>Next slide</button>
      </nav>}
      <span className="text-xs text-slate-500">{state.active_material?.rendering === 'text-only' ? 'PowerPoint text view · slide visuals unavailable' : state.active_material ? `${state.active_material.kind} presentation` : 'Sample lecture slides'}</span>
      <details className="viewer-extracted"><summary>Extracted text</summary><p className="max-h-40 overflow-auto whitespace-pre-wrap py-2 text-sm">{slide.text || 'No selectable text on this slide. OCR is not included.'}</p></details>
    </div>
  </article>
}
