import { useEffect, useState } from 'react'

export default function SlideViewer({ state, token }) {
  const slide = state.slides[state.current_slide]
  const [image, setImage] = useState(null)
  const [imageError, setImageError] = useState(false)
  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    setImage(null)
    setImageError(false)
    if (slide.image_url) {
      fetch(slide.image_url, { headers: { Authorization: `Bearer ${token}` } })
        .then(response => {
          if (!response.ok) throw new Error('Preview unavailable')
          return response.blob()
        })
        .then(blob => {
          if (!cancelled) {
            objectUrl = URL.createObjectURL(blob)
            setImage(objectUrl)
          }
        })
        .catch(() => { if (!cancelled) setImageError(true) })
    }
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [slide.image_url, token])
  return <article className="slide-surface" aria-label="Current presentation slide">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5 text-sm text-slate-500">
      <span>{state.active_material?.filename || slide.subtitle}</span>
      <span data-testid="slide-number" className="shrink-0 font-medium tabular-nums text-slate-700">Slide {state.current_slide + 1} of {state.slides.length}</span>
    </div>
    {slide.image_url ? <div className="py-5">
      {image ? <img src={image} alt={`${slide.title} from ${state.active_material?.filename || 'PDF'}`} className="mx-auto max-h-[75vh] w-auto max-w-full border border-slate-200 bg-white object-contain" />
        : <p className="py-12 text-center text-sm text-slate-600">{imageError ? 'Page preview unavailable. The extracted text is below.' : 'Loading page preview…'}</p>}
      <details className="mt-5 text-sm text-slate-700"><summary className="cursor-pointer font-medium">Extracted text</summary>
        <p className="mt-3 whitespace-pre-wrap leading-6">{slide.text || 'No selectable text on this page. OCR is not included in this prototype.'}</p>
      </details>
    </div> : <div className="py-8 sm:py-10">
      <h2 className="max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">{slide.title}</h2>
      {slide.points.length ? <ul className="mt-7 max-w-3xl space-y-5 text-base leading-7 text-slate-700 sm:text-lg">
        {slide.points.map((point, index) => <li key={index} className="flex gap-3"><span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-teal-700" />{point}</li>)}
      </ul> : <p className="mt-7 text-sm text-slate-600">No selectable text on this slide.</p>}
    </div>}
    <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
      {state.active_material?.rendering === 'text-only' ? 'PowerPoint text view · slide visuals unavailable' :
        state.active_material ? `${state.active_material.kind} presentation` : 'Sample lecture slides'}
    </p>
  </article>
}
